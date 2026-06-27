# Estoria — Specs & Session Notes

> Living document. This is the source of truth for what Estoria is, how it's
> built, and why. Update it whenever a decision is made or a feature lands.
> Newest session notes go at the **bottom** under "Session Log".

---

## 1. What Estoria is

A **visual story-mapping tool for novelists**. Authors arrange chapters on an
infinite canvas, map the scenes inside each chapter using the **but / therefore**
causality method, track characters and worldbuilding, and export everything as
Obsidian-vault-ready markdown.

It feels like a calm, papery desk tool (warm palette, serif display type), not a
flashy SaaS app. The aesthetic and full feature set come from the original design
prototype in [`Story Mapping WebApp Prototype/`](../Story%20Mapping%20WebApp%20Prototype%20/)
(`Estoria.dc.html` + screenshots) — that folder is the **design reference**, kept
for visual ground-truth. It is a static design-tool export and is **not** the
running app.

### Core concepts

- **Chapter** — a card on the board: number, act, status, title, summary, word
  count, the characters in it, an ordered list of **scenes**, and pinned refs.
- **Scene** — a beat inside a chapter. Consecutive scenes are joined by a
  **connector** typed `therefore` (causal), `but` (conflict), or `and` (parallel).
- **Chapter link** — a connector between two chapters on the board, same 3 types.
- **Character / World entry** — rich reference records.
- **Series** — optional multi-book planning layer above the current book.
- **Draft** — `main` vs `alt`; chapters can carry alternate titles/summaries.

---

## 2. Tech decisions (and why)

| Decision | Choice | Why |
| --- | --- | --- |
| Build tool | **Vite 6** | Fast dev loop, first-class TS, simple config. |
| UI | **React 19 + TypeScript** | Prototype is already React-shaped; types keep the document model honest. |
| State | **Zustand 5** (`persist`) | One store maps cleanly onto the single document model; far less boilerplate than Context/reducers for this much shared, frequently-mutated state. |
| Styling | **Tailwind v4 + CSS variables** | The prototype's design tokens already exist as CSS custom properties; Tailwind v4 consumes them via `@theme`, so we keep the exact look and get utilities for the static chrome. Theming is a `data-theme` attribute swap. |
| Canvas | **DOM + SVG** (not `<canvas>`) | Cards are positioned divs on a transformed world layer; connectors are an SVG path layer. Text stays crisp, selectable, accessible. |
| Persistence | **Local-first**, behind a `StorageAdapter` | Auto-save to the browser + explicit file/markdown export. A cloud backend can be added later by implementing the same adapter — no UI/store changes. |

### Persistence architecture (the growth path to cloud)

Everything hinges on two seams so we can grow from local → cloud incrementally:

1. **One serializable document** — [`StoryDoc`](../src/types.ts) is plain JSON with
   a `schemaVersion`. It's exactly what we auto-save, what the user exports as a
   `.estoria.json` file, and what a server would persist.
2. **`StorageAdapter`** — [`src/store/persistence.ts`](../src/store/persistence.ts)
   defines `load()` / `save()`. v1 ships `LocalStorageAdapter`. Cloud later =
   write `ApiStorageAdapter` against the same interface + swap `activeAdapter`.

What cloud adds later (and only then do we pay for it): **auth** and
**multi-device sync / conflict resolution**. Starting local does not lock us out.

---

## 3. Project layout

```
estoria/
├─ index.html                 # Vite entry, loads Google Fonts
├─ vite.config.ts             # React + Tailwind plugins, "@/" → src alias
├─ tsconfig*.json             # app + node TS projects
├─ docs/SPECS.md              # ← you are here
├─ Story Mapping WebApp Prototype/   # design reference (not built on)
└─ src/
   ├─ main.tsx                # React root
   ├─ App.tsx                 # layout: Toolbar + Board + overlays; theme effect
   ├─ index.css               # Tailwind import + design tokens (@theme)
   ├─ types.ts                # StoryDoc and all model types  ← single source of truth
   ├─ data/sampleStory.ts     # "The Drowned Map" default document
   ├─ store/
   │  ├─ useStore.ts          # Zustand store: doc + UI state + all actions
   │  └─ persistence.ts       # StorageAdapter, zustand storage shim, file save/load
   ├─ lib/
   │  ├─ layout.ts            # board/timeline layout, auto-arrange, fit-to-content
   │  ├─ markdown.ts          # export builder, import prompt + scan
   │  └─ templates.ts         # story-structure skeletons
   └─ components/
      ├─ Toolbar.tsx
      ├─ Board.tsx            # canvas: pan/zoom/drag, cards, connectors
      ├─ ChapterDetail.tsx    # chapter modal: scene flow + act controls
      ├─ ui/Overlay.tsx       # Scrim / CloseButton / stop() primitives
      ├─ panels/              # CharactersPanel, WorldPanel, NotesPanel (right drawers)
      └─ modals/              # ExportModal, TemplatesModal, ImportModal, SeriesModal
```

### Conventions

- Imports use the `@/` alias for `src/` (e.g. `import { useStore } from "@/store/useStore"`).
- All persistent data lives in `doc`; transient UI state (open modals, camera,
  selections) lives alongside it in the store but is **not** all persisted —
  see `partialize` in `useStore.ts` (persists `doc` + durable prefs only).
- Colors/spacing reference design tokens (`bg-bg`, `text-ink`, `text-therefore`,
  `var(--shadow)`). Don't hardcode hex values.
