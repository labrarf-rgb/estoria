import type { ReactNode } from "react";

/** Dimmed full-screen backdrop. Clicking it calls onClose. */
export function Scrim({
  onClose,
  z = 50,
  children,
  center = false,
}: {
  onClose: () => void;
  z?: number;
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      onMouseDown={onClose}
      className={`fixed inset-0 backdrop-blur-[2px] ${center ? "flex items-center justify-center p-[30px]" : ""}`}
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
 * The frame shared by the three right-hand panels (Characters / World / Notes),
 * in two sizes the user toggles with `SizeButton`:
 *
 *  - **side panel** (default) — a 460px column over the right edge, behind the
 *    usual dimmed `Scrim`: the rest of the app is greyed out and inert while a
 *    panel is open, and clicking the backdrop closes it. Because the scrim
 *    covers the toolbar too, this is also what keeps a second panel from being
 *    opened on top of the first — that click closes this one instead.
 *  - **full screen** — the same panel filling the viewport, for when it's the
 *    thing you're working in. It covers everything, so it needs no backdrop of
 *    its own; content is capped and centred so lines don't stretch the width of
 *    a wide monitor.
 *
 * Header and body are separate slots so the header stays put while the body
 * scrolls, in both sizes.
 */
export function Drawer({
  expanded,
  onClose,
  z = 55,
  header,
  children,
}: {
  expanded: boolean;
  onClose: () => void;
  z?: number;
  header: ReactNode;
  children: ReactNode;
}) {
  const inner = expanded ? "mx-auto w-full max-w-[1180px]" : "w-full";
  const panel = (
    <div
      onMouseDown={stop}
      className={
        expanded
          ? "absolute inset-0 flex flex-col bg-panel"
          : "absolute bottom-0 right-0 top-0 flex w-[460px] flex-col border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
      }
    >
      <div className="shrink-0 border-b border-rule bg-panel">
        <div className={inner}>{header}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className={inner}>{children}</div>
      </div>
    </div>
  );
  return (
    <Scrim onClose={onClose} z={z}>
      {panel}
    </Scrim>
  );
}

/** Panel size toggle — same wording as the chapter modal's scene-flow control. */
export function SizeButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={expanded ? "Shrink back to the side panel" : "Expand to fill the screen"}
      className="rounded-lg border border-rule bg-card px-[10px] py-[6px] text-[11.5px] font-medium text-ink hover:border-faint"
    >
      {expanded ? "Collapse" : "Expand"}
    </button>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-[30px] w-[30px] rounded-lg border border-rule bg-card text-[14px] font-medium text-ink hover:border-faint"
    >
      ✕
    </button>
  );
}
