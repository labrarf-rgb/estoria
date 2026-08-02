import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { AssetLinkPicker } from "@/components/ui/AssetLinkPicker";
import { ARCHIVED_DIM, archivedTitle } from "@/components/ui/ArchiveShelf";
import { resolveRefs } from "@/lib/refs";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { SCENE_W, SCENE_H, sceneColumnsForWidth, sceneAutoArrange, sceneSlotFromPoint } from "@/lib/layout";
import { SCENE_TEXT_MAX } from "@/lib/sceneFit";
import { ManuscriptSheet } from "@/components/ManuscriptSheet";
import { writtenCount } from "@/lib/manuscript";
import { type ChapterStatus, type ConnType, type Vec2 } from "@/types";

const CONN: Record<ConnType, { label: string; color: string }> = {
  therefore: { label: "Therefore", color: "var(--therefore)" },
  but: { label: "But", color: "var(--but)" },
  and: { label: "And", color: "var(--and)" },
};

const STATUSES: { value: ChapterStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "done", label: "Done" },
];

export function ChapterDetail() {
  const openCh = useStore((s) => s.openCh);
  const doc = useStore((s) => s.doc);
  const closeChapter = useStore((s) => s.closeChapter);
  const openChapter = useStore((s) => s.openChapter);
  const bumpAct = useStore((s) => s.bumpChapterAct);
  const setAct = useStore((s) => s.setChapterAct);
  const patchChapter = useStore((s) => s.patchChapter);
  const editChapterText = useStore((s) => s.editChapterText);
  const toggleChapterChar = useStore((s) => s.toggleChapterChar);
  const toggleChapterWorld = useStore((s) => s.toggleChapterWorld);
  const deleteChapter = useStore((s) => s.deleteChapter);
  const addScene = useStore((s) => s.addScene);
  const insertScene = useStore((s) => s.insertScene);
  const updateScene = useStore((s) => s.updateScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const reorderScene = useStore((s) => s.reorderScene);
  const moveScenesToChapter = useStore((s) => s.moveScenesToChapter);
  const cycleSceneLink = useStore((s) => s.cycleSceneLink);
  const arrangeScenes = useStore((s) => s.arrangeScenes);
  const addChapterRef = useStore((s) => s.addChapterRef);
  const deleteChapterRef = useStore((s) => s.deleteChapterRef);
  const reorderChapterRef = useStore((s) => s.reorderChapterRef);
  const linkAssetToChapter = useStore((s) => s.linkAssetToChapter);
  const updateChapterRefAsset = useStore((s) => s.updateChapterRefAsset);
  const startCharDraft = useStore((s) => s.startCharDraft);
  const startWorldDraft = useStore((s) => s.startWorldDraft);
  const askConfirm = useStore((s) => s.askConfirm);
  const collapsed = useStore((s) => s.chapterSectionsCollapsed);
  const toggleSection = useStore((s) => s.toggleChapterSection);
  const refView = useStore((s) => s.refView);
  const setRefView = useStore((s) => s.setRefView);
  const expanded = useStore((s) => s.sceneFlowExpanded);
  const setSceneFlowExpanded = useStore((s) => s.setSceneFlowExpanded);
  const notesExpanded = useStore((s) => s.textareaExpanded.chapterNotes);
  const toggleTextarea = useStore((s) => s.toggleTextarea);
  const focusScene = useStore((s) => s.focusScene);
  const clearFocusScene = useStore((s) => s.clearFocusScene);

  const ch = doc.chapters.find((c) => c.id === openCh);
  const chIdRef = useRef<string | null>(null);
  chIdRef.current = ch?.id ?? null;

  const [linkOpen, setLinkOpen] = useState(false);
  const [charAdd, setCharAdd] = useState(false);
  const [worldAdd, setWorldAdd] = useState(false);
  // Scene-move mode: pick scenes with checkboxes, then choose a destination
  // chapter to append them to. Selection is keyed by scene index.
  const [moveMode, setMoveMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [destPickerOpen, setDestPickerOpen] = useState(false);
  // Manuscript mode. Local, not store state: Phase 1 replaces this boolean with
  // the Minimized / Regular / Full screen control, and there is nothing worth
  // persisting about it until then. It survives prev/next navigation because
  // the modal stays mounted, which is what you want mid-draft.
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  // The modal is one scroll container under a sticky header, so the carousel
  // has to know how tall that header is to stick *below* it rather than under
  // it. Measured rather than guessed: the summary line wraps, and the banner on
  // a non-main version adds a row.
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, [openCh]);
  // Chosen destination + insertion position, shown in the confirm dialog.
  const [moveDest, setMoveDest] = useState<{ id: string; num: number; title: string } | null>(null);
  const [movePos, setMovePos] = useState<"beginning" | "middle" | "end">("end");
  const sceneBoxRef = useRef<HTMLDivElement>(null);

  // Scene drag-to-reorder: either an existing card ("move") or the ghost from
  // a long-pressed Add-scene button ("new"). Coordinates are canvas-local
  // (relative to sceneBoxRef's content, including its scroll offset) so they
  // line up directly with scenePos / sceneAutoArrange output.
  type SceneDrag =
    | {
        kind: "move";
        fromIdx: number;
        overIdx: number;
        cx: number;
        cy: number;
        clientY: number;
        offX: number;
        offY: number;
      }
    | { kind: "new"; overIdx: number; cx: number; cy: number; clientY: number };
  const [drag, setDrag] = useState<SceneDrag | null>(null);
  const dragRef = useRef<SceneDrag | null>(null);
  dragRef.current = drag;
  const addScenePressRef = useRef(false);

  // Landing on a specific scene, from the timeline's scene pane. One-shot: the
  // marker is consumed as soon as it is applied, so re-renders (and reopening
  // the same chapter by other routes) don't yank the canvas around again.
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  // Held in a ref, not in the landing effect's cleanup: that effect consumes
  // `focusScene` as it runs, which changes its own deps and re-runs it, and the
  // cleanup would cancel the fade before it ever fired.
  const flashTimer = useRef<number | null>(null);
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  /**
   * The scene whose last keystroke was refused for length, so its card can go
   * red while it nudges.
   *
   * The nudge itself runs through `element.animate` rather than a CSS class.
   * A class has to be taken off and put back on to replay, which needs a frame
   * callback to sit between the two — and frame callbacks are paused whenever
   * the tab is not visible, so a held key would land its refusals with no
   * animation at all. `animate()` restarts from the top every call.
   */
  const [capHit, setCapHit] = useState<number | null>(null);
  const capTimer = useRef<number | null>(null);
  useEffect(() => () => void (capTimer.current && clearTimeout(capTimer.current)), []);
  const flagCapHit = (idx: number) => {
    setCapHit(idx);
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = window.setTimeout(() => setCapHit(null), 420);

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const card = sceneBoxRef.current?.querySelector<HTMLElement>(
      `[data-scene-idx="${idx}"] [data-scene-card]`
    );
    // Small on purpose (3px, one cycle): an ordinary limit being met, not an
    // error. The red edge is what carries the meaning.
    card?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(-2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 260, easing: "ease-in-out" }
    );
  };

  /**
   * Scene text is capped, but a scene written *before* the cap keeps every
   * character it has: its own length becomes its ceiling, so it can be shortened
   * or left alone but never grown. Refused input nudges the card rather than
   * silently vanishing.
   */
  const writeScene = (chapterId: string, idx: number, prev: string, next: string) => {
    const ceiling = Math.max(SCENE_TEXT_MAX, prev.length);
    if (next.length > ceiling) {
      flagCapHit(idx);
      if (next.length > prev.length) return; // nothing of the refused text lands
    }
    updateScene(chapterId, idx, next);
  };

  const chId = ch?.id;
  const sceneCount = ch?.scenes.length ?? 0;
  useEffect(() => {
    if (!chId || !focusScene || focusScene.chapterId !== chId || sceneCount === 0) return;
    clearFocusScene();
    const box = sceneBoxRef.current;
    if (!box) return;
    const idx = Math.max(0, Math.min(focusScene.index, sceneCount - 1));
    const node = box.querySelector<HTMLElement>(`[data-scene-idx="${idx}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    node.querySelector("textarea")?.focus();
    setFlashIdx(idx);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashIdx(null), 1600);
  }, [focusScene, chId, sceneCount, clearFocusScene]);

  const canvasPoint = (clientX: number, clientY: number) => {
    const box = sceneBoxRef.current;
    if (!box) return { x: 0, y: 0 };
    const rect = box.getBoundingClientRect();
    return { x: clientX - rect.left + box.scrollLeft, y: clientY - rect.top + box.scrollTop };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      const chId = chIdRef.current;
      const box = sceneBoxRef.current;
      if (!d || !chId || !box) return;
      const c = useStore.getState().doc.chapters.find((x) => x.id === chId);
      if (!c) return;
      const pt = canvasPoint(e.clientX, e.clientY);
      // Total slots rendered in the preview grid (including the gap) — must
      // match the `others.length + 1` used by the render logic below, or the
      // column count (and therefore the detected slot) desyncs from what's
      // actually on screen.
      const total = d.kind === "move" ? c.scenes.length : c.scenes.length + 1;
      const cols = sceneColumnsForWidth(total, box.clientWidth);
      const overIdx = Math.max(0, Math.min(sceneSlotFromPoint(pt.x, pt.y, cols), total - 1));
      setDrag({ ...d, cx: pt.x, cy: pt.y, clientY: e.clientY, overIdx });
    };
    const onUp = () => {
      const d = dragRef.current;
      const chId = chIdRef.current;
      const box = sceneBoxRef.current;
      if (d && chId) {
        const c = useStore.getState().doc.chapters.find((x) => x.id === chId);
        if (c) {
          const total = d.kind === "move" ? c.scenes.length : c.scenes.length + 1;
          const cols = sceneColumnsForWidth(total, box?.clientWidth ?? 0);
          if (d.kind === "move") reorderScene(chId, d.fromIdx, d.overIdx, cols);
          else insertScene(chId, d.overIdx, cols);
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [reorderScene, insertScene]);

  // Auto-scroll the scene canvas while dragging near its top/bottom edge, so
  // reordering works on boards with more scenes than fit on screen.
  useEffect(() => {
    if (!drag) return;
    const EDGE = 56;
    const MAX_SPEED = 16;
    let raf = 0;
    const tick = () => {
      const box = sceneBoxRef.current;
      const d = dragRef.current;
      if (box && d) {
        const rect = box.getBoundingClientRect();
        const y = d.clientY;
        if (y < rect.top + EDGE && box.scrollTop > 0) {
          box.scrollTop = Math.max(0, box.scrollTop - (MAX_SPEED * (rect.top + EDGE - y)) / EDGE);
        } else if (y > rect.bottom - EDGE) {
          box.scrollTop = Math.min(
            box.scrollHeight - box.clientHeight,
            box.scrollTop + (MAX_SPEED * (y - (rect.bottom - EDGE))) / EDGE
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // Each canvas size keeps its own layout (`scenePos` expanded /
  // `scenePosCompact` collapsed), so toggling just swaps to the other one —
  // it no longer re-arranges, which is what used to throw away the arrangement
  // you'd made. A size is only auto-arranged when it has no layout yet, which
  // `openChapter` handles on the way in.

  // Leaving a chapter (prev/next nav or close) cancels an in-progress move.
  useEffect(() => {
    setMoveMode(false);
    setSelected(new Set());
    setDestPickerOpen(false);
    setMoveDest(null);
  }, [openCh]);

  // A single click on a card opens this modal, so the second click of a
  // double-click — the habit from when double-click was the way in — lands on
  // the backdrop that just appeared. Backdrop dismissals are ignored for a
  // moment after opening so that habit doesn't close the modal instantly.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [openCh]);
  const closeFromScrim = () => {
    if (Date.now() - openedAt.current < 400) return;
    closeChapter();
  };

  if (!ch) return null;

  // Prev/next navigation across the chapter sequence, shown beside the close
  // button so the user can flip through chapters without leaving the modal.
  const chIdx = doc.chapters.findIndex((c) => c.id === ch.id);
  const prevCh = chIdx > 0 ? doc.chapters[chIdx - 1] : null;
  const nextCh = chIdx >= 0 && chIdx < doc.chapters.length - 1 ? doc.chapters[chIdx + 1] : null;

  // The banner below marks a board that isn't the canonical one; "main" is
  // wherever the user put the marker, so a fork they promoted stays quiet.
  const draftId = doc.activeDraftId;
  const draftName = doc.drafts.find((d) => d.id === draftId)?.name ?? "Main draft";
  // The layout belonging to the size on screen. Falling back to the other one
  // covers the frame between a size toggle and the store catching up.
  const positions = (expanded ? ch.scenePos : ch.scenePosCompact) ?? ch.scenePos ?? [];
  const boxW = sceneBoxRef.current?.clientWidth ?? 0;

  // While dragging, build a preview layout: the moved (or not-yet-created)
  // scene occupies a "gap" slot that follows the pointer, and every other
  // card previews the grid position it will land in on release.
  let cardSlots: { idx: number; pos: Vec2; num: number }[] = ch.scenes.map((_, i) => ({
    idx: i,
    pos: positions[i] ?? { x: 0, y: 0 },
    num: i + 1,
  }));
  let gapPos: Vec2 | null = null;
  let ghostPos: Vec2 | null = null;
  let ghostText: string | null = null;
  let ghostNum = 1;

  if (drag) {
    const others =
      drag.kind === "move"
        ? ch.scenes.map((_, i) => i).filter((i) => i !== drag.fromIdx)
        : ch.scenes.map((_, i) => i);
    const at = Math.max(0, Math.min(drag.overIdx, others.length));
    const previewCols = sceneColumnsForWidth(others.length + 1, boxW);
    const previewPos = sceneAutoArrange(new Array(others.length + 1).fill(""), 0, previewCols);
    cardSlots = others.map((origIdx, i) => ({
      idx: origIdx,
      pos: previewPos[i < at ? i : i + 1],
      num: i < at ? i + 1 : i + 2,
    }));
    gapPos = previewPos[at];
    ghostNum = at + 1;
    ghostText = drag.kind === "move" ? ch.scenes[drag.fromIdx] : "New scene.";
    ghostPos =
      drag.kind === "move"
        ? { x: drag.cx - drag.offX, y: drag.cy - drag.offY }
        : { x: drag.cx - SCENE_W / 2, y: drag.cy - SCENE_H / 2 };
  }

  const extent = [...cardSlots.map((s) => s.pos), ...(gapPos ? [gapPos] : []), ...(ghostPos ? [ghostPos] : [])];
  const canvasW = Math.max(640, ...extent.map((p) => p.x + SCENE_W)) + 24;
  const canvasH = Math.max(260, ...extent.map((p) => p.y + SCENE_H)) + 24;

  // Auto-arrange scenes to fill the *visible* canvas (collapsed vs expanded use
  // different widths, so each mode arranges into a different column count).
  const onArrangeScenes = () => {
    arrangeScenes(ch.id, false, sceneColumnsForWidth(ch.scenes.length, boxW));
  };

  const onSceneDown = (e: React.MouseEvent, idx: number) => {
    if (moveMode) return; // In move mode a card click toggles selection, not drag.
    const target = e.target as HTMLElement;
    if (target.closest("textarea") || target.closest("button")) return;
    e.preventDefault();
    const p = positions[idx] ?? { x: 0, y: 0 };
    const pt = canvasPoint(e.clientX, e.clientY);
    setDrag({
      kind: "move",
      fromIdx: idx,
      overIdx: idx,
      cx: pt.x,
      cy: pt.y,
      clientY: e.clientY,
      offX: pt.x - p.x,
      offY: pt.y - p.y,
    });
  };

  // Long-press the Add-scene button to get a draggable ghost card that can be
  // dropped anywhere in the grid; a plain click still appends to the end.
  const onAddSceneDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    addScenePressRef.current = false;
    const startClientY = e.clientY;
    const timer = window.setTimeout(() => {
      addScenePressRef.current = true;
      const box = sceneBoxRef.current;
      const cx = box ? box.scrollLeft + box.clientWidth / 2 : 0;
      const cy = box ? box.scrollTop + box.clientHeight / 2 : 0;
      const cols = sceneColumnsForWidth(ch.scenes.length + 1, box?.clientWidth ?? 0);
      const overIdx = Math.max(0, Math.min(sceneSlotFromPoint(cx, cy, cols), ch.scenes.length));
      setDrag({ kind: "new", cx, cy, clientY: startClientY, overIdx });
    }, 220);
    const cancel = () => window.clearTimeout(timer);
    window.addEventListener("mouseup", cancel, { once: true });
  };

  const onAddSceneClick = () => {
    if (addScenePressRef.current) {
      addScenePressRef.current = false;
      return;
    }
    addScene(ch.id, sceneColumnsForWidth(ch.scenes.length + 1, boxW));
  };

  const sceneCenter = (idx: number) => {
    const p = positions[idx] ?? { x: 0, y: 0 };
    return { x: p.x + SCENE_W / 2, y: p.y + SCENE_H / 2 };
  };

  // Column count used when inserting a scene via the hover +buttons — sized for
  // the grid that will hold one more card than there are now.
  const insertCols = sceneColumnsForWidth(ch.scenes.length + 1, boxW);

  // Scene-move helpers.
  const otherChapters = doc.chapters.filter((c) => c.id !== ch.id);
  const toggleSelected = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const exitMoveMode = () => {
    setMoveMode(false);
    setSelected(new Set());
    setDestPickerOpen(false);
    setMoveDest(null);
  };
  // Picking a chapter opens the confirm dialog (where the position is chosen).
  const pickDest = (dest: { id: string; num: number; title: string }) => {
    setDestPickerOpen(false);
    setMovePos("end");
    setMoveDest(dest);
  };
  const confirmMove = () => {
    if (!moveDest) return;
    const destScenes = doc.chapters.find((c) => c.id === moveDest.id)?.scenes.length ?? 0;
    const atIdx =
      movePos === "beginning" ? 0 : movePos === "middle" ? Math.floor(destScenes / 2) : destScenes;
    const remaining = ch.scenes.length - selected.size;
    moveScenesToChapter(ch.id, moveDest.id, [...selected], atIdx, sceneColumnsForWidth(remaining, boxW));
    exitMoveMode();
  };

  return (
    <>
    <Scrim onClose={closeFromScrim} z={50} center>
      <div
        ref={modalRef}
        onMouseDown={stop}
        className={`max-h-[92vh] overflow-auto rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)] ${
          expanded ? "w-[min(1500px,96vw)]" : "w-[min(980px,100%)]"
        }`}
      >
        {/* Header */}
        <div
          ref={headerRef}
          className="sticky top-0 z-[2] flex items-start gap-[14px] border-b border-rule bg-panel px-[26px] py-[22px]"
        >
          <span className="mt-[6px] rounded-[7px] bg-ink px-[9px] py-[4px] font-mono text-[13px] font-semibold text-bg">
            {String(ch.num).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={ch.title}
              onChange={(e) => editChapterText(ch.id, { title: e.target.value })}
              placeholder="Chapter title"
              className="w-full bg-transparent font-serif text-[24px] font-semibold leading-tight text-ink outline-none placeholder:text-faint"
            />
            <textarea
              value={ch.summary ?? ""}
              onChange={(e) => editChapterText(ch.id, { summary: e.target.value })}
              placeholder="One-line chapter summary..."
              rows={1}
              className="mt-[5px] w-full resize-none bg-transparent text-[14px] leading-[1.5] text-soft outline-none placeholder:text-faint"
            />
            {draftId !== doc.mainDraftId && (
              <div className="mt-[4px] text-[10.5px] font-semibold uppercase tracking-wide text-but">
                Editing {draftName} · changes stay in this version
              </div>
            )}

            <div className="mt-[11px] flex flex-wrap items-center gap-[10px]">
              <label className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]">
                <input
                  type="number"
                  min={0}
                  value={ch.words}
                  onChange={(e) => patchChapter(ch.id, { words: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-[56px] bg-transparent text-right font-mono text-[12px] font-medium text-ink outline-none [appearance:textfield]"
                  title="Words in this chapter"
                />
                <span className="font-mono text-[11px] font-medium text-soft">words</span>
              </label>
              <span className="font-mono text-[11.5px] font-medium text-faint">
                · {ch.scenes.length} scenes
              </span>

              <div className="flex rounded-lg bg-chip p-[3px]">
                {STATUSES.map((st) => (
                  <button
                    key={st.value}
                    onClick={() => patchChapter(ch.id, { status: st.value })}
                    className={`rounded-md px-[9px] py-[3px] text-[11px] font-medium ${
                      ch.status === st.value ? "bg-card text-ink" : "text-soft hover:bg-card"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-[8px]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                  Act
                </span>
                <div className="flex items-center rounded-lg bg-chip p-[3px]">
                  <button
                    onClick={() => bumpAct(ch.id, -1)}
                    className="h-[24px] w-[24px] rounded-md text-[15px] font-semibold text-ink hover:bg-card"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={ch.act}
                    onChange={(e) => setAct(ch.id, parseInt(e.target.value, 10))}
                    className="h-[24px] w-[38px] bg-transparent text-center font-mono text-[13px] font-semibold text-ink [appearance:textfield]"
                  />
                  <button
                    onClick={() => bumpAct(ch.id, 1)}
                    className="h-[24px] w-[24px] rounded-md text-[15px] font-semibold text-ink hover:bg-card"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-[6px]">
            <button
              onClick={() => prevCh && openChapter(prevCh.id)}
              disabled={!prevCh}
              title={prevCh ? `Previous chapter · ${prevCh.title}` : "No previous chapter"}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-rule bg-card text-[16px] font-medium text-ink hover:border-faint disabled:cursor-default disabled:opacity-40 disabled:hover:border-rule"
            >
              ‹
            </button>
            <button
              onClick={() => nextCh && openChapter(nextCh.id)}
              disabled={!nextCh}
              title={nextCh ? `Next chapter · ${nextCh.title}` : "No next chapter"}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-rule bg-card text-[16px] font-medium text-ink hover:border-faint disabled:cursor-default disabled:opacity-40 disabled:hover:border-rule"
            >
              ›
            </button>
            <CloseButton onClick={closeChapter} />
          </div>
        </div>

        {/* Characters */}
        {(() => {
          // An archived character stays cast (dimmed below) but is never
          // offered for casting into anything new. See the archive rule.
          const members = doc.characters.filter((c) => ch.chars.includes(c.id));
          const available = doc.characters.filter((c) => !ch.chars.includes(c.id) && !c.archived);
          return (
            <div className="border-b border-rule px-[26px] py-[14px]">
              <SectionHeader
                label="Characters"
                count={members.length ? `${members.length}` : undefined}
                collapsed={collapsed.chars}
                onToggle={() => toggleSection("chars")}
              />
              {collapsed.chars ? null : (
              <>
              <div className="flex flex-wrap items-center gap-[7px]">
                {members.map((c) => (
                  <span
                    key={c.id}
                    title={c.archived ? archivedTitle(c.name || "Unnamed character") : undefined}
                    className={`flex items-center gap-[7px] rounded-full border border-transparent py-[5px] pl-[8px] pr-[6px] text-[12px] font-medium text-white ${c.archived ? ARCHIVED_DIM : ""}`}
                    style={{ background: c.color }}
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/25 text-[8.5px] font-semibold">
                      {c.initials || "?"}
                    </span>
                    {c.name || "Unnamed character"}
                    <button
                      onClick={() => toggleChapterChar(ch.id, c.id)}
                      className="ml-[1px] flex h-[16px] w-[16px] items-center justify-center rounded-full text-[10px] hover:bg-black/25"
                      title={`Remove ${c.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {members.length === 0 && (
                  <span className="text-[12px] text-faint">No characters in this chapter yet.</span>
                )}
                <button
                  onClick={() => setCharAdd((v) => !v)}
                  className="rounded-full border border-dashed border-line px-[11px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                >
                  + Add character
                </button>
              </div>
              {charAdd && (
                <div className="mt-[10px] flex flex-wrap gap-[7px] rounded-xl border border-rule bg-card p-[10px]">
                  {available.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleChapterChar(ch.id, c.id)}
                      className="flex items-center gap-[6px] rounded-full border border-rule bg-panel px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
                    >
                      <span
                        className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[8px] font-semibold text-white"
                        style={{ background: c.color }}
                      >
                        {c.initials || "?"}
                      </span>
                      {c.name || "Unnamed character"}
                    </button>
                  ))}
                  {available.length === 0 && (
                    <span className="text-[12px] text-faint">Everyone is already in this chapter.</span>
                  )}
                  <button
                    onClick={() => startCharDraft()}
                    className="rounded-full border border-dashed border-line px-[10px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                  >
                    + Create new character
                  </button>
                </div>
              )}
              </>
              )}
            </div>
          );
        })()}

        {/* World details */}
        {(() => {
          const refs = ch.worldRefs ?? [];
          const members = doc.world.filter((w) => refs.includes(w.id));
          const available = doc.world.filter((w) => !refs.includes(w.id) && !w.archived);
          return (
            <div className="border-b border-rule px-[26px] py-[14px]">
              <SectionHeader
                label="World details"
                count={members.length ? `${members.length}` : undefined}
                collapsed={collapsed.world}
                onToggle={() => toggleSection("world")}
              />
              {collapsed.world ? null : (
              <>
              <div className="flex flex-wrap items-center gap-[7px]">
                {members.map((w) => (
                  <span
                    key={w.id}
                    title={w.archived ? archivedTitle(w.name || "Untitled entry", "entry") : undefined}
                    className={`flex items-center gap-[6px] rounded-full border border-transparent bg-ink py-[5px] pl-[10px] pr-[6px] text-[12px] font-medium text-bg ${w.archived ? ARCHIVED_DIM : ""}`}
                  >
                    {w.name || "Untitled entry"}
                    <span className="text-[9px] uppercase opacity-70">{w.cat}</span>
                    <button
                      onClick={() => toggleChapterWorld(ch.id, w.id)}
                      className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[10px] hover:bg-white/20"
                      title={`Remove ${w.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {members.length === 0 && (
                  <span className="text-[12px] text-faint">No world details in this chapter yet.</span>
                )}
                <button
                  onClick={() => setWorldAdd((v) => !v)}
                  className="rounded-full border border-dashed border-line px-[11px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                >
                  + Add world detail
                </button>
              </div>
              {worldAdd && (
                <div className="mt-[10px] flex flex-wrap gap-[7px] rounded-xl border border-rule bg-card p-[10px]">
                  {available.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => toggleChapterWorld(ch.id, w.id)}
                      className="flex items-center gap-[6px] rounded-full border border-rule bg-panel px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
                    >
                      <span className="h-[7px] w-[7px] rounded-full bg-soft" />
                      {w.name || "Untitled entry"}
                      <span className="text-[9px] uppercase text-faint">{w.cat}</span>
                    </button>
                  ))}
                  {available.length === 0 && (
                    <span className="text-[12px] text-faint">Every world entry is already added.</span>
                  )}
                  <button
                    onClick={() => startWorldDraft()}
                    className="rounded-full border border-dashed border-line px-[10px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                  >
                    + Create new entry
                  </button>
                </div>
              )}
              </>
              )}
            </div>
          );
        })()}

        {/* Scene flow toolbar. Hidden while the manuscript is open: there the
            carousel *is* the scene flow, and every control here acts on a
            canvas that isn't on screen. */}
        {!manuscriptOpen && (
        <div className="flex items-center gap-[9px] px-[26px] pb-[12px] pt-[16px]">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-soft">
            Scene flow
          </span>
          {moveMode ? (
            <div className="ml-auto flex items-center gap-[9px]">
              <span className="text-[12px] font-medium text-soft">
                {selected.size === 0
                  ? "Check the scenes to move"
                  : `${selected.size} ${selected.size === 1 ? "scene" : "scenes"} selected`}
              </span>
              {selected.size > 0 && (
                <button
                  onClick={() => setDestPickerOpen((v) => !v)}
                  className="flex items-center gap-[6px] rounded-lg bg-ink px-3 py-[6px] text-[12px] font-semibold text-bg"
                >
                  Select chapter
                  <span className="text-[9px]">▾</span>
                </button>
              )}
              <button
                onClick={exitMoveMode}
                className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-[9px]">
              <button
                onClick={() => setSceneFlowExpanded(!expanded)}
                className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
                title={expanded ? "Shrink the scene area" : "Expand the scene area"}
              >
                {expanded ? "Collapse" : "Expand"}
              </button>
              <button
                onClick={onArrangeScenes}
                className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
              >
                Auto-arrange
              </button>
              {otherChapters.length > 0 && ch.scenes.length > 0 && (
                <button
                  onClick={() => setMoveMode(true)}
                  className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
                  title="Select scenes to move to another chapter"
                >
                  Move scenes
                </button>
              )}
              <button
                onMouseDown={onAddSceneDown}
                onClick={onAddSceneClick}
                title="Click to append · press and hold to drag it into place"
                className="rounded-lg bg-ink px-3 py-[6px] text-[12px] font-semibold text-bg"
              >
                + Add scene
              </button>
            </div>
          )}
        </div>
        )}

        {/* Destination dropdown — the "Select chapter" menu. */}
        {moveMode && destPickerOpen && selected.size > 0 && (
          <div className="mx-[26px] mb-[4px] flex flex-wrap gap-[7px] rounded-xl border border-rule bg-card p-[10px]">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-faint">
              Move to which chapter?
            </span>
            {otherChapters.map((c) => {
              const title = c.title;
              return (
                <button
                  key={c.id}
                  onClick={() => pickDest({ id: c.id, num: c.num, title })}
                  className="flex items-center gap-[7px] rounded-full border border-rule bg-panel px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
                >
                  <span className="rounded bg-ink px-[6px] py-[1px] font-mono text-[10px] font-semibold text-bg">
                    {String(c.num).padStart(2, "0")}
                  </span>
                  {title || "Untitled chapter"}
                  <span className="font-mono text-[10px] text-faint">
                    {c.scenes.length} {c.scenes.length === 1 ? "scene" : "scenes"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Scene canvas. `isolate` keeps the absolutely-positioned scene cards
            (z-5/z-10) contained so they can't paint over the sticky header when
            the modal scrolls. */}
        {!manuscriptOpen && (
        <>
        <div
          ref={sceneBoxRef}
          className={`mx-[22px] isolate overflow-auto rounded-xl border border-rule bg-bg ${
            expanded ? "max-h-[58vh]" : "max-h-[40vh]"
          }`}
          style={{
            backgroundImage: "radial-gradient(var(--rule) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="relative" style={{ width: canvasW, height: canvasH }}>
            {!drag && (
              <svg
                width={canvasW}
                height={canvasH}
                className="pointer-events-none absolute left-0 top-0 overflow-visible"
              >
                {ch.scenes.slice(0, -1).map((_, i) => {
                  const a = sceneCenter(i);
                  const b = sceneCenter(i + 1);
                  return (
                    <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line)" strokeWidth={1.75} />
                  );
                })}
              </svg>
            )}

            {!drag &&
              ch.scenes.slice(0, -1).map((_, i) => {
                const a = sceneCenter(i);
                const b = sceneCenter(i + 1);
                const type = ch.sceneLinks[i] ?? "therefore";
                return (
                  <button
                    key={i}
                    disabled={moveMode} // Visible for context while selecting, but inert.
                    onClick={() => cycleSceneLink(ch.id, i)}
                    className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-bg px-[10px] py-[2px] text-[10px] font-semibold uppercase tracking-wide disabled:pointer-events-none"
                    style={{
                      left: (a.x + b.x) / 2,
                      top: (a.y + b.y) / 2,
                      color: CONN[type].color,
                      borderColor: CONN[type].color,
                    }}
                    title={moveMode ? undefined : "Click to cycle Therefore / But / And"}
                  >
                    {CONN[type].label}
                  </button>
                );
              })}

            {gapPos && (
              <div
                className="pointer-events-none absolute z-0 rounded-[11px] border-2 border-dashed border-faint/60 bg-faint/5"
                style={{ left: gapPos.x, top: gapPos.y, width: SCENE_W, minHeight: SCENE_H }}
              />
            )}

            {cardSlots.map((slot) => {
              const i = slot.idx;
              const s = ch.scenes[i];
              const isSelected = moveMode && selected.has(i);
              return (
                <div
                  key={i}
                  data-scene-idx={i}
                  onMouseDown={(e) => onSceneDown(e, i)}
                  onClick={moveMode ? () => toggleSelected(i) : undefined}
                  className={`group absolute z-[5] transition-[left,top] duration-150 ease-out ${
                    moveMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                  }`}
                  style={{ left: slot.pos.x, top: slot.pos.y, width: SCENE_W, minHeight: SCENE_H }}
                >
                  {/* Hover the left/right edge of a card to drop a new scene in
                      before or after it, without leaving the scene canvas. */}
                  {!drag && !moveMode && (
                    <>
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => insertScene(ch.id, i, insertCols)}
                        title="Add a scene before this one"
                        className="absolute left-[-11px] top-[38px] z-30 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border border-rule bg-card text-[14px] font-semibold leading-none text-soft opacity-0 shadow-[var(--shadow)] transition-opacity hover:border-faint hover:text-ink group-hover:opacity-100"
                      >
                        +
                      </button>
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => insertScene(ch.id, i + 1, insertCols)}
                        title="Add a scene after this one"
                        className="absolute right-[-11px] top-[38px] z-30 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border border-rule bg-card text-[14px] font-semibold leading-none text-soft opacity-0 shadow-[var(--shadow)] transition-opacity hover:border-faint hover:text-ink group-hover:opacity-100"
                      >
                        +
                      </button>
                    </>
                  )}
                  <div
                    data-scene-card
                    className="flex h-full flex-col gap-[7px] rounded-[11px] border border-rule bg-card p-[12px_13px] shadow-[var(--shadow)] hover:border-faint"
                    style={
                      // Inline only when refused, selected or freshly jumped to
                      // — a permanent inline borderColor would override the
                      // hover:border-faint highlight. The cap wins over the
                      // others: it is answering something just typed.
                      capHit === i
                        ? {
                            borderColor: "var(--but)",
                            boxShadow:
                              "0 0 0 2px color-mix(in srgb, var(--but) 45%, transparent), var(--shadow)",
                          }
                        : isSelected || flashIdx === i
                          ? {
                              borderColor: "var(--therefore)",
                              boxShadow:
                                "0 0 0 2px color-mix(in srgb, var(--therefore) 45%, transparent), var(--shadow)",
                            }
                          : undefined
                    }
                  >
                    <div className="flex items-center gap-[6px]">
                      {moveMode && (
                        <span
                          className="flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border text-[10px] font-bold leading-none text-bg"
                          style={{
                            borderColor: isSelected ? "var(--therefore)" : "var(--faint)",
                            background: isSelected ? "var(--therefore)" : "transparent",
                          }}
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                      )}
                      <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
                        SCENE {slot.num}
                      </span>
                      <div className="flex-1" />
                      {/* Silent until it matters: at the cap it explains why
                          typing stopped, past it (written before the cap) it
                          says how much has to go. */}
                      {s.trim().length >= SCENE_TEXT_MAX && (
                        <span
                          className="font-mono text-[10px] font-semibold text-but"
                          title={
                            s.trim().length > SCENE_TEXT_MAX
                              ? `Written before the ${SCENE_TEXT_MAX} character limit. Nothing has been cut, but the timeline card can only show part of it.`
                              : `A scene holds up to ${SCENE_TEXT_MAX} characters, so it fits a timeline card whole.`
                          }
                        >
                          {s.trim().length} / {SCENE_TEXT_MAX}
                        </span>
                      )}
                      {!moveMode && ch.scenes.length > 1 && (
                        <button
                          onClick={() =>
                            askConfirm({
                              message: `Delete scene ${slot.num}?`,
                              danger: true,
                              onConfirm: () => deleteScene(ch.id, i),
                            })
                          }
                          className="text-[12px] leading-none text-faint opacity-0 transition-opacity hover:text-but group-hover:opacity-100"
                          title="Delete scene"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <textarea
                      value={s}
                      // Not `maxLength`: the browser would drop the keystroke
                      // silently, and a refusal the writer cannot see is the
                      // thing this cap must not do. `writeScene` refuses it and
                      // says so.
                      onChange={(e) => writeScene(ch.id, i, s, e.target.value)}
                      onMouseDown={(e) => !moveMode && e.stopPropagation()}
                      readOnly={moveMode}
                      rows={3}
                      placeholder="New scene"
                      className={`w-full flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-ink outline-none placeholder:text-faint ${
                        moveMode ? "pointer-events-none" : ""
                      }`}
                    />
                  </div>
                </div>
              );
            })}

            {ghostPos && (
              <div
                className="pointer-events-none absolute z-20 rotate-1 scale-[1.03] cursor-grabbing opacity-90"
                style={{ left: ghostPos.x, top: ghostPos.y, width: SCENE_W, minHeight: SCENE_H }}
              >
                <div className="flex h-full flex-col gap-[7px] rounded-[11px] border border-faint bg-card p-[12px_13px] shadow-[0_18px_38px_rgba(0,0,0,0.35)]">
                  <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
                    SCENE {ghostNum}
                  </span>
                  <div className="line-clamp-4 flex-1 text-[13px] leading-[1.5] text-ink">{ghostText}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-[26px] pt-[8px] text-[11px] font-medium text-faint">
          {moveMode
            ? "Click scenes to select them, then choose a destination chapter · the scenes are appended to that chapter in order"
            : "Drag scenes to reorder · press and hold Add scene to drop it in place · click a connector to toggle Therefore / But / And"}
        </div>
        </>
        )}

        {/* Manuscript. Under Scene flow, not a view of its own: the whole point
            is that the prose sits inside the map rather than beside it. */}
        {(() => {
          const written = writtenCount(ch.manuscript ?? "");
          return (
            <div className={manuscriptOpen ? "pt-[16px]" : "px-[26px] pt-[18px]"}>
              <div className={manuscriptOpen ? "px-[26px]" : ""}>
                <SectionHeader
                  label="Manuscript"
                  collapsed={!manuscriptOpen}
                  onToggle={() => {
                    if (!manuscriptOpen) exitMoveMode();
                    setManuscriptOpen(!manuscriptOpen);
                  }}
                  right={
                    <button
                      onClick={() => {
                        if (!manuscriptOpen) exitMoveMode();
                        setManuscriptOpen(!manuscriptOpen);
                      }}
                      className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
                    >
                      {manuscriptOpen ? "Close the manuscript" : "Open the manuscript"}
                    </button>
                  }
                />
              </div>
              {manuscriptOpen ? (
                <div className="mt-[12px]">
                  <ManuscriptSheet ch={ch} scroller={modalRef} stickyTop={headerH} />
                </div>
              ) : (
                <button
                  onClick={() => {
                    exitMoveMode();
                    setManuscriptOpen(true);
                  }}
                  className="mt-[10px] flex w-full items-center gap-[10px] rounded-xl border border-dashed border-line px-[14px] py-[12px] text-left hover:border-faint"
                >
                  <span className="font-mono text-[11.5px] font-medium text-soft">
                    {ch.scenes.length} {ch.scenes.length === 1 ? "scene" : "scenes"} · {written} written
                  </span>
                  <div className="flex-1" />
                  <span className="text-[11.5px] font-medium text-faint">
                    {ch.manuscript === undefined
                      ? "Nothing written yet"
                      : written === ch.scenes.length
                        ? "Every scene is drafted"
                        : "Pick up where you left off"}
                  </span>
                </button>
              )}
            </div>
          );
        })()}

        {/* Chapter notes */}
        <div className="px-[26px] pt-[18px]">
          <SectionHeader
            label="Chapter notes"
            count={ch.notes?.trim() ? "written" : undefined}
            collapsed={collapsed.notes}
            onToggle={() => toggleSection("notes")}
          />
          {!collapsed.notes && (
            <ExpandableTextarea
              value={ch.notes ?? ""}
              onChange={(v) => patchChapter(ch.id, { notes: v })}
              placeholder="Reminders, revision ideas, continuity flags for this chapter..."
              collapsedRows={3}
              expandedHeight="52vh"
              expanded={notesExpanded}
              onToggleExpanded={() => toggleTextarea("chapterNotes")}
              className="rounded-xl border border-rule bg-card p-[12px] pr-[80px] text-[13px] leading-[1.55] text-ink outline-none"
            />
          )}
        </div>

        {/* Pinned refs */}
        <div className="px-[26px] py-[18px]">
          <div className={collapsed.refs ? "" : "mb-[13px]"}>
            <SectionHeader
              label="Pinned references"
              count={ch.refs.length ? `${ch.refs.length}` : undefined}
              collapsed={collapsed.refs}
              onToggle={() => toggleSection("refs")}
              right={collapsed.refs ? undefined : <ViewToggle view={refView} onChange={setRefView} />}
            />
          </div>
          {!collapsed.refs && (
          <>
          <RefList
            refs={resolveRefs(ch.refs, doc.assets)}
            onAdd={(kind, id) => addChapterRef(ch.id, kind, id)}
            // Content edits write through to the shared asset this ref links.
            // The store resolves ref → asset, so a burst of typing right after a
            // draft commits can't be dropped against a stale render.
            onUpdate={(refId, patch) => updateChapterRefAsset(ch.id, refId, patch)}
            onDelete={(refId) => deleteChapterRef(ch.id, refId)}
            // This chapter's pin order — the shared library has its own, so the
            // same note can sit first here and anywhere there.
            onReorder={(refId, toIdx) => reorderChapterRef(ch.id, refId, toIdx)}
            deletePrompt={() => ({
              message: "Remove from this chapter?",
              detail: "It stays in the shared library.",
              // Not a delete — the button must not say one.
              confirmLabel: "Remove",
            })}
            onLink={() => setLinkOpen((v) => !v)}
            linkLabel="Link book asset"
            view={refView}
          />
          {linkOpen && (
            <AssetLinkPicker
              // Archived assets are retired — not offered for pinning.
              assets={doc.assets.filter((a) => !a.archived)}
              linkedAssetIds={new Set(ch.refs.map((r) => r.assetId))}
              onPick={(assetId) => {
                linkAssetToChapter(ch.id, assetId);
                setLinkOpen(false);
              }}
            />
          )}
          </>
          )}
        </div>

        {/* Danger zone */}
        <div className="flex items-center justify-end border-t border-rule px-[26px] py-[14px]">
          <button
            onClick={() =>
              askConfirm({
                message: `Delete "${ch.title}"?`,
                detail: "The chapter and its scenes will be permanently removed.",
                danger: true,
                onConfirm: () => deleteChapter(ch.id),
              })
            }
            className="rounded-lg border border-rule px-[12px] py-[7px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
          >
            Delete chapter
          </button>
        </div>
      </div>
    </Scrim>

    {/* Move confirmation — choose where in the destination chapter to drop the
        selected scenes, then confirm. */}
    {moveDest && (
      <Scrim onClose={() => setMoveDest(null)} z={60} center>
        <div
          onMouseDown={stop}
          className="w-[min(440px,92vw)] rounded-2xl border border-rule bg-panel p-[22px] shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
        >
          <div className="font-serif text-[19px] font-semibold text-ink">
            Move {selected.size} {selected.size === 1 ? "scene" : "scenes"}
          </div>
          <div className="mt-[4px] flex items-center gap-[7px] text-[13px] text-soft">
            to
            <span className="rounded bg-ink px-[6px] py-[1px] font-mono text-[11px] font-semibold text-bg">
              {String(moveDest.num).padStart(2, "0")}
            </span>
            {moveDest.title || "Untitled chapter"}
          </div>

          <div className="mt-[18px] text-[11px] font-semibold uppercase tracking-widest text-soft">
            Add them to the
          </div>
          <div className="mt-[8px] flex rounded-lg bg-chip p-[3px]">
            {(["beginning", "middle", "end"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => setMovePos(pos)}
                className={`flex-1 rounded-md px-[10px] py-[6px] text-[12px] font-medium capitalize ${
                  movePos === pos ? "bg-card text-ink" : "text-soft hover:bg-card"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
          <div className="mt-[8px] text-[11.5px] leading-[1.5] text-faint">
            {movePos === "beginning"
              ? "The scenes will lead off the destination chapter, before its current first scene."
              : movePos === "middle"
                ? "The scenes will drop in around the middle of the destination chapter's scene flow."
                : "The scenes will be appended after the destination chapter's current last scene."}
          </div>

          <div className="mt-[20px] flex justify-end gap-[9px]">
            <button
              onClick={() => setMoveDest(null)}
              className="rounded-lg border border-rule bg-card px-[14px] py-[7px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Cancel
            </button>
            <button
              onClick={confirmMove}
              className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg"
            >
              Move {selected.size === 1 ? "scene" : "scenes"}
            </button>
          </div>
        </div>
      </Scrim>
    )}
    </>
  );
}

/** Collapsible section label for the chapter modal. Clicking the label (or its
 *  chevron) hides the section body while keeping this row visible. `right` holds
 *  optional controls (e.g. the refs view toggle) shown only when expanded. */
function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
  right,
}: {
  label: string;
  count?: string;
  collapsed: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-[12px]">
      <button
        onClick={onToggle}
        className="flex items-center gap-[8px] text-[11px] font-semibold uppercase tracking-widest text-soft hover:text-ink"
        title={collapsed ? "Expand section" : "Collapse section"}
      >
        <span className="text-[9px] font-medium text-faint">{collapsed ? "▸" : "▾"}</span>
        {label}
        {count && (
          <span className="font-medium normal-case tracking-normal text-faint">· {count}</span>
        )}
      </button>
      <div className="flex-1" />
      {right}
    </div>
  );
}
