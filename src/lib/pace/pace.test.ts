import { describe, expect, it } from "vitest";
import {
  addToDay,
  clampDaysPerWeek,
  cumulativeSeries,
  dayLog,
  daysToFinish,
  habitGrid,
  habitStats,
  ledger,
  leverRange,
  leverValue,
  observe,
  outlook,
  resolveTarget,
  setDayAmount,
  snapLever,
} from "./pace";
import { toDayKey } from "./dates";
import { formatRate } from "./format";
import type { Project, Session } from "./types";

const NOW = new Date(2026, 7, 20); // 20 Aug 2026, local

/** The novel from the concept mockup: 15 chapters of 5,000, logged since 1 Jun. */
function novel(overrides: Partial<Project> = {}): Project {
  const offsets: Array<[number, number]> = [
    [1, 1200],
    [3, 900],
    [4, 1100],
    [8, 800],
    [10, 1300],
    [11, 950],
    [15, 1000],
    [18, 700],
    [22, 1150],
    [25, 800],
    [31, 600],
    [38, 1050],
    [45, 700],
    [59, 900],
    [66, 650],
    [73, 1000],
    [77, 800],
  ];
  const start = new Date(2026, 5, 1);
  const sessions: Session[] = offsets.map(([off, amount]) => ({
    date: toDayKey(new Date(2026, 5, 1 + off)),
    amount,
  }));
  return {
    id: "p1",
    name: "Untitled Novel",
    unitLabel: "words",
    sessionLabel: "sitting",
    segmentLabel: "chapter",
    segments: { count: 15, per: 5000 },
    target: 75000,
    startingAmount: 0,
    startDate: toDayKey(start),
    goal: { sessionsPerWeek: 5, perSession: 1000 },
    sessions,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTarget", () => {
  it("derives the target from segments when present", () => {
    expect(resolveTarget({ target: 1, segments: { count: 15, per: 5000 } })).toBe(75000);
  });
  it("falls back to the flat target", () => {
    expect(resolveTarget({ target: 42195 })).toBe(42195);
  });
  it("ignores degenerate segments", () => {
    expect(resolveTarget({ target: 900, segments: { count: 0, per: 5000 } })).toBe(900);
  });
});

describe("daysToFinish", () => {
  it("returns zero when there is nothing left", () => {
    expect(daysToFinish(0, 3, 500)).toBe(0);
    expect(daysToFinish(-100, 3, 500)).toBe(0);
  });
  it("returns Infinity when the pace never arrives", () => {
    expect(daysToFinish(1000, 0, 500)).toBe(Infinity);
    expect(daysToFinish(1000, 3, 0)).toBe(Infinity);
  });
  it("halving the rate doubles the time", () => {
    expect(daysToFinish(1000, 2, 100)).toBeCloseTo(daysToFinish(1000, 1, 100) / 2);
  });
});

describe("observe", () => {
  it("counts the zero days against the pace", () => {
    const o = observe(novel(), NOW);
    expect(o.sessionCount).toBe(17);
    expect(o.elapsedDays).toBe(81); // 1 Jun through 20 Aug, inclusive
    expect(o.done).toBe(15600);
    expect(o.perSession).toBeCloseTo(917.6, 1);
    // 17 sessions across ~11.6 weeks, nowhere near the stated 5 a week
    expect(o.sessionsPerWeek).toBeCloseTo(1.47, 2);
    expect(o.measured).toBe(true);
    expect(o.provisional).toBe(false);
  });

  it("falls back to the stated goal when nothing is logged", () => {
    const o = observe(novel({ sessions: [] }), NOW);
    expect(o.measured).toBe(false);
    expect(o.provisional).toBe(true);
    expect(o.sessionsPerWeek).toBe(5);
    expect(o.perSession).toBe(1000);
    expect(o.done).toBe(0);
  });

  it("flags a thin sample as provisional", () => {
    const p = novel({
      startDate: toDayKey(new Date(2026, 7, 18)),
      sessions: [{ date: toDayKey(new Date(2026, 7, 19)), amount: 500 }],
    });
    expect(observe(p, NOW).provisional).toBe(true);
  });

  it("ignores zero-amount entries", () => {
    const p = novel({ sessions: [{ date: toDayKey(new Date(2026, 6, 1)), amount: 0 }] });
    expect(observe(p, NOW).sessionCount).toBe(0);
    expect(observe(p, NOW).measured).toBe(false);
  });
});

