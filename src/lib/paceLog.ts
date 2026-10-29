import type { PaceCell, PaceLog, PaceSettings, StoryDoc } from "@/types";
import type { Project } from "@/lib/pace/types";
import { toDayKey } from "@/lib/pace/dates";

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
 */

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

/**
 * Read `pace` from a file, keeping every well-formed cell and dropping the
 * rest. **Never throws**: a damaged log costs some history, never the project.
 */
export function readPaceLog(raw: unknown): PaceLog | undefined {
  try {
    const r = raw as { settings?: unknown; days?: unknown } | null;
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
    if (!settings && !Object.keys(days).length) return undefined;
    return { ...(settings ? { settings } : {}), days };
  } catch {
    return undefined;
  }
}

// ---- merging -------------------------------------------------------------------

/**
 * Cell-by-cell union, newer `at` winning. A cell or settings block missing from
 * one side is never a deletion (see `PaceLog`). On a tie the first side wins,
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
  const settings =
    a.settings && b.settings ? (b.settings.at > a.settings.at ? b.settings : a.settings) : (a.settings ?? b.settings);
  return { ...(settings ? { settings } : {}), days };
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
  return { ...(log?.settings ? { settings: log.settings } : {}), days };
}

export function withSettings(log: PaceLog | undefined, settings: Omit<PaceSettings, "at">, at: number): PaceLog {
  return { settings: { ...settings, at }, days: log?.days ?? {} };
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
 * only: the toolbar calls this on every keystroke's render.
 */
export function wordsToday(doc: StoryDoc, now = new Date()): number {
  const cells = doc.pace?.days[toDayKey(now)];
  return cells ? Object.values(cells).reduce((a, c) => a + c.n, 0) : 0;
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
