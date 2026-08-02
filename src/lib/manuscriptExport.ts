import type { Chapter, StoryDoc } from "@/types";
import { countWords, parseBlocks, taskItem, type Block } from "@/lib/manuscript";
import { inlineTokens } from "@/lib/inline";
import { zipStore } from "@/lib/zip";

/**
 * Manuscript export — **a second export with a different purpose** from the one
 * in `markdown.ts`.
 *
 * That one exports the *map*: scenes as bullets, connectors, characters as
 * wikilinks, shaped for an Obsidian vault. This one exports the *prose*, shaped
 * for a person who is going to read the book. They are not variations of each
 * other and must not be merged; the Export modal says which is which.
 *
 * See docs/SPECS.md §4, row "Export | Manuscript (prose)".
 */

/** Chapters that have something written in them, in order. */
export function writtenChapters(doc: StoryDoc): Chapter[] {
  return doc.chapters.filter((c) => c.manuscript && countWords(c.manuscript) > 0);
}

export const manuscriptWordCount = (doc: StoryDoc): number =>
  doc.chapters.reduce((n, c) => n + (c.manuscript ? countWords(c.manuscript) : 0), 0);

const chapterHeading = (c: Chapter): string =>
  c.title.trim() ? `Chapter ${c.num}. ${c.title.trim()}` : `Chapter ${c.num}`;

/**
 * `.md` — concatenation, and nothing to strip. The prose is already markdown and
 * the `***` between scenes is already a thematic break, which is why that
 * marker was chosen over anything the writer would have had to work around.
 */
export function buildManuscriptMarkdown(doc: StoryDoc): string {
  const parts = [`# ${doc.projectTitle}`, ""];
  for (const c of writtenChapters(doc)) {
    parts.push(`## ${chapterHeading(c)}`, "", (c.manuscript ?? "").trim(), "");
  }
  return `${parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim()}\n`;
}

/** `.txt` — the same prose with the markup taken out and `#` between scenes. */
export function buildManuscriptText(doc: StoryDoc): string {
  const parts = [doc.projectTitle.toUpperCase(), ""];
  for (const c of writtenChapters(doc)) {
    parts.push("", chapterHeading(c).toUpperCase(), "");
    for (const b of parseBlocks(c.manuscript ?? "")) {
      if (b.kind === "hr") parts.push("#", "");
      else if (b.kind === "ul" || b.kind === "ol") parts.push(...b.items.map(plain), "");
      else if (b.kind === "h" || b.kind === "p" || b.kind === "quote")
        parts.push(plain(b.text.replace(/\n/g, " ")), "");
    }
  }
  return `${parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim()}\n`;
}

// ---- Standard manuscript format (.docx) ------------------------------------

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One `<w:p>`, with the paragraph properties standard format asks for. */
function para(
  runs: string,
  opts: { align?: "center" | "right"; indent?: boolean; pageBreakBefore?: boolean } = {}
): string {
  const pPr =
    "<w:pPr>" +
    (opts.pageBreakBefore ? "<w:pageBreakBefore/>" : "") +
    (opts.align ? `<w:jc w:val="${opts.align}"/>` : "") +
    // Standard format indents every paragraph half an inch *except* the first
    // of a chapter or scene, which is exactly where a reader needs the break to
    // be visible rather than assumed.
    `<w:ind w:firstLine="${opts.indent ? 720 : 0}"/>` +
    "</w:pPr>";
  return `<w:p>${pPr}${runs}</w:p>`;
}

const runsFor = (line: string): string =>
  inlineTokens(line)
    .filter((t) => t.text)
    .map((t) => {
      const marks =
        (t.bold ? "<w:b/>" : "") + (t.italic ? "<w:i/>" : "") + (t.strike ? "<w:strike/>" : "");
      const rPr = marks ? `<w:rPr>${marks}</w:rPr>` : "";
      return `<w:r>${rPr}<w:t xml:space="preserve">${esc(t.text)}</w:t></w:r>`;
    })
    .join("");

/**
 * Turn one chapter's markdown into paragraphs.
 *
 * Blank lines separate paragraphs; a single newline inside one is a soft wrap,
 * exactly as markdown says. A `***` becomes the centred `#` that standard
 * manuscript format uses for a scene break, and the paragraph after it loses its
 * indent — the two together are what make a scene change legible on paper.
 */
