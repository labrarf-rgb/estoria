import type { PaceCell, PaceDraft, PaceLog, PaceSettings, StoryDoc } from "@/types";
import type { Project } from "@/lib/pace/types";
import { fromDayKey, toDayKey } from "@/lib/pace/dates";
import { clampDaysPerWeek, habitStats, headStart, observe, projectAt, resolveTarget } from "@/lib/pace/pace";

/**
 * The Pace word log: how many words a project gained or lost each day, kept in
 * the project file (`StoryDoc.pace`, shape and merge rule on `PaceLog`) so the
 * history goes wherever the project goes. The Pace panel reads it through
 * Pace's own maths (`lib/pace/`).
 *
 * **Why Estoria records it rather than anything diffing the total.** Three
 * days of writing would land on whichever day the diff happened to run, and the
 * total also moves for reasons that are not writing: a version switch, a pull
 * from another version, a Drive pull, a restore, an import. Only the typing path
 * knows that what changed was typed, so the log is taken there and nowhere else.
 *
 * **How a burst is measured.** The first keystroke in a chapter notes the count
 * as it stood (`noteTyping`, read off the settled `words`, so a keystroke never
 * scans the prose), and the debounced recompute that settles `words` after the
 * typing stops books the difference (`settleTyping`). Any path that swaps prose
 * out from under a burst drops the open baselines (`dropTyping`), so text that
 * arrived is never booked as written.
 *
 * **Net, not gross.** Cutting 500 words on a revision day books −500.
 *
 * **Draft done.** The writer can declare the draft finished (`pace.draft`, see
 * `PaceDraft`). While it is done typing books nothing, and the Pace panel shows
 * how the drafting run went (`draftReport`) instead of where it is heading.
 */

/** A log in the file's key order: `settings`, `days`, `draft`. Android matches it for the fingerprint. */
function logOf(settings: PaceSettings | undefined, days: PaceLog["days"], draft: PaceDraft | undefined): PaceLog {
  return { ...(settings ? { settings } : {}), days, ...(draft ? { draft } : {}) };
}

// ---- reading -------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readCell(v: unknown): PaceCell | null {
  const c = v as Partial<PaceCell> | null;
  return c && typeof c === "object" && num(c.n) && num(c.at) ? { n: Math.round(c.n), at: c.at } : null;
}

function readSettings(v: unknown): PaceSettings | undefined {
  const s = v as Partial<PaceSettings> | null;
  if (!s || typeof s !== "object") return undefined;
  if (typeof s.startDate !== "string" || !DAY.test(s.startDate) || !num(s.at)) return undefined;
  const g = s.goal as Partial<PaceSettings["goal"]> | undefined;
  if (!g || !num(g.sessionsPerWeek) || !num(g.perSession)) return undefined;
  return {
    startDate: s.startDate,
    ...(typeof s.deadline === "string" && DAY.test(s.deadline) ? { deadline: s.deadline } : {}),
    goal: { sessionsPerWeek: g.sessionsPerWeek, perSession: g.perSession },
    ...(num(s.whatIf) ? { whatIf: s.whatIf } : {}),
    at: s.at,
  };
}

function readDraft(v: unknown): PaceDraft | undefined {
  const d = v as Partial<PaceDraft> | null;
  if (!d || typeof d !== "object" || !num(d.at)) return undefined;
  // A done day that is not a day is dropped, which reads as open; the frozen
  // goal day only means something beside a done day.
  const done = typeof d.doneOn === "string" && DAY.test(d.doneOn) ? d.doneOn : undefined;
  const goal = done && typeof d.goalOn === "string" && DAY.test(d.goalOn) ? d.goalOn : undefined;
  return { ...(done ? { doneOn: done } : {}), ...(goal ? { goalOn: goal } : {}), at: d.at };
}

/**
 * Read `pace` from a file, keeping every well-formed cell and dropping the
 * rest. **Never throws**: a damaged log costs some history, never the project.
 */
export function readPaceLog(raw: unknown): PaceLog | undefined {
  try {
    const r = raw as { settings?: unknown; days?: unknown; draft?: unknown } | null;
    if (!r || typeof r !== "object") return undefined;
    const days: PaceLog["days"] = {};
    if (r.days && typeof r.days === "object") {
      for (const [day, cells] of Object.entries(r.days as Record<string, unknown>)) {
        if (!DAY.test(day) || !cells || typeof cells !== "object") continue;
        const out: Record<string, PaceCell> = {};
        for (const [dev, v] of Object.entries(cells as Record<string, unknown>)) {
          const c = readCell(v);
          if (c && dev) out[dev] = c;
        }
        if (Object.keys(out).length) days[day] = out;
      }
    }
    const settings = readSettings(r.settings);
    const draft = readDraft(r.draft);
    if (!settings && !draft && !Object.keys(days).length) return undefined;
    return logOf(settings, days, draft);
  } catch {
    return undefined;
  }
}

