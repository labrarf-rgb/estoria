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
- **Still to sweep:** nine places still describe Estoria as a story-mapping tool
  and nothing else — `README.md`, `index.html`, `docs/SPECS.md` §1,
  `src/lib/markdown.ts` (the export header and the AI import prompt) and
  `src/lib/templates.ts`. The export and import strings are the careful ones:
  the Android app reads the same files and the import prompt is a documented
  format, so change the prose around them, not the field separators or the
  schema they describe (see SPECS §3 "Conventions").
- The `About` modal shows `v… · build N · sha · time` from
  `window.__ESTORIA_BUILD__`, so it picks the new version up from
  `package.json` with no further work.
- **House style still applies to every new string**: no em dashes in anything the
  user reads (SPECS §3).
