/*
 * Above water's renderer, with a fake canvas (Estoria's tests run in Node).
 * The net is handed in ready-made, so no worker is involved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ABOVE_WATER_DAY, ABOVE_WATER_NIGHT, createAboveWater } from "./abovewater";
import { NET, netSide } from "./causticNet";

interface Draw {
  /** Width of the image drawn: net tiles are netSide(NET) wide, glints far smaller. */
  w: number;
  img: unknown;
  alpha: number;
}

let draws: Draw[];
let alphaSets: number[];
let created: { width: number; height: number }[];

function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const state = { globalAlpha: 1 };
  const target: Record<string | symbol, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    drawImage: (img: { width: number }) => void draws.push({ w: img.width, img, alpha: state.globalAlpha }),
  };
  return new Proxy(target, {
    get: (t, k) => (k === "globalAlpha" ? state.globalAlpha : k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      if (k === "globalAlpha") {
        alphaSets.push(v as number);
        // As the canvas spec says: a value outside 0 to 1 is ignored.
        if (v >= 0 && v <= 1) state.globalAlpha = v as number;
      } else t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  draws = [];
  alphaSets = [];
  created = [];
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", {
    createElement: () => {
      const c = { width: 0, height: 0, getContext: () => fakeContext() };
      created.push(c);
      return c;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SIZE = { w: 800, h: 600 };
const M = netSide(NET);

/** The net's strength in what was just drawn: each of the two crossfaded frames counted once, their alphas summed. */
function netStrength(): number {
  const seen = new Map<unknown, number>();
  for (const d of draws) if (d.w === M && !seen.has(d.img)) seen.set(d.img, d.alpha);
  return [...seen.values()].reduce((s, a) => s + a, 0);
}
const frames = () => Promise.resolve(Array.from({ length: NET.frames }, () => new Uint8Array(netSide(NET) ** 2).fill(128)));
const noon = () => new Date(2026, 10, 27, 12, 0);

describe("Above water", () => {
  it("asks for a repaint once the net arrives", async () => {
    const r = createAboveWater(ABOVE_WATER_NIGHT, { net: frames });
    const invalidate = vi.fn();
    r.attach!(invalidate);
    await Promise.resolve();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("shows the net when a still frame is followed by motion (the scene clock goes back)", async () => {
    const r = createAboveWater(ABOVE_WATER_DAY, { net: frames, now: noon });
    r.attach!(() => {});
    r.layout(SIZE);
    await Promise.resolve();
    await Promise.resolve();
    const ctx = fakeContext();
    r.paintFrame(ctx, SIZE, 40, 0, true); // reduced motion: a still frame at the engine's fixed time
    expect(netStrength()).toBeCloseTo(1, 5); // the net at full strength, split across the two frames
    for (let i = 1; i <= 90; i++) {
      draws = [];
      r.paintFrame(ctx, SIZE, i / 30, 1 / 30, false); // motion turns on: t starts near 0
    }
    expect(netStrength()).toBeCloseTo(1, 5); // not held back until t passes 40
    expect(alphaSets.every((a) => a >= 0 && a <= 1)).toBe(true);
  });

  it("doesn't dip or blink when reduced motion is turned off, or toggled on and off", async () => {
    const r = createAboveWater(ABOVE_WATER_NIGHT, { net: frames });
    r.attach!(() => {});
    r.layout(SIZE);
    await Promise.resolve();
    await Promise.resolve();
    const ctx = fakeContext();
    const strength = (t: number, dt: number, still: boolean) => {
      draws = [];
      r.paintFrame(ctx, SIZE, t, dt, still);
      return netStrength();
    };
    expect(strength(40, 0, true)).toBeCloseTo(1, 5); // reduced motion from the start
    expect(strength(0.03, 0.03, false)).toBeCloseTo(1, 5); // turned off: the net carries on, no dip to 0
    expect(strength(3, 0.03, false)).toBeCloseTo(1, 5);
    expect(strength(40, 0, true)).toBeCloseTo(1, 5); // on again
    expect(strength(3.03, 0.03, false)).toBeCloseTo(1, 5); // and off: no blink
  });

  it("fades the net in over the first running frames, and a resize repaint doesn't flash it", async () => {
    const r = createAboveWater(ABOVE_WATER_NIGHT, { net: frames });
    r.attach!(() => {});
    r.layout(SIZE);
    await Promise.resolve();
    await Promise.resolve();
    const ctx = fakeContext();
    const netAlpha = (t: number, dt: number, still: boolean) => {
      draws = [];
      r.paintFrame(ctx, SIZE, t, dt, still);
      return netStrength();
    };
    // The fade starts on the first running frame and takes 1.5 s.
    expect(netAlpha(1, 1 / 30, false)).toBeCloseTo(0, 5);
    expect(netAlpha(1.3, 0, false)).toBeCloseTo(0.2, 5); // the repaint after a resize keeps fading, no flash
    expect(netAlpha(1.75, 1 / 30, false)).toBeCloseTo(0.5, 5);
    expect(netAlpha(3, 1 / 30, false)).toBeCloseTo(1, 5);
  });

  it("frees its colored tiles when the runner stops", async () => {
    const r = createAboveWater(ABOVE_WATER_NIGHT, { net: frames });
    r.attach!(() => {});
    r.layout(SIZE);
    await Promise.resolve();
    await Promise.resolve();
    r.paintFrame(fakeContext(), SIZE, 0.5, 1 / 30, false);
    const tiles = created.filter((c) => c.width === netSide(NET));
    expect(tiles.length).toBeGreaterThan(0);
    r.detach!();
    expect(tiles.every((c) => c.width === 0 && c.height === 0)).toBe(true);
  });

  it("draws no net, and doesn't fail, when the net can't be made", async () => {
    const r = createAboveWater(ABOVE_WATER_NIGHT, { net: () => Promise.reject(new Error("no worker")) });
    r.attach!(() => {});
    r.layout(SIZE);
    await Promise.resolve();
    await Promise.resolve();
    expect(() => r.paintFrame(fakeContext(), SIZE, 1, 1 / 30, false)).not.toThrow();
  });
});
