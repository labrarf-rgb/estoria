# Manuscript mode — what is still owed

> **What this is.** The remainder of a handoff whose main job is done. The
> manuscript is now **its own modal** (SPECS §4, and the 2026-08-02 (b) entry in
> [`SESSIONS.md`](SESSIONS.md)) — §4 and §5 of this file were the instructions
> for that work and were cut out when it landed.
>
> **What is left is §6 and §8, and they are independent.** Scope a session to one
> of them out loud. §8 is the one that matters.
>
> ## ⚠️ Work on the branch, not `main`
>
> ```bash
> git checkout feature/manuscript-mode
> ```
>
> Everything here is on **`feature/manuscript-mode`**, **not merged, not pushed,
> not deployed**. `main` has none of it. Run the dev server on a **separate
> port** so the branch's browser storage stays apart from whatever you normally
> develop against (localStorage and IndexedDB are keyed by origin, and origin
> includes the port). The `.claude/launch.json` entry `estoria-manuscript` does
> exactly this:
>
> ```bash
> npx vite --port 5199 --strictPort
> ```
>
> Delete this file when both sections below are done.

---

## 0. What to read, and nothing else

Context is the budget. Read this file, then:

- [`SPECS.md`](SPECS.md) **§4** for what manuscript mode does today, and **§9
  items 15-16** for the open backlog.
- [`SESSIONS.md`](SESSIONS.md), the **2026-08-02** entries only, if you need to
  know why something is shaped the way it is.

Do **not** read the whole of SPECS or the session log front to back.
`archives/manuscript-mode-brainstorm.md` holds rejected alternatives, which is
only worth opening if a decision looks arbitrary.

**Every user-facing string you add follows house style (SPECS §3)** — no em
dashes in labels, tooltips, empty states, confirm dialogs or exported text, and
write the way a person talks rather than the way a manual does.

---

## 6. Small and independent, do not let them fall off

Each of these is separable from the others and from §8. None was touched by the
modal restructure.

- **An Android regression test** for a chapter carrying an unknown field, so the
  passthrough survives a refactor (different repo; requirement in SPECS §6).
- SPECS §9 item 15, the 2px timeline card clip at half screen — pre-existing and
  still the author's call.

**Closed 2026-08-02 (c), by the author at the keyboard — do not re-raise:**

- ✅ **The drag-select check.** Dragging across prose in the timeline's
  manuscript pane selects the words and leaves the chapter closed; a click opens
  it; a click that wobbles a pixel still opens it. The press-versus-drag rule at
  [`ProsePane.tsx`](../src/components/ProsePane.tsx) works as designed.
- ✅ **Multi-chapter drag-reorder**, confirmed with a real pointer (it had only
  been exercised with synthetic events).
- ⏸️ **Word opening the `.docx`** — deferred by the author, who has no Word on
  this machine. Structure and CRCs are verified and it is assumed good. Pick this
  up only if a real file misbehaves in someone else's hands.

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
