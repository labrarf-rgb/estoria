import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { sceneGrid, sceneMetrics, type SceneBox, type SceneFill } from "@/lib/layout";
import { SCENE_TEXT_MAX, isOverCap, sceneSpan } from "@/lib/sceneFit";
import { displaySummary } from "@/lib/drafts";
import { roman } from "@/lib/markdown";
import { chipRestLabel, chipSplit } from "@/lib/chips";
import { countWords, wordsMeta } from "@/lib/manuscript";
import { ARCHIVED_DIM, archivedTitle } from "@/components/ui/ArchiveShelf";
import { ProseChapter } from "@/components/ProsePane";
import type { Chapter, ConnType, Vec2 } from "@/types";

const CONN: Record<ConnType, { label: string; color: string }> = {
  therefore: { label: "Therefore", color: "var(--therefore)" },
  but: { label: "But", color: "var(--but)" },
  and: { label: "And", color: "var(--and)" },
};

const statusColor = (s: Chapter["status"]) =>
  s === "done" ? "var(--therefore)" : s === "draft" ? "var(--but)" : "var(--faint)";

/** Padding subtracted from the pane before the scene grid is fitted into it. */
const PANE_PAD_X = 44;
const PANE_PAD_Y = 62;

/**
 * Cubic connector between two scene nodes, matching the board's curved chapter
 * links rather than the chapter modal's straight rules. Leaves along the axis
 * the grid advances on, so a row-filled grid curves out of a node's right edge
 * and a column-filled one out of its bottom.
 *
 * A **wrap** — the last node of a row to the first of the next — is routed
 * differently. Carrying the in-line shape across a wrap puts the control points
 * a whole row's width beyond the canvas, where the border clips them, which is
 * what cut the line off at the leftmost and rightmost cards. A wrap instead
 * turns the corner and runs back through the empty gutter between the rows, so
 * the whole curve stays inside the canvas.
 */
function sceneConnector(a: SceneBox, b: SceneBox, fill: SceneFill) {
  const cubic = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2) => ({
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    c: [p0, p1, p2, p3],
  });
  /** Down the gutter: out of a's bottom edge, into b's top edge. */
  const vertical = (min: number) => {
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    const d = Math.max(min, (y2 - y1) * 0.55);
    return cubic({ x: x1, y: y1 }, { x: x1, y: y1 + d }, { x: x2, y: y2 - d }, { x: x2, y: y2 });
  };
  /** Across the gutter: out of a's right edge, into b's left edge. */
  const horizontal = (min: number) => {
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const d = Math.max(min, (x2 - x1) * 0.5);
    return cubic({ x: x1, y: y1 }, { x: x1 + d, y: y1 }, { x: x2 - d, y: y2 }, { x: x2, y: y2 });
  };

  if (fill === "row") {
    const wrapped = b.y !== a.y;
    return wrapped ? vertical(20) : horizontal(28);
  }
  const wrapped = b.x !== a.x;
  return wrapped ? horizontal(20) : vertical(24);
}

/** Point at t=0.5 on a cubic — where the connector's pill sits. */
const curveMid = (c: Vec2[]) => ({
  x: (c[0].x + 3 * c[1].x + 3 * c[2].x + c[3].x) / 8,
  y: (c[0].y + 3 * c[1].y + 3 * c[2].y + c[3].y) / 8,
});

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The rail's chapter-to-chapter link, in the colour of its type — the curve the
 * timeline already draws between chapter cards.
 *
 * The board's version leaves one card's right edge and enters the next card's
 * left edge, which needs roughly twice the card's width in horizontal room. A
 * fixed-width rail doesn't have that, so the stacked (vertical) rail keeps the
 * same cubic and colours but routes the sweep down the column — out of the
 * bottom edge, into the top edge — instead of looping out to the sides. The
 * horizontal rail has the room, so it keeps the board's exact edge-to-edge
 * shape.
 */
