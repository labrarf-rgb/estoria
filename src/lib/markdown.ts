import {
  MAIN_DRAFT_ID,
  SCHEMA_VERSION,
  type Chapter,
  type ChapterLink,
  type Character,
  type ConnType,
  type StoryDoc,
  type WorldCategory,
  type WorldEntry,
} from "@/types";
import { displaySummary } from "@/lib/drafts";
import { countWords } from "@/lib/manuscript";
import { CARD_W, CARD_H } from "@/lib/layout";

const CONN_LABEL: Record<ConnType, string> = {
  therefore: "Therefore",
  but: "But",
  and: "And",
  /** Unused: a `"none"` seam is written as the absence of a tag, not a word. */
  none: "",
};

const ROMAN_UNITS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** Roman numeral for an Act number. Non-positive/invalid input falls back to
 *  the arabic value so a stray act count never renders blank. */
export function roman(a: number): string {
  if (!Number.isFinite(a) || a < 1) return String(a);
  let n = Math.floor(a);
  let out = "";
  for (const [value, sym] of ROMAN_UNITS) {
    while (n >= value) {
      out += sym;
      n -= value;
    }
  }
  return out;
}

/**
 * How an archived character or world entry is marked in exported markdown.
 *
 * Archived records are still exported: retiring one from the roster shouldn't
 * quietly delete it from the vault. The marker is a trailing italic tag rather
 * than a new field, so it reads as a note in Obsidian and can be stripped off
 * the end of a line before the existing parsers see it (`takeArchived`) — which
 * is what makes an export → import round trip preserve the flag.
 */
const ARCHIVED_MARK = " _(archived)_";

/** Split a trailing archived marker off a list line, if it carries one. */
function takeArchived(line: string): { line: string; archived: boolean } {
  const m = line.match(/^(.*?)\s*_\(archived\)_\s*$/i);
  return m ? { line: m[1], archived: true } : { line, archived: false };
}

/**
 * Build Obsidian-vault-ready markdown: characters become [[wikilinks]],
 * chapters are grouped under Act headings, scenes carry their but/therefore tags.
 * Renders the active version's board (`doc.chapters` — versions are standalone
 * forks, and only the active one is loaded at the top level).
 */
