# Manuscript Mode — brainstorm record

> **Status: exploration, not a spec.** Nothing here is built and nothing here
> belongs in [`SPECS.md`](../SPECS.md) until it is. Session date: 2026-08-01.
> Supersedes the loose planning notes that opened the session — where the two
> disagree, this document is later and better grounded, because most of it was
> checked against the code rather than recalled.

---

## 1. Why this exists

Estoria is a story-mapping tool. People shown the app keep asking "so where
would I write?", and the same question had already occurred to the author. This
session was about understanding what a writing surface would cost and what it
would have to be to be worth building, rather than deciding to build one.

The framing that survived the session:

> **This is not an editor with a map beside it. It is the map, with a place to
> write inside it.**

The author's own answer to "what do you picture?" was *"seeing the scenes as I
write the manuscript."* That sentence is the feature. No writing app can do it,
because no writing app has the beats. The editor itself is the least interesting
part of the work, which is fortunate, because it was going to absorb most of it.

---

## 2. Decided

| Area | Decision |
|---|---|
| Platform | **Webapp first.** Android holds off on manuscript parity (see §6). |
| Format | **Markdown**, stored in `StoryDoc`. No rich-text editor library. |
| Granularity | **Per chapter**, not per scene. |
| The point of it | The chapter's scene flow is visible while writing; the beat you are in is highlighted. |
| Reading | The timeline **gains a prose mode** — same rail and scroll-sync, prose in the pane instead of scene cards. |
| Versions | **Prose forks with the version**, exactly as scenes do. |
| "Version" still means | A version of the **book** — chapters, scenes *and* manuscript. The word does not change. |
| Editor | **Keep it simple.** One mode. View mode uses default markdown rendering, no extra styling. |
| Export | Manuscript exports from whichever version is active. Leaning **build exporters** (§7). |

### Why chapter-level, not scene-level

Scenes are deliberately *labels*, not containers. `SCENE_TEXT_MAX` is **200
characters**, set in Session 56 by the narrowest timeline card a scene must fit
whole. The entire timeline is designed around a scene being glanceable. Hanging
2,000 words off a field capped at 200 characters fights a decision six sessions
old.

It also sidesteps the biggest structural problem — see §4.1.

### Why prose forks with the version

Considered and rejected: sharing one manuscript across versions (cheaper, no
duplication, and it would have made a version a pure *re-arrangement* of the same
prose, which is a genuinely interesting thing to be able to export). Rejected
because the invariant stated in [`types.ts`](../../src/types.ts) — a version is a
standalone fork, edits never leak — is what the whole design rests on, and making
prose the single exception would be a wart you hit the first time you forked to
rewrite an act. Consistency wins. The cost is real and is §5.

---

## 3. The design: chapter markdown, scenes separated by `***`

One markdown blob per chapter. Scene boundaries are **thematic breaks in the
prose**, not markers bolted onto it:

```markdown
The kitchen was cold when she came down...

***

"You didn't tell him," Marta said.
```

The first draft of this section proposed HTML comments (`<!-- s1 -->`). That was
wrong, and the question that killed it was *"is that something I have to type?"*
A marker the writer can see is a marker the writer has to work around. `***` is
the opposite: **real markdown a novelist types anyway**, since a scene break is
already part of the craft.

- The app writes one when you add a scene; **you typing one adds the beat to the
  map.** Structure and prose generate each other.
- **View mode renders it as a horizontal rule** — which is what a scene break
  looks like.
- **Export strips nothing.** It is already correct markdown, and it becomes the
  centred `#` that standard manuscript format wants.
- **Use `***`, not `---`.** A `---` on the line directly below text is parsed as
  a setext heading by most markdown parsers, which would silently promote the
  preceding sentence to an H2.

The alternative worth remembering is a **comment in storage drawn as a labelled
divider in the editor** — never typed, never seen as syntax. It is the nicer
editor, and it is unbuildable in a plain textarea: widget decorations need
CodeMirror. That is the first place the no-library decision has a real cost.

What this shape buys:

- **No scene ids required.** No fourth parallel array, no migration of
  `scenes`/`sceneLinks`/`scenePos`/`scenePosCompact`. One optional string on
  `Chapter` is the whole schema change.
