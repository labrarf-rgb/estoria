import {
  MAIN_DRAFT_ID,
  SCHEMA_VERSION,
  type Asset,
  type BookData,
  type Chapter,
  type ChapterLink,
  type Character,
  type ConnType,
  type DraftVersion,
  type PinnedRef,
  type RefKind,
  type StoryDoc,
  type TodoItem,
  type VersionData,
  type WorldEntry,
} from "@/types";
import { resolveMainDraftId } from "@/lib/drafts";
import { syncChapterWords } from "@/lib/manuscript";
import {
  payloadStoreAvailable,
  projectOf,
  staleKeys,
  STORE_IMAGES,
  STORE_PROJECTS,
  STORE_PROSE,
  writeAcross,
} from "@/store/idb";
import { loadAllImages, mergeImages, splitImages, writeImages } from "@/store/images";
import {
  clearPad,
  loadAllProse,
  mapChapters,
  mergeProse,
  readPad,
  splitProse,
  writePad,
  writeProse,
} from "@/store/prose";
import {
  clearMapPad,
  dropFromMapPad,
  LEGACY_BACKUP_PREFIX,
  loadAllProjects,
  readMapPad,
  readProjectRaw,
  writeMapPad,
  writeProjects,
} from "@/store/projects";
import type { PersistStorage } from "zustand/middleware";

/**
 * StorageAdapter — the single seam between Estoria and where stories live.
 *
 * It speaks **per project**: a small shell (prefs, which project is open, the
 * list of projects) plus one record per project's map. That is the granularity
 * a cloud backend wants — a GoogleDriveStorageAdapter (docs/SPECS.md §8) is one
 * file per project behind these same calls — and swapping `activeAdapter` is
 * still the whole change. Both reads and writes go through the adapter; nothing
 * else touches the persisted copy.
 *
 * `loadBlob` / `saveBlob` are the layout every project used to share, one
 * string in localStorage. They stay for two reasons: it is what a first load
 * after the update migrates *from*, and it is where a browser with no usable
 * IndexedDB (some private windows) keeps saving, exactly as it always did.
 */
export interface StorageAdapter {
  loadShell(): Promise<string | null>;
  /** Must complete synchronously up to its first await: it runs in `beforeunload`. */
  saveShell(serialized: string): Promise<void>;
  loadProjects(): Promise<Map<string, string>>;
  saveProjects(puts: Map<string, string>, deletes: Iterable<string>): Promise<void>;
  loadBlob(): Promise<string | null>;
  /** Must complete synchronously up to its first await, like `saveShell`. */
  saveBlob(serialized: string): Promise<void>;
}

/**
 * The single-blob layout. Must match the persist `name` in useStore. After the
 * move to per-project records it holds `BLOB_TOMBSTONE` instead.
 */
const BLOB_KEY = "estoria:store:v1";
/** The per-project layout's shell: prefs, the open project, the project list. */
const SHELL_KEY = "estoria:shell:v2";
/** Legacy duplicate copy once written by the old double-write shim. */
const LEGACY_KEY = "estoria:doc:v1";
/** Where a blob we could not parse is set aside instead of being overwritten. */
const UNREADABLE_KEY = "estoria:unreadable";
/**
 * What the old key holds once its projects have moved. Deliberately **not
 * JSON**: a build from before the move (a cached service worker, an installed
 * app that has not updated yet) that opens after it would find a doc-less blob,
 * take it for a first launch and save the sample story. Unparseable, it instead
 * shows that build's recovery screen, which writes nothing unless the writer
 * insists — and even then only to this key, which the new layout never reads.
 */
const BLOB_TOMBSTONE = "estoria: moved to per-project storage (estoria:shell:v2)";

export class BrowserStorageAdapter implements StorageAdapter {
  /*
   * Failures propagate, deliberately. Returning `null` for them made "there is
   * nothing stored" and "we could not read what is stored" the same answer, and
   * the app's response to the first is to show the first-launch screen, whose
   * buttons overwrite the second. `null` now means only ever *absent*.
   *
   * Quota / private-mode failures on save propagate too, so the UI can surface
   * them — silently swallowing them left the footer claiming "saved" while
   * nothing was being written.
   */
  async loadShell(): Promise<string | null> {
    return localStorage.getItem(SHELL_KEY);
  }

  async saveShell(serialized: string): Promise<void> {
    localStorage.setItem(SHELL_KEY, serialized);
  }

  loadProjects(): Promise<Map<string, string>> {
    return loadAllProjects();
  }

  saveProjects(puts: Map<string, string>, deletes: Iterable<string>): Promise<void> {
    return writeProjects(puts, deletes);
  }

  async loadBlob(): Promise<string | null> {
    return localStorage.getItem(BLOB_KEY);
  }

  async saveBlob(serialized: string): Promise<void> {
    localStorage.setItem(BLOB_KEY, serialized);
  }
}

/** The adapter the store auto-saves through. Swap this to change backends. */
export const activeAdapter: StorageAdapter = new BrowserStorageAdapter();

// ---- Load outcome, and the write lock it controls ---------------------------

/**
 * Why a load could not produce the stored document.
 *
 *  - `unavailable` — the storage itself refused (denied, disabled, throwing).
 *    We do not know whether there is a document behind it.
 *  - `unreadable` — a document is there and would not parse. It has been copied
 *    aside under `savedAs` (or nowhere, if even that write failed) so that a
 *    human can still get the text back out.
 *  - `prose-unreachable` — the map read fine, but it was written with its
 *    manuscripts in IndexedDB and IndexedDB cannot be reached. Loading anyway
 *    would show every chapter as blank and save it that way.
 *  - `projects-unreachable` — the shell says the projects live in IndexedDB,
 *    and IndexedDB cannot be reached. There is a library; we cannot see it.
 *  - `projects-unreadable` — IndexedDB opened, but not one listed project would
 *    load. Each has been left untouched (see `Quarantined`). One bad project
 *    alone never lands here: the rest load and that one is set aside.
 */
export type LoadFailure =
  | { code: "unavailable"; detail: string }
  | { code: "unreadable"; savedAs: string | null }
  | { code: "prose-unreachable"; detail: string }
  | { code: "projects-unreachable"; detail: string }
  | { code: "projects-unreadable"; count: number };

export type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "failed"; failure: LoadFailure };

let loadState: LoadState = { kind: "loading" };
const loadListeners = new Set<(s: LoadState) => void>();

export function getLoadState(): LoadState {
  return loadState;
}

/** Subscribe to load-state changes. Returns an unsubscribe function. */
export function onLoadState(fn: (s: LoadState) => void): () => void {
  loadListeners.add(fn);
  return () => loadListeners.delete(fn);
}

function setLoadState(next: LoadState): void {
  loadState = next;
  loadListeners.forEach((fn) => fn(next));
}

/**
 * The write lock.
 *
 * **Nothing is written until a load has told us what is already there.** This is
 * the one invariant that makes every other kind of failure survivable: a load
 * that fails, hangs, or has simply not finished yet leaves the store holding its
 * defaults (the sample story, `onboarded: false`), and a single stray write of
 * those defaults is the difference between a bad morning and a lost manuscript.
 *
 * Armed by a load that reaches a definite answer — including "there is genuinely
 * nothing stored", which is a first launch and must be allowed to save. Left
 * disarmed by every failure, until the reader explicitly chooses to go on
 * (`armWrites`, from the recovery screen).
 */
let writesArmed = false;

export function writesLocked(): boolean {
  return !writesArmed;
}

/**
 * Let saving proceed after a failed load — the reader has seen the recovery
 * screen and chosen to start over anyway. The next change overwrites whatever
 * could not be read, which is the point, so nothing calls this implicitly.
 *
 * Flushes immediately: everything the reader did while locked is still sitting
 * in `pending`, and the choice to go on should land now, not on their next
 * keystroke.
 */
