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
> **Status: Phase 0 is built** on `feature/manuscript-mode` (2026-08-01), and is
> waiting on the one question it exists to answer — see §8. Nothing else is
> started. Written 2026-08-01. Delete this file when the feature lands, folding
> what survives into [`SPECS.md`](SPECS.md) §4.

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

**Left for the verdict:** whether writing a few thousand real words in it
actually feels like something.

### Phase 1 — the three states

Minimized / Regular / Full screen, the carousel, the `***` contract in §3
including the drift bar.

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

### Phase 3 — fork ergonomics

Needed only because prose forks:

- **Ask at fork time**: "copy the manuscript, or structure only?" Copy stays the
  default; the second option makes a re-arrangement experiment free.
- **A way back**: per-chapter *"pull this chapter's text from version X"* with a
  confirm. Not a merge engine, about a day — but without it, prose written in a
  fork you abandon is stranded with no path out.
- **Word counts in the version menu**, so a fork's cost is visible beforehand.

### Phase 4 — timeline prose mode

Same rail, same cards, same active ring, same two-way scroll sync. Only the
pane's contents change; `Scenes / Prose` is a pane toggle beside the existing
↓ / → control. Cheapest large win in the feature.

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

1. What scrolls the carousel, and whether caret-sync makes a trackpad swipe feel
   wrong (§4).
2. What the editor does when break count and scene count disagree, beyond
   raising the drift bar.
3. Whether a hand-typed `***` should name its new beat `"New scene."` or lift the
   first sentence after the break. Start with the former.
4. Keyboard shortcuts. The interesting ones are **not** formatting: jump to
   next/previous beat, and insert a break (which creates the scene). One gotcha
   if you do build `Cmd+B`: setting `selectionStart/End` directly **destroys the
   browser's native undo stack**; `document.execCommand("insertText")` preserves
   it and still works everywhere despite being deprecated.
5. `Cmd+S` should not save (saving is automatic) but probably should force-flush
   and confirm, because writers press it reflexively and silence reads as
   failure.
6. **Unrelated but worth fixing while you're in here:** `SPECS.md` §8 is stale —
   it lists the save debounce as to-do, but it shipped.

---

## 10. References

- **Reasoning and rejected alternatives** —
  [`archives/manuscript-mode-brainstorm.md`](archives/manuscript-mode-brainstorm.md)
- **Visual mockup** (three states, carousel, timeline prose, fork/version/export
  controls) — <https://claude.ai/code/artifact/0b3c9b67-a724-459a-9ffe-c266e452f8e3>
- **Current state of everything else** — [`SPECS.md`](SPECS.md)
