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
import { payloadStoreAvailable, staleKeys } from "@/store/idb";
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
import type { PersistStorage } from "zustand/middleware";

/**
 * StorageAdapter — the single seam between Estoria and where stories live.
 *
 * v1 ships a LocalStorageAdapter (auto-save to the browser). Growing into a
 * cloud backend later means writing another adapter (e.g. GoogleDriveStorage-
 * Adapter, see docs/SPECS.md §8) against this same interface and swapping
 * `activeAdapter` — no UI or store changes required. Both reads and writes go
 * through the adapter; nothing else touches the persisted copy.
 */
export interface StorageAdapter {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
  /** For multi-document support later. */
  list?(): Promise<string[]>;
}

/** Where the persisted store lives. Must match the persist `name` in useStore. */
const STORAGE_KEY = "estoria:store:v1";
/** Legacy duplicate copy once written by the old double-write shim. */
const LEGACY_KEY = "estoria:doc:v1";
/** Where a blob we could not parse is set aside instead of being overwritten. */
const UNREADABLE_KEY = "estoria:unreadable";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private key: string = STORAGE_KEY) {}

  /**
   * Failures propagate, deliberately. Returning `null` for them made "there is
   * nothing stored" and "we could not read what is stored" the same answer, and
   * the app's response to the first is to show the first-launch screen, whose
   * buttons overwrite the second. `null` now means only ever *absent*.
   */
  async load(): Promise<string | null> {
    return localStorage.getItem(this.key);
  }

  async save(serialized: string): Promise<void> {
    // Quota / private-mode failures propagate so the UI can surface them —
    // silently swallowing them here left the footer claiming "saved" while
    // nothing was being written.
    localStorage.setItem(this.key, serialized);
  }
}

/** The adapter the store auto-saves through. Swap this to change backends. */
export const activeAdapter: StorageAdapter = new LocalStorageAdapter();

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
 */
export type LoadFailure =
  | { code: "unavailable"; detail: string }
  | { code: "unreadable"; savedAs: string | null }
  | { code: "prose-unreachable"; detail: string };

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
   * Which write failed. The map goes to localStorage, where a failure is nearly
   * always the quota; prose and pictures go to IndexedDB, where it is not — and
   * telling a writer their storage is full when it isn't sends them to delete
   * things they did not need to. Prose and pictures are told apart because the
   * writer's next move differs: words that did not land are gone if they walk
   * away, a picture that did not land is a file they can pick again. `locked`
   * is none of these: nothing was attempted, because the load never established
   * what is already stored (see `writesArmed`).
   */
  reason?: "storage" | "prose" | "images" | "locked";
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
 * Auto-save, in two streams.
 *
 * zustand persist calls `setItem` on *every* state change, so this holds the
 * latest snapshot and writes once things go quiet. **What is deferred is the
 * serialize, not just the write** — the old shim took an already-stringified
 * value, so `JSON.stringify` over the whole store ran per keystroke and the
 * debounce discarded all but the last result. Now `setItem` costs one
 * assignment and the work happens on the timer.
 *
 * The map goes to localStorage on a 500ms trailing timer; **the payloads go to
 * IndexedDB on a much shorter one**, because prose is the thing being typed and
 * the window between a keystroke and it reaching disk is the window in which it
 * can be lost. See `store/prose.ts` for the manuscript split and the crash pad,
 * and `store/images.ts` for the pictures — which ride the same timer and, for
 * the reason `flushImages` gives, deliberately have no pad.
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
/**
 * Set when a payload write fails, cleared when one succeeds.
 *
 * Without these the footer lies: the map write and the payload writes are
 * separate, the map is much more likely to succeed, and its "saved" would paint
 * straight over a payload failure a second later. Silent save failure is the
 * exact bug SPECS §9 item 2 exists to have fixed, and splitting the write up is
 * a fresh chance to reintroduce it.
 *
 * They are two flags rather than one because they say different things to the
 * writer: prose that did not land is words they just typed, pictures that did
 * not land is a file they can pick again.
 */
let proseFailed = false;
let imagesFailed = false;

interface Split {
  src: Stored;
  stripped: Stored;
  prose: Map<string, string>;
  images: Map<string, string>;
  projectIds: Set<string>;
}
let splitCache: Split | null = null;

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
    };
    return splitCache;
  }

  const prose = new Map<string, string>();
  const images = new Map<string, string>();
  const projectIds = new Set<string>();
  const take = (d: StoryDoc): StoryDoc => {
    const withoutProse = splitProse(d);
    const withoutImages = splitImages(withoutProse.doc);
    projectIds.add(d.id);
    for (const [k, v] of withoutProse.prose) prose.set(k, v);
    for (const [k, v] of withoutImages.images) images.set(k, v);
    return withoutImages.doc;
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

  splitCache = { src: value, stripped, prose, images, projectIds };
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
    .save(value)
    .then(() => {
      // Only the map landed. Saying "saved" while a payload write is failing
      // would be the more comforting lie and the more expensive one.
      if (proseFailed || imagesFailed) return;
      setSaveStatus({ state: "saved", savedAt: Date.now() });
    })
    .catch(() => setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "storage" }));
}

