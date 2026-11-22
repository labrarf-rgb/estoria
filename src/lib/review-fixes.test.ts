import { describe, expect, it } from "vitest";
import type { Chapter, StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { bands, bringIn, inOrder, insertPiece, movePiece, newPieceChapter, removePiece, renameSection, takeOut, toAnthology } from "@/lib/anthology";
import { reconcileIncoming } from "@/lib/join";
import { buildMarkdown, parseImportMarkdown } from "@/lib/markdown";
import { diffDocs } from "@/lib/sync";
import { mergeDocs } from "@/lib/merge";
import { makeSavedCopy, newPiece, SAVED_COPIES_KEPT, savedCopiesToTrim } from "@/lib/piece";

/**
 * Regression tests for docs/REVIEW-2026-11-22.md (S1, S2, S3, S5, S6, S7).
 * The S1 and S5 cases are the review's own probes, turned into tests.
 */

const ch = (id: string, num: number, over: Partial<Chapter> = {}): Partial<Chapter> => ({
  id,
  num,
  title: id.toUpperCase(),
  scenes: ["x"],
  chars: [],
  refs: [],
  ...over,
});

function anth(chs: Partial<Chapter>[], over: Partial<StoryDoc> = {}): StoryDoc {
  return toAnthology(normalizeDoc({ id: "a1", projectTitle: "Anth", chapters: chs, ...over }));
}

const char = (id: string, name: string, bio = "") => ({ id, name, bio }) as never;
const gulls = (): StoryDoc => ({ ...newPiece("poem"), projectTitle: "Gulls" });

describe("S1: joining projects keeps both versions of a record that differs", () => {
  it("copy out, revise the character, bring back: the revision survives as a second record", () => {
    const a = anth([ch("p1", 1, { chars: ["k1"] }), ch("p2", 2)], { characters: [char("k1", "Kit", "old bio")] });
    const out = takeOut(a, "p1")!;
    const edited: StoryDoc = { ...out, characters: out.characters.map((c) => ({ ...c, bio: "new bio" })) };
    const back = bringIn(a, edited, "");
    expect(back.characters.map((c) => c.bio).sort()).toEqual(["new bio", "old bio"]);
    // The brought-in piece casts the revised Kit, the old piece the original.
    const piece = back.chapters.find((c) => c.title === "P1" && c.id !== "p1")!;
    const cast = back.characters.find((c) => c.id === piece.chars[0])!;
    expect(cast.bio).toBe("new bio");
    expect(back.chapters.find((c) => c.id === "p1")!.chars).toEqual(["k1"]);
  });

  it("an unchanged record stays one record", () => {
    const a = anth([ch("p1", 1, { chars: ["k1"] }), ch("p2", 2)], { characters: [char("k1", "Kit", "bio")] });
    const back = bringIn(a, takeOut(a, "p1")!, "");
    expect(back.characters).toHaveLength(1);
  });

  it("two id-less assets that differ: the brought-in pin keeps pointing at its own note", () => {
    const a = anth([ch("p1", 1)], { assets: [{ kind: "NOTE", label: "Anthology note" }] as never });
    const src = normalizeDoc({
      id: "s1",
      projectTitle: "Poem",
      form: "piece",
      kind: "poem",
      chapters: [ch("q", 1)],
      assets: [{ kind: "NOTE", label: "Poem note" }],
    });
    // Both got the fallback id a-file-0 on load.
    expect(a.assets[0].id).toBe(src.assets[0].id);
    const pinned: StoryDoc = { ...src, chapters: [{ ...src.chapters[0], refs: [{ id: "r1", assetId: src.assets[0].id }] }] };
    const back = bringIn(a, pinned, "");
    const piece = back.chapters.find((c) => c.title === "Poem")!;
    const note = back.assets.find((x) => x.id === piece.refs[0].assetId)!;
    expect(note.label).toBe("Poem note");
    expect(back.assets.map((x) => x.label).sort()).toEqual(["Anthology note", "Poem note"]);
  });

  it("relationships and chart positions follow a re-ided character", () => {
    const target = anth([ch("p1", 1)], {
      characters: [char("k1", "Kit", "a"), char("k2", "Ada")],
    });
    const src = normalizeDoc({
      id: "s1",
      projectTitle: "Other",
      form: "piece",
      chapters: [ch("q", 1, { chars: ["k1", "k2"] })],
      characters: [char("k1", "Kit", "different"), char("k2", "Ada")],
      relationships: [{ id: "r1", a: "k1", b: "k2", label: "rivals" }],
      relationshipLayout: { k1: { x: 0.2, y: 0.3 } },
    });
    const { source, kept } = reconcileIncoming(target, src);
    expect(kept.characters).toBe(1);
    const newKit = source.characters.find((c) => c.name === "Kit")!.id;
    expect(newKit).not.toBe("k1");
    expect(source.relationships![0]).toMatchObject({ a: newKit, b: "k2" });
    expect(source.relationshipLayout).toEqual({ [newKit]: { x: 0.2, y: 0.3 } });
    const back = bringIn(target, src, "");
    expect(back.relationships).toHaveLength(1);
    const tie = back.relationships![0];
    expect(back.characters.find((c) => c.id === tie.a)).toMatchObject({ name: "Kit", bio: "different" });
  });

  it("a stored kind that differs comes in as its own kind", () => {
    const target = anth([ch("p1", 1)], {
      characters: [char("k1", "Kit"), char("k2", "Ada")],
      relationshipKinds: [{ id: "kx", name: "Mentor", color: 2 }],
    });
    const src = normalizeDoc({
      id: "s1",
      projectTitle: "Other",
      form: "piece",
      chapters: [ch("q", 1)],
      characters: [char("k1", "Kit"), char("k2", "Ada")],
      relationshipKinds: [{ id: "kx", name: "Enemy", color: 5 }],
      relationships: [{ id: "r9", a: "k1", b: "k2", kind: "kx" }],
    });
    const { source } = reconcileIncoming(target, src);
    const enemy = source.relationshipKinds!.find((k) => k.name === "Enemy")!;
    expect(enemy.id).not.toBe("kx");
    expect(source.relationships![0].kind).toBe(enemy.id);
  });
});

describe("S2: bringing in keeps the piece project's Story notes", () => {
  it("they go into the piece's own notes", () => {
    const a = anth([ch("p1", 1)]);
    const src = { ...gulls(), storyNotes: "Research: tide tables." };
    const back = bringIn(a, src, "");
    const piece = back.chapters.find((c) => c.title === "Gulls")!;
    expect(piece.notes).toContain("Research: tide tables.");
  });
});

describe("S3: map export of an anthology follows piece order", () => {
  it("a piece added after a three-act book became an anthology exports last, and re-imports last", () => {
    const a = anth([ch("a", 1, { act: 1 }), ch("b", 2, { act: 2 }), ch("c", 3, { act: 3 })]);
    const withCoda: StoryDoc = { ...a, chapters: insertPiece(a.chapters, { ...newPieceChapter("story", ""), title: "Coda" }) };
    const md = buildMarkdown(withCoda);
    expect(md.match(/## Act /g)).toHaveLength(1);
    expect(parseImportMarkdown(md).doc.chapters.map((c) => c.title)).toEqual(["A", "B", "C", "Coda"]);
  });

  it("a book still groups by act", () => {
    const b = normalizeDoc({ id: "b", projectTitle: "B", chapters: [ch("a", 1, { act: 1 }), ch("b", 2, { act: 2 })] });
    expect(buildMarkdown(b).match(/## Act /g)).toHaveLength(2);
  });
});

describe("S5: merging anthologies keeps piece order and sections whole", () => {
  const pick = (diff: ReturnType<typeof diffDocs>, id: string) =>
    diff.sections.flatMap((s) => s.items).find((i) => i.addr.kind === "chapter" && i.addr.id === id)!;

  it("a reorder alone is one story-wide unit, not a row per piece", () => {
    const base = anth([ch("a", 1), ch("b", 2), ch("c", 3)]);
    const mine: StoryDoc = { ...base, chapters: movePiece(base.chapters, "c", "a", false, "") };
    const diff = diffDocs(mine, base);
    const items = diff.sections.flatMap((s) => s.items);
    expect(items.map((i) => i.name)).toEqual(["Piece order and sections"]);
  });

  it("taking one retitled piece from the file never duplicates a number (the review's probe)", () => {
    const base = anth([ch("a", 1), ch("b", 2), ch("c", 3)]);
    const mine: StoryDoc = { ...base, chapters: movePiece(base.chapters, "c", "a", false, "") };
    const theirs: StoryDoc = { ...base, chapters: base.chapters.map((c) => (c.id === "b" ? { ...c, title: "B2" } : c)) };
    const diff = diffDocs(mine, theirs);
    const res = mergeDocs(mine, theirs, diff, { [pick(diff, "b").key]: "theirs" });
    expect(inOrder(res.doc.chapters).map((c) => `${c.id}:${c.num}:${c.title}`)).toEqual(["c:1:C", "a:2:A", "b:3:B2"]);
  });

  it("taking one piece of a renamed section never splits a section (the review's probe)", () => {
    const base = anth([
      ch("a", 1, { section: "One" }),
      ch("b", 2, { section: "One" }),
      ch("c", 3, { section: "Two" }),
      ch("d", 4, { section: "Two" }),
    ]);
    const theirs: StoryDoc = { ...base, chapters: renameSection(base.chapters, "One", "Harbor") };
    const mine: StoryDoc = { ...base, chapters: movePiece(base.chapters, "c", "a", false, "") };
    const diff = diffDocs(mine, theirs);
    // A rename is a change of place only: no piece row for "a".
    expect(pick(diff, "a")).toBeUndefined();
    const keepMine = mergeDocs(mine, theirs, diff, {});
    expect(bands(keepMine.doc.chapters).map((b) => b.section)).toEqual(["One", "Two"]);
    const order = diff.sections.flatMap((s) => s.items).find((i) => i.name === "Piece order and sections")!;
    const takeTheirs = mergeDocs(mine, theirs, diff, { [order.key]: "theirs" });
    expect(bands(takeTheirs.doc.chapters).map((b) => `${b.section}[${b.pieces.map((p) => p.id).join(",")}]`)).toEqual([
      "Harbor[a,b]",
      "Two[c,d]",
    ]);
  });

  it("two books still diff chapter numbers per chapter", () => {
    const b = normalizeDoc({ id: "b", projectTitle: "B", chapters: [ch("a", 1), ch("b", 2)] });
    const swapped: StoryDoc = { ...b, chapters: b.chapters.map((c) => ({ ...c, num: c.id === "a" ? 2 : 1 })) };
    const names = diffDocs(b, swapped).sections.flatMap((s) => s.items).map((i) => i.name);
    expect(names).not.toContain("Piece order and sections");
    expect(names).toEqual(expect.arrayContaining(["A", "B"]));
  });
});

describe("S6: move out and bring in reach every version", () => {
  const withVersion = (d: StoryDoc): StoryDoc => ({
    ...d,
    drafts: [...d.drafts, { id: "d2", name: "Draft 2" }],
    draftData: { d2: { chapters: d.chapters.map((c) => ({ ...c })), links: [], storyNotes: "" } },
  });

  it("bringing in adds the piece to the other versions too", () => {
    const a = withVersion(anth([ch("p1", 1), ch("p2", 2)]));
    const back = bringIn(a, gulls(), "");
    expect(back.chapters.map((c) => c.title)).toContain("Gulls");
    expect(back.draftData.d2.chapters.map((c) => c.title)).toContain("Gulls");
  });

  it("moving out removes it from every version, with its links", () => {
    const a = withVersion(anth([ch("p1", 1), ch("p2", 2), ch("p3", 3)], { links: [{ fromId: "p1", toId: "p2", type: "none" }] }));
    const after = removePiece(a, "p2");
    expect(after.chapters.map((c) => c.id)).toEqual(["p1", "p3"]);
    expect(after.chapters.map((c) => c.num)).toEqual([1, 2]);
    expect(after.draftData.d2.chapters.map((c) => c.id)).toEqual(["p1", "p3"]);
    expect(after.links).toEqual([]);
  });

  it("a version where it is the only piece keeps it", () => {
    const a = anth([ch("p1", 1), ch("p2", 2)]);
    const v: StoryDoc = {
      ...a,
      drafts: [...a.drafts, { id: "d2", name: "Draft 2" }],
      draftData: { d2: { chapters: [a.chapters[1]], links: [], storyNotes: "" } },
    };
    expect(removePiece(v, "p2").draftData.d2.chapters.map((c) => c.id)).toEqual(["p2"]);
  });
});

describe("S7: saved copies are trimmed safely", () => {
  const copyAt = (from: StoryDoc, iso: string, file?: string): StoryDoc => {
    const c = makeSavedCopy(from, "takeout");
    return { ...c, savedCopy: { ...c.savedCopy!, savedAt: iso, ...(file ? { file } : {}) } };
  };

  it(`keeps the newest ${SAVED_COPIES_KEPT} and trims only older copies whose file is in the folder`, () => {
    const p = anth([ch("p1", 1)]);
    const copies = Array.from({ length: 8 }, (_, i) =>
      copyAt(p, `2026-11-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`, i === 1 ? undefined : `f${i}`)
    );
    const stash = Object.fromEntries(copies.map((c) => [c.id, c]));
    const trimmed = savedCopiesToTrim(stash, p.id);
    // Eight copies, five kept (days 13-17); of days 10-12, day 11 has no file and stays.
    expect(trimmed.map((c) => c.savedCopy!.savedAt.slice(8, 10))).toEqual(["10", "12"]);
  });

  it("never trims when there are no more than the kept number", () => {
    const p = anth([ch("p1", 1)]);
    const stash = Object.fromEntries(
      Array.from({ length: SAVED_COPIES_KEPT }, (_, i) => copyAt(p, `2026-11-1${i}T00:00:00.000Z`, "f")).map((c) => [c.id, c])
    );
    expect(savedCopiesToTrim(stash, p.id)).toEqual([]);
  });

  it("another project's copies are left alone", () => {
    const p = anth([ch("p1", 1)]);
    const q = { ...p, id: "other" };
    const stash = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => copyAt(q, `2026-11-1${i}T00:00:00.000Z`, "f")).map((c) => [c.id, c])
    );
    expect(savedCopiesToTrim(stash, p.id)).toEqual([]);
  });
});
