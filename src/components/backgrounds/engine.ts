/*
 * Ported from TTePub (src/ui/backgrounds/engine.ts). Two additions: the
 * canvases also refit when devicePixelRatio changes (the window moved to a
 * monitor with a different scale, or browser zoom), not only on resize; and a
 * renderer whose content arrives later (Above water's net, from a worker) can
 * ask for a repaint, so a still frame doesn't miss it.
 *
 * The scene loop: two stacked canvases (a static layer painted on resize, a
 * live layer cleared and painted each tick), about 30 fps, scaled by
 * devicePixelRatio, paused while the tab is hidden, and a single still frame
 * under prefers-reduced-motion. Scene code only draws; this file owns timing,
 * sizing and cleanup.
 */

export interface Size {
  /** CSS pixels. */
  w: number;
  h: number;
}

export interface SceneRenderer {
  /** Highest devicePixelRatio worth rendering at (soft scenes need less). */
  maxDpr: number;
  /** New size: rebuild particles and cached sprites/gradients. */
  layout(size: Size): void;
  /**
   * For a still frame that must keep up with something slow (Sunny day's
   * clock): repaint it this often while the tab is visible. Optional.
   */
  stillRefreshMs?: number;
  /**
   * Given a function that repaints a still frame (a running loop repaints on
   * its next tick anyway), for content that arrives after the first frame.
   * Optional.
   */
  attach?(invalidate: () => void): void;
  /** Called once when the runner stops, so pending work can drop its callback. Optional. */
  detach?(): void;
  /** Painted once after each layout. Optional. */
  paintStatic?(ctx: CanvasRenderingContext2D, size: Size): void;
  /**
   * Painted every tick on a cleared live layer. `t` is seconds since start,
   * `dt` seconds since the last tick (0 for a still frame, and for the repaint
   * right after a resize). `still` tells those two apart: true only for a
   * still frame (reduced motion, or the `still` option).
   */
  paintFrame(ctx: CanvasRenderingContext2D, size: Size, t: number, dt: number, still: boolean): void;
}

export interface SceneStats {
  frames: number;
  /** Mean time inside layout + paint per live frame, in ms. */
  avgMs: number;
  /** Total paint time divided by wall time, as a fraction of one core. */
  busy: number;
}

/** Rough CPU numbers for the preview harness. Reset with `resetSceneStats`. */
const stats = { frames: 0, paintMs: 0, since: 0 };

export function resetSceneStats(): void {
  stats.frames = 0;
  stats.paintMs = 0;
  stats.since = performance.now();
}

export function getSceneStats(): SceneStats {
  const wall = performance.now() - stats.since;
  return {
    frames: stats.frames,
    avgMs: stats.frames ? stats.paintMs / stats.frames : 0,
    busy: wall > 0 ? stats.paintMs / wall : 0,
  };
}

const FRAME_MS = 1000 / 30;
/** A still frame shows the scene as if it had run this long, so particles are spread out. */
const STILL_T = 40;

export interface RunnerOptions {
  /** Force a still frame regardless of the reduced-motion setting. */
  still?: boolean;
}

export interface SceneRunner {
  stop(): void;
}

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
}

/**
 * Starts `renderer` on the two canvases. Both must already be in the
 * document and sized by CSS to the viewport. Returns a handle whose `stop`
 * cancels every frame, listener and observer it set up.
 */
