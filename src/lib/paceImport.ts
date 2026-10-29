import type { PaceLog } from "@/types";
import type { Project } from "@/lib/pace/types";
import { totalLogged } from "@/lib/pace/pace";

/**
 * Bringing a project over from the Pace calculator, from the file Pace's
 * **Backup to file** saves (`pace-backup-YYYY-MM-DD.json`). Its days become the
 * `pace` cells of the log and its settings become this project's, so the
 * history carries on from where the hand-kept log left off.
 */

/** The Pace device key: days that came from a Pace backup rather than typing here. */
export const PACE_DEVICE = "pace";

/**
 * The projects in a Pace backup. Accepts what Pace's own loader accepts: a full
 * backup, a bare app state, or a raw array of projects.
 */
export function readPaceBackup(text: string): Project[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const raw = Array.isArray(parsed) ? parsed : (parsed as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(raw)) throw new Error("No Pace projects found in that file.");
  const projects = raw.filter(
    (p): p is Project =>
      !!p &&
      typeof p === "object" &&
      typeof (p as Project).name === "string" &&
      typeof (p as Project).startDate === "string" &&
      Array.isArray((p as Project).sessions)
  );
  if (!projects.length) throw new Error("No readable Pace projects found in that file.");
  return projects;
}

export interface PaceImport {
  log: PaceLog;
  /** Days brought in. */
  added: number;
  /** Days skipped because Estoria had already recorded them. */
  skipped: string[];
  /** Pace's own progress figure for the project: head start plus everything logged. */
  paceTotal: number;
  /** Pace's target, to show beside the chapters' total. Not imported. */
  paceTarget: number;
}

/**
 * Merge a Pace project into the log.
 *
 * - **Settings** (start date, goal, deadline, the what-if lever) are taken
 *   from Pace. The target is not: in Estoria it is the chapters' targets
 *   added up (`projectTarget`).
 * - **Days** become `pace` cells. A day Estoria has already recorded is kept as
 *   recorded and the Pace number skipped: it was most likely typed here and then
 *   copied into Pace by hand, and counting both would double it.
 * - **Importing again** replaces the earlier import: its days are rewritten, and
 *   one no longer in the backup is set to zero (a newer cell, since the log
 *   never deletes).
 */
export function importPaceProject(log: PaceLog | undefined, project: Project, at: number): PaceImport {
  const days: PaceLog["days"] = { ...(log?.days ?? {}) };
  const byDay = new Map<string, number>();
  for (const s of project.sessions) {
    if (typeof s.date !== "string" || !Number.isFinite(s.amount)) continue;
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.amount);
  }

  let added = 0;
  const skipped: string[] = [];
  for (const [day, n] of byDay) {
    const cells = days[day] ?? {};
    if (Object.keys(cells).some((dev) => dev !== PACE_DEVICE)) {
      skipped.push(day);
      continue;
    }
    days[day] = { ...cells, [PACE_DEVICE]: { n: Math.round(n), at } };
    added++;
  }
  for (const [day, cells] of Object.entries(days)) {
    if (cells[PACE_DEVICE] && cells[PACE_DEVICE].n !== 0 && !byDay.has(day)) {
      days[day] = { ...cells, [PACE_DEVICE]: { n: 0, at } };
    }
  }

  const segments =
    project.segments && project.segments.count > 0 && project.segments.per > 0 ? project.segments : undefined;
  return {
    log: {
      settings: {
        startDate: project.startDate,
        ...(project.deadline ? { deadline: project.deadline } : {}),
        goal: {
          sessionsPerWeek: project.goal?.sessionsPerWeek ?? 5,
          perSession: project.goal?.perSession ?? 1000,
        },
        ...(Number.isFinite(project.whatIfSessionsPerWeek) ? { whatIf: project.whatIfSessionsPerWeek } : {}),
        at,
      },
      days,
    },
    added,
    skipped: skipped.sort(),
    paceTotal: Math.max(project.startingAmount || 0, 0) + totalLogged(project.sessions),
    paceTarget: segments ? segments.count * segments.per : Math.max(0, project.target || 0),
  };
}
