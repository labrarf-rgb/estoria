# Estoria — Session Log

> Dated record of every working session: what changed, why, and what was
> verified. **Newest entries at the bottom** — append one per session.
>
> This file is *history*, not the current state. For what Estoria is and how
> it's built today, read [`SPECS.md`](SPECS.md) — and when a feature lands,
> update the relevant SPECS section in the same session, not just this log.
> All `§N` references below point at SPECS.md sections.

---

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

### 2026-06-28 — Confirmations, overflow, chapter polish, project merge (Session 7)

- **Global confirm dialog**: store `askConfirm({message,detail,danger,onConfirm})`
  + `ConfirmDialog`. All destructive deletes route through it (chapter, scene,
  ref via RefList, character, world entry, version, book, book link, project).
- **Toolbar**: dropped the "E" box for an italic-serif "Estoria" wordmark. Zoom +
  theme collapse into a "⋯" menu only when the bar overflows (ResizeObserver with
  190px hysteresis to avoid flip-flop).
- **Chapter modal**: editable per-chapter word count (sums into the book total);
  Characters and World sections are now member lists with explicit remove (✕) and
  an add-picker (existing + create new), not highlight-all; "World in this
  chapter" renamed to "World details"; Scene flow has an Expand toggle
  (40vh ↔ 74vh); pinned references use uniform fixed-size cells so they align.
- **Project merge** (`mergeProjectIntoSeries`): move a standalone project's
  book(s) + characters/world/assets into an existing series, then drop the source.
  Surfaced as "Merge" in the Projects modal.
- Verified in-browser: wordmark, editable words, char/world add+remove pickers,
  delete confirmation prompt, multi-project. `tsc -b` + `vite build` clean.

### 2026-06-28 — Per-book versions, timeline act bands, modal/series fixes (Session 8)

