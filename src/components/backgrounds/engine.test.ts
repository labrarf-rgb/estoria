/*
 * The scene loop, tested without a DOM library: Estoria's tests run in Node,
 * so window, document, the media queries and the canvases are small fakes.
 * Adapted from the `runScene` part of TTePub's SceneBackground.test.tsx, plus
 * reduced motion, the still-frame refresh and the devicePixelRatio refit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getScenePace, runScene, setScenePace, type SceneRenderer } from "./engine";

/** A 2D context whose every method is a no-op. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const target: Record<string | symbol, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(withContext = true): HTMLCanvasElement {
  const ctx = withContext ? fakeContext() : null;
  return { width: 0, height: 0, clientWidth: 800, clientHeight: 600, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

interface FakeQuery {
  media: string;
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

let reduced: boolean;
let queries: FakeQuery[];
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
let win: EventTarget & {
  devicePixelRatio: number;
  innerWidth: number;
  innerHeight: number;
  matchMedia: (media: string) => FakeQuery;
  setInterval: ReturnType<typeof vi.fn>;
  clearInterval: ReturnType<typeof vi.fn>;
};
let doc: EventTarget & { hidden: boolean };
let now: number;

beforeEach(() => {
  reduced = false;
  queries = [];
  rafs = new Map();
  nextRaf = 1;
  now = 0;
  win = Object.assign(new EventTarget(), {
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    matchMedia: (media: string) => {
      const q: FakeQuery = {
        media,
        matches: media.includes("reduce") ? reduced : true,
        listeners: new Set(),
        addEventListener: (_t, fn) => q.listeners.add(fn),
        removeEventListener: (_t, fn) => q.listeners.delete(fn),
      };
      queries.push(q);
      return q;
    },
    setInterval: vi.fn(() => 7),
    clearInterval: vi.fn(),
  });
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafs.set(nextRaf, cb);
    return nextRaf++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  setScenePace(30);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderer(extra: Partial<SceneRenderer> = {}): SceneRenderer & { frames: number[]; layouts: number } {
  const r = {
    frames: [] as number[],
    layouts: 0,
    maxDpr: 2,
    layout() {
      r.layouts++;
    },
    paintFrame(_ctx: CanvasRenderingContext2D, _size: unknown, t: number) {
      r.frames.push(t);
    },
    ...extra,
  };
  return r;
}

/** Fire the pending animation frame at `ms`. */
function fire(ms: number): void {
  now = ms;
  const [entry] = [...rafs.entries()];
  if (!entry) throw new Error("no frame pending");
  rafs.delete(entry[0]);
  entry[1](ms);
}

const listeners = (media: string) => queries.filter((q) => q.media.includes(media)).reduce((n, q) => n + q.listeners.size, 0);

