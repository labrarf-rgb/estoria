import type { Chapter, Vec2 } from "@/types";

/** Card dimensions on the board. */
export const CARD_W = 244;
export const CARD_H = 142;
/** Scene-node dimensions in the chapter-detail canvas. */
export const SCENE_W = 208;
export const SCENE_H = 124;
/** Book-card dimensions on the series map. */
export const BOOK_W = 290;
export const BOOK_H = 188;

/** Deterministic pseudo-random in [0,1) — keeps auto-arrange stable per index. */
function prand(n: number): number {
  const r = Math.sin(n * 127.1 + 0.5) * 43758.5453;
  return r - Math.floor(r);
}

export interface ArrangeResult {
  chapters: Chapter[];
  arrangeN: number;
}

/** Grid spacing shared by auto-arrange and the column-count estimator. Kept
 *  fairly tight so an auto-arranged board fills the screen and stays readable. */
export const GRID_GAP_X = 48;
export const GRID_GAP_Y = 56;
export const GRID_MARGIN = 28;
/** Viewport breathing room used by fit-to-content and the column estimator. */
export const FIT_PAD = 36;
/** Largest zoom fit-to-content will use — keeps small boards from oversizing. */
export const FIT_ZOOM_MAX = 1.05;
/**
 * Floor for a fitted zoom. A viewport smaller than the padding makes the fit
 * formula go negative, and a negative scale() mirrors the whole board — which is
 * exactly what a fit measured before the stylesheet has applied used to do.
 */
const FIT_ZOOM_MIN = 0.05;

/**
 * Choose the column count that makes the arranged grid fill the visible board
 * best — i.e. the layout whose fit-to-content zoom is largest. When several
 * column counts tie (everything already fits at the max-zoom cap, common on a
 * wide screen with few cards) prefer a balanced, square-ish grid — so 4 cards
 * become 2x2, not 3+1 — nudging slightly toward more columns to use width.
 */
