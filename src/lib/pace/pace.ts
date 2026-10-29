import type { Goal, Project, Session } from "./types";

/**
 * The log keeps one record per day, so the frequency every projection uses is
 * "days you worked in a week". There are only seven of those.
 */
export const MAX_DAYS_PER_WEEK = 7;

/** Clamp any stated or stored frequency into what a week can actually hold. */
export function clampDaysPerWeek(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_DAYS_PER_WEEK);
}
import { addDays, daysBetween, fromDayKey, startOfDay, toDayKey } from "./dates";
import { formatDays } from "./format";

/**
 * **Copied from Pace** (`~/WebAppProjects/Pace Calculator/src/lib/pace.ts`,
 * commit 308ca01) so Estoria can show Pace's numbers for a project without a
 * second app. Keep it in step with Pace's copy rather than letting the two
 * drift; the tests came across with it.
 *
 * One change: Pace clamps the head start at zero, and here it may be negative
 * (`headStart`). Estoria derives the head start as "the words in the book now,
 * less everything logged", so that progress always equals the book's real
 * total. A heavy revision (logged days add up to more than the book now holds)
 * makes that negative, and clamping it would show more words done than exist.
 */
export function headStart(project: Pick<Project, "startingAmount">): number {
  return Number.isFinite(project.startingAmount) ? project.startingAmount : 0;
}

/** What the log actually says, as opposed to what the user believes. */
export interface Observation {
  /** Everything counted toward the target: the head start plus the log. */
  done: number;
  /** Work finished before tracking began. Excluded from every pace figure. */
  startingAmount: number;
  /** Amount recorded since tracking began. This is what the pace is measured from. */
  logged: number;
  sessionCount: number;
  /** Calendar days from project start through today, at least 1. */
  elapsedDays: number;
  /** Average amount per recorded session. */
  perSession: number;
  /** Recorded sessions divided by elapsed weeks, so zero days count against it. */
  sessionsPerWeek: number;
  /** False when there is no log yet and the goal is standing in for measurement. */
  measured: boolean;
  /** True while the sample is too thin to trust. */
  provisional: boolean;
}

export interface Projection {
  /** Days from today to the finish. `Infinity` when the pace never arrives. */
  days: number;
  /** Null when `days` is not finite. */
  date: Date | null;
  perSession: number;
  sessionsPerWeek: number;
}

export interface Outlook {
  target: number;
  done: number;
  remaining: number;
  complete: boolean;
  observation: Observation;
  /** Where the stated goal pace lands. */
  goal: Projection;
  /** Where the measured pace lands. This is the honest one. */
  actual: Projection;
  /** Days by which `actual` trails `goal`. Negative means ahead of goal. */
  gapDays: number;
  /** Days by which `actual` misses the deadline. Null when no deadline is set. */
  deadlineGapDays: number | null;
}

export function resolveTarget(project: Pick<Project, "target" | "segments">): number {
  const { segments } = project;
  if (segments && segments.count > 0 && segments.per > 0) {
    return segments.count * segments.per;
  }
  return Math.max(project.target, 0);
}

export function totalLogged(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + (Number.isFinite(s.amount) ? s.amount : 0), 0);
}

/**
 * Measure the real pace from the log.
 *
 * `sessionsPerWeek` deliberately divides by *elapsed* weeks rather than by weeks
 * in which work happened. The days nothing was written are the whole point, so
 * they have to be in the denominator.
 */
export function observe(project: Project, now: Date = new Date()): Observation {
  const sessions = project.sessions.filter((s) => s.amount > 0);
  const logged = totalLogged(sessions);
  const startingAmount = headStart(project);
  const done = startingAmount + logged;
  const start = startOfDay(fromDayKey(project.startDate));
  const elapsedDays = Math.max(daysBetween(start, now) + 1, 1);

  if (sessions.length === 0) {
    return {
      done,
      startingAmount,
      logged,
      sessionCount: 0,
      elapsedDays,
      perSession: project.goal.perSession,
      sessionsPerWeek: clampDaysPerWeek(project.goal.sessionsPerWeek),
      measured: false,
      provisional: true,
    };
  }

  return {
    done,
    startingAmount,
    logged,
    sessionCount: sessions.length,
    elapsedDays,
    // Pace comes from the tracked window only. Folding the head start in here
    // would inflate the average session into something you never actually did.
    perSession: logged / sessions.length,
    // Divide by at least one whole week. Two days in, one logged day is not
    // "3.5 days a week", it is one day so far. Extrapolating a weekly rate from
    // less than a week produced confident nonsense like 7 days a week on day one.
    sessionsPerWeek: clampDaysPerWeek(sessions.length / (Math.max(elapsedDays, 7) / 7)),
    measured: true,
    provisional: elapsedDays < 14 || sessions.length < 3,
  };
}

