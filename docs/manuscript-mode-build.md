# Manuscript Mode — build brief

> **What this is.** A handoff for a fresh session to start building from. It
> carries the decisions and the code facts; the reasoning behind them lives in
> [`archives/manuscript-mode-brainstorm.md`](archives/manuscript-mode-brainstorm.md).
> Read that only when a decision here looks arbitrary.
>
> **Read [`SPECS.md`](SPECS.md) first** — it is this project's source of truth for
> what Estoria is and how it is built, and this brief assumes it. Then §0 below,
> before any code. Everything here is scoped to this repo; the file is not
> self-contained away from the codebase it describes.
>
> **Status: Phases 0, 1, 2 and 4 are built** on `feature/manuscript-mode`
> (2026-08-01) — see §8 for what each shipped. Phase 4 was taken before phase 2
> deliberately: it is the cheapest large win. **Phases 3 and 5 are not started**,
> and the §9 list below is now the accurate account of what is left.
>
> The editor's **Edit/View toggle** (§2) is built, along with the keyboard
> shortcuts and `Cmd+S` from §9 items 4 and 5.
>
> **The riskiest assumption held.** Asked directly on 2026-08-01, the author's
> verdict on Phase 0 was *"seeing beats while drafting manuscript is something
> I'd like"*. That was the one question the whole build order hung on (§1, §8),
> and it is now answered yes — so the expensive phases below are worth paying
> for, and the premise in §1 can be folded into [`SPECS.md`](SPECS.md) §4 as a
> feature rather than an experiment when this lands.
>
> Written 2026-08-01. Delete this file when the feature lands, folding what
> survives into [`SPECS.md`](SPECS.md) §4.

---

## 0. Start here

### How to open the session

Start it **inside this repo** — the brief references `src/…` paths, `SPECS.md`
and the brainstorm doc, so it is self-contained *given the codebase* and not away
from it. Then:

```
Read docs/manuscript-mode-build.md and follow it. Start at §0, then Phase 0 only.
```

### Scope the first session to Phase 0. Say so out loud.

§8 lists five phases. A session handed all of them will cheerfully start building
IndexedDB adapters, which is weeks of work resting on an untested assumption.

**Phase 0 is one day and its only job is to answer one question:** does seeing
your beats while drafting actually feel like anything? Everything expensive is
downstream of that answer. Do not let a session skip ahead to Phase 2 because the
storage problem is more interesting than the product one.

### The mockup link will not open for anyone but the author

The artifact in §10 is private. That is not a blocker — §4 describes the three
states and the carousel in words, including the two details that matter (peek
cards show label and count only; `***` renders literally in Edit mode). But the
author should have the mockup open on their own screen when reviewing what gets
built, because "does this match" is a visual question.

### These docs may still be untracked

This file and the brainstorm were written on `main` and left uncommitted, so a
review could happen before anything landed. **Untracked files follow you across
branch switches**, so they will come along when you create the branch below. If
you want them preserved first, commit them on `main`; otherwise let the build
session commit them onto the branch with its first change.

### Branch, not fork

A **fork** is a separate GitHub repo, meant for contributing to someone else's
project. It buys nothing here and costs you a remote to keep in sync. Use a
branch, matching the existing `feature/…` convention:

```bash
git checkout -b feature/manuscript-mode
```

Reverting is then `git checkout main`, and the experiment is still on disk if
you change your mind. To throw it away for good: `git branch -D
feature/manuscript-mode`.

**If you want `main` to stay runnable while you build**, use a worktree instead
— a second directory on its own branch, sharing one git history:

```bash
git worktree add ../Estoria-manuscript -b feature/manuscript-mode
```

`../Estoria-manuscript` is the branch; this directory stays on `main` with its
own `node_modules` and dev server. Remove it later with
`git worktree remove ../Estoria-manuscript`.

### Git does not protect your story data

