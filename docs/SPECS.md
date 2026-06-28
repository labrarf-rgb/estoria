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

### 2026-06-27 — Multi-book, versions, editing everywhere (Session 3)

Large milestone + fix batch. **Schema bumped to v2** (persist `migrate` discards
older persisted docs and reloads the sample, so no broken shapes on upgrade).

Data model (`src/types.ts`):
- **Multi-book** via an "active-set + stash" design: the active book's board lives
  top-level (`chapters`, `links`, `storyNotes`) so canvas components stay simple;
  inactive books are stashed in `bookData[bookId]` and swapped in by `switchBook`.
  `books: BookMeta[]` replaces the old `series` array.
- **Draft versions**: `drafts: DraftVersion[]` + `activeDraftId`. Per-chapter
  `overrides[draftId] = {title?, summary?}`. The "main" draft is the base text;
  editing under any other draft writes overrides. Helpers in `src/lib/drafts.ts`
  (`resolveTitle`, `resolveSummary`, `displaySummary`). Replaces the hardcoded
  main/alt flags + `altTitle`/`altSummaryFlag`.
- **Shared assets** (`assets: Asset[]`): book-level notes/images that can be linked
  into any chapter (`linkAssetToChapter`). Managed in the Notes panel library.
- **Richer refs**: `PinnedRef` now has `id`, `body` (note text), `src` (image data
  URL), and optional `assetId`. Chapter `notes` field added.

UI work:
- Editable everywhere: project title (toolbar), characters & world (all fields,
  add/delete), world/chapter refs (add/edit/delete), chapter character membership
  (toggle chips), chapter notes, scenes (already), book meta (Series planner).
- **Image upload + lightbox**: `RefList` (`src/components/ui/RefList.tsx`) handles
  note/image refs with file upload (stored as data URLs); images open in
  `Lightbox.tsx` with click-to-zoom. Reused by chapter detail, World, and Notes.
- Toolbar: editable title; **version dropdown** (select/add/delete versions);
  **Series button** to zoom out to the multi-book view; **orientation as always-
  visible ↓/→ arrow buttons** next to Board/Timeline (fixes the layout shift from
  the old appearing/disappearing segmented control); **New menu now leads with
  "New book"**. New chapter / Auto-arrange and the canvas hint moved to a top
  strip (`BoardActions.tsx`). Footer (`Footer.tsx`) shows the autosave stamp and
  "Built by Ray Labra" → labrarf.com.
- Autosave already happened via zustand `persist`; the footer now surfaces it.
- Em dashes removed from UI chrome / labels / template blurbs. (Sample-novel prose
  in `sampleStory.ts` keeps its dashes — it's example content, not UI.)

Verified in-browser: version override (ch8 → "The Drowned Return" under Alt),
book switching (Book Two empty board ↔ Book One's 8 chapters restored from stash),
Series planner editing, chapter character toggles, status picker. `tsc -b` clean.

Known cosmetic limitation: the toolbar is dense and clips on the right below
~1100px viewport width; fine at desktop widths. Candidate for a future overflow
menu.

### 2026-06-27 — Series story-map + single toolbar (Session 4)

- Consolidated to a single toolbar (removed the BoardActions strip): New chapter
  and Auto-arrange now live on the bar; the canvas hint moved to the footer. The
  bar is `overflow-x-auto` so nothing is ever unreachable; theme is icon-only;
  the series/book control is hidden until the project is a series.
- **Series story-map** (schema v3). BookMeta gained `x`, `y`, `notes`; new
  `bookLinks: BookLink[]` (plain connectors, multiple per pair, optional labels).
  `SeriesMap.tsx` is a pan/zoom canvas of draggable book cards (inline title/
  synopsis/status, chapter & word counts, Open). Connect mode draws labeled
  multi-connectors between books; labels are editable and deletable.
- **Hierarchy + navigation**: `level: 'series' | 'book'` UI state. Toolbar shows a
  `Series ▸ Book One` breadcrumb when seriesMode is on; double-click / Open a book
  to drill into its chapter board, click `Series` to zoom back out. The old
  Series planner *modal* was removed in favor of the map (SeriesModal.tsx deleted);
  "+ New" now offers "Make this a series" / "Open series map".
- Defensive: SeriesMap and the book-link store actions tolerate a missing
  `bookLinks` array (older/partial persisted docs).
- Verified in-browser: enabling series mode, the map with sample book links,
  drill-in to a book board, breadcrumb back to the map. `tsc -b` + `vite build`
  clean.

### 2026-06-27 — Fixes + onboarding + series timeline (Session 5)

- **Dropdown bug fix**: the toolbar's `overflow-x-auto` was clipping the version
  and "+ New" menus (overflow-x:auto forces overflow-y:auto). New
  `components/ui/Popover.tsx` renders menus into a `createPortal` with `fixed`
  positioning anchored to the trigger, so they escape any ancestor clipping.
- **Board auto-fit** (`Board.tsx`): fit-to-content on first load and on book
  switch (keyed on `activeBookId`); when a newly added chapter lands off-screen,
  auto fit-to-screen (visibility check against the current camera).
- **First-launch welcome** (`Welcome.tsx`): persisted `onboarded` flag; on first
  run the user picks "Explore the sample" (`useSample`) or "Start fresh"
  (`startFresh` → `emptyStory()` + opens Templates for creation options).
  `data/emptyStory.ts` is the blank-project factory.
- **Series-level timeline**: the Board/Timeline + ↓→ controls now show at the
  series level too; `SeriesMap` lays books in reading order (vertical/horizontal)
  when `view === 'timeline'`, free canvas positions otherwise. Drag is disabled in
  timeline mode. Toolbar labels the spatial view "Map" at series level.
- **Book cover images**: `BookMeta.coverSrc?`; series cards show an upload "+ Add
  cover" affordance, render the cover as a banner, and open it in the lightbox on
  click.
- Verified in-browser: welcome flow, auto-fit on load + on add, portal dropdowns,
  series timeline layout, delete-chapter cleanup. `tsc -b` + `vite build` clean.

### 2026-06-27 — Multi-project, File menu, header redesign (Session 6)

- **Multi-project library**: independent projects, each its own `StoryDoc`. Store
  keeps the active `doc` plus `projectStash` (inactive full docs) and derives the
  list via `listProjects()`. Actions: `switchProject`, `newProject({series,
  keepCurrent})`, `deleteProject` (never leaves zero projects). `projectStash` is
  persisted. New `ProjectsModal` ("Open project") lists/switches/deletes/creates.
- **Header redesign** (`Toolbar.tsx`): "Estoria" wordmark; an `EditableName`
  component shows the real Series name ▸ Book name (single click navigates,
  double-click renames); words/chapters stat sits under the names; the version
  dropdown moved to the right of the names. Versions are renamable inline (radio
  to activate, input to rename, ✕ to delete) plus "+ Add version".
- **File menu** (replaces "+ New"): New book, New chapter, Use a template, Import
  markdown, Open project, Make this a series (when standalone), Export. "Open
  series map" removed (the series name in the header navigates there).
- **New-book chooser** (`NewBookModal`): Standalone / Start a series / Add to an
  existing series (lists series projects). Before a new project replaces the
  current one it prompts: Keep it / Export a copy then keep / Discard.
- **Chapter modal**: characters AND world entries are linkable via toggle chips
  (`toggleChapterChar`, `toggleChapterWorld`; `Chapter.worldRefs`).
- Verified in-browser: header names/stat/version, File menu items, projects
  create/switch/delete (two independent projects), save-current prompt, chapter
  world/character toggles. `tsc -b` + `vite build` clean.
