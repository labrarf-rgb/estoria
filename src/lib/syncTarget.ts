import { driveConfigured } from "@/lib/driveConfig";
import type { DriveAuth } from "@/lib/driveAuth";
import type { SyncTarget } from "@/lib/syncFolder";

/**
 * Which Estoria folder this device syncs with, and whether Drive may write
 * right now (docs/PLAN-drive-sync.md, Phase B and "Prod safety").
 *
 * - **Per-device switch (Deploy B):** Drive exists only on devices where
 *   `?drive=on` was opened once (remembered on that device; `?drive=off`
 *   forgets it). Everywhere else this module reports the folder target and
 *   the app behaves exactly as before.
 * - **Target:** chosen per device. Safari, Firefox and iPad can only use Drive;
 *   desktop Chrome can use either.
 * - **Kill switch:** the broker's `/status`. Until it has answered "on" (at
 *   startup, then every 30 minutes) Drive does no writes.
 */

const SWITCH_KEY = "estoria:drive:enabled";
const TARGET_KEY = "estoria:sync:target";
const FOLDER_KEY = "estoria:drive:folder";
const STATUS_EVERY_MS = 30 * 60 * 1000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the device simply stays on the folder target.
  }
}

/** Read `?drive=on|off` once at startup, remember it on this device, and tidy the address bar. */
export function applyDriveSwitchFromUrl(): void {
  const url = new URL(location.href);
  const v = url.searchParams.get("drive");
  if (v !== "on" && v !== "off") return;
  write(SWITCH_KEY, v === "on" ? "1" : null);
  url.searchParams.delete("drive");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
}

/** Drive is offered on this device. */
export function driveAvailableHere(): boolean {
  return driveConfigured() && read(SWITCH_KEY) === "1";
}

export function chosenTarget(): SyncTarget | null {
  const v = read(TARGET_KEY);
  return v === "drive" || v === "folder" ? v : null;
}

export function setChosenTarget(target: SyncTarget | null): void {
  write(TARGET_KEY, target);
}

/** The target sync uses. Without the Drive switch, always the folder, exactly as before. */
export function activeTarget(): SyncTarget {
  return chosenTarget() === "drive" && driveAvailableHere() ? "drive" : "folder";
}

/** The Estoria folder in this device's connected Drive. */
export interface DriveFolderRef {
  id: string;
  name: string;
  /** The account it belongs to, for the wrong-account check (H16). */
  account?: string;
}

export function driveFolderRef(): DriveFolderRef | null {
  try {
    const v = JSON.parse(read(FOLDER_KEY) ?? "null") as DriveFolderRef | null;
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
}

export function setDriveFolderRef(ref: DriveFolderRef | null): void {
  write(FOLDER_KEY, ref ? JSON.stringify(ref) : null);
}

// ---- Kill switch ----------------------------------------------------------------

type DriveStatus = "unknown" | "on" | "off" | "unreachable";
let driveStatus: DriveStatus = "unknown";
const statusListeners = new Set<(s: DriveStatus) => void>();

/** Drive may not write: switched off, or not yet confirmed on. */
export function drivePaused(): boolean {
  return driveStatus !== "on";
}

export function currentDriveStatus(): DriveStatus {
  return driveStatus;
}

export function onDriveStatus(fn: (s: DriveStatus) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export async function refreshDriveStatus(auth: Pick<DriveAuth, "fetchDriveStatus">): Promise<DriveStatus> {
  const next = await auth.fetchDriveStatus();
  // A failed re-check after a good one keeps Drive on: only startup needs a
  // confirmed "on", and a later blip is the offline state, not a pause.
  if (!(next === "unreachable" && driveStatus === "on")) driveStatus = next;
  for (const fn of statusListeners) fn(driveStatus);
  return driveStatus;
}

/**
 * Check now and every 30 minutes, and again when the device comes back
 * online while Drive isn't confirmed on, so a page opened offline doesn't stay
 * paused until the next half-hour check. Returns a stop function.
 */
export function startDriveStatusChecks(auth: Pick<DriveAuth, "fetchDriveStatus">): () => void {
  void refreshDriveStatus(auth);
  const timer = setInterval(() => void refreshDriveStatus(auth), STATUS_EVERY_MS);
  const onOnline = () => {
    if (driveStatus !== "on") void refreshDriveStatus(auth);
  };
  window.addEventListener("online", onOnline);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", onOnline);
  };
}

/** Tests only. */
export function _setDriveStatusForTests(s: DriveStatus): void {
  driveStatus = s;
}