This is the part a branch cannot save you from. **`git checkout main` does not
roll back localStorage.** Prose written on the branch, or a schema the branch
migrated, stays in the browser after you switch back. Three protections, all
cheap:

1. **Export a project file first.** File menu → save the `.estoria.json`. That
   is your real undo. If you use folder Sync, take a copy of the folder too.
2. **Run the branch's dev server on a different port.** localStorage is keyed by
   *origin*, and origin includes the port — so `localhost:5199` has a completely
   separate store from whatever port you normally develop on. Free isolation:

   ```bash
   npx vite --port 5199 --strictPort
   ```

   (Or add a second entry to `.claude/launch.json` with `"port": 5199`.)
3. **Do not touch `SCHEMA_VERSION`.** See the hard rules in §7 — this is the one
   change that would make `main` refuse to open your files.

---

## 1. What we're building, and why it isn't an editor

Estoria is a story-mapping tool. The question that started this was "where would
I write?", and the answer that makes it worth building is not "in a text box we
added". It is:

> **This is not an editor with a map beside it. It is the map, with a place to
> write inside it.**

The feature is *seeing your beats while you draft*. No writing app can do that,
because no writing app has the beats. The editor itself should be as plain as
possible; the coupling is the product.

**The riskiest assumption** is that this actually feels like something. Phase 0
in §8 exists to test that for about a day's work before anything expensive gets
built.

---

## 2. Locked decisions

| | |
|---|---|
| Platform | Webapp only. Android holds off on parity (§6). |
| Format | Markdown, in `StoryDoc`. **No rich-text editor library.** |
| Granularity | **Per chapter.** Scenes stay 200-char beats. |
| Where it lives | A **section in the chapter modal**, under Scene flow. Not a new top-level view. |
| States | **Minimized / Regular / Full screen** (§4). |
| Scene boundary | A `***` thematic break in the prose (§3). |
| Versions | **Prose forks with the version**, exactly as scenes do. "Version" keeps meaning a version of the book. |
| Reading | Timeline **gains a prose mode** — a pane toggle, not a fourth view. |
| Editor | One mode. Edit/View toggle. Default markdown rendering, no extra styling. |
| Word count | Auto-derived, with a separate hand-set target (§5). |

---

## 3. The data model, and the `***` contract

### Schema change

```ts
// src/types.ts, on Chapter
/** Chapter prose as markdown. Scenes are separated by `***` thematic breaks;
 *  see docs/manuscript-mode-build.md §3. Absent until the chapter is written in. */
manuscript?: string;
```

That is the whole schema change. **No `SCHEMA_VERSION` bump** — an absent
optional field is already what every existing document has.

### Why `***` and not a marker

An earlier draft used HTML comments (`<!-- s1 -->`). It was wrong, and the
question that killed it was *"is that something I have to type?"* A marker the
writer can see is a marker they have to work around.

`***` is real markdown that a novelist types anyway, because a scene break is
already part of the craft:

- **View mode renders it as a horizontal rule** — which is what a scene break
  looks like.
- **Export strips nothing.** It is already correct markdown, and it becomes the
  centred `#` that standard manuscript format wants.
- **Use `***`, not `---`.** A `---` on the line directly below text is parsed as
  a setext heading by most markdown parsers, which would silently promote the
  preceding sentence to an H2.
- It is unambiguous with bold-italic: a thematic break requires the line to
  contain **only** the marks. `***patience***` mid-sentence is emphasis.

### The counting rule

A `***` is the prose form of a connector. The schema already says so:

```ts
scenes: string[];
sceneLinks: ConnType[];   // length = scenes.length - 1
```

Three scenes, two connectors, **two breaks**. So the drift check is exactly
`breakCount === sceneLinks.length`. You are not inventing a structure, you are
rendering one that already exists.

The causal type (`therefore` / `but` / `and`) is **never stored in the prose**.
Reading mode decorates the rule from `sceneLinks[i]`.

### Interaction contract

