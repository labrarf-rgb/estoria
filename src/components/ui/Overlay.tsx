import type { ReactNode } from "react";

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
    <div
      onMouseDown={onClose}
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
 * The frame shared by the three right-hand panels (Characters / World / Notes):
 * the panel filling the viewport, content capped and centred so lines don't
 * stretch the width of a wide monitor. It sits in a `Scrim` like every modal,
 * which keeps the app behind it inert and a second panel from opening over it.
 *
 * Expand-only since 2026-11-26: the 460px side panel and its Expand / Collapse
 * toggle (`SizeButton`, the `panelExpanded` pref) are gone.
 *
 * Header and body are separate slots so the header stays put while the body
 * scrolls.
 */
export function Drawer({
  onClose,
  z = 55,
  header,
  children,
}: {
  onClose: () => void;
  z?: number;
  header: ReactNode;
  children: ReactNode;
}) {
  const inner = "mx-auto w-full max-w-[1180px]";
  const panel = (
    <div onMouseDown={stop} className="absolute inset-0 flex flex-col bg-panel">
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
