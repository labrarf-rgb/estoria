# Plan: rearrange character and world cards (and the tiles that already reorder)

Status: **PLAN ONLY.** Ray answered the questions on 2026-11-21 (below); build
order to be chosen once all four features are planned. No feature code.
Branch: `claude/detail-cards-reorder-f20e90` (worktree), not pushed.
Mockup: [`docs/mockups/detail-cards-reorder.html`](mockups/detail-cards-reorder.html)
(clickable: every place shown with the drawer collapsed and expanded, drag,
typed position, click to open, merge sketch).

## Ray's answers (2026-11-21)

1. **Drag by the grip**, not the whole tile.
2. **Touch: yes.** The grip drags with a finger (pointer events), the first
   touch drag in the app.
3. **Restore near the old place**, as proposed.
4. **The chapter cast follows roster order**: fine.
5. **Relationship ring order** is for the relationship session to define.
   Handed over to it on 2026-11-21.
6. **Compare and merge order units: yes**, Character order, World order and,
   read as included, Library order.
7. **Phone shows the order but can't change it** for now: fine.
8. **Position numbers on character and world tiles only while rearranging.**
   Read as: hidden at rest; they appear on every tile in that list when you
   press or Tab to a grip, stay up through a drag (updating live as the space
   moves), and hide when you click away, open a card or press Escape. No
   separate Rearrange mode. Library and reference tiles are unchanged: their
   badge is always their position.

Built on the restyle, **option B everywhere** (`claude/detail-cards-style-5424f7`,
commit 84b6b02, `docs/PLAN-detail-cards.md`): every card is a chapter-style
tile, a click opens a window, the collapsed 460px drawer is one column of
tiles and the expanded drawer is a grid. Also fits the relationship chart
(`claude/relationship-chart-4c8990`, `docs/PLAN-relationships.md`).

## Decisions proposed

1. **A ⠿ grip starts a drag, nothing else does.** Grip first on the tile's
   top row, before the badge. A click anywhere else opens the window, as the
   restyle says.
2. **A typed position number**, as pinned resources have today. Character and
   world tiles show it at the end of the top row (where a chapter card has its
   cast). Library and reference tiles already show their position as the badge
   (`01`), so there **the badge is the input**, with no second number.
3. **The other tiles make room live** while you drag, and a dashed space shows
   where the card will land, in reading order (left to right, then down). The
   collapsed column uses the same code. This is how the scene map already
   reorders its grid.
4. **One shared drag** for all five places (Characters, World, Notes library,
   a world entry's references, a chapter's pinned references). It replaces
   RefList's own grip code. The store actions for references don't change.
5. **The order is the array** the file already keeps: no new field, no schema
   bump. The phone shows the new order after sync with no update.
6. **Compare and merge gets "Character order", "World order" and "Library order"** items,
   because today an order-only difference can't be seen or merged.
7. **The restyle lands first**, then this, built on `DetailCard`.

## How it works today

- **Order is array order.** The Characters and World drawers list
  `doc.characters` / `doc.world` as stored, minus archived items, with the
  unsaved draft last. New items are appended. Nothing sorts, groups or filters
  them (World is not grouped by category).
- **The order is already in the project file** and survives a round trip on
  both apps (`normalizeArchived` in `persistence.ts` and in `Normalize.kt`
  both map the array in place). The phone lists both screens in file order.
- **RefList already reorders** pinned notes, images and to-dos (library, world
  entry, chapter): a ⠿ grip in list view only, a typed number in both views,
  and "drop on a row to take its place". `reorderAsset` counts visible items
  only and leaves archived ones in their slots; `reorderChapterRef` and
  `reorderWorldRef` reorder one owner's pins.
- **The scene map** (`ChapterDetail.tsx`) reorders a grid with a live preview:
  the card follows the pointer and the others reflow (`sceneSlotAt`).
- **Every drag in the app uses mouse events** (`mousemove` on `window`), so
  none of them drag on a touchscreen.
- **The board's rule** (`Board.tsx`, `CLICK_SLOP = 4`): a press that moves
  more than 4px is a drag, one that doesn't is a click.

## Interaction

### The tile

| Place | Top row, left to right |
|---|---|
| Character | ⠿ · initials badge · role tag · · · position `3` |
| World entry | ⠿ · category badge · · · position `3` |
| Library / reference | ⠿ · position badge `03` (typed into) · kind tag |

- The grip is a 20 × 26px target around a 13px glyph, faint until hovered,
  with a focus ring. The window's own header has no grip.
