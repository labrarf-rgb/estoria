import { useSyncExternalStore } from "react";
import { drive } from "@/lib/drive";
import { consumeRedirectResult, driveAuth } from "@/lib/driveAuth";
import { connectDriveFolder } from "@/lib/driveFolder";
import { flushNow } from "@/store/persistence";
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
}

let state: State = { version: 0, notice: null, accountSwitch: null, chooserOpen: false };
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
  if (result) void handleSignInResult(result);
  else if (activeTarget() === "drive") {
    // Learn the account (and whether sign-in still holds) without waiting for a save.
    driveAuth.getAccessToken().catch(() => {});
  }
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

async function finishConnect(allowSwitch: boolean): Promise<void> {
  try {
    await driveAuth.getAccessToken();
    const email = driveAuth.connectedEmail();
    const setup = await connectDriveFolder(drive, email, { allowSwitch });
    if (setup.kind === "account-changed") {
      update({ accountSwitch: { previous: setup.previous, current: setup.current } });
      return;
    }
    setChosenTarget("drive");
    update({
      accountSwitch: null,
      chooserOpen: false,
      notice: {
        text:
          `Connected to Google Drive${email ? ` as ${email}` : ""}. ` +
          (setup.created ? "Estoria made a folder called Estoria there. " : "Using your Estoria folder there. ") +
          "Press Sync to back up this project.",
      },
    });
  } catch (e) {
    update({ notice: { text: e instanceof Error ? e.message : "Couldn't finish connecting.", error: true } });
  }
}

/** "Continue with the new account" (H16): use it on this device from now on. */
export function confirmAccountSwitch(): Promise<void> {
  return finishConnect(true);
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
