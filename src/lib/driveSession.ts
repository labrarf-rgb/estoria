import { useSyncExternalStore } from "react";
import { drive } from "@/lib/drive";
import { consumeRedirectResult, driveAuth } from "@/lib/driveAuth";
import { adoptPickedFolder, connectDriveFolder } from "@/lib/driveFolder";
import { flushNow } from "@/store/persistence";
import { detectBrowser, isStandalone } from "@/lib/install";
import {
  activeTarget,
  driveAvailableHere,
  driveFolderRef,
  onDriveStatus,
  setChosenTarget,
  startDriveStatusChecks,
} from "@/lib/syncTarget";

/**
 * The app's side of Google Drive: connecting, the notices that follow, and the
 * "backed up · 12 min ago" times the footer shows (docs/PLAN-drive-sync.md,
 * Phase B). Nothing here runs unless Drive is switched on for this device.
 *
 * **Connecting is a full-page sign-in on every device.** The page goes to the
 * broker, Google asks for consent, and the broker returns to the app with
 * `#drive=connected`. It always asks for consent, which is what makes Google
 * issue each device its own long-lived sign-in; it needs no popup (nothing for
 * Safari to block, H5) and no Google script on Estoria's page. It costs one
 * page load, once per device, after saves are flushed.
 */

export interface Notice {
  text: string;
  error?: boolean;
}

interface State {
  /** Bumped on any change, so components re-read the target and auth state. */
  version: number;
  notice: Notice | null;
  /** This device's Drive folder belongs to another account: confirm before switching (H16). */
  accountSwitch: { previous: string; current: string } | null;
  /** "Back up with…" chooser (Drive or a folder on this computer). */
  chooserOpen: boolean;
  /**
   * Connected, but Estoria sees no Estoria folder in this Drive: ask whether
   * one exists (the Drive app's, the phone's) before making another (H17).
   */
  folderAsk: boolean;
}

let state: State = { version: 0, notice: null, accountSwitch: null, chooserOpen: false, folderAsk: false };
const listeners = new Set<() => void>();

