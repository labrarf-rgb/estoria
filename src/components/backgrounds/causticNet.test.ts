import { describe, expect, it } from "vitest";
import { NET, loopAngle, netFrame, netFrames, netSide, netValue, points, pointsAt, type NetParams } from "./causticNet";

// A small tile keeps the test fast; the rules don't depend on size.
const SMALL: NetParams = { ...NET, n: 48, frames: 6 };
const M = netSide(SMALL);
const at = (f: Uint8Array, x: number, y: number) => f[y * M + x]!;

describe("caustic net", () => {
  it("is deterministic, so a still frame looks the same every time", () => {
    expect(netFrame(SMALL, 2)).toEqual(netFrame(SMALL, 2));
  });

  it("stores the tile with a one-cell border copied from the opposite edges", () => {
    const f = netFrame(SMALL, 0);
    expect(f).toHaveLength(M * M);
    const N = SMALL.n;
    for (let i = 1; i <= N; i++) {
      expect(at(f, 0, i)).toBe(at(f, N, i)); // left border = right edge
      expect(at(f, N + 1, i)).toBe(at(f, 1, i)); // right border = left edge
      expect(at(f, i, 0)).toBe(at(f, i, N)); // top border = bottom edge
      expect(at(f, i, N + 1)).toBe(at(f, i, 1)); // bottom border = top edge
    }
  });

  it("wraps: the value one tile over is the same, across both edges and at every point of the loop", () => {
    const pts = points(NET);
    for (const k of [0, 5, 13]) {
      const a = loopAngle(NET, k);
      const P = pointsAt(pts, a);
      for (let i = 0; i < 64; i++) {
        const s = i / 64;
        expect(netValue(NET, P, 1, s, a)).toBeCloseTo(netValue(NET, P, 0, s, a), 9); // right edge = left edge
        expect(netValue(NET, P, s, 1, a)).toBeCloseTo(netValue(NET, P, s, 0, a), 9); // bottom edge = top edge
      }
    }
  });

  it("draws a net: some bright edges over mostly faint water", () => {
    const f = netFrame(SMALL, 0);
    const bright = f.filter((v) => v > 100).length / f.length;
    const faint = f.filter((v) => v < 30).length / f.length;
    expect(bright).toBeGreaterThan(0.01);
    expect(bright).toBeLessThan(0.25);
    expect(faint).toBeGreaterThan(0.4);
  });

  it("moves from frame to frame and loops", () => {
    const frames = netFrames(SMALL);
    expect(frames).toHaveLength(SMALL.frames);
    expect(frames[1]).not.toEqual(frames[0]);
    // One step past the last frame is the first frame again (to within rounding of a full turn).
    const wrap = netFrame(SMALL, SMALL.frames);
    let worst = 0;
    for (let i = 0; i < wrap.length; i++) worst = Math.max(worst, Math.abs(wrap[i]! - frames[0]![i]!));
    expect(worst).toBeLessThanOrEqual(1);
  });
});
