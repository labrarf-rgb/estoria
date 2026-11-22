# Plan: character relationships (proposal, NOT STARTED)

> Drafted 2026-11-21 for review. Nothing here is built or decided. The mockup is
> [`mockups/relationship-chart.html`](mockups/relationship-chart.html). When Ray
> approves a version of this, the decisions move into SPECS (§1 core concepts,
> §4 feature status, §8 cross-app notes) and this file is archived.

## What it is

A way to record how characters relate (who is family, who is a rival, how each
one sees the other) and to see it as a chart. Relationships are edited in each
character's window (opened from its card); the chart is a second view of the
Characters drawer.

## Data model

Three new optional top-level fields on `StoryDoc`, beside `characters`:

```ts
relationships?: Relationship[];
relationshipKinds?: RelationshipKind[];   // absent = the starter set
relationshipLayout?: Record<string, { x: number; y: number }>;
                     // character id -> where it was dragged on the chart,
                     // as fractions (0-1) of the chart's width and height

export interface RelationshipKind {
  id: string;          // starter kinds keep fixed ids; new ones get a fresh id
  name: string;        // "Rival", or whatever the writer renames it to
  color: number;       // 1-10: one of ten muted palette swatches
}

export interface Relationship {
  id: string;          // own id: merges as its own unit
  a: string;           // character id
  b: string;           // character id, a !== b
  kind?: string;       // a RelationshipKind id; missing or unknown = "No kind"
  label?: string;      // free text: "former mentor", "sisters"
  aView?: string;      // how a sees b
  bView?: string;      // how b sees a
  notes?: string;
}
```

Why this shape:

- **Top level, not on `Character`.** A pair stored on both characters could be
  merged half from each copy and contradict itself. One record per pair can't.
- **Top level, not on `BookData` / `VersionData`.** Characters are the series
  bible, shared by every book and version, so relationships are too. It also
  keeps clear of the "new board field needs a phone update first" contract (§8).
- **One record per pair, two optional points of view.** Covers one-sided
  feelings without a direction flag, and keeps the chart to one line per pair.
- **Kinds are the project's own list, label is free.** Every project starts
  with a starter set (Family, Friend, Romance, Mentor, Rival, Other, ids
  `family`... `other`, colors 1-6). The writer can rename, recolor, add and
  remove kinds. The label is still free text for the specifics. Every line is
  labeled, so color is never the only cue.
- **Colors come from a fixed palette of ten swatches,** not a free color
  picker, so every kind stays muted and readable in light and dark. Kinds past
  ten reuse colors; the labels still tell them apart.
- **Absent means the starter set.** A file without `relationshipKinds` reads
  as the six starters, and the first edit writes the whole list. Because the
  starter ids are fixed, two devices that never edited kinds agree, and a
  relationship made on either uses the same ids.
- **Removing a kind keeps its relationships.** The confirm says how many use it;
  they stay, shown as "No kind" (their `kind` is cleared). Nothing is deleted.
- **Kinds are per project,** stored in the file, so they travel to Drive, other
  browsers and the phone. They are series-wide like characters.
