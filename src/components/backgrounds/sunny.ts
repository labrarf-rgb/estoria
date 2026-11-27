/*
 * Sunny day: the sun sits on an arc that follows the local time, with a warm
 * glow around it, a fan of seven soft gold beams that sways a few degrees
 * while each beam breathes out of phase, and gold motes drifting away from
 * the sun. Glow and beams are lighter than --bg, so they only add light and
 * text never loses contrast.
 *
 * This is the look Ray approved in the Estoria mockup
 * (docs/backgrounds/mockup/NOTES.md, round 2, kept in round 4), which is
 * simpler than TTePub's sunny.ts: no dapples, no bloom, no shimmer along the
 * beams (Ray preferred it without them). What it shares with TTePub:
 *  - the clock mapping in sun.ts (6:00 to 18:00 across the arc, night hours
 *    read as the same clock time in the morning);
 *  - the clock is read about once a minute, and the sun eases to a new spot
 *    with a 6 s time constant instead of jumping;
 *  - a still frame (reduced motion) keeps the time-based position, with no
 *    sway or breathing, and is repainted once a minute.
 * The sun's arc stays inside the window (Estoria's mockup), where TTePub's
 * lifts just above the top edge at noon.
 */
import { countFor, currentScale, makeRng, softDot, type SceneRenderer, type Size } from "./engine";
import { sunProgressAt } from "./sun";

const BEAMS = 7;
/** Total angle the fan covers, radians. */
const SPREAD = (60 * Math.PI) / 180;
/** The fan sways this far each way (radians), over FAN_PERIOD seconds. */
const FAN_SWING = (3.5 * Math.PI) / 180;
const FAN_PERIOD = 22;
/** How often the clock is read, and how quickly the sun eases to a new spot. */
const CLOCK_EVERY = 60; // seconds
const EASE_TAU = 6; // seconds to cover about 63% of the way
/* Motes: a soft gold that reads on cream. */
const MOTE = "201,160,88";

interface Beam {
  /** Position in the fan, -1 (one edge) to 1 (the other). */
  off: number;
  /** Half the beam's opening, radians. */
  hw: number;
  /** Breathing period, seconds, and phase. */
  per: number;
  ph: number;
}

interface Mote {
  x: number;
  y: number;
  v: number;
  r: number;
  a: number;
  w: number;
  ph: number;
}

export interface SunnyOptions {
  /** Where "now" comes from. Tests pass a fixed time. */
  now?: () => Date;
  seed?: number;
}

/** Where the sun is drawn for a day progress `p` (0 at 6:00, 1 at 18:00), in CSS px, and how warm its glow is. */
export function sunSpot(p: number, size: Size): { x: number; y: number; warm: string } {
  const u = Math.max(0, Math.min(1, p));
  const x = size.w * (0.1 + 0.8 * u);
  const y = size.h * (0.46 - 0.4 * Math.sin(Math.PI * u));
  // Whiter at noon, warmer toward sunrise and sunset.
  const e = (Math.abs(u - 0.5) * 2) ** 2;
  const warm = [255, Math.round(247 - 19 * e), Math.round(226 - 30 * e)].join(",");
  return { x, y, warm };
}

export function createSunny(opts: SunnyOptions = {}): SceneRenderer {
  const now = opts.now ?? (() => new Date());
  const seed = opts.seed ?? 5;
  const maxDpr = 2;
  let beams: Beam[] = [];
  let motes: Mote[] = [];
  let sprite: HTMLCanvasElement | null = null;
  // The sun's progress across the day: where it's drawn, and where it's heading.
  let progress = -1; // -1 until the first frame snaps it into place
  let target = 0;
  let lastClock = -Infinity;

  return {
    maxDpr,
    // A still frame still follows the clock: repaint it once a minute.
    stillRefreshMs: CLOCK_EVERY * 1000,

    layout(size: Size) {
      const rnd = makeRng(seed);
      motes = Array.from({ length: countFor(size, 16, 10, 36) }, () => ({
        x: rnd() * size.w,
        y: rnd() * size.h,
        v: 3 + rnd() * 5,
        r: 0.8 + rnd() * 1.4,
        a: 0.18 + rnd() * 0.25,
        w: (2 * Math.PI) / (3 + rnd() * 5),
        ph: rnd() * Math.PI * 2,
      }));
      beams = Array.from({ length: BEAMS }, (_, i) => ({
        off: (i - (BEAMS - 1) / 2) / ((BEAMS - 1) / 2),
        hw: ((2.2 + rnd() * 2) * Math.PI) / 180,
        per: 9 + rnd() * 6,
        ph: rnd() * Math.PI * 2,
      }));
      sprite = softDot(MOTE, 8, currentScale(maxDpr), 0.3);
    },

    paintFrame(ctx, size, t, dt) {
      const still = dt <= 0;
      // Read the clock on the first frame, then about once a minute (and on every still repaint).
      if (still || progress < 0 || t - lastClock >= CLOCK_EVERY || t < lastClock) {
        target = sunProgressAt(now());
        lastClock = t;
      }
      if (still || progress < 0) progress = target;
      else progress += (target - progress) * Math.min(1, dt / EASE_TAU);

      const { x, y, warm } = sunSpot(progress, size);
      const R = Math.max(size.w, size.h);

      // The glow.
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.6);
      g.addColorStop(0, `rgba(${warm},0.8)`);
      g.addColorStop(0.18, `rgba(${warm},0.42)`);
      g.addColorStop(0.5, `rgba(${warm},0.12)`);
      g.addColorStop(1, `rgba(${warm},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size.w, size.h);

      // The beams fan out toward a spot low in the middle of the page.
      const dir = Math.atan2(size.h * 0.7 - y, size.w * 0.5 - x);
      const sway = still ? 0 : FAN_SWING * Math.sin((t * 2 * Math.PI) / FAN_PERIOD);
      const L = R * 1.4;
      for (const b of beams) {
        const a = dir + sway + (b.off * SPREAD) / 2;
        // Each beam breathes between about 45% and 100%; a still frame holds them at 80%.
        const k = still ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / b.per + b.ph));
        const bg = ctx.createRadialGradient(x, y, 0, x, y, L);
        bg.addColorStop(0, `rgba(${warm},${0.2 * k})`);
        bg.addColorStop(0.5, `rgba(${warm},${0.07 * k})`);
        bg.addColorStop(1, `rgba(${warm},0)`);
        ctx.fillStyle = bg;
        // Two nested wedges: a soft edge and a brighter core.
        for (const f of [1, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a - b.hw * f) * L, y + Math.sin(a - b.hw * f) * L);
          ctx.lineTo(x + Math.cos(a + b.hw * f) * L, y + Math.sin(a + b.hw * f) * L);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Motes drift away from the sun and a little downward, catching the light now and then.
      if (!sprite) return;
      for (const m of motes) {
        const ax = m.x - x;
        const ay = m.y - y;
        const d = Math.hypot(ax, ay) || 1;
        const px = mod(m.x + (ax / d) * m.v * t, size.w + 40) - 20;
        const py = mod(m.y + ((ay / d) * m.v + 2) * t, size.h + 40) - 20;
        const s = m.r * 3;
        ctx.globalAlpha = m.a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * m.w + m.ph)));
        ctx.drawImage(sprite, px - s / 2, py - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    },
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
