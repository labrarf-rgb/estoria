/**
 * How much scene text a timeline card can show, and how wide a card has to be
 * to show it.
 *
 * The timeline is a reading surface, so a scene node must never cut its text
 * off. Cards keep a fixed height and grow *sideways* instead: a scene that will
 * not fit one column takes two (or more), which keeps every row level and
 * wastes no vertical space. See `sceneGrid` in `layout.ts` for the packing.
 *
 * Capacity is measured off a real DOM probe rather than a characters-per-line
 * guess, because it depends on the font, the card's padding and the label line
 * above the text, all of which are styling that can drift. It is memoized per
 * (width, height), so the cost is a handful of measurements per pane size, not
 * one per scene.
 */

/**
 * Hard cap on the text of a scene, in characters.
 *
 * Set by the *narrowest* place a card still has to fit whole: a half-screen
 * window, where the pane holds a single ~336px column and a card therefore
 * cannot widen at all. That card shows ~205 characters, so 200 is the honest
 * ceiling. On a wide screen a two-column card holds ~344, with room to spare.
 *
 * Enforced on input only (`maxLength` on the scene textarea). Text already
 * longer than this is **never truncated** — see `isOverCap`.
 */
export const SCENE_TEXT_MAX = 200;

/** Text longer than the cap, i.e. written before the cap existed. */
export const isOverCap = (text: string) => text.trim().length > SCENE_TEXT_MAX;

/** Shown in an empty node, so it has to fit like any other text. */
const PLACEHOLDER = "New scene";

/**
 * Filler for the capacity probe. Deliberately built from mid-length words: a
 * short-word filler measures a best case that real prose then overflows, and
 * biasing the other way only widens a card slightly early, which is harmless.
 */
const FILLER =
  "the harbor keeper remembers something particular happening between them before the crossing and never says which part ";

const capCache = new Map<string, number>();
let probe: HTMLDivElement | null = null;

/**
 * A hidden copy of a scene node's box, kept in the document so it inherits the
 * app's fonts. `contain` keeps measuring it from forcing a whole-page relayout.
 */
function getProbe(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (probe?.isConnected) return probe;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;" +
    "contain:layout style;box-sizing:border-box;display:flex;flex-direction:column;" +
    "gap:7px;border:1px solid transparent;border-radius:11px;padding:12px 13px";
  // Mirrors the node's two children: the SCENE label, then the text.
  const label = document.createElement("span");
  label.style.cssText =
    "font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;font-weight:600;letter-spacing:.025em";
  label.textContent = "SCENE 1";
  const text = document.createElement("span");
  text.style.cssText = "font-size:13px;line-height:1.5";
  el.append(label, text);
  document.body.appendChild(el);
  probe = el;
  return el;
}

/** Rough fallback when there is no DOM to measure against. */
const estimate = (w: number) => Math.max(0, Math.floor(w * 0.66 - 18));

/** Most characters that fit a card of `width` x `height`, memoized. */
export function sceneCapacity(width: number, height: number): number {
  const key = `${Math.round(width)}|${Math.round(height)}`;
  const hit = capCache.get(key);
  if (hit !== undefined) return hit;

  const el = getProbe();
  if (!el) {
    const est = estimate(width);
    capCache.set(key, est);
    return est;
  }

  el.style.width = `${width}px`;
  const text = el.children[1] as HTMLElement;
  const fill = (n: number) => {
    let s = "";
    while (s.length < n) s += FILLER;
    return s.slice(0, n);
  };

  let lo = 0;
  let hi = 1200;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    text.textContent = fill(mid);
    if (el.getBoundingClientRect().height <= height) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  text.textContent = "";
  capCache.set(key, best);
  return best;
}

/**
 * How many column slots this scene needs so its text fits whole, clamped to
 * `maxSpan` (the pane cannot hold a wider card than it has columns).
 *
 * Returning `maxSpan` for text that still will not fit is deliberate: that only
 * happens to scenes written before the cap, and the card carries a count badge
 * saying so rather than silently swallowing the overflow.
 */
export function sceneSpan(
  text: string,
  colW: number,
  gapX: number,
  maxSpan: number,
  height: number
): number {
  const body = text.trim() || PLACEHOLDER;
  for (let s = 1; s < maxSpan; s++) {
    const w = s * colW + (s - 1) * gapX;
    // The character capacity is measured off a mid-length-word filler, so it is
    // deliberately pessimistic: clearing it means this text certainly fits, and
    // costs no measurement. Only the handful that fail it get weighed exactly,
    // which is what stops short-worded prose from widening a card it did not
    // need.
    if (body.length <= sceneCapacity(w, height)) return s;
    if (fitsAt(body, w, height)) return s;
  }
  return Math.max(1, maxSpan);
}

/** Does this exact text fit a card of `width` x `height`? Memoized per pair. */
const fitCache = new Map<string, boolean>();
function fitsAt(text: string, width: number, height: number): boolean {
  const key = `${Math.round(width)}|${Math.round(height)}|${text}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;

  const el = getProbe();
  if (!el) return text.length <= estimate(width);

  el.style.width = `${width}px`;
  const node = el.children[1] as HTMLElement;
  node.textContent = text;
  const ok = el.getBoundingClientRect().height <= height;
  node.textContent = "";
  fitCache.set(key, ok);
  return ok;
}

/** Drop measurements taken against stale styling (theme/font swaps). */
export function clearSceneFitCache() {
  capCache.clear();
  fitCache.clear();
}
