import { useSyncExternalStore } from "react";
import { getLoadState, onLoadState, type LoadState } from "@/store/persistence";

/**
 * Has the persisted store been read back yet?
 *
 * It matters because `zustandStorage.getItem` is **async** — it opens
 * IndexedDB and reads every manuscript before it answers — so zustand's persist
 * middleware hydrates asynchronously, and until it does the store holds its
 * defaults. Those defaults include `onboarded: false`, which is the flag the
 * welcome screen renders on, and the welcome screen's two buttons replace the
 * document. A screen that offers to throw the book away must never be shown
 * before we know whether there is a book.
 *
 * Kept outside the store on purpose. Putting it in state would make marking it
 * a state change, which persist answers with a write — a write of the state we
 * have only just finished reading, on every single launch.
 */

let hydrated = false;
const listeners = new Set<() => void>();

export function markHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True once persist has finished rehydrating — successfully or not. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => false, // never assume hydrated during SSR/prerender
  );
}

/** One stable object, so the server snapshot never looks like a change. */
const LOADING: LoadState = { kind: "loading" };

/** Whether the load produced the stored document, or why it could not. */
export function useLoadState(): LoadState {
  return useSyncExternalStore(onLoadState, getLoadState, () => LOADING);
}