export function armWrites(): void {
  writesArmed = true;
  setLoadState({ kind: "ready" });
  setSaveStatus({ state: "idle", savedAt: 0 });
  flushSave();
}

/**
 * Blobs a previous load could not parse and set aside rather than overwrite.
 * The recovery screen offers them for download — it is the last copy of that
 * text, and getting it onto disk is worth more than anything else on offer.
 */
export function readUnreadableBackups(): { key: string; raw: string }[] {
  const out: { key: string; raw: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${UNREADABLE_KEY}:`)) continue;
      const raw = localStorage.getItem(key);
      if (raw) out.push({ key, raw });
    }
  } catch {
    // Storage denied — nothing to offer, and the screen says so anyway.
  }
  return out.sort((a, b) => b.key.localeCompare(a.key)); // newest first
}

// ---- Save status (surfaced in the Footer) -----------------------------------

export interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
  /** Epoch ms of the last successful save (0 = none this session). */
  savedAt: number;
  /**
   * Which write failed. `storage` is localStorage (the shell, or the old
   * single blob), where a failure is nearly always the quota; the project maps
   * (`map`), prose and pictures go to IndexedDB, where it is not — and telling a
   * writer their storage is full when it isn't sends them to delete things they
   * did not need to. Prose and pictures are told apart because the writer's
   * next move differs: words that did not land are gone if they walk away, a
   * picture that did not land is a file they can pick again. `locked`
   * is none of these: nothing was attempted, because the load never established
   * what is already stored (see `writesArmed`).
   */
  reason?: "storage" | "map" | "prose" | "images" | "locked";
}

let saveStatus: SaveStatus = { state: "idle", savedAt: 0 };
const saveListeners = new Set<(s: SaveStatus) => void>();

export function getSaveStatus(): SaveStatus {
  return saveStatus;
}

/** Subscribe to save-status changes. Returns an unsubscribe function. */
export function onSaveStatus(fn: (s: SaveStatus) => void): () => void {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}

function setSaveStatus(next: SaveStatus): void {
  saveStatus = next;
  saveListeners.forEach((fn) => fn(next));
}

// ---- Debounced write-through shim for zustand persist ------------------------

/** What `partialize` hands us. Only the two fields carrying payloads are named. */
export interface PersistedShape {
  doc: StoryDoc;
  projectStash?: Record<string, StoryDoc>;
  /** The prefs `partialize` also persists; nothing here reads them. */
  [key: string]: unknown;
}
/**
 * The single-blob layout, as zustand hands it to us and as `BLOB_KEY` holds it.
 *
 * `payloadsExternal` is ours, not zustand's — it sits beside the state rather
 * than in it, and records whether the manuscripts *and pictures* were lifted
 * into IndexedDB when this blob was written. Without it, a doc with no inline
 * prose is ambiguous between "has no prose" and "its prose is somewhere we
 * can't currently read", and only the second must refuse to load. The same now
 * goes for a book with no cover.
 *
 * `proseExternal` is the name this flag was born under, when prose was the only
 * payload. It is still **written** so that a build from before images moved
 * still refuses to load a document whose prose it cannot reach, and still
 * **read** as the fallback for blobs written before the rename. Absent on blobs
 * older than either, which read as `false` — those carry everything inline.
 */
type Stored = {
  state: PersistedShape;
  version?: number;
  payloadsExternal?: boolean;
  proseExternal?: boolean;
};

/**
 * The per-project layout's shell, at `SHELL_KEY`: everything that is not a
 * project. Small, and written synchronously, so it is always current — the
 * project records it lists are what can lag, and the map pad covers that.
 *
 * Its existence is the payloads-are-external marker: a shell is only ever
 * written with IndexedDB in use, so a shell with no reachable IndexedDB is
 * always a refusal (`projects-unreachable`), never "nothing stored".
 */
type Shell = {
  layout: 2;
  /** zustand's persist version — the schema the project records were written at. */
  version?: number;
  /** The prefs `partialize` persists: everything but `doc` and `projectStash`. */
  state: Record<string, unknown>;
  activeProjectId: string;
  /** Every project this browser holds, the open one first. */
  projectIds: string[];
  quarantined?: Quarantined[];
};

/**
 * A project the load could not read, set aside instead of failing the whole
 * library. It stays listed here — so it is never deleted and never written over
 * — until the writer downloads it or removes it (Projects modal).
 *
 * `key` is where its raw data now sits: a copy under `__unreadable:<id>:<ms>`,
 * so the project's own id is free again; its own id, if even that copy could
 * not be made (and then that record is never written to); or `null` when there
 * was nothing to find — listed, but no record and no pad entry.
 */
export interface Quarantined {
  id: string;
  reason: "unreadable" | "missing";
  key: string | null;
  since: string;
}

/**
 * Which layout this session saves in. Decided once, on load.
 *
 *  - `split` — the shell in localStorage, one record per project in IndexedDB.
 *  - `blob` — every project in one localStorage string, **exactly as before the
 *    split**: the code path is the old one, untouched. Used only when
 *    IndexedDB cannot be used here, or the one-time move could not complete
 *    (it is retried on the next launch).
 */
let layout: "split" | "blob" = "blob";

/**
 * Auto-save, in two streams.
 *
 * zustand persist calls `setItem` on *every* state change, so this holds the
 * latest snapshot and writes once things go quiet. **What is deferred is the
 * serialize, not just the write** — the old shim took an already-stringified
 * value, so `JSON.stringify` over the whole store ran per keystroke and the
 * debounce discarded all but the last result. Now `setItem` costs one
 * assignment and the work happens on the timer.
 *
 * The maps go out on a 500ms trailing timer; **the payloads go to IndexedDB on
 * a much shorter one**, because prose is the thing being typed and the window
 * between a keystroke and it reaching disk is the window in which it can be
 * lost. See `store/prose.ts` for the manuscript split and the crash pad,
 * `store/images.ts` for the pictures — which ride the same timer and, for the
 * reason `flushImages` gives, deliberately have no pad — and
 * `store/projects.ts` for the per-project maps and theirs.
 */
const SAVE_DEBOUNCE_MS = 500;
const PAYLOAD_DEBOUNCE_MS = 200;

let pending: Stored | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let payloadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Whether the payloads are being kept in IndexedDB. Decided once, on load. When
 * it is false — no IndexedDB, or a private mode that refuses to open one —
 * every manuscript and every picture simply stays in the localStorage blob
 * exactly as before, quota limits and all. Slower and smaller, but never lost.
 */
let payloadsEnabled = false;
/** What IndexedDB is believed to hold, so only what changed is written. */
let lastProse = new Map<string, string>();
let lastImages = new Map<string, string>();
/** Each project's map as IndexedDB holds it, by project id. */
const lastProjectJson = new Map<string, string>();
/**
 * The projects the last shell listed. A project leaves this set only by being
 * absent from a later snapshot, which is what `deleteProject` does — and that
 * is the one signal on which a project's data is removed (see `flushProjects`).
 */
let lastIndex = new Set<string>();
/** The last shell written or read, so a quarantine change can rewrite it. */
let lastShell: Shell | null = null;
let quarantined: Quarantined[] = [];
const quarantineListeners = new Set<() => void>();
/**
 * Set when a write fails, cleared when one succeeds.
 *
 * Without these the footer lies: the writes are separate, some are much more
 * likely to succeed than others, and one's "saved" would paint straight over
 * another's failure a second later. Silent save failure is the exact bug SPECS
 * §9 item 2 exists to have fixed, and splitting the write up is a fresh chance
 * to reintroduce it.
 *
 * They are separate flags because they say different things to the writer:
 * prose that did not land is words they just typed, pictures that did not land
 * is a file they can pick again, and a map that did not land is still in the
 * pad until the next save.
 */
let proseFailed = false;
let imagesFailed = false;
let mapFailed = false;
let shellFailed = false;

interface Split {
  src: Stored;
  stripped: Stored;
  prose: Map<string, string>;
  images: Map<string, string>;
  projectIds: Set<string>;
  /** Each project's payload-free map, by id. */
  docs: Map<string, StoryDoc>;
}
let splitCache: Split | null = null;

/**
 * One project, lifted apart — computed **once per document object**. zustand
 * replaces only what changed, so a project nobody touched arrives as the very
 * same object every save and costs a lookup, not a walk.
 */
interface DocSplit {
  doc: StoryDoc;
  prose: Map<string, string>;
  images: Map<string, string>;
}
const docSplits = new WeakMap<StoryDoc, DocSplit>();
const docJson = new WeakMap<StoryDoc, string>();

function splitDoc(d: StoryDoc): DocSplit {
  const hit = docSplits.get(d);
  if (hit) return hit;
  const withoutProse = splitProse(d);
  const withoutImages = splitImages(withoutProse.doc);
  const out = { doc: withoutImages.doc, prose: withoutProse.prose, images: withoutImages.images };
  docSplits.set(d, out);
  return out;
}

/** A payload-free map's JSON, stringified once per document object. */
function jsonOf(d: StoryDoc): string {
  let json = docJson.get(d);
  if (json === undefined) {
    json = JSON.stringify(d);
    docJson.set(d, json);
  }
  return json;
}

/** Lift the prose and the pictures out of the active project and every stashed one. */
function currentSplit(): Split | null {
  if (!pending) return null;
  if (splitCache && splitCache.src === pending) return splitCache;

  const value = pending;
  if (!payloadsEnabled) {
    splitCache = {
      src: value,
      stripped: value,
      prose: new Map(),
      images: new Map(),
      projectIds: new Set(),
      docs: new Map(),
    };
    return splitCache;
  }

  const prose = new Map<string, string>();
  const images = new Map<string, string>();
  const projectIds = new Set<string>();
  const docs = new Map<string, StoryDoc>();
  const take = (d: StoryDoc): StoryDoc => {
    const s = splitDoc(d);
    projectIds.add(d.id);
    docs.set(d.id, s.doc);
    for (const [k, v] of s.prose) prose.set(k, v);
    for (const [k, v] of s.images) images.set(k, v);
    return s.doc;
  };

  const state = value.state;
  const doc = take(state.doc);
  let stashChanged = false;
  const stash: Record<string, StoryDoc> = {};
  for (const [id, d] of Object.entries(state.projectStash ?? {})) {
    stash[id] = take(d);
    if (stash[id] !== d) stashChanged = true;
  }

  const stripped: Stored =
    doc === state.doc && !stashChanged
      ? value
      : { ...value, state: { ...state, doc, ...(state.projectStash ? { projectStash: stash } : {}) } };

  splitCache = { src: value, stripped, prose, images, projectIds, docs };
  return splitCache;
}

/**
 * Write the changed manuscripts.
 *
 * Order matters and is the whole safety argument: the synchronous pad first,
 * then the asynchronous IndexedDB write, then the pad is cleared only for the
 * keys that actually landed. A tab closed anywhere in the middle loses nothing.
 */
function flushProse(split: Split): void {
  const dirty = new Map<string, string>();
  for (const [k, v] of split.prose) if (lastProse.get(k) !== v) dirty.set(k, v);
  const stale = staleKeys(split.prose, new Set(lastProse.keys()), split.projectIds);
  if (dirty.size === 0 && stale.length === 0) return;

  writePad(dirty);
  void writeProse(dirty, stale)
    .then(() => {
      for (const [k, v] of dirty) lastProse.set(k, v);
      for (const k of stale) lastProse.delete(k);
      clearPad(dirty.keys());
      proseFailed = false;
    })
    .catch(() => {
      // The pad still holds this text and is deliberately not cleared, so the
      // words survive the failure — but the writer is told, because prose that
      // only exists in a recovery pad is not prose that is safely saved.
      proseFailed = true;
      setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "prose" });
    });
}

/**
 * Write the changed pictures.
 *
 * **No crash pad here, deliberately.** The pad exists because IndexedDB is
 * async and `beforeunload` is not, and it is affordable for prose because prose
 * is small. A picture in the pad would be several megabytes of base64 in
 * localStorage — recreating, on the recovery path, the exact quota failure this
 * split exists to remove. The exposure is a different shape anyway: prose is a
 * continuous stream of keystrokes, a picture is one deliberate act, and the
 * unprotected window is the ~200ms between picking the file and the write
 * landing. A picture lost there is a file the writer still has and can pick
 * again; there is no equivalent for words.
 */
function flushImages(split: Split): void {
  const dirty = new Map<string, string>();
  for (const [k, v] of split.images) if (lastImages.get(k) !== v) dirty.set(k, v);
  const stale = staleKeys(split.images, new Set(lastImages.keys()), split.projectIds);
  if (dirty.size === 0 && stale.length === 0) return;

  void writeImages(dirty, stale)
    .then(() => {
      for (const [k, v] of dirty) lastImages.set(k, v);
      for (const k of stale) lastImages.delete(k);
      imagesFailed = false;
    })
    .catch(() => {
      imagesFailed = true;
      setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "images" });
    });
}

/** Both payloads, on the shared short timer. */
function flushPayloads(): void {
  if (payloadTimer != null) {
    clearTimeout(payloadTimer);
    payloadTimer = null;
  }
  if (!writesArmed) return;
  const split = currentSplit();
  if (!split || !payloadsEnabled) return;
  flushProse(split);
  flushImages(split);
}

function markSavedIfClean(): void {
  // Only part of it landed? Saying "saved" while another write is failing
  // would be the more comforting lie and the more expensive one.
  if (proseFailed || imagesFailed || mapFailed || shellFailed) return;
  setSaveStatus({ state: "saved", savedAt: Date.now() });
}

/**
 * Write the maps that changed, and the shell.
 *
 * Order, as for prose: the changed maps go to the synchronous pad first, then
 * the shell (synchronous too), then the IndexedDB write, and each pad entry is
 * cleared only once its write has landed. A tab closed anywhere in the middle
 * reloads from the pad. Only projects whose map actually changed are written —
 * usually just the open one.
 *
 * **Deleting is the one destructive path, and it is narrow on purpose.** A
 * project is removed only when the previous shell listed it and this snapshot
 * holds it nowhere — what `deleteProject` does — and then its map, manuscripts
 * and pictures go in one transaction. A quarantined project is never in that
 * set. The prose and image flushes keep their own rule (a project absent from
 * the snapshot is left alone), so nothing else can delete across projects.
 */
function flushProjects(split: Split): void {
  const { doc, projectStash, ...prefs } = split.stripped.state;
  const projectIds = [doc.id, ...Object.keys(projectStash ?? {}).filter((id) => id !== doc.id)];
  const live = new Set(projectIds);
  const pinned = new Set(quarantined.filter((q) => q.key === q.id).map((q) => q.id));
  const setAside = new Set(quarantined.map((q) => q.id));

  const dirty = new Map<string, string>();
  // A live project on a pinned id — one whose damaged record could not be
  // copied aside — cannot be written without destroying that record. It is
  // not written, and the footer says so rather than claiming it saved.
  let blocked = false;
  for (const [id, d] of split.docs) {
    const json = jsonOf(d);
    if (lastProjectJson.get(id) === json) continue;
    if (pinned.has(id)) blocked = true;
    else dirty.set(id, json);
  }
  const deleted = [...lastIndex].filter((id) => !live.has(id) && !setAside.has(id));

  const shell: Shell = {
    layout: 2,
    version: split.stripped.version,
    state: prefs,
    activeProjectId: doc.id,
    projectIds,
    ...(quarantined.length ? { quarantined } : {}),
  };

  writeMapPad(dirty);
  if (deleted.length) dropFromMapPad(deleted);
  const shellWrite = activeAdapter.saveShell(JSON.stringify(shell));
  lastShell = shell;
  lastIndex = live;

  const mapWrite = dirty.size ? activeAdapter.saveProjects(dirty, []) : Promise.resolve();
  const doomed = new Set(deleted);
  const proseGone = [...lastProse.keys()].filter((k) => doomed.has(projectOf(k)));
  const imagesGone = [...lastImages.keys()].filter((k) => doomed.has(projectOf(k)));
  const deleteWrite = deleted.length
    ? writeAcross({
        [STORE_PROJECTS]: { deletes: deleted },
        [STORE_PROSE]: { deletes: proseGone },
        [STORE_IMAGES]: { deletes: imagesGone },
      })
    : Promise.resolve();

  void Promise.allSettled([shellWrite, mapWrite, deleteWrite]).then(([s, m, d]) => {
    shellFailed = s.status === "rejected";
    if (m.status === "fulfilled") {
      for (const [id, json] of dirty) lastProjectJson.set(id, json);
      clearMapPad(dirty);
    }
    if (d.status === "fulfilled") {
      for (const id of deleted) lastProjectJson.delete(id);
      for (const k of proseGone) lastProse.delete(k);
      for (const k of imagesGone) lastImages.delete(k);
    }
    // A failed delete leaves data no shell lists: it can never load again, it
    // only takes up room. Not worth alarming a writer over.
    mapFailed = m.status === "rejected" || blocked;
    if (shellFailed) setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "storage" });
    else if (mapFailed) setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "map" });
    else markSavedIfClean();
  });
}

function flushMap(): void {
  if (saveTimer != null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!writesArmed) return;
  const split = currentSplit();
  if (!split) return;
  pending = null;
  splitCache = null;
  if (layout === "split") return flushProjects(split);
  // The marker travels with the blob it describes, so the next load knows
  // whether these chapters are prose-free (and these books cover-free) because
  // there is none or because it lives in IndexedDB. `proseExternal` is written
  // alongside it only so that an older build still refuses this blob rather
  // than loading it blank — see the note on `Stored`.
  const value = JSON.stringify({
    ...split.stripped,
    payloadsExternal: payloadsEnabled,
    proseExternal: payloadsEnabled,
  });
  void activeAdapter
    .saveBlob(value)
    .then(() => {
      shellFailed = false;
      markSavedIfClean();
    })
    .catch(() => {
      shellFailed = true;
      setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "storage" });
    });
}

/** Everything, now. Payloads before the map, so the pad is written either way. */
function flushSave(): void {
  flushPayloads();
  flushMap();
}

if (typeof window !== "undefined") {
  // The shell, the blob and both pads are all written synchronously, up to
  // their (absent) first await, so a flush here still lands before the page
  // goes away. The IndexedDB writes will not finish — the pads are what cover
  // them.
  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}

/** Force everything out now — used on blur and when leaving a chapter. */
export function flushNow(): void {
  flushSave();
}

// ---- Projects set aside on load ----------------------------------------------

/** Projects that could not be read and were set aside (Projects modal). */
export function getQuarantined(): Quarantined[] {
  return quarantined;
}

export function onQuarantined(fn: () => void): () => void {
  quarantineListeners.add(fn);
  return () => quarantineListeners.delete(fn);
}

function setQuarantined(next: Quarantined[]): void {
  quarantined = next;
  quarantineListeners.forEach((fn) => fn());
}

/** The raw data of a set-aside project, for download. `undefined` if there is none. */
export async function readQuarantinedRaw(q: Quarantined): Promise<string | undefined> {
  if (!q.key) return undefined;
  return readProjectRaw(q.key);
}

/**
 * Hand a set-aside project's raw data to the writer as a file. `false` when
 * there is none to give (it was listed but never found).
 */
export async function downloadQuarantined(q: Quarantined): Promise<boolean> {
  const raw = await readQuarantinedRaw(q);
  if (raw === undefined) return false;
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `estoria-recovered-${slugify(q.id)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Remove a set-aside project for good — the writer's explicit choice, behind a
 * confirm. Its raw copy goes; if no live project has since taken its id, so do
 * the record at that id and every manuscript and picture keyed to it.
 */
export async function discardQuarantined(q: Quarantined): Promise<void> {
  const takenBack = lastIndex.has(q.id);
  const projectDeletes = new Set<string>();
  if (q.key && q.key !== q.id) projectDeletes.add(q.key);
  if (!takenBack) projectDeletes.add(q.id);
  const proseGone = takenBack ? [] : [...lastProse.keys()].filter((k) => projectOf(k) === q.id);
  const imagesGone = takenBack ? [] : [...lastImages.keys()].filter((k) => projectOf(k) === q.id);
  await writeAcross({
    [STORE_PROJECTS]: { deletes: projectDeletes },
    [STORE_PROSE]: { deletes: proseGone },
    [STORE_IMAGES]: { deletes: imagesGone },
  });
  for (const k of proseGone) lastProse.delete(k);
  for (const k of imagesGone) lastImages.delete(k);
  setQuarantined(quarantined.filter((x) => x !== q));
  if (lastShell && writesArmed) {
    const { quarantined: _old, ...rest } = lastShell;
    lastShell = { ...rest, ...(quarantined.length ? { quarantined } : {}) };
    await activeAdapter.saveShell(JSON.stringify(lastShell));
  }
}

// ---- Loading -----------------------------------------------------------------

type LoadResult = { value: Stored | null } | { failure: LoadFailure };

/** Keep a copy of something unparseable before anything else touches its key. */
function setAside(raw: string): string | null {
  const savedAs = `${UNREADABLE_KEY}:${Date.now()}`;
  try {
    localStorage.setItem(savedAs, raw);
    return savedAs;
  } catch {
    return null; // no room to keep it, and no way to read it
  }
}

/**
 * Every manuscript and picture, with the prose pad over the top. Records what
 * IndexedDB holds **before** the pad is applied, so a pad entry that never
 * reached IndexedDB reads as dirty and is written on the next save.
 */
async function loadPayloads(): Promise<{ prose: Map<string, string>; images: Map<string, string> }> {
  const [stored, storedImages] = await Promise.all([loadAllProse(), loadAllImages()]);
  lastProse = new Map(stored);
  lastImages = new Map(storedImages);
  const prose = new Map(stored);
  for (const [k, v] of Object.entries(readPad())) prose.set(k, v);
  return { prose, images: storedImages };
}

/** The old single-blob layout — this is the load as it was before the split. */
async function loadBlobLayout(raw: string): Promise<LoadResult> {
  let parsed: Stored;
  try {
    parsed = JSON.parse(raw) as Stored;
  } catch {
    // Unreadable. Keep a copy before anything else touches this key — it is
    // the only chance anyone has of getting the text back out by hand, and it
    // costs one write on a path that should never run.
    return { failure: { code: "unreadable", savedAs: setAside(raw) } };
  }

  // Written with its payloads in IndexedDB? Then IndexedDB is not optional
  // for this document, whatever it is for the browser. `proseExternal` is the
  // pre-rename spelling and means the same thing for the prose it described.
  const external = parsed?.payloadsExternal === true || parsed?.proseExternal === true;

  if (!parsed?.state?.doc) return { value: parsed ?? null };

  if (!payloadsEnabled) {
    if (external) {
      return {
        failure: {
          code: "prose-unreachable",
          detail: "This browser's database for manuscripts and pictures could not be opened.",
        },
      };
    }
    return { value: parsed }; // everything is inline here; nothing is missing
  }

  let payloads: Awaited<ReturnType<typeof loadPayloads>>;
  try {
    payloads = await loadPayloads();
  } catch (e) {
    payloadsEnabled = false;
    if (external) {
      return {
        failure: { code: "prose-unreachable", detail: e instanceof Error ? e.message : String(e) },
      };
    }
    return { value: parsed };
  }

  // Documents written before either split still carry their prose and their
  // pictures inline; both survive here untouched and move to IndexedDB on the
  // next save. That is the whole migration.
  const state = parsed.state;
  const rejoin = (d: StoryDoc): StoryDoc => mergeImages(mergeProse(d, payloads.prose), payloads.images);
  const stash: Record<string, StoryDoc> = {};
  for (const [id, d] of Object.entries(state.projectStash ?? {})) stash[id] = rejoin(d);
  return {
    value: {
      ...parsed,
      state: {
        ...state,
        doc: rejoin(state.doc),
        ...(state.projectStash ? { projectStash: stash } : {}),
      },
    },
  };
}

/**
 * The one-time move from the single blob to one record per project.
 *
 * Runs on the first load after the update, before the store sees anything, and
 * is ordered so that **a failure at any step leaves the old blob as the thing
 * the next load reads**:
 *
 *  1. Every project's map, every manuscript and picture not yet in IndexedDB,
 *     and an untouched copy of the old blob go in **one transaction**.
 *  2. The shell is written. From here the next load takes the new path.
 *  3. The old key is replaced with `BLOB_TOMBSTONE` — the space comes back,
 *     and a stale build cannot mistake it for a first launch.
 *
 * `false` means it did not complete: this session keeps saving the old way and
 * the next launch tries again. Writing before the lock is armed is deliberate
 * and safe here — every write is additive, and the load has already read the
 * definite answer it is copying.
 */
async function migrateToSplit(value: Stored, raw: string): Promise<boolean> {
  try {
    const { doc, projectStash, ...prefs } = value.state;
    const docs = [doc, ...Object.values(projectStash ?? {}).filter((d) => d.id !== doc.id)];
    const records = new Map<string, string>();
    const prose = new Map<string, string>();
    const images = new Map<string, string>();
    for (const d of docs) {
      const s = splitDoc(d);
      records.set(d.id, jsonOf(s.doc));
      for (const [k, v] of s.prose) if (lastProse.get(k) !== v) prose.set(k, v);
      for (const [k, v] of s.images) if (lastImages.get(k) !== v) images.set(k, v);
    }

    await writeAcross({
      [STORE_PROJECTS]: { puts: new Map([...records, [`${LEGACY_BACKUP_PREFIX}${Date.now()}`, raw]]) },
      [STORE_PROSE]: { puts: prose },
      [STORE_IMAGES]: { puts: images },
    });
    for (const [id, json] of records) lastProjectJson.set(id, json);
    for (const [k, v] of prose) lastProse.set(k, v);
    for (const [k, v] of images) lastImages.set(k, v);
    clearPad(prose.keys());

    const shell: Shell = {
      layout: 2,
      version: value.version,
      state: prefs,
      activeProjectId: doc.id,
      projectIds: docs.map((d) => d.id),
    };
    await activeAdapter.saveShell(JSON.stringify(shell));
    lastShell = shell;
    lastIndex = new Set(shell.projectIds);

    try {
      await activeAdapter.saveBlob(BLOB_TOMBSTONE);
    } catch {
      // The shell already wins on every later load; this only frees the room.
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The per-project layout. `shellRaw === null` means the shell is gone but the
 * tombstone says the projects moved: the list is rebuilt from the records
 * rather than calling it a first launch over a library.
 */
async function loadSplitLayout(shellRaw: string | null): Promise<LoadResult> {
  let shell: Shell | null = null;
  if (shellRaw !== null) {
    try {
      shell = JSON.parse(shellRaw) as Shell;
      if (!Array.isArray(shell?.projectIds)) throw new Error("no project list");
    } catch {
      return { failure: { code: "unreadable", savedAs: setAside(shellRaw) } };
    }
  }

  if (!payloadsEnabled) {
    return {
      failure: {
        code: "projects-unreachable",
        detail: "This browser's database for your projects could not be opened.",
      },
    };
  }

  let records: Map<string, string>;
  let payloads: Awaited<ReturnType<typeof loadPayloads>>;
  try {
    [records, payloads] = await Promise.all([activeAdapter.loadProjects(), loadPayloads()]);
  } catch (e) {
    payloadsEnabled = false;
    return {
      failure: { code: "projects-unreachable", detail: e instanceof Error ? e.message : String(e) },
    };
  }

  if (!shell) {
    const ids = [...records.keys()].filter((k) => !k.startsWith("__"));
    // Version 0 sends every record through `normalizeDoc` on the way in — the
    // schema they were written at is one more thing the lost shell knew.
    shell = { layout: 2, version: 0, state: { onboarded: true }, activeProjectId: ids[0] ?? "", projectIds: ids };
  }

  const pad = readMapPad();
  const rejoin = (d: StoryDoc): StoryDoc => mergeImages(mergeProse(d, payloads.prose), payloads.images);
  const next: Quarantined[] = [...(shell.quarantined ?? [])];
  const setAsideIds = new Set(next.map((q) => q.id));
  const docs = new Map<string, StoryDoc>();
  const now = new Date().toISOString();

  for (const id of shell.projectIds) {
    if (setAsideIds.has(id) || docs.has(id)) continue;
    const stored = records.get(id);
    // The pad is newer than the record when both exist: it is what was in
    // flight when the tab went away.
    const candidates = [pad[id], stored].filter((v): v is string => typeof v === "string");
    let loaded: StoryDoc | null = null;
    for (const raw of candidates) {
      try {
        const d = JSON.parse(raw) as StoryDoc;
        if (d && typeof d === "object" && typeof d.id === "string") {
          loaded = d;
          break;
        }
      } catch {
        // try the other copy
      }
    }
    if (loaded) {
      if (stored !== undefined) lastProjectJson.set(id, stored);
      // A pad entry identical to its record is one whose write landed but whose
      // clear did not: nothing is in flight, so it can go.
      if (stored !== undefined && pad[id] === stored) clearMapPad(new Map([[id, stored]]));
      docs.set(id, rejoin(loaded));
      continue;
    }
    if (candidates.length === 0) {
      next.push({ id, reason: "missing", key: null, since: now });
      continue;
    }
    // Unreadable. Copy it aside so its id is free to be written again; if even
    // that fails, leave it where it is and never write to that id.
    const key = `__unreadable:${id}:${Date.now()}`;
    let kept: string | null = stored !== undefined ? id : null;
    try {
      await writeProjects(new Map([[key, candidates[candidates.length - 1]]]), []);
      kept = key;
    } catch {
      // `kept` stays as above
    }
    next.push({ id, reason: "unreadable", key: kept, since: now });
  }
  setQuarantined(next);

  if (docs.size === 0) {
    if (next.length) return { failure: { code: "projects-unreadable", count: next.length } };
    return { value: null }; // a shell listing nothing: nothing is lost by starting fresh
  }

  const activeId = docs.has(shell.activeProjectId) ? shell.activeProjectId : [...docs.keys()][0];
  const stash: Record<string, StoryDoc> = {};
  for (const [id, d] of docs) if (id !== activeId) stash[id] = d;
  lastIndex = new Set(docs.keys());
  lastShell = shell;
  return {
    value: {
      state: { ...shell.state, doc: docs.get(activeId)!, projectStash: stash },
      version: shell.version,
    },
  };
}

/**
 * Storage for zustand's persist middleware, in object form rather than through
 * `createJSONStorage`: owning the serialization is what lets the prose be
 * lifted out *before* `JSON.stringify` ever sees it.
 */
export const zustandStorage: PersistStorage<PersistedShape> = {
  getItem: async (name: string) => {
    void name; // the adapter owns its keys; see BLOB_KEY and SHELL_KEY
    try {
      // One-time cleanup: reclaim the quota eaten by the old duplicate copy.
      localStorage.removeItem(LEGACY_KEY);
      // A stale build that opened after the move set the tombstone aside as
      // "unreadable" — that is what it is for — but it is not anyone's writing,
      // and a recovery screen offering it for download would only confuse.
      for (const { key, raw } of readUnreadableBackups()) {
        if (raw === BLOB_TOMBSTONE) localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }

    // Every `null` value below hands the store its defaults — the sample story
    // and `onboarded: false`, i.e. the first-launch screen. That is the right
    // answer for exactly one of these paths (nothing stored) and a catastrophe
    // on the rest, so each failure arms nothing and says why instead.
    const fail = (failure: LoadFailure) => {
      setLoadState({ kind: "failed", failure });
      setSaveStatus({ state: "error", savedAt: 0, reason: "locked" });
      return null;
    };
    const ready = <T,>(value: T): T => {
      writesArmed = true;
      setLoadState({ kind: "ready" });
      return value;
    };
    const settle = (r: LoadResult) => ("failure" in r ? fail(r.failure) : ready(r.value));

    // Settled once, up front, so every path below — including the failures,
    // which the reader may still choose to write over — agrees on where the
    // payloads go. A browser opening Estoria for the first time would otherwise
    // keep prose and pictures inline until its next reload.
    payloadsEnabled = await payloadStoreAvailable();

    let shellRaw: string | null;
    let raw: string | null;
    try {
      shellRaw = await activeAdapter.loadShell();
      raw = shellRaw ? null : await activeAdapter.loadBlob();
    } catch (e) {
      return fail({ code: "unavailable", detail: e instanceof Error ? e.message : String(e) });
    }

    if (shellRaw || raw === BLOB_TOMBSTONE) {
      layout = "split";
      const result = await loadSplitLayout(shellRaw);
      // No IndexedDB: if the reader chooses to start over from the recovery
      // screen, that goes to the old blob key, which the shell outranks on every
      // later load — the library behind it is never written over.
      if (!payloadsEnabled) layout = "blob";
      return settle(result);
    }

    // Genuinely nothing stored: a first launch, and the one case that may write.
    if (!raw) {
      layout = payloadsEnabled ? "split" : "blob";
      return ready(null);
    }

    layout = "blob";
    const result = await loadBlobLayout(raw);
    if ("failure" in result) return fail(result.failure);
    if (result.value?.state?.doc && payloadsEnabled && (await migrateToSplit(result.value, raw))) {
      layout = "split";
    }
    return ready(result.value);
  },

  setItem: (name: string, value: Stored) => {
    void name;
    // One assignment. Everything expensive waits for the timers below.
    pending = value;
    // Locked: hold the snapshot in memory (so arming later still saves it) but
    // schedule nothing, and never show "Saving..." for a write that will not
    // happen. The Footer says what is actually true.
    if (!writesArmed) {
      if (saveStatus.reason !== "locked") {
        setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "locked" });
      }
      return;
    }
    if (saveStatus.state !== "saving") setSaveStatus({ ...saveStatus, state: "saving" });
    if (payloadTimer != null) clearTimeout(payloadTimer);
    payloadTimer = setTimeout(flushPayloads, PAYLOAD_DEBOUNCE_MS);
    if (saveTimer != null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushMap, SAVE_DEBOUNCE_MS);
  },

  removeItem: (name: string) => {
    // Deliberately leaves the manuscripts alone. Nothing in the app clears the
    // store, and prose is the last thing to destroy on an ambiguous signal.
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

// ---- Explicit file save / load (the "document" experience) -----------------

/**
 * Return a copy of the doc with `modifiedAt` set to now. Every path that
 * writes a `.estoria.json` file (download, backup, sync) stamps through this,
 * per the cross-app contract — the Android app does the same on its writes.
 */
export function stampModified(doc: StoryDoc): StoryDoc {
  return { ...doc, modifiedAt: new Date().toISOString() };
}

/** Download the current story as a portable .estoria.json project file. */
export function downloadProjectFile(doc: StoryDoc): void {
  const blob = new Blob([JSON.stringify(stampModified(doc), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(doc.projectTitle || "story")}.estoria.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Thrown when a file was written by a newer app than this one. Callers must
 * surface it (not overwrite the file) — an older app writing a newer file
 * would silently drop the fields it doesn't understand.
 */
export class SchemaTooNewError extends Error {
  constructor(fileVersion: number) {
    super(
      `This project was saved by a newer version of Estoria (schema ${fileVersion}; ` +
        `this app reads up to ${SCHEMA_VERSION}). Update the app before opening it.`
    );
    this.name = "SchemaTooNewError";
  }
}

/** The pre-v4 per-chapter version overlay: title/summary overrides keyed by draft id. */
type LegacyOverrides = Record<string, { title?: string; summary?: string }>;

/**
 * v4 migration: versions used to be an overlay (per-chapter title/summary
 * `overrides` on one shared board); now each version is a standalone fork.
 * Materialize every draft into a full board: base chapters + that draft's
 * overrides applied. The active draft's board goes to the top level, the rest
 * into `draftData`. What the user *saw* per version before is exactly what each
 * fork contains after — nothing visible changes at the moment of migration.
 */
function materializeLegacyVersions(
  chapters: Chapter[],
  links: ChapterLink[],
  storyNotes: string,
  drafts: DraftVersion[],
  activeDraftId: string
): VersionData & { draftData: Record<string, VersionData> } {
  const boardFor = (draftId: string): VersionData => ({
    chapters: chapters.map((c) => {
      const { overrides, ...base } = c as Chapter & { overrides?: LegacyOverrides };
      const o = draftId !== MAIN_DRAFT_ID ? overrides?.[draftId] : undefined;
      return {
        ...base,
        ...(o?.title != null ? { title: o.title } : {}),
        ...(o?.summary != null ? { summary: o.summary } : {}),
      };
    }),
    links: links.map((l) => ({ ...l })),
    storyNotes,
  });

  const draftData: Record<string, VersionData> = {};
  for (const d of drafts) {
    if (d.id !== activeDraftId) draftData[d.id] = boardFor(d.id);
  }
  return { ...boardFor(activeDraftId), draftData };
}

/**
 * A pre-v5 ref, as it exists on disk: it carried its own content
 * (`kind`/`label`/`body`/`src`) and an optional `assetId` snapshot link. v5 refs
 * are pure `{ id, assetId }` links; this is the shape we read *from* to migrate.
 */
interface LegacyRef {
  id?: string;
  kind?: RefKind;
  label?: string;
  body?: string;
  src?: string;
  assetId?: string;
}

// Fresh ids minted during migration. A counter keeps them unique within one
// normalize pass without colliding with the store's runtime uid() ids.
let migSeq = 0;
const migId = (prefix: string) => `${prefix}-mig-${Date.now().toString(36)}-${(migSeq++).toString(36)}`;

/**
 * Schema v4 → v5: pinned refs stop carrying content and become pure links into
 * the doc-level `assets` pool. Walk every ref in all five locations (active
 * chapters, `draftData`, `bookData` incl. its nested `draftData`, and world
 * entries) and, for each:
 *
 *  - **Standalone** (no `assetId`): create an Asset from its content, link to it.
 *  - **Fork-copy dedupe**: version forks duplicated ref *objects with identical
 *    ids*. Dedupe key is `ref.id` + content, so identical copies collapse to ONE
 *    shared asset while a fork that was edited after forking (same id, diverged
 *    content) becomes its own asset. Never dedupe by content alone — that would
 *    silently merge two unrelated identical notes into one live-linked note.
 *  - **Already-linked snapshot** (`assetId` set, asset exists): content equal →
 *    just slim to `{ id, assetId }`. Content diverged (either side edited after
 *    linking; we can't know which is newer) → preserve the ref's content as a
 *    NEW asset, no data loss.
 *  - **Dangling `assetId`** (asset missing): has content → new asset; else drop.
 *
 * Idempotent: a v5 doc's refs already have no content, so each resolves to its
 * existing asset unchanged. Runs last, after v3→v4 version materialization.
 */
function migrateRefsToAssets(doc: StoryDoc): StoryDoc {
  const assets: Asset[] = doc.assets.map((a) => ({ ...a }));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const minted = new Map<string, string>(); // `${refId}\u0000${content}` -> assetId

  const contentKey = (r: { kind?: RefKind; label?: string; body?: string; src?: string }) =>
    JSON.stringify([r.kind === "IMAGE" ? "IMAGE" : "NOTE", r.label ?? "", r.body ?? "", r.src ?? ""]);

  const mint = (r: LegacyRef, refId: string): string => {
    const key = `${refId}\u0000${contentKey(r)}`;
    const hit = minted.get(key);
    if (hit) return hit;
    const id = migId("a");
    const kind: RefKind = r.kind === "IMAGE" ? "IMAGE" : "NOTE";
    const asset: Asset = {
      id,
      kind,
      label: r.label ?? "",
      ...(kind === "NOTE" ? { body: r.body ?? "" } : {}),
      ...(r.src !== undefined ? { src: r.src } : {}),
    };
    assets.push(asset);
    assetById.set(id, asset);
    minted.set(key, id);
    return id;
  };

  const convert = (raw: LegacyRef): PinnedRef | null => {
    const refId = raw.id ?? migId("r");
    const hasContent =
      raw.kind !== undefined ||
      raw.label !== undefined ||
      raw.body !== undefined ||
      raw.src !== undefined;
    if (raw.assetId) {
      const asset = assetById.get(raw.assetId);
      if (asset) {
        // Equal (or already a pure v5 link) → keep the link as-is.
        if (!hasContent || contentKey(raw) === contentKey(asset)) {
          return { id: refId, assetId: raw.assetId };
        }
        // Diverged snapshot → preserve the ref's content as its own new asset.
        return { id: refId, assetId: mint(raw, refId) };
      }
      // Dangling link: rescue any cached content, otherwise drop the ref.
      return hasContent ? { id: refId, assetId: mint(raw, refId) } : null;
    }
    // Standalone ref → new asset. (A contentless standalone can't be preserved.)
    return hasContent ? { id: refId, assetId: mint(raw, refId) } : null;
  };

  const convertRefs = (refs: unknown): PinnedRef[] =>
    (Array.isArray(refs) ? (refs as LegacyRef[]) : [])
      .map(convert)
      .filter((r): r is PinnedRef => r !== null);

  // Defensive walks: this runs inside the one-time v4→v5 migration, where a
  // throw is caught by the persist `migrate` hook and replaces the ENTIRE store
  // (active doc + every stash) with the sample. A single malformed version entry
  // — `draftData` is passed through un-normalized, so hand-edited/foreign blobs
  // can carry `null` or a non-array `chapters` — must degrade to that one entry
  // being emptied, never sink the whole doc. Well-formed docs are unaffected.
  const convertChapters = (chapters: unknown): Chapter[] =>
    (Array.isArray(chapters) ? (chapters as Chapter[]) : []).map((c) => ({
      ...(c as object),
      refs: convertRefs((c as { refs?: unknown })?.refs),
    })) as Chapter[];
  const convertVersions = (dd: unknown): Record<string, VersionData> => {
    if (!dd || typeof dd !== "object") return {};
    return Object.fromEntries(
      Object.entries(dd as Record<string, unknown>).map(([id, v]) => {
        const version = (v && typeof v === "object" ? v : {}) as Partial<VersionData>;
        return [
          id,
          {
            ...version,
            chapters: convertChapters(version.chapters),
            links: Array.isArray(version.links) ? version.links : [],
            storyNotes: typeof version.storyNotes === "string" ? version.storyNotes : "",
          },
        ];
      })
    );
  };

  return {
    ...doc,
    assets,
    chapters: convertChapters(doc.chapters),
    draftData: convertVersions(doc.draftData),
    bookData: Object.fromEntries(
      Object.entries(doc.bookData).map(([id, b]) => [
        id,
        { ...b, chapters: convertChapters(b.chapters), draftData: convertVersions(b.draftData) },
      ])
    ),
    world: doc.world.map((w) => ({ ...w, refs: convertRefs(w.refs) })),
  };
}

/**
 * Schema v7 → v8: characters and world entries gained the same `archived` flag
 * assets have. Nothing to convert — an absent flag means "not archived", which
 * is what every pre-v8 record is — but the value itself is coerced to a real
 * boolean or dropped, so a hand-edited or foreign file can't put a stray truthy
 * value where the UI expects a boolean. Everything else is left untouched:
 * unlike assets, these records have no field the UI would crash on.
 */
function normalizeArchived<T extends { archived?: boolean }>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): T[] => {
    if (!x || typeof x !== "object") return [];
    const p = x as T;
    const { archived: _drop, ...rest } = p;
    return [(p.archived ? { ...rest, archived: true } : rest) as T];
  });
}

/**
 * Schema v8 → v9: `ConnType` gained a fourth value, `"none"` — a seam that
 * connects two scenes without claiming a causal relationship between them.
 *
 * Nothing to convert: every v8 link value is a valid v9 one, and no v8 document
 * contains `"none"`. What this does add is coercion, which the raw `.slice()`
 * it replaces had none of. A value that isn't one of the four becomes `"none"`
 * rather than being handed to the UI, because an unlabeled seam is the only
 * fallback that invents nothing — degrading a stray value to `"therefore"`
 * would assert exactly the causality v9 exists to stop asserting.
 *
 * The array is still truncated to the number of seams (`scenes.length - 1`) and
 * still may be *shorter* than that; a missing entry reads as `"none"` at every
 * call site, so short arrays need no padding here.
 */
function normalizeSceneLinks(raw: unknown, sceneCount: number): ConnType[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, Math.max(0, sceneCount - 1))
    .map((v): ConnType =>
      v === "therefore" || v === "but" || v === "and" || v === "none" ? v : "none"
    );
}

/**
 * Schema v5 → v6: assets gained a third `kind` (`TODO`, with `items`) and an
 * `archived` flag. Nothing to convert — v5 assets are valid v6 assets — but a
 * file can still arrive malformed or from a *newer* app's unknown kind, so every
 * asset is coerced into a shape the UI can render:
 *
 *  - unknown/missing `kind` → `NOTE` (a note renders anything with a label+body,
 *    so an unrecognized resource degrades to readable text rather than a blank).
 *  - `TODO` always has an `items` array, with each line given an id/text/done.
 *  - `archived` is a real boolean or absent, never a stray truthy value.
 */
function normalizeAssets(raw: unknown): Asset[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a, i): Asset[] => {
    if (!a || typeof a !== "object") return [];
    const p = a as Partial<Asset>;
    const kind: RefKind = p.kind === "IMAGE" || p.kind === "TODO" ? p.kind : "NOTE";
    const items =
      kind === "TODO"
        ? (Array.isArray(p.items) ? p.items : []).flatMap((it, j): TodoItem[] => {
            if (!it || typeof it !== "object") return [];
            const t = it as Partial<TodoItem>;
            return [
              {
                id: typeof t?.id === "string" && t.id ? t.id : `t-file-${i}-${j}`,
                text: typeof t?.text === "string" ? t.text : "",
                done: !!t?.done,
              },
            ];
          })
        : undefined;
    return [
      {
        ...p,
        id: typeof p.id === "string" && p.id ? p.id : `a-file-${i}`,
        kind,
        label: typeof p.label === "string" ? p.label : "",
        ...(items ? { items } : {}),
        ...(p.archived ? { archived: true } : {}),
      } as Asset,
    ];
  });
}

/**
 * Coerce a parsed project file into a complete, current-schema StoryDoc.
 * Older exports (pre-v3: no books/bookData/drafts; pre-v4: overlay-style
 * versions) and hand-edited files get every missing field defaulted or
 * converted instead of crashing the first component that reads it. Throws if
 * the input isn't recognizably an Estoria project, or (`SchemaTooNewError`)
 * if it comes from a newer app.
 */
export function normalizeDoc(raw: unknown): StoryDoc {
  const d = raw as Partial<StoryDoc> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.chapters)) {
    throw new Error("Not a valid Estoria project file.");
  }
  if (typeof d.schemaVersion === "number" && d.schemaVersion > SCHEMA_VERSION) {
    throw new SchemaTooNewError(d.schemaVersion);
  }

  const title = typeof d.projectTitle === "string" && d.projectTitle ? d.projectTitle : "Untitled Story";

  const chapters: Chapter[] = d.chapters.map((c, i) => {
    const p = (c ?? {}) as Partial<Chapter>;
    const scenes = Array.isArray(p.scenes) && p.scenes.length ? p.scenes : ["New scene."];
    return {
      ...p,
      id: p.id || `c-file-${i}`,
      num: typeof p.num === "number" ? p.num : i + 1,
      act: typeof p.act === "number" ? p.act : 1,
      status: p.status === "done" || p.status === "draft" ? p.status : "idea",
      title: p.title || `Chapter ${i + 1}`,
      words: typeof p.words === "number" ? p.words : 0,
      x: typeof p.x === "number" ? p.x : 60 + (i % 4) * 316,
      y: typeof p.y === "number" ? p.y : 90 + Math.floor(i / 4) * 224,
      chars: Array.isArray(p.chars) ? p.chars : [],
      scenes,
      sceneLinks: normalizeSceneLinks(p.sceneLinks, scenes.length),
      refs: Array.isArray(p.refs) ? p.refs : [],
    };
  });

  const books =
    Array.isArray(d.books) && d.books.length
      ? d.books
      : [
          {
            id: "book-1",
            title,
            subtitle: "Book One",
            status: "drafting" as const,
            premise: "",
            arc: "",
            notes: "",
            x: 80,
            y: 90,
          },
        ];
  const activeBookId =
    typeof d.activeBookId === "string" && books.some((b) => b.id === d.activeBookId)
      ? d.activeBookId
      : books[0].id;

  const drafts =
    Array.isArray(d.drafts) && d.drafts.length ? d.drafts : [{ id: MAIN_DRAFT_ID, name: "Main draft" }];
  const activeDraftId =
    typeof d.activeDraftId === "string" && drafts.some((dr) => dr.id === d.activeDraftId)
      ? d.activeDraftId
      : drafts[0].id;

  const links = Array.isArray(d.links) ? d.links : [];
  const storyNotes = typeof d.storyNotes === "string" ? d.storyNotes : "";

  // Versions: v4+ docs carry standalone forks in `draftData`; older docs carry
  // overlay overrides, materialized into forks here.
  const stripLegacy = (cs: Chapter[]): Chapter[] =>
    cs.map((c) => {
      const { overrides: _drop, ...rest } = c as Chapter & { overrides?: LegacyOverrides };
      return rest;
    });
  const board =
    d.draftData && typeof d.draftData === "object"
      ? {
          chapters: stripLegacy(chapters),
          links,
          storyNotes,
          draftData: d.draftData as Record<string, VersionData>,
        }
      : materializeLegacyVersions(chapters, links, storyNotes, drafts, activeDraftId);

  const rawBookData =
    d.bookData && typeof d.bookData === "object"
      ? (d.bookData as Record<string, Partial<BookData> | null>)
      : {};
  const bookData: Record<string, BookData> = {};
  for (const [id, b] of Object.entries(rawBookData)) {
    if (!b || typeof b !== "object") continue;
    const bChapters = Array.isArray(b.chapters) ? b.chapters : [];
    const bLinks = Array.isArray(b.links) ? b.links : [];
    const bNotes = typeof b.storyNotes === "string" ? b.storyNotes : "";
    const bDrafts =
      Array.isArray(b.drafts) && b.drafts.length
        ? b.drafts
        : [{ id: MAIN_DRAFT_ID, name: "Main draft" }];
    const bActive =
      typeof b.activeDraftId === "string" && bDrafts.some((dr) => dr.id === b.activeDraftId)
        ? b.activeDraftId
        : bDrafts[0].id;
    const bBoard =
      b.draftData && typeof b.draftData === "object"
        ? { chapters: stripLegacy(bChapters), links: bLinks, storyNotes: bNotes, draftData: b.draftData }
        : materializeLegacyVersions(bChapters, bLinks, bNotes, bDrafts, bActive);
    bookData[id] = {
      ...bBoard,
      drafts: bDrafts,
      activeDraftId: bActive,
      mainDraftId: resolveMainDraftId(bDrafts, b.mainDraftId),
    };
  }

  const normalized: StoryDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: typeof d.id === "string" && d.id ? d.id : `story-${Date.now().toString(36)}`,
    projectTitle: title,
    // Only the .docx export reads this, but it must survive a round trip
    // through a file like any other field the user set.
    ...(typeof d.author === "string" && d.author ? { author: d.author } : {}),
    // Cross-app field stamped by whichever app last wrote the file — must
    // survive normalization or every open would look like a fresh write.
    ...(typeof d.modifiedAt === "string" && d.modifiedAt ? { modifiedAt: d.modifiedAt } : {}),
    seriesMode: !!d.seriesMode,
    // Single pieces (see `lib/piece.ts`). All optional, so a file without them
    // is a book exactly as before; each is checked rather than copied, because a
    // stray value here would change what the whole project looks like.
    ...(d.form === "piece" && !d.seriesMode ? { form: "piece" as const } : {}),
    ...(d.kind === "story" || d.kind === "essay" || d.kind === "poem" || d.kind === "other"
      ? { kind: d.kind }
      : {}),
    ...(d.grownInto === "work" || d.grownInto === "collection" ? { grownInto: d.grownInto } : {}),
    ...(d.keepLineBreaks === true ? { keepLineBreaks: true } : {}),
    ...(d.savedCopy && typeof d.savedCopy === "object" && typeof d.savedCopy.savedAt === "string"
      ? { savedCopy: d.savedCopy }
      : {}),
    drafts,
    activeDraftId,
    // Absent in files written before the marker was movable; there the seed
    // version was always main, which is what the resolver falls back to.
    mainDraftId: resolveMainDraftId(drafts, typeof d.mainDraftId === "string" ? d.mainDraftId : undefined),
    characters: normalizeArchived<Character>(d.characters),
    world: normalizeArchived<WorldEntry>(d.world),
    assets: normalizeAssets(d.assets),
    books,
    bookLinks: Array.isArray(d.bookLinks) ? d.bookLinks : [],
    activeBookId,
    chapters: board.chapters,
    links: board.links,
    storyNotes: board.storyNotes,
    draftData: board.draftData,
    bookData,
  };

  // v4 → v5: refs become pure links into the shared asset pool. Runs last, so
  // v3-overlay docs have already been materialized into v4 forks (order matters).
  return migrateRefsToAssets(normalized);
}

/**
 * Bring every `words` in a document back in line with the prose beside it.
 *
 * **A boundary pass, not a render-time one.** A file can arrive from anywhere —
 * an export written by the Android app, a Sync folder, a hand-edited JSON, an
 * AI-structured import — carrying whatever count it likes against whatever
 * manuscripts it holds, and nothing downstream re-reads the prose. So the counts
 * are settled once, at the door.
 *
 * Deliberately **not** run at hydration, where `mergeProse` has just put every
 * project's manuscripts back: the counts there were written by this app on the
 * save rhythm and are already right, and scanning a whole library of prose to
 * confirm it would be the SPECS §9 item 14 mistake at startup instead of per
 * keystroke. Imports are one user-initiated moment where one scan is invisible.
 */
export function reconcileWords(doc: StoryDoc): StoryDoc {
  return mapChapters(doc, (_bookId, _draftId, c) => syncChapterWords(c));
}

/** Parse a project file picked from disk. Throws on malformed/unrecognized files. */
export async function readProjectFile(file: File): Promise<StoryDoc> {
  const text = await file.text();
  return normalizeDoc(JSON.parse(text));
}

export function slugify(s: string): string {
  return s.trim().replace(/\s+/g, "-").toLowerCase() || "story";
}
