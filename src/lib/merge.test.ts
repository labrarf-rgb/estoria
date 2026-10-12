import { describe, expect, it } from "vitest";
import type { StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { diffDocs } from "@/lib/sync";
import { mergeDocs, type MergeChoices } from "@/lib/merge";

/**
 * Compare & merge (SPECS §8) for the project-level fields that are neither a
 * collection nor a board: form, kind and line breaks. Each must show up as a
 * row when it differs, and a merge must honour the row's side, including
 * "All from the file", rather than always keeping this copy's value.
 */

function makeDoc(over: Partial<StoryDoc> = {}): StoryDoc {
  return normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [{ id: "c1", title: "Arrival", scenes: ["She lands."] }],
    ...over,
  });
}

const keysOf = (mine: StoryDoc, theirs: StoryDoc) =>
  diffDocs(mine, theirs).sections.flatMap((s) => s.items.map((i) => i.key));

/** Every row taken from the file, the way "All from the file" sets it. */
function allFromFile(mine: StoryDoc, theirs: StoryDoc): MergeChoices {
  const diff = diffDocs(mine, theirs);
  return Object.fromEntries(
    diff.sections.flatMap((s) => s.items.map((i) => [i.key, "theirs" as const]))
  );
}

describe("diffDocs: form and line breaks", () => {
  it("shows a Line breaks row when only keepLineBreaks differs", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ keepLineBreaks: true });
    expect(keysOf(mine, theirs)).toEqual(["doc:lineBreaks"]);
    const diff = diffDocs(mine, theirs);
    expect(diff.sections[0].items[0].name).toBe("Line breaks");
    expect(diff.mergeBlocked).toBeUndefined();
  });

  it("shows a Form row when only kind differs, and still allows a merge", () => {
    const mine = makeDoc({ form: "piece", kind: "story" });
    const theirs = makeDoc({ form: "piece", kind: "poem" });
    expect(keysOf(mine, theirs)).toEqual(["doc:form"]);
    expect(diffDocs(mine, theirs).mergeBlocked).toBeUndefined();
  });

  it("puts grownInto and savedCopy in the Form row", () => {
    const mine = makeDoc({ kind: "poem" });
    expect(keysOf(mine, makeDoc({ kind: "poem", grownInto: "collection" }))).toEqual(["doc:form"]);
    const saved = { reason: "expand" as const, savedAt: "2026-10-01T00:00:00Z", fromId: "p0" };
    expect(keysOf(mine, makeDoc({ kind: "poem", savedCopy: saved }))).toEqual(["doc:form"]);
  });

  it("blocks a part-by-part merge when one copy is a piece and the other a book", () => {
    const piece = makeDoc({ form: "piece" });
    const book = normalizeDoc({
      id: "p1",
      projectTitle: "My Story",
      chapters: [
        { id: "c1", title: "Arrival", scenes: ["She lands."] },
        { id: "c2", title: "Departure", scenes: ["She leaves."] },
      ],
    });
    const diff = diffDocs(piece, book);
    expect(diff.sections.flatMap((s) => s.items.map((i) => i.key))).toContain("doc:form");
    expect(diff.mergeBlocked).toMatch(/single piece.*book/);
    expect(() => mergeDocs(piece, book, diff, {})).toThrow();
  });

  it("counts the two new units in the total", () => {
    const doc = makeDoc();
    expect(diffDocs(doc, { ...doc, keepLineBreaks: true }).total).toBe(
      1 /* chapter */ + 1 /* book */ + 9 /* story-wide units */
    );
  });
});

describe("mergeDocs: form and line breaks", () => {
  it("keeps this copy's line breaks by default, and takes the file's when chosen", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ keepLineBreaks: true });
    const diff = diffDocs(mine, theirs);
    expect(mergeDocs(mine, theirs, diff, {}).doc.keepLineBreaks).toBeUndefined();
    const taken = mergeDocs(mine, theirs, diff, { "doc:lineBreaks": "theirs" });
    expect(taken.doc.keepLineBreaks).toBe(true);
    expect(taken.fromFile).toBe(1);
  });

  it("drops line breaks when the file has them off", () => {
    const mine = makeDoc({ keepLineBreaks: true });
    const theirs = makeDoc();
    const merged = mergeDocs(mine, theirs, diffDocs(mine, theirs), allFromFile(mine, theirs));
    expect("keepLineBreaks" in merged.doc).toBe(false);
  });

  it("takes kind, grownInto and savedCopy together from the file", () => {
    const saved = { reason: "collapse" as const, savedAt: "2026-10-01T00:00:00Z", fromId: "p0" };
    const mine = makeDoc({ form: "piece", kind: "story", savedCopy: saved });
    const theirs = makeDoc({ form: "piece", kind: "poem" });
    const diff = diffDocs(mine, theirs);

    const kept = mergeDocs(mine, theirs, diff, {}).doc;
    expect(kept.kind).toBe("story");
    expect(kept.savedCopy).toEqual(saved);

    const taken = mergeDocs(mine, theirs, diff, allFromFile(mine, theirs)).doc;
    expect(taken.form).toBe("piece");
    expect(taken.kind).toBe("poem");
    expect("savedCopy" in taken).toBe(false);
  });
});

describe("mergeDocs: author details alongside the project rows", () => {
  it("takes the byline and contact as one row, next to Form and Line breaks", () => {
    const mine = makeDoc({ author: "A. Writer", authorContact: { email: "a@example.com" } });
    const theirs = makeDoc({
      author: "B. Writer",
      authorContact: { legalName: "Bea Writer", phone: "555-0100" },
      kind: "poem",
      keepLineBreaks: true,
    });
    const diff = diffDocs(mine, theirs);
    expect(keysOf(mine, theirs).sort()).toEqual(["doc:author", "doc:form", "doc:lineBreaks"]);

    const kept = mergeDocs(mine, theirs, diff, {}).doc;
    expect(kept.author).toBe("A. Writer");
    expect(kept.authorContact).toEqual({ email: "a@example.com" });

    const taken = mergeDocs(mine, theirs, diff, allFromFile(mine, theirs)).doc;
    expect(taken.author).toBe("B. Writer");
    expect(taken.authorContact).toEqual({ legalName: "Bea Writer", phone: "555-0100" });
    expect(taken.kind).toBe("poem");
    expect(taken.keepLineBreaks).toBe(true);
  });
});
