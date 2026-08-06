/**
 * Chapter prose.
 *
 * **The prose is not bound to the scenes.** An earlier design separated scenes
 * with `***` thematic breaks and kept the two in step — the carousel followed
 * your caret, each beat knew whether it had been written, and a drift bar
 * reconciled the two whenever they disagreed. It was dropped, and the reason is
 * worth keeping: the app *seeded* those breaks, so opening a fresh nine-scene
 * chapter greeted you with eight rows of `***` and nothing between them. The
 * original argument for the marker was that it is what a novelist types anyway;
 * pre-filling it is the app typing it for you, which is the opposite thing.
 *
 * So a manuscript is one string of markdown per chapter, and the scene flow sits
 * beside it as a **guide** rather than a structure the prose has to satisfy.
 * That is all the premise ever needed: seeing your beats while you draft does
 * not require the beats to own the paragraphs.
 *
 * What went with it: per-scene written state, beats that borrowed their opening
 * line, `#` scene breaks in the `.docx`, and about three hundred lines of
 * sections, drift and reconciliation.
 */

import type { Chapter } from "@/types";

export type Block =
  | { kind: "p" | "quote"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "hr" };

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET = /^ {0,3}[-*+]\s+(.*)$/;
const NUMBER = /^ {0,3}\d+[.)]\s+(.*)$/;
/** A markdown thematic break. A plain rule, meaning nothing more than it says. */
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * Markdown → blocks. Small on purpose: this covers what someone drafting a novel
 * actually types, and stops well short of tables and reference links.
 */
export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.split("\n");
  let para: string[] = [];

  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join("\n") });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      out.push({ kind: "hr" });
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      flush();
      out.push({ kind: "h", level: h[1].length, text: h[2] });
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const parts = [line.match(QUOTE)![1]];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        parts.push(lines[++i].match(QUOTE)![1]);
      }
      out.push({ kind: "quote", text: parts.join("\n") });
      continue;
    }
    const isBullet = BULLET.test(line);
    const isNumber = !isBullet && NUMBER.test(line);
    if (isBullet || isNumber) {
      flush();
      const re = isBullet ? BULLET : NUMBER;
      const items = [line.match(re)![1]];
      while (i + 1 < lines.length && re.test(lines[i + 1])) items.push(lines[++i].match(re)![1]);
      out.push({ kind: isBullet ? "ul" : "ol", items });
      continue;
    }
    // A single newline inside a paragraph is a soft wrap, exactly as markdown
    // says, so consecutive lines join rather than starting something new.
    para.push(line.trim());
  }
  flush();
  return out;
}


/**
 * A GFM task-list item, if that is what this bullet is. Read-only wherever it
 * is shown: the markdown you typed is the source of truth, so a checkbox here
 * reports the text rather than offering to rewrite it.
 */
export function taskItem(item: string): { done: boolean; text: string } | null {
  const m = item.match(/^\[([ xX])\]\s+(.*)$/);
  return m ? { done: m[1].toLowerCase() === "x", text: m[2] } : null;
}

/**
 * Prose split into paragraphs on blank lines. What reading mode lays out, and
 * what the exporters walk.
 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+$/, "").replace(/^\n+/, ""))
    .filter((p) => p.trim().length > 0);
}

/**
 * Words in a manuscript.
 *
 * Markdown is stripped first, or `**tension**` counts as two. Tokens with no
 * letter or digit in them (a lone em dash, a stray bullet) are not words either.
 */
export function countWords(markdown: string): number {
  const flat = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/[*_~`]/g, "");
  return (flat.match(/\S+/g) ?? []).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Has this chapter been written in at all? */
export const hasProse = (text: string | undefined): boolean => !!text && countWords(text) > 0;

/**
 * Refresh one chapter's `words` cache from its prose. **The single definition of
 * that cache** — every path that can change a manuscript goes through here, so
 * the board, the rail, the toolbar, the version menu and the series map cannot
 * disagree with each other or with what is written.
 *
 * Two rules survive from when the recompute lived in the store:
 *
 *  - **A chapter with no manuscript is never touched.** Every book written
 *    before prose existed carries a hand-typed count and no text, and counting
 *    what isn't there would report an 80,000-word project as 0.
 *  - **Promote, don't overwrite.** The first time real prose appears the number
 *    already there was a *plan*, so it moves to `target` rather than being
 *    replaced — `words` used to mean *planned* (the AI import prompt says
 *    "estimate from scene length"), and the gap between the two is the reading
 *    the board exists to show.
 *
 * What changed: an empty manuscript now counts as **0** rather than freezing the
 * last number. `manuscript` stays `undefined` until someone types, so a defined
 * one that counts zero means the words were deleted — and the old plan is safe
 * in `target` by the rule above. A count that quietly refuses to fall is the
 * kind of lying number this whole pass is about.
 */
export function syncChapterWords(c: Chapter): Chapter {
  if (c.manuscript === undefined) return c;
  const n = countWords(c.manuscript);
  const promote = c.target === undefined && c.words > 0;
  if (n === c.words && !promote) return c;
  return { ...c, ...(promote ? { target: c.words } : {}), words: n };
}

/** The same, over a board. Returns the array it was given when nothing moved. */
export function syncWords(chapters: Chapter[]): Chapter[] {
  let changed = false;
  const next = chapters.map((c) => {
    const n = syncChapterWords(c);
    if (n !== c) changed = true;
    return n;
  });
  return changed ? next : chapters;
}

/**
 * A chapter with the prose taken out — what a structure-only fork gets. The
 * count has to come out with it, or the fork reports the parent's word total
 * against none of its writing. The plan is promoted on the way, so what the fork
 * shows is `0 / 3.2k`: an experiment that has everything to write.
 */
export function withoutProse(c: Chapter): Chapter {
  if (c.manuscript === undefined) return c;
  const { manuscript: _drop, ...rest } = c;
  const promote = rest.target === undefined && rest.words > 0;
  return { ...rest, ...(promote ? { target: rest.words } : {}), words: 0 };
}

/** `1.2k` / `840` — the shape the board and rail cards have always used. */
export const shortCount = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

/**
 * The card's word line. With a target set it becomes a progress reading, which
 * is the number a planning tool can show and a text editor cannot — the whole
 * reason `words` and `target` are two fields rather than one.
 */
export function wordsMeta(words: number, target?: number): string {
  return target && target > 0
    ? `${shortCount(words)} / ${shortCount(target)} words`
    : `${shortCount(words)} words`;
}
