import type { Chapter, StoryDoc, Vec2 } from "@/types";

/** Card dimensions on the board. */
export const CARD_W = 244;
export const CARD_H = 142;
/** Scene-node dimensions in the chapter-detail canvas. */
export const SCENE_W = 208;
export const SCENE_H = 124;

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
 * Lay chapters out on a grid with decaying jitter. Each successive call eases
 * toward a clean grid (amp shrinks) without ever snapping perfectly straight,
 * giving a hand-arranged feel. `cols` defaults to 4; pass a value (e.g. from
 * `bestColumns`) to size the grid to the available board space.
 */
export function autoArrange(chapters: Chapter[], arrangeN: number, cols = 4): ArrangeResult {
  const c0 = Math.max(1, cols);
  const gapX = GRID_GAP_X;
  const gapY = GRID_GAP_Y;
  const m = GRID_MARGIN;
  const amp = Math.pow(0.6, arrangeN);
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

/** Positions for each chapter, by current view. Returns {id,x,y} list. */
export function layoutPositions(
  doc: StoryDoc,
  view: "board" | "timeline",
  orient: TimelineOrient
): { id: string; x: number; y: number }[] {
  if (view !== "timeline") {
    return doc.chapters.map((c) => ({ id: c.id, x: c.x, y: c.y }));
  }
  const out: { id: string; x: number; y: number }[] = [];
  if (orient === "vertical") {
    let y = 64;
    const colX = 300;
    doc.chapters.forEach((c, i) => {
      if (i > 0 && c.act !== doc.chapters[i - 1].act) y += 54;
      out.push({ id: c.id, x: colX, y });
      y += CARD_H + 72;
    });
  } else {
    const y = 214;
    let x = 60;
    doc.chapters.forEach((c, i) => {
      if (i > 0 && c.act !== doc.chapters[i - 1].act) x += 46;
      out.push({ id: c.id, x, y });
      x += 286;
    });
  }
  return out;
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

const SCENE_GAP_X = 44;
const SCENE_GAP_Y = 40;
const SCENE_MARGIN = 18;

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
export function sceneAutoArrange(scenes: string[], arrangeN: number, cols?: number): Vec2[] {
  const gx = SCENE_GAP_X;
  const gy = SCENE_GAP_Y;
  const m = SCENE_MARGIN;
  const c0 = Math.max(1, cols ?? sceneCols(scenes.length));
  const amp = Math.pow(0.6, arrangeN);
  return scenes.map((_, i) => {
    const col = i % c0;
    const row = Math.floor(i / c0);
    const jx = (prand(i + 1) * 2 - 1) * 18 * amp;
    const jy = ((prand(i + 9) * 2 - 1) * 18 + (col % 2 === 0 ? 12 : -10)) * amp;
    return { x: m + col * (SCENE_W + gx) + jx, y: m + row * (SCENE_H + gy) + jy };
  });
}