| Action | Result |
|---|---|
| Click a scene card (canvas or timeline) | Caret jumps to that scene's section; card gets the green ring. **Nothing is written.** |
| `+ Add scene` | New beat on the map, and a `***` written into the manuscript at that position. |
| Type `***` while writing | A beat appears on the map, named `"New scene."` (matching how every other blank record is seeded). |
| Delete a scene on the map | **Prose untouched.** Break stays, counts disagree, drift bar offers to merge. |
| Delete a `***` while writing | Two beats merge. Map shows drift. |
| Reorder scenes on the canvas | Map reorders, prose does not. Drift bar offers a **confirmed, undoable** reorder. |

First time a chapter gets prose, seed the manuscript with the breaks already
implied by its scenes. A break with nothing after it is what makes the rail read
"not written".

---

## 4. The three states

The Manuscript section header carries a three-way control. The scene flow
changes shape with it.

**Minimized** — the chapter modal exactly as it is today. Full scene canvas,
three cards, `Collapse` / `Auto-arrange` / `+ Add scene`. Manuscript is a single
dashed row reporting *N scenes · N written · N words* with an "Open the
manuscript" button. A planning session never has to look at prose.

**Regular** — the manuscript sheet opens, and **scene flow becomes a one-card
carousel**: the focused beat at ~352px with the green ring, its neighbours
peeking at ~118px each side, connector pills between, and a `2 / 3` position
readout top-right because only one card is legible at a time. The chapter header
sheds its summary, act stepper and character chips; the words chip and status
stay, because you watch those while drafting.

**Full screen** — the same carousel and the same sheet, with the board, scrim
and remaining sections dropped. The carousel is `position: sticky` so the beat
stays in view however far you scroll.

Two details the mockup pass caught, both worth keeping:

- **A peek card shows its label and word count only, never clipped body text.**
  Hard-clipping mid-word would contradict Session 56, whose entire point was that
  a scene card never cuts its text off.
- **In Edit mode the `***` renders as literal left-aligned characters**, exactly
  as a textarea shows them. Drawing it as a centred typographic ornament
  over-promises what a plain textarea can do. The centred rule belongs to View
  mode.

**Undecided:** what scrolls the carousel. Drawn as two-way synced with the caret
(matching the timeline rail), but that means a horizontal trackpad swipe over the
carousel moves your cursor in the prose. Try it before committing.

---

## 5. Word count

`words` is currently a hand-typed number
([`ChapterDetail.tsx:472`](../src/components/ChapterDetail.tsx)) with **eight
readers and one writer**:

| Reads | |
|---|---|
| [`Board.tsx:392`](../src/components/Board.tsx) | card meta |
| [`Timeline.tsx:406`](../src/components/Timeline.tsx) | rail card |
| [`Toolbar.tsx:78`](../src/components/Toolbar.tsx) | book total |
| [`SeriesMap.tsx:247`](../src/components/SeriesMap.tsx) | per-book total |
| [`ExportModal.tsx:16`](../src/components/modals/ExportModal.tsx), [`markdown.ts:67`](../src/lib/markdown.ts), [`markdown.ts:112`](../src/lib/markdown.ts) | export header + per chapter |

Every read is `c.words` or a reduce over it. **Do not derive at the call sites.**
Keep `words` as a stored field and treat it as a cache: recompute from the
manuscript on the save debounce and write it back. All eight readers, the export
shape, the import parser and Android stay untouched.

Two rules:

- **Add a separate `target`**, because `words` currently means *planned* — the AI
  import prompt literally says "estimate from scene length". Auto-updating
  silently redefines it as *actual*, and the gap between the two is the most
  motivating number a planning tool can show. The board then shows progress,
  which a text editor cannot.
- **Never auto-zero a hand-typed count.** Existing books have no manuscript; a
  naive recompute makes an 80k-word project display 0. Auto-compute *only* where
  manuscript text exists. Same grandfather shape as the Session 56 scene cap
  (`max(cap, current)`).

