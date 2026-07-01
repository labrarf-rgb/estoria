import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  CARD_W,
  CARD_H,
  fitToContent,
  layoutPositions,
  timelineChapterPositions,
  type Camera,
} from "@/lib/layout";
import { displaySummary, resolveTitle } from "@/lib/drafts";
import { roman } from "@/lib/markdown";
import type { Chapter, ConnType } from "@/types";

const CONN_COLOR: Record<ConnType, string> = {
  therefore: "var(--therefore)",
  but: "var(--but)",
  and: "var(--and)",
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

export function Board() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const orient = useStore((s) => s.timelineOrient);
  const draftId = useStore((s) => s.doc.activeDraftId);
  const zoom = useStore((s) => s.zoom);
  const panX = useStore((s) => s.panX);
  const panY = useStore((s) => s.panY);
  const dragId = useStore((s) => s.dragId);
  const arrangeN = useStore((s) => s.arrangeN);

  const setCamera = useStore((s) => s.setCamera);
  const setBoardSize = useStore((s) => s.setBoardSize);
  const moveChapter = useStore((s) => s.moveChapter);
  const reorderChapter = useStore((s) => s.reorderChapter);
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
  // Position + hit-test are coalesced to one update per animation frame
  // (rather than once per native mousemove, which can fire faster than the
  // screen repaints) so the dragged card, its connectors, and the highlight
  // all stay in lockstep with the pointer during a fast real drag.
  const dragRaf = useRef<number | null>(null);
  const pendingDragPos = useRef<{ x: number; y: number } | null>(null);

  // Timeline-only drag-to-reorder: positions there are purely derived from
  // array order (no stored x/y), so dragging live-splices a preview order and
  // everyone — including the dragged card — reflows to the resulting
  // sequential slots. Board (map) view keeps free placement; dropping a card
  // onto another there just offers a reorder via confirmation (see onUp).
  const timelineDrag = useRef<{ id: string; fromIdx: number } | null>(null);
  const [timelineDragId, setTimelineDragId] = useState<string | null>(null);
  const [timelineOverIdx, setTimelineOverIdx] = useState<number | null>(null);
  const timelineOverRef = useRef<number | null>(null);

  const isTimeline = view === "timeline";

  // Pointer drag (chapters), timeline reorder, and background pan — via window listeners.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
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
            const cx = x + CARD_W / 2;
            const cy = y + CARD_H / 2;
            const hit = useStore
              .getState()
              .doc.chapters.find(
                (c) => c.id !== drag.current!.id && cx >= c.x && cx <= c.x + CARD_W && cy >= c.y && cy <= c.y + CARD_H
              );
            const hitId = hit?.id ?? null;
            if (dropTargetRef.current !== hitId) {
              dropTargetRef.current = hitId;
              setDropTargetId(hitId);
            }
          });
        }
      } else if (timelineDrag.current) {
        const vp = viewportRef.current;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        const c = cam.current;
        const wx = (e.clientX - rect.left - c.panX) / c.zoom;
        const wy = (e.clientY - rect.top - c.panY) / c.zoom;
        const primary = orient === "vertical" ? wy : wx;
        const chapters = useStore.getState().doc.chapters;
        const others = chapters.filter((ch) => ch.id !== timelineDrag.current!.id);
        const otherPos = timelineChapterPositions(others, orient);
        const rank = otherPos.filter((p) => (orient === "vertical" ? p.y : p.x) < primary).length;
        if (timelineOverRef.current !== rank) {
          timelineOverRef.current = rank;
          setTimelineOverIdx(rank);
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
        if (pendingDragPos.current) {
          moveChapter(drag.current.id, pendingDragPos.current.x, pendingDragPos.current.y);
          pendingDragPos.current = null;
        }
        const draggedId = drag.current.id;
        const targetId = dropTargetRef.current;
        drag.current = null;
        setDragId(null);
        if (targetId) {
          const chapters = useStore.getState().doc.chapters;
          const dragged = chapters.find((c) => c.id === draggedId);
          const target = chapters.find((c) => c.id === targetId);
          if (dragged && target) {
            const draftId = useStore.getState().doc.activeDraftId;
            const after = dragged.x > target.x;
            askConfirm({
              message: "Reorder chapters?",
              detail: `"${resolveTitle(dragged, draftId)}" will move ${after ? "after" : "before"} "${resolveTitle(target, draftId)}", and the board will re-arrange to match.`,
              confirmLabel: "Reorder",
              onConfirm: () => {
                reorderChapter(draggedId, target.id, after);
                autoArrangeBoard();
              },
            });
          }
        }
        dropTargetRef.current = null;
        setDropTargetId(null);
      }
      if (timelineDrag.current) {
        const { id, fromIdx } = timelineDrag.current;
        const finalIdx = timelineOverRef.current ?? fromIdx;
        const chapters = useStore.getState().doc.chapters;
        const others = chapters.filter((c) => c.id !== id);
        const clamped = Math.max(0, Math.min(finalIdx, others.length));
        if (others.length) {
          const targetId = clamped < others.length ? others[clamped].id : others[others.length - 1].id;
          reorderChapter(id, targetId, clamped >= others.length);
        }
        timelineDrag.current = null;
        timelineOverRef.current = null;
        setTimelineDragId(null);
        setTimelineOverIdx(null);
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
  }, [moveChapter, reorderChapter, autoArrangeBoard, setCamera, setDragId, askConfirm, orient]);

  // Wheel: zoom on the board, scroll-pan on the timeline.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cam.current;
      if (isTimeline) {
        if (orient === "vertical") setCamera({ panY: c.panY - e.deltaY });
        else setCamera({ panX: c.panX - (e.deltaY + e.deltaX) });
      } else {
        const f = e.deltaY < 0 ? 1.08 : 0.925;
        setCamera({ zoom: Math.min(1.8, Math.max(0.34, c.zoom * f)) });
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [isTimeline, orient, setCamera]);

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

  // Fit all cards to the screen on first load and whenever we switch books.
  const activeBookId = doc.activeBookId;
  const prevCount = useRef(doc.chapters.length);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || view !== "board") return;
    setCamera(fitToContent(doc.chapters, vp.clientWidth, vp.clientHeight));
    prevCount.current = doc.chapters.length;
    // Re-fit on mount and on book change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookId]);

  // When a newly added chapter lands off-screen, auto fit-to-screen.
  useEffect(() => {
    const n = doc.chapters.length;
    const grew = n > prevCount.current;
    prevCount.current = n;
    if (!grew || view !== "board") return;
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

  // Returning to the board from the timeline: snap back to the cards (the
  // timeline's scroll position would otherwise leave the board looking empty).
  const prevView = useRef(view);
  useEffect(() => {
    const was = prevView.current;
    prevView.current = view;
    if (view === "board" && was === "timeline") {
      const vp = viewportRef.current;
      if (vp) setCamera(fitToContent(doc.chapters, vp.clientWidth, vp.clientHeight));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Auto-arrange also fits the arranged grid to the visible board, so the result
  // is always on-screen. (The grid/jitter behaviour itself is unchanged.)
  const prevArrange = useRef(arrangeN);
  useEffect(() => {
    const grew = arrangeN > prevArrange.current;
    prevArrange.current = arrangeN;
    if (!grew || view !== "board") return;
    const vp = viewportRef.current;
    if (vp) setCamera(fitToContent(doc.chapters, vp.clientWidth, vp.clientHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangeN]);

  const isVert = isTimeline && orient === "vertical";
  let pos = layoutPositions(doc, view, orient);
  if (isTimeline && timelineDragId && timelineOverIdx !== null) {
    const dragged = doc.chapters.find((c) => c.id === timelineDragId);
    const others = doc.chapters.filter((c) => c.id !== timelineDragId);
    if (dragged) {
      const preview = others.slice();
      preview.splice(Math.max(0, Math.min(timelineOverIdx, others.length)), 0, dragged);
      pos = timelineChapterPositions(preview, orient);
    }
  }
  const posById: Record<string, { x: number; y: number }> = {};
  pos.forEach((p) => (posById[p.id] = { x: p.x, y: p.y }));

  // In timeline view, draw a band behind each Act so the grouping is visible.
  const actBands = (() => {
    if (!isTimeline) return [] as {
      act: number;
      left: number;
      top: number;
      width: number;
      height: number;
    }[];
    const groups: { act: number; ids: string[] }[] = [];
    doc.chapters.forEach((c) => {
      const last = groups[groups.length - 1];
      if (last && last.act === c.act) last.ids.push(c.id);
      else groups.push({ act: c.act, ids: [c.id] });
    });
    return groups.map((g) => {
      const ps = g.ids.map((id) => posById[id]).filter(Boolean);
      const xs = ps.map((p) => p.x);
      const ys = ps.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs) + CARD_W;
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys) + CARD_H;
      return isVert
        ? { act: g.act, left: minX - 22, top: minY - 34, width: CARD_W + 44, height: maxY - minY + 34 + 18 }
        : { act: g.act, left: minX - 20, top: minY - 38, width: maxX - minX + 40, height: CARD_H + 38 + 18 };
    });
  })();

  const onCardDown = (e: React.MouseEvent, ch: Chapter) => {
    e.stopPropagation();
    e.preventDefault();
    if (isTimeline) {
      const fromIdx = doc.chapters.findIndex((c) => c.id === ch.id);
      timelineDrag.current = { id: ch.id, fromIdx };
      timelineOverRef.current = fromIdx;
      setTimelineDragId(ch.id);
      setTimelineOverIdx(fromIdx);
      return;
    }
    drag.current = { id: ch.id, mx: e.clientX, my: e.clientY, ox: ch.x, oy: ch.y };
    setDragId(ch.id);
  };
  const onCanvasDown = (e: React.MouseEvent) => {
    pan.current = { mx: e.clientX, my: e.clientY, px: panX, py: panY };
    void e;
  };

  const charById = (id: string) => doc.characters.find((c) => c.id === id);
  const titleOf = (c: Chapter) => resolveTitle(c, draftId);
  const summaryOf = (c: Chapter) => displaySummary(c, draftId);

  return (
    <div
      ref={viewportRef}
      onMouseDown={onCanvasDown}
      className="relative flex-1 overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(var(--rule) 1px, transparent 1px)",
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
        {/* Act bands (timeline only) */}
        {actBands.map((b, i) => (
          <div
            key={`act-${i}`}
            style={{
              position: "absolute",
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
              border: "1.5px dashed var(--line)",
              borderRadius: 16,
              background: "var(--panel)",
              opacity: 0.55,
              zIndex: 0,
            }}
          />
        ))}
        {actBands.map((b, i) => (
          <div
            key={`act-label-${i}`}
            style={{
              position: "absolute",
              left: b.left + 12,
              top: b.top + 8,
              zIndex: 1,
              font: "600 11px 'Hanken Grotesk'",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--faint)",
              pointerEvents: "none",
            }}
          >
            Act {roman(b.act)}
          </div>
        ))}

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

        {/* Chapter cards */}
        {doc.chapters.map((c) => {
          const p = posById[c.id];
          if (!p) return null;
          return (
            <div
              key={c.id}
              onMouseDown={(e) => onCardDown(e, c)}
              onDoubleClick={() => openChapter(c.id)}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: CARD_W,
                minHeight: CARD_H,
                cursor: dragId === c.id || timelineDragId === c.id ? "grabbing" : "grab",
                zIndex: dragId === c.id || timelineDragId === c.id ? 20 : 5,
                transform: !isTimeline && c.rot ? `rotate(${c.rot}deg)` : "none",
                transformOrigin: "center center",
                transition: isTimeline ? "left 150ms ease-out, top 150ms ease-out" : undefined,
              }}
            >
              <div
                className="flex h-full flex-col gap-[7px] rounded-xl border bg-card p-[12px_14px] hover:border-faint"
                style={{
                  borderColor: dropTargetId === c.id ? "color-mix(in srgb, var(--but) 60%, var(--rule))" : "var(--rule)",
                  boxShadow:
                    dropTargetId === c.id
                      ? "0 0 0 3px color-mix(in srgb, var(--but) 32%, transparent), 0 10px 26px color-mix(in srgb, var(--but) 20%, transparent), var(--shadow)"
                      : dragId === c.id || timelineDragId === c.id
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
                  <span className="font-mono text-[10.5px] font-medium text-soft">
                    {(c.words / 1000).toFixed(1).replace(/\.0$/, "")}k words
                  </span>
                </div>
                <div className="font-serif text-[16px] font-semibold leading-tight text-ink">
                  {titleOf(c)}
                </div>
                <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-soft">
                  {summaryOf(c)}
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  {c.chars.map((id) => {
                    const k = charById(id);
                    if (!k) return null;
                    return (
                      <span
                        key={id}
                        className="-mr-[6px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-card text-[9.5px] font-semibold text-white"
                        style={{ background: k.color }}
                      >
                        {k.initials}
                      </span>
                    );
                  })}
                  <div className="flex-1" />
                  {c.refs.length > 0 && (
                    <span className="flex items-center gap-[5px] font-mono text-[10.5px] font-medium text-faint">
                      <span className="inline-block h-[6px] w-[6px] rotate-45 rounded-[1px] bg-faint" />
                      {c.refs.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
