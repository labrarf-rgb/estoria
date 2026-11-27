# Expand-only: impact of dropping the partial views

Ray, 2026-11-26: the Characters, World and Notes panels and the chapter modal
(both faces: `ChapterDetail`, the story map, and `ManuscriptModal`) lose their partial
(collapsed) view. They only show the expanded view, and the Expand / Collapse
buttons go away. Web only. Android and the `.estoria.json` format are untouched.

The redesign of the expanded panels (to look like the chapter modal rather
than fill the screen) is a separate session. Nothing here restyles the
expanded layout.

## 1. Where the state lives

There are **two independent flags**, both UI prefs persisted in the shell
(`estoria:shell:v2` in localStorage, written from `partialize` in
`src/store/useStore.ts`), plus one document field tied to the second.

### `panelExpanded` (Characters, World, Notes)

| Where | What it does |
|---|---|
| `useStore.ts` state, default `false`, `setPanelExpanded`, `partialize` | One flag shared by all three panels. `false` = the 460px side panel. |
| `components/ui/Overlay.tsx` `Drawer` (`expanded` prop) | Side panel: `w-[460px]` column at the right, the dimmed board visible to its left. Expanded: `absolute inset-0`, content capped at 1180px and centred. |
| `components/ui/Overlay.tsx` `SizeButton` | The Expand / Collapse button. Used only by the three panels. |
| `panels/CharactersPanel.tsx` | Size button; padding (`px-[22px] py-[18px]` vs `px-[18px] py-[14px]`); `TileGrid min` 230 vs one column; `AddTile grid`; reorder mode `grid` vs `column`. **The relationship chart is forced off when collapsed** (`view = panelExpanded ? charsView : "roster"`) and **choosing Chart forces expand** (`showView`). |
| `panels/WorldPanel.tsx` | Size button, padding, tile grid, `AddTile grid`, reorder mode. |
| `panels/NotesPanel.tsx` | Size button; library `RefList tileMin` 230 vs one column. |

### `sceneFlowExpanded` (chapter modal / `ChapterDetail`)

| Where | What it does |
|---|---|
| `useStore.ts` state, default `true`, `setSceneFlowExpanded`, `partialize` | The story map modal's size. |
| `ChapterDetail.tsx` | Collapsed: modal `max-h-[92vh] w-[min(980px,100%)]`, canvas `max-h-[40vh]`. Expanded: `Scrim fill` (window less 16px), modal a flex column, canvas `min-h-[320px] flex-1`. The Expand / Collapse button is the right-most on the Scene flow row (hidden on a single piece, which is always wide). |
| `useStore.ts` `wideScenes()` | `sceneFlowExpanded || piece || anthology`. Decides which of the two stored layouts a structural scene edit lays out with the measured column count, and which with an estimate (`scenePosBoth`). |

### `manuscriptExpanded` (chapter modal / `ManuscriptModal`)

Added to the scope by Ray on 2026-11-26, after the first pass: the manuscript's
Expand / Collapse started life as the same control as the story map's, before
the manuscript became its own modal.

| Where | What it does |
|---|---|
| `useStore.ts` state, default `true`, `setManuscriptExpanded`, `partialize` | The manuscript modal's size. |
| `ManuscriptModal.tsx` | Collapsed: `h-[92vh] w-[min(980px,100%)]`. Expanded: `Scrim fill`, `min-w-0 flex-1`. The button is the right-most on the meta line, after Edit / View (none on a single piece). |

The beat rail's ‹ Hide (`beatRailHidden`) is independent of it and stays.

### In the project file: `Chapter.scenePosCompact` (flagged, not changed)

`scenePosCompact` (schema v6) is the **collapsed canvas's scene layout** and it
**is in `.estoria.json`**. `scenePos` is the expanded one. Both are written on
every structural scene edit (`scenePosBoth`) and seeded on open
(`openChapter`). `lib/sync.ts` treats both as the chapter's `layout` merge unit.

Android carries it: `StoryViewModel.kt` filters it on scene delete and nulls it
on re-arrange; `RoundTripTest.kt` asserts it survives a read-edit-write.

The modal has not read either stored layout for display for a while: the grid
is computed from the canvas width on every render (`sceneFit`). The stored
layouts exist "for the file and the phone".

**Decision: the file format does not change.** `scenePosBoth`, `openChapter`'s
seeding, `normalizeDoc` and the `sync.ts` entries stay. `wideScenes()` now
always answers "wide", so the active layout is `scenePos` (it already was
unless someone had collapsed the modal), and `scenePosCompact` is still written
from the width estimate, exactly as it is today for an expanded modal. A file
written by this build is indistinguishable from one written before it with the
modal expanded. An older web build that still has the collapsed view (a cached
service worker, another browser) still gets a valid compact layout.

### Nothing else