Strip markdown syntax before counting, or `**tension**` counts as two words.

---

## 6. Android

**Nothing is required of Android.** Verified in `Estoria-aa`: unknown chapter
fields round-trip losslessly through two independent layers.

1. `normalizeDocJson` (`Normalize.kt:176`) builds each chapter with
   `val out = p.toMutableMap()` and only *overwrites* known keys.
2. `ExtrasSerializer` (`StoryDoc.kt:61`) captures unknown keys into `extra` on
   decode and merges them back on encode. `ChapterSerializer` uses it.

So a `manuscript` field survives a sync through the phone even though Android
knows nothing about it. Two consequences to remember rather than fix:

- Android's conflict detection hashes the canonical encoding, so a **prose-only
  edit on web registers as a real change on Android.** That is correct.
- If web auto-computes `words` while Android still offers a hand-typed field, a
  round trip can recompute the typed number away. First place the two apps would
  visibly disagree.

**Worth adding on the Android side:** a regression test for a chapter carrying an
unknown field, so the passthrough is not lost to a future refactor.

---

## 7. Hard rules

Violating any of these is how this goes wrong quietly.

1. **The map never mutates the manuscript.** Deleting a scene must never delete
   prose. Reordering scenes changes the map only; the drift bar offers a
   confirmed, undoable reorder. There is no undo model that covers silently
   rearranging finished paragraphs.
2. **Do not bump `SCHEMA_VERSION`** (currently `8`,
   [`types.ts:13`](../src/types.ts)). An optional field needs no bump, and a
   bumped file makes `main` throw `SchemaTooNewError` on open — which is exactly
   the safety net you do not want to trip on your own data.
3. **Do not put prose at the scene level.** `SCENE_TEXT_MAX` is 200 characters,
   set by the narrowest timeline card. Scenes are labels.
4. **Do not promote scenes to objects with ids** to make this work. They are
   positional (`scenes` / `sceneLinks` / `scenePos` / `scenePosCompact` are
   parallel arrays) and chapter-level prose means you never need to change that.
5. **Write prose before map state** once storage splits (§8 phase 2). Orphan
   prose is recoverable garbage; missing prose is lost work.
6. **Do not grow a test manuscript toward 100k words in the doc blob.** See the
   storage numbers below — that is exactly where it breaks.

---

## 8. Build order

### Phase 0 — find out if it feels like anything (~1 day) — ✅ BUILT, awaiting the verdict

Add `manuscript?: string` to `Chapter`. Persist it through the **existing**
localStorage path, unchanged. Build one thing: the Regular state for a single
chapter — writing pane, scene carousel beside it, current beat ringed.

No IndexedDB, no adapter widening, no versions work, no export, no timeline mode,
no word count.

Then write a few thousand real words into **one** chapter and decide. It is a
**feel test, not a load test**. If the answer is no, delete the field and the
branch and nothing else was spent.

**What shipped** (`lib/manuscript.ts`, `components/ManuscriptSheet.tsx`, a
`setManuscript` action, one field on `Chapter`):

- **Two states, not three.** A dashed Minimized row reporting *N scenes · N
  written* with "Open the manuscript", and the Regular sheet. Full screen is
  Phase 1. The open/closed flag is local component state on purpose — Phase 1
  replaces it with the real three-way control.
- **Seeded on first open** from the breaks the scenes already imply, keyed on
  `manuscript === undefined` rather than emptiness, because a one-scene chapter
  seeds legitimately to `""`.
- **The carousel is `sticky`, and that mattered more than expected.** The
  chapter modal is one scroll container under a sticky header, so the first
  build scrolled the beat out of view the moment you started writing — the
  feature not happening. It now pins below the header, whose height is measured
  (`ResizeObserver`) rather than guessed, and the sheet scrolls itself into
  place on open. Note for Phase 1: **no `overflow-hidden` on any ancestor of the
  carousel** — it makes that box the sticky scrollport and the pinning silently
  stops.