/** Days needed to cover `remaining` at the given rate. `Infinity` if it never gets there. */
export function daysToFinish(remaining: number, sessionsPerWeek: number, perSession: number): number {
  if (remaining <= 0) return 0;
  if (sessionsPerWeek <= 0 || perSession <= 0) return Infinity;
  return (remaining / perSession / sessionsPerWeek) * 7;
}

export function projectAt(
  remaining: number,
  sessionsPerWeek: number,
  perSession: number,
  now: Date,
): Projection {
  const days = daysToFinish(remaining, sessionsPerWeek, perSession);
  return {
    days,
    date: Number.isFinite(days) ? addDays(startOfDay(now), days) : null,
    perSession,
    sessionsPerWeek,
  };
}

export function outlook(project: Project, now: Date = new Date()): Outlook {
  const target = resolveTarget(project);
  const observation = observe(project, now);
  const remaining = Math.max(target - observation.done, 0);

  const goal = projectAt(
    remaining,
    clampDaysPerWeek(project.goal.sessionsPerWeek),
    project.goal.perSession,
    now,
  );
  const actual = projectAt(remaining, observation.sessionsPerWeek, observation.perSession, now);

  let deadlineGapDays: number | null = null;
  if (project.deadline && actual.date) {
    deadlineGapDays = daysBetween(fromDayKey(project.deadline), actual.date);
  }

  return {
    target,
    done: observation.done,
    remaining,
    complete: remaining <= 0 && target > 0,
    observation,
    goal,
    actual,
    gapDays: actual.days - goal.days,
    deadlineGapDays,
  };
}

export interface LedgerRow {
  id: string;
  label: string;
  note: string;
  /** Days from today to the finish under this choice. */
  days: number;
  /** Days relative to carrying on unchanged. Positive costs time. */
  delta: number;
  date: Date | null;
  isBaseline: boolean;
}

/**
 * Price a set of choices in days. Every row is the same projection run with one
 * input changed, so the deltas are directly comparable.
 */
export function ledger(project: Project, now: Date = new Date()): LedgerRow[] {
  const view = outlook(project, now);
  const { remaining, observation } = view;
  const { perSession, sessionsPerWeek } = observation;
  const unit = project.unitLabel;
  const baseline = view.actual.days;

  const at = (spw: number, per: number, rem = remaining) => daysToFinish(rem, spw, per);
  const round = (n: number) => Math.round(n);

  const specs: Array<Omit<LedgerRow, "delta" | "date" | "isBaseline"> & { isBaseline?: boolean }> = [
    {
      id: "skip-week",
      label: "Skip the next 7 days, then carry on as normal",
      note: `A clean week off. The pace itself is unharmed, the calendar just moves.`,
      days: baseline + 7,
    },
    {
      id: "baseline",
      label: "Keep exactly this pace",
      note: observation.measured
        ? "No change. This is what your log says will happen."
        : "No log yet, so this is your stated pace standing in for a measured one.",
      days: baseline,
      isBaseline: true,
    },
    {
      id: "plus-one",
      label: `Work on one more day a week`,
      note: `About ${round(perSession).toLocaleString()} extra ${unit} every seven days.`,
      days: at(clampDaysPerWeek(sessionsPerWeek + 1), perSession),
    },
    {
      id: "plus-two",
      label: `Work on two more days a week`,
      note: `Two more short days, nothing heroic.`,
      days: at(clampDaysPerWeek(sessionsPerWeek + 2), perSession),
    },
    {
      id: "hit-goal",
      label: `Actually hit your goal of ${formatDays(clampDaysPerWeek(project.goal.sessionsPerWeek))} a week`,
      note: "The rhythm you already believe you keep.",
      days: at(clampDaysPerWeek(project.goal.sessionsPerWeek), perSession),
    },
    {
      id: "daily-half",
      label: `Halve your daily output, but show up every day`,
      note: `${round(perSession / 2).toLocaleString()} ${unit} a day. Frequency usually wins, and this row shows by how much.`,
      days: at(MAX_DAYS_PER_WEEK, perSession / 2),
    },
  ];

  if (project.segments && project.segments.count > 1) {
    const trimmed = Math.max(project.segments.count - 3, 1);
    const noun = project.segmentLabel ?? "segment";
    specs.push({
      id: "trim-target",
      label: `Cut the target to ${trimmed} ${noun}${trimmed === 1 ? "" : "s"}`,
      note: "Changing what finished means is a lever too.",
      days: at(sessionsPerWeek, perSession, Math.max(trimmed * project.segments.per - view.done, 0)),
    });
  }

  return specs.map((spec) => ({
    ...spec,
    isBaseline: spec.isBaseline ?? false,
    delta: spec.days - baseline,
    date: Number.isFinite(spec.days) ? addDays(startOfDay(now), spec.days) : null,
  }));
}

