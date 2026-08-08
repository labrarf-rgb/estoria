import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { wordsMeta } from "@/lib/manuscript";
import { CARD_W, CARD_H, GRID_GAP_X, fitToContent, type Camera } from "@/lib/layout";
import { displaySummary } from "@/lib/drafts";
import { chipRestLabel, chipSplit } from "@/lib/chips";
import { ARCHIVED_DIM, archivedTitle } from "@/components/ui/ArchiveShelf";
import type { Chapter, ConnType } from "@/types";

const CONN_COLOR: Record<ConnType, string> = {
  therefore: "var(--therefore)",
  but: "var(--but)",
  and: "var(--and)",
  /**
   * Chapter links can hold `"none"` (they share `ConnType` with scene links),
   * but nothing on the board sets one — the board has no cycle control. It gets
   * the neutral line colour so a doc that arrives carrying one still draws.
   */
  none: "var(--line)",
};

const statusColor = (s: Chapter["status"]) =>
  s === "done" ? "var(--therefore)" : s === "draft" ? "var(--but)" : "var(--faint)";

/** Cubic curve from one card's right edge to another's left edge. */
function connectorPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + CARD_W;
  const y1 = a.y + CARD_H / 2;
  const x2 = b.x;
  const y2 = b.y + CARD_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * The chapters a drag is carrying: the whole selection when the card picked up
 * belongs to it, otherwise just that card. Same rule the drop path uses, so the
 * end slot is anchored against exactly the chapters that are about to move.
 */
function movingSet(selected: Set<string>, draggedId: string): Set<string> {
  return selected.has(draggedId) ? selected : new Set([draggedId]);
}

/**
 * Where "send this to the end of the book" lives on the board.
 *
 * Dropping a card onto another always lands it *before* that card, so the tail
 * of the sequence has no card left to aim at. This is the slot that stands in
 * for one: a card-sized target a single grid gap past the last chapter that
 * isn't itself moving — the empty space just after the last card, which is
 * where you'd already be dragging to.
 *
 * `null` when the moving chapters *are* the tail. There is no reorder to offer
 * then, so nothing is drawn and nothing hit-tests.
 */
function endSlot(
  chapters: Chapter[],
  moving: Set<string>
): { anchorId: string; x: number; y: number } | null {
  const rest = chapters.filter((c) => !moving.has(c.id));
  const anchor = rest[rest.length - 1];
  if (!anchor) return null;
  // Everything past the anchor is already moving; if that accounts for all of
  // it, the block is sitting at the end and appending it would be a no-op.
  if (chapters.length - 1 - chapters.indexOf(anchor) === moving.size) return null;
  return { anchorId: anchor.id, x: anchor.x + CARD_W + GRID_GAP_X, y: anchor.y };
}

/** Is a dragged card's centre over `slot`? */
function overSlot(slot: { x: number; y: number }, cx: number, cy: number): boolean {
  return cx >= slot.x && cx <= slot.x + CARD_W && cy >= slot.y && cy <= slot.y + CARD_H;
}

/**
 * The book's story map: free-placed chapter cards on a pan/zoom canvas. The
 * timeline is a separate surface (see `Timeline`), so everything here is
 * map-only — no orientation, no derived positions.
 */
