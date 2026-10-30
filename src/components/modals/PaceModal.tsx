import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import type { PaceSettings, StoryDoc } from "@/types";
import { clampDaysPerWeek, habitGrid, habitStats, outlook, resolveTarget } from "@/lib/pace/pace";
import { daysBetween, fromDayKey, toDayKey } from "@/lib/pace/dates";
import { formatAmount, formatDate, formatDays, formatSpan } from "@/lib/pace/format";
import {
  dayTotals,
  defaultSettings,
  deviceId,
  draftReport,
  projectTarget,
  projectWords,
  toPaceProject,
  type DraftReport,
} from "@/lib/paceLog";
import { importPaceProject, PACE_DEVICE, readPaceBackup, type PaceImport } from "@/lib/paceImport";
import type { Project } from "@/lib/pace/types";

/**
 * Pace, inside Estoria: the dates, calendar and day log the Pace calculator
 * shows, for this project, read from the word log in the project file
 * (`lib/paceLog.ts`). Nothing here is typed in by hand except the goal: every
 * day's words were recorded as they were written, on whichever device.
 *
 * Once the draft is marked done the panel looks back instead of forward: the
 * run's report replaces the dates, the calendar stops at the done day, and the
 * only action left is reopening the draft.
 */

const inputClass =
  "w-full rounded-lg border border-rule bg-card px-[10px] py-[7px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-faint";
const eyebrow = "text-[11px] font-semibold uppercase tracking-wider text-faint";
const sectionClass = "border-b border-rule px-[24px] py-5";
const ghostBtn =
  "rounded-lg border border-rule bg-card px-[11px] py-[7px] text-[12px] font-semibold text-ink hover:border-faint";
const solidBtn = "rounded-lg bg-ink px-[12px] py-[7px] text-[12px] font-semibold text-panel hover:opacity-90";

export function PaceModal() {
  const show = useStore((s) => s.showPace);
  const doc = useStore((s) => s.doc);
  const setPanel = useStore((s) => s.setPanel);
  if (!show) return null;
  return <PaceBody doc={doc} close={() => setPanel("showPace", false)} />;
}

function PaceBody({ doc, close }: { doc: StoryDoc; close: () => void }) {
  const setPaceSettings = useStore((s) => s.setPaceSettings);
  const mergePace = useStore((s) => s.mergePace);
  const markDraftDone = useStore((s) => s.markDraftDone);
  const reopenDraft = useStore((s) => s.reopenDraft);
  const askConfirm = useStore((s) => s.askConfirm);
  const now = new Date();
  const project = toPaceProject(doc, now);
  const view = outlook(project, now);
  const hasSettings = !!doc.pace?.settings;
  const [editing, setEditing] = useState(!hasSettings);
  const report = draftReport(doc);

  const confirmDone = () =>
    askConfirm({
      message: "Mark the draft done?",
      detail:
        "Pace stops counting words and shows how the draft went: how long it took, how often you wrote and how that compares with your goal. You can reopen it any time.",
      confirmLabel: "Draft done",
      onConfirm: markDraftDone,
    });
  const confirmReopen = () =>
    askConfirm({
      message: "Reopen the draft?",
      detail:
        "Pace starts counting your writing again and the finish dates come back. Words written while it was done are not counted.",
      confirmLabel: "Reopen draft",
      onConfirm: reopenDraft,
    });

  if (report) {
    return (
      // Keyed apart from the open panel, so switching opens at the top, on the report.
      <PaceFrame
        key="done"
        doc={doc}
        close={close}
        note="The draft is done, so writing is not being counted. Reopen it to carry on."
      >
        <Report report={report} />
        <Calendar project={project} now={fromDayKey(report.doneOn)} done />
        <DayList doc={doc} startDate={project.startDate} now={now} />
        <section className="flex flex-wrap items-center gap-[10px] px-[24px] py-5">
          <button type="button" className={ghostBtn} onClick={confirmReopen}>
            Reopen draft…
          </button>
          <span className="text-[11.5px] text-faint">For another chapter, or if you change your mind.</span>
        </section>
      </PaceFrame>
    );
  }

  return (
    <PaceFrame key="open" doc={doc} close={close}>
      {hasSettings && !editing ? (
        <Hero project={project} view={view} />
      ) : (
        <section className={sectionClass}>
          <div className={eyebrow}>{hasSettings ? "Your pace" : "Set your pace"}</div>
          <p className="mt-1 mb-4 text-[12.5px] text-soft">
            {hasSettings
              ? "Change any of these and every date moves."
              : "How often you mean to write and how much, or bring your history over from the Pace calculator."}
          </p>
          <GoalForm
            doc={doc}
            initial={doc.pace?.settings ?? { ...defaultSettings(doc, now), at: 0 }}
            onSave={(s) => {
              setPaceSettings(s);
              setEditing(false);
            }}
            onCancel={hasSettings ? () => setEditing(false) : undefined}
          />
        </section>
      )}

      <Progress project={project} view={view} />
      <Calendar project={project} now={now} />
      <DayList doc={doc} startDate={project.startDate} now={now} />

      <section className="flex flex-wrap items-center gap-[10px] px-[24px] py-5">
        {hasSettings && !editing && (
          <button type="button" className={ghostBtn} onClick={() => setEditing(true)}>
            Edit pace
          </button>
        )}
        <ImportFromPace
          doc={doc}
          onImport={(imp) => {
            mergePace(imp.log);
            setEditing(false);
          }}
        />
        {hasSettings && !editing && (
          <button type="button" className={`${solidBtn} ml-auto`} onClick={confirmDone}>
            Draft done…
          </button>
        )}
      </section>
    </PaceFrame>
  );
}

