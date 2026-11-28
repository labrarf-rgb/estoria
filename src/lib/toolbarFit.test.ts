import { describe, expect, it } from "vitest";
import { FULL, fitToolbar, rowWidth, type BarWidths, type FoldKey } from "./toolbarFit";

// Widths measured in the running app (sample project, Hanken Grotesk loaded).
const board: BarWidths = {
  avail: 0,
  gap: 10,
  innerGap: 6,
  fixed: [58, 1, 233], // wordmark, divider, identity + "Main draft"
  add: { w: 107, icon: 30 },
  arrange: { w: 96, icon: 30 },
  actSep: 1,
  viewseg: 130,
  orient: 58,
  panels: { w: 206, icon: 92 },
  file: 57,
  settings: 81,
  more: 66,
};
const timeline: BarWidths = { ...board, add: undefined, arrange: undefined, pane: 160 };
const piece: BarWidths = { ...board, add: undefined, arrange: undefined, viewseg: undefined, orient: undefined };

const at = (b: BarWidths, avail: number) => fitToolbar({ ...b, avail });
const keys = (...k: FoldKey[]) => new Set(k);
const width = (b: BarWidths, compact: boolean, ...k: FoldKey[]) => rowWidth(b, compact, keys(...k));

describe("rowWidth", () => {
  it("matches the one-row width measured in the app", () => {
    // 1169px measured for the whole bar, 32 of it padding.
    expect(width(board, false) + 32).toBeCloseTo(1166, -1);
  });

  it("counts More only once something has folded", () => {
    const full = width(board, true);
    expect(width(board, true, "file", "settings")).toBe(full - 57 - 81 + 66 - 10);
  });

  it("drops the hairline once both board actions have folded", () => {
    expect(width(board, true, "file", "settings", "arrange", "add")).toBe(
      width(board, true, "file", "settings", "arrange") - 30 - 1 - 20
    );
  });
});

describe("fitToolbar", () => {
  it("leaves a wide window exactly as it was", () => {
    expect(at(board, 1600)).toBe(FULL);
    expect(at(board, width(board, false))).toBe(FULL);
  });

  it("goes to icons first, and only icons, when they are enough", () => {
    const f = at(board, width(board, false) - 1);
    expect(f.compact).toBe(true);
    expect(f.folded.size).toBe(0);
    // Ray's portrait monitor: about 1080 wide, 1048 inside the padding.
    expect(at(board, 1048)).toMatchObject({ compact: true, squeeze: false });
    expect(at(board, 1048).folded.size).toBe(0);
  });

  it("folds File and Settings together, before anything else", () => {
    const f = at(board, width(board, true) - 1);
    expect([...f.folded].sort()).toEqual(["file", "settings"]);
  });

  it("folds Characters / World / Notes next, then the rest in order", () => {
    expect([...at(board, width(board, true, "file", "settings") - 1).folded].sort()).toEqual([
      "file",
      "panels",
      "settings",
    ]);
    const order: FoldKey[] = ["file", "settings", "panels", "arrange", "orient", "add"];
    for (let i = 3; i < order.length; i++) {
      const before = order.slice(0, i);
      const f = at(board, width(board, true, ...before) - 1);
      expect([...f.folded].sort()).toEqual(order.slice(0, i + 1).sort());
    }
  });

  it("skips steps for controls the view does not have", () => {
    // The timeline has no add or arrange buttons: after the panels, ↓ → goes,
    // then Scenes / Manuscript.
    const f = at(timeline, width(timeline, true, "file", "settings", "panels") - 1);
    expect([...f.folded].sort()).toEqual(["file", "orient", "panels", "settings"]);
    const g = at(timeline, width(timeline, true, "file", "settings", "panels", "orient") - 1);
    expect([...g.folded].sort()).toEqual(["file", "orient", "pane", "panels", "settings"]);
  });

  it("never folds the board's view switch before everything else has gone", () => {
    for (let avail = 300; avail <= 1300; avail += 5) {
      const f = at(board, avail);
      if (f.folded.has("viewseg")) expect(f.folded.size).toBe(7);
      // And folding only ever grows as the window narrows.
      const wider = at(board, avail + 5);
      for (const k of wider.folded) expect(f.folded.has(k)).toBe(true);
    }
  });

  it("squeezes the names only when everything has folded", () => {
    const long: BarWidths = { ...board, fixed: [58, 1, 604] };
    const f = at(long, 736); // 768 minus padding
    expect(f.squeeze).toBe(true);
    expect(f.folded.size).toBe(7); // every key but "pane", which the board lacks
    expect(at(board, 736).squeeze).toBe(false);
  });

  it("fits a single piece without folding until it is very narrow", () => {
    expect(at(piece, 736)).toBe(FULL);
  });
});