// ---- merging -------------------------------------------------------------------

/**
 * Cell-by-cell union, newer `at` winning. A cell, settings or draft block
 * missing from one side is never a deletion (see `PaceLog`). On a tie the first side wins,
 * so `unionPace(a, a)` is `a`.
 */
export function unionPace(a: PaceLog | undefined, b: PaceLog | undefined): PaceLog | undefined {
  if (!a) return b;
  if (!b) return a;
  const days: PaceLog["days"] = { ...a.days };
  for (const [day, cells] of Object.entries(b.days)) {
    const mine = days[day];
    if (!mine) {
      days[day] = cells;
      continue;
    }
    let merged: Record<string, PaceCell> | null = null;
    for (const [dev, c] of Object.entries(cells)) {
      if (mine[dev] && mine[dev].at >= c.at) continue;
      merged ??= { ...mine };
      merged[dev] = c;
    }
    if (merged) days[day] = merged;
  }
  const newer = <T extends { at: number }>(x: T | undefined, y: T | undefined) =>
    x && y ? (y.at > x.at ? y : x) : (x ?? y);
  return logOf(newer(a.settings, b.settings), days, newer(a.draft, b.draft));
}

/** Whether two logs hold the same cells and settings (the merge changed nothing). */
export function samePace(a: PaceLog | undefined, b: PaceLog | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * `incoming` with `local`'s log merged in, when they are the same project. Used
 * on every path where a document arrives over the one being worked on, so the
 * arrival can add history but never take it away.
 */
export function keepPaceHistory(incoming: StoryDoc, local: StoryDoc): StoryDoc {
  if (incoming.id !== local.id || !local.pace) return incoming;
  const pace = unionPace(incoming.pace, local.pace);
  return samePace(pace, incoming.pace) ? incoming : { ...incoming, pace };
}

/** The document with no Pace log, for asking whether two copies differ in anything else. */
export function withoutPace(doc: StoryDoc): StoryDoc {
  if (!doc.pace) return doc;
  const { pace: _pace, ...rest } = doc;
  return rest;
}

// ---- writing -------------------------------------------------------------------

/** Add `delta` to one device's cell for `day`. A zero delta changes nothing. */
export function addWords(
  log: PaceLog | undefined,
  device: string,
  day: string,
  delta: number,
  at: number
): PaceLog | undefined {
  if (!delta) return log;
  const days = { ...(log?.days ?? {}) };
  const cells = { ...(days[day] ?? {}) };
  cells[device] = { n: (cells[device]?.n ?? 0) + Math.round(delta), at };
  days[day] = cells;
  return logOf(log?.settings, days, log?.draft);
}

export function withSettings(log: PaceLog | undefined, settings: Omit<PaceSettings, "at">, at: number): PaceLog {
  return logOf({ ...settings, at }, log?.days ?? {}, log?.draft);
}

// ---- draft done ------------------------------------------------------------------

/** The day the draft was marked done, or null while it is open. */
export function draftDoneOn(log: PaceLog | undefined): string | null {
  return log?.draft?.doneOn ?? null;
}

/** Mark the draft done on `day`, freezing the goal pace's finish date beside it. */
export function markDraftDone(doc: StoryDoc, day: string, at: number): PaceLog {
  const goalOn = goalFinish(doc, fromDayKey(day));
  return logOf(doc.pace?.settings, doc.pace?.days ?? {}, { doneOn: day, ...(goalOn ? { goalOn } : {}), at });
}

/**
 * Reopen the draft: a newer block that says "open", never a removal, so an
 * older copy that still says "done" loses the merge instead of winning it back.
 */
export function reopenDraft(log: PaceLog | undefined, at: number): PaceLog {
  return logOf(log?.settings, log?.days ?? {}, { at });
}

/**
 * When the goal pace, from the start date, would have reached the target the
 * project has at `now`. The head start (words before tracking) is credited, as
 * in every Pace figure. Null when the goal can never get there.
 */
function goalFinish(doc: StoryDoc, now: Date): string | null {
  const p = toPaceProject(doc, now);
  const left = Math.max(resolveTarget(p) - headStart(p), 0);
  const at = projectAt(left, clampDaysPerWeek(p.goal.sessionsPerWeek), p.goal.perSession, fromDayKey(p.startDate));
  return at.date ? toDayKey(at.date) : null;
}

/** How the drafting run went, start to done. Every figure stops at the done day. */
export interface DraftReport {
  startDate: string;
  doneOn: string;
  /** Calendar days from the start through the done day, both counted. */
  days: number;
  /** Days that gained words (Pace's rule: a cut-only day is not a day worked). */
  daysWritten: number;
  /** Days written per elapsed week, zeros included; Pace's measured frequency. */
  daysPerWeek: number;
  /** Average words on a writing day. */
  perDay: number;
  longestStreak: number;
  /** The goal pace, from the setting it had when the draft was marked done. */
  goal: { sessionsPerWeek: number; perSession: number };
  goalOn?: string;
  deadline?: string;
}

/**
 * The drafting run as the log tells it, or null while the draft is open. Read
 * live from the log, cut off at the done day: a phone's day from before "done"
 * that syncs in late still corrects it, and nothing after the done day can move
 * it. The word count and target are deliberately absent: revisions after the
 * draft change them, and this report is about the run, not the book's size.
 * The goal's finish date was frozen when the draft was marked done for the
 * same reason.
 */
export function draftReport(doc: StoryDoc): DraftReport | null {
  const doneOn = draftDoneOn(doc.pace);
  if (!doneOn) return null;
  const end = fromDayKey(doneOn);
  const all = toPaceProject(doc, end);
  const p = { ...all, sessions: all.sessions.filter((s) => s.date <= doneOn) };
  const seen = observe(p, end);
  const habit = habitStats(p, end);
  const s = doc.pace?.settings;
  return {
    startDate: p.startDate,
    doneOn,
    days: habit.totalDays,
    daysWritten: habit.daysWorked,
    daysPerWeek: seen.measured ? seen.sessionsPerWeek : 0,
    perDay: seen.measured ? seen.perSession : 0,
    longestStreak: habit.longestStreak,
    goal: p.goal,
    ...(doc.pace?.draft?.goalOn ? { goalOn: doc.pace.draft.goalOn } : {}),
    ...(s?.deadline ? { deadline: s.deadline } : {}),
  };
}

/** Net words per day, summed over every device. Days that net to zero are left out. */
export function dayTotals(log: PaceLog | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const [day, cells] of Object.entries(log?.days ?? {})) {
    const n = Object.values(cells).reduce((a, c) => a + c.n, 0);
    if (n) out.set(day, n);
  }
  return out;
}

