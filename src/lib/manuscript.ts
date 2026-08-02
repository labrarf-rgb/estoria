/**
 * Chapter prose, and the `***` contract that ties it to the scene flow.
 *
 * A scene break in a manuscript is a **thematic break** — real markdown a
 * novelist types anyway, which is the whole reason it was chosen over a marker
 * like `<!-- s1 -->`. A marker the writer can see is a marker they have to work
 * around; `***` is one they were going to write regardless, it renders as a
 * horizontal rule, and it exports without stripping anything.
 *
 * A break is the prose form of a **connector**, so the counting rule falls out
 * of the schema: three scenes have two connectors and therefore two breaks, and
 * `breakCount === sceneLinks.length` is the whole drift check. The causal type
 * (`therefore` / `but` / `and`) is never written into the prose — reading mode
 * decorates the rule from `sceneLinks[i]`.
 *
 * See docs/manuscript-mode-build.md §3.
 */

/** What we write when we insert a break. Detection is looser — see `isBreak`. */
export const SCENE_BREAK = "***";

/**
 * Is this line a thematic break?
 *
 * Deliberately CommonMark's rule for asterisk breaks rather than an exact
 * `"***"` match: a writer who types `* * *` out of habit has written a scene
 * break and should get one. Up to three leading spaces, three or more asterisks,
 * spaces or tabs anywhere between, nothing else on the line.
 *
 * **Not** ambiguous with bold-italic. A thematic break requires the line to hold
 * only the marks, so `***patience***` mid-sentence stays emphasis.
 *
 * `---` is not accepted, and we never write it: a `---` on the line directly
 * below text parses as a setext heading in most markdown, which would silently
 * promote the sentence above it to an H2.
 */
export function isBreak(line: string): boolean {
  return /^ {0,3}\*[ \t]*\*[ \t]*\*[* \t]*$/.test(line);
}

/** Half-open `[start, end)` offsets of one scene's prose within the manuscript. */
export interface Section {
  start: number;
  end: number;
}

/**
 * Split the manuscript into the prose belonging to each scene. Sections are the
 * text *between* breaks, so `sections.length === breakCount + 1` always — even
 * for an empty manuscript, which is one empty section.
 *
 * The break lines themselves belong to no section. That is what puts a caret
 * resting on a `***` in the scene *above* it (see `sectionAt`), which is where a
 * writer who just typed the break expects to be.
 */
export function sections(text: string): Section[] {
  const out: Section[] = [];
  let start = 0;
  let lineStart = 0;

  while (lineStart <= text.length) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    if (isBreak(text.slice(lineStart, lineEnd))) {
      out.push({ start, end: lineStart > start ? lineStart - 1 : start });
      start = Math.min(lineEnd + 1, text.length);
    }
    if (lineEnd === text.length) break;
    lineStart = lineEnd + 1;
  }

  out.push({ start, end: text.length });
  return out;
}

/** How many `***` breaks the prose holds. Equals `sceneLinks.length` when in step. */
export function breakCount(text: string): number {
  return sections(text).length - 1;
}

/**
 * Which section the caret sits in. Clamped to `sceneCount` when given one, so a
 * manuscript that has drifted ahead of the map still lands on a real scene card
 * rather than off the end of the carousel. (Reconciling the drift is the drift
 * bar's job, not this function's — the map is never edited from here.)
 */
export function sectionAt(text: string, caret: number, sceneCount?: number): number {
  const secs = sections(text);
  let idx = 0;
  for (let i = 0; i < secs.length; i++) {
    if (secs[i].start <= caret) idx = i;
    else break;
  }
  return sceneCount ? Math.min(idx, sceneCount - 1) : idx;
}

/** Has this scene been written into? Whitespace between two breaks has not. */
export function isWritten(text: string, section: Section): boolean {
  return text.slice(section.start, section.end).trim().length > 0;
}

/** How many of the chapter's scenes have prose under them. */
export function writtenCount(text: string): number {
  const secs = sections(text);
  return secs.reduce((n, s) => n + (isWritten(text, s) ? 1 : 0), 0);
}

/**
 * The manuscript a chapter starts with: the breaks its scenes already imply,
 * and no prose. Seeding matters — a break with nothing after it is exactly what
 * makes a scene read as "not written", so an unseeded chapter would claim every
 * beat was drafted the moment you typed one word.
 *
 * Returns `""` for a single-scene chapter (no connectors, so no breaks). That is
 * a real seeded value, not an absent one: `manuscript === undefined` is what
 * "never opened" means, so seed on that and never on falsiness.
 */
export function seedManuscript(sceneCount: number): string {
  if (sceneCount <= 1) return "";
  return `\n${new Array(sceneCount - 1).fill(SCENE_BREAK).join("\n\n")}\n`;
}

// ---- Edits ------------------------------------------------------------------
//
// All of these are surgical: they splice at an offset rather than rebuild the
// document, because rebuilding would silently reformat prose the writer laid out
// by hand. `applyReorder` is the one exception, and it is the one operation the
// brief requires a confirm and an undo for.

/**
 * Open a new, empty section at `sectionIdx` — the prose half of `+ Add scene`.
 * Adding a break is the only way the map is allowed to touch the manuscript, and
 * it is allowed because it is purely additive: no character of prose moves.
 */
export function insertBreak(text: string, sectionIdx: number): string {
  const secs = sections(text);
  if (sectionIdx >= secs.length) return `${text}\n\n${SCENE_BREAK}\n\n`;
  const at = secs[Math.max(0, sectionIdx)].start;
  return `${text.slice(0, at)}${SCENE_BREAK}\n\n${text.slice(at)}`;
}

/**
 * Drop break `breakIdx`, joining the sections either side of it. Nothing is
 * deleted but the three asterisks and the blank lines that surrounded them —
 * the prose of both scenes survives, run together into one.
 */
export function removeBreak(text: string, breakIdx: number): string {
  const secs = sections(text);
  const a = secs[breakIdx];
  const b = secs[breakIdx + 1];
  if (!a || !b) return text;
  const head = text.slice(0, a.end).replace(/\s+$/, "");
  const tail = text.slice(b.start).replace(/^\s+/, "");
  return `${head}\n\n${tail}`;
}

/**
 * Move a section, matching a reorder the writer just made on the map.
 *
 * Unlike the others this rebuilds the document, so the blank lines between
 * sections are normalised — unavoidable when the sections themselves change
 * order. It is why this is offered rather than done, behind a confirm, with the
 * previous text kept for an undo.
 */
export function applyReorder(text: string, from: number, to: number): string {
  const parts = sections(text).map((s) => text.slice(s.start, s.end).trim());
  if (from < 0 || from >= parts.length) return text;
  const [moved] = parts.splice(from, 1);
  parts.splice(Math.max(0, Math.min(to, parts.length)), 0, moved);
  return parts.join(`\n\n${SCENE_BREAK}\n\n`);
}

/** Add `n` empty sections at the end — the count-only way out of drift. */
export function appendBreaks(text: string, n: number): string {
  let out = text;
  for (let i = 0; i < n; i++) out += `\n\n${SCENE_BREAK}\n\n`;
  return out;
}
