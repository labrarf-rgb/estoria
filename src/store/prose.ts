import type { Chapter, StoryDoc } from "@/types";

/**
 * Where chapter prose lives at rest.
 *
 * **The split is at the at-rest layer only.** `StoryDoc` stays whole in memory
 * and in every file — export, Sync, backup and import all still see one document
 * with `manuscript` on its chapters, so the cross-app contract and the Android
 * app are untouched. The only thing that changes is that the auto-save writes
 * the map to localStorage and the prose to IndexedDB, and the load puts them
 * back together before the store ever sees them.
 *
 * Why it has to move (docs/manuscript-mode-build.md §8 phase 2):
 *
 *  - 100k words of markdown is ~600,000 characters. localStorage stores UTF-16,
 *    so the ~5MB budget is ~2.5M characters — **one manuscript is a quarter of
 *    it**, four versions of one is nearly all of it, before the map, before JSON
 *    escaping, before base64 images. And `partialize` puts *every other project*
 *    in the same string.
 *  - Worse for typing: the old shim debounced the **write** but not the
 *    **serialize**, so `JSON.stringify` over the whole store ran on every
 *    keystroke and the debounce threw all but the last away. Invisible at map
 *    sizes; tens of milliseconds at 3MB, on the main thread, while someone is
 *    drafting. That is the one thing this feature cannot afford.
 *
 * A second *localStorage key* would fix neither: the quota is per origin.
 */

const DB_NAME = "estoria";
const DB_VERSION = 1;
const STORE = "manuscripts";

/**
 * Prose is keyed by all four coordinates that identify a chapter's text.
 * Versions are standalone forks, so the same chapter id holds different prose in
 * each one, and books stash their own boards — three of these are not optional.
 */
export interface ProseKey {
  projectId: string;
  bookId: string;
  draftId: string;
  chapterId: string;
}

/**
 * JSON rather than a joined string with a separator character. Ids are normally
 * `uid()` output, but `normalizeDoc` accepts any non-empty string from an
 * imported or hand-edited file, so there is no character that is safe to assume
 * is absent from one — and a separator collision here would hand one chapter
 * another chapter's prose.
 */
export const proseKey = (k: ProseKey): string =>
  JSON.stringify([k.projectId, k.bookId, k.draftId, k.chapterId]);

function projectOf(key: string): string {
  try {
    return (JSON.parse(key) as string[])[0] ?? "";
  } catch {
    return "";
  }
}

// ---- The IndexedDB store ----------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  return dbPromise;
}

/**
 * Is IndexedDB usable here? Some private-browsing modes expose the API and then
 * fail to open, so this is a real open rather than a feature check.
 *
 * **When it is not, prose simply stays in the localStorage blob**, exactly as it
 * did before this split existed. Slower and quota-bound, but never lost — a
 * writer on a browser we cannot use IndexedDB in still keeps their words.
 */
export async function proseStoreAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    await openDb();
    return true;
  } catch {
    dbPromise = null;
    return false;
  }
}