describe("outlook", () => {
  it("puts the honest date far behind the stated one", () => {
    const view = outlook(novel(), NOW);
    expect(view.target).toBe(75000);
    expect(view.remaining).toBe(59400);
    expect(Math.round(view.goal.days)).toBe(83); // ~10 Nov 2026
    expect(Math.round(view.actual.days)).toBe(308); // ~24 Jun 2027
    expect(Math.round(view.gapDays)).toBe(225);
    expect(view.complete).toBe(false);
  });

  it("reports completion once the target is met", () => {
    const p = novel({ segments: { count: 1, per: 1000 }, target: 1000 });
    const view = outlook(p, NOW);
    expect(view.complete).toBe(true);
    expect(view.remaining).toBe(0);
    expect(view.actual.days).toBe(0);
  });

  it("measures the deadline miss in days", () => {
    const view = outlook(novel({ deadline: "2027-01-31" }), NOW);
    expect(view.deadlineGapDays).toBeGreaterThan(100);
  });

  it("leaves the deadline gap null when no deadline is set", () => {
    expect(outlook(novel(), NOW).deadlineGapDays).toBeNull();
  });
});

describe("ledger", () => {
  const rows = ledger(novel(), NOW);
  const byId = (id: string) => rows.find((r) => r.id === id)!;

  it("anchors on the unchanged pace", () => {
    const base = byId("baseline");
    expect(base.isBaseline).toBe(true);
    expect(base.delta).toBe(0);
  });

  it("prices a skipped week at exactly seven days", () => {
    expect(byId("skip-week").delta).toBeCloseTo(7);
  });

  it("shows frequency beating volume", () => {
    // Half the output every day beats the current burst pattern by months.
    expect(byId("daily-half").delta).toBeLessThan(-150);
  });

  it("makes one extra session a week worth months", () => {
    expect(byId("plus-one").delta).toBeLessThan(-100);
    expect(byId("plus-two").delta).toBeLessThan(byId("plus-one").delta);
  });

  it("offers trimming the target only when segments exist", () => {
    expect(byId("trim-target").delta).toBeLessThan(0);
    expect(ledger(novel({ segments: undefined }), NOW).find((r) => r.id === "trim-target")).toBeUndefined();
  });
});

describe("habitGrid", () => {
  it("covers the whole project, not a fixed window", () => {
    const grid = habitGrid(novel(), NOW);
    const inRange = grid.weeks.flat().filter((c) => c.inRange);
    // 1 Jun through 20 Aug inclusive
    expect(inRange).toHaveLength(81);
    expect(inRange[0].key).toBe("2026-06-01");
    expect(inRange.at(-1)!.key).toBe("2026-08-20");
  });

  it("lines every column up on weekdays", () => {
    const grid = habitGrid(novel(), NOW);
    for (const week of grid.weeks) {
      expect(week).toHaveLength(7);
      expect(week[0].date.getDay()).toBe(0);
      expect(week[6].date.getDay()).toBe(6);
    }
  });

  it("marks padding outside the project as out of range", () => {
    const grid = habitGrid(novel(), NOW);
    const padding = grid.weeks[0].filter((c) => !c.inRange);
    expect(padding.length).toBeGreaterThan(0);
    expect(padding.every((c) => c.amount === 0)).toBe(true);
  });

  it("carries every logged amount through", () => {
    const grid = habitGrid(novel(), NOW);
    const total = grid.weeks.flat().reduce((sum, c) => sum + c.amount, 0);
    expect(total).toBe(15600);
  });

  it("labels each month once, in order", () => {
    const labels = habitGrid(novel(), NOW).months;
    expect(labels.map((m) => m.label)).toEqual(["Jun", "Jul", "Aug"]);
    expect(labels[0].index).toBeLessThan(labels[1].index);
  });

  it("handles a project that started today", () => {
    const grid = habitGrid(novel({ startDate: toDayKey(NOW), sessions: [] }), NOW);
    expect(grid.weeks.length).toBeGreaterThanOrEqual(1);
    expect(grid.weeks.flat().filter((c) => c.inRange)).toHaveLength(1);
  });
});

