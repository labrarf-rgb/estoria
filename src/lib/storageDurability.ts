import { useSyncExternalStore } from "react";

/**
 * Asking the browser not to throw your book away.
 *
 * Everything Estoria holds lives in this browser: the map in localStorage, the
 * manuscripts in IndexedDB. By default both sit in the *best-effort* bucket,
 * which the browser is free to clear when the disk gets tight — quietly, with
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
