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
