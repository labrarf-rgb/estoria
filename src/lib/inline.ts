/**
 * Inline markdown, tokenized once and shared.
 *
 * The reading view renders these as elements and the `.docx` export turns them
 * into runs. They deliberately come from the same function: a manuscript that
 * emphasises a word on screen and not in the file sent to an agent is a bug
 * nobody would notice until it mattered.
 */

export interface InlineToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

/**
 * Ordered longest-first, so `***` is claimed before `**` and `**` before `*` —
 * and the same for the underscore forms, which is the whole reason `__bold__`
 * used to come out as an italic wearing two stray underscores.
 */
const RE =
  /(\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

export function inlineTokens(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    const t = m[0];
    if (t.startsWith("***") || t.startsWith("___"))
      out.push({ text: t.slice(3, -3), bold: true, italic: true });
    else if (t.startsWith("**") || t.startsWith("__"))
      out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("~~")) out.push({ text: t.slice(2, -2), strike: true });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), code: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = at + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
