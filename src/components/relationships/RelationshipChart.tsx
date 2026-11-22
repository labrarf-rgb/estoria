import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Character, Relationship } from "@/types";
import { kindColor, kindName, kindOf, kindsOf, tiesOf, viewOf } from "@/lib/relationships";
import { AddTieButton, Avatar, FieldLabel, KindPill, TextButton, TieRow, firstName } from "@/components/relationships/parts";
import { RelationshipDialog } from "@/components/relationships/RelationshipDialog";
import { KindsDialog } from "@/components/relationships/KindsDialog";

/**
 * The relationship chart: the Characters drawer's second view, at full-screen
 * size. One line per pair, colored by kind and always labeled.
 *
 *  - **Drag characters anywhere.** Positions are saved in the project
 *    (`relationshipLayout`, fractions of the chart) the way chapter cards keep
 *    their place on the board. A press that moves under 4px is a click
 *    (the board's rule). Arrow keys move a focused character.
 *  - **Anyone not yet moved sits on a ring in roster order**, so rearranging
 *    the cards arranges them. "Arrange in a ring" forgets every position.
 *  - **Clicking a character highlights their ties**; clicking a line shows both
 *    points of view. Nothing moves on a click, so an arrangement is kept.
 *  - **Labels never overlap**: each takes the first spot along its line (then
 *    just beside it) that clears every character and every label placed.
 */

// The chart's own units. At the drawer's full width one unit is about a pixel.
const VW = 860;
const VH = 560;
const CX = VW / 2;
const CY = VH / 2 - 14;
const R = 205;
const PAD = 36;
const CLICK_SLOP = 4;
const LABEL_H = 20;

type Pt = [number, number];

let measureCtx: CanvasRenderingContext2D | null = null;
/** Label width in chart units, measured with the label's own font. */
function labelWidth(text: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6.2 + 16;
  measureCtx.font = '600 10.5px "Hanken Grotesk", system-ui, sans-serif';
  return measureCtx.measureText(text).width + 16;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where each visible label goes. Short lines first (they have the least room);
 * each tries spots along its line from the middle out, then beside the line,
 * and takes the first that clears every character and every label already
 * placed. On a crowded chart the spot with the least overlap wins.
 */
function placeLabels(
  edges: Array<{ id: string; p: Pt; q: Pt; w: number }>,
  chars: Array<{ p: Pt; archived: boolean }>
): Map<string, Pt> {
  const blocks: Box[] = chars.flatMap(({ p, archived }) => [
    { x: p[0] - 28, y: p[1] - 28, w: 56, h: 56 },
    { x: p[0] - 34, y: p[1] + 30, w: 68, h: archived ? 32 : 20 },
  ]);
  const placed: Box[] = [];
  const out = new Map<string, Pt>();
  const sorted = [...edges].sort(
    (a, b) => Math.hypot(a.q[0] - a.p[0], a.q[1] - a.p[1]) - Math.hypot(b.q[0] - b.p[0], b.q[1] - b.p[1])
  );
  for (const { id, p, q, w } of sorted) {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cands: Pt[] = [];
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73]) cands.push([p[0] + dx * t, p[1] + dy * t]);
    for (const off of [16, -16, 30, -30])
      for (const t of [0.5, 0.38, 0.62]) cands.push([p[0] + dx * t + nx * off, p[1] + dy * t + ny * off]);
    let best: Pt = cands[0];
    let bestBox: Box | null = null;
    let bestScore = Infinity;
    for (const c of cands) {
      const box = { x: c[0] - w / 2 - 3, y: c[1] - LABEL_H / 2 - 3, w: w + 6, h: LABEL_H + 6 };
      let score = 0;
      for (const b of blocks) score += overlap(box, b) * 3;
      for (const b of placed) score += overlap(box, b) * 2;
      if (box.x < 0 || box.x + box.w > VW || box.y < 0 || box.y + box.h > VH) score += 500;
      if (score < bestScore) {
        bestScore = score;
        best = c;
        bestBox = box;
        if (score === 0) break;
      }
    }
    if (bestBox) placed.push(bestBox);
    out.set(id, best);
  }
  return out;
}

