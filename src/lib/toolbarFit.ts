/**
 * How the toolbar fits a narrow window (SPECS §7 "Toolbar on narrow windows",
 * approved mockup `docs/toolbar/mockup/`, Ray's revised approach C).
 *
 * One row always. When the row would not fit, in order, each step only when
 * the one before is not enough:
 *
 *  1. **Icons.** New chapter / New book / Add piece, Auto-arrange, and
 *     Characters / World / Notes drop their words for line icons.
 *  2. **File and Settings fold together** into one More menu at the far right.
 *     (Folding only Settings would swap its button for More and save ~15px.)
 *  3. **Characters / World / Notes** fold, then Auto-arrange, the ↓ → timeline
 *     direction, the add button, Scenes / Manuscript, and Board / Timeline.
 *  4. If even that is too wide (long names at the 768px floor), the identity
 *     block is allowed to shrink, and its names truncate.
 *
 * Pure arithmetic on measured widths, so it can be tested without a DOM. The
 * widths come from an off-layout copy of every item (`Toolbar`'s measurer),
 * never from the live row, so the answer cannot feed back into its own input.
 */

export type FoldKey = "file" | "settings" | "panels" | "arrange" | "orient" | "add" | "pane" | "viewseg";

/** Fold steps, first out first. A step folds all of its keys at once. */
export const FOLD_STEPS: readonly (readonly FoldKey[])[] = [
  ["file", "settings"],
  ["panels"],
  ["arrange"],
  ["orient"],
  ["add"],
  ["pane"],
  ["viewseg"],
];

/** A control with a word label and, optionally, an icon form. */
export interface Labelled {
  w: number;
  icon?: number;
}

/** Measured widths, in CSS px. An absent control is not in this view. */
export interface BarWidths {
  /** Room inside the bar's padding. */
  avail: number;
  /** Gap between the row's children. */
  gap: number;
  /** Gap inside the view group (Board / Timeline, ↓ →, Scenes / Manuscript). */
  innerGap: number;
  /** Children that never fold: wordmark, divider, identity with its version. */
  fixed: readonly number[];
  add?: Labelled;
  arrange?: Labelled;
  /** The hairline after the add / arrange buttons. */
  actSep: number;
  viewseg?: number;
  orient?: number;
  pane?: number;
  panels: Labelled;
  file: number;
  settings: number;
  more: number;
}

export interface Fit {
  compact: boolean;
  folded: ReadonlySet<FoldKey>;
  /** Everything folded and still too wide: let the identity names truncate. */
  squeeze: boolean;
}

export const FULL: Fit = { compact: false, folded: new Set(), squeeze: false };

const sized = (l: Labelled, compact: boolean) => (compact && l.icon != null ? l.icon : l.w);

/** Width of the row for one arrangement. Mirrors the order `Toolbar` renders in. */
export function rowWidth(b: BarWidths, compact: boolean, folded: ReadonlySet<FoldKey>): number {
  const kids: number[] = [...b.fixed, 0]; // 0: the flex spacer, which still takes a gap
  const show = (k: FoldKey) => !folded.has(k);
  let acts = 0;
  if (b.add && show("add")) (kids.push(sized(b.add, compact)), acts++);
  if (b.arrange && show("arrange")) (kids.push(sized(b.arrange, compact)), acts++);
  if (acts) kids.push(b.actSep);
  const group = [b.viewseg, b.orient, b.pane].filter(
    (w, i): w is number => w != null && show((["viewseg", "orient", "pane"] as const)[i])
  );
  if (group.length) kids.push(group.reduce((a, w) => a + w, 0) + b.innerGap * (group.length - 1));
  if (show("panels")) kids.push(sized(b.panels, compact));
  if (folded.size) kids.push(b.more);
  if (show("file")) kids.push(b.file);
  if (show("settings")) kids.push(b.settings);
  return kids.reduce((a, w) => a + w, 0) + b.gap * (kids.length - 1);
}

/**
 * Whether a fold step changes anything in this view. A step for a control the
 * view lacks (no add button on the timeline) is skipped rather than spent.
 */
function present(b: BarWidths, k: FoldKey): boolean {
  return k === "file" || k === "settings" || k === "panels" || b[k] != null;
}

/** The least folded arrangement that fits. */
export function fitToolbar(b: BarWidths): Fit {
  // Half a pixel of slack: measured widths are fractional.
  const fits = (compact: boolean, folded: ReadonlySet<FoldKey>) => rowWidth(b, compact, folded) <= b.avail + 0.5;
  if (fits(false, FULL.folded)) return FULL;
  const folded = new Set<FoldKey>();
  if (fits(true, folded)) return { compact: true, folded, squeeze: false };
  for (const step of FOLD_STEPS) {
    const live = step.filter((k) => present(b, k));
    if (!live.length) continue;
    live.forEach((k) => folded.add(k));
    if (fits(true, folded)) return { compact: true, folded: new Set(folded), squeeze: false };
  }
  return { compact: true, folded: new Set(folded), squeeze: true };
}

export function sameFit(a: Fit, b: Fit): boolean {
  return (
    a.compact === b.compact &&
    a.squeeze === b.squeeze &&
    a.folded.size === b.folded.size &&
    [...a.folded].every((k) => b.folded.has(k))
  );
}
