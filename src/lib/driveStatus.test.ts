import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _setDriveStatusForTests, currentDriveStatus, startDriveStatusChecks } from "@/lib/syncTarget";

/** The kill switch's checks (docs/PLAN-drive-sync.md, "Prod safety"). */

let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
beforeEach(() => {
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  _setDriveStatusForTests("unknown");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Drive status checks", () => {
  it("a page opened offline checks again as soon as it's back online", async () => {
    let answer: "on" | "unreachable" = "unreachable";
    const auth = { fetchDriveStatus: vi.fn(async () => answer) };
    const stop = startDriveStatusChecks(auth);
    await flush();
    expect(currentDriveStatus()).toBe("unreachable");
    answer = "on";
    win.dispatchEvent(new Event("online"));
    await flush();
    expect(currentDriveStatus()).toBe("on");
    // Already on: coming online again doesn't ask the broker.
    win.dispatchEvent(new Event("online"));
    await flush();
    expect(auth.fetchDriveStatus).toHaveBeenCalledTimes(2);
    stop();
  });

  it("an app opened before the network is up retries on its own, with no online event", async () => {
    vi.useFakeTimers();
    let answer: "on" | "unreachable" = "unreachable";
    const auth = { fetchDriveStatus: vi.fn(async () => answer) };
    const stop = startDriveStatusChecks(auth);
    await vi.advanceTimersByTimeAsync(0);
    expect(currentDriveStatus()).toBe("unreachable");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(auth.fetchDriveStatus).toHaveBeenCalledTimes(2);
    // Backs off: the next try is 20 s later, not 10.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(auth.fetchDriveStatus).toHaveBeenCalledTimes(2);
    answer = "on";
    await vi.advanceTimersByTimeAsync(10_000);
    expect(currentDriveStatus()).toBe("on");
    // Once on, no more quick retries.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(auth.fetchDriveStatus).toHaveBeenCalledTimes(3);
    stop();
  });

  it("checks again when the window comes back into view while paused", async () => {
    let answer: "on" | "unreachable" = "unreachable";
    const auth = { fetchDriveStatus: vi.fn(async () => answer) };
    const stop = startDriveStatusChecks(auth);
    await flush();
    answer = "on";
    win.dispatchEvent(new Event("focus"));
    await flush();
    expect(currentDriveStatus()).toBe("on");
    stop();
  });
});