- Runtime-computed styles (card x/y, zoom transform, character `oklch` colors,
  SVG paths) stay as inline `style={}` — Tailwind is for static chrome only.

---

## 4. Feature status

Legend: ✅ done · 🟡 partial · ⬜ not started

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Board | Pan / zoom / drag cards | ✅ | Wheel zooms; drag rearranges; double-click opens detail. |
| Board | Connectors (therefore/but/and) | ✅ | SVG curves, colored by type, alt-draft aware. |
| Board | Auto-arrange | ✅ | Decaying-jitter grid. |
| Board | Add chapter | ✅ | |
| Timeline | Vertical / horizontal layout | 🟡 | Layout + scroll-pan work; fit-to-view on switch not yet wired. |
| Detail | Scene flow canvas | ✅ | Draggable scene nodes, SVG connectors, click pill to cycle therefore/but/and, add/edit/delete scene, auto-arrange. |
| Detail | Edit title / summary / status | ✅ | Inline; status picker Idea/Draft/Done. |
| Detail | Act +/- controls | ✅ | |
| Detail | Pinned refs | 🟡 | Add note/image works; **renaming a ref label** still to do. |
| Characters | List + expand detail | ✅ | Read view complete. |
| Characters | Add | 🟡 | Adds a stub; **inline editing of fields** to do. |
| World | List + expand detail | ✅ | |
| World | Add / edit / refs | 🟡 | Add stub; editing + ref add to do. |
| Notes | Story notes editor | ✅ | Auto-saved, in export. |
| Templates | Insert / replace skeletons | ✅ | 6 structures. |
| Import | AI prompt + file scan | 🟡 | Prompt copy + summary work; **parsing markdown into the doc** not yet implemented. |
| Export | Markdown (Obsidian) | ✅ | Copy + download. |
| Export | Project file (.json) | ✅ | Save; **load/open** still to wire into UI. |
| Series | Planner view + mode toggle | ✅ | Read view; add/edit book to do. |
| App | Light/dark theme | ✅ | |
| App | Drafts (main/alt) | ✅ | Toggle swaps titles/summaries/alt connectors. |
| Persist | Local auto-save | ✅ | Via zustand persist → LocalStorageAdapter. |
| Persist | Project title editing | ⬜ | Field exists; no UI to rename yet. |

---

## 5. How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run typecheck  # types only
```

Node 20+ (developed on Node 24). VS Code: install the recommended extensions
(`.vscode/extensions.json`) for Tailwind IntelliSense + ESLint/Prettier.

---

## 6. Roadmap (suggested order)

1. ~~**Full chapter-detail editing**~~ — ✅ done (Session 2).
2. **Inline editing for Characters & World** — turn the read views into editable
   forms; wire ref add (note/image).
3. **Open project file** — file picker → `replaceDoc`, plus drag-drop onto the board.
4. **Markdown import parser** — turn the scanned `.md` into a real `StoryDoc`.
5. **Timeline polish** — fit-to-view on switch, act band labels.
6. **Project rename**, multi-document picker (the adapter already allows `list()`).
7. **(Later) Cloud backend** — `ApiStorageAdapter`, auth, sync.

---

## 7. Session Log

### 2026-06-27 — Project scaffolded (Session 1)

- Reviewed the design prototype (`Estoria.dc.html` + 6 screenshots). Confirmed it's
  a static design-tool export; extracted the data model, sample story, templates,
  import prompt, and export format from its embedded logic.
- Decisions locked with the user: **Vite + React + TS + Zustand**, **local-first
  auto-save + file/markdown export behind a `StorageAdapter`**, **Tailwind v4 +
  existing CSS variables**.
- Scaffolded the full project: config, design tokens, `StoryDoc` model, sample
  story, Zustand store with persistence, layout/markdown/template libs.
- Built a working vertical slice: Toolbar, Board (pan/zoom/drag/connectors/
  auto-arrange), Chapter Detail (scene flow + act controls), Characters/World/
  Notes panels, and Export/Templates/Import/Series modals.
- Verified: `npm run build` passes (51 modules), dev server renders with no console
  errors, design matches the prototype.
- Remaining work captured in §4 (status table) and §6 (roadmap).

### 2026-06-27 — Chapter-detail editing + CSS fix (Session 2)

- Built the full chapter-detail craft loop: draggable scene-node canvas with SVG
  connectors, **click a connector pill to cycle therefore/but/and**, add / edit
  (inline textarea) / delete scenes, auto-arrange, plus inline editing of chapter
  title, summary, and an Idea/Draft/Done status picker. New store actions:
  `patchChapter`, `addScene`, `updateScene`, `deleteScene`, `moveScene`,
  `cycleSceneLink`, `arrangeScenes`, `addChapterRef`. `openChapter` now lays out
  scene positions on first open (preserving manual drags).
- **Important CSS fix:** removed the global `* { margin:0; padding:0 }` reset from
  `index.css`. Tailwind v4 emits utilities inside `@layer`, and **unlayered CSS
  beats layered CSS regardless of specificity**, so that reset was silently
  zeroing every Tailwind margin utility app-wide (e.g. `ml-auto`, chip overlaps,
  textarea margins). Tailwind's preflight already provides the reset. Do not
  re-add an unlayered universal reset — see the note in `src/index.css`.
- Verified in-browser: connector cycling, add scene, inline edits, drag, and
  right-aligned toolbar all work; `npm run build` passes.