- No keyboard shortcut toggles either size (no key handler mentions them).
- No toolbar or menu entry; the buttons sit inside the panels and the modal.
- No tests reference `panelExpanded`, `sceneFlowExpanded`, `manuscriptExpanded`, `SizeButton` or `wideScenes`.
- No onboarding, help or About text mentions the sizes.
- `persistence.ts` has no pref whitelist: the shell's `state` is whatever
  `partialize` returns, and there is no custom `merge`.

## 2. Persisted prefs and migration

A stored `panelExpanded`, `sceneFlowExpanded` or `manuscriptExpanded` of `false` must not bring
the partial view back. Zustand's hydrate is a shallow merge of the stored
state over the defaults, so **keeping the fields with a `true` default would
not work**: the stored `false` would win.

So all three fields, their setters, their `partialize` entries and every reader are
**removed**. An old shell's keys are then inert: they land on the state object
but nothing reads them, and the next shell write drops them because
`partialize` no longer lists them. A small `merge` in the persist options
strips them on hydrate so they never sit in state at all.

**No `SCHEMA_VERSION` bump.** That number is the document schema shared with
the phone; bumping it to run `migrate` would be a file-format change.

## 3. Knock-on effects

- **Relationship chart.** It needed the full-screen panel; collapsing showed
  the roster. Now the Roster / Chart switch just switches. A stored
  `charsView: "chart"` opens Characters straight onto the chart, which before
  happened only if the panel was also expanded.
- **Closing a panel.** The panels have **no Escape handler** (none in the
  codebase except `DetailWindow`, the toolbar's inputs, the anthology view and
  the reorder hook). The side panel closed on a backdrop click; the full-screen
  panel covers its own scrim, so **the ✕ becomes the only way to close one**.
  Ray, 2026-11-26: leave it as is. No Escape added here; the redesign (which
  brings back a visible backdrop) is where closing gets revisited.
- **The chapter modal still closes on a backdrop click**: expanded keeps a 16px
  margin of dimmed board round it. The ‹ › arrows and ✕ are unchanged.
- **Small screens.** The 460px side panel was wider than a phone and the 980px
  modal capped at 100%; full screen fits any width, so this should be a small
  win. Expected from the classes, not checked at phone width.
- **Focus.** Nothing focuses on a size change; the chapter modal's focus rules
  (manuscript caret at end, draft windows) don't depend on size.
- **Views that open things partial.** Nothing opens a panel or the modal in a
  given size; every opener (toolbar buttons, chips, "Appears in", the board,
  the timeline's scene pane, beats in the manuscript rail) just opens it, and
  the size came from the pref.

## 4. What is lost

- **Working with the board visible**: the side panel left the dimmed board
  showing beside it (still inert behind the scrim, so it was only visible, not
  usable). The full-screen panel hides it.
- **The one-column tile list** in the side panel (and its column-reading drag
  order). Every list is now the 230px-minimum grid.
- **Backdrop click to close a panel** (see above).
- **The 980px story map** with a 40%-height canvas sized to its content, and
  **the 980px manuscript** at 92% of the window's height. Both faces of the
  chapter now always fill the window less 16px, so switching between Scene
  flow and Manuscript never changes the size.

Nothing is lost from the data: no field, record or layout disappears.

## 5. Left alone on purpose (Ray, 2026-11-26: keep all of these unchanged)

- **`scenesCollapsed`**: the ▸ / ▾ chevron that hides the scene canvas inside
  the story map. A section fold, not the modal's size.
- **`beatRailHidden`** (manuscript's ‹ Hide), **`textareaExpanded`** (tall /
  short notes boxes) and the **Archived · N** shelves: section folds, kept.

## 6. Files touched by the change

- `src/store/useStore.ts`: `panelExpanded`, `sceneFlowExpanded`, `manuscriptExpanded`, their setters,
  `partialize` entries removed; `wideScenes` always true; persist `merge` strips
  the retired keys.
- `src/components/ui/Overlay.tsx`: `Drawer` loses its `expanded` prop (always
  the full-screen branch, class strings unchanged); `SizeButton` removed.
- `src/components/panels/CharactersPanel.tsx`, `WorldPanel.tsx`,
  `NotesPanel.tsx`: size button gone, expanded values hard-coded, chart no
  longer gated.
- `src/components/ChapterDetail.tsx`, `ManuscriptModal.tsx`: size button gone, expanded layout always.
- The one-column branches the side panel was the only user of, now dead and
  removed: `TileGrid` without `min` (now required), `AddTile`'s `grid` prop
  (always the tall tile), `useTileReorder`'s `mode` / `"column"` (always rows),
  and `RefList` without `tileMin` (defaults to 230; its callers pass 230, 170
  or `layout="chips"`).
- Test for the prefs migration; `docs/SPECS.md` rows; `docs/SESSIONS.md` entry.