export function Board() {
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.zoom);
  const panX = useStore((s) => s.panX);
  const panY = useStore((s) => s.panY);
  const dragId = useStore((s) => s.dragId);
  const arrangeN = useStore((s) => s.arrangeN);

  const setCamera = useStore((s) => s.setCamera);
  const setBoardSize = useStore((s) => s.setBoardSize);
  const moveChapter = useStore((s) => s.moveChapter);
  const reorderChapter = useStore((s) => s.reorderChapter);
  const reorderChapters = useStore((s) => s.reorderChapters);
  const deleteChapters = useStore((s) => s.deleteChapters);
  const autoArrangeBoard = useStore((s) => s.autoArrangeBoard);
  const setDragId = useStore((s) => s.setDragId);
  const openChapter = useStore((s) => s.openChapter);
  const askConfirm = useStore((s) => s.askConfirm);

  const viewportRef = useRef<HTMLDivElement>(null);
  // Live interaction state kept in refs to avoid stale closures in listeners.
  const drag = useRef<{ id: string; mx: number; my: number; ox: number; oy: number } | null>(null);
  const pan = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const cam = useRef<Camera>({ zoom, panX, panY });
  cam.current = { zoom, panX, panY };

  // While dragging a chapter (map view), the card it's currently over is a
  // reorder target — dropping on it offers a resequence via confirmation.
  // Mirrored into a ref for the window-level handlers.
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  // The same, for the end-of-book slot (see `endSlot`), which is a place rather
  // than a card and so cannot be named by an id.
  const [overEnd, setOverEnd] = useState(false);
  const overEndRef = useRef(false);
  // The end slot is only drawn once a drag is genuinely under way. Every press
  // on a card sets `dragId`, so keying the ghost off that alone would flash it
  // on the board each time someone clicked a chapter open.
  const [dragMoved, setDragMoved] = useState(false);
  // Position + hit-test are coalesced to one update per animation frame
  // (rather than once per native mousemove, which can fire faster than the
  // screen repaints) so the dragged card, its connectors, and the highlight
  // all stay in lockstep with the pointer during a fast real drag.
  const dragRaf = useRef<number | null>(null);
  const pendingDragPos = useRef<{ x: number; y: number } | null>(null);
  // Every press on a card starts a drag, so a press that never moves is how a
  // *click* is detected: on release it opens the chapter instead of dropping the
  // card. A few pixels of hand-shake still counts as a click, hence the slop.
  const movedRef = useRef(false);
  const CLICK_SLOP = 4;

  /**
   * Multi-selected chapters, for reordering or deleting several at once.
   *
   * Entered by **modifier-clicking** a card rather than by a mode button: the
   * board has no toolbar of its own, and a press on a card already means three
   * things (click to open, drag to move, drop to reorder). A modifier is the
   * one addition that does not have to be arbitrated against those.
   *
   * Mirrored into a ref because the drag and drop handlers are window-level and
   * would otherwise close over the selection as it was when they were bound.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRef = useRef<Set<string>>(selected);
  selectedRef.current = selected;
  const clearSelection = () => setSelected(new Set());

  // Pointer drag (chapters) and background pan — via window listeners.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const anchor = drag.current;
      if (anchor && !movedRef.current) {
        movedRef.current =
          Math.abs(e.clientX - anchor.mx) > CLICK_SLOP || Math.abs(e.clientY - anchor.my) > CLICK_SLOP;
      }
      if (drag.current) {
        const z = cam.current.zoom;
        const nx = drag.current.ox + (e.clientX - drag.current.mx) / z;
        const ny = drag.current.oy + (e.clientY - drag.current.my) / z;
        pendingDragPos.current = { x: nx, y: ny };
        if (dragRaf.current == null) {
          dragRaf.current = requestAnimationFrame(() => {
            dragRaf.current = null;
            if (!drag.current || !pendingDragPos.current) return;
            const { x, y } = pendingDragPos.current;
            moveChapter(drag.current.id, x, y);
            setDragMoved(true);
            const cx = x + CARD_W / 2;
            const cy = y + CARD_H / 2;
            const chapters = useStore.getState().doc.chapters;
            const hit = chapters.find(
              (c) => c.id !== drag.current!.id && cx >= c.x && cx <= c.x + CARD_W && cy >= c.y && cy <= c.y + CARD_H
            );
            const hitId = hit?.id ?? null;
            if (dropTargetRef.current !== hitId) {
              dropTargetRef.current = hitId;
              setDropTargetId(hitId);
            }
            // A card under the cursor wins: the slot sits in the gap past the
            // last card, so the two only ever compete if cards are stacked.
            const slot = hitId ? null : endSlot(chapters, movingSet(selectedRef.current, drag.current.id));
            const end = !!slot && overSlot(slot, cx, cy);
            if (overEndRef.current !== end) {
              overEndRef.current = end;
              setOverEnd(end);
            }
          });
        }
      } else if (pan.current) {
        setCamera({
          panX: pan.current.px + (e.clientX - pan.current.mx),
          panY: pan.current.py + (e.clientY - pan.current.my),
        });
      }
    };
    const onUp = () => {
      if (drag.current) {
        // Flush any coalesced position update still pending so the hit-test
        // below reflects the card's true final (not one-frame-stale) position.
        if (dragRaf.current != null) {
          cancelAnimationFrame(dragRaf.current);
          dragRaf.current = null;
        }
        const click = !movedRef.current;
        // Where the card actually came to rest, kept for the hit-test below —
        // `pendingDragPos` is cleared as part of committing the move.
        let finalPos = { x: drag.current.ox, y: drag.current.oy };
        if (pendingDragPos.current) {
          // A click that jiggled a pixel or two puts the card back where it was
          // — clicking into a chapter must never nudge the board.
          const { x, y } = click
            ? { x: drag.current.ox, y: drag.current.oy }
            : pendingDragPos.current;
          finalPos = { x, y };
          moveChapter(drag.current.id, x, y);
          pendingDragPos.current = null;
        }
        const draggedId = drag.current.id;
        // Hit-test against the card's *final* position rather than trusting
        // `dropTargetRef`. That ref is only written inside the coalescing rAF,
        // and the cancel above means a drag that ends in the same frame as its
        // last move never ran one — so the ref can be a frame stale, or never
        // set at all on a quick flick.
        let targetId: string | null = null;
        let endAnchorId: string | null = null;
        if (!click) {
          const cx = finalPos.x + CARD_W / 2;
          const cy = finalPos.y + CARD_H / 2;
          const chapters = useStore.getState().doc.chapters;
          targetId =
            chapters.find(
              (c) =>
                c.id !== draggedId &&
                cx >= c.x &&
                cx <= c.x + CARD_W &&
                cy >= c.y &&
                cy <= c.y + CARD_H
            )?.id ?? null;
          if (!targetId) {
            const slot = endSlot(chapters, movingSet(selectedRef.current, draggedId));
            if (slot && overSlot(slot, cx, cy)) endAnchorId = slot.anchorId;
          }
        }
        drag.current = null;
        setDragId(null);
        setDragMoved(false);
        if (click) openChapter(draggedId);
        if (targetId || endAnchorId) {
          const chapters = useStore.getState().doc.chapters;
          const dragged = chapters.find((c) => c.id === draggedId);
          const target = targetId ? chapters.find((c) => c.id === targetId) ?? null : null;
          // Dragging a card that is part of a selection moves the whole
          // selection; dragging an unselected card moves just that card, so the
          // ordinary single reorder is untouched by a selection sitting idle
          // elsewhere on the board. A drop *onto* a selected card is refused by
          // the store, so it is not offered here either.
          const sel = selectedRef.current;
          const block = sel.has(draggedId) && !(targetId && sel.has(targetId)) ? [...sel] : null;
          if (dragged && (target || endAnchorId)) {
            // A drop on a card always lands before it — which way the card was
            // carried in from says nothing about where its author wants it, and
            // a rule that reads the drag direction means the same gesture onto
            // the same card can land on either side of it. The end of the book
            // is reached by its own slot instead (see `endSlot`).
            const where = target ? `before "${target.title}"` : "to the end of the book";
            askConfirm({
              message: block ? `Reorder ${block.length} chapters?` : "Reorder chapters?",
              detail: block
                ? `The ${block.length} selected chapters will move ${where}, keeping the order they're in now. The board will re-arrange to match.`
                : `"${dragged.title}" will move ${where}, and the board will re-arrange to match.`,
              confirmLabel: "Reorder",
              onConfirm: () => {
                // The store places relative to one chapter, so "before this
                // card" is `after: false` against the card it was dropped on,
                // and "at the end" is `after: true` against the last chapter
                // that isn't moving.
                const anchorId = target ? target.id : endAnchorId!;
                const after = !target;
                if (block) {
                  reorderChapters(block, anchorId, after);
                  setSelected(new Set());
                } else {
                  reorderChapter(draggedId, anchorId, after);
                }
                autoArrangeBoard();
              },
            });
          }
        }
        dropTargetRef.current = null;
        setDropTargetId(null);
        overEndRef.current = false;
        setOverEnd(false);
      }
      pan.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragRaf.current != null) cancelAnimationFrame(dragRaf.current);
    };
  }, [
    moveChapter,
    reorderChapter,
    reorderChapters,
    autoArrangeBoard,
    setCamera,
    setDragId,
    askConfirm,
    openChapter,
  ]);

  // Wheel zooms the map.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.08 : 0.925;
      setCamera({ zoom: Math.min(1.8, Math.max(0.34, cam.current.zoom * f)) });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [setCamera]);

  // Keep the store's board size current so auto-arrange can size to the viewport.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const report = () => setBoardSize(vp.clientWidth, vp.clientHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [setBoardSize]);

  // Fit all cards to the screen on first load and whenever we switch books or
  // projects. Keyed on doc.id too: different projects can share the same
  // default book id ("book-1"), which used to leave a stale camera on switch.
  const activeBookId = doc.activeBookId;
  const docId = doc.id;
  const prevCount = useRef(doc.chapters.length);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    setCamera(fitToContent(doc.chapters, vp.clientWidth, vp.clientHeight));
    prevCount.current = doc.chapters.length;
    // Re-fit on mount and on project/book change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, activeBookId]);

  // When a newly added chapter lands off-screen, auto fit-to-screen.
  useEffect(() => {
    const n = doc.chapters.length;
    const grew = n > prevCount.current;
    prevCount.current = n;
    if (!grew) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const last = doc.chapters[n - 1];
    const c = cam.current;
    const sx = c.panX + last.x * c.zoom;
    const sy = c.panY + last.y * c.zoom;
    const visible =
      sx >= 0 && sy >= 0 && sx + CARD_W * c.zoom <= vp.clientWidth && sy + CARD_H * c.zoom <= vp.clientHeight;
    if (!visible) setCamera(fitToContent(doc.chapters, vp.clientWidth, vp.clientHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.chapters.length]);

  // Auto-arrange also fits the arranged grid to the visible board, so the result
  // is always on-screen. (The grid/jitter behaviour itself is unchanged.)
  const prevArrange = useRef(arrangeN);
  useEffect(() => {
    const grew = arrangeN > prevArrange.current;
    prevArrange.current = arrangeN;
    if (!grew) return;
    const vp = viewportRef.current;
    if (vp) setCamera(fitToContent(doc.chapters, vp.clientWidth, vp.clientHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangeN]);

  const posById: Record<string, { x: number; y: number }> = {};
  doc.chapters.forEach((c) => (posById[c.id] = { x: c.x, y: c.y }));

  const onCardDown = (e: React.MouseEvent, ch: Chapter) => {
    e.stopPropagation();
    e.preventDefault();
    // Modifier-click toggles selection and starts no drag: picking chapters is
    // not a gesture that should also nudge the board.
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(ch.id)) next.delete(ch.id);
        else next.add(ch.id);
        return next;
      });
      return;
    }
    movedRef.current = false;
    drag.current = { id: ch.id, mx: e.clientX, my: e.clientY, ox: ch.x, oy: ch.y };
    setDragId(ch.id);
  };
  const onCanvasDown = (e: React.MouseEvent) => {
    // A press on bare board clears the selection, the same way clicking away
    // dismisses a selection anywhere else. Panning still works: this fires on
    // the press, and the selection was not doing anything for the pan.
    if (selected.size > 0) clearSelection();
    pan.current = { mx: e.clientX, my: e.clientY, px: panX, py: panY };
    void e;
  };

  // Drawn only mid-drag: it is a target, not furniture, and a permanent ghost
  // card past the end of the book would read as a chapter that isn't there.
  const endGhost = dragId && dragMoved ? endSlot(doc.chapters, movingSet(selected, dragId)) : null;

  const charById = (id: string) => doc.characters.find((c) => c.id === id);
  const castOf = (c: Chapter) => c.chars.flatMap((id) => charById(id) ?? []);
  const titleOf = (c: Chapter) => c.title;
  const summaryOf = (c: Chapter) => displaySummary(c);

  return (
    <div
      ref={viewportRef}
      onMouseDown={onCanvasDown}
      className="relative flex-1 overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(var(--dot) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Connectors */}
        <svg
          width={6000}
          height={4000}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        >
          {doc.links.map((l, i) => {
            const a = posById[l.fromId];
            const b = posById[l.toId];
            if (!a || !b) return null;
            const type = l.type;
            return (
              <path
                key={i}
                d={connectorPath(a, b)}
                fill="none"
                stroke={CONN_COLOR[type]}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* The end-of-book drop slot. Sits below the cards and takes no pointer
            events of its own — the drop is decided by hit-testing the dragged
            card's centre in `onUp`, exactly as a drop onto a card is. */}
        {endGhost && (
          <div
            className="flex items-center justify-center rounded-xl border border-dashed text-[10.5px] font-medium uppercase tracking-[0.14em]"
            style={{
              position: "absolute",
              left: endGhost.x,
              top: endGhost.y,
              width: CARD_W,
              height: CARD_H,
              zIndex: 4,
              pointerEvents: "none",
              borderColor: overEnd ? "color-mix(in srgb, var(--but) 60%, var(--rule))" : "var(--rule)",
              color: overEnd ? "var(--but)" : "var(--faint)",
              background: overEnd ? "color-mix(in srgb, var(--but) 8%, transparent)" : "transparent",
              boxShadow: overEnd
                ? "0 0 0 3px color-mix(in srgb, var(--but) 32%, transparent), 0 10px 26px color-mix(in srgb, var(--but) 20%, transparent)"
                : "none",
            }}
          >
            End of book
          </div>
        )}

        {/* Chapter cards */}
        {doc.chapters.map((c) => {
          const p = posById[c.id];
          if (!p) return null;
          return (
            <div
              key={c.id}
              // A click opens the chapter (see `onUp`); no double-click handler,
              // because by the time a second click lands the modal is already
              // over the card.
              onMouseDown={(e) => onCardDown(e, c)}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: CARD_W,
                minHeight: CARD_H,
                cursor: dragId === c.id ? "grabbing" : "grab",
                zIndex: dragId === c.id ? 20 : 5,
                transform: c.rot ? `rotate(${c.rot}deg)` : "none",
                transformOrigin: "center center",
              }}
            >
              <div
                className="flex h-full flex-col gap-[7px] rounded-xl border bg-card p-[12px_14px] hover:border-faint"
                style={{
                  borderColor:
                    dropTargetId === c.id
                      ? "color-mix(in srgb, var(--but) 60%, var(--rule))"
                      : selected.has(c.id)
                        ? "var(--therefore)"
                        : "var(--rule)",
                  boxShadow:
                    dropTargetId === c.id
                      ? "0 0 0 3px color-mix(in srgb, var(--but) 32%, transparent), 0 10px 26px color-mix(in srgb, var(--but) 20%, transparent), var(--shadow)"
                      : selected.has(c.id)
                        ? "0 0 0 3px color-mix(in srgb, var(--therefore) 30%, transparent), var(--shadow)"
                        : dragId === c.id
                          ? "0 14px 32px rgba(0,0,0,0.26), var(--shadow)"
                          : "var(--shadow)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-ink px-[7px] py-[2px] font-mono text-[11px] font-semibold text-bg">
                    {String(c.num).padStart(2, "0")}
                  </span>
                  <span
                    className="inline-block h-[7px] w-[7px] rounded-full"
                    style={{ background: statusColor(c.status) }}
                  />
                  <div className="flex-1" />
                  <div className="flex items-center pr-[6px]">
                    {(() => {
                      const { shown, rest } = chipSplit(castOf(c));
                      return (
                        <>
                          {shown.map((k) => (
                            <span
                              key={k.id}
                              className={`-mr-[6px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-card text-[9.5px] font-semibold text-white ${k.archived ? ARCHIVED_DIM : ""}`}
                              style={{ background: k.color }}
                              title={
                                k.archived
                                  ? archivedTitle(k.name || "Unnamed character")
                                  : k.name || undefined
                              }
                            >
                              {k.initials || "?"}
                            </span>
                          ))}
                          {rest.length > 0 && (
                            <span
                              className="-mr-[6px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-[1.5px] border-card bg-soft px-[4px] text-[9.5px] font-semibold text-bg"
                              title={chipRestLabel(rest)}
                            >
                              +{rest.length}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div
                  className={`font-serif text-[16px] font-semibold leading-tight ${
                    titleOf(c) ? "text-ink" : "text-faint"
                  }`}
                >
                  {titleOf(c) || "Untitled chapter"}
                </div>
                <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-soft">
                  {summaryOf(c)}
                </div>
                <div className="flex-1" />
                <div className="flex items-center justify-end gap-[7px] font-mono text-[11px] font-medium text-soft">
                  <span>
                    {c.scenes.length} {c.scenes.length === 1 ? "scene" : "scenes"}
                  </span>
                  <span className="text-faint">·</span>
                  <span>{wordsMeta(c.words, c.target)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection bar. Floats over the board rather than living in the toolbar,
          because it only exists while a selection does and the toolbar is
          shared with the series map and the timeline. */}
      {selected.size > 0 && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute bottom-[22px] left-1/2 flex -translate-x-1/2 items-center gap-[10px] rounded-2xl border border-rule bg-panel px-[16px] py-[11px] shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
        >
          <span className="text-[12.5px] font-medium text-ink">
            {selected.size} {selected.size === 1 ? "chapter" : "chapters"} selected
          </span>
          <span className="text-[11.5px] text-faint">
            drop one on a chapter to move them all before it
          </span>
          <span className="mx-[2px] h-[20px] w-px bg-rule" />
          <button
            onClick={() => {
              const all = useStore.getState().doc.chapters;
              const names = all.filter((c) => selected.has(c.id)).map((c) => c.title || "Untitled chapter");
              // The store refuses to empty a book; say so here rather than
              // letting the confirm run and silently do nothing.
              if (selected.size >= all.length) {
                askConfirm({
                  message: "A book keeps at least one chapter",
                  detail: "Leave one chapter unselected, then delete the rest.",
                  confirmLabel: "Got it",
                  onConfirm: () => {},
                });
                return;
              }
              askConfirm({
                message: `Delete ${selected.size} ${selected.size === 1 ? "chapter" : "chapters"}?`,
                detail: `${names.slice(0, 4).join(", ")}${names.length > 4 ? `, and ${names.length - 4} more` : ""}. Their scenes, notes and writing go with them. This can't be undone.`,
                confirmLabel: "Delete",
                onConfirm: () => {
                  deleteChapters([...selected]);
                  clearSelection();
                },
              });
            }}
            className="rounded-lg border border-rule bg-card px-[12px] py-[6px] text-[12px] font-medium text-but hover:border-but"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="rounded-lg border border-rule bg-card px-[12px] py-[6px] text-[12px] font-medium text-ink hover:border-faint"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