/** The panel's shell: title, close, and the scrolling body. `note` replaces the line under the title. */
function PaceFrame({
  doc,
  close,
  note,
  children,
}: {
  doc: StoryDoc;
  close: () => void;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Scrim onClose={close} z={70} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[90vh] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start gap-3 border-b border-rule px-[24px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[18px] font-semibold text-ink">Pace</div>
            <div className="mt-[3px] text-[12px] font-medium text-soft">
              {note ??
                `Words are counted as you write in ${doc.projectTitle}, on every device, and saved in the project file.`}
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </Scrim>
  );
}

// ---- the finished draft ----------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How long the run took: days, and weeks once it is long enough for weeks to help. */
function runLength(days: number): string {
  if (days < 14) return plural(days, "day");
  return `${plural(days, "day")}, about ${Math.round((days / 7) * 10) / 10} weeks`;
}

function Report({ report: r }: { report: DraftReport }) {
  const end = fromDayKey(r.doneOn);
  // Positive: finished after the goal pace's date, or after the due date.
  const goalGap = r.goalOn ? daysBetween(fromDayKey(r.goalOn), end) : null;
  const dueGap = r.deadline ? daysBetween(fromDayKey(r.deadline), end) : null;
  const stat = (label: string, value: string, sub?: string) => (
    <div>
      <dt className={eyebrow}>{label}</dt>
      <dd className="mt-1 text-ink">
        {value}
        {sub && <div className="text-[11px] text-faint">{sub}</div>}
      </dd>
    </div>
  );
  // One comparison: the gap in serif, then what it was measured against.
  const gap = (n: number, onTheDay: string, early: string, late: string) => (
    <div>
      <span className={`font-serif text-[17px] font-semibold ${n <= 0 ? "text-therefore" : "text-but"}`}>
        {n === 0 ? "On the day" : formatSpan(n)}
      </span>{" "}
      {n === 0 ? onTheDay : n < 0 ? early : late}
    </div>
  );

  return (
    <section className={sectionClass}>
      <div className={eyebrow}>Draft done</div>
      <div className="mt-1 font-serif text-[26px] font-semibold text-ink">{formatDate(end)}</div>
      <div className="text-[12.5px] text-soft">
        Started {formatDate(fromDayKey(r.startDate))}. The draft took {runLength(r.days)}.
      </div>

      {r.daysWritten > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          {stat(
            "Days written",
            `${r.daysWritten} of ${r.days}`,
            `${Math.round((r.daysWritten / Math.max(r.days, 1)) * 100)}% of the run`
          )}
          {stat(
            "Days a week",
            formatDays(r.daysPerWeek),
            `goal was ${formatDays(clampDaysPerWeek(r.goal.sessionsPerWeek))}`
          )}
          {stat("Words a writing day", formatAmount(r.perDay), `goal was ${formatAmount(r.goal.perSession)}`)}
          {stat("Best streak", plural(r.longestStreak, "day"))}
        </dl>
      ) : (
        <p className="mt-3 text-[12.5px] text-soft">
          No writing was recorded between the start and the done day, so there is no pace to show.
        </p>
      )}

      {(goalGap !== null || dueGap !== null) && (
        <div className="mt-4 flex flex-col gap-[6px] text-[13px] text-soft">
          {goalGap !== null &&
            gap(
              goalGap,
              `your goal pace would have finished, ${formatDate(fromDayKey(r.goalOn!))}.`,
              `ahead of your goal pace, which would have finished ${formatDate(fromDayKey(r.goalOn!))}.`,
              `behind your goal pace, which would have finished ${formatDate(fromDayKey(r.goalOn!))}.`
            )}
          {dueGap !== null &&
            gap(
              dueGap,
              `it was due, ${formatDate(fromDayKey(r.deadline!))}.`,
              `to spare before the due date, ${formatDate(fromDayKey(r.deadline!))}.`,
              `past the due date, ${formatDate(fromDayKey(r.deadline!))}.`
            )}
        </div>
      )}
    </section>
  );
}

