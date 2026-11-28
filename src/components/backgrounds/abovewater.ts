/*
 * Above water, night or day: shallow water seen from above, with the slowly
 * moving caustic net of light on the floor below and a few glints flashing
 * on the surface. The water itself is the sky gradient (sky.ts).
 *
 * Round 7, direction D, as Ray tuned it in the mockup
 * (docs/backgrounds/mockup/NOTES.md): a soft, patchy net, white by day and a
 * mid teal by night; glints mostly in a patch under the sun (which follows the
 * clock, as Sunny day's does) or the moon.
 *
 * The net's frames (causticNet.ts) take about half a second to compute, so a
 * worker computes them once and every Above water layer after that reuses
 * them. Until they arrive the water shows without its net, which then fades
 * in. Drawing a frame is cheap: each layer colors a frame of the loop the
 * first time it draws it, then repeats the tile across the window,
 * crossfading between two frames.
 */
import { countFor, currentScale, makeRng, type SceneRenderer, type Size } from "./engine";
import { NET, netBorder, netRows, netSide, points, type NetParams } from "./causticNet";
import { sunProgressAt } from "./sun";

export interface AboveWaterPalette {
  /** Net color as [r, g, b], and its peak alpha. */
  net: [number, number, number];
  netAlpha: number;
  /** Glint color "r,g,b", peak alpha, and size range in CSS px. */
  glint: string;
  glintAlpha: number;
  glintSize: [number, number];
  /** Where the glint patch sits: under the sun (follows the clock) or a fixed moon. */
  light: "sun" | "moon";
}

export const ABOVE_WATER_DAY: AboveWaterPalette = {
  net: [255, 255, 250],
  netAlpha: 0.6,
  glint: "255,255,252",
  glintAlpha: 0.95,
  glintSize: [10, 20],
  light: "sun",
};

export const ABOVE_WATER_NIGHT: AboveWaterPalette = {
  net: [84, 158, 152],
  netAlpha: 0.4,
  glint: "236,230,214",
  glintAlpha: 0.7,
  glintSize: [8, 16],
  light: "moon",
};

/** CSS px per net cell (the tile is NET.n cells across), the loop length, and the slow drift. */
const CELL = 2.2;
const LOOP = 14; // seconds
const DRIFT: [number, number] = [3, 2]; // px per second
const FADE_IN = 1.5; // seconds
const CLOCK_EVERY = 60; // seconds; the sun's patch moves slowly

/* ---------- The net's frames: computed once, shared ---------- */

/** The frames for each set of params asked for (in the app, only NET): computed once, shared. */
const netCache = new Map<string, Promise<Uint8Array[]>>();
/** If the worker hasn't answered by then, compute in idle slices instead. */
const WORKER_TIMEOUT_MS = 15000;

/**
 * The net's frames, from a worker. Where workers aren't available, or one
 * fails or never answers, they are computed one frame per idle slice instead,
 * so no single task is long. If even that fails the promise rejects and is
 * forgotten, so the next Above water layer tries again.
 */
export function loadNet(p: NetParams = NET): Promise<Uint8Array[]> {
  const key = JSON.stringify(p);
  const cached = netCache.get(key);
  if (cached) return cached;
  const t0 = performance.now();
  const done = (frames: Uint8Array[], via: string) => {
    try {
      performance.measure("estoria:caustic-net", { start: t0, detail: { via, frames: frames.length } });
    } catch {
      /* measure with options is missing in old browsers: the number is only for checking */
    }
    return frames;
  };
  const promise = new Promise<Uint8Array[]>((resolve, reject) => {
    const fallback = () => computeInSlices(p).then((f) => resolve(done(f, "idle")), reject);
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./causticNet.worker.ts", import.meta.url), { type: "module" });
    } catch {
      worker = null;
    }
    if (!worker) {
      fallback();
      return;
    }
    let settled = false;
    const finish = (frames: Uint8Array[] | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker?.terminate();
      if (frames) resolve(done(frames, "worker"));
      else fallback();
    };
    const timer = window.setTimeout(() => finish(null), WORKER_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<{ frames: Uint8Array[] }>) => finish(e.data?.frames?.length === p.frames ? e.data.frames : null);
    worker.onerror = () => finish(null);
    worker.onmessageerror = () => finish(null);
    worker.postMessage(p);
  });
  netCache.set(key, promise);
  promise.catch(() => {
    if (netCache.get(key) === promise) netCache.delete(key);
  });
  return promise;
}

