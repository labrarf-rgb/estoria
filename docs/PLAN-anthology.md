# Anthology: plan (NOT BUILT)

> Status: **plan and mockup only, waiting for Ray's go-ahead.** No feature code.
> Branch `claude/anthology-f37dea`. Mockup: [`mockups/anthology.html`](mockups/anthology.html)
> (private artifact: https://claude.ai/artifact/UUT7734mz17ke7Y2CBwbFo).
>
> In Ray's words: *"a way to turn poems / short stories / etc into an
> 'anthology' when turned from a single piece into a book. The difference is
> that it keeps how things are as poems / short stories / etc."*

---

## 1. What happens today

A single piece is one chapter that is never shown as a chapter (`lib/piece.ts`).
**Expand into a book** already asks *One longer work* or *A collection*, but the
answer only sets `grownInto`, a label (`formLabel` → "Poetry collection"). After
expanding, a collection is an ordinary book:

| What the piece had | What the "collection" book does with it |
| --- | --- |
| Its **kind** (poem, story, essay) | Lifted to the project (`doc.kind`). Every chapter added later is called by that kind's part name. A poem collection that gains a story calls the story's scenes "stanzas". |
| **Line breaks kept** (`keepLineBreaks`, on for a poem) | Also project-wide. A mixed book either joins every poem's lines into paragraphs, or keeps every story's stray single line breaks. |
| **Opens as a page** (title, Map / Write) | Becomes a chapter card on a board: numbered, with an act, opening in the chapter modal over the board. |
| **Its title** | Becomes "Chapter 1. Title" in every export. |
| Other **piece projects** you already wrote | No way in. Merge only goes into a series. |
| Getting one piece **back out** | Only *Turn into single piece*, which joins **every** chapter into one. |

So nothing is lost in the file, but the book stops treating its contents as
poems and stories. That is the gap.

## 2. Decisions (Ray, 2026-11-21)

1. **"A collection" becomes real.** Expand → *A collection* now makes an
   **anthology**. Books already expanded that way (and any standalone book) can
   switch on from the File menu. No new entry in New project.
2. **Kinds can mix.** Every piece keeps its own kind, part names and line-break
   setting.
3. **Pieces come in two ways:** a new blank piece of any kind, or **bring in** an
   existing single-piece project.
4. **Bringing one in moves it.** The project leaves the list; a saved copy is
   taken first, as with every change of form.
5. **A piece can go back out** as its own single-piece project.
6. **Export:** each piece under its own title (no "Chapter 3"), each on a new
   page, its own line breaks kept, a contents page, section headings.
7. **Web first, phone follows.** See §6 for what the phone shows meanwhile.
   **"Epic" for a poem's longer-work choice.** The other Expand choice, one poem
   that keeps growing (the Divine Comedy, the Aeneid), was "One longer work · A
   long poem", tagged "Long poem". For a poem it becomes **An epic**, hint *"Or
   any book-length poem, in cantos or parts"*, tag **Epic** (`KINDS` poem
   `grow.work` in `lib/piece.ts`, and the phone's `Piece.kt` to match). Stories
   and essays keep "One longer work". Behaviour unchanged: an ordinary book.
8. **Still to choose, from the mockup:** the anthology's home screen (contents
   list vs. board of cards) and how taking a piece out looks. §8 lists the rest.

## 3. The model

**An anthology is a standalone book whose chapters are pieces.** The same trick
as a single piece: underneath, each piece is still a chapter, so it already has
scenes, prose, cast, world, pins, notes, status, target and per-version forks.
What changes is which settings live on the chapter and how it is shown.

All fields optional. **No `SCHEMA_VERSION` bump**, as with pieces.

```ts
// StoryDoc
form?: "piece" | "anthology";   // new value; absent = book (or series)
grownInto?: GrownInto;          // unchanged; an anthology keeps "collection"
kind?: PieceKind;               // unchanged meaning: the default kind for a new piece
keepLineBreaks?: boolean;       // unchanged; the fallback for a piece with none of its own

// Chapter (a piece, in an anthology)
kind?: PieceKind;               // this piece's kind; absent = doc.kind
keepLineBreaks?: boolean;       // this piece's line breaks; absent = doc.keepLineBreaks
section?: string;               // "a section starts here, called this" (Part One…)
```