// ---- the two dates ---------------------------------------------------------------

function Hero({ project, view }: { project: Project; view: ReturnType<typeof outlook> }) {
  const { observation, goal, actual, gapDays, complete } = view;
  if (complete) {
    return (
      <section className={sectionClass}>
        <div className={eyebrow}>Finished</div>
        <div className="mt-1 font-serif text-[26px] font-semibold text-ink">
          {formatAmount(view.done)} words
        </div>
        <div className="text-[12.5px] text-soft">You hit the target. Nothing left to project.</div>
      </section>
    );
  }
  const ahead = gapDays < 0;
  return (
    <section className={sectionClass}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className={eyebrow}>The date you are aiming at</div>
          <div className="mt-1 font-serif text-[26px] font-semibold text-soft">{formatDate(goal.date)}</div>
          <div className="text-[12px] text-soft">
            {formatDays(clampDaysPerWeek(project.goal.sessionsPerWeek))} a week at{" "}
            {formatAmount(project.goal.perSession)} words
          </div>
        </div>
        <div>
          <div className={eyebrow}>The date you are actually on</div>
          <div className="mt-1 font-serif text-[26px] font-semibold text-ink">{formatDate(actual.date)}</div>
          <div className="text-[12px] text-soft">
            {observation.measured
              ? `${formatDays(observation.sessionsPerWeek)} a week at ${formatAmount(observation.perSession)} words, over your last ${observation.elapsedDays} ${observation.elapsedDays === 1 ? "day" : "days"}, zeros included`
              : "Nothing recorded yet, so this mirrors your goal"}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-[8px] text-[13px] text-soft">
        <span className={`font-serif text-[20px] font-semibold ${ahead ? "text-therefore" : "text-but"}`}>
          {!observation.measured ? "Not yet known" : Number.isFinite(gapDays) ? formatSpan(gapDays) : "Never"}
        </span>
        <span>
          {!observation.measured
            ? "The gap becomes real once a few days are recorded."
            : !Number.isFinite(gapDays)
              ? "At this pace the target never arrives."
              : ahead
                ? "ahead of your own goal."
                : Math.round(gapDays) === 0
                  ? "between the two. You are keeping the pace you set."
                  : "between the two. That is what the missed days are costing."}
        </span>
      </div>
      {observation.provisional && observation.measured && (
        <div className="mt-2 text-[11.5px] text-faint">
          Early days: this settles after two weeks and a few days of writing.
        </div>
      )}
    </section>
  );
}

