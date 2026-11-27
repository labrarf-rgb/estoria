/*
 * Underwater, night or day: a few pale light shafts that sway very slowly,
 * and sparse motes (by day, small bubbles with a soft rim) rising.
 *
 * Adapted from TTePub (src/ui/backgrounds/underwater.ts) as Ray tuned it in
 * the Estoria mockup (docs/backgrounds/mockup/NOTES.md, round 3): **no
 * caustic shimmer**, by night or by day. The water is the sky gradient
 * (sky.ts); this file draws only the shafts and the motes. Colors are warmed:
 * TTePub's aqua is pulled toward a muted sea green.
 */
import { countFor, currentScale, haloDot, makeRng, softDot, type SceneRenderer, type Size } from "./engine";

export interface UnderwaterPalette {
  /** Shaft light. */
  light: [number, number, number];
  /** Shaft alpha range. */
  shaftAlpha: [number, number];
  /** Mote core "r,g,b", and an optional halo "r,g,b,a" that turns motes into bubbles. */
  mote: string;
  moteHalo?: string;
  moteAlpha: [number, number];
  /** Multiplies mote size. */
  moteSize: number;
}

/* Night: a pale sea-green light, low in chroma so it sits with the warm dark tokens. */
export const UNDERWATER_NIGHT: UnderwaterPalette = {
  light: [204, 224, 204],
  shaftAlpha: [0.03, 0.055],
  mote: "206,226,210",
  moteAlpha: [0.2, 0.42],
  moteSize: 1,
};

/* Day: shallow, sunlit water. Warm white shafts, and small bubbles with a soft sea-green rim. */
export const UNDERWATER_DAY: UnderwaterPalette = {
  light: [255, 252, 240],
  shaftAlpha: [0.18, 0.26],
  mote: "253,252,246",
  moteHalo: "78,124,112,0.45",
  moteAlpha: [0.45, 0.75],
  moteSize: 2.2,
};

interface Mote {
  x: number;
  y: number;
  r: number;
  v: number;
  a: number;
  amp: number;
  w: number;
  ph: number;
}

interface Shaft {
  x: number; // top center, fraction of width
  a: number;
  w: number;
  ph: number;
  /** Pre-rendered soft shaft and where its top center sits inside it. */
  img: HTMLCanvasElement;
  cx: number;
  width: number;
}

/** Shafts are drawn at this fraction of css px, then stretched: free extra blur. */
const SHAFT_RES = 0.25;
/** Nested fills per shaft; more gives a smoother falloff at the edges. */
const SHAFT_STEPS = 9;

export function createUnderwater(palette: UnderwaterPalette = UNDERWATER_NIGHT, seed = 5): SceneRenderer {
  const LIGHT = palette.light;
  const maxDpr = 1.5; // everything here is soft; full retina buys nothing
  let motes: Mote[] = [];
  let shafts: Shaft[] = [];
  let sprite: HTMLCanvasElement | null = null;
  let shaftH = 0;

  return {
    maxDpr,

    layout(size: Size) {
      const rnd = makeRng(seed);
      motes = Array.from({ length: countFor(size, 11, 8, 24) }, () => ({
        x: rnd() * size.w,
        y: rnd() * size.h,
        r: 0.9 + rnd() * 1.4,
        v: 5 + rnd() * 9,
        a: palette.moteAlpha[0] + rnd() * (palette.moteAlpha[1] - palette.moteAlpha[0]),
        amp: 5 + rnd() * 10,
        w: (2 * Math.PI) / (6 + rnd() * 8),
        ph: rnd() * Math.PI * 2,
      }));
      shaftH = size.h * 0.8;
      shafts = Array.from({ length: 4 }, (_, i) => {
        const top = 50 + rnd() * 70;
        const bottom = 180 + rnd() * 200;
        const lean = (rnd() - 0.5) * size.w * 0.14;
        return {
          x: 0.12 + i * 0.25 + (rnd() - 0.5) * 0.1,
          a: palette.shaftAlpha[0] + rnd() * (palette.shaftAlpha[1] - palette.shaftAlpha[0]),
          w: (2 * Math.PI) / (30 + rnd() * 26),
          ph: rnd() * Math.PI * 2,
          ...renderShaft(top, bottom, lean, shaftH, LIGHT),
        };
      });
      const scale = currentScale(maxDpr);
      sprite = palette.moteHalo ? haloDot(palette.mote, palette.moteHalo, 8, scale) : softDot(palette.mote, 8, scale, 0.3);
    },

    paintFrame(ctx, size, t) {
      paintShafts(ctx, size, t);
      if (!sprite) return;
      const H = size.h + 40;
      for (const m of motes) {
        const y = size.h + 20 - mod(m.y + m.v * t, H);
        const x = m.x + m.amp * Math.sin(t * m.w + m.ph);
        // Fade out as they near the surface.
        const k = Math.min(1, Math.max(0, y / (size.h * 0.35)));
        ctx.globalAlpha = m.a * k;
        const d = m.r * 2.4 * palette.moteSize;
        ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    },
  };

  function paintShafts(ctx: CanvasRenderingContext2D, size: Size, t: number): void {
    for (const s of shafts) {
      const sway = Math.sin(t * s.w + s.ph);
      ctx.globalAlpha = s.a * (0.65 + 0.35 * sway);
      const left = s.x * size.w + sway * 22 - s.cx;
      ctx.drawImage(s.img, left, 0, s.width, shaftH);
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * One light shaft as a small canvas: a trapezoid from `top` wide at the
 * surface to `bottom` wide at depth `h`, offset by `lean`, built from nested
 * fills so its edges fall off softly and its light fades with depth.
 */
function renderShaft(
  top: number,
  bottom: number,
  lean: number,
  h: number,
  light: [number, number, number],
): { img: HTMLCanvasElement; cx: number; width: number } {
  const pad = 30;
  // Leftmost point lands on `pad`, rightmost on `width - pad`.
  const cx = pad + Math.max(top / 2, bottom / 2 - lean);
  const width = cx + Math.max(top / 2, lean + bottom / 2) + pad;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(width * SHAFT_RES));
  c.height = Math.max(1, Math.ceil(h * SHAFT_RES));
  const g = c.getContext("2d");
  if (g) {
    g.scale(SHAFT_RES, SHAFT_RES);
    const grad = g.createLinearGradient(0, 0, 0, h);
    const rgb = light.join(",");
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.5, `rgba(${rgb},0.4)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.globalAlpha = 1 / SHAFT_STEPS;
    for (let i = 0; i < SHAFT_STEPS; i++) {
      const k = 1 - i / SHAFT_STEPS; // full width down to a narrow core
      g.beginPath();
      g.moveTo(cx - (top * k) / 2, 0);
      g.lineTo(cx + (top * k) / 2, 0);
      g.lineTo(cx + lean + (bottom * k) / 2, h);
      g.lineTo(cx + lean - (bottom * k) / 2, h);
      g.closePath();
      g.fill();
    }
  }
  return { img: c, cx, width };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
