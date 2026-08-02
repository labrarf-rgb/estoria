import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  MAIN_DRAFT_ID,
  SCHEMA_VERSION,
  type Asset,
  type BookData,
  type Chapter,
  type Character,
  type ConnType,
  type RefKind,
  type StoryDoc,
  type Vec2,
  type WorldEntry,
} from "@/types";
import { activeVersionData, cloneVersionData, resolveMainDraftId, withMainDraft } from "@/lib/drafts";
import { removeAssetLinks } from "@/lib/refs";
import { deleteCharacterDoc, deleteWorldEntryDoc } from "@/lib/entities";
import { isCharacterEmpty, isWorldEntryEmpty, pruneEmptyEntries } from "@/lib/prune";
import { uid } from "@/lib/ids";
import { countWords } from "@/lib/manuscript";
import { sampleStory } from "@/data/sampleStory";
import { emptyStory } from "@/data/emptyStory";
import {
  autoArrange,
  bestColumns,
  bestBookColumns,
  bookAutoArrange,
  CARD_W,
  sceneAutoArrange,
  sceneColumnsForWidth,
  type Camera,
  type TimelineOrient,
  type TimelinePane,
} from "@/lib/layout";
import { TEMPLATES } from "@/lib/templates";
import { normalizeDoc, zustandStorage } from "@/store/persistence";
import type { RefView } from "@/components/ui/ViewToggle";

export type View = "board" | "timeline";
export type Theme = "light" | "dark";

/** Which level of the hierarchy is on screen: the series map or a book's board. */
export type Level = "series" | "book";

/** Collapsible sections of the chapter modal (Scene flow has its own sizing toggle). */
export type ChapterSection = "chars" | "world" | "notes" | "refs";

/** Expandable textarea surfaces whose tall/short state is remembered (global). */
export type TextareaKey = "storyNotes" | "chapterNotes" | "worldDesc" | "worldNotes";

interface UiState {
  theme: Theme;
  view: View;
  level: Level;
  timelineOrient: TimelineOrient;
  /**
   * What the timeline's pane shows (persisted). A **pane toggle, not a fourth
   * view**: the rail, its cards, the active ring and the two-way scroll sync are
   * identical either way, and only the contents of the pane change.
   */
  timelinePane: TimelinePane;
  zoom: number;
  panX: number;
  panY: number;
  arrangeN: number;
  /** Bumps on each series-map auto-arrange, so the map can re-fit its camera. */
  seriesArrangeN: number;
  /** Last reported board viewport size, used to size auto-arrange. */
  boardW: number;
  boardH: number;
  dragId: string | null;
  openCh: string | null;
  /**
   * Scene the chapter modal should land on when it opens — set by clicking a
   * scene in the timeline's pane, consumed and cleared by the modal. Transient
   * and NOT persisted: it is a one-shot navigation instruction, never document
   * content, so it stays out of `doc` and out of the file the Android app reads.
   */
  focusScene: { chapterId: string; index: number } | null;
  sceneArrangeN: number;
  newMenu: boolean;
  showChars: boolean;
  showWorld: boolean;
  showNotes: boolean;
  showExport: boolean;
  showTemplates: boolean;
  showImport: boolean;
  showSeries: boolean;
  showNewBook: boolean;
  showProjects: boolean;
  showBackups: boolean;
  showAbout: boolean;
  selChar: string | null;
  selWorld: string | null;
  selBook: string | null;
  /**
   * A blank character / world entry the user has opened but not yet typed into.
   * Transient and NOT persisted: it lives here rather than in `doc` precisely so
   * that an untouched record is never saved, exported or offered in a picker.
   * Committed into `doc` by the first keystroke; see `updateCharDraft`.
   */
  charDraft: Character | null;
  worldDraft: WorldEntry | null;
  /** Image data URL currently shown full-screen, or null. */
  lightbox: string | null;
  /** False until the user has chosen sample-vs-fresh on first launch. */
  onboarded: boolean;
  /** Per-section collapse state for the chapter modal (persisted, global). */
  chapterSectionsCollapsed: Record<ChapterSection, boolean>;
  /** Card-vs-list view for reference lists (persisted, global across surfaces). */
  refView: RefView;
  /** Tall/short state per expandable-textarea surface (persisted, global). */
  textareaExpanded: Record<TextareaKey, boolean>;
  /** Chapter-modal scene-flow canvas size (persisted). */
  sceneFlowExpanded: boolean;
  /**
   * Which of the three manuscript states the chapter modal is in (persisted).
   * A mode rather than a per-chapter setting: a planning session stays in
   * `min` and never looks at prose, a drafting session stays in `regular` or
   * `full` and gets there without a click per chapter.
   */
  manuscriptState: ManuscriptState;
  /**
   * The prose as it was before the last reconciliation, for a single undo.
   * `previous` is `undefined` when the chapter had never been written in — that
   * is a real state to go back to, and pulling text in from another version is
   * exactly when someone wants it back.
   */
  manuscriptUndo: { chapterId: string; previous: string | undefined; label: string } | null;
  /**
   * Right-hand panel size (Characters / World / Notes), persisted and shared by
   * all three. `false` = the 460px drawer, which leaves the board beside it live
   * (no scrim, so you can pan, drag and open chapters while it's open); `true` =
   * full screen, covering the canvas.
   */
  panelExpanded: boolean;
}

/** Minimized / Regular / Full screen — see docs/SPECS.md §4. */
export type ManuscriptState = "min" | "regular" | "full";

/** A pending confirmation prompt (e.g. before a destructive delete). */
export interface ConfirmRequest {
  message: string;
  detail?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

/** Lightweight descriptor for the project library list. */
export interface ProjectMeta {
  id: string;
  title: string;
  isSeries: boolean;
  books: number;
  chapters: number;
}

interface StoreState extends UiState {
  doc: StoryDoc;
  /** Full docs for inactive projects, keyed by StoryDoc.id. */
  projectStash: Record<string, StoryDoc>;

  // ---- camera ----
  setCamera: (cam: Partial<Camera>) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // ---- project ----
  setProjectTitle: (title: string) => void;
  /** Author name, used only by the standard-manuscript-format export. */
  setAuthor: (author: string) => void;
  listProjects: () => ProjectMeta[];
  switchProject: (id: string) => void;
  newProject: (opts: { series: boolean; keepCurrent: boolean }) => void;
  openDoc: (doc: StoryDoc) => void;
  deleteProject: (id: string) => void;
  mergeProjectIntoSeries: (sourceId: string, targetId: string) => void;

  // ---- confirmation ----
  confirm: ConfirmRequest | null;
  askConfirm: (req: ConfirmRequest) => void;
  closeConfirm: () => void;

  // ---- chapters ----
  moveChapter: (id: string, x: number, y: number) => void;
  reorderChapter: (id: string, targetId: string, after: boolean) => void;
  addChapter: () => void;
  deleteChapter: (id: string) => void;
  autoArrangeBoard: () => void;
  setBoardSize: (w: number, h: number) => void;
  setChapterAct: (id: string, act: number) => void;
  bumpChapterAct: (id: string, delta: number) => void;
  patchChapter: (id: string, patch: Partial<Chapter>) => void;
  editChapterText: (id: string, patch: { title?: string; summary?: string }) => void;
  toggleChapterChar: (id: string, charId: string) => void;
  toggleChapterWorld: (id: string, worldId: string) => void;

  // ---- scenes ----
  addScene: (chId: string, cols?: number) => void;
  insertScene: (chId: string, atIdx: number, cols?: number) => void;
  updateScene: (chId: string, idx: number, text: string) => void;
  deleteScene: (chId: string, idx: number) => void;
  reorderScene: (chId: string, fromIdx: number, toIdx: number, cols?: number) => void;
  /** Move the given scene indices out of one chapter into another, inserted (in
   *  order) at `atIdx` in the destination's scene list (defaults to the end). */
  moveScenesToChapter: (
    fromChId: string,
    toChId: string,
    indices: number[],
    atIdx?: number,
    cols?: number
  ) => void;
  cycleSceneLink: (chId: string, idx: number) => void;
  arrangeScenes: (chId: string, reset?: boolean, cols?: number) => void;

  // ---- manuscript (chapter prose) ----
  /** Write a chapter's prose. The writer's own keystrokes go through here. */
  setManuscript: (chId: string, text: string) => void;
  /** Refresh `words` from the prose. Debounced by its caller, not by itself. */
  recomputeWords: (chId: string) => void;
  undoManuscript: () => void;
  setManuscriptState: (state: ManuscriptState) => void;

  // ---- chapter refs (pure links into the shared asset pool) ----
  addChapterRef: (chId: string, kind: RefKind, refId?: string) => void;
  deleteChapterRef: (chId: string, refId: string) => void;
  /** Content edit on a pin, written through to the asset it links (see impl). */
  updateChapterRefAsset: (chId: string, refId: string, patch: Partial<Asset>) => void;
  /** Move a pin within this chapter's order — independent of library order. */
  reorderChapterRef: (chId: string, refId: string, toIdx: number) => void;
  linkAssetToChapter: (chId: string, assetId: string) => void;

