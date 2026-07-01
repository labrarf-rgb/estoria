import type { Chapter, StoryDoc, Vec2 } from "@/types";

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
 * Sequential timeline positions for an arbitrary chapter list (not just
 * `doc.chapters` in its current order) — takes an act-grouped extra gap
 * between groups. Standalone so a live drag-reorder preview can feed it a
 * candidate order without mutating the store.
 */
export function timelineChapterPositions(
  chapters: { id: string; act: number }[],
  orient: TimelineOrient
): { id: string; x: number; y: number }[] {
  const out: { id: string; x: number; y: number }[] = [];
  if (orient === "vertical") {
    let y = 64;
    const colX = 300;
    chapters.forEach((c, i) => {
      if (i > 0 && c.act !== chapters[i - 1].act) y += 54;
      out.push({ id: c.id, x: colX, y });
      y += CARD_H + 72;
    });
  } else {
    const y = 214;
    let x = 60;
    chapters.forEach((c, i) => {
      if (i > 0 && c.act !== chapters[i - 1].act) x += 46;
      out.push({ id: c.id, x, y });
      x += 286;
    });
  }
  return out;
}

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
  if (books.length === 0) return { zoom: 1, panX: pad, panY: pad };
  const xs = books.map((b) => b.x);
  const ys = books.map((b) => b.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + BOOK_W;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + BOOK_H;
  const cw = maxX - minX;
  const ch = maxY - minY;
  const zoom = Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, FIT_ZOOM_MAX);
  return {
    zoom,
    panX: (vpW - cw * zoom) / 2 - minX * zoom,
    panY: (vpH - ch * zoom) / 2 - minY * zoom,
  };
}

/** Positions for each chapter, by current view. Returns {id,x,y} list. */
export function layoutPositions(
  doc: StoryDoc,
  view: "board" | "timeline",
  orient: TimelineOrient
): { id: string; x: number; y: number }[] {
  if (view !== "timeline") {
    return doc.chapters.map((c) => ({ id: c.id, x: c.x, y: c.y }));
  }
  return timelineChapterPositions(doc.chapters, orient);
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
  if (chapters.length === 0) return { zoom: 1, panX: pad, panY: pad };
  const xs = chapters.map((c) => c.x);
  const ys = chapters.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + CARD_W;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + CARD_H;
  const cw = maxX - minX;
  const ch = maxY - minY;
  const zoom = Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, FIT_ZOOM_MAX);
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