/** Every manuscript on this origin, keyed by `proseKey`. */
export async function loadAllProse(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve();
      if (typeof cur.value === "string") out.set(String(cur.key), cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return out;
}

/** Apply one batch of writes and deletes in a single transaction. */
export async function writeProse(
  puts: Map<string, string>,
  deletes: Iterable<string>
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const [k, v] of puts) store.put(v, k);
    for (const k of deletes) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---- The crash pad ----------------------------------------------------------

/**
 * The one genuine data-loss hazard in this design: **IndexedDB is async and
 * `beforeunload` is not.** The old flush worked precisely because
 * `localStorage.setItem` is synchronous; an IndexedDB write started as the tab
 * closes will not finish.
 *
 * So every prose flush writes the changed chapters to a *synchronous*
 * localStorage pad first, then starts the IndexedDB write, and clears the pad
 * only once that resolves. A load reads the pad over the top of IndexedDB. The
 * pad holds only what is in flight — usually one chapter — so it costs
 * essentially nothing against the quota this whole change exists to reclaim.
 */
const PAD_KEY = "estoria:prose-pad:v1";

export function writePad(entries: Map<string, string>): void {
  if (entries.size === 0) return;
  try {
    const merged = { ...readPad(), ...Object.fromEntries(entries) };
    localStorage.setItem(PAD_KEY, JSON.stringify(merged));
  } catch {
    // A full quota here is survivable: the IndexedDB write below is the real
    // one, and this is only the belt to its braces.
  }
}

export function readPad(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PAD_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Drop only the keys that made it to IndexedDB — a later edit may be pending. */
export function clearPad(keys: Iterable<string>): void {
  try {
    const pad = readPad();
    let touched = false;
    for (const k of keys)
      if (k in pad) {
        delete pad[k];
        touched = true;
      }
    if (!touched) return;
    if (Object.keys(pad).length === 0) localStorage.removeItem(PAD_KEY);
    else localStorage.setItem(PAD_KEY, JSON.stringify(pad));
  } catch {
    // ignore
  }
}

// ---- Splitting and reassembling a document ---------------------------------

/**
 * Every place a chapter lives in one document: the active book's active version
 * at the top level, its other versions in `draftData`, and the same pair again
 * inside every stashed book. Missing any one of them would strip prose from a
 * board the writer had merely navigated away from.
 *
 * Rebuilds only what actually changes — a container whose chapters all came back
 * identical is returned as-is, so a project with no prose costs one walk and no
 * allocation.
 */
function mapDoc(doc: StoryDoc, fn: (bookId: string, draftId: string, c: Chapter) => Chapter): StoryDoc {
  const mapList = (bookId: string, draftId: string, cs: Chapter[]): Chapter[] => {
    let changed = false;
    const next = cs.map((c) => {
      const n = fn(bookId, draftId, c);
      if (n !== c) changed = true;
      return n;
    });
    return changed ? next : cs;
  };
  const mapVersions = (
    bookId: string,
    versions: Record<string, { chapters: Chapter[] }>
  ): Record<string, { chapters: Chapter[] }> => {
    let changed = false;
    const next: Record<string, { chapters: Chapter[] }> = {};
    for (const [draftId, v] of Object.entries(versions)) {
      const cs = mapList(bookId, draftId, v.chapters ?? []);
      next[draftId] = cs === v.chapters ? v : { ...v, chapters: cs };
      if (next[draftId] !== v) changed = true;
    }
    return changed ? next : versions;
  };

  const topChapters = mapList(doc.activeBookId, doc.activeDraftId, doc.chapters);
  const topDrafts = mapVersions(doc.activeBookId, doc.draftData ?? {});

  let booksChanged = false;
  const nextBookData: StoryDoc["bookData"] = {};
  for (const [bookId, b] of Object.entries(doc.bookData ?? {})) {
    const cs = mapList(bookId, b.activeDraftId, b.chapters ?? []);
    const dd = mapVersions(bookId, b.draftData ?? {});
    const same = cs === b.chapters && dd === b.draftData;
    nextBookData[bookId] = same
      ? b
      : { ...b, chapters: cs, draftData: dd as StoryDoc["bookData"][string]["draftData"] };
    if (!same) booksChanged = true;
  }

  if (topChapters === doc.chapters && topDrafts === doc.draftData && !booksChanged) return doc;
  return {
    ...doc,
    chapters: topChapters,
    draftData: topDrafts as StoryDoc["draftData"],
    bookData: booksChanged ? nextBookData : doc.bookData,
  };
}

/**
 * Lift every manuscript out of a document, returning the prose-free document to
 * be serialized and the prose to be written separately.
 */
export function splitProse(doc: StoryDoc): { doc: StoryDoc; prose: Map<string, string> } {
  const prose = new Map<string, string>();
  const stripped = mapDoc(doc, (bookId, draftId, c) => {
    if (c.manuscript === undefined) return c;
    prose.set(proseKey({ projectId: doc.id, bookId, draftId, chapterId: c.id }), c.manuscript);
    const { manuscript: _lifted, ...rest } = c;
    return rest as Chapter;
  });
  return { doc: stripped, prose };
}

/** Put the manuscripts back, so the store only ever sees a whole `StoryDoc`. */
export function mergeProse(doc: StoryDoc, prose: Map<string, string>): StoryDoc {
  if (prose.size === 0) return doc;
  return mapDoc(doc, (bookId, draftId, c) => {
    const text = prose.get(proseKey({ projectId: doc.id, bookId, draftId, chapterId: c.id }));
    return text === undefined || text === c.manuscript ? c : { ...c, manuscript: text };
  });
}

/**
 * Keys to delete: prose we hold for a project that is still here, but for a
 * chapter that no longer is. Prose belonging to a project **absent from this
 * snapshot is deliberately left alone** — an incomplete snapshot is a bug we
 * would rather leak a few kilobytes over than answer by deleting someone's
 * writing.
 */
export function staleKeys(live: Map<string, string>, known: Set<string>, projectIds: Set<string>): string[] {
  const out: string[] = [];
  for (const k of known) {
    if (!live.has(k) && projectIds.has(projectOf(k))) out.push(k);
  }
  return out;
}
