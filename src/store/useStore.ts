import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  type WorldEntry,
} from "@/types";
import { activeVersionData, cloneVersionData } from "@/lib/drafts";
import { removeAssetLinks } from "@/lib/refs";
import { deleteCharacterDoc, deleteWorldEntryDoc } from "@/lib/entities";
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
}

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

  // ---- chapter refs (pure links into the shared asset pool) ----
  addChapterRef: (chId: string, kind: RefKind) => void;
  deleteChapterRef: (chId: string, refId: string) => void;
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
  addCharacter: () => void;
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;

  // ---- world ----
  addWorldEntry: () => void;
  updateWorldEntry: (id: string, patch: Partial<WorldEntry>) => void;
  deleteWorldEntry: (id: string) => void;
  addWorldRef: (wId: string, kind: RefKind) => void;
  deleteWorldRef: (wId: string, refId: string) => void;
  linkAssetToWorld: (wId: string, assetId: string) => void;

  // ---- shared assets ----
  addAsset: (kind: RefKind) => string;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;

  // ---- drafts / versions ----
  addDraft: (name?: string) => void;
  setActiveDraft: (id: string) => void;
  renameDraft: (id: string, name: string) => void;
  deleteDraft: (id: string) => void;

  // ---- ui ----
  toggleTheme: () => void;
  setView: (v: View) => void;
  setOrient: (o: TimelineOrient) => void;
  setDragId: (id: string | null) => void;
  openChapter: (id: string) => void;
  closeChapter: () => void;
  toggleNewMenu: () => void;
  closeNewMenu: () => void;
  setPanel: (panel: PanelKey, open: boolean) => void;
  toggleChapterSection: (section: ChapterSection) => void;
  setRefView: (view: RefView) => void;
  toggleTextarea: (key: TextareaKey) => void;
  setSceneFlowExpanded: (expanded: boolean) => void;
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

