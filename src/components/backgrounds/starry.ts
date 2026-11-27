/*
 * Ported from TTePub (src/ui/backgrounds/starry.ts), warmed for Estoria's
 * palette: both star colors are warm whites (TTePub has a cool blue-white for
 * some). Motion is unchanged.
 *
 * Starry night: a still field of faint stars painted once, a few dozen that
 * twinkle (a few of them bright, with a soft four-point glint), and now and
 * then a shooting star: a thin quick streak with a fading tail, gone in under
 * a second. Thinner toward the bottom, where the sky meets the page's --bg.
 */
import { countFor, currentScale, makeRng, softDot, type SceneRenderer, type Size } from "./engine";

/* Warm white near dark --ink, and a deeper parchment white for a few (the "cool" ones in TTePub). */
const WARM = "238,228,210";
const COOL = "222,208,186";

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  cool: boolean;
}

interface Twinkler extends Star {
  w: number; // rad/s
  ph: number;
  /** Bright ones get a glint and a deeper swing. */
  bright: boolean;
}

/** Seconds between shooting stars, picked at random in this range. */
const SHOOT_GAP: [number, number] = [8, 25];
const SHOOT_LIFE: [number, number] = [0.55, 0.85]; // seconds on screen
const SHOOT_SPEED: [number, number] = [520, 820]; // px/s
const SHOOT_TAIL: [number, number] = [90, 150]; // px

interface Shooter {
  start: number;
  life: number;
  x: number;
  y: number;
  dx: number; // unit direction
  dy: number;
  speed: number;
  tail: number;
}

