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

### 2026-07-26 (Session 50 ship) — Shipped to prod

`94a780d` — "Add the four magical-realism templates from the guide". Pushed
`main` to GitHub, then `npm run deploy`: portfolio commit `3873af7`, and prod
confirmed serving `94a780d` (build 75) at https://www.labrarf.com/estoria on the
5th poll.

Verified by endpoint rather than by clicking through prod, same as the Session 49
ship: `version.json` reports `94a780d`, and the served bundle
(`index-eztoucp3.js`) is **sha256-identical** to the local build of that commit
(`241cfa36…`). Content checked inside the shipped bundle rather than inferred
from the hash: all four template names, the shared `Magical realism` tag and the
`The Core Realization` beat are present, and their byte offsets run Time Loop →
Generational Saga → Domestic Metaphor → Urban Dream-Logic → Historical Haunting →
Mystery, so the reorder is what actually shipped. Deliberately not exercised in a
real browser session — prod is the live writing environment, and opening a
project there to reach the Templates modal risks touching real data for a change
whose behaviour is fully determined by static template data.

**Spec drift.** None left open. The two stale counts §3 (`templates.ts` file-tree
line) and §4 (Templates row) were fixed in `94a780d` itself and now read 34 cards
/ 33 structures / 14 genre beat sheets, matching `TEMPLATES.length`. Checked the
rest of §4 for claims this change could have falsified: the facet list is still
Structure / Genre / Life story and still an exact partition (11 / 14 / 9 = 34),
so the `TEMPLATE_GROUPS` comment about the facets partitioning the library holds.
The `persistence.ts` NUL-byte grep hazard carried since the Session 48 ship is
still there, still untouched.

### 2026-07-27 (Session 51) — Timeline becomes a reading surface

**Goal, in the user's words:** update the Timeline so the story can be reviewed
continuously, with the scenes visible. Scoped by the user to the **web app only**
— not the Android companion.

**Design settled by mockup, not by argument.** The first two attempts were wrong
and were thrown away rather than defended: (1) scenes inlined into taller chapter
cards, (2) a scene *list* pane beside the timeline. What the user actually wanted
was the timeline **unchanged as a chapter index**, with a second pane showing each
chapter's **scene flow board** — the same canvas the chapter modal draws. Building
a throwaway HTML mockup against the real design tokens is what surfaced that in
three rounds instead of three rebuilds.

- **New `components/Timeline.tsx`** — the whole view, a plain scrolling document
  with no camera. A chapter **rail** (left when vertical, top when horizontal)
  beside a **scene pane**. Rail keeps the existing chapter cards, act bands and
  the curved type-coloured chapter links. Pane renders each chapter's scene flow:
  dotted ground, elastic nodes, curved connectors, therefore/but/and pills at the
  curve midpoints. Two-way scroll sync — the pane's scroll moves the rail's active
  ring and pulls the rail along; a rail click jumps the pane.
- **`layout.ts` — `sceneGrid()`**, elastic. Track count is chosen against a
  *minimum* node size and the nodes then grow into the remainder (clamped by
  `TL_NODE_MIN/MAX_*`). Measured before/after on the same 833px pane: **65% → 96%**
  of the width used, and an 11-scene chapter went from one 1880px column to five
  columns 504px tall. Fills row-major when vertical and column-major when
  horizontal, so beats advance along the axis the pane scrolls.
  `sceneAutoArrange` is untouched — it produces the *persisted* modal layout and
  must stay on its fixed grid.
- **`Board.tsx` is map-only now.** Deleted the timeline branch it had been
  carrying: `isTimeline`, the `timelineDrag` state and its reorder-on-drop block,
  the wheel scroll-pan branch, the act bands, the derived-position preview, and the
  refit-on-return effect (returning from the timeline now remounts `Board`, which
  already fits on mount). `timelineChapterPositions` and `layoutPositions` deleted
  with it; `timelineBookPositions` stays — the series map still uses it.
- **Timeline reordering removed, on the user's instruction.** Worth naming as a
  real loss: drag-to-reorder-with-live-reflow only existed there. Board
  drop-to-reorder still covers the capability. The view's purpose is now reading.
- **Opening a scene:** clicking a scene node calls `openChapterAtScene`, which
  routes through `openChapter` (so the modal's per-mode scene layouts are still
  seeded) and leaves a one-shot `focusScene` marker. `ChapterDetail` consumes it
  on open — scrolls that node into view, focuses its textarea, flashes the border,
  clears the marker. Rail cards *jump* rather than open, so a scene-less chapter's
  empty canvas is itself the way in.
- **Curves, not rules.** The user asked to keep the timeline's existing curved
  chapter links. Kept, in their type colours. One compromise worth knowing: the
  board's edge-to-edge sweep needs roughly twice a card's width in horizontal
  room, which a fixed-width rail hasn't got, so the **vertical** rail routes the
  same cubic down the column (bottom edge → top edge) instead of looping out to
  the sides. The horizontal rail has the room and keeps the board's exact shape.
  Card gaps in the rail are 52px because the curves are drawn in them.
- Zoom control hidden in timeline view (no camera to report); footer hint reworded.

**Why this is safe to keep off Android:** it is presentation over data that
already exists. No new `StoryDoc` fields, no schema bump, and `focusScene` is
transient UI state — outside `doc` and outside `partialize`, so it never reaches
`.estoria.json`. Recorded in §6's cross-app note.

