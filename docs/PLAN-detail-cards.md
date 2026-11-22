# Plan: character and world detail cards styled like chapter cards

Status: **PLAN ONLY**, waiting for Ray's go-ahead. No feature code.
Branch: `claude/detail-cards-style-5424f7` (worktree), not pushed.
Mockup: [`docs/mockups/detail-cards.html`](mockups/detail-cards.html)

## What differs today

| | Chapter card (`Board.tsx`, copied in `Timeline.tsx` rail) | Detail card (`CharactersPanel.tsx`, `WorldPanel.tsx`) |
|---|---|---|
| Shell | `rounded-xl`, `p-[12px_14px]`, `gap-[7px]`, `var(--shadow)`, `hover:border-faint` | `rounded-[13px]`, `p-[14px]`, no shadow, no hover |
| Top row | ink number badge (mono), status dot, cast avatars right | 34px round avatar (char) / 10px grey dot (world), name + one sub line beside it |
| Title | serif 16, its own line, faint "Untitled chapter" when empty | serif 15, inline beside the avatar |
| Body | 2-line clamped summary | none while collapsed |
| Footer | mono 11, right-aligned: parts · words | none (counts sit in the sub line) |
| Click | whole card opens the chapter modal | name or ▾ toggles inline expand; edit fields in place |

## Recommendation: option A, restyle only

The side panel is 460px (about 424px inside its padding); a chapter card is a
fixed 244px tile. Two tiles cannot sit side by side there, so a tile grid only
works at the expanded (1180px) size. The plain reading of "like chapter cards"
that works at both sizes is:

- **Same face.** Each collapsed card takes the chapter card's shell and four
  rows: badge row, serif title, 2-line summary, mono meta footer. Slot mapping:

  | Chapter slot | Character | World |
  |---|---|---|
  | Number badge | initials, `rounded-md` mono badge in the character's colour | category, ink badge |
  | Status dot | role, small uppercase tag | nothing |
  | Cast avatars | ▾ / ▴ | ▾ / ▴ |
  | Title | name | name |
  | Summary | `desc` | `desc` |
  | Footer | `archetype · in N chapters` | `on N chapters · N refs` |

- **Whole card clickable** to expand/collapse (today only the name and ▾ are),
  matching "click a card to open it". Clicks inside the expanded fields do not
  collapse it.
- **Same list, same editing.** Expanded, the card grows below a hairline rule
  and shows today's fields in today's order. Nothing about editing changes.
- Empty values read faint, like "Untitled chapter": "Unnamed character" /
  "Untitled entry" (existing copy), "No description yet" for the summary.
- The draft card ("New character", faint "Nothing saved yet…") and the
  selected-card `scrollIntoView` keep working.
- The archive shelf rows stay as they are (they are a compact list, not cards).
- Both sizes of the drawer stay a single column.

Option B (tiles in a grid at the expanded size, click opens a modal editor like
the chapter modal) is shown at the bottom of the mockup for comparison only. It
is a much larger change and overlaps with the rearrange feature; see questions.

## Files

- `src/components/ui/DetailCard.tsx` (new): the shared shell and face
  (`badge`, `tag`, `title`, `summary`, `meta`, `open`, `onToggle`, `children`
  for the expanded body). One component for both panels, so they cannot
  drift, and the natural place for a drag handle later.
- `src/components/panels/CharactersPanel.tsx`: render each roster card through
  `DetailCard`; expanded field list untouched.
- `src/components/panels/WorldPanel.tsx`: same.
- `docs/SPECS.md` §4 row + `docs/SESSIONS.md` entry.

Not touched: `Board.tsx` and `Timeline.tsx`. They already duplicate the
chapter face between them; folding them onto the same component is a separate
cleanup, not this feature. The detail card matches their classes by value.

## Data model, Drive, Android

None. No `types.ts` change, no `normalizeDoc` change, no schema bump, nothing
new in the Drive file, so the Android app is unaffected. Which card is open is
already UI state (`selChar` / `selWorld`). If any new preference appears (say
a list/grid toggle under option B) it stays out of `doc`, like `beatRailHidden`.

## Coexisting with the other two features

- **Relationship chart** (`claude/relationship-chart-4c8990`): it adds a
  Relationships field under "Appears in" in the expanded character card. This
  plan only replaces the card shell and the collapsed face, and leaves the
  expanded field list's structure alone, so the field drops in as a child of
  `DetailCard`. Its open question "tie count in the card subtitle" would land
  in this card's mono footer (`… · in 9 chapters · 3 ties`). Whichever lands
  first, the other rebases; the conflict should be small and mechanical.
- **Rearrangeable cards** (later): the list stays a plain flex column in
  `doc.characters` / `doc.world` order (row-major if a grid ever comes), never
  CSS columns or masonry, so drag order maps straight onto array order.
  `DetailCard` gets the drag handle then. Whole-card click to expand will need
  the same "a press that moves is a drag, one that doesn't is a click" rule
  the board uses; noted for that session.

## Questions for Ray

1. **Look, or look and behave?** Option A (restyle the list, keep editing in
   place) or option B (tiles, click opens an editor like the chapter modal)?
2. **Character badge:** initials in the character's colour (as mocked), or
   keep the round avatar and put the role in the badge?
3. **World badge:** category in an ink badge (as mocked), or give each
   category its own muted colour (new tokens, presentation only)?
4. **Footer:** `archetype · in N chapters` for characters and
   `on N chapters · N refs` for world. Right fields?
5. **Summary source:** `desc` for both. For a character with no description,
   fall back to the start of the bio, or just show "No description yet"?
6. **Expanded size:** stay a single column (as planned), or a two-column list
   of cards when the drawer is full screen?
7. **Order with the relationship chart:** fine for whichever is approved first
   to land first?