export function buildMarkdown(doc: StoryDoc): string {
  const title = doc.projectTitle || "Untitled Voyage";
  const total = doc.chapters.reduce((a, c) => a + c.words, 0);
  const charName = (id: string) => doc.characters.find((c) => c.id === id)?.name ?? id;
  const activeBook = doc.books.find((b) => b.id === doc.activeBookId);
  const bookTitle = activeBook ? activeBook.title : title;

  let md = `# ${bookTitle}\n\nMapped in Estoria. ${total.toLocaleString()} words across ${doc.chapters.length} chapters.\n`;

  if (doc.seriesMode) {
    md += `\n## Series: ${title}\n\n`;
    doc.books.forEach((b, i) => {
      md += `${i + 1}. **${b.title}** (${b.status}). ${b.premise}\n`;
    });
  }

  if (doc.storyNotes && doc.storyNotes.trim()) {
    md += `\n## Story Notes\n\n${doc.storyNotes.trim()}\n`;
  }

  // Character and World sections mirror the import-prompt schema, so the cast,
  // world, chapters and scenes of an exported file re-import through
  // parseImportMarkdown. Assets, story notes and series data are not re-read.
  md += "\n## Characters\n\n";
  doc.characters.forEach((c) => {
    md += `- **[[${c.name}]]** — ${c.role}${c.type ? ` | ${c.type}` : ""}${c.archived ? ARCHIVED_MARK : ""}\n`;
    if (c.desc) md += `  - Desc: ${c.desc}\n`;
    if (c.bio) md += `  - Bio: ${c.bio}\n`;
    if (c.traits.length) md += `  - Traits: ${c.traits.join(", ")}\n`;
    if (c.goals.length) md += `  - Goals: ${c.goals.join(", ")}\n`;
    if (c.motivations) md += `  - Motivations: ${c.motivations}\n`;
    if (c.want || c.need) md += `  - Wants: ${c.want}  | Needs: ${c.need}\n`;
  });

  if (doc.world.length) {
    md += "\n## World\n\n";
    doc.world.forEach((w) => {
      md += `- **${w.name}** [${w.cat}] — ${w.desc}${w.notes ? ` // Notes: ${w.notes}` : ""}${w.archived ? ARCHIVED_MARK : ""}\n`;
    });
  }

  const acts = [...new Set(doc.chapters.map((c) => c.act))];
  acts.forEach((a) => {
    md += `\n## Act ${roman(a)}\n`;
    doc.chapters
      .filter((c) => c.act === a)
      .forEach((c) => {
        md += `\n### ${c.num}. ${c.title}  ·  ${c.words.toLocaleString()} words\n> ${displaySummary(c)}\n\n**Scenes**\n`;
        c.scenes.forEach((s, j) => {
          // An unlabeled seam writes no tag at all — which is exactly what
          // `parseImportMarkdown` reads back as `"none"`, so the round trip
          // holds without putting a `_(none)_` marker in the vault.
          const link = c.sceneLinks[j];
          const conn =
            j < c.scenes.length - 1 && link && link !== "none"
              ? `  _(${CONN_LABEL[link].toLowerCase()})_`
              : "";
          md += `${j + 1}. ${s}${conn}\n`;
        });
        // Refs are pure links since v5 — resolve each label through the shared
        // asset pool, skipping any that no longer resolve.
        const pinnedAssets = c.refs
          .map((r) => doc.assets.find((a) => a.id === r.assetId))
          .filter((a): a is (typeof doc.assets)[number] => a != null);
        if (pinnedAssets.length) {
          // An archived asset keeps its pins (v8), so it still exports here.
          md += `\n**Pinned:** ${pinnedAssets
            .map((a) => `[[${a.label}]]${a.archived ? ARCHIVED_MARK : ""}`)
            .join(", ")}\n`;
        }
        // A pinned to-do's lines go out as real markdown checkboxes — the one
        // pinned resource whose *content* is worth carrying into the vault,
        // where it stays tickable (Obsidian renders these as live checklists).
        pinnedAssets.forEach((a) => {
          if (a.kind !== "TODO") return;
          // Empty lines are scaffolding the user hasn't filled in, not tasks.
          const tasks = (a.items ?? []).filter((it) => it.text.trim());
          if (tasks.length === 0) return;
          md += `\n**To-do — ${a.label || "Untitled list"}**\n`;
          tasks.forEach((it) => {
            md += `- [${it.done ? "x" : " "}] ${it.text}\n`;
          });
          // Blank line so the list closes before the next bold block.
          md += "\n";
        });
        md += `**Characters:** ${c.chars.map((id) => `[[${charName(id)}]]`).join(", ")}\n`;
      });
  });

  return md;
}

/**
 * The copy-paste prompt that turns any manuscript into Estoria markdown.
 *
 * With `prose` on, each chapter also carries its own text under a `#### Manuscript`
 * heading, which lands in `chapter.manuscript` and opens in the prose pane. It is
 * off by default: the map is a summary of a book and costs a page or two, while
 * the prose is the book, and pushing a finished novel through a chat model to get
 * back what you already have is a poor trade unless you actually want it there.
 */
