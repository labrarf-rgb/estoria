import { describe, expect, it } from "vitest";
import { emptyStory } from "@/data/emptyStory";
import { normalizeDoc } from "@/store/persistence";
import { buildDocx } from "@/lib/manuscriptExport";
import { authorOf, contactLines, hasAuthor, sameAuthor, withAuthor } from "@/lib/author";
import { diffDocs } from "@/lib/sync";
import type { StoryDoc } from "@/types";

const withProse = (): StoryDoc => {
  const doc = emptyStory();
  doc.projectTitle = "The Drowned City";
  doc.chapters = [
    {
      id: "c1",
      num: 1,
      title: "One",
      status: "draft",
      words: 3,
      x: 0,
      y: 0,
      summary: "",
      scenes: [],
      sceneLinks: [],
      characterIds: [],
      worldIds: [],
      refs: [],
      manuscript: "It was raining.",
    } as unknown as StoryDoc["chapters"][number],
  ];
  return doc;
};

/** The .docx is a stored (not deflated) zip, so its XML is readable as is. */
const docxText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("author details", () => {
  it("splits into byline and contact, and leaves no empty keys behind", () => {
    const doc = withAuthor(emptyStory(), { byline: "R. L. Hart", email: "r@x.com", phone: "  " });
    expect(doc.author).toBe("R. L. Hart");
    expect(doc.authorContact).toEqual({ email: "r@x.com" });

    const cleared = withAuthor(doc, {});
    expect("author" in cleared).toBe(false);
    expect("authorContact" in cleared).toBe(false);
  });

  it("reads back what was written", () => {
    const d = { byline: "R. L. Hart", legalName: "Rae Hart", address: "1 Main St\nTown" };
    expect(authorOf(withAuthor(emptyStory(), d))).toEqual(d);
    expect(hasAuthor({ email: " " })).toBe(false);
    expect(sameAuthor({ byline: "A " }, { byline: "A", email: "" })).toBe(true);
  });

  it("survives a round trip through a file", () => {
    const doc = withAuthor(emptyStory(), { byline: "R. L. Hart", website: "hart.example" });
    const back = normalizeDoc(JSON.parse(JSON.stringify(doc)));
    expect(authorOf(back)).toEqual({ byline: "R. L. Hart", website: "hart.example" });
  });

  it("drops junk in authorContact rather than trusting it", () => {
    const raw = { ...emptyStory(), authorContact: { email: 5, phone: "555", evil: "x" } };
    expect(normalizeDoc(raw).authorContact).toEqual({ phone: "555" });
  });

  it("orders the title page's contact block", () => {
    expect(
      contactLines({
        byline: "R. L. Hart",
        legalName: "Rae Hart",
        address: "1 Main St\n\nTown",
        phone: "555",
        email: "r@x.com",
        website: "hart.example",
      })
    ).toEqual(["Rae Hart", "1 Main St", "Town", "555", "r@x.com", "hart.example"]);
    // No separate legal name: the byline heads the block.
    expect(contactLines({ byline: "R. L. Hart" })).toEqual(["R. L. Hart"]);
    expect(contactLines({})).toEqual([]);
  });

  it("puts the legal name on the title page and the byline under the title", () => {
    const xml = docxText(
      buildDocx(withProse(), { byline: "R. L. Hart", legalName: "Rae Hart", email: "rae_h@x.com" })
    );
    expect(xml).toContain("Rae Hart");
    expect(xml).toContain("by R. L. Hart");
    // Plain text: an underscore in an address is not read as markdown.
    expect(xml).toContain("rae_h@x.com");
    // Running header uses the byline's surname.
    expect(xml).toContain("Hart / The Drowned City");
  });

  it("invents no name when none is given", () => {
    const xml = docxText(buildDocx(withProse(), {}));
    expect(xml).not.toContain(">by ");
  });

  it("compares byline and contact as one sync unit", () => {
    const mine = withAuthor(withProse(), { byline: "R. L. Hart", email: "a@x.com" });
    const theirs = withAuthor(withProse(), { byline: "R. L. Hart", email: "b@x.com" });
    const items = diffDocs(mine, theirs).sections.flatMap((s) => s.items);
    const author = items.find((i) => i.name === "Author details");
    expect(author?.detail).toEqual([{ label: "email", mine: "a@x.com", theirs: "b@x.com" }]);
  });
});
