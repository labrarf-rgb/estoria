/*
 * loadNet: the caustic net's frames from a worker, with fallbacks. Each test
 * loads a fresh copy of the module, since the frames are cached per session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NET, type NetParams } from "./causticNet";

const P: NetParams = { ...NET, n: 8, frames: 3 };

/** A fake worker the test drives by hand. */
class FakeWorker {
  static made: FakeWorker[] = [];
  static throwOnCreate = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor() {
    if (FakeWorker.throwOnCreate) throw new Error("no workers here");
    FakeWorker.made.push(this);
  }
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

let timers: (() => void)[];

beforeEach(() => {
  vi.resetModules();
  FakeWorker.made = [];
  FakeWorker.throwOnCreate = false;
  timers = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void) => timers.push(fn),
    clearTimeout: () => {},
    // Idle slices run right away here, each with room for two bands of rows.
    requestIdleCallback: (fn: (d: { timeRemaining: () => number }) => void) => {
      let left = 2;
      fn({ timeRemaining: () => (left-- > 0 ? 10 : 0) });
    },
  });
});

afterEach(() => {
  vi.doUnmock("./causticNet");
  vi.unstubAllGlobals();
});

const load = async () => (await import("./abovewater")).loadNet;
const frames = (n = P.frames) => Array.from({ length: n }, () => new Uint8Array(4));

describe("loadNet", () => {
  it("keeps frames for different params apart", async () => {
    const loadNet = await load();
    const a = loadNet(P);
    const b = loadNet({ ...P, n: 16 });
    expect(FakeWorker.made).toHaveLength(2);
    expect(loadNet(P)).toBe(a);
    void b;
  });

  it("takes the worker's frames, terminates it, and shares them with later layers", async () => {
    const loadNet = await load();
    const first = loadNet(P);
    const w = FakeWorker.made[0]!;
    expect(w.posted).toEqual([P]);
    const sent = frames();
    w.onmessage!({ data: { frames: sent } });
    expect(await first).toBe(sent);
    expect(w.terminated).toBe(true);
    expect(await loadNet(P)).toBe(sent);
    expect(FakeWorker.made).toHaveLength(1);
  });

  it.each([
    ["the worker can't be made", (w: FakeWorker | undefined) => void w],
    ["the worker errors", (w: FakeWorker | undefined) => w!.onerror!()],
    ["its message can't be read", (w: FakeWorker | undefined) => w!.onmessageerror!()],
    ["it sends the wrong number of frames", (w: FakeWorker | undefined) => w!.onmessage!({ data: { frames: frames(1) } })],
    ["it never answers", () => timers.forEach((fn) => fn())],
  ])("computes the frames in idle slices when %s", async (what, fail) => {
    if (what === "the worker can't be made") FakeWorker.throwOnCreate = true;
    const loadNet = await load();
    const p = loadNet(P);
    fail(FakeWorker.made[0]);
    const got = await p;
    expect(got).toHaveLength(P.frames);
    expect(got[0]).toHaveLength((P.n + 2) ** 2);
    // Built in bands, they match frames computed in one go.
    const { netFrame } = await import("./causticNet");
    got.forEach((f, k) => expect(f).toEqual(netFrame(P, k)));
    if (FakeWorker.made[0]) expect(FakeWorker.made[0].terminated).toBe(true);
  });

  it("rejects when even the idle slices fail, and the next layer tries again", async () => {
    FakeWorker.throwOnCreate = true;
    vi.doMock("./causticNet", async (orig) => ({
      ...(await orig<typeof import("./causticNet")>()),
      netRows: () => {
        throw new Error("boom");
      },
    }));
    const loadNet = await load();
    await expect(loadNet(P)).rejects.toThrow("boom");
    FakeWorker.throwOnCreate = false;
    const again = loadNet(P);
    expect(FakeWorker.made).toHaveLength(1); // a fresh attempt, with a worker this time
    FakeWorker.made[0]!.onmessage!({ data: { frames: frames() } });
    await expect(again).resolves.toHaveLength(P.frames);
  });
});
