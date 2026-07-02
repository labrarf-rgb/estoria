import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { readFileAsDataURL } from "@/lib/files";
import { BOOK_W, BOOK_H, timelineBookPositions, fitBooksToContent } from "@/lib/layout";
import type { BookStatus } from "@/types";

const STATUSES: BookStatus[] = ["drafting", "planned", "idea"];
const STATUS_LABEL: Record<BookStatus, string> = {
  drafting: "Drafting",
  planned: "Planned",
  idea: "Idea",
};

/** The series-level story map: each book is a draggable card; books connect with
 *  labeled lines. Double-click a book to drill into its chapter board. */
export function SeriesMap() {
  const doc = useStore((s) => s.doc);
  const enterBook = useStore((s) => s.enterBook);
  const moveBook = useStore((s) => s.moveBook);
  const reorderBook = useStore((s) => s.reorderBook);
  const autoArrangeSeries = useStore((s) => s.autoArrangeSeries);
  const setBoardSize = useStore((s) => s.setBoardSize);
  const seriesArrangeN = useStore((s) => s.seriesArrangeN);
  const updateBook = useStore((s) => s.updateBook);
  const deleteBook = useStore((s) => s.deleteBook);
  const addBookLink = useStore((s) => s.addBookLink);
  const updateBookLink = useStore((s) => s.updateBookLink);
  const deleteBookLink = useStore((s) => s.deleteBookLink);
  const askConfirm = useStore((s) => s.askConfirm);
  const view = useStore((s) => s.view);
  const orient = useStore((s) => s.timelineOrient);
  const openLightbox = useStore((s) => s.openLightbox);

  const [cam, setCam] = useState({ zoom: 0.85, panX: 40, panY: 30 });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  // Tolerate older/partial docs that predate book positions and links.
  const bookLinks = doc.bookLinks ?? [];

  const viewportRef = useRef<HTMLDivElement>(null);
  const camRef = useRef(cam);
  camRef.current = cam;
  const drag = useRef<{ id: string; mx: number; my: number; ox: number; oy: number } | null>(null);
  const pan = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // While dragging a book (map view), the card it's currently over is a
  // reorder target — dropping on it offers a resequence via confirmation.
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  // Position + hit-test are coalesced to one update per animation frame
  // (rather than once per native mousemove) so the dragged card, its
  // connector threads, and the highlight all stay in lockstep during a fast
  // real drag instead of lagging behind the pointer.
  const dragRaf = useRef<number | null>(null);
  const pendingDragPos = useRef<{ x: number; y: number } | null>(null);

  // Timeline-only drag-to-reorder: positions there are purely derived from
  // array order (no stored x/y), so dragging live-splices a preview order and
  // everyone — including the dragged card — reflows to the resulting
  // sequential slots. Map mode keeps free placement; dropping a card onto
  // another there just offers a reorder via confirmation (see onUp).
  const timelineDrag = useRef<{ id: string; fromIdx: number } | null>(null);
  const [timelineDragId, setTimelineDragId] = useState<string | null>(null);
  const [timelineOverIdx, setTimelineOverIdx] = useState<number | null>(null);
  const timelineOverRef = useRef<number | null>(null);

  // In timeline mode books are laid out in reading order; in map mode they use
  // their free canvas positions.
  const timeline = view === "timeline";
  let bookPos: { id: string; x: number; y: number }[];
  if (!timeline) {
    bookPos = doc.books.map((b) => ({ id: b.id, x: b.x ?? 0, y: b.y ?? 0 }));
  } else if (timelineDragId && timelineOverIdx !== null) {
    const dragged = doc.books.find((b) => b.id === timelineDragId);
    const others = doc.books.filter((b) => b.id !== timelineDragId);
    const preview = others.slice();
    if (dragged) preview.splice(Math.max(0, Math.min(timelineOverIdx, others.length)), 0, dragged);
    bookPos = timelineBookPositions(dragged ? preview : doc.books, orient);
  } else {
    bookPos = timelineBookPositions(doc.books, orient);
  }
  const posById: Record<string, { x: number; y: number }> = {};
  bookPos.forEach((p) => (posById[p.id] = { x: p.x, y: p.y }));

  const uploadCover = async (id: string, file: File | undefined) => {
    if (!file) return;
    updateBook(id, { coverSrc: await readFileAsDataURL(file) });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current) {
        const z = camRef.current.zoom;
        const nx = Math.max(0, drag.current.ox + (e.clientX - drag.current.mx) / z);
        const ny = Math.max(0, drag.current.oy + (e.clientY - drag.current.my) / z);
        pendingDragPos.current = { x: nx, y: ny };
        if (dragRaf.current == null) {
          dragRaf.current = requestAnimationFrame(() => {
            dragRaf.current = null;
            if (!drag.current || !pendingDragPos.current) return;
            const { x, y } = pendingDragPos.current;
            moveBook(drag.current.id, x, y);
            const cx = x + BOOK_W / 2;
            const cy = y + BOOK_H / 2;
            const hit = useStore
              .getState()
              .doc.books.find(
                (b) => b.id !== drag.current!.id && cx >= b.x && cx <= b.x + BOOK_W && cy >= b.y && cy <= b.y + BOOK_H
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
        const c = camRef.current;
        const wx = (e.clientX - rect.left - c.panX) / c.zoom;
        const wy = (e.clientY - rect.top - c.panY) / c.zoom;
        const primary = orient === "vertical" ? wy : wx;
        const books = useStore.getState().doc.books;
        const others = books.filter((b) => b.id !== timelineDrag.current!.id);
        const otherPos = timelineBookPositions(others, orient);
        const rank = otherPos.filter((p) => (orient === "vertical" ? p.y : p.x) < primary).length;
        if (timelineOverRef.current !== rank) {
          timelineOverRef.current = rank;
          setTimelineOverIdx(rank);
        }
      } else if (pan.current) {
        setCam((c) => ({
          ...c,
          panX: pan.current!.px + (e.clientX - pan.current!.mx),
          panY: pan.current!.py + (e.clientY - pan.current!.my),
        }));
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
          moveBook(drag.current.id, pendingDragPos.current.x, pendingDragPos.current.y);
          pendingDragPos.current = null;
        }
        const draggedId = drag.current.id;
        const targetId = dropTargetRef.current;
        drag.current = null;
        if (targetId) {
          const books = useStore.getState().doc.books;
          const dragged = books.find((b) => b.id === draggedId);
          const target = books.find((b) => b.id === targetId);
          if (dragged && target) {
            const after = dragged.x > target.x;
            askConfirm({
              message: "Reorder books?",
              detail: `"${dragged.title}" will move ${after ? "after" : "before"} "${target.title}", and the map will re-arrange to match.`,
              confirmLabel: "Reorder",
              onConfirm: () => {
                reorderBook(draggedId, target.id, after);
                autoArrangeSeries();
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
        const books = useStore.getState().doc.books;
        const others = books.filter((b) => b.id !== id);
        const clamped = Math.max(0, Math.min(finalIdx, others.length));
        if (others.length) {
          const targetId = clamped < others.length ? others[clamped].id : others[others.length - 1].id;
          reorderBook(id, targetId, clamped >= others.length);
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
  }, [moveBook, reorderBook, autoArrangeSeries, orient, askConfirm]);

  // Report the series-map viewport size so auto-arrange can size its grid, and
  // re-fit the camera to the books whenever an auto-arrange runs.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const report = () => setBoardSize(vp.clientWidth, vp.clientHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [setBoardSize]);

  const prevSeriesArrange = useRef(seriesArrangeN);
  useEffect(() => {
    if (seriesArrangeN === prevSeriesArrange.current) return;
    prevSeriesArrange.current = seriesArrangeN;
    const vp = viewportRef.current;
    if (vp) setCam(fitBooksToContent(useStore.getState().doc.books, vp.clientWidth, vp.clientHeight));
  }, [seriesArrangeN]);

  // Wheel: zoom on the map, scroll-pan on the timeline (mirrors the book board,
  // so the series timeline scrolls down like the chapter timeline does).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (timeline) {
        if (orient === "vertical") setCam((c) => ({ ...c, panY: c.panY - e.deltaY }));
        else setCam((c) => ({ ...c, panX: c.panX - (e.deltaY + e.deltaX) }));
      } else {
        const f = e.deltaY < 0 ? 1.08 : 0.925;
        setCam((c) => ({ ...c, zoom: Math.min(1.6, Math.max(0.4, c.zoom * f)) }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [timeline, orient]);

  const chapterCount = (bookId: string) =>
    bookId === doc.activeBookId
      ? doc.chapters.length
      : doc.bookData[bookId]?.chapters.length ?? 0;
  const wordCount = (bookId: string) => {
    const chs = bookId === doc.activeBookId ? doc.chapters : doc.bookData[bookId]?.chapters ?? [];
    return chs.reduce((a, c) => a + c.words, 0);
  };
  const center = (bookId: string) => {
    const p = posById[bookId] ?? { x: 0, y: 0 };
    return { x: p.x + BOOK_W / 2, y: p.y + BOOK_H / 2 };
  };

  const onCardDown = (e: React.MouseEvent, id: string, x: number, y: number, idx: number) => {
    const t = e.target as HTMLElement;
    if (t.closest("input") || t.closest("textarea") || t.closest("select") || t.closest("button")) return;
    e.stopPropagation();
    e.preventDefault();
    if (timeline) {
      timelineDrag.current = { id, fromIdx: idx };
      timelineOverRef.current = idx;
      setTimelineDragId(id);
      setTimelineOverIdx(idx);
      return;
    }
    drag.current = { id, mx: e.clientX, my: e.clientY, ox: x, oy: y };
  };

  const onCardClick = (id: string) => {
    if (connectFrom && connectFrom !== id) {
      addBookLink(connectFrom, id);
      setConnectFrom(null);
    }
  };

  return (
    <div
      ref={viewportRef}
      onMouseDown={(e) => {
        // Only the background pans / cancels connect mode. Clicks that land on a
        // book card must not cancel connect (that broke connecting, especially
        // in timeline mode where cards don't stop mousedown propagation).
        if ((e.target as HTMLElement).closest("[data-book-card]")) return;
        pan.current = { mx: e.clientX, my: e.clientY, px: cam.panX, py: cam.panY };
        if (connectFrom) setConnectFrom(null);
      }}
      className="relative flex-1 overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(var(--rule) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      {connectFrom && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-ink px-[14px] py-[6px] text-[12px] font-semibold text-bg">
          Click another book to connect · click empty space to cancel
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${cam.panX}px, ${cam.panY}px) scale(${cam.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Connectors */}
        <svg width={6000} height={4000} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          {bookLinks.map((l) => {
            const a = center(l.fromId);
            const b = center(l.toId);
            return (
              <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--soft)" strokeWidth={2} strokeLinecap="round" />
            );
          })}
        </svg>

        {/* Connector labels (editable, deletable) */}
        {bookLinks.map((l) => {
          const a = center(l.fromId);
          const b = center(l.toId);
          return (
            <div
              key={l.id}
              className="group absolute z-[6] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-rule bg-card px-[8px] py-[2px] shadow-[var(--shadow)]"
              style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                value={l.label ?? ""}
                onChange={(e) => updateBookLink(l.id, e.target.value)}
                placeholder="how they connect"
                className="w-[110px] bg-transparent text-center text-[10.5px] font-medium text-ink outline-none placeholder:text-faint"
              />
              <button
                onClick={() =>
                  askConfirm({
                    message: "Remove this connection?",
                    confirmLabel: "Remove",
                    danger: true,
                    onConfirm: () => deleteBookLink(l.id),
                  })
                }
                className="text-[11px] leading-none text-faint hover:text-but"
                title="Remove connection"
              >
                ✕
              </button>
            </div>
          );
        })}

        {/* Book cards */}
        {doc.books.map((b, i) => {
          const isActive = b.id === doc.activeBookId;
          const isConnectSource = connectFrom === b.id;
          const p = posById[b.id] ?? { x: 0, y: 0 };
          return (
            <div
              key={b.id}
              data-book-card
              onMouseDown={(e) => onCardDown(e, b.id, p.x, p.y, i)}
              onClick={() => onCardClick(b.id)}
              onDoubleClick={() => enterBook(b.id)}
              className={`group absolute cursor-default`}
              style={{
                left: p.x,
                top: p.y,
                width: BOOK_W,
                minHeight: BOOK_H,
                zIndex: dropTargetId === b.id || timelineDragId === b.id ? 20 : 5,
                transition: timeline ? "left 150ms ease-out, top 150ms ease-out" : undefined,
              }}
            >
              <div
                className="flex h-full flex-col gap-[8px] rounded-2xl border bg-card p-[15px]"
                style={{
                  borderColor:
                    isConnectSource
                      ? "var(--but)"
                      : dropTargetId === b.id
                        ? "color-mix(in srgb, var(--but) 60%, var(--rule))"
                        : "var(--rule)",
                  boxShadow:
                    dropTargetId === b.id
                      ? "0 0 0 3px color-mix(in srgb, var(--but) 32%, transparent), 0 10px 26px color-mix(in srgb, var(--but) 20%, transparent), var(--shadow)"
                      : timelineDragId === b.id
                        ? "0 14px 32px rgba(0,0,0,0.26), var(--shadow)"
                        : "var(--shadow)",
                }}
              >
                {/* Header — the grabbable top of the card: drag it to move the
                    book (map) or reorder it (timeline). */}
                <div className="flex cursor-grab items-center gap-[7px] active:cursor-grabbing">
                  <span
                    title="Drag to move"
                    className="-ml-[4px] flex h-[26px] w-[13px] shrink-0 select-none flex-col items-center justify-center gap-[2px] leading-none text-line group-hover:text-faint"
                    aria-hidden
                  >
                    <span className="text-[9px] leading-[5px] tracking-[-1px]">••</span>
                    <span className="text-[9px] leading-[5px] tracking-[-1px]">••</span>
                    <span className="text-[9px] leading-[5px] tracking-[-1px]">••</span>
                  </span>
                  <span className="flex h-[30px] w-[28px] flex-shrink-0 items-center justify-center rounded-md bg-but font-serif text-[15px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <input
                    value={b.title}
                    onChange={(e) => updateBook(b.id, { title: e.target.value })}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent font-serif text-[16px] font-semibold text-ink outline-none"
                  />
                  {isActive && (
                    <span className="rounded-full bg-ink px-[7px] py-[2px] text-[9px] font-semibold uppercase tracking-wide text-bg">
                      Open
                    </span>
                  )}
                </div>

                {/* Cover — shown under the title; add, change, or remove it. */}
                {b.coverSrc ? (
                  <div className="group/cover relative h-[74px] overflow-hidden rounded-lg border border-rule">
                    <button
                      onClick={() => openLightbox(b.coverSrc!)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="block h-full w-full"
                    >
                      <img src={b.coverSrc} alt="" className="h-full w-full object-cover" />
                    </button>
                    <div
                      className="absolute right-[6px] top-[6px] flex gap-[4px] opacity-0 transition-opacity group-hover/cover:opacity-100"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <label className="cursor-pointer rounded-md bg-ink/85 px-[7px] py-[3px] text-[9.5px] font-semibold text-bg hover:bg-ink">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => uploadCover(b.id, e.target.files?.[0])}
                        />
                      </label>
                      <button
                        onClick={() => updateBook(b.id, { coverSrc: undefined })}
                        className="rounded-md bg-ink/85 px-[7px] py-[3px] text-[9.5px] font-semibold text-bg hover:bg-but"
                        title="Remove cover"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    onMouseDown={(e) => e.stopPropagation()}
                    className="flex h-[30px] cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[10.5px] font-medium text-faint hover:border-faint hover:text-ink"
                  >
                    + Add cover
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadCover(b.id, e.target.files?.[0])}
                    />
                  </label>
                )}

                <textarea
                  value={b.premise}
                  onChange={(e) => updateBook(b.id, { premise: e.target.value })}
                  placeholder="Synopsis..."
                  rows={2}
                  className="w-full resize-none bg-transparent text-[12px] leading-[1.45] text-soft outline-none placeholder:text-faint"
                  onMouseDown={(e) => e.stopPropagation()}
                />

                <div className="mt-auto flex items-center gap-[8px]">
                  <select
                    value={b.status}
                    onChange={(e) => updateBook(b.id, { status: e.target.value as BookStatus })}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="rounded-md border border-rule bg-panel px-[6px] py-[2px] text-[10px] font-medium text-ink outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <span className="font-mono text-[10px] text-faint">
                    {chapterCount(b.id)} ch · {(wordCount(b.id) / 1000).toFixed(1).replace(/\.0$/, "")}k
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => enterBook(b.id)}
                    className="rounded-md bg-ink px-[9px] py-[4px] text-[10.5px] font-semibold text-bg"
                  >
                    Open
                  </button>
                </div>

                {/* Hover controls */}
                <div className="absolute right-[10px] top-[-12px] hidden gap-[6px] group-hover:flex">
                  <button
                    onClick={() => setConnectFrom((c) => (c === b.id ? null : b.id))}
                    className="rounded-md border border-rule bg-panel px-[8px] py-[3px] text-[10px] font-semibold text-ink shadow-[var(--shadow)] hover:border-faint"
                    title="Connect to another book"
                  >
                    Connect
                  </button>
                  {doc.books.length > 1 && !isActive && (
                    <button
                      onClick={() =>
                        askConfirm({
                          message: `Delete "${b.title}"?`,
                          detail: "Its chapters, links and notes will be permanently removed.",
                          danger: true,
                          onConfirm: () => deleteBook(b.id),
                        })
                      }
                      className="rounded-md border border-rule bg-panel px-[8px] py-[3px] text-[10px] font-semibold text-soft shadow-[var(--shadow)] hover:border-faint hover:text-but"
                    >
                      Delete
                    </button>
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
