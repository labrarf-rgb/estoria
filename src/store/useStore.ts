import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  MAIN_DRAFT_ID,
  SCHEMA_VERSION,
  type Asset,
  type Chapter,
  type Character,
  type ConnType,
  type PinnedRef,
  type RefKind,
  type StoryDoc,
  type WorldEntry,
} from "@/types";
import { sampleStory } from "@/data/sampleStory";
import { emptyStory } from "@/data/emptyStory";
import {
  autoArrange,
  CARD_W,
  sceneAutoArrange,
  type Camera,
  type TimelineOrient,
} from "@/lib/layout";
import { TEMPLATES } from "@/lib/templates";
import { zustandStorage } from "@/store/persistence";

export type View = "board" | "timeline";
export type Theme = "light" | "dark";

/** Which level of the hierarchy is on screen: the series map or a book's board. */
export type Level = "series" | "book";

interface UiState {
  theme: Theme;
  view: View;
  level: Level;
  timelineOrient: TimelineOrient;
  zoom: number;
  panX: number;
  panY: number;
  arrangeN: number;
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
  selChar: string | null;
  selWorld: string | null;
  selBook: string | null;
  /** Image data URL currently shown full-screen, or null. */
  lightbox: string | null;
  /** False until the user has chosen sample-vs-fresh on first launch. */
  onboarded: boolean;
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
  deleteProject: (id: string) => void;
  mergeProjectIntoSeries: (sourceId: string, targetId: string) => void;

  // ---- confirmation ----
  confirm: ConfirmRequest | null;
  askConfirm: (req: ConfirmRequest) => void;
  closeConfirm: () => void;

  // ---- chapters ----
  moveChapter: (id: string, x: number, y: number) => void;
  addChapter: () => void;
  deleteChapter: (id: string) => void;
  autoArrangeBoard: () => void;
  setChapterAct: (id: string, act: number) => void;
  bumpChapterAct: (id: string, delta: number) => void;
  patchChapter: (id: string, patch: Partial<Chapter>) => void;
  editChapterText: (id: string, patch: { title?: string; summary?: string }) => void;
  toggleChapterChar: (id: string, charId: string) => void;
  toggleChapterWorld: (id: string, worldId: string) => void;

  // ---- scenes ----
  addScene: (chId: string) => void;
  updateScene: (chId: string, idx: number, text: string) => void;
  deleteScene: (chId: string, idx: number) => void;
  moveScene: (chId: string, idx: number, x: number, y: number) => void;
  cycleSceneLink: (chId: string, idx: number) => void;
  arrangeScenes: (chId: string, reset?: boolean) => void;

  // ---- chapter refs ----
  addChapterRef: (chId: string, kind: RefKind) => void;
  updateChapterRef: (chId: string, refId: string, patch: Partial<PinnedRef>) => void;
  deleteChapterRef: (chId: string, refId: string) => void;
  linkAssetToChapter: (chId: string, assetId: string) => void;

  // ---- notes ----
  setStoryNotes: (notes: string) => void;

  // ---- templates / import ----
  applyTemplate: (tplId: string, mode: "insert" | "replace") => void;
  replaceDoc: (doc: StoryDoc) => void;

  // ---- books / series ----
  toggleSeriesMode: () => void;
  switchBook: (id: string) => void;
  enterBook: (id: string) => void;
  goToSeries: () => void;
  setLevel: (level: Level) => void;
  addBook: () => void;
  updateBook: (id: string, patch: Partial<StoryDoc["books"][number]>) => void;
  deleteBook: (id: string) => void;
  moveBook: (id: string, x: number, y: number) => void;
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
  updateWorldRef: (wId: string, refId: string, patch: Partial<PinnedRef>) => void;
  deleteWorldRef: (wId: string, refId: string) => void;

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
  | "showProjects";

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

/** Renumber chapters sequentially (1..n) after add/delete. */
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
  selChar: null,
  selWorld: null,
  selBook: null,
  lightbox: null,
  onboarded: false,
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
          const defaultDrafts = () => [{ id: MAIN_DRAFT_ID, name: "Main draft" }];
          const sourceBooks = source.books.map((b) => ({
            meta: b,
            data:
              b.id === source.activeBookId
                ? {
                    chapters: source.chapters,
                    links: source.links,
                    storyNotes: source.storyNotes,
                    drafts: source.drafts,
                    activeDraftId: source.activeDraftId,
                  }
                : source.bookData[b.id] ?? {
                    chapters: [],
                    links: [],
                    storyNotes: "",
                    drafts: defaultDrafts(),
                    activeDraftId: MAIN_DRAFT_ID,
                  },
          }));

