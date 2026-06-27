import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import type { BookStatus } from "@/types";

const BOOK_W = 290;
const BOOK_H = 188;

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
  const updateBook = useStore((s) => s.updateBook);
  const deleteBook = useStore((s) => s.deleteBook);
  const addBook = useStore((s) => s.addBook);
  const addBookLink = useStore((s) => s.addBookLink);
  const updateBookLink = useStore((s) => s.updateBookLink);
  const deleteBookLink = useStore((s) => s.deleteBookLink);

  const [cam, setCam] = useState({ zoom: 0.85, panX: 40, panY: 30 });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  // Tolerate older/partial docs that predate book positions and links.
  const bookLinks = doc.bookLinks ?? [];

  const viewportRef = useRef<HTMLDivElement>(null);
  const camRef = useRef(cam);
  camRef.current = cam;
  const drag = useRef<{ id: string; mx: number; my: number; ox: number; oy: number } | null>(null);
  const pan = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current) {
        const z = camRef.current.zoom;
        const nx = drag.current.ox + (e.clientX - drag.current.mx) / z;
        const ny = drag.current.oy + (e.clientY - drag.current.my) / z;
        moveBook(drag.current.id, Math.max(0, nx), Math.max(0, ny));
      } else if (pan.current) {
        setCam((c) => ({
          ...c,
          panX: pan.current!.px + (e.clientX - pan.current!.mx),
          panY: pan.current!.py + (e.clientY - pan.current!.my),
        }));
      }
    };
    const onUp = () => {
      drag.current = null;
      pan.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [moveBook]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.08 : 0.925;
      setCam((c) => ({ ...c, zoom: Math.min(1.6, Math.max(0.4, c.zoom * f)) }));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const chapterCount = (bookId: string) =>
    bookId === doc.activeBookId
      ? doc.chapters.length
      : doc.bookData[bookId]?.chapters.length ?? 0;
  const wordCount = (bookId: string) => {
    const chs = bookId === doc.activeBookId ? doc.chapters : doc.bookData[bookId]?.chapters ?? [];
    return chs.reduce((a, c) => a + c.words, 0);
  };
  const center = (bookId: string) => {
    const b = doc.books.find((x) => x.id === bookId);
    return { x: (b?.x ?? 0) + BOOK_W / 2, y: (b?.y ?? 0) + BOOK_H / 2 };
  };

  const onCardDown = (e: React.MouseEvent, id: string, x: number, y: number) => {
    const t = e.target as HTMLElement;
    if (t.closest("input") || t.closest("textarea") || t.closest("select") || t.closest("button")) return;
    e.stopPropagation();
    e.preventDefault();
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
                onClick={() => deleteBookLink(l.id)}
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
          return (
            <div
              key={b.id}
              onMouseDown={(e) => onCardDown(e, b.id, b.x ?? 0, b.y ?? 0)}
              onClick={() => onCardClick(b.id)}
              onDoubleClick={() => enterBook(b.id)}
              className="group absolute cursor-grab active:cursor-grabbing"
              style={{ left: b.x ?? 0, top: b.y ?? 0, width: BOOK_W, minHeight: BOOK_H, zIndex: 5 }}
            >
              <div
                className="flex h-full flex-col gap-[8px] rounded-2xl border bg-card p-[15px] shadow-[var(--shadow)]"
                style={{ borderColor: isConnectSource ? "var(--but)" : "var(--rule)" }}
              >
                <div className="flex items-center gap-[9px]">
                  <span className="flex h-[30px] w-[28px] flex-shrink-0 items-center justify-center rounded-md bg-but font-serif text-[15px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <input
                    value={b.title}
                    onChange={(e) => updateBook(b.id, { title: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent font-serif text-[16px] font-semibold text-ink outline-none"
                  />
                  {isActive && (
                    <span className="rounded-full bg-ink px-[7px] py-[2px] text-[9px] font-semibold uppercase tracking-wide text-bg">
                      Open
                    </span>
                  )}
                </div>

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
                      onClick={() => deleteBook(b.id)}
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

      <button
        onClick={addBook}
        className="absolute bottom-4 left-4 flex items-center gap-2 rounded-[11px] border border-rule bg-panel px-[15px] py-[10px] text-[12.5px] font-semibold text-ink shadow-[var(--shadow)] hover:border-faint"
      >
        <span className="-mt-px text-[17px] font-normal leading-none">+</span> New book
      </button>
    </div>
  );
}
