import {
  MAIN_DRAFT_ID,
  SCHEMA_VERSION,
  type Asset,
  type BookData,
  type Chapter,
  type ChapterLink,
  type Character,
  type DraftVersion,
  type PinnedRef,
  type RefKind,
  type StoryDoc,
  type TodoItem,
  type VersionData,
  type WorldEntry,
} from "@/types";
import { resolveMainDraftId } from "@/lib/drafts";
import {
  clearPad,
  loadAllProse,
  mergeProse,
  proseStoreAvailable,
  readPad,
  splitProse,
  staleKeys,
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

  async load(): Promise<string | null> {
    try {
      return localStorage.getItem(this.key);
    } catch {
      return null;
    }
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

// ---- Save status (surfaced in the Footer) -----------------------------------

export interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
  /** Epoch ms of the last successful save (0 = none this session). */
  savedAt: number;
  /**
   * Which write failed. The map goes to localStorage, where a failure is nearly
   * always the quota; prose goes to IndexedDB, where it is not — and telling a
   * writer their storage is full when it isn't sends them to delete things they
   * did not need to.
   */
  reason?: "storage" | "prose";
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

/** What `partialize` hands us. Only the two fields carrying prose are named. */
export interface PersistedShape {
  doc: StoryDoc;
  projectStash?: Record<string, StoryDoc>;
  /** The prefs `partialize` also persists; nothing here reads them. */
  [key: string]: unknown;
}
type Stored = { state: PersistedShape; version?: number };

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
 * The map goes to localStorage on a 500ms trailing timer; **prose goes to
 * IndexedDB on a much shorter one**, because prose is the thing being typed and
 * the window between a keystroke and it reaching disk is the window in which it
 * can be lost. See `store/prose.ts` for the split and the crash pad.
 */
const SAVE_DEBOUNCE_MS = 500;
const PROSE_DEBOUNCE_MS = 200;

let pending: Stored | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let proseTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Whether prose is being kept in IndexedDB. Decided once, on load. When it is
 * false — no IndexedDB, or a private mode that refuses to open one — every
 * manuscript simply stays in the localStorage blob exactly as before, quota
 * limits and all. Slower and smaller, but never lost.
 */
let proseEnabled = false;
/** What IndexedDB is believed to hold, so only changed chapters are written. */
let lastProse = new Map<string, string>();
/**
 * Set when a prose write fails, cleared when one succeeds.
 *
 * Without this the footer lies: the map write and the prose write are separate,
 * the map is much more likely to succeed, and its "saved" would paint straight
 * over the prose failure a second later. Silent save failure is the exact bug
 * SPECS §9 item 2 exists to have fixed, and splitting the write in two is a
 * fresh chance to reintroduce it.
 */
let proseFailed = false;

interface Split {
  src: Stored;
  stripped: Stored;
  prose: Map<string, string>;
  projectIds: Set<string>;
}
let splitCache: Split | null = null;

/** Lift the prose out of the active project and every stashed one. */
function currentSplit(): Split | null {
  if (!pending) return null;
  if (splitCache && splitCache.src === pending) return splitCache;

  const value = pending;
  if (!proseEnabled) {
    splitCache = { src: value, stripped: value, prose: new Map(), projectIds: new Set() };
    return splitCache;
  }

  const prose = new Map<string, string>();
  const projectIds = new Set<string>();
  const take = (d: StoryDoc): StoryDoc => {
    const out = splitProse(d);
    projectIds.add(d.id);
    for (const [k, v] of out.prose) prose.set(k, v);
    return out.doc;
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

  splitCache = { src: value, stripped, prose, projectIds };
  return splitCache;
}

/**
 * Write the changed manuscripts.
 *
 * Order matters and is the whole safety argument: the synchronous pad first,
 * then the asynchronous IndexedDB write, then the pad is cleared only for the
 * keys that actually landed. A tab closed anywhere in the middle loses nothing.
 */
function flushProse(): void {
  if (proseTimer != null) {
    clearTimeout(proseTimer);
    proseTimer = null;
  }
  const split = currentSplit();
  if (!split || !proseEnabled) return;

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

function flushMap(): void {
  if (saveTimer != null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const split = currentSplit();
  if (!split) return;
  pending = null;
  splitCache = null;
  const value = JSON.stringify(split.stripped);
  void activeAdapter
    .save(value)
    .then(() => {
      // Only the map landed. Saying "saved" while the prose write is failing
      // would be the more comforting lie and the more expensive one.
      if (proseFailed) return;
      setSaveStatus({ state: "saved", savedAt: Date.now() });
    })
    .catch(() => setSaveStatus({ state: "error", savedAt: saveStatus.savedAt, reason: "storage" }));
}

/** Everything, now. Prose before the map, so the pad is written either way. */
function flushSave(): void {
  flushProse();
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
    // Settled before the early returns below: a browser opening Estoria for the
    // first time has nothing to load, and would otherwise keep prose inline
    // until its next reload.
    proseEnabled = await proseStoreAvailable();

    const raw = await activeAdapter.load();
    if (!raw) return null;

    let parsed: Stored;
    try {
      parsed = JSON.parse(raw) as Stored;
    } catch {
      // Unreadable. Returning null starts the app on a fresh document, which
      // then saves straight over this — so keep a copy first. It is the only
      // chance anyone has of getting the text back out by hand, and it costs
      // one write on a path that should never run.
      try {
        localStorage.setItem(`${UNREADABLE_KEY}:${Date.now()}`, raw);
      } catch {
        // Nothing left to do: no room to keep it, and no way to read it.
      }
      return null;
    }
    if (!parsed?.state?.doc || !proseEnabled) return parsed ?? null;

    let stored: Map<string, string>;
    try {
      stored = await loadAllProse();
    } catch {
      proseEnabled = false;
      return parsed;
    }
    // What IndexedDB holds, recorded before the pad goes over the top — so a
    // pad entry that never reached IndexedDB reads as dirty and is written.
    lastProse = new Map(stored);
    const merged = new Map(stored);
    for (const [k, v] of Object.entries(readPad())) merged.set(k, v);

    // Documents written before this split still carry their prose inline; it
    // survives here untouched and moves to IndexedDB on the next save. That is
    // the whole migration.
    const state = parsed.state;
    const stash: Record<string, StoryDoc> = {};
    for (const [id, d] of Object.entries(state.projectStash ?? {})) stash[id] = mergeProse(d, merged);
    return {
      ...parsed,
      state: {
        ...state,
        doc: mergeProse(state.doc, merged),
        ...(state.projectStash ? { projectStash: stash } : {}),
      },
    };
  },

  setItem: (name: string, value: Stored) => {
    void name;
    // One assignment. Everything expensive waits for the timers below.
    pending = value;
    if (saveStatus.state !== "saving") setSaveStatus({ ...saveStatus, state: "saving" });
    if (proseTimer != null) clearTimeout(proseTimer);
    proseTimer = setTimeout(flushProse, PROSE_DEBOUNCE_MS);
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
      sceneLinks: Array.isArray(p.sceneLinks) ? p.sceneLinks.slice(0, scenes.length - 1) : [],
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

/** Parse a project file picked from disk. Throws on malformed/unrecognized files. */
export async function readProjectFile(file: File): Promise<StoryDoc> {
  const text = await file.text();
  return normalizeDoc(JSON.parse(text));
}

export function slugify(s: string): string {
  return s.trim().replace(/\s+/g, "-").toLowerCase() || "story";
}
