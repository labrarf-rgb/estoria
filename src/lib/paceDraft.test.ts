import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDoc } from "@/store/persistence";
import { memoryStorage } from "@/test/memoryDir";
import { dayTotals, draftDoneOn } from "@/lib/paceLog";

/**
 * "Draft done" in the store: typing books nothing while the draft is done
 * (Ray's call, 2026-10-29), and reopening it starts the log again.
 */

vi.stubGlobal("localStorage", memoryStorage());
const { useStore } = await import("@/store/useStore");

const DAY = "2026-10-11";

function type(text: string): void {
  useStore.getState().setManuscript("c1", text);
  useStore.getState().recomputeWords("c1");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11, 9, 0, 0));
  useStore.setState({
    doc: normalizeDoc({
      id: "p1",
      projectTitle: "My Story",
      chapters: [{ id: "c1", title: "Arrival", scenes: ["She lands."], manuscript: "one two", words: 2 }],
      pace: { settings: { startDate: "2026-10-01", goal: { sessionsPerWeek: 5, perSession: 500 }, at: 1 }, days: {} },
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("typing while the draft is done", () => {
  it("books words while open, nothing while done, and again once reopened", () => {
    type("one two three");
    expect(dayTotals(useStore.getState().doc.pace).get(DAY)).toBe(1);

    useStore.getState().markDraftDone();
    expect(draftDoneOn(useStore.getState().doc.pace)).toBe(DAY);
    type("one two three four five");
    expect(dayTotals(useStore.getState().doc.pace).get(DAY)).toBe(1);
    // The count itself still moves: only the log pauses.
    expect(useStore.getState().doc.chapters[0].words).toBe(5);

    useStore.getState().reopenDraft();
    expect(draftDoneOn(useStore.getState().doc.pace)).toBeNull();
    type("one two three four five six");
    expect(dayTotals(useStore.getState().doc.pace).get(DAY)).toBe(2);
  });
});
