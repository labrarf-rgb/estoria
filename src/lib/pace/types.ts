/** One recorded work session. `date` is a local calendar day, `YYYY-MM-DD`. */
export interface Session {
  date: string;
  amount: number;
}

/** The pace the user intends to keep, as opposed to the one they actually keep. */
export interface Goal {
  sessionsPerWeek: number;
  perSession: number;
}

/** A target expressed as repeated equal parts, e.g. 15 chapters of 5,000 words. */
export interface Segments {
  count: number;
  per: number;
}

/**
 * A project is unit-agnostic. Nothing below the label fields knows or cares
 * whether the amounts are words, miles, pages or dollars.
 */
export interface Project {
  id: string;
  name: string;
  /** Plural noun for the thing being counted: "words", "miles", "pages". */
  unitLabel: string;
  /** Singular noun for one work session: "sitting", "run", "practice". */
  sessionLabel: string;
  /** Singular noun for one segment: "chapter", "week", "module". Optional. */
  segmentLabel?: string;
  /** When present, `target` is derived from this and kept in sync. */
  segments?: Segments;
  target: number;
  /**
   * Work finished before tracking began. Counts toward the target and never
   * toward the measured pace: it says where you started, not how fast you go.
   */
  startingAmount: number;
  /**
   * Local calendar day tracking began, `YYYY-MM-DD`. This is the start of the
   * measured window, not necessarily the day the work itself started.
   */
  startDate: string;
  /** Optional local calendar day the work is due, `YYYY-MM-DD`. */
  deadline?: string;
  goal: Goal;
  /**
   * Where the what-if lever is parked, in sessions per week. Persisted per
   * project so a scenario survives a reload and does not follow you when you
   * switch projects. Undefined means it has never been moved, and the lever
   * opens on the measured pace.
   */
  whatIfSessionsPerWeek?: number;
  sessions: Session[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  version: 1;
  projects: Project[];
  activeId: string | null;
  theme: "light" | "dark";
}