- **Read direction only**, per §3: the caret drives the carousel, and clicking a
  peek card moves the caret. Typing `***` does **not** yet create a beat.
- Peek cards show label + written/not-written; the focused card shows the beat
  whole and is never clamped. `***` renders literally, as §4 asks.

**Answers §9 item 1** (what scrolls the carousel): the caret does, one-way. A
horizontal swipe over the carousel was never wired to move the cursor, so the
trackpad worry the mockup raised does not arise. Two-way sync can still be added
in Phase 1 if reading back wants it, but it should be justified on its own.

**The verdict: yes** (2026-08-01). Asked directly, the author's answer was
*"seeing beats while drafting manuscript is something I'd like"*. The premise in
§1 — that the coupling is the product, not the editor — is confirmed, so nothing
downstream is speculative any more. Note what was *not* tested: this was a
judgement on the built thing, not the "few thousand real words" load-adjacent
soak the phase describes, so §8 phase 2's storage numbers are still theory
rather than something felt.

### Phase 1 — the three states — ✅ BUILT

Minimized / Regular / Full screen, the carousel, the `***` contract in §3
including the drift bar.

**What shipped:**

- **The three states**, as one segmented control in the Manuscript header rather
  than a chain of Open / Expand buttons — they are states of one thing and you
  move between them in any order, including straight from planning to full
  screen. The state is a **persisted mode** (`manuscriptState` in the store, in
  `partialize`), so a drafting session doesn't re-open the sheet per chapter.
  Regular sheds the summary, act stepper, Characters and World; Full screen also
  drops Chapter notes, Pinned references and the delete row, and stops the modal
  scrolling as a whole so the prose is the only thing that moves.
- **Both write directions of §3's table.** `+ Add scene` and the hover `+`
  insert a `***` at the same index; typing `***` inserts a beat at the position
  the break opened. Both are gated on the two being **in step beforehand**
  (`inStep` in `useStore.ts`) — a second guess stacked on an unanswered first
  one is how a manuscript ends up shuffled with no way back.
- **The drift bar, in two tiers.** When the map edit *just happened*, the store
  has recorded exactly what it was (`manuscriptDrift`, transient) and the bar
  names the scene: "Scene 4 is gone from the map, but its prose is still in the
  manuscript" → *Merge into scene 3*; "Scene 1 moved to position 3" → *Reorder
  the prose*. When it did not — after a reload, or a hand-deleted break — no
  amount of counting says *which* pair drifted, so the only offers are the ones
  that append at the end and guess at nothing. Both tiers confirm, and every
  reconciliation keeps one undo (`manuscriptUndo`).
- **A scene clicked on the timeline moves the caret** when the sheet is open.
  `focusScene` is consumed by the sheet instead of the canvas in that state —
  the guard sits *before* `clearFocusScene`, or the canvas effect eats the
  marker and neither one acts on it.

**Answers §9 item 2** (what the editor does when the counts disagree): nothing
on its own. It reports, and offers a fix it can name.

**Two departures from §4 worth knowing:**

1. **Regular hides World details too**, not just the character chips §4 lists.
   Dropping Characters while keeping World beside it reads as an oversight
   rather than a decision.
2. **`moveScenesToChapter` gets no precise offer** — it moves an arbitrary set
   across two chapters, so there is no single named operation to propose. It
   falls through to the count-only tier.

**Not built, and not part of Phase 1:** View mode (the Edit/View toggle in §2 —
`***` still renders literally, as §4 requires of Edit mode), word count, export,
timeline prose mode, and the keyboard shortcuts in §9 item 4.

### Phase 2 — storage (the real cost of the versioning decision)

Prose forking with versions is right, and it makes the current storage
untenable:

- 100k words of markdown ≈ **600,000 characters**.
- localStorage is ~5MB storing **UTF-16**, so ASCII costs ~2 bytes/char — about
  **2.5M usable characters**.
