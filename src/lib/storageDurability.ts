import { useSyncExternalStore } from "react";

/**
 * Asking the browser not to throw your book away.
 *
 * Everything Estoria holds lives in this browser: a small shell in localStorage,
 * the project maps and manuscripts in IndexedDB. By default both sit in the
 * *best-effort* bucket, which the browser is free to clear when the disk gets
 * tight — quietly, with
 * no prompt and no warning, and taking the two of them together. From inside
 * the app that is indistinguishable from a first launch, which is the shape of
 * every "where did my work go" report.
 *
 * `navigator.storage.persist()` moves the origin to the *persistent* bucket,
 * which is only cleared if the user clears it. Chrome grants it silently to
 * installed apps and to sites with real engagement, and silently declines
 * otherwise — there is no dialog either way, so it costs nothing to ask, and
 * asking at startup is the only way to find out the answer.
 *
 * The answer is worth surfacing (About) rather than swallowing: "best effort"
 * means an export or a synced folder is not optional.
 */

export type Durability =
  | "unknown" // not asked yet
  | "persistent" // granted: only the user can clear this
  | "best-effort" // declined: the browser may evict under storage pressure
  | "unsupported"; // no Storage API to ask

let durability: Durability = "unknown";
const listeners = new Set<() => void>();

function set(next: Durability) {
  if (durability === next) return;
  durability = next;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** What the browser has promised about this origin's storage. */
export function useDurability(): Durability {
  return useSyncExternalStore(
    subscribe,
    () => durability,
    () => "unknown" as Durability,
  );
}

/**
 * Ask once, at startup. Safe to call before anything is stored — the grant is
 * per-origin, not per-item, and it applies to what is written afterwards.
 */
export async function requestDurableStorage(): Promise<void> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persist) return set("unsupported");
  try {
    if (await s.persisted?.()) return set("persistent");
    set((await s.persist()) ? "persistent" : "best-effort");
  } catch {
    // Some contexts expose the API and refuse the call (sandboxed frames, a
    // few private modes). Nothing to do but report what we don't know.
    set("unsupported");
  }
}

// ---- How full storage is ------------------------------------------------------------

/**
 * How much of this origin's storage is used (review S7). Every saved copy holds
 * a whole project, pictures included, so a few form changes on a picture-heavy
 * project can fill it; before this, the first sign was a save that failed.
 * The Footer and the "A copy is saved first" note warn from `STORAGE_WARN` on.
 */
export interface StorageUse {
  usage: number;
  quota: number;
  /** usage / quota, 0-1. */
  ratio: number;
}

/** Warn from 80% full. */
export const STORAGE_WARN = 0.8;

let use: StorageUse | null = null;
const useListeners = new Set<() => void>();

/** Ask the browser again. Cheap; called at startup, every few minutes, and after each saved copy. */
export async function refreshStorageUse(): Promise<void> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.estimate) return;
  try {
    const { usage = 0, quota = 0 } = await s.estimate();
    if (!quota) return;
    const next = { usage, quota, ratio: usage / quota };
    if (use && use.usage === next.usage && use.quota === next.quota) return;
    use = next;
    useListeners.forEach((l) => l());
  } catch {
    // No answer is not a reason to warn.
  }
}

/** The latest storage use, or null when the browser won't say. */
export function useStorageUse(): StorageUse | null {
  return useSyncExternalStore(
    (fn) => {
      useListeners.add(fn);
      return () => useListeners.delete(fn);
    },
    () => use,
    () => null,
  );
}

/** "84%" when storage is past the warning line, else null. */
export function storageWarning(u: StorageUse | null): string | null {
  return u && u.ratio >= STORAGE_WARN ? `${Math.min(99, Math.round(u.ratio * 100))}%` : null;
}
