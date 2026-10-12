import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * A dropdown rendered into document.body so it escapes any `overflow` clipping
 * on its ancestors (the toolbar scrolls horizontally, which would otherwise
 * hide menus). Positioned with `fixed` relative to an anchor element.
 *
 * Capped at the room left between the anchor and the window edge, scrolling
 * past that, so a long menu on a short screen never runs its last items off
 * the bottom where nothing can reach them.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  align = "left",
  side = "below",
  width,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  /** "above" opens upward from the anchor (for anchors at the screen bottom). */
  side?: "below" | "above";
  width: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = align === "right" ? r.right - width : r.left;
    // "above" pins the popover's bottom edge over the anchor, so it grows
    // upward whatever its height turns out to be.
    const edge = 12;
    setPos(
      side === "above"
        ? { left, bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 6 - edge }
        : { left, top: r.bottom + 6, maxHeight: window.innerHeight - r.bottom - 6 - edge }
    );
  }, [open, anchorRef, align, side, width]);

  if (!open || !pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onMouseDown={onClose} />
      <div
        className="fixed z-[60] flex flex-col gap-[2px] overflow-y-auto overscroll-contain rounded-[11px] border border-rule bg-card p-[7px] shadow-[0_16px_44px_rgba(0,0,0,0.32)] [&>*]:shrink-0"
        style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, width }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
