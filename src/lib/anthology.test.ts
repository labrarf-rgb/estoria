import { describe, expect, it } from "vitest";
import type { Chapter, StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { expandToBook, formLabel, newPiece } from "@/lib/piece";
import { buildManuscriptMarkdown, buildManuscriptText } from "@/lib/manuscriptExport";
import {
  addPace,
  bands,
  bringIn,
  fromAnthology,
  movePiece,
  moveSection,
  pieceKind,
  pieceLineBreaks,
  pieceNouns,
  removeSection,
  renameSection,
  takeOut,
  toAnthology,
} from "@/lib/anthology";

/** Anthologies (docs/PLAN-anthology.md): pieces that keep their own form inside a book. */

function book(chapters: Partial<Chapter>[], over: Partial<StoryDoc> = {}): StoryDoc {
  return normalizeDoc({ id: "b1", projectTitle: "Salt and Lantern", chapters, ...over });
}

const ch = (id: string, num: number, extra: Partial<Chapter> = {}): Partial<Chapter> => ({
  id,
  num,
  title: id,
  scenes: ["x"],
  ...extra,
});

describe("per-piece settings", () => {
  it("an anthology piece reads its own kind and line breaks", () => {
    const d = book([ch("a", 1, { kind: "poem", keepLineBreaks: true }), ch("b", 2, { kind: "story", keepLineBreaks: false })], {
      form: "anthology",
      kind: "poem",
      keepLineBreaks: true,
    });
    expect(pieceKind(d, d.chapters[1])).toBe("story");
    expect(pieceLineBreaks(d, d.chapters[1])).toBe(false);
    expect(pieceNouns(d, d.chapters[0]).many).toBe("stanzas");
    expect(pieceNouns(d, d.chapters[1]).many).toBe("scenes");
  });

  it("a regular book never reads chapter fields (PLAN §4.8)", () => {
    const d = book([ch("a", 1, { kind: "story", keepLineBreaks: false })], { kind: "poem", keepLineBreaks: true });
    expect(pieceKind(d, d.chapters[0])).toBe("poem");
    expect(pieceLineBreaks(d, d.chapters[0])).toBe(true);
  });

  it("normalize keeps valid piece fields and drops stray ones", () => {
    const d = book(
      [ch("a", 1, { kind: "poem", keepLineBreaks: true, section: "One" }), ch("b", 2, { kind: "sonnet" as never, keepLineBreaks: "yes" as never, section: "  " })],
      { form: "anthology" }
    );
    expect(d.form).toBe("anthology");
    expect(d.chapters[0]).toMatchObject({ kind: "poem", keepLineBreaks: true, section: "One" });
    expect("kind" in d.chapters[1]).toBe(false);
    expect("keepLineBreaks" in d.chapters[1]).toBe(false);
    expect("section" in d.chapters[1]).toBe(false);
  });

  it("an anthology cannot be inside a series", () => {
    expect(book([ch("a", 1)], { form: "anthology", seriesMode: true }).form).toBeUndefined();
  });
});

describe("making and unmaking", () => {
  it("Expand → A collection makes an anthology that keeps the poem a poem", () => {
    const piece = { ...newPiece("poem"), projectTitle: "Low Tide" };
    const a = expandToBook(piece, "collection");
    expect(a.form).toBe("anthology");
    expect(a.chapters[0]).toMatchObject({ title: "Low Tide", kind: "poem", keepLineBreaks: true });
    expect(formLabel(a)).toBe("Anthology");
  });

  it("Expand → one longer work is still an ordinary book, tagged Epic for a poem", () => {
    const b = expandToBook(newPiece("poem"), "work");
    expect(b.form).toBeUndefined();
    expect(b.chapters[0].kind).toBeUndefined();
    expect(formLabel(b)).toBe("Epic");
  });

  it("a book becomes an anthology without joining anything, and back", () => {
    const b = book([ch("b", 2), ch("a", 1)], { kind: "essay" });
    const a = toAnthology(b);
    expect(a.chapters.map((c) => c.id)).toEqual(["a", "b"]);
    expect(a.chapters.every((c) => c.kind === "essay" && c.keepLineBreaks === false)).toBe(true);
    expect(fromAnthology(a).form).toBeUndefined();
    expect(fromAnthology(a).chapters).toHaveLength(2);
    // Back on a board, the cards get their own places instead of one on top of another.
    const [p1, p2] = fromAnthology(a).chapters;
    expect([p1.x, p1.y]).not.toEqual([p2.x, p2.y]);
  });
});

describe("sections", () => {
  const d = book([
    ch("a", 1, { section: "Harbor" }),
    ch("b", 2, { section: "Harbor" }),
    ch("c", 3, { section: "Inland" }),
    ch("d", 4, { section: "Inland" }),
  ]);

  it("groups consecutive pieces into bands", () => {
    expect(bands(d.chapters).map((b) => [b.section, b.pieces.map((p) => p.id)])).toEqual([
      ["Harbor", ["a", "b"]],
      ["Inland", ["c", "d"]],
    ]);
  });

  it("dropping on a piece joins its section, before or after it", () => {
    const moved = movePiece(d.chapters, "a", "c", true, "");
    expect(bands(moved).map((b) => b.pieces.map((p) => p.id))).toEqual([["b"], ["c", "a", "d"]]);
    expect(moved.find((c) => c.id === "a")?.section).toBe("Inland");
    expect(moved.map((c) => c.num).sort()).toEqual([1, 2, 3, 4]);
  });

  it("dropping on a band lands at its end; a new section goes last", () => {
    const toEnd = movePiece(d.chapters, "a", null, false, "Inland");
    expect(bands(toEnd)[1].pieces.map((p) => p.id)).toEqual(["c", "d", "a"]);
    const fresh = movePiece(d.chapters, "b", null, false, "Coda");
    expect(bands(fresh).map((b) => b.section)).toEqual(["Harbor", "Inland", "Coda"]);
  });

  it("rename, move and remove change headings, never pieces", () => {
    expect(bands(renameSection(d.chapters, "Harbor", "Sea"))[0].section).toBe("Sea");
    expect(renameSection(d.chapters, "Harbor", "Inland")).toBe(d.chapters);
    expect(bands(moveSection(d.chapters, "Inland", -1)).map((b) => b.section)).toEqual(["Inland", "Harbor"]);
    const removed = removeSection(d.chapters, "Inland");
    expect(removed).toHaveLength(4);
    expect(bands(removed).map((b) => b.section)).toEqual(["Harbor"]);
    expect(bands(removeSection(d.chapters, "Harbor")).map((b) => b.section)).toEqual(["Inland"]);
  });
});

describe("bringing a piece in and taking one out", () => {
  const anth = book([ch("a", 1, { kind: "poem", keepLineBreaks: true, section: "Harbor" }), ch("z", 2, { section: "Inland" })], {
    form: "anthology",
    characters: [{ id: "k1", name: "Nell" } as never],
    pace: { days: { "2026-11-01": { dev: { n: 100, at: 1 } } } },
  });

  const source: StoryDoc = {
    ...newPiece("story"),
    projectTitle: "The Ferryman's Daughter",
    characters: [{ id: "k2", name: "Abara" } as never, { id: "k1", name: "Nell" } as never],
    pace: { days: { "2026-11-01": { dev: { n: 40, at: 2 } }, "2026-11-02": { dev: { n: 7, at: 3 } } } },
  };

  it("arrives as one story at the end of its section, cast added, Pace added up", () => {
    const out = bringIn(anth, source, "Harbor", 99);
    const ids = bands(out.chapters).map((b) => b.pieces.map((p) => p.title));
    expect(ids).toEqual([["a", "The Ferryman's Daughter"], ["z"]]);
    const piece = out.chapters.find((c) => c.title === "The Ferryman's Daughter")!;
    expect(piece).toMatchObject({ kind: "story", keepLineBreaks: false, section: "Harbor" });
    expect(out.characters.map((c) => c.id)).toEqual(["k1", "k2"]);
    expect(out.pace?.days["2026-11-01"].dev).toEqual({ n: 140, at: 99 });
    expect(out.pace?.days["2026-11-02"].dev).toEqual({ n: 7, at: 99 });
  });

  it("addPace leaves the log alone when there is nothing to add", () => {
    expect(addPace(anth.pace, undefined, 5)).toBe(anth.pace);
  });

  it("taking a piece out makes a single piece with its own kind and line breaks", () => {
    const p = takeOut(anth, "a")!;
    expect(p.form).toBe("piece");
    expect(p.kind).toBe("poem");
    expect(p.keepLineBreaks).toBe(true);
    expect(p.projectTitle).toBe("a");
    expect(p.chapters).toHaveLength(1);
    expect(p.chapters[0].section).toBeUndefined();
    expect(p.pace).toBeUndefined();
    expect(p.id).not.toBe(anth.id);
  });
});

describe("export", () => {
  const d = book(
    [
      ch("a", 1, { title: "Low Tide", kind: "poem", keepLineBreaks: true, section: "Harbor", manuscript: "line one\nline two" }),
      ch("b", 2, { title: "Nell", kind: "story", keepLineBreaks: false, section: "Harbor", manuscript: "One\nsentence." }),
    ],
    { form: "anthology" }
  );

  it("uses section and piece titles, never chapter numbers, with line breaks per piece", () => {
    const md = buildManuscriptMarkdown(d);
    expect(md).toContain("## Harbor");
    expect(md).toContain("### Low Tide");
    expect(md).not.toContain("Chapter 1");
    expect(md).toContain("line one  \nline two");
    expect(md).toContain("One\nsentence.");
    const txt = buildManuscriptText(d);
    expect(txt).toContain("LOW TIDE");
    expect(txt).toContain("line one\nline two");
    expect(txt).toContain("One sentence.");
  });

  it("a regular book still exports chapter headings", () => {
    const b = book([ch("a", 1, { title: "Arrival", manuscript: "Hello." })]);
    expect(buildManuscriptMarkdown(b)).toContain("## Chapter 1. Arrival");
  });
});