function Progress({ project, view }: { project: Project; view: ReturnType<typeof outlook> }) {
  const target = resolveTarget(project);
  const pct = target > 0 ? Math.min(100, (view.done / target) * 100) : 0;
  return (
    <section className={sectionClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className={eyebrow}>Progress</div>
        <div className="text-[12.5px] text-soft">
          <b className="font-semibold text-ink">{formatAmount(view.done)}</b> of {formatAmount(target)} words,{" "}
          {formatAmount(view.remaining)} to go
        </div>
      </div>
      <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-chip">
        <div className="h-full rounded-full bg-therefore" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-[11.5px] text-faint">
        Written: chapters with prose, across every book. Target: each chapter's target added up, or its planned
        count where it has none.
      </div>
    </section>
  );
}

// ---- calendar --------------------------------------------------------------------

const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function level(amount: number, goal: number): number {
  if (amount <= 0) return 0;
  const r = amount / Math.max(goal, 1);
  return r < 0.5 ? 1 : r < 1 ? 2 : r < 1.5 ? 3 : 4;
}

const LEVEL_BG = [
  "",
  "color-mix(in oklab, var(--therefore) 25%, var(--card))",
  "color-mix(in oklab, var(--therefore) 50%, var(--card))",
  "color-mix(in oklab, var(--therefore) 75%, var(--card))",
  "var(--therefore)",
];

/**
 * `done`: the draft is finished and `now` is its done day, so the grid stops
 * there and the streak row, which the report already covers, is left out.
 */
function Calendar({ project, now, done = false }: { project: Project; now: Date; done?: boolean }) {
  const grid = habitGrid(project, now);
  const stats = habitStats(project, now);
  const todayKey = toDayKey(now);
  const scroller = useRef<HTMLDivElement>(null);
  // The newest weeks are the interesting ones, so open scrolled to the right.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [grid.weeks.length]);

  return (
    <section className={sectionClass}>
      <div className={eyebrow}>{done ? "Every day of the draft" : "Every day since you started"}</div>
      <div ref={scroller} className="mt-3 overflow-x-auto pb-1">
        <div className="flex w-max gap-[6px]">
          <div className="grid grid-rows-[14px_repeat(7,13px)] gap-[3px] text-[9.5px] text-faint">
            <span />
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="leading-[13px]">
                {d}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-[3px]">
            <div
              className="grid h-[14px] gap-[3px] text-[9.5px] text-faint"
              style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, 13px)` }}
            >
              {grid.months.map((m) => (
                <span key={`${m.label}-${m.index}`} className="whitespace-nowrap" style={{ gridColumn: m.index + 1 }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {grid.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-rows-[repeat(7,13px)] gap-[3px]">
                  {week.map((cell) => {
                    if (!cell.inRange) return <span key={cell.key} className="h-[13px] w-[13px]" />;
                    const lv = level(cell.amount, project.goal.perSession);
                    return (
                      <span
                        key={cell.key}
                        title={`${formatDate(cell.date)}: ${cell.amount ? `${formatAmount(cell.amount)} words` : "nothing"}`}
                        className={`h-[13px] w-[13px] rounded-[3px] ${lv ? "" : "border border-rule bg-card"} ${
                          cell.key === todayKey ? "outline outline-[1.5px] outline-offset-1 outline-ink" : ""
                        }`}
                        style={lv ? { background: LEVEL_BG[lv] } : undefined}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!done && (
        <dl className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
          <div>
            <dt className={eyebrow}>Showed up</dt>
            <dd className="mt-1 text-ink">
              {stats.daysWorked} of {stats.totalDays} days
              <div className="text-[11px] text-faint">{Math.round(stats.showUpRate * 100)}% of the run</div>
            </dd>
          </div>
          <div>
            <dt className={eyebrow}>Current streak</dt>
            <dd className="mt-1 text-ink">
              {stats.currentStreak} {stats.currentStreak === 1 ? "day" : "days"}
              <div className="text-[11px] text-faint">
                {stats.daysSinceLast === null
                  ? "nothing recorded yet"
                  : stats.daysSinceLast === 0
                    ? "including today"
                    : `last wrote ${stats.daysSinceLast} ${stats.daysSinceLast === 1 ? "day" : "days"} ago`}
              </div>
            </dd>
          </div>
          <div>
            <dt className={eyebrow}>Best streak</dt>
            <dd className="mt-1 text-ink">
              {stats.longestStreak} {stats.longestStreak === 1 ? "day" : "days"}
              <div className="text-[11px] text-faint">longest gap was {stats.longestGap}</div>
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

// ---- day log ---------------------------------------------------------------------

function whereLabel(device: string): string {
  if (device === deviceId()) return "this browser";
  if (device === PACE_DEVICE) return "from Pace";
  if (device.startsWith("android-")) return "phone";
  return "another browser";
}

function DayList({ doc, startDate, now }: { doc: StoryDoc; startDate: string; now: Date }) {
  const todayKey = toDayKey(now);
  const rows = useMemo(() => {
    const totals = dayTotals(doc.pace);
    return [...totals.entries()]
      .filter(([day]) => day >= startDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, n]) => {
        const where = [
          ...new Set(
            Object.entries(doc.pace?.days[day] ?? {})
              .filter(([, c]) => c.n !== 0)
              .map(([dev]) => whereLabel(dev))
          ),
        ];
        return { day, n, where };
      });
  }, [doc.pace, startDate]);

  return (
    <section className={sectionClass}>
      <div className={eyebrow}>Every day recorded</div>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-soft">
          Nothing yet. Start writing in any chapter and today shows up here.
        </p>
      ) : (
        <div className="mt-2 max-h-[260px] overflow-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="py-1 font-semibold">Day</th>
                <th className="py-1 text-right font-semibold">Words</th>
                <th className="py-1 pl-4 font-semibold">Written on</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day} className="border-t border-rule">
                  <td className="py-[6px] text-ink">
                    {formatDate(fromDayKey(r.day))}
                    {r.day === todayKey && <span className="ml-2 text-[11px] text-faint">today</span>}
                  </td>
                  <td className={`py-[6px] text-right tabular-nums ${r.n < 0 ? "text-but" : "text-ink"}`}>
                    {r.n > 0 ? "+" : "−"}
                    {formatAmount(Math.abs(r.n))}
                  </td>
                  <td className="py-[6px] pl-4 text-soft">{r.where.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 text-[11.5px] text-faint">
        Net words: what you added less what you cut. A day that only cut words is shown but does not count as a
        day worked.
      </div>
    </section>
  );
}

// ---- goal ------------------------------------------------------------------------

type GoalDraft = { days: string; perDay: string; start: string; deadline: string };

function GoalForm({
  doc,
  initial,
  onSave,
  onCancel,
}: {
  doc: StoryDoc;
  initial: PaceSettings;
  onSave: (s: Omit<PaceSettings, "at">) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<GoalDraft>({
    days: String(initial.goal.sessionsPerWeek),
    perDay: String(initial.goal.perSession),
    start: initial.startDate,
    deadline: initial.deadline ?? "",
  });
  const set = (k: keyof GoalDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((x) => ({ ...x, [k]: e.target.value }));

  const days = Number(d.days);
  const perDay = Number(d.perDay);
  const valid =
    days > 0 && days <= 7 && perDay > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.start);

  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-[5px]">
      <span className={eyebrow}>{label}</span>
      {input}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-3">
        <div className="flex flex-col gap-[5px]">
          <span className={eyebrow}>Target words</span>
          <span className="py-[7px] text-[13px] font-semibold text-ink">{formatAmount(projectTarget(doc))}</span>
          <span className="text-[11px] text-faint">Your chapters' targets added up. Change one on its chapter.</span>
        </div>
        {field(
          "Days a week",
          <input className={inputClass} inputMode="decimal" value={d.days} onChange={set("days")} />
        )}
        {field(
          "Words a day",
          <input className={inputClass} inputMode="numeric" value={d.perDay} onChange={set("perDay")} />
        )}
        {field(
          "Tracking since",
          <input className={inputClass} type="date" value={d.start} onChange={set("start")} />,
          "Pace is measured from this day"
        )}
        {field(
          "Due date",
          <input className={inputClass} type="date" value={d.deadline} onChange={set("deadline")} />,
          "Optional"
        )}
      </div>
      <div className="flex gap-[10px]">
        <button
          type="button"
          disabled={!valid}
          className={`${solidBtn} disabled:opacity-40`}
          onClick={() =>
            onSave({
              startDate: d.start,
              ...(d.deadline ? { deadline: d.deadline } : {}),
              goal: { sessionsPerWeek: days, perSession: Math.round(perDay) },
            })
          }
        >
          Save
        </button>
        {onCancel && (
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---- import ----------------------------------------------------------------------

function ImportFromPace({ doc, onImport }: { doc: StoryDoc; onImport: (imp: PaceImport) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [picked, setPicked] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // The box opens at the foot of a long panel; bring it into view.
  useEffect(() => {
    if (projects) box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [projects, picked]);

  const preview = picked ? importPaceProject(doc.pace, picked, Date.now()) : null;
  const words = projectWords(doc);

  const reset = () => {
    setProjects(null);
    setPicked(null);
    setError(null);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {!projects && (
        <div className="flex flex-wrap items-center gap-[10px]">
          <button type="button" className={ghostBtn} onClick={() => input.current?.click()}>
            Import from Pace Calculator…
          </button>
          <span className="text-[11.5px] text-faint">
            {done ?? "Choose a backup saved from Pace (Settings, Backup to file)."}
          </span>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setDone(null);
          try {
            const list = readPaceBackup(await file.text());
            setError(null);
            setProjects(list);
            setPicked(list.length === 1 ? list[0] : null);
          } catch (err) {
            setProjects(null);
            setError(err instanceof Error ? err.message : "That file couldn't be read.");
          }
        }}
      />
      {error && <div className="text-[12px] text-but">{error}</div>}

      {projects && (
        <div ref={box} className="rounded-xl border border-rule bg-card p-4">
          <div className={eyebrow}>Import from Pace Calculator</div>
          {projects.length > 1 && (
            <div className="mt-2 flex flex-col gap-[6px]">
              <span className="text-[12.5px] text-soft">Which Pace project is {doc.projectTitle}?</span>
              {projects.map((p, i) => (
                <label key={`${p.id}-${i}`} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="radio" name="pace-project" checked={picked === p} onChange={() => setPicked(p)} />
                  {p.name}
                  <span className="text-faint">
                    {p.sessions.length} {p.sessions.length === 1 ? "day" : "days"} logged
                  </span>
                </label>
              ))}
            </div>
          )}

          {picked && preview && (
            <ul className="mt-3 flex list-disc flex-col gap-[4px] pl-5 text-[12.5px] text-soft">
              <li>
                <b className="text-ink">{preview.added}</b> logged {preview.added === 1 ? "day" : "days"} from "
                {picked.name}" come over.
              </li>
              {preview.skipped.length > 0 && (
                <li>
                  {preview.skipped.length} {preview.skipped.length === 1 ? "day" : "days"} Estoria already
                  recorded {preview.skipped.length === 1 ? "is" : "are"} kept as recorded, not doubled.
                </li>
              )}
              <li>
                Your pace comes over too:{" "}
                {formatDays(preview.log.settings!.goal.sessionsPerWeek)} a week at{" "}
                {formatAmount(preview.log.settings!.goal.perSession)}, tracking since{" "}
                {formatDate(fromDayKey(preview.log.settings!.startDate))}.
              </li>
              {Math.round(preview.paceTarget) !== projectTarget(doc) && (
                <li>
                  Pace's target was {formatAmount(preview.paceTarget)} words. Estoria uses your chapters' targets
                  added up, {formatAmount(projectTarget(doc))}.
                </li>
              )}
              {Math.round(preview.paceTotal) !== words && (
                <li>
                  Pace had you at {formatAmount(preview.paceTotal)} words. Estoria counts{" "}
                  {formatAmount(words)} written here, and uses that for progress from now on.
                </li>
              )}
            </ul>
          )}

          <div className="mt-4 flex gap-[10px]">
            <button
              type="button"
              disabled={!preview}
              className={`${solidBtn} disabled:opacity-40`}
              onClick={() => {
                if (!preview) return;
                onImport(preview);
                setDone(`Imported ${preview.added} ${preview.added === 1 ? "day" : "days"} from Pace.`);
                reset();
              }}
            >
              Import
            </button>
            <button type="button" className={ghostBtn} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
