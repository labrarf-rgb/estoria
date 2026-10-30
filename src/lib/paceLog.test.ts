import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaceLog, StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { outlook } from "@/lib/pace/pace";
import {
  addWords,
  dayTotals,
  draftDoneOn,
  draftReport,
  keepPaceHistory,
  markDraftDone,
  onDayChange,
  projectTarget,
  projectWords,
  readPaceLog,
  reopenDraft,
  toPaceProject,
  unionPace,
  withSettings,
} from "@/lib/paceLog";

/**
 * The Pace word log in the project file (`StoryDoc.pace`). The promises tested
 * here are the ones the design rests on: a damaged log never stops a project
 * opening, the log only ever grows, and progress is always the book's real total.
 */

function makeDoc(over: Partial<StoryDoc> = {}): StoryDoc {
  return normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [
      { id: "c1", title: "Arrival", scenes: ["She lands."], manuscript: "one two three", words: 3 },
      { id: "c2", title: "Departure", scenes: ["She leaves."], words: 4000 },
    ],
    ...over,
  });
}

const SETTINGS = {
  startDate: "2026-10-01",
  goal: { sessionsPerWeek: 5, perSession: 500 },
};

describe("reading the log from a file", () => {
  it("keeps a well-formed log through normalizeDoc", () => {
    const pace: PaceLog = {
      settings: { ...SETTINGS, at: 5 },
      days: { "2026-10-02": { "web-a": { n: 400, at: 1 }, "android-b": { n: -20, at: 2 } } },
    };
    expect(makeDoc({ pace }).pace).toEqual(pace);
  });

  it("never stops a project opening, whatever the log holds", () => {
    for (const bad of [null, 7, "x", [], { days: 3 }, { days: { nope: {} } }, { settings: { startDate: 3 } }]) {
      const doc = makeDoc({ pace: bad as unknown as PaceLog });
      expect(doc.chapters).toHaveLength(2);
      expect(doc.pace).toBeUndefined();
    }
  });

  it("drops only the damaged cells and keeps the rest", () => {
    const log = readPaceLog({
      settings: { startDate: "yesterday", goal: {}, at: 1 },
      days: {
        "2026-10-02": { "web-a": { n: 400, at: 1 }, "web-b": { n: "lots", at: 1 } },
        "not-a-day": { "web-a": { n: 1, at: 1 } },
      },
    });
    expect(log).toEqual({ days: { "2026-10-02": { "web-a": { n: 400, at: 1 } } } });
  });
});

describe("unionPace: the log only grows", () => {
  const a: PaceLog = { days: { "2026-10-02": { "web-a": { n: 400, at: 10 } } } };
  const b: PaceLog = {
    days: {
      "2026-10-02": { "web-a": { n: 300, at: 5 }, "android-b": { n: 90, at: 6 } },
      "2026-10-03": { "android-b": { n: 50, at: 7 } },
    },
  };

  it("keeps every device's cells, and the newer cell wins", () => {
    const u = unionPace(a, b)!;
    expect(u.days["2026-10-02"]).toEqual({ "web-a": { n: 400, at: 10 }, "android-b": { n: 90, at: 6 } });
    expect(u.days["2026-10-03"]).toEqual({ "android-b": { n: 50, at: 7 } });
    expect(unionPace(b, a)).toEqual(u);
  });

  it("treats a missing log or cell as nothing to say, never a deletion", () => {
    expect(unionPace(a, undefined)).toBe(a);
    expect(unionPace(undefined, a)).toBe(a);
    expect(unionPace(a, { days: {} })).toEqual(a);
  });

  it("takes the newer settings", () => {
    const older = withSettings(undefined, SETTINGS, 1);
    const newer = withSettings(undefined, { ...SETTINGS, goal: { sessionsPerWeek: 3, perSession: 900 } }, 2);
    expect(unionPace(older, newer)!.settings!.goal.perSession).toBe(900);
    expect(unionPace(newer, older)!.settings!.goal.perSession).toBe(900);
  });

  it("an incoming copy without the log (an older app) keeps this one's history", () => {
    const local = makeDoc({ pace: a });
    const stripped = makeDoc();
    expect(keepPaceHistory(stripped, local).pace).toEqual(a);
    // A different project never borrows history.
    expect(keepPaceHistory(makeDoc({ id: "p2" }), local).pace).toBeUndefined();
  });
});

describe("recording", () => {
  it("adds to this device's cell for the day, net of cuts", () => {
    let log = addWords(undefined, "web-a", "2026-10-02", 500, 1);
    log = addWords(log, "web-a", "2026-10-02", -120, 2);
    log = addWords(log, "android-b", "2026-10-02", 30, 3);
    expect(dayTotals(log).get("2026-10-02")).toBe(410);
    expect(log!.days["2026-10-02"]["web-a"]).toEqual({ n: 380, at: 2 });
  });

  it("a zero change writes nothing", () => {
    expect(addWords(undefined, "web-a", "2026-10-02", 0, 1)).toBeUndefined();
  });
});