export function importPrompt(prose = false): string {
  return [
    "ROLE: You are a careful manuscript-structuring assistant for an app called Estoria, where a novelist maps a story and writes it. You convert an EXISTING draft into one structured Markdown file. You are an organizer, not a co-author.",
    "",
    ...(prose
      ? [
          "THIS RUN CARRIES THE PROSE TOO: as well as mapping the story, you copy each chapter's actual text into the file, word for word, so I get my manuscript back alongside the map. Copying is transcription, not editing — see the fidelity rules.",
          "",
        ]
      : []),
    "MY MATERIAL: I will either paste it at the bottom of this message, or attach it as a file. If a file is attached, use the file and ignore the empty paste area. If both are present, use the attachment.",
    "",
    "ABSOLUTE FIDELITY RULES (read carefully):",
    "- Use ONLY what is in my material. Do NOT invent characters, scenes, plot points, places, or events that are not in the draft.",
    "- Do NOT continue, finish, embellish, or 'improve' the story. No new prose.",
    "- If a field is unknown from the draft, leave it blank rather than making something up.",
    "- Summaries must paraphrase what actually happens in my text, not what you imagine could happen.",
    "- It is fine to split the draft into chapters/scenes and to identify characters/places that ARE present. That organizing is the whole job. Inventing is not.",
    "- If my material is only partial (e.g. a few chapters), output only those. Do not pad it out to feel complete.",
    ...(prose
      ? [
          "- The prose you copy must be my exact words. Do not rewrite, tighten, correct, modernise, re-punctuate, or 'clean up' a single sentence — not even an obvious typo. Transcribe it.",
          "- Never summarise a chapter in place of its text, and never write a placeholder like '[chapter continues]' or '(rest of chapter unchanged)'. Either the whole chapter is there or its Manuscript block is left out.",
          "- A chapter that is outlined but not yet written gets no Manuscript block at all. An empty one is worse than none.",
        ]
      : []),
    "",
    "OUTPUT FORMAT:",
    "- Output ONE Markdown file and nothing else: no preamble, no explanation, no code fences around it.",
    "- Provide it as a DOWNLOADABLE .md file. Name the file exactly: \"<My Novel's Title> - estoria download.md\" (replace with the real title). If you cannot attach a file, put the filename on its own first line as `FILENAME: <My Novel's Title> - estoria download.md` and then the markdown.",
    "- Follow this schema EXACTLY (headings, punctuation, and the `·`, `>`, and `(therefore)` markers matter — Estoria parses them literally):",
    "",
    "# <Story Title>",
    "<one-paragraph premise, drawn only from the draft>",
    "",
    "## Characters",
    "- **<Name>** — <role: Protagonist/Antagonist/Ally/etc> | <archetype>",
    "  - Bio: <from the draft; blank if unknown>",
    "  - Traits: <comma list>",
    "  - Goals: <comma list>",
    "  - Motivations: <1 sentence>",
    "  - Wants: <1 line>  | Needs: <1 line>",
    "",
    "## World",
    "- **<Name>** [<Place|Faction|Lore|Event>] — <description> // Notes: <optional>",
    "",
    "## Act 1",
    "### 1. <Chapter Title> · <approx word count> words",
    "> <one-line chapter summary>",
    "Scenes:",
    "1. <scene> (therefore)",
    "2. <scene> (but)",
    "3. <scene>",
    "Characters: <names in this chapter>",
    ...(prose
      ? [
          "",
          "#### Manuscript",
          "<the chapter's text, copied exactly, as normal Markdown paragraphs separated by a blank line. Keep my paragraph breaks and dialogue as they are. Use *** on its own line where the draft has a scene break. Do not put a heading, a chapter title, or a scene number inside this block.>",
        ]
      : []),
    "",
    "RULES: Number chapters sequentially across acts. After each scene except the last, tag the link to the NEXT scene as (therefore) for causal, (but) for conflict/reversal, or (and) for parallel/addition — and leave the tag OFF entirely when the two scenes merely follow one another, or when the draft does not make the relationship clear. An untagged link is a real, valid answer: it means \"these are in this order and the draft has not said why\". Do not label every link just to have labelled it. Group chapters under ## Act 1 / ## Act 2 / … headings (use as many acts as the draft supports). If the draft has no obvious word counts, estimate from scene length or omit the `· <n> words` part.",
    ...(prose
      ? [
          "",
          "MANUSCRIPT RULES: The `#### Manuscript` heading is what Estoria looks for, so spell it exactly that way, put it last in the chapter (after `Characters:`), and end it at the next `###` chapter or `##` act heading. The scenes list stays a short beat-by-beat map even when the full text is right below it — the two are read separately.",
          "IF THE BOOK IS TOO LONG for one reply: do NOT compress it. Give me the file in parts — part 1 with the `# title`, `## Characters`, `## World` and as many chapters as fit, then each later part starting at the next `## Act` or `### <n>.` heading and continuing the same numbering. Stop at a chapter boundary, never mid-chapter, and wait for me to say 'continue'. I will join the parts end to end into one file.",
        ]
      : []),
    "",
    "--- MY MATERIAL BELOW (or attached as a file) ---",
    "<paste your draft / outline / notes here, or attach the file instead>",
  ].join("\n");
}

