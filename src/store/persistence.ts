import { MAIN_DRAFT_ID, SCHEMA_VERSION, type Chapter, type StoryDoc } from "@/types";

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

/** Download the current story as a portable .estoria.json project file. */
export function downloadProjectFile(doc: StoryDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
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
 * Coerce a parsed project file into a complete, current-schema StoryDoc.
 * Older exports (pre-v3: no books/bookData/drafts) and hand-edited files get
 * every missing field defaulted instead of crashing the first component that
 * reads it. Throws if the input isn't recognizably an Estoria project.
 */
export function normalizeDoc(raw: unknown): StoryDoc {
  const d = raw as Partial<StoryDoc> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.chapters)) {
    throw new Error("Not a valid Estoria project file.");
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

  return {
    schemaVersion: SCHEMA_VERSION,
    id: typeof d.id === "string" && d.id ? d.id : `story-${Date.now().toString(36)}`,
    projectTitle: title,
    seriesMode: !!d.seriesMode,
    drafts,
    activeDraftId,
    characters: Array.isArray(d.characters) ? d.characters : [],
    world: Array.isArray(d.world) ? d.world : [],
    assets: Array.isArray(d.assets) ? d.assets : [],
    books,
    bookLinks: Array.isArray(d.bookLinks) ? d.bookLinks : [],
    activeBookId,
    chapters,
    links: Array.isArray(d.links) ? d.links : [],
    storyNotes: typeof d.storyNotes === "string" ? d.storyNotes : "",
    bookData: d.bookData && typeof d.bookData === "object" ? d.bookData : {},
  };
}

/** Parse a project file picked from disk. Throws on malformed/unrecognized files. */
export async function readProjectFile(file: File): Promise<StoryDoc> {
  const text = await file.text();
  return normalizeDoc(JSON.parse(text));
}

export function slugify(s: string): string {
  return s.trim().replace(/\s+/g, "-").toLowerCase() || "story";
}