/** Rows computed per piece in the idle fallback: about 0.7 ms each at the default size. */
const ROW_BAND = 8;

/**
 * The fallback: frames built a band of rows at a time, for as long as each
 * idle period lasts (or one band per timer tick where there's no
 * requestIdleCallback), so no task runs long.
 */
function computeInSlices(p: NetParams): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const M = netSide(p);
    const pts = points(p);
    const frames: Uint8Array[] = [];
    let cur = new Uint8Array(M * M);
    let row = 0;
    const hasIdle = typeof window.requestIdleCallback === "function";
    const next = () => (hasIdle ? window.requestIdleCallback(step) : window.setTimeout(() => step(null), 16));
    function step(deadline: IdleDeadline | null): void {
      try {
        do {
          netRows(p, frames.length, cur, row, row + ROW_BAND, pts);
          row += ROW_BAND;
          if (row >= p.n) {
            netBorder(p, cur);
            frames.push(cur);
            if (frames.length === p.frames) {
              resolve(frames);
              return;
            }
            cur = new Uint8Array(M * M);
            row = 0;
          }
        } while (deadline && deadline.timeRemaining() > 2);
      } catch (err) {
        reject(err);
        return;
      }
      next();
    }
    next();
  });
}

/* ---------- Glints ---------- */

interface Glint {
  band: boolean;
  u: number;
  v: number;
  size: number;
  per: number;
  ph: number;
  drift: number;
}

/** A short horizontal flash with a small upright arm, so it reads as light on a ripple, not a star. */
function glintSprite(rgb: string, scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const d = Math.max(4, Math.ceil(26 * scale));
  c.width = c.height = d;
  const g = c.getContext("2d");
  if (g) {
    const m = d / 2;
    const core = g.createRadialGradient(m, m, 0, m, m, d * 0.18);
    core.addColorStop(0, `rgba(${rgb},1)`);
    core.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = core;
    g.fillRect(0, 0, d, d);
    const th = Math.max(1, d / 26);
    const h = g.createLinearGradient(0, m, d, m);
    h.addColorStop(0, `rgba(${rgb},0)`);
    h.addColorStop(0.5, `rgba(${rgb},0.9)`);
    h.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = h;
    g.fillRect(0, m - th / 2, d, th * 1.3);
    const v = g.createLinearGradient(m, 0, m, d);
    v.addColorStop(0, `rgba(${rgb},0)`);
    v.addColorStop(0.5, `rgba(${rgb},0.9)`);
    v.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = v;
    g.fillRect(m - th / 2, d * 0.36, th, d * 0.28);
  }
  return c;
}

const gauss = (r: () => number) => (r() + r() + r() - 1.5) / 1.5;

/* ---------- The renderer ---------- */

export interface AboveWaterOptions {
  /** Where "now" comes from, for the sun's patch. Tests and previews pass a fixed time. */
  now?: () => Date;
  seed?: number;
  /** Where the net's frames come from. Defaults to the shared worker (`loadNet`); tests pass their own. */
  net?: () => Promise<Uint8Array[]>;
}