describe("habitStats", () => {
  it("reports the show-up rate that the projection rests on", () => {
    const stats = habitStats(novel(), NOW);
    expect(stats.totalDays).toBe(81);
    expect(stats.daysWorked).toBe(17);
    expect(stats.showUpRate).toBeCloseTo(0.21, 2);
  });

  it("finds the longest streak and the longest gap", () => {
    const stats = habitStats(novel(), NOW);
    expect(stats.longestStreak).toBe(2); // days 3 and 4, and days 10 and 11
    expect(stats.longestGap).toBe(13); // between day 45 and day 59
  });

  it("counts days since the last session", () => {
    // last seeded session is day 77, which is 17 Aug
    expect(habitStats(novel(), NOW).daysSinceLast).toBe(3);
  });

  it("keeps a streak alive on a blank today", () => {
    const yesterday = toDayKey(new Date(2026, 7, 19));
    const p = novel({ sessions: [{ date: yesterday, amount: 500 }] });
    expect(habitStats(p, NOW).currentStreak).toBe(1);
  });

  it("breaks a streak once a full day is missed", () => {
    const p = novel({ sessions: [{ date: toDayKey(new Date(2026, 7, 17)), amount: 500 }] });
    expect(habitStats(p, NOW).currentStreak).toBe(0);
  });

  it("reports nothing logged without dividing by zero", () => {
    const stats = habitStats(novel({ sessions: [] }), NOW);
    expect(stats.daysWorked).toBe(0);
    expect(stats.showUpRate).toBe(0);
    expect(stats.daysSinceLast).toBeNull();
    expect(stats.currentStreak).toBe(0);
  });
});