export interface ImportSummary {
  name: string;
  chapters: number;
  scenes: number;
  characters: number;
  /** Chapters that arrived with prose in them, and the words they hold. */
  written: number;
  words: number;
}

// ---------------------------------------------------------------------------
// Import parser: markdown (the import-prompt schema) -> a real StoryDoc.
// Tolerant of the kind of variation an AI produces (extra blank lines, smart
// dashes, missing optional fields, headings that drift slightly).
// ---------------------------------------------------------------------------

const IMPORT_PALETTE = [
  "oklch(0.60 0.10 215)",
  "oklch(0.58 0.15 30)",
  "oklch(0.62 0.12 85)",
  "oklch(0.56 0.12 305)",
  "oklch(0.60 0.12 145)",
  "oklch(0.58 0.13 255)",
  "oklch(0.62 0.13 20)",
];

let importSeq = 0;
const importId = (p: string) => `${p}-${Date.now().toString(36)}-${(importSeq++).toString(36)}`;

const norm = (s: string) => s.trim().toLowerCase();

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Strip leading list/heading markup and [[wikilink]] brackets. */
const clean = (s: string) => s.replace(/\[\[([^\]]+)\]\]/g, "$1").trim();

function parseActNumber(heading: string, fallback: number): number {
  const digits = heading.match(/(\d+)/);
  if (digits) return parseInt(digits[1], 10);
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  const word: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const token = norm(heading.replace(/^act\s*/i, "").replace(/[:.].*$/, ""));
  return roman[token] ?? word[token] ?? fallback;
}

/** Split a body into `## ` sections; returns the lead text + each section. */
function splitSections(lines: string[]): { lead: string[]; sections: { heading: string; body: string[] }[] } {
  const lead: string[] = [];
  const sections: { heading: string; body: string[] }[] = [];
  let cur: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      cur = { heading: h2[1].trim(), body: [] };
      sections.push(cur);
    } else if (cur) {
      cur.body.push(line);
    } else {
      lead.push(line);
    }
  }
  return { lead, sections };
}