export function bestColumns(n: number, vpW: number, vpH: number, pad = FIT_PAD): number {
  if (n <= 1) return 1;
  if (vpW <= 0 || vpH <= 0) return Math.min(4, n);
  const target = Math.ceil(Math.sqrt(n)); // a balanced grid
  let best = 1;
  let bestZoom = -Infinity;
  let bestScore = Infinity; // lower = more balanced
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const cw = c * CARD_W + (c - 1) * GRID_GAP_X;
    const ch = rows * CARD_H + (rows - 1) * GRID_GAP_Y;
    const zoom = Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, FIT_ZOOM_MAX);
    const score = Math.abs(c - target) - c * 1e-4; // ties nudge to wider grids
    if (zoom > bestZoom + 0.01 || (Math.abs(zoom - bestZoom) <= 0.01 && score < bestScore)) {
      bestZoom = Math.max(bestZoom, zoom);
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Lay chapters out on a grid with decaying jitter. Successive calls keep easing
 * toward a straighter grid (amp shrinks), but a small floor stops it ever
 * snapping to a perfectly rigid lattice — the board approaches neat yet always
 * keeps a faint hand-laid imperfection. `cols` defaults to 4; pass a value
 * (e.g. from `bestColumns`) to size the grid to the available board space.
 */
export function autoArrange(chapters: Chapter[], arrangeN: number, cols = 4): ArrangeResult {
  const c0 = Math.max(1, cols);
  const gapX = GRID_GAP_X;
  const gapY = GRID_GAP_Y;
  const m = GRID_MARGIN;
  // First arrange is liveliest; repeats settle toward straight but never below
  // ~15% jitter, so it lines up neatly without ever looking machine-perfect.
  const amp = Math.max(0.15, Math.pow(0.6, arrangeN));
  const next = chapters.map((c, i) => {
    const col = i % c0;
    const row = Math.floor(i / c0);
    const jx = (prand(i + 1) * 2 - 1) * 30 * amp;
    const jy = ((prand(i + 9) * 2 - 1) * 34 + (col % 2 === 0 ? 26 : -22)) * amp;
    return {
      ...c,
      x: m + col * (CARD_W + gapX) + jx,
      y: m + row * (CARD_H + gapY) + jy,
      rot: (prand(i + 5) * 2 - 1) * 3.4 * amp,
    };
  });
  return { chapters: next, arrangeN: arrangeN + 1 };
}

export type TimelineOrient = "vertical" | "horizontal";

/**
 * What the timeline's pane renders: the scene flow, or the chapter's prose.
 * A toggle on the one pane rather than a separate view — the rail either side
 * of it is the same rail (docs/SPECS.md §4, "Read the book as prose").
 */
export type TimelinePane = "scenes" | "prose";

/** Sequential timeline positions for an arbitrary book list — no act grouping. */
export function timelineBookPositions(
  books: { id: string }[],
  orient: TimelineOrient
): { id: string; x: number; y: number }[] {
  return books.map((b, i) => ({
    id: b.id,
    ...(orient === "vertical"
      ? { x: 320, y: 50 + i * (BOOK_H + 70) }
      : { x: 60 + i * (BOOK_W + 90), y: 170 }),
  }));
}

/** Grid spacing for the series-map auto-arrange. */
const BOOK_GAP_X = 60;
const BOOK_GAP_Y = 70;
const BOOK_MARGIN = 40;

/** Column count whose arranged book grid best fills the series-map viewport. */
export function bestBookColumns(n: number, vpW: number, vpH: number, pad = FIT_PAD): number {
  if (n <= 1) return 1;
  if (vpW <= 0 || vpH <= 0) return Math.min(3, n);
  let best = 1;
  let bestZoom = -Infinity;
  const target = Math.ceil(Math.sqrt(n));
  let bestScore = Infinity;
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const cw = c * BOOK_W + (c - 1) * BOOK_GAP_X;
    const ch = rows * BOOK_H + (rows - 1) * BOOK_GAP_Y;
    const zoom = Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, FIT_ZOOM_MAX);
    const score = Math.abs(c - target) - c * 1e-4;
    if (zoom > bestZoom + 0.01 || (Math.abs(zoom - bestZoom) <= 0.01 && score < bestScore)) {
      bestZoom = Math.max(bestZoom, zoom);
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Lay books out on a reading-order grid (row-major) with a small, deterministic
 * jitter so the map looks hand-placed rather than a rigid lattice. Books have no
 * rotation, so only positions are nudged.
 */
export function bookAutoArrange<T extends { x: number; y: number }>(books: T[], cols: number): T[] {
  const c0 = Math.max(1, cols);
  return books.map((b, i) => {
    const col = i % c0;
    const row = Math.floor(i / c0);
    const jx = (prand(i + 1) * 2 - 1) * 12;
    const jy = (prand(i + 7) * 2 - 1) * 14;
    return {
      ...b,
      x: BOOK_MARGIN + col * (BOOK_W + BOOK_GAP_X) + jx,
      y: BOOK_MARGIN + row * (BOOK_H + BOOK_GAP_Y) + jy,
    };
  });
}

/** Fit all books within the given viewport (series map). */
export function fitBooksToContent(
  books: { x: number; y: number }[],
  vpW: number,
  vpH: number,
  pad = FIT_PAD
): Camera {
  // Nothing to fit, or nothing to fit *into* (an unmeasured viewport) — leave the
  // camera neutral rather than deriving a garbage one.
  if (books.length === 0 || vpW <= 0 || vpH <= 0) return { zoom: 1, panX: pad, panY: pad };
  const xs = books.map((b) => b.x);
  const ys = books.map((b) => b.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + BOOK_W;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + BOOK_H;
  const cw = maxX - minX;
  const ch = maxY - minY;
  const zoom = Math.max(FIT_ZOOM_MIN, Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, FIT_ZOOM_MAX));
  return {
    zoom,
    panX: (vpW - cw * zoom) / 2 - minX * zoom,
    panY: (vpH - ch * zoom) / 2 - minY * zoom,
  };
}

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

/** Fit all chapters within the given viewport (board view). */
export function fitToContent(
  chapters: Chapter[],
  vpW: number,
  vpH: number,
  pad = FIT_PAD
): Camera {
  // See `fitBooksToContent`: an unmeasured viewport gets a neutral camera.
  if (chapters.length === 0 || vpW <= 0 || vpH <= 0) return { zoom: 1, panX: pad, panY: pad };
  const xs = chapters.map((c) => c.x);
  const ys = chapters.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + CARD_W;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + CARD_H;
  const cw = maxX - minX;
  const ch = maxY - minY;
  const zoom = Math.max(FIT_ZOOM_MIN, Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, FIT_ZOOM_MAX));
  return {
    zoom,
    panX: (vpW - cw * zoom) / 2 - minX * zoom,
    panY: (vpH - ch * zoom) / 2 - minY * zoom,
  };
}

/** Scene-node grid columns by scene count (fallback when no width is known). */
function sceneCols(n: number): number {
  return n <= 1 ? 1 : n <= 4 ? 2 : 3;
}

// Horizontal gap must clear the connector pill (~79px for "Therefore") so the
// pill sits in the gap between cards instead of over their text.
export const SCENE_GAP_X = 88;
export const SCENE_GAP_Y = 48;
export const SCENE_MARGIN = 18;

/**
 * Columns that fit across the *visible* scene-canvas width (the canvas isn't
 * zoomed, it scrolls), so auto-arrange uses the room it actually has — more
 * columns when the chapter modal is expanded, fewer when collapsed.
 */
export function sceneColumnsForWidth(n: number, visW: number): number {
  if (n <= 1) return 1;
  if (visW <= 0) return sceneCols(n);
  const usable = visW - SCENE_MARGIN * 2;
  const fit = Math.floor((usable + SCENE_GAP_X) / (SCENE_W + SCENE_GAP_X));
  return Math.max(1, Math.min(n, fit));
}

/**
 * Lay scene nodes for a chapter's detail canvas, with decaying jitter. `cols`
 * defaults to a count-based heuristic; pass a width-derived value
 * (see `sceneColumnsForWidth`) to fill the visible canvas.
 */
export function sceneAutoArrange(scenes: string[], _arrangeN: number, cols?: number): Vec2[] {
  const gx = SCENE_GAP_X;
  const gy = SCENE_GAP_Y;
  const m = SCENE_MARGIN;
  const c0 = Math.max(1, cols ?? sceneCols(scenes.length));
  // Even grid (no jitter): equal gaps keep the connector pills clear of text.
  return scenes.map((_, i) => {
    const col = i % c0;
    const row = Math.floor(i / c0);
    return { x: m + col * (SCENE_W + gx), y: m + row * (SCENE_H + gy) };
  });
}

/**
 * Which way a scene grid fills: `row` runs across then wraps down (the chapter
 * modal's reading order), `column` runs down then wraps right — so in the
 * timeline's scene pane a chapter's beats always advance along the axis the
 * pane itself scrolls.
 */
export type SceneFill = "row" | "column";

/**
 * Size bounds for the timeline pane's elastic scene nodes. Choosing a track
 * count against a *fixed* node size strands every leftover pixel (a 833px pane
 * fitted one 208px column and wasted 293px), so the track count is chosen
 * against the minimum and the nodes then grow into the remainder. The maxima
 * stop a two-scene chapter from inflating into billboards.
 */
export const TL_NODE_MIN_W = 176;
export const TL_NODE_MAX_W = 340;
export const TL_NODE_MIN_H = 112;
export const TL_NODE_MAX_H = 208;
/**
 * Column gap when scenes stack (`column` fill). Consecutive beats are then
 * vertically adjacent, so their connector pill sits in the *row* gap and the
 * columns no longer need the full `SCENE_GAP_X` pill clearance.
 */
export const TL_GAP_X_STACKED = 64;

/** A placed scene node. `w` varies: a long scene takes more than one column. */
export interface SceneBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The track geometry a pane yields, before any scene is placed in it. */
export interface SceneMetrics {
  /** Column slots across (row fill) or rows down (column fill). */
  tracks: number;
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
  fill: SceneFill;
}

export interface SceneGrid {
  nodes: SceneBox[];
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
  /** Total canvas extent, margins included. */
  width: number;
  height: number;
}

/** Most tracks that fit `avail` at the minimum node size. */
function fitTracks(n: number, avail: number, minSize: number, gap: number): number {
  let t = 1;
  for (let k = 1; k <= n; k++) {
    if (SCENE_MARGIN * 2 + k * minSize + (k - 1) * gap <= avail) t = k;
    else break;
  }
  return Math.max(1, Math.min(n, t));
}

/** Node size that divides `avail` across `tracks`, clamped to [min, max]. */
function fitSize(tracks: number, avail: number, gap: number, min: number, max: number): number {
  const s = (avail - SCENE_MARGIN * 2 - (tracks - 1) * gap) / tracks;
  return Math.max(min, Math.min(max, Math.floor(s)));
}

/**
 * The track geometry the pane yields for `count` scenes. Nodes are elastic
 * (see `TL_NODE_MIN_W`), so the canvas fills the pane instead of leaving a
 * fixed-size grid adrift in it. Split out from `sceneGrid` because the caller
 * needs the column width before it can work out how many columns each scene's
 * text needs.
 */
export function sceneMetrics(
  count: number,
  availW: number,
  availH: number,
  fill: SceneFill
): SceneMetrics {
  const n = Math.max(0, count);
  const row = fill === "row";
  const gapX = row ? SCENE_GAP_X : TL_GAP_X_STACKED;
  const gapY = SCENE_GAP_Y;
  const tracks = row
    ? fitTracks(n, availW, TL_NODE_MIN_W, gapX)
    : fitTracks(n, availH, TL_NODE_MIN_H, gapY);
  return {
    tracks,
    nodeW: row ? fitSize(tracks, availW, gapX, TL_NODE_MIN_W, TL_NODE_MAX_W) : SCENE_W,
    nodeH: row ? SCENE_H : fitSize(tracks, availH, gapY, TL_NODE_MIN_H, TL_NODE_MAX_H),
    gapX,
    gapY,
    fill,
  };
}

/**
 * Place a chapter's scenes on the tracks `sceneMetrics` produced.
 *
 * `spans` says how many column slots each scene needs to show its text whole
 * (`sceneSpan` in `sceneFit.ts`). Cards keep a **fixed height** and widen
 * instead, so rows stay level and no vertical space is wasted. A widened card
 * that will not fit the slots left in its row starts the next one, leaving the
 * tail of that row empty — the ordinary cost of a flowing layout, and rare,
 * since widening is.
 *
 * Column fill (the horizontal timeline) ignores spans: there the pane is
 * height-bound, beats run down a column before wrapping right, and a card wide
 * enough to matter would break that column. It relies on `SCENE_TEXT_MAX`
 * instead.
 *
 * Distinct from `sceneAutoArrange`, which produces the *persisted* layout for
 * the chapter modal and must stay on its fixed grid.
 */
export function sceneGrid(m: SceneMetrics, spans: number[]): SceneGrid {
  const { tracks, nodeW, nodeH, gapX, gapY, fill } = m;
  const n = spans.length;
  const nodes: SceneBox[] = [];
  let rows = 0;
  let cols = 0;

  if (fill === "row") {
    let col = 0;
    let r = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.max(1, Math.min(tracks, spans[i] ?? 1));
      if (col + s > tracks) {
        r++;
        col = 0;
      }
      nodes.push({
        x: SCENE_MARGIN + col * (nodeW + gapX),
        y: SCENE_MARGIN + r * (nodeH + gapY),
        w: s * nodeW + (s - 1) * gapX,
        h: nodeH,
      });
      col += s;
      cols = Math.max(cols, col);
    }
    rows = n ? r + 1 : 0;
  } else {
    for (let i = 0; i < n; i++) {
      nodes.push({
        x: SCENE_MARGIN + Math.floor(i / tracks) * (nodeW + gapX),
        y: SCENE_MARGIN + (i % tracks) * (nodeH + gapY),
        w: nodeW,
        h: nodeH,
      });
    }
    cols = Math.ceil(n / tracks);
    rows = Math.min(tracks, n);
  }

  // Once the grid wraps, hold the canvas to the full track span so it keeps a
  // stable rectangle even where a widened card left the tail of a row empty.
  const span = (k: number, size: number, gap: number) =>
    SCENE_MARGIN * 2 + Math.max(1, k) * size + Math.max(0, k - 1) * gap;
  const acrossTracks = fill === "row" && rows > 1;

  return {
    nodes,
    nodeW,
    nodeH,
    gapX,
    gapY,
    width: span(acrossTracks ? tracks : cols, nodeW, gapX),
    height: span(rows, nodeH, gapY),
  };
}

/**
 * Row-major grid slot nearest a point inside the scene canvas (in the same
 * local coordinate space as `sceneAutoArrange`'s output). Used while dragging
 * a scene card to preview which slot it will land in on release.
 */
export function sceneSlotFromPoint(x: number, y: number, cols: number): number {
  const c0 = Math.max(1, cols);
  const col = Math.max(
    0,
    Math.min(c0 - 1, Math.round((x - SCENE_MARGIN - SCENE_W / 2) / (SCENE_W + SCENE_GAP_X)))
  );
  const row = Math.max(0, Math.round((y - SCENE_MARGIN - SCENE_H / 2) / (SCENE_H + SCENE_GAP_Y)));
  return row * c0 + col;
}