- **Plus a saved default for new projects** (Ray, 2026-11-21), built exactly
  like Author details' saved default (`authorDefault`):
  - `relationshipKindsDefault` in the store, persisted by `partialize` in this
    browser only, **never in the project file**. Another browser or the phone
    has its own (or none).
  - **New projects copy it in** as their stored `relationshipKinds`, at the
    same places `withAuthor(..., s.authorDefault)` runs today (new project, new
    piece, Start fresh). Without a saved default, new projects get the starter
    six as now.
  - **An existing project with no stored list and no relationships yet** takes
    the default the first time the chart or Edit kinds opens (mirrors
    `fillAuthorFromDefault`). A project that already has relationships is never
    changed silently.
  - The Edit kinds footer copies Author details' footer: one status line
    ("Save these as your default and every new project starts with them." /
    "Same as your saved default. New projects start with these." / "Different
    from your saved default. Only this project changes."), then **Use saved
    default** (only when one exists and differs), **Save as default** (only
    when different), **Done**.
  - **Use saved default replaces this project's list.** Relationships whose kind
    isn't in the default stay, shown as "No kind"; if any would, it asks first
    and says how many. Kind ids carry over from the default, so projects started
    from the same default share ids.
- **Chart positions are saved in the project** (Ray, 2026-11-21: "I want the
  characters movable"), the way chapter positions on the board are. Only a
  character that has been dragged has an entry; everyone else sits on the ring
  in roster order. Fractions rather than pixels, so the layout fits any drawer
  width and both drawer sizes.
- **No schema bump.** Optional fields, same precedent as `manuscript`, `author`,
  `pace`.

## UI

Built on the detail-card restyle Ray chose (option B, see "Fitting with the
detail-card plans" below): characters are tiles, and clicking one opens the
character in a window.

- **Chart:** a Roster / Chart switch in the Characters drawer header. Chart opens
  the drawer at its expanded size.
  - **Drag characters anywhere**; positions are saved (`relationshipLayout`).
    A press that moves more than 4px is a drag, one that doesn't is a click
    (the board's `CLICK_SLOP` rule). Pointer events with `touch-action: none` on
    the character, so it drags on touch too. Arrow keys move a focused
    character 12 units, the keyboard path.
  - **Characters not yet moved sit on a ring in roster order** (clockwise from
    the top). **Arrange in a ring** (shown once anything has been moved) clears
    the saved positions, with a short animation.
  - **Clicking a character highlights their ties** and dims the rest; nothing
    moves, so the arrangement is kept. Its panel lists the ties and has
    "Open <name>'s card", which opens the character window. Clicking a line
    shows both points of view in the side panel, with Edit.
  - **Labels never overlap.** Each label tries spots along its line from the
    middle outwards, then just beside the line, and takes the first that clears
    every character (disc and name) and every label already placed; short lines
    are placed first. Labels draw above characters. They are re-placed on every
    move. If nothing is fully clear (a very crowded chart), the spot with the
    least overlap wins.
  - Kind filters; "Show archived" off by default (archived characters sit apart
    from the ring unless moved).
- **Character window:** a new "Relationships" field under "Appears in", listing
  ties (other character, kind, label, both views). Click a row to edit,
  "+ Add relationship" to add, "See on chart" to close the window and jump to the
  chart with this character centered. Archived characters' windows list their
  ties but have no Add button.
- **Tile footer:** the restyle's mono footer ("archetype · in N chapters") gains
  "· N ties" when there are any (archived partners not counted). Optional.
- **Editor:** one small dialog: With (picker; self, archived and already-tied
  characters excluded), Kind (the project's kinds plus "No kind"), Label, both
  views, Notes. Remove in the footer. It opens over the character window, or
  over the drawer from the chart.
- **Edit kinds:** a small dialog opened from "Edit kinds" in the chart's side
  panel or beside Kind in the editor. One row per kind: color swatch (opens the
  ten-swatch palette), name, how many relationships use it, remove. "+ Add kind"
  at the end; Done closes. Removing a kind in use asks first, inline. It stacks
  above the editor when opened from there, and the editor keeps what was typed.
- **Empty state:** plain copy pointing at the character's card.

## Fitting with the detail-card plans

Two sibling plans change the character card. Neither is merged; this plan
assumes both as currently written.

**Restyle** (`claude/detail-cards-style-5424f7`, `docs/PLAN-detail-cards.md`;
Ray chose option B, everywhere):

- The expanded card goes away. Its fields move unchanged into a window
  (`DetailWindow.tsx`), so the Relationships field goes into that window's
  field block, under "Appears in", instead of into the inline card.
- The tie count goes in `DetailCard`'s footer slot, as the restyle suggests.
- **Stacking:** the restyle puts its window between the chapter modal and
  `ConfirmDialog`. The relationship dialog opens from inside that window, so it
  sits one level above it and still below `ConfirmDialog` (Remove asks for no
  confirmation today; if it ever does, the confirm stacks on top).
- "See on chart" closes the window (the restyle's `selChar` becomes "which
  window is open") and switches the drawer to Chart.
- **Landing order:** the restyle should land first. If relationships landed
  first, the field would go into today's inline card and move into the window
  with the rest of the field block; a small rebase either way.

**Rearrange** (`claude/detail-cards-reorder-f20e90`,
`docs/PLAN-detail-cards-reorder.md`):

- The grip and typed position number sit at the head of the tile's top row,
  before the badge. Nothing here touches them; the mockup shows them so the
  tile matches.
- **The ring follows roster order** (the array order of `doc.characters`,
  non-archived only), but only for characters that haven't been dragged, and
  for Arrange in a ring. Now that positions are saved, rearranging cards no
  longer moves anyone already placed on the chart. That is the answer to the
  rearrange plan's question 5.
- No data overlap: relationships point at ids, order is the array.
- Both features add story-wide units to the conflict diff; whichever lands
  second updates the unit count in `sync.test.ts` (`total += 9` today).
  Relationships adds two story-wide units, Relationship kinds and Chart layout,
  plus one row per relationship. Rearrange adds three (Character order, World
  order, Library order). With both landed it is `total += 14`.

## Store, persistence, sync (web)

1. `types.ts`: `Relationship`, `RelationshipKind`, `StoryDoc.relationships?`,
   `StoryDoc.relationshipKinds?`; `lib/relationships.ts` with `STARTER_KINDS`
   and `kindsOf(doc)` (the stored list, or the starters when absent).
2. `persistence.ts` `normalizeDoc`: **whitelist both fields** (it rebuilds the
   top level from named keys; without this a file round trip drops it, the trap
   piece mode hit). Read defensively: drop entries with a missing endpoint, a
   self-tie, or a duplicate pair (the pair is unordered: (a,b) and (b,a) are
   the same pair; keep the first); a `kind` that names no kind is cleared (the
   tie is kept, as "No kind"); blank strings dropped; omit `relationships` when
   empty. Layout: drop positions for characters that don't exist and any
   non-finite value, clamp to 0-1, omit when empty. Kinds: drop entries without an id, dedupe ids, clamp `color` to 1-10,
   keep a blank name (shown as "Unnamed kind"). An empty list `[]` is kept and
   means "no kinds", which is different from absent (the starters).
3. `useStore.ts`: `relationshipKindsDefault` (+ `partialize`),
   `setRelationshipKindsDefault`, `fillKindsFromDefault`, and the default copied
   in wherever `authorDefault` is; `addRelationship`, `updateRelationship`,
   `removeRelationship`;
   `addKind`, `updateKind`, `removeKind` (the first kind edit writes the
   starters out as the stored list; `removeKind` clears `kind` on the
   relationships that used it); `moveOnChart(id, x, y)` and `arrangeChart()`
   (clears the layout). `deleteCharacter` also drops the character's position.
   `deleteCharacter` removes that character's relationships (no dangling ids,
   §9 item 5's bug class) and its confirm text counts them. Archive keeps them.
   Project merge (`dedupeById` for characters) unions relationships too.
4. `sync.ts` diff: a `relationship` unit, labeled by the two names, so a
   relationship-only difference shows in the conflict dialog; and one
   story-wide `doc:relationshipKinds` unit ("Relationship kinds") for the list,
   taken whole like chapter connections (per-kind merging could pair one copy's
   name with the other's color). Absent and the starter list compare equal.
   And one `doc:relationshipLayout` unit ("Chart layout"), also taken whole,
   like board view settings.
5. `merge.ts`: take/keep per relationship, plus **reference closure** (a kept
   relationship brings in both characters it points at, reported first, and
   its kind if the kept kind list lacks it).
6. Markdown/structure export: a Relationships section under Characters, if
   export covers characters today (check `lib/` export code first).
7. Tests: normalize round trip and pruning, delete cascade, kind removal,
   absent-vs-starters equality, diff units, merge closure (`sync.test.ts`
   style).

## Android

- **The phone keeps it without an update.** Checked in `Estoria-aa`:
  `Normalize.kt` builds the doc from `d.toMutableMap()` and overwrites only
  known keys, and `StoryDoc` has the `ExtrasSerializer` passthrough. So
  `relationships`, `relationshipKinds` and `relationshipLayout` round-trip
  untouched.
- **Known gaps until the phone learns it (not blockers):**
  - Deleting a character on the phone leaves its relationships behind; the web
    drops them on read (step 2).
  - The phone's conflict summary won't name a relationship-only difference.
  - No view on the phone. A read-only list on the character screen would be the
    natural first step if wanted.

## Open questions for Ray

See the report in the session; repeated here so they stay with the plan.

1. Static map, or track change over the story ("rival from Ch 3")? Changes would
   tie relationships to chapters, which fork per version: a much bigger change.
   Proposal: static first.
2. Kinds are editable per project, with a saved default for new projects
   (decided). Is Family, Friend, Romance, Mentor, Rival, Other the right
   starter set for when no default is saved?
3. Chart in the drawer (proposed), or a third main view beside Board / Timeline?
4. (Decided: characters are draggable and positions are saved in the project.)
   Should the layout be shared by every device through the file (proposed, like
   the board), or kept per browser?
5. Tie count in the tile footer: yes or no?
6. Phone: leave it carrying the data silently, or plan a read-only list there?
