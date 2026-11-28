import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store/useStore";

/** What arrow keys and first focus land on inside a popover. */
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
/** Open popovers, newest last: only the newest answers Escape. */
const openStack: object[] = [];
/** Room kept between a popover and the window edge. */
const EDGE = 12;

/**
 * A dropdown rendered into document.body so it escapes any `overflow` clipping
 * on its ancestors. Positioned with `fixed` relative to an anchor element, and
 * kept `EDGE` px inside the window on both sides, so a menu anchored near
 * either edge always opens fully on screen.
 *
 * Capped at the room left between the anchor and the window edge, scrolling
 * past that, so a long menu on a short screen never runs its last items off
 * the bottom where nothing can reach them.
 *
 * Escape closes it and puts focus back on the anchor (`onEscape` overrides
 * that, e.g. to step back out of a submenu). `navigable` makes it keyboard
 * first: focus moves in on open (to `[data-autofocus]` if there is one, else
 * the first control not marked `data-skip-focus`) and again whenever `focusKey` changes, ↑ ↓ Home End move
 * between controls, and Tab closes it back to the anchor.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  align = "left",
  side = "below",
  width,
  children,
  id,
  label,
  navigable = false,
  focusKey,
  onEscape,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  /** "above" opens upward from the anchor (for anchors at the screen bottom). */
  side?: "below" | "above";
  width: number;
  children: ReactNode;
  id?: string;
  /** Accessible name; gives the popover `role="group"`. */
  label?: string;
  navigable?: boolean;
  focusKey?: unknown;
  onEscape?: () => void;
}) {
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const escape = useRef<() => void>(() => {});
  escape.current = onEscape ?? (() => {
    onClose();
    anchorRef.current?.focus();
  });

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const wanted = align === "right" ? r.right - width : r.left;
    const left = Math.max(EDGE, Math.min(wanted, window.innerWidth - width - EDGE));
    // "above" pins the popover's bottom edge over the anchor, so it grows
    // upward whatever its height turns out to be.
    setPos(
      side === "above"
        ? { left, bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 6 - EDGE }
        : { left, top: r.bottom + 6, maxHeight: window.innerHeight - r.bottom - 6 - EDGE }
    );
  }, [open, anchorRef, align, side, width]);

  // Escape belongs to the topmost thing, and an open popover is on top of
  // whatever opened it, so it takes the key before anything underneath does
  // (a detail window, the chapter) sees it.
  // A confirm opened from inside a popover (deleting a version) sits above it
  // and has the key instead, as DetailWindow already allows.
  useEffect(() => {
    if (!open) return;
    const me = {};
    openStack.push(me);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || openStack[openStack.length - 1] !== me) return;
      if (useStore.getState().confirm) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      escape.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const at = openStack.indexOf(me);
      if (at !== -1) openStack.splice(at, 1);
    };
  }, [open]);

  const placed = pos !== null;
  useLayoutEffect(() => {
    if (!navigable || !placed) return;
    const box = boxRef.current;
    // A "back" row is marked `data-skip-focus`, so a submenu opens on its first item.
    const target =
      box?.querySelector<HTMLElement>("[data-autofocus]") ??
      [...(box?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find((e) => !e.hasAttribute("data-skip-focus"));
    target?.focus({ preventScroll: true });
  }, [navigable, placed, focusKey]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!navigable) return;
    if (e.key === "Tab") {
      e.preventDefault();
      onClose();
      anchorRef.current?.focus();
      return;
    }
    // A dropdown keeps its own arrows.
    if ((e.target as HTMLElement).tagName === "SELECT") return;
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const all = [...(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!all.length) return;
    e.preventDefault();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? all.length - 1
      : e.key === "ArrowDown" ? (at + 1) % all.length
      : (at - 1 + all.length) % all.length;
    all[next].focus();
  };

  if (!open || !pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onMouseDown={onClose} />
      <div
        ref={boxRef}
        id={id}
        role={label ? "group" : undefined}
        aria-label={label}
        onKeyDown={onKeyDown}
        className="scene-pop fixed z-[60] flex flex-col gap-[2px] overflow-y-auto overscroll-contain rounded-[11px] border border-rule bg-card p-[7px] shadow-[0_16px_44px_rgba(0,0,0,0.32)] [&>*]:shrink-0"
        style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, width }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
