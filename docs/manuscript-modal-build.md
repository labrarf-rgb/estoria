# Manuscript mode as its own modal — build brief

> **What this is.** A handoff for the next session. Manuscript mode is **built
> and working** (SPECS §4); what is left is a restructure of *where it lives*.
>
> **Read [`SPECS.md`](SPECS.md) first** — §4's Manuscript rows are the current
> state, §9 item 16 is why this work exists. The dated account of how it got here
> is the 2026-08-02 entry in [`SESSIONS.md`](SESSIONS.md). Everything below is
> scoped to this repo.
>
> ## ⚠️ Work on the branch, not `main`
>
> ```bash
> git checkout feature/manuscript-mode
> ```
>
> Everything described here is on **`feature/manuscript-mode`** — 22 commits,
> **not merged, not pushed, not deployed**. `main` has none of it. Run the dev
> server on a **separate port** so the branch's browser storage stays apart from
> whatever you normally develop against (localStorage and IndexedDB are keyed by
> origin, and origin includes the port):
>
> ```bash
> npx vite --port 5199 --strictPort
> ```
>
> There is a `.claude/launch.json` entry named `estoria-manuscript` that does
> exactly this. Written 2026-08-02. Delete this file when the restructure lands,
> folding what survives into [`SPECS.md`](SPECS.md) §4.

---

## 1. Why

Four separate complaints in one session turned out to be one cause:

- beat cards too tall,
- the manuscript's controls scrolling out of reach,
- an empty sheet making the modal scroll with no visible scrollbar,
- navigating between the scene canvas and the manuscript feeling messy.

Each was patched. The cause was not: **a writing surface and a planning surface
are competing for a single scrolling column.** The chapter modal ended up
stacking three sticky layers (its own header, the manuscript header, the beat
guide) over two scroll contexts (the modal and the textarea). Every fix added
another rule to that pile.

**This does not break the original premise** — "the map, with a place to write
inside it" — nor the locked decision against a fourth top-level view. It is
still entered from a chapter and still shows the beats while you draft. It is a
second face of the same chapter, not a new place in the app.

---

## 2. The design (from the author, 2026-08-02)

One chapter, two modals, and a switch between them.

| | |
|---|---|
| **Manuscript modal** | Its own modal. Carries the **chapter** (number + title), the **word count**, a **view of the scenes**, and the writing pane. |
| **Story map modal** | The chapter modal as it is today, minus the Manuscript section. |
| **The switch** | A button to toggle between the two, **on the chapter's meta line** — the row carrying the word count, the scene count and Idea / Draft / Done. In Story map mode it reads *Manuscript*; in Manuscript mode it reads *Story map*. One button, always in the same place, naming where it takes you. |
| **Memory** | Remember which of the two was last opened, and open that one next time a chapter is opened. |
| **Controls** | Each modal keeps its own collapse/expand and its own buttons. |

---

## 3. What is already built (do not rebuild)

All of this works and is verified; see SPECS §4.

- `Chapter.manuscript`, `Chapter.target`, `StoryDoc.author` — optional, **no
  `SCHEMA_VERSION` bump**, and Android round-trips them untouched (SPECS §6).
- **Prose at rest in IndexedDB** with the synchronous crash pad
  (`store/prose.ts`). Do not disturb this; the split is at the at-rest layer only
  and `StoryDoc` stays whole in memory and in every file.
- **Markdown rendering** (`lib/manuscript.ts` `parseBlocks`, `lib/inline.ts`),
  shared by the reading view and the `.docx` exporter so they cannot drift.
- **Exports**: standard-format `.docx`, `.md`, `.txt`, and `Cmd+P` as the PDF
  route via the `@media print` block in `index.css`.
- **Word count** as a cache of the prose, with its two protective rules.
- **Fork ergonomics**: the copy-or-structure question, word counts in the version
  menu, and pull-a-chapter's-text-from-another-version with one undo.
- `Cmd+S` force-flush, and write-through on blur and on leaving a chapter.

**The beats are a guide, not a structure.** The `***` contract was built and
deliberately removed — see SPECS §4 "The beats are a guide, not a structure"
before proposing anything that re-couples prose to scenes.

---

## 4. What to build

1. **A `ManuscriptModal`**, opened per chapter. Header carries the chapter number
   and title, the word count, the mode switch, and its own size control.
2. **A view of the scenes inside it.** The current horizontal beat strip exists
   (`BeatCard` in `ManuscriptSheet.tsx`) and can move across, but a **rail down
   one side** is the shape §9 item 16 suggested: it gives the prose the window,
   needs no stickiness, and leaves one scroll context instead of two. Decide
   this deliberately — it is the main thing the restructure is for.
3. **The mode switch**, on the meta line in both modals (see §2), swapping the
   open chapter between them without closing and reopening. The meta line already
   exists in `ChapterDetail`'s header — the words chip, the target, the scene
   count and the status picker — so the manuscript modal needs the same row, which
   is also where its word count and status belong.
4. **Remember the last mode** — one persisted flag beside `manuscriptExpanded`'s
   replacement, not per chapter.
5. **Strip the Manuscript section out of `ChapterDetail`**: the section header,
   its sticky wrapper, `manHeaderH`, `sheetView`, and the `PullFromVersion` row
   all move to the new modal.
6. **Repoint the ways in.** `openChapterSection("manuscript")` is used by the
   timeline's prose click and by `ProsePane`'s empty state; both should open the
   manuscript modal instead.

---

## 5. Decisions to settle before building

1. **Scene rail or beat strip**, per item 2 above.
2. **Does the scene canvas stay editable in the manuscript modal?** The current
   guide is inert. A rail that only shows beats is simpler and matches "a view of
   the scenes"; making it editable rebuilds the competition this work removes.
