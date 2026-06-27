import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  SCHEMA_VERSION,
  type Chapter,
  type ConnType,
  type RefKind,
  type StoryDoc,
} from "@/types";
import { sampleStory } from "@/data/sampleStory";
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
export type Draft = "main" | "alt";

/** Modal / panel surfaces, mutually exclusive enough to track as a set of flags. */
interface UiState {
  theme: Theme;
  view: View;
  timelineOrient: TimelineOrient;
  draft: Draft;
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
  selChar: string | null;
  selWorld: string | null;
  selBook: string | null;
}

interface StoreState extends UiState {
  doc: StoryDoc;

  // ---- camera ----
  setCamera: (cam: Partial<Camera>) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // ---- doc mutations ----
  setProjectTitle: (title: string) => void;
  moveChapter: (id: string, x: number, y: number) => void;
  addChapter: () => void;
  autoArrangeBoard: () => void;
  setChapterAct: (id: string, act: number) => void;
  bumpChapterAct: (id: string, delta: number) => void;
  patchChapter: (id: string, patch: Partial<Chapter>) => void;
  // ---- scenes ----
  addScene: (chId: string) => void;
  updateScene: (chId: string, idx: number, text: string) => void;
  deleteScene: (chId: string, idx: number) => void;
  moveScene: (chId: string, idx: number, x: number, y: number) => void;
  cycleSceneLink: (chId: string, idx: number) => void;
  arrangeScenes: (chId: string, reset?: boolean) => void;
  addChapterRef: (chId: string, kind: RefKind) => void;
  setStoryNotes: (notes: string) => void;
  applyTemplate: (tplId: string, mode: "insert" | "replace") => void;
  replaceDoc: (doc: StoryDoc) => void;
  toggleSeriesMode: () => void;
  addCharacter: () => void;
  addWorldEntry: () => void;

  // ---- ui ----
  toggleTheme: () => void;
  setView: (v: View) => void;
  setOrient: (o: TimelineOrient) => void;
  toggleDraft: () => void;
  setDragId: (id: string | null) => void;
  openChapter: (id: string) => void;
  closeChapter: () => void;
  toggleNewMenu: () => void;
  closeNewMenu: () => void;
  setPanel: (panel: PanelKey, open: boolean) => void;
  selectChar: (id: string | null) => void;
  selectWorld: (id: string | null) => void;
  selectBook: (id: string | null) => void;
}

export type PanelKey =
  | "showChars"
  | "showWorld"
  | "showNotes"
  | "showExport"
  | "showTemplates"
  | "showImport"
  | "showSeries";

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

const initialUi: UiState = {
  theme: "light",
  view: "board",
  timelineOrient: "vertical",
  draft: "main",
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
  selChar: null,
  selWorld: null,
  selBook: null,
};

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      ...initialUi,
      doc: sampleStory,

      // ---- camera ----
      setCamera: (cam) => set((s) => ({ ...s, ...cam })),
      zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom * 1.15) })),
      zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom / 1.15) })),

      // ---- doc mutations ----
      setProjectTitle: (title) =>
        set((s) => ({ doc: { ...s.doc, projectTitle: title } })),

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
            summary: "A new chapter — double-click to map its scenes.",
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
          return {
            doc: { ...s.doc, chapters: list.concat(nc), links },
            view: "board",
            arrangeN: 0,
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
              // Keep links length === scenes.length - 1.
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

      addChapterRef: (chId, kind) =>
        set((s) => ({
          doc: {
            ...s.doc,
            chapters: s.doc.chapters.map((c) =>
              c.id === chId
                ? {
                    ...c,
                    refs: c.refs.concat({ kind, label: kind === "IMAGE" ? "New image" : "New note" }),
                  }
                : c
            ),
          },
        })),

      setStoryNotes: (notes) => set((s) => ({ doc: { ...s.doc, storyNotes: notes } })),

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
              summary: "—",
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

      toggleSeriesMode: () =>
        set((s) => ({ doc: { ...s.doc, seriesMode: !s.doc.seriesMode } })),

      addCharacter: () =>
        set((s) => {
          const id = uid("p");
          const next = {
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

      // ---- ui ----
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setView: (v) => set({ view: v }),
      setOrient: (o) => set({ timelineOrient: o }),
      toggleDraft: () => set((s) => ({ draft: s.draft === "main" ? "alt" : "main" })),
      setDragId: (id) => set({ dragId: id }),
      openChapter: (id) =>
        set((s) => ({
          openCh: id,
          sceneArrangeN: 0,
          // Lay out scene nodes on first open (or after scene count changed),
          // preserving any manual positions otherwise.
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
    }),
    {
      name: "estoria:store:v1",
      storage: createJSONStorage(() => zustandStorage),
      // Persist the document and durable preferences only — not transient UI.
      partialize: (s) => ({
        doc: s.doc,
        theme: s.theme,
        view: s.view,
        timelineOrient: s.timelineOrient,
        draft: s.draft,
      }),
    }
  )
);