describe("a head start, for work done before tracking began", () => {
  /** The realistic case: 40,000 words already written, tracking starts today. */
  function midProject(overrides: Partial<Project> = {}): Project {
    return novel({
      startingAmount: 40000,
      startDate: toDayKey(NOW),
      sessions: [],
      ...overrides,
    });
  }

  it("counts toward the target", () => {
    const view = outlook(midProject(), NOW);
    expect(view.done).toBe(40000);
    expect(view.remaining).toBe(35000);
  });

  it("never counts toward the measured pace", () => {
    // One 800-word day logged. The average session must be 800, not 40,800.
    const p = midProject({ sessions: [{ date: toDayKey(NOW), amount: 800 }] });
    const o = observe(p, NOW);
    expect(o.perSession).toBe(800);
    expect(o.logged).toBe(800);
    expect(o.startingAmount).toBe(40000);
    expect(o.done).toBe(40800);
  });

  it("is the difference between a sane projection and a fantasy one", () => {
    // Logging the back catalogue as a session is the trap this feature exists to avoid.
    const honest = midProject({ sessions: [{ date: toDayKey(NOW), amount: 800 }] });
    const faked = novel({
      startingAmount: 0,
      startDate: toDayKey(NOW),
      sessions: [{ date: toDayKey(NOW), amount: 40800 }],
    });
    expect(outlook(honest, NOW).done).toBe(outlook(faked, NOW).done);
    // Same progress, wildly different pace, so wildly different dates.
    expect(outlook(faked, NOW).actual.days).toBeLessThan(outlook(honest, NOW).actual.days / 10);
  });

  it("measures elapsed days from the tracking start, not the work start", () => {
    expect(observe(midProject(), NOW).elapsedDays).toBe(1);
  });

  it("is useful on day one, before anything is logged", () => {
    const view = outlook(midProject(), NOW);
    expect(view.observation.measured).toBe(false);
    // 35,000 left at the stated 5 x 1,000 a week is seven weeks, projected from
    // where the writer actually is rather than from zero.
    expect(Math.round(view.goal.days)).toBe(49);
  });

  it("can already be complete", () => {
    const view = outlook(midProject({ startingAmount: 80000 }), NOW);
    expect(view.complete).toBe(true);
    expect(view.remaining).toBe(0);
  });

  it("treats a missing value as zero", () => {
    expect(observe(novel({ startingAmount: undefined as unknown as number }), NOW).startingAmount).toBe(0);
  });

  // Estoria's one change from Pace (see `headStart`): a derived head start can
  // be negative after heavy cuts, and done must still equal the book's total.
  it("keeps a negative head start so done matches the real total", () => {
    expect(observe(novel({ startingAmount: -500 }), NOW).startingAmount).toBe(-500);
  });

  it("starts the burn-up curve at the head start", () => {
    const points = cumulativeSeries(midProject({ sessions: [{ date: toDayKey(NOW), amount: 800 }] }));
    expect(points[0]).toEqual({ day: 0, total: 40000 });
    expect(points.at(-1)!.total).toBe(40800);
  });

  it("leaves the habit history measuring tracked days only", () => {
    const stats = habitStats(midProject(), NOW);
    expect(stats.totalDays).toBe(1);
    expect(stats.daysWorked).toBe(0);
  });
});

describe("logging more than once in a day", () => {
  it("adds to the day rather than replacing it", () => {
    let sessions = addToDay([], "2026-08-20", 600);
    sessions = addToDay(sessions, "2026-08-20", 800);
    expect(sessions).toEqual([{ date: "2026-08-20", amount: 1400 }]);
  });

  it("keeps one record per day, however many times you log", () => {
    let sessions: Session[] = [];
    for (const amount of [300, 200, 450, 50]) {
      sessions = addToDay(sessions, "2026-08-20", amount);
    }
    expect(sessions).toHaveLength(1);
    expect(sessions[0].amount).toBe(1000);
  });

  it("starts a separate record for a different day", () => {
    let sessions = addToDay([], "2026-08-20", 600);
    sessions = addToDay(sessions, "2026-08-21", 400);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.amount)).toEqual([600, 400]);
  });

  it("ignores a zero or negative amount", () => {
    expect(addToDay([], "2026-08-20", 0)).toEqual([]);
    expect(addToDay([], "2026-08-20", -50)).toEqual([]);
    const existing = [{ date: "2026-08-20", amount: 600 }];
    expect(addToDay(existing, "2026-08-20", 0)).toEqual(existing);
  });

  it("does not inflate the measured pace when a day is logged twice", () => {
    // Two entries on one day is one day of work, not two, so per-day output
    // rises and the show-up frequency stays put.
    const once = novel({ startingAmount: 0, sessions: [{ date: toDayKey(NOW), amount: 600 }] });
    const twice = novel({
      startingAmount: 0,
      sessions: addToDay([{ date: toDayKey(NOW), amount: 600 }], toDayKey(NOW), 800),
    });
    expect(observe(once, NOW).sessionCount).toBe(1);
    expect(observe(twice, NOW).sessionCount).toBe(1);
    expect(observe(twice, NOW).perSession).toBe(1400);
    expect(observe(twice, NOW).sessionsPerWeek).toBe(observe(once, NOW).sessionsPerWeek);
  });
});