- One manuscript ≈ **24% of the whole budget**. **Four versions ≈ 96%**, before
  the map, before JSON escaping, before base64 images.
- And `partialize` puts `projectStash` — *every other project* — in the same
  string ([`useStore.ts:1833`](../src/store/useStore.ts),
  [`useStore.ts:139`](../src/store/useStore.ts)).

Worse for typing: the 500ms debounce
([`persistence.ts:96`](../src/store/persistence.ts)) defers the **write**, not
the **serialize**. `JSON.stringify` over the whole store still runs per
keystroke; the shim discards all but the last. Invisible today, tens of
milliseconds at 3MB, in the main thread, while someone is drafting.

**The move:** manuscripts into **IndexedDB**, keyed by
`(projectId, bookId, draftId, chapterId)`. Split at the **at-rest layer only**:

> `StoryDoc` stays whole in memory and in every file.

- **Load** — map from localStorage, prose from IndexedDB, assembled before the
  store sees it.
- **Autosave** — map to localStorage; only the **dirty chapter's** prose to
  IndexedDB.
- **Export / sync / backup** — reassemble the full doc *including* prose, write
  one JSON. Contract intact, Android unaffected.
- **Import** — split back out on the way in.

A second *localStorage key* does **not** work: the quota is per origin. It fixes
the CPU cost and none of the capacity.

**The one genuine data-loss hazard:** IndexedDB is async and `beforeunload` is
not. The flush at [`persistence.ts:117`](../src/store/persistence.ts) works
*because* `localStorage.setItem` is synchronous. An IndexedDB write started
during tab close will not complete. Mitigate with: flush on `visibilitychange`
(fires earlier, already wired), a much shorter debounce for prose than for the
map, write-through on blur and on chapter switch, and possibly a synchronous
localStorage crash-pad holding only the in-flight chapter, recovered on load.

`StorageAdapter` needs widening to keyed access — already called for in SPECS §8
("a small widening: `list()` / per-id load/save") and §9 item 1.

---

#### ✅ BUILT

`store/prose.ts` (the IndexedDB store, the split, the crash pad) and a rewritten
persist shim in `store/persistence.ts`. Every mitigation above is in, including
the crash pad, which turned out to be load-bearing rather than optional.

- **The serialize is deferred, not just the write.** The old shim received an
  already-stringified value, so `JSON.stringify` over the whole store ran per
  keystroke and the debounce threw all but the last away. `createJSONStorage` is
  gone; the storage is an object-form `PersistStorage` that owns its own
  serialization, so `setItem` is one assignment. **Measured on the reference
  project: 40 keystrokes stringified 26KB total (~0ms), then one 188KB
  serialization when the timer fired.** Before, that would have been 40 × 188KB,
  on the main thread, while someone was drafting.