/** Every logged day keyed by `YYYY-MM-DD`, with same-day entries summed. */
export function amountsByDay(project: Project): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const s of project.sessions) {
    if (s.amount > 0) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.amount);
  }
  return byDay;
}

export interface DayCell {
  date: Date;
  key: string;
  amount: number;
  /** False for padding cells that fall outside the project's run. */
  inRange: boolean;
}

export interface HabitGrid {
  /** Calendar weeks, oldest first. Each is 7 cells, Sunday through Saturday. */
  weeks: DayCell[][];
  /** Column index where each month label should sit. */
  months: Array<{ index: number; label: string }>;
}

/**
 * The whole project as a calendar, start through today. Weeks are padded to
 * seven so every column lines up, with padding marked out of range.
 */
export function habitGrid(project: Project, now: Date = new Date()): HabitGrid {
  const byDay = amountsByDay(project);
  const start = startOfDay(fromDayKey(project.startDate));
  const today = startOfDay(now);

  // Back up to the Sunday on or before the start so rows are weekdays.
  const firstColumn = addDays(start, -start.getDay());
  const totalDays = Math.max(daysBetween(firstColumn, today) + 1, 7);
  const columns = Math.ceil(totalDays / 7);

  const weeks: DayCell[][] = [];
  const months: Array<{ index: number; label: string }> = [];
  let lastMonth = -1;

  for (let col = 0; col < columns; col++) {
    const week: DayCell[] = [];
    for (let row = 0; row < 7; row++) {
      const date = addDays(firstColumn, col * 7 + row);
      const key = toDayKey(date);
      week.push({
        date,
        key,
        amount: byDay.get(key) ?? 0,
        inRange: date >= start && date <= today,
      });
    }
    const marker = week.find((c) => c.inRange) ?? week[0];
    if (marker.date.getMonth() !== lastMonth) {
      lastMonth = marker.date.getMonth();
      months.push({
        index: col,
        label: marker.date.toLocaleDateString(undefined, { month: "short" }),
      });
    }
    weeks.push(week);
  }

  return { weeks, months };
}

/**
 * Add to a day's running total rather than replacing it, so two sittings on the
 * same day both count. The log stores one summed record per day: the atomic unit
 * of the habit is showing up on a given day, and that is also what the pace
 * measures.
 */
export function addToDay(sessions: Session[], dayKey: string, amount: number): Session[] {
  if (amount <= 0) return sessions;
  const existing = sessions.find((s) => s.date === dayKey);
  if (!existing) return [...sessions, { date: dayKey, amount }];
  return sessions.map((s) => (s.date === dayKey ? { ...s, amount: s.amount + amount } : s));
}

/** Overwrite a day's total. An amount of zero or less removes the day entirely. */
export function setDayAmount(sessions: Session[], dayKey: string, amount: number): Session[] {
  const withoutDay = sessions.filter((s) => s.date !== dayKey);
  return amount > 0 ? [...withoutDay, { date: dayKey, amount }] : withoutDay;
}

export interface DayRow {
  key: string;
  date: Date;
  /** Everything recorded on this day, with same-day entries already summed. */
  amount: number;
  /** Total logged from the first entry through this day, head start excluded. */
  runningLogged: number;
  /** The same running total with the head start added, so it reads as progress. */
  runningTotal: number;
}

/**
 * Every day that has something logged, newest first, each carrying the totals
 * as they stood at the end of that day.
 */