  // ---- notes ----
  setStoryNotes: (notes: string) => void;

  // ---- templates / import ----
  applyTemplate: (tplId: string, mode: "insert" | "replace") => void;
  replaceDoc: (doc: StoryDoc) => void;

  // ---- books / series ----
  toggleSeriesMode: () => void;
  makeSeries: () => void;
  switchBook: (id: string) => void;
  enterBook: (id: string) => void;
  goToSeries: () => void;
  setLevel: (level: Level) => void;
  addBook: () => void;
  updateBook: (id: string, patch: Partial<StoryDoc["books"][number]>) => void;
  deleteBook: (id: string) => void;
  moveBook: (id: string, x: number, y: number) => void;
  reorderBook: (id: string, targetId: string, after: boolean) => void;
  autoArrangeSeries: () => void;
  addBookLink: (fromId: string, toId: string) => void;
  updateBookLink: (id: string, label: string) => void;
  deleteBookLink: (id: string) => void;

  // ---- characters ----
  // "+ Add character" starts a DRAFT — a blank card that isn't in the document.
  // The record is created by the first keystroke (`updateCharDraft`), so nothing
  // is ever saved, listed or castable until it has content.
  startCharDraft: () => void;
  updateCharDraft: (patch: Partial<Character>) => void;
  discardCharDraft: () => void;
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;
  /** Retire from the roster, keeping every casting. See the archive rule in `types.ts`. */
  archiveCharacter: (id: string) => void;
  unarchiveCharacter: (id: string) => void;

  // ---- world ----
  startWorldDraft: () => void;
  updateWorldDraft: (patch: Partial<WorldEntry>) => void;
  discardWorldDraft: () => void;
  updateWorldEntry: (id: string, patch: Partial<WorldEntry>) => void;
  deleteWorldEntry: (id: string) => void;
  /** Retire from the world list, keeping every chapter reference. */
  archiveWorldEntry: (id: string) => void;
  unarchiveWorldEntry: (id: string) => void;
  /** `refId` lets the caller pre-assign the link id it already rendered a draft under. */
  addWorldRef: (wId: string, kind: RefKind, refId?: string) => void;
  deleteWorldRef: (wId: string, refId: string) => void;
  updateWorldRefAsset: (wId: string, refId: string, patch: Partial<Asset>) => void;
  reorderWorldRef: (wId: string, refId: string, toIdx: number) => void;
  linkAssetToWorld: (wId: string, assetId: string) => void;

  // ---- shared assets ----
  addAsset: (kind: RefKind, id?: string) => string;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  /** Move an asset within the library order; `toIdx` counts non-archived assets. */
  reorderAsset: (id: string, toIdx: number) => void;
  /** Retire from the library, keeping every pin. Reversible via `unarchiveAsset`. */
  archiveAsset: (id: string) => void;
  unarchiveAsset: (id: string) => void;

  // ---- drafts / versions ----
  addDraft: (name?: string, opts?: { copyProse?: boolean }) => void;
  /**
   * Copy one chapter's prose in from another version — the way back out of a
   * fork you are abandoning. Not a merge: it replaces, behind a confirm, with
   * one undo.
   */
  pullManuscriptFrom: (chId: string, fromDraftId: string) => void;
  setActiveDraft: (id: string) => void;
  renameDraft: (id: string, name: string) => void;
  deleteDraft: (id: string) => void;
  /** Move the "main"/canonical marker to another version of the active book. */
  setMainDraft: (id: string) => void;

  // ---- ui ----
  toggleTheme: () => void;
  setView: (v: View) => void;
  setOrient: (o: TimelineOrient) => void;
  setTimelinePane: (p: TimelinePane) => void;
  setDragId: (id: string | null) => void;
  openChapter: (id: string) => void;
  openChapterAtScene: (id: string, index: number) => void;
  clearFocusScene: () => void;
  /**
   * Open a chapter that may live in another book or version — the "jump to where
   * this note is pinned" path. Switches book/version through the normal stashing
   * actions first, closing any open panel on the way.
   */
  jumpToChapter: (bookId: string, draftId: string, chapterId: string) => void;
  /** Open the World panel with one entry expanded (the world-pin equivalent). */
  jumpToWorldEntry: (worldId: string) => void;
  closeChapter: () => void;
  toggleNewMenu: () => void;
  closeNewMenu: () => void;
  setPanel: (panel: PanelKey, open: boolean) => void;
  toggleChapterSection: (section: ChapterSection) => void;
  setRefView: (view: RefView) => void;
  toggleTextarea: (key: TextareaKey) => void;
  setSceneFlowExpanded: (expanded: boolean) => void;
  setPanelExpanded: (expanded: boolean) => void;
  selectChar: (id: string | null) => void;
  selectWorld: (id: string | null) => void;
  selectBook: (id: string | null) => void;
  openLightbox: (src: string) => void;
  closeLightbox: () => void;

