# Plan: character relationships (proposal, NOT STARTED)

> Drafted 2026-11-21 for review. Nothing here is built or decided. The mockup is
> [`mockups/relationship-chart.html`](mockups/relationship-chart.html). When Ray
> approves a version of this, the decisions move into SPECS (§1 core concepts,
> §4 feature status, §8 cross-app notes) and this file is archived.

## What it is

A way to record how characters relate (who is family, who is a rival, how each
one sees the other) and to see it as a chart. Relationships are edited on each
character's card; the chart is a second view of the Characters drawer.

## Data model

One new optional top-level field on `StoryDoc`, beside `characters`:

```ts
relationships?: Relationship[];

export type RelationshipKind = "family" | "friend" | "romance" | "mentor" | "rival" | "other";

export interface Relationship {
  id: string;          // own id: merges as its own unit
  a: string;           // character id
  b: string;           // character id, a !== b
  kind: RelationshipKind;  // fixed list, sets the color; unknown reads as "other"
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
- **Kind is a fixed list, label is free.** Color needs a small fixed set; the
  specifics are the writer's words. Every line is labeled, so color is never the
  only cue.
- **No schema bump.** Optional field, same precedent as `manuscript`, `author`,
  `pace`.

## UI

- **Chart:** a Roster / Chart switch in the Characters drawer header. Chart opens
  the drawer at its expanded size. Characters sit on a ring; clicking one puts
  them in the middle with their ties around them; clicking a line shows both
  points of view in a side panel with Edit. Kind filters; "Show archived" off by
  default. **No stored layout**, so nothing to sync or merge for positions.
- **Card:** a new "Relationships" field under "Appears in" on each character
  card, listing ties (other character, kind, label, both views). Click to edit,
  "+ Add relationship" to add, "See on chart" to jump.
- **Editor:** one small dialog: With (picker; self, archived and already-tied
  characters excluded), Kind, Label, both views, Notes. Remove in the footer.
- **Empty state:** plain copy pointing at the card.

## Store, persistence, sync (web)

1. `types.ts`: `Relationship`, `RelationshipKind`, `StoryDoc.relationships?`.
2. `persistence.ts` `normalizeDoc`: **whitelist the field** (it rebuilds the
   top level from named keys; without this a file round trip drops it, the trap
   piece mode hit). Read defensively: drop entries with a missing endpoint, a
   self-tie, or a duplicate pair (keep the first); unknown kind becomes "other";
   blank strings dropped; omit the field when empty.
3. `useStore.ts`: `addRelationship`, `updateRelationship`, `removeRelationship`.
   `deleteCharacter` removes that character's relationships (no dangling ids,
   §9 item 5's bug class) and its confirm text counts them. Archive keeps them.
   Project merge (`dedupeById` for characters) unions relationships too.
4. `sync.ts` diff: a `relationship` unit, labeled by the two names, so a
   relationship-only difference shows in the conflict dialog.
5. `merge.ts`: take/keep per relationship, plus **reference closure** (a kept
   relationship brings in both characters it points at, reported first).
6. Markdown/structure export: a Relationships section under Characters, if
   export covers characters today (check `lib/` export code first).
7. Tests: normalize round trip and pruning, delete cascade, diff unit, merge
   closure (`sync.test.ts` style).

## Android

- **The phone keeps it without an update.** Checked in `Estoria-aa`:
  `Normalize.kt` builds the doc from `d.toMutableMap()` and overwrites only
  known keys, and `StoryDoc` has the `ExtrasSerializer` passthrough. So
  `relationships` round-trips untouched.
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
2. Is the kind list right (Family, Friend, Romance, Mentor, Rival, Other)?
3. Chart in the drawer (proposed), or a third main view beside Board / Timeline?
4. Auto layout only (proposed), or let characters be dragged and remember where?
5. Tie count in the card subtitle: yes or no?
6. Phone: leave it carrying the data silently, or plan a read-only list there?