export function RelationshipChart({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const doc = useStore((s) => s.doc);
  const moveOnChart = useStore((s) => s.moveOnChart);
  const arrangeChart = useStore((s) => s.arrangeChart);
  const chartFocus = useStore((s) => s.chartFocus);
  const setChartFocus = useStore((s) => s.setChartFocus);

  const [focus, setFocus] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showArch, setShowArch] = useState(false);
  const [dragPos, setDragPos] = useState<{ id: string; p: Pt } | null>(null);
  const [dialog, setDialog] = useState<{ id?: string; from: string } | null>(null);
  const [editKinds, setEditKinds] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; off: Pt; moved: boolean; last?: Pt } | null>(null);

  // "See on chart" from a character's window: highlight them once, on arrival.
  useEffect(() => {
    if (!chartFocus) return;
    setFocus(chartFocus);
    setSel(null);
    setChartFocus(null);
  }, [chartFocus, setChartFocus]);

  const active = doc.characters.filter((c) => !c.archived);
  const archived = doc.characters.filter((c) => c.archived);
  const shownChars = showArch ? [...active, ...archived] : active;
  const shownIds = new Set(shownChars.map((c) => c.id));
  const byId = (id: string) => doc.characters.find((c) => c.id === id);
  const rels = doc.relationships ?? [];
  const kindKey = (k: string | undefined) => (kindOf(doc, k) ? (k as string) : "_none");
  const shownRels = rels.filter((r) => !hidden.has(kindKey(r.kind)) && shownIds.has(r.a) && shownIds.has(r.b));

  // Positions: a drag in progress, else where it was dropped, else the ring
  // (roster order, clockwise from the top), else apart for archived characters.
  const pos = (() => {
    const out = new Map<string, Pt>();
    active.forEach((c, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, active.length);
      out.set(c.id, active.length === 1 ? [CX, CY] : [CX + R * Math.cos(ang), CY + R * Math.sin(ang)]);
    });
    archived.forEach((c, i) => out.set(c.id, [VW - 60 - i * 84, VH - 72]));
    for (const [id, p] of Object.entries(doc.relationshipLayout ?? {})) {
      if (out.has(id)) out.set(id, [p.x * VW, p.y * VH]);
    }
    if (dragPos) out.set(dragPos.id, dragPos.p);
    return out;
  })();

  // Which labels show: all of them, or only the focused character's, or only the selected line's.
  const labelOn = (r: Relationship) =>
    sel ? r.id === sel : focus ? r.a === focus || r.b === focus : true;
  const labelText = (r: Relationship) => r.label || kindName(doc, r.kind);
  const labelPos = placeLabels(
    shownRels.filter(labelOn).map((r) => ({ id: r.id, p: pos.get(r.a)!, q: pos.get(r.b)!, w: labelWidth(labelText(r)) })),
    shownChars.map((c) => ({ p: pos.get(c.id)!, archived: !!c.archived }))
  );

  // ---- Dragging ---------------------------------------------------------------------
  const svgPoint = (e: React.PointerEvent): Pt => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const clamp = (p: Pt): Pt => [
    Math.max(PAD, Math.min(VW - PAD, p[0])),
    Math.max(PAD, Math.min(VH - PAD - 18, p[1])),
  ];
  const onNodeDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = svgPoint(e);
    const p = pos.get(id)!;
    drag.current = { id, sx: e.clientX, sy: e.clientY, off: [p[0] - x, p[1] - y], moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < CLICK_SLOP) return;
    d.moved = true;
    const [x, y] = svgPoint(e);
    d.last = clamp([x + d.off[0], y + d.off[1]]);
    setDragPos({ id: d.id, p: d.last });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (d.moved && d.last) {
      moveOnChart(d.id, { x: d.last[0] / VW, y: d.last[1] / VH });
    } else if (!d.moved) {
      setSel(null);
      setFocus((f) => (f === d.id ? null : d.id));
    }
    setDragPos(null);
  };
  const nudge = (id: string, dx: number, dy: number) => {
    const p = clamp([pos.get(id)![0] + dx, pos.get(id)![1] + dy]);
    moveOnChart(id, { x: p[0] / VW, y: p[1] / VH });
  };

  // ---- Empty roster -----------------------------------------------------------------
  if (active.length === 0 && archived.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-[20px] py-[32px]">
        <div className="flex max-w-[340px] flex-col items-start gap-[10px]">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-therefore">No characters yet</div>
          <div className="font-serif text-[20px] text-ink">Add characters on the roster first.</div>
          <p className="text-[13px] leading-[1.55] text-soft">
            Once you have a few, open one and use Add relationship. Each relationship shows up here as a line
            between two people.
          </p>
        </div>
      </div>
    );
  }

  const isDim = (c: Character) => {
    if (sel) {
      const r = rels.find((x) => x.id === sel);
      return !!r && c.id !== r.a && c.id !== r.b;
    }
    if (focus && c.id !== focus) {
      return !shownRels.some((r) => (r.a === focus && r.b === c.id) || (r.b === focus && r.a === c.id));
    }
    return false;
  };
  const lineOpacity = (r: Relationship) => {
    let o = sel ? (r.id === sel ? 1 : 0.15) : focus ? (r.a === focus || r.b === focus ? 1 : 0.12) : 1;
    if (byId(r.a)?.archived || byId(r.b)?.archived) o = Math.min(o, 0.55);
    return o;
  };

  const kinds = kindsOf(doc);
  const anyNoKind = rels.some((r) => !kindOf(doc, r.kind));
  const toggleKind = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const liveCount = rels.filter((r) => !byId(r.a)?.archived && !byId(r.b)?.archived).length;
  const moved = Object.keys(doc.relationshipLayout ?? {}).length > 0;

  return (
    <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
      <div
        className="relative min-w-0 border-b border-rule md:border-b-0 md:border-r"
        style={{
          backgroundColor: "var(--bg)",
          backgroundImage: "radial-gradient(var(--dot) 1.2px, transparent 1.2px)",
          backgroundSize: "22px 22px",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          role="img"
          aria-label="Relationship chart"
          className="block h-auto max-h-[calc(100vh-150px)] w-full select-none"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* The background: a click here clears the selection. */}
          <rect
            x={0}
            y={0}
            width={VW}
            height={VH}
            fill="transparent"
            onClick={() => {
              setFocus(null);
              setSel(null);
            }}
          />

          {shownRels.map((r) => {
            const p = pos.get(r.a)!;
            const q = pos.get(r.b)!;
            const color = kindColor(doc, r.kind);
            const arch = byId(r.a)?.archived || byId(r.b)?.archived;
            const on = labelOn(r);
            return (
              <g
                key={r.id}
                tabIndex={on ? 0 : -1}
                role="button"
                aria-label={`${byId(r.a)?.name} and ${byId(r.b)?.name}: ${labelText(r)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSel((s) => (s === r.id ? null : r.id));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSel((s) => (s === r.id ? null : r.id));
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>line:first-child]:[stroke-width:3.6]"
                style={{ pointerEvents: on ? undefined : "none" }}
              >
                <line
                  x1={p[0]}
                  y1={p[1]}
                  x2={q[0]}
                  y2={q[1]}
                  style={{
                    stroke: color,
                    strokeWidth: sel === r.id ? 3.6 : 2.2,
                    opacity: lineOpacity(r),
                    strokeDasharray: arch ? "5 5" : undefined,
                  }}
                />
                <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="transparent" strokeWidth={16} />
              </g>
            );
          })}

          {shownChars.map((c) => {
            const p = pos.get(c.id)!;
            return (
              <g
                key={c.id}
                transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}
                tabIndex={0}
                role="button"
                aria-label={`${c.name || "Unnamed character"}. Drag to move, or use the arrow keys.`}
                onPointerDown={(e) => onNodeDown(e, c.id)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSel(null);
                    setFocus((f) => (f === c.id ? null : c.id));
                    return;
                  }
                  const d = ({ ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] } as Record<string, Pt>)[e.key];
                  if (d) {
                    e.preventDefault();
                    nudge(c.id, d[0], d[1]);
                  }
                }}
                className={`outline-none [&:focus-visible>.ring]:opacity-60 ${dragPos?.id === c.id ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ opacity: isDim(c) ? 0.3 : 1, touchAction: "none" }}
              >
                <circle
                  className="ring"
                  r={28}
                  style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 2, opacity: focus === c.id ? 1 : 0 }}
                />
                <circle
                  r={23}
                  style={{
                    fill: c.color,
                    opacity: c.archived ? 0.45 : 1,
                    filter: dragPos?.id === c.id ? "drop-shadow(0 4px 8px rgba(40,28,10,.35))" : undefined,
                  }}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: "#fff", fontSize: 12, fontWeight: 600, pointerEvents: "none" }}
                >
                  {c.initials || "?"}
                </text>
                <text
                  y={43}
                  textAnchor="middle"
                  className="font-serif"
                  style={{ fill: c.archived ? "var(--faint)" : "var(--ink)", fontSize: 13.5, fontWeight: 600 }}
                >
                  {firstName(c)}
                </text>
                {c.archived && (
                  <text
                    y={57}
                    textAnchor="middle"
                    style={{ fill: "var(--faint)", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em" }}
                  >
                    ARCHIVED
                  </text>
                )}
              </g>
            );
          })}

          {/* Labels draw above the characters, so one can never hide under a character. */}
          {shownRels.filter(labelOn).map((r) => {
            const at = labelPos.get(r.id);
            if (!at) return null;
            const w = labelWidth(labelText(r));
            const color = kindColor(doc, r.kind);
            return (
              <g
                key={r.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSel((s) => (s === r.id ? null : r.id));
                }}
              >
                <rect
                  x={at[0] - w / 2}
                  y={at[1] - LABEL_H / 2}
                  width={w}
                  height={LABEL_H}
                  rx={7}
                  style={{ fill: "var(--card)", stroke: sel === r.id ? color : "var(--rule)", strokeWidth: 1 }}
                />
                <text
                  x={at[0]}
                  y={at[1] + 0.5}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: color, fontSize: 10.5, fontWeight: 600 }}
                >
                  {labelText(r)}
                </text>
              </g>
            );
          })}
        </svg>

        {moved && (
          <button
            onClick={arrangeChart}
            title="Put everyone back on the ring, in roster order"
            className="absolute right-[12px] top-[12px] rounded-lg border border-rule bg-card px-[10px] py-[6px] text-[11.5px] font-medium text-ink hover:border-faint"
          >
            Arrange in a ring
          </button>
        )}
        <div className="pointer-events-none absolute bottom-[12px] left-[14px] text-[11.5px] text-faint">
          Drag characters to arrange them. Click one to see their ties, or a line to read it.
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-[16px] bg-panel p-[18px]" aria-live="polite">
        <SidePanel
          sel={sel ? rels.find((r) => r.id === sel) ?? null : null}
          focus={focus ? byId(focus) ?? null : null}
          liveCount={liveCount}
          activeCount={active.length}
          showArch={showArch}
          onEdit={(id, from) => setDialog({ id, from })}
          onAdd={(from) => setDialog({ from })}
          onOpenCard={onOpenCard}
          onClear={() => {
            setFocus(null);
            setSel(null);
          }}
        />
        <div className="h-px bg-rule" />
        <div>
          <FieldLabel right={<TextButton onClick={() => setEditKinds(true)}>Edit kinds</TextButton>}>Kinds</FieldLabel>
          <div className="flex flex-wrap gap-[6px]">
            {kinds.map((k) => (
              <LegendChip
                key={k.id}
                on={!hidden.has(k.id)}
                color={kindColor(doc, k.id)}
                onClick={() => toggleKind(k.id)}
              >
                {k.name.trim() || "Unnamed kind"}
              </LegendChip>
            ))}
            {anyNoKind && (
              <LegendChip on={!hidden.has("_none")} color="var(--faint)" onClick={() => toggleKind("_none")}>
                No kind
              </LegendChip>
            )}
          </div>
        </div>
        {archived.length > 0 && (
          <label className="flex items-center gap-[8px] text-[12px] text-soft">
            <input
              type="checkbox"
              checked={showArch}
              onChange={(e) => setShowArch(e.target.checked)}
              className="accent-[var(--therefore)]"
            />
            Show archived characters ({archived.length})
          </label>
        )}
      </aside>

      {dialog && <RelationshipDialog id={dialog.id} from={dialog.from} onClose={() => setDialog(null)} />}
      {editKinds && <KindsDialog onClose={() => setEditKinds(false)} />}
    </div>
  );
}