- **Versions are per book** (not per series). `drafts` + `activeDraftId` moved into
  `BookData`; the top-level `drafts`/`activeDraftId` now represent the *active*
  book's versions and are stashed/restored alongside chapters/links/notes in
  `switchBook`, `addBook`, and `mergeProjectIntoSeries`. The version dropdown is
  hidden on the series map (it's a book-level concern). Sample data: Book One has
  `[Main draft, Alt ending]`; Books Two/Three start with `[Main draft]`.
  Verified: Book 1 shows both versions, Book 2 only `Main draft`.
- **Scene-card stacking fix** (`ChapterDetail.tsx`): the scene canvas is now an
  isolated stacking context (`isolate`), so its absolutely-positioned scene cards
  (z-5/z-10) no longer paint over the sticky modal header when the modal scrolls.
- **Series connect fix** (`SeriesMap.tsx`): the viewport only pans / cancels
  connect mode on a *background* mousedown — card mousedowns are ignored via a
  `[data-book-card]` guard. Previously a bubbled card mousedown (notably in
  timeline mode, which doesn't stop propagation) cancelled connect mode before the
  click registered, so books couldn't be connected. Verified: link count 3→4.
- **Series File menu**: "New chapter" and "Use a template" are book-level only and
  are hidden on the series map.
- **Scene flow expanded by default**: the chapter modal opens with the scene
  canvas expanded; expanded mode now uses a wider modal (`min(1320px, 96vw)`) and a
  taller canvas (`78vh`) to take up more of the screen. Toggle reads Collapse/Expand.
- **Act bands in the book timeline** (`Board.tsx`): in timeline view, each Act gets
  a labelled dashed band behind its (consecutive) chapters — "Act I / II / III" —
  so the grouping is visible. Works in both vertical and horizontal orientations;
  bands sit behind connectors/cards and pan/zoom with the canvas.
- All changes verified in-browser; `tsc -b` clean. Committed locally (not pushed to
  GitHub yet — remote setup to be discussed).

### 2026-06-28 — Markdown import parser + open from disk (Session 9)

- **Import actually works now.** `parseImportMarkdown(text, fileName)` in
  `lib/markdown.ts` turns the import-prompt schema into a complete `StoryDoc`:
  title + premise; `## Characters` (`**Name** — role | archetype` plus
  bio/traits/goals/motivations and a combined `Wants: … | Needs: …` line);
  `## World` (`**Name** [Category] — desc // Notes: …`); and `## Act N` → `### n.
  Title · 3,200 words` with a `> summary`, a `Scenes:` numbered list whose
  `(therefore|but|and)` tags become scene connectors, and a `Characters:` line.
  Tolerant of AI drift (smart dashes, missing optional fields, spacing); unknown
  chapter character names are created as stub characters so nothing is dropped.
  Chapters are grid-laid-out and chained with `therefore` links.
- **Import modal** parses the dropped file, shows accurate counts (chapters/
  scenes/characters/world), reports a clear error if no chapters are found, and
  opens the result as a **new project** (current project stays in the library).
- **`openDoc(doc)`** (store): stash current project, activate the incoming doc
  (fresh id on collision). Shared by import and open-from-disk.
- **Open from disk**: "Open file..." in the Projects modal reads an exported
  `.estoria.json` via `readProjectFile` → `openDoc`, with an error on bad files.
- Verified in-browser with a fresh sample manuscript ("The Glass Orchard"):
  3 chapters / 8 scenes / 2 characters / 3 world parsed correctly — board cards,
  word counts, scene connectors (Therefore/But), character chips, and World
  categories all correct. `tsc -b` + `vite build` clean.
- Roadmap: the two main functional gaps are now closed. Remaining: drag-drop file
  onto the board (nice-to-have), timeline fit-on-switch, and the cloud/integrations
  work (§4, §7). Still local-only — not pushed to GitHub.

### 2026-06-28 — Import-prompt rewrite, snap/arrange, overflow fix (Session 10)

- **Import prompt hardened** (`importPrompt`): explicit "organizer, not co-author"
  framing with absolute-fidelity rules (don't invent/continue/embellish; leave
  unknown fields blank) to stop models like Gemini from fabricating. Asks for a
  **downloadable `.md` named `<Title> - estoria download.md`** (or a `FILENAME:`
  first line if it can't attach), and explicitly supports **paste OR file
  attachment** (use the attachment if both). Parser already tolerates a leading
  `FILENAME:`/code-fence line.
- **Timeline → board snap** (`Board.tsx`): returning to the board from the
  timeline now fits-to-content, so the timeline's scroll position no longer leaves
  the board looking empty.
- **Auto-arrange also fits** the arranged grid to the visible board (additive;
  the grid/jitter algorithm is unchanged) — result is always on-screen.
- **Toolbar overflow fix**: the ⋯ (collapsing zoom/theme) now appears **only when
  the bar truly overflows**. Rewrote the measure to remember the expanded
  `fullWidth` and expand back once `clientWidth ≥ fullWidth + 8`, re-measuring via
  `useLayoutEffect` each render + ResizeObserver + window resize (the old
  guess-from-compacted-width heuristic got stuck compact).
- Verified in-browser: ⋯ hidden at 1600px / shown at 980px / hidden again at
  1600px; timeline-pan then back-to-board shows cards; auto-arrange fits all 8
  sample chapters on screen. `tsc -b` clean.

### 2026-06-28 — Structure templates expanded; New-project modal fix (Session 11)

- **Projects modal "+ New project" fix**: it opened the New Book chooser *behind*
  the still-open Projects modal (looked like nothing happened). Now closes Projects
  first, so the chooser is on top.
- **Story-structure templates** (`lib/templates.ts`) expanded from the in-house
  "Narrative Frameworks and Story Structure Research" compendium:
  - **Single Blank Chapter is now the first option** in the Templates modal.
  - **Hero's Journey split** into two entries: **Vogler (12 stages)** and
    **Campbell (17 stages)** with the full Departure/Initiation/Return taxonomy
    ("Woman as Temptress" modernized to "Temptation").
  - **New frameworks added**: Dan Harmon's Story Circle (8), Story Grid Five
    Commandments (Coyne), Kishotenketsu (4-act, no-conflict — uses a real Act 4),
    Propp's Morphology (folktale functions), Sanskrit Panchasandhi
    (Natyasastra), Jo-ha-kyu (pacing). Existing three-act/Save the Cat/romance/
    mystery retained.
  - Deliberately NOT added as chapter templates (they aren't one-chapter-per-beat
    structures): Snowflake Method, Scene-&-Sequel, MRUs, GMC, McKee value charges,
    Vonnegut shapes, interactive-fiction topologies. Candidates for other UI later.
- Source note: research lives in the user's Obsidian vault ("Narrative Frameworks
  and Story Structure Research.md"), outside the repo.
- Verified in-browser (Templates order + new entries render); `tsc -b` + `vite
  build` clean. Local only — not pushed to GitHub.

### 2026-06-28 — Shipped to Pages; smarter auto-arrange (Session 12)

- **Live**: merged `multi-book-and-editing` → `main`, created public repo
  `labrarf-rgb/estoria`, added Vite `base: /estoria/` (prod only) and a GitHub
  Actions Pages workflow. Site auto-deploys on push to main:
  https://labrarf-rgb.github.io/estoria/ (embedded on labrarf.com — beta).
- **Auto-arrange maximizes board space** (beta feedback: 17-stage Hero's Journey
  was a fixed 4-wide grid → tiny 69% fit on a 13" MacBook Air). New
  `bestColumns(n, vpW, vpH)` in `lib/layout.ts` picks the column count whose
  fit-to-content zoom is largest (ties break toward the grid aspect closest to
  the viewport, so small boards don't become a tall single column). `autoArrange`
  takes an optional `cols`; the Board reports its size to the store
  (`setBoardSize` via ResizeObserver) and `autoArrangeBoard` feeds `bestColumns`.
  Also tightened the grid + fit padding (gaps 48/56, margin 28, `FIT_PAD` 36,
  shared by `autoArrange`/`bestColumns`/`fitToContent`) so the fit zooms in to
  actually fill the board instead of leaving big margins. The `FIT_ZOOM_MAX`
  (1.05) cap keeps a 1–4 card book from blowing up to oversized cards.
  Verified: 17 chapters lay out 5-per-row and fill the board (~85%); a 4-beat
  book stays at a normal ~105% size, centered.
- **Balanced grids on ties** (beta follow-up): on a wide screen, small counts hit
  the zoom cap for several column counts; the tie-break now prefers a square-ish
  grid (closest to `ceil(sqrt(n))`, nudged toward more columns) instead of
  matching the viewport aspect — so 4 cards become 2x2, not 3+1. The
  maximize-zoom path is unchanged, so larger counts still spread wider to use the
  available width. Verified: 4 cards = 2x2 at 1680px wide.
- **Scene auto-arrange fills the visible canvas** (beta follow-up): the chapter
  modal's scene canvas isn't zoomed, it scrolls, so `sceneColumnsForWidth(n, visW)`
  packs as many columns as fit the *visible* canvas width; `sceneAutoArrange`/
  `arrangeScenes` take an optional `cols`. The chapter modal measures the scene
  box (`sceneBoxRef`) at click time, so Auto-arrange lays out into more columns
  when expanded and fewer when collapsed — each mode fills its own width.
  Verified: 12 scenes → ~5 columns expanded (box ~1252px) vs 3 collapsed
  (box ~912px).

### 2026-06-30 — Expandable notes + card/list ref views (Session 13)

Readability + browsing pass over notes and references. Two small reusable UI
primitives now back every notes/refs surface:
- **`ui/ExpandableTextarea.tsx`** — a textarea with an Expand/Collapse pill (swaps
  a compact row count for a tall fixed height) plus native `resize-y` drag, so any
  reading/editing area can be made longer.
- **`ui/ViewToggle.tsx`** — a small segmented Card / List switch (values `"card"`
  / `"list"`, exported `RefView` type).
- **`RefList` gained a `view` prop.** Card view is unchanged (fixed-size grid);
  the new **list view** renders compact rows (icon · title · snippet) that you
  click to expand into an inline detail editor — note title + body, or image
  title + thumbnail/upload. Add/Link buttons sit in a row beneath the list.

Wired into all three consumers:
- **Story notes** (`NotesPanel`): the main notes textarea is now an
  `ExpandableTextarea` (9 rows collapsed → 62vh expanded); the shared library has a
  Card/List toggle.
- **World detail** (`WorldPanel`): Description and Notes are `ExpandableTextarea`s
  (40vh expanded, `pr` reserved for the pill); each entry's References have a
  Card/List toggle (shared view state across entries).
- **Chapter modal** (`ChapterDetail`): Chapter notes is an `ExpandableTextarea`
  (3 rows → 52vh); Pinned references have a Card/List toggle.

Verified in-browser on the sample: story-notes expand + library list view with
click-to-expand; chapter notes expand; pinned-refs list view (image row expands to
its upload/thumbnail, note row to title+body); world Description/Notes expand +
References Card/List toggle. `tsc -b` + `vite build` clean (65 modules).

Follow-ups: **list is the default** ref view (RefList prop + all three consumers'
initial state); Card is one click away.

### 2026-06-30 — Collapsible chapter-modal sections (Session 14)

The chapter modal was getting tall. Its sections can now be **collapsed to a
single header row** that stays visible (same disclosure idea as the Characters /
World side-panel entry cards), so you can compact what you're not using and shrink
the modal.

- **Which sections:** Characters, World details, Chapter notes, Pinned references.
  Scene flow is deliberately excluded — it already has its own Collapse/Expand
  sizing toggle (40vh↔78vh) and two competing controls would confuse.
- **`SectionHeader`** (local to `ChapterDetail.tsx`): a clickable label + `▸/▾`
  chevron; collapsing hides the body. Shows a light count hint when there's content
  (`CHARACTERS · 2`, `PINNED REFERENCES · 1`, chapter notes shows `· written`).
  The refs view (Card/List) toggle rides in the header's `right` slot and only
  shows when that section is expanded.
- **Persisted, global** collapse state: new store field
  `chapterSectionsCollapsed: Record<ChapterSection, boolean>` (`ChapterSection =
  "chars" | "world" | "notes" | "refs"`) + `toggleChapterSection`, added to
  `partialize` so it survives reloads. It's a global preference (applies to every
  chapter), not per-chapter — collapse Pinned references once and every chapter you
  open opens it collapsed. Older persisted state without the key falls back to the
  all-expanded default via zustand's shallow merge (no migration needed).

Verified in-browser: collapsing Characters/World/Notes/Refs compacts each to a
header row while Scene flow stays open; localStorage shows the four flags; reload
restores them. `tsc -b` + `vite build` clean.

Follow-up (same session) — **the remaining view/size states now persist too**, all
as global prefs added to `partialize`:
- `refView: RefView` — the Card/List choice, shared across chapter pinned refs, the
  story-notes library, and world refs (one setting, `setRefView`). The three
  consumers dropped their local `useState` for the store value.
- `textareaExpanded: Record<TextareaKey, boolean>` (`"storyNotes" | "chapterNotes"
  | "worldDesc" | "worldNotes"`) + `toggleTextarea` — remembers each expandable
  textarea's tall/short state. `ExpandableTextarea` gained optional controlled
  props (`expanded` / `onToggleExpanded`); it still self-manages when they're
  omitted.
- `sceneFlowExpanded: boolean` + `setSceneFlowExpanded` — the chapter modal's
  scene-flow Collapse/Expand (replaces its old local `expanded` state; default
  still expanded).
  Verified: set Card view + collapse scene flow + expand chapter notes, reload →
  all three restored from localStorage. `tsc -b` + `vite build` clean.

### 2026-06-30 — Even scene grid, connectors clear of text (Session 15)

The and/but/therefore connector pills were painting over scene-card text, and the
scene layout's decaying jitter made the spacing look uneven.

- **Even grid** (`lib/layout.ts`): `sceneAutoArrange` drops the jitter/stagger —
  scenes lay out on a plain equal-gap grid. Equal gaps also keep every connector
  pill parked in the space between cards.
- **Wider horizontal gap:** `SCENE_GAP_X` 44 → **88** (the widest pill, "Therefore",
  measures ~79px, so 88 clears it with the cards' 13px padding as slack);
  `SCENE_GAP_Y` 40 → 48. Now a horizontally-adjacent connector sits in the gap, not
  over text; row-wrap connectors land in the vertical gap between rows.
- **Expand fits 5 / collapse fits 3:** the expanded chapter modal widened to
  `min(1500px, 96vw)` (was 1320) so five 208px cards + four 88px gaps fit across;
  collapsed stays `min(980px, …)` → three across. `sceneColumnsForWidth` (unchanged
  formula) yields 5 vs 3 at those widths.
- **Auto-reflow on mode toggle:** toggling Scene-flow Collapse/Expand now
  re-arranges to the new column count (an effect in `ChapterDetail` that fires only
  on an actual toggle, via a prev-value ref, so it never clobbers manual drags on
  open or chapter-switch). `openChapter` also seeds a fresh chapter's layout using a
  width estimate for the current mode (`window.innerWidth`-based), so it opens
  already filled.

Verified in-browser at 1680px: 7 scenes lay out 5-across expanded with all
BUT/THEREFORE pills sitting in gaps (no text covered), then reflow to 3-across on
Collapse. `tsc -b` + `vite build` clean.

### 2026-07-01 — Scene drag-to-reorder, long-press insert, ref delete placement (Session 16)

Scene positions in `scenePos` are always a clean auto-arranged grid now (nothing
freeform left), so scene dragging was reworked from "move to an arbitrary x/y" into
a real **reorder**, plus two smaller fixes.

- **Add scene auto-arranges.** `addScene`/new `insertScene` (`useStore.ts`) recompute
  the whole grid via `sceneAutoArrange` instead of nudging the new card's position by
  a fixed offset, so a new scene always lands in a proper grid slot. `moveScene`
  (arbitrary x/y) is removed — it was already inconsistent with `openChapter`'s
  grid-seeding behavior.
- **Drag-to-reorder with live preview** (`ChapterDetail.tsx`): dragging a scene card
  now previews the drop: every other card reflows to the grid position it'll land in,
  a dashed placeholder marks the target slot, and the grabbed card follows the
  cursor as a ghost. The reorder only commits (new store action `reorderScene`) on
  mouseup, and only if the pointer is actually over a slot — dragging further just
  keeps moving the preview. `sceneLinks` (the therefore/but/and connectors) are
  treated as positional (a gap between cards, not tied to a specific scene), so a
  reorder always ends with a valid `scenes.length - 1` links array — connector
  continuity is never broken. Connectors are hidden while dragging to avoid
  stale-looking lines mid-reflow.
- **Long-press Add scene to insert**: holding the button ~220ms spawns a draggable
  "New scene." ghost using the same preview/insert mechanism as an existing-scene
  drag (`insertScene`); a quick click still just appends to the end.
- **Auto-scroll while dragging**: a `requestAnimationFrame` loop scrolls the scene
  canvas up/down when the pointer nears its top/bottom edge, so reordering works on
  chapters with more scenes than fit on screen.
- New `sceneSlotFromPoint` (`lib/layout.ts`) maps a canvas-local point to a row-major
  grid slot — shared by the live preview and the commit logic. Bug caught in
  testing: the mousemove handler was computing the grid's column count from a
  different item total (`n-1`) than the render preview used (`n`), desyncing the
  detected drop slot from what was visually shown; fixed by unifying both on the
  same "total slots including the gap" value.
- **Pinned reference notes** (`ui/RefList.tsx`, list view): the delete (✕) was
  sitting right next to the expand/collapse caret, easy to mis-click. Removed it
  from the collapsed row; it now only appears in the expanded body, next to the
  title field.

Verified in-browser (sample chapter, "The Drowned Map"): dragging a scene mid-list
reflows the other cards and commits to the right position; dragging to the far
bottom appends it last; long-press Add scene previews and inserts between two
existing scenes; a quick click still appends normally; expanding a pinned note shows
its delete button, the collapsed row shows only the caret. `tsc -b` + `vite build`
clean. Committed and pushed to `origin/main`.

### 2026-07-01 — Reorder chapters & books (board + timeline), series auto-arrange, "+ New book" (Session 17)

Brought the scene reorder idea (Session 16) to the chapter board and the series
map. This went through several rounds of user feedback; the notes below describe
the **final** shape, not the intermediate drafts.

Two reorder gestures per view, because board/map are a freeform corkboard while
timeline is an ordered lane:

- **Timeline view (chapters & books)** — the clean, dedicated reorder. Dragging a
  card live-splices a preview order and every card (including the dragged one)
  reflows to the resulting sequential slots; commit on release. Positions are
  derived from array order here, so nothing needs auto-arranging afterward.
  Implemented in `Board.tsx` (`timelineChapterPositions`) and `SeriesMap.tsx`
  (`timelineBookPositions`) — both new standalone helpers in `layout.ts` that
  take an arbitrary ordered list so a candidate order can be previewed without
  mutating the store.
- **Board / map view (freeform)** — drop a card onto another → **confirm dialog**
  → resequence **and** auto-arrange so the change is visible and threads stay
  clean. (Earlier iterations left positions untouched, which read as "nothing
  happened" / left cards stacked — the user asked for the auto-arrange follow-up.)

Key fixes discovered through testing:

- **Threads followed the old order after a reorder.** Chapter connectors are a
  consecutive `chapter[i]→chapter[i+1]` "therefore" chain wired *by id*; reordering
  the array left the chain pointing at the old sequence, so lines crisscrossed.
  There's no board UI to retype chapter links (connectors are plain `<path>`, no
  click handler), so `reorderChapter` now **rebuilds the chain** to follow the new
  order, carrying over any existing type on an adjacency that didn't move. Book
  links (`bookLinks`) are user-drawn labeled connections, not a sequence chain, so
  `reorderBook` leaves them alone.
- **Position updates lagged the connectors during a fast drag.** The board drag
  now coalesces move + hit-test into one `requestAnimationFrame` per frame
  (`pendingDragPos`/`dragRaf`), flushed on mouseup, so card, threads, and the
  drop highlight stay in lockstep.
- **Auto-arrange had lost its character** — `amp = 0.6^arrangeN` decays to 0, so
  repeated arranges snapped to a rigid grid. Floored at `0.15`: it still eases
  toward straight (max tilt ~3.3°→0.5° over clicks) but never lines up perfectly.
- **Book cards weren't grabbable.** Unlike chapter cards (display-only text), book
  cards are almost fully covered by the title `<input>`, premise `<textarea>`,
  status `<select>`, and buttons — the drag guard bailed on all of them, so a real
  click never started a drag ("reorder isn't working in series view"). Added a
  visible **drag-handle grip** (dot grid, grab cursor, "Drag to reorder" tooltip)
  left of each book's number badge; the card cursor is now default so only the
  handle advertises dragging.

New this session:

- **Series auto-arrange** (`layout.ts` `bookAutoArrange` / `bestBookColumns` /
  `fitBooksToContent`; store `autoArrangeSeries` + `seriesArrangeN`): lays books
  on a reading-order grid with slight deterministic jitter, sized to the map
  viewport. `SeriesMap` reports its size via `setBoardSize` and re-fits its camera
  on each arrange (keyed on `seriesArrangeN`). Surfaced as an **"Auto-arrange"**
  toolbar button on the series map, alongside a new **"+ New book"** button
  (mirrors "+ New chapter"; the floating corner button and File-menu →
  `NewBookModal` remain).
- **Highlight** is a soft translucent glow ring (`box-shadow` + `color-mix`), not
  a solid border/outline; the dragged card gets a gentle lift shadow.
- New store actions: `reorderChapter`, `reorderBook`, `autoArrangeSeries`.

Verified in-browser on the sample (8-chapter book + 4-book series): board reorder
resequences `01..08` and re-arranges with clean threads; timeline reorder reflows
live for chapters and books; series auto-arrange grids the books (0 overlaps) and
fits the camera; grip-drag reorders books and repositions freely; repeated
auto-arrange approaches straight but keeps a faint tilt. `tsc -b` + `vite build`
clean (65 modules).

### 2026-07-01 — Series-map cover/grab redesign, timeline scroll, project-list & make-series fixes (Session 18)

Five user-reported fixes, all on the series level plus the project library:

- **Series book card redesigned.** The book **cover moved from the top of the card
  to under the title**, and the number-badge + title row is now the grabbable top
  of the card (`cursor-grab`, kept the dot-grid grip). A set cover now shows
  **Change** / **Remove** controls on hover (`group/cover` + `opacity` transition);
  Remove clears it via `updateBook(id, { coverSrc: undefined })` and the "+ Add
  cover" affordance returns. Previously the cover occupied the top as a
  button/label, so the top wasn't draggable and there was no way to change/delete a
  cover once set (`SeriesMap.tsx`).
- **Series timeline now scrolls like the chapter timeline.** `SeriesMap`'s wheel
  handler previously always zoomed; it now **pans** in timeline view (vertical:
  `panY -= deltaY`; horizontal: `panX -= deltaY+deltaX`) and only zooms on the map,
  mirroring `Board.tsx`. Effect now keys on `[timeline, orient]`.
- **Removed the floating on-canvas "+ New book" button** from the series map; the
  "New book" entry points remain in the toolbar (series-map action) and File →
  `NewBookModal`. Dropped the now-unused `addBook` import in `SeriesMap`.
- **Deleting a project now updates the list immediately.** `ProjectsModal` read the
  project list via the non-reactive `listProjects()` method and only subscribed to
  `doc.id`, so deleting a *stashed* (non-active) project changed `projectStash`
  without re-rendering — the row lingered until a manual refresh. The modal now also
  subscribes to `doc` and `projectStash`, so add/delete/merge re-render at once.
- **"Make this a series" keeps the book's name.** New `makeSeries` store action
  (wired into the File menu, replacing the raw `toggleSeriesMode` call): promoting a
  standalone book copies the current `projectTitle` onto the active (first) book and
  sets the series title to **"Untitled Series"** for the user to rename — instead of
  leaving the story's name on the series and "Untitled Book" on the book.

Verified in-browser on the sample: make-series yields series `Untitled Series` ▸
book `Untitled Voyage`; timeline wheel pans (panY 30 → −670, zoom unchanged); cover
Add/Change/Remove all work under the title; deleting a non-active project removes it
from the list with no reload. `tsc -p tsconfig.app.json --noEmit` clean, no console
errors.

### 2026-07-01 — Full code review + cloud/auth/hosting decisions (Session 19)

Review-only session: no code changed; SPECS.md restructured instead.

- **Decisions locked** (recorded in the new **§8**): Sign in with Google via
  Google OAuth directly (no Supabase/Firebase for auth); storage in the user's
  own Google Drive via a `GoogleDriveStorageAdapter` behind the existing
  `StorageAdapter` seam, `drive.file` scope only; local-first stays as the
  offline cache with a first-login migration offer; web + Android share the
  same identity (Android just needs its own OAuth client ID); free at this
  scale; Drive-native sharing available immediately, real collaboration a
  later adapter. **Hosting**: move from GitHub Pages to Vercel *before*
  privatizing the repo (Pages can't serve from a free private repo; the
  portfolio iframe src updates at cutover; `vite.config.ts` base `/estoria/`
  becomes `/`).
- **Full project review** (store, persistence, lib, all canvases, modals) —
  findings recorded as the prioritized backlog in the new **§9**. Headlines:
  the persistence shim never reads through `StorageAdapter` and double-writes
  every save (blocks any cloud adapter and halves the localStorage budget);
  save failures are silently swallowed while the footer keeps claiming
  autosave; persist re-serializes the entire store (all projects + embedded
  images) on every keystroke; deleting a middle chapter leaves the
  therefore-chain broken; character/world deletes leave dangling ids in
  stashed books; template-insert wipes custom link types; `openDoc` accepts
  unvalidated project files; the import drop zone doesn't actually handle
  drops; project switches can keep a stale camera ("book-1" id collision);
  the import parser treats any `##` heading containing "act" as an Act;
  markdown export drops World entries (hurts the planned Obsidian round-trip).
- **Sequencing agreed**: fix §9 items 1–3 (persistence seam, quota surfacing,
  debounce) → Vercel move → Google OAuth + `GoogleDriveStorageAdapter` (§8),
  with P2 correctness fixes landable independently along the way.
- Doc changes: §2 and roadmap item 7 now point at §8/§9; Session Log renumbered
  to §10.

### 2026-07-01 — Bug-fix batch: §9 items 1–11 (Session 20)

Landed the "fix now" batch from the Session-19 review. §9 items 1–10 are ✅
(item 1's per-project adapter granularity deliberately deferred to the §8
Drive work); item 11 is 🟡 (round-trip fixed, per-book export choice still
open). Remaining open: 12–14 (cursor zoom, image blobs, cosmetics).

- **Persistence rewrite** (`persistence.ts`): reads go through
  `activeAdapter.load()` (async rehydrate — verified no Welcome flash or state
  loss on reload); the double-write is gone and the legacy `estoria:doc:v1`
  duplicate is deleted on first load (reclaims half the quota). Saves are
  **debounced 500ms** with a synchronous flush on `beforeunload` /
  `visibilitychange→hidden`. `save()` errors propagate into a new `SaveStatus`
  pub/sub; the **Footer** now shows the real last-successful-save time,
  "Auto-saving...", or a red "Couldn't save — browser storage is full" (tested
  by making `setItem` throw `QuotaExceededError`: error shows, then recovers).
- **`normalizeDoc()`**: file opens (`readProjectFile`) coerce old/partial
  project files into a complete v3 `StoryDoc` instead of crashing the toolbar.
- **Store fixes** (`useStore.ts`): `deleteChapter` bridges the neighbors
  (carrying the incoming link type) so the therefore-chain never gaps —
  verified: delete ch 4 of 8 → 6 links incl. `c3→c5`, board renumbers 01–07
  with continuous threads; `deleteCharacter` / `deleteWorldEntry` sweep the
  active book **and** all stashed `bookData` books (world deletes now clear
  `worldRefs` at all); `applyTemplate` insert keeps existing link types.
- **Board**: fit-to-content effect keyed on `doc.id` too, so switching between
  projects that share the default `"book-1"` id re-fits the camera.
- **Import modal**: real drag-and-drop (drop zone + whole modal guard) —
  verified with a synthetic DataTransfer drop: parses, shows the summary, no
  navigation. Parser: act headings must *start* with "act" (`## Factions` no
  longer misparsed — verified in the same drop test).
- **Markdown round-trip**: export emits `## World` and full character fields
  in the import schema; parser learned `Desc:`. Verified: export shows
  `- **[[Wren Calloway]]** — Protagonist | Hero` + Desc/Traits/Wants lines and
  a World section; imported doc round-trips `desc`.
- Tooling: `.claude/launch.json` gained `autoPort`; `vite.config.ts` respects
  a `PORT` env (default behavior unchanged for plain `npm run dev`).
- Verified in-browser end-to-end (sample project + import + project switch +
  reload); `tsc -b` + `vite build` clean (65 modules). No console errors.

### 2026-07-01 — One-click backup in the footer (Session 21)

Backing up is now one click instead of File → Export → Save project → rename.

- **New `lib/backup.ts` + Footer controls**: next to the autosave stamp sit a
  **"Back up" button** and a **folder icon**. The folder icon picks (or
  changes) where backups go — `window.showDirectoryPicker` (File System
  Access API), with the `FileSystemDirectoryHandle` remembered in **IndexedDB**
  (handles can't live in localStorage) plus an in-session cache. "Back up"
  writes the current project's JSON straight into that folder with no dialogs;
  if no folder is set yet, the first click prompts for one.
- **Rotation, not overwrite (decided with the user)**: each backup is a
  timestamped `<project>-backup-<YYYYMMDD-HHMMSS>.estoria.json`; the newest
  **5 per project** are kept and older ones pruned (`MAX_BACKUPS` in
  `backup.ts`). Rationale: the working copy is already autosaved, so backups
  exist for disaster recovery — a single overwrite file would let one
  badly-timed click (e.g. backing up after an accidental mass-delete)
  destroy the only good copy. Timestamps sort lexicographically, so the last
  file alphabetically is always the newest.
- **Fallback + failure handling**: browsers without the picker API
  (Firefox/Safari) get a plain download instead and no folder icon. If the
  chosen folder was deleted/moved (`NotFoundError`), the stored handle is
  forgotten so the next click re-prompts. Permission is re-requested when the
  browser drops it. Errors show in the footer ("Backup failed — click the
  folder icon to re-choose"); success shows `Backed up · <file> (n kept)`.
- **Visual confirmation** (user follow-up, same day): on success the button
  itself flashes **"Backed up ✓"** in the therefore-green (border, text, and a
  soft `color-mix` fill) for ~2.6s before returning to "Back up", so success
  is unmissable without reading the detail message; the message stays until
  the next action. Verified mid-flash via computed styles (label + green).
- **Embedded-context fallback** (user report, 2026-07-02): on
  www.labrarf.com the app runs in a **cross-origin iframe**
  (`estoria-app.html` → github.io), where Chromium hard-blocks the File
  System Access pickers — no dialog, SecurityError, and **no
  Permissions-Policy `allow` token exists to delegate it** (unlike
  clipboard). The user wants the labrarf.com wrapper kept, so the fix is
  in-app: `isBackupPickerSupported()` also checks for a cross-origin frame
  (folder icon hidden, "Back up" = download), plus a runtime SecurityError
  catch that flips to the download fallback for any undetected embedder.
  Verified: with a SecurityError-throwing picker, Back up downloads, flashes
  ✓, shows "Backup downloaded (check your browser's Downloads)".
- **System-folder refusal** (same report): opened directly, Chrome refuses
  system-adjacent picks (home root, Library, drive roots) with its
  "contains system files" dialog — not overridable. Mitigation: the picker
  now opens with `startIn: "documents"`, and an abandoned pick shows a tip
  ("pick or create a normal folder like Documents/Estoria Backups"). Also
  swept em dashes out of the new footer strings per the UI-chrome rule.

### 2026-07-02 — Same-origin embed: full backups on labrarf.com (Session 22)

The download fallback wasn't enough (no folder choice, no rotation) and the
user wants the labrarf.com URL kept — so the embed itself moved same-origin.

- **New `npm run sync:portfolio`**: builds and rsyncs `dist/` →
  `Portfolio-Website/estoria/` (the portfolio repo serves it at
  `www.labrarf.com/estoria/`; prod base is already `/estoria/`, so the same
  build works unchanged). Portfolio's `estoria-app.html` iframe now points at
  `/estoria/` — same origin as the page, so Chromium allows the folder picker
  inside the embed: **folder backups + 5-file rotation now work on
  labrarf.com**. The cross-origin download fallback stays as a safety net for
  any other embedder.
- Verified with a local static server on the portfolio root: the iframe is
  same-origin (`contentDocument` reachable), the app boots from `/estoria/`,
  and the footer shows both "Back up" and the folder icon (hidden in the old
  cross-origin embed). The picker dialog itself needs a real user gesture, so
  that part is user-verified on the live site.
- **Caveat (accepted)**: localStorage is per origin, so the embed's stored
  projects reset once on the origin switch; recovery is Export at the old
  URL → Open file at the new one.
- **Plan impact** (§8 updated): privatizing the estoria repo no longer waits
  on Vercel — the demo now ships from the public portfolio repo as build
  output. Also added a `portfolio-static` launch config for verifying the
  embed locally.
- SITE-GUIDE.md (portfolio repo) updated in step: sections 2/4/5/10 + session
  log. Both repos pushed.
- Verified in-browser: controls render with correct tooltips; with a stubbed
  directory handle, 7 backups → exactly 5 files kept (oldest 2 pruned), each
  ~13.5 KB of real doc JSON, footer reports `(5 kept)`; removing
  `showDirectoryPicker` flips the button to the download fallback ("Backup
  downloaded") and hides the folder icon. `tsc -b` + `vite build` clean

### 2026-07-02 — Android companion planned (cross-project note; no web code)

- Decided to build a **separate** native Kotlin/Compose Android app (not a
  WebView wrapper, not part of this repo). Full spec lives at
  `/Users/rfcl/AndroidStudioProjects/Estoria-aa/ESTORIA-ANDROID.md`.
- **No change to web code or the web roadmap.** Added only a **cross-project
  awareness note** under §6 (roadmap item 7) so future web-side changes account
  for the Android app: the two apps share the same `.estoria.json` (schema v3),
  so model changes here are cross-app compatibility events; the planned Google
  sign-in/Drive work (§8) is intended to be shared (same identity, one Drive
  file, second OAuth client under the same GCP project); a future multi-user
  backend would be a new adapter behind the existing `StorageAdapter` seam.
- Direction of dependency is one-way by design: **Android tracks this repo's
  schema**, not the reverse. This doc stays the source of truth for `StoryDoc`.
  (66 modules), no console errors. (The OS folder picker itself can't be
  driven headlessly — first real click will show it once.)

### 2026-07-03 — Android v1 usable; shared Sync feature planned (cross-project note)

- The Android companion app now has a working v1 core (timeline, chapter/scene
  editing, characters/world/notes, templates, file open/save incl. Drive via
  the system picker, lossless round-trip of this app's `.estoria.json` —
  verified against real exports). No web code changed.
- **Planned jointly: an explicit Sync button/feature in BOTH apps** so a story
  edited on phone and desktop reconciles instead of last-writer-wins. Design
  notes under §8 ("Planned: explicit cross-app Sync feature"); mirrored in the
  Android spec. To design next session — includes deciding the
  "changed since last sync" marker (possible schema impact: optional
  `modifiedAt`), so treat as a cross-app compatibility decision per the
  2026-07-02 note.

### 2026-07-03 (later) — Sync contract settled, Android side shipped (cross-project note)

- Designed with the user in the Android session (no web code changed yet).
  Full contract now lives in §8 ("Cross-app Sync — CONTRACT SETTLED"):
  canonical `<slug>.estoria.json` per project in the user's Estoria folder,
  per-device content fingerprint + optional v3 `modifiedAt` stamp, whole-file
  conflict choice with the losing copy preserved as
  `<slug>-conflict-<stamp>.estoria.json`, check on open/focus + foreground
  interval.
- **Schema note: `modifiedAt` (ISO 8601, optional) is now part of v3.** The
  Android app stamps it on every file write. This app must preserve it
  through `normalizeDoc` and stamp it too when it writes files.
- Web implementation is the open half: Sync button + canonical-file
  read/write in the backup flow (to-do list at the end of the §8 section).

### 2026-07-03 (Session 24) — Web Sync shipped; Back up button retired

- **Cross-app Sync implemented on the web side** per the §8 contract, then
  extended the same session by user decision (details recorded in §8 under
  "Web implementation (Session 24)"):
  - Footer **"Sync" button** replaces "Back up". Sync three-way-compares the
    project against `<slug>.estoria.json` in the Estoria folder (fingerprint:
    SHA-256 over key-sorted JSON of the normalized doc, `modifiedAt`
    stripped, vs. the last-agreed hash in
    `localStorage["estoria:sync:lastHash:<docId>"]`), fast-forwards either
    direction, and raises a conflict dialog otherwise (`SyncConflictModal`;
    id-matched neutral diff summary; loser saved as
    `<slug>-conflict-<stamp>.estoria.json`).
  - **Every completed Sync also writes one rotating backup** (newest 5 kept)
    — the old Back up behavior folded in (`writeRotatingBackup`;
    `backupProject` and its download fallback removed).
  - **Auto-save now mirrors to the file**: ~2.5s after local auto-save
    settles, a fast-forward-only push updates the canonical file; a diverged
    file is never overwritten — the autosave line shows "file changed
    elsewhere — press Sync". Focus + 5-min background checks are notify-only.
  - **`modifiedAt` (v3, optional)** added to `StoryDoc`; stamped via
    `stampModified()` on every file write (exports included), preserved
    through `normalizeDoc`.
  - Firefox/Safari/embed (no File System Access): no footer button at all
    (user decision) — local auto-save + export menus remain.
  - All folder operations (Sync click, mirror, conflict resolution) are
    serialized through one in-module lock; a vanished folder handle is
    forgotten so the next action re-prompts.
- New files: `src/lib/sync.ts`, `src/components/modals/SyncConflictModal.tsx`.
  Touched: `types.ts`, `store/persistence.ts`, `lib/backup.ts`,
  `components/Footer.tsx`.
- Verified in the live app (OPFS directory handle standing in for the picked
  folder, seeded through the real IndexedDB slot): created → in-sync →
  pushed → pulled (background notice fired) → conflict → keep-mine resolution
  (conflict copy written, canonical kept, back in sync); rotation pruned 6
  planted backups + 1 new to 5; mirror wrote a real store edit to the file
  ~3s after typing stopped and refused to write over a diverged file; footer
  showed "· synced to file" and "file changed elsewhere — press Sync".
  `tsc -b` + `vite build` clean (68 modules), no console errors.
- **User's follow-up plan:** implement the same extended behavior
  (sync-writes-rotation + auto-mirror) in the Android app. No schema impact —
  the §8 file contract is unchanged.

### 2026-07-03 (Session 24, later) — File history + restore on the folder icon

- User asked how to tell the live sync file apart from the backups and asked
  to be able to "select" one; chose the **restore picker** design (over
  choosing an arbitrary canonical file name, which would have broken the
  phone's fixed `<slug>.estoria.json` lookup).
- **Folder icon now opens a file-history popover** (`SyncHistoryPopover.tsx`):
  this project's folder files with role badges (Live file / Backup / Conflict
  copy), written times, a per-file **Restore** action, and "Change…" to
  re-pick the folder. No folder set → the icon still just opens the picker.
- **Restore semantics** (`restoreFromFile` in `lib/sync.ts`): confirm dialog →
  current state written as a new rotating backup (undo path) → picked file
  becomes the working copy (`replaceDoc`). The live file is not touched;
  the auto-save mirror/Sync reconcile it afterwards, preserving the
  never-clobber guarantee. The picked file is read *before* the pre-restore
  backup is written, since that backup's pruning could delete the oldest
  backup — possibly the very file being restored.
- `listProjectFiles` filters to the current project's names only (live +
  `-backup-` + `-conflict-`), live first then newest-first by file mtime.
  `Popover` gained `side="above"` (bottom-edge pinning) for footer anchors.
- Verified in the live app (OPFS stand-in folder): popover lists all four
  planted files with correct badges and skips another project's file;
  restoring a planted backup via the real dialog replaced the doc, showed
  "Restored … — previous version saved as …", and the auto-created backup
  restored the original state (undo). `tsc -b` + `vite build` clean, no
  console errors.

### 2026-07-03 (Session 24, later still) — Conflict dialog: newer side, quantified diff, full report

- User to-do: on a sync mismatch, show which side is newer, make the
  messaging clearer, quantify how much differs (small vs a lot), and offer a
  reviewable report of the exact differences.
- **"Which is newer" panel** in the conflict dialog: "This app — last edited
  <t>" vs "The file — last written <t>", with a green NEWER tag on the more
  recent side and "· newer" appended to the matching keep-button. The file
  time is its `modifiedAt`; the local time is a new per-project
  `localStorage["estoria:sync:lastEdit:<docId>"]` stamped on every successful
  auto-save (`recordLocalEdit`, subscribed in the footer). **Display only**,
  same rule as `modifiedAt` — clock skew means it labels, never decides.
  Missing timestamps show "couldn't tell which is newer".
- **Quantified magnitude**: `diffDocs` (replaces `summarizeDiff` in
  `lib/sync.ts`) returns a structured `DocDiff` — compact per-section lines
  (as before), plus `differing`/`total` counts over the union of both sides'
  entities (chapters across all books, characters, world, books, assets, +
  title/story-notes/chapter-connections pseudo-items) and a magnitude bucket:
  ≤2 items = small, ≥10 or ≥25% = large, else moderate. Dialog headline:
  "Moderate difference — 4 of 23 items differ".
- **"See full report"** toggle expands a per-entity listing grouped by
  section: each item named (chapter title / character name / …) with its
  state — differs / only in this app / only in the file — and, for changed
  items, the friendly field names that differ (position fields collapse into
  "layout"; list fields with different lengths are quantified, e.g.
  "scenes (3 here / 5 in file)"). Whole-file resolution is unchanged — the
  report is read-only review; per-entity merge remains the §8 contract's
  later evolution.
- Chapter connections (therefore/but/and links, incl. stashed books) are now
  compared as a pseudo-item, and a hash-detected difference can never report
  "0 items differ" (floors to 1 with the catch-all line).
- Verified live (OPFS stand-in): staged phone-side edits (rename + scene adds
  + new character + notes, file stamped hours old) against a fresh local
  edit → dialog showed NEWER on "This app", correct counts/magnitude, report
  listed the exact items and fields; "Not now" dismissed without changes;
  keep-mine resolution wrote the conflict copy and re-synced. `tsc -b` +
  `vite build` clean.

### 2026-07-04 (Session 25) — File menu mirrors the Android ⋮ menu

- User decision: the web File dropdown and the Android app's 3-dots menu use
  the **same item names and order** (Android changes handled in a separate
  session). The shared order, with platform-unique items marked:
  1. Open project · 2. Save to file (was "Export…" — name kept as "Save to
  file") · 3. Import markdown (**to be added on Android**) · 4. Sync settings
  (**Android-only**, not in web) · 5. Backups & conflict copies — divider —
  6. New book · 7. New chapter · 8. Make this a series · 9. Use a template ·
  10. Books / Series (**Android-only**) · 11. Versions (**Android-only**) —
  divider — 12. About.
- Web menu items keep their existing conditions in the new order: New
  chapter / Use a template hidden on the series map, Make this a series
  hidden when already a series; "Backups & conflict copies" hidden where the
  File System Access API is missing (Firefox/Safari/embeds), like the footer
  Sync. Ellipses dropped from item names to match Android.
- **New: File → "Backups & conflict copies"** (`BackupsModal`) — the same
  live/backup/conflict file list + undoable Restore as the footer folder-icon
  popover, now also reachable from the menu; stays open across restores with
  an inline result message and offers "Choose folder…" when no Estoria folder
  is set. The list/restore UI was extracted into a shared `SyncFileList`
  component used by both surfaces.
- **New: File → About Estoria** (`AboutModal`) — name, tagline, browser/sync
  storage note, schema version, author link. (Menu row is a single line
  "About Estoria"; `MenuItem`'s `sub` is now optional so it doesn't read
  "About / About Estoria".)
- ExportModal header renamed "Export to Markdown" → "Save to file" to match
  its menu entry. Store gained `showBackups`/`showAbout` panel flags.
- Verified live: menu renders in exactly the order above with both dividers;
  Backups modal shows "not set yet" + Choose folder without a folder, lists
  badged files with one set (OPFS stand-in), and an in-modal restore replaced
  the doc, kept the modal open with "Restored … — previous version saved
  as …", and refreshed the list; About shows tagline/schema/author. `tsc -b`
  + `vite build` clean.

### 2026-07-04 (Session 26) — Timeline roman fix, chapter-modal nav & scene-insert, footer tidy

- **Fix — timeline Act numerals.** `roman()` (`src/lib/markdown.ts`) only
  mapped 1–3 and fell back to arabic for Act 4+, so the timeline read "Act I,
  II, III, 4". Replaced with a real subtractive converter, so acts render
  "Act IV / V / …". Also corrects the `## Act N` headings in markdown export.
- **New — prev/next chapter in the chapter modal.** Two arrow buttons (‹ ›)
  sit beside the ✕ in the modal header and call `openChapter` on the adjacent
  chapter in sequence; each disables at its end and its title is in the
  tooltip. Lets the user flip through chapters without closing the modal.
- **New — insert a scene from a card's side.** Hovering the left/right edge of
  a scene card reveals a `+` that inserts a new scene before/after it (reuses
  the existing `insertScene`), so scenes can be added mid-flow without the
  toolbar "+ Add scene" (which still appends). The buttons are raised to just
  above the connector line (`top-[38px]`) so they sit close to but never
  overlap the Therefore/But/And pills that live at the card's vertical centre;
  scene-grid spacing is untouched, so 3-across collapsed / 5-across expanded
  still holds.
- **Chapter modal — expanded scenes scroll on their own.** The expanded
  scene-canvas cap dropped 78vh → 58vh so, like collapse mode, the scenes
  scroll internally while the rest of the modal (notes, refs) stays reachable.
- **Footer status bar.** Removed the "Built by Ray Labra" attribution and moved
  the canvas hint to the right edge. Reworded the autosave line from
  "Auto-saved…" to **"Saved in this browser · <time>"** — it writes to
  `localStorage` (persistent per-origin storage, not a cache), so the old
  phrasing undersold it and "cache" would have been misleading.
- Verified live: timeline shows Act IV in roman; modal prev/next walk the
  sequence and disable at the ends; side `+` inserts a scene at the right
  index with zero button/pill overlap (2px clearance); footer reads "Saved in
  this browser · …" with the tip right-aligned and no attribution. `tsc -p
  tsconfig.app.json --noEmit` clean.
- **Deploy incident (resolved).** After `sync:portfolio` + portfolio push, the
  Pages deploy failed transiently and the embed at `www.labrarf.com/estoria/`
  kept serving the previous build (the `rsync --delete` had already swapped the
  hashed assets, so a healthy repo still looked stale). Fixed by pushing an
  empty commit to redeploy, then confirming the live asset hashes matched the
  committed ones. Wrote this up as a permanent **"Deploy runbook"** under §8
  Hosting migration — verify the Pages run after every embed publish.

### 2026-07-04 (Session 27) — New items start empty so placeholders behave like placeholders

- **Problem.** Newly-created records were seeded with real *stub text* as the
  stored field **value** (`"New Character"`, `"New entry"`, `"Untitled Chapter"`,
  `"A one-line description of this character."`, `"New scene."`, `"New note"`,
  etc.). Because that text was the actual value (dark ink, not a placeholder),
  the user had to select-and-delete it in every field before typing. The request:
  keep the helpful hint text, but make it a true placeholder that disappears the
  moment you type — no manual deletion.
- **Fix — create empty, hint via `placeholder`.** Store creators now seed empty
  strings and let the input's `placeholder` attribute supply the grey hint
  (`src/store/useStore.ts`): `addCharacter`, `addWorldEntry`, `addChapter`
  (+ template-built chapters), `addScene`/`insertScene` (scene text `""`), and
  every ref/asset creator (`addChapterRef`, `addWorldRef`, `addAsset` → `label:
  ""`).
- **Placeholders added** where the field had none:
  `CharactersPanel` (all 12 fields — Name/Initials/Role/Archetype/Description/
  Bio/Traits/Goals/Motivations/Wants/Needs/Notes, via new `placeholder` props on
  its local `Input`/`Area`), `WorldPanel` (Name + Description/Notes through
  `ExpandableTextarea`, which already accepted `placeholder`), and the
  `ChapterDetail` scene textarea ("New scene"). Chapter title/summary
  and ref labels already had placeholders and now actually show them. All use
  `placeholder:text-faint`.
- **Display fallbacks** so an intentionally-empty record never renders blank:
  board card title → muted "Untitled chapter"; character avatars → "?"; char
  list header → "Unnamed character" / "No role"; chapter char/world chips →
  "Unnamed character"/"?" and "Untitled entry"; world list header → "Untitled
  entry"; delete-confirm dialogs get safe fallbacks. (`Board.tsx`,
  `ChapterDetail.tsx`, `CharactersPanel.tsx`, `WorldPanel.tsx`.)
- **Scope note.** Books ("Untitled Book") and versions ("Version 2") keep their
  auto-generated names — those are conventional useful defaults (like "Untitled
  document"), not delete-me stubs, and they feed the toolbar breadcrumb.
- **Schema untouched** — this is UI/default-value only, so `.estoria.json`
  stays compatible with the Android app (§6). Verified in a fresh dev server:
  new character = all fields empty with grey placeholders and a "?" avatar; new
  chapter = "Untitled chapter" muted on the board, modal title/summary/scene all
  empty with placeholders. `npm run typecheck` + `npm run build` clean.

### 2026-07-04 (Session 28) — Contact link in the File menu

- **Added.** A **Contact** item in the File menu, directly above **About Estoria**
  (inside the same footer group, after the "Use a template" divider). Opens
  `https://www.labrarf.com/contact` in a new tab. Mirrored in the Android ⋮ menu
  the same session.
- **Rendered as a real `<a>`, not a `window.open` button** (`Toolbar.tsx`):
  `target="_blank" rel="noopener noreferrer"` — gives middle/⌘-click, screen-reader
  "link" semantics, and reverse-tabnabbing protection, none of which a button gets.
  Closes the popover via the existing `closeNewMenu`. Styled to match the other
  items, including a `text-soft` sub-line ("Questions, feedback, or say hello").
- **No schema/data change** — purely a static outbound link, so `.estoria.json`
  round-trip with Android is untouched. `npm run typecheck` clean; verified in a
  dev server (item appears above About, correct href/target).

### 2026-07-05 (Session 29) — Scene count on cards + move scenes between chapters

- **Chapter-card meta redesign** (`Board.tsx`), visible in both **board (canvas)**
  and **timeline** views (same card component). The bottom row now reads a clearly
  labelled, **right-aligned** **"N scenes · N.Nk words"** (scene count added, word
  count moved down from the top-right); the **character avatars moved to the
  top-right**; the pinned-notes count was dropped (not useful at board zoom). Scene
  count uses `ch.scenes.length`, matching the modal header. (Two earlier drafts —
  a bare `○ N` chip, then a left-aligned row — were replaced after user feedback;
  final is the right-aligned labelled row stacked under the top-right avatars.)
- **Chapter-modal header wrap fix** (`ChapterDetail.tsx`). The **"Act" label + its
  −/number/+ stepper** were two separate items in the wrapping meta row (with a
  `flex-1` push to the right), so at a narrow width the stepper wrapped to its own
  line away from the label and looked broken. They're now a single
  `flex items-center` group and the right-push was removed, so the whole meta row
  (words · scenes / status / Act) stays **left-aligned and wraps as coherent
  units** at any width. Verified down to 480px.
- **Move scenes to another chapter** (`ChapterDetail.tsx` + new
  `moveScenesToChapter` store action). Flow, settled with the user:
  1. **"Move scenes"** button in the Scene-flow toolbar (shown only when the book
     has another chapter and this chapter has scenes) enters a **select mode** —
     each scene card grows a checkbox; dragging/editing is suspended so a click
     toggles selection.
  2. The toolbar reads "Check the scenes to move"; once ≥1 is selected it shows a
     **"Select chapter ▾"** dropdown listing the other chapters (num · title ·
     scene count), plus **Cancel**.
  3. Picking a destination opens a **confirmation modal** with a
     **Beginning / Middle / End** segmented control (where in the destination's
     scene list to drop them; End = append is the default) and **Move / Cancel**.
- **Store action** `moveScenesToChapter(fromChId, toChId, indices, atIdx?, cols?)`:
  takes an ordered subset out of the source and splices it into the destination at
  `atIdx` (Beginning = 0, Middle = `floor(dest.length/2)`, End = append).
  Scene-link semantics are preserved where scenes stay adjacent; any adjacency the
  move/insert splits is re-joined with a neutral `therefore` (same convention as
  `reorderScene`). `scenePos` is recomputed for both chapters. No schema change —
  scenes are still `string[]` + positional `sceneLinks`, so the `.estoria.json`
  round-trip with Android is untouched.
- Verified in-browser on the sample: moved scenes 2+3 of ch01 to the **beginning**
  of ch03 — ch01 dropped 3→1 scenes, ch03 grew 3→5 with the moved pair leading and
  their internal `therefore` link preserved; card counts updated live
  ("1 scene" / "5 scenes"). `npm run typecheck` clean.

### 2026-07-11 (Session 30) — Review fixes for the Session 29 move-scenes work

Code review of `df7261e` (findings + instructions in `docs/archives/REVIEW-FINDINGS.md`,
all five now fixed and the doc marked accordingly):

- **≥1-scene invariant** (`useStore.ts`, `moveScenesToChapter`): moving ALL
  scenes out no longer leaves a 0-scene chapter — the emptied source keeps one
  blank `""` placeholder scene (same state a freshly created chapter starts in),
  so delete-button logic, markdown round-trip, and the Android `.estoria.json`
  assumptions stay consistent. Move is never blocked.
- **Scene-card hover regression** (`ChapterDetail.tsx`): the move-mode selection
  ring set an inline `borderColor` on every card, which overrode
  `hover:border-faint` in ALL modes. Inline style is now applied only when the
  card is selected; `border-rule` restored in the className.
- **Destination layout** (`useStore.ts`): destination `scenePos` is now
  width-fitted via `sceneColumnsForWidth` + new shared `sceneBoxWidthEstimate()`
  helper (extracted from `openChapter`, which now uses it too) instead of the
  ≤3-column count heuristic — matters because `openChapter` skips re-arranging
  when `scenePos.length` already matches.
- **Connector pills inert in move mode** (`ChapterDetail.tsx`):
  `disabled={moveMode}` + `disabled:pointer-events-none`; tooltip suppressed.
  Still visible for context while selecting.
- **Hardening**: `subset()` defends short imported `sceneLinks` arrays with
  `links[a] ?? "therefore"` (matches render-side convention).
- Verified in-browser on the sample: pill click in move mode is a no-op; moved
  all 3 scenes of ch01 → end of ch03 (ch01 kept one true-placeholder scene,
  "1 scenes"; ch03 grew 3→6, moved trio appended with internal but/therefore
  preserved, re-join `therefore`, 4-column width-fitted grid); unselected cards
  carry no inline style (hover works). `npm run typecheck` clean; no console
  errors.

### 2026-07-11 (Session 31) — Life-story templates; add-character scroll-to-view

Two user requests (source doc: "Biography and Autobiography Story Mapping
Templates" Google Doc):

- **4 biography/autobiography templates** (`lib/templates.ts`), bringing the
  library to **16 story structures + the blank starter (17 template cards)**:
  **The Transformation Memoir** (16 ch, Autobiography), **The
  Innovator's Quest** (15 ch, Biography), **The Rags-to-Riches Trajectory** (15 ch,
  Biography), **The Adversary Narrative** (16 ch, Memoir). The source doc gives a
  writing-prompt sentence per chapter, so the `beats` tuple was widened to
  `[title, act, summary?]` (new exported `TemplateBeat` type) and `applyTemplate`
  now seeds each chapter's one-line **summary** from that third element
  (`summary ?? ""` — existing templates, which omit it, are unchanged). The doc's
  arcs have no named acts, so each was hand-assigned a multi-act curve (memoir
  3/7/6 over three acts; Rags-to-Riches a 4-act rise/peak/fall/redemption; etc.).
- **Characters panel scrolls the new card into view** (`CharactersPanel.tsx`):
  `addCharacter()` already opened the panel + selected the new (last-in-list)
  character, but on a long roster its card sat below the fold. Added an effect
  keyed on `[show, sel]` that calls `scrollIntoView` on the selected card. Uses
  **`block: "nearest"`** plus **`scroll-mt-[76px]`** on the card: the new card is
  off-screen and taller than the panel, so `nearest` aligns its top edge just
  under the sticky "Characters" bar (the `scroll-mt` clears it) — while a card
  that's already fully visible (manually expanded mid-panel, or shown on reopen)
  is left untouched, instead of being yanked to the top as `start`/`center`
  would. NB: `behavior: "smooth"` was a silent no-op inside that nested overflow
  container in the preview renderer, so the default (instant) scroll is used.
- Verified in-browser on the sample: inserting The Transformation Memoir created
  16 chapters with the right acts/titles and each summary prompt showing as the
  card subtitle; all four templates render in the modal with tags/blurbs/beat
  counts. On a padded roster (scrolled to top), creating a character scrolled the
  panel so the new card's top landed at 76px — just below the sticky header
  (bottom 71px) — with avatar, name/role summary, and Name/Initials inputs all
  visible. `npm run typecheck` clean.

### 2026-07-11 (Session 31 review) — Code review of the Session 31 work

Review-only pass over the uncommitted Session 31 changes (findings +
instructions for Opus in `docs/archives/REVIEW-FINDINGS.md`, "Session 31 work" section;
all items open):

1. **Scroll effect fires on every card expand/reopen, not just add-character**
   (`CharactersPanel.tsx`) — fix is `block: "start"` → `block: "nearest"`.
2. **"17 structures" in this doc counts the blank starter** — reword to
   16 structures + blank starter.
3. *(Optional, ask user)* group the 17-card Templates modal into "Story
   structures" / "Life story & memoir" sections.
4. **AI import prompt caps drafts at 3 acts** (`markdown.ts:153`) while two new
   templates are 4-act and the parser already accepts Act 4 — one-line reword.

Everything else checked out: `TemplateBeat` widening is backward-compatible,
act 4 is safe end-to-end (store unclamped, `roman()`, Board bands,
`parseActNumber`), the four templates' act splits match this log, hooks order
in `CharactersPanel` is valid, typecheck clean.

### 2026-07-11 (Session 32) — Templates facet filter + responsive grid; Session 31 review closed

Implemented the Session 31 review (`docs/archives/REVIEW-FINDINGS.md`, "Session 31 work"),
all four items now resolved. Items 1 (scroll `block: "nearest"`), 2 (doc "16
structures + blank starter" wording), and 4 (import-prompt act cap reworded) were
already in the working tree from Session 31; this session added item 3.

- **Templates modal facet filter** (`lib/templates.ts` + `modals/TemplatesModal.tsx`).
  The review suggested a two-section split (fiction vs life-story); discussing it,
  the user rejected forcing each template into ONE bucket — several legitimately
  span two (Vogler's Hero's Journey = *Myth & journey* + *Screenwriting*; Harmon's
  Story Circle = *Foundational* + *Screenwriting* + *Myth & journey*; Propp =
  *Myth & journey* + *World traditions*). So:
  - `StoryTemplate` gained **`groups: string[]`**, merged on via a co-located
    `GROUP_MEMBERSHIP` map (`RAW_TEMPLATES.map(t => ({...t, groups: …}))`), plus a
    new exported ordered `TEMPLATE_GROUPS` (Foundational, Screenwriting, Myth &
    journey, World traditions, Genre, Life story).
  - The modal renders a **filter pill bar** — `All` (default) + the six facets,
    with a live "N templates" count. A template appears under every facet it
    carries; selecting a facet filters the grid.
  - Facets are a **`flex flex-wrap` row**: one line when the modal is wide, wraps
    on its own when narrow — no breakpoints.
  - The card grid is now **responsive** via
    `grid-template-columns: repeat(auto-fill, minmax(235px, 1fr))` — 3 columns at
    full width, 2 at about half-screen, 1 on a phone. Modal widened `880px → 980px`
    so three columns have room. Insert/Replace behavior unchanged.
  - Facet memberships (Story Grid → Screenwriting; Propp double-tagged) are easy
    to retune in the one `GROUP_MEMBERSHIP` map.
- `npm run typecheck` clean. Built and deployed to the portfolio site.

### 2026-07-15 (Session 33) — 10 new templates: 5 life-story + 5 genre

Added ten new skeletons to `lib/templates.ts`, taking the library from 17 to
**27 template cards (26 structures + blank starter)**. Titles and per-chapter
prompts are verbatim from two mapping guides ("Biography and Autobiography Story
Mapping Templates V2" and "Fiction Genre Story Mapping Templates"); act groupings
were assigned here along each template's narrative curve.

- **5 life-story arcs** (Life story facet now 9): The Coming-of-Age Arc (15),
  The Relocation & Fresh Start (15), The Nest Builders (15), The Creative Arc (15),
  The Lifeline (16, 4-act full-life chronology).
- **5 genre beat sheets** (Genre facet now 7, alongside Romance + Mystery):
  Thriller / Suspense (15), High Fantasy / Sci-Fi Worldbuilder (16),
  The Heist / Caper (15), Horror / Survival (15), Adventure / The Quest (15).
- Pure data: each entry uses the existing `[title, act, summary]` `TemplateBeat`
  shape and is registered in `GROUP_MEMBERSHIP`; no component or store changes.
- Verified in-browser: Genre filter shows all 7 and Life story all 9 with correct
  tags/blurbs/beat counts; a live Replace with Thriller built its 15 chapters in
  order onto the board with each prompt as the card subtitle. `npm run typecheck`
  clean. Built and deployed to GitHub Pages + the portfolio site.

### 2026-07-16 (Session 34) — Per-chapter prompts for the 12 older templates

The library had split into two eras: every template added in Sessions 31–33 carried
a writing prompt on each beat, while none of the original structures had a single
one. An audit of all 27 cards found 13 with zero prompts and blurbs less than half
the length of the newer ones. This session closes that gap.

- **109 prompts across 12 templates**, written to match the voice of the existing
  genre/life-story entries (one sentence, verb-first, third-person protagonist):
  Three-Act (8), Save the Cat (15), Hero's Journey Vogler (12) and Campbell (17),
  Story Circle (8), Story Grid (6), Kishotenketsu (4), Romance (8), Mystery (9),
  Propp (14), Panchasandhi (5), Jo-ha-kyu (3).
- **Single Blank Chapter stays bare** by design — its blurb promises a start from
  scratch, and a prompt on its one beat works against that. It is now the only
  card without prompts; every other structure is at 100% coverage.
- Pure data, same as Session 33: existing `[title, act, summary]` `TemplateBeat`
  shape, no component or store changes. Beat titles untouched, including the
  Story Circle parentheticals (`You (comfort zone)`), which stay because the
  romanized World-traditions titles (`Ki`, `Jo`, `Mukha`) need their glosses and
  keeping them consistent beat stripping them from the one English set.
- Dropped the stale "(used by the life-story templates)" clause from the
  `templates.ts` docstring — the genre templates broke that claim in Session 33.
- **Considered and deferred**: renaming `beats` → `chapters`. The word is Snyder's,
  generalized onto 18 traditions that used stages/functions/junctures/movements,
  and it points down the hierarchy while `useStore` maps each beat *up* to a whole
  chapter. Only one user-facing use (`TemplatesModal.tsx` "N beats") against 37 in
  templates.ts. Also open: the generic `"Genre"` tag on Romance/Mystery, and the
  count-duplicating tags (`"15 beats"`, `"12 stages"`, `"17 stages"`, `"8 steps"`).
- Verified in-browser: a live Replace with Three-Act built all 8 chapters in order
  with each prompt as the card subtitle, correctly sorted into acts; no console
  errors. `npm run typecheck` clean. Built and deployed to GitHub Pages + the
  portfolio site.

### 2026-07-17 (Session 35) — 3 speculative-fiction templates; facets cut from 6 to 3

Added the three skeletons from the "Speculative Fiction Story Mapping Templates"
guide, taking the library to **30 template cards (29 structures + blank starter)**.
Fitting them into the Genre facet exposed a deeper problem in the taxonomy, and
most of the session went there.

- **3 speculative-fiction beat sheets** (Genre facet now 10): Dystopian /
  Societal Rebellion (15), First Contact / The Cosmic Enigma (15), The Temporal
  Paradox / Time Loop (15). Titles and per-chapter prompts verbatim from the
  guide. That guide is explicitly written "without named phases or acts", but
  `TemplateBeat` requires an act, so each 15-chapter curve was split 4/6/5 here
  to match Thriller / Horror / Adventure, with the breaks on natural turns.
- **Genre facet reordered**: High Fantasy → Adventure → the 3 new → Mystery →
  Thriller → Heist → Horror → Romance.
- **Facets cut from six to three** — `Structure` (11), `Genre` (10), `Life story`
  (9). Foundational, Screenwriting, Myth & journey and World traditions all fold
  into Structure. The old set spent four tabs on 11 abstract cards while 19
  premise-carrying cards shared two, so the nav was high-resolution exactly where
  the library was thin. "World traditions" was also a residual category — a 3-beat
  tempo, a 4-act shape, a 5-juncture dramaturgy and a 14-function folktale
  sequence share nothing except "not the Anglo-American canon", which is why it
  never named well ("Western Structure" was considered and rejected: too long for
  the Android chip row, and false — Campbell is comparative mythology and Propp is
  Russian). The three that remain split the library by how much a template commits
  to: shape, invented premise, true premise.
- **This reverses the Session 32 decision** recorded in REVIEW-FINDINGS §3, where
  single-bucket facets were rejected because Vogler, Story Circle and Propp
  genuinely span several. Still true — but the multi-membership is what forced four
  near-duplicate tabs over the same 11 cards. Collapsing them makes the spanning
  moot: all three now sit in Structure together. The facets **partition the library
  exactly** for the first time; every card sits in one.
- `groups` stays `string[]` rather than becoming `group: string`, so the modal's
  `includes()` filter is untouched and a cross-cutting facet stays possible later.
- **RAW_TEMPLATES reordered to match**, so the default All list reads Structure →
  Genre → Life story in three contiguous runs. Propp, Panchasandhi and Jo-ha-kyu
  moved up behind Kishotenketsu. Blank is card 1 and Vogler card 4; under the old
  array order Vogler would have landed at 24, below 19 genre/life-story cards.
- **Considered and deferred**: starring templates into a Favorites tab. Plumbing is
  cheap — `favoriteTemplates: string[]` beside `refView` in `partialize` is
  cross-project for free (though `migrate` hand-carries only `theme` on a schema
  bump, so it would need adding there or stars vanish silently). Parked because the
  modal is a project-start surface visited about once a book, so the star never gets
  set. The real need underneath is a *session shortlist* for comparing 2–3 cards
  before committing, which wants no persistence at all. Also open: `group: string`
  to make the partition a type invariant; splitting Genre into speculative /
  crime-and-peril if the speculative side keeps growing (4 of 10 now); and the
  still-generic `"Genre"` tag on Romance/Mystery, now conspicuous beside eight
  specifically-tagged siblings.
- Verified in-browser: chips read All · Structure · Genre · Life story with live
  counts 30 / 11 / 10 / 9; a live Insert with Dystopian built its 15 chapters in
  order with each prompt as the card subtitle; no console errors. `npm run
  typecheck` clean. All 27 pre-existing cards diffed byte-identical against the
  previous HEAD after the block moves. Built and deployed to GitHub Pages + the
  portfolio site.

### 2026-07-17 (Session 36) — Versioning review: what "version" actually does

No code changed this session — a read-through of how versioning works, because
its behaviour didn't match expectations. The short of it: **a version is an
override layer over two fields, not a snapshot.** Findings, so the gap between the
name and the mechanism is on record:

- **A version holds no story content.** `DraftVersion` ([types.ts:43](../src/types.ts:43))
  is just `{id, name}`. The only per-version data anywhere is on each chapter:
  `overrides?: Record<string, { title?: string; summary?: string }>`
  ([types.ts:150](../src/types.ts:150)). So a version can differ from `main` in
  **chapter title and chapter summary, and nothing else** — scenes, scene
  connections, status, word count, notes, characters, world refs, pinned refs,
  board positions and chapter connectors are stored once and shared by every
  version. Switching versions re-renders exactly two text fields per chapter.
- **A new version is not a copy.** `addDraft` ([useStore.ts:1371](../src/store/useStore.ts:1371))
  adds an empty override map, so a fresh version starts as a passthrough to `main`
  and only diverges where you retype a title or summary. Consequence: **editing
  `main` afterward also changes every other version**, for every field not
  overridden (i.e. most of them). This is the likely source of the surprise.
- **The docs oversold it.** The §3 feature table (lines 127 and 148 in this file)
  claims connectors are "alt-draft aware" and the toggle "swaps
  titles/summaries/alt connectors". There is no draft field on
  `ChapterLink`; `Board` reads `doc.links` unfiltered and uses `draftId` only to
  resolve display titles and the reorder-confirm text. **Per-draft connectors were
  never built** — the two "alt-draft aware / alt connectors" claims are aspirational,
  not implemented.
- **An override can't be reverted from the UI.** `resolveTitle` treats any non-null
  override as authoritative ([drafts.ts:5](../src/lib/drafts.ts:5)) and
  `editChapterText` writes on every keystroke ([useStore.ts:642](../src/store/useStore.ts:642)).
  Clearing the field stores `""` (non-null), giving a blank title rather than
  falling back to `main`. The only way back to base text is deleting the version.
- **Export/sync flatten versions away.** `buildMarkdown` resolves the *active*
  version into plain text ([markdown.ts:92](../src/lib/markdown.ts:92)) and the
  parser rebuilds a doc with only `Main draft` ([markdown.ts:510](../src/lib/markdown.ts:510)),
  so a markdown round-trip collapses the active version into `main` and drops the
  rest — consistent with the "just the active version syncs" decision (§ Sync), but
  worth stating. Sync diffs the whole `overrides` map as one field
  ([sync.ts:499](../src/lib/sync.ts:499)).
- **Versions are per book.** `drafts`/`activeDraftId` live in `BookData` and are
  stashed/restored on `switchBook`, so the version list changes entirely when the
  active book changes (as intended since Session 8).
- **Unrelated: `SCHEMA_VERSION = 3`** ([types.ts:13](../src/types.ts:13)) is the
  persisted-doc shape, not a user version. The `migrate` hook
  ([useStore.ts:1491](../src/store/useStore.ts:1491)) doesn't migrate — on any bump
  it **discards the persisted doc and loads `sampleStory`**, keeping only `theme`.
  If a schema bump ever wiped local work, that's why.
- **Smallest honest fix if versions should be snapshots:** make `addDraft`
  deep-copy the chapters into a real per-version board instead of widening the
  override map field by field. Not done here — flagged for a decision, since it's a
  model change with sync/markdown implications, not a bug fix.

### 2026-07-17 (Session 36b) — Versions become standalone forks (schema v4)

Implemented the decision from the review above, per the user's answers: a
version is a **full fork of the book's board**, the series bible stays
**shared**, and the project file keeps **all versions in one `.estoria.json`**
(markdown export still renders just the active version). Pushed to GitHub
(Pages auto-deploys) and synced to the portfolio site later the same day, with
the user's OK. The Android app still needs the matching schema before cross-app
sync resumes — step-by-step port instructions were written to
`/Users/rfcl/AndroidStudioProjects/Estoria-aa/OPUS-TASK-schema-v4-versions.md`.

- **Model (`SCHEMA_VERSION` 3 → 4).** New `VersionData {chapters, links,
  storyNotes}`. The active version's board lives at the top level (unchanged for
  canvas components); inactive versions are stashed in `doc.draftData` /
  `BookData.draftData`, mirroring the `bookData` pattern for books.
  `Chapter.overrides` is gone.
- **Store.** `addDraft` deep-copies the current board (`structuredClone`) — the
  fork becomes active, the original is stashed. `setActiveDraft` stashes/restores
  whole boards (keeps the chapter modal open when the id exists in both, since
  fork copies share chapter ids). `deleteDraft` of the active version falls back
  to `main`. `editChapterText` writes chapters directly (no overlay).
  `switchBook`/`addBook`/`mergeProjectIntoSeries` carry `draftData` via new
  `stashActiveBook`/`emptyBookData` helpers.
- **Real migration, at last.** The zustand `migrate` hook no longer wipes to
  `sampleStory` on a version bump: it runs `normalizeDoc` over the doc **and
  every `projectStash` entry** (dropping only individually-corrupt ones).
  `normalizeDoc` converts v3 overlay versions by materializing each draft as
  base-chapters + that draft's overrides (`materializeLegacyVersions`), for the
  top-level book and every `bookData` entry. What the user saw per version
  before is byte-for-byte what each fork contains after.
- **Schema guard.** `normalizeDoc` throws `SchemaTooNewError` when a file's
  `schemaVersion` exceeds the app's; `readCanonical`/`restoreFromFile` re-throw
  it un-masked so sync surfaces "update the app" instead of lossily overwriting
  a newer file's fields.
- **Sync diff.** Versions compare as one pseudo-item ("Draft versions differ")
  across all books, like connections; the `overrides` field label is gone. Note:
  the first sync after updating recomputes fingerprints on the converted shape,
  so a genuinely-diverged file shows as a conflict (not a fast-forward) once.
- **UI copy.** Delete-version confirm now says the version's chapters are
  deleted and others unaffected; the chapter-modal badge reads "changes stay in
  this version". Reorder-confirm and move-picker titles read `c.title` directly;
  `resolveTitle`/`resolveSummary` are deleted (`displaySummary(c)` keeps the
  first-scene fallback). `buildMarkdown(doc)` lost its `draftId` param — the
  active board *is* the version.
- **Sample story** now ships the "Alt ending" as a real fork (built
  programmatically from the main board, c8 retitled "The Drowned Return").
- **Verified in-browser** (dev server, seeded a v3 store with overrides, a
  stashed book with its own alt version, and a stashed second project):
  migration produced v4 with all forks materialized and overrides stripped,
  nothing wiped; added a chapter in Alt → Main untouched; edited Main's title →
  Alt untouched; "+ Add version" forked Alt's 3 chapters; deleting the active
  fork fell back to Main with Alt intact; state survived reload; fresh
  (cleared) storage loads the sample with its alt fork. No console errors;
  `npm run build` clean.
- **Caveats on record:** pre-v4 cross-version bleed (scene/structure edits made
  while a non-main version was active) is baked into every fork — only pre-bleed
  backups can recover it. A v4 file is a one-way door for older apps; the guard
  refuses reads, and the Android app must not sync until it speaks v4.

### 2026-07-18 (Session 37) — Decision: asset-backed pinned references (schema v5); task written for Opus

No code changed — a design session with the user on chapter/world pinned refs.
Full findings and step-by-step implementation instructions are in
`docs/archives/REVIEW-FINDINGS.md`, section "Task — Asset-backed pinned references
(schema v5)". Decisions locked:

- **Every note/image added in a chapter's pinned refs or on a world entry is
  created as a shared book Asset and auto-linked** — no more standalone refs.
- **Asset links become live write-through** (today `linkAssetToChapter` takes a
  snapshot copy; editing either side diverges silently).
- **Existing standalone refs migrate into assets** — `SCHEMA_VERSION` 4 → **5**,
  `PinnedRef` slims to `{id, assetId}`. Real migration via `normalizeDoc`
  (Session 36b machinery); fork copies dedupe by ref-id + content; diverged
  snapshots are preserved as separate assets (no data loss, no guessing which
  side is newer).
- **World entries included**, and the World panel gains the link-asset picker.
- **Remove from chapter = unlink only; delete from library = unpin everywhere**
  (confirm shows usage count; sweep covers all stashed books/versions).
- Production impact: in-place migration on first load after deploy, nothing
  wiped; disk files stay v4 until the first Sync (which backs up first and
  never clobbers silently); v5 is a one-way door for older apps — **the Android
  port target moves v4 → v5** (update the Android repo's task file).

### 2026-07-18 (Session 38) — Asset-backed pinned references shipped (schema v5)

Built the Session 37 task (`docs/archives/REVIEW-FINDINGS.md`, "Task — Asset-backed
pinned references"). Pinned refs are now pure links into the shared asset pool;
all items in that task are marked ✅ there.

- **Model** (`types.ts`): `SCHEMA_VERSION` 4 → **5**; `PinnedRef` slimmed to
  `{ id, assetId }` (content fields deleted). `Asset` unchanged.
- **Store** (`useStore.ts`): `addChapterRef`/`addWorldRef` now mint a shared
  asset first, then pin a link. `updateChapterRef`/`updateWorldRef` **deleted**
  (content edits go through `updateAsset` — live write-through). `linkAssetTo-
  Chapter` appends a link and no-ops if already linked; added `linkAssetToWorld`.
  `deleteAsset` sweeps all five ref locations via `removeAssetLinks` then drops
  the asset.
- **New lib** (`lib/refs.ts`): `resolveRefs`, `countAssetLinks`,
  `removeAssetLinks` — each walks all five ref locations (active board,
  `draftData`, `bookData` + its nested `draftData`, world). Same
  missed-a-stash lesson as §9 item 5.
- **UI**: `RefList` now renders resolved items and takes a caller-supplied
  `deletePrompt` + optional `caption`. Chapter/World route edits to
  `updateAsset` and deletes to *unlink* ("Remove from this chapter/world entry?
  It stays in the shared library.", not danger); the library deletes the asset
  ("Delete this note everywhere? …pinned in N places.", danger) and shows a
  "Linked in N places" caption. New shared `ui/AssetLinkPicker.tsx` used by both
  ChapterDetail and the World panel (which previously had no picker); already-
  linked assets render disabled.
- **Migration** (`persistence.ts` → `normalizeDoc` → `migrateRefsToAssets`):
  runs last (after v3→v4 materialization), idempotent. Standalone → new asset;
  fork copies dedupe by ref-id + content (one asset shared across forks);
  diverged snapshots preserved as separate assets (no data loss); dangling
  links rescued or dropped. The Session 36b `migrate` hook needed no change.
- **Data/export**: `sampleStory.ts` rewritten born-v5 (13 assets, links with
  stable ids) so a fresh load never runs migration; `markdown.ts` resolves the
  `**Pinned:**` labels through `doc.assets`, skipping unresolved.

Verified (dev server): `typecheck` + `build` clean. Migration exercised on a
crafted v4 store (standalone note+image, a diverged snapshot, world refs, a
version fork with duplicate-id copies, a stashed book, a second `projectStash`
project) → reload produced 6 assets exactly, fork copies deduped to ONE asset
each (linked in 2 places), the diverged snapshot preserved as its own asset, the
stashed project migrated independently, 0 malformed/dangling refs, no console
errors. Live UI: refs resolve and render; editing a note in the chapter modal
wrote through to the shared asset with no copy (asset count unchanged, ref stayed
`{id, assetId}`); the link picker lists the library with already-linked assets
disabled.

**Production impact / cross-app** (as decided in Session 37, unchanged): first
open after deploy migrates localStorage in place, nothing wiped; disk files stay
v4 until the first Sync (backs up first, never clobbers silently); `Schema-
TooNewError` keeps v4 apps from mangling a v5 file. **The Android port target
moves v4 → v5** — update the Android repo's `OPUS-TASK` file; no Android code was
touched from here.

### 2026-07-18 (Session 39) — Review fixes for the Session 38 asset-ref work

Fixed all four items from the Session 38 code review (`docs/archives/REVIEW-FINDINGS.md`,
"Code review — Session 38 work"); all marked ✅ there.

- **1 (robustness, pre-deploy):** `migrateRefsToAssets` walked `draftData`
  un-defensively — a malformed version entry (`null`, or `chapters` not an
  array; `draftData` is passed through un-normalized) threw, and the persist
  `migrate` catch-all then replaced the ENTIRE store with the sample. Made
  `convertChapters`/`convertVersions` tolerant: a non-array `chapters` → `[]`, a
  non-object version entry → an emptied `{chapters:[],links:[],storyNotes:""}`.
  One bad entry now degrades to that entry, never the whole doc. Well-formed
  docs are byte-identical.
- **2:** the "Linked in N places" caption only rendered in list view; added it
  to both card cells (NOTE + IMAGE) in `RefList`. Absent when no `caption` prop.
- **3:** replaced per-asset `countAssetLinks(doc, id)` (walked the whole doc
  once per asset per render) with a single-walk `countAllAssetLinks(doc):
  Map<assetId, count>` built once per `NotesPanel` render; deleted the old
  single-asset walker (only NotesPanel used it).
- **4 (wording):** the count spans all five sweep locations (versions + books),
  so a bare "N places" read like N chapters. Reworded honestly — caption "N pins
  across versions & books", confirm detail "…pinned in N places across your
  versions and books." What is counted is unchanged (still agrees with the
  delete sweep).

Verified (dev server): `typecheck` + `build` clean. **Item 1:** seeded a v4
store whose `draftData` held a valid fork + a `null` entry + `{chapters:"oops",
links:null,storyNotes:42}`, plus a stashed book with a nested `{chapters:null}`
version → reload did NOT wipe to sample (`projectTitle` preserved), the valid
fork migrated intact, bad entries emptied, 0 dangling, no console errors; a
separate clean-store migration reproduced the Session 38 numbers exactly (fork
dedupe + diverged snapshot unchanged). **Item 2/4:** Notes library in card view
shows the caption on all 13 cells with the new wording.

### 2026-07-18 (Session 38 review) — Code review of the v5 asset-refs work

Review-only pass over the uncommitted Session 38 changes (findings +
instructions for Opus in `docs/archives/REVIEW-FINDINGS.md`, "Session 38 work" section;
all four items open). The implementation is sound and faithful to the Session
37 task; cross-file tracing (sync diff, project merge, export, persist/migrate)
found no stale consumers of the deleted ref content fields; typecheck + build
clean.

1. **Fix before deploy:** a malformed `draftData` entry crashes
   `migrateRefsToAssets`, and inside the one-time localStorage migration the
   migrate hook's catch-all then **wipes everything to the sample story** —
   guard the walk so a bad version entry is dropped, not fatal.
2. "Linked in N places" caption renders only in the library's list view, not
   card view.
3. `countAssetLinks` runs per asset per Notes-panel render (O(assets × doc)) —
   build one count map per render instead.
4. *(Wording, ask user)* the count treats each version fork as a "place", so
   one pin + one fork reads "Linked in 2 places" — rephrase without changing
   what is counted.

### 2026-07-18 (Session 39b) — Android v5 port task written (feature parity + file compatibility)

No web code changed. Wrote the step-by-step Android port instructions to
`/Users/rfcl/AndroidStudioProjects/Estoria-aa/OPUS-TASK-schema-v5-asset-refs.md`
(same pattern as the v4 task, which is ✅ complete there as of 2026-07-17).
Scope surveyed in the Android repo first: it still implements v4 snapshot-copy
semantics (standalone `addChapterRef`/`addWorldRef`, snapshot
`linkAssetToChapter`, `updateChapterRef`/`updateWorldRef`, no delete sweep, no
world link picker) — all mapped file-by-file in the task. Highlights:

- Model bump to 5 with legacy ref fields readable-never-rewritten (the
  `overrides` precedent); guard moves to >5 (verify it uses the constant).
- Faithful `migrateRefsToAssets` port **including the Session 39 defensive
  walk**; five-location walkers (`Refs.kt` = web `lib/refs.ts`); asset-first
  adds, write-through, unlink-vs-delete-everywhere semantics; world picker;
  library caption/confirm using the Session 39 wording ("N pins across
  versions & books"); Markdown `**Pinned:**` resolved via assets.
- **Determinism caveat on record:** minted migration ids are time-based, so
  both apps converting the same pre-v5 file independently yields differing
  asset ids → one accepted one-time sync conflict; canonical flow is web
  converts/writes v5, Android reads v5.
- Until the port lands, Android's existing >4 guard correctly refuses v5 files
  — cross-app sync stays paused, nothing can be mangled.

### 2026-07-18 (Session 40) — deleteCharacter/deleteWorldEntry: sweep version forks (parity with Android)

Task written by an Android-repo review session
(`SONNET-TASK-fork-sweep-deletes.md`, now deleted). Characters and world
entries are series-level; chapters that reference them (`chars`/`worldRefs`)
live in **four** board locations since schema v4 added `draftData` version
forks (Session 36b, commit 798a8ca): `doc.chapters`, `doc.draftData[*].chapters`,
`doc.bookData[*].chapters`, `doc.bookData[*].draftData[*].chapters`. Both
deletes (fixed for locations 1 and 3 back in Session 20, §9 item 5) were never
updated for the two `draftData` layers added later — a leftover from when
versions were overlays, not forks. Dangling ids in a fork are invisible
(renders skip missing ids, `normalizeDoc` doesn't prune) but permanent, and
the Android app's `lib/Entities.kt` already swept all four locations (fixed
there 2026-07-18), so the same delete on phone vs. desktop produced
byte-different docs — a false **Diverged** conflict on sync.

Fix: extracted `deleteCharacterDoc`/`deleteWorldEntryDoc` to new
`src/lib/entities.ts`, sharing a `mapEveryChapter` walker over all four
locations (same shape as `removeAssetLinks` in `lib/refs.ts`, which already
covers all four for asset refs + world). Sweeps only touch chapters where the
id is actually present (`includes(id) ? copy : c` guard) so untouched
chapters' bytes don't churn; emptied lists stay `[]`, not deleted keys. The
store's `deleteCharacter`/`deleteWorldEntry` actions now just call the lib
function and reset `selChar`/`selWorld` — no doc-shape logic left inline.

Verified (dev server, `estoria:store:v1` inspected via devtools console): the
bundled sample doc's "Alt ending" version fork had `wren` in every chapter's
`chars`; deleting Wren Calloway from the Characters panel removed `wren` from
`doc.characters` **and** from every `draftData.alt.chapters[*].chars`
(confirmed via `JSON.stringify(doc).includes('"wren"') === false`) — the exact
gap this closes. `typecheck` and `build` both clean. Closes the divergence the
Android repo logged 2026-07-18; both apps now produce identical docs from the
same delete.

### 2026-07-18 (Session 41) — Version + build stamping in About dialog

**Why.** Deploys go local build → `rsync` into the portfolio repo → GitHub
Pages, where CDN/browser caching can leave it unclear whether a given push
actually loaded. There was no way to confirm which build is live from inside
the running app. Same problem on Android after an install.

**What.** File → About Estoria now shows a stamp line under the schema line:

> `Version 0.1.0 (30913f9) · build 2026-07-19 03:21 UTC`

- **Version** — from `version` in `package.json` (single source of truth).
- **Git short SHA** — auto-derived, so every commit changes it with no manual
  bump. Gets a **`-dev`** suffix when the working tree is dirty and falls back
  to `unknown` if git isn't available (e.g. a source tarball). A clean release
  build shows the bare SHA, so `-dev` on the live site means an uncommitted
  build slipped out.
- **Build time** — stamped every `vite build` (and dev-server start), UTC. It
  changes on **every** build, so a fresh timestamp confirms the new bundle
  loaded even when the version/SHA didn't change — the actual "did the push
  land" signal.

**Mechanism.** `vite.config.ts` injects three compile-time globals via
`define`: `__APP_VERSION__` (reads `package.json`), `__GIT_COMMIT__`
(`git rev-parse --short HEAD`, dirtiness from `git status --porcelain`), and
`__BUILD_TIME__` (`new Date().toISOString()`). Declared in
[`src/vite-env.d.ts`](../src/vite-env.d.ts); rendered by
[`AboutModal.tsx`](../src/components/modals/AboutModal.tsx) (the timestamp is
sliced to `YYYY-MM-DD HH:mm` + ` UTC`). **Because the SHA is read at build
time, build from the committed tip** or releases carry a `-dev` suffix. Verified
in the dev preview (About dialog showed the stamp; `typecheck` clean).

**Android parity (same session, `Estoria-aa` repo).** The companion app's
About dialog got the same `Version <v> (<sha>) · build <ts>` line. Kotlin can't
read git at runtime, so `app/build.gradle.kts` derives the SHA/dirty flag/build
time via `providers.exec` at configuration time and exposes them as
`BuildConfig.GIT_COMMIT` / `BuildConfig.BUILD_TIME` (needs
`buildFeatures { buildConfig = true }`); `AboutDialog` in `AppRoot.kt` renders
them. Compiles clean; generated `BuildConfig` confirmed. **Each app shows its
own repo's commit — they intentionally differ** (each proves its own platform's
build). Documented on the Android side in `ESTORIA-ANDROID.md` Session 17.

### 2026-07-19 (Session 42) — Build stamp reworked to an auto-incrementing number

**Supersedes Session 41's mechanism.** Two rounds of feedback reframed the goal:
what's actually wanted is a number that (a) **changes on every change** with no
manual bump, and (b) confirms the exact committed build reached prod (the
website is where writing happens). Session 41's raw SHA changed per commit but
didn't read as a "number," and a manual `package.json` version (briefly
considered) doesn't change per change at all. Landing point:

- **Build number = `git rev-list --count HEAD`** — a monotonic integer that
  ticks up on every commit (…59 → 60 → 61…). Paired with the short SHA
  (`-dev` when the tree is dirty) and build time. Semver `version` stays as the
  human release label. About shows: `v0.1.0 · build 60 · 014dd82 · <ts> UTC`.
- **Injected into `index.html`, not `define`d.** A small Vite plugin
  (`estoria-build-info`) writes `window.__ESTORIA_BUILD__` via
  `transformIndexHtml`. That hook runs **per request in dev** (so a long-running
  dev server is never stale — the exact bug that kicked this off) and **once,
  frozen, in a prod build** (so `index.html` and `version.json` agree). The old
  `__APP_VERSION__` / `__GIT_COMMIT__` / `__BUILD_TIME__` globals are gone;
  `Window.__ESTORIA_BUILD__` typed in `vite-env.d.ts`.
- **`dist/version.json`** (`{version, build, commit, builtAt}`) is emitted on
  prod builds as a cache-bustable manifest for deploy verification.
- **`npm run deploy`** (`scripts/deploy.sh`) is the whole loop: refuses a dirty
  tree (prod must carry a real commit), builds, `rsync`s into the portfolio
  repo, commits + pushes it, then polls `…/estoria/version.json` until prod
  reports the shipped `commit` — an explicit "✓ live" that your approved build
  is what the website serves. Replaces the old `sync:portfolio` script.

**Android parity (Session 18):** same `v… · build N · sha · time` line, where
`build N` = commit count and now also drives `versionCode`. Separate repo, so
its count differs from the web app's — expected.

Verified: dev About shows `build 60` and refreshes on reload (fresh per-request
injection confirmed via `window.__ESTORIA_BUILD__`); `typecheck` clean.

### 2026-07-25 (Session 43) — Import parser: tolerate AI drift, fix the export round-trip

**Why.** An audit of the import feature confirmed it still works end-to-end (the
parser was kept in sync through the v4 version forks and v5 asset changes, so
nothing broke underneath it), but surfaced four **pre-existing tolerance gaps**.
All four fail the same way: the file looks valid, the import reports success,
and data is silently dropped with no warning. Two of them mean **Estoria's own
markdown export did not re-import cleanly.**

**Fixed** — all in [`markdown.ts`](../src/lib/markdown.ts):

1. **Scene tags wrapped in emphasis.** The tag regex required a bare
   `(therefore)` at end of line, but `buildMarkdown` writes `_(therefore)_`.
   Every link type therefore defaulted to `therefore` and the literal `_(…)_`
   stayed glued to the scene text. Now matches `(but)`, `_(but)_`, `**(but)**`.
2. **`**Characters:**` cast label.** The parser needed a bare `Characters:`
   prefix; the export writes `**Characters:** [[Ann]], [[Bob]]`, so chapter
   casts imported empty. Now tolerates emphasis on either side of the colon
   (`Characters:`, `**Characters:**`, `_Characters_:`) plus a bullet prefix.
   The `Scenes:` label skip got the same treatment, so the export's `**Scenes**`
   is recognized as a label rather than ignored by luck.
3. **Bullet scenes.** `- A scene` instead of `1. A scene` matched nothing, so
   the chapter imported with the single placeholder `"New scene."`. AIs drift to
   bullets freely. Now accepts `-`, `*`, `+` alongside `1.` / `1)`.
4. **`- **Name**: role`.** Only the em/en-dash and hyphen separators were
   matched, so a colon dropped the **entire** Characters section (0 characters,
   no warning). Colon now accepted.

**Ordering note.** The cast-line match must stay *ahead* of the scene match in
the chapter loop — now that bullets are scenes, a bulleted `- Characters: …`
line would otherwise land as a scene.

**Comment corrected, not deleted.** [`markdown.ts:68`](../src/lib/markdown.ts)
claimed exports "round-trip through `parseImportMarkdown` without loss." After
fixes 1 and 2 the cast, world, chapters and scenes genuinely do re-import — but
**assets, story notes and series data are still not re-read**, so the original
claim was, and would have remained, wrong. The comment now says which parts
survive. Note the Export modal only advertises Obsidian vault export, so no
user-facing promise was ever broken.

**Verified.** `typecheck` clean, plus a 22-assertion harness run against the
real compiled module (esbuild bundle, no mocks) over three fixtures: an AI-drift
file exercising all four gaps, a canonical numbered/dash file to catch
regressions, and a full `buildMarkdown` → `parseImportMarkdown` round trip. All
pass; stashing the fixes fails 6. **Caveat:** the round-trip assertions compare
export-then-import against the source doc, so pre-fix they passed *trivially*
(both sides degraded to `["New scene."]` identically). They only became
meaningful once fix 3 landed — the drift fixture is what actually holds the
line. Not verified through the browser UI: the in-app browser has no
file-upload tool, so a drag-drop import isn't drivable there.

**Known gaps, deliberately left** (ranked, from the same audit):

- **Validation only counts chapters.**
  [`ImportModal.tsx:31`](../src/components/modals/ImportModal.tsx) errors only
  when `chapters === 0`. Fixes 1 and 3 remove the main route to "3 chapters, 0
  real scenes," but a file yielding **0 characters still reports success**.
- **Acts past V in non-arabic form.** `## Act VI` falls back to a sequence
  counter — [`parseActNumber`](../src/lib/markdown.ts) maps only i–v. This
  affects **Estoria's own export**, which writes roman numerals.
- **Success card below the fold.** At a 720px-tall window the card renders past
  the modal's scroll with no auto-scroll, so a successful import can look like
  nothing happened.
- **`summarizeImport` is dead code.** Exported at
  [`markdown.ts:177`](../src/lib/markdown.ts) with no callers — the modal uses
  the summary returned by `parseImportMarkdown`. It carries its own,
  now-divergent, scene-counting regex (`^\d+\.\s+`, still numeric-only).

### 2026-07-25 (Session 44) — Doc/code drift audit: §§2–9 realigned (no code changes)

Read the reference sections of this file against `src/` and fixed everything
that no longer described the code. The session log below was left untouched —
it's a dated record, not a description of the present. **Docs only; no source
files changed.**

- **§2** — dropped the ⚠️ "`zustandStorage` bypasses the adapter / double-writes"
  warning. That was fixed in Session 20 and §9 item 1 already said so, so the
  two sections contradicted each other. Replaced with what's actually left
  before a Drive adapter (per-project `StorageAdapter` granularity).
- **§3 project layout** — the tree was the Session-1 scaffold. It still listed
  `SeriesModal`, deleted back in Session 4 when the series map replaced the
  planner modal, and omitted ~20 files that do exist: six `lib/`
  modules (`sync`, `backup`, `drafts`, `entities`, `refs`, `files`), seven
  modals, `Footer`/`SeriesMap`/`Welcome`/`Lightbox`/`ConfirmDialog`/the sync
  popover, the whole `ui/` set, `data/emptyStory.ts`, `scripts/deploy.sh` and
  `docs/archives/REVIEW-FINDINGS.md`. Rewritten from the real tree.
- **§4 feature status** — six rows claimed work that has since shipped, and
  three of them contradicted §6's own "✅ done" roadmap entries: ref-label
  renaming (`RefList` edits labels through `updateAsset`), character inline
  editing, world editing + refs, open-project-from-disk ("Open file…" in the
  Projects modal), series book editing, and project renaming (`EditableName` in
  the toolbar). Added a row for the version/build stamp (Sessions 41–42).
  Verified-still-accurate and deliberately left as-is: timeline fit-to-view
  (board-only), import validation counting chapters only, template counts
  (30 cards = 29 + blank, 9 life-story, 10 genre, 3 facets).
- **§5** — added `preview` and `deploy`; the file documented four of the six
  scripts in `package.json`.
- **§6 cross-project note** — said Android shares "schema **v3**". It's **v5**
  (`SCHEMA_VERSION` in `types.ts`); v4 and v5 both landed after that note was
  written, which made the cross-app compatibility warning read as weaker than
  it is. Now points at the constant.
- **§8** — the deploy runbook still described `npm run sync:portfolio`, removed
  in Session 42. Rewritten around `npm run deploy`, keeping the Pages-verify
  and stuck-deploy lore as the manual fallback.
- **§9 item 14** — half of it ("confirm shows the base `ch.title` rather than
  the draft-resolved title") became moot at schema v4, when versions became
  standalone forks and the override layer disappeared. Marked moot; the
  `ChapterDetail`-subscribes-to-whole-`doc` half stands.
- **Checked, no change needed:** §9 items 12 (wheel zoom still origin-anchored,
  `Board.tsx` `onWheel` scales without a cursor correction), 13 (images still
  inline data URLs) and 11 (export still active-book-only) are all still true.
  `README.md` matches `package.json` and the stack. `REVIEW-FINDINGS.md` is
  explicitly an archived Session-29 record and needs no upkeep.

### 2026-07-25 (Session 45) — SPECS split: reference vs. history

**Why.** SPECS.md had grown to 2,381 lines / 148KB, and **75% of it was this
log** (115KB vs 40KB of actual reference). Two consequences, one of which the
Session 44 audit had just finished cleaning up after:

- The reference sections went stale while the log stayed current — the log is
  what you append to at the end of a session, so §§2–9 were something you
  scrolled *past* rather than maintained. Every drift found in Session 44 was
  in the 25% nobody scrolled to.
- Reading the spec for context meant pulling all 148KB (~37k tokens) to get at
  the 40KB that describes the present.

**What.** Straight split, no content rewritten:

- **[`SPECS.md`](SPECS.md)** keeps §§1–9 — what Estoria is, how it's built,
  feature status, the fix backlog. 626 lines. Retitled "Estoria — Specs"; the
  intro now says to update the relevant section *in the same session*, and that
  appending here is not a substitute for that.
- **`SESSIONS.md`** (this file) takes the whole Session Log, unchanged, newest
  still at the bottom. `§N` references throughout point at SPECS.md — noted in
  the header.
- Pointers fixed: §9's "check items off with a session-log entry" and item 5's
  "see Session 40 entry below" now link here; the §3 tree lists both files;
  `README.md` gained a line for the log.

**Deliberately not touched.** `REVIEW-FINDINGS.md` still says "log the session
in `docs/SPECS.md`" in a few places — it's an archived record of three
completed reviews, marked as such at the top, so it's left as written rather
than retro-edited. Source-comment references (`docs/SPECS.md §8`, `SPECS §9
item 5`) are all section refs and remain valid, since the numbered sections
stayed in SPECS.md.

### 2026-07-25 (Session 46) — REVIEW-FINDINGS moved to docs/archives/

Closing out the docs pass. Audited what's left in `docs/` against this log:

- **`README.md` stays** — different job (front door: what it is, `npm install`,
  stack, where to go next). No overlap with SPECS.
- **`REVIEW-FINDINGS.md` has no forward purpose.** It's four concatenated,
  fully-closed documents: the Session 29 review (fixed Session 30), the
  Session 31 review (fixed Sessions 31–32), the v5 asset-refs task brief
  (built Session 38), and the Session 38 review (fixed Session 39). Every
  outcome is already in this log, and Session 37 above carries the full v5
  decision list including the production-migration note the brief asked to
  have copied across. What's *only* in that file is pre-fix forensics —
  repro steps, rejected alternatives, one-time verify instructions, and line
  numbers against `df7261e` / `d4faa44` / `49abc79` that went stale long ago.

**Not merged into this log** — deliberately. Folding 645 lines of stale
pre-fix diagnostics in here would re-bloat the file Session 45 just separated
out, and would duplicate outcomes that are already recorded above in better
form. Moved instead:

- `docs/REVIEW-FINDINGS.md` → **`docs/archives/REVIEW-FINDINGS.md`**, with a
  file-level banner saying every item is closed, that line numbers are frozen
  against the named commits, and that its "log the session in `docs/SPECS.md`"
  instruction now means `SESSIONS.md`. The name read like open findings when
  nothing in it is open.
- Its 7 relative links into `src/` re-based one level deeper; the 8 path
  references to it in this log were rewritten to the new location. **That's a
  mechanical path fix, not a rewrite of history** — the entries' wording is
  untouched, they just point where the file actually is now.
- The §3 tree in SPECS.md now shows `docs/archives/` as a folder for closed
  records, so future ones have an obvious home.

### 2026-07-25 (Session 47) — Nothing is saved until you type into it

**Why.** "+ Add character", "+ Add world entry" and "+ Note / + Image" each
wrote a real record the instant you clicked. Walk away without typing and that
placeholder was saved data: autosaved, exported, synced to the phone, and listed
forever as "Unnamed character" / "Untitled entry" / "Empty note". Worse, the
blank record was immediately castable — a nameless character showed up in the
chapter modal's picker as a pickable "Unnamed character" chip.

**The rule the user set:** if nothing was typed into any field, don't save it —
and don't dignify it with a name like "Unnamed character" before then either. A
placeholder someone actually wants gets typed ("Unnamed soldier").

**Two layers, and the first one is the real fix.**

**1. Deferred creation — the record doesn't exist until it has content.**
"+ Add …" now opens a *draft*: a card that renders exactly like the real thing
but lives outside `doc`. The first keystroke in any field (or first uploaded
file, for an image) commits it. Nothing blank is ever written, so nothing blank
can be picked, exported or synced.

- Characters / world entries: `charDraft` / `worldDraft` in the store —
  transient, deliberately not in `partialize`. `startCharDraft` →
  `updateCharDraft` (commits when `isCharacterEmpty` goes false) →
  `discardCharDraft`. The panels render `doc.characters.concat(draft)` so the
  draft sits last, which is exactly where the committed record lands.
- Notes / images: the draft lives inside `RefList` itself (local state), so all
  three surfaces that use it — chapter modal, world entry, shared library —
  get the behavior at once. On commit it calls `onAdd(kind, id)` then the edit.
- **The draft carries the id it will keep.** That's what makes the commit
  invisible: same key, same position, so React reuses the DOM node and the
  keystroke that creates the record doesn't blur the field you're typing in.
  Hence `addChapterRef` / `addWorldRef` / `addAsset` gained an optional
  caller-supplied id, and `uid()` moved to [`lib/ids.ts`](../src/lib/ids.ts) so
  components can mint one. `RefList`'s `idPrefix` keeps ids self-describing
  ("r" for ref links, "a" in the library where the item id *is* the asset id).
- Chapter-modal "+ Create new character" / "+ Create new entry" open a draft in
  the panel rather than creating a record.
- A draft world entry hides its References block — a reference has to hang off a
  saved entry, and it reappears the moment the entry becomes real.
- **Every draft card carries its own "Discard"** and skips the confirm; there's
  nothing saved to lose. Character and world cards use the panels' bordered
  button; note/image drafts get one too (a compact text button in the card-view
  cell, which is only 150px tall), so the note surfaces match the panels rather
  than relying on the hover ✕ alone.

**2. A sweeper for records emptied later** — new
[`src/lib/prune.ts`](../src/lib/prune.ts). Deferred creation stops blanks being
born; `pruneEmptyEntries(doc)` removes ones that *become* blank (you clear the
last field) and any left over from before this change. It runs on the same
closes: `setPanel(panel, false)` for the three editing panels, and
`closeChapter()`, via a shared `prunedState()` in `useStore.ts` that also clears
`selChar`/`selWorld` when the selected record was the one removed.

- Blank **assets** are swept first — unpinned everywhere through the existing
  `removeAssetLinks`, so no dangling refs — which can leave a world entry with
  no refs and make *it* sweepable in the same pass.
- Characters and world entries go through `deleteCharacterDoc` /
  `deleteWorldEntryDoc`, the same helpers the explicit Delete buttons use, so
  the id is cleared from every chapter in all four board locations. **Being
  cast in a chapter does not save a blank record** — that was the first cut of
  this work, and the user rejected it: an empty record says nothing about the
  chapter it's attached to.
- Only *content* counts: a character's `color` and a world entry's `cat` are
  app-chosen defaults, not something the user wrote.
- Returns the **same doc object** when nothing is sweepable, so a close that
  changes nothing doesn't dirty the doc — no autosave write, no sync-fingerprint
  churn.

**Not a cross-app event.** No schema change — this decides whether a record is
written, never its shape, so the `.estoria.json` contract and the Android app
are unaffected. Worth mirroring on the phone eventually (same three "+ Add"
flows), but nothing breaks while it isn't.

**Verified in the dev server** on a freshly loaded sample: "+ Add character"
leaves `characters` at 4 and shows a greyed "New character — nothing saved yet"
card; typing "Halden Roe" into it commits on the first keystroke with **all 10
characters landing and focus retained** (the remount test); same for a world
draft committed via its Description, whose References block appears only once
it's real; "+ Note" in the chapter modal writes nothing and leaves nothing
behind when the modal is closed. Sweeper: Halden Roe cast in chapter 1, then
name cleared → on panel close the character is gone (5 → 4) **and** chapter 1's
cast drops 3 → 2, no dangling id. No console errors; typecheck and production
build clean.

**Formatting note.** A `npx prettier --write` on the touched files reformatted
large stretches of untouched code (no prettier config in the repo, so defaults
fought the existing ~100-col hand style). Reverted and the edits re-applied by
hand — the diff is only the change.

### 2026-07-25 (Session 47b) — One meaning per control: ✕ detaches, a word destroys

Follow-up the user called out while testing: removal read inconsistently across
notes, characters and world entries. Auditing it, there *was* a rule — it just
had one exception, and the exception was the destructive one.

**The rule already in the code:** an ✕ takes something off the thing you're
looking at (chapter character chip, chapter world chip, a pinned note in a
chapter or world entry — all "it stays in the shared library"), while the record
itself is only destroyed from the panel that owns it, via a labelled button
("Delete character", "Delete entry").

**The exception:** the shared library in the Notes panel has nothing to detach
from, so *its* ✕ deleted the asset everywhere — unpinning it from every chapter
and version. Same glyph, same-looking row, two very different blast radii, with
nothing to tell them apart but the wording of the confirm dialog.

**What changed:**

- `RefList` gained **`removeMode: "detach" | "destroy"`** (default `detach`).
  `detach` keeps the ✕ (title now "Remove from here"); `destroy` drops the ✕ and
  renders a labelled button instead. Only `NotesPanel` passes `destroy`.
- List view: a bordered **"Delete"** in the expanded row, matching "Delete
  character" / "Delete entry". The button says just "Delete" (user's call) —
  the confirm is what spells out the blast radius: "Delete this note
  everywhere? / It is pinned in N places across your versions and books."
- Card view: the cells are a fixed 164x150, and 13 permanent "Delete" labels in
  a grid is noise — so it **takes over the caption's line on hover**.
  A word, on the card you're pointing at, with no extra line and no reflow.
- **Detach confirms now say "Remove", not "Delete".** `confirmLabel` already
  existed (SeriesMap uses it) but the ref prompts never set it, so "Remove from
  this chapter?" sat above a red **Delete** button. `RefList`'s `deletePrompt`
  type is now `Omit<ConfirmRequest, "onConfirm">` so callers can reach the whole
  confirm API instead of a hand-copied subset.

**Deliberately not changed:** the confirm asymmetry — unlinking a note asks,
pulling a character out of a chapter doesn't — noted for the user, left alone as
taste rather than hazard.

**Verified in the dev server:** library list view has zero inline ✕ and one
"Delete" per expanded row; card view shows none at rest and swaps the
caption for the label on the hovered card only; the World panel still shows the
✕ (title "Remove from here") whose confirm now reads "Remove from this world
entry? / It stays in the shared library." over a **Remove** button; the library's
confirm still reads "Delete this image everywhere? / It is pinned in 1 place…"
over a red **Delete**. Cancelling leaves all 13 assets intact. No console errors.

**Shipped** as `d6f4413`, pushed to origin and deployed — `npm run deploy`
verified prod reporting that commit at www.labrarf.com/estoria. The push also
carried three doc-only commits (9d0a43d, 7a7aa29, 31af6ae) that had been sitting
unpushed since Sessions 44-46.

**No schema change.** Drafts live in transient store state, never in `doc`, and
`SCHEMA_VERSION` is untouched — so this is *not* a cross-app compatibility event
(§6). One behavioural divergence to be aware of on the Android side: the web app
now sweeps blank characters / world entries / assets when a panel closes, so a
blank record created on the phone will quietly disappear the next time the web
app opens and closes that panel. The file contract is unaffected; only content
that was empty in both apps' eyes goes away. Worth mirroring deferred creation
on Android eventually, but nothing breaks in the meantime.

### 2026-07-26 (Session 48) — Pinnable to-dos, archiving, pin-jumping, live canvas beside a panel

Eight user-requested changes in one pass, on `feature/notes-canvas-upgrades`.
Four shapes of the work were settled with the user up front: remember the scene
layout **per canvas size** (rather than free placement), panels toggle between
**side panel and full screen** (rather than a width cycle), to-dos get a **real
`TODO` asset kind with a schema bump** (rather than a flagged note), and
archiving **unpins everywhere** (rather than keeping pins).

**Schema v6** (`types.ts`, `normalizeDoc`) — all additive: `RefKind` gains
`"TODO"` with `Asset.items: TodoItem[]`; `Asset.archived?`;
`Chapter.scenePosCompact?`. New `normalizeAssets()` coerces every asset into a
renderable shape on file open (unknown kind → NOTE, `TODO` always has `items`,
`archived` a real boolean). **This is an open cross-app event — see §6:** Android
reads v5 and will now refuse files this app writes until it catches up.

**What changed, item by item:**

- **Reorder pinned resources** — grip-drag *or* type a position number, in the
  library, on a chapter, and on a world entry. Each surface owns its order
  (`reorderAsset` / `reorderChapterRef` / `reorderWorldRef`); `reorderAsset`
  counts only non-archived items and leaves archived array slots untouched, so
  archiving something never reshuffles the order around it. The drag is
  **pointer-based** (mousedown + window listeners), matching the board, timeline
  and scene canvas — HTML5 drag-and-drop would have been a second mechanic for
  the same gesture. Listeners attach in the mousedown handler, not from an effect
  on the drag state: an effect only runs after the next render, so a drag
  finished inside one frame would complete before anything was listening.
- **See more of Notes / World / Characters + keep using the canvas** — one new
  `Drawer` in `ui/Overlay.tsx` with an Expand/Collapse `SizeButton`
  (`panelExpanded`, persisted). The default 460px size is now laid out **beside**
  the canvas in a flex row in `App.tsx`, with no scrim — that single change is
  what makes the board live while a panel is open, and it stops the panel
  covering the toolbar and footer. Full screen is a fixed overlay, content capped
  at 1180px. All three panels moved onto it (their sticky-header + scroll-body
  markup collapsed into the `Drawer`'s two slots).
- **Click into a chapter** — a press that doesn't move is a click and opens the
  chapter, on the board *and* the timeline; a click that jiggled a pixel or two
  restores the card's position so opening a chapter can never nudge the board.
  The `onDoubleClick` is gone (by the time a second click lands, the modal is
  over the card) and the chapter modal now ignores **backdrop** dismissals for
  400ms after opening, so the old double-click habit can't open-then-close it.
  Footer hint reworded.
- **Scene arrangement survives the expand/collapse toggle** — the effect that
  re-arranged scenes on toggle is deleted. Each canvas size keeps its own layout
  (`scenePos` expanded / `scenePosCompact` collapsed); toggling swaps between
  them. `openChapter` lays out only whichever side is missing or stale, so an
  existing arrangement is never touched; every structural edit writes both via
  `scenePosBoth`, and auto-arrange writes only the size on screen.
- **Show where a note is pinned, and jump there** — `findAssetPins()` walks all
  five ref locations and returns pins ordered board-first, each carrying its book
  and version. The library lists them as buttons; `jumpToChapter` switches book
  and version through `switchBook`/`setActiveDraft` (the actions that stash the
  board being left), closes the panel via `setPanel` so its blank-draft sweep
  still runs, and opens the chapter — bailing to the board if the pin went stale.
  World pins open the World panel on that entry.
- **Archive** — `archiveAsset` reuses `removeAssetLinks` to unpin everywhere,
  then flags `archived`; the asset drops out of the library list and the link
  picker and appears under "Archived · N" with Restore and Delete. The confirm
  states the cost *before* committing ("unpinned from N places… restoring brings
  back the note, not the pins") because that half isn't undone by a restore.
- **To-do lists** — a `TODO` asset renders as a checklist in both `RefList`
  views: tick/untick with strikethrough, add/remove tasks, Enter adds the next
  one, "N/M done" as the row snippet and library caption. Pinnable and linkable
  exactly like a note. Markdown export emits real checkboxes under the chapter's
  **Pinned:** line, skipping blank task lines and closing the list with a blank
  line so the next bold block still renders.

**Two bugs found and fixed while testing, both pre-existing:**

1. **Typing into a brand-new pinned note/to-do lost characters.** `ChapterDetail`
   and `WorldPanel` resolved `refId → assetId` from their own render closure, so
   keystrokes dispatched in the moments right after a draft committed looked up a
   link that didn't exist in that render and were silently dropped — a 13-char
   burst landed as an empty label. Resolution moved into the store
   (`updateChapterRefAsset` / `updateWorldRefAsset`), where the lookup always
   sees current state.
2. **A fit measured before the stylesheet applied mirrored the board.** With a
   0-height viewport, `fitToContent`'s formula goes negative and
   `scale(-0.17)` flips the whole canvas (reproducible on a dev-server reload).
   Both fit helpers now return a neutral camera for an unmeasured viewport and
   floor the zoom at `FIT_ZOOM_MIN`.

**Verified in the dev server** (sample story, 8 chapters, 3 books, 2 versions):
click-into-chapter on board and timeline; a collapse→expand round trip leaving
both scene layouts byte-identical while each keeps its own column count (4 vs 3
for 6 scenes); typed position reorder committing on Enter and on blur; grip-drag
moving a library row from 13 to 10 to 7; a to-do created, titled in one fast
burst, two tasks added, one ticked, "1/3 done"; the library note's pin list
showing both a current-version and an Alt-ending pin, and the cross-version chip
switching version, closing the panel and opening the chapter in that fork;
archiving leaving **zero** pins across all five locations, hiding the note from
the library and the link picker, and listing it with Restore; both panels docked
side by side with the board panning underneath; markdown export carrying
`- [x] Cut the harbor exposition`; and a reload confirming schema 6, `TODO`
items, `archived`, both scene layouts and `panelExpanded` all round-tripping
through persist. `npm run build` clean throughout. No console errors.

**Not shipped** — on the branch, unpushed and undeployed, awaiting the user's
call (deploy needs their approval, and the Android side should be aware of the
v6 event first).

### 2026-07-26 (Session 48b) — Panels go back to modal; jump into a chapter from a character or world entry

Same-session revisions after the user reviewed 48.

- **The docked side panel is reverted.** Session 48 laid the 460px panel out
  *beside* the canvas with no scrim, so the board stayed live; the user preferred
  the older look and feel — everything behind a panel dimmed and inert — and
  asked for that back, **keeping** the Expand size toggle. `Drawer` now wraps
  both sizes in the usual `Scrim` (side panel = right-hand column over a dimmed
  backdrop that closes on click; full screen = the same panel filling the
  viewport, which needs no backdrop of its own), and `App.tsx` is back to
  Toolbar + canvas + Footer with the panels as overlays.
- **"One panel at a time" turned out to be a consequence, not a feature.** The
  user spotted this while reviewing: the scrim is `fixed inset-0` and covers the
  toolbar, so clicking Characters while Notes is open never reaches that button —
  the click lands on the backdrop and closes Notes. Two panels were only ever
  possible in the docked layout being removed. So nothing was built for it; the
  invariant is now just asserted in `setPanel` (opening one editing panel clears
  the other two) to cover the paths that *aren't* geometry-blocked: a draft
  started from the chapter modal (`startCharDraft` / `startWorldDraft`) and the
  Notes panel's world-pin jump, which now routes through `setPanel` so the panel
  it leaves still gets its blank-draft sweep. One sharp edge handled: the sweep
  fires only when a panel that **was** open is closing, so re-opening the panel
  you're already in can't throw away the draft card you're typing into.
- **Jump into a chapter from a character or a world entry.** The mirror of the
  notes pin list, in the direction the user asked for (panel → chapter only; the
  chapter modal's own character/world chips are unchanged). A character's
  "Appears in" chips were dead `Ch 3` labels — they're now buttons that close the
  panel and open that chapter. World entries had no usage list at all; they get
  the same one, built from `chapter.worldRefs`. Both are scoped to the **loaded
  board**, matching the "in N chapters" line already above them — deliberately
  narrower than a note's pin list, which spans books and versions because the
  asset library is series-shared.

**Verified in the dev server:** the backdrop is back (a canvas drag while a panel
is open pans nothing and closes the panel; the board is full width again with no
layout displacement); Expand still fills the screen and Collapse returns to the
460px column; opening a panel in state while another is open leaves exactly one
panel and one scrim; an untyped world draft survives re-opening its own panel;
Sela Voss's `Ch 7 ↗` chip opens "The Long Dark" with the panel closed; a world
entry linked to that chapter shows `APPEARS IN · Ch 7 ↗` and jumps the same way.
`npm run build` clean. No console errors.

**Still on the branch, unpushed and undeployed** — schema v6 and the open
cross-app event from Session 48 are unchanged by this revision.

### 2026-07-26 (Session 48c) — Pin chips read like "Appears in"; add-row order; verification sweep

Two small user revisions, plus the verification still owed on 48.

- **A note's "Pinned in" chips are now as short as a character's "Appears in".**
  They were `03 The Drowned Map` with a trailing `Book · Version`, which the user
  called "the entire thing". A chip is now just `Ch N ↗` in the same mono style,
  with the chapter name in the tooltip. The location isn't dropped: pins outside
  the board on screen are **grouped** under one small "Book · Version" heading
  (world pins under "World"), so the information survives without repeating
  itself on every chip.
- **Add row reordered to + Note · + To-do · + Image** — one change in `RefList`,
  so it holds in the chapter modal, the World panel and the shared library.

**Verification sweep (dev server), covering what 48 had left unchecked:**

- **v5 → v6 migration on real persisted state.** Rewound the persisted store to
  `version: 5` (no `scenePosCompact`, no `TODO`, no `archived`) and reloaded:
  `migrate` → `normalizeDoc` ran, all 8 chapters and 13 assets survived with
  kinds intact, store re-persisted at v6. The `scenePosCompact` backfill is
  **lazy** — only the chapter you open gains a layout, so a migration doesn't
  rewrite the whole doc.
- **Archive.** Confirm reads "It will be unpinned from 1 place and moved to the
  archive. Restoring it later brings back the note, not the pins." Archiving
  swept the pin (a *world-entry* pin, so the cross-location sweep is exercised),
  removed it from the library grid, raised "Archived · 1", and kept the record.
  It is **absent from the link picker** (12 of 13 assets offered). **Restore**
  clears the flag, returns it to the library, and leaves it unpinned.
- **To-do end to end.** Draft commits on the first keystroke and pins itself;
  tasks add, tick and persist; row/caption read "1/2 done"; markdown export
  emits `**To-do — Ch1 revision list**` followed by `- [x]` / `- [ ]`.
- **Reordering.** Typed position works in the shared library (14 to 1) and on a
  chapter's pins (verified in 48); commits on Enter or blur.
- **Cleanup:** the dev-server localStorage was snapshotted before these
  destructive tests and restored byte-for-byte afterwards (13,583 bytes, original
  asset order, no to-dos, no archived items, no stray keys). One stray mutation
  along the way (a probe selector that matched an existing note's title field
  instead of the new to-do's) was undone by that restore.

`npm run build` clean. No console errors. Still on the branch, unpushed and
undeployed.

### 2026-07-26 (Session 48 ship) — Shipped to prod

`f2ccc94` — "Pinnable to-dos, archiving, pin-jumping, and one-click chapters".
Merged fast-forward into `main`, pushed `main` and
`feature/notes-canvas-upgrades` to GitHub, then `npm run deploy`:
portfolio commit `cdf5698`, and prod confirmed serving `f2ccc94` at
https://www.labrarf.com/estoria on the 5th poll.

**Schema v6 is now live on the web.** The open cross-app event in SPECS §6
stands: until the Android app reads v6 it will refuse files this app writes
(`SchemaTooNewError` is the guard), so cross-app Sync is one-directional in the
meantime. Nothing about the file contract changed beyond the three additive
fields.

**Spec drift found in the post-ship review** (§4 rows and §3 tree checked line by
line against the code):

- "Nothing saved until typed" still listed only "Note / Image" as the draft-
  opening buttons — corrected to include To-do, with the rule that a to-do counts
  as typed on its title *or* a task's text (`isAssetEmpty`).
- The `refs.ts` line in the §3 tree said "(schema v5)" without noting that
  `ResolvedRef` now carries a to-do's `items`.
- Everything else matched: the board row already describes click-to-open and the
  400ms backdrop guard, scene layout per canvas size, the modal `Drawer` and
  one-panel-at-a-time, reorder/pins/archive/to-do rows, and the v6 block in §6.

**Tooling hazard worth knowing about (pre-existing, not introduced by this
work):** `src/store/persistence.ts` contains two literal NUL bytes — one in a
comment, one in the map key built by the v5 ref-to-asset migration
(`refId` + NUL + `contentKey(r)`). They are deliberate delimiters and compile
fine, but they make `grep` and `ripgrep` classify the file as **binary**, so
searches over it return nothing *silently* — which is exactly what happened
during this review until a byte-level check caught it. Writing them as
backslash-u escapes would keep the runtime string identical and make the file
searchable again; left alone for now rather than slipping a code change into a
finished ship.

---

### 2026-07-26 (Session 49) — The position number moves to the head of the row

**Ask:** in the notes library and the chapter modal, move a pinned resource's
position number from the right of the row (beside the expand caret) to the left,
between the grab handle and the kind icon. Question first: big lift or quick?

**Quick — and it was one line, because the surface is shared.** The notes
library, the chapter modal's Pinned references, and a world entry's refs all
render the same `RefList`, so the list-view row is written once. The change is
`{position(r)}` moving from after the title button to before `ICON[r.kind]`.
Card view already led with the number, so this makes the two views agree rather
than inventing a new arrangement.

Row is now: `⠿ grip · [n] · 📝 icon · title/snippet · ▾`.

**The one real wrinkle: the draft row.** The grip and the number both render
only for saved items (`onReorder && !isDraft`, and `position()` returns null for
the draft). With the number on the right that cost nothing, but on the left it
left the "New note" draft's icon hanging 56px to the left of every row above it.
Fixed with an explicit spacer of exactly that width. Verified by measurement
rather than by eye: `getBoundingClientRect().left` on the icon reads **918 on
saved rows and 918 on the draft row**.

Two things checked and found to be non-issues:

- **Width.** Two-digit positions (the library seed runs to 13) fit the existing
  30px box, and the chapter modal's list is far wider than the 460px panel's, so
  nothing truncates on either surface.
- **Behaviour.** `PositionInput` and the `onCommit` wiring weren't touched. Typed
  a `1` into row 2 of a chapter's pins — rows swapped — then moved it back, so
  the dev-server doc is as it was. `npx tsc -b --noEmit` clean, no console errors.

**Spec drift.** None found — the §4 "Reorder pinned resources" row described the
grip/typed-number pair without ever committing to *where* on the row they sit,
so nothing it said became false. Updated it anyway now that the placement is a
deliberate decision rather than an accident, including the draft-row spacer. The
`RefList` header comment gained the same note.

### 2026-07-26 (Session 49 ship) — Shipped to prod

`3ededa1` — "The position number moves to the head of the pinned-resource row".
Pushed `main` to GitHub, then `npm run deploy`: portfolio commit `e46ad44`, and
prod confirmed serving `3ededa1` (build 72) at https://www.labrarf.com/estoria
on the 5th poll.

Prod was verified by endpoint rather than by clicking through it: `version.json`
reports `3ededa1`, and the bundle it serves (`index-BJc314wI.js`) is the same
hash the local build of that commit produced — so the code checked in the browser
is byte-identical to what's live. Deliberate choice, since the only way to *see*
this particular change on prod is to open the notes library and switch it to list
view, and `refView` is a persisted preference — the check would have quietly
changed a real setting in the real writing environment to confirm a one-line move.

No open drift. The §4 "Reorder pinned resources" row now records the placement
and the draft-row spacer; nothing else in §3 or §4 touches the row's internal
layout. The `persistence.ts` NUL-byte grep hazard noted in the Session 48 ship
is still there, still untouched.

### 2026-07-26 (Session 49b) — "Template addition" in the Pinned-in block

A note in the shared library showed an unexplained line between "Pinned in" and
the Archive/Delete buttons, reading "Template addition". Not a bug: it is the
**group heading naming where a pin lives**, and "Template addition" was a draft
version the user had created. `groupPins` puts pins outside the loaded board
under one small heading instead of repeating the location on every chip, and
`pinWhere` builds that heading from the version's name (prefixed with the book
title only when there's more than one book).

The behaviour was already specced — but the §4 row wrote the heading as
`"Book · Version"` in quotes, which reads like a literal fixed label rather than
a slot filled with the user's own names. That phrasing is what made the line look
like stray chrome. Row rewritten to say the heading *is* the user's names, with
this exact case as the example, plus a note that unexplained text in that block
is usually a version name.

Docs only, no code change.

### 2026-07-26 (Session 50) — Four magical-realism templates

Added the four templates from the "Magical Realism Templates" guide to
`lib/templates.ts`, taking the library from 30 cards to **34**: The Generational
Saga, The Domestic Metaphor, The Urban Dream-Logic, The Historical Haunting.
Fifteen beats each, blurbs and per-chapter prompts taken from the guide.

Three judgement calls, none of them in the source doc:

- **Facet.** All four go in **Genre** (10 → 14). They carry a premise, which is
  what separates Genre from the shape-only Structure facet. Within the Genre run
  they sit **directly after the three speculative-fiction cards** (Dystopian,
  First Contact, Time Loop — the ones `6b8c4d9` added), ahead of Mystery, so the
  guide-sourced genre families stay contiguous. `RAW_TEMPLATES` order is the
  display order, and `GROUP_MEMBERSHIP` is kept in the same order to match.
- **Tag.** One shared `Magical realism` chip rather than four distinct ones. The
  names ("The Domestic Metaphor") don't say magical realism on their own, so the
  chip is the only thing marking them as a family; `mystery` and `romance`
  already share a `Genre` chip, so a repeated tag is not new.
- **Acts.** The guide gives beats but no act breaks — same as the biography and
  speculative-fiction guides before it — so acts are assigned here, cut where the
  story's footing changes: 4/6/5 for Generational Saga, Domestic Metaphor and
  Historical Haunting; **4/7/4** for Urban Dream-Logic, whose act 3 starts at
  "The Core Realization" (the point the protagonist can actually resolve the
  dream world) rather than at the guide's midpoint-ish "Guide's Departure". The
  header comment now records that acts are ours, not the guides'.

Verified in the dev server, not just by typecheck: filter bar reads **34
templates** on All and **14** on Genre, all four cards render with the shared
chip and "15 beats", and Insert on The Generational Saga wrote 15 chapters whose
acts read 1,1,1,1,2,2,2,2,2,2,3,3,3,3,3 in the persisted doc. After the reorder,
the rendered card list reads positions **17–20** for the four, between Time Loop
(16) and Mystery (21). `npx tsc -b --noEmit` clean, no console errors.

**Spec drift.** Two stale counts fixed in the same pass: the §3 file-tree line
for `templates.ts` (30 → 34 cards) and the §4 Templates row ("29 structures +
blank starter" → 33, and 10 → 14 genre beat sheets).

Not deployed — code and docs only, nothing pushed.
