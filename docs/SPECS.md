# Estoria — Specs

> Living document. This is the source of truth for what Estoria **is**, how it's
> built, and why — the current state, not the history. **Read this first.**
>
> Update it in the same session a decision is made or a feature lands: §4 for
> feature status, §9 for the fix backlog. The dated record of what happened when
> lives in [`SESSIONS.md`](SESSIONS.md) — appending there is not a substitute for
> updating the section above that the change made stale.

---

## 1. What Estoria is

**Where a novelist maps a story and writes it.** Authors arrange chapters on an
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
  **Click a card to open it** (drag still drags; a press that doesn't move is a
  click).
- **Scene** — a beat inside a chapter. Consecutive scenes are joined by a
  **connector** typed `therefore` (causal), `but` (conflict), or `and` (parallel).
- **Chapter link** — a connector between two chapters on the board, same 3 types.
- **Character / World entry** — rich reference records.
- **Asset** — a shared, book-level **note, image or to-do list** in one pool,
  linkable ("pinned") into any number of chapters and world entries. Each surface
  keeps its **own pin order**, independent of the library's order.
- **Archived** (characters, world entries and assets alike, schema v8) — retired
  from its roster/library and from every picker, so nothing new can be attached
  to it, while **everything already attached to it is kept**. The chapter still
  casts the character, still references the world entry, still pins the note;
  those attachments render dimmed and marked "Archived". Restoring is therefore
  always lossless, which is what makes archiving a low-stakes move rather than a
  soft delete. ⚠️ Under v6/v7 archiving an asset *unpinned it everywhere first* —
  the opposite rule; see §9 and the "Archive / restore (history)" row in §4.
- **Manuscript** — a chapter's **prose**, written inside the chapter modal.
  Markdown, one string per chapter. This is not an editor with a map beside it;
  it is the map with a place to write inside it, and the point is seeing your
  beats while you draft. The beats sit **beside** the prose as a guide — they do
  not divide it (see §4, "The beats are a guide, not a structure").
- **Series** — optional multi-book planning layer above the current book, with its
  own story-map (books as cards) and timeline. Navigated via a header breadcrumb.
- **Draft / version** — **per book**: each book has its own named versions, and
  each version is a **standalone fork** of the whole board (chapters, scenes,
  connectors, statuses, notes, layout). Creating a version deep-copies the
  current one; edits never leak between versions. The series bible (characters/
  world/assets) stays shared. The version selector is hidden on the series map.
- **Main version** — the version a book treats as canonical, held in
  `mainDraftId` (v7). It is a **movable marker, not an id**: the star in the
  version menu moves it, and `MAIN_DRAFT_ID` is only the seed value. The starred
  version sorts first in the menu, can't be deleted, and is where deleting the
  version you're on drops you. Nothing else follows it — export, Sync, and the
  toolbar word count all track the version you're *viewing*, and `+ Add version`
  forks the board you're reading rather than the starred one.
- **Project** — an independent `StoryDoc` (a standalone book or a whole series).
  Multiple projects live side by side in a library; you switch, create, delete,
  and merge them.

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
   write a new adapter against the same interface + swap `activeAdapter`.

What cloud adds later (and only then do we pay for it): **auth** and
**multi-device sync / conflict resolution**. Starting local does not lock us out.

**Decided 2026-07-01:** the cloud backend is the user's **own Google Drive**
(`GoogleDriveStorageAdapter`), with **Sign in with Google** for auth — see §8.
The seam is ready for it: since Session 20 both reads and writes go through
`activeAdapter` (async rehydrate, single debounced write path, save failures
surfaced in the footer). Still to do before a Drive adapter: widen
`StorageAdapter` to per-project granularity (§9 item 1).

---

## 3. Project layout

