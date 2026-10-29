export function formatDate(d: Date | null): string {
  if (!d) return "never";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDayNumber(d: Date): string {
  return String(d.getDate());
}

export function formatAmount(n: number): string {
  return Math.round(n).toLocaleString();
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${Math.round(k * 10) / 10}k`.replace(".0k", "k");
  }
  return String(Math.round(n));
}

/**
 * A span of days in the largest unit that still reads honestly.
 * Days up to six weeks, then months, then years.
 */
export function formatSpan(days: number): string {
  if (!Number.isFinite(days)) return "never";
  const n = Math.abs(Math.round(days));
  if (n < 45) return `${n} ${n === 1 ? "day" : "days"}`;
  if (n < 550) {
    const months = Math.round((n / 30.44) * 10) / 10;
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  const years = Math.round((n / 365.25) * 10) / 10;
  return `${years} ${years === 1 ? "year" : "years"}`;
}

/** A signed span, e.g. "+7 days" or "-4.1 months". */
export function formatDelta(days: number): string {
  if (!Number.isFinite(days)) return "never";
  const rounded = Math.round(days);
  if (rounded === 0) return "no change";
  return `${rounded > 0 ? "+" : "−"}${formatSpan(days)}`;
}

export function formatRate(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "1 day", "3.5 days". Used wherever a weekly frequency is spelled out. */
export function formatDays(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}