/** Everything, now. Payloads before the map, so the pad is written either way. */
function flushSave(): void {
  flushPayloads();
  flushMap();
}

if (typeof window !== "undefined") {
  // `LocalStorageAdapter.save` and the prose pad both run synchronously up to
  // their (absent) first await, so a flush here still lands before the page
  // goes away. The IndexedDB write will not finish — the pad is what covers it.
  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}

/** Force everything out now — used on blur and when leaving a chapter. */
export function flushNow(): void {
  flushSave();
}

/**
 * Storage for zustand's persist middleware, in object form rather than through
 * `createJSONStorage`: owning the serialization is what lets the prose be
 * lifted out *before* `JSON.stringify` ever sees it.
 */
export const zustandStorage: PersistStorage<PersistedShape> = {
  getItem: async (name: string) => {
    void name; // the adapter owns its key; see STORAGE_KEY
    try {
      // One-time cleanup: reclaim the quota eaten by the old duplicate copy.
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }

    // Every `return null` below hands the store its defaults — the sample story
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

    // Settled once, up front, so every path below — including the failures,
    // which the reader may still choose to write over — agrees on where the
    // payloads go. A browser opening Estoria for the first time would otherwise
    // keep prose and pictures inline until its next reload.
    payloadsEnabled = await payloadStoreAvailable();

    let raw: string | null;
    try {
      raw = await activeAdapter.load();
    } catch (e) {
      return fail({ code: "unavailable", detail: e instanceof Error ? e.message : String(e) });
    }

    // Genuinely nothing stored: a first launch, and the one case that may write.
    if (!raw) return ready(null);

    let parsed: Stored;
    try {
      parsed = JSON.parse(raw) as Stored;
    } catch {
      // Unreadable. Keep a copy before anything else touches this key — it is
      // the only chance anyone has of getting the text back out by hand, and it
      // costs one write on a path that should never run.
      const savedAs = `${UNREADABLE_KEY}:${Date.now()}`;
      let kept: string | null = savedAs;
      try {
        localStorage.setItem(savedAs, raw);
      } catch {
        kept = null; // no room to keep it, and no way to read it
      }
      return fail({ code: "unreadable", savedAs: kept });
    }

    // Written with its payloads in IndexedDB? Then IndexedDB is not optional
    // for this document, whatever it is for the browser. `proseExternal` is the
    // pre-rename spelling and means the same thing for the prose it described.
    const external = parsed?.payloadsExternal === true || parsed?.proseExternal === true;

    if (!parsed?.state?.doc) return ready(parsed ?? null);

    if (!payloadsEnabled) {
      if (external) {
        return fail({
          code: "prose-unreachable",
          detail: "This browser's database for manuscripts and pictures could not be opened.",
        });
      }
      return ready(parsed); // everything is inline here; nothing is missing
    }

    let stored: Map<string, string>;
    let storedImages: Map<string, string>;
    try {
      [stored, storedImages] = await Promise.all([loadAllProse(), loadAllImages()]);
    } catch (e) {
      payloadsEnabled = false;
      if (external) {
        return fail({
          code: "prose-unreachable",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
      return ready(parsed);
    }
    // What IndexedDB holds, recorded before the pad goes over the top — so a
    // pad entry that never reached IndexedDB reads as dirty and is written.
    lastProse = new Map(stored);
    lastImages = new Map(storedImages);
    const merged = new Map(stored);
    for (const [k, v] of Object.entries(readPad())) merged.set(k, v);

    // Documents written before either split still carry their prose and their
    // pictures inline; both survive here untouched and move to IndexedDB on the
    // next save. That is the whole migration.
    const state = parsed.state;
    const rejoin = (d: StoryDoc): StoryDoc => mergeImages(mergeProse(d, merged), storedImages);
    const stash: Record<string, StoryDoc> = {};
    for (const [id, d] of Object.entries(state.projectStash ?? {})) stash[id] = rejoin(d);
    return ready({
      ...parsed,
      state: {
        ...state,
        doc: rejoin(state.doc),
        ...(state.projectStash ? { projectStash: stash } : {}),
      },
    });
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
