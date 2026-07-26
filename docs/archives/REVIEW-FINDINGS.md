> # ARCHIVE — nothing here is outstanding
>
> Three completed code reviews and one completed task brief, 2026-07-11 →
> 2026-07-18. **Every item in this file is closed.** Kept for the reasoning —
> why each fix was chosen, and what was rejected — not as a to-do list.
>
> Read it for background on a past decision; do not work from it. Line numbers
> and file paths are frozen against the commits named in each section
> (`df7261e`, `d4faa44`, `49abc79`) and are stale against `main`. What actually
> shipped is recorded in [`../SESSIONS.md`](../SESSIONS.md) (Sessions 30, 32,
> 38, 39); current state is [`../SPECS.md`](../SPECS.md). Where this file says
> "log the session in `docs/SPECS.md`", that convention now means
> `docs/SESSIONS.md`.

---

# Code review — Session 29 commit `df7261e` (move scenes between chapters, card meta redesign)

Reviewed 2026-07-11. **Status: all five items fixed and verified in-browser on
2026-07-11 (Session 30) — see the SPECS session log.** Kept for the record.

The link-splicing logic in `moveScenesToChapter` is correct,
including edge cases (insert at 0, at end, into an empty destination), and the
UI flow matches SPECS. The items below are what to fix, ordered by priority.
Items 1–2 are real defects; 3–5 are polish. Line numbers are against `main`
at `df7261e` (the current HEAD).

Ground rules for all fixes:

- **No schema change.** Scenes stay `string[]` + positional `sceneLinks`; the
  `.estoria.json` round-trip with Android must be untouched.
- Run `npm run typecheck` after the changes and verify in a dev server per the
  steps under each item.
- Log the session in `docs/SPECS.md` per the usual convention.

---

## 1. ✅ Moving all scenes out leaves a 0-scene chapter — violates the ≥1-scene invariant (FIXED)

**Where:** `src/store/useStore.ts`, `moveScenesToChapter` (~line 763–828).

**Problem:** The move flow has no "keep at least one scene" guard. Selecting every
scene and moving them leaves the source chapter with `scenes: []`. Everywhere
else the app enforces at least one scene per chapter:

- The per-scene delete button is hidden when only one scene remains
  (`ChapterDetail.tsx:817`, the `ch.scenes.length > 1` condition).
- New chapters are created with `scenes: [""]` (`useStore.ts:561` and `:959`).
- The markdown importer backfills `["New scene."]` when a chapter parses with
  no scenes (`src/lib/markdown.ts:401`).

So a 0-scene chapter is a state nothing else can produce, a markdown round-trip
silently "repairs" it by inserting a `New scene.` placeholder (the doc changes
without the user doing anything), and the Android app may assume ≥1 scene.

**Fix (chosen approach — placeholder, not blocking):** Do NOT block moving the
last scene(s); the user may legitimately want to relocate everything. Instead,
in `moveScenesToChapter`, after computing `remaining`: if `remaining.scenes`
is empty, set the source chapter to `scenes: [""]`, `sceneLinks: []`, and
`scenePos: sceneAutoArrange([""], 0, cols)` — i.e. the same empty-placeholder
state a freshly created chapter has. The moved scenes still all transfer; the
source just keeps one blank placeholder card.

**Verify:** In the dev server, open a chapter, enter Move scenes, select ALL
scenes, move them to another chapter. The source chapter should show a single
empty placeholder scene (card count "1 scene"), the destination should have
gained all the moved scenes with links intact. Export to markdown and re-import;
the source chapter must round-trip without gaining a "New scene." it didn't
visibly have.

## 2. ✅ Scene-card hover border is dead in ALL modes (FIXED)

**Where:** `src/components/ChapterDetail.tsx:792–800` (the scene-card inner div).

**Problem:** The div has `hover:border-faint` in its className, but the move-mode
selection styling added an inline `style` that ALWAYS sets
`borderColor: isSelected ? "var(--therefore)" : "var(--rule)"` and
`boxShadow: ...`. Inline styles override the CSS hover rule, so the pre-existing
hover highlight on scene cards no longer works — even in normal (non-move) mode.
This is a regression from `df7261e`.

**Fix:** Only apply the inline override when the card is actually selected:

```tsx
style={
  isSelected
    ? {
        borderColor: "var(--therefore)",
        boxShadow:
          "0 0 0 2px color-mix(in srgb, var(--therefore) 45%, transparent), var(--shadow)",
      }
    : undefined
}
```