export function createAboveWater(palette: AboveWaterPalette, opts: AboveWaterOptions = {}): SceneRenderer {
  const now = opts.now ?? (() => new Date());
  const seed = opts.seed ?? 49;
  const maxDpr = 1.5; // the net is soft and the glints small; full retina buys nothing
  const N = NET.n;
  const M = netSide(NET);
  const T = N * CELL; // tile size in CSS px

  let glints: Glint[] = [];
  let sprite: HTMLCanvasElement | null = null;
  let raw: Uint8Array[] | null = null;
  const tiles: (HTMLCanvasElement | null)[] = [];
  let readyAt = -1; // scene time the net first drew, for the fade-in
  let shownStill = false; // a still frame showed the net (reduced motion), so there's nothing to fade in
  let sunP = 0.5;
  let lastClock = -Infinity;
  let invalidate: (() => void) | null = null;
  let alive = true;

  (opts.net ?? loadNet)().then(
    (frames) => {
      if (!alive) return;
      raw = frames;
      invalidate?.();
    },
    () => {
      /* No net this time: the water still shows, and the next layer retries. */
    },
  );

  /** Frame i colored for this palette, made the first time it's drawn (about 0.3 ms each). */
  function tile(i: number): HTMLCanvasElement | null {
    if (!raw) return null;
    const cached = tiles[i];
    if (cached) return cached;
    const c = document.createElement("canvas");
    c.width = c.height = M;
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(M, M);
    const px = new Uint32Array(img.data.buffer);
    const [r, gg, b] = palette.net;
    const rgb = (b << 16) | (gg << 8) | r; // little-endian RGBA in a Uint32
    const src = raw[i]!;
    for (let k = 0; k < src.length; k++) px[k] = ((Math.round(src[k]! * palette.netAlpha) & 255) << 24) | rgb;
    g.putImageData(img, 0, 0);
    tiles[i] = c;
    return c;
  }

  function lightAt(size: Size): { x: number; y: number } {
    if (palette.light === "sun") return { x: size.w * (0.1 + 0.8 * sunP), y: size.h * 0.34 };
    return { x: size.w * 0.66, y: size.h * 0.3 };
  }

  return {
    maxDpr,
    // The sun's patch follows the clock: a still frame is repainted once a minute.
    stillRefreshMs: palette.light === "sun" ? CLOCK_EVERY * 1000 : undefined,

    attach(fn) {
      invalidate = fn;
    },

    detach() {
      alive = false;
      invalidate = null;
      // Free the colored tiles' backing stores now (up to 24 x 242 x 242 RGBA), as the engine does its own canvases.
      for (const c of tiles) if (c) c.width = c.height = 0;
      tiles.length = 0;
      raw = null;
      sprite = null;
    },

    layout(size: Size) {
      const r = makeRng(seed);
      glints = Array.from({ length: countFor(size, palette.light === "sun" ? 18 : 14, palette.light === "sun" ? 10 : 8, palette.light === "sun" ? 40 : 30) }, () => {
        const band = r() < 0.5;
        return {
          band,
          u: band ? gauss(r) * 0.2 : r(),
          v: band ? gauss(r) * 0.3 : r(),
          size: palette.glintSize[0] + r() * (palette.glintSize[1] - palette.glintSize[0]),
          per: 1.8 + r() * 3.2,
          ph: r() * Math.PI * 2,
          drift: 2 + r() * 4,
        };
      });
      sprite = glintSprite(palette.glint, currentScale(maxDpr));
    },

    paintFrame(ctx, size, t, dt, still) {
      // `still`: a real still frame (reduced motion), not the repaint after a resize, which also has dt 0.
      if (palette.light === "sun" && (dt <= 0 || t - lastClock >= CLOCK_EVERY || t < lastClock)) {
        sunP = sunProgressAt(now());
        lastClock = t;
      }

      // The net: crossfade between two frames of the loop, tiled, drifting.
      const K = NET.frames;
      const f = ((((t / LOOP) % 1) + 1) % 1) * K;
      const i = Math.floor(f) % K;
      const fr = f - Math.floor(f);
      const a = tile(i);
      const b = tile((i + 1) % K);
      if (a && b) {
        // The fade-in starts on the first running frame with the net. A still frame never starts it: it is drawn
        // at a fixed time, and motion may then turn on with the clock back near 0. If a still frame already
        // showed the net, motion carries on at full strength instead of fading in again. Alpha stays 0 to 1.
        if (still) shownStill = true;
        else if (readyAt < 0) readyAt = shownStill ? t - FADE_IN : t;
        const fade = still ? 1 : Math.max(0, Math.min(1, (t - readyAt) / FADE_IN));
        const ox = mod(t * DRIFT[0], T);
        const oy = mod(t * DRIFT[1], T);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        for (const [img, w] of [
          [a, 1 - fr],
          [b, fr],
        ] as const) {
          ctx.globalAlpha = w * fade;
          for (let y = -oy; y < size.h; y += T) for (let x = -ox; x < size.w; x += T) ctx.drawImage(img, 1, 1, N, N, x, y, T, T);
        }
        ctx.globalAlpha = 1;
      }

      // Glints: brief, sharp flashes, most in a soft patch under the light, drifting with the water.
      if (!sprite) return;
      const L = lightAt(size);
      for (const g of glints) {
        const s = Math.max(0, Math.sin((t * 2 * Math.PI) / g.per + g.ph));
        const alpha = palette.glintAlpha * s ** 6;
        if (alpha < 0.01) continue;
        const x = g.band ? L.x + g.u * size.w + 10 * Math.sin(t * 0.15 + g.ph) : mod(g.u * size.w + g.drift * t, size.w + 20) - 10;
        const y = g.band ? L.y + g.v * size.h : g.v * size.h;
        const d = g.size * (0.7 + 0.5 * s);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    },
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
