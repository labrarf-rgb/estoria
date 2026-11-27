import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Grip-drag ordering for a list of tiles or chips (docs/PLAN-detail-cards-reorder.md).
 * One hook behind every ordered list: Characters and World tiles, the Notes
 * library, a world entry's references, and a chapter's pinned-reference chips.
 *
 * - **The grip is the only drag source.** A click anywhere else on a tile opens
 *   it, and the grip (marked `data-no-open`) never does.
 * - **A press lifts after 4px**, the board's click slop applied to the grip: a
 *   still press does nothing at all.
 * - **The others make room live.** The list is drawn in a *preview* order while
 *   a card is carried; the store changes only on release. The carried card's
 *   own element stays mounted as the dashed space (same key, contents hidden),
 *   so its size is exact and a finger's pointer target never leaves the page.
 * - **Reading order decides the space**: before the first tile the pointer is
 *   ahead of: above its row, or in its row and left of its middle. Chips and
 *   tiles are always laid out in rows (a one-column mode went with the side
 *   panel, 2026-11-26).
 * - **Pointer events**, with `touch-action: none` on the grip only, so a finger
 *   drags by the grip and the rest of the list still scrolls.
 * - **Keyboard**: arrow keys on a focused grip move it one place.
 * - **"Rearranging"** is on from a press or focus on a grip or a position
 *   number until a press elsewhere, Escape, or focus leaving them. Lists that
 *   hide their position numbers at rest show them only then.
 *
 * This replaces RefList's earlier mouse-only grip drag ("drop on a row to take
 * its place"); the store actions behind each list are unchanged.
 */

const SLOP = 4;
const EDGE = 48;

interface Drag {
  id: string;
  /** Where the carried card would land, as an index among the *other* items. */
  overIdx: number;
  w: number;
  h: number;
  /** The lifted card's top-left at lift, in viewport px. */
  left: number;
  top: number;
}

