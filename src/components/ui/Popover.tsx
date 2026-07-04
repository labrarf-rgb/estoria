import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * A dropdown rendered into document.body so it escapes any `overflow` clipping
 * on its ancestors (the toolbar scrolls horizontally, which would otherwise
 * hide menus). Positioned with `fixed` relative to an anchor element.
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
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

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
    setPos(
      side === "above"
        ? { left, bottom: window.innerHeight - r.top + 6 }
        : { left, top: r.bottom + 6 }
    );
  }, [open, anchorRef, align, side, width]);

  if (!open || !pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onMouseDown={onClose} />
      <div
        className="fixed z-[60] flex flex-col gap-[2px] rounded-[11px] border border-rule bg-card p-[7px] shadow-[0_16px_44px_rgba(0,0,0,0.32)]"
        style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
