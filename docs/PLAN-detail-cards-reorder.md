# Plan: rearrange character and world cards

Status: **PLAN ONLY**, waiting for Ray's go-ahead. No feature code.
Branch: `claude/detail-cards-reorder-f20e90` (worktree), not pushed.
Sibling plans it has to fit: `claude/detail-cards-style-5424f7`
(`docs/PLAN-detail-cards.md`) and `claude/relationship-chart-4c8990`
(`docs/PLAN-relationships.md`).

## How it works today

- **Order is array order.** The Characters and World drawers list
  `doc.characters` / `doc.world` as stored, minus archived items, with the
  unsaved draft card drawn last. New items are appended. Nothing sorts them,
  and neither drawer groups or filters (World is not grouped by category).
- **The order is already in the project file**, and survives a round trip on
  both apps: the web's `normalizeArchived` (`persistence.ts`) and Android's
  (`Normalize.kt`) both map the array in place. The phone lists both screens
  in file order too (`CharactersScreen.kt`, `WorldScreen.kt`).
- **The closest precedent is `RefList`** (pinned notes, images, to-dos): a ⠿
  grip is the only drag source, and a typed position number sits beside it
  (SPECS §4 "Reorder pinned resources"). `reorderAsset` moves an item among the
  visible (non-archived) items and leaves archived ones in their slots.
- **Every drag in the app uses mouse events** (`mousemove` on `window`: board,
  scene map, series map, RefList). None of them drag on a touchscreen.
- **The board's rule** (`Board.tsx`, `CLICK_SLOP = 4`): every press on a card
  starts a drag, and a release that moved less than 4px is a click that opens
  the chapter. It exists because the whole chapter card is both the handle and
  the button.

## What moves when you reorder

Reordering the roster changes more than the drawer, because these places read
`doc.characters` / `doc.world` in array order:

| Place | Follows the new order? |
|---|---|
| Characters / World drawers (web) | yes, the point of it |
| Chapter modal: cast list and "add character" picker (`ChapterDetail.tsx:786–787`) | yes |
| Chapter modal: world links picker | yes |
| Board and timeline cast avatars | **no**: they follow each chapter's own `chars` order |
| Markdown export, Characters and World sections (`markdown.ts:86`) | yes |
| Phone: Characters / World screens, chapter pickers | yes, with no phone update |
| Relationship chart ring (if built) | yes, if it lays characters out in roster order (proposed) |
| Archive shelf | stays in array order, not reorderable (see below) |

Characters and world entries are the series bible, so there is **one order
for the whole project**, shared by every book and version.

## Interaction (recommended: follow RefList)

- **A grip handle, not whole-card drag.** A ⠿ grip at the left of the card's
  top row is the only thing that starts a drag. An expanded card is full of
  inputs and textareas, and whole-card drag would turn text selection into
  drags. With grip-only, the board's press-that-moves rule is **not needed**:
  a click anywhere else on the card opens or closes it, as the restyle plans.
- **A typed position number** beside the grip, as in RefList: click it, type
  `1`, press Enter, and the card moves to the top. This is the keyboard path and
  the touch path, so no extra move-up / move-down buttons are needed. The number
  counts the cards you can see (archived ones are not counted).
- **Keyboard on the grip (small extra):** the grip is a focusable button, and
  ↑ / ↓ move the card one place while it has focus. The number field covers this
  already, so it is optional.
- **While dragging:** the card being carried dims (as in RefList), a line shows
  where it will land, and the drawer scrolls by itself when the pointer nears
  its top or bottom edge, so a long roster can be reordered in one go.
- **Drop rule: before or after by midpoint**, not RefList's "drop on a row to
  take its place". An open card can be taller than the drawer, so "on it" would
  be a huge target with no way to say above or below. A line between cards is
  exact, and the top and the end of the list are both reachable without an
  end-of-list slot.
- **Open cards can be dragged** as they are. The open one stays open, since
  which card is open is tracked by id (`selChar` / `selWorld`).
- **The draft card** (from "+ Add character") has no grip and no number, and
  stays last until it is saved, as in RefList.
- **Touch (question 2):** with mouse events the grip will not drag on the iPad
  or a touchscreen laptop; the number still works there. Switching this one
  drag to pointer events (with `touch-action: none` on the grip only, so the
  list still scrolls) makes it work on touch too, but it would be the first
  touch drag in the app.

## Archived items, the draft, filters

- **Archived items keep their slot.** The store actions are clones of
  `reorderAsset`: the target index counts visible cards only, and archived
  entries stay where they are in the array. So archiving a card never shuffles
  the others, and **Restore puts a card back roughly where it was**, not at the
  end (question 3).
- **The archive shelf** stays a compact list in array order with no grip. Its
  order is not something you would curate.
- **No grouping or filtering exists** in either drawer today, so there is
  nothing to reconcile. If World ever groups by category, the order within
  each group would still be array order, and a drag across groups would need
  a decision then.

## Store and data (web)

1. `useStore.ts`: `reorderCharacter(id, toIdx)` and
   `reorderWorldEntry(id, toIdx)`, cloned from `reorderAsset` (visible index,
   archived slots kept, no-op when nothing moves).
2. **No `types.ts` change, no new field, no schema bump, no `normalizeDoc`
   change.** The order is the array.
3. Auto-save and Drive mirror it like any edit: a reorder changes the file's
   content hash (`sortKeysDeep` sorts object keys, never arrays), so it is
   written to the Estoria folder and the phone picks it up on its next pull.

## Compare and merge when two copies disagree on order

This is where today's code falls short, and the feature would make it common.