          const newBookData = { ...target.bookData };
          const addedMetas = sourceBooks.map(({ meta, data }, i) => {
            const nid = uid("b");
            newBookData[nid] = {
              chapters: data.chapters,
              links: data.links,
              storyNotes: data.storyNotes,
              drafts: data.drafts ?? defaultDrafts(),
              activeDraftId: data.activeDraftId ?? MAIN_DRAFT_ID,
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

      addChapter: () =>
        set((s) => {
          const list = s.doc.chapters;
          const last = list[list.length - 1];
          const nc: Chapter = {
            id: uid("c"),
            num: list.length + 1,
            act: last ? last.act : 1,
            status: "idea",
            title: "Untitled Chapter",
            summary: "A new chapter. Double-click to map its scenes.",
            words: 0,
            x: last ? last.x + CARD_W + 72 : 60,
            y: last ? last.y : 90,
            chars: [],
            scenes: ["New scene."],
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
          const chapters = renumber(s.doc.chapters.filter((c) => c.id !== id));
          const links = s.doc.links.filter((l) => l.fromId !== id && l.toId !== id);
          return {
            doc: { ...s.doc, chapters, links },
            openCh: s.openCh === id ? null : s.openCh,
          };
        }),

      autoArrangeBoard: () =>
        set((s) => {
          const { chapters, arrangeN } = autoArrange(s.doc.chapters, s.arrangeN);
          return { doc: { ...s.doc, chapters }, arrangeN, view: "board" };
        }),

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

      // Draft-aware: edits to the main draft change the base; edits to any other
      // draft are stored as per-chapter overrides.
      editChapterText: (id, patch) =>
        set((s) => {
          const d = s.doc.activeDraftId;
          return {
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) => {
                if (c.id !== id) return c;
                if (d === MAIN_DRAFT_ID) return { ...c, ...patch };
                const overrides = { ...(c.overrides || {}) };
                overrides[d] = { ...(overrides[d] || {}), ...patch };
                return { ...c, overrides };
              }),
            },
          };
        }),

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
      addScene: (chId) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const pos = (c.scenePos || []).slice();
              const last = pos[pos.length - 1];
              pos.push(last ? { x: last.x + 40, y: last.y + 40 } : { x: 18, y: 18 });
              return {
                ...c,
                scenes: c.scenes.concat("New scene."),
                sceneLinks: c.scenes.length > 0 ? c.sceneLinks.concat("therefore") : c.sceneLinks,
                scenePos: pos,
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
              const scenePos = (c.scenePos || []).filter((_, i) => i !== idx);
              const links = c.sceneLinks.slice();
              if (links.length) links.splice(Math.min(idx, links.length - 1), 1);
              return { ...c, scenes, scenePos, sceneLinks: links };
            }),
          },
        })),

      moveScene: (chId, idx, x, y) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) => {
              if (c.id !== chId) return c;
              const pos = (c.scenePos || []).slice();
              pos[idx] = { x, y };
              return { ...c, scenePos: pos };
            }),
          },
        })),

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

      arrangeScenes: (chId, reset = false) =>
        set((s) => {
          const n = reset ? 0 : s.sceneArrangeN;
          return {
            sceneArrangeN: n + 1,
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === chId ? { ...c, scenePos: sceneAutoArrange(c.scenes, n) } : c
              ),
            },
          };
        }),

      // ---- chapter refs ----
      addChapterRef: (chId, kind) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === chId
                ? {
                    ...c,
                    refs: c.refs.concat({
                      id: uid("r"),
                      kind,
                      label: kind === "IMAGE" ? "New image" : "New note",
                      body: kind === "NOTE" ? "" : undefined,
                    }),
                  }
                : c
            ),
          },
        })),

      updateChapterRef: (chId, refId, patch) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === chId
                ? { ...c, refs: c.refs.map((r) => (r.id === refId ? { ...r, ...patch } : r)) }
                : c
            ),
          },
        })),

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
          const asset = s.doc.assets.find((a) => a.id === assetId);
          if (!asset) return s;
          return {
            doc: {
              ...s.doc,
              chapters: s.doc.chapters.map((c) =>
                c.id === chId
                  ? {
                      ...c,
                      refs: c.refs.concat({
                        id: uid("r"),
                        kind: asset.kind,
                        label: asset.label,
                        body: asset.body,
                        src: asset.src,
                        assetId: asset.id,
                      }),
                    }
                  : c
              ),
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
          const made: Chapter[] = tpl.beats.map(([title, act], i) => {
            const idx = startNum + i;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
              id: uid("c"),
              num: idx + 1,
              act,
              status: "idea",
              title,
              summary: "",
              words: 0,
              x: m + col * (CARD_W + gapX),
              y: m + row * (142 + gapY),
              chars: [],
              scenes: ["New scene."],
              sceneLinks: [],
              refs: [],
            };
          });
          const chapters = base.concat(made);
          const links = chapters
            .slice(0, -1)
            .map((c, i) => ({ fromId: c.id, toId: chapters[i + 1].id, type: "therefore" as const }));
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

      switchBook: (id) =>
        set((s) => {
          if (id === s.doc.activeBookId) return { showSeries: false };
          const stash = {
            ...s.doc.bookData,
            [s.doc.activeBookId]: {
              chapters: s.doc.chapters,
              links: s.doc.links,
              storyNotes: s.doc.storyNotes,
              drafts: s.doc.drafts,
              activeDraftId: s.doc.activeDraftId,
            },
          };
          const load = stash[id] ?? {
            chapters: [],
            links: [],
            storyNotes: "",
            drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
            activeDraftId: MAIN_DRAFT_ID,
          };
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
          const stash = {
            ...s.doc.bookData,
            [s.doc.activeBookId]: {
              chapters: s.doc.chapters,
              links: s.doc.links,
              storyNotes: s.doc.storyNotes,
              drafts: s.doc.drafts,
              activeDraftId: s.doc.activeDraftId,
            },
          };
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
            name: "New Character",
            role: "Supporting",
            type: "Archetype",
            initials: "NC",
            color: CHAR_PALETTE[s.doc.characters.length % CHAR_PALETTE.length],
            desc: "A one-line description of this character.",
            bio: "Backstory and background.",
            traits: ["Trait"],
            goals: ["A concrete goal"],
            motivations: "What drives them beneath the surface.",
            want: "What they want.",
            need: "What they need.",
            notes: "Other notes about this character.",
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
          doc: {
            ...s.doc,
            characters: s.doc.characters.filter((c) => c.id !== id),
            // Also drop the character from any chapter it appears in.
            chapters: s.doc.chapters.map((c) => ({
              ...c,
              chars: c.chars.filter((x) => x !== id),
            })),
          },
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
                name: "New entry",
                desc: "Describe this piece of the world.",
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
          doc: { ...s.doc, world: s.doc.world.filter((w) => w.id !== id) },
          selWorld: s.selWorld === id ? null : s.selWorld,
        })),

      addWorldRef: (wId, kind) =>
        set((s) => ({
          doc: {
            ...s.doc,
            world: s.doc.world.map((w) =>
              w.id === wId
                ? {
                    ...w,
                    refs: w.refs.concat({
                      id: uid("r"),
                      kind,
                      label: kind === "IMAGE" ? "New image" : "New note",
                      body: kind === "NOTE" ? "" : undefined,
                    }),
                  }
                : w
            ),
          },
        })),

      updateWorldRef: (wId, refId, patch) =>
        set((s) => ({
          doc: {
            ...s.doc,
            world: s.doc.world.map((w) =>
              w.id === wId
                ? { ...w, refs: w.refs.map((r) => (r.id === refId ? { ...r, ...patch } : r)) }
                : w
            ),
          },
        })),

      deleteWorldRef: (wId, refId) =>
        set((s) => ({
          doc: {
            ...s.doc,
            world: s.doc.world.map((w) =>
              w.id === wId ? { ...w, refs: w.refs.filter((r) => r.id !== refId) } : w
            ),
          },
        })),

      // ---- shared assets ----
      addAsset: (kind) => {
        const id = uid("a");
        set((s) => ({
          doc: {
            ...s.doc,
            assets: s.doc.assets.concat({
              id,
              kind,
              label: kind === "IMAGE" ? "New image" : "New note",
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

      deleteAsset: (id) =>
        set((s) => ({
          doc: { ...s.doc, assets: s.doc.assets.filter((a) => a.id !== id) },
        })),

      // ---- drafts / versions ----
      addDraft: (name) =>
        set((s) => {
          const id = uid("d");
          const n = s.doc.drafts.length;
          return {
            doc: {
              ...s.doc,
              drafts: s.doc.drafts.concat({ id, name: name || `Version ${n}` }),
              activeDraftId: id,
            },
          };
        }),

      setActiveDraft: (id) => set((s) => ({ doc: { ...s.doc, activeDraftId: id } })),

      renameDraft: (id, name) =>
        set((s) => ({
          doc: { ...s.doc, drafts: s.doc.drafts.map((d) => (d.id === id ? { ...d, name } : d)) },
        })),

      deleteDraft: (id) =>
        set((s) => {
          if (id === MAIN_DRAFT_ID) return s;
          return {
            doc: {
              ...s.doc,
              drafts: s.doc.drafts.filter((d) => d.id !== id),
              activeDraftId: s.doc.activeDraftId === id ? MAIN_DRAFT_ID : s.doc.activeDraftId,
              chapters: s.doc.chapters.map((c) => {
                if (!c.overrides || !c.overrides[id]) return c;
                const overrides = { ...c.overrides };
                delete overrides[id];
                return { ...c, overrides };
              }),
            },
          };
        }),

      // ---- ui ----
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setView: (v) => set({ view: v }),
      setOrient: (o) => set({ timelineOrient: o }),
      setDragId: (id) => set({ dragId: id }),
      openChapter: (id) =>
        set((s) => ({
          openCh: id,
          sceneArrangeN: 0,
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === id && (!c.scenePos || c.scenePos.length !== c.scenes.length)
                ? { ...c, scenePos: sceneAutoArrange(c.scenes, 0) }
                : c
            ),
          },
        })),
      closeChapter: () => set({ openCh: null }),
      toggleNewMenu: () => set((s) => ({ newMenu: !s.newMenu })),
      closeNewMenu: () => set({ newMenu: false }),
      setPanel: (panel, open) =>
        set({ [panel]: open, newMenu: false } as Pick<StoreState, PanelKey> & { newMenu: boolean }),
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
      }),
      // On a schema bump, discard the old persisted document rather than risk
      // reading a shape that no longer matches the model.
      migrate: (persisted: unknown, version: number) => {
        const p = (persisted as { theme?: Theme }) ?? {};
        if (version < SCHEMA_VERSION) {
          return { doc: sampleStory, theme: p.theme ?? "light", view: "board" as View };
        }
        return persisted as never;
      },
    }
  )
);