function chapterParagraphs(text: string): string[] {
  const out: string[] = [];
  let bodyStarted = false;
  for (const b of parseBlocks(text)) {
    out.push(...docxBlock(b, bodyStarted));
    if (b.kind === "p") bodyStarted = true;
    // A rule or a heading ends a passage, so the paragraph after it opens one —
    // no indent, the way the first paragraph of a chapter has none.
    if (b.kind === "hr" || b.kind === "h") bodyStarted = false;
  }
  return out;
}

/**
 * One markdown block as Word paragraphs.
 *
 * Uses the *same* parser the reading view does, so a heading is a heading and a
 * rule is a rule in both. Anything less and the file an agent opens quietly
 * disagrees with the screen the author approved it on.
 */
function docxBlock(b: Block, indent: boolean): string[] {
  switch (b.kind) {
    case "hr":
      // The centred `#` standard manuscript format uses for a passage break.
      return [para(runsFor("#"), { align: "center" })];
    case "h":
      return [para(runsFor(b.text), { align: "center" })];
    case "quote":
      return [para(runsFor(b.text), { indent: true })];
    case "ul":
      return b.items.map((it) => {
        const task = taskItem(it);
        const mark = task ? (task.done ? "\u2612 " : "\u2610 ") : BULLET_CHAR + " ";
        return para(runsFor(mark + (task ? task.text : it)), { indent: true });
      });
    case "ol":
      return b.items.map((it, i) => para(runsFor(String(i + 1) + ". " + it), { indent: true }));
    default:
      return [para(runsFor(b.text.replace(/\n/g, " ")), { indent })];
  }
}

/** Markdown taken out, for the plain-text export. */
const plain = (s: string): string => inlineTokens(s).map((t) => t.text).join("");
const BULLET_CHAR = "\u2022";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

/** 12pt Times, double spaced. `w:line="480"` is 24pt of leading, i.e. double. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
<w:sz w:val="24"/><w:szCs w:val="24"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
</w:styles>`;

/** Surname / Title / page, top right of every page after the first. */
function header(surname: string, title: string): string {
  const label = esc(`${surname ? `${surname} / ` : ""}${title} / `);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>
<w:r><w:t xml:space="preserve">${label}</w:t></w:r>
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>1</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p></w:hdr>`;
}

/**
 * Standard manuscript format: 12pt Times, double spaced, one inch margins,
 * half-inch paragraph indents, `#` for scene breaks, a title block, and a
 * running header. This is the export agents and beta readers expect, and the
 * one thing an Obsidian vault cannot produce.
 */
export function buildDocx(doc: StoryDoc, author: string): Uint8Array {
  const title = doc.projectTitle || "Untitled";
  const surname = author.trim().split(/\s+/).slice(-1)[0] ?? "";
  const words = manuscriptWordCount(doc);
  // Submissions round the count; an exact figure reads as a word processor's
  // opinion rather than an author's.
  const rounded = words >= 1000 ? `${Math.round(words / 1000)},000` : String(words);

  const body: string[] = [];

  // Title page: contact block top left, word count top right, title a third of
  // the way down. No author name is invented when none was given.
  if (author.trim()) body.push(para(runsFor(author.trim())));
  body.push(para(runsFor(`about ${rounded} words`), { align: "right" }));
  for (let i = 0; i < 6; i++) body.push(para(""));
  body.push(para(runsFor(title), { align: "center" }));
  if (author.trim()) body.push(para(runsFor(`by ${author.trim()}`), { align: "center" }));

  for (const c of writtenChapters(doc)) {
    body.push(para(runsFor(chapterHeading(c)), { align: "center", pageBreakBefore: true }));
    body.push(para(""));
    body.push(...chapterParagraphs(c.manuscript ?? ""));
  }

  const sectPr =
    "<w:sectPr>" +
    '<w:headerReference w:type="default" r:id="rId2"/>' +
    '<w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    '<w:titlePg w:val="true"/>' +
    "</w:sectPr>";

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body.join("")}${sectPr}</w:body></w:document>`;

  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "word/document.xml", data: enc.encode(document) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(DOC_RELS) },
    { name: "word/styles.xml", data: enc.encode(STYLES) },
    { name: "word/header1.xml", data: enc.encode(header(surname, title)) },
  ]);
}