- **Prose has its own faster stream** (200ms, against the map's 500ms), plus
  write-through on blur and on leaving a chapter.
- **Migration is automatic and needs no code.** A document written before the
  split still carries its prose inline; the load leaves it there and the first
  save lifts it out. Verified: a blob with inline prose came back with the prose
  in IndexedDB and the field gone from localStorage.
- **The crash pad is proven, not just written.** With IndexedDB writes forced to
  fail, the prose was still in the synchronous pad, survived a reload, was
  restored into the editor, and then written to IndexedDB with the pad cleared.
- **Prose failure is reported, not masked.** The two writes are separate and the
  map is far likelier to succeed, so its "saved" would have painted over a prose
  failure a second later — the exact silent-failure bug SPECS §9 item 2 exists
  to have fixed. `SaveStatus` grew a `reason`, and the footer now says something
  true for each.
- **No IndexedDB, no problem.** If it is unavailable or refuses to open, prose
  stays in the localStorage blob exactly as before: quota-bound and slower, but
  never lost.
- **The file contract holds.** Verified by capturing an actual `Save project
  (.json)`: the file carries `manuscript` on its chapters at schema 8. `StoryDoc`
  is still whole in memory and in every file, so export, Sync, backup, import
  and Android are untouched.

**Two things deliberately not done here:**

1. **`StorageAdapter` is not widened.** That item is about *per-project* files
   for the Drive adapter (SPECS §8, §9 item 1); prose is a different backend on
   a different key shape, and forcing it through that interface would have made
   both worse. It stays open, and it belongs to the Drive milestone.
2. **`splitProse` walks all four chapter locations** — top level, `draftData`,
   and both again inside every stashed book. Missing one would strip prose from a
   board the writer had merely navigated away from, so if that walk ever needs
   changing, change it there and nowhere else.

**Found and fixed in passing:** `persistence.ts` contained two raw NUL bytes (a
separator in `migrateRefsToAssets`, plus one in the comment describing it), which
made `grep` and `ripgrep` treat the whole file as binary and silently return
nothing. Replaced with `\u0000` escapes — byte-identical at runtime, and the file
is searchable again. Worth knowing, because "grep found nothing in that file"
was not evidence of anything.

### Phase 3 — fork ergonomics

Needed only because prose forks:

- **Ask at fork time**: "copy the manuscript, or structure only?" Copy stays the
  default; the second option makes a re-arrangement experiment free.
- **A way back**: per-chapter *"pull this chapter's text from version X"* with a
  confirm. Not a merge engine, about a day — but without it, prose written in a
  fork you abandon is stranded with no path out.
- **Word counts in the version menu**, so a fork's cost is visible beforehand.

### Phase 4 — timeline prose mode — ✅ BUILT

Same rail, same cards, same active ring, same two-way scroll sync. Only the
pane's contents change; `Scenes / Prose` is a pane toggle beside the existing
↓ / → control. Cheapest large win in the feature.

**It was.** `timelinePane` in the store (persisted), a `Scenes / Prose` segment
in the toolbar shown only on the timeline, and `components/ProsePane.tsx`. The
rail, the act bands, the link curves, the ring and the scroll sync are all
untouched — the toggle swaps what sits in the pane and nothing else.

- **This is where the `***` contract pays for itself.** The break renders as the
  centred rule a scene break has always looked like, and reading mode decorates
  that rule with the causal type from `sceneLinks[i]` — the therefore and but the
  map already knows, shown over the prose without ever being stored in it.
- **A small inline renderer, not a library.** Bold-italic, bold, italic and
  code, and paragraphs on blank lines. Anything it doesn't know stays the literal
  characters the writer typed, which is honest and reversible. This is the View
  half of §2's Edit/View toggle; Edit still shows `***` literally, per §4.
- **The prose is selectable.** The clickable affordance is a small `Scene N`
  marker that appears on hover, not a wrapper around the text — a reading view
  you cannot copy out of is not a reading view. Clicking it opens the chapter at
  that scene *with the sheet open*, flipping `manuscriptState` out of `min` if
  it was there, so reading leads into writing in one click.
- **Horizontal keeps working**: each chapter becomes a fixed 560px column that
  scrolls its own prose vertically, while the pane still scrolls chapter to
  chapter along its axis.

**One thing this surfaced, fixed here:** a prose column is a fixed 560px against
a scene grid that fills the pane, so the tail of the book has much less content
behind it to scroll against. The pane bottomed out before a jumped-to chapter
reached the leading edge, and the ring stayed on the chapter before it. Fixed
with trailing room past "End of book", in prose mode only. **The same shape of
bug is latent in Scenes mode** for the very last chapter and was not touched.

### Phase 5 — word count (§5) and exports

Manuscript export is a **second export with a different purpose** from the
existing one. Today's export is a *map* export (scenes as bullets, connectors,
Obsidian-shaped). Manuscript export is prose. Do not merge them; the Export modal
must say which is which.

- **`.md` and `.txt`** — concatenate, nothing to strip. Trivial.
- **Standard manuscript format `.docx`** — double-spaced, 12pt, indented, `#`
  scene breaks, title block. The one export worth days of work; agents and beta
  readers expect it, Obsidian cannot produce it.