type Box = { left: number; top: number; right: number; bottom: number };

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The nearest ancestor that scrolls vertically, for auto-scroll near its edges. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export function useTileReorder({
  ids,
  onMove,
  nameOf,
}: {
  /** The orderable items, in their current order (no draft). */
  ids: string[];
  /** Commit a move; `toIdx` indexes `ids`. Omit to turn ordering off. */
  onMove?: (id: string, toIdx: number) => void;
  /** For the screen-reader announcement after a move. */
  nameOf: (id: string) => string;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [arranging, setArranging] = useState(false);
  const [live, setLive] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemEls = useRef(new Map<string, HTMLElement>());
  const gripEls = useRef(new Map<string, HTMLElement>());
  /** Layout boxes relative to the container, so scrolling never stales them. */
  const boxes = useRef(new Map<string, Box>());
  /** Visual boxes captured just before an order change, for the slide. */
  const first = useRef<Map<string, DOMRect> | null>(null);
  const liftedEl = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  // Latest values for the window-level handlers, which outlive a render.
  const latest = useRef({ ids, onMove, drag });
  latest.current = { ids, onMove, drag };

  useEffect(() => () => cleanup.current?.(), []);

  const order = (() => {
    if (!drag || !ids.includes(drag.id)) return ids;
    const others = ids.filter((x) => x !== drag.id);
    others.splice(Math.min(drag.overIdx, others.length), 0, drag.id);
    return others;
  })();
  const orderKey = order.join("|");

  /** Record where every item is drawn right now, so the next layout can slide from it. */
  const snapshot = () => {
    const m = new Map<string, DOMRect>();
    for (const [id, el] of itemEls.current) m.set(id, el.getBoundingClientRect());
    first.current = m;
  };

  const measure = () => {
    const c = containerRef.current?.getBoundingClientRect();
    if (!c) return;
    boxes.current.clear();
    for (const [id, el] of itemEls.current) {
      const b = el.getBoundingClientRect();
      boxes.current.set(id, { left: b.left - c.left, top: b.top - c.top, right: b.right - c.left, bottom: b.bottom - c.top });
    }
  };

  // After an order change: stop any slide still running, measure the true
  // layout, then slide each item from where it was drawn to where it is.
  useLayoutEffect(() => {
    const from = first.current;
    first.current = null;
    if (from) {
      for (const el of itemEls.current.values()) el.getAnimations().forEach((a) => a.cancel());
    }
    measure();
    if (from && !reducedMotion()) {
      for (const [id, el] of itemEls.current) {
        const a = from.get(id);
        if (!a) continue;
        const b = el.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (dx || dy) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
            duration: 200,
            easing: "ease-out",
          });
        }
      }
    }
    const f = pendingFocus.current;
    if (f) {
      pendingFocus.current = null;
      gripEls.current.get(f)?.focus();
    }
  }, [orderKey]);

  // While rearranging: a press outside this list's grips and numbers, or
  // Escape, ends it.
  useEffect(() => {
    if (!arranging) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (containerRef.current?.contains(t) && t.closest("[data-reorder-grip],[data-reorder-pos]")) return;
      setArranging(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest?.("[data-reorder-pos]")) setArranging(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [arranging]);

  const announce = (id: string, to: number, n: number) => setLive(`${nameOf(id)} moved to position ${to + 1} of ${n}.`);

  const startPress = (id: string, e: React.PointerEvent) => {
    if (!onMove || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    setArranging(true);
    const start = { x: e.clientX, y: e.clientY };
    let ptr = { ...start };
    let off = { x: 0, y: 0 };
    let lifted = false;
    let raf = 0;
    let scroller: HTMLElement | null = null;

    /** The index among the others that the pointer is ahead of, in reading order. */
    const slotAt = () => {
      const c = containerRef.current?.getBoundingClientRect();
      const d = latest.current.drag;
      if (!c || !d) return 0;
      const others = latest.current.ids.filter((x) => x !== id);
      const x = ptr.x - c.left;
      const y = ptr.y - c.top;
      for (let i = 0; i < others.length; i++) {
        const b = boxes.current.get(others[i]);
        if (!b) continue;
        const ahead = y < b.top || (y <= b.bottom && x < (b.left + b.right) / 2);
        if (ahead) return i;
      }
      return others.length;
    };
    const retarget = () => {
      const d = latest.current.drag;
      if (!d) return;
      const over = slotAt();
      if (over !== d.overIdx) {
        snapshot();
        const next = { ...d, overIdx: over };
        latest.current.drag = next;
        setDrag(next);
      }
    };
    const tick = () => {
      if (scroller) {
        const b = scroller.getBoundingClientRect();
        let v = 0;
        if (ptr.y < b.top + EDGE) v = -Math.ceil((b.top + EDGE - ptr.y) / 4);
        else if (ptr.y > b.bottom - EDGE) v = Math.ceil((ptr.y - (b.bottom - EDGE)) / 4);
        if (v) {
          scroller.scrollTop += v;
          retarget();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const lift = () => {
      const el = itemEls.current.get(id);
      if (!el) return false;
      measure();
      const r = el.getBoundingClientRect();
      off = { x: start.x - r.left, y: start.y - r.top };
      const d: Drag = { id, overIdx: latest.current.ids.indexOf(id), w: r.width, h: r.height, left: r.left, top: r.top };
      latest.current.drag = d;
      setDrag(d);
      scroller = scrollParent(containerRef.current);
      raf = requestAnimationFrame(tick);
      document.body.classList.add("cursor-grabbing");
      return true;
    };
    const onPointerMove = (ev: PointerEvent) => {
      ptr = { x: ev.clientX, y: ev.clientY };
      if (!lifted) {
        if (Math.abs(ptr.x - start.x) <= SLOP && Math.abs(ptr.y - start.y) <= SLOP) return;
        lifted = lift();
        if (!lifted) return;
      }
      const l = liftedEl.current;
      if (l) {
        l.style.left = `${ptr.x - off.x}px`;
        l.style.top = `${ptr.y - off.y}px`;
      }
      retarget();
    };
    const finish = (commit: boolean) => {
      detach();
      if (!lifted) return;
      // The release fires a click on whatever holds both the press and the
      // release, which is the tile itself when a card is dropped back where
      // it was. That click must not open it.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const d = latest.current.drag;
      snapshot();
      // The dropped card settles from where it was let go, not from its space.
      const l = liftedEl.current;
      if (l && first.current) first.current.set(id, l.getBoundingClientRect());
      latest.current.drag = null;
      setDrag(null);
      const cur = latest.current.ids;
      const from = cur.indexOf(id);
      if (commit && d && from !== -1 && d.overIdx !== from) {
        latest.current.onMove?.(id, d.overIdx);
        announce(id, d.overIdx, cur.length);
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && lifted) {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    };
    const detach = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("cursor-grabbing");
      cleanup.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    cleanup.current = detach;
  };

  const onGripKey = (id: string, e: React.KeyboardEvent) => {
    if (!onMove) return;
    const i = ids.indexOf(id);
    const to =
      e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (i === -1 || to < 0 || to >= ids.length) return;
    snapshot();
    pendingFocus.current = id;
    onMove(id, to);
    announce(id, to, ids.length);
  };

  return {
    enabled: !!onMove,
    /** The order to draw: the store's, or the preview while a card is carried. */
    order,
    /** Where an item sits in what is drawn (live while dragging). */
    indexOf: (id: string) => order.indexOf(id),
    dragId: drag?.id ?? null,
    arranging,
    live,
    containerProps: {
      ref: (el: HTMLDivElement | null) => {
        containerRef.current = el;
      },
      onFocus: (e: React.FocusEvent) => {
        if ((e.target as HTMLElement).closest("[data-reorder-grip],[data-reorder-pos]")) setArranging(true);
      },
      onBlur: (e: React.FocusEvent) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next && containerRef.current?.contains(next) && next.closest("[data-reorder-grip],[data-reorder-pos]")) return;
        if (!latest.current.drag) setArranging(false);
      },
    },
    itemRef: (id: string) => (el: HTMLElement | null) => {
      if (el) itemEls.current.set(id, el);
      else itemEls.current.delete(id);
    },
    gripProps: (id: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) gripEls.current.set(id, el);
        else gripEls.current.delete(id);
      },
      onPointerDown: (e: React.PointerEvent) => startPress(id, e),
      onKeyDown: (e: React.KeyboardEvent) => onGripKey(id, e),
    }),
    /** The carried card, drawn above everything (windows included) while it moves. */
    renderLifted: (node: ReactNode) =>
      drag
        ? createPortal(
            <div
              ref={liftedEl}
              aria-hidden
              className="pointer-events-none fixed z-[90] cursor-grabbing"
              style={{
                left: drag.left,
                top: drag.top,
                width: drag.w,
                height: drag.h,
                filter: "drop-shadow(0 14px 22px rgba(40, 28, 10, 0.24))",
              }}
            >
              {node}
            </div>,
            document.body
          )
        : null,
  };
}

export type TileReorder = ReturnType<typeof useTileReorder>;

/**
 * One ordered item's wrapper. While its card is carried it stays mounted as the
 * dashed space the card will land in, contents hidden, so its size is exact.
 */
export function ReorderItem({
  r,
  id,
  chip = false,
  className = "",
  children,
}: {
  r: TileReorder;
  id: string;
  chip?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const space = r.dragId === id;
  return (
    <div
      ref={r.itemRef(id)}
      className={`${className} ${
        space ? `border-[1.5px] border-dashed border-faint bg-chip ${chip ? "rounded-full" : "rounded-xl"}` : ""
      }`}
    >
      <div className={`flex min-w-0 flex-1 ${space ? "invisible" : ""}`}>{children}</div>
    </div>
  );
}

/** The ⠿ handle. The only place a drag starts; never opens the tile it sits on. */
export function Grip({ r, id, name, chip = false }: { r: TileReorder; id: string; name: string; chip?: boolean }) {
  if (!r.enabled) return null;
  return (
    <button
      type="button"
      data-no-open
      data-reorder-grip
      {...r.gripProps(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Move ${name}. Drag, or use the arrow keys`}
      title="Drag to move"
      style={{ touchAction: "none" }}
      className={`flex shrink-0 select-none items-center justify-center rounded-md leading-none text-faint outline-none hover:bg-chip hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--therefore)_45%,transparent)] ${
        r.dragId === id ? "cursor-grabbing" : "cursor-grab"
      } ${chip ? "-my-[4px] h-[22px] w-[14px] text-[11px]" : "-my-[4px] -ml-[6px] h-[26px] w-[20px] text-[13px]"}`}
    >
      ⠿
    </button>
  );
}

/** Screen-reader line for the last move. */
export function ReorderLive({ r }: { r: TileReorder }) {
  return (
    <span className="sr-only" aria-live="polite">
      {r.live}
    </span>
  );
}