export function runScene(
  staticCanvas: HTMLCanvasElement,
  liveCanvas: HTMLCanvasElement,
  renderer: SceneRenderer,
  opts: RunnerOptions = {},
): SceneRunner {
  const sctx = staticCanvas.getContext("2d");
  const lctx = liveCanvas.getContext("2d");
  if (!sctx || !lctx) return { stop() {} }; // jsdom, or a browser without canvas

  const motionQuery = reducedMotionQuery();
  let size: Size = { w: 0, h: 0 };
  let raf = 0;
  let last = 0; // performance.now() of the last painted tick
  let t = 0; // scene seconds; only advances while running
  let stopped = false;
  let refresh = 0; // still-frame repaint interval, if the renderer wants one

  const still = () => opts.still === true || motionQuery?.matches === true;

  function fit(): void {
    // The layer's own box: innerWidth would include a classic (non-overlay) scrollbar.
    const w = Math.max(1, liveCanvas.clientWidth || window.innerWidth);
    const h = Math.max(1, liveCanvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, renderer.maxDpr);
    size = { w, h };
    for (const canvas of [staticCanvas, liveCanvas]) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    sctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t0 = performance.now();
    renderer.layout(size);
    sctx!.clearRect(0, 0, w, h);
    renderer.paintStatic?.(sctx!, size);
    stats.paintMs += performance.now() - t0;
  }

  function paint(dt: number): void {
    const t0 = performance.now();
    lctx!.clearRect(0, 0, size.w, size.h);
    const isStill = still();
    renderer.paintFrame(lctx!, size, isStill ? STILL_T : t, dt, isStill);
    stats.paintMs += performance.now() - t0;
    stats.frames++;
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const elapsed = now - last;
    // Skip display frames until a 30 fps slot is due (with a little slack for 60 Hz jitter).
    if (elapsed < FRAME_MS - 2) return;
    // After a long gap (a stall, a debugger) don't let particles jump.
    const dt = Math.min(elapsed, 100) / 1000;
    last = now;
    t += dt;
    paint(dt);
  }

  function start(): void {
    if (stopped || raf || refresh || document.hidden) return;
    if (still()) {
      paint(0);
      if (renderer.stillRefreshMs) refresh = window.setInterval(() => paint(0), renderer.stillRefreshMs);
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function halt(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (refresh) window.clearInterval(refresh);
    refresh = 0;
  }

  function onResize(): void {
    fit(); // resizing a canvas clears it, so repaint now rather than on the next tick
    paint(0);
  }

  function onVisibility(): void {
    if (document.hidden) halt();
    else start();
  }

  function onMotionChange(): void {
    halt();
    start();
  }

  // A resolution query matches only the current ratio, so it fires once when
  // the ratio changes; refit, then watch the new ratio.
  let dprQuery: MediaQueryList | null = null;
  function watchDpr(): void {
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        : null;
    dprQuery?.addEventListener("change", onDprChange);
  }
  function onDprChange(): void {
    if (stopped) return;
    onResize();
    watchDpr();
  }

  fit();
  paint(0);
  start();
  renderer.attach?.(() => {
    if (!stopped && !document.hidden && still()) paint(0);
  });
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery?.addEventListener("change", onMotionChange);
  watchDpr();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      halt();
      renderer.detach?.();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery?.removeEventListener("change", onMotionChange);
      dprQuery?.removeEventListener("change", onDprChange);
      dprQuery = null;
      // Free the backing stores now rather than whenever GC gets to them.
      staticCanvas.width = staticCanvas.height = 0;
      liveCanvas.width = liveCanvas.height = 0;
    },
  };
}

/* ---------- Small helpers shared by the scenes ---------- */

/** Seeded PRNG (mulberry32), so a still frame looks the same every time. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Particle count for a viewport: `perMegapixel` scaled by area, clamped. */
export function countFor(size: Size, perMegapixel: number, min: number, max: number): number {
  const n = Math.round(((size.w * size.h) / 1e6) * perMegapixel);
  return Math.max(min, Math.min(max, n));
}

/**
 * A soft round sprite (radial falloff) in `rgb`, `px` CSS pixels across,
 * drawn at `scale` device pixels per CSS pixel. Scenes draw it with
 * drawImage instead of using shadowBlur, which is far cheaper.
 */
export function softDot(rgb: string, px: number, scale: number, hardness = 0.35): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const d = Math.max(2, Math.ceil(px * scale));
  c.width = c.height = d;
  const g = c.getContext("2d");
  if (g) {
    const r = d / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(hardness, `rgba(${rgb},0.85)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, d, d);
  }
  return c;
}

/**
 * A dot with a bright `rgb` core that melts into a faint `halo` ("r,g,b,a")
 * and then to nothing, with no hard ring. Lets light particles read on pale
 * paper: the halo gives them an edge, the core keeps them light.
 */
export function haloDot(rgb: string, halo: string, px: number, scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const d = Math.max(2, Math.ceil(px * scale));
  c.width = c.height = d;
  const g = c.getContext("2d");
  if (g) {
    const r = d / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    const parts = halo.split(",");
    const haloRgb = parts.slice(0, 3).join(",");
    const haloA = Number(parts[3] ?? 0.4);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.3, `rgba(${rgb},0.95)`);
    grad.addColorStop(0.55, `rgba(${haloRgb},${haloA})`);
    grad.addColorStop(1, `rgba(${haloRgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, d, d);
  }
  return c;
}

export function currentScale(maxDpr: number): number {
  return Math.min(window.devicePixelRatio || 1, maxDpr);
}