- **Cursor position tells you the scene.** Count breaks above the caret. That is
  the "seeing the scenes as I write" moment, and it can reuse the timeline's
  existing active-ring vocabulary.
- **A break with nothing under it is an unwritten beat.** Per-scene progress,
  free — better than a per-chapter word count.
- **The causal type is never in the prose.** `sceneLinks` already holds
  therefore/but/and positionally; reading mode decorates the rule from it.
- **The count can disagree with the map** — four breaks in a three-beat chapter.
  That is not a failure, it is the drift signal: *you wrote a fourth beat, want
  it on the map?*
- **Prose may disagree with the map, and that is a feature.** You write past a
  beat, you merge two scenes without meaning to, you discover the scene you
  actually wrote. Showing that drift is what a mapping tool is *for* during a
  draft. Forcing prose into scene-shaped boxes punishes the good part of
  drafting.
- **Export and read-through are concatenation.**

Rejected alternative: one text field per scene, chapter prose as the
concatenation. It is the obvious design and it is wrong, because it makes the
structure authoritative over the prose. During a first draft it should be the
other way round.

### Where it lives: a section, not a screen

Revised after drawing it against the running app. The chapter modal (1220&times;662,
16px radius on `--panel`) is **already** the chapter surface: ruled sections,
each with an 11px/1.1px-tracked uppercase label and a right-aligned button
cluster. Characters, World details, Scene flow.

So **Manuscript is a fourth section under Scene flow**, not a third top-level
view beside Board and Timeline. Scene flow's existing *Collapse* control turns
the beats into a compact row sitting directly above the prose, which is exactly
the arrangement the feature is for — and it costs no new navigation concept. A
*Full screen* control handles a long session, borrowing the Expand/Collapse the
side panels already have.

### The rule that keeps it safe

> **The map never mutates the manuscript.**

Renaming a scene is harmless (breaks hold position, not text). Deleting a scene
must never delete prose. Reordering scene nodes on the canvas is the dangerous
one — it would silently rearrange finished paragraphs, and there is no undo model
covering that. So: structural edits change the map only; the app then reports
"prose order no longer matches the scene order" and offers a **confirmed,
undoable** reconcile. One-directional by default, reconciliation on demand.

---

## 4. What the code said

Findings that changed the plan. All checked in source, not recalled.

### 4.1 Scenes have no ids

```ts
scenes: string[];
sceneLinks: ConnType[];   // length = scenes.length - 1
scenePos?: Vec2[];        // parallel, positional
scenePosCompact?: Vec2[]; // parallel, positional
```

Scene identity is *array position*, and three parallel arrays already ride on it.
The opening notes claimed per-node text splitting was "already in the
architecture". It is not — there is no node to hang prose on. Storing manuscript
per scene means either a fourth parallel array or promoting scenes to objects
with ids, the latter touching drag-reorder, `sceneFit`, the timeline grid,
export, import and Android. Chapter-level prose avoids the whole question.

### 4.2 Chapter ids survive a fork

[`useStore.ts:1643`](../../src/store/useStore.ts) says so explicitly.
`cloneVersionData` deep-copies content but preserves ids. Whatever the storage
shape, `(bookId, draftId, chapterId)` is a stable key.

### 4.3 `words` is hand-typed, with 8 readers and 1 writer

| Reads | |
|---|---|
| [`Board.tsx:392`](../../src/components/Board.tsx) | card meta |
| [`Timeline.tsx:406`](../../src/components/Timeline.tsx) | rail card |
| [`Toolbar.tsx:78`](../../src/components/Toolbar.tsx) | book total |
| [`SeriesMap.tsx:247`](../../src/components/SeriesMap.tsx) | per-book total |
| [`ExportModal.tsx:16`](../../src/components/modals/ExportModal.tsx), [`markdown.ts:67`](../../src/lib/markdown.ts), [`markdown.ts:112`](../../src/lib/markdown.ts) | export header + per chapter |
| **Writes** | [`ChapterDetail.tsx:472`](../../src/components/ChapterDetail.tsx), a number input |

Every read is `c.words` or a reduce over it, so **keep the field and make it a
cache**: recompute from the manuscript on the save debounce, write it back. All
eight readers, the export shape, the import parser and Android stay untouched.

Two cautions:

- **The meaning changes.** Today `words` is a *planned* number — the AI import
  prompt literally says "estimate from scene length". Auto-updating redefines it
  as *actual*, and the gap between planned and actual is arguably the most
  motivating number a planning tool can show. Splitting into `target` + `words`
  keeps both and makes the board show *progress*.
- **Never auto-zero a hand-typed count.** Existing books have no manuscript; a
  naive recompute makes an 80k-word project display 0. Auto-compute only where
  manuscript text exists. Same grandfather shape as the Session 56 scene cap
  (`max(cap, current)`).

### 4.4 localStorage does not fit a forked manuscript

- 100k words of markdown ≈ **600,000 characters**.
- localStorage is ~5MB and stores strings as **UTF-16**, so ASCII costs roughly
  2 bytes per character. Usable budget ≈ **2.5M characters**.
- One manuscript ≈ **24% of the entire budget**. **Four versions ≈ 96%.**

Before the map, before JSON escaping (every newline becomes `\n`, two
characters), before base64 cover and ref images in the same blob, and before:

```ts
partialize: (s) => ({ doc, projectStash, ... })   // useStore.ts:1833
projectStash: Record<string, StoryDoc>            // useStore.ts:139
```

**Every other project is in the same string.** It is not versions × one novel, it
is projects × versions × manuscripts in one key.

### 4.5 The debounce defers the write, not the serialize

`SPECS.md` §8 is **stale** on this: the 500ms debounce shipped
([`persistence.ts:96`](../../src/store/persistence.ts), flushed on
`beforeunload` and `visibilitychange`). But its own comment says what it does
not do:

> zustand persist calls setItem on *every* state change (each keystroke
> re-serializes the whole store, images included), so we hold the latest
> snapshot and write once things go quiet.

`JSON.stringify` over the whole store still runs **per keystroke**; the shim
discards all but the last result. Invisible today, tens of milliseconds at 3MB,
in the main thread, while someone is drafting.

**So the performance note in the opening plan was right about the wrong thing.**
Textarea re-render and CodeMirror tokenizing are genuinely fine. Whole-store
serialization per keystroke is the bottleneck.

### 4.6 Android round-trips unknown fields losslessly — verified

Checked in `Estoria-aa`, two independent layers:

1. **`normalizeDocJson`** ([`Normalize.kt:176`]) builds each chapter with
   `val out = p.toMutableMap()` and only *overwrites* known keys. Unknown keys
   survive normalization.
2. **`ExtrasSerializer`** ([`StoryDoc.kt:61`]) captures every key the model does
   not know into `extra` on decode and merges it back on encode.
   `ChapterSerializer` and `VersionDataSerializer` both use it.

> Wraps a generated serializer to make the type a lossless passthrough.

**Conclusion: a `manuscript` field on `Chapter` survives an Android round trip
untouched.** Cross-device work will not lose prose, even with Android knowing
nothing about it. This was the one item flagged as a possible blocker; it is not.

Two consequences to remember rather than fix:

- Android's conflict detection hashes the canonical encoding, so a **prose-only
  edit on web registers as a real change on Android**. That is correct.
- If web auto-computes `words` and Android still offers a hand-typed field, a
  round trip can have the typed number recomputed away. Minor, but it is the
  first place the two apps would visibly disagree.

---

## 5. Storage: the actual cost of the versioning decision

Prose forking with versions is right on product grounds and makes the current
storage untenable (§4.4, §4.5). The move:

> **Split at the at-rest layer only. `StoryDoc` stays whole in memory and in
> every file.**

That keeps line 4 of [`types.ts`](../../src/types.ts) true as written — *the
entire project is one serializable JSON object* — which is why `.estoria.json`
export, rotating backups, cross-app sync and `normalizeDoc` all work.

| | Fixes per-keystroke serialize | Fixes the 5MB ceiling |
|---|---|---|
| A second **localStorage key** | Yes | **No** — quota is per origin |
| **IndexedDB** | Yes | Yes |

Concretely:

- **Load** — map from localStorage, prose from IndexedDB, assembled into one
  `StoryDoc` before the store sees it.
- **Autosave** — map to localStorage; only the **dirty chapter's** prose to
  IndexedDB. This is where the keystroke win comes from.
- **Export / sync / backup** — reassemble the full doc *including* prose, write
  one JSON. Contract intact, Android unaffected.
- **Import** — split back out on the way in.

### Hazards