function update(patch: Partial<State>): void {
  state = { ...state, ...patch, version: state.version + 1 };
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-render on any Drive change: target, sign-in state, kill switch, notices. */
export function useDriveSession(): State {
  return useSyncExternalStore(subscribe, () => state);
}

export function clearDriveNotice(): void {
  if (state.notice) update({ notice: null });
}

export function openDriveChooser(open = true): void {
  update({ chooserOpen: open });
  // After a reload mid-setup this page doesn't know it's signed in yet: ask
  // the broker quietly, so the chooser picks up where setup left off (the
  // folder question) instead of offering Connect again.
  if (open && driveAvailableHere() && driveAuth.status().state === "unknown") {
    driveAuth.getAccessToken().then(
      () => update({}),
      () => update({})
    );
  }
}

// ---- Startup ---------------------------------------------------------------------

let started = false;

/** Once, after the app mounts: kill-switch checks, and the result of a sign-in that just returned. */
export function startDriveRuntime(): void {
  if (started || !driveAvailableHere()) return;
  started = true;
  driveAuth.onStatus(() => update({}));
  onDriveStatus(() => update({}));
  startDriveStatusChecks(driveAuth);
  const result = consumeRedirectResult();
  showHomeScreenTipOnce();
  if (result) void handleSignInResult(result);
  else if (activeTarget() === "drive") {
    // Learn the account (and whether sign-in still holds) without waiting for a save.
    driveAuth.getAccessToken().catch(() => {});
  }
}

const TIP_KEY = "estoria:drive:homeScreenTip";

/**
 * iPad and iPhone Safari clear a website's storage after 7 days without a
 * visit, unless it's on the Home Screen (H10). Say so once; Drive (and "Open
 * from Google Drive") is the way back if it happens anyway.
 */
function showHomeScreenTipOnce(): void {
  try {
    if (detectBrowser() !== "ios-safari" || isStandalone() || localStorage.getItem(TIP_KEY)) return;
    localStorage.setItem(TIP_KEY, "1");
  } catch {
    return;
  }
  update({
    notice: {
      text: "Tip: add Estoria to your Home Screen (Share, then Add to Home Screen) so Safari keeps your work on this device.",
    },
  });
}

async function handleSignInResult(result: string): Promise<void> {
  if (result === "connected") return finishConnect(false);
  update({
    notice:
      result === "denied"
        ? { text: "Connecting to Google Drive was cancelled. Nothing changed." }
        : result === "scope-missing"
          ? {
              text: "Estoria needs access to its own files in your Drive. Connect again and leave the Drive box ticked.",
              error: true,
            }
          : result === "unavailable"
            ? { text: "Google didn't answer. Try connecting again in a moment.", error: true }
            : { text: "Couldn't connect to Google Drive. Try again.", error: true },
  });
}

// ---- Connecting ------------------------------------------------------------------

/** Leave for Google's sign-in, after saving everything. Returns here with the result. */
export function startDriveConnect(): void {
  flushNow();
  const back = location.origin + location.pathname + location.search;
  location.assign(driveAuth.redirectSignInUrl(back));
}

async function finishConnect(allowSwitch: boolean, create = false): Promise<void> {
  try {
    await driveAuth.getAccessToken();
    const email = driveAuth.connectedEmail();
    const setup = await connectDriveFolder(drive, email, { allowSwitch, create });
    if (setup.kind === "account-changed") {
      update({ accountSwitch: { previous: setup.previous, current: setup.current } });
      return;
    }
    if (setup.kind === "none") {
      // Don't make a second Estoria folder beside one Estoria can't see yet.
      update({ accountSwitch: null, folderAsk: true, chooserOpen: true });
      return;
    }
    connected(
      setup.created ? "Estoria made a folder called Estoria there. " : "Using your Estoria folder there. "
    );
  } catch (e) {
    update({ notice: { text: e instanceof Error ? e.message : "Couldn't finish connecting.", error: true } });
  }
}

function connected(folderNote: string): void {
  const email = driveAuth.connectedEmail();
  setChosenTarget("drive");
  update({
    accountSwitch: null,
    folderAsk: false,
    chooserOpen: false,
    notice: {
      text: `Connected to Google Drive${email ? ` as ${email}` : ""}. ${folderNote}Press Sync to back up this project.`,
    },
  });
}

/** "Continue with the new account" (H16): use it on this device from now on. */
export function confirmAccountSwitch(): Promise<void> {
  return finishConnect(true);
}

/** "No, make a new one": there's no Estoria folder in this Drive yet. */
export function makeNewDriveFolder(): Promise<void> {
  return finishConnect(false, true);
}

/** The person chose their existing Estoria folder in Google's Picker (H17). */
export function useExistingDriveFolder(folder: { id: string; name: string }): void {
  adoptPickedFolder(folder, driveAuth.connectedEmail());
  connected(
    `Using your folder "${folder.name}" there. To open a project that's already in it, use Open project, then Open from Google Drive. `
  );
}

/** Connected, but no Estoria folder is set up on this device yet. */
export function needsFolderAnswer(): boolean {
  return state.folderAsk || (driveAuth.status().state === "connected" && !driveFolderRef());
}

/** Stop using Drive on this device: revoke the sign-in, fall back to a folder (or nothing). */
export async function disconnectDrive(): Promise<void> {
  try {
    await driveAuth.disconnect();
  } catch {
    // Offline: the sign-in is forgotten here anyway; Google expires it unused.
  }
  setChosenTarget(null);
  update({ chooserOpen: false, notice: { text: "Disconnected from Google Drive on this device. Your files stay in your Drive." } });
}

/** Use a folder on this computer instead of Drive (desktop Chrome). */
export function chooseFolderTarget(): void {
  setChosenTarget("folder");
  update({ chooserOpen: false });
}

/** Drive was set up on this device before (a folder is remembered). */
export function driveSetUpHere(): boolean {
  return !!driveFolderRef();
}

// ---- "Backed up to Drive · 12 min ago" (H9) --------------------------------------

const backedUpKey = (projectId: string) => `estoria:drive:backedUp:${projectId}`;

/** Drive confirmed it holds this project's latest state (a write, or a match). */
export function markBackedUp(projectId: string): void {
  try {
    localStorage.setItem(backedUpKey(projectId), String(Date.now()));
  } catch {
    // Display only.
  }
  update({});
}

export function backedUpAt(projectId: string): number | null {
  try {
    const v = Number(localStorage.getItem(backedUpKey(projectId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** "just now", "12 min ago", "3 h ago", or a date. */
export function ago(ms: number, now = Date.now()): string {
  const min = Math.floor((now - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}
