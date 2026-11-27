import { describe, expect, it } from "vitest";
import { topLayer } from "./layers";

interface L {
  name: string;
  z: number;
  /** Document order: higher is later. */
  doc: number;
}
const z = (l: L) => l.z;
const follows = (a: L, b: L) => a.doc > b.doc;

const chapter: L = { name: "chapter", z: 50, doc: 1 };
const panel: L = { name: "panel", z: 55, doc: 2 };
const draft: L = { name: "draft window", z: 65, doc: 9 }; // portaled to <body>, so last in the document

describe("topLayer", () => {
  it("is nothing with no layers, and the only one with one", () => {
    expect(topLayer([], z, follows)).toBeUndefined();
    expect(topLayer([chapter], z, follows)).toBe(chapter);
  });

  it("does not depend on the order the layers registered in", () => {
    // + Create new character inside a chapter: the panel and its draft window
    // open in one update, and React runs the child's (the window's) layout
    // effect first, so it registers before the panel.
    expect(topLayer([chapter, draft, panel], z, follows)).toBe(draft);
    expect(topLayer([chapter, panel, draft], z, follows)).toBe(draft);
    expect(topLayer([draft, panel, chapter], z, follows)).toBe(draft);
  });

  it("puts the higher z-index on top, whatever the document order", () => {
    const confirm: L = { name: "confirm", z: 80, doc: 0 };
    expect(topLayer([panel, confirm], z, follows)).toBe(confirm);
  });

  it("breaks a z-index tie by document order", () => {
    const a: L = { name: "a", z: 50, doc: 3 };
    const b: L = { name: "b", z: 50, doc: 4 };
    expect(topLayer([b, a], z, follows)).toBe(b);
    expect(topLayer([a, b], z, follows)).toBe(b);
  });
});
