import { useLayoutEffect, useState, type ReactNode } from "react";

/*
 * Full-window backdrops (`fill`) open now, oldest first. Under a background
 * scene a fill backdrop is clear (index.css), which is right for the first
 * one; one that opens over another (a panel over the chapter: + New character
 * inside a chapter) must still dim what is under it, or two see-through
 * sheets read as one. So each fill backdrop knows whether it is stacked.
 */
const fillStack: symbol[] = [];
const fillListeners = new Set<() => void>();

function useStackedFill(active: boolean): boolean {
  const [id] = useState(() => Symbol("scrim"));
  const [stacked, setStacked] = useState(false);
  // Layout effect, so the attribute is right before the first paint.
  useLayoutEffect(() => {
    if (!active) return;
    fillStack.push(id);
    const update = () => setStacked(fillStack.indexOf(id) > 0);
    fillListeners.add(update);
    fillListeners.forEach((fn) => fn());
    return () => {
      const i = fillStack.indexOf(id);
      if (i >= 0) fillStack.splice(i, 1);
      fillListeners.delete(update);
      fillListeners.forEach((fn) => fn());
    };
  }, [active, id]);
  return active && stacked;
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
  const stacked = useStackedFill(fill);
  return (
    <div
      onMouseDown={onClose}
      // Background scenes key on these (index.css): no blur under a scene, and
      // a "fill" backdrop goes clear with the app hidden behind it, unless it
      // is stacked on another, when it keeps its dim over the one below.
      data-scrim={fill ? "fill" : center ? "center" : "plain"}
      data-stacked={stacked ? "" : undefined}
      className={`fixed inset-0 backdrop-blur-[2px] ${
        fill ? "flex p-[16px]" : center ? "flex items-center justify-center p-[30px]" : ""
      }`}
      style={{ background: "rgba(20,14,6,.46)", zIndex: z }}
    >
      {children}
    </div>
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