describe("progress is the book's real total", () => {
  const now = new Date(2026, 9, 20, 12);

  it("counts only chapters with prose, not planned counts", () => {
    expect(projectWords(makeDoc())).toBe(3);
  });

  it("the target is every chapter's target added up, or its planned count where it has none", () => {
    const doc = makeDoc({
      chapters: [
        // A target set by hand wins over everything.
        { id: "c1", title: "A", scenes: ["x"], manuscript: "one two", words: 2, target: 3000 },
        // No prose yet: the planned count is the plan.
        { id: "c2", title: "B", scenes: ["x"], words: 4000 },
        // Prose but no target: done at the size it is.
        { id: "c3", title: "C", scenes: ["x"], manuscript: "a b c d e", words: 5 },
      ] as StoryDoc["chapters"],
    });
    expect(projectTarget(doc)).toBe(7005);
    expect(toPaceProject(doc).target).toBe(7005);
  });

  it("done equals the book's total, whatever the log says", () => {
    const cases: PaceLog[] = [
      // Ordinary: the log explains part of the book.
      { settings: { ...SETTINGS, at: 1 }, days: { "2026-10-02": { "web-a": { n: 2, at: 1 } } } },
      // Heavy cuts: logged gains add up to more than the book now holds.
      {
        settings: { ...SETTINGS, at: 1 },
        days: {
          "2026-10-02": { "web-a": { n: 5000, at: 1 } },
          "2026-10-03": { "web-a": { n: -4997, at: 2 } },
        },
      },
      // An imported Pace history larger than the prose here.
      { settings: { ...SETTINGS, at: 1 }, days: { "2026-10-05": { pace: { n: 20000, at: 1 } } } },
    ];
    for (const pace of cases) {
      const doc = makeDoc({ pace });
      expect(outlook(toPaceProject(doc, now), now).done).toBe(projectWords(doc));
    }
  });

  it("ignores days before tracking began, and cut-only days are not days worked", () => {
    const doc = makeDoc({
      pace: {
        settings: { ...SETTINGS, at: 1 },
        days: {
          "2026-09-20": { "web-a": { n: 900, at: 1 } },
          "2026-10-02": { "web-a": { n: 600, at: 1 } },
          "2026-10-03": { "web-a": { n: -200, at: 1 } },
        },
      },
    });
    const o = outlook(toPaceProject(doc, now), now).observation;
    expect(o.sessionCount).toBe(1);
    expect(o.perSession).toBe(600);
  });
});

describe("the day rolling over", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls back once at local midnight, not before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 23, 59, 50));
    const days: string[] = [];
    const stop = onDayChange((d) => days.push(d), []);
    vi.advanceTimersByTime(5_000);
    expect(days).toEqual([]);
    vi.advanceTimersByTime(10_000);
    expect(days).toEqual(["2026-10-30"]);
    vi.advanceTimersByTime(60 * 60_000);
    expect(days).toEqual(["2026-10-30"]);
    stop();
  });

  it("notices a day missed while asleep when the tab comes back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 22, 0));
    const tab = new EventTarget();
    const days: string[] = [];
    const stop = onDayChange((d) => days.push(d), [tab]);
    // The clock jumps but no timer runs, as when the laptop slept.
    vi.setSystemTime(new Date(2026, 9, 31, 8, 0));
    tab.dispatchEvent(new Event("focus"));
    expect(days).toEqual(["2026-10-31"]);
    tab.dispatchEvent(new Event("visibilitychange"));
    expect(days).toEqual(["2026-10-31"]);
    stop();
  });

  it("stops after unsubscribing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 23, 59, 50));
    const tab = new EventTarget();
    const days: string[] = [];
    onDayChange((d) => days.push(d), [tab])();
    vi.advanceTimersByTime(60_000);
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
    tab.dispatchEvent(new Event("focus"));
    expect(days).toEqual([]);
  });
});