**Verified:** `npm run typecheck` clean. In the running app: both orientations
render; rail links draw in type colour; scroll sync tracks the correct chapter in
each orientation; clicking chapter 7 / scene 2 opened the modal with that
textarea focused and ringed. Two caveats on the verification — the sync handler
was exercised by dispatching scroll events with real geometry rather than by a
physical scroll gesture (the Browser pane stopped accepting the gesture tool
mid-session, and synthetic wheel events don't scroll), and everything was checked
against the sample story, not a large real book.

**Follow-up the same session — wrap connectors were clipped.** Reported as "the
lines connecting the scenes get cut off at the very left and right cards". Cause:
`sceneConnector` used one shape for every link, so at a **row wrap** (last node of
a row → first of the next) the control offsets were derived from a horizontal
delta of a whole row's width, putting them far outside the canvas, where the
`overflow-hidden` rounded border cut them. Only reproducible at widths where a
chapter actually wraps, which is why the first pass at 1600px looked fine. Fixed
by routing a wrap through the empty gutter instead — down out of the bottom edge
and into the top edge of the next row (mirrored for column-fill) — so the curve
stays contained. In-line links keep the original shape. Verified by measuring
every path's box against its canvas: **0 of 16 clipped** in both orientations.

**Note for future verification in this harness:** when the Browser pane is
backgrounded, `document.hidden` is true and rAF is throttled off, so
**ResizeObserver callbacks and scroll events never fire**. That looks exactly
like a broken resize/scroll-sync bug — canvases keep a stale width, the active
chapter never updates. Take a screenshot first to force a paint, then measure.

**Not done, deliberately:** the chapter modal's own canvas still strands space
the same way the timeline pane used to (`sceneColumnsForWidth` fits columns
against a fixed `SCENE_W`). Applying the elastic sizing there is nearly free now
that `sceneGrid` exists, but it changes an existing surface and wasn't asked for.

### 2026-07-27 (Session 51 ship) — Shipped to prod

- `7527b48` on `main` (fast-forwarded from `feature/timeline-scene-review`,
  branch pushed too), portfolio deploy commit `31f0fac`.
- `npm run deploy` verified it: prod served the previous build (`94a780d`) for
  seven polls, then reported `7527b48` — **✓ live at
  https://www.labrarf.com/estoria**.
- **SPECS reviewed against the code before shipping** (§4 timeline rows, §2
  component map, §6 cross-app note, §6 roadmap item 4). Two drifts found and
  fixed in the same commit:
  - The "scene grid fits the space" row quoted **prototype** measurements
    (833px pane → 293px wasted) as if they came from the shipped view. Re-measured
    on the real thing — a 1256px pane renders a 1211px canvas, 96%, 333px nodes —
    and the row now attributes the prototype figure as the design measurement and
    quotes the shipped one separately.
  - The "read the story continuously" row claimed the rail keeps the curved
    chapter links without saying that the **vertical** rail routes them down the
    column instead of looping out to the sides. Understated a real visual
    difference from the board; now stated, with the reason (the board's sweep
    needs ~2× a card's width) and the 52px rail gap that exists to hold them.
- Checked the rest of §4 for claims this change could have falsified: the series
  map's own book timeline (§4 "Series | Add book / reorder") still drags to
  reorder with live reflow — `SeriesMap` and `timelineBookPositions` were not
  touched, so that row still holds even though the *chapter* timeline lost the
  same gesture. §3's series-level "story-map and timeline" line likewise still
  describes the series surface, not this one.

### 2026-07-27 (Session 52) — Cast stack stops overflowing the card

- Reported from a screenshot: a chapter with a dozen characters ran its avatar
  row straight off the right edge of the board card. Arithmetic backs it up —
  twelve 22px chips overlapped at -6px need ~198px, and a 244px card leaves only
  ~160px beside the number badge and status dot.
- The stack now fills **at most 7 slots**; past that the seventh becomes a muted
  `+n` counter (`--soft` background, `--bg` text, so it reads as a count rather
  than another character) with the hidden names in its tooltip. The split is
  shared — `lib/chips.ts` (`CHIP_SLOTS`, `chipSplit`, `chipRestLabel`) — and both
  `Board` and `Timeline` call it, so the two surfaces cap identically.
- **Why 7:** the budget belongs to the *narrowest* card, which is the horizontal
  rail's 234px one, not the board's 244px. Sizing to the board would have let the
  rail overflow again.
- Verified in the dev preview by seeding a 14-character cast into localStorage:
  board (90% and 52% zoom), vertical rail and horizontal rail all render 6 chips
  + `+8` inside the card. Measured rather than eyeballed — the stack is
  right-aligned by a `flex-1` spacer, so overflow shows up on the *left*, and
  there the row still had **99px of clearance** before the status dot. Checked
  light and dark; the sample data was restored afterwards.
- **SPECS reviewed against the code:** §4 "Board | Card meta redesign" was the
  one row this touches and it described the avatars without any cap, so it now
  states the 7-slot budget, the `+n` chip and why the number comes from the rail.
  §2's `lib/` tree gained `chips.ts`. No other drift — the change adds no state,
  no schema, and nothing in §5/§6 speaks to card headers.

### 2026-07-27 (Session 52 ship) — Shipped to prod

- `113100e` on `main` (pushed to origin), portfolio deploy commit `8a62f0c`.
- `npm run deploy` verified it: prod served the previous build (`7527b48`) for
  six polls, then reported `113100e` — **✓ live at
  https://www.labrarf.com/estoria**.

### 2026-07-28 (Session 53) — Enter in a checklist takes the caret with it

- Reported: typing a task and hitting Enter made a new checkbox, but the caret
  stayed in the task you'd just finished — so the next thing you typed landed at
  the end of the previous line.
- Root cause in `RefList`'s `checklist`: Enter called `addItem(r)`, which
  `concat`ed a blank task onto the **end** of the array and focused nothing. Two
  bugs in one line — the caret didn't follow, and Enter pressed mid-list put the
  new row at the bottom instead of below the one you were in.
- `addItem` now takes the task Enter fired from and splices the new one in right
  after it; "+ Add task" passes nothing and still appends. A ref map of the task
  `<input>`s plus a `pendingFocus` id lets an effect focus the row once it
  mounts. **Why the effect has no dep array:** on a *draft* list the first
  keystroke commits the asset through the store, so the new task can take two
  renders to exist — the id stays pending until the input it names is there.
- Used slices rather than `Array.toSpliced`: that's ES2023 and `tsconfig.app`
  targets ES2022. Not worth moving the lib for one call.
- Verified in the dev preview against the sample project, both views: Enter at
  the end of a 1-task list focused the new row; Enter from row 1 of
  `alphabeta / gamma` produced `alphabeta / <caret> / gamma` and the typing
  landed in the middle row; same again in card view. No console errors. The test
  list was deleted from the sample afterwards.
- **SPECS reviewed against the code:** §4 "Notes | To-do lists as a pinnable
  resource" said only "Enter adds the next one", which is now wrong about
  *where* — it states the insert-below rule, the caret move, and that "+ Add
  task" still appends. Checked the neighbouring rows for claims this could have
  falsified: "Nothing saved until typed" still holds (a task created by Enter is
  blank, so a draft list stays a draft until something is typed into it), and
  §5's export rule is untouched — blank tasks were already omitted from markdown.

### 2026-07-28 (Session 53b) — Backspace in an empty task removes it

- Follow-on ask from the same session: give the Enter above an undo.
- `backspaceItem` deletes an empty task and points `pendingFocus` at the task
  *above*, so the caret merges back into the end of that line. The focus effect
  now always calls `setSelectionRange(len, len)` — needed for the merge, and a
  no-op on the blank task Enter creates, so one rule covers both.
- **Two deliberate no-ops.** Backspace only takes the row when the field is
  *empty*, or the keystroke that clears the last letter would also lose the row.
  And it does nothing on the **top** row: there is nothing to merge into, and
  refusing there is what stops a held Backspace from eating the whole list one
  row at a time. The ✕ is still how you remove a top or non-empty task.
  `backspaceItem` returns whether it acted so the handler only calls
  `preventDefault` when it did — native character deletion is untouched.
- Verified in the dev preview on a `one / two / three` list, both views: Enter
  then Backspace on the new blank row restored the list and put the caret at
  offset 5 of "three"; Backspace with text present removed no row; two
  Backspaces from an empty middle row deleted it, merged up, then **stopped** on
  the empty top row. Card view matched. No console errors, test list deleted.
  (Note for anyone re-running this: the preview's `key` action dispatches key
  events without native text editing, so plain character-deletion isn't
  exercised by it — that path is guarded by the `it.text === ""` check, which
  was confirmed by the row surviving.)
- **SPECS reviewed against the code:** the same §4 "To-do lists" row now carries
  the Backspace rule and both no-ops. Re-checked "Remove vs. delete" (§4, App):
  the ✕-detaches / word-destroys rule is about *assets*, not tasks inside one, so
  a keyboard shortcut that removes a task doesn't contradict it — and the ✕ on
  the task row is unchanged either way.

### 2026-07-28 (Session 53 ship) — Shipped to prod

- `7c120f2` on `main` (pushed to origin), portfolio deploy commit `e0f30bb`,
  build 82.
- `npm run deploy` verified it: prod served the previous build (`113100e`) for
  five polls, then reported `7c120f2` — **✓ live at
  https://www.labrarf.com/estoria**. Confirmed independently:
  `/estoria/version.json` returns `{"build":"82","commit":"7c120f2"}`.

### 2026-07-28 (Session 54) — You choose which version is main

- **The complaint that started it:** the amber "Editing *X* · changes stay in
  this version" banner was showing on the user's real writing. `ChapterDetail`
  keyed it off `draftId !== MAIN_DRAFT_ID`, and `MAIN_DRAFT_ID` is the literal
  `"main"` — the id the *first* version is seeded with. Renaming never changes an
  id, so a book whose actual text lived in a fork was permanently flagged as the
  experiment, while the empty seed version stayed undeletable.
- **`mainDraftId` is now a movable pointer**, on `StoryDoc` and every `BookData`.
  A star per row in the version menu calls `setMainDraft`; the three things that
  used to read the constant (undeletable, fall-back board on delete, banner
  suppression) read the pointer instead. The starred version also **sorts first**
  in the menu — display-only, so `doc.drafts` keeps creation order and promoting
  one doesn't shuffle the rest.
- **Promotion relabels, it never moves data.** The alternative considered was
  swapping board contents under a fixed `"main"` id: no schema change, but pinned
  refs record a `draftId` (`refs.ts`), so every note pinned into either version
  would have silently pointed at the wrong text. Rejected for that reason.
- **Deliberately unchanged:** export, cross-app Sync, and the toolbar word count
  still follow the version you're *viewing*. `+ Add version` also still forks the
  board you're reading — this was briefly changed to fork from the starred
  version and the user reverted it: branching off an experiment you're in the
  middle of is the common case.
- **Schema 6 → 7, and the bump was load-bearing, not bookkeeping.** First run
  showed *both* versions un-starred and both deletable. Cause: zustand's `persist`
  rehydrates the saved doc **raw** — `normalizeDoc` runs only from `migrate`,
  which only fires when the persisted `version` is below `SCHEMA_VERSION`. Without
  the bump the pointer was `undefined` forever and no row matched. Worth
  remembering: **adding a field to `StoryDoc` requires the bump to reach already-
  saved local state**, whatever it does for files. `resolveMainDraftId` covers the
  file paths (`normalizeDoc`) and `withMainDraft` the doc-swap paths
  (`openDoc` / `replaceDoc`), both defaulting a missing pointer to the seed id, so
  pre-v7 files load exactly as before.
- **Verified in the dev preview** on the user's own project: star moved and the ✕
  swapped rows; radio (what you're viewing) stayed put, proving promotion isn't a
  switch; with main moved to "Alt ending" the banner then appeared on "Main
  draft" — the inverse proof it follows the pointer; starring "Alt ending" lifted
  it to the top of the menu. State restored to as-found afterwards. Typecheck and
  `npm run build` clean, no console errors.
- **Template tag alignment (same session, unrelated).** The tag pill was the next
  item in a flex row after the template name, so it began wherever the name ended
  — a different x-position on all 34 cards — and on a two-line name it was
  centred against both lines *and* squeezed until pills like "17 STAGES" wrapped
  inside themselves. Now `justify-between` + `items-start` + `shrink-0`: pinned
  right, on the name's first line, never wrapping. Checked at 3-, 2- and 1-column
  widths, plus a measured pass over every pill's height at mobile width to
  confirm none wraps (zero).
- **SPECS reviewed against the code:** §2 gains a **Main version** glossary entry
  (stating what does *not* follow the star, since that's the easy wrong
  assumption); §4's Drafts row records the movable marker and why promotion
  doesn't copy boards; §4's Templates row records the pinned tag; the Android
  cross-app note now reads v7 and carries a **new open cross-app event** beside
  the still-open v6 one. Re-checked the two older draft passages (§9 items 5 and
  14) — both still true, versions are still standalone forks.

### 2026-07-28 (Session 54b) — Em dash sweep through the UI copy

- Caught right after the 54 ship: the version-menu legend shipped with an em
  dash, which house style forbids in anything the user reads. Trimmed the line
  to just `★ marks the main version` (the star's meaning is already in both
  tooltips, so the sentence was carrying nothing the hover didn't).
- Swept the rest while there: **21 strings across 12 files**, all pre-existing.
  Footer, Backups, Sync conflict, Sync file list, Timeline, the Notes / World /
  Characters panels, `RefList`, one template blurb, and the folder-moved error in
  `lib/sync.ts`. Replacements were chosen per sentence rather than mechanically:
  a period where the clause stood alone ("Sync failed. Nothing was changed."), a
  comma where it qualified ("Nothing saved yet, type anything to add it"),
  parentheses for the conflict field list, and the app's own `·` for the
  conflict-magnitude line, which is a separator rather than prose.
- **`lib/markdown.ts` was left alone on purpose.** Its em dashes are *field
  separators in the export format*, not copy: `- **Name** — role | archetype`.
  The importer parses them (`markdown.ts:272`, `:331`), the AI import prompt
  documents the shape literally, and the Android app reads the same files.
  Rewriting the emitter would leave every vault already on disk in a different
  shape from new exports. Recorded in §3 Conventions so the next sweep doesn't
  undo it.
- Verified the version legend in the dev preview; the rest are string swaps
  covered by typecheck and `npm run build`, both clean.
- **SPECS reviewed against the code:** §3 Conventions gains the no-em-dash rule
  *and* the markdown-format exception, which is the part worth having in writing
  — the exception looks exactly like an oversight to anyone tidying later.

### 2026-07-29 (Session 55) — Archive for characters and world entries, and one archive rule for everything

- **Asked for:** "similar to notes, I'd like to be able to archive characters and
  world detail." The design question underneath it was what archiving should do
  to the chapters a record is already attached to. Notes answered that by
  unpinning everywhere first, which is unrecoverable — a restore brings the note
  back bare. Doing the same to a character would wipe the cast list of every
  chapter they appear in.
- **Decision (user, after being shown the trade):** archiving keeps everything,
  for all three record types, and **notes change to match**. One rule now: an
  archived record leaves its roster/library and every picker, so nothing new can
  be attached to it, while every casting, reference and pin it already has stays
  exactly where it was, rendered dimmed. Restore is a pure flag flip, so it is
  always lossless. This is a deliberate reversal of the v6 asset behaviour, not
  a new special case beside it.
- **Schema v8.** `archived?: boolean` added to `Character` and `WorldEntry`;
  `archiveAsset` lost its `removeAssetLinks` sweep. Both directions go through
  one `setArchived` helper that *deletes* the key on restore rather than writing
  `archived: false`, so an archive-then-restore round trip leaves the document
  byte-identical and doesn't churn the sync fingerprint.
- **Known, accepted data consequence:** assets archived under the old rule are
  already unpinned in the saved document, so they still restore bare. No
  migration can recover those pins — they were dropped at archive time. Recorded
  in §4 so a note that restores empty isn't chased as a v8 bug.
- **UI.** `ui/ArchiveShelf.tsx` is the shared "Archived · N" shelf all three
  panels now use (Notes' hand-rolled one was replaced by it), plus `ARCHIVED_DIM`
  and `archivedTitle` so every surface dims the same way. Dimming is applied
  where it costs nothing and a *word* is used where it would cost legibility:
  board and timeline chips, chapter-detail cast and world chips, and `RefList`'s
  list-view header all dim; `RefList` card view instead says "Archived" in its
  caption, because a card is an inline editor and dimming one fights the typing
  it exists for.
- **Copy.** Three strings in `NotesPanel` asserted that archived items are
  unpinned; all three were false as of this session and were rewritten. The
  archive confirms now count castings/pins **across every version and book**
  (`countCharacterCastings` / `countWorldReferences`, new in `lib/entities.ts`)
  and say "across your versions and books" out loud — the panel card above them
  counts the loaded board only, and in the sample those numbers are 4 and 8, so
  an unexplained jump reads like a bug.
- **Export.** Archived characters and world entries are still exported (the user
  chose this over dropping them), marked with a trailing `_(archived)_`.
  `takeArchived` strips it *before* the existing parsers run, which is what keeps
  it out of `type` and out of `notes` — verified by running the real
  `parseImportMarkdown` over an export and re-emitting it: markers survive, no
  leakage, re-export byte-identical.
- **Verified in the dev preview**, not just by typecheck: archived Pip stays on
  chapters 1/4/6/8 at 50% opacity titled "Pip (archived)" while live characters
  stay at 1, the chapter picker drops her, Restore puts her back at full opacity
  with the shelf gone, an archived note keeps its pin on "The Lower City" and
  shows "Archived" under it, and the persisted doc reads `schemaVersion: 8`.
  Console clean; `npm run build` clean.
- **SPECS:** the glossary's `Archived` is now its own entry covering all three
  record types, the Notes archive row became an app-wide row with the old
  behaviour kept beside it as history, and there is a **new open cross-app event
  for v8** — written to stress that the v6 brief's "an archived asset is unpinned
  by construction" is the thing that stopped being true, since that is the sort
  of inference the phone may have coded against rather than checked.

**Shipped** `da39046` to www.labrarf.com/estoria, verified live by the deploy
script's version poll.

**Spec review caught one real inconsistency, fixed in a follow-up.** Reviewing
§4's "Remove vs. delete" row against the code, the Archive/Delete pair had
shipped in the *opposite* order in the Characters and World panels (Delete
first) from the one the shared library's destroy row has always used (Archive
first). Nothing functional, but it puts the destructive word where the muscle
memory expects the reversible one. Both panels now lead with Archive, and the
row was rewritten as "Remove vs. archive vs. delete" — the taxonomy had two
members and now has three, and a labelled button that *doesn't* destroy is
exactly the kind of thing that erodes a one-meaning-per-control rule if it isn't
written down. Two other passages were tightened rather than corrected: the v6
cross-app block's "an archived asset is unpinned by construction" parenthetical
now carries an inline warning that it is false as of v8 (it reads as present-
tense fact to anyone who lands there first), and the "Appears in" row now spells
out that three different counting scopes legitimately coexist on one card.

### 2026-08-01 (Session 56) — A scene card never cuts its text off

**The report:** in timeline mode, not all the text in a scene card is visible,
and since clicking a scene opens the chapter modal there was no way to read the
rest without leaving the reading view.

**Measured before touching anything**, on the user's real book (*Dreams and
Afterthought*, 421 scenes, one chapter of 110): **50 scenes clipped, 12%**, the
worst losing three lines. The mechanism was a plain `overflow-hidden` span in a
fixed-height node — no ellipsis, no fade, no tooltip, so a cut read as a
finished sentence. The chapter card in the rail two inches away uses
`line-clamp-2` and *does* show "…", which is what made the scene node the only
silently-clipped text in the app.

**The counter-intuitive part, and the reason the first fix ideas were wrong:**
this is a **wide-screen** bug. More columns means *narrower* cards, so clipping
rises with window width — 46 clipped at 1600px, 50 at 1280px, but only **4** at
half screen, where a single column grows to 336px and almost nothing clips.
Anything reasoned from "narrow screens are the hard case" points the wrong way.

**Three designs were mocked before one was built.** A reading-layout toggle
(one scene per row, no height cap) was built as a mockup and scrapped: the
timeline exists for a continuous read, and a mode you have to switch into does
not fix the view you are already in. A pure character cap was scrapped as a
solo fix for two structural reasons — the card width is elastic, so one limit
cannot be right (a 124px card holds 134 characters at 228px wide but 206 at
336px, forcing the limit down to the narrowest case and wasting a third of the
card at half screen), and it cannot apply retroactively without either
truncating the user's book or grandfathering scenes that then keep clipping.

**What shipped: cards grow sideways, never taller.** Fixed height, and a scene
that will not fit one column takes two. Rows stay level, no vertical space is
wasted, and the layout keeps reading order. Result on the reference book:
**0 clipped** on a wide screen, 43 cards (10%) taking the double width, rows
92% occupied.

- `lib/sceneFit.ts` (new) — `SCENE_TEXT_MAX` and capacity measured off a hidden
  DOM probe mirroring the real card, memoized per pane size. A characters-per-
  line guess was rejected: capacity depends on font, padding and the label line.
  The cheap check is deliberately pessimistic (mid-length-word filler), and only
  the few scenes that fail it get an exact `fitsAt` measurement — which is what
  brought over-eager widening down from 55 cards to 43.
- `lib/layout.ts` — `sceneGrid` split into `sceneMetrics` (track geometry) and
  `sceneGrid` (placement, given spans), because the caller needs the column
  width before it can decide how many columns a scene needs. Positions became
  `SceneBox[]` carrying per-node width; connectors now read those boxes.
- **The cap is 200 characters**, set by the half-screen ceiling (~205). The
  user's longest scene is 199, so **nothing in the book is over it** and nothing
  was grandfathered.

**The cap refuses input out loud.** Not `maxLength` — the browser drops the
keystroke silently, and an invisible refusal is precisely what this must not do.
`writeScene` refuses it and the card says so: border to `--but`, one 3px nudge.
The nudge runs through `element.animate`, not a CSS class: replaying a class
means removing and re-adding it with a frame callback in between, and frame
callbacks are **paused whenever the tab is not visible**, so a held key would
land its refusals with no animation at all. Caught by instrumenting rather than
assuming — a control `ResizeObserver` firing 0 times during a real size change
had already shown this environment lies about frame-timing.

**Migration: there is none, deliberately.** No schema change, no data touched,
nothing truncated, so this is **not a cross-app event**. Each scene's ceiling is
`max(200, its current length)`, so a pre-cap scene can be shortened or left
alone but never grown. This also fixed a bug the `maxLength` version had:
`maxLength={200}` blocks *all* insertion once the value already exceeds it,
which froze a 303-character scene completely.

**Verified in the running app** against the user's own file, not by typecheck
alone: 421 scenes, 0 clipped at 1400px; a forced 303-character legacy scene
widened, displayed whole and showed `303 / 200`; at exactly 200 the counter
reads `200 / 200` in red; typing past it turned the border red, ran one
animation and the character did not land; shortening from the cap, regrowing to
exactly 200, and ordinary editing of a short scene all behaved. Build clean.

**One honest gap:** at half screen a single column cannot widen, so 4 scenes
overflow by **2px** — a clipped descender on the last line, not lost words.
Fixable by adding 4px to the timeline card height, which is a "taller" change
and so was left as the user's call rather than taken unilaterally.

**Corrected mid-session, twice.** A mockup claimed "13 of 421 need double
width"; the real figure is 43, because the mockup's probe gave the label line a
shorter line-height than the real card has. And an apparent "the pane never
re-fits on resize" bug was withdrawn once a control `ResizeObserver` was shown
to fire 0 times for a genuine size change — the embedded browser's viewport
override does not trigger `ResizeObserver`, so live-resize is simply untestable
there; the fit logic is fine.

### 2026-08-01 (Session 56b) — The green ring on a jumped-to scene never faded

Found while verifying Session 56's red cap outline, which it was masking, and
fixed on its own rather than folded into that work.

`flashIdx` in `ChapterDetail` was stuck. The landing effect calls
`clearFocusScene()`, which sets `focusScene` to null and so changes the effect's
own deps; the re-run's cleanup cancelled the pending 1600ms fade, and the
early-return guard meant no replacement timer was ever scheduled. A scene opened
from the timeline therefore kept its green "freshly jumped to" ring for as long
as the chapter modal stayed open.

The timer now lives in a ref with an unmount-only cleanup, so consuming
`focusScene` cannot cancel it. **Verified by measuring the border over time**
rather than reading the diff: green at 400ms, back to `--rule` by 1400ms, and
still normal at 2600ms and 4600ms.

### 2026-08-01 (Session 56c) — The v6/v7/v8 cross-app warnings were stale, and are cleared

Asked whether the Android app needed a parity update for Session 56. It does
not — no schema change, `SCHEMA_VERSION` still 8, and the diff touched no model,
persistence, export or sync file. But checking that turned up a real
inaccuracy: §6 still carried **three open cross-app events** (v6, v7, v8)
warning that the phone could not read files this app writes. All three had been
closed for days.

**Verified in the Android source, not from its session log**, because a log
entry says work happened while the source says what it actually does:
`SCHEMA_VERSION = 8` in `StoryDoc.kt`; v6's `RefKind.Todo`, `items` and
`scenePosCompact` present with `Normalize` defending them; v7's `mainDraftId` on
both the doc and each book; v8's `archived` on `Character`, `WorldEntry` **and**
`Asset`. v8 was the one worth checking properly — its risk was semantic, not
structural, and the phone documents the reversal on the field itself ("a v8 doc
can hold an archived asset with live pins"), so it took on the rule change
rather than just the field.

Replaced with a single closed note. **What each version added is deliberately
kept** (it is still in the bullet above and in this log); what was retired is
only the "the phone cannot read our files yet" warning, which had become the
opposite of true and would have cost someone a wasted investigation. The next
change to `StoryDoc` starts a fresh event.

**Android docs updated too** (`Estoria-aa/docs/`): a §4(a) compatibility bullet
and a session entry, both saying the same thing from that side — the 200
character scene cap is a **web input rule, not a document rule**. It serves the
web timeline, a view that app does not have; the web never truncates stored
text; a `.estoria.json` may legitimately carry longer scenes in either
direction; and validating or trimming against that number on import would
destroy the user's prose to satisfy someone else's layout. That is the one way
this session could have caused a real cross-app bug, so it is written down on
both sides rather than only here.

---

## 2026-08-02 — Manuscript mode, all six phases, on `feature/manuscript-mode`

Built the whole feature from `docs/manuscript-mode-build.md`, then folded that
brief into [`SPECS.md`](SPECS.md) §4 and deleted it, which is what the brief
told its last reader to do. The brainstorm survives in `archives/` because the
rejected alternatives are the part worth keeping. **Nothing is pushed or
deployed, and the branch is not merged.**

### What shipped

- **Phase 0 — the writing pane.** `Chapter.manuscript`, an optional string, no
  `SCHEMA_VERSION` bump. **The premise was tested and held**: asked directly, the
  verdict was *"seeing beats while drafting manuscript is something I'd like"*.
  Everything expensive below sits downstream of that answer.
- **Phase 1 — three states, then not.** Minimized / Regular / Full screen, plus a
  drift bar. Both were later removed; see "the reversal".
- **Phase 4, taken early — the timeline reads prose.** A `Scenes / Manuscript`
  pane toggle, not a fourth view. Taken before phase 2 deliberately: it is the
  cheapest large win, and storage only bites once prose exists.
- **Phase 2 — storage.** Manuscripts moved to **IndexedDB**, keyed by
  `(projectId, bookId, draftId, chapterId)`, split at the at-rest layer only so
  `StoryDoc` stays whole in memory and in every file. `createJSONStorage` is gone
  so the **serialize** is deferred, not just the write: measured, 40 keystrokes
  now stringify ~26KB instead of 40 × 188KB on the main thread. The async-write
  hazard is covered by a synchronous localStorage crash pad, proven by forcing
  IndexedDB to fail and recovering the words through a reload.
- **Phase 5 — word count and exports.** `words` became a cache of the manuscript
  with two rules that protect what was typed (never auto-zero; promote the old
  estimate into the new `target` rather than overwrite it). A prose export sits
  apart from the map export: standard-manuscript-format `.docx` (built on a
  110-line ZIP writer rather than a dependency), `.md`, `.txt`, and `Cmd+P` as
  the PDF route.
- **Phase 3 — fork ergonomics.** Forking asks whether to take the writing, but
  only when there is any; the version menu shows word counts; a chapter can pull
  its text from another version behind a confirm, with one undo. Not a merge
  engine, on purpose.

### The reversal, and it is the important part

The `***` scene-break contract — prose divided into sections, a caret-following
carousel, per-scene written state, borrowed opening lines, a drift bar — was
**built, shipped, and then removed**. The reason is worth keeping: the app
*seeded* those breaks, so opening a fresh nine-scene chapter greeted you with
eight rows of `***` and nothing between them. The whole argument for that marker
over a hidden one was that it is what a novelist types anyway; pre-filling it is
the app typing it for you.

The beats are now a guide beside the prose. **The premise survived intact** —
seeing your beats while you draft never required the beats to own the
paragraphs — and about three hundred lines of sections, drift and reconciliation
went with it. `View` became a real markdown renderer instead.

### Fixed in passing

- Two raw **NUL bytes in `persistence.ts`**, one a live separator, which made
  `grep` and `ripgrep` treat the whole file as binary and return nothing. That
  cost real time before it was spotted.
- A **latent timeline scroll bug**: the last chapter could never reach the
  leading edge, so clicking chapter 15 ringed 14. The prose-mode "fix" made
  earlier in the session was a heuristic; it is now measured and correct in both
  modes and orientations.
- `SPECS.md` §8's claim that persist serializes on every keystroke — stale since
  Session 20 and doubly wrong after phase 2.
- **Markdown that did not work**: `__bold__` rendered as an italic wearing two
  stray underscores (alternation order), `~~strikethrough~~` was unhandled, task
  lists showed their brackets, and `####` was drawn identically to `###`.

### Owed

- **Word has never opened the `.docx`.** Its structure and CRCs are verified;
  the application is not available here.
- An **Android regression test** for unknown-field passthrough (different repo;
  the requirement is written into §6).
- A **drag-select check** in the timeline's manuscript pane that never came back
  clean, because a stale modal was open during the test.

### Next session

**§9 item 16: move the manuscript into its own modal.** Four separate complaints
this session — beat cards too tall, controls scrolling out of reach, an empty
sheet making the modal scroll with no visible scrollbar, navigation feeling
messy — turned out to be one cause: a writing surface and a planning surface
competing for a single scrolling column. Each was patched; the cause was not.
Read that item before touching the chapter modal.

---

## 2026-08-02 (b) — The manuscript becomes its own modal, on `feature/manuscript-mode`

Picked up from `docs/manuscript-modal-build.md` §4, with §5 settled first. §6 and
§8 were deliberately left alone: the brief warns that a session handed all three
jobs does the interesting one and leaves the rest half-done.

### §5, settled before any code

1. **Scene rail, down the left.** Not the horizontal beat strip moved across. The
   strip needed stickiness and needed cards that grew *sideways*; a column beside
   the prose needs neither, and it has the vertical room to show a beat at the
   200-character cap whole. Left rather than right, matching the timeline's
   vertical rail, so the beats do not change sides depending on where you are.
2. **The rail is inert, with one exception.** Clicking a beat opens that scene on
   the story map. Editing in place would rebuild the two-surfaces-one-chapter
   competition this work exists to remove; a link out costs nothing, because
   `openChapterAtScene` already lands on a scene, focuses it and flashes it. It
   now also forces `chapterMode` back to `"map"`, which is what lets the rail
   card be a plain button that only has to name a scene.
3. **The size control is the modal's width**, on its own flag.
4. **`Cmd+S`, blur-flush and the leaving-a-chapter flush moved with the sheet**
   into `ManuscriptModal`, registered once. **The word-count recompute did not** —
   it went *up*, into a new `ChapterModal` dispatcher. It is debounced 700ms off
   the prose, and left in the manuscript modal a mode switch would unmount the
   component and clear the pending timer, so the count would stop updating on
   exactly the click that goes to look at it. The prose flush needed no such help:
   it is registered as an effect *cleanup*, so unmounting is what fires it.
5. **`sceneFlowExpanded` keeps its name.** It is not only a width — `scenePosKey`
   uses it to pick between `scenePos` and `scenePosCompact`, which are persisted
   *document* data, so a rename would either drag a doc migration behind it or
   leave the flag and the layout key disagreeing. Adding `manuscriptExpanded`
   beside it fixes the actual problem: the old name was wrong only because one
   flag drove two areas, and now it drives one.

### What changed

- **New `ChapterModal`** (dispatcher), **`ManuscriptModal`** (renamed from
  `ManuscriptSheet` via `git mv`, so `PullFromVersion`'s history follows), and
  **`ChapterMetaRow`** — the meta line, shared by both modals so they cannot
  drift.
- **New store state**: `chapterMode` (`"map" | "manuscript"`, persisted, global
  not per chapter) and `manuscriptExpanded`. `"manuscript"` left the
  `ChapterSection` union. **No `SCHEMA_VERSION` bump** — this is UI state, not
  the document, and a stale `chapterSectionsCollapsed.manuscript` key in an
  already-persisted store is inert.
- **`ChapterDetail` lost 190 lines net** (51 added, 241 removed). The Manuscript
  section, `manHeaderH`
  and its `ResizeObserver`, `sheetView`, the sticky wrapper, the `PullFromVersion`
  row — and **seven `manuscriptOpen` conditionals**, which had been hiding the
  summary, the act stepper, Characters and World whenever the section was open.
  The story map modal is unconditionally itself again.
- **Both ways in repointed** off `openChapterSection("manuscript")`: the
  timeline's prose click and `ProsePane`'s empty state.

### Verified in the browser, on the isolated port 5199

- Story map modal: summary, act stepper, Characters and World all back with no
  conditionals; no Manuscript section.
- The switch swaps the open chapter both ways without closing it, and lands at
  the same x in each modal (this is why it sits after the status picker rather
  than at the end of the row — see §9 item 16).
- Rail: beats wrap and show whole, connector pills between them. Clicking beat 3
  landed on the story map with `data-scene-idx="2"` focused and its textarea
  holding "Bram drags her out before the tide takes…".
- Typing promoted the hand-typed 2800 into `target` and flipped the chip to a
  counted 40 — the existing promote-don't-overwrite rule working through the new
  shared row. Live footer count reads "40 words of 2,800".
- Markdown round-trip in the new pane: heading, bold, italic and `***` as a rule;
  the count strips all of it (25 words).
- **Persistence**: `chapterMode: "manuscript"` survived a full page reload, and a
  chapter opened from the board afterwards came up in the manuscript with the
  caret already in the text.
- **The two size flags are independent**: `manuscriptExpanded: false` while
  `sceneFlowExpanded: true`, story map still 1220px wide with its own control
  reading "Shrink the scene area".
- `npm run typecheck` and `npm run build` clean; no console errors.

### Owed, unchanged from the last session

- **Word has never opened the `.docx`.** Structure and CRCs verified; the
  application is not available here.
- An **Android regression test** for unknown-field passthrough (different repo).
- A **drag-select check** in the timeline's manuscript pane.
- §9 item 15, the 2px timeline card clip at half screen, still the author's call.

### Next session

`docs/manuscript-modal-build.md` is now **§6 and §8 only** — §4 and §5 were cut
out of it when this landed. **§8 is the one that matters**: the scale test, and
the brief names a real bug to confirm first, which is that `writePad` puts every
dirty manuscript into localStorage synchronously and a single 300k-word chapter
is ~3.6MB of a ~5MB origin quota. The failure is silent, because the
`QuotaExceededError` is caught and ignored, so the symptom is the safety net
quietly not being there.

---

## 2026-08-02 (c) — Tabs, bulk scene and chapter moves, toolbar scoping

Four requests, on `feature/manuscript-mode`, after the modal restructure landed.

### The mode switch became a tab (mid-session change of direction)

It shipped earlier the same session as a button on the meta line naming its
destination (*Manuscript* / *Story map*). Changed to a two-segment tab
`[Scene flow | Manuscript]` on the **section header of the working area** — the
Scene flow row in the story map, the head of the beat rail in the manuscript.
The control that swaps the working area now sits on the working area, and the
meta line went back to being only about the chapter. One shared
`ChapterModeTabs` in both, so the pair cannot drift.

### What was built

1. **Reference material is tabbed** (story map only). Four stacked collapsible
   sections became one strip above the canvas and one panel under it. Clicking
   the open tab closes it, so click-to-show-and-hide survives. `SectionHeader`
   and `chapterSectionsCollapsed` were deleted; `scenesCollapsed` and
   `chapterTab` replaced them.
2. **Move several scenes within a chapter**, both ways asked for: *This chapter ·
   reorder* in the destination picker, and dragging any selected card to move the
   whole block.
3. **Multi-select chapters** on the board by modifier-click, with a floating bar:
   reorder the block by dropping it on another chapter, or delete them together.
4. **New chapter / Auto-arrange hidden in Timeline view.**

### Three bugs found while verifying, all fixed

- **`reorderChapters` returned the un-renumbered array.** It computed
  `renumber()` for the links and then returned the pre-renumber `chapters`, so
  the order changed while every `num` badge stayed stale. Caught because the
  board still read 01–06 in the old order after a confirmed reorder.
- **The board's drop target could be stale or unset.** The hit test runs inside a
  coalescing rAF that `onUp` cancels, so a drag ending in the same frame as its
  last move never ran one. Release now re-tests against the final position.
  Pre-existing; found because multi-chapter reorder rides the same path.
- **`blockDragged` was never cleared when a scene drag ended off-card.** No click
  is synthesized in that case, so the flag stood and ate the next real selection
  click. Cleared on the next task instead.

Also hardened: `dragRef.current` is written directly when a block drag is
promoted, not left to the next render, so a fast drag does not lose its first
moves.

### Verified in the browser, on port 5199

Tabs open, close on re-click, and are absent from the manuscript modal. Scene
reorder via the picker (3 → front gives Bram·Wren·trapdoor, links collapse to
`therefore` per the positional rule) and via block drag (selecting two of three
and dropping past the third gives the expected order, block order preserved).
Chapter multi-select shows the bar, bulk delete took 8 chapters to 6 with
contiguous renumbering, bulk reorder moved the block and renumbered correctly.
Toolbar buttons gone in Timeline. `npm run typecheck` and `npm run build` clean.

**Then confirmed at the keyboard by the author**, same session: the multi-chapter
drag (which had only been exercised with synthetic events) reorders and renumbers
correctly with a real pointer, and the long-owed **drag-select check** finally
came back clean — dragging across prose in the timeline's manuscript pane selects
the words and leaves the chapter closed, a click opens it, and a click that
wobbles a pixel still opens it. Both are struck off §6 of the build brief.

**Word opening the `.docx` is deferred**, not owed: there is no Word on this
machine, structure and CRCs are verified, and the author's call is to assume it
works until a real file misbehaves somewhere else.

### SPECS §9 item 15 closed the same session

The 2px timeline card clip had been left as the author's call because the fix is
a *taller* card and the feature was built on "wider, never taller". The call came
back: make it taller. `TL_NODE_H` (`SCENE_H + 4`) is now the vertical timeline's
own height constant — deliberately **not** a bump to the shared `SCENE_H`, since
the chapter modal's canvas has no clipping problem and no reason to grow.

The rule survives bounded rather than broken: cards are still a fixed height that
grows sideways, just a slightly larger fixed height. The case that forced it is
the one where widening cannot help at all — at half screen the pane fits a single
column, so there is nowhere to widen to.

Nothing else needed changing: the fit probe measures against whatever height it
is handed, so raising the height raised capacity on its own. Verified at a 760px
window with a 197-character scene — renders whole, 0 overflow across all 24 cards
on screen.

### A note on testing this branch

Two red herrings cost time and are worth knowing about. Vite HMR keeps the *old*
window listeners bound when an effect's dependency array changes size, so drag
behaviour silently runs the pre-edit code until a full reload. And dispatching
`mousemove` + `mouseup` in one JS task means the coalescing rAF never runs
between them, which looks exactly like a broken hit test. Reload, and spread
synthetic pointer events across calls.

---

## 2026-08-02 (d) — The scale test (build brief §8)

The brief's target, run for the first time: **300k words per version, 5 versions,
5 books** — 25 manuscripts, 7.5M words, 41.8M characters of prose in a 42MB
`.estoria.json`. Nothing in manuscript mode had been run against more than a few
thousand words before this.

**The headline: the storage architecture holds up completely, and the render path
does not.** Every prediction in §8 about serialization, hashing and the at-rest
split was wrong in the app's favour. The one thing §8 did not predict is the
thing that makes the app feel broken at scale.

### The fixture

`scripts/make-fixture.mjs` — a generator, not hand-typed data, seeded so the same
arguments give a byte-identical file. It is imported through the normal path
(`readProjectFile` → `normalizeDoc` → `openDoc`), so the split, the counts and
the fingerprint all see what a user would produce.

```bash
node --max-old-space-size=8192 scripts/make-fixture.mjs --out public/big.estoria.json
```

Fixtures go in `public/` (gitignored) because Vite refuses `/@fs` reads outside
the project root — and must be **deleted afterwards**, since `public/` is copied
into `dist/` on build.

### What passed, with numbers

Everything the brief expected to break, on a 42MB / 7.5M-word document:

| | Predicted | Measured |
|---|---|---|
| `JSON.parse` of the whole file | main-thread stall | **28ms** |
| `normalizeDoc` | — | **1ms** |
| `splitProse` / `mergeProse` over 750 chapters | "measure it rather than assume" | **1ms each** |
| Sync fingerprint (SHA-256 over canonical JSON) | "can it be cheaper?" | **77ms** |
| `JSON.stringify` for export/backup | 45M chars on the main thread | **11ms** |
| `loadAllProse()` at startup | "45MB of strings before first paint" | **165ms**, 750 entries |
| Time to DOMContentLoaded, cold | — | **108ms** |
| Peak heap, all 25 manuscripts loaded | ~90MB | **64–68MB** |

Two of the brief's assumptions were simply wrong. **41.8M characters is ~42MB in
memory, not 84MB** — V8 stores ASCII as one-byte strings, so the UTF-16 doubling
never happens. And `splitProse` is O(nothing) because it moves string
*references*; it never copies the prose.

**The at-rest split works exactly as designed.** With the full fixture loaded,
localStorage holds **1.36MB** and the persisted chapters have no `manuscript` key
at all; the 42MB of prose is in IndexedDB. Total origin usage 18MB.

### The crash pad: real bug, wrong threshold

`writePad` does silently swallow `QuotaExceededError` — that part of §8 is right,
and the symptom is the safety net not being there with nothing said. But the
threshold is nowhere near where the brief put it. Measured ceiling on Chrome:

| Pad payload | Result |
|---|---|
| 300k words in one chapter (3.15MB) | survives |
| 12MB | survives |
| 40MB / 20.9M chars | survives |
| **80MB / 41.9M chars** | **survives** |
| 160MB | fails, silently, nothing stored |

So the pad tolerates ~40M characters, roughly **16× the ~2.5M the brief assumed**,
and the realistic worst case here (one 10k-word chapter, 56k chars, 0.11MB) is
three orders of magnitude clear of it. The fix is still worth doing, because a
silent failure is the wrong failure, but it is **not urgent and not a data-loss
risk at any plausible size**. Note this was measured on Chrome only; Safari and
Firefox cap localStorage far lower, and the pad runs there too.

### The finding that matters: per-keystroke cost scales with document size

Typing anywhere in the app, measured as the synchronous React commit inside the
`input` dispatch (React 18 flushes discrete events synchronously):

| Document | Field being edited | Median commit |
|---|---|---|
| 3 chapters, 3.2k words | prose, 6,010 chars | **6.8ms** |
| 750 chapters, 7.5M words | prose, 56,297 chars | **58.2ms** (p90 78ms) |
| 750 chapters, 7.5M words | **scene beat, 123 chars** | **52.2ms** (p90 73ms) |

The control is the third row. **A 123-character field costs the same as a
56,000-character one** — so the cost is not the prose, not the textarea, and not
manuscript mode. It is the whole document re-rendering on every keystroke, and it
tracks the number of chapters on the board (3 → 30 cards, 6.8ms → 52ms).

This is **SPECS §9 item 14**, filed as "Perf (cosmetic) — fine at current scale,
use narrower selectors if it ever feels sluggish". At the target scale it is
58ms per character: about four dropped frames on every keypress, on every
editable field in the app. It should be reclassified as the blocking scale
problem, and the fix is the one already written there — narrower selectors, so
that editing a chapter does not re-render the board behind the modal.

### Timeline manuscript pane: §8 item 5 confirmed

It renders **every** chapter's prose into the DOM at once: 30 chapters, 4,399
prose blocks, **14,602 DOM nodes**, 1.67M characters of text. Switching into the
pane blocks the main thread for **478ms**; switching out, 189ms. That is one
book's active version. It needs windowing, as predicted.

### Smaller things

- `countWords` runs **unmemoized on every render** in `ManuscriptModal` (3.3ms on
  a 10k-word chapter) — introduced this session, trivially fixable with `useMemo`,
  and small next to the 52ms above.
- `ExportModal` counts every chapter on open: **78ms** for 30 chapters.
- **Not measured: a save-settle with Sync configured.** Sync needs a real folder
  pick, which needs a user gesture. Without Sync the settle blocks **76ms**; the
  fingerprint measured standalone is 77ms, so a synced settle is likely ~150ms.
  Worth confirming by hand.

### A methodology trap worth not repeating

`await import('/src/store/useStore.ts')` from the console gives a **second store
instance**, not the app's — Vite hands HMR-updated modules a `?t=` query, so the
app and the console hold different module records. Store writes from the console
then go nowhere visible, which reads exactly like a broken feature: `openChapter`
set `openCh` and no modal appeared.

Worse, the obvious check gives a **false pass** — toggling the theme and seeing
the DOM agree proves nothing if the two instances happen to hold the same value.
Drive the UI with real clicks and read state from the DOM. Pure functions
(`countWords`, `splitProse`, `fingerprint`) are unaffected and safe to measure by
import.

Also: `requestAnimationFrame` never fires while the preview pane is hidden, so
any rAF-based measurement hangs. Measure synchronously around `dispatchEvent`.

### Where this leaves the branch

The architecture is sound and the storage design is vindicated. Merging is not
blocked by anything found here, but **§9 item 14 should be fixed before this is
called done at scale** — it is the difference between an app that handles a real
book collection and one that only holds it.

---

## 2026-08-02 (e) — The round-trip, and a wrong diagnosis corrected

Two jobs: finish the half of §8 that was left undone, and find out what the
per-keystroke cost actually is. The second one overturned what the previous
entry concluded, which is the more important result of the two.

### Round trip: passes, and now properly checked

The brief asked whether a document at this size "can be written, re-read and
round-tripped at all". Measured on the 42.4MB fixture, through the real code
path — `normalizeDoc` → `splitProse` → `mergeProse` → `stampModified` →
`JSON.stringify` → `JSON.parse` → `normalizeDoc`:

- **Fingerprints identical end to end** (`1b930aaae9a824e3`). Write 26ms,
  re-read 27ms, 42.4MB in and 42.4MB out.
- **The at-rest split is lossless** — the fingerprint after a split/merge cycle
  matches the one before it.

**With a control, because the test is worthless without one.** Changing a single
character of prose deep inside chapter 8 *does* change the fingerprint, and
touching only `modifiedAt` does *not*. So the identical result means the content
really is identical, rather than the fingerprint ignoring prose.

### The previous entry's diagnosis was wrong

2026-08-02 (d) concluded the per-keystroke cost "tracks the number of chapters
on the board (3 → 30 cards)". That was inferred from two fixtures that differed
in more than one way. It is **wrong**, and SPECS §9 item 14 has been corrected.

Controls that killed it — same 30 chapters, same 30 board cards, same 750
manuscripts, varying only what else the document contains:

| Fixture | Document | Per-keystroke median |
|---|---|---|
| a30 | 1 book, 1 version, 30 chapters, **0.3MB** | **8.4ms** |
| b30 | 5×5, 750 manuscripts, **6.5MB** | **7.0ms** |
| m14 | 5×5, 750 manuscripts, **15.8MB** | **23.3ms** |
| m28 | 5×5, 750 manuscripts, **29.1MB** | **26.2ms** |
| big | 5×5, 750 manuscripts, **42.4MB** | **52.2ms** |

**30 board cards are free. 750 stashed manuscripts are free. Bytes are not.**

### What the cost is not

Each ruled out by measurement rather than reading:

- **Not React.** A UI-only state change re-renders the same tree in **0.3ms**.
  With **no chapter modal mounted at all**, a doc edit still costs **42ms**.
- **Not the edited field, and not the open chapter's prose.** Shrinking the open
  chapter from 56,130 characters to 51 left it at 49ms in the same document.
- **Not serialization or storage.** Instrumented per keystroke: 0.17ms of
  `JSON.stringify`, **zero** `localStorage` writes, zero `JSON.parse`. The
  persist `setItem` is a single assignment, and both flushes are debounced
  (200ms prose, 500ms map), so neither runs inside a keystroke. `splitProse` is
  reached only from the debounced flush.

What is left is the document update path allocating a new object graph per
keystroke against a large retained heap — ~3MB per keystroke, heap up 59MB
across 20. **That is a hypothesis, not a finding.** Naming the line needs a
profiler, and that is the next job; the point of writing it down is that the
obvious fix (narrower selectors) is now known *not* to be the answer, so nobody
should start there.

### The limit to plan against

Comfortable below **~7MB** total document. Past one frame (16ms) somewhere
around **10MB — roughly 1.5M words across every book and version**, not per
book. At 42MB it is 52ms median and 73ms p90, which is visible lag on every
keypress in the app.

Note the variance: p90 runs 2–3× the median at every size (31ms at 6.5MB, 73ms
at 42MB), which is consistent with GC and is why the medians alone understate
how it feels.

### Method notes

The toolbar's `EditableName` keeps its value in **local state while editing** and
commits on blur, so typing into it measures nothing — one intermediate reading
this session came from that and was discarded. The measurement that holds is a
doc-backed field: a scene beat, or the prose textarea. And measure like against
like — the series-map tree (5 book cards) and the board tree (30 chapter cards)
are not comparable surfaces.

---

## 2026-08-02 (f) — The profiler, and a one-line fix

The previous entry ruled out React, serialization, storage and the store, and
labelled the remainder a hypothesis about allocation and GC. The hypothesis was
wrong too. A profiler found it in one run.

### Enabling the profiler

Chrome's JS Self-Profiling API needs a `Document-Policy: js-profiling` header,
now set in `vite.config.ts` under `server.headers` — **dev server only**, so it
never reaches production, and it costs nothing when unused. `new Profiler(...)`
then samples at 1ms while a keystroke burst runs.

### What it found

Leaf frames across 25 keystrokes on the 42.4MB fixture:

```
 41.5%  (anon) @ react_jsx-dev-runtime.js:239     <- dev-build overhead
   22%  countWords @ manuscript.ts:62
 12.2%  (anon) @ manuscript.ts:64
 12.2%  commitMutationEffectsOnFiber
```

`countWords` was a third of it, in **story map mode**, where nothing on screen
shows a manuscript word count. The call site was `Toolbar.tsx`:

```ts
const activeProseWords = doc.chapters.reduce(
  (a, c) => a + (c.manuscript ? countWords(c.manuscript) : 0), 0);
```

Used once, as `activeProseWords > 0` — a **yes/no question**, answered by an
exact count over every chapter's prose, on every render of a component that is
always mounted. On a 300k-word book that is a regex sweep of 1.7M characters per
keystroke.

The irony is three lines up: `versionWords` right above it reads the cached
`c.words` and carries a comment explaining the menu "should not scan four
manuscripts to open".

`some` replaces `reduce`, stopping at the first chapter with prose. `countWords`
is kept inside it rather than a `.trim()` test, so "has prose" keeps agreeing
with the number shown everywhere else (a chapter holding only `***` counts zero).

### Results

| | Before | After |
|---|---|---|
| Scene beat, dev | 52.2ms | **7.3ms** |
| Prose field, dev | 58.2ms | **12.9ms** |
| Scene beat, **production** | — | **3.2ms** |
| Prose field (56k chapter), **production**, warm | — | **7.9ms** |

**The document-size dependence is gone.** 7.3ms at 42MB now matches 7.0ms at
6.5MB. The whole curve in the previous entry was one unmemoized reduce. Item 19
(`countWords` unmemoized in `ManuscriptModal`) is fixed in the same pass.

### Two corrections to how the earlier numbers were read

**Everything before this was a dev build.** React's `jsx-dev-runtime` was 41.5%
of the profile; production is faster again, and the 42.4MB fixture was imported
into a real production build through the actual file picker to confirm it.

**A burst measured immediately after switching into manuscript mode reads
~40ms** from one-time warm-up, then settles to ~8ms. One intermediate reading
this session was taken cold and looked like a regression. Re-measure warm.

### What did not improve, and matters more than it did

The timeline's manuscript pane is untouched by this — its cost is genuinely
building 14,602 DOM nodes — and in **production it blocks for 1,242ms**.

The scope is the thing to notice: that is **one book's active version at 301.7k
words**, driven by the active version's prose and not by total project size. It
is not an extreme-scale problem. A writer with a single epic-fantasy-length novel
and no series at all waits over a second to open that pane. **Item 17 is now the
app's worst number and the only real remaining limit.**

### Where the limits actually sit now

- **Typing: no size-dependent limit.** Flat 3–8ms in production at 42.4MB.
- **Memory: 125MB heap** with the 42.4MB document loaded. Fine.
- **Startup: 108ms**, `loadAllProse` 165ms. Fine.
- **Timeline manuscript pane: ~1.2s at 300k words in one version.** The limit.

---

## 2026-08-02 (g) — Windowing the timeline's manuscript pane

The last real limit, and the one the previous entry called the app's worst
number: 1,242ms of frozen UI in production to open the timeline's manuscript
pane, on a single 300k-word book. Fixed by rendering only the chapters near the
one you are reading.

| | Before | After |
|---|---|---|
| Blocked main thread, **production** | 1,242ms | **0** (no long task at all) |
| Blocked, dev | 415ms | **91ms** |
| DOM nodes | 14,602 | **1,748** |
| Chapters rendered | 30 | **3–5** |

### What made it more than a `slice()`

Three things depended on every chapter being in the DOM, and each needed
handling rather than accepting.

**`Cmd+P` prints this view.** It is not a separate exporter — the print
stylesheet *is* the PDF route (SPECS §4), so a windowed page would print a book
with holes in it. `beforeprint` renders every chapter, and **`flushSync` is what
makes that land before the print dialog snapshots the page** — a plain
`setState` would not have flushed in time. `afterprint` restores the window.
Verified in a production build: 3 chapters → 30 in 320ms, then back to 3.

**The rail's two-way sync and `jumpTo` read each group's offset.** So every
chapter's *header* renders whether or not its prose does, and the spacer beneath
it reserves the chapter's height. `scrollHeight` measured 525,539px before and
after scrolling the whole book — the geometry does not move.

**`jumpTo` had a latent ordering bug once the window existed.** It measured the
target's offset and *then* set `activeId` — but the window moves with `activeId`,
so it was computing a scroll target against spacer heights that were one render
away from changing, and would land short of the chapter you clicked. It now
`flushSync`es the state first and measures after.

### Spacer heights

Measured once a chapter has been on screen; before that, `words × px-per-word`
calibrated from whatever *has* been measured at the current pane width, so the
estimate improves as you read. Cold error over 21 never-rendered chapters:
**0.2%** — 735px in 367,000. That surfaces as slight scrollbar drift that
self-corrects, never as a mis-aimed jump, because the jump measures post-render.

### One more instance of the item 14 bug

The pane's per-chapter header was calling `countWords(c.manuscript)` on every
render — a regex sweep of every manuscript in the book, exactly the Toolbar
shape. That was most of the 290ms still showing after the first windowing pass;
with the cached `c.words` instead it dropped to 91ms. **Worth searching for this
pattern rather than waiting to trip over it:** `countWords` in a render path is
almost always wrong, because `words` exists as its cache.

### Verification note

Scroll events do not fire and `requestAnimationFrame` does not run while the
preview pane is hidden, so the window was driven by setting `scrollTop` and
dispatching `scroll` by hand. That exercises the app's real handler, but it
means **the smooth-scroll landing after a rail click was never watched with
eyes** — the geometry is verified, the animation is not. Worth one look.

---

## 2026-08-02 (h) — Merged and shipped

`feature/manuscript-mode` merged into `main` as a **fast-forward, 34 commits**,
pushed, and deployed. `npm run deploy` verified prod is serving the exact commit:
**`a5e606f` live at https://www.labrarf.com/estoria** (four polls; GitHub Pages
served the previous build for ~40s first, which is normal).

The branch carried: manuscript mode as its own modal, reference material tabbed,
bulk scene and chapter moves, the toolbar scoped to the board, the timeline card
height, the scale test, and the three perf fixes that came out of it.

### Spec drift found on the way out, and fixed

§4's "Read the book as prose" row still described the timeline's manuscript pane
as if every chapter rendered. It has been windowed since (g), and that row is
where someone would look for how the pane behaves — the note about it living
only in §9 item 17 would have read as a backlog entry rather than a description
of the shipped thing. The row now carries the windowing, the header-plus-spacer
rule, and the `beforeprint` / `flushSync` print path.

Everything else in §4 was already current: the two-modal rows (225-226), the
tabbed reference material (237), multi-scene and multi-chapter moves (238-239),
and the board-only toolbar (241) all landed with their commits.

### Still open, none of it blocking

- **SPECS §9 items 11, 12, 13** — untouched by this branch: per-book markdown
  export, cursor-anchored wheel zoom, images inline as data URLs.
- **`ExportModal` counts every chapter on open** (78ms at 30 chapters). The
  leftover of item 19, and the third instance of the same pattern — `countWords`
  in a render path is almost always wrong, because `words` is its cache.
- **One thing needs eyes**: the smooth-scroll landing after a rail click in the
  windowed pane. `requestAnimationFrame` is suspended while the preview pane is
  hidden, so the geometry was verified but the animation was never watched.

---

## 2026-08-04 — Dark mode rebuilt as a lightness ladder

Two commits shipped and deployed: **`bc0fe5d` live at
https://www.labrarf.com/estoria** (four polls before Pages caught up, as usual).
Prod CSS was checked directly for the new tokens; `#15130e` is gone from it.

The tagline change already sitting in the tree (`Welcome.tsx`, `AboutModal.tsx`)
went out as its own commit rather than riding along with the theme.

### What the old dark theme actually got wrong

It was a near-black inversion, floor at **OKLCH L 0.187**, and it failed three
things that were measured rather than eyeballed:

- `faint` at **2.67:1 on `card`**, under the 3:1 floor. Scene and word counts
  were dimmest exactly where they sat deepest in the stack.
- `line` and `rule` at **1.28:1 and 1.09:1 against `card`** — the hairlines this
  design uses *instead of* boxes and shadows were effectively not drawn.
- `chip` above `panel` but below `card`, so a control group's resting state and
  its `hover:bg-card` were in the wrong order.

### The false start worth remembering

The first pass fixed all three numbers and was still wrong, because it kept the
near-black floor (L 0.187) and pushed contrast *up* from there. The local copy of
the `design-pref-rfcl` skill still carried the superseded palette, so it built to
`--bg: #15130e` and never saw the approved ladder. **The skill on this machine
lives only under `local-agent-mode-sessions/`, which looks session-scoped** — the
canonical copy belongs somewhere durable, or this drift repeats.

All four skill files (SKILL.md + web/mobile/presentation refs) were patched to
the approved spec on the way through.

### Judgement calls the reference palette does not cover

Estoria has tokens the reference does not. `chip` → `#272320`, between bg and
panel, mirroring its light-mode role. `but` and `and` took the same +0.08 L step
as `therefore`. **`--therefore-hover`, `--success-*` and `--error-*` were
deliberately not added**: the light theme has no counterparts, so they would be
dark-only variables that break silently the moment something used them in light.

### Two trade-offs carried on purpose, both approved

- **`rule` is now lighter than `line` in dark, and darker in light.** Their roles
  invert between themes, so dividers read heavier than borders in dark. The theme
  toggle button (`border-rule`) is the visible instance.
- **`faint` on `card` is 2.85:1**, just under 3:1. `#807b73` clears it at 3.14:1
  and moves L only from 0.561 to 0.585, if it ever becomes worth the change.

### Spec drift

None to fix: SPECS.md never named a dark palette, so nothing in it went false.
But §4's `Light/dark theme` row was the one **empty notes cell** in that table,
which is why the ladder was easy to get wrong twice. It now carries the rule, the
`chip` reasoning, and both trade-offs above.

### Still open, unchanged by this session

- **SPECS §9 items 11, 12, 13** — per-book markdown export, cursor-anchored wheel
  zoom, images inline as data URLs.
- **`ExportModal` counts every chapter on open** (78ms at 30 chapters).
- **The smooth-scroll landing after a rail click still needs eyes** — carried
  over from (h); geometry verified, animation never watched.

## 2026-08-05 — A drop lands before the card it hits, and the end gets a slot

Asked for one thing: dragging a chapter onto another should drop it **before**
that chapter, not after.

### What the old rule actually was

`const after = dragged.x > target.x` — and `dragged.x` is the card's *final*
position, the one it has while sitting on top of the target. So the comparison
was not "which side did you drag in from", it was "did your card's origin come
to rest a few pixels right of the target's origin". The same gesture onto the
same card could land on either side of it. Replaced with an unconditional
`before` on both the chapter board and the series map.

### The question that changed the shape of the work

With `before` unconditional, the tail of the book is unreachable: there is no
card past the last one to aim at. Raised it before writing anything, and the
answer was to make the space past the last card mean what it looks like it
means. So there is now an **end slot** — a dashed, card-sized ghost reading
`End of book` (`End of series` on the map), one grid gap past the last chapter
that isn't itself moving. Drop a card on it and it goes to the end.

Three things it does that are easy to miss:

- **It hides when the move would be a no-op.** If the cards being dragged are
  already the tail, there is nothing to offer, so no ghost and no hit test.
  `chapters.length - 1 - indexOf(anchor) === moving.size` is the whole test.
- **It waits for the drag to be real.** Every press on a card sets `dragId`, so
  drawing off that alone flashed a ghost onto the board on every click. It keys
  off a `dragMoved` state set inside the drag's rAF instead.
- **It needed no store change.** "At the end" is `after: true` against the last
  chapter left standing, so `reorderChapter` / `reorderChapters` / `reorderBook`
  keep their signatures, and the block path anchors past the last chapter *not*
  in the selection.

### One fix pulled in, deliberately

`SeriesMap`'s map drop read its target from a ref only written inside the
coalescing rAF — the exact frame-staleness the board fixed when multi-chapter
reorder landed, never applied here. A quick flick onto the new end slot would
have silently done nothing. It now re-tests against the card's final position at
release, like the board. Out of the literal ask, but the alternative was
shipping a new affordance on a known-unreliable hit test.

### Verified in the running app, not just typechecked

Drove real and synthetic drags against the dev server on the sample story:

- Chapter dropped onto another **landing right of its origin** — the case the
  old rule called "after" — confirmed `will move before "Crossing the Salt"`,
  and the resulting order matched.
- Chapter dropped on the end slot → `will move to the end of the book`, and it
  landed 8th.
- **Last** chapter dragged past the end → no dialog, order untouched (the no-op
  guard).
- Two chapters modifier-selected, dropped on a third → `The 2 selected chapters
  will move before "What Pip Knew"`, block order preserved.
- Book dropped onto another on the series map → `will move before "True North"`;
  book dropped on the end slot → `will move to the end of the series`, and it
  became book 3.
- Both ghosts screenshotted mid-drag. No console errors.

Worth recording about the harness: the preview pane reports `document.hidden`,
so `requestAnimationFrame` only fires when a screenshot forces a paint. The
board's drop path survives that because it re-tests at release — which is also
how the series map behaves now. The live highlight and ghost need a frame, so
they were captured by stepping the drag screenshot by screenshot.

### Known trade-off, accepted

When the last card sits at the right edge of an auto-arranged row, its end slot
extends past that edge into empty canvas rather than wrapping to where the next
row would start. It is transient and only visible mid-drag; row-aware placement
was judged not worth the geometry.

### Still open, unchanged by this session

- **SPECS §9 items 11, 12, 13** — per-book markdown export, cursor-anchored
  wheel zoom, images inline as data URLs.
- **`ExportModal` counts every chapter on open** (78ms at 30 chapters).
- **The smooth-scroll landing after a rail click still needs eyes.**

---

## 2026-08-05 (b) — The theme button matches the portfolio site

The toolbar's theme control was a 36px rounded square, filled with `card`,
holding a half-filled circle glyph. The portfolio site at labrarf.com — the
same site Estoria is deployed inside, at `/estoria` — has used a different
control all along: a 36px **circle**, transparent, hairline `rule` border, a
15px Feather **moon** while light is on and a **sun** while dark is on, with a
200ms hover that darkens the border, lifts the text to `ink`, and fills the
background with `card`. Estoria now uses that one, token-for-token against its
own palette (`rule` / `soft` / `ink` / `card`, not the site's variables), so the
two chrome bars read as one product.

The glyph moved into a small `ThemeIcon` component rather than staying inline:
two 9-element SVGs in the middle of the toolbar's JSX buried the control it
belongs to.

The button's `aria-label` now names the *action* — "Toggle dark mode" while
light is on — matching the site. It used to carry a `title` naming the current
state ("Dark theme"), which read as a label for what you were about to get and
said the opposite.

**Left alone deliberately:** when the toolbar is too narrow it collapses zoom
and theme into the ⋯ menu, where theme is a labelled row (`Theme — Light`), not
a button. The site has no equivalent surface, and a menu row reading its own
state is right there.

Verified in the running app: the button computes to a circle with a transparent
background and the moon path in light; clicking it flips `data-theme` to `dark`,
swaps the label to "Toggle light mode", and renders the sun. `tsc -b` clean.

---

## 2026-08-06 — Every word count comes from the words

Estoria shows a word count in six places — the board card, the timeline rail
card and its manuscript header, the toolbar's `24.4k words · 8 chapters`, the
version menu, and the series map's per-book line. All six read one stored field,
`Chapter.words`, and until today exactly **one** thing refreshed it: a 700ms
debounce inside `ChapterModal`. Everything else that can change prose left the
number where it was.

Six ways it could lie, all now closed:

1. **Closing the manuscript within 700ms of typing.** The effect cleanup cleared
   the pending timer and nothing rescheduled it, so the last burst of writing
   never reached the count — and reopening the chapter did not fix it, because
   only *typing* started the timer. A `pending` ref now names the chapter still
   owed a count, and a cleanup keyed on the chapter flushes it: the same unmount
   that already forced the prose out settles the number.
2. **A manuscript pulled from another version**, and **3.** its undo. The undo
   record grew `previousWords` / `previousTarget`, because putting the text back
   while leaving the count where the pull moved it is the same lie in reverse,
   and a chapter that had no prose before the pull has nothing to recount.
4. **A structure-only fork** stripped every manuscript and kept every count, so
   an experiment with none of the writing reported the parent's whole book — in
   the toolbar, the version menu *and* the series map.
5/6. **Imports, Sync pulls and backup restores**, which arrive with whatever
   counts the file happened to carry against whatever prose it holds.

The fix is one function, `syncChapterWords` in `lib/manuscript.ts`, and every
path calls it. `reconcileWords` walks a whole document through the same function
at `openDoc` / `replaceDoc` — reusing `prose.ts`'s chapter walk, now exported as
`mapChapters`, because a second walk written next to it is the one that forgets
the stashed books. Deliberately **not** at hydration: `mergeProse` has just put
every project's manuscripts back, those counts were written by this app on the
save rhythm, and scanning a library to confirm them would be the §9 item 14
mistake moved to startup.

**One rule changed, with the user's call:** emptying a chapter used to freeze its
last count rather than show 0. It now reads 0. `manuscript` stays `undefined`
until someone types, so a defined-and-empty one means the words were deleted —
and the plan the old number represented is already promoted into `target`, which
is what made the freeze unnecessary. A pre-prose chapter with a hand-typed count
and no manuscript is still never touched.

Verified in the running app on the sample story, with the debounce temporarily
widened to 5s so the race was reproducible by hand: typed 14 words and closed
the chapter immediately — card `14 / 3.2k words`, toolbar 27.6k → 24.4k, timer
never fired. Emptied the same chapter and closed — `0 / 3.2k words`, plan intact.
Forked structure-only — fork reads `0 / 3.2k` where the main draft reads
`14 / 3.2k`. Made it a series — the map's book line agrees with the toolbar.
Reloaded — both versions came back with the counts they were saved with, save
status `Saved in this browser`. `tsc -b` and `npm run build` clean.

### Still open, unchanged by this session

- **SPECS §9 items 11, 12, 13** — per-book markdown export, cursor-anchored
  wheel zoom, images inline as data URLs.
- **`ExportModal` counts every chapter on open** (78ms at 30 chapters). Now the
  odd one out: it is the last surface that counts prose instead of reading the
  cache this pass made trustworthy.
- **The smooth-scroll landing after a rail click still needs eyes.**

**Shipped** the same day: `2ee18f7` pushed to `origin/main` and deployed —
prod reported the commit at `https://www.labrarf.com/estoria`.

**Spec drift found while shipping, both now corrected:** §4 still described the
chapter modal's recompute as something a close *clears*, which is exactly what
this session stopped being true; and §9 item 19 still listed `Timeline.tsx` as
counting per chapter in its rail render, which item 17's pass had already moved
to the cache. `ExportModal` remains the one real instance of that shape.

---

## 2026-08-06 (b) — An import can bring the prose with it

Import mapped a draft and left the draft behind: you got chapters, scenes, cast
and world, and then an empty manuscript under every card you had just described.
The text was already in the file you fed the AI. It simply had nowhere to land.

**The prompt now has two modes.** A segmented toggle in step 1 — *Map only* /
*Map + manuscript* — swaps what `importPrompt(prose)` returns. With prose on the
schema gains one block per chapter, last after `Characters:`:

```
#### Manuscript
<the chapter's text, copied exactly, blank line between paragraphs, *** at a scene break>
```

Off by default, and that is the whole argument for the toggle: a map is a summary
of a book and costs a page or two, while the prose *is* the book. Sending a
finished novel through a chat model to get back what you already have is only
worth it when you actually want it in Estoria.

**The fidelity rules grew a prose half.** Copy word for word — no tightening, no
re-punctuating, not even an obvious typo fixed. Never a summary or a
`[chapter continues]` in place of text; a chapter is either whole or its block is
left out. A chapter that is outlined but not written gets no block at all, since
an empty one is worse than none. And when the book is too long for one reply the
prompt asks for **parts split at chapter boundaries**, numbering continuing, to
be joined end to end — the failure mode being avoided is a model that quietly
compresses the last third to make it fit.

**The parser takes the prose off first.** `parseActChapters` finds
`#### Manuscript` (plus the drifts: `**Manuscript**`, `#### Prose`, `Full text:`)
and splits the chunk there before the line loop runs. That order is the fix
rather than a tidiness: prose paragraphs that open `- ` or `1. ` are ordinary
sentences, and the scene matcher — deliberately loose since Session 43, because
AIs drift from `1.` to `-` freely — would have read them as beats. The chunker
never confused `####` with a new chapter (`^###\s+` wants whitespace after the
third hash), so the block stays inside the chapter it belongs to.

**No new counting code.** `manuscript` stays `undefined` when the block is
missing or holds no words, which is the value `syncChapterWords` reads as *never
drafted*; `openDoc` already runs `reconcileWords`, whose own comment calls an
import "one user-initiated moment where one scan is invisible". So the AI's
`· 3,200 words` estimate is promoted to `target` by the existing promote-don't-
overwrite rule and the real count replaces it. A chapter that arrived written
opens as `draft` instead of `idea`, and the summary card gains
`· N written · N,NNN words` when any prose came through.

`summarizeImport` was deleted on the way — a second, weaker scanner of the same
file that nothing had called since the real parser landed in Session 9. It would
have needed the two new fields to keep compiling, and the honest value for both
was "ask the parser".

### Verified in the running app

Dev server, sample story open, File → Import markdown. The toggle swaps the
prompt in place (`THIS RUN CARRIES THE PROSE TOO` appears). Fed it a two-chapter
file where chapter 1 has a manuscript containing a line starting `- `, a line
starting `1. `, and a `***`, and chapter 2 has none: summary read
`2 chapters · 4 scenes · 1 characters · 1 world · 1 written · 27 words`; scenes
parsed as the three real beats, not five. Opened it — card 01 reads
`27 / 3.2k words` with a draft dot, card 02 reads `2k words` and stays an idea.
IndexedDB holds the chapter's prose verbatim, `***` and quotes intact, under the
four-part prose key. `tsc -b` clean.

### Found while verifying, and fixed

- **The welcome screen still showed a serif `E` in a black box**, a placeholder
  from before there was artwork. Now `AppIcon` — the same file the tab, the
  install prompt and the dock use — in a 64px circle. Ray picked the circle from
  four variants rendered side by side in the running app, on the rule that the
  card keeps its full 40px and the circle grows to hold it, rather than the card
  shrinking to fit. (57px is where a rotated 40px square just fits, and reads as
  a near-miss.) The `E` boxes Ray saw elsewhere were Chrome's fallback favicon.
- **Superseded shell caches were piling up.** They were only swept on activate,
  but a worker that installs and then *waits* — because the reader hasn't taken
  the update — has already filled its cache. Three were sitting in the test
  browser. The sweep runs at install too now, keeping this worker's cache and
  the running one's; an installing worker finds the latter through
  `registration.active`, whose `?v=` is its cache name. Bounded at two.
- **The update toast was unclickable** whenever it mattered most: at `z-60` it
  rendered under the welcome screen (70) and the modals (80), dimmed by their
  backdrop and dead to a click. Found by clicking Reload during onboarding and
  watching nothing happen. Now above them.

### Not done, deliberately

- **Merging an import into the open project.** Import still opens a new one.
  Matching imported chapters onto existing ones needs rules and an overwrite
  warning, and neither is worth inventing before someone wants it.
- **The map export still carries no prose.** `buildMarkdown` exports the map on
  purpose (§4, "two exports with different purposes"); the manuscript export
  already covers the other direction. So a prose import does not round-trip
  through the Obsidian file — it round-trips through the project file.

**Shipped** the same day: `e1f2e95` pushed to `origin/main` and deployed — prod
reported the commit at `https://www.labrarf.com/estoria`.

**Spec drift found while shipping, both now corrected:** §3's em-dash exception
still cited `markdown.ts:272` / `:331` for the two parsers that read the
separator, and both numbers had drifted (they are `parseCharacters` and
`parseWorld`, now around `:317` and `:379`) — the citation is by function name
now, so the next edit to this file cannot invalidate it. And §8's cross-project
notes said nothing about the new `#### Manuscript` block: it is not a cross-app
event, since it changes the *import prompt's* markdown schema and not
`.estoria.json`, but Android carries its own copy of this parser, does not know
the block, and has the same `^\d+[.)]\s+` scene regex the web split now guards
against — so that file should be imported on the web until Android ports the
split.

## 2026-08-06 (c) — Estoria installs as an app

Estoria could be saved as a Chrome app before this, but it came with a generic
icon and the browser's default guesses at its name, and it needed the network
to open. Now it's a real installable app with its own artwork, and the shell
works offline.

### The icon

Ray's artwork: a tilted story card in the board's paper stock, a green
`therefore` dot, four ink rules, soft drop shadow. `art/icon-source.png`
(1024², outside `public/` so the master isn't shipped) is the source of truth and `scripts/make-icons.sh` derives everything
from it — 512/192/32, a maskable 512, a 180 apple-touch icon.

*First attempt, discarded:* the image was only ever in the chat, never on
disk, so it was traced as SVG from sight. Ray put the real file in the repo and
the trace was out — flat where the original has a shadow, and even in the edges
where the original is weighted. Tracing artwork you can see but can't read is
not worth it; ask for the file. The SVGs are gone.

*Second correction:* the first pass downscaled the source as-is, which left
the card small and adrift inside the transparent margin the artwork carries.
Ray sent a crop showing what he meant — the card filling the frame — so every
size now trims to the artwork and pads back to square.

Corners were settled by rendering both options at 128/64/32 on a dark dock and
a light one rather than by argument. The plain sizes stay transparent: on a
dark dock the cream tile reads as two rectangles competing, and at 32px the
transparent card holds up better. Maskable and apple-touch are flattened onto
`#fffdf6` (`--card`, matching the welcome circle's surround — on the canvas
colour a card reads as one object among many) anyway — not by preference, but because a maskable icon must be
full-bleed by spec and iOS puts solid black behind a transparent apple-touch
icon.

### Installable, and offline

- `public/manifest.webmanifest` — standalone display, paper background, the
  icon set. Every URL in it is relative, because `public/` bypasses Vite and a
  relative URL resolves against the manifest itself: `/` in dev, `/estoria/`
  in prod, with nothing to configure. The `<link>` tags in `index.html` use
  root-absolute paths instead, which Vite *does* rewrite with the base.
- `public/sw.js` — app-shell cache. Registered as `sw.js?v=<build>` so the
  existing commit-count build number is both what triggers an update and what
  keys the cache. `version.json` is explicitly never cached; it's what
  `npm run deploy` verifies against.
- `src/lib/install.ts` — captures `beforeinstallprompt` at module scope
  (it fires before React mounts) and exposes it through `useSyncExternalStore`.
- File → **Install Estoria** — one button on Chromium, per-browser directions
  on Safari/iOS/Firefox, hidden entirely once running standalone.
- `UpdateToast` — a new build waits rather than taking over, so no reload ever
  lands mid-sentence.

### Verified in the running app

- Production preview at `/estoria/`: worker registered as `sw.js?v=139`, scope
  `/estoria/`, manifest `start_url` and `scope` both resolving to
  `/estoria/`, icons to `/estoria/icon-192.png`.
- Precache after one visit held the shell HTML, both hashed assets, the
  manifest and icons, plus four webfont files in `estoria-fonts`.
- **Stopped the server and reloaded** — the board rendered in full, Spectral
  and Hanken Grotesk included. Offline is real, not theoretical.
- File menu shows Install Estoria above About; the dialog shows the Chromium
  steps in the in-app browser (no `beforeinstallprompt` there), and swaps to
  the one-click Install button the moment that event arrives.
- `npm run build` clean, no console errors.

### The way back out (added the same session, at Ray's call)

A service worker is the first thing Estoria ships that keeps running on someone
else's machine after a bad deploy, so both exits were built before they were
needed:

- **Fleet-wide** — `KILL_SWITCH = true` at the top of `public/sw.js`, commit,
  deploy. Every copy skips waiting, drops every `estoria-` cache, unregisters
  and answers nothing. It reaches clients even behind a broken cached shell,
  because the browser always re-fetches `sw.js` from the network on navigation:
  a cache can't hide the switch from itself. It reloads nobody — the session in
  front of the user stays up and their *next* load is uncontrolled.
- **One person** — `…/estoria/?sw=off`, a link that fits in a reply, with
  `?sw=on` to allow it again. Sticky via a localStorage flag: the first cut
  wasn't, and testing showed the reload at the end of the teardown promptly
  re-registered the worker — a decent cache repair, no use at all if the worker
  is the problem. Runs from `main.tsx` before React renders, since the shell
  it's rescuing someone from may be why the app won't mount.

Both verified against the production preview: armed, one visit left zero
registrations and zero caches with the app still running; disarmed, the next
visit re-registered `sw.js?v=140` and refilled the shell cache. `?sw=off` left
nothing behind and survived a plain reload; `?sw=on` brought it back.

### Found while verifying, and fixed

- **The welcome screen still showed a serif `E` in a black box**, a placeholder
  from before there was artwork. Now `AppIcon` — the same file the tab, the
  install prompt and the dock use — in a 64px circle. Ray picked the circle from
  four variants rendered side by side in the running app, on the rule that the
  card keeps its full 40px and the circle grows to hold it, rather than the card
  shrinking to fit. (57px is where a rotated 40px square just fits, and reads as
  a near-miss.) The `E` boxes Ray saw elsewhere were Chrome's fallback favicon.
- **Superseded shell caches were piling up.** They were only swept on activate,
  but a worker that installs and then *waits* — because the reader hasn't taken
  the update — has already filled its cache. Three were sitting in the test
  browser. The sweep runs at install too now, keeping this worker's cache and
  the running one's; an installing worker finds the latter through
  `registration.active`, whose `?v=` is its cache name. Bounded at two.
- **The update toast was unclickable** whenever it mattered most: at `z-60` it
  rendered under the welcome screen (70) and the modals (80), dimmed by their
  backdrop and dead to a click. Found by clicking Reload during onboarding and
  watching nothing happen. Now above them.

### Shipped

Merged to `main` and deployed the same session. Prod verified directly rather
than assumed: `version.json` reports `95da87d` / build 148; `manifest.webmanifest`
serves as `application/manifest+json`; all five icons and `sw.js` return 200;
`KILL_SWITCH` reads `false` in the deployed worker; `icon-source.png` 404s,
confirming the 450KB master isn't being served. Loading
`https://www.labrarf.com/estoria/` registered `sw.js?v=148` at scope
`/estoria/` and precached the shell — index, both hashed assets, manifest and
icons — on the first visit.

### Not done, deliberately
- No SVG favicon. The artwork is a raster with a soft shadow; a vector version
  would be a second thing to keep in sync with it, and 32px is small enough
  that the downscale holds up.
- No iOS-specific splash screens. They're a pile of per-device PNGs for a
  case (Estoria on an iPhone) that the board isn't laid out for anyway.

## 2026-08-06 (d) — The install button was unreachable in production

Ray: the Install button appears on `localhost:5200/estoria/`, but the live app
at labrarf.com shows manual instructions instead.

**Cause.** Production reached Estoria through `estoria-app.html`, a full-page
iframe around `/estoria/`. `beforeinstallprompt` only fires for a top-level
page, so inside the frame there was nothing to offer. Worse, the fallback steps
were wrong twice over: Chrome's install menu would have targeted the wrapper,
which carries no manifest of its own, producing a plain shortcut rather than
Estoria with its name and icon. Localhost was fine only because it loads
`/estoria/` directly.

**Two fixes, because there were two problems.**

- *The app now tells the truth when framed.* `isFramed()` in `lib/install.ts`
  (a cross-origin parent makes `window.top` throw, which is itself the answer),
  and `InstallModal` swaps its steps for an explanation and a link that opens
  Estoria top-level. This stays useful for old links and any other embedder.
- *The site stopped wrapping it.* `estoria.html`'s two demo buttons link
  straight to `/estoria/`. The wrapper only ever gave the app a URL on the
  site; same-origin — the thing that makes the folder picker work — comes from
  serving `/estoria/` out of the portfolio repo, not from the iframe. So it
  bought nothing and cost the install. Recorded in the portfolio's SITE-GUIDE
  as a rule, since it will recur: any project that ships a manifest must be
  linked directly, never wrapped.

### Verified in production

- `estoria.html` serves two `href="/estoria/"` links and zero to the wrapper.
- `/estoria/version.json` reports `3cdb718`, build 151.
- The framed copy is present in the shipped bundle.
- The framed branch itself was checked before shipping, against a local replica
  of the production wrapper: explanation, a working "Open Estoria in its own
  tab", and no dead Install button.

### Drift corrected in the specs

§8's hosting notes still described `estoria-app.html` as iframing `/estoria/`
as the live arrangement. Rewritten, with the reason the wrapper is gone.

## 2026-08-07 — A connector is allowed to say nothing (schema v9)

The but/therefore method is the point of the scene canvas, and until today it
was also compulsory: `ConnType` held three values, every one of which asserts a
relationship, so there was no way to write down "these two scenes are in this
order and I have not decided why". Ray asked for a way to turn it off.

The first shape considered was a global preference — one switch that hid every
pill and dropped the tags from exports. It was planned in full, then dropped in
favour of the option that had been passed over: **a fourth `ConnType`, `"none"`,
per seam.** Which is the better fit, because the problem was never "I don't use
this method"; it was "this particular seam has no answer yet".

**The cycle** runs Therefore → But → And → none → Therefore. `"none"` sits at
the end so the three method values stay adjacent, and clearing is one click past
And.

**An unlabeled seam still needs somewhere to click.** This is the one piece of
the design that isn't obvious: if the pill simply vanishes, the seam becomes
unreachable and the method is a one-way door. So `"none"` keeps the full hit box
and shows a 7px hairline dot on the connector line, filling in on hover. The
read-only surfaces — the timeline's scene pane and the manuscript beat rail —
draw nothing at all, because there is nothing to read and no cycling to do.

**The interesting half was the defaults, which Ray asked to revisit.** A seam
gets created for you in three different ways, and `"therefore"` was hardcoded at
every one — the code was candid about it, `sceneSubset` saying a closed-over gap
"cannot inherit a meaning from either side, so it defaults to therefore rather
than guessing". With `"none"` in the type that reasoning inverts: `"therefore"`
*was* the guess. They now answer separately.

- **Adding or inserting a scene inherits the seam before it** (`inheritedLink`,
  falling back to `"therefore"` for a chapter's first). Adding a scene is
  deliberate and writers work in runs, so a therefore-chain extends itself and a
  stretch deliberately left blank stays blank.
- **Churn is always `"none"`** — reordering, moving scenes between chapters, and
  a gap closing over a removed scene. The app rearranged the story there, not
  the writer; inventing a causal link between two scenes that had never been
  adjacent is exactly what this change exists to stop.

**Markdown had a round-trip trap.** `"none"` exports as the *absence* of a tag,
which is right for the vault — a `_(none)_` marker would be a word for "no word
here". But the importer read an untagged scene as `"therefore"`, so every
unlabeled seam would have come back causal. Untagged now parses as `"none"`. The
cost is real and was accepted out loud: markdown exported before today, or an AI
file that skipped tags, imports those seams unlabeled where it used to import
them as therefore. The import prompt was updated to match — it now tells the
model that leaving a tag off is a valid answer rather than something to avoid.

**Scope held to scene links.** Chapter links on the board share `ConnType` and
can hold `"none"` (neutral line colour, for a doc that arrives carrying one),
but the board has no cycle control and nothing sets one.

### Schema and the phone

`SCHEMA_VERSION` 8 → 9. No stored data changes shape, so the migration is a
pass-through; what the bump buys is the honest signal that a document can now
carry a value older readers don't know. `normalizeSceneLinks` replaces a bare
`.slice()` and coerces anything unrecognised to `"none"` — never `"therefore"`,
which would re-assert the causality v9 removes.

**This opens a cross-app event, and §8 carries the warning.** The risk is
semantic like v8's, not structural: a v9 file parses on Android, but if its
normaliser folds an unknown link into `Therefore`, a round trip through the
phone silently relabels every unlabeled seam as causal.

### Verified

Against the dev server, driving the real UI:

- The cycle: But → And → unlabeled, with the pill replaced by the dot and an
  18px hit target still present.
- Inheritance both ways — a scene added after an unlabeled seam came in
  unlabeled; after relabelling that seam Therefore, the next one inherited
  Therefore.
- Reorder: dragging a scene one slot right left `["none","none","therefore",
  "therefore"]` — the fresh seam unlabeled, the surviving links shifted, no
  invented therefore.
- Round trip through the real `buildMarkdown` / `parseImportMarkdown`: the
  pristine sample is byte-identical on links, a doc seeded with `"none"` seams
  returns exactly, and no `(none)` marker appears in the output.
- Both read-only surfaces render an unlabeled seam silently (manuscript rail,
  timeline scene pane), light and dark.
- `npm run typecheck` and `npm run build` clean.

### Found while verifying, and left alone deliberately

A scene with **empty text** and **no tag** is dropped on import. It exports as
`2. ` (trailing space), the parser trims the line to `2.`, and the scene regex
requires whitespace after the number, so it never matches. That rule predates
this change, but v9 **widens** it: a blank scene used to carry a
`_(therefore)_` tag that kept its line matchable, and an unlabeled one now has
nothing after the number. So blank scenes are lost more often than before.

Not fixed here, because the repair is in the importer rather than the
connectors, and loosening `\s+` to `\s*` changes how every other numbered line
parses — that deserves its own look rather than a ride-along. Flagged to Ray,
and **fixed in the next entry**, where the `\s*` idea turned out to be the wrong
one.

## 2026-08-07 (b) — A blank beat survives the round trip

The v9 session flagged this on the way past: a scene with **empty text and no
connector tag** was silently dropped on import. `buildMarkdown` writes a blank
beat as `2. `, the parser trims that to `2.`, and the scene matcher required
whitespace after the number — so the line matched nothing and the beat was gone,
with every later link shifting up a seam.

It predates v9, but v9 made it common. Before, every non-final scene carried a
`_(therefore)_`-style tag, and it was the *tag* that kept a blank scene's line
matchable. An unlabeled seam writes no tag, so the line is now bare far more
often. This is the same failure the whole Session 43 family has: the file looks
valid, the import reports success, and data quietly disappears.

**The obvious one-character fix was the wrong one.** Loosening `\s+` to `\s*` on
the shared rule also loosens the *bullet* branch, which then eats ordinary AI
output. Checked against real drift patterns before deciding:

| Line | `\s+` (before) | `\s*` (rejected) |
| --- | --- | --- |
| `*She lies here*` | not a beat | beat: `She lies here*` |
| `**Turning point:** the reveal` | not a beat | beat: `*Turning point:** the reveal` |
| `3.5 hours later, the tide turns` | not a beat | beat: `5 hours later, the tide turns` |
| `---` | not a beat | beat: `--` |
| `+1 for the plan` | not a beat | beat: `1 for the plan` |

That is precisely the tolerance Session 43 was built to give, traded away for a
blank line. The placeholder idea was dropped too: it puts a marker in the
Obsidian vault to mean "nothing here", and an AI-written file would not use it,
so blank scenes coming from an import would still vanish.

**What landed instead:** a *numbered* marker alone on its line is an empty beat.
Bullets keep needing their space — a lone `-` or `*` is far likelier to be an
artifact than an empty beat, and the numbered form is the only one this app
writes. `buildMarkdown` is untouched, so **the export format did not change.**

### Verified

- The reported case round-trips exactly: `['A','','C','']` with links
  `['therefore','none','but']` returns identical in both.
- Pristine sample, a doc seeded with `"none"` seams, and a chapter *starting*
  with two blank scenes — all lossless on scenes and links.
- Drift file with every row of the table above plus `1.`-, `-`- and `3)`-marked
  beats: five beats parsed, none of the five decoys, characters still read.
- `npm run build` clean; no console errors.

### Shipped

Both entries above went out together as `3663eeb` (build 155), plus one spec
fix found while reviewing for drift: §4's board-connectors row still described
`ConnType` as three values, so it now says a chapter link *can* carry `"none"`
(neutral colour) while nothing on the board sets one.

**Verified in production**

- `/estoria/version.json` reports `3663eeb`, build 155.
- The app boots at `www.labrarf.com/estoria/` with no console errors of its own.
  (`script.js` throws an `addEventListener` on null — that is the **portfolio
  site's** script on the surrounding page, not Estoria's bundle, and it predates
  this deploy.)

**Spec drift check** — the rest of §4/§8 matches the code: scene-link fallbacks
read `"none"` at all three render sites, the chapter-link fallbacks that stay
`"therefore"` are all board-level, and the export/import rules are the ones the
round-trip tests exercise. The one claim that is **stated but unverified** is
what the phone does with a v9 file; §8 says so in those words rather than
guessing.

## 2026-08-07 (c) — The canvas dots are pressed in, not glowing

A one-token change, asked for as "what if the dots were dark instead of light".

### What was wrong

The dot grid on every canvas was painted with `--rule`, which in dark is
`#605a52` — *lighter* than the `#231f19` floor it sits on. In light, `--rule`
(`#e1d6bf`) is darker than the `#e9e0cd` background, so the same one line
produced opposite relationships in the two themes: ink pressed into paper in
light, specks glowing on top of the canvas in dark. Dark mode was rebuilt as its
own lightness ladder rather than an inversion (2026-08-04), and this was one
place the inversion had survived.

### What landed

A new `--dot` token. Light holds `#e1d6bf`, identical to `--rule`, so light is
byte-for-byte what it was. Dark sets `#1a1712`, about 5 lightness points *under*
`--bg`, which restores the light theme's ordering instead of copying its value.
The four canvases that draw the grid — `Board`, `Timeline`, `ChapterDetail`,
`SeriesMap` — now read `var(--dot)`.

**Why a new token rather than repointing `--rule`.** `--rule` is also every
hairline border, divider and input outline in the app; darkening it would have
taken all of those with it, and those hairlines are the design's substitute for
boxes and shadows.

### Known and accepted

Board and series map draw the grid on `--bg`; timeline and chapter draw it on
`--panel` (`#2b2721`), which is two steps lighter. So the dots carry slightly
more contrast in the panelled surfaces than on the open canvas — one token,
not one weight. Flagged to the user before shipping; a second value is the fix
if it ever reads as inconsistent rather than as depth.

### Verified

- Dark board and dark timeline compared before and after in the running dev
  server. On the board the grid stops emitting and the cards and connectors are
  the only lit things on the field.
- Light theme unchanged by construction (same hex as before).
- `npm run typecheck` and `npm run build` clean.

## 2026-08-08 — A conflict can be settled piece by piece

The Cross-app Sync contract has said since it was written that per-entity merge
"remains the later evolution" (§8, "Conflicts (v1)"). It is here. A conflict
dialog that could only offer keep-all-mine or keep-all-theirs made the user
throw away real work in one direction or the other every time both devices had
touched the same project — and the thing they most wanted to say, "that chapter
from the phone, everything else from here", was the one thing it couldn't hear.

### What landed

- **Every difference is now addressable.** `diffDocs` used to produce printed
  lines; it produces units with a structural `DiffAddress` and a stable `key`.
  Two consequences beyond the merge itself: chapters are diffed **per book**
  instead of globbed across every book (a chapter needs an address, and the
  grouping is more honest anyway), and each changed field now carries **both
  sides' rendered values** — real sentences to read against each other, counts
  for lists, word counts for prose, character *names* rather than ids.
- **`lib/merge.ts`** builds the merged project from `{ [key]: "mine" | "theirs" }`.
  Absent key means mine, so committing without touching a row is exactly
  keep-mine — which is what makes the merge safe to default into.
- **The dialog gained a second mode.** The summary is untouched as the fast
  path; "Compare & merge…" opens a review list with a per-row `This app / The
  file` toggle, an effect label ("will be added", "will be removed", "taking
  file's"), an expandable field-level compare, bulk controls and a live tally.
- **A merge preserves both copies**, `-conflict-<stamp>-local` and `…-file`,
  since neither side loses whole. Both still badge as Conflict copy in the
  folder history.

### Two decisions worth keeping

**The unit is the whole entity.** Fields are shown on both sides but not
individually selectable: taking half a chapter can produce one neither device
ever had — `sceneLinks` are positional, so a merged chapter could carry seams
for scenes that aren't there. For the same reason chapter connections, draft
versions, series-map links and board view settings stay whole-side units; a
per-link merge could keep a link pointing at a chapter that wasn't kept.

**References come along.** Take a chapter from the file and it may cast a
character this copy has never seen. Rather than write the dangling id (§9 item
5's bug class), the record is brought in from whichever side has it, and the
dialog names every one *before* the user commits. This deliberately overrides
the referenced row's own default — a chapter that references a character it
doesn't have is broken data, and the disclosure is what makes the override
honest rather than silent.

### Not a cross-app event

Nothing about `.estoria.json` changed. The merged output is an ordinary schema
v9 document and the conflict-copy naming is device-local, so **Android needs
nothing** and can keep offering the whole-file choice indefinitely. The four
rules to mirror, if that side ever builds its own, are recorded in §8.

### Fixed in passing

The conflict dialog's primary buttons were `text-white` on `background:
var(--ink)`, which is white-on-light and unreadable in dark mode — every other
dialog in the app uses `bg-ink text-bg`. They do now too.

### Verified

- 22 checks against synthetic diverged documents (esbuild + node, throwaway):
  empty choices fingerprint-match keep-mine and all-theirs fingerprint-match
  keep-theirs; a file-only chapter drags its cast in with no dangling id; a
  chapter in a stashed book lands in that book; **a chapter still lands in the
  right book when the two copies disagree about which book is active**; an
  only-here row set to the file is removed; field detail carries both values;
  keys are stable across runs.
- Dialog driven in the running dev server against a diverged sample story
  (temporary harness, since reproducing a real conflict needs two devices):
  both modes, both themes, toggles, bulk set, expanded compare, and the resolve
  callback firing with a merged doc. Row layout stacks below `sm` — a 92px
  effect column can't share a phone-width row.
- `npm run typecheck` and `npm run build` clean.

### Shipped

Deployed as `0a48567` and confirmed live at www.labrarf.com/estoria (prod's
`version.json` reported the commit on the fourth poll).

**Drift check against SPECS.** Three places described the code as it was
before `merge.ts` existed, all structural rather than behavioural, and all
corrected in this commit: the §3 `lib/` tree had no `merge.ts` row and
described `sync.ts` without its addressable diff; §8's "Implementation" bullet
named every module in the sync path except the new one; and the §3 modals line
still described `SyncConflict` as a single surface. Nothing in the file
contract or the reconciliation rules had drifted.

## 2026-08-08 (b) — Deleting scenes in bulk

Deleting scenes was one at a time, by the ✕ on a card, while *moving* them had
had a multi-select mode since Session 44. Clearing a run of beats after a
restructure therefore meant one confirm dialog per beat, against a list that
renumbered under you as you went.

- **New store action `deleteScenes(chId, indices, cols?)`.** Deliberately not a
  loop over `deleteScene`: every single delete renumbers each scene after it, so
  a caller deleting 2 and 5 would have to track the shift itself and would get a
  different answer depending on which order the two ran in — the same argument
  that made `moveScenesWithin` a separate action rather than repeated
  `reorderScene`. Indices are read against the list the writer sees and resolved
  once. Links go through the shared `sceneSubset`, so a seam that closes over
  deleted scenes comes back **unlabeled** rather than inheriting a causal claim
  from either side. Positions are **filtered, not re-arranged** — surviving cards
  stay where they were put, matching what the single delete already did.
- **Clearing every scene leaves one blank scene**, never zero: the state a fresh
  chapter starts in, and the one `moveScenesToChapter` already leaves an emptied
  source chapter in. A chapter with zero scenes would not round-trip through the
  markdown export. The confirm dialog says this outright when it applies.
- **"Move scenes" is now "Select scenes"**, and the mode's header gained a
  **Delete** button. One selection, two verbs — a second mode would have been the
  same picking mechanic under another name. `moveMode` renamed to `selectMode`
  throughout `ChapterDetail` so the name matches the job. Delete is outlined
  rather than filled: moving is what the mode is usually for, and the destructive
  verb should not be the loudest control on the row.
- **The mode's controls are bare verbs, `Move ▾` and `Delete`.** The button that
  opens the destination picker read "Select chapter", which named the *next step*
  rather than the action and paired a noun against Delete's verb; the chevron
  already says a menu follows. Neither button repeats "scene": the count sits
  immediately to their left and the selection is lit on the canvas, so a third
  mention would say what is already twice on screen. The hint line under the
  canvas names the same two words rather than paraphrasing them ("then Move them
  to a chapter, or Delete them"), so the instruction and the controls it explains
  do not drift apart in wording.
- **Fixed in passing: "1 scenes."** `ChapterMeta` was the one scene count in the
  app with no singular form, so a one-scene chapter read "1 scenes" in the detail
  meta row. Pre-existing, but a chapter reaches one scene easily now that a bulk
  delete can clear one. The scene-flow header, the selection count, the
  destination-picker chips and both move dialogs already pluralized.
- **Stale comment corrected** in the scenes section of the store: it still said
  `deleteScene` and `reorderScene` "raise the drift bar", but the drift bar went
  away with the scene/prose binding (§4, "The beats are a guide, not a
  structure"). The map has not mutated the manuscript for some time.

### Drift check against SPECS

The §3 component tree still described the chapter modal as it was before the
manuscript moved out of it: it listed a `ManuscriptSheet.tsx` that no longer
exists, credited it with a "scene carousel, drift bar" that went away with the
scene/prose binding, and described `ChapterDetail` as carrying the manuscript.
`ChapterModal` and `ChapterMeta` were missing entirely. Structural rather than
behavioural, and corrected in this commit. The §4 rule the new Delete answers
to — "one meaning per control: an ✕ detaches, a labelled Delete destroys" —
already covered a labelled bulk Delete and needed no change.

### Verified

- Driven in the dev server against the sample story: a **non-contiguous** delete
  (scenes 1 and 3 of 3) left scene 2 alone, in its own old position, with the
  chapter reading 1 scene and the word count unchanged at 3200 — the prose is
  not touched.
- **Delete-all** on a rebuilt 3-scene chapter left exactly one blank scene, the
  chapter intact, and the confirm read "Every scene in this chapter will be
  permanently removed. The chapter stays, with one blank scene."
- Selection is dropped on confirm, so the highlight does not carry over to
  whatever scenes slid into the emptied slots.
- The meta row reads "1 scene" after a bulk delete leaves one behind.
- Both button labels checked in the running app, and the destination picker
  still opens from the renamed control.
- `npm run typecheck` clean.

---

## 2026-08-11 — Nothing is written until we know what's there

Ray reported the app landing on the first-launch screen — "load a sample, or
start a blank book" — over a project that was still there, and only not losing
it because a copy was in Drive. Reviewed the install work he suspected. It is
not the cause, but it removed what had been hiding a landmine underneath it.

### The landmine

Since the manuscripts moved to IndexedDB (§2, Session 46), reading the store is
asynchronous: `zustandStorage.getItem` opens IndexedDB and reads every
manuscript before it answers, so persist hydrates asynchronously and until it
lands the store holds its defaults. `onboarded: false` is one of those defaults,
and it is the only thing `Welcome` renders on. Nothing anywhere gated on
hydration.

So the first-launch chooser is what an existing writer's document looks like for
as long as a load takes — and both its buttons call `set({ doc: … })`, which
persist answers with a write over `estoria:store:v1`. Unconfirmed, and with no
undo. Not clicking it is what saved the book, more than the Drive copy did.

Underneath that, `null` was doing three jobs. `LocalStorageAdapter.load`
swallowed throws and returned `null`; an unparseable blob returned `null`; and a
browser with genuinely nothing stored returned `null`. "New user", "storage
refused us" and "your data is corrupt" arrived at the same screen.

And one more, found while fixing it: when IndexedDB could not be opened, the
load handed the store a doc whose chapters had been *stripped* of their prose,
because that is where the prose was. Every manuscript blank, and one auto-save
from that being the truth.

### The invariant

**Nothing is written until a load has said what is already there.** Everything
else here follows from it.

- **`writesArmed`** in persistence.ts. `flushMap`, `flushProse` and `setItem`
  no-op until a load reaches a definite answer — including "there is genuinely
  nothing stored", which is a first launch and must be allowed to save. A load
  that hangs never arms, which is the point: the hang is exactly when the
  defaults are most dangerous.
- **`null` means absent and nothing else.** Failures propagate as a typed
  `LoadFailure` — `unavailable`, `unreadable`, `prose-unreachable` — each with
  wording of its own.
- **A hydration gate** (`store/hydration.ts`), kept outside the store: marking
  it in state would be a state change, and persist answers those with a write of
  the state we have only just finished reading. `Welcome` waits on it. A
  "Opening your work…" panel appears if the load passes 600ms, because an empty
  board reads as work that has gone missing, and a spinner on a 5ms load is
  noise.
- **`Recovery`** replaces the chooser when the load failed. It says nothing has
  been overwritten, offers the set-aside copy as a download *first*, then a
  reload; "start over" is the smallest button and the only one behind a confirm.
  Auto-save stays locked the whole time, so nothing the reader does there can
  make it worse.
- **`proseExternal`** on the stored blob, so a prose-free doc is no longer
  ambiguous between "has no prose" and "its prose is somewhere we can't reach".
  Only the second refuses to load.
- **A confirm on both onboarding buttons** when the open document has real work
  in it — the backstop for whatever the above does not anticipate. Skipped on a
  true first launch, where `doc` is still the very `sampleStory` object the store
  was created with, so the reference check answers it.

### The confirm was a dead end, found by Ray testing it

That last item shipped half-built. Ray hit the chooser over a real project,
clicked an option, and got a warning telling him to export first — with no way
to export. The welcome screen is `fixed inset-0`, so the File menu the advice
points at is underneath it. Checked it rather than assumed: `elementFromPoint`
over the File button does not return the File button while the chooser is up.

Two things wrong, and the second is the real one.

- **A confirm that says "save first" has to carry the save.**
  `ConfirmRequest.extraAction` renders beside the choice and deliberately does
  not answer it — the dialog stays open, so you can download and *then* decide.
  `guardReplace` passes "Download a copy".
- **The chooser was asking the wrong question.** With a document loaded behind
  it, both of its options destroy something and neither is right. It now leads
  with **"Keep working on this"**, naming the project and its size ("Untitled
  Voyage · 8 chapters · 4 characters · 4 world entries"), which resolves the
  state without touching anything. `keepCurrent` just sets `onboarded: true`.
  The other two stay where they were, behind their confirms.

Verified: the band and the confirms appear only over a document with real work;
a cleared profile still gets the plain two-option chooser and "Start fresh" goes
straight through with no prompt. "Download a copy" fires `untitled-voyage
.estoria.json` and leaves the dialog open. "Keep working on this" persists
`onboarded: true` with all 8 chapters intact.

### The sample opened as a long thin line

Ray, on the same pass: "Explore the sample" laid the 8 chapters out left to
right across ~2100px, so the first board anyone ever sees of Estoria was a
horizontal run you had to scroll. The coordinates are authored that way in
`data/sampleStory.ts` — readable as data, unreadable as a map.

`useSample` now runs the same `autoArrange` the toolbar button does, with
`bestColumns` sized to the **current window** rather than a fixed grid. No
camera work needed: bumping `arrangeN` is already what makes the Board fit the
arranged grid to the screen.

The "Alt ending" version takes the same positions rather than being arranged
separately. It is a standalone fork of the same board, and its whole purpose is
comparing two endings — the map shouldn't move underneath that comparison.

Left alone deliberately: the authored coordinates in `sampleStory.ts`. Baking a
grid into the data would fossilize the layout constants there and still not
adapt to the window. The one place the old line still shows is the board blurred
behind the welcome scrim, before a choice is made.

Verified at two window sizes from a cleared profile: 1440×900 gives a 3-wide
arrangement, x-span 605px, all 8 cards on screen at 105%; 514×704 gives 2 wide
and 4 rows, x-span 330px. Both down from ~2100. The alt fork matches the main
board's `x`/`y`/`rot` per chapter and still carries its own c8 title.

### And two things the install work did introduce

- **The old worker was poisoning its own shell.** The navigation handler cached
  whatever HTML came back under `SHELL`, which is named from the *running*
  worker's `?v=`. After a deploy the new worker waits (by design) while the old
  one keeps answering fetches — so the new build's markup landed in the old
  build's cache, next to the old build's hashed assets. Offline, that shell asks
  for scripts nothing has and the window comes up blank. `cacheShell` now reads
  the `__ESTORIA_BUILD__` stamp back out of the HTML and refuses anything that
  is not this worker's build.
- **`cache.put` will store a 404.** Unlike `cache.add`, which is why precache
  never hit it. GitHub Pages serves error pages mid-deploy and `deploy.sh`
  rsyncs with `--delete`. Cached once, an error page is the offline shell until
  a successful navigation replaces it. Same function, one `res.ok` check.

### Durable storage

Nothing had ever called `navigator.storage.persist()`. Every project Estoria
holds was sitting in the browser's *best-effort* bucket, which Chrome may clear
under disk pressure — silently, with no prompt, taking localStorage and
IndexedDB together. From inside the app that is indistinguishable from a first
launch, which is the shape of the report this session started from. Requested at
startup now, and About reports the answer, because "best effort" means the Sync
folder and exports are not optional.

### Verified

Driven in the dev server, each failure staged for real rather than mocked.

- **Unreadable blob** (a store truncated to 60%, the shape of a save cut off
  partway): `Recovery` shown, `Welcome` suppressed, the blob copied to
  `estoria:unreadable:<ts>`, and `estoria:store:v1` **byte-identical
  afterwards** — 8217 chars before and after adding two chapters and waiting
  well past the 500ms debounce. The prose pad was not written either. Footer:
  "Auto-save is paused…". Under the old code that sequence overwrote the
  recoverable blob with the sample story.
- **Prose unreachable**, staged by bumping the IndexedDB on disk to version 2 so
  the app's `open(…, 1)` genuinely fails: `Recovery` with the prose wording,
  writes locked, blob untouched. Previously this loaded a book of blank
  chapters.
- **The good path** in between: a valid `proseExternal` blob with its manuscript
  in IndexedDB loaded by title, no `Welcome`, no `Recovery`, footer back to
  "Saved in this browser".
- **First launch** on a cleared profile: `Welcome` shown, saving armed.
- **Shell poisoning**, in a production preview: with `sw.js?v=161` controlling
  and the served `index.html` edited to claim build 162, `estoria-shell-161`
  still holds a 161 shell and `estoria-shell-162` holds a 162 one. Both caches
  internally consistent; before the fix the 161 cache would hold 162 markup.
- Precache still fills the shell correctly (`"./"`, both hashed assets, manifest
  and icons) despite `"./"` no longer being in its `cache.add` list.
- `npm run typecheck` clean; `npm run build` clean.

### Not done

- **No deploy.** Committed only.
- **`openDb` has a 5s timeout now**, which bounds the hang, but a *slow* open
  still delays the load rather than proceeding without prose — deliberately, per
  the invariant above.

### Deployed

`npm run deploy` → **build 162 / `84c8c61`**, live at
https://www.labrarf.com/estoria. Verified beyond the script's own version.json
poll: prod's `index.html` references `index-3p5pzjHh.js` / `index-ByV1r8kW.css`,
matching the local `dist/`, and the deployed `sw.js` carries `cacheShell` with
`KILL_SWITCH = false`. Loaded prod in a browser: app mounts, `sw.js?v=162` is
the active worker with nothing waiting, exactly one cache
(`estoria-shell-162`), no console errors.

Ray's installed copy is still on the old worker until he takes the update
toast, which is by design — and worth noting that the *first* load after this
deploy is the last one that can hit the old shell-poisoning bug, since the fix
has to be running to prevent it.

### Drift check against SPECS

Real drift, all from this session and all corrected here:

- **§3 was missing three files** — `store/hydration.ts`, `lib/storageDurability
  .ts`, `components/Recovery.tsx` — and described `Welcome.tsx` in a bare list
  beside Lightbox and ConfirmDialog, which no longer says enough about what it
  now gates on.
- **§3 said UpdateToast sits "above every scrim (z-90)".** False since this
  commit: Recovery is 95 and ConfirmDialog went to 100. Replaced with the whole
  stacking order, top down, and the reason ConfirmDialog leads it — it is raised
  *from* the screens below it, and a confirm rendering underneath its own
  trigger is a button that appears not to work.
- **§4 had no row for any of it.** Added three: the load lock, the chooser's
  behaviour over an existing document, and the sample's arrangement.

Checked and deliberately left alone: **§9 P1 item 2** still says the footer
shows "Couldn't save — browser storage is full", which is now one of three
reasons (`storage`, `prose`, `locked`). That section is a dated record of a
2026-07-01 review with its findings marked fixed, not a description of current
state — rewriting its history to match today's code would make it useless as
history. The current behaviour is described in §2.

---

## 2026-08-15 — The caret lands where the writing stopped

Ray asked for the manuscript to open at the end of the prose instead of the
start. One effect, and the reason it was worth doing is the whole session.

### The change

`ManuscriptModal` already focused the textarea on open — the surface exists to
be written in, and making a writer click before they can type is a tax on the
one thing the modal is for. But focus alone leaves the caret at index 0. So
opening a chapter you had already written put you in front of your own first
sentence, with the last thing you wrote scrolled off the bottom: the app
focused the right element and then pointed it at the wrong end of the work.

The effect now sets the selection to the end and scrolls there explicitly. Two
details that are load-bearing:

- It reads the **textarea's live value**, not the `text` binding. The effect
  runs on the same tick the textarea mounts with the chapter's prose, and the
  end is wherever that value ends.
- The **scroll is set separately**. Moving the selection does not reliably
  scroll the caret into view — the caret would be at the end and the viewport
  still at the top, which is the same complaint with an invisible cursor.

Deps are unchanged (`[ch.id, view]`), so it keeps re-running per chapter, which
is what makes the prev/next arrows land the same way, and per view, so coming
back from View is not a dead end.

### Verified

In the running app, against the sample's chapter 01 with a 20-line manuscript:

- Open chapter → manuscript: `selectionStart` 297 of 297, `scrollTop` 95 with a
  max scroll of 95, textarea focused.
- View → Edit: same, caret at the end and scrolled to it.
- Next-chapter arrow into an unwritten chapter: caret 0, focused, empty sheet.
  No special case needed; the end of nothing is the start of it.

No console errors. `npm run typecheck` clean.

### Not done

- **View mode still opens at the top**, deliberately. Reading a chapter starts
  at its beginning; only the writing surface has a reason to jump to the end.
- No preference for this. The caret goes to the end, always. A toggle would be
  a setting for a thing nobody wants the other way.

### Drift check against SPECS

The manuscript modal's row (§4, "Manuscript: its own modal") described the two
faces, the mode memory and the word-count recompute, but said nothing about
where the caret lands — so the old behaviour was never written down either.
Added the landing rule to that row along with why it is the end and not the
start, the live-value and explicit-scroll details, and the empty-chapter case.
Nothing else in SPECS described the focus behaviour, so nothing else needed
correcting.

## 2026-08-18 — Pictures leave the five-megabyte room

Ray asked what stops the app crashing or the save file corrupting when
localStorage fills up. The honest answer was: the failure is handled well and
nothing prevents it. Handling was thorough — `setItem` is atomic so a full quota
leaves the stored document byte-for-byte intact, every write is wrapped, the
footer goes red and says so, and the load lock means a bad read can never
overwrite a good document. Prevention was missing entirely: nothing measured
headroom, and nothing capped the one input that can exhaust the quota in a
single action.

### The actual size of the problem

Not "storage is nearly full". Prose has lived in IndexedDB since the manuscript
split, where the budget is disk-proportional. The only thing squeezed into the
~5MB localStorage blob is the map — and, inlined into it as base64 data URLs,
every picture the writer has ever added. Base64 costs a third more than the file
did, so one phone photo is ~5.5MB of string: **the whole quota, in one drop**,
after which every later save fails, including the ones that have nothing to do
with the picture. SPECS §9 item 2 named this in July and suggested the fix in
the same breath.

Strip the pictures out and a large multi-book map is a few hundred kilobytes.
There is no ceiling problem left to solve.

### The change

`store/images.ts`, deliberately the same shape as `store/prose.ts`:
`splitImages` lifts `asset.src` and `book.coverSrc` out before `JSON.stringify`
sees them, `mergeImages` puts them back on load. Both hang off the top level of
a document rather than being buried in the book/version/chapter tree the way
prose is, so this is two array walks, not a recursive one.

Three decisions worth recording, because each had a tempting wrong answer:

- **Data URLs stay data URLs.** The obvious design is to store Blobs and keep
  an id in the document, resolving object URLs at render. It is also the design
  that changes what the document *is*: `contentKey` in `migrateRefsToAssets`
  hashes `src` to decide whether two assets are the same asset, `lib/sync.ts`
  diffs `coverSrc` by value, and every `<img>` would acquire a lifetime to
  manage. Keeping the document whole leaves every one of those untouched. The
  cost is a third of a picture's size, in memory only.
- **One database, one availability answer.** The DB open, the timeout, the
  stale-key rule and the raw read/write moved to `store/idb.ts`, shared by both
  payloads, and `DB_VERSION` went 1 → 2 to add the `images` store. Two separate
  databases would have let the load half-answer the only question that matters
  — reaching the prose, missing the images, and saving a document that had
  quietly lost its covers.
- **No crash pad for pictures.** The pad exists because IndexedDB is async and
  `beforeunload` is not, and it is affordable for prose because prose is small.
  A picture in the pad would be megabytes of base64 in localStorage, recreating
  on the recovery path the exact failure this removes. The exposure is a
  different shape anyway: prose is a continuous stream of keystrokes, a picture
  is one deliberate act, and a picture lost in the ~200ms window is a file the
  writer still has. There is no equivalent for words.

`proseExternal` became `payloadsExternal` and now guards both, so the
`prose-unreachable` refusal covers a document whose pictures cannot be reached.
The old key is still written beside it, purely so a build from before this
change still refuses a blob whose prose it cannot see rather than loading it
blank. The footer tells a failed picture apart from failed prose: words that
did not land are gone if the writer walks away, a picture that did not land is
a file they can pick again.

### Verified

In the dev app, on the sample project:

- A 400KB image added through the normal "+ Image" flow: the localStorage blob
  stayed at 14KB with zero `data:image` occurrences, and the picture sat in
  IndexedDB. Before this change that blob would have been ~414KB.
- Reload: the picture came back as a real data URL on a plain `<img src>`,
  decoded, 400,118 characters — the round trip through `mergeImages`.
- **Export still carries it inline.** The captured `.estoria.json` was 413KB
  with the data URL present and `schemaVersion` unchanged at 9. This is the
  Android contract: the file is exactly what it would have been before.
- Deleting the asset removed its image from IndexedDB — the stale-key path,
  no orphan left behind.
- Prose still writes to `manuscripts` after the version bump, and stays out of
  the blob.
- Forcing `payloadStoreAvailable` to false put a document written externally on
  the Recovery screen with auto-save paused, rather than blanking it.

### Not done

- **No cap on what a picture may be.** The ceiling moved; the input is still
  unbounded. A 40MB image now saves fine and bloats every export and Sync write
  instead, which the Android app also pays for. Downscale-on-import is the
  follow-up; Ray deliberately kept it out of this session so the diff stayed in
  the persistence layer.
- **Still no headroom measurement.** `navigator.storage.estimate()` is called
  nowhere. The first signal of trouble is still the failure itself — much
  further away now, but no earlier when it comes.
- **A failed save is still not retried.** `flushMap` clears `pending` before
  the write, so a rejection drops that snapshot; the next change re-populates
  it, but a failure on the last edit of a session is never retried.
- **Downgrade caveat.** A build from before this change, reading a blob written
  after it, will merge the prose and miss the pictures. `proseExternal` is
  still written so the refusal path holds where it can, but a revert past this
  commit is not free for images.

### Drift check against SPECS

- §2 "Persistence architecture" now states the invariant the split depends on:
  the document is whole above the at-rest layer.
- §3 project layout lists `store/idb.ts` and `store/images.ts`.
- §9 item 2 closed — its "consider IndexedDB as the local adapter's backing
  store" is now true of both payloads.
