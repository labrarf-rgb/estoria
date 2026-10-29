import { describe, expect, it } from "vitest";
import type { PaceLog, StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { outlook } from "@/lib/pace/pace";
import {
  addWords,
  dayTotals,
  keepPaceHistory,
  projectTarget,
  projectWords,
  readPaceLog,
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