describe("draft done", () => {
  const DONE: PaceLog = {
    settings: { ...SETTINGS, at: 5 },
    days: { "2026-10-02": { "web-a": { n: 400, at: 1 } } },
    draft: { doneOn: "2026-10-20", goalOn: "2026-10-18", at: 100 },
  };
  const OPEN: PaceLog = { ...DONE, draft: { at: 200 } };

  it("is read back from a file, in the file's key order", () => {
    const doc = makeDoc({ pace: DONE });
    expect(doc.pace).toEqual(DONE);
    expect(Object.keys(doc.pace!)).toEqual(["settings", "days", "draft"]);
    expect(Object.keys(doc.pace!.draft!)).toEqual(["doneOn", "goalOn", "at"]);
  });

  it("keeps a log that holds only the draft block", () => {
    expect(readPaceLog({ draft: { at: 9 } })).toEqual({ days: {}, draft: { at: 9 } });
  });

  it("drops a damaged draft block, and a bad done day reads as open", () => {
    expect(readPaceLog({ ...DONE, draft: { doneOn: "2026-10-20" } })).toEqual({
      settings: DONE.settings,
      days: DONE.days,
    });
    expect(readPaceLog({ ...DONE, draft: "done" })?.draft).toBeUndefined();
    expect(readPaceLog({ ...DONE, draft: { doneOn: "soon", goalOn: "2026-10-18", at: 3 } })?.draft).toEqual({ at: 3 });
  });

  it("the newer block wins a merge, either way round", () => {
    expect(unionPace(DONE, OPEN)?.draft).toEqual({ at: 200 });
    expect(unionPace(OPEN, DONE)?.draft).toEqual({ at: 200 });
    const doneAgain: PaceLog = { ...DONE, draft: { doneOn: "2026-11-01", at: 300 } };
    expect(unionPace(OPEN, doneAgain)?.draft).toEqual(doneAgain.draft);
  });

  it("reopening survives an older copy that still says done", () => {
    const reopened = reopenDraft(DONE, 200);
    expect(draftDoneOn(reopened)).toBeNull();
    expect(reopened.draft).toEqual({ at: 200 });
    // The stale copy arrives (a pull, a restore): it can't bring "done" back.
    const local = makeDoc({ pace: reopened });
    expect(draftDoneOn(keepPaceHistory(makeDoc({ pace: DONE }), local).pace)).toBeNull();
  });

  it("an older app that drops the field does not undo it", () => {
    const local = makeDoc({ pace: DONE });
    const { draft: _dropped, ...stripped } = DONE;
    expect(keepPaceHistory(makeDoc({ pace: stripped }), local).pace?.draft).toEqual(DONE.draft);
    expect(keepPaceHistory(makeDoc({ pace: undefined }), local).pace?.draft).toEqual(DONE.draft);
  });

  it("writing the log or the settings keeps the block", () => {
    expect(addWords(DONE, "web-a", "2026-10-21", 50, 300)?.draft).toEqual(DONE.draft);
    expect(withSettings(DONE, SETTINGS, 300).draft).toEqual(DONE.draft);
    expect(Object.keys(withSettings(DONE, SETTINGS, 300))).toEqual(["settings", "days", "draft"]);
  });

  it("marking done freezes the goal pace's finish date", () => {
    // Target 4,003 (3 written plus 4,000 planned), the 3 a head start: 4,000
    // left at 500 a day is 8 writing days, 5 a week, so 11.2 days from Oct 1.
    const doc = makeDoc({ pace: { settings: { ...SETTINGS, at: 5 }, days: {} } });
    const log = markDraftDone(doc, "2026-12-01", 99);
    expect(log.draft).toEqual({ doneOn: "2026-12-01", goalOn: "2026-10-12", at: 99 });
    expect(log.settings).toEqual(doc.pace!.settings);
  });

  it("reports the run from start to the done day, and nothing after it", () => {
    const pace: PaceLog = {
      settings: { ...SETTINGS, deadline: "2026-10-31", at: 5 },
      days: {
        "2026-10-01": { "web-a": { n: 600, at: 1 } },
        "2026-10-02": { "web-a": { n: 400, at: 1 } },
        "2026-10-03": { "android-b": { n: 200, at: 1 } },
        "2026-10-05": { "web-a": { n: -100, at: 1 } },
        "2026-10-08": { "web-a": { n: 800, at: 1 } },
        // After the done day: a revision, and must not count.
        "2026-10-20": { "web-a": { n: 5000, at: 1 } },
      },
      draft: { doneOn: "2026-10-14", goalOn: "2026-10-10", at: 9 },
    };
    const r = draftReport(makeDoc({ pace }))!;
    expect(r).toMatchObject({
      startDate: "2026-10-01",
      doneOn: "2026-10-14",
      days: 14,
      daysWritten: 4,
      daysPerWeek: 2,
      perDay: 500,
      longestStreak: 3,
      goalOn: "2026-10-10",
      deadline: "2026-10-31",
    });
  });

  it("has no report while the draft is open", () => {
    expect(draftReport(makeDoc({ pace: OPEN }))).toBeNull();
    expect(draftReport(makeDoc())).toBeNull();
  });
});