3. **What the size control does** now that there is no section to grow. Probably
   modal width, as `sceneFlowExpanded` does today for both.
4. **Where `Cmd+S`, blur-flush and the drafting write-through live** once the
   sheet moves — they are currently registered inside `ManuscriptSheet` and should
   move with it, not be duplicated.
5. **Whether `sceneFlowExpanded` should finally be renamed.** It drives both
   areas' size today and is named for only one of them; the persisted key is what
   makes it awkward.

---

## 6. Still owed from the last session

Unrelated to this restructure, but do not let them fall off:

- **Word has never opened the `.docx`.** Structure and CRCs are verified, the
  application is not available here. One manual check before anyone sends a file.
- **An Android regression test** for a chapter carrying an unknown field, so the
  passthrough survives a refactor (different repo; requirement in SPECS §6).
- **A drag-select check** in the timeline's manuscript pane: dragging across
  prose should select it, not open the chapter. The test never came back clean
  because a stale modal was open.
- SPECS §9 item 15, the 2px timeline card clip at half screen — pre-existing and
  still the author's call.

---

## 7. Estoria is not only a story map any more

Adding a place to write changes what the product *is*, and the copy has not
caught up. **This is a v3**, from a `0.1.0` that was never touched since the
first commit; the build number keeps counting from where it is (it is the git
commit count, so it carries on by itself).

- `package.json` is already at **`3.0.0`**, with the description changed to
  *"Estoria — map your story and write it."*
- **Swept.** `index.html`'s `<title>` (which is what the browser tab shows, and
  which now has a `meta description` beside it), `README.md`'s opening line,
  `SPECS.md` §1, and the AI import prompt in `src/lib/markdown.ts`. That last one
  was the careful edit: the Android app reads the same files and the prompt
  documents a format, so **only the sentence describing the app changed** and the
  schema, field separators and headings it specifies did not.
- **Deliberately left:** the remaining hits name the `Story Mapping WebApp
  Prototype/` folder, which is a real directory on disk and the design reference
  (SPECS §1), and the source guides the templates came from
  (`src/lib/templates.ts`). Renaming the folder is a separate job; misquoting the
  guides would be wrong.
- The `About` modal shows `v… · build N · sha · time` from
  `window.__ESTORIA_BUILD__`, so it picks the new version up from
  `package.json` with no further work.
- **House style still applies to every new string**: no em dashes in anything the
  user reads (SPECS §3).

---

## 8. Scale: does this survive a real book collection?

**The target to test against: 300k words in a version, 5 versions, 5 books.**
That is 25 manuscripts, ~7.5M words, roughly **45M characters** — and nothing in
this feature has been run against more than a few thousand.

### Build the fixture first

A generator, not hand-typing: a script that fills a `.estoria.json` with N books
× M versions × K chapters of lorem prose at a target word count, imported through
the normal path so the split, the counts and the sync fingerprint all see it.
Keep it out of the repo's real data and run it on the isolated port (§0).

### Where it will break, in the order it probably breaks

1. **The crash pad, and this one is a real bug today.** `writePad` puts every
   *dirty* manuscript into **localStorage**, synchronously, before the IndexedDB
   write. It was designed for "usually one chapter". A single 300k-word chapter
   is ~1.8M characters ≈ **3.6MB in UTF-16 — most of the ~5MB origin quota on its
   own**, and it shares that quota with the map. Expect `QuotaExceededError` on
   the pad write; it is caught and ignored, so the *symptom* is the safety net
   silently not being there. Fix by capping what the pad accepts (a tail of the
   chapter, or a size ceiling above which it does not try) and saying so, rather
   than failing quietly.
2. **Export, sync and backup reassemble the whole document into one JSON
   string.** `JSON.stringify` over 45M characters on the main thread, plus the
   sync fingerprint's SHA-256 over a canonical copy of the same, on every
   save-settle. This is the design's deliberate trade — `StoryDoc` stays whole in
   every file — so the question is not whether to split it but whether the
   fingerprint can be cheaper (hash per chapter and combine?) and whether these
   belong in a worker.
3. **`loadAllProse()` reads every manuscript into memory at startup.** 45MB of
   strings before the first paint, for a writer who is going to open one chapter.
   Consider loading the active book/version eagerly and the rest on demand — the
   key is already `(projectId, bookId, draftId, chapterId)`, so this is a
   filtered cursor rather than a redesign.
4. **`countWords` and `hasProse` run in render paths.** `ChapterDetail` computes
   `counted` every render, and `ExportModal` calls `manuscriptWordCount` and
   `writtenChapters` over every chapter. Each is a full regex sweep of the prose.
   Memoize, or lean on the stored `words` cache that exists precisely for this.
5. **Timeline manuscript mode renders every chapter's prose into the DOM.**
   `parseBlocks` × 30 chapters × 300k words is a lot of nodes. It needs
   windowing, or to render only the chapters near the viewport.
6. **`splitProse` / `mergeProse` walk every chapter of every book and version**
   on each flush — 750-odd chapters at this size. Cheap per item and identity is
   preserved where nothing changed, but measure it rather than assume.

### What to measure

Time to first paint on load; time from keystroke to the prose reaching
IndexedDB; the main-thread cost of one save-settle with Sync configured; peak
memory with all 25 manuscripts loaded; and whether the `.estoria.json` a 45M
character document produces can be written, re-read and round-tripped at all.

**Report the numbers in `SESSIONS.md`, even the ones that pass** — the point of
this exercise is a baseline to compare against later, not a pass mark.
