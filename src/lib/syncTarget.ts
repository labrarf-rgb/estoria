import { driveConfigured } from "@/lib/driveConfig";
import type { DriveAuth } from "@/lib/driveAuth";
import type { SyncTarget } from "@/lib/syncFolder";

/**
 * Which Estoria folder this device syncs with, and whether Drive may write
 * right now (docs/PLAN-drive-sync.md, Phase B and "Prod safety").
 *
 * - **Target:** chosen per device. Safari, Firefox and iPad can only use Drive;
 *   desktop Chrome can use either.
 * - **Kill switch:** the broker's `/status`. Until it has answered "on" (at
 *   startup, then every 30 minutes) Drive does no writes.
 */

const TARGET_KEY = "estoria:sync:target";
const FOLDER_KEY = "estoria:drive:folder";
const STATUS_EVERY_MS = 30 * 60 * 1000;
const RETRY_FIRST_MS = 10 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

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

/** Drive is offered on this device. */
export function driveAvailableHere(): boolean {
  return driveConfigured();
}

export function chosenTarget(): SyncTarget | null {
  const v = read(TARGET_KEY);
  return v === "drive" || v === "folder" ? v : null;
}

export function setChosenTarget(target: SyncTarget | null): void {
  write(TARGET_KEY, target);
}

/** The target sync uses: the folder unless this device chose Drive. */
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
 * Check now and every 30 minutes. While the broker can't be reached, keep
 * retrying (10 s, doubling up to 5 min), and check again when the device comes
 * back online or the window comes back into view. An app that opens with the
 * computer starts before Wi-Fi is up, often with no "online" event to follow,
 * and shouldn't stay paused until the next half-hour check. Returns a stop
 * function.
 */
export function startDriveStatusChecks(auth: Pick<DriveAuth, "fetchDriveStatus">): () => void {
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retryIn = RETRY_FIRST_MS;
  const check = () => {
    if (retry) clearTimeout(retry);
    retry = null;
    void refreshDriveStatus(auth).then((s) => {
      if (stopped) return;
      if (s !== "unreachable") {
        retryIn = RETRY_FIRST_MS;
        return;
      }
      if (retry) return;
      retry = setTimeout(check, retryIn);
      retryIn = Math.min(retryIn * 2, RETRY_MAX_MS);
    });
  };
  const checkIfPaused = () => {
    if (driveStatus !== "on" && document.visibilityState !== "hidden") check();
  };
  check();
  const timer = setInterval(check, STATUS_EVERY_MS);
  window.addEventListener("online", checkIfPaused);
  window.addEventListener("focus", checkIfPaused);
  document.addEventListener("visibilitychange", checkIfPaused);
  return () => {
    stopped = true;
    clearInterval(timer);
    if (retry) clearTimeout(retry);
    window.removeEventListener("online", checkIfPaused);
    window.removeEventListener("focus", checkIfPaused);
    document.removeEventListener("visibilitychange", checkIfPaused);
  };
}

/** Tests only. */
export function _setDriveStatusForTests(s: DriveStatus): void {
  driveStatus = s;
}
