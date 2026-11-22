# Plan: every detail card looks and opens like a chapter card

Status: **PLAN ONLY.** Ray chose option B and "everywhere" on 2026-11-21 and is
confirming against the mockup. No feature code yet.
Branch: `claude/detail-cards-style-5424f7` (worktree), not pushed.
Mockup: [`docs/mockups/detail-cards.html`](mockups/detail-cards.html) (option B
everywhere, both drawer sizes, each with a card opened).

## The decision

**Option B, everywhere.** Each card takes the board chapter card's face, and
clicking it opens a window on top (as clicking a chapter opens the chapter),
instead of expanding in the list. Collapsed drawer (460px side panel): one
column. Expanded drawer (full screen, ≤1180px): a grid of tiles.

Rejected: option A (chapter look, but still expanding in place).

## Where it applies

| Place | Today | Option B |
|---|---|---|
| Characters drawer (`CharactersPanel.tsx`) | one-line rows, expand in list | tiles, open in a window |
| World drawer (`WorldPanel.tsx`) | one-line rows, expand in list | tiles, open in a window |
| Notes library (`NotesPanel.tsx` via `RefList`) | list or cards (switch), expand in list | tiles, open in a window; no switch |
| World entry references (`RefList` in the world window) | list or cards (switch) | tiles inside the entry's window |
| Chapter pinned references (`RefList` in `ChapterDetail.tsx`) | list or cards (switch) | tiles, open in a window over the chapter |
| Story notes box, chapter cast and world chips | | unchanged |

## The card face (one shared component)

| Slot (chapter card) | Character | World | Library / reference item |
|---|---|---|---|
| Ink number badge | initials, in the character's colour | category | position number (`01`) |
| Status dot | role, small uppercase tag | | kind: Note / To-do / Image |
| Title (serif 16) | name | name | label |
| 2-line body | description | description | note text · open to-do items · the picture |
| Mono footer | archetype · in N chapters | on N chapters · N refs | to-do progress · N pins |

Empty values read faint, like "Untitled chapter" (existing copy:
"Unnamed character", "Untitled entry", "Untitled note"; "No description yet").

## The window

One shared window shell (badge + title + ✕ header, scrolling body) holding the
**same fields as today's expanded card, in the same order**, plus Archive /
Delete at the foot. For a reference pinned on a chapter or world entry, the foot
is "Remove from this chapter / entry" with "It stays in the shared library",
matching today's detach rule. The window stacks over the chapter modal for
chapter references (z-order between the chapter modal and ConfirmDialog).

Things that must survive the move from expand-in-list to a window:
- **Draft cards.** "+ Add character / world entry / note" opens the window on
  the blank draft; nothing is saved until something is typed (today's rule).
  Closing an untouched draft discards it.
- **"+ Create new character" from a chapter** opens the window over the chapter
  (today it opens the drawer and scrolls to the new card).
- **`jumpToWorldEntry` and "Appears in" / "Pinned in" chips**: jumping to an
  entry opens its window; a chip inside a window closes it and navigates.
- **Lightbox** for images still opens from the image inside the window.
- `selChar` / `selWorld` become "which window is open". UI state only.

## Files

- `src/components/ui/DetailCard.tsx` (new): the tile face, used by all five places.
- `src/components/ui/DetailWindow.tsx` (new): the window shell.
- `CharactersPanel.tsx`, `WorldPanel.tsx`: tiles in list / grid by drawer size;
  the field block moves into the window unchanged.
- `RefList.tsx`: the tile view replaces both list and card views; editing moves
  into the window. Keep its `onReorder` and position numbers (see below).
- `NotesPanel.tsx`, `ChapterDetail.tsx`: drop the `ViewToggle`.
- `ViewToggle.tsx` and the `refView` preference: removed if nothing else uses
  them (`refView` is a UI preference, not in `doc`).
- Store: the open-window id(s), and draft handling that opens a window.
- `docs/SPECS.md` §4 rows (Panels, Pinned refs, Library) and `docs/SESSIONS.md`.

Not touched: `Board.tsx`, `Timeline.tsx` (the chapter face stays theirs; the
new component matches it by value).

## Data model, Drive, Android

None. No `types.ts` change, no `normalizeDoc` change, no schema bump, nothing
new in the Drive file, so the Android app is unaffected. Removing `refView`
only drops a local preference.

## Coexisting with the other two features

- **Relationship chart** (`claude/relationship-chart-4c8990`) puts its
  Relationships field under "Appears in" on the character card. Under option B
  that field lives in the character **window**; its "+ Add relationship" dialog
  would stack over that window. A tie count, if wanted, goes in the tile's mono
  footer. Whichever lands first, the other rebases.
- **Rearrangeable cards** (`detail-cards-reorder` session): option B makes
  this simpler, since a tile no longer expands, so dragging a tile is the same
  move as dragging a chapter card on the board (a press that moves is a drag,
  one that doesn't is a click). `RefList` already has grip-drag reorder and
  position numbers; the tile view should keep them working so that session
  extends one mechanism to characters and world rather than inventing a second.
  This restyle should land first so reorder is built on tiles.

## Open questions for Ray

1. Does the mockup match what you want, for all five places?
2. Opening a card from the **collapsed** drawer: the window opens in the
   middle of the screen over everything (as mocked). OK?
3. Library tiles drop the List / Cards switch entirely. OK to remove it?
