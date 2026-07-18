import {
  MAIN_DRAFT_ID,
  SCHEMA_VERSION,
  type Asset,
  type BookData,
  type Chapter,
  type ChapterLink,
  type DraftVersion,
  type PinnedRef,
  type RefKind,
  type StoryDoc,
  type VersionData,
} from "@/types";

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

/**
 * Auto-save is debounced: zustand persist calls setItem on *every* state
 * change (each keystroke re-serializes the whole store, images included), so
 * we hold the latest snapshot and write once things go quiet. The pending
 * snapshot is flushed synchronously on unload/hide so nothing is lost.
 */
const SAVE_DEBOUNCE_MS = 500;
let pendingSave: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function flushSave(): void {
  if (saveTimer != null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSave == null) return;
  const value = pendingSave;
  pendingSave = null;
  void activeAdapter
    .save(value)
    .then(() => setSaveStatus({ state: "saved", savedAt: Date.now() }))
    .catch(() => setSaveStatus({ state: "error", savedAt: saveStatus.savedAt }));
}

if (typeof window !== "undefined") {
  // LocalStorageAdapter.save runs synchronously up to its (absent) first
  // await, so a flush here still lands before the page goes away.
  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}

/**
 * Storage shim for zustand's persist middleware. Reads and writes go through
 * `activeAdapter` (async reads are supported by persist), so swapping the
 * backend never requires touching the store.
 */
export const zustandStorage = {
  getItem: (name: string): Promise<string | null> => {
    // `name` is the persist key; the adapter owns its own key (they match —
    // see STORAGE_KEY). Kept for the Web-Storage-shaped contract.
    void name;
    try {
      // One-time cleanup: reclaim the quota eaten by the old duplicate copy.
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
    return activeAdapter.load();
  },
  setItem: (name: string, value: string): void => {
    void name;
    pendingSave = value;
    if (saveStatus.state !== "saving") setSaveStatus({ ...saveStatus, state: "saving" });
    if (saveTimer != null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  },
  removeItem: (name: string): void => {
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
  const minted = new Map<string, string>(); // `${refId} ${content}` -> assetId

  const contentKey = (r: { kind?: RefKind; label?: string; body?: string; src?: string }) =>
    JSON.stringify([r.kind === "IMAGE" ? "IMAGE" : "NOTE", r.label ?? "", r.body ?? "", r.src ?? ""]);

  const mint = (r: LegacyRef, refId: string): string => {
    const key = `${refId} ${contentKey(r)}`;
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
    bookData[id] = { ...bBoard, drafts: bDrafts, activeDraftId: bActive };
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
    characters: Array.isArray(d.characters) ? d.characters : [],
    world: Array.isArray(d.world) ? d.world : [],
    assets: Array.isArray(d.assets) ? d.assets : [],
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
