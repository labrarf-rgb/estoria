import { loadAllFrom, readFrom, STORE_PROJECTS, writeTo } from "@/store/idb";

/**
 * Where each project's story map lives at rest: **one IndexedDB record per
 * project**, keyed by project id, holding the map with its prose and pictures
 * already lifted out (`store/prose.ts`, `store/images.ts`).
 *
 * Why it moved out of localStorage (docs/SPECS.md §9 item 1, §10 Phase 0):
 *
 *  - **The quota is per origin, not per key.** Every project used to sit in one
 *    localStorage string, so all of them shared one ~5MB budget. A second key
 *    per project would have fixed nothing; IndexedDB's quota is a share of the
 *    disk (4.63 GB measured, §8).
 *  - **One bad save no longer costs every project.** A blob cut off part-way
 *    took the whole library with it. Now a record that will not parse is one
 *    project set aside, and the rest load (`quarantined` in `persistence.ts`).
 *  - **Saving touches only what changed.** The old blob re-serialized every
 *    stashed project on every auto-save; now an untouched project is not even
 *    stringified.
 *
 * As with prose and pictures, **the split is at the at-rest layer only**: the
 * store still holds `doc` + `projectStash` as whole documents, and every file,
 * Sync and the Android contract are untouched.
 */

/** Every project map on this origin, keyed by project id. */
export const loadAllProjects = (): Promise<Map<string, string>> => loadAllFrom(STORE_PROJECTS);

/** Apply one batch of writes and deletes in a single transaction. */
export const writeProjects = (puts: Map<string, string>, deletes: Iterable<string>): Promise<void> =>
  writeTo(STORE_PROJECTS, puts, deletes);

/** One project's stored map, raw — for handing a damaged one back to the writer. */
export const readProjectRaw = (id: string): Promise<string | undefined> => readFrom(STORE_PROJECTS, id);

/**
 * Where the untouched pre-split blob is kept after the one-time migration, as a
 * last-resort copy. Harmless beside the project records: a load reads only the
 * ids the shell lists, never the store as a whole.
 */
export const LEGACY_BACKUP_PREFIX = "__legacy-backup:";

// ---- The crash pad ----------------------------------------------------------

/**
 * The same hazard, and the same answer, as the prose pad in `store/prose.ts`:
 * **IndexedDB is async and `beforeunload` is not.** When the map lived in
 * localStorage its write was synchronous and landed before the tab went away;
 * an IndexedDB write started there will not finish.
 *
 * So every map flush writes the changed projects here first, synchronously,
 * then starts the IndexedDB write, and clears each entry only once it has
 * landed. A load reads the pad over the top of IndexedDB. It holds only what is
 * in flight — almost always the one open project, and a map is ~282KB even at
 * 250 chapters (§8) — so it costs little against the quota this whole change
 * exists to stop depending on.
 */
const PAD_KEY = "estoria:map-pad:v1";

export function writeMapPad(entries: Map<string, string>): void {
  if (entries.size === 0) return;
  try {
    const merged = { ...readMapPad(), ...Object.fromEntries(entries) };
    localStorage.setItem(PAD_KEY, JSON.stringify(merged));
  } catch {
    // A full quota here is survivable: the IndexedDB write is the real one,
    // and this is only the belt to its braces.
  }
}

export function readMapPad(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PAD_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Drop only the entries that made it to IndexedDB **unchanged** — a later edit
 * to the same project may have padded a newer map while this write was in
 * flight, and clearing that one would lose it.
 */
export function clearMapPad(landed: Map<string, string>): void {
  try {
    const pad = readMapPad();
    let touched = false;
    for (const [id, json] of landed)
      if (pad[id] === json) {
        delete pad[id];
        touched = true;
      }
    if (!touched) return;
    if (Object.keys(pad).length === 0) localStorage.removeItem(PAD_KEY);
    else localStorage.setItem(PAD_KEY, JSON.stringify(pad));
  } catch {
    // ignore
  }
}

/** Forget a deleted project's pad entry, so a reload cannot bring it back. */
export function dropFromMapPad(ids: Iterable<string>): void {
  try {
    const pad = readMapPad();
    let touched = false;
    for (const id of ids)
      if (id in pad) {
        delete pad[id];
        touched = true;
      }
    if (!touched) return;
    if (Object.keys(pad).length === 0) localStorage.removeItem(PAD_KEY);
    else localStorage.setItem(PAD_KEY, JSON.stringify(pad));
  } catch {
    // ignore
  }
}