describe("runScene", () => {
  it("ticks at about 30 fps, pauses while the tab is hidden and cleans up on stop", () => {
    const r = renderer();
    const a = fakeCanvas();
    const b = fakeCanvas();
    const runner = runScene(a, b, r);
    expect(r.frames).toHaveLength(1); // the first frame is painted at once
    expect(a.width).toBe(800);

    fire(16); // too soon at 60 Hz: skipped
    expect(r.frames).toHaveLength(1);
    fire(34);
    expect(r.frames).toHaveLength(2);

    doc.hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(rafs.size).toBe(0);
    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(rafs.size).toBe(1);

    runner.stop();
    expect(rafs.size).toBe(0);
    expect(a.width).toBe(0);
    expect(listeners("resolution")).toBe(0);
    // A stray visibility event after stop must not restart anything.
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(rafs.size).toBe(0);
  });

  it("draws one still frame and runs no loop under reduced motion", () => {
    reduced = true;
    const r = renderer();
    runScene(fakeCanvas(), fakeCanvas(), r);
    expect(rafs.size).toBe(0);
    expect(r.frames).toHaveLength(2); // the first paint, and the still frame from start()
    expect(win.setInterval).not.toHaveBeenCalled();
  });

  it("repaints a still frame on the renderer's schedule, and stops it on stop", () => {
    reduced = true;
    const runner = runScene(fakeCanvas(), fakeCanvas(), renderer({ stillRefreshMs: 60_000 }));
    expect(win.setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    runner.stop();
    expect(win.clearInterval).toHaveBeenCalledWith(7);
  });

  it("follows a live change to the reduced-motion setting", () => {
    const runner = runScene(fakeCanvas(), fakeCanvas(), renderer());
    expect(rafs.size).toBe(1);
    const motion = queries.find((q) => q.media.includes("reduce"))!;
    motion.matches = true;
    motion.listeners.forEach((fn) => fn());
    expect(rafs.size).toBe(0);
    motion.matches = false;
    motion.listeners.forEach((fn) => fn());
    expect(rafs.size).toBe(1);
    runner.stop();
    expect(motion.listeners.size).toBe(0);
  });

  it("refits when devicePixelRatio changes, and watches the new ratio", () => {
    const r = renderer();
    const a = fakeCanvas();
    const runner = runScene(a, fakeCanvas(), r);
    expect(a.width).toBe(800);
    expect(listeners("resolution: 1dppx")).toBe(1);

    win.devicePixelRatio = 2;
    const old = queries.find((q) => q.media.includes("resolution: 1dppx"))!;
    [...old.listeners].forEach((fn) => fn());
    expect(a.width).toBe(1600);
    expect(r.layouts).toBe(2);
    expect(old.listeners.size).toBe(0);
    expect(listeners("resolution: 2dppx")).toBe(1);

    runner.stop();
    expect(listeners("resolution")).toBe(0);
  });

  it("tells a still frame from the repaint after a resize", () => {
    const flags: [number, boolean][] = [];
    const r = renderer({ paintFrame: (_c, _s, _t, dt, still) => void flags.push([dt, still]) });
    const runner = runScene(fakeCanvas(), fakeCanvas(), r);
    fire(40);
    win.dispatchEvent(new Event("resize"));
    expect(flags).toEqual([
      [0, false], // first frame, running
      [0.04, false], // a tick
      [0, false], // the repaint after the resize: dt 0, but not a still frame
    ]);
    runner.stop();

    reduced = true;
    flags.length = 0;
    runScene(fakeCanvas(), fakeCanvas(), r).stop();
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every(([dt, still]) => dt === 0 && still)).toBe(true);
  });

  it("lets a renderer repaint a still frame when late content arrives, and not after stop", () => {
    reduced = true;
    let invalidate = () => {};
    const detach = vi.fn();
    const r = renderer({ attach: (fn) => void (invalidate = fn), detach });
    const runner = runScene(fakeCanvas(), fakeCanvas(), r);
    const n = r.frames.length;
    invalidate();
    expect(r.frames).toHaveLength(n + 1);

    doc.hidden = true;
    invalidate(); // hidden: waits for the tab to come back
    expect(r.frames).toHaveLength(n + 1);
    doc.hidden = false;

    runner.stop();
    runner.stop();
    expect(detach).toHaveBeenCalledTimes(1);
    invalidate();
    expect(r.frames).toHaveLength(n + 1);
  });

  it("leaves a running loop to repaint on its own next tick", () => {
    let invalidate = () => {};
    const r = renderer({ attach: (fn) => void (invalidate = fn) });
    const runner = runScene(fakeCanvas(), fakeCanvas(), r);
    expect(r.frames).toHaveLength(1);
    invalidate();
    expect(r.frames).toHaveLength(1);
    runner.stop();
  });

  it("pauses on the current frame while a dialog sets the pace to 0, and carries on with no jump", () => {
    const r = renderer();
    const runner = runScene(fakeCanvas(), fakeCanvas(), r);
    fire(34);
    fire(68);
    const before = r.frames.length;
    const tBefore = r.frames[r.frames.length - 1]!;

    setScenePace(0);
    expect(getScenePace()).toBe(0);
    expect(rafs.size).toBe(0); // no loop: the last frame stays on screen
    expect(r.frames.length).toBe(before); // and nothing was cleared or repainted

    now = 5000; // a long pause
    setScenePace(30);
    expect(rafs.size).toBe(1);
    fire(5034);
    const tAfter = r.frames[r.frames.length - 1]!;
    // Time picks up where it stopped, one frame on, not 5 s later.
    expect(tAfter - tBefore).toBeGreaterThan(0);
    expect(tAfter - tBefore).toBeLessThan(0.1);

    runner.stop();
    setScenePace(0);
    setScenePace(30);
    expect(rafs.size).toBe(0); // a stopped runner no longer follows the pace
  });

  it("starts paused if a dialog is already open", () => {
    setScenePace(0);
    const r = renderer();
    runScene(fakeCanvas(), fakeCanvas(), r);
    expect(r.frames).toHaveLength(1); // the first frame is still drawn
    expect(rafs.size).toBe(0);
    setScenePace(30);
    expect(rafs.size).toBe(1);
  });

  it("does nothing without a canvas context", () => {
    const r = renderer();
    const runner = runScene(fakeCanvas(false), fakeCanvas(false), r);
    expect(r.frames).toHaveLength(0);
    expect(rafs.size).toBe(0);
    runner.stop();
  });
});
