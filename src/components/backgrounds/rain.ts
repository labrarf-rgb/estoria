/*
 * Rain, night or day: short streaks at low contrast in three depth layers,
 * slanted a little by the same light wind. Positions are a pure function of
 * time.
 *
 * Adapted from TTePub (src/ui/backgrounds/rain.ts) as Ray tuned it in the
 * Estoria mockup (docs/backgrounds/mockup/NOTES.md, rounds 3 and 4):
 *  - half the speed (85 to 190 px/s, TTePub 170 to 380);
 *  - shorter streaks (3 to 14 px, TTePub 9 to 28), and varied: most drops are
 *    short and a few run longer (length skewed by r^2), and each drop has one
 *    of three strengths and widths;
 *  - warm colors: a warm grey-white at night, sepia slate by day;
 *  - the wind from the other side: down and to the right, as in the mockup.
 * Drawn as 3 layers x 3 strengths = 9 paths and strokes a frame.
 *
 * Round 7 (NOTES.md, "Ray's picks", A · Brighter): Ray found the rain too
 * subtle, so both palettes are about twice as strong and streaks are 1.2
 * times as wide. Drop counts, lengths and speeds are unchanged.
 */
import { countFor, makeRng, type SceneRenderer, type Size } from "./engine";

export interface RainPalette {
  /** Streak color as "r,g,b". */
  streak: string;
  /** Alpha per layer, far to near (before the per-drop strength). */
  alpha: [number, number, number];
  /** Multiplies the drop count per layer. */
  density: number;
  /** Multiplies every streak's width. */
  width: number;
}

/* Night: a warm grey-white, still below dark --ink (before round 7: 222,212,196 at 0.09 to 0.17). */
export const RAIN_NIGHT: RainPalette = { streak: "230,222,208", alpha: [0.19, 0.27, 0.36], density: 1, width: 1.2 };
/* Day: a sepia slate (before round 7: 108,96,80 at 0.15 to 0.29), strong enough to notice on cream. */
export const RAIN_DAY: RainPalette = { streak: "100,88,72", alpha: [0.32, 0.46, 0.6], density: 1.4, width: 1.2 };

interface Layer {
  perMp: number;
  max: number;
  len: [number, number];
  v: [number, number];
  width: number;
}

const LAYERS: Layer[] = [
  { perMp: 60, max: 110, len: [3, 7], v: [85, 110], width: 0.75 },
  { perMp: 30, max: 60, len: [5, 10], v: [115, 150], width: 0.95 },
  { perMp: 12, max: 30, len: [7, 14], v: [150, 190], width: 1.15 },
];

/** Each drop's strength: a share of its layer's alpha, with a matching width step. */
const STRENGTH = [0.5, 0.75, 1] as const;

/**
 * Horizontal drift per unit of fall: a gentle slant down and to the right, as
 * in the approved mockup (TTePub slants -0.14, down and to the left).
 */
const SLANT = 0.16;

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
  /** Index into STRENGTH. */
  s: number;
}

export function createRain(palette: RainPalette, seed = 37): SceneRenderer {
  let layers: Drop[][] = [];

  return {
    maxDpr: 2,

    layout(size: Size) {
      const rnd = makeRng(seed);
      layers = LAYERS.map((L) =>
        Array.from({ length: countFor(size, L.perMp * palette.density, 6, Math.round(L.max * palette.density)) }, () => {
          const k = rnd();
          return {
            x: rnd() * size.w,
            y: rnd() * size.h,
            len: L.len[0] + k * k * (L.len[1] - L.len[0]),
            v: L.v[0] + rnd() * (L.v[1] - L.v[0]),
            s: Math.min(STRENGTH.length - 1, Math.floor(rnd() * STRENGTH.length)),
          };
        }),
      );
    },

    paintFrame(ctx, size, t) {
      const pad = 40;
      const W = size.w + pad * 2 + Math.abs(SLANT) * size.h;
      const H = size.h + pad * 2;
      ctx.lineCap = "round";
      layers.forEach((drops, i) => {
        const L = LAYERS[i]!;
        STRENGTH.forEach((k, si) => {
          ctx.strokeStyle = `rgba(${palette.streak},${(palette.alpha[i] ?? 0.1) * k})`;
          ctx.lineWidth = L.width * palette.width * (0.8 + 0.2 * si);
          ctx.beginPath();
          for (const d of drops) {
            if (d.s !== si) continue;
            const fall = d.v * t;
            const y = mod(d.y + fall, H) - pad;
            const x = mod(d.x + SLANT * fall, W) - pad;
            ctx.moveTo(x, y);
            ctx.lineTo(x + SLANT * d.len, y + d.len);
          }
          ctx.stroke();
        });
      });
    },
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