```
estoria/
├─ index.html                 # Vite entry, loads Google Fonts
├─ vite.config.ts             # React + Tailwind plugins, "@/" alias, build-info +
│                             #   version.json plugins (§ Session 42)
├─ tsconfig*.json             # app + node TS projects
├─ scripts/deploy.sh          # `npm run deploy`: build → portfolio repo → verify live
├─ docs/SPECS.md              # ← you are here: current state, §§1-9
├─ docs/SESSIONS.md           # dated session log (history; §N refs point here)
├─ docs/archives/            # closed records — read for background, don't work from
│  ├─ REVIEW-FINDINGS.md     #   3 code reviews + 1 task brief, all items closed
│  ├─ manuscript-mode-brainstorm.md  # why manuscript mode is shaped as it is:
│  │                         #   the rejected alternatives, kept after the build
│  │                         #   brief itself was folded into §4 and deleted
│  └─ manuscript-mode-v3-repositioning.md  # the v3 rename, closed
├─ Story Mapping WebApp Prototype/   # design reference (not built on)
└─ src/
   ├─ main.tsx                # React root
   ├─ App.tsx                 # layout: Toolbar + Board + Footer + overlays; theme effect
   ├─ index.css               # Tailwind import + design tokens (@theme)
   ├─ types.ts                # StoryDoc and all model types  ← single source of truth
   ├─ vite-env.d.ts           # Window.__ESTORIA_BUILD__ typing
   ├─ data/
   │  ├─ sampleStory.ts       # "The Drowned Map" default document
   │  └─ emptyStory.ts        # blank document for a new project
   ├─ store/
   │  ├─ useStore.ts          # Zustand store: doc + UI state + all actions
   │  ├─ persistence.ts       # StorageAdapter, the two-stream save (map -> localStorage,
   │  │                       #   prose -> IndexedDB), normalizeDoc, save-status, file I/O
   │  └─ prose.ts             # manuscripts at rest: the IndexedDB store, the doc
   │                          #   split/merge, and the synchronous crash pad
   ├─ lib/
   │  ├─ layout.ts            # board layout, auto-arrange, fit-to-content, scene grids
   │  ├─ sceneFit.ts          # SCENE_TEXT_MAX + measured card capacity: how wide a
   │  │                       #   timeline scene card must be to show its text whole
   │  ├─ markdown.ts          # *map* export builder (Obsidian), import prompt + parser
   │  ├─ manuscript.ts        # prose: markdown block parsing, word count
   │  ├─ manuscriptExport.ts  # *prose* export: .md / .txt / standard-format .docx
   │  ├─ inline.ts            # inline-markdown tokenizer, shared by the reading
   │  │                       #   view and the .docx runs so they cannot drift
   │  ├─ zip.ts               # minimal store-only ZIP writer (a .docx is a ZIP)
   │  ├─ templates.ts         # story-structure skeletons (34 cards, 3 facets)
   │  ├─ sync.ts              # cross-app sync: fingerprint, 3-way compare, file history
   │  ├─ backup.ts            # folder handle + rotating backups (File System Access)
   │  ├─ drafts.ts            # version-fork helpers (clone/stash a board)
   │  ├─ entities.ts          # character/world lookup helpers
   │  ├─ chips.ts             # how many cast avatars a card shows before "+n"
   │  ├─ refs.ts              # asset-backed pinned-ref resolution (asset-backed
   │  │                       #   since v5; resolves to-do `items` too), link
   │  │                       #   counting, `findAssetPins` (every place an asset is
   │  │                       #   pinned, across books + versions)
   │  ├─ prune.ts             # sweep records left with no content in them
   │  ├─ ids.ts               # uid() — shared by the store and draft records
   │  └─ files.ts             # file → data URL reading
   └─ components/
      ├─ Toolbar.tsx          # identity/rename, File menu, view + version controls
      ├─ Board.tsx            # story map: pan/zoom/drag, cards, connectors
      ├─ Timeline.tsx         # chapter rail + scene-flow pane (scrolling, no camera)
      ├─ SeriesMap.tsx        # series-level board: book cards + links
      ├─ ChapterDetail.tsx    # chapter modal: scene flow + act controls + manuscript
      ├─ ManuscriptSheet.tsx  # the writing pane, scene carousel, drift bar, pull-from-version
      ├─ ProsePane.tsx        # prose rendering, shared by the timeline and the editor's View
      ├─ Footer.tsx           # autosave status, Sync button, folder icon
      ├─ SyncHistoryPopover.tsx / SyncFileList.tsx   # file history + restore
      ├─ Welcome.tsx · Lightbox.tsx · ConfirmDialog.tsx
      ├─ ui/                  # Overlay (Scrim/Drawer/SizeButton/CloseButton/stop),
      │                       #   Popover, RefList, ViewToggle, ExpandableTextarea,
      │                       #   AssetLinkPicker
      ├─ panels/              # CharactersPanel, WorldPanel, NotesPanel — modal
      │                       #   `Drawer`s, one at a time (§4 "Panel sizes")
      └─ modals/              # Export, Import, Templates, Projects, NewBook,
                              #   Backups, SyncConflict, About
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
- **No em dashes in anything the user reads** (labels, tooltips, empty states,
  error and status messages, template blurbs). Use a period, a comma,
  parentheses, or the app's existing `·` separator. Session 54 swept 21 strings
  that had drifted; the rule is house style, so re-adding one is a regression.
  Code comments and these docs are exempt.
  **One deliberate exception, and it is not copy:** the em dashes emitted by
  `lib/markdown.ts` are **field separators in the export format**
  (`- **Name** — role | archetype`). The importer parses them
  (`markdown.ts:272`, `:331`), the AI import prompt documents them literally,
  and the Android app reads the same files, so "cleaning" them would desync
  every vault already on disk. Leave them.

---

## 4. Feature status

Legend: ✅ done · 🟡 partial · ⬜ not started

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Board | Pan / zoom / drag cards | ✅ | Wheel zooms; drag rearranges; **a click opens the chapter** — a press that moves is a drag, a press that doesn't is a click, and a click that jiggled puts the card back. The chapter modal ignores backdrop dismissals for 400ms after opening so the old double-click habit can't close it on the way in. Map-only since Session 51: the timeline is its own component, so `Board` no longer branches on `view`. |
| Board | Reorder chapters | ✅ | Drop a card on another → confirm → resequences **and** auto-arranges so threads stay clean. Connector chain rebuilt to follow the new order. **A drop always lands the card *before* the one it hit.** Until 2026-08-05 the side was read off the drag direction (`dragged.x > target.x`), which compared the dragged card's *final* position against the target it was sitting on top of — so the same gesture onto the same card could land on either side of it depending on a few pixels of overlap. Which way a card was carried in from says nothing about where its author wants it. **Board only** since Session 51 — the timeline dropped drag-to-reorder when it became a reading surface. |
| Board | End-of-book drop slot | ✅ | **2026-08-05.** Since a drop always lands *before* the card it hit, the tail of the book has no card left to aim at — so it gets a target of its own: a card-sized dashed ghost reading **End of book**, one `GRID_GAP_X` past the last chapter that isn't itself moving. Drawn only once a drag has actually moved (every press sets `dragId`, so keying it off that alone would flash a ghost on each click) and **suppressed when the moving cards are already the tail**, where the reorder would be a no-op. The store needs nothing new: "at the end" is `after: true` against the last chapter left standing, so `reorderChapter` / `reorderChapters` keep their signatures. A card under the cursor wins over the slot. Same slot on the series map (**End of series**), map view only — the series timeline reorders by live reflow, where dragging past the last card already lands at the end. |
| Board | Connectors (therefore/but/and) | ✅ | SVG curves, colored by type, per-version (each version forks its own links). |
| Board | Auto-arrange | ✅ | Decaying-jitter grid, floored so it approaches straight but never a rigid lattice. |
| Board | Add chapter | ✅ | |
| Timeline | Read the story continuously | ✅ | **Session 51, web-app only** (deliberately not mirrored on Android — see §8). A chapter **rail** beside (vertical) or above (horizontal) a **scene pane** that renders each chapter's scene flow, so a book reads start to finish without opening anything. The rail keeps the familiar chapter cards, act bands and curved type-coloured chapter links — though the **vertical** rail routes those curves *down the column* (bottom edge → top edge) rather than looping out to the sides as the board does, because the board's sweep needs about twice a card's width in horizontal room and a fixed-width rail hasn't got it; the horizontal rail keeps the board's exact shape. Card gaps in the rail are wide (52px) because the curves are drawn in them. Which chapter you're on shows twice: an active ring on the rail card and a sticky header in the pane. Scroll sync is two-way — scrolling the pane moves the highlight and pulls the rail along; clicking a rail card jumps the pane. |
| Timeline | Vertical / horizontal layout | ✅ | The ↓ / → toolbar buttons are unchanged. Vertical puts the rail on the left and fills each scene grid row-major; horizontal puts the rail on top and fills column-major, so beats always advance along the axis the pane scrolls. |
| Timeline | Scene grid fits the space | ✅ | `sceneMetrics` picks its track count against a **minimum** node size (`TL_NODE_MIN_W/H`) and then grows the nodes into the leftover, capped by `TL_NODE_MAX_W/H`. Choosing the count against a *fixed* node size instead strands the remainder — the design prototype measured a 833px pane fitting one 208px column and wasting 293px. Measured on the shipped view: a 1256px pane renders a 1211px canvas (**96%**) with 333px nodes. Re-fits on resize (`ResizeObserver` on the pane) and is computed per chapter, so chapters with different scene counts get different column counts in the same pane. `sceneGrid` then *places* scenes on those tracks — the split exists because the caller has to know the column width before it can work out how many columns a scene's text needs. |
| Timeline | A scene card never cuts its text off | ✅ | **Session 56.** Cards keep a **fixed height** and grow **sideways**: a scene that will not fit one column takes two (`sceneSpan` in [`lib/sceneFit.ts`](../src/lib/sceneFit.ts), placed by `sceneGrid`). Rows therefore stay level and no vertical space is wasted, which is the point — the timeline exists to be read straight through, and text that stops mid-word with no ellipsis, fade or tooltip reads as a finished sentence rather than a truncation. **The bug this fixes was a wide-screen one, counter-intuitively:** more columns means *narrower* cards, so on a 1280px window 50 of the 421 scenes in the reference book clipped (12%), against 4 at half screen where a single column grows to 336px. Now 0 clip on a wide screen and 43 cards (10%) take the double width. Capacity is **measured off a hidden DOM probe** mirroring the real card, not a characters-per-line guess, because it depends on font, padding and the label line — all styling that drifts. Memoized per pane size, so it costs a handful of probes per resize, not one per scene; the exact-text check (`fitsAt`) runs only for the few that fail the cheap conservative test. Column fill (the horizontal timeline) ignores spans: there the pane is height-bound and a wide card would break the column, so it leans on the cap alone. |
| Detail | Scene length cap | ✅ | **Session 56.** `SCENE_TEXT_MAX` = **200 characters**, set by the *narrowest* place a card still has to fit whole: a half-screen window, where the pane holds one ~336px column and a card cannot widen at all (that card shows ~205). A wide-screen two-column card holds ~344, with room to spare. **Enforced on input, never on stored data** — deliberately *not* `maxLength`, which makes the browser drop the keystroke silently, and a refusal the writer cannot see is the one thing this cap must not do. `writeScene` refuses it and says so: the card border goes red (`--but`) and nudges 3px once via `element.animate` (not a CSS class — replaying a class needs a frame callback between removing and re-adding it, and frame callbacks are paused in a hidden tab, so a held key would land its refusals silently). Reduced motion keeps the red edge, drops the nudge. The counter is hidden until it matters, then red, at `>= max`. |
| Detail | Scenes written before the cap | ✅ | **No migration, by design — nothing is truncated and no schema changed.** Each scene's ceiling is `max(SCENE_TEXT_MAX, its current length)`, so a pre-cap scene can be shortened or left alone but never grown, and ordinary editing of it still works. (A plain `maxLength={200}` gets this *wrong* in a way worth remembering: it blocks **all** insertion once the value already exceeds it, freezing the scene entirely.) On the timeline such a scene still widens to show what it can and carries the `N / 200` count in its top-right corner, on the label line, so it costs no layout space. Because `StoryDoc` is untouched this is invisible to the Android app and is **not** a cross-app event. |
| Timeline | Open a scene for editing | ✅ | Clicking a scene node opens the chapter modal **on that scene** — scrolled into view, textarea focused, border flashed for 1600ms (`focusScene` in the store; transient, never persisted). Rail cards jump rather than open, so a scene-less chapter's empty canvas is itself the way in. The fade timer lives in a **ref, not the effect's cleanup** (fixed Session 56): the effect consumes `focusScene` as it runs, which changes its own deps and immediately re-runs it, and a cleanup-held timer was cancelled by that re-run while the early-return guard stopped a replacement being scheduled — so the green ring never faded and sat on the card for as long as the modal stayed open. |
| Detail | Manuscript: its own modal | ✅ | **The prose lives in the map, on the chapter's second face.** One chapter, two modals: the **story map** (`ChapterDetail` — scenes, cast, world, notes, refs) and the **manuscript** (`ManuscriptModal` — the writing pane with the chapter's beats in a rail down the left). A button on the meta line both of them share swaps between the two without closing the chapter, naming where it takes you rather than what you are looking at: *Manuscript* on one, *Story map* on the other. Which one you were last in is remembered globally (`chapterMode`), not per chapter, because a drafting session opens every chapter to write in and a planning session opens every chapter to plan in. `ChapterModal` picks between them and owns the word-count recompute, which belongs to the open chapter rather than to either face of it: left in the manuscript modal, switching to the story map would unmount it and take the pending 700ms timer with it, so the count would stop updating on exactly the click that goes to look at it. Since 2026-08-06 the timer is also **flushed rather than dropped** when the chapter closes or the arrows step to the next one, which is the same failure at the other edge. **It was a collapsible section of the chapter modal until this**, and the reasons it stopped being one are the next row. |
| Detail | Why the manuscript is a modal, not a section | ✅ | **A writing surface and a planning surface were competing for one scrolling column.** Four separate complaints turned out to have one cause: beat cards too tall, the section's controls scrolling out of reach, an empty sheet making the modal scroll with no visible scrollbar, and moving between the canvas and the prose feeling messy. Each was patched individually and the cause was not, so the chapter modal ended up stacking **three sticky layers** (its own header, the manuscript header, the beat guide) over **two nested scroll contexts** (the modal and the textarea), and every fix added another rule to that pile. Splitting it out deleted all of them at once, along with `manHeaderH`, `sheetView`, the sticky wrapper, and seven `manuscriptOpen` conditionals that had been hiding the summary, the act stepper, Characters and World whenever the section was open — the story map modal is now unconditionally itself again. **Three shapes carry the fix and should not be undone:** the manuscript modal is a **fixed** `h-[92vh]`, not a maximum, so an empty chapter and a finished one are the same size and there is no page scroll for a scrollbar to go missing from; the rail and the prose scroll **side by side rather than nested**, so neither needs to be sticky; and the rail's cards **may grow downwards**, which the horizontal strip's could not (a card that grew down made the guide as tall as its wordiest beat and pushed the writing off screen), so a beat at the 200-character cap shows whole instead of in one of three width steps. The rail is on the **left**, matching the timeline's vertical rail, so the beats do not change sides depending on where you are. It is **inert except for one thing**: clicking a beat opens that scene on the story map through `openChapterAtScene`, which forces `chapterMode` back to `"map"` — so the button only has to name a scene, and the story map stays the single place scenes are edited. This does not break the original premise ("the map, with a place to write inside it") or the locked decision against a fourth top-level view: it is still entered from a chapter and still shows the beats while you draft. |
| Detail | The beats are a guide, not a structure | ✅ | **The prose is not bound to the scenes**, and this is a reversal worth knowing about. An earlier design separated scenes with `***` thematic breaks and kept the two in step: the carousel followed your caret, each beat knew whether it had been written, unnamed beats borrowed their opening line, and a drift bar reconciled the two whenever a scene was deleted or reordered. It was **dropped** — the app *seeded* those breaks, so opening a fresh nine-scene chapter greeted you with eight rows of `***` and nothing between them. The argument for the marker was that it is what a novelist types anyway; pre-filling it is the app typing it for you, which is the opposite thing. Adding, deleting or reordering a beat now changes the map and leaves every word where it is. That cost per-scene written state, borrowed labels, and roughly 300 lines of sections, drift and reconciliation — and the premise survives intact, because seeing your beats while you draft never required the beats to own the paragraphs. |
| Detail | Markdown in, markdown out | ✅ | You write markdown and `View` renders it: bold, italic, bold-italic, inline code, headings, blockquotes, bulleted and numbered lists, and thematic breaks as a plain rule. `parseBlocks` (block structure) and `inlineTokens` (inline) live in `lib/` and are used by **the reading view and the `.docx` exporter alike**, so a heading is a heading and a word emphasised on screen is emphasised in the file an agent opens. |
| Timeline | Read the book as prose | ✅ | A `Scenes / Manuscript` **pane toggle** beside the ↓ / → control, not a fourth view: same rail, same cards, same active ring, same two-way scroll sync — only the pane's contents change. Renders through `ProsePane`, the same component the editor's View mode uses. The toggle says **Manuscript**, not Prose: one word for one thing, matching the chapter modal and the export. Vertical fills the pane (the rail already takes the left of the window); horizontal keeps a fixed column, because there the pane scrolls sideways and every chapter needs the same width. **Windowed** since 2026-08-02 (g): only the chapter you are reading and its two neighbours either side render their prose, because rendering all of them put 14,602 nodes in the DOM and froze the main thread for 1,242ms on one 300k-word book. Every chapter's *header* still renders — the rail's two-way sync and `jumpTo` read each group's offset — with a spacer beneath it holding the chapter's height, measured once it has been on screen and estimated from `words × px-per-word` before that (cold error 0.2%). **`Cmd+P` still prints the whole book**: `beforeprint` renders every chapter and `flushSync` is what lands it before the dialog snapshots the page, since the print stylesheet *is* the PDF route and a windowed page would print a book with holes in it. `jumpTo` `flushSync`es the mode change before measuring, or it would aim at spacer heights one render away from changing. |
| App | Word count is derived | ✅ | `words` is a **cache of the manuscript**, recomputed on the save rhythm and written back — still a stored field, because eight places read it and deriving at those call sites would put a manuscript scan inside every render. Counting strips markdown (`**tension**` is one word) and ignores `***`. **One definition, `syncChapterWords` in `lib/manuscript.ts`**, called by every path that can change prose — the debounced typing recompute, a manuscript pulled from another version and its undo, a structure-only fork, and every document arriving through `openDoc` / `replaceDoc` (`reconcileWords`, at the door rather than at hydration, where `mergeProse` has just restored counts this app already wrote). Before 2026-08-06 only the first of those existed, so the board, the toolbar, the version menu and the series map all read one cache that five other paths could leave behind. **Promote, don't overwrite** survives: the first real prose moves the old number into `target`, because `words` used to mean *planned* (the AI import prompt says "estimate from scene length"), so cards read `1.2k / 3k words`. A chapter with **no manuscript is never touched** — a pre-prose book's hand-typed count is not a number to recount. **Emptying one now reads 0**, where it used to freeze at its last count: `manuscript` stays `undefined` until someone types, so a defined-and-empty one means the words were deleted, and the plan is already safe in `target`. |
| Export | Manuscript (prose) | ✅ | **A second export with a different purpose**, tabbed apart from the map export and never merged: that one is Obsidian-shaped structure, this one is prose for a person. `.docx` in **standard manuscript format** (12pt Times, double spaced, 1" margins, half-inch indents except the first paragraph of a scene, title page, `#` scene breaks, running `Surname / Title / page` header) — the one export agents and beta readers expect and Obsidian cannot produce. Plus `.md` / `.txt`. `StoryDoc` gained an optional `author` for the title block; **no name is invented when none is given**. A ZIP writer (`lib/zip.ts`, stored not deflated) rather than a dependency. A markdown thematic break in your prose exports as the centred `#` standard format uses for a passage break, because that is what the reading view shows — but nothing inserts one for you. |
| Export | PDF, via print | ✅ | **Deliberately not an exporter.** `Cmd+P` from the timeline's Prose mode or the editor's View mode prints a typeset reading copy, through an `@media print` block in `index.css`. A PDF writer would be a second implementation of the reading view that could drift from it; this *is* the reading view, on paper. Screen-only furniture (chrome, hover affordances, the scroll spacer, unwritten scenes) is marked `data-print-skip`. |
| App | Versions carry their prose | ✅ | Prose forks with the version, exactly as scenes do — "version" keeps meaning a version of the book. So: forking **asks whether to take the writing**, but only when there is prose to copy (with none, both answers are identical and the prompt is just a click); the version menu shows **word counts**, so a fork's cost is visible before you pay it; and a chapter can **pull its text from another version** (`Also written in …`), behind a confirm naming the version and the count, with one undo. Deliberately **not a merge engine** — merging prose is a hard problem and a bad one to half-solve. |
| Detail | Scene flow canvas | ✅ | Drag-to-reorder scene nodes (live grid preview + edge auto-scroll), long-press Add scene to drop it in place, SVG connectors, click pill to cycle therefore/but/and, add/edit/delete scene, auto-arrange, **move selected scenes to another chapter** (Beginning/Middle/End). |
| Detail | Scene layout remembered per canvas size | ✅ | The expanded and collapsed canvases fit different column counts, so each keeps **its own layout** (`scenePos` / `scenePosCompact`, v6). Toggling size swaps layouts instead of re-arranging — which is what used to throw the arrangement away. Auto-arrange tidies only the size you're looking at; structural edits keep both in step. |
| Detail | Each modal keeps its own size | ✅ | Two flags, not one. `sceneFlowExpanded` drives the scene canvas and the story map modal's width; `manuscriptExpanded` drives the manuscript modal's. They were one flag while the manuscript was a section, because both `Expand` buttons widened the same modal and two independent toggles with one shared consequence meant expanding the manuscript silently gave the canvas more room. Separate surfaces make them genuinely separate preferences: a writer who wants the page wide has no opinion about the scene canvas at that moment. **`sceneFlowExpanded` keeps its name deliberately** — it is not only a width, since `scenePosKey` uses it to choose between `scenePos` and `scenePosCompact`, which are persisted *document* data, so renaming it would either drag a doc migration behind it or leave the flag and the layout key disagreeing. Now that it drives only the canvas, the name is no longer wrong. |
| Detail | Reference material is tabbed | ✅ | Characters, World details, Chapter notes and Pinned references were four stacked collapsible sections, two above the scene canvas and two below, any number open at once — so the canvas could end up anywhere on a long scroll and a chapter opened to look at its scenes opened on its cast instead. Now **one tab strip above the canvas and one panel under it** (`ChapterTab`), so the canvas is always in the same place. Clicking the open tab closes it, which keeps the click-to-show-and-hide the sections had, and `null` (all closed) is a real state and the default. Counts ride on the tab; an empty tab shows no number at all rather than a grey `0`, and Chapter notes has nothing to count so it gets a dot when written in. **Story map only** — the manuscript modal shows the beats and nothing else, because reference material beside a writing surface is the crowding this branch exists to remove. `SectionHeader` and `chapterSectionsCollapsed` went with the change; Scene flow keeps its own chevron. |
| Detail | Move several scenes at once | ✅ | Move scenes mode selects any number of beats, and they can go **to another chapter or stay in this one**. `moveScenesWithin` is a separate action from `moveScenesToChapter` rather than a loop over `reorderScene`: each single hop renumbers everything after it, so the result of "move 2 and 5 to the front" would depend on the order the hops ran in. **`atIdx` counts against the scenes left after the selection is lifted out**, not the original list — the only unambiguous reading, since an index into the original can point at a scene that is itself moving, and it is what beginning / middle / end mean to someone looking at the chapter. Two ways in: the destination picker leads with **This chapter · reorder** (hidden when every scene is selected, where there is nothing to position against), and **dragging any selected card moves the whole block**. The drag arms on press and only becomes a drag once the pointer moves, because in move mode a click on a card toggles its selection and a drag that started on mousedown would deselect the card it was picked up by. The block's ghost is one card standing in for several; the selection follows the block to where it lands, since selection is by index and would otherwise highlight whatever now sits at the old positions. |
| Board | Multi-select chapters | ✅ | **Modifier-click** (cmd / ctrl / shift) a card to add it to a selection, rather than a mode button: the board has no toolbar of its own and a press on a card already means three things (click to open, drag to move, drop to reorder), so a modifier is the one addition that needs no arbitration. A floating bar names the count and offers **Delete** and **Clear**; a press on bare board clears. **Reorder**: dragging a *selected* card onto an unselected one moves the whole selection **before** it, keeping the order the chapters were already in — dragging an unselected card still moves just that card, so an idle selection elsewhere changes nothing. The block can go to the end via the end-of-book slot, which anchors past the last chapter *not* in the selection. **Delete**: one confirm naming the chapters, and the store refuses to empty a book (the bar says so rather than letting a confirm run and do nothing). Both are single store actions (`reorderChapters` / `deleteChapters`), not loops over the single-chapter versions, which renumber and re-chain on every call — the survivors are re-chained once, at the end. |
| Board | Drop target is hit-tested at release | ✅ | The reorder-on-drop hit test lives in a coalescing `requestAnimationFrame`, and `onUp` cancels any pending frame — so a drag ending in the same frame as its last move never ran one, and the drop target could be a frame stale or never set at all on a quick flick. Release now re-tests against the card's final position rather than trusting the ref. Found while building multi-chapter reorder, which rides the same drop path. |
| Toolbar | New chapter / Auto-arrange are board-only | ✅ | Neither does anything the timeline can show: Auto-arrange lays out free-floating board cards and the timeline's rail is an ordered list with no positions to arrange, while a new chapter would be appended somewhere off screen. The same rule the timeline already followed when it dropped drag-to-reorder on becoming a reading surface. |
| Board | Card meta redesign | ✅ | Bottom row reads "N scenes · N.Nk words"; character avatars moved to the top-right; pinned-notes count dropped (board + timeline rail). The avatar stack is **capped at 7 slots** (`lib/chips.ts`) — a bigger cast fills six and turns the seventh into a muted **`+n`** counter, tooltipped with the hidden names, instead of running the row off the card. Seven is the narrowest card's budget (the horizontal rail's 234px), so board and rail cap alike. |
| Detail | Edit title / summary / status | ✅ | Inline; status picker Idea/Draft/Done. |
| Detail | Act +/- controls | ✅ | |
| Detail | Pinned refs | ✅ | Add/link/rename/delete note, image + to-do refs; asset-backed since v5. Content edits write through the store (`updateChapterRefAsset` / `updateWorldRefAsset`) rather than a caller-resolved `updateAsset` — resolving `refId → asset` from a render closure dropped keystrokes typed in the moments right after a draft committed. |
| App | Reorder pinned resources | ✅ | Grip-drag rows (pointer-based, like every other drag in the app) **or type a position number** — in the shared library, on a chapter, and on a world entry. Both controls sit **at the head of the row**, grip then number then the kind icon (Session 49; list view used to park the number on the right, beside the expand caret, while card view already led with it). The draft row has neither, so it carries a 56px spacer to keep its icon on the same line as every saved row. Each surface owns its order: `reorderAsset` (counts non-archived, leaves archived slots alone) / `reorderChapterRef` / `reorderWorldRef`. |
| Notes | Where a note is pinned + jump | ✅ | Expanding a library item lists every pin as a button, in the same compact form as a character's "Appears in" — just `Ch N ↗`, with the chapter name in the tooltip. Pins outside the loaded board are **grouped** under one small heading rather than repeating the location on each chip. That heading is **the user's own names, not a fixed label** — `pinWhere` builds it as the version's name, prefixed with `bookTitle · ` only when the project has more than one book. So a note pinned into a version called "Template addition" gets a heading reading exactly that, sitting between "Pinned in" and the Archive/Delete row. Worth knowing when reading a bug report: unexplained text in that block is usually a version name, not chrome (Session 49 — it was mistaken for a stray label once). Clicking switches book and version through the normal stashing actions, closes the panel and opens the chapter (`jumpToChapter`); world pins sit under a "World" heading and open the World panel on that entry (`jumpToWorldEntry`). Data from `findAssetPins`. |
| App | Archive / restore | ✅ | **One rule for characters, world entries and assets** (schema v8): archiving flags `archived` and touches *nothing else*. The record leaves its roster/library and every picker, so it can't be attached to anything new, but every casting, reference and pin it already has is kept and renders dimmed (`ARCHIVED_DIM`, 50%) with an "archived" tooltip or an "Archived" caption. Restore just clears the flag, so it is always lossless. Each panel lists its archived records under a collapsed "Archived · N" shelf (`ui/ArchiveShelf.tsx`, shared by all three) with Restore and a Delete the panel confirms. Archive confirms count castings/references **across every version and book** (`countCharacterCastings` / `countWorldReferences` / `countAllAssetLinks`) and say so out loud, because the card above them counts the loaded board only and the two numbers differ often. |
| Notes | Archive / restore (history) | — | Until v8 archiving an asset ran the same five-location unpin sweep as delete, so an archived asset was attached to nothing by construction and restore brought it back bare. Assets archived under the old rule stay unpinned: the pins were dropped from the saved document at archive time and no migration can recover them. So a note archived before v8 restores empty while one archived after restores whole — expected, not a bug. |
| Notes | To-do lists as a pinnable resource | ✅ | Schema v6 `TODO` asset with `items[{id,text,done}]`: checkboxes, add/remove tasks, "N/M done" in the row and library caption, pinnable into chapters and world entries like a note. Exported as real markdown checkboxes (`- [x]`), blank lines omitted. The add row reads **+ Note · + To-do · + Image** everywhere `RefList` appears. **Enter inserts the next task directly below the one you're in and moves the caret into it** (Session 53); "+ Add task" appends to the end and focuses that. **Backspace in an *empty* task deletes it and merges back into the one above, caret at the end** — the undo of that Enter. It only fires on the *first* row's terms: with text in the field Backspace stays an ordinary character delete, and on the top row it does nothing (nowhere to merge into), which is also what stops a held Backspace from chewing through the list. The ✕ remains the way to remove a top or non-empty task. Both views share one `checklist` helper, so the keyboard behaves the same in cards and rows. |
| App | Remove vs. archive vs. delete | ✅ | Session 47b, extended in Session 55: one meaning per control — an **✕ detaches** (chip off a chapter, note unpinned from a chapter/world entry; confirm button says "Remove"), a labelled **Archive** retires without destroying (keeps every attachment, reversible), and a labelled **Delete** destroys — "Delete character", "Delete entry", and plain "Delete" in the shared library, where the confirm is what names the blast radius: "Delete this note everywhere?". Archive and Delete sit side by side on the expanded card in all three panels, **Archive first**, matching the order the shared library's destroy row has always used — the reversible action reads before the destructive one. (Session 55 shipped the panels the other way round and it was caught reviewing the spec against the code.) `RefList`'s `removeMode` prop picks which affordance a list gets; only the library passes `destroy`. |
| App | Nothing saved until typed | ✅ | Session 47: "+ Add character / world entry / Note / To-do / Image" open a **draft** card that isn't in `doc` (a to-do counts as typed on its title *or* a task's text) — the record is created by the first keystroke (`charDraft`/`worldDraft` in the store; `RefList`'s own draft row). So a blank record is never saved, listed or castable. `lib/prune.ts` sweeps records *emptied later* (and pre-existing blanks) on the same panel/modal close, clearing their ids from every chapter. |
| Characters | List + expand detail | ✅ | |
| Characters | Add / inline edit | ✅ | "+ Add character" opens a blank **draft** card; the character exists once you type (Session 47, superseding Session 27's "new entries start empty"). Every field editable in the panel. |
| World | List + expand detail | ✅ | |
| World | Add / edit / refs | ✅ | Name/category/desc/notes inline; refs via the shared `RefList`. |
| Notes | Story notes editor | ✅ | Auto-saved, in export. |
| Templates | Insert / replace skeletons | ✅ | 33 structures + blank starter (34 template cards), every structure carrying per-chapter writing prompts; incl. 9 life-story arcs and 14 genre beat sheets (4 of them magical realism, Session 50); facet filter bar. The card's tag pill is **pinned to the right edge**, not trailed after the name (Session 54) — the name is what varies in length, so trailing it put the tag in a different place on every card, and on a two-line name it squeezed the pill until its own text wrapped. `items-start` keeps the tag on the name's first line; `shrink-0` is what stops the pill breaking. |
| Import | AI prompt + markdown parse | ✅ | Prompt copy, drop-to-parse, summary card, opens as a new project. Parser tolerates AI drift (Session 43). Validation still only errors on 0 chapters. |
| Export | Markdown (Obsidian) | ✅ | Copy + download. |
| Export | Project file (.json) | ✅ | Save + "Open file…" in the Projects modal (Session 9). |
| Series | Planner view + mode toggle | ✅ | Book cards editable in place (title, premise, status, cover, link labels). |
| Series | Add book / reorder / auto-arrange | ✅ | Toolbar "+ New book" and "Auto-arrange" (series map only). Reorder via grip handle: map drop → confirm → resequence + re-arrange; timeline drag → live reflow. A map drop lands the book **before** the card it hit, with an **End of series** slot past the last book for the tail — same rule as the chapter board. The map drop also **re-tests at release** now (2026-08-05), instead of trusting a ref only written inside the coalescing rAF; it had the same frame-staleness the board fixed when multi-chapter reorder landed (see the "Drop target is hit-tested at release" row), and the new end slot would otherwise miss a quick flick. |
| App | Panel sizes | ✅ | Characters / World / Notes render through the shared **`Drawer`** in two sizes, toggled by an Expand/Collapse button and remembered (`panelExpanded`): **side panel** — the 460px right-hand column behind the usual dimmed `Scrim`, so the app behind it is greyed out and inert and a backdrop click closes it; **full screen** — the same panel filling the viewport, content capped at 1180px and centred. |
| App | One panel at a time | ✅ | The scrim covers the toolbar, so a second panel is unreachable by pointer — a click there closes the open one instead. `setPanel` also enforces it in state for the paths that open a panel from *inside* another surface (a draft started from the chapter modal, a note's world-pin jump), and re-opening the panel you're already in deliberately does **not** sweep the draft you're typing into. |
| Characters / World | Appears in → jump to chapter | ✅ | A character's "Appears in" chips, and a matching list on world entries, are buttons: clicking closes the panel and opens that chapter (`jumpToChapter`). Scoped to the loaded board, matching the "in N chapters" line above them — unlike a note's pin list, which spans books and versions because the asset library does. **Three scopes now coexist on one card and they are meant to differ:** "Appears in" and "in N chapters" count the loaded board, the archive confirm counts every version and book (`countCharacterCastings`), and a note's pin list spans the library. The archive confirm names its scope in the sentence for exactly this reason. |
| App | Light/dark theme | ✅ | `data-theme` swap on the root repoints the tokens in `index.css`; Tailwind reads them through `@theme`. **Dark is its own lightness ladder, not an inversion of light** (2026-08-04): same warm brown hue at low chroma, floor at OKLCH L 0.24 rather than near-black (a black background reads harsh against a design whose premise is warm paper), and a small +L step per surface — bg 0.24 → panel 0.28 → card 0.31. Ink lands at L 0.90, not white. Accents reuse their light hue with L raised ~8 points to clear the lighter floor. **`chip` sits between bg and panel in both themes**, because it is the recessed trough a control group sits in and `hover:bg-card` lifts out of it; putting it above `card` makes the resting state louder than the hover. Two known trade-offs carried deliberately: `rule` is lighter than `line` in dark and darker in light, so dividers read heavier than borders there, and `faint` on `card` measures 2.85:1, just under the 3:1 floor. **The toolbar's control is the portfolio site's button** (2026-08-05 b): a 36px transparent circle with a hairline `rule` border and a 15px Feather moon (light on) or sun (dark on), hovering to a darker border, `ink` glyph, and `card` fill over 200ms — Estoria ships inside that site at `/estoria`, so the two chrome bars should read as one product. Its `aria-label` names the action ("Toggle dark mode"), not the current state. When the toolbar is too narrow, theme collapses into the ⋯ menu as a labelled row instead, where stating the current state is right. |
| App | Drafts (main/alt) | ✅ | Standalone forks since v4 (2026-07-17): toggle swaps the whole board (chapters/scenes/links/notes); add = deep copy of the current version. **Which version is "main" is chosen by the user** (v7, Session 54) — a star per row in the version menu writes `mainDraftId`. Before this, `"main"` was a hardcoded id fixed at seed time, so a writer whose real book lived in a fork got the amber "changes stay in this version" banner on their actual work and could not delete the empty stub. Promotion is a **relabel only**: no board is copied or swapped, which is what keeps pinned refs (they record a draft id) pointing at the text they were pinned to. The demoted version becomes ordinary and deletable. `resolveMainDraftId` pins the marker to a version that exists, defaulting a missing pointer to the seed id — so pre-v7 files behave exactly as they used to. |
| Persist | Local auto-save | ✅ | Via zustand persist → LocalStorageAdapter (debounced; failures surfaced in footer). |
| Persist | Cross-app Sync + rotating backups | ✅ | Footer "Sync" + folder icon (File System Access API). Reconciles with `<slug>.estoria.json` in the Estoria folder (shared with the Android app), writes a timestamped backup on every sync (newest 5 kept), auto-mirrors auto-saves into the file (fast-forward only). Folder icon opens the file history popover (live/backup/conflict badges) with undoable per-file Restore. Hidden on Firefox/Safari/embeds (no folder API there — local auto-save + export menus only). Replaced the "Back up" button 2026-07-03; see §8. |
| Persist | Project / book renaming | ✅ | `EditableName` in the toolbar identity line — series ▸ book breadcrumb, both editable. |
| App | Version / build stamp | ✅ | About shows `v… · build N · sha · time` from `window.__ESTORIA_BUILD__`; `npm run deploy` verifies the commit is live (Sessions 41–42). |

---

## 5. How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run typecheck  # types only
npm run preview    # serve the production build
npm run deploy     # build + publish to www.labrarf.com/estoria, then verify it's live
```

`deploy` refuses a dirty tree — commit first, so the SHA prod reports is real.
See §8 "Deploy runbook".

Node 20+ (developed on Node 24). VS Code: install the recommended extensions
(`.vscode/extensions.json`) for Tailwind IntelliSense + ESLint/Prettier.

---

## 6. Roadmap (suggested order)

1. ~~**Full chapter-detail editing**~~ — ✅ done (Session 2).
2. ~~**Inline editing for Characters & World**~~ — ✅ done (Session 3).
3. ~~**Project rename + multi-document picker**~~ — ✅ done (Session 6, Projects modal).
4. ~~**Timeline act band labels**~~ — ✅ done (Session 8). The pending "fit-to-view
   on timeline switch" is moot as of Session 51: the timeline has no camera to fit.
5. ~~**Markdown import parser**~~ — ✅ done (Session 9). `parseImportMarkdown`.
6. ~~**Open a project file from disk**~~ — ✅ done (Session 9). "Open file..." in
   the Projects modal. (Drag-drop onto the board still a nice-to-have.)
7. **Cloud backend = Google Drive + Google sign-in** — decided 2026-07-01, see
   §8 for the full plan. Prerequisites first: fix the persistence seam and
   quota/perf issues in §9 (items 1–3), then move hosting to Vercel (§8),
   then build `GoogleDriveStorageAdapter`. See also §7 Integrations
   (Obsidian/Google Docs).

> **Cross-project note — an Android companion app is planned (not built here).**
> A **separate** native Kotlin/Compose app is planned (decided 2026-07-02); its
> own spec lives at `/Users/rfcl/AndroidStudioProjects/Estoria-aa/docs/SPECS.md`
> (with its session log beside it in `docs/SESSIONS.md`; the old single-file
> `ESTORIA-ANDROID.md` path this note used to give no longer exists). The v6
> brief written for that side is its **§3.1**.
> **It is not part of this repo's roadmap and does not add web work** — it is
> listed here only so web-side changes stay aware of it. What that awareness
> means in practice:
> - The Android app reads/writes the **same `.estoria.json` (currently schema
>   v8 — see `SCHEMA_VERSION` in `src/types.ts`; v4 = standalone version forks,
>   v5 = asset-backed pinned refs, v6 = `TODO` assets + `archived` + per-mode
>   scene layout, v7 = movable `mainDraftId`, v8 = `archived` on characters and
>   world entries **plus a reversal of what `archived` means**)**. Any
>   change to the document model here is a **cross-app compatibility event** —
>   coordinate schema bumps, don't silently reshape `StoryDoc`.
> - **v6, v7 and v8 are CLOSED — both apps are on schema 8 (verified 2026-08-01).**
>   Each of these was an open cross-app event for several days, and the warnings
>   that stood here are gone because the phone caught up, not because they
>   stopped mattering. Confirmed in the Android source rather than from its
>   session log: `SCHEMA_VERSION = 8` in `StoryDoc.kt`; v6's `RefKind.Todo`,
>   `items` and `scenePosCompact` all present with `Normalize` defending them;
>   v7's `mainDraftId` on both the doc and each book, carrying the "never compare
>   against `MAIN_DRAFT_ID`" warning; v8's `archived` on `Character`,
>   `WorldEntry` **and** `Asset`. The v8 one was worth checking properly, because
>   its risk was semantic rather than structural — and the phone documents the
>   reversal on the field itself ("a v8 doc can hold an archived asset with live
>   pins"), so it took on the rule change and not merely the new field. Cross-app
>   Sync is bidirectional again. **What each version added is still recorded in
>   the bullet above and in [`SESSIONS.md`](SESSIONS.md); what is retired here is
>   only the "the phone cannot read our files yet" warning.** The next change to
>   `StoryDoc` starts a new event — reinstate a bullet like the ones removed.
> - **Manuscript mode added three optional fields and did NOT bump the schema.**
>   `Chapter.manuscript` (the prose), `Chapter.target` (the hand-set word goal)
>   and `StoryDoc.author` (the `.docx` title block) are all optional, which is
>   already the shape every existing document has — so this is **not** a cross-app
>   event and there is nothing for Android to match. Verified in `Estoria-aa`
>   that unknown chapter fields round-trip losslessly through two independent
>   layers: `normalizeDocJson` (`Normalize.kt`) builds each chapter with
>   `val out = p.toMutableMap()` and only *overwrites* known keys, and
>   `ExtrasSerializer` (`StoryDoc.kt`) captures unknown keys into `extra` on
>   decode and merges them back on encode. **Guarded by tests on that side**
>   (2026-08-02): `RoundTripTest` already covered the active board, and now also
>   covers a chapter in a `draftData` version and one in a stashed `bookData`
>   book — the two places forked prose lives, and a different normalize path
>   from the active board's. Recorded in that repo's §4(a) and session log.
> - **Two consequences to remember rather than fix.** A **prose-only edit on web
>   registers as a real change on Android**, because its conflict detection
>   hashes the canonical encoding — that is correct, not a bug. And the web app
>   now **derives `words` from the manuscript** while Android still offers a
>   hand-typed field, so a round trip can recompute a typed number away. That is
>   the first place the two apps would visibly disagree; if Android ever grows a
>   manuscript field, it should adopt the same two rules (leave a chapter with
>   no manuscript alone, and promote the old number into `target` rather than
>   overwriting it — a chapter whose prose was *deleted* reads 0). Note the
>   direction: Android **should not** derive `words` before it has a manuscript
>   of its own, since every pre-manuscript book there has a hand-typed count and
>   no prose to recompute from.
> - **The Timeline reading view is web-app only (Session 51) — by decision, not
>   by omission.** The user scoped it to the web app, and it is built so that
>   choice costs the phone nothing: it is pure presentation over data that
>   already exists (`Chapter.scenes`, `sceneLinks`, `ChapterLink`), it adds **no
>   fields to `StoryDoc`**, and its one piece of new state (`focusScene`, "open
>   the modal on this scene") is transient UI state outside `doc` and outside
>   `partialize`. So there is **no schema implication and nothing for Android to
>   match** — a phone that never builds this view reads and writes the same files
>   as before.
> - **`SCENE_TEXT_MAX` (200 characters, Session 56) is a web-side *input* rule,
>   not a document rule — do not enforce it on read, on either side.** It exists
>   so a timeline scene card can show its text whole, and the timeline is a view
>   the phone does not have. The web app never truncates: a longer scene (written
>   before the cap, or written on the phone, which has no such limit) keeps every
>   character, widens to show what it can, and carries an `N / 200` count. A
>   `.estoria.json` may therefore legitimately hold scenes over 200 characters,
>   and **validating or trimming against this number on import would destroy the
>   user's text to satisfy a layout constraint only one app has.** Not a schema
>   change and not a cross-app event; recorded only so the number is not mistaken
>   for a model constraint later.
> - The planned Google sign-in + Drive work (§8) is intended to be **shared** by
>   both apps (same Google identity, one Drive file). Decisions made for the web
>   OAuth/Drive setup should not preclude a second (Android) OAuth client under
>   the same Google Cloud project.
> - A future multi-user backend would be a **new adapter behind the existing
>   seam** for both apps — a reason to keep the `StorageAdapter` seam clean.

---

## 7. Integrations / external sync (future, not started)

A separate area from the cloud backend. **Cloud (roadmap item 7, plan in §8)**
syncs Estoria's *own* data (`.estoria.json`) across the user's devices.
**Integrations** project Estoria *into other tools* (Obsidian, Google Docs) for
writing prose or sharing.

### The core tension

Estoria's model is a **structured graph** (board positions, scene node positions,
typed connectors, characters, world, per-book versions, multi-book). The targets
are **linear text**. Export is easy; reading edits *back* without losing structure
is the hard part. Stance: **Estoria owns structure; the external tool owns prose.**
Embed stable IDs + structural metadata as YAML front-matter / hidden blocks so a
round-trip survives; regenerate (don't store) anything the target can't represent
(e.g. board positions in a Google Doc).

Three levels of ambition: (1) one-way export — already have markdown; (2) one-way
push sync — keep the external copy updated; (3) two-way sync — reconcile both
sides (genuinely hard; do last, behind a manual "pull").

### Obsidian — preferred first integration (local, no backend)

- A vault is just markdown files in a folder; no API/OAuth. The browser writes to
  it via the **File System Access API** (user grants a folder handle once). Fits
  Estoria's local-first ethos and slots behind the existing `StorageAdapter` seam.
- Mapping (we're ~90% there): one note per chapter (folder per book),
  characters/world as notes, `[[wikilinks]]` (already emitted), a project index
  note. **Front-matter** carries `estoria-id`, act, status, version, scene order/
  positions, connector types → enables pull-back.
- Two-way is tractable: re-read on focus, **match by `estoria-id`, not title**
  (titles change), update chapter summary / scene prose from the body, keep
  structure from front-matter.

### Google Docs — later, one-way share (rides the cloud milestone)

- Real cloud API + **OAuth**; realistically needs a small **backend** (PKCE in a
  pure SPA hits CORS/quota friction). So it's coupled to the cloud milestone
  (roadmap item 7 / §8), not before it. Note: the §8 Google sign-in work gives
  us the OAuth client anyway — Docs export would add the `documents` scope.
- Rich text, not markdown: writing a clean formatted manuscript (chapters = H1,
  scenes = paragraphs) is fine; **parsing a Doc back is fragile**. Treat as a
  one-way "export to a shareable Doc" for editors who live in Google. **Skip
  two-way Docs** — not worth the cost.

### Key sequencing insight

The **markdown import parser** (§6 item 6) and the **Obsidian pull side** are the
same code (markdown → `StoryDoc`). Build the parser first: it makes Import actually
work *and* becomes the read-back engine for Obsidian sync. → Do parser, then
Obsidian folder sync, then (with cloud) one-way Google Docs export.

### Decisions to settle before building

- **Granularity:** sync per **book** (a book = a manuscript = a vault folder / one
  Doc), not whole-project.
- **Which version syncs:** just the **active** version (multiple versions → multiple
  files gets confusing).
- **Conflicts:** start with Estoria-owns-structure / external-owns-prose + a manual
  **pull** button before anything live or automatic.
- **Google Docs intent:** sharing with editors vs. writing there — likely sharing,
  which means one-way is enough.

---

## 8. Auth, cloud storage & hosting plan (decided 2026-07-01)

Decisions locked with the user in the 2026-07-01 session. This is the concrete
shape of roadmap item 7 (cloud backend).

### Auth — Sign in with Google, directly

- **Google OAuth directly** (Google Identity Services), no Supabase and no
  Firebase for auth. Drive already requires a Google account, so a separate
  auth provider adds nothing. Supabase/Firebase stay **optional later** only if
  a real hosted backend is ever needed.
- Web + Android use the same Google identity. Android needs its **own OAuth
  client ID** (normal Google setup), but no separate account-linking work.

### Storage — the user's own Google Drive

- A **`GoogleDriveStorageAdapter`** implementing the same `load()`/`save()`
  interface as `LocalStorageAdapter`. Store and UI unchanged — this is exactly
  the seam §2 was built for.
- **`drive.file` scope only**: the app sees only files it created, never the
  whole Drive. Works identically on web and Android.
- **Local-first stays.** `LocalStorageAdapter` remains as the offline cache;
  Drive syncs in the background. On first login, offer to migrate the existing
  local `StoryDoc` via the existing export/import path.
- **Cost: free at this scale.** The Drive API is free; storage comes out of the
  user's own Drive quota. No database to host or pay for.
- **Future sharing is not blocked**: Drive-native file sharing works
  immediately with no backend. Real collaboration (live cursors etc.) would be
  a new adapter added later — both can coexist.

### Implementation notes (from the 2026-07-01 code review)

- **Fix the seam first**: `zustandStorage` currently reads localStorage
  directly (never calls `activeAdapter.load()`) and double-writes every save.
  A Drive adapter dropped in today would never be read from. §9 item 1.
- ~~**Debounce saves before Drive**~~ — **done, twice.** Session 20 debounced the
  *write* (500ms trailing + flush on `beforeunload`), and the manuscript work
  went further and debounced the **serialize**: `createJSONStorage` is gone, the
  storage is object-form and owns its own serialization, so `setItem` is one
  assignment and `JSON.stringify` runs on the timer rather than per keystroke.
  Measured on a 15-chapter project: 40 keystrokes stringify ~26KB in about no
  time, then one ~188KB serialization when the timer fires.
- **Prose is already split out**: chapter manuscripts live in **IndexedDB**,
  keyed by `(projectId, bookId, draftId, chapterId)` — see `store/prose.ts`. The
  split is **at the at-rest layer only**: `StoryDoc` stays whole in memory and in
  every file, so export, Sync, backup, import and Android see one document with
  `manuscript` on its chapters. A Drive adapter inherits this unchanged, and
  should note the crash pad: IndexedDB is async and `beforeunload` is not, so
  every prose flush writes a synchronous localStorage pad first and clears it
  only once the IndexedDB write resolves.
- **Granularity**: the persisted blob today is doc + `projectStash` + prefs in
  one string. For Drive, prefer **one file per project**
  (`<title>.estoria.json` in an app folder) plus keeping UI prefs local-only —
  needs a small widening of `StorageAdapter` (`list()` / per-id load/save)
  while the seam is being fixed anyway.
- **Images**: cover/ref images are base64 data URLs inside the doc; on Drive
  these should eventually become separate files referenced by ID (§9 item 13).
  Not a blocker for v1 of the adapter.

### Cross-app Sync — CONTRACT SETTLED 2026-07-03 (both sides built; web behavior extended same day, see below)

Designed with the user in the Android session of 2026-07-03; the Android app
implements its half (see the Android spec §8, same-day session log), and the
web half shipped later the same day (Session 24). **The contract:**

- **One canonical file per project.** In the user's Estoria folder (their
  Google Drive folder, reached from this app via the remembered
  File System Access directory handle — same handle `lib/backup.ts` uses),
  each project has ONE stable-named working file: `<slug>.estoria.json`.
  Both apps' Sync read/write that file. The timestamped
  `<slug>-backup-<stamp>.estoria.json` rotation stays as the safety net.
  Rationale: Android's file picker cannot grant *folder* access on Google
  Drive (no `ACTION_OPEN_DOCUMENT_TREE` support in Drive's provider), so the
  phone can only watch a single file — and `drive.file`-scoped API access
  wouldn't see desktop-synced backups anyway.
- **Change detection = per-device content fingerprint + `modifiedAt`.**
  Each device remembers a hash of the state it last agreed on with the file
  (web: localStorage/IDB alongside the dir handle). Compare:
  local == remote → in sync; remote == last-synced → local ahead (offer
  write); local == last-synced → remote ahead (offer reload); else →
  conflict. Android hashes SHA-256 over the codec-canonical encoding with
  `modifiedAt` stripped; the web side must likewise hash a canonical,
  `modifiedAt`-less serialization of its own (the two hashes never cross the
  app boundary, so they don't need to match each other — each device only
  compares its own).
- **`modifiedAt` (ISO 8601) is now an optional v3 top-level field.** Stamped
  on every file write, used for "file last written …" display only — never
  for conflict logic (clock skew). The Android model declares it;
  **`normalizeDoc` here must preserve it** (and ideally stamp it in the
  save-to-file/backup paths).
- **Conflicts (v1): whole-file choice + diff summary, loser preserved.**
  Show what differs (entities matched by stable ids, neutral phrasing),
  user picks keep-mine/keep-theirs; the copy NOT kept is written as
  `<slug>-conflict-<stamp>.estoria.json` (web: into the Estoria folder;
  Android: stashed in app storage, exportable) so it can never override the
  canonical file and can be merged manually later. Per-entity merge by ids
  remains the later evolution.
- **Check cadence:** on open/focus + a user-set foreground interval
  (Android default 5 min; suggest mirroring), prompting to review — never
  auto-applying.
- Relation to the §8 Drive adapter: unchanged — the adapter is transport,
  Sync is the reconciliation policy on top, and it works today over the
  File System Access folder without Drive sign-in.

**Web implementation (Session 24, 2026-07-03) — DONE, with user-decided
extensions that go beyond the original to-do.** The web behavior is now:

- **The footer "Back up" button is gone; Sync absorbed it.** Every completed
  explicit Sync (including "already in sync" and conflict resolutions) writes
  one timestamped `<slug>-backup-<stamp>.estoria.json` and prunes to the
  newest 5 — the old Back up rotation, now a side effect of Sync. Backups are
  NOT written by the background mirror (below), so a long editing session
  can't churn out the 5 good copies.
- **Auto-save mirrors into the canonical file.** Local auto-save (localStorage
  via the `StorageAdapter` seam) stays the always-working base; ~2.5s after a
  save settles, the state is also pushed to `<slug>.estoria.json` — but ONLY
  as a pure fast-forward (file absent / identical / unchanged since
  last-synced). If the file moved on its own, the mirror never writes; the
  autosave line flips to "file changed elsewhere — press Sync". Effectively
  auto-sync with manual conflict review.
- **No footer button where folder access doesn't exist** (Firefox/Safari, the
  labrarf.com cross-origin embed): user decision — those contexts keep local
  auto-save and the export menus only. No download fallback on Sync.
- **Folder icon = file history + restore** (added later in Session 24, user
  decision). With a folder set, clicking the footer folder icon opens a
  popover listing this project's files in the Estoria folder with role badges
  — **Live file** (the no-suffix `<slug>.estoria.json` sync target),
  **Backup** (`-backup-<stamp>`, rotation copies), **Conflict copy**
  (`-conflict-<stamp>`) — each with its written time and a **Restore**
  action. Restore (after a confirm) replaces only the *working copy*; the
  current state is first written as a new rotating backup, so every restore
  is undoable from the same list. The live file is deliberately left alone —
  the mirror/Sync path updates it afterwards with the usual never-clobber
  guarantees, so restoring can still surface a conflict instead of silently
  overwriting a phone-side change. "Change…" in the popover re-picks the
  folder (`SyncHistoryPopover.tsx`; `listProjectFiles`/`restoreFromFile` in
  `lib/sync.ts`; `Popover` grew a `side="above"` mode for bottom anchors).
- Implementation: `lib/sync.ts` (fingerprint = SHA-256 over key-sorted,
  `modifiedAt`-stripped JSON of the `normalizeDoc`-normalized doc; three-way
  compare; conflict copies; all folder ops serialized through one lock so the
  mirror and a Sync click can't interleave), `lib/backup.ts` (folder handle +
  `writeRotatingBackup`, `backupProject` removed), `SyncConflictModal`,
  footer wiring in `Footer.tsx` (focus + 5-min notify-only check per the
  cadence bullet). `modifiedAt` stamped by `stampModified()` on every file
  write incl. exports; preserved through `normalizeDoc`.
- **Android follow-up (user's plan, not web work):** mirror the same extended
  behavior on the phone — sync-writes-backup-rotation and auto-mirror. The
  file contract above is unchanged by these extensions (rotation and mirrors
  are device-local behavior), so nothing breaks while Android catches up.

### Hosting migration (updated 2026-07-02 — see Session 22)

- **The embed is now a same-origin copy.** The built app is synced into the
  portfolio repo (`Portfolio-Website/estoria/`, via `npm run deploy` — the old
  `sync:portfolio` script it replaced in Session 42)
  and served at **www.labrarf.com/estoria/**; `estoria-app.html` iframes
  `/estoria/`. Reason: Chromium blocks the File System Access pickers
  (backup folder) in cross-origin iframes with no `allow` delegation, so the
  old github.io iframe couldn't offer folder backups. Same-origin fixes it
  and keeps Ray's URL on top.
- **Privatizing this repo is no longer blocked on Vercel.** The live demo now
  ships from the (public) portfolio repo as build output; the estoria source
  repo's own Pages site (`labrarf-rgb.github.io/estoria/`) is a secondary
  direct URL and can be retired when the repo goes private.
- **Vercel remains the eventual home** (rewrite/proxy under labrarf.com would
  make same-origin permanent without the copy step). When that happens:
  `vite.config.ts` hardcodes `base: "/estoria/"` in production — keep it if
  the app stays under a `/estoria/` path, switch to env-driven if it moves to
  a domain root.
- OAuth impact unchanged: authorized origins must list the final serving
  origin(s) — settle hosting before the Drive adapter so OAuth is set up once.
  With the same-origin copy, that origin is `https://www.labrarf.com`.

#### Deploy runbook — `npm run deploy` (updated Session 42)

Publishing is still **two repos**, but `scripts/deploy.sh` now drives the whole
loop and verifies the result, so the manual steps below are only what it does
under the hood (and what to fall back on when Pages misbehaves):

1. Refuse a dirty tree — commit and push the source repo first, so the SHA
   stamped into the build is a real commit.
2. `npm run build` — stamps `window.__ESTORIA_BUILD__` + writes
   `dist/version.json`.
3. `rsync -a --delete dist/ → Portfolio-Website/estoria/`, then commit + push
   the **portfolio** repo. That push triggers its `pages-build-deployment`
   Action, which is what actually publishes `www.labrarf.com/estoria/`.
4. Poll `…/estoria/version.json` (cache-busted) for up to ~5 min until prod
   reports HEAD's commit → `✓ <sha> is live`. A timeout means Pages is still
   building; re-run to re-check.

Step 4 is the point of the script — it replaces the old "compare asset hashes
by hand" check below, which stays here as the manual fallback:

- **The rsync uses `--delete`**, so it removes the old
  content-hashed `assets/index-*.{js,css}` and writes new ones. If the Pages
  deploy then fails or stalls, Pages keeps serving the **last successful**
  (old) build — so the site looks unchanged even though the repo is correct.
  This is the trap: a green push does **not** mean a green deploy.
- **Always confirm the deploy landed**, don't assume. Quick checks:
  - `gh run list --limit 3` in the portfolio repo — the newest
    `pages build and deployment` must be `completed / success`, not
    `failure`/stuck `queued`.
  - Compare hashes: `grep -o 'index-[^"]*\.\(js\|css\)'
    Portfolio-Website/estoria/index.html` vs
    `curl -s "https://www.labrarf.com/estoria/index.html?cb=$(date +%s)" |
    grep -o 'index-[^"]*\.\(js\|css\)'` — they must match. (Cache-bust the
    query string; hashed asset names already bust their own caches.)
- **If the deploy failed or is stuck** (seen 2026-07-04: transient
  "Deployment failed, try again later", and a `gh run rerun --failed` that then
  hung `queued` ~6 min): don't wait on the rerun. Push a fresh **empty** commit
  to the portfolio repo (`git commit --allow-empty -m "Redeploy Pages"`) to
  kick a clean build+deploy, then re-verify hashes. It's almost always a
  GitHub-side hiccup, not a content problem — the built artifact is fine.

---

## 9. Known issues & fix backlog (code review, 2026-07-01)

Full-project review (store, persistence, layout, markdown, board/series/detail
components, modals). Ordered by priority. Check items off here as they land,
with an entry in [`SESSIONS.md`](SESSIONS.md).

### P1 — persistence layer (fix before any cloud work)

1. ✅ **Fixed 2026-07-01 (Session 20)** — reads now go through
   `activeAdapter.load()` (async rehydrate), the duplicate write is gone, and
   the legacy `estoria:doc:v1` copy is removed on first load to reclaim quota.
   Still open from this item: widening `StorageAdapter` to per-project
   granularity (deferred to the §8 Drive work).
   *Original finding:* **`zustandStorage` bypasses the adapter on read and double-writes on save**
   ([persistence.ts](../src/store/persistence.ts)). `setItem` writes the full
   serialized store twice — once via `activeAdapter.save()` (which stores under
   its own `estoria:doc:v1` key) and once directly to localStorage under the
   persist key `estoria:store:v1`. `getItem` reads only the latter, directly —
   `activeAdapter.load()` is **never called**, so the adapter copy is dead
   weight that ~halves the effective localStorage quota, and a future Drive
   adapter would save data no one ever loads. Fix: single write path through
   the adapter + an async-hydrate read path (zustand persist supports async
   storage), delete the duplicate key.
2. ✅ **Fixed 2026-07-01 (Session 20)** — `save()` now propagates errors; a
   `SaveStatus` pub/sub in persistence.ts drives the Footer, which shows a red
   "Couldn't save — browser storage is full" message on failure and the real
   last-successful-save time otherwise. *Original finding:*
   **Save failures are silent.** `LocalStorageAdapter.save` and the shim
   swallow quota errors (`QuotaExceededError`), while the footer keeps showing
   an autosave stamp — with base64 images in the doc, quota exhaustion is a
   *when*, not an *if*, and the user would lose work believing it saved. Fix:
   propagate save failure into store state, show it in the footer; consider
   IndexedDB (far larger quota) as the local adapter's backing store.
3. ✅ **Fixed 2026-07-01 (Session 20)** — saves are debounced 500ms trailing,
   with a synchronous flush on `beforeunload` and `visibilitychange → hidden`.
   *Original finding:*
   **Whole-store serialization on every keystroke.** zustand `persist` runs
   `partialize` + `JSON.stringify(doc + projectStash + prefs)` synchronously on
   each state change — typing in a scene textarea re-serializes every project
   (including embedded images) per keystroke. Debounce/throttle persist writes
   (~500ms trailing, flush on `beforeunload`). Mandatory before Drive.

### P2 — correctness bugs

4. ✅ **Fixed 2026-07-01 (Session 20)** — `deleteChapter` now bridges the two
   neighbors, carrying the incoming link's type. *Original finding:*
   **Deleting a middle chapter breaks the connector chain**
   (`deleteChapter` in [useStore.ts](../src/store/useStore.ts)): both links
   touching the deleted chapter are filtered out but the neighbors are never
   re-joined, leaving a permanent gap in the therefore-chain on the board.
   Fix: bridge the two neighbors (same idea as `reorderChapter`'s rebuild).
5. ✅ **Fixed 2026-07-01 (Session 20)**; **re-fixed 2026-07-18 (Session 40)**
   — Session 20's sweep only covered `chapters` + `bookData[*].chapters`;
   schema v4 (Session 36b established `draftData` version forks) added two more
   chapter locations that were never swept. See Session 40 in
   [`SESSIONS.md`](SESSIONS.md). Both
   deletes now sweep the active book's chapters *and* every stashed
   `bookData[*]` book, in both the active version and every `draftData[*]`
   fork; world deletes clear `worldRefs` too. *Original finding:*
   **`deleteCharacter` / `deleteWorldEntry` leave dangling ids.**
   `deleteCharacter` cleans only the *active* book's chapters — chapters
   stashed in `bookData` (inactive books) keep the deleted id in `chars`.
   `deleteWorldEntry` cleans nothing — even active-book `worldRefs` keep the
   id. Renders are defensive (missing ids render as nothing) but counts and
   markdown export can leak raw ids (`charName` falls back to the id string).
   Fix: sweep `chapters` **and** all `bookData[*].chapters` on delete.
6. ✅ **Fixed 2026-07-01 (Session 20)** — the rebuilt chain now carries over
   the type of any adjacency that already existed (same approach as
   `reorderChapter`). *Original finding:*
   **`applyTemplate` (insert mode) wipes existing chapter-link types**: it
   rebuilds the whole `links` array as a fresh all-"therefore" chain, so an
   imported doc's `but`/`and` chapter links are silently reset when a template
   is appended. Fix: keep existing adjacencies' types (like `reorderChapter`).
7. ✅ **Fixed 2026-07-01 (Session 20)** — new `normalizeDoc()` in
   persistence.ts defaults every missing v3 field (books, bookData, drafts,
   per-chapter arrays) and validates ids; `readProjectFile` routes through it.
   *Original finding:*
   **`openDoc` / `readProjectFile` accept unvalidated shapes**
   ([persistence.ts](../src/store/persistence.ts)): validation is only
   "`chapters` is an array". A pre-v3 export or hand-edited file missing
   `books` / `bookData` / `drafts` crashes the toolbar on first render
   (`doc.books.find`). Fix: normalize/default all v3 fields on open (a small
   `normalizeDoc()` — also the natural home for future schema migrations of
   *files*, which unlike localStorage never went through zustand's `migrate`).
8. ✅ **Fixed 2026-07-01 (Session 20)** — the drop zone (and the whole modal,
   so near-misses don't navigate) now handles `dragover`/`drop` and feeds the
   same parse path as the file picker. *Original finding:*
   **Import modal advertises drag-and-drop but has no drop handler**
   ([ImportModal.tsx](../src/components/modals/ImportModal.tsx) — "Drop a .md
   file here"): dropping a file triggers the browser's default navigation and
   leaves the app. Fix: `onDragOver` preventDefault + `onDrop` → same parse
   path as the file input (and the board-level drag-drop nice-to-have from §6
   could share it).
9. ✅ **Fixed 2026-07-01 (Session 20)** — the fit effect is keyed on `doc.id`
   as well. *Original finding:* **Board camera doesn't re-fit when switching
   projects.** The fit effect was keyed on `activeBookId` only, but
   `emptyStory()` and every import hardcode the book id `"book-1"`, so
   switching between two standalone projects kept the stale camera.
10. ✅ **Fixed 2026-07-01 (Session 20)** — the loose fallback is gone; only
    headings *starting* with "act" parse as acts. *Original finding:*
    **Import parser: any `##` heading containing "act" becomes an Act** (the
    fallback `/act/.test(h)` misparsed sections like `## Factions`).

### P3 — quality / round-trip / UX

11. 🟡 **Mostly fixed 2026-07-01 (Session 20)** — export now emits `## World`
    and full character fields (Desc/Bio/Traits/Goals/Motivations/Wants|Needs)
    in the import-prompt schema, and the parser learned the `Desc:` line, so
    the round-trip keeps them. Still open: export covers only the **active
    book** — add a per-book choice (or label it) when the Obsidian work starts.
    *Original finding:* **Markdown export is lossy vs the import schema.**
12. **Wheel zoom is origin-anchored, not cursor-anchored** (Board + SeriesMap):
    zooming drifts the content instead of zooming at the pointer. Standard fix:
    adjust pan so the world point under the cursor stays fixed.
13. **Images live inline in the doc as data URLs** (covers, image refs): bloats
    every autosave/export and is the main localStorage-quota risk. Plan: store
    image blobs separately (IndexedDB locally / own Drive files later),
    reference by id. Coordinate with the Drive adapter design (§8).
14. ✅ **Fixed 2026-08-02 (f) — one line, found with a profiler.** The cause was
    `activeProseWords` in [`Toolbar.tsx`](../src/components/Toolbar.tsx): a
    `reduce` of `countWords` over **every chapter's manuscript**, computed on
    every render of a component that is always mounted, to answer the yes/no
    question "would forking copy anything?". On a 300k-word book that is a regex
    sweep of 1.7M characters per keystroke. It is now a `some`, which stops at
    the first chapter with prose.

    **Measured on the 42.4MB / 7.5M-word fixture:**

    | | Before | After |
    |---|---|---|
    | Scene beat, dev build | 52.2ms | **7.3ms** |
    | Prose field, dev build | 58.2ms | **12.9ms** |
    | Scene beat, **production** | — | **3.2ms** |
    | Prose field (56k-char chapter), **production**, warm | — | **7.9ms** |

    **The document-size dependence is gone**: 7.3ms at 42MB now matches 7.0ms at
    6.5MB. The whole table below was one unmemoized reduce.

    Two notes for whoever reads the numbers. Everything before this was measured
    on a **dev build**, where React's `jsx-dev-runtime` was 41.5% of the profile;
    production is faster again. And a burst measured immediately after switching
    into manuscript mode reads ~40ms from one-time warm-up — re-measure warm.

    *The investigation below is kept because the ruled-out list is the useful
    part: it is what stops the next person re-deriving it.*

    ⚠️ **Was: perf — no longer cosmetic. Measured 2026-08-02 (d); the top scale
    problem. Cause NOT yet identified — do not start fixing from this item's
    original prescription.**

    Every keystroke in any doc-backed field costs, and the cost tracks **total
    document size in bytes** — across all books and versions, including the ones
    not on screen:

    | Document | Per-keystroke median | p90 |
    |---|---|---|
    | 0.3MB (1 book, 30 chapters) | 8.4ms | 31ms |
    | 6.5MB (5×5, 750 manuscripts) | 7.0ms | 31ms |
    | 15.8MB (5×5, 2.5M words) | 23.3ms | 52ms |
    | 29.1MB (5×5, 5.0M words) | 26.2ms | 64ms |
    | 42.4MB (5×5, 7.5M words) | 52.2ms | 73ms |

    **What it is not**, each ruled out by measurement:

    - **Not the number of chapters or board cards.** 30 chapters in a 0.3MB
      document is 8.4ms; the same 30 cards in a 42MB document is 52ms.
    - **Not the number of manuscripts.** 750 manuscripts at 6.5MB is 7.0ms.
    - **Not the field being edited.** A 123-character scene beat costs the same
      as a 56,000-character manuscript.
    - **Not the open chapter's prose.** Shrinking the open chapter from 56,130
      characters to 51 left it at 49ms in the same document.
    - **Not React rendering.** A UI-only state change re-renders the same tree
      in **0.3ms**, and the cost is still 42ms with **no chapter modal mounted
      at all**.
    - **Not serialization or storage.** Per keystroke: 0.17ms of
      `JSON.stringify`, zero `localStorage` writes, zero `JSON.parse`.
      `setItem` is one assignment and both flushes are debounced (200/500ms),
      so neither runs inside a keystroke.

    What is left is the document *update* path — allocating a new object graph
    per keystroke against a large retained heap (~3MB allocated per keystroke;
    heap grew 59MB across 20). That is a hypothesis, not a finding: naming the
    actual line needs a profiler run, and **that is the first job**, because the
    original prescription below (narrower selectors) is now known not to
    address it. Numbers and method in [`SESSIONS.md`](SESSIONS.md), 2026-08-02 (d).

    **Practical limit until it is fixed:** comfortable below ~7MB total
    document; past one frame (16ms) somewhere around 10MB, roughly 1.5M words
    across every book and version.

    *Original finding (filed as cosmetic, and its fix is now known not to be
    the answer):* `ChapterDetail` subscribes to the whole `doc` (every keystroke
    re-renders the full modal — fine at current scale, use narrower selectors if
    it ever feels sluggish).
    *(The other half of this item — "delete-chapter confirm shows the base
    `ch.title` rather than the draft-resolved title" — is moot since schema v4
    (Session 36b): versions are standalone forks, so `ch.title` **is** the
    active version's title. No override layer left to resolve.)*

16. ✅ **Done 2026-08-02 — the manuscript is its own modal.** Raised and built the
    same day. Four separate complaints turned out to be one problem: beat cards
    too tall, the section's controls scrolling away, an empty sheet making the
    modal scroll with no visible scrollbar, and navigation between the scene
    canvas and the manuscript feeling messy. Each had been patched; the cause had
    not. See §4, "Why the manuscript is a modal, not a section", for the fix and
    the three shapes that carry it.

    **The one cost named when this was raised is real and was paid down where it
    could be:** a second surface has to stay in step with the chapter modal. The
    meta line is where the two would drift, so it is a shared component
    (`ChapterMetaRow`) rather than two copies, and the switch sits immediately
    after the status picker in both — *not* pushed to the end of the row, because
    the two headers carry different controls to the right of it and ending the
    row would put the button at a different place on screen in each.

15. ✅ **Fixed 2026-08-02 (c) — the author's call, taken.** The timeline's
    vertical card is 4px taller (`TL_NODE_H` in [`lib/layout.ts`](../src/lib/layout.ts),
    `SCENE_H + 4`), and the clip is gone: a 197-character scene renders whole at
    a 760px window, 0 overflow across every card on the board.

    **It is its own constant, not a bump to the shared `SCENE_H`** — the chapter
    modal's scene canvas has no clipping problem and no reason to grow. And the
    fit probe measures against whatever height it is handed, so raising the
    height raises capacity on its own; `sceneSpan` was not touched.

    **The rule is bounded, not abandoned.** "Wider, never taller" still holds:
    cards remain a fixed height that grows sideways, this is simply a slightly
    larger fixed height. What forced the exception is that at half screen the
    pane fits a single column, so there is nowhere to widen *to* — widening
    cannot solve a case with no horizontal room left.

    *Original finding:* **A timeline scene card can still clip by ~2px at half
    screen** (Session 56) — a clipped descender on the last line, not lost words.
    Measured at a 760px window: 4 of 421 scenes, worst 2px.

17. ✅ **Fixed 2026-08-02 (g) — the pane is windowed.** Only the chapter you are
    reading and its two neighbours either side render their prose; the rest keep
    their header and a spacer of their own height.

    | | Before | After |
    |---|---|---|
    | Blocked main thread, **production** | 1,242ms | **0** (no long task) |
    | Blocked main thread, dev | 415ms | **91ms** |
    | DOM nodes | 14,602 | **1,748** |
    | Chapters rendered | 30 | **3–5** |

    **The three things windowing had to not break, and how:**

    - **`Cmd+P` prints this view — it *is* the PDF export**, so a windowed page
      would print a book with holes in it. `beforeprint` renders every chapter
      and `flushSync` is what lands it before the dialog snapshots the page
      (320ms for 30 chapters); `afterprint` puts the window back.
    - **The rail's two-way sync and `jumpTo` read each group's offset**, so every
      chapter's header renders whether or not its prose does, and the spacer
      reserves the right height.
    - **`jumpTo` now `flushSync`es `activeId` before measuring.** The window
      moves with `activeId`, so measuring first would compute the scroll target
      against spacer heights that are one render away from changing, and land
      short of the chapter you clicked.

    Spacer heights are measured once a chapter has been on screen, and estimated
    from `words × px-per-word` before that — calibrated from whatever *has* been
    measured at this pane width, so it improves as you read. Cold estimate error
    over 21 unrendered chapters: **0.2%** (735px in 367,000), which shows up as
    slight scrollbar drift that self-corrects, never as a mis-aimed jump.

    Also fixed in the same pass: the pane's per-chapter header was calling
    `countWords` on every render — the same shape as the item 14 Toolbar bug, a
    regex sweep of every manuscript in the book. It reads the cached `c.words`
    now, which is what that cache is for.

    *Original finding:* the pane rendered every chapter's prose at once — 14,602
    DOM nodes, 4,399 prose blocks, 1.67M characters, 1,242ms blocked in
    production. Predicted by the build brief §8 item 5. Worth remembering that
    the scope was **one book's active version at 301.7k words** — one long novel,
    not an extreme document — so this was never an extreme-scale problem.

18. **`writePad` fails silently when localStorage is full.** The crash pad
    catches `QuotaExceededError` and ignores it, so the symptom is the safety
    net quietly not being there. **Not urgent, and the threshold is far higher
    than assumed:** measured on Chrome, the pad takes ~40M characters (80MB)
    before it fails — about 16× the ~2.5M the build brief predicted, and three
    orders of magnitude above the realistic worst case (one 10k-word chapter is
    0.11MB). Fix by capping what the pad accepts and *saying so* rather than
    failing quietly. Worth re-measuring on Safari and Firefox, which cap
    localStorage far lower and where the pad still runs.

19. ✅ **Fixed 2026-08-02 (f)** — `countWords` in `ManuscriptModal`'s render is
    now behind `useMemo`. *Original finding:* it ran unmemoized (3.3ms on a
    10k-word chapter, on every keystroke), introduced 2026-08-02 (c) with the
    modal. Still open in the same shape but at a much rarer cadence:
    **`ExportModal` takes 78ms** to count 30 chapters when it opens — via
    `manuscriptExport`'s `proseChapters` / `totalProseWords`, which sweep every
    manuscript. Now the only surface that recounts instead of reading the cache
    (2026-08-06 made that cache trustworthy everywhere else). The claim that
    `Timeline.tsx` counts per chapter in its rail render was already stale — item
    17's pass moved it to `c.words`.