describe("setDayAmount", () => {
  it("overwrites a day total", () => {
    const sessions = setDayAmount([{ date: "2026-08-20", amount: 600 }], "2026-08-20", 950);
    expect(sessions).toEqual([{ date: "2026-08-20", amount: 950 }]);
  });

  it("removes the day when set to zero", () => {
    expect(setDayAmount([{ date: "2026-08-20", amount: 600 }], "2026-08-20", 0)).toEqual([]);
  });

  it("collapses duplicate records for the same day", () => {
    const messy = [
      { date: "2026-08-20", amount: 600 },
      { date: "2026-08-20", amount: 100 },
    ];
    expect(setDayAmount(messy, "2026-08-20", 700)).toEqual([{ date: "2026-08-20", amount: 700 }]);
  });

  it("leaves other days alone", () => {
    const sessions = setDayAmount(
      [
        { date: "2026-08-19", amount: 500 },
        { date: "2026-08-20", amount: 600 },
      ],
      "2026-08-20",
      0,
    );
    expect(sessions).toEqual([{ date: "2026-08-19", amount: 500 }]);
  });
});

describe("dayLog", () => {
  it("lists logged days newest first", () => {
    const rows = dayLog(novel());
    expect(rows).toHaveLength(17);
    expect(rows[0].key > rows[1].key).toBe(true);
  });

  it("carries a running total that ends at the full logged amount", () => {
    const rows = dayLog(novel());
    expect(rows[0].runningLogged).toBe(15600);
    expect(rows.at(-1)!.runningLogged).toBe(rows.at(-1)!.amount);
  });

  it("adds the head start into the running total but not the logged total", () => {
    const rows = dayLog(novel({ startingAmount: 40000 }));
    expect(rows[0].runningLogged).toBe(15600);
    expect(rows[0].runningTotal).toBe(55600);
  });

  it("sums a day that was logged more than once into a single row", () => {
    const key = toDayKey(NOW);
    const p = novel({
      startingAmount: 0,
      sessions: addToDay(addToDay([], key, 600), key, 800),
    });
    const rows = dayLog(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1400);
    expect(rows[0].runningTotal).toBe(1400);
  });

  it("is empty when nothing is logged", () => {
    expect(dayLog(novel({ sessions: [] }))).toEqual([]);
  });
});

describe("the what-if lever", () => {
  it("stops at seven, because a week has seven days", () => {
    expect(leverRange().max).toBe(7);
    expect(leverRange().min).toBe(0.5);
  });

  it("puts the thumb where the readout says it is", () => {
    // A range input snaps its thumb to the nearest step. With a coarse step the
    // control pointed at 1.5 while its own readout said 1.7.
    const p = novel();
    const pace = observe(p, NOW).sessionsPerWeek;
    const { min, step } = leverRange();
    const thumb = min + Math.round((pace - min) / step) * step;
    expect(formatRate(thumb)).toBe(formatRate(pace));
  });

  it("opens exactly on the measured pace, not a rounded copy of it", () => {
    const p = novel();
    const o = observe(p, NOW);
    expect(leverValue(p, o)).toBe(o.sessionsPerWeek);
  });

  it("never offers a frequency a week cannot hold", () => {
    // A goal of 10 a week is not reachable when the unit is days worked.
    const p = novel({ goal: { sessionsPerWeek: 10, perSession: 500 } });
    expect(leverValue(novel({ whatIfSessionsPerWeek: 10 }), observe(p, NOW))).toBe(7);
    expect(outlook(p, NOW).goal.sessionsPerWeek).toBe(7);
  });

  it("caps a measured pace at working every day", () => {
    const daily = novel({
      goal: { sessionsPerWeek: 2, perSession: 1000 },
      startDate: toDayKey(new Date(2026, 7, 14)),
      sessions: [14, 15, 16, 17, 18, 19, 20].map((d) => ({
        date: toDayKey(new Date(2026, 7, d)),
        amount: 500,
      })),
    });
    const o = observe(daily, NOW);
    expect(o.sessionsPerWeek).toBeLessThanOrEqual(7);
    expect(leverRange().max).toBeGreaterThanOrEqual(o.sessionsPerWeek);
  });

  it("opens on the measured pace when it has never been moved", () => {
    const p = novel();
    const o = observe(p, NOW);
    expect(p.whatIfSessionsPerWeek).toBeUndefined();
    expect(leverValue(p, o)).toBeCloseTo(o.sessionsPerWeek, 5);
  });

  it("remembers where it was parked", () => {
    const p = novel({ whatIfSessionsPerWeek: 4 });
    expect(leverValue(p, observe(p, NOW))).toBe(4);
  });

  it("clamps a saved value that no longer fits the range", () => {
    // Lower the goal after parking the lever high and it must not fall off the end.
    const p = novel({ whatIfSessionsPerWeek: 99, goal: { sessionsPerWeek: 3, perSession: 1000 } });
    const o = observe(p, NOW);
    expect(leverValue(p, o)).toBe(leverRange().max);
  });

  it("ignores a corrupt saved value rather than producing NaN", () => {
    const p = novel({ whatIfSessionsPerWeek: Number.NaN });
    const o = observe(p, NOW);
    expect(leverValue(p, o)).toBeCloseTo(o.sessionsPerWeek, 5);
  });
});