/**
 * Net words today in this project, every device included. Reads today's cells
 * only: the footer calls this on every keystroke's render.
 */
export function wordsToday(doc: StoryDoc, now = new Date()): number {
  const cells = doc.pace?.days[toDayKey(now)];
  return cells ? Object.values(cells).reduce((a, c) => a + c.n, 0) : 0;
}

/**
 * Calls `onDay` with the new local day key whenever the calendar day changes,
 * so "+N today" and the finish date roll over without typing. A timer aims at
 * the next local midnight, and coming back to the tab (visibility or focus)
 * checks again, because timers pause or drift while the laptop sleeps. Every
 * check re-aims the timer. Returns the unsubscribe.
 */
export function onDayChange(
  onDay: (day: string) => void,
  targets: EventTarget[] = [
    ...(typeof document !== "undefined" ? [document] : []),
    ...(typeof window !== "undefined" ? [window] : []),
  ]
): () => void {
  let day = toDayKey(new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    const now = new Date();
    const next = toDayKey(now);
    if (next !== day) {
      day = next;
      onDay(next);
    }
    clearTimeout(timer);
    // A moment past midnight, so the key has surely changed when it fires.
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(check, midnight.getTime() - now.getTime() + 500);
  };
  check();
  for (const t of targets) {
    t.addEventListener("visibilitychange", check);
    t.addEventListener("focus", check);
  }
  return () => {
    clearTimeout(timer);
    for (const t of targets) {
      t.removeEventListener("visibilitychange", check);
      t.removeEventListener("focus", check);
    }
  };
}

// ---- this browser --------------------------------------------------------------

const DEVICE_KEY = "estoria:device:v1";
let device: string | null = null;

/**
 * This browser's cell key, `web-` and six random characters, made once and
 * kept. If it is lost (site data cleared) the browser simply starts a new key;
 * the old cells stay in the file under the old one and still count.
 */