function railConnector(a: Box, b: Box, vertical: boolean): string {
  if (vertical) {
    const x1 = a.x + a.w * 0.72;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w * 0.28;
    const y2 = b.y;
    const d = Math.max(18, (y2 - y1) * 0.62);
    return `M ${x1} ${y1} C ${x1} ${y1 + d}, ${x2} ${y2 - d}, ${x2} ${y2}`;
  }
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const d = Math.max(30, (x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + d} ${y1}, ${x2 - d} ${y2}, ${x2} ${y2}`;
}

/**
 * Timeline: a chapter rail beside (vertical) or above (horizontal) a pane that
 * shows each chapter's scene flow, so the story can be read start to finish
 * without opening a chapter. Unlike the board this is a plain scrolling
 * document — no camera, no drag — because reading a book by scroll-panning a
 * zoomed canvas is the thing this view exists to stop doing.
 */
export function Timeline() {
  const doc = useStore((s) => s.doc);
  const orient = useStore((s) => s.timelineOrient);
  const paneMode = useStore((s) => s.timelinePane);
  const openChapter = useStore((s) => s.openChapter);
  const setChapterMode = useStore((s) => s.setChapterMode);
  const openChapterAtScene = useStore((s) => s.openChapterAtScene);

  const vertical = orient === "vertical";
  const prose = paneMode === "prose";
  const fill: SceneFill = vertical ? "row" : "column";
  /**
   * Prose is a column of text, so a horizontal pane gives each chapter a
   * fixed-width column that scrolls its own prose vertically while the pane
   * still scrolls chapter-to-chapter along its axis. The rail, the ring and the
   * sync are untouched either way — only what sits in the pane changes.
   */
  const PROSE_COL = 560;

  const paneRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const railInnerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  // A click-to-jump animates the pane, which would otherwise drive the scroll
  // handler through every chapter it passes; ignore sync until it settles.
  const suppressUntil = useRef(0);

  const [pane, setPane] = useState({ w: 0, h: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  // Card boxes for the rail's link curves. The rail is a flow layout (act bands
  // wrapping cards), so the only way to know where a card landed is to measure
  // it after render, relative to the rail's own content box.
  const [cardBoxes, setCardBoxes] = useState<Record<string, Box>>({});
  const [railInner, setRailInner] = useState({ w: 0, h: 0 });

  // Grids are fitted to the pane, so the pane has to be measured before they
  // can be laid out — and re-measured whenever it resizes.
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const report = () => setPane({ w: el.clientWidth, h: el.clientHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Both rects shift together with the rail's scroll, so their difference is a
  // stable content-space position and needs no scroll correction.
  useLayoutEffect(() => {
    const inner = railInnerRef.current;
    if (!inner) return;
    const measure = () => {
      const ir = inner.getBoundingClientRect();
      const next: Record<string, Box> = {};
      for (const c of doc.chapters) {
        const el = cardRefs.current.get(c.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next[c.id] = { x: r.left - ir.left, y: r.top - ir.top, w: r.width, h: r.height };
      }
      setCardBoxes(next);
      setRailInner({ w: inner.scrollWidth, h: inner.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [doc.chapters, orient]);

  // Trailing room past the last chapter — see the spacer in the pane below.
  const [tailSpace, setTailSpace] = useState(0);
  useLayoutEffect(() => {
    const el = paneRef.current;
    const lastId = doc.chapters[doc.chapters.length - 1]?.id;
    const g = lastId ? groupRefs.current.get(lastId) : null;
    if (!el || !g) return setTailSpace(0);
    const measure = () => {
      const filled = vertical ? g.offsetHeight : g.offsetWidth;
      const paneSize = vertical ? el.clientHeight : el.clientWidth;
      // The allowance is the "End of book" line's own space, so it does not
      // push the last chapter back off the top again.
      setTailSpace(Math.max(0, paneSize - filled - (vertical ? 96 : 150)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(g);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.chapters, vertical, prose, pane.w, pane.h]);

  /**
   * Distance from the pane's scroll origin to a group. Measured off the
   * scroller's own box rather than `offsetTop`/`offsetLeft`: neither the pane
   * nor its inner wrapper is positioned, so those resolve against <body> and
   * don't share an origin with `scrollTop`/`scrollLeft`.
   */
  const groupStart = useCallback(
    (g: HTMLElement) => {
      const el = paneRef.current;
      if (!el) return 0;
      const gr = g.getBoundingClientRect();
      const sr = el.getBoundingClientRect();
      return vertical ? gr.top - sr.top + el.scrollTop : gr.left - sr.left + el.scrollLeft;
    },
    [vertical]
  );

  const jumpTo = (id: string) => {
    const el = paneRef.current;
    const g = groupRefs.current.get(id);
    if (!el || !g) return;
    suppressUntil.current = Date.now() + 800;
    setActiveId(id);
    const start = groupStart(g);
    if (vertical) el.scrollTo({ top: start - 2, behavior: "smooth" });
    else el.scrollTo({ left: start - 22, behavior: "smooth" });
  };

  // Scrolling the pane moves the rail's highlight, and pulls the rail along so
  // the chapter you're reading stays on screen.
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const onScroll = () => {
      if (Date.now() < suppressUntil.current) return;
      const edge = (vertical ? el.scrollTop : el.scrollLeft) + 30;
      let cur: string | null = null;
      for (const c of doc.chapters) {
        const g = groupRefs.current.get(c.id);
        if (g && groupStart(g) <= edge) cur = c.id;
      }
      if (cur) setActiveId(cur);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [doc.chapters, vertical, groupStart]);

  useEffect(() => {
    const rail = railRef.current;
    const card = activeId ? cardRefs.current.get(activeId) : null;
    if (!rail || !card) return;
    const cr = card.getBoundingClientRect();
    const rr = rail.getBoundingClientRect();
    const out = vertical
      ? cr.top < rr.top + 8 || cr.bottom > rr.bottom - 8
      : cr.left < rr.left + 8 || cr.right > rr.right - 8;
    if (out) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId, vertical]);

  // Switching orientation swaps both scroll axes; start from the top again
  // rather than carrying a meaningless offset across.
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0, left: 0 });
    railRef.current?.scrollTo({ top: 0, left: 0 });
    setActiveId(doc.chapters[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orient, doc.activeBookId, doc.activeDraftId]);

  const charById = (id: string) => doc.characters.find((c) => c.id === id);
  const castOf = (c: Chapter) => c.chars.flatMap((id) => charById(id) ?? []);

  // Act runs, for the dashed bands in the rail.
  const bands: { act: number; items: Chapter[] }[] = [];
  doc.chapters.forEach((c) => {
    const last = bands[bands.length - 1];
    if (last && last.act === c.act) last.items.push(c);
    else bands.push({ act: c.act, items: [c] });
  });

  const availW = Math.max(0, pane.w - PANE_PAD_X);
  const availH = Math.max(0, pane.h - PANE_PAD_Y);

  // Cards keep a fixed height and widen instead, so a long scene is never cut
  // off. Measuring is memoized per pane size (see `sceneFit.ts`), so this costs
  // a handful of probes per resize rather than one per scene.
  const grids = useMemo(() => {
    const out = new Map<string, ReturnType<typeof sceneGrid>>();
    for (const c of doc.chapters) {
      const m = sceneMetrics(c.scenes.length, availW, availH, fill);
      const spans =
        m.fill === "row"
          ? c.scenes.map((t) => sceneSpan(t, m.nodeW, m.gapX, m.tracks, m.nodeH))
          : c.scenes.map(() => 1);
      out.set(c.id, sceneGrid(m, spans));
    }
    return out;
  }, [doc.chapters, availW, availH, fill]);

  return (
    <div className={`flex min-h-0 flex-1 ${vertical ? "flex-row" : "flex-col"}`}>
      {/* ---- chapter rail ---- */}
      <div
        ref={railRef}
        className={
          vertical
            ? "w-[334px] flex-none overflow-y-auto overflow-x-hidden border-r border-rule px-[14px] pb-[70px] pt-[18px]"
            : "w-full flex-none overflow-x-auto overflow-y-hidden border-b border-rule px-[20px] pb-[18px] pt-[16px]"
        }
      >
        <div
          ref={railInnerRef}
          className={`relative flex gap-[20px] ${vertical ? "flex-col" : "flex-row items-stretch"}`}
        >
          {/* Chapter links, over the act bands but under the cards. */}
          <svg
            width={railInner.w}
            height={railInner.h}
            className="pointer-events-none absolute left-0 top-0 z-[10] overflow-visible"
          >
            {doc.links.map((l, i) => {
              const a = cardBoxes[l.fromId];
              const b = cardBoxes[l.toId];
              if (!a || !b) return null;
              return (
                <path
                  key={i}
                  d={railConnector(a, b, vertical)}
                  fill="none"
                  stroke={CONN[l.type].color}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          {bands.map((b, i) => (
            <div
              key={`act-${i}`}
              // Card gaps are generous because the link curves are drawn in
              // them — tighten these and the connectors have nowhere to run.
              className={`relative rounded-2xl bg-panel ${
                vertical ? "flex flex-col gap-[52px] p-[28px_13px_16px]" : "flex flex-none gap-[52px] p-[26px_13px_13px]"
              }`}
              style={{ border: "1.5px dashed var(--line)" }}
            >
              <div className="pointer-events-none absolute left-[13px] top-[8px] text-[10.5px] font-semibold uppercase tracking-[.08em] text-faint">
                Act {roman(b.act)}
              </div>
              {b.items.map((c) => (
                <div
                  key={c.id}
                  ref={(n) => {
                    if (n) cardRefs.current.set(c.id, n);
                    else cardRefs.current.delete(c.id);
                  }}
                  onClick={() => jumpTo(c.id)}
                  title={`Jump to chapter ${c.num}`}
                  className={`relative z-[20] flex cursor-pointer flex-col gap-[5px] rounded-xl border bg-card p-[10px_12px] hover:border-faint ${
                    vertical ? "" : "w-[234px] flex-none"
                  }`}
                  style={
                    activeId === c.id
                      ? {
                          borderColor: "var(--therefore)",
                          boxShadow:
                            "0 0 0 2px color-mix(in srgb, var(--therefore) 32%, transparent), var(--shadow)",
                        }
                      : { borderColor: "var(--rule)", boxShadow: "var(--shadow)" }
                  }
                >
                  <div className="flex items-center gap-[7px]">
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
                                className={`-mr-[6px] flex h-[21px] w-[21px] items-center justify-center rounded-full border-[1.5px] border-card text-[9px] font-semibold text-white ${k.archived ? ARCHIVED_DIM : ""}`}
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
                                className="-mr-[6px] flex h-[21px] min-w-[21px] items-center justify-center rounded-full border-[1.5px] border-card bg-soft px-[4px] text-[9px] font-semibold text-bg"
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
                    className={`font-serif text-[15px] font-semibold leading-tight ${
                      c.title ? "text-ink" : "text-faint"
                    }`}
                  >
                    {c.title || "Untitled chapter"}
                  </div>
                  <div className="line-clamp-2 text-[12px] leading-[1.45] text-soft">
                    {displaySummary(c)}
                  </div>
                  <div className="flex items-center justify-end gap-[6px] font-mono text-[10.5px] font-medium text-soft">
                    <span>
                      {c.scenes.length} {c.scenes.length === 1 ? "scene" : "scenes"}
                    </span>
                    <span className="text-faint">·</span>
                    <span>{wordsMeta(c.words, c.target)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---- scene pane ---- */}
      <div
        ref={paneRef}
        // Printing the prose view is the PDF export: a print stylesheet costs
        // nothing to maintain and Cmd+P already exists, where a PDF writer would
        // be a second renderer to keep in step with this one.
        {...(prose ? { "data-print-root": true } : {})}
        className={`min-h-0 min-w-0 flex-1 ${
          vertical ? "overflow-y-auto overflow-x-hidden" : "overflow-x-auto overflow-y-hidden"
        }`}
      >
        <div className={vertical ? "px-[22px] pb-[80px]" : "flex h-full items-stretch pr-[22px]"}>
          {doc.chapters.map((c) => {
            const g = grids.get(c.id)!;
            return (
              <div
                key={c.id}
                ref={(n) => {
                  if (n) groupRefs.current.set(c.id, n);
                  else groupRefs.current.delete(c.id);
                }}
                className={vertical ? "" : "flex h-full flex-none flex-col pl-[22px]"}
              >
                <div
                  className={`sticky z-[6] flex items-center gap-[9px] bg-bg ${
                    vertical ? "top-0 p-[15px_2px_9px]" : "left-0 w-max self-start p-[13px_12px_9px_0]"
                  }`}
                >
                  <span className="rounded bg-ink px-[6px] py-[1px] font-mono text-[10px] font-semibold text-bg">
                    {String(c.num).padStart(2, "0")}
                  </span>
                  <span className="truncate font-serif text-[15.5px] font-semibold">
                    {c.title || "Untitled chapter"}
                  </span>
                  <span className="flex-none text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
                    Act {roman(c.act)}
                  </span>
                  <span className="flex-none font-mono text-[10.5px] font-medium text-faint">
                    {prose
                      ? `${countWords(c.manuscript ?? "").toLocaleString()} words`
                      : `${c.scenes.length} ${c.scenes.length === 1 ? "scene" : "scenes"}`}
                  </span>
                </div>

                {prose ? (
                  <div
                    className={
                      vertical
                        ? "pb-[26px] pr-[clamp(8px,3%,48px)] pt-[4px]"
                        : "mb-[18px] min-h-0 flex-1 overflow-y-auto pr-[10px] pt-[4px]"
                    }
                    style={vertical ? undefined : { width: PROSE_COL }}
                  >
                    {/* Vertical fills the pane: the rail already takes the left
                        of the window, so capping the prose at a 660px column on
                        top of that left most of the screen empty. Horizontal
                        keeps its fixed column, because there the pane scrolls
                        sideways and every chapter needs the same width. */}
                    <ProseChapter
                      ch={c}
                      width={vertical ? undefined : PROSE_COL - 10}
                      maxWidth={vertical ? "none" : 660}
                      // Clicking a scene node opens the chapter on that scene;
                      // clicking the prose should get you to where you write it.
                      onOpen={() => {
                        setChapterMode("manuscript");
                        openChapter(c.id);
                      }}
                    />
                  </div>
                ) : (
                <div
                  className={`relative overflow-hidden rounded-xl border border-rule ${
                    vertical ? "" : "mb-[18px] min-h-0 flex-1"
                  }`}
                  style={{
                    width: g.width,
                    ...(vertical ? { height: g.height } : null),
                    backgroundImage: "radial-gradient(var(--rule) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                >
                  {c.scenes.length === 0 ? (
                    // Only scenes open the modal, so a scene-less chapter needs
                    // the empty canvas itself to be the way in.
                    <button
                      onClick={() => openChapter(c.id)}
                      className="absolute inset-0 flex items-center justify-center text-[12.5px] font-medium text-faint hover:text-soft"
                    >
                      No scenes yet, open the chapter to add one
                    </button>
                  ) : (
                    <>
                      <svg
                        width={g.width}
                        height={vertical ? g.height : "100%"}
                        className="pointer-events-none absolute left-0 top-0 z-[1] overflow-visible"
                      >
                        {c.scenes.slice(0, -1).map((_, i) => (
                          <path
                            key={i}
                            d={sceneConnector(g.nodes[i], g.nodes[i + 1], fill).d}
                            fill="none"
                            stroke="var(--line)"
                            strokeWidth={1.75}
                            strokeLinecap="round"
                          />
                        ))}
                      </svg>

                      {c.scenes.map((text, i) => (
                        <div
                          key={i}
                          onClick={() => openChapterAtScene(c.id, i)}
                          title={`Open chapter ${c.num} at scene ${i + 1}`}
                          className="group absolute z-[5] flex cursor-pointer flex-col gap-[7px] rounded-[11px] border border-rule bg-card p-[12px_13px] shadow-[var(--shadow)] hover:border-[var(--therefore)]"
                          style={{
                            left: g.nodes[i].x,
                            top: g.nodes[i].y,
                            width: g.nodes[i].w,
                            height: g.nodes[i].h,
                          }}
                        >
                          {/* The count rides the label line, so it takes no room
                              of its own, and shows only when a scene predates
                              the cap and therefore may still not fit. */}
                          <span className="flex items-center gap-[6px] font-mono text-[10px] font-semibold tracking-wide text-faint">
                            SCENE {i + 1}
                            {isOverCap(text) && (
                              <>
                                <span className="flex-1" />
                                <span
                                  className="text-but"
                                  title={`This scene is ${text.trim().length} characters, past the ${SCENE_TEXT_MAX} a card can show. Shorten it in the chapter to see all of it.`}
                                >
                                  {text.trim().length} / {SCENE_TEXT_MAX}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="overflow-hidden text-[13px] leading-[1.5] text-ink">
                            {text || <span className="text-faint">New scene</span>}
                          </span>
                        </div>
                      ))}

                      {c.scenes.slice(0, -1).map((_, i) => {
                        const type = c.sceneLinks[i] ?? "therefore";
                        const m = curveMid(sceneConnector(g.nodes[i], g.nodes[i + 1], fill).c);
                        return (
                          <span
                            key={i}
                            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-bg px-[10px] py-[2px] text-[10px] font-semibold uppercase tracking-wide"
                            style={{ left: m.x, top: m.y, color: CONN[type].color, borderColor: CONN[type].color }}
                          >
                            {CONN[type].label}
                          </span>
                        );
                      })}
                    </>
                  )}
                </div>
                )}
              </div>
            );
          })}
          <div
            className={`text-[11px] font-medium uppercase tracking-[.08em] text-faint ${
              vertical ? "pt-[34px] text-center" : "flex-none self-center whitespace-nowrap px-[34px]"
            }`}
          >
            End of book
          </div>
          {/* Room past the last chapter, so *every* chapter can reach the
              leading edge when jumped to.

              Without it the pane bottoms out before the chapter you clicked
              gets to the top, the scroll handler reads the position it actually
              reached, and the ring stays on the chapter before it — clicking
              the last card visibly selected the second to last. Measured rather
              than guessed, because how much room is needed is exactly "the pane,
              less whatever the last chapter already fills", and that varies with
              the pane size, the mode, and how many scenes the chapter has. A
              chapter already taller than the pane needs none. */}
          <div
            aria-hidden
            // Screen-only. On paper it has nothing to scroll against, and
            // leaving it in feeds its own measurement: print makes the pane
            // `height: auto`, so a spacer sized from the pane's height grows the
            // pane, which grows the spacer.
            data-print-skip
            className="flex-none"
            style={vertical ? { height: tailSpace } : { width: tailSpace }}
          />
        </div>
      </div>
    </div>
  );
}