  // ---- onboarding ----
  useSample: () => void;
  startFresh: () => void;
}

export type PanelKey =
  | "showChars"
  | "showWorld"
  | "showNotes"
  | "showExport"
  | "showTemplates"
  | "showImport"
  | "showSeries"
  | "showNewBook"
  | "showProjects"
  | "showBackups"
  | "showAbout";

const ZOOM_MIN = 0.34;
const ZOOM_MAX = 1.8;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const CHAR_PALETTE = [
  "oklch(0.60 0.12 145)",
  "oklch(0.58 0.13 255)",
  "oklch(0.62 0.13 20)",
  "oklch(0.60 0.12 325)",
  "oklch(0.60 0.11 100)",
];

/** A fresh, contentless asset of the given kind (a to-do starts with no lines). */
const blankAsset = (id: string, kind: RefKind): Asset => ({
  id,
  kind,
  label: "",
  ...(kind === "NOTE" ? { body: "" } : {}),
  ...(kind === "TODO" ? { items: [] } : {}),
});

/** Move the item with `id` to `toIdx`, clamped. Returns the same array if it can't. */
const moveById = <T extends { id: string }>(arr: T[], id: string, toIdx: number): T[] => {
  const from = arr.findIndex((x) => x.id === id);
  if (from === -1) return arr;
  const to = Math.max(0, Math.min(Math.floor(toIdx), arr.length - 1));
  if (to === from) return arr;
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const dedupeById = <T extends { id: string }>(arr: T[]): T[] => {
  const seen = new Set<string>();
  return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

/**
 * Flip the archive flag on one record of a roster (characters, world, assets).
 * Restoring *removes* the key rather than writing `archived: false`, so a
 * restored record is byte-identical to one that was never archived — otherwise
 * archive-then-restore would leave a diff behind and dirty the sync fingerprint
 * for a round trip that changed nothing.
 */
const setArchived = <T extends { id: string; archived?: boolean }>(
  arr: T[],
  id: string,
  archived: boolean
): T[] =>
  arr.map((x) => {
    if (x.id !== id) return x;
    if (archived) return { ...x, archived: true };
    const { archived: _drop, ...rest } = x;
    return rest as T;
  });

/**
 * The three right-hand panels: they hold the "+ Add …" buttons that open a blank
 * card the user may never fill in, and only one of them is ever open at a time.
 */
const EDITING_PANEL_LIST = ["showChars", "showWorld", "showNotes"] as const satisfies readonly PanelKey[];
const EDITING_PANELS = new Set<PanelKey>(EDITING_PANEL_LIST);

/**
 * State patch that sweeps records with no content left in them (see
 * `lib/prune.ts`). Returns `null` when there's nothing to prune, so a close that
 * changes nothing leaves the doc reference — and with it the autosave and the
 * sync fingerprint — untouched.
 */
const prunedState = (s: StoreState): Partial<StoreState> | null => {
  const doc = pruneEmptyEntries(s.doc);
  if (doc === s.doc) return null;
  return {
    doc,
    // A pruned record must not stay selected — the panel would reopen on nothing.
    selChar: doc.characters.some((c) => c.id === s.selChar) ? s.selChar : null,
    selWorld: doc.world.some((w) => w.id === s.selWorld) ? s.selWorld : null,
  };
};

/** Snapshot the active book's full board (all versions) for stashing in `bookData`. */
const stashActiveBook = (doc: StoryDoc): BookData => ({
  chapters: doc.chapters,
  links: doc.links,
  storyNotes: doc.storyNotes,
  drafts: doc.drafts,
  activeDraftId: doc.activeDraftId,
  mainDraftId: doc.mainDraftId,
  draftData: doc.draftData,
});

const emptyBookData = (): BookData => ({
  chapters: [],
  links: [],
  storyNotes: "",
  drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
  activeDraftId: MAIN_DRAFT_ID,
  mainDraftId: MAIN_DRAFT_ID,
  draftData: {},
});

/** Renumber chapters sequentially (1..n) after add/delete. */
/** Estimated visible scene-canvas width for the chapter modal in the given
 *  mode — used to lay out chapters whose modal isn't (or isn't yet) open,
 *  e.g. on open and for a scene-move destination. */
const sceneBoxWidthEstimate = (expanded: boolean) => {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1500;
  const modalW = expanded ? Math.min(1500, vw * 0.96) : Math.min(980, vw);
  return modalW - 44;
};

/**
 * Scene positions for BOTH canvas sizes at once.
 *
 * The scene flow has an expanded and a collapsed size that fit different column
 * counts, and each remembers its own layout (`scenePos` / `scenePosCompact`) so
 * toggling between them no longer has to re-arrange — which is what used to
 * throw the arrangement away. Every structural change (add/insert/delete/
 * reorder/move) therefore lays out both: the mode on screen with the column
 * count the caller measured, the other one with an estimate for its width.
 */
const scenePosBoth = (
  scenes: string[],
  expanded: boolean,
  cols?: number
): Pick<Chapter, "scenePos" | "scenePosCompact"> => {
  const otherCols = sceneColumnsForWidth(scenes.length, sceneBoxWidthEstimate(!expanded));
  const active = sceneAutoArrange(scenes, 0, cols);
  const other = sceneAutoArrange(scenes, 0, otherCols);
  return expanded
    ? { scenePos: active, scenePosCompact: other }
    : { scenePos: other, scenePosCompact: active };
};

/** The positions field the given canvas size reads and writes. */
const scenePosKey = (expanded: boolean): "scenePos" | "scenePosCompact" =>
  expanded ? "scenePos" : "scenePosCompact";

const renumber = (chapters: Chapter[]): Chapter[] =>
  chapters.map((c, i) => ({ ...c, num: i + 1 }));

const initialUi: UiState = {
  theme: "light",
  view: "board",
  level: "book",
  timelineOrient: "vertical",
  timelinePane: "scenes",
  zoom: 0.66,
  panX: 34,
  panY: 28,
  arrangeN: 0,
  seriesArrangeN: 0,
  boardW: 0,
  boardH: 0,
  dragId: null,
  openCh: null,
  focusScene: null,
  sceneArrangeN: 0,
  newMenu: false,
  showChars: false,
  showWorld: false,
  showNotes: false,
  showExport: false,
  showTemplates: false,
  showImport: false,
  showSeries: false,
  showNewBook: false,
  showProjects: false,
  showBackups: false,
  showAbout: false,
  selChar: null,
  selWorld: null,
  selBook: null,
  charDraft: null,
  worldDraft: null,
  lightbox: null,
  onboarded: false,
  chapterSectionsCollapsed: { chars: false, world: false, notes: false, refs: false },
  refView: "list",
  textareaExpanded: { storyNotes: false, chapterNotes: false, worldDesc: false, worldNotes: false },
  sceneFlowExpanded: true,
  manuscriptState: "min",
  manuscriptUndo: null,
  panelExpanded: false,
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...initialUi,
      doc: sampleStory,
      projectStash: {},

      // ---- camera ----
      setCamera: (cam) => set((s) => ({ ...s, ...cam })),
      zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom * 1.15) })),
      zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom / 1.15) })),

      // ---- project ----
      setProjectTitle: (title) => set((s) => ({ doc: { ...s.doc, projectTitle: title } })),

      setAuthor: (author) =>
        set((s) => ({ doc: { ...s.doc, author: author.trim() ? author : undefined } })),

      listProjects: () => {
        const s = get();
        const metaOf = (d: StoryDoc): ProjectMeta => ({
          id: d.id,
          title: d.projectTitle || "Untitled",
          isSeries: d.seriesMode,
          books: d.books.length,
          chapters:
            d.chapters.length +
            Object.values(d.bookData || {}).reduce((a, b) => a + (b.chapters?.length ?? 0), 0),
        });
        return [metaOf(s.doc), ...Object.values(s.projectStash).map(metaOf)];
      },

      switchProject: (id) =>
        set((s) => {
          if (id === s.doc.id) return { showProjects: false } as Partial<StoreState>;
          const target = s.projectStash[id];
          if (!target) return s;
          const stash = { ...s.projectStash, [s.doc.id]: s.doc };
          delete stash[id];
          return {
            doc: target,
            projectStash: stash,
            level: target.seriesMode ? "series" : "book",
            view: "board",
            openCh: null,
            arrangeN: 0,
            showProjects: false,
          };
        }),

      newProject: ({ series, keepCurrent }) =>
        set((s) => {
          const fresh = emptyStory();
          if (series) {
            fresh.seriesMode = true;
          }
          const stash = { ...s.projectStash };
          if (keepCurrent) stash[s.doc.id] = s.doc;
          return {
            doc: fresh,
            projectStash: stash,
            onboarded: true,
            level: series ? "series" : "book",
            view: "board",
            openCh: null,
            showNewBook: false,
            showProjects: false,
            // Offer a way to begin the first book.
            showTemplates: !series,
          };
        }),

      openDoc: (incoming) =>
        set((s) => {
          // Stash the current project, then make the incoming one active.
          // Give it a fresh id if it would collide with an existing project.
          const stash = { ...s.projectStash, [s.doc.id]: s.doc };
          let id = incoming.id || uid("story");
          if (id === s.doc.id || stash[id]) id = uid("story");
          delete stash[id];
          const doc: StoryDoc = withMainDraft({ ...incoming, id, schemaVersion: SCHEMA_VERSION });
          return {
            doc,
            projectStash: stash,
            onboarded: true,
            level: doc.seriesMode ? ("series" as Level) : ("book" as Level),
            view: "board" as View,
            openCh: null,
            arrangeN: 0,
            showImport: false,
            showProjects: false,
            showNewBook: false,
          };
        }),

      deleteProject: (id) =>
        set((s) => {
          // Deleting the active project: fall back to any stashed one.
          if (id === s.doc.id) {
            const others = Object.values(s.projectStash);
            if (others.length === 0) return s; // never leave zero projects
            const [next, ...rest] = others;
            const stash: Record<string, StoryDoc> = {};
            rest.forEach((d) => (stash[d.id] = d));
            return {
              doc: next,
              projectStash: stash,
              level: next.seriesMode ? "series" : "book",
              view: "board",
              openCh: null,
            };
          }
          const stash = { ...s.projectStash };
          delete stash[id];
          return { projectStash: stash };
        }),

      mergeProjectIntoSeries: (sourceId, targetId) =>
        set((s) => {
          if (sourceId === targetId) return s;
          const getDoc = (id: string) => (id === s.doc.id ? s.doc : s.projectStash[id]);
          const source = getDoc(sourceId);
          const target = getDoc(targetId);
          if (!source || !target) return s;

          // Each source book + its board data (active book lives at the top level).
          const sourceBooks = source.books.map((b) => ({
            meta: b,
            data:
              b.id === source.activeBookId
                ? stashActiveBook(source)
                : source.bookData[b.id] ?? emptyBookData(),
          }));

          const newBookData = { ...target.bookData };
          const addedMetas = sourceBooks.map(({ meta, data }, i) => {
            const nid = uid("b");
            newBookData[nid] = {
              chapters: data.chapters,
              links: data.links,
              storyNotes: data.storyNotes,
              drafts: data.drafts ?? [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
              activeDraftId: data.activeDraftId ?? MAIN_DRAFT_ID,
              mainDraftId: resolveMainDraftId(data.drafts, data.mainDraftId),
              draftData: data.draftData ?? {},
            };
            return {
              ...meta,
              id: nid,
              subtitle: meta.subtitle || `Book ${target.books.length + i + 1}`,
            };
          });

          const mergedTarget: StoryDoc = {
            ...target,
            seriesMode: true,
            books: target.books.concat(addedMetas),
            bookData: newBookData,
            characters: dedupeById(target.characters.concat(source.characters)),
            world: dedupeById(target.world.concat(source.world)),
            assets: dedupeById(target.assets.concat(source.assets)),
          };

          const stash = { ...s.projectStash };
          delete stash[sourceId];
          delete stash[targetId];
          // Keep any other currently-active project in the library.
          if (s.doc.id !== sourceId && s.doc.id !== targetId) stash[s.doc.id] = s.doc;

          return {
            doc: mergedTarget,
            projectStash: stash,
            level: "series" as Level,
            view: "board" as View,
            openCh: null,
            showProjects: false,
          };
        }),

      // ---- confirmation ----
      confirm: null,
      askConfirm: (req) => set({ confirm: req }),
      closeConfirm: () => set({ confirm: null }),

      // ---- chapters ----
      moveChapter: (id, x, y) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => (c.id === id ? { ...c, x, y } : c)),
          },
        })),

      // Dropping a chapter card onto another reorders the underlying sequence
      // (num badges, timeline order). The connector chain is rebuilt to follow
      // the new order so the threads track the reorder instead of staying wired
      // to the old sequence and crossing over each other — chapter links are a
      // consecutive therefore-chain with no board UI to retype them, so a fresh
      // chain loses no user intent (any existing type on an unchanged adjacent
      // pair is carried over).
      reorderChapter: (id, targetId, after) =>
        set((s) => {
          const chapters = s.doc.chapters.slice();
          const fromIdx = chapters.findIndex((c) => c.id === id);
          if (fromIdx === -1) return s;
          const [moved] = chapters.splice(fromIdx, 1);
          let toIdx = chapters.findIndex((c) => c.id === targetId);
          if (toIdx === -1) toIdx = chapters.length;
          else if (after) toIdx += 1;
          chapters.splice(toIdx, 0, moved);
          const ordered = renumber(chapters);
          const prevType = new Map(s.doc.links.map((l) => [`${l.fromId}>${l.toId}`, l.type]));
          const links = ordered.slice(0, -1).map((c, i) => ({
            fromId: c.id,
            toId: ordered[i + 1].id,
            type: prevType.get(`${c.id}>${ordered[i + 1].id}`) ?? ("therefore" as const),
          }));
          return { doc: { ...s.doc, chapters: ordered, links } };
        }),

      addChapter: () =>
        set((s) => {
          const list = s.doc.chapters;
          const last = list[list.length - 1];
          const nc: Chapter = {
            id: uid("c"),
            num: list.length + 1,
            act: last ? last.act : 1,
            status: "idea",
            title: "",
            summary: "",
            words: 0,
            x: last ? last.x + CARD_W + 72 : 60,
            y: last ? last.y : 90,
            chars: [],
            scenes: [""],
            sceneLinks: [],
            refs: [],
          };
          const links = last
            ? s.doc.links.concat({ fromId: last.id, toId: nc.id, type: "therefore" })
            : s.doc.links;
          return { doc: { ...s.doc, chapters: list.concat(nc), links }, view: "board", arrangeN: 0 };
        }),

      deleteChapter: (id) =>
        set((s) => {
          const idx = s.doc.chapters.findIndex((c) => c.id === id);
          if (idx === -1) return s;
          const prev = s.doc.chapters[idx - 1];
          const next = s.doc.chapters[idx + 1];
          const chapters = renumber(s.doc.chapters.filter((c) => c.id !== id));
          let links = s.doc.links.filter((l) => l.fromId !== id && l.toId !== id);
          // Bridge the neighbors so deleting a middle chapter doesn't leave a
          // permanent gap in the therefore-chain; keep the incoming link's type.
          if (prev && next && !links.some((l) => l.fromId === prev.id && l.toId === next.id)) {
            const carried =
              s.doc.links.find((l) => l.fromId === prev.id && l.toId === id)?.type ?? "therefore";
            links = links.concat({ fromId: prev.id, toId: next.id, type: carried });
          }
          return {
            doc: { ...s.doc, chapters, links },
            openCh: s.openCh === id ? null : s.openCh,
          };
        }),

      autoArrangeBoard: () =>
        set((s) => {
          // Size the grid to the visible board so the result fills the space
          // (more columns on a wide screen) instead of a fixed 4-wide grid.
          const cols = bestColumns(s.doc.chapters.length, s.boardW, s.boardH);
          const { chapters, arrangeN } = autoArrange(s.doc.chapters, s.arrangeN, cols);
          return { doc: { ...s.doc, chapters }, arrangeN, view: "board" };
        }),

      setBoardSize: (w, h) => set({ boardW: w, boardH: h }),

      setChapterAct: (id, act) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === id ? { ...c, act: Math.max(1, Math.floor(act) || 1) } : c
            ),
          },
        })),

      bumpChapterAct: (id, delta) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === id ? { ...c, act: Math.max(1, (c.act || 1) + delta) } : c
            ),
          },
        })),

      patchChapter: (id, patch) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          },
        })),

      // Versions are standalone forks, so text edits always write the chapter
      // directly — only the active version's board is loaded.
      editChapterText: (id, patch) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          },
        })),

      toggleChapterChar: (id, charId) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== id) return c;
              const has = c.chars.includes(charId);
              return {
                ...c,
                chars: has ? c.chars.filter((x) => x !== charId) : c.chars.concat(charId),
              };
            }),
          },
        })),

      toggleChapterWorld: (id, worldId) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== id) return c;
              const cur = c.worldRefs ?? [];
              const has = cur.includes(worldId);
              return {
                ...c,
                worldRefs: has ? cur.filter((x) => x !== worldId) : cur.concat(worldId),
              };
            }),
          },
        })),

      // ---- scenes ----
      //
      // The four actions that change how many scenes a chapter has, or their
      // order, all have to answer to the prose. Two of them can keep it in step
      // by themselves, because opening an empty section moves no existing text
      // (`addScene`, `insertScene`); the two that cannot — `deleteScene` and
      // `reorderScene` — leave the prose alone and raise the drift bar instead.
      // See the "Drift bar" row in docs/SPECS.md §4 — the map never mutates
      // the manuscript.
      addScene: (chId, cols) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const scenes = c.scenes.concat("");
              const sceneLinks = c.scenes.length > 0 ? c.sceneLinks.concat("therefore") : c.sceneLinks;
              return {
                ...c,
                scenes,
                sceneLinks,
                ...scenePosBoth(scenes, s.sceneFlowExpanded, cols),
              };
            }),
          },
        })),

      insertScene: (chId, atIdx, cols) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const idx = Math.max(0, Math.min(atIdx, c.scenes.length));
              const scenes = c.scenes.slice();
              scenes.splice(idx, 0, "");
              const sceneLinks = c.sceneLinks.slice();
              if (scenes.length > 1) sceneLinks.splice(Math.min(idx, sceneLinks.length), 0, "therefore");
              return {
                ...c,
                scenes,
                sceneLinks,
                ...scenePosBoth(scenes, s.sceneFlowExpanded, cols),
              };
            }),
          },
        })),

      updateScene: (chId, idx, text) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const scenes = c.scenes.slice();
              scenes[idx] = text;
              return { ...c, scenes };
            }),
          },
        })),

      deleteScene: (chId, idx) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const scenes = c.scenes.filter((_, i) => i !== idx);
              // Both layouts drop the deleted slot, so neither goes out of step
              // with the scene list (a mismatch re-arranges on next open).
              const scenePos = (c.scenePos || []).filter((_, i) => i !== idx);
              const scenePosCompact = (c.scenePosCompact || []).filter((_, i) => i !== idx);
              const links = c.sceneLinks.slice();
              if (links.length) links.splice(Math.min(idx, links.length - 1), 1);
              return { ...c, scenes, scenePos, scenePosCompact, sceneLinks: links };
            }),
          },
        })),

      reorderScene: (chId, fromIdx, toIdx, cols) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId || fromIdx < 0 || fromIdx >= c.scenes.length) return c;
              const scenes = c.scenes.slice();
              const [moved] = scenes.splice(fromIdx, 1);
              const to = Math.max(0, Math.min(toIdx, scenes.length));
              scenes.splice(to, 0, moved);

              // Links are positional (the gap between adjacent scenes), so a
              // reorder drops the gap at the scene's old slot and opens a
              // fresh one at its new slot rather than trying to carry a
              // "meaning" along with the moved scene.
              const sceneLinks = c.sceneLinks.slice();
              if (sceneLinks.length) sceneLinks.splice(Math.min(fromIdx, sceneLinks.length - 1), 1);
              if (scenes.length > 1) sceneLinks.splice(Math.min(to, sceneLinks.length), 0, "therefore");

              return { ...c, scenes, sceneLinks, ...scenePosBoth(scenes, s.sceneFlowExpanded, cols) };
            }),
          },
        })),

      moveScenesToChapter: (fromChId, toChId, indices, atIdx, cols) =>
        set((s) => {
          if (fromChId === toChId || indices.length === 0) return {};
          const from = s.doc.chapters.find((c) => c.id === fromChId);
          const to = s.doc.chapters.find((c) => c.id === toChId);
          if (!from || !to) return {};

          // Take an ordered subset of a chapter's scenes, preserving each link
          // that joined two scenes still adjacent after the subset (collapsed
          // gaps default to "therefore").
          const subset = (scenes: string[], links: ConnType[], keep: number[]) => {
            const sorted = [...keep].sort((a, b) => a - b);
            const outLinks: ConnType[] = [];
            for (let j = 0; j < sorted.length - 1; j++) {
              const a = sorted[j];
              outLinks.push(sorted[j + 1] === a + 1 ? links[a] ?? "therefore" : "therefore");
            }
            return { scenes: sorted.map((i) => scenes[i]), sceneLinks: outLinks };
          };

          const moveSet = new Set(indices.filter((i) => i >= 0 && i < from.scenes.length));
          if (moveSet.size === 0) return {};
          const keepIdx = from.scenes.map((_, i) => i).filter((i) => !moveSet.has(i));
          const moveIdx = from.scenes.map((_, i) => i).filter((i) => moveSet.has(i));

          const remaining = subset(from.scenes, from.sceneLinks, keepIdx);
          const moved = subset(from.scenes, from.sceneLinks, moveIdx);

          // An emptied source keeps one blank placeholder scene — the same
          // state a freshly created chapter starts in. Chapters never drop
          // below one scene (delete enforces this too, and the markdown
          // importer backfills, so 0 scenes wouldn't round-trip).
          const srcScenes = remaining.scenes.length > 0 ? remaining.scenes : [""];
          const srcLinks = remaining.scenes.length > 0 ? remaining.sceneLinks : [];

          // Insert the moved block into the destination at `p`; anything the
          // insertion splits apart is re-joined with a neutral "therefore".
          const p = Math.max(0, Math.min(atIdx ?? to.scenes.length, to.scenes.length));
          const left = to.scenes.slice(0, p);
          const right = to.scenes.slice(p);
          const toScenes = left.concat(moved.scenes, right);
          const leftLinks = to.sceneLinks.slice(0, Math.max(0, p - 1));
          const rightLinks = to.sceneLinks.slice(p);
          const toLinks = ([] as ConnType[]).concat(
            leftLinks,
            left.length > 0 && moved.scenes.length > 0 ? (["therefore"] as ConnType[]) : [],
            moved.sceneLinks,
            right.length > 0 && moved.scenes.length > 0 ? (["therefore"] as ConnType[]) : [],
            rightLinks
          );

          return {
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) => {
                if (c.id === fromChId)
                  return {
                    ...c,
                    scenes: srcScenes,
                    sceneLinks: srcLinks,
                    ...scenePosBoth(srcScenes, s.sceneFlowExpanded, cols),
                  };
                if (c.id === toChId)
                  return {
                    ...c,
                    scenes: toScenes,
                    sceneLinks: toLinks,
                    // Width-fitted like openChapter, so the destination doesn't
                    // keep a cramped count-heuristic grid when later opened.
                    ...scenePosBoth(
                      toScenes,
                      s.sceneFlowExpanded,
                      sceneColumnsForWidth(toScenes.length, sceneBoxWidthEstimate(s.sceneFlowExpanded))
                    ),
                  };
                return c;
              }),
            },
          };
        }),

      cycleSceneLink: (chId, idx) =>
        set((s) => {
          const order: ConnType[] = ["therefore", "but", "and"];
          return {
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) => {
                if (c.id !== chId) return c;
                const links = c.sceneLinks.slice();
                links[idx] = order[(order.indexOf(links[idx]) + 1) % 3];
                return { ...c, sceneLinks: links };
              }),
            },
          };
        }),

      // Auto-arrange tidies the size you're looking at. The other size keeps its
      // own layout, so arranging the collapsed canvas can't disturb how the
      // expanded one was laid out (and vice versa).
      arrangeScenes: (chId, reset = false, cols) =>
        set((s) => {
          const n = reset ? 0 : s.sceneArrangeN;
          const key = scenePosKey(s.sceneFlowExpanded);
          return {
            sceneArrangeN: n + 1,
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === chId ? { ...c, [key]: sceneAutoArrange(c.scenes, n, cols) } : c
              ),
            },
          };
        }),

      // ---- manuscript (chapter prose) ----
      // Deliberately the plainest action in the store: prose is one string on
      // the chapter, written through the same persist path as everything else.
      // Versions get it for free — `cloneVersionData` is a `structuredClone`, so
      // a fork deep-copies the prose exactly as it deep-copies the scenes.
      setManuscript: (chId, text) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => (c.id === chId ? { ...c, manuscript: text } : c)),
          },
        })),

      /**
       * `words` as a cache of the manuscript.
       *
       * Two rules, both about not destroying a number the writer typed:
       *
       *  - **Never auto-zero.** Every book written before this feature has a
       *    hand-typed count and no manuscript, and a naive recompute would show
       *    an 80,000-word project as 0. So a count of zero is never written; it
       *    only ever moves when there is real prose to move it to. (The cost is
       *    that emptying a chapter freezes its last count, which is the safe
       *    side of that trade.)
       *  - **Promote, don't overwrite.** The first time real prose appears, the
       *    number already there was a *plan*, so it moves to `target` instead of
       *    being replaced. That is what turns the board into a progress reading
       *    rather than quietly redefining what the old number meant.
       */
      recomputeWords: (chId) =>
        set((s) => {
          const c = s.doc.chapters.find((x) => x.id === chId);
          if (!c || c.manuscript === undefined) return {};
          const n = countWords(c.manuscript);
          if (n === 0) return {};
          const promote = c.target === undefined && c.words > 0;
          if (n === c.words && !promote) return {};
          return {
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((x) =>
                x.id === chId ? { ...x, ...(promote ? { target: x.words } : {}), words: n } : x
              ),
            },
          };
        }),

      pullManuscriptFrom: (chId, fromDraftId) =>
        set((s) => {
          // Chapter ids survive a fork, so the same chapter is findable in every
          // version without any matching heuristic.
          const src = s.doc.draftData[fromDraftId]?.chapters.find((c) => c.id === chId);
          if (!src || src.manuscript === undefined) return {};
          const name = s.doc.drafts.find((d) => d.id === fromDraftId)?.name ?? "another version";
          return {
            manuscriptUndo: {
              chapterId: chId,
              previous: s.doc.chapters.find((c) => c.id === chId)?.manuscript,
              label: `This chapter's writing was pulled from ${name}.`,
            },
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === chId ? { ...c, manuscript: src.manuscript } : c
              ),
            },
          };
        }),

      undoManuscript: () =>
        set((s) => {
          const u = s.manuscriptUndo;
          if (!u) return {};
          return {
            manuscriptUndo: null,
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === u.chapterId ? { ...c, manuscript: u.previous } : c
              ),
            },
          };
        }),

      setManuscriptState: (state) => set({ manuscriptState: state }),

      // ---- chapter refs (pure links into the shared asset pool) ----
      // Adding a note/image creates a shared Asset first, then pins a link to it
      // — one pool of linkable content, no orphan per-chapter copies.
      addChapterRef: (chId, kind, refId) =>
        set((s) => {
          const assetId = uid("a");
          return {
            doc: {
              ...s.doc,
              assets: s.doc.assets.concat(blankAsset(assetId, kind)),
              chapters: s.doc.chapters.map((c) =>
                c.id === chId ? { ...c, refs: c.refs.concat({ id: refId ?? uid("r"), assetId }) } : c
              ),
            },
          };
        }),

      // Unlink only — the asset survives in the library.
      deleteChapterRef: (chId, refId) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === chId ? { ...c, refs: c.refs.filter((r) => r.id !== refId) } : c
            ),
          },
        })),

      /**
       * Edit the asset a chapter's pin links to, resolving `refId → assetId`
       * **inside** `set` — i.e. against current state.
       *
       * This has to be the store's job. A caller resolving the link from its own
       * render closure dropped keystrokes typed in the moments right after
       * "+ Note" / "+ To-do" committed a draft: the brand-new link doesn't exist
       * in the render those events were dispatched against, so the lookup missed
       * and the edit went nowhere.
       */
      updateChapterRefAsset: (chId, refId, patch) =>
        set((s) => {
          const link = s.doc.chapters.find((c) => c.id === chId)?.refs.find((r) => r.id === refId);
          if (!link) return s;
          return {
            doc: {
              ...s.doc,
              assets: s.doc.assets.map((a) => (a.id === link.assetId ? { ...a, ...patch } : a)),
            },
          };
        }),

      // A chapter's pin order is its own `refs` array, independent of the shared
      // library's order — the same note can sit first here and last there.
      reorderChapterRef: (chId, refId, toIdx) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === chId ? { ...c, refs: moveById(c.refs, refId, toIdx) } : c
            ),
          },
        })),

      linkAssetToChapter: (chId, assetId) =>
        set((s) => {
          if (!s.doc.assets.some((a) => a.id === assetId)) return s;
          return {
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) => {
                if (c.id !== chId) return c;
                if (c.refs.some((r) => r.assetId === assetId)) return c; // already linked
                return { ...c, refs: c.refs.concat({ id: uid("r"), assetId }) };
              }),
            },
          };
        }),

      // ---- notes ----
      setStoryNotes: (notes) => set((s) => ({ doc: { ...s.doc, storyNotes: notes } })),

      // ---- templates / import ----
      applyTemplate: (tplId, mode) =>
        set((s) => {
          const tpl = TEMPLATES.find((t) => t.id === tplId);
          if (!tpl) return s;
          const cols = 4;
          const gapX = 72;
          const gapY = 82;
          const m = 46;
          const base = mode === "replace" ? [] : s.doc.chapters.slice();
          const startNum = base.length;
          const made: Chapter[] = tpl.beats.map(([title, act, summary], i) => {
            const idx = startNum + i;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
              id: uid("c"),
              num: idx + 1,
              act,
              status: "idea",
              title,
              summary: summary ?? "",
              words: 0,
              x: m + col * (CARD_W + gapX),
              y: m + row * (142 + gapY),
              chars: [],
              scenes: [""],
              sceneLinks: [],
              refs: [],
            };
          });
          const chapters = base.concat(made);
          // Rebuild the chain but keep the type of any adjacency that already
          // existed — inserting a template must not reset but/and links.
          const prevType = new Map(s.doc.links.map((l) => [`${l.fromId}>${l.toId}`, l.type]));
          const links = chapters.slice(0, -1).map((c, i) => ({
            fromId: c.id,
            toId: chapters[i + 1].id,
            type: prevType.get(`${c.id}>${chapters[i + 1].id}`) ?? ("therefore" as const),
          }));
          return {
            doc: { ...s.doc, chapters, links },
            view: "board",
            arrangeN: 0,
            showTemplates: false,
            newMenu: false,
          };
        }),

      replaceDoc: (doc) =>
        set({
          doc: withMainDraft({ ...doc, schemaVersion: SCHEMA_VERSION }),
          view: "board",
          arrangeN: 0,
          openCh: null,
          showImport: false,
          showSeries: false,
        }),

      // ---- books / series ----
      toggleSeriesMode: () => set((s) => ({ doc: { ...s.doc, seriesMode: !s.doc.seriesMode } })),

      // Promote a standalone book to a series: the name the user gave the story
      // stays on the (now-first) book, and the series itself starts as "Untitled
      // Series" for them to rename.
      makeSeries: () =>
        set((s) => {
          if (s.doc.seriesMode) return s;
          const books = s.doc.books.map((b) =>
            b.id === s.doc.activeBookId ? { ...b, title: s.doc.projectTitle || b.title } : b
          );
          return { doc: { ...s.doc, seriesMode: true, projectTitle: "Untitled Series", books } };
        }),

      switchBook: (id) =>
        set((s) => {
          if (id === s.doc.activeBookId) return { showSeries: false };
          const stash = { ...s.doc.bookData, [s.doc.activeBookId]: stashActiveBook(s.doc) };
          const load = stash[id] ?? emptyBookData();
          const rest = { ...stash };
          delete rest[id];
          return {
            doc: {
              ...s.doc,
              activeBookId: id,
              chapters: load.chapters,
              links: load.links,
              storyNotes: load.storyNotes,
              drafts: load.drafts ?? [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
              activeDraftId: load.activeDraftId ?? MAIN_DRAFT_ID,
              mainDraftId: resolveMainDraftId(load.drafts, load.mainDraftId),
              draftData: load.draftData ?? {},
              bookData: rest,
            },
            openCh: null,
            view: "board",
            level: "book",
            arrangeN: 0,
            showSeries: false,
          };
        }),

      enterBook: (id) => {
        useStore.getState().switchBook(id);
        set({ level: "book" });
      },
      goToSeries: () => set({ level: "series", openCh: null }),
      setLevel: (level) => set({ level }),

      addBook: () =>
        set((s) => {
          const id = uid("b");
          const stash = { ...s.doc.bookData, [s.doc.activeBookId]: stashActiveBook(s.doc) };
          const lastX = Math.max(80, ...s.doc.books.map((b) => b.x ?? 80));
          return {
            doc: {
              ...s.doc,
              seriesMode: true,
              books: s.doc.books.concat({
                id,
                title: "Untitled Book",
                subtitle: `Book ${s.doc.books.length + 1}`,
                status: "idea",
                premise: "",
                arc: "",
                notes: "",
                x: lastX + 380,
                y: 90,
              }),
              activeBookId: id,
              chapters: [],
              links: [],
              storyNotes: "",
              drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
              activeDraftId: MAIN_DRAFT_ID,
              mainDraftId: MAIN_DRAFT_ID,
              draftData: {},
              bookData: stash,
            },
            openCh: null,
            view: "board",
            level: "book",
            newMenu: false,
            showSeries: false,
            showNewBook: false,
          };
        }),

      updateBook: (id, patch) =>
        set((s) => ({
          doc: { ...s.doc, books: s.doc.books.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
        })),

      deleteBook: (id) =>
        set((s) => {
          if (s.doc.books.length <= 1 || id === s.doc.activeBookId) return s;
          const rest = { ...s.doc.bookData };
          delete rest[id];
          return {
            doc: {
              ...s.doc,
              books: s.doc.books.filter((b) => b.id !== id),
              bookLinks: (s.doc.bookLinks ?? []).filter((l) => l.fromId !== id && l.toId !== id),
              bookData: rest,
            },
          };
        }),

      moveBook: (id, x, y) =>
        set((s) => ({
          doc: { ...s.doc, books: s.doc.books.map((b) => (b.id === id ? { ...b, x, y } : b)) },
        })),

      // Same reorder-on-drop as reorderChapter: books keep their free position,
      // only the sequence (Book N badge, timeline order) changes.
      reorderBook: (id, targetId, after) =>
        set((s) => {
          const books = s.doc.books.slice();
          const fromIdx = books.findIndex((b) => b.id === id);
          if (fromIdx === -1) return s;
          const [moved] = books.splice(fromIdx, 1);
          let toIdx = books.findIndex((b) => b.id === targetId);
          if (toIdx === -1) toIdx = books.length;
          else if (after) toIdx += 1;
          books.splice(toIdx, 0, moved);
          return { doc: { ...s.doc, books } };
        }),

      // Lay books out on a reading-order grid sized to the series-map viewport.
      // Bumps seriesArrangeN so the map re-fits its camera to the result.
      autoArrangeSeries: () =>
        set((s) => {
          const cols = bestBookColumns(s.doc.books.length, s.boardW, s.boardH);
          return {
            doc: { ...s.doc, books: bookAutoArrange(s.doc.books, cols) },
            seriesArrangeN: s.seriesArrangeN + 1,
          };
        }),

      addBookLink: (fromId, toId) =>
        set((s) => {
          if (fromId === toId) return s;
          return {
            doc: {
              ...s.doc,
              bookLinks: (s.doc.bookLinks ?? []).concat({ id: uid("bl"), fromId, toId }),
            },
          };
        }),

      updateBookLink: (id, label) =>
        set((s) => ({
          doc: {
            ...s.doc,
            bookLinks: (s.doc.bookLinks ?? []).map((l) => (l.id === id ? { ...l, label } : l)),
          },
        })),

      deleteBookLink: (id) =>
        set((s) => ({
          doc: { ...s.doc, bookLinks: (s.doc.bookLinks ?? []).filter((l) => l.id !== id) },
        })),

      // ---- characters ----
      // The draft is held outside `doc` and carries the id it will keep, so the
      // keystroke that commits it doesn't remount the card being typed into.
      startCharDraft: () =>
        set((s) => {
          const id = uid("p");
          const draft: Character = {
            id,
            name: "",
            role: "",
            type: "",
            initials: "",
            color: CHAR_PALETTE[s.doc.characters.length % CHAR_PALETTE.length],
            desc: "",
            bio: "",
            traits: [],
            goals: [],
            motivations: "",
            want: "",
            need: "",
            notes: "",
          };
          // Opened from the chapter modal as well as the panel itself, so it
          // closes the other two rather than stacking on one of them.
          return { charDraft: draft, selChar: id, showChars: true, showWorld: false, showNotes: false };
        }),

      // Still blank → keep editing the draft. First real content → it becomes a
      // character, appended last, which is where the draft card already renders.
      updateCharDraft: (patch) =>
        set((s) => {
          if (!s.charDraft) return s;
          const merged = { ...s.charDraft, ...patch };
          if (isCharacterEmpty(merged)) return { charDraft: merged };
          return {
            charDraft: null,
            doc: { ...s.doc, characters: s.doc.characters.concat(merged) },
            selChar: merged.id,
          };
        }),

      discardCharDraft: () =>
        set((s) => ({
          charDraft: null,
          selChar: s.selChar === s.charDraft?.id ? null : s.selChar,
        })),

      updateCharacter: (id, patch) =>
        set((s) => ({
          doc: {
            ...s.doc,
            characters: s.doc.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          },
        })),

      deleteCharacter: (id) =>
        set((s) => ({
          doc: deleteCharacterDoc(s.doc, id),
          selChar: s.selChar === id ? null : s.selChar,
        })),

      // Retire from the roster without touching a single `chapter.chars` — the
      // castings are the record of who was in the scene, and keeping them is
      // what makes Restore lossless (the archive rule in `types.ts`). Collapse
      // the card on the way out so it doesn't land on the shelf still expanded.
      archiveCharacter: (id) =>
        set((s) => ({
          doc: { ...s.doc, characters: setArchived(s.doc.characters, id, true) },
          selChar: s.selChar === id ? null : s.selChar,
        })),

      unarchiveCharacter: (id) =>
        set((s) => ({
          doc: { ...s.doc, characters: setArchived(s.doc.characters, id, false) },
        })),

      // ---- world ----
      // Same deferred-creation shape as the character draft above.
      startWorldDraft: () =>
        set(() => {
          const id = uid("w");
          return {
            worldDraft: { id, cat: "Lore", name: "", desc: "", notes: "", refs: [] },
            selWorld: id,
            showWorld: true,
            showChars: false,
            showNotes: false,
          };
        }),

      updateWorldDraft: (patch) =>
        set((s) => {
          if (!s.worldDraft) return s;
          const merged = { ...s.worldDraft, ...patch };
          if (isWorldEntryEmpty(merged)) return { worldDraft: merged };
          return {
            worldDraft: null,
            doc: { ...s.doc, world: s.doc.world.concat(merged) },
            selWorld: merged.id,
          };
        }),

      discardWorldDraft: () =>
        set((s) => ({
          worldDraft: null,
          selWorld: s.selWorld === s.worldDraft?.id ? null : s.selWorld,
        })),

      updateWorldEntry: (id, patch) =>
        set((s) => ({
          doc: { ...s.doc, world: s.doc.world.map((w) => (w.id === id ? { ...w, ...patch } : w)) },
        })),

      deleteWorldEntry: (id) =>
        set((s) => ({
          doc: deleteWorldEntryDoc(s.doc, id),
          selWorld: s.selWorld === id ? null : s.selWorld,
        })),

      // Same rule as `archiveCharacter`: the chapters that reference this entry
      // keep referencing it, dimmed, and its own pinned refs stay pinned to it.
      archiveWorldEntry: (id) =>
        set((s) => ({
          doc: { ...s.doc, world: setArchived(s.doc.world, id, true) },
          selWorld: s.selWorld === id ? null : s.selWorld,
        })),

      unarchiveWorldEntry: (id) =>
        set((s) => ({
          doc: { ...s.doc, world: setArchived(s.doc.world, id, false) },
        })),

      // World-entry refs mirror chapter refs: create the shared asset, pin a link.
      addWorldRef: (wId, kind, refId) =>
        set((s) => {
          const assetId = uid("a");
          return {
            doc: {
              ...s.doc,
              assets: s.doc.assets.concat(blankAsset(assetId, kind)),
              world: s.doc.world.map((w) =>
                w.id === wId ? { ...w, refs: w.refs.concat({ id: refId ?? uid("r"), assetId }) } : w
              ),
            },
          };
        }),

      // Unlink only — the asset survives in the library.
      deleteWorldRef: (wId, refId) =>
        set((s) => ({
          doc: {
            ...s.doc,
            world: s.doc.world.map((w) =>
              w.id === wId ? { ...w, refs: w.refs.filter((r) => r.id !== refId) } : w
            ),
          },
        })),

      // Same fresh-state lookup as `updateChapterRefAsset`, for world entries.
      updateWorldRefAsset: (wId, refId, patch) =>
        set((s) => {
          const link = s.doc.world.find((w) => w.id === wId)?.refs.find((r) => r.id === refId);
          if (!link) return s;
          return {
            doc: {
              ...s.doc,
              assets: s.doc.assets.map((a) => (a.id === link.assetId ? { ...a, ...patch } : a)),
            },
          };
        }),

      reorderWorldRef: (wId, refId, toIdx) =>
        set((s) => ({
          doc: {
            ...s.doc,
            world: s.doc.world.map((w) =>
              w.id === wId ? { ...w, refs: moveById(w.refs, refId, toIdx) } : w
            ),
          },
        })),

      linkAssetToWorld: (wId, assetId) =>
        set((s) => {
          if (!s.doc.assets.some((a) => a.id === assetId)) return s;
          return {
            doc: {
              ...s.doc,
              world: s.doc.world.map((w) => {
                if (w.id !== wId) return w;
                if (w.refs.some((r) => r.assetId === assetId)) return w; // already linked
                return { ...w, refs: w.refs.concat({ id: uid("r"), assetId }) };
              }),
            },
          };
        }),

      // ---- shared assets ----
      addAsset: (kind, presetId) => {
        const id = presetId ?? uid("a");
        set((s) => ({
          doc: { ...s.doc, assets: s.doc.assets.concat(blankAsset(id, kind)) },
        }));
        return id;
      },

      updateAsset: (id, patch) =>
        set((s) => ({
          doc: { ...s.doc, assets: s.doc.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) },
        })),

      /**
       * Reorder the shared library. `toIdx` counts the *visible* (non-archived)
       * assets, because that's the list the user is dragging in — archived assets
       * keep their exact slots in the array, so archiving something never
       * silently reshuffles the library order around it.
       */
      reorderAsset: (id, toIdx) =>
        set((s) => {
          const assets = s.doc.assets;
          const slots = assets.reduce<number[]>((acc, a, i) => (a.archived ? acc : acc.concat(i)), []);
          const visible = slots.map((i) => assets[i]);
          const moved = moveById(visible, id, toIdx);
          if (moved === visible) return s;
          const next = assets.slice();
          slots.forEach((slot, k) => (next[slot] = moved[k]));
          return { doc: { ...s.doc, assets: next } };
        }),

      /**
       * Archiving retires a note/image/to-do from the library and the link
       * picker, but leaves its pins alone — see the archive rule in `types.ts`.
       * Restoring is therefore lossless, so neither direction needs a sweep.
       */
      archiveAsset: (id) =>
        set((s) => ({ doc: { ...s.doc, assets: setArchived(s.doc.assets, id, true) } })),

      unarchiveAsset: (id) =>
        set((s) => ({ doc: { ...s.doc, assets: setArchived(s.doc.assets, id, false) } })),

      // Deleting a library asset unpins it EVERYWHERE — active board, stashed
      // versions, stashed books and their versions, and world entries — then
      // drops the asset. Missing a location would leave dangling links (the
      // same lesson SPECS §9 item 5 records for deleteCharacter).
      deleteAsset: (id) =>
        set((s) => {
          const swept = removeAssetLinks(s.doc, id);
          return { doc: { ...swept, assets: swept.assets.filter((a) => a.id !== id) } };
        }),

      // ---- drafts / versions ----
      // Each version is a standalone fork of the board: creating one deep-copies
      // the board you're reading — branching off an experiment you're in the
      // middle of is the common case, so the fork follows your eyes rather than
      // the star. Switching stashes/restores whole boards (same pattern as
      // switchBook). Edits never leak between versions.
      addDraft: (name, opts) =>
        set((s) => {
          const id = uid("d");
          const n = s.doc.drafts.length;
          const fork = cloneVersionData(activeVersionData(s.doc));
          // Structure only: the fork gets the map and none of the writing, which
          // is what makes a re-arrangement experiment free rather than something
          // that doubles the manuscript on disk to try.
          const chapters =
            opts?.copyProse === false
              ? fork.chapters.map(({ manuscript: _drop, ...rest }) => rest as Chapter)
              : fork.chapters;
          return {
            doc: {
              ...s.doc,
              drafts: s.doc.drafts.concat({ id, name: name || `Version ${n}` }),
              activeDraftId: id,
              // The fork becomes the active board; the old active version keeps
              // the original objects in the stash.
              chapters,
              links: fork.links,
              storyNotes: fork.storyNotes,
              draftData: { ...s.doc.draftData, [s.doc.activeDraftId]: activeVersionData(s.doc) },
            },
          };
        }),

      setActiveDraft: (id) =>
        set((s) => {
          if (id === s.doc.activeDraftId || !s.doc.drafts.some((d) => d.id === id)) return s;
          const stash = { ...s.doc.draftData, [s.doc.activeDraftId]: activeVersionData(s.doc) };
          // A missing stash entry should never happen; keeping the current board
          // (old passthrough behaviour) beats showing an empty one.
          const load = stash[id] ?? activeVersionData(s.doc);
          delete stash[id];
          return {
            doc: {
              ...s.doc,
              activeDraftId: id,
              chapters: load.chapters,
              links: load.links,
              storyNotes: load.storyNotes,
              draftData: stash,
            },
            // Chapter ids survive a fork, so keep the modal open when it exists
            // in the loaded version too.
            openCh: s.openCh && load.chapters.some((c) => c.id === s.openCh) ? s.openCh : null,
          };
        }),

      renameDraft: (id, name) =>
        set((s) => ({
          doc: { ...s.doc, drafts: s.doc.drafts.map((d) => (d.id === id ? { ...d, name } : d)) },
        })),

      deleteDraft: (id) =>
        set((s) => {
          // The main version is the one that can't be deleted — whichever the
          // user has pointed `mainDraftId` at, not the seed id.
          const mainId = s.doc.mainDraftId;
          if (id === mainId) return s;
          const drafts = s.doc.drafts.filter((d) => d.id !== id);
          const draftData = { ...s.doc.draftData };
          delete draftData[id];
          if (s.doc.activeDraftId !== id) {
            return { doc: { ...s.doc, drafts, draftData } };
          }
          // Deleting the active version: fall back to the main version's board.
          const load = draftData[mainId] ?? activeVersionData(s.doc);
          delete draftData[mainId];
          return {
            doc: {
              ...s.doc,
              drafts,
              activeDraftId: mainId,
              chapters: load.chapters,
              links: load.links,
              storyNotes: load.storyNotes,
              draftData,
            },
            openCh: s.openCh && load.chapters.some((c) => c.id === s.openCh) ? s.openCh : null,
          };
        }),

      // Moving the marker only re-labels which version is canonical — no board
      // is copied or swapped, and the version you're viewing doesn't change.
      // The version losing the marker becomes an ordinary, deletable fork.
      setMainDraft: (id) =>
        set((s) =>
          s.doc.drafts.some((d) => d.id === id) ? { doc: { ...s.doc, mainDraftId: id } } : s
        ),

      // ---- ui ----
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setView: (v) => set({ view: v }),
      setOrient: (o) => set({ timelineOrient: o }),
      setTimelinePane: (p) => set({ timelinePane: p }),
      setDragId: (id) => set({ dragId: id }),
      openChapter: (id) =>
        set((s) => {
          // Lay out whichever of the two canvas sizes has no usable layout yet
          // (a pre-v6 chapter has only the expanded one; a brand-new chapter has
          // neither), estimating each mode's visible width so it fills the space
          // — ~5 columns expanded, ~3 collapsed. An existing layout is left
          // exactly as the user arranged it.
          const layout = (scenes: string[], expanded: boolean) =>
            sceneAutoArrange(
              scenes,
              0,
              sceneColumnsForWidth(scenes.length, sceneBoxWidthEstimate(expanded))
            );
          return {
            openCh: id,
            sceneArrangeN: 0,
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) => {
                if (c.id !== id) return c;
                const laidOut = (p?: Vec2[]) => !!p && p.length === c.scenes.length;
                if (laidOut(c.scenePos) && laidOut(c.scenePosCompact)) return c;
                return {
                  ...c,
                  ...(laidOut(c.scenePos) ? null : { scenePos: layout(c.scenes, true) }),
                  ...(laidOut(c.scenePosCompact) ? null : { scenePosCompact: layout(c.scenes, false) }),
                };
              }),
            },
          };
        }),
      // Opening straight onto a scene (from the timeline's scene pane) goes
      // through `openChapter` so the modal's per-mode scene layouts are still
      // seeded, then leaves a one-shot marker for the modal to consume.
      openChapterAtScene: (id, index) => {
        useStore.getState().openChapter(id);
        set({ focusScene: { chapterId: id, index } });
      },
      clearFocusScene: () => set({ focusScene: null }),
      // Jumping to a pin can cross a book and a version boundary, so it reuses
      // `switchBook`/`setActiveDraft` rather than reaching into the doc — those
      // are the actions that stash the board being left behind. Panels close
      // through `setPanel` so their blank-draft sweep still runs.
      jumpToChapter: (bookId, draftId, chapterId) => {
        const st = useStore.getState();
        for (const key of ["showNotes", "showWorld", "showChars"] as PanelKey[]) {
          if (st[key]) st.setPanel(key, false);
        }
        if (bookId !== useStore.getState().doc.activeBookId) {
          useStore.getState().switchBook(bookId);
        }
        if (draftId && draftId !== useStore.getState().doc.activeDraftId) {
          useStore.getState().setActiveDraft(draftId);
        }
        // A pin can go stale between render and click (another version deleted,
        // say) — land on the board rather than opening a modal on nothing.
        set({ level: "book", view: "board" });
        if (useStore.getState().doc.chapters.some((c) => c.id === chapterId)) {
          useStore.getState().openChapter(chapterId);
        }
      },

      jumpToWorldEntry: (worldId) => {
        // Through setPanel so the panel being left still gets its draft sweep,
        // and so the one-panel-at-a-time rule is applied in one place.
        useStore.getState().setPanel("showWorld", true);
        set({ selWorld: worldId });
      },

      // Closing the chapter drops any note/image ref left with nothing in it.
      closeChapter: () => set((s) => ({ openCh: null, focusScene: null, ...prunedState(s) })),
      toggleNewMenu: () => set((s) => ({ newMenu: !s.newMenu })),
      closeNewMenu: () => set({ newMenu: false }),
      setPanel: (panel, open) =>
        set((s) => {
          const editing = EDITING_PANELS.has(panel);
          // One editing panel at a time. The scrim already makes a second one
          // unreachable by pointer (it covers the toolbar), so this is here to
          // keep the invariant true for the paths that open a panel from *inside*
          // another surface — a draft started from the chapter modal, a pin jump
          // handing off from Notes to World.
          const closeOthers =
            open && editing ? { showChars: false, showWorld: false, showNotes: false } : null;
          // Leaving an editing panel drops its untouched draft card, and sweeps
          // any record that was emptied out (or predates deferred creation).
          // Only when a panel that WAS open is now closing — re-opening the panel
          // you're already in must not throw away the draft you're typing into.
          const left = editing
            ? open
              ? EDITING_PANEL_LIST.some((k) => k !== panel && s[k])
              : s[panel]
            : false;
          return {
            ...closeOthers,
            [panel]: open,
            newMenu: false,
            ...(left ? { charDraft: null, worldDraft: null, ...prunedState(s) } : null),
          } as Partial<StoreState>;
        }),
      toggleChapterSection: (section) =>
        set((s) => ({
          chapterSectionsCollapsed: {
            ...s.chapterSectionsCollapsed,
            [section]: !s.chapterSectionsCollapsed[section],
          },
        })),
      setRefView: (view) => set({ refView: view }),
      toggleTextarea: (key) =>
        set((s) => ({
          textareaExpanded: { ...s.textareaExpanded, [key]: !s.textareaExpanded[key] },
        })),
      setSceneFlowExpanded: (expanded) => set({ sceneFlowExpanded: expanded }),
      setPanelExpanded: (expanded) => set({ panelExpanded: expanded }),
      selectChar: (id) => set((s) => ({ selChar: s.selChar === id ? null : id })),
      selectWorld: (id) => set((s) => ({ selWorld: s.selWorld === id ? null : id })),
      selectBook: (id) => set((s) => ({ selBook: s.selBook === id ? null : id })),
      openLightbox: (src) => set({ lightbox: src }),
      closeLightbox: () => set({ lightbox: null }),

      // ---- onboarding ----
      useSample: () => set({ doc: sampleStory, onboarded: true, level: "book", view: "board" }),
      startFresh: () =>
        set({
          doc: emptyStory(),
          onboarded: true,
          level: "book",
          view: "board",
          openCh: null,
          showNewBook: false,
          // Offer creation options right away.
          showTemplates: true,
        }),
    }),
    {
      name: "estoria:store:v1",
      version: SCHEMA_VERSION,
      storage: zustandStorage,
      partialize: (s) => ({
        doc: s.doc,
        projectStash: s.projectStash,
        theme: s.theme,
        view: s.view,
        timelineOrient: s.timelineOrient,
        timelinePane: s.timelinePane,
        onboarded: s.onboarded,
        chapterSectionsCollapsed: s.chapterSectionsCollapsed,
        refView: s.refView,
        textareaExpanded: s.textareaExpanded,
        sceneFlowExpanded: s.sceneFlowExpanded,
        manuscriptState: s.manuscriptState,
        panelExpanded: s.panelExpanded,
      }),
      // On a schema bump, convert the persisted document (and every stashed
      // project) through `normalizeDoc`, which understands all older shapes.
      // Discarding is the last resort, only for docs that fail to convert.
      migrate: (persisted: unknown, version: number) => {
        if (version >= SCHEMA_VERSION) return persisted as never;
        const p = (persisted as { doc?: unknown; projectStash?: unknown; theme?: Theme }) ?? {};
        try {
          const doc = normalizeDoc(p.doc);
          const projectStash: Record<string, StoryDoc> = {};
          const rawStash =
            p.projectStash && typeof p.projectStash === "object"
              ? (p.projectStash as Record<string, unknown>)
              : {};
          for (const [id, raw] of Object.entries(rawStash)) {
            try {
              projectStash[id] = normalizeDoc(raw);
            } catch {
              // Drop only the unreadable stashed project, keep the rest.
            }
          }
          return { ...(persisted as object), doc, projectStash } as never;
        } catch {
          return { doc: sampleStory, theme: p.theme ?? "light", view: "board" as View };
        }
      },
    }
  )
);
