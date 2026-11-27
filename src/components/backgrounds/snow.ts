/*
 * Ported from TTePub (src/ui/backgrounds/snow.ts), warmed for Estoria: warm
 * white flakes at night and warm taupe by day (TTePub: cool white and
 * blue-grey). Motion is unchanged.
 *
 * Snow, night or day: sparse flakes in three depth layers. Far flakes are
 * small, faint and slow; near ones a little larger and quicker. Each sways on
 * its own slow sine with a faint shared breeze. Positions are a pure function
 * of time, so a still frame is just one sample of the same motion.
 */
import { countFor, currentScale, haloDot, makeRng, softDot, type SceneRenderer, type Size } from "./engine";

export interface SnowPalette {
  /** Flake core color as "r,g,b". */
  flake: string;
  /** Optional cool shadow as "r,g,b,a" that the core melts into, so flakes read on pale paper. */
  rim?: string;
  /** Multiplies every flake's alpha (capped at 1). */
  alpha: number;
  /** Multiplies every flake's drawn size. */
  size: number;
  /** Multiplies the flake count per layer. */
  density: number;
}

/* Night: a warm white just above dark --ink. */
export const SNOW_NIGHT: SnowPalette = { flake: "240,232,220", alpha: 1, size: 1, density: 1 };
/*
 * Day: a soft warm taupe flake, like snow seen against a bright overcast sky.
 * It fades out from the center with no lighter core, so it never reads as a
 * ring or a bubble; a little larger and denser than at night.
 */
export const SNOW_DAY: SnowPalette = { flake: "156,144,124", alpha: 1.4, size: 1.8, density: 1.25 };

interface Layer {
  perMp: number;
  max: number;
  r: [number, number]; // radius range, CSS px
  v: [number, number]; // fall speed range, px/s
  a: [number, number]; // alpha range
  sway: [number, number]; // sway amplitude range, px
}

const LAYERS: Layer[] = [
  { perMp: 30, max: 70, r: [0.9, 1.3], v: [9, 14], a: [0.28, 0.42], sway: [6, 14] },
  { perMp: 17, max: 40, r: [1.5, 2.1], v: [15, 22], a: [0.38, 0.55], sway: [10, 22] },
  { perMp: 6, max: 14, r: [2.4, 3.2], v: [24, 32], a: [0.45, 0.65], sway: [16, 30] },
];

interface Flake {
  x: number;
  y: number;
  r: number;
  v: number;
  a: number;
  amp: number;
  w: number;
  ph: number;
}

const BREEZE = 3; // px/s, drifting right

export function createSnow(palette: SnowPalette, seed = 23): SceneRenderer {
  const maxDpr = 2;
  let layers: Flake[][] = [];
  let sprite: HTMLCanvasElement | null = null;

  return {
    maxDpr,

    layout(size: Size) {
      const rnd = makeRng(seed);
      const span = (range: [number, number]) => range[0] + rnd() * (range[1] - range[0]);
      layers = LAYERS.map((L) =>
        Array.from({ length: countFor(size, L.perMp * palette.density, 4, Math.round(L.max * palette.density)) }, () => ({
          x: rnd() * size.w,
          y: rnd() * size.h,
          r: span(L.r),
          v: span(L.v),
          a: Math.min(1, span(L.a) * palette.alpha),
          amp: span(L.sway),
          w: (2 * Math.PI) / (7 + rnd() * 8),
          ph: rnd() * Math.PI * 2,
        })),
      );
      const scale = currentScale(maxDpr);
      sprite = palette.rim ? haloDot(palette.flake, palette.rim, 12, scale) : softDot(palette.flake, 12, scale, palette.size > 1 ? 0.3 : 0.4);
    },

    paintFrame(ctx, size, t) {
      if (!sprite) return;
      const pad = 40; // wrap off screen so flakes never pop in at an edge
      const W = size.w + pad * 2;
      const H = size.h + pad * 2;
      for (const flakes of layers) {
        for (const f of flakes) {
          const y = mod(f.y + f.v * t, H) - pad;
          const x = mod(f.x + BREEZE * t + f.amp * Math.sin(t * f.w + f.ph), W) - pad;
          // The sprite's soft edge makes the visible flake about half its box.
          const d = f.r * 2.6 * palette.size;
          ctx.globalAlpha = f.a;
          ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
        }
      }
      ctx.globalAlpha = 1;
    },
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