function parseCharacters(body: string[]): Character[] {
  const out: Character[] = [];
  let cur: Character | null = null;
  let colorIdx = 0;
  for (const raw of body) {
    // Separator after the name may be a dash *or* a colon — AIs drift between
    // `- **Name** — role` and `- **Name**: role`.
    // Strip the archived tag first, so `type` doesn't swallow it.
    const { line: topLine, archived } = takeArchived(raw);
    const top = topLine.match(/^[-*]\s+\*\*(.+?)\*\*\s*(?:[—–:-]\s*(.*))?$/);
    if (top && !/^\s/.test(raw)) {
      const name = clean(top[1]);
      let role = "Supporting";
      let type = "";
      if (top[2]) {
        const parts = top[2].split("|");
        role = clean(parts[0]) || role;
        if (parts[1]) type = clean(parts[1]);
      }
      cur = {
        id: importId("p"),
        name,
        role,
        type: type || "Character",
        initials: initialsFrom(name),
        color: IMPORT_PALETTE[colorIdx++ % IMPORT_PALETTE.length],
        desc: "",
        bio: "",
        traits: [],
        goals: [],
        motivations: "",
        want: "",
        need: "",
        notes: "",
        ...(archived ? { archived: true } : {}),
      };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const field = raw.match(/^\s*[-*]?\s*(desc|bio|traits|goals|motivations?|wants?|needs?):\s*(.*)$/i);
    if (!field) continue;
    const key = norm(field[1]);
    const val = field[2].trim();
    if (key === "desc") cur.desc = clean(val);
    else if (key === "bio") cur.bio = clean(val);
    else if (key === "traits") cur.traits = val.split(/[,;]/).map(clean).filter(Boolean);
    else if (key === "goals") cur.goals = val.split(/[,;]/).map(clean).filter(Boolean);
    else if (key.startsWith("motivation")) cur.motivations = clean(val);
    else if (key.startsWith("want")) {
      // May be "Wants: x | Needs: y" on one line.
      const split = val.split("|");
      cur.want = clean(split[0]);
      const needPart = split.slice(1).join("|").match(/needs?:\s*(.*)/i);
      if (needPart) cur.need = clean(needPart[1]);
    } else if (key.startsWith("need")) cur.need = clean(val);
  }
  return out;
}

function parseWorld(body: string[]): WorldEntry[] {
  const out: WorldEntry[] = [];
  const cats: Record<string, WorldCategory> = {
    place: "Place",
    faction: "Faction",
    lore: "Lore",
    event: "Event",
  };
  for (const raw of body) {
    // Strip the archived tag first, so it doesn't land inside the notes.
    const { line, archived } = takeArchived(raw);
    const m = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*(?:\[(.+?)\])?\s*(?:[—–-]\s*(.*))?$/);
    if (!m) continue;
    const name = clean(m[1]);
    const cat = cats[norm(m[2] || "")] ?? "Lore";
    let desc = (m[3] || "").trim();
    let notes = "";
    const noteSplit = desc.split(/\/\/\s*notes?:/i);
    if (noteSplit.length > 1) {
      desc = noteSplit[0].trim();
      notes = noteSplit[1].trim();
    }
    out.push({
      id: importId("w"),
      cat,
      name,
      desc: clean(desc),
      notes: clean(notes),
      refs: [],
      ...(archived ? { archived: true } : {}),
    });
  }
  return out;
}

interface ParsedChapter {
  num: number;
  act: number;
  title: string;
  words: number;
  summary: string;
  scenes: string[];
  sceneLinks: ConnType[];
  charNames: string[];
  manuscript?: string;
}

/**
 * The heading that opens a chapter's prose: `#### Manuscript`, which is what the
 * prompt asks for, plus the forms an AI drifts into (`**Manuscript**`, `#### Prose`,
 * `Full text:`). Everything after it belongs to the chapter's manuscript, so the
 * line-by-line pass below has to stop where this matches — prose paragraphs
 * beginning `- ` or `1. ` would otherwise be read as scenes.
 */
