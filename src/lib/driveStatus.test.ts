import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _setDriveStatusForTests, currentDriveStatus, startDriveStatusChecks } from "@/lib/syncTarget";

/** The kill switch's checks (docs/PLAN-drive-sync.md, "Prod safety"). */

let win: EventTarget;
beforeEach(() => {
  win = new EventTarget();
  vi.stubGlobal("window", win);
  _setDriveStatusForTests("unknown");
});
afterEach(() => vi.unstubAllGlobals());

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
});
