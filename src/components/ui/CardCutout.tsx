import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { sceneToShow } from "@/lib/look";

/** A card's box on a canvas, in the SVG's own units. */
export interface CutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, to match the card's. */
  r: number;
  /** The card's rotation in degrees, about its center (the board's chapter cards can tilt). */
  rot?: number;
}

const FAR = 100_000;

/**
 * Connector lines with every card's shape cut out of them, so a line never
 * shows underneath a see-through card. Lines are drawn under the cards; while
 * cards were opaque that hid the part of a line that ran beneath one (scene
 * links run center to center, and a chapter link can cross another card).
 * Under a background scene cards are 40%, so that part showed; the mask keeps
 * it hidden.
 *
 * **Only under a scene.** On Plain the cards are opaque and the lines render
 * exactly as before, unmasked: a mask there would only show itself while cards
 * ease to a new spot (the cut-outs sit at the end positions).
 *
 * Use inside an <svg>: the mask covers the whole plane, so a canvas that
 * scrolls or pans is covered too.
 */
export function CardCutout({ rects, children }: { rects: CutRect[]; children: ReactNode }) {
  const sceneOn = useStore(
    (s) => sceneToShow({ sceneLight: s.sceneLight, sceneDark: s.sceneDark }, s.shufflePicks, s.theme) !== "plain",
  );
  // useId's characters are not safe inside url(#...), so keep letters and digits only.
  const id = `cut-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // The mask is rebuilt only when a box really changes, however often the
  // canvas re-renders or rebuilds its rect list.
  const key = rects.map((c) => `${c.x},${c.y},${c.w},${c.h},${c.r},${c.rot ?? 0}`).join(";");
  const mask = useMemo(
    () => (
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={-FAR} y={-FAR} width={FAR * 2} height={FAR * 2}>
          <rect x={-FAR} y={-FAR} width={FAR * 2} height={FAR * 2} fill="white" />
          {rects.map((c, i) => (
            <rect
              key={i}
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx={c.r}
              fill="black"
              transform={c.rot ? `rotate(${c.rot} ${c.x + c.w / 2} ${c.y + c.h / 2})` : undefined}
            />
          ))}
        </mask>
      </defs>
    ),
    // `key` stands for `rects`' content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, key],
  );
  if (!sceneOn) return <>{children}</>;
  return (
    <>
      {mask}
      <g mask={`url(#${id})`}>{children}</g>
    </>
  );
}

/**
 * The real layout heights of cards that only have a `minHeight`, so a cut-out
 * covers a card that grew. `refFor(id)` goes on each card's box; `heights[id]`
 * is its `offsetHeight` (unaffected by the canvas's zoom transform), kept up to
 * date by a ResizeObserver. Unknown until measured: fall back to the minimum.
 */
export function useCardHeights(): {
  heights: Record<string, number>;
  refFor: (id: string) => (el: HTMLElement | null) => void;
} {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const observer = useRef<ResizeObserver | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const measure = useCallback((list: HTMLElement[]) => {
    setHeights((prev) => {
      let next = prev;
      for (const el of list) {
        const id = el.dataset.cutId;
        if (!id) continue;
        const h = el.offsetHeight;
        if (prev[id] !== h) {
          if (next === prev) next = { ...prev };
          next[id] = h;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => measure(entries.map((e) => e.target as HTMLElement)));
    observer.current = ro;
    els.current.forEach((el) => ro.observe(el));
    return () => {
      ro.disconnect();
      observer.current = null;
    };
  }, [measure]);

  // One stable callback per id, so React does not detach and reattach every render.
  const refFor = useCallback(
    (id: string) => {
      let fn = refs.current.get(id);
      if (!fn) {
        fn = (el: HTMLElement | null) => {
          const old = els.current.get(id);
          if (old && old !== el) {
            observer.current?.unobserve(old);
            els.current.delete(id);
          }
          if (el) {
            el.dataset.cutId = id;
            els.current.set(id, el);
            observer.current?.observe(el);
            measure([el]);
          }
        };
        refs.current.set(id, fn);
      }
      return fn;
    },
    [measure],
  );

  return { heights, refFor };
}
