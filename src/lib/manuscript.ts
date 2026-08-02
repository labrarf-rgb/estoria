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