export function deviceId(): string {
  if (device) return device;
  try {
    device = localStorage.getItem(DEVICE_KEY);
    if (!device) {
      device = `web-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_KEY, device);
    }
  } catch {
    device ??= `web-${Math.random().toString(36).slice(2, 8)}`;
  }
  return device;
}

// ---- progress ------------------------------------------------------------------

/**
 * Words written in the whole project: the active book's working set plus every
 * other book's active version. Read off the `words` cache, so it costs a sum,
 * not a manuscript scan. Inactive *versions* are left out on purpose: a fork is
 * a copy of the book, not more of it.
 *
 * **Only chapters with a manuscript count**, which is where this parts from the
 * toolbar. Before a chapter has prose its `words` is a plan (a hand-typed card
 * count or an import estimate), and plans in a progress figure would show
 * unwritten chapters as done. Decided with Ray, 2026-10-29.
 */
export function projectWords(doc: StoryDoc): number {
  const sum = (chs: { words: number; manuscript?: string }[]) =>
    chs.reduce((n, c) => n + (c.manuscript !== undefined && Number.isFinite(c.words) ? c.words : 0), 0);
  let total = sum(doc.chapters);
  for (const [bookId, data] of Object.entries(doc.bookData ?? {})) {
    if (bookId === doc.activeBookId) continue;
    total += sum(data.chapters ?? []);
  }
  return total;
}

/**
 * One chapter's target: the one set on it, or, without one, its word count. A
 * chapter with no prose yet has a planned count there (a plan is a target), and
 * one with prose but no target counts as finished at the size it is.
 */
function chapterTarget(c: { words: number; target?: number }): number {
  const t = c.target !== undefined && Number.isFinite(c.target) ? c.target : c.words;
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/**
 * The project's goal in words: every chapter's target added up, across the same
 * chapters `projectWords` counts (each book's active version). Worked out live,
 * never stored, so changing a chapter's target moves the finish date.
 */
export function projectTarget(doc: StoryDoc): number {
  const sum = (chs: { words: number; target?: number }[]) => chs.reduce((n, c) => n + chapterTarget(c), 0);
  let total = sum(doc.chapters);
  for (const [bookId, data] of Object.entries(doc.bookData ?? {})) {
    if (bookId === doc.activeBookId) continue;
    total += sum(data.chapters ?? []);
  }
  return total;
}

/** Settings for a project that has none yet: Pace's own defaults, tracking from the first logged day. */
export function defaultSettings(doc: StoryDoc, now = new Date()): Omit<PaceSettings, "at"> {
  const first = [...dayTotals(doc.pace).keys()].sort()[0];
  const today = toDayKey(now);
  return {
    startDate: first && first < today ? first : today,
    goal: { sessionsPerWeek: 5, perSession: 1000 },
  };
}

/**
 * The project as Pace's maths sees it. Progress is the book's real total: the
 * head start is whatever the log does not account for, so `done` always equals
 * `projectWords(doc)`, even after cuts or an import that disagrees with the
 * book (see `headStart` in `lib/pace/pace.ts`). Pace measures pace from days
 * that gained words; a day that only cut words is not counted as a day worked.
 */
export function toPaceProject(doc: StoryDoc, now = new Date()): Project {
  const s = doc.pace?.settings ?? { ...defaultSettings(doc, now), at: 0 };
  const sessions = [...dayTotals(doc.pace)]
    .filter(([day]) => day >= s.startDate)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const logged = sessions.reduce((a, x) => a + (x.amount > 0 ? x.amount : 0), 0);
  const stamp = new Date(s.at || now.getTime()).toISOString();
  return {
    id: doc.id,
    name: doc.projectTitle,
    unitLabel: "words",
    sessionLabel: "day",
    segmentLabel: "chapter",
    target: projectTarget(doc),
    startingAmount: projectWords(doc) - logged,
    startDate: s.startDate,
    ...(s.deadline ? { deadline: s.deadline } : {}),
    goal: s.goal,
    ...(s.whatIf !== undefined ? { whatIfSessionsPerWeek: s.whatIf } : {}),
    sessions,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

// ---- typing bursts -------------------------------------------------------------

/** Word count of each chapter's prose at the start of its current burst. */
const baselines = new Map<string, number>();

const burstKey = (doc: StoryDoc, chId: string) => `${doc.id}|${doc.activeBookId}|${doc.activeDraftId}|${chId}`;

/** A keystroke landed in `chId`. Counts the prior text once, at the start of a burst. */
export function noteTyping(doc: StoryDoc, chId: string, count: () => number): void {
  const key = burstKey(doc, chId);
  // A burst left open in another project, book or version cannot settle against
  // this one; drop it rather than let it wake up against different prose later.
  const scope = burstKey(doc, "");
  for (const k of baselines.keys()) if (!k.startsWith(scope)) baselines.delete(k);
  if (!baselines.has(key)) baselines.set(key, count());
}

/**
 * The count for `chId` has settled at `words`: the burst's net change, or null
 * when no burst is open, which is every recompute that typing did not start.
 */
export function settleTyping(doc: StoryDoc, chId: string, words: number): number | null {
  const key = burstKey(doc, chId);
  const base = baselines.get(key);
  if (base === undefined) return null;
  baselines.delete(key);
  return words - base;
}

/** Prose changed by something other than typing: no open burst can be trusted. */
export function dropTyping(): void {
  baselines.clear();
}