Keep `border-rule` in the className (it was changed to bare `border` in this
commit — restore `border-rule` so the unselected default comes from the class
again) and keep `shadow-[var(--shadow)]` in the className as the default shadow.

**Verify:** In normal mode, hovering a scene card must show the faint border
highlight again. In move mode, selected cards get the accent ring; unselected
cards still show the hover highlight.

## 3. ✅ Destination chapter gets a cramped (≤3-column) layout that won’t self-heal (FIXED)

**Where:** `src/store/useStore.ts:823` — `scenePos: sceneAutoArrange(toScenes, 0)`.

**Problem:** The destination's positions are recomputed with no `cols` argument,
so `sceneAutoArrange` falls back to the count heuristic in `sceneCols()`
(max 3 columns). And because `openChapter` (`useStore.ts:1405`) only re-arranges
when `scenePos.length !== scenes.length`, this fresh-but-narrow layout is
"valid" and suppresses the width-fitted arrangement the user would otherwise get
when opening the destination chapter. Result: after a move, the destination
opens as a narrow 3-column grid inside a wide/expanded modal.

**Fix:** Estimate the destination's visible canvas width the same way
`openChapter` does (`useStore.ts:1394–1398`: `vw` from `window.innerWidth`,
`modalW` from `sceneFlowExpanded`, `boxW = modalW - 44`) and pass
`sceneColumnsForWidth(toScenes.length, boxW)` as the `cols` argument at line 823.
Consider extracting that 4-line width estimate into a small helper shared by
`openChapter` and `moveScenesToChapter` rather than duplicating it.

**Verify:** Move scenes into a chapter so it has ≥6 scenes, then open that
chapter with the modal in its default width: the grid should use the same column
count a freshly-opened chapter of that size gets (not capped at 3).

## 4. ✅ Connector pills are still clickable in move mode (FIXED)

**Where:** `src/components/ChapterDetail.tsx:726–747` (the Therefore/But/And
pill buttons).

**Problem:** Move mode suspends dragging, editing, the insert-edge buttons, and
delete — but the connector pills still cycle links on click. A stray click while
selecting scenes silently edits the doc.

**Fix:** Keep the pills visible (link context is useful while choosing what to
move) but make them inert in move mode: `disabled={moveMode}` on the button plus
`className` additions `disabled:pointer-events-none` (or gate the `onClick`
with `moveMode`), and suppress the "Click to cycle…" tooltip when disabled.

**Verify:** Enter move mode, click a connector pill — nothing should change.
Exit move mode — the pill cycles Therefore/But/And again.

## 5. ✅ `subset()` can persist `undefined` into `sceneLinks` (FIXED)

**Where:** `src/store/useStore.ts:778`.

**Problem:** `outLinks.push(sorted[j + 1] === a + 1 ? links[a] : "therefore")`
trusts that `from.sceneLinks` is fully populated. Render code defends against
short link arrays (`ch.sceneLinks[i] ?? "therefore"`, `ChapterDetail.tsx:730`),
and imported docs are the source of such gaps — but this line would write the
`undefined` into the persisted doc.

**Fix:** `links[a] ?? "therefore"`.

**Verify:** typecheck passes; no behavior change on well-formed docs.

---

## Noted, no action needed

- **Word counts don't move with scenes.** `words` is chapter-level metadata
  (imported/estimated, `markdown.ts:353`), not derived from scenes, so the new
  "N scenes · N.Nk words" card row shows scene counts shift while words stay
  put. Inherent to the data model — do not try to reapportion words.
- **Avatar stack has no cap / "+N" overflow** on board cards. Pre-existing
  before `df7261e`; fine to leave unless the user raises it.

---

# Code review — Session 31 work (life-story templates + add-character scroll)

Reviewed 2026-07-11 against the uncommitted working tree (Session 31, on top of
`d4faa44`). **Status: all four items resolved (Sessions 31–32) — see the SPECS
session log. Kept for the record.**

The core of both features is sound: the `TemplateBeat` widening is
backward-compatible (existing templates omit the third element; `applyTemplate`
falls back with `summary ?? ""`); act 4 is safe end-to-end (the store never
clamps acts upward, `roman()` renders any positive act, Board act-bands group
dynamically, `parseActNumber` in `markdown.ts` reads digits and roman i–v, and
Panchasandhi already shipped an act-4 beat); the four templates' act splits
match the SPECS log (3/7/6, 4/5/6, 5/3/2/5, 3/3/4/6 — recounted, correct); and
the hooks-before-early-return ordering in `CharactersPanel` is correct.
`npm run typecheck` is clean on the current tree.