- **Order is `num`**, as board order is today. Sections are a field on the
  first piece of each section rather than a list of their own, because a new
  key on `VersionData` needs a phone update before the web ships it (Android
  SPECS §4a) and a chapter key does not.
- **Per-chapter lookups.** `partNouns`, `countParts` and `keepsLineBreaks` take
  the chapter in an anthology: `chapter.kind ?? doc.kind`,
  `chapter.keepLineBreaks ?? doc.keepLineBreaks`. Every caller that passes the
  doc today (`ManuscriptModal`, `ProsePane`, `manuscriptExport`, the canvas,
  rail, footer) is a touch point.
- **No acts, no chapter numbers, no chapter links** in an anthology. The fields
  stay in the file (acts default to 1); the UI just does not show them.
- **Versions stay book-wide.** A version forks the whole anthology, as it forks
  a book.
- **Not inside a series (v1).** Make this a series and Merge into a series are
  hidden for an anthology. Open question §8.

## 4. Behaviour

### 4.1 Making one

- **Expand → A collection** (a piece): the piece becomes the first piece, with
  `kind` and `keepLineBreaks` copied **onto the chapter**, and `form:
  "anthology"`. Saved copy first, unchanged.
- **File → Make this an anthology…** (a standalone book, including old
  "collection" books): every chapter becomes a piece of the book's `kind`,
  each chapter's line-break setting copied from the book. Chapter titles become
  piece titles; acts are hidden; nothing is joined. Saved copy first.
- **File → Make this a book…** (the reverse): `form` cleared; pieces become
  numbered chapters again. Per-piece kinds stay in the file but are not read.
  Saved copy first.

### 4.2 Home screen: the board (Option B, chosen by Ray 2026-11-21)

- **Each card is one piece; each dashed band is a section.** A card carries
  the kind tag where a chapter number would be, status, title, summary, part
  count ("4 stanzas", "7 scenes") and words / target. No act bands, no chapter
  links, no chapter numbers.
- **Pieces move by dragging:** within a band to reorder, or into another band
  to change section. Drop on a card lands before / after it (by which half);
  drop on a band's empty space lands at its end. Order is still `num`; the
  section is the `section` field on the first piece of each band (§3), so a
  drag rewrites both.
- **Every band ends with a "+ Add piece" card** that adds into that section,
  and **"+ Add section"** sits under the last band. A new section starts empty.
- **Cards flow in rows inside their band** rather than sitting at free x / y
  positions as chapter cards do, so the order you see is the book's order.
  Chapter `x` / `y` stay in the file, unused here.
- Click (a press that doesn't move) opens the piece, as on the board today.
- **Each band has a ⋯ menu:** Rename (inline; Enter keeps it), Move section
  up / down (its pieces move with it), Remove section (only the heading goes;
  its pieces join the section above, or below for the first one).
- *A contents list (Option A) was the alternative; dropped, and removed from
  the mockup.*
- Both: the toolbar keeps Characters, World, Notes, versions, Export, Sync;
  drops New chapter, Auto-arrange, Timeline and templates; gains **+ Add piece**.

### 4.3 A piece, opened

Exactly what a single piece looks like today (`PieceView`, the chapter modal in
page mode): its title, kind picker, Map / Write, the same canvas and prose pane,
plus a **‹ Contents** back link and **‹ ›** to the previous / next piece. A
poem's Write view keeps its line breaks; the next piece, a story, does not. A
piece's own menu (⋯): Move to section, Make its own project…, Delete piece.

The reference tab strip (cast, world, notes, pins) **comes back** for a piece in
an anthology, because unlike a single piece it is not the whole project. This
reverses the 2026-10-13 call for single pieces *inside an anthology only*, and
is Claude's proposal, not yet Ray's (open question 9).

### 4.4 Adding a piece

**+ Add piece** opens one dialog with two halves:

- **New piece:** the four kind cards from New project. Starts a blank piece
  at the end (or in the chosen section).
- **Bring in a project:** your single-piece projects (books and series are not
  offered). Confirm says what happens:
  - the piece's writing, map, notes, status and target come in as one piece;
  - its characters, world entries and library assets are added to the
    anthology's the way **Merge into a series** does it (`mergeProjectIntoSeries`
    in the store: `dedupeById`). Two separate projects have different ids, so
    in practice everything is appended; a character typed in both shows twice
    (open question 8);
  - its **main version** comes in; other versions stay in the saved copy;
  - its Pace history is **added into** the anthology's (per day, per device
    cell summed, since both logs may hold the same device);
  - the project leaves the list; a saved copy of it is kept under
    Projects › Saved copies (and in the Estoria folder, as today).