describe("a weekly rate needs a week", () => {
  it("does not extrapolate a full week from a single day", () => {
    // One day in, one logged day used to report 7 days a week.
    const p = novel({ startDate: toDayKey(NOW), sessions: [{ date: toDayKey(NOW), amount: 900 }] });
    const o = observe(p, NOW);
    expect(o.elapsedDays).toBe(1);
    expect(o.sessionsPerWeek).toBe(1);
    expect(o.provisional).toBe(true);
  });

  it("counts three days in three as three a week, not seven", () => {
    const days = [18, 19, 20];
    const p = novel({
      startDate: toDayKey(new Date(2026, 7, 18)),
      sessions: days.map((d) => ({ date: toDayKey(new Date(2026, 7, d)), amount: 500 })),
    });
    expect(observe(p, NOW).sessionsPerWeek).toBe(3);
  });

  it("behaves normally once a real week has passed", () => {
    const p = novel({
      startDate: toDayKey(new Date(2026, 6, 8)),
      sessions: [8, 15, 22, 29].map((d) => ({ date: toDayKey(new Date(2026, 6, d)), amount: 500 })),
    });
    // 4 days across 44 elapsed days is well under one a week
    expect(observe(p, NOW).sessionsPerWeek).toBeCloseTo(4 / (44 / 7), 3);
  });

  it("tops out at seven however hard you work", () => {
    const everyDay = Array.from({ length: 7 }, (_, i) => ({
      date: toDayKey(new Date(2026, 7, 14 + i)),
      amount: 500,
    }));
    const p = novel({ startDate: toDayKey(new Date(2026, 7, 14)), sessions: everyDay });
    expect(observe(p, NOW).sessionsPerWeek).toBeLessThanOrEqual(7);
  });
});

describe("clampDaysPerWeek", () => {
  it("lets a real frequency through", () => {
    expect(clampDaysPerWeek(3.5)).toBe(3.5);
    expect(clampDaysPerWeek(7)).toBe(7);
  });
  it("caps anything above a week", () => {
    expect(clampDaysPerWeek(8)).toBe(7);
    expect(clampDaysPerWeek(100)).toBe(7);
  });
  it("treats nonsense as zero rather than passing NaN into a projection", () => {
    expect(clampDaysPerWeek(Number.NaN)).toBe(0);
    expect(clampDaysPerWeek(-3)).toBe(0);
  });
});

describe("snapLever", () => {
  it("rounds a dragged value to a legible tenth", () => {
    expect(snapLever(3.27)).toBe(3.3);
    expect(snapLever(1.44)).toBe(1.4);
  });

  it("stays inside the week", () => {
    expect(snapLever(0.01)).toBe(0.5);
    expect(snapLever(9)).toBe(7);
  });
});
