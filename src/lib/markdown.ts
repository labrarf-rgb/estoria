import type { ConnType, StoryDoc } from "@/types";

const CONN_LABEL: Record<ConnType, string> = {
  therefore: "Therefore",
  but: "But",
  and: "And",
};

export function roman(a: number): string {
  return ({ 1: "I", 2: "II", 3: "III" } as Record<number, string>)[a] || String(a);
}

function titleOf(c: StoryDoc["chapters"][number], draft: "main" | "alt"): string {
  return draft === "alt" && c.altTitle ? c.altTitle : c.title;
}

function summaryOf(c: StoryDoc["chapters"][number], draft: "main" | "alt"): string {
  if (draft === "alt" && c.altSummaryFlag) {
    return "Wren reaches the harbor only to choose the sea over the shore.";
  }
  return c.summary || c.scenes[0] || "";
}

/**
 * Build Obsidian-vault-ready markdown: characters become [[wikilinks]],
 * chapters are grouped under Act headings, scenes carry their but/therefore tags.
 */
export function buildMarkdown(doc: StoryDoc, draft: "main" | "alt" = "main"): string {
  const title = doc.projectTitle || "Untitled Voyage";
  const total = doc.chapters.reduce((a, c) => a + c.words, 0);
  const charName = (id: string) => doc.characters.find((c) => c.id === id)?.name ?? id;

  let md = `# ${title}\n\nMapped in Estoria — ${total.toLocaleString()} words across ${doc.chapters.length} chapters.\n`;

  if (doc.seriesMode) {
    md += "\n## Series\n\n";
    doc.series.forEach((b, i) => {
      md += `${i + 1}. **${b.title}** (${b.status}) — ${b.premise}\n`;
    });
  }

  if (doc.storyNotes && doc.storyNotes.trim()) {
    md += `\n## Story Notes\n\n${doc.storyNotes.trim()}\n`;
  }

  md += "\n## Characters\n\n";
  doc.characters.forEach((c) => {
    md += `- **[[${c.name}]]** — ${c.role}. ${c.desc}\n`;
  });

  const acts = [...new Set(doc.chapters.map((c) => c.act))];
  acts.forEach((a) => {
    md += `\n## Act ${roman(a)}\n`;
    doc.chapters
      .filter((c) => c.act === a)
      .forEach((c) => {
        md += `\n### ${c.num}. ${titleOf(c, draft)}  ·  ${c.words.toLocaleString()} words\n> ${summaryOf(c, draft)}\n\n**Scenes**\n`;
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
    "You are helping me prepare a manuscript for an app called Estoria, a visual story-mapping tool.",
    "I will paste my draft / outline / notes below. Read everything, then output ONLY a Markdown file in EXACTLY this schema (no commentary):",
    "",
    "# <Story Title>",
    "<one-paragraph premise>",
    "",
    "## Characters",
    "- **<Name>** — <role: Protagonist/Antagonist/Ally/etc> | <archetype>",
    "  - Bio: <2 sentences>",
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
    "Rules: number chapters sequentially across acts; after each scene except the last, tag the link to the next scene as (therefore) for causal, (but) for conflict, or (and) for parallel. Group chapters under ## Act 1 / ## Act 2 / ## Act 3. Keep it faithful to my material; infer only what's needed to fill the schema.",
    "",
    "--- MY MATERIAL BELOW ---",
    "<paste your Word doc / Google Doc / notes here>",
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
