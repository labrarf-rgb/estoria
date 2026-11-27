/*
 * Ported from TTePub (src/ui/backgrounds/sun.ts), unchanged.
 *
 * Where Sunny day's sun sits, from the local time. Pure, no DOM.
 *
 * Daytime 6:00 to 18:00 maps onto an arc: low on the left (east) at 6:00,
 * top center at noon, low on the right (west) at 18:00. At night (Ray's
 * rule) the same hour and minute are read as morning: 21:30 shows as 9:30,
 * 23:59 as 11:59. Anything that still lands before 6:00 (real 0:00 to 5:59)
 * is held at the 6:00 position.
 */

const DAY_START = 6 * 60;
const DAY_END = 18 * 60;

/** Minutes after midnight that the sun is drawn for, after the night rule. */
export function sunMinutes(hours: number, minutes: number): number {
  let m = hours * 60 + minutes;
  if (m > DAY_END) m -= 12 * 60; // night: same clock reading, in the morning
  return Math.max(DAY_START, Math.min(DAY_END, m));
}

/** Progress across the day for a clock reading: 0 at 6:00, 0.5 at noon, 1 at 18:00. */
export function sunProgress(hours: number, minutes: number): number {
  return (sunMinutes(hours, minutes) - DAY_START) / (DAY_END - DAY_START);
}

export function sunProgressAt(date: Date): number {
  return sunProgress(date.getHours(), date.getMinutes());
}

export interface SunPoint {
  /** Fractions of the viewport; may sit a little outside it, so the sun itself stays off the page. */
  x: number;
  y: number;
  /** 0 at noon, 1 at sunrise and sunset: how much warmer the glow is. */
  warmth: number;
}

/** The arc: x runs left to right, y rises from low (0.6) to just above the top edge (-0.06) at noon. */
export function sunPoint(progress: number): SunPoint {
  const u = Math.max(0, Math.min(1, progress));
  const lift = Math.sin(Math.PI * u);
  return { x: -0.03 + 1.06 * u, y: 0.6 - 0.66 * lift, warmth: 1 - lift };
}

/** For test and preview overrides: "9:30" or "21:05" to a Date today, or null if it doesn't parse. */
export function parseClock(text: string | null | undefined): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((text ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}
