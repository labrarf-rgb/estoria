import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { topLayer } from "@/lib/layers";

/*
 * The overlay layers open now: every backdrop (`Scrim`, the tile's
 * DetailWindow, Welcome, Recovery). Under a background scene only the top one
 * shows, over the clear scene (index.css): each layer below it, the board
 * included, is hidden rather than dimmed, so every frame stays a 40% sheet
 * over the scene and never sits over other text (Ray's rule for modals: hide
 * what is behind, don't dim it). On Plain this changes nothing.
 *
 * "Top" is what is painted on top (z-index, then document order; see
 * lib/layers.ts), never the order the layers mounted in: React runs a child's
 * layout effects before its parent's, so a draft window opening in the same
 * update as its panel registers first.
 */
const layers = new Map<symbol, RefObject<HTMLElement | null>>();
const layerListeners = new Set<() => void>();

function zOf(el: HTMLElement): number {
  const v = parseInt(getComputedStyle(el).zIndex, 10);
  return Number.isFinite(v) ? v : 0;
}

function currentTop(): symbol | undefined {
  const items: { id: symbol; el: HTMLElement }[] = [];
  layers.forEach((ref, id) => {
    if (ref.current) items.push({ id, el: ref.current });
  });
  return topLayer(
    items,
    (x) => zOf(x.el),
    // a follows b in the document, or sits inside it.
    (a, b) => (b.el.compareDocumentPosition(a.el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )?.id;
}

/** Registers an open overlay layer by its element; true while another layer is painted above it. */
export function useOverlayLayer(ref: RefObject<HTMLElement | null>): boolean {
  const [id] = useState(() => Symbol("layer"));
  const [covered, setCovered] = useState(false);
  // Layout effect, so the attribute is right before the first paint. Every
  // layer re-checks whenever one opens or closes, so the answer is right once
  // a whole update has committed, whichever effect ran first.
  useLayoutEffect(() => {
    layers.set(id, ref);
    const update = () => setCovered(currentTop() !== id);
    layerListeners.add(update);
    layerListeners.forEach((fn) => fn());
    return () => {
      layers.delete(id);
      layerListeners.delete(update);
      layerListeners.forEach((fn) => fn());
    };
  }, [id, ref]);
  return covered;
}

/**
 * A backdrop element that takes part in the layer stack. `kind` is what the
 * background-scene CSS keys on: `fill` (a full-window modal), `center` (a
 * centred dialog) or `plain`.
 */
export function OverlayLayer({ kind, ...rest }: { kind: "fill" | "center" | "plain" } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const covered = useOverlayLayer(ref);
  return <div {...rest} ref={ref} data-scrim={kind} data-covered={covered ? "" : undefined} />;
}

/** Dimmed full-screen backdrop. Clicking it calls onClose. */
export function Scrim({
  onClose,
  z = 50,
  children,
  center = false,
  fill = false,
}: {
  onClose: () => void;
  z?: number;
  children: ReactNode;
  center?: boolean;
  /** The child stretches to the whole window less a 16px margin, so the board
   *  still shows round the edge (an expanded chapter). Wins over `center`. */
  fill?: boolean;
}) {
  return (
    <OverlayLayer
      onMouseDown={onClose}
      // Background scenes key on this (index.css): under a scene the backdrop
      // is clear with no blur, and whatever is behind it is hidden.
      kind={fill ? "fill" : center ? "center" : "plain"}
      className={`fixed inset-0 backdrop-blur-[2px] ${
        fill ? "flex p-[16px]" : center ? "flex items-center justify-center p-[30px]" : ""
      }`}
      style={{ background: "rgba(20,14,6,.46)", zIndex: z }}
    >
      {children}
    </OverlayLayer>
  );
}

/** Stops backdrop clicks from closing when inside the dialog body. */
export function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

/**
 * The frame shared by Characters, World and Notes: the expanded chapter modal's
 * frame, so opening a panel and opening a chapter look the same apart from what
 * is inside. Same `Scrim fill` (16px of dimmed board showing all round, and a
 * click there closes), same rounded panel and shadow, same header: 24px serif
 * title, a 14px subtitle, a row of meta chips, and the close button top right.
 *
 * Panels as modals since 2026-11-27 (docs/panels/mockup/NOTES.md). Before that
 * the panel covered the whole window with no frame and no backdrop to click;
 * before expand-only (2026-11-26) it also had a 460px side-panel size.
 *
 * Content fills the window's width, as the chapter's scene canvas does: tile
 * grids just gain columns on a wide screen. The header stays put while the
 * body scrolls. The relationship chart sizes itself to this frame (its SVG cap
 * in RelationshipChart.tsx assumes this header), with a 520px minimum, so a
 * short window scrolls the body.
 */
export function Drawer({
  onClose,
  z = 55,
  title,
  subtitle,
  meta,
  label,
  children,
}: {
  onClose: () => void;
  z?: number;
  title: ReactNode;
  subtitle?: ReactNode;
  /** The chips under the subtitle, as the chapter's meta line sits under its summary. */
  meta?: ReactNode;
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
}) {
  return (
    <Scrim onClose={onClose} z={z} fill>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={stop}
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex shrink-0 items-start gap-[14px] border-b border-rule bg-panel px-[26px] py-[22px]">
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[24px] font-semibold leading-tight text-ink">{title}</div>
            {subtitle && <div className="mt-[5px] text-[14px] leading-[1.5] text-soft">{subtitle}</div>}
            {meta && <div className="mt-[11px] flex flex-wrap items-center gap-[10px]">{meta}</div>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </Scrim>
  );
}

/**
 * One chip in a panel header's meta row, styled like the chapter's word count:
 * a mono number and a softer unit, or a faint uppercase key before the number.
 */
export function MetaChip({ n, unit, k }: { n: number; unit?: string; k?: string }) {
  return (
    <span className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]">
      {k && (
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-faint">{k}</span>
      )}
      <span className="font-mono text-[12px] font-medium text-ink">{n.toLocaleString()}</span>
      {unit && <span className="font-mono text-[11px] font-medium text-soft">{unit}</span>}
    </span>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Close"
      aria-label="Close"
      className="h-[30px] w-[30px] shrink-0 rounded-lg border border-rule bg-card text-[14px] font-medium text-ink hover:border-faint"
    >
      ✕
    </button>
  );
}
