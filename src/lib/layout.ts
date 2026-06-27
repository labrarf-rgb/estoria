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

/**
 * Lay chapters out on a grid with decaying jitter. Each successive call eases
 * toward a clean grid (amp shrinks) without ever snapping perfectly straight,
 * giving a hand-arranged feel.
 */
export function autoArrange(chapters: Chapter[], arrangeN: number): ArrangeResult {
  const cols = 4;
  const gapX = 72;
  const gapY = 82;
  const m = 46;
  const amp = Math.pow(0.6, arrangeN);
  const next = chapters.map((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
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
  pad = 72
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
  const zoom = Math.min((vpW - pad * 2) / cw, (vpH - pad * 2) / ch, 1.05);
  return {
    zoom,
    panX: (vpW - cw * zoom) / 2 - minX * zoom,
    panY: (vpH - ch * zoom) / 2 - minY * zoom,
  };
}

/** Scene-node grid columns by scene count. */
function sceneCols(n: number): number {
  return n <= 1 ? 1 : n <= 4 ? 2 : 3;
}

/** Lay scene nodes for a chapter's detail canvas, with decaying jitter. */
export function sceneAutoArrange(scenes: string[], arrangeN: number): Vec2[] {
  const gx = 44;
  const gy = 40;
  const m = 18;
  const cols = sceneCols(scenes.length);
  const amp = Math.pow(0.6, arrangeN);
  return scenes.map((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jx = (prand(i + 1) * 2 - 1) * 18 * amp;
    const jy = ((prand(i + 9) * 2 - 1) * 18 + (col % 2 === 0 ? 12 : -10)) * amp;
    return { x: m + col * (SCENE_W + gx) + jx, y: m + row * (SCENE_H + gy) + jy };
  });
}