- **Today, an order-only difference is invisible.** The web diff matches
  characters and world entries by id (`sync.ts`), so a pure reorder produces no
  item. The dialog says "The versions differ only in details this report
  doesn't name", and hides See full report and Merge, so the only choice is
  keeping one whole copy. Asset (library) reorders already have this gap.
- **Worse, a merge drops the file's order silently.** `mergeDocs` starts from
  this copy and swaps records in place (`upsert`), so if the copies differ in
  order *and* in anything else, the merged result always keeps this copy's
  order and nothing says so.

Proposal: two new story-wide units in the diff, **Character order** and
**World order**.

- **When it appears:** only when the ids present in *both* copies are in a
  different relative order. Adding or deleting a card on one side changes its
  own unit, not the order unit, so an add alone never shows an order
  difference.
- **What it shows:** "Character order differs", with a short line naming the
  first few cards in each copy's order (visible ones only), for example
  "Here: Mara, Ilse, Tomas … / In the file: Ilse, Mara, Tomas …".
- **Merge, choosing the file's order:** the shared ids take the file's
  sequence; a card only in this copy stays after the card it follows here, or
  at the end. Choosing "this copy" is today's behaviour. It applies after
  record choices, so taking a character from the file and taking the file's
  order compose cleanly.
- **Tests:** diff (order-only, add-only does not trigger, archived reorder),
  merge (take order with records taken from both sides). `sync.test.ts` counts
  the story-wide units (`total += 9`), so expected totals move to 11.
- **Library (asset) order** has the same gap and could ride along as a third
  unit at almost no cost (question 6).

Where the conflict comes from in practice: two browsers (laptop and iPad)
reordering offline, or reorder on one and edit on the other.

## Android

- **No update needed for it to work.** The phone keeps the array as it is on
  load, save and merge, and shows both screens and its chapter pickers in that
  order. A web reorder simply appears on the phone after sync.
- **Known gaps until the phone learns it (not blockers):**
  - No way to reorder on the phone.
  - The phone's conflict summary (`DocDiff.kt`) also matches by id, so an
    order-only conflict reads **"No differences"** there, and a merge on the
    phone keeps the phone's order. The web would carry the right order the next
    time it compares.
  - New items added on the phone are appended, as they are on the web.
- If parity is wanted later, the phone needs the two order entries in
  `DocDiff.kt` / `Merge.kt` and a reorder control (long-press drag in Compose,
  or move up / move down). That is an Android session, not this one.

## Fitting with the two sibling features

**Detail-card restyle** (`DetailCard.tsx`, not merged yet):

- `DetailCard` gets two optional props: `grip` (the handle node) and
  `position` (the number field). Both sit at the head of the badge row, before
  the initials / category badge, the same order RefList uses (grip, number,
  icon). With neither passed, the card looks exactly as the restyle mocks it.
- **The grip and the number must stop propagation** on mousedown and click,
  so pressing them never toggles the card open. That is the only change to
  the restyle's "click anywhere opens it" rule. The board's 4px click-slop rule
  is not needed, because the grip is the only drag source.
- The list stays a plain flex column in array order, which the restyle plan
  already commits to.
- **If this lands first**, the grip and number go into today's card row in
  `CharactersPanel.tsx` / `WorldPanel.tsx`, and the restyle moves them into
  `DetailCard`'s slots when it lands. Either order is a small, mechanical rebase.

**Relationship chart** (`relationships[]`, not merged yet):

- No data overlap: relationships point at character ids, and order is the
  array. Reordering never touches them.
- Its new Relationships field sits inside the expanded card body; the grip is
  on the top row. No overlap in the card either.
- If the chart's ring places characters in roster order, reordering becomes
  how you arrange the ring, with no stored layout. Worth deciding with that
  feature (question 5).
- Both features add a story-wide unit to the diff. Whichever lands second
  bumps the expected unit count in `sync.test.ts`.

## Files

- `src/store/useStore.ts`: `reorderCharacter`, `reorderWorldEntry`.
- `src/components/ui/useListDrag.ts` (new): the grip drag for a vertical
  list (hit test by midpoint, insertion line, edge auto-scroll, unmount
  cleanup), so both drawers share one copy. RefList keeps its own for now.
- `src/components/ui/PositionInput.tsx` (new, or exported from `RefList.tsx`):
  the typed position number RefList already has.
- `src/components/panels/CharactersPanel.tsx`, `WorldPanel.tsx`: grip,
  number, insertion line, through `DetailCard` if the restyle has landed.
- `src/lib/sync.ts`, `src/lib/merge.ts`: the two order units.
- `src/lib/sync.test.ts`, `merge.test.ts`: tests above.
- `docs/SPECS.md` §4 rows (reorder, conflict order units), §8 Android note;
  `docs/SESSIONS.md` entry.

## Open questions for Ray

1. **Grip or whole card?** Grip handle plus a typed position number, as on
   pinned notes (proposed), or drag the whole collapsed card?
2. **Touch:** should the grip drag on the iPad and touchscreens (pointer
   events, the first touch drag in the app), or is the typed number enough
   there for now?
3. **Restore:** an archived card comes back near its old place (proposed), or
   at the end of the list?
4. **Chapter cast:** the chapter modal's cast list and picker will follow your
   roster order. Fine? (Board avatars keep each chapter's own order.)
5. **Relationship chart:** should its ring follow roster order, so reordering
   arranges the chart?
6. **Conflict dialog:** add Character order and World order to compare and
   merge (proposed)? Include the library's order too, which has the same gap
   today?
7. **Phone:** fine for the phone to show the order but not change it for now,
   with the "No differences" conflict wording as a known gap?
8. **Landing order:** fine for this to land after the restyle, putting the
   grip in `DetailCard`, or whichever is approved first?