1. **IndexedDB is async; `beforeunload` is not.** The flush at
   [`persistence.ts:117`](../../src/store/persistence.ts) works *because*
   `localStorage.setItem` is synchronous. An IndexedDB write started during tab
   close will not complete. **This is the one genuine data-loss risk in the whole
   design**, and it loses exactly the data the writer cares most about.
   Mitigations: flush prose on `visibilitychange` (fires earlier, already
   wired), a much shorter debounce for prose than for the map, write-through on
   blur and on chapter switch, and possibly a synchronous localStorage crash-pad
   holding only the in-flight chapter, recovered on next load.
2. **Two stores can drift.** Rule: **write prose first, map second.** Orphan
   prose is recoverable garbage; missing prose is lost work. Never delete prose
   as a side effect of a map operation. Sweep orphans on an explicit action only,
   the same shape as [`lib/prune.ts`](../../src/lib/prune.ts).
3. **`StorageAdapter` needs widening** to keyed access. This is not a detour:
   SPECS §8 already calls for "a small widening (`list()` / per-id load/save)",
   and §9 item 1 (fix the seam) is already on the backlog. Manuscript mode just
   makes it due earlier.

### Fork ergonomics, needed only because prose forks

- **Ask at fork time**: "copy the manuscript, or structure only?" Copy stays the
  default so semantics do not change, but a fork made to try a different chapter
  order need not drag 600KB along.
- **A way back**: a per-chapter *"pull this chapter's text from version X"* with
  a confirm. Not a merge engine — about a day's work — but without it, prose
  written in a fork you later abandon is stranded, and there is no other path.
- **Word counts in the version menu**, so a fork's cost is visible rather than a
  surprise.

### Deferred: separate files per chapter

Better **once Drive lands**, not before. The benefits of file-splitting are
*network* benefits — upload only the chapters that changed instead of the whole
novel on every autosave, resolve conflicts per file, share a single chapter with
a reader through Drive's own sharing. None of those exist against localStorage,
where splitting buys nothing IndexedDB does not already give. It also aligns with
SPECS §8 ("one file per project") and §9 item 13 (images as separate files
referenced by id). The cost is that cross-app conflicts become per-chapter
against a format shared with Android, so it is worth having a reason.

### Rejected for now: copy-on-write forks

A fork holds a reference until you actually edit that chapter's prose. Makes
forking free without changing user-visible semantics. Rejected because this
codebase's strength is that its invariants are simple and written down, and
*"standalone fork, except sometimes it is a pointer to its parent"* is a much
worse sentence than the one in `types.ts` today. Revisit only if measurement says
so.

---

## 6. Android

Hold off on manuscript feature parity. Plan for the possibility.

What that means concretely, given §4.6:

- **Nothing is required of Android to keep files safe.** The `manuscript` field
  round-trips losslessly today. Ship web-only without coordination.
- **Do add a regression test on the Android side** covering a chapter with an
  unknown field, so the passthrough is not lost to a future refactor. It is
  currently a property of two layers, neither of which mentions manuscripts.
- **When parity is wanted**, the open questions are read-only vs editable, and
  whether a phone gets the scene-flow-beside-the-editor idea at all (the timeline
  was already deliberately not mirrored, so precedent exists for web-only
  surfaces over shared data).

---

## 7. Export: exporters vs "open in"

Leaning **exporters**. The trade:

### Build exporters

**For**

- Full control of formatting, which is the entire point for the one format that
  matters: **standard manuscript format** (double-spaced, 12pt, indented
  paragraphs, `#` scene breaks, title block). That is what agents and beta
  readers expect, and it is a thing Obsidian cannot do and Scrivener charges for.
- Works offline. No accounts, no Drive dependency, no OS integration.
- Deterministic and testable.
- Honest about being one-way.
- Works identically on Android later.

**Against**

- `.docx` is real work: a zip of several XML parts, a few days hand-rolled, and
  then owned forever (styles, unicode, images).
- One-way. Edits made in Word never come back — no beta-reader comments, no
  editor track changes.
- Maintenance surface grows per format.

### "Open in" handoff

**For**

- Nearly free. Write `.md`, hand it off.
- Leverages Google Docs' and Word's own converters, which are better than
  anything hand-written.
- Potentially two-way once Drive lands, since Docs exports back to md/txt.

**Against**