- **Skip PDF.** A print stylesheet on the timeline prose view means Cmd+P
  produces a typeset PDF with no export code at all.

---

## 9. Still open

1. ~~What scrolls the carousel~~ — **answered in Phase 0.** The caret drives it,
   one way. Nothing was ever wired from a horizontal swipe to the cursor, so the
   trackpad worry does not arise.
2. ~~What the editor does when the counts disagree~~ — **answered in Phase 1.**
   Nothing on its own: it reports, and offers a fix it can name.
3. ~~Whether a hand-typed `***` should name its new beat `"New scene."` or lift
   the first sentence after the break~~ — **answered: it borrows, and stores
   nothing.**

   The question as written has no answer, because at the moment you type `***`
   there is no sentence after the break yet to lift. The new beat is still seeded
   empty, like every other blank record in the app. What changed is what an
   **unnamed** beat *displays*: the opening sentence of the prose written under
   it, in italic, wherever it would otherwise have said "New scene" — the
   carousel, the scene canvas (as its placeholder), and the timeline card.

   **Derived on read, never written to `scenes[i]`.** Storing the lifted sentence
   would be the manuscript quietly editing the map, and then nothing could tell a
   borrowed name from a typed one: the label could not follow the prose as it
   changed, and could not get out of the way the moment a real name was given.
   Deriving costs a string scan and keeps both properties.

   Three things it deliberately does: steps over abbreviations and initials, so a
   scene is not named "Mr."; cuts at a word boundary with an ellipsis rather than
   mid-word, which is the truncation Session 56 exists to have removed; and
   **refuses to borrow at all while the prose has drifted out of step with the
   map**, because section `i` is then not that scene's section, and showing
   another scene's opening line as this one's name is worse than showing nothing.
4. ~~Keyboard shortcuts~~ — **built.** `Alt+↑` / `Alt+↓` jump to the previous and
   next beat; `Cmd/Ctrl+Enter` inserts a scene break, which creates the scene.
   The undo gotcha was real and is respected: the insert goes through
   `document.execCommand("insertText")`, and native `Cmd+Z` was verified to still
   undo it. `Alt+↑/↓` deliberately shadows the OS "move by paragraph" binding
   inside this one textarea, which is the same gesture one level up.
5. ~~`Cmd+S`~~ — **built.** It does not save, because saving is automatic; it
   force-flushes everything to disk and shows a "Saved" confirmation on the
   carousel. Registered only while the sheet is mounted, so `Cmd+S` anywhere else
   in the app is still the browser's.
6. **Unrelated but worth fixing while you're in here:** `SPECS.md` §8 is stale —
   it lists the save debounce as to-do, but it shipped. **Still true, and now
   doubly so:** [`SPECS.md:439`](SPECS.md) still says persist "serializes the
   whole store on every keystroke", which Session 20 fixed and phase 2 above
   fixed again.

### Added since this list was written

7. **A latent scroll bug in Scenes mode.** Phase 4 fixed it for prose: a
   jumped-to chapter near the end of the book could not reach the leading edge,
   so the ring stayed on the chapter before it. The same shape of bug remains for
   the very last chapter in Scenes mode, untouched because it predates this work.
8. **The editor's View mode has no print stylesheet yet.** Phase 5 plans to skip
   a PDF exporter by putting one on the timeline's prose view; the sheet's own
   View mode is the same renderer and would come along nearly free.

## 10. References

- **Reasoning and rejected alternatives** —
  [`archives/manuscript-mode-brainstorm.md`](archives/manuscript-mode-brainstorm.md)
- **Visual mockup** (three states, carousel, timeline prose, fork/version/export
  controls) — <https://claude.ai/code/artifact/0b3c9b67-a724-459a-9ffe-c266e452f8e3>
- **Current state of everything else** — [`SPECS.md`](SPECS.md)