Items ordered by priority: **1 is a real behavior defect; 2 is a doc-accuracy
fix; 3–4 are small polish (4 is one line; 3 needs the user's OK).**

Ground rules (same as the Session-29 review):

- **No schema change.** The `.estoria.json` round-trip with Android must be
  untouched.
- Run `npm run typecheck` after the changes and verify in a dev server per the
  steps under each item.
- Log the session in `docs/SPECS.md` per the usual convention and mark items
  ✅ here when fixed.

## 1. ✅ Scroll effect hijacks EVERY card expand, not just add-character (FIXED)

**Where:** `src/components/panels/CharactersPanel.tsx:22–28` (the new
`useEffect` keyed on `[show, sel]`).

**Problem:** The requested behavior was "scroll the NEW card into view after
+ Add character." But `selectChar` toggles `selChar` on every card-header click
(`useStore.ts:1453`), and the effect fires on ANY `sel` change — so manually
expanding any card, even one already fully visible mid-panel, yanks it to the
top of the scroll area (`block: "start"` pins its top at 76px). Related:
`selChar` is NOT cleared when the panel closes (`close()` only flips
`showChars`), so merely REOPENING the panel later also fires the effect
(`show` edge) and scroll-jumps to whatever card was last expanded, possibly
from minutes ago.

**Fix (chosen approach):** change `block: "start"` to `block: "nearest"` in the
`scrollIntoView` call. Keep `scroll-mt-[76px]` on the card and keep the effect
deps as `[show, sel]`. Why this is sufficient (per the CSSOM scroll spec):

- Card already fully visible → **no scroll at all**. Fixes both the mid-panel
  expand jump and the reopen jump for on-screen cards.
- Card out of view below and taller than the panel (exactly the add-character
  case — the new card is selected, therefore expanded) → aligns its **top**
  edge, honoring scroll-margin. Identical end state to today's verified
  behavior (card top at 76px, just under the sticky header).

Do NOT add prev-sel refs / "was this an add?" bookkeeping — `nearest` covers
every case with one word. Also update the Session 31 bullet in `docs/SPECS.md`
(`block: "start"` → `block: "nearest"`, and note the why) so the log stays
truthful.

**Verify:** (a) padded roster scrolled to top, + Add character → new card's top
lands at ~76px exactly as before. (b) Scroll so a collapsed card is fully
visible mid-panel, click its header — the panel must NOT move if the expanded
card still fits, and must scroll its top to ~76px if it doesn't. (c) Expand a
card, close the panel, reopen it — no jump when that card is already in view.

## 2. ✅ SPECS says "17 structures" — one of the 17 is the blank starter (FIXED)

**Where:** `docs/SPECS.md` status table (Templates row) and the Session 31 log
entry ("bringing the library to **17**").

**Problem:** `TEMPLATES` has 17 entries, but `id: "blank"` ("Single Blank
Chapter", 1 beat, tag "Minimal") is a starter, not a story structure. "17
structures" overstates by one.

**Fix (doc-only):** reword the table cell to "16 structures + blank starter
(17 template cards), incl. 4 biography/autobiography life-story arcs with
per-chapter prompts", and adjust the Session 31 log line the same way.

## 3. ✅ Templates modal is 17 flat cards; the life-story arcs are buried at the bottom (FIXED — facet filter)

**Where:** `src/components/modals/TemplatesModal.tsx` (single `TEMPLATES.map`
into one 2-col grid).

**Problem:** The modal was a long undifferentiated scroll; a memoirist had to
scroll past the fiction structures to find the four new templates.

**Resolution (with the user):** the user rejected forcing each template into a
single bucket — several genuinely belong to two (Vogler's Hero's Journey is
*Myth & journey* AND *Screenwriting*; Harmon's Story Circle is *Foundational* +
*Screenwriting* + *Myth & journey*; Propp is *Myth & journey* + *World
traditions*). So instead of the two-section split, `StoryTemplate` gained a
**`groups: string[]`** field (merged on via a co-located `GROUP_MEMBERSHIP` map
in `templates.ts`; new exported ordered `TEMPLATE_GROUPS`), and the modal renders
a **facet filter bar** — `All` (default) + six facets (Foundational,
Screenwriting, Myth & journey, World traditions, Genre, Life story). A template
shows under every facet it carries; the bar is a `flex flex-wrap` row (one line
when wide, wraps when narrow) with a live count. The card grid was also made
responsive (`grid-template-columns: repeat(auto-fill, minmax(235px, 1fr))` →
3 cols wide / 2 half-screen / 1 phone) and the modal widened `880px → 980px`. No
change to Insert/Replace. Logged in SPECS Session 32.

## 4. ✅ AI import prompt still tells the model to use at most three acts (FIXED)

**Where:** `src/lib/markdown.ts:153` (the RULES line of the AI import prompt).

**Problem:** "Group chapters under ## Act 1 / ## Act 2 / ## Act 3 (use only as
many acts as the draft supports)" was written when everything was ≤3 acts. Two
of the new shipped templates are 4-act, and the importer already parses
`## Act 4` fine (`parseActNumber`, digits + roman i–v) — only the prompt
wording caps the AI at three.

**Fix (one line):** reword to "Group chapters under ## Act 1 / ## Act 2 / …
headings (use as many acts as the draft supports)."

**Verify:** typecheck; open the Import modal and eyeball the copied prompt text.

## Noted, no action needed

- **Duplicate beat title "The Blind Spot"** appears in both The Innovator's
  Quest and The Rags-to-Riches Trajectory. Faithful to the source doc; chapter
  ids are `uid()`s so there is no collision. Leave as is.
- **`scroll-mt-[76px]` hardcodes the sticky-header clearance.** Acceptable and
  documented in the Session 31 log; if the header ever changes height, update
  the value — do not build a measuring ref for this.
- **Long prompt summaries as card subtitles** were verified clamped in-browser
  in Session 31; no overflow work needed.

---

# Task — Asset-backed pinned references (schema v5) — instructions for Opus

Written 2026-07-18 after a design discussion with the user. **Status: ✅ DONE
(Session 38, 2026-07-18).** All seven instruction sections implemented and
verified; see the Session 38 log in `docs/SPECS.md` for the build summary and
migration test. This is a feature build + real data migration, not a review-fix
list. Read the whole section before writing code; the migration subtleties in
item 4 are where the risk lives.

## What the user decided

1. **Every note/image added inside a chapter's "Pinned references" — and on a
   world entry — is created as a shared book Asset and auto-linked**, instead of
   today's standalone per-chapter/per-entry copy. One pool of linkable assets;
   no more orphan notes.
2. **Asset links are live write-through.** A linked ref renders from the asset;
   editing it in the chapter modal, the World panel, or the Notes-panel library
   all edit the same asset. (Today `linkAssetToChapter` takes a *snapshot copy*
   — that behavior is removed.)
3. **Migrate all existing standalone refs into assets.** Schema v4 → **v5**.
4. **World entries are included** — same treatment as chapters, and the World
   panel's ref editor gains the "Link book asset" picker it currently lacks.
5. **Removing a ref from a chapter/world entry only unlinks** (asset survives
   in the library). **Deleting an asset from the library unpins it everywhere**,
   with a confirm that shows how many places use it.

## Current-state findings (verified 2026-07-18 against `main` @ `49abc79`)

- `PinnedRef` ([types.ts:21](../../src/types.ts)) carries content fields
  (`kind`/`label`/`body`/`src`) plus optional `assetId`. `Asset`
  ([types.ts:34](../../src/types.ts)) is the same shape minus `assetId`.
- `linkAssetToChapter` ([useStore.ts:926](../../src/store/useStore.ts)) **copies**
  the asset's content into a new ref tagged `assetId`. `updateAsset` does NOT
  propagate to those copies, and `updateChapterRef` does not write back — the
  "link" is cosmetic today.
- Standalone adds: `addChapterRef` ([useStore.ts:884](../../src/store/useStore.ts)),
  `addWorldRef` (~line 1287). The World panel passes no `onLink` to `RefList`.
- `RefList` ([ui/RefList.tsx](../../src/components/ui/RefList.tsx)) is the one
  shared editor, used by ChapterDetail (refs), WorldPanel (per-entry refs), and
  NotesPanel (which passes `assets as PinnedRef[]` — the cast works because the
  shapes coincide today; it will stop compiling after the model change, which is
  good).
- **Where refs live** (all must be handled by migration and the delete sweep):
  1. `doc.chapters[*].refs` (active book, active version)
  2. `doc.draftData[*].chapters[*].refs` (active book, stashed versions)
  3. `doc.bookData[*].chapters[*].refs` (stashed books)
  4. `doc.bookData[*].draftData[*].chapters[*].refs` (stashed books' stashed versions)
  5. `doc.world[*].refs` (doc-level, one copy)
  Plus every `projectStash` entry repeats 1–5 (the `migrate` hook already
  normalizes those — Session 36b).
- `doc.assets` is doc-level (series bible): **shared across all books AND all
  versions**. Since v4, versions are standalone forks — fork copies duplicate
  ref *objects with the same ids* into `draftData`. Migration must not turn one
  note that exists in three version forks into three assets (see item 4).
- Markdown export emits the pinned line from the ref itself:
  `[[r.label]]` ([markdown.ts:103](../../src/lib/markdown.ts)) — must resolve via
  the asset after the change. The importer creates `refs: []`/`assets: []` and
  needs no change.
- `normalizeDoc` ([persistence.ts:238](../../src/store/persistence.ts)) is the
  single migration home (files + localStorage both route through it since
  Session 36b) and already throws `SchemaTooNewError` for files newer than the
  app. `sampleStory.ts` has standalone refs on chapters AND world entries with
  `assets: []`.

## Instructions

Ground rules (same as every task in this file): run `npm run typecheck` and
verify in a dev server per the steps below; log the session in `docs/SPECS.md`;
mark items ✅ here when done. **This IS a schema change (v4 → v5)** — the
cross-app rules from SPECS §6 apply; see item 7.

### 1. ✅ Model (`types.ts`)

- `SCHEMA_VERSION` 4 → **5**.
- `PinnedRef` becomes a pure link: `{ id: string; assetId: string }`. Delete its
  `kind`/`label`/`body`/`src` fields — after migration every ref is
  asset-backed, and keeping cached copies is how stale-content bugs happen
  (they'd go stale in every stashed book/version we can't cheaply sweep).
- `Asset` is unchanged.

### 2. ✅ Store (`useStore.ts`)

- **`addChapterRef` / `addWorldRef`**: create the asset first (same defaults as
  `addAsset`: empty label, `body: ""` for notes), then append
  `{ id: uid("r"), assetId }` to the target's `refs`.
- **Delete `updateChapterRef` / `updateWorldRef`** — there is nothing left to
  edit on a ref. All content edits go through `updateAsset`.
- **`deleteChapterRef` / `deleteWorldRef`**: keep (they are the *unlink*
  actions). No asset deletion here.
- **`linkAssetToChapter`**: now appends `{ id, assetId }` only. Skip (no-op) if
  the chapter already links that asset. Add **`linkAssetToWorld(worldId,
  assetId)`** with the same shape.
- **`deleteAsset`**: after removing the asset, sweep every `refs` array in all
  five locations listed above (active chapters, `draftData`, `bookData` incl.
  nested `draftData`, `world`), dropping refs whose `assetId` matches. Same
  lesson as SPECS §9 item 5 (`deleteCharacter` originally missed the stashes).
- Add a **`countAssetLinks(doc, assetId)`** helper (lib or store-local) that
  counts links across the same five locations — used by the delete confirm and
  the library UI.

### 3. ✅ UI (`RefList.tsx`, `ChapterDetail.tsx`, `WorldPanel.tsx`, `NotesPanel.tsx`)

- Refactor `RefList` to accept **resolved items** — rename the prop type to
  something like `ResolvedRef { id, kind, label, body, src }` — plus the same
  callbacks. RefList itself stays dumb; only the callers change meaning:
  - **ChapterDetail / WorldPanel**: map `refs` → resolved items via a
    `doc.assets` lookup keyed by `assetId` (drop unresolvable refs defensively —
    `normalizeDoc` should have pruned them, render must not crash). `onUpdate`
    routes to `updateAsset(asset.id, patch)`. `onDelete` unlinks. The delete
    confirm copy changes to **"Remove from this chapter?"** (resp. "…this world
    entry?") with detail "It stays in the shared library." — and it is NOT
    `danger` (nothing is destroyed). The image-upload path needs no change: it
    calls `onUpdate({src, label})`, which now writes the asset.
  - **WorldPanel**: pass `onLink` and render the same link-picker UI
    ChapterDetail has (consider extracting that picker block into a small shared
    component instead of copying it).
  - **NotesPanel**: passes `doc.assets` directly (the `as PinnedRef[]` cast
    disappears). `onDelete` = `deleteAsset` behind a confirm that stays
    `danger` and includes the usage count: "Delete this note everywhere? It is
    pinned in N places." Show a small "Linked in N places" line per asset in
    the library (via `countAssetLinks`) so the library communicates reach.
- RefList's own `confirmDelete` currently hardcodes the "Delete this note?"
  copy — the confirm message/detail/danger must become caller-supplied so the
  three callers can differ as described.

### 4. ✅ Migration (`persistence.ts` → `normalizeDoc`) — the careful part

Extend `normalizeDoc` to convert any doc with `schemaVersion` ≤ 4 (after the
existing v3→v4 version materialization runs — order matters, v3 overlay docs
must become v4 forks first, then refs migrate):

- Walk **all five ref locations**. For each ref:
  - **Standalone (no `assetId`)**: create an `Asset` from its content, replace
    the ref with `{ id, assetId }`.
  - **Fork-copy dedupe**: version forks duplicated ref objects with identical
    ids. Dedupe key = **`ref.id` + content** (kind/label/body/src, exact match):
    same key → one shared asset for all copies. Same `ref.id` but *diverged*
    content (the user edited one fork after forking) → genuinely different notes
    → separate assets. Never dedupe by content alone (would silently merge
    unrelated identical notes into one live-linked note).
  - **Already-linked snapshot (`assetId` set, asset exists)**: if the ref's
    cached content equals the asset's → slim to `{ id, assetId }`. If it
    **diverged** (either side was edited after linking — we cannot know which is
    newer): preserve the ref's content as a **new** asset and point the ref at
    it. No data loss; the user may see a near-duplicate in the library and can
    delete one. Do not let the asset overwrite the ref's content or vice versa.
  - **Dangling `assetId`** (asset missing): if the ref has cached content, treat
    as standalone (new asset); if it has none, drop the ref.
- The existing `migrate` hook needs **no structural change** — it already runs
  `normalizeDoc` over the doc and every `projectStash` entry (Session 36b).
  Just make sure `SCHEMA_VERSION` bumps so it fires, and the `SchemaTooNewError`
  guard keeps refusing v5 files in older apps.

### 5. ✅ Data (`sampleStory.ts`)

Rewrite the sample's standalone refs (chapters + world entries) as assets +
`{ id, assetId }` links with stable hand-written ids, so a fresh load is
born-canonical and never exercises migration. `emptyStory.ts` needs no change
(`assets: []`).

### 6. ✅ Export (`markdown.ts`)

The `**Pinned:**` line (line ~103) must resolve each ref's label through
`doc.assets`. Skip refs that don't resolve. Nothing else changes (the importer
already produces empty refs/assets).

### 7. ✅ Cross-app (Android) — recorded; no Android code written

- v5 is a reshape: per SPECS §6 this is a cross-app compatibility event. The
  Android app is **already paused** for cross-app sync pending its v4 port
  (`OPUS-TASK-schema-v4-versions.md` in the Android repo); it now needs v5 as
  well. Record in the SPECS session log that the Android port target moved
  v4 → v5, so the user can update the Android task in that repo. Do not touch
  the Android repo from here.
- The `SchemaTooNewError` guard is the safety: a v5 file is refused (not
  mangled) by any app still speaking v4.

## What happens to existing saves in production (put this in the SPECS log too)

- **Nothing changes until the user deploys.** Building this locally touches no
  production data; the deployed app and the user's files stay v4 until
  `sync:portfolio` / Pages deploy ships v5.
- **First open after deploy: in-place localStorage migration, nothing wiped.**
  The Session 36b `migrate` machinery normalizes the active doc and every
  stashed project. Every existing note/image survives as an asset + link.
- **Files on disk stay v4 until the first Sync writes them.** The mirror/Sync
  path never clobbers silently: the first sync offers a normal
  write/review, and every explicit sync writes a rotating backup first. Old v4
  backups remain openable forever (reads route through `normalizeDoc`).
- **One-way door**: once a v5 file is written, v4 apps (including Android until
  ported) refuse it via the schema guard.

## Verify (dev server, before any deploy)

1. **Migration**: seed a v4 store containing (a) chapters with standalone note
   + image refs, (b) a snapshot-linked ref whose content diverged from its
   asset, (c) world-entry refs, (d) a stashed version fork holding copies of
   the same refs, (e) a stashed book with refs, (f) a second project in
   `projectStash`. Reload → everything present, fork copies deduped to ONE
   asset each, the diverged snapshot preserved as its own new asset, no console
   errors.
2. **Write-through**: add a note in a chapter → appears in the Notes library;
   edit its body in the library → chapter modal shows it live; edit in the
   chapter → library live. Same on a world entry.
3. **Images stored once**: upload an image in chapter A, link it into chapter B
   via the picker; rename it once → both update; confirm `doc.assets` holds one
   copy of the data URL.
4. **Unlink vs delete**: remove the ref from chapter A → still in the library
   and still in chapter B. Delete it from the library (confirm shows the count)
   → gone from B AND from stashed versions/books (switch version and book to
   prove the sweep).
5. **World picker**: world entries can link an existing asset.
6. **Round-trips**: markdown export shows resolved `[[labels]]`; save + reopen
   a `.estoria.json`; a v4 backup restores through the migration cleanly.
7. `npm run typecheck` and `npm run build` clean.

---

# Code review — Session 38 work (asset-backed refs, schema v5) — instructions for Opus

Reviewed 2026-07-18 against the uncommitted working tree (Session 38, on top of
`49abc79`). **Status: all four items fixed and verified (Session 39,
2026-07-18) — see the SPECS session log.**

The implementation is sound and faithful to the Session 37 task: all seven
instruction sections are genuinely done — the slimmed `PinnedRef`, write-through
edits, unlink-vs-delete semantics with the right confirm copy, the shared
`AssetLinkPicker` on chapter AND world with already-linked assets disabled, the
five-location sweep in `removeAssetLinks`, and a migration that implements
exactly the fork-dedupe (`ref.id` + content) and diverged-snapshot rules,
idempotent and correctly ordered after the v3→v4 step. Cross-file tracing found
no stale consumers of the deleted ref content fields: `mergeProjectIntoSeries`
already carries `assets` across so merged links resolve, the sync conflict diff
compares refs generically, export resolves labels via assets, and the persist
`migrate` hook needed no change. `npm run typecheck` and `npm run build` are
clean on the current tree.

Items ordered by priority: **1 is a real robustness defect to fix before this
deploys (it runs inside everyone's one-time migration); 2–4 are polish and can
be batched or skipped with the user's OK.**

Ground rules (same as every task in this file):

- Run `npm run typecheck` after the changes and verify in a dev server per the
  steps under each item. Also re-run the Session 38 migration smoke test
  (seeded v4 store → reload) after item 1, since it changes migration code.
- Log the session in `docs/SPECS.md` per the usual convention and mark items
  ✅ here when fixed.

## 1. ✅ A malformed `draftData` entry crashes migration — and the migrate hook then wipes EVERYTHING to the sample story (FIXED)

**Where:** `src/store/persistence.ts:331` (`convertVersions` inside
`migrateRefsToAssets`); blast radius set by the `migrate` catch-all in
`src/store/useStore.ts:~1516`.

**Problem:** `convertVersions` does
`Object.entries(dd).map(([id, v]) => [id, { ...v, chapters: convertChapters(v.chapters) }])`
with no guard. If a v4 doc's `draftData` (top-level or inside any
`bookData[*]`) contains a malformed entry — `{"x": null}` or
`{"x": {"chapters": "oops"}}` — then `v.chapters.map` throws a TypeError, so
`normalizeDoc` throws. On a file open that's a polite "bad file" error (fine).
But during the **one-time v4→v5 localStorage migration**, the throw lands in
the migrate hook's catch-all, which returns `{ doc: sampleStory, theme, view }`
— **the active doc AND every stashed project are replaced by the sample**.
Total local wipe from one corrupt version entry. App-written blobs are always
well-formed (forks come from `structuredClone` of valid boards), so the trigger
needs a hand-edited file restored earlier, a partial foreign write, or an
Android-side bug — rare, but the consequence is maximal, and this code runs in
every user's migration exactly once. Note this corruption was *tolerated* in
v4: `normalizeDoc` passed `draftData` through untouched, so the bad entry only
mattered if that version was ever activated.

**Fix (small, in `migrateRefsToAssets`):** make the walk defensive —
in `convertVersions`, skip (or default to `{chapters: [], links: [],
storyNotes: ""}` shapes) any entry where `v` is not an object or `v.chapters`
is not an array, and have `convertChapters` tolerate a non-array input by
returning `[]`. One bad version entry must degrade to that entry being dropped,
never sink the whole doc's migration. Keep the behavior for well-formed docs
byte-identical.

**Verify:** seed a v4 store whose `draftData` contains a null entry and an
entry with `chapters: "oops"`, alongside a valid fork → reload: the doc
migrates, the valid fork survives, the bad entries are dropped (or emptied),
nothing wipes to sample, no console errors. Then re-run the clean-store
migration smoke test to confirm no behavior change for valid docs.

## 2. ✅ "Linked in N places" caption only renders in list view (FIXED)

**Where:** `src/components/ui/RefList.tsx:181` (card-view branch; the `cap`
line was added only to the list view around line 101).

**Problem:** The Session 37 spec asked the library to "show a small 'Linked in
N places' line per asset". `NotesPanel` passes the `caption` prop, but the
card view never calls it — a user whose library is in card view (the
`refView`/`libView` preference is persisted) gets no usage indication until the
delete confirm.

**Fix:** render the caption in card cells too — a small muted line under the
title input in the NOTE cell and under the label input in the IMAGE cell (same
`text-[10.5px] text-faint` treatment, truncated). Keep it absent when the
caller passes no `caption`.

**Verify:** Notes panel → toggle the library to card view → each asset cell
shows "Linked in N places"; chapter/world ref lists (which pass no caption)
are unchanged in both views.

## 3. ✅ `countAssetLinks` is O(assets × whole doc) per Notes-panel render (FIXED)

**Where:** `src/components/panels/NotesPanel.tsx:79` (the `caption` callback);
`countAssetLinks` in `src/lib/refs.ts`.

**Problem:** The caption invokes `countAssetLinks(doc, r.id)` per asset per
render, and each call walks every chapter of every book and every stashed
version. The panel subscribes to the whole `doc`, so it re-renders on every
keystroke while typing in a library note or the story-notes textarea —
re-walking the full doc once per asset each time. No visible lag at current
scale (same accepted trade-off as SPECS §9 item 14), but the fix is cheap.

**Fix:** add a `countAllAssetLinks(doc): Map<string, number>` (one walk over
the same five locations, counting every `assetId`) to `lib/refs.ts`, build it
once per render in `NotesPanel` (plain call is fine; `useMemo` on `doc` if
preferred), and use it for both the `caption` and the `deletePrompt` count.
Keep the single-asset `countAssetLinks` only if something else still needs it —
otherwise delete it so there's one walker.

**Verify:** typecheck; captions and the delete-confirm count unchanged in the
UI.

## 4. ✅ "Pinned in N places" counts version-fork copies — reads like N chapters (FIXED — honest wording)

**Where:** `src/components/panels/NotesPanel.tsx:74` (deletePrompt) and the
caption below it.

**Problem:** Every stashed version fork counts as a separate "place", so an
asset pinned in ONE chapter of a book with two versions reads "Linked in 2
places". The count is exactly what the spec asked for (all five locations —
correct for the delete sweep), but a user will read "places" as chapters and
may hunt for a pin that doesn't exist.

**Fix (wording only — with the user's OK):** phrase the count honestly, e.g.
caption "N pins across versions and books" and confirm detail "It is pinned in
N places across your versions and books." Do NOT change what is counted — the
sweep and the number must keep agreeing.

**Verify:** pin a note in one chapter, add a version (fork), open the library:
caption/confirm wording matches the chosen phrasing and the number still
reflects both fork copies.

## Noted, no action needed

- **Browser verification caveat:** the Session 38 SPECS log's in-browser claims
  (migration smoke test, write-through, picker) are consistent with the code
  and were not contradicted anywhere, but this review re-verified only
  typecheck + build; item 1's verify step re-exercises the migration path in
  the browser, which covers the gap that matters.
- `SectionHeader` in ChapterDetail counts `ch.refs.length` while the list
  renders resolved refs — these can only diverge via dangling links, which
  `normalizeDoc` prunes and `deleteAsset` sweeps, so the invariant holds
  app-wide. Leave as is.
- `linkAssetToChapter`/`linkAssetToWorld` return a fresh doc object even on the
  already-linked no-op path, touching the save debounce. Unreachable from the
  UI (the picker disables linked assets); not worth guarding.