- Formatting is whatever the receiving app decides. No standard manuscript
  format, ever.
- **On desktop web, "open in" is just export with extra steps** — download, then
  double-click. The idea only really pays off as an Android intent, which is the
  platform being deferred.
- Depends on Drive/OS integration not yet built.

### Recommended shape

1. **`.md` and `.txt` now.** Trivial (concatenate, strip anchors), and they cover
   the open-in case by download.
2. **SMF `.docx` when a manuscript actually needs handing to someone.** That is
   the export worth days of work.
3. **Skip PDF entirely.** A print stylesheet on the timeline prose view means
   Cmd+P produces a properly typeset PDF for free, with no export code at all.

Note that manuscript export is a **second export with a different purpose** from
the existing one. Today's export is a *map* export (scenes as bullets,
connectors, Obsidian-shaped). Manuscript export is prose. They should not be
merged, and the Export modal has to say which is which.

---

## 8. Keyboard shortcuts — the actual question

The original notes listed "keyboard shortcuts for simple editor mode" as an open
item. With the editor now deliberately simple, the interesting shortcuts are not
the formatting ones. Four groups, in ascending order of how much they matter:

1. **Formatting** — `Cmd+B` / `Cmd+I` wrapping the selection in `**` / `*`.
   Table stakes, and low value in a first draft where most novelists use italics
   and nothing else. **One real gotcha**: manipulating `selectionStart/End`
   directly *destroys the browser's native undo stack*. `document.execCommand
   ("insertText")` preserves undo and still works everywhere despite being
   deprecated. That detail is the whole cost of this group.
2. **Mode** — toggle edit/view.
3. **Navigation** — jump to next / previous scene anchor. This is the first one
   that is Estoria-specific, and in a 4,000-word chapter it is more useful than
   bold.
4. **Structural** — insert a scene anchor at the cursor, *which creates a scene
   on the map*. This is the one worth designing carefully, because it inverts the
   flow: writing generates structure instead of merely filling it in. It is the
   sharpest expression of the whole feature and it is a shortcut, not a screen.

`Cmd+S` should not save (saving is automatic) but could force-flush and confirm,
since writers press it reflexively and silence reads as failure.

---

## 9. Riskiest assumption, and the next step

Everything rests on **"seeing the scenes as I write is actually valuable."** It
is untested. It is the entire reason to build this rather than draft in
Scrivener. If it turns out to be neutral, this is a large amount of work for a
worse text editor.

It is also cheap to test.

### Prototype on the current blob

Meaning: add `manuscript?: string` to `Chapter` **right now**, persisted by the
existing localStorage path exactly as it stands. No IndexedDB, no adapter
widening, no versions work, no export, no timeline mode. Build one thing: a
writing pane for a single chapter with that chapter's scene flow beside it and
the current beat highlighted.

Then write a few thousand real words into **one** chapter and see whether the
peripheral-scene idea feels like anything.

- It is a **feel test, not a load test.** Do not grow a test manuscript toward
  100k words in the blob; §4.4 is exactly where that breaks.
- Nothing is wasted if the answer is no — it is roughly a day, and the field is
  deleted with it.
- If the answer is yes, the storage work in §5 is *earned* rather than assumed,
  and the editor is already written when the persistence lands under it.

### Sequence if it survives

1. Prototype (above).
2. Widen `StorageAdapter`; move prose to IndexedDB; keep the file format whole.
3. Timeline prose mode.
4. Word count as a cache, with the `target` / `words` split.
5. Exports: md and txt, then SMF docx, print stylesheet for PDF.

---

## 10. Still open

1. **`target` + `words` split, or cache only?** (§4.3) — schema bump vs losing
   the planning number.
2. ~~Anchor syntax~~ — **settled: `***`.** See §3. Remaining sub-question: what
   the editor does when the break count and the scene count disagree, beyond
   raising the drift bar.
3. **Which of the four shortcut groups** are worth building (§8), particularly
   whether "insert scene anchor creates a scene on the map" is v1 or later.
4. **Does the timeline prose mode replace the scene pane or sit beside it** as a
   third toggle alongside vertical/horizontal.
5. **Android regression test** for unknown-field passthrough (§6).
6. **`SPECS.md` §8 is stale** about the save debounce (§4.5) — worth correcting
   independently of any of this.