export function createStarry(seed = 11): SceneRenderer {
  const maxDpr = 2;
  let stars: Star[] = [];
  let twinklers: Twinkler[] = [];
  let sprites: { warm: HTMLCanvasElement; cool: HTMLCanvasElement; glint: HTMLCanvasElement } | null = null;
  // Shooting stars are scheduled as time goes by, from their own seeded stream.
  let shootRnd = makeRng(seed * 31 + 7);
  let shooter: Shooter | null = null;
  let nextShoot = 4 + shootRnd() * 6; // the first one comes fairly soon
  let lastT = 0;

  function spawn(t: number, size: Size): Shooter {
    const r = shootRnd;
    const span = (a: [number, number]) => a[0] + r() * (a[1] - a[0]);
    const ang = ((15 + r() * 40) * Math.PI) / 180; // below the horizontal
    const dir = r() < 0.5 ? 1 : -1;
    return {
      start: t,
      life: span(SHOOT_LIFE),
      x: size.w * (0.1 + r() * 0.8),
      y: size.h * (0.03 + r() * 0.4),
      dx: Math.cos(ang) * dir,
      dy: Math.sin(ang),
      speed: span(SHOOT_SPEED),
      tail: span(SHOOT_TAIL),
    };
  }

  return {
    maxDpr,

    layout(size: Size) {
      const rnd = makeRng(seed);
      // Bias toward the top: y = h * u^1.5 puts most stars in the upper half.
      const place = (): Pick<Star, "x" | "y"> => ({ x: rnd() * size.w, y: size.h * Math.pow(rnd(), 1.5) });
      stars = Array.from({ length: countFor(size, 130, 60, 320) }, () => {
        const small = rnd() < 0.82;
        return {
          ...place(),
          r: small ? 0.35 + rnd() * 0.45 : 0.75 + rnd() * 0.55,
          a: small ? 0.16 + rnd() * 0.22 : 0.3 + rnd() * 0.25,
          cool: rnd() < 0.25,
        };
      });
      const nTw = countFor(size, 24, 14, 50);
      twinklers = Array.from({ length: nTw }, (_, i) => {
        const bright = i < Math.max(3, Math.round(nTw / 7));
        return {
          ...place(),
          r: bright ? 3.2 + rnd() * 1.4 : 1.8 + rnd() * 1.6,
          a: bright ? 0.85 + rnd() * 0.15 : 0.4 + rnd() * 0.3,
          cool: rnd() < 0.3,
          w: (2 * Math.PI) / (bright ? 4 + rnd() * 5 : 2.5 + rnd() * 6),
          ph: rnd() * Math.PI * 2,
          bright,
        };
      });
      const s = currentScale(maxDpr);
      sprites = { warm: softDot(WARM, 8, s, 0.12), cool: softDot(COOL, 8, s, 0.12), glint: glintSprite(WARM, 24, s) };
    },

    paintStatic(ctx) {
      for (const cool of [false, true]) {
        ctx.fillStyle = `rgb(${cool ? COOL : WARM})`;
        for (const st of stars) {
          if (st.cool !== cool) continue;
          ctx.globalAlpha = st.a;
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },

    paintFrame(ctx, size, t, dt) {
      if (!sprites) return;
      for (const st of twinklers) {
        // A wide swing, about 15% to 100% of the star's peak; bright ones dip deeper and flare higher.
        const s = 0.5 + 0.5 * Math.sin(t * st.w + st.ph);
        const k = st.bright ? 0.12 + 0.88 * s * s : 0.2 + 0.8 * s;
        ctx.globalAlpha = st.a * k;
        const d = st.r * 2;
        ctx.drawImage(st.cool ? sprites.cool : sprites.warm, st.x - st.r, st.y - st.r, d, d);
        if (st.bright) {
          // The glint shows only near the top of the swing.
          const g = Math.max(0, (s - 0.55) / 0.45);
          if (g > 0) {
            ctx.globalAlpha = st.a * 0.7 * g * g;
            const gd = st.r * 6;
            ctx.drawImage(sprites.glint, st.x - gd / 2, st.y - gd / 2, gd, gd);
          }
        }
      }
      ctx.globalAlpha = 1;

      // Shooting stars only while running; a still frame (dt 0) shows none.
      if (t < lastT) {
        // Time went back (a new runner): restart the schedule.
        shootRnd = makeRng(seed * 31 + 7);
        shooter = null;
        nextShoot = t + 4 + shootRnd() * 6;
      }
      lastT = t;
      if (dt <= 0) return;
      if (!shooter && t >= nextShoot) {
        shooter = spawn(t, size);
        nextShoot = t + SHOOT_GAP[0] + shootRnd() * (SHOOT_GAP[1] - SHOOT_GAP[0]);
      }
      if (shooter) {
        if (t - shooter.start > shooter.life) shooter = null;
        else paintShooter(ctx, shooter, t);
      }
    },
  };
}

/** A thin bright head and a tail that fades behind it; fades in fast and out a little slower. */
function paintShooter(ctx: CanvasRenderingContext2D, s: Shooter, t: number): void {
  const age = t - s.start;
  const p = age / s.life;
  const hx = s.x + s.dx * s.speed * age;
  const hy = s.y + s.dy * s.speed * age;
  // The tail grows to full length over the first fifth of its life.
  const tail = s.tail * Math.min(1, p / 0.2);
  const tx = hx - s.dx * tail;
  const ty = hy - s.dy * tail;
  const fade = p < 0.15 ? p / 0.15 : 1 - Math.pow((p - 0.15) / 0.85, 1.6);

  const g = ctx.createLinearGradient(tx, ty, hx, hy);
  g.addColorStop(0, `rgba(${WARM},0)`);
  g.addColorStop(0.7, `rgba(${WARM},${0.28 * fade})`);
  g.addColorStop(1, `rgba(${WARM},${0.75 * fade})`);
  ctx.strokeStyle = g;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.stroke();
}

/** A soft four-point glint: two thin crossed rays fading from the center. */
function glintSprite(rgb: string, px: number, scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const d = Math.max(4, Math.ceil(px * scale));
  c.width = c.height = d;
  const g = c.getContext("2d");
  if (g) {
    const m = d / 2;
    const th = Math.max(1, d / 28);
    for (const horizontal of [true, false]) {
      const grad = horizontal ? g.createLinearGradient(0, m, d, m) : g.createLinearGradient(m, 0, m, d);
      grad.addColorStop(0, `rgba(${rgb},0)`);
      grad.addColorStop(0.5, `rgba(${rgb},1)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      if (horizontal) g.fillRect(0, m - th / 2, d, th);
      else g.fillRect(m - th / 2, 0, th, d);
    }
  }
  return c;
}
