import type { StoryDoc } from "@/types";

/**
 * The daily word log: how many words each project gained or lost per calendar
 * day, **as typed**. Written for the Pace calculator, which is served from the
 * same origin (www.labrarf.com/pace-calculator) and reads this key to fill its
 * log, so the writer stops copying the day's number across by hand.
 *
 * **Why Estoria records it rather than Pace measuring it.** The obvious shortcut
 * is for Pace to diff the book's total each time it opens, and it is wrong
 * twice over. Three days of writing land on the one day Pace was opened, which
 * inflates output per day and deflates days per week — the exact distortion
 * Pace exists to remove. And the total moves for reasons that are not writing:
 * a version switch or fork, a pull from another version and its undo, a Drive
 * or Sync pull, a restore, an import. Only the typing path knows that what
 * changed was typed, so the log is taken there and nowhere else.
 *
 * **How a burst is measured.** The first keystroke in a chapter notes the count
 * as it stood (`noteTyping`, read off the settled `words`, so a keystroke never
 * scans the prose), and the debounced recompute that settles `words` after the
 * typing stops records the difference (`settleTyping`). Any path that swaps prose out
 * from under a burst — a pull, an undo, a document arriving — drops the open
 * baselines (`dropTyping`), so text that arrived is never booked as written.
 *
 * **Net, not gross.** Cutting 500 words on a revision day books −500. The day
 * still happened; Pace decides what a negative day means for the pace.
 *
 * **Per browser, never in the document.** Like `authorDefault` and the layout
 * flags, this lives in localStorage and never reaches `StoryDoc`, a file, Drive
 * or the Android app, so the cross-app contract is untouched. Words typed on the
 * phone are not in it (docs/SPECS.md, "Daily word log").
 *
 * **The shape is a contract with Pace**, which reads it from its own repo.
 * Change it only additively, or bump the version and teach Pace both.
 */

export const WORD_LOG_KEY = "estoria.wordLog.v1";

export interface WordLogProject {
  /** The project's title when it was last written to, for Pace's picker. */
  name: string;
  /** Words written in the project now: every book's active version, chapters with prose only. */
  total: number;
  /** ISO timestamp of the last write to this entry. */
  updatedAt: string;
  /** Net words typed per local calendar day, `YYYY-MM-DD`. Zero days are omitted. */
  days: Record<string, number>;
}

export interface WordLog {
  version: 1;
  /** Keyed by `StoryDoc.id`. */
  projects: Record<string, WordLogProject>;
}

/** `YYYY-MM-DD` in local time. The same rule as Pace's `toDayKey`, so a day is the same day in both. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Words written in the whole project: the active book's working set plus every
 * other book's active version. Read off the `words` cache, so it costs a sum,
 * not a manuscript scan. Inactive *versions* are left out on purpose — a fork
 * is a copy of the book, not more of it.
 *
 * **Only chapters with a manuscript count**, which is where this parts from the
 * toolbar. Before a chapter has prose its `words` is a plan (a hand-typed card
 * count or an AI-import estimate), and Pace reads this total as progress: plans
 * in it would show unwritten chapters as done, then drop the total by the plan
 * on each chapter's first keystroke. Decided with Ray, 2026-10-29.
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

// ---- pure updates ------------------------------------------------------------

const empty = (): WordLog => ({ version: 1, projects: {} });

/** Read a stored log, forgiving anything malformed rather than throwing. */
export function parseLog(raw: string | null): WordLog {
  if (!raw) return empty();
  try {
    const v = JSON.parse(raw) as Partial<WordLog>;
    if (!v || v.version !== 1 || !v.projects || typeof v.projects !== "object") return empty();
    return { version: 1, projects: v.projects };
  } catch {
    return empty();
  }
}

/** Add `delta` to a project's day. A day that nets to zero is removed. */
export function addWords(
  log: WordLog,
  docId: string,
  name: string,
  total: number,
  day: string,
  delta: number,
  at: string
): WordLog {
  const prev = log.projects[docId];
  const days = { ...(prev?.days ?? {}) };
  if (delta !== 0) {
    const n = (days[day] ?? 0) + delta;
    if (n === 0) delete days[day];
    else days[day] = n;
  }
  return {
    ...log,
    projects: { ...log.projects, [docId]: { name, total, updatedAt: at, days } },
  };
}

// ---- storage + subscribers ---------------------------------------------------

const listeners = new Set<() => void>();

/**
 * The parsed log, kept so the toolbar's readout does not parse localStorage on
 * every keystroke's render. Cleared when another tab writes the key.
 */
let cache: WordLog | null = null;

function read(): WordLog {
  if (cache) return cache;
  try {
    cache = parseLog(localStorage.getItem(WORD_LOG_KEY));
  } catch {
    cache = empty();
  }
  return cache;
}

function write(log: WordLog): void {
  cache = log;
  try {
    localStorage.setItem(WORD_LOG_KEY, JSON.stringify(log));
  } catch {
    // A full or blocked localStorage loses a day's tally, never the writing.
  }
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== WORD_LOG_KEY && e.key !== null) return;
    cache = null;
    for (const fn of listeners) fn();
  });
}

/** Net words typed today in one project. */
export function wordsToday(docId: string, now = new Date()): number {
  return read().projects[docId]?.days[dayKey(now)] ?? 0;
}

export function subscribeWordLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Book `delta` words to today and refresh the project's name and total. */
export function recordWords(doc: StoryDoc, delta: number, now = new Date()): void {
  write(addWords(read(), doc.id, doc.projectTitle, projectWords(doc), dayKey(now), delta, now.toISOString()));
}

/**
 * Keep the stored name and total current without booking any words. The total
 * moves on paths that are not typing (a Sync pull bringing the phone's words,
 * a restore), and Pace reads it as progress, so it follows them; the days do
 * not. Writes only when something changed.
 */
export function refreshProject(doc: StoryDoc, now = new Date()): void {
  const log = read();
  const prev = log.projects[doc.id];
  const total = projectWords(doc);
  // A project that has never been typed in has no entry, and a total alone is
  // not worth creating one for: Pace would offer every sample project.
  if (!prev || (prev.total === total && prev.name === doc.projectTitle)) return;
  write(addWords(log, doc.id, doc.projectTitle, total, dayKey(now), 0, now.toISOString()));
}

// ---- typing bursts -----------------------------------------------------------

/** Word count of each chapter's prose at the start of its current burst. */
const baselines = new Map<string, number>();

const burstKey = (doc: StoryDoc, chId: string) =>
  `${doc.id}|${doc.activeBookId}|${doc.activeDraftId}|${chId}`;

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
 * The count for `chId` has settled at `words`: book the burst's net change.
 * Does nothing when no burst is open, which is every recompute that typing did
 * not start.
 */
export function settleTyping(doc: StoryDoc, chId: string, words: number, now = new Date()): void {
  const key = burstKey(doc, chId);
  const base = baselines.get(key);
  if (base === undefined) return;
  baselines.delete(key);
  recordWords(doc, words - base, now);
}

/** Prose changed by something other than typing: no open burst can be trusted. */
export function dropTyping(): void {
  baselines.clear();
}