export function dayLog(project: Project): DayRow[] {
  const byDay = amountsByDay(project);
  const startingAmount = headStart(project);

  const ascending = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let running = 0;
  const rows: DayRow[] = ascending.map(([key, amount]) => {
    running += amount;
    return {
      key,
      date: fromDayKey(key),
      amount,
      runningLogged: running,
      runningTotal: startingAmount + running,
    };
  });

  return rows.reverse();
}

export interface LeverRange {
  min: number;
  max: number;
  step: number;
}

/**
 * The lever spans a week, because the thing it moves is how many days out of
 * seven you write on. Nothing above seven is reachable, so nothing above seven
 * is offered.
 */
export function leverRange(): LeverRange {
  // A fine step so the thumb can sit exactly on a measured pace like 1.47. With
  // a coarse step the browser snaps the thumb to the nearest notch, and the
  // control ends up pointing somewhere its own readout disagrees with.
  return { min: 0.5, max: MAX_DAYS_PER_WEEK, step: 0.01 };
}

/**
 * Round a frequency the user picked to something legible. The thumb moves
 * smoothly, but anything they choose lands on a tenth, so the number they see
 * is the number in play.
 */
export function snapLever(value: number): number {
  const snapped = Math.round(value * 10) / 10;
  return Math.min(Math.max(snapped, 0.5), MAX_DAYS_PER_WEEK);
}

/** Where the lever sits: the saved scenario, or the measured pace if untouched. */
export function leverValue(project: Project, observation: Observation): number {
  const { min, max } = leverRange();
  const saved = project.whatIfSessionsPerWeek;
  const raw = typeof saved === "number" && Number.isFinite(saved) ? saved : observation.sessionsPerWeek;
  return Math.min(Math.max(raw, min), max);
}

export interface HabitStats {
  /** Days in the project so far, start through today. */
  totalDays: number;
  daysWorked: number;
  /** Share of days with anything recorded, 0 to 1. */
  showUpRate: number;
  /** Consecutive days worked ending today or yesterday. */
  currentStreak: number;
  longestStreak: number;
  /** Longest run of consecutive days with nothing recorded. */
  longestGap: number;
  /** Days since the last recorded session. Null when nothing is logged. */
  daysSinceLast: number | null;
}

export function habitStats(project: Project, now: Date = new Date()): HabitStats {
  const byDay = amountsByDay(project);
  const start = startOfDay(fromDayKey(project.startDate));
  const today = startOfDay(now);
  const totalDays = Math.max(daysBetween(start, today) + 1, 1);

  let daysWorked = 0;
  let longestStreak = 0;
  let longestGap = 0;
  let run = 0;
  let gap = 0;
  let daysSinceLast: number | null = null;

  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    const worked = (byDay.get(toDayKey(date)) ?? 0) > 0;
    if (worked) {
      daysWorked++;
      run++;
      longestStreak = Math.max(longestStreak, run);
      gap = 0;
      daysSinceLast = daysBetween(date, today);
    } else {
      run = 0;
      gap++;
      longestGap = Math.max(longestGap, gap);
    }
  }

  // A streak survives today being blank until tomorrow, so yesterday still counts.
  let currentStreak = 0;
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(today, -i);
    if (date < start) break;
    const worked = (byDay.get(toDayKey(date)) ?? 0) > 0;
    if (worked) currentStreak++;
    else if (i === 0) continue;
    else break;
  }

  return {
    totalDays,
    daysWorked,
    showUpRate: daysWorked / totalDays,
    currentStreak,
    longestStreak,
    longestGap,
    daysSinceLast,
  };
}

/** Cumulative total after each logged day, for the burn-up line. */
export function cumulativeSeries(project: Project): Array<{ day: number; total: number }> {
  const start = startOfDay(fromDayKey(project.startDate));
  const sorted = [...project.sessions]
    .filter((s) => s.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Day zero sits at the head start, so the curve begins where the work did.
  let running = headStart(project);
  const points = [{ day: 0, total: running }];
  for (const s of sorted) {
    running += s.amount;
    points.push({ day: daysBetween(start, fromDayKey(s.date)), total: running });
  }
  return points;
}

export function goalFrom(observation: Observation): Goal {
  return {
    sessionsPerWeek: observation.sessionsPerWeek,
    perSession: observation.perSession,
  };
}