- The position number on character and world tiles shows **only while
  rearranging** (answer 8): pressing or focusing any grip in a list puts that
  list in "rearranging", which shows every tile's number; clicking outside the
  grips and numbers, opening a card, or Escape ends it. While a card is
  carried, every number (the carried card's too) updates as the space moves.
  It is a CSS class on the list, not stored anywhere.

### Dragging

- **Press the grip, move 4px, and the card lifts.** The board's slop, applied
  to the grip: a still press on the grip does nothing at all.
- The lifted card follows the pointer with a deeper shadow. The card's place
  in the list becomes a dashed space, and the other tiles slide (200ms) to show
  where it will land.
- **Where the space goes:** before the first tile the pointer is "ahead of" in
  reading order. In the grid that means above the tile's row, or in its row
  and left of its middle. In the column it means above the tile's middle.
  Moving past the last tile puts the space at the end, before "+ Add". No
  separate end-of-list slot is needed.
- **Release:** the card settles into the space (150ms) and the order is saved.
- **Auto-scroll:** holding the card within 48px of the top or bottom of the
  scrolling area scrolls it, faster the closer you get. The scrolling area is
  the drawer for Characters, World and the library, the world entry's window
  for its references, and the chapter modal for pinned references.
- **Reduced motion:** no sliding, the tiles jump into place.

### Pressing the grip never opens the window

Three rules, all in the mockup:

1. The grip and the number ignore the tile's click (the tile's handler skips
   any click that starts on either).
2. The grip's pointerdown calls `preventDefault` and `stopPropagation`.
3. **After a drag, the next click is swallowed.** This is the case that would
   slip through: drop a card back where it was, and the browser fires a click
   on the tile itself, because the press and the release were both inside it.
   A flag set on release and cleared on the next tick stops that click.

### Keyboard and touch

- **Typed number:** click or Tab to it, type, Enter to move (Escape cancels).
  Out-of-range numbers clamp to first or last.
- **Grip:** Tab to it, then ← or ↑ moves one place earlier, → or ↓ one place
  later. Focus stays on the grip, and a screen reader hears "Mara Vell moved to
  position 2 of 6".
- **Touch (answer 2: yes):** pointer events, with `touch-action: none` on
  the grip only, so a finger drags by the grip and the rest of the list still
  scrolls. The first touch drag in the app; the board and other drags keep
  mouse events for now.

### Why not drag the whole tile

Option B makes this possible: tiles no longer hold inputs, so the board's rule
(press and move is a drag, press and release is a click) could apply to the
whole tile. The grip is still recommended:

- **One mechanism in five places.** References inside a window and a chapter
  sit next to text and buttons; a grip is unambiguous everywhere.
- **Touch scrolling.** A whole-tile drag on touch would fight the list's
  scroll; a grip-only drag does not.
- **Click to open stays instant** and never depends on how steady a hand is.

Ray chose the grip (answer 1).

## RefList carries over to the tiles

- RefList's grip (list view only) and "drop on a row to take its place" rule
  are replaced by the shared tile drag, in both drawer sizes and inside
  windows. Its typed number becomes the tile's badge.
