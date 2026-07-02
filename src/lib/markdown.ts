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
import { displaySummary, resolveTitle } from "@/lib/drafts";
import { CARD_W, CARD_H } from "@/lib/layout";

const CONN_LABEL: Record<ConnType, string> = {
  therefore: "Therefore",
  but: "But",
  and: "And",
};

export function roman(a: number): string {
  return ({ 1: "I", 2: "II", 3: "III" } as Record<number, string>)[a] || String(a);
}

/**
 * Build Obsidian-vault-ready markdown: characters become [[wikilinks]],
 * chapters are grouped under Act headings, scenes carry their but/therefore tags.
 */
export function buildMarkdown(doc: StoryDoc, draftId: string = doc.activeDraftId): string {
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

  // Character and World sections mirror the import-prompt schema, so an
  // exported file round-trips through parseImportMarkdown without loss.
  md += "\n## Characters\n\n";
  doc.characters.forEach((c) => {
    md += `- **[[${c.name}]]** — ${c.role}${c.type ? ` | ${c.type}` : ""}\n`;
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
      md += `- **${w.name}** [${w.cat}] — ${w.desc}${w.notes ? ` // Notes: ${w.notes}` : ""}\n`;
    });
  }

  const acts = [...new Set(doc.chapters.map((c) => c.act))];
  acts.forEach((a) => {
    md += `\n## Act ${roman(a)}\n`;
    doc.chapters
      .filter((c) => c.act === a)
      .forEach((c) => {
        md += `\n### ${c.num}. ${resolveTitle(c, draftId)}  ·  ${c.words.toLocaleString()} words\n> ${displaySummary(c, draftId)}\n\n**Scenes**\n`;
        c.scenes.forEach((s, j) => {
          const conn =
            j < c.scenes.length - 1 && c.sceneLinks[j]
              ? `  _(${CONN_LABEL[c.sceneLinks[j]].toLowerCase()})_`
              : "";
          md += `${j + 1}. ${s}${conn}\n`;
        });
        if (c.refs.length) {
          md += `\n**Pinned:** ${c.refs.map((r) => `[[${r.label}]]`).join(", ")}\n`;
        }
        md += `**Characters:** ${c.chars.map((id) => `[[${charName(id)}]]`).join(", ")}\n`;
      });
  });

  return md;
}

/** The copy-paste prompt that turns any manuscript into Estoria markdown. */
export function importPrompt(): string {
  return [
    "ROLE: You are a careful manuscript-structuring assistant for an app called Estoria, a visual story-mapping tool. You convert an EXISTING draft into one structured Markdown file. You are an organizer, not a co-author.",
    "",
    "MY MATERIAL: I will either paste it at the bottom of this message, or attach it as a file. If a file is attached, use the file and ignore the empty paste area. If both are present, use the attachment.",
    "",
    "ABSOLUTE FIDELITY RULES (read carefully):",
    "- Use ONLY what is in my material. Do NOT invent characters, scenes, plot points, places, or events that are not in the draft.",
    "- Do NOT continue, finish, embellish, or 'improve' the story. No new prose.",
    "- If a field is unknown from the draft, leave it blank rather than making something up.",
    "- Summaries must paraphrase what actually happens in my text, not what you imagine could happen.",
    "- It is fine to split the draft into chapters/scenes and to identify characters/places that ARE present. That organizing is the whole job. Inventing is not.",
    "- If my material is only partial (e.g. a few chapters), output only those. Do not pad it out to feel complete.",
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
    "",
    "RULES: Number chapters sequentially across acts. After each scene except the last, tag the link to the NEXT scene as (therefore) for causal, (but) for conflict/reversal, or (and) for parallel/addition. Group chapters under ## Act 1 / ## Act 2 / ## Act 3 (use only as many acts as the draft supports). If the draft has no obvious word counts, estimate from scene length or omit the `· <n> words` part.",
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
}

/** Lightweight scan of an imported markdown file for a confirmation summary. */
export function summarizeImport(name: string, text: string): ImportSummary {
  const chapters = (text.match(/^###\s+/gm) || []).length;
  const charsBlock = /^##\s+Characters/im.test(text)
    ? (text.split(/^##\s+Characters/im)[1] || "").split(/^##\s/m)[0].match(/^[-*]\s+\*\*/gm)
    : null;
  const wikis = new Set((text.match(/\[\[([^\]]+)\]\]/g) || []).map((s) => s.slice(2, -2)));
  const scenes = (text.match(/^\d+\.\s+/gm) || []).length;
  return {
    name,
    chapters,
    scenes,
    characters: charsBlock ? charsBlock.length : wikis.size,
  };
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
    const top = raw.match(/^[-*]\s+\*\*(.+?)\*\*\s*(?:[—–-]\s*(.*))?$/);
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
    const m = raw.match(/^[-*]\s+\*\*(.+?)\*\*\s*(?:\[(.+?)\])?\s*(?:[—–-]\s*(.*))?$/);
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
    out.push({ id: importId("w"), cat, name, desc: clean(desc), notes: clean(notes), refs: [] });
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

    let summary = "";
    const scenes: string[] = [];
    const sceneTags: ConnType[] = [];
    const charNames: string[] = [];
    for (const line of chunk.slice(1)) {
      const t = line.trim();
      if (!t) continue;
      const quote = t.match(/^>\s*(.*)$/);
      if (quote) {
        summary = summary ? `${summary} ${clean(quote[1])}` : clean(quote[1]);
        continue;
      }
      const charLine = t.match(/^characters?:\s*(.*)$/i);
      if (charLine) {
        charLine[1]
          .split(/[,;]/)
          .map(clean)
          .filter(Boolean)
          .forEach((n) => charNames.push(n));
        continue;
      }
      if (/^scenes?:?$/i.test(t)) continue;
      const sceneM = t.match(/^\d+[.)]\s+(.*)$/);
      if (sceneM) {
        let text = sceneM[1].trim();
        let link: ConnType = "therefore";
        const tag = text.match(/\((therefore|but|and)\)\s*$/i);
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
    bookData: {},
  };

  const summary: ImportSummary = {
    name: fileName,
    chapters: chapters.length,
    scenes: chapters.reduce((a, c) => a + c.scenes.length, 0),
    characters: characters.length,
  };

  return { doc, summary };
}