const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const dedupeById = <T extends { id: string }>(arr: T[]): T[] => {
  const seen = new Set<string>();
  return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

/** Snapshot the active book's full board (all versions) for stashing in `bookData`. */
const stashActiveBook = (doc: StoryDoc): BookData => ({
  chapters: doc.chapters,
  links: doc.links,
  storyNotes: doc.storyNotes,
  drafts: doc.drafts,
  activeDraftId: doc.activeDraftId,
  draftData: doc.draftData,
});

const emptyBookData = (): BookData => ({
  chapters: [],
  links: [],
  storyNotes: "",
  drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
  activeDraftId: MAIN_DRAFT_ID,
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

const renumber = (chapters: Chapter[]): Chapter[] =>
  chapters.map((c, i) => ({ ...c, num: i + 1 }));

const initialUi: UiState = {
  theme: "light",
  view: "board",
  level: "book",
  timelineOrient: "vertical",
  zoom: 0.66,
  panX: 34,
  panY: 28,
  arrangeN: 0,
  seriesArrangeN: 0,
  boardW: 0,
  boardH: 0,
  dragId: null,
  openCh: null,
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
  lightbox: null,
  onboarded: false,
  chapterSectionsCollapsed: { chars: false, world: false, notes: false, refs: false },
  refView: "list",
  textareaExpanded: { storyNotes: false, chapterNotes: false, worldDesc: false, worldNotes: false },
  sceneFlowExpanded: true,
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
          const doc: StoryDoc = { ...incoming, id, schemaVersion: SCHEMA_VERSION };
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
      addScene: (chId, cols) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const scenes = c.scenes.concat("");
              const sceneLinks = c.scenes.length > 0 ? c.sceneLinks.concat("therefore") : c.sceneLinks;
              return { ...c, scenes, sceneLinks, scenePos: sceneAutoArrange(scenes, 0, cols) };
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
              return { ...c, scenes, sceneLinks, scenePos: sceneAutoArrange(scenes, 0, cols) };
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
              const scenePos = (c.scenePos || []).filter((_, i) => i !== idx);
              const links = c.sceneLinks.slice();
              if (links.length) links.splice(Math.min(idx, links.length - 1), 1);
              return { ...c, scenes, scenePos, sceneLinks: links };
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

              return { ...c, scenes, sceneLinks, scenePos: sceneAutoArrange(scenes, 0, cols) };
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
                    scenePos: sceneAutoArrange(srcScenes, 0, cols),
                  };
                if (c.id === toChId)
                  return {
                    ...c,
                    scenes: toScenes,
                    sceneLinks: toLinks,
                    // Width-fitted like openChapter, so the destination doesn't
                    // keep a cramped count-heuristic grid when later opened.
                    scenePos: sceneAutoArrange(
                      toScenes,
                      0,
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

      arrangeScenes: (chId, reset = false, cols) =>
        set((s) => {
          const n = reset ? 0 : s.sceneArrangeN;
          return {
            sceneArrangeN: n + 1,
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === chId ? { ...c, scenePos: sceneAutoArrange(c.scenes, n, cols) } : c
              ),
            },
          };
        }),

      // ---- chapter refs (pure links into the shared asset pool) ----
      // Adding a note/image creates a shared Asset first, then pins a link to it
      // — one pool of linkable content, no orphan per-chapter copies.
      addChapterRef: (chId, kind) =>
        set((s) => {
          const assetId = uid("a");
          const asset: Asset = {
            id: assetId,
            kind,
            label: "",
            body: kind === "NOTE" ? "" : undefined,
          };
          return {
            doc: {
              ...s.doc,
              assets: s.doc.assets.concat(asset),
              chapters: s.doc.chapters.map((c) =>
                c.id === chId ? { ...c, refs: c.refs.concat({ id: uid("r"), assetId }) } : c
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
          doc: { ...doc, schemaVersion: SCHEMA_VERSION },
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
      addCharacter: () =>
        set((s) => {
          const id = uid("p");
          const next: Character = {
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
          return {
            doc: { ...s.doc, characters: s.doc.characters.concat(next) },
            selChar: id,
            showChars: true,
          };
        }),

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

      // ---- world ----
      addWorldEntry: () =>
        set((s) => {
          const id = uid("w");
          return {
            doc: {
              ...s.doc,
              world: s.doc.world.concat({
                id,
                cat: "Lore",
                name: "",
                desc: "",
                notes: "",
                refs: [],
              }),
            },
            selWorld: id,
            showWorld: true,
          };
        }),

      updateWorldEntry: (id, patch) =>
        set((s) => ({
          doc: { ...s.doc, world: s.doc.world.map((w) => (w.id === id ? { ...w, ...patch } : w)) },
        })),

      deleteWorldEntry: (id) =>
        set((s) => ({
          doc: deleteWorldEntryDoc(s.doc, id),
          selWorld: s.selWorld === id ? null : s.selWorld,
        })),

      // World-entry refs mirror chapter refs: create the shared asset, pin a link.
      addWorldRef: (wId, kind) =>
        set((s) => {
          const assetId = uid("a");
          const asset: Asset = {
            id: assetId,
            kind,
            label: "",
            body: kind === "NOTE" ? "" : undefined,
          };
          return {
            doc: {
              ...s.doc,
              assets: s.doc.assets.concat(asset),
              world: s.doc.world.map((w) =>
                w.id === wId ? { ...w, refs: w.refs.concat({ id: uid("r"), assetId }) } : w
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
      addAsset: (kind) => {
        const id = uid("a");
        set((s) => ({
          doc: {
            ...s.doc,
            assets: s.doc.assets.concat({
              id,
              kind,
              label: "",
              body: kind === "NOTE" ? "" : undefined,
            }),
          },
        }));
        return id;
      },

      updateAsset: (id, patch) =>
        set((s) => ({
          doc: { ...s.doc, assets: s.doc.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) },
        })),

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
      // the current board, and switching stashes/restores whole boards (same
      // pattern as switchBook). Edits never leak between versions.
      addDraft: (name) =>
        set((s) => {
          const id = uid("d");
          const n = s.doc.drafts.length;
          const fork = cloneVersionData(activeVersionData(s.doc));
          return {
            doc: {
              ...s.doc,
              drafts: s.doc.drafts.concat({ id, name: name || `Version ${n}` }),
              activeDraftId: id,
              // The fork becomes the active board; the old active version keeps
              // the original objects in the stash.
              chapters: fork.chapters,
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
          if (id === MAIN_DRAFT_ID) return s;
          const drafts = s.doc.drafts.filter((d) => d.id !== id);
          const draftData = { ...s.doc.draftData };
          delete draftData[id];
          if (s.doc.activeDraftId !== id) {
            return { doc: { ...s.doc, drafts, draftData } };
          }
          // Deleting the active version: fall back to the main draft's board.
          const load = draftData[MAIN_DRAFT_ID] ?? activeVersionData(s.doc);
          delete draftData[MAIN_DRAFT_ID];
          return {
            doc: {
              ...s.doc,
              drafts,
              activeDraftId: MAIN_DRAFT_ID,
              chapters: load.chapters,
              links: load.links,
              storyNotes: load.storyNotes,
              draftData,
            },
            openCh: s.openCh && load.chapters.some((c) => c.id === s.openCh) ? s.openCh : null,
          };
        }),

      // ---- ui ----
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setView: (v) => set({ view: v }),
      setOrient: (o) => set({ timelineOrient: o }),
      setDragId: (id) => set({ dragId: id }),
      openChapter: (id) =>
        set((s) => {
          // Estimate the visible scene-canvas width for the current mode so a
          // freshly-laid-out chapter fills it (~5 columns expanded, ~3 collapsed).
          const boxW = sceneBoxWidthEstimate(s.sceneFlowExpanded);
          return {
            openCh: id,
            sceneArrangeN: 0,
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === id && (!c.scenePos || c.scenePos.length !== c.scenes.length)
                  ? {
                      ...c,
                      scenePos: sceneAutoArrange(c.scenes, 0, sceneColumnsForWidth(c.scenes.length, boxW)),
                    }
                  : c
              ),
            },
          };
        }),
      closeChapter: () => set({ openCh: null }),
      toggleNewMenu: () => set((s) => ({ newMenu: !s.newMenu })),
      closeNewMenu: () => set({ newMenu: false }),
      setPanel: (panel, open) =>
        set({ [panel]: open, newMenu: false } as Pick<StoreState, PanelKey> & { newMenu: boolean }),
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
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({
        doc: s.doc,
        projectStash: s.projectStash,
        theme: s.theme,
        view: s.view,
        timelineOrient: s.timelineOrient,
        onboarded: s.onboarded,
        chapterSectionsCollapsed: s.chapterSectionsCollapsed,
        refView: s.refView,
        textareaExpanded: s.textareaExpanded,
        sceneFlowExpanded: s.sceneFlowExpanded,
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