- **Its store actions don't change:** `reorderAsset` (library),
  `reorderChapterRef` (chapter pins), `reorderWorldRef` (an entry's pins).
  Each place keeps its own order; a chapter's pin order is not the library's.
- The restyle's tile view keeps RefList's `onReorder` prop; this feature only
  swaps the drag underneath it, so nothing changes for callers.
- The draft tile (from "+ Note" etc.) still has no grip and no number.

## What moves when you reorder

| Place | Follows the new order? |
|---|---|
| Characters / World drawers (web) | yes, the point of it |
| Chapter modal: cast list and "add character" picker (`ChapterDetail.tsx:786–787`) | yes |
| Chapter modal: world list and picker (`ChapterDetail.tsx:855–856`) | yes |
| Board and timeline cast avatars | **no**: each chapter keeps its own `chars` order |
| Markdown export, Characters and World sections (`markdown.ts:86`) | yes |
| Phone: Characters / World screens, chapter pickers | yes, with no phone update |
| Relationship chart ring (if built) | the relationship session decides (answer 5) |
| Archive shelf | stays in array order, not reorderable |

Characters and world entries are the series bible, so there is **one order
for the whole project**, shared by every book and version.

## Archived items, the draft, filters

- **Archived items keep their slot.** The new store actions are clones of
  `reorderAsset`: the index counts visible tiles only, archived entries stay
  where they are. Archiving never shuffles the others, and **Restore puts a
  card back near where it was**, not at the end (answer 3).
- **The archive shelf** stays a compact list in array order, no grip.
- **The draft tile** has no grip or number and stays last until saved.
- **No grouping or filtering exists** in either drawer. If World ever groups
  by category, a drag across groups would need a decision then.

## Store and data (web)

1. `useStore.ts`: `reorderCharacter(id, toIdx)` and
   `reorderWorldEntry(id, toIdx)`, cloned from `reorderAsset`.
2. **No `types.ts` change, no new field, no schema bump, no `normalizeDoc`
   change.**
3. Auto-save and Drive carry it like any edit: a reorder changes the file's
   content hash (`sortKeysDeep` sorts object keys, never arrays), so it is
   written to the Estoria folder and the phone picks it up on its next pull.

## Compare and merge when two copies disagree on order

- **Today, an order-only difference is invisible.** The web diff matches
  characters and world entries by id (`sync.ts`), so a pure reorder produces no
  item. The dialog says "The versions differ only in details this report
  doesn't name" and hides See full report and Merge. The library already has
  this gap.
- **Worse, a merge drops the file's order silently.** `mergeDocs` starts from
  this copy and swaps records in place (`upsert`), so when copies differ in
  order *and* anything else, the result keeps this copy's order without saying
  so.

Proposal: three story-wide units, **Character order**, **World order** and **Library order**
(sketched at the bottom of the mockup).

- **When it appears:** only when ids present in *both* copies are in a
  different relative order. An add or delete alone never shows it.
- **What it shows:** the first few visible names in each copy's order, side by
  side, and a choice of which to keep.
- **Merge with the file's order:** shared ids take the file's sequence; a card
  only in this copy stays after the card it follows here, or at the end.
  Applied after record choices, so the two compose.
- **Tests:** diff (order-only; add-only does not trigger; archived reorder),
  merge (file's order with records from both sides). `sync.test.ts` counts the
  story-wide units (`total += 9`), so totals move to 12.
- **Library order** rides along as a third unit (answer 6), same helper.

## Android

- **No update needed for it to work.** The phone keeps the array as it is on
  load, save and merge, and shows both screens and its pickers in that order.
- **Known gaps until the phone learns it (not blockers):**
  - No way to reorder on the phone.
  - The phone's conflict summary (`DocDiff.kt`) also matches by id, so an
    order-only conflict reads **"No differences"** there, and a merge on the
    phone keeps the phone's order.
  - Items added on the phone are appended, as on the web.
- Parity later is an Android session: the two order entries in `DocDiff.kt` /
  `Merge.kt`, and a reorder control.

## Fitting with the sibling features

**Restyle, option B** (lands first):

- `DetailCard` gets two optional props, `grip` and `position`. With neither
  passed, the tile looks exactly as the restyle mocks it. For library and
  reference tiles, `position` replaces the plain badge with the typed badge.
- The tile's click handler must skip clicks that start on the grip or the
  number, and honour the "swallow the click after a drag" flag.
- The grid stays a plain CSS grid in array order, read row by row (never CSS
  columns or masonry), so drag order maps straight onto array order. The
  restyle already commits to this.
- The restyle's tile view in RefList keeps `onReorder`; this feature swaps its
  drag for the shared one.

**Relationship chart:**

- No data overlap: relationships point at ids, order is the array.
- Its field lives in the character window; the grip is on the tile. No
  overlap in the UI.
- If the ring follows roster order, reordering arranges the chart, with no
  stored layout. Ray left this to the relationship session (answer 5).
- Both features add story-wide diff units; whichever lands second updates
  the unit count in `sync.test.ts`.

## Files

- `src/components/ui/useTileReorder.ts` (new): the shared drag (4px lift,
  floating card, live reflow by reading order, auto-scroll, click swallowing,
  arrow keys, unmount cleanup).
- `src/components/ui/PositionInput.tsx` (new, lifted out of `RefList.tsx`):
  the typed number, plain and badge styles.
- `src/components/ui/DetailCard.tsx`: `grip` and `position` props.
- `src/components/ui/RefList.tsx`: drop `startGripDrag`, use the shared drag.
- `src/components/panels/CharactersPanel.tsx`, `WorldPanel.tsx`: pass grip
  and position; call the new store actions.
- `src/store/useStore.ts`: `reorderCharacter`, `reorderWorldEntry`.
- `src/lib/sync.ts`, `src/lib/merge.ts`, `src/components/modals/SyncConflictModal.tsx`:
  the two order units.
- `src/lib/sync.test.ts`, `merge.test.ts`: tests above.
- `docs/SPECS.md` §4 rows (reorder, conflict order units, pinned resources
  row updated), §8 Android note; `docs/SESSIONS.md` entry.

## Still open

1. **"Only while rearranging"** is read as above (press or Tab to a grip, no
   separate mode). If Ray meant a Rearrange button in the drawer header that
   shows grips and numbers, the drag code is the same; only the trigger moves.
2. **Library order** in compare and merge was read as included in "ok".
3. **Build order** across the four features: Ray decides once all are planned.
   This one assumes the restyle lands first.
