import { describe, expect, it } from "vitest";
import {
  SCENE_GAP_X,
  SCENE_MARGIN,
  SCENE_W,
  SCENE_W_MAX,
  sceneFit,
  sceneSlotAt,
  sceneSlotPos,
} from "@/lib/layout";

/** Right edge of the last card in a full row. */
const rowEnd = (f: ReturnType<typeof sceneFit>) => sceneSlotPos(f.cols - 1, f).x + f.w;

describe("sceneFit", () => {
  it("widens the cards so a full row reaches the canvas's right margin", () => {
    // A book chapter about 1390px wide: five columns, each wider than the base.
    const f = sceneFit(36, 1390);
    expect(f.cols).toBe(5);
    expect(f.w).toBeGreaterThan(SCENE_W);
    expect(rowEnd(f)).toBeLessThanOrEqual(1390 - SCENE_MARGIN);
    expect(1390 - SCENE_MARGIN - rowEnd(f)).toBeLessThan(f.cols);
  });

  it("adds a column once the width allows one at the base card width", () => {
    const at = (cols: number) => SCENE_MARGIN * 2 + cols * SCENE_W + (cols - 1) * SCENE_GAP_X;
    expect(sceneFit(20, at(5) - 1).cols).toBe(4);
    expect(sceneFit(20, at(5)).cols).toBe(5);
    expect(sceneFit(20, at(5)).w).toBe(SCENE_W);
  });

  it("does not change the card width as scenes are added", () => {
    expect(sceneFit(2, 1390).w).toBe(sceneFit(30, 1390).w);
  });

  it("caps the width on a narrow canvas with one column", () => {
    expect(sceneFit(5, 450)).toMatchObject({ cols: 1, w: SCENE_W_MAX });
  });

  it("falls back to the base width before the canvas is measured", () => {
    expect(sceneFit(10, 0).w).toBe(SCENE_W);
  });
});

describe("sceneSlotAt", () => {
  it("finds the slot under each card's centre", () => {
    const f = sceneFit(12, 1390);
    for (let i = 0; i < 12; i++) {
      const p = sceneSlotPos(i, f);
      expect(sceneSlotAt(p.x + f.w / 2, p.y + 40, f)).toBe(i);
    }
  });
});