const MANUSCRIPT_HEADING = /^\s*(?:#{2,6}\s*)?[_*]{0,2}(manuscript|prose|full text)[_*]{0,2}\s*:?\s*$/i;

/** Trim blank lines off both ends without touching the indentation inside. */
function trimBlankEdges(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

function parseActChapters(act: number, body: string[]): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  // Split the act body into `### ` chapter chunks.
  const chunks: string[][] = [];
  let cur: string[] | null = null;
  for (const line of body) {
    if (/^###\s+/.test(line)) {
      cur = [line];
      chunks.push(cur);
    } else if (cur) {
      cur.push(line);
    }
  }
  for (const chunk of chunks) {
    const head = chunk[0].replace(/^###\s+/, "").trim();
    // "1. Title · 3200 words"  (number, title, optional word count all optional)
    const numM = head.match(/^(\d+)[.)]\s*/);
    const num = numM ? parseInt(numM[1], 10) : out.length + 1;
    let rest = numM ? head.slice(numM[0].length) : head;
    let words = 0;
    const wordsM = rest.match(/[·|,-]?\s*~?\s*([\d,]+)\s*words?\b/i);
    if (wordsM) {
      words = parseInt(wordsM[1].replace(/,/g, ""), 10) || 0;
      rest = rest.slice(0, wordsM.index).replace(/[·|,\-\s]+$/, "");
    }
    const title = clean(rest) || `Chapter ${num}`;

    // The prose comes off the end first: from `#### Manuscript` to the end of the
    // chapter is text, not structure, and must not meet the scene matcher below.
    const body = chunk.slice(1);
    const proseAt = body.findIndex((l) => MANUSCRIPT_HEADING.test(l));
    const map = proseAt >= 0 ? body.slice(0, proseAt) : body;
    const proseLines = proseAt >= 0 ? trimBlankEdges(body.slice(proseAt + 1)) : [];
    const manuscript = proseLines.join("\n");

    let summary = "";
    const scenes: string[] = [];
    const sceneTags: ConnType[] = [];
    const charNames: string[] = [];
    for (const line of map) {
      const t = line.trim();
      if (!t) continue;
      const quote = t.match(/^>\s*(.*)$/);
      if (quote) {
        summary = summary ? `${summary} ${clean(quote[1])}` : clean(quote[1]);
        continue;
      }
      // Tolerate emphasis around the label on either side of the colon:
      // `Characters:`, `**Characters:**` (what buildMarkdown writes), `_Characters_:`.
      // Matched before scenes so a bulleted cast line never lands as a scene.
      const charLine = t.match(/^(?:[-*+]\s+)?[_*]{0,2}characters?[_*]{0,2}\s*:[_*]{0,2}\s*(.*)$/i);
      if (charLine) {
        charLine[1]
          .split(/[,;]/)
          .map(clean)
          .filter(Boolean)
          .forEach((n) => charNames.push(n));
        continue;
      }
      if (/^[_*]{0,2}scenes?[_*]{0,2}\s*:?[_*]{0,2}\s*$/i.test(t)) continue;
      // Bullets count as scenes too — AIs drift from `1.` to `-` freely, and
      // ignoring them silently emptied the chapter.
      const sceneM = t.match(/^(?:\d+[.)]|[-*+])\s+(.*)$/);
      // A *numbered* marker alone on its line is an **empty beat**, not a stray
      // number. `buildMarkdown` writes a blank scene as `2. ` and the line
      // arrives here trimmed to `2.`, so without this the scene vanishes and
      // every later link shifts up one seam. Since v9 that is common rather
      // than rare: an unlabeled seam writes no `_(therefore)_`, and it was
      // only ever the tag that kept a blank scene's line matchable.
      //
      // Deliberately **not** `\s*` on the rule above, which would let the
      // bullet branch match a lone `*`, an emphasised line (`*She lies here*`
      // → a scene), `---`, `+1 …`, and read `3.5 hours later` as scene "5
      // hours later". Bullets still require their space; only the numbered
      // form, which is what this app writes, may stand alone.
      const emptyScene = !sceneM && /^\d+[.)]\s*$/.test(t);
      if (sceneM || emptyScene) {
        let text = sceneM ? sceneM[1].trim() : "";
        // Untagged means unlabeled, not causal. `buildMarkdown` writes no tag
        // for a `"none"` seam, so this is what makes an export → import round
        // trip lossless. It does mean markdown from before v9 — or an AI file
        // that skipped some tags — imports those seams unlabeled where it used
        // to import them as "therefore".
        let link: ConnType = "none";
        // The tag may be wrapped in emphasis: `(but)`, `_(but)_`, `**(but)**`.
        const tag = text.match(/[_*]{0,2}\((therefore|but|and|none)\)[_*]{0,2}\s*$/i);
        if (tag) {
          link = tag[1].toLowerCase() as ConnType;
          text = text.slice(0, tag.index).trim();
        }
        scenes.push(clean(text));
        sceneTags.push(link);
      }
    }
    out.push({
      num,
      act,
      title,
      words,
      summary,
      scenes: scenes.length ? scenes : ["New scene."],
      sceneLinks: sceneTags.slice(0, Math.max(0, (scenes.length || 1) - 1)),
      charNames,
      // Left `undefined` when nothing was written, because that is the value the
      // word-count rules read as "never drafted" (see `syncChapterWords`). A block
      // holding only `***` or stray punctuation counts as nothing.
      ...(countWords(manuscript) > 0 ? { manuscript } : {}),
    });
  }
  return out;
}

export interface ParseResult {
  doc: StoryDoc;
  summary: ImportSummary;
}

