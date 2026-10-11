import type { SyncTarget } from "@/lib/syncFolder";

/**
 * The "last agreed" fingerprint per project: the third point of Sync's
 * three-way compare (lib/sync.ts). Its own module so DriveFolder can forget
 * it when a project is linked to a different file.
 */

/**
 * Kept per target, not just per project. A device that switches targets must
 * not compare a new target's file against the baseline it agreed with the old
 * one: an older Drive copy would look like "only the file changed" and load
 * over newer local work (docs/PLAN-drive-sync.md, H1). A target's first sync
 * has no baseline, so any difference is a conflict, never a silent pull.
 *
 * The folder target keeps the key it has always used, so existing devices keep
 * their baselines and a rollback to an older build finds them too.
 */
export const lastSyncedKey = (target: SyncTarget, docId: string) =>
  target === "folder"
    ? `estoria:sync:lastHash:${docId}`
    : `estoria:sync:lastHash:${target}:${docId}`;

export function getLastSynced(target: SyncTarget, docId: string): string | null {
  try {
    return localStorage.getItem(lastSyncedKey(target, docId));
  } catch {
    return null;
  }
}

export function setLastSynced(target: SyncTarget, docId: string, hash: string): void {
  try {
    localStorage.setItem(lastSyncedKey(target, docId), hash);
  } catch {
    // Non-fatal: without it the next divergence shows as a conflict instead
    // of a fast-forward — safe, just noisier.
  }
}

/**
 * Forget the baseline, so the next compare treats any difference as a
 * conflict. Used when a project is linked to a different Drive file (a new
 * account, or picking another copy): the old agreement says nothing about it.
 */
export function forgetLastSynced(target: SyncTarget, docId: string): void {
  try {
    localStorage.removeItem(lastSyncedKey(target, docId));
  } catch {
    // Nothing stored, nothing to forget.
  }
}