function LegendChip({
  on,
  color,
  onClick,
  children,
}: {
  on: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={on ? "Hide this kind" : "Show this kind"}
      className={`inline-flex items-center gap-[6px] rounded-[7px] border border-rule bg-card px-[8px] py-[4px] text-[11.5px] font-medium text-ink ${
        on ? "" : "opacity-45"
      }`}
    >
      <span className="h-[2.5px] w-[14px] rounded-sm" style={{ background: on ? color : "var(--faint)" }} />
      {children}
    </button>
  );
}

function SidePanel({
  sel,
  focus,
  liveCount,
  activeCount,
  showArch,
  onEdit,
  onAdd,
  onOpenCard,
  onClear,
}: {
  sel: Relationship | null;
  focus: Character | null;
  liveCount: number;
  activeCount: number;
  showArch: boolean;
  onEdit: (id: string, from: string) => void;
  onAdd: (from: string) => void;
  onOpenCard: (id: string) => void;
  onClear: () => void;
}) {
  const doc = useStore((s) => s.doc);
  const byId = (id: string) => doc.characters.find((c) => c.id === id);
  const back = (
    <button
      type="button"
      onClick={onClear}
      className="text-[12px] font-medium text-soft underline decoration-line underline-offset-[3px] hover:text-ink"
    >
      Back to everyone
    </button>
  );

  if (sel) {
    const A = byId(sel.a);
    const B = byId(sel.b);
    if (!A || !B) return null;
    const view = (who: Character, other: Character) => {
      const t = viewOf(sel, who.id);
      return (
        <div className="flex flex-col gap-[3px]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
            {firstName(who)} toward {firstName(other)}
          </div>
          <div className={`font-serif text-[13px] leading-[1.5] ${t ? "text-ink" : "italic text-faint"}`}>
            {t || "Not written yet"}
          </div>
        </div>
      );
    };
    return (
      <>
        <div className="flex items-center gap-[10px]">
          <span className="flex">
            <Avatar c={A} size={34} />
            <span className="-ml-[8px] rounded-full shadow-[0_0_0_2px_var(--panel)]">
              <Avatar c={B} size={34} />
            </span>
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-[17px] font-semibold text-ink">
              {firstName(A)} and {firstName(B)}
            </h3>
            <div className="mt-[2px] flex flex-wrap items-center gap-x-[8px] text-[11.5px] text-soft">
              <KindPill doc={doc} kind={sel.kind} />
              {sel.label}
            </div>
          </div>
        </div>
        {view(A, B)}
        {view(B, A)}
        {sel.notes && (
          <div>
            <FieldLabel>Notes</FieldLabel>
            <p className="text-[12.5px] leading-[1.55] text-soft">{sel.notes}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-[10px]">
          <button
            type="button"
            onClick={() => onEdit(sel.id, sel.a)}
            className="rounded-lg border border-rule bg-card px-[14px] py-[7px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Edit
          </button>
          {back}
        </div>
      </>
    );
  }

  if (focus) {
    const ties = tiesOf(doc, focus.id).filter((r) => showArch || !byId(r.a === focus.id ? r.b : r.a)?.archived);
    return (
      <>
        <div className="flex items-center gap-[10px]">
          <Avatar c={focus} size={34} />
          <div className="min-w-0">
            <h3 className="font-serif text-[17px] font-semibold text-ink">{focus.name || "Unnamed character"}</h3>
            <div className="mt-[2px] text-[11.5px] text-soft">
              {[focus.role, `${ties.length} ${ties.length === 1 ? "relationship" : "relationships"}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-[2px]">
          {ties.length ? (
            ties.map((r) => <TieRow key={r.id} doc={doc} r={r} me={focus.id} onOpen={() => onEdit(r.id, focus.id)} />)
          ) : (
            <p className="text-[12.5px] text-faint">No relationships yet.</p>
          )}
        </div>
        {!focus.archived && <AddTieButton onClick={() => onAdd(focus.id)} />}
        <div className="flex flex-wrap items-center gap-[10px]">
          <button
            type="button"
            onClick={() => onOpenCard(focus.id)}
            className="rounded-lg border border-rule bg-card px-[14px] py-[7px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Open {firstName(focus)}'s card
          </button>
          {back}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-therefore">
        {doc.projectTitle || "This project"}
      </div>
      <h3 className="font-serif text-[17px] font-semibold text-ink">
        {liveCount} {liveCount === 1 ? "relationship" : "relationships"} among {activeCount}{" "}
        {activeCount === 1 ? "character" : "characters"}
      </h3>
      <p className="text-[12.5px] leading-[1.55] text-soft">
        {liveCount
          ? "Pick a character to see everyone they're tied to, or a line to read both sides of it."
          : "No relationships yet. Pick a character and use Add relationship, or open their card."}
      </p>
    </div>
  );
}