### 4.5 Taking a piece out

Piece ⋯ → **Make its own project…** Confirm names what goes with it: the
writing and map from the version you are viewing, its kind and line breaks, its
notes, status and target, the characters / world / assets it uses (copied, the
anthology keeps its own). Then two choices:

- **Move it out** (default): the piece leaves the anthology; saved copy of the
  anthology first.
- **Copy it out:** the anthology keeps it, and the new project starts as a copy.

The new project starts with an empty Pace log (the anthology's history stays
where it was written, because the log is grow-only).

### 4.6 Word counts and Pace

- Each piece shows its own words / target in the contents and in its page.
- The footer and toolbar show the anthology's total, as a book does.
- Pace stays one log per project. "Draft done" applies to the whole anthology.

### 4.7 Export

- `.docx` (standard manuscript format): title page as now; a **Contents** page
  listing sections and piece titles; each section heading on its own page; each
  piece on a new page under its own title; line breaks per piece (a poem's
  single breaks kept, a story's joined).
- `.md`: `# Title`, `## Section`, `### Piece`; per-piece hard breaks.
- `.txt`: the same, upper-cased headings.
- The map export (`markdown.ts`) names pieces and kinds instead of chapters.

### 4.8 Regular books: unchanged

Everything above applies only when `form` is `"anthology"`. An ordinary book
(standalone or in a series) keeps its board, numbered chapters, acts, chapter
links, Timeline, chapter modal, templates and its "Chapter N. Title" export,
with no setting or layout change. The per-chapter lookups fall back to the
book's own `kind` and `keepLineBreaks`, and a book's chapters never carry the
new fields, so they read exactly as today. The only things a book user can see:

- **File menu:** one new entry on a standalone book, *Make this an anthology…*
  (opt-in, saves a copy first).
- **Books expanded from a poem as "one longer work"** show the tag **Epic**
  where they showed "Long poem". Wording only.
- **Old "collection" books** (expanded before this) stay ordinary books until
  you choose *Make this an anthology…*. Nothing converts on its own.

## 5. Touch points (for the build)

| Area | Change |
| --- | --- |
| `types.ts` | `ProjectForm` gains `"anthology"`; `Chapter.kind`, `.keepLineBreaks`, `.section`. |
| `store/persistence.ts` `normalizeDoc` | Whitelist and validate the new chapter keys and form value (the same place the sibling plans add `relationships`). |
| `lib/piece.ts` | `isAnthology`, `toAnthology`, `fromAnthology`, `bringIn`, `takeOut`; `partNouns` / `countParts` / `keepsLineBreaks` take a chapter; `expandToBook("collection")` sets the form. |
| `lib/paceLog.ts` | An *add* merge for bringing a piece in (today's merge is for two copies of one log). |
| `lib/manuscriptExport.ts` | Piece headings, contents page, section pages, per-chapter `keepLineBreaks` in `chapterParagraphs` and `hardBreaks`. |
| `lib/sync.ts`, `lib/merge.ts` | New chapter fields get `FIELD_LABELS` ("kind", "line breaks", "section"); `doc:form` already compares `form`. **`mergeBlocked`** (SPECS §8: set when `form` differs, piece vs book) needs a rule for `"anthology"`: blocked against a piece (one device expanded while the other kept the piece); against a plain book with the same chapters, Compare & merge can stay open, since the chapters line up and only the form differs. |
| Components | New `AnthologyView` (contents or board), `AddPieceModal`, take-out dialog; `PieceView` gains back / prev / next; `Toolbar`, `FormChangeModal`, `ProjectsModal` (tag "Anthology"). |
| Tests | Round-trip of the new keys, expand / make / unmake, bring-in (bible dedupe, Pace add, versions), take-out, export headings and line breaks. |

## 6. Android (web first, phone follows)

**Safe now, with no phone update.** The phone keeps unknown project keys in
`StoryDoc.extra` and unknown chapter keys in each chapter's `extra`, and writes
them back unchanged. `isPiece` checks `form == "piece"`, so `"anthology"` reads
as a book. Sections live on chapters, not `VersionData`, so the §4a contract is
not hit.

**What the phone shows until it is updated:** an ordinary book. Numbered
chapters, acts, every piece named by the project's part noun, and **the
project-level line-break setting applied to every piece**. In a mixed anthology
that means either the poems lose their line breaks on the phone (display only;
the text is untouched) or the stories show stray single breaks. Section
headings do not show.

**Hazards on an old phone build:** *Turn into single piece* on the phone would
collapse the anthology into one piece (it saves a copy first, so it can be
walked back). *Make this a series* would put it in a series the web does not
expect. And the phone's own **Expand → A collection** keeps making the old
label-only book (`grownInto: "collection"`, no `form`), which the web then
shows as a book waiting for *Make this an anthology*. All three are reasons to
keep the gap short.

**Phone update, later:** read `form: "anthology"`, per-chapter kind and line
breaks, a contents screen, the piece page with back / next, and the new export
headings. Recorded for the Android SPECS §7 when the web lands.

## 7. Overlap with the three sibling plans

- **No data overlap.** Relationship chart, detail-card styling and
  rearrangeable cards all work on the Characters / World drawers. This feature
  does not touch those panels.
- **Shared files, mechanically:** `normalizeDoc` (the relationship chart adds
  `relationships` there), `lib/sync.ts` (the reorder plan adds two story-wide
  diff units and bumps `total += 9` in `sync.test.ts`; this plan adds chapter
  field labels only, no story-wide unit). Whichever lands second rebases.
- **Bringing a piece in merges characters and world entries.** If the reorder
  plan lands first, brought-in characters append to the end of the roster
  order; if the relationship chart lands first, a brought-in piece's
  `relationships` must be merged too (by pair, ids already remapped).

## 8. Open questions

1. ~~**Home screen:** contents list (A) or board of cards (B)?~~ **Board (B)**, §4.2.
2. **Taking a piece out:** does the dialog in the mockup match what you picture?
   Move by default, Copy as the second choice? *(mockup screen 6)*
3. **Name:** call it "Anthology" in the UI, or keep "Collection" (already the
   Expand wording and the tag, "Poetry collection")?
4. **Numbers:** should pieces show a number in the contents (1, 2, 3) or none?
5. **Series:** can an anthology be a book in a series later (a poetry series)?
   v1 says no.
6. **Bringing in a piece with several versions:** only its main version, the
   rest kept in the saved copy. OK?
7. **Pace on bring-in:** add the piece's history into the anthology's, so the
   streak and totals include it. OK, or start the piece's history fresh?
8. **Same character in two projects:** bringing a piece in appends its
   characters and world entries (ids never match across projects). Fine for
   v1, or offer to match same-name entries during bring-in?
9. **Reference tabs on an anthology piece:** bring back Characters / World /
   Piece notes / Pinned on the piece page (mockup step 3), or keep the piece
   page exactly as a single piece today (no tabs)?
