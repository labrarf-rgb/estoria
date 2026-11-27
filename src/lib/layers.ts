/**
 * Which overlay layer is on top. Pure, so it can be tested without a DOM.
 *
 * Under a background scene only the top overlay shows (ui/Overlay.tsx,
 * index.css). "Top" is what is painted on top: the highest z-index, and among
 * equal z-indexes the one later in the document (or nested inside the other).
 * It is **not** the order the layers mounted in: React runs a child's layout
 * effects before its parent's, so a window that opens in the same update as
 * the panel it belongs to (+ Create new character inside a chapter opens the
 * Characters panel and its draft window together) registers first.
 */
export function topLayer<T>(items: readonly T[], z: (t: T) => number, follows: (a: T, b: T) => boolean): T | undefined {
  let top: T | undefined;
  for (const it of items) {
    if (top === undefined) {
      top = it;
      continue;
    }
    const zi = z(it);
    const zt = z(top);
    if (zi > zt || (zi === zt && follows(it, top))) top = it;
  }
  return top;
}
