/*
 * The caustic net for Above water: the bright web sunlight makes on a shallow
 * floor seen through the surface (round 7, after Ray's photos;
 * docs/backgrounds/mockup/NOTES.md).
 *
 * The net is the edges between cells around `pts` points: along an edge the
 * nearest and second-nearest points are about as far away, so the gap between
 * the two distances is small. A gentle warp makes the edges wobble, and the
 * net fades in and out in patches. The points circle slowly, so the frames
 * loop. Everything is periodic in the tile, so it repeats without seams.
 *
 * This file is pure (no DOM): it computes one frame's intensity, 0 to 255, on
 * a square tile of `n` cells plus a one-cell border copied from the opposite
 * edges (so smoothing across a tile edge has real neighbours). It runs in a
 * worker (causticNet.worker.ts), so the main thread doesn't pay for it (where
 * a worker can't run, abovewater.ts computes one frame per idle slice); the
 * renderer only colors and draws the finished frames.
 */

export interface NetParams {
  /** Cells across the tile. */
  n: number;
  /** Frames in one loop. */
  frames: number;
  /** Cell centres. */
  pts: number;
  /** Edge half-width, in tile units: the bright core. */
  width: number;
  /** The faint glow reaches `spread` times as far as the core. */
  spread: number;
  /** Shapes the core's falloff (higher is sharper). */
  pow: number;
  /** Strength of the core and of the glow. */
  core: number;
  glow: number;
  /** How far the patches fade the net, 0 (never) to 1 (to nothing). */
  patch: number;
}

/** The approved net (mockup round 7, after Ray asked for subtler lines). */
export const NET: NetParams = {
  n: 240,
  frames: 24,
  pts: 22,
  width: 0.009,
  spread: 5,
  pow: 1.6,
  core: 0.55,
  glow: 0.28,
  patch: 0.65,
};

const TAU = Math.PI * 2;

/** Seeded PRNG (mulberry32), the same as engine.ts, repeated here so the worker needs no DOM module. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Point {
  x: number;
  y: number;
  rad: number;
  ph: number;
  dir: number;
}

export function points(p: NetParams): Point[] {
  const r = rng(77);
  return Array.from({ length: p.pts }, () => ({
    x: r(),
    y: r(),
    rad: 0.012 + r() * 0.02,
    ph: r() * TAU,
    dir: r() < 0.5 ? -1 : 1,
  }));
}

/** Side of the stored square: the tile plus its one-cell border. */
export function netSide(p: NetParams): number {
  return p.n + 2;
}

/** The loop angle for frame `k`. */
export function loopAngle(p: NetParams, k: number): number {
  return (k / p.frames) * TAU;
}

/** Where the cell centres are at loop angle `a`. */
export function pointsAt(pts: Point[], a: number): (readonly [number, number])[] {
  return pts.map((q) => [q.x + q.rad * Math.cos(a * q.dir + q.ph), q.y + q.rad * Math.sin(a * q.dir + q.ph)] as const);
}

/**
 * The net's strength, 0 to 1, at tile position (u0, v0) (each 0 to 1) and loop
 * angle `a`. Every term is periodic in u0, v0 (period 1) and a (period 2 pi),
 * so the tile wraps and the loop closes.
 */
export function netValue(p: NetParams, P: (readonly [number, number])[], u0: number, v0: number, a: number): number {
  // The warp: whole numbers of turns across the tile and around the loop.
  const u = u0 + 0.026 * Math.sin(TAU * (2 * v0 + u0) + a) + 0.011 * Math.sin(TAU * (5 * v0 - 2 * u0) - 2 * a);
  const v = v0 + 0.026 * Math.sin(TAU * (2 * u0 - v0) - a) + 0.011 * Math.sin(TAU * (4 * u0 + 3 * v0) + 2 * a);
  let d1 = 9;
  let d2 = 9;
  for (const [qx, qy] of P) {
    // Distances wrap around the tile.
    let dx = Math.abs(u - qx) % 1;
    let dy = Math.abs(v - qy) % 1;
    if (dx > 0.5) dx = 1 - dx;
    if (dy > 0.5) dy = 1 - dy;
    const d = dx * dx + dy * dy;
    if (d < d1) {
      d2 = d1;
      d1 = d;
    } else if (d < d2) d2 = d;
  }
  const e = Math.sqrt(d2) - Math.sqrt(d1);
  const line = Math.max(0, 1 - e / p.width);
  const glow = Math.max(0, 1 - e / (p.width * p.spread));
  // Whole turns of `a` only, so the patches come back to where they started at the end of the loop.
  const patch = 1 - p.patch * (0.5 + 0.5 * Math.sin(TAU * (u0 + v0) + a) * Math.sin(TAU * (u0 - 2 * v0) - a));
  return Math.min(1, (Math.pow(line, p.pow) * p.core + glow * glow * p.glow) * patch);
}

/** Frame `k` (0 to frames - 1) of the loop, as `netSide(p)` squared intensities, row by row. */
export function netFrame(p: NetParams, k: number, pts: Point[] = points(p)): Uint8Array {
  const N = p.n;
  const M = N + 2;
  const out = new Uint8Array(M * M);
  const a = loopAngle(p, k);
  const P = pointsAt(pts, a);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) out[(y + 1) * M + x + 1] = Math.round(255 * netValue(p, P, x / N, y / N, a));
  }
  // The border: each edge copies the opposite one, corners included.
  for (let y = 1; y <= N; y++) {
    out[y * M] = out[y * M + N]!;
    out[y * M + N + 1] = out[y * M + 1]!;
  }
  out.copyWithin(0, N * M, N * M + M);
  out.copyWithin((N + 1) * M, M, 2 * M);
  return out;
}

/** Every frame of the loop. */
export function netFrames(p: NetParams): Uint8Array[] {
  const pts = points(p);
  return Array.from({ length: p.frames }, (_, k) => netFrame(p, k, pts));
}