/** Parse the import-schema markdown into a complete single-book StoryDoc. */
export function parseImportMarkdown(text: string, fileName = "import.md"): ParseResult {
  importSeq = 0;
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  // Title = first `# ` heading; premise = the text between it and the first `## `.
  let title = "Imported Story";
  const titleIdx = lines.findIndex((l) => /^#\s+/.test(l));
  if (titleIdx >= 0) title = clean(lines[titleIdx].replace(/^#\s+/, ""));
  const afterTitle = titleIdx >= 0 ? lines.slice(titleIdx + 1) : lines;

  const { lead, sections } = splitSections(afterTitle);
  const premise = lead.map((l) => l.trim()).filter(Boolean).join(" ").trim();

  let characters: Character[] = [];
  const world: WorldEntry[] = [];
  const parsedChapters: ParsedChapter[] = [];
  let actCounter = 0;

  for (const sec of sections) {
    const h = norm(sec.heading);
    if (/^characters?/.test(h)) characters = characters.concat(parseCharacters(sec.body));
    else if (/^world/.test(h)) world.push(...parseWorld(sec.body));
    // Require the heading to *start* with "act" — the old loose fallback
    // (/act/ anywhere) misread sections like "## Factions" as an act.
    else if (/^act\b/.test(h)) {
      actCounter += 1;
      const act = parseActNumber(sec.heading, actCounter);
      parsedChapters.push(...parseActChapters(act, sec.body));
    }
  }

  // Resolve chapter character names to ids, creating stubs for unknown names so
  // nothing the author listed is silently dropped.
  const byName = new Map<string, string>();
  characters.forEach((c) => byName.set(norm(c.name), c.id));
  let stubColor = characters.length;
  const ensureChar = (name: string): string => {
    const key = norm(name);
    const found = byName.get(key);
    if (found) return found;
    const c: Character = {
      id: importId("p"),
      name,
      role: "Supporting",
      type: "Character",
      initials: initialsFrom(name),
      color: IMPORT_PALETTE[stubColor++ % IMPORT_PALETTE.length],
      desc: "",
      bio: "",
      traits: [],
      goals: [],
      motivations: "",
      want: "",
      need: "",
      notes: "",
    };
    characters.push(c);
    byName.set(key, c.id);
    return c.id;
  };

  // Lay chapters on a grid and build the chapter records.
  const cols = 4;
  const gapX = 72;
  const gapY = 82;
  const margin = 46;
  const chapters: Chapter[] = parsedChapters.map((pc, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: importId("c"),
      num: i + 1,
      act: pc.act,
      status: "idea",
      title: pc.title,
      summary: pc.summary,
      words: pc.words,
      x: margin + col * (CARD_W + gapX),
      y: margin + row * (CARD_H + gapY),
      chars: pc.charNames.map(ensureChar),
      scenes: pc.scenes,
      sceneLinks: pc.sceneLinks,
      refs: [],
      // A chapter that arrived with its text in it is written, not an idea.
      ...(pc.manuscript ? { manuscript: pc.manuscript, status: "draft" as const } : {}),
    };
  });

  const links: ChapterLink[] = chapters
    .slice(0, -1)
    .map((c, i) => ({ fromId: c.id, toId: chapters[i + 1].id, type: "therefore" as ConnType }));

  const doc: StoryDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: importId("story"),
    projectTitle: title,
    seriesMode: false,
    drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
    activeDraftId: MAIN_DRAFT_ID,
    mainDraftId: MAIN_DRAFT_ID,
    characters,
    world,
    assets: [],
    books: [
      {
        id: "book-1",
        title,
        subtitle: "Book One",
        status: "drafting",
        premise,
        arc: "",
        notes: "",
        x: 80,
        y: 90,
      },
    ],
    bookLinks: [],
    activeBookId: "book-1",
    chapters,
    links,
    storyNotes: "",
    draftData: {},
    bookData: {},
  };

  const written = chapters.filter((c) => c.manuscript);
  const summary: ImportSummary = {
    name: fileName,
    chapters: chapters.length,
    scenes: chapters.reduce((a, c) => a + c.scenes.length, 0),
    characters: characters.length,
    written: written.length,
    words: written.reduce((a, c) => a + countWords(c.manuscript ?? ""), 0),
  };

  return { doc, summary };
}
