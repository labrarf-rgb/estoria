import { describe, expect, it } from "vitest";
import type { Character, StoryDoc, WorldEntry } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { diffDocs } from "@/lib/sync";
import { followOrder, mergeDocs } from "@/lib/merge";
import { useStore } from "@/store/useStore";

/**
 * Card order (docs/PLAN-detail-cards-reorder.md): characters, world entries and
 * library items are shown in array order, so the order is part of the file.
 * Compare & merge names an order-only difference as its own unit, and a merge
 * can take the file's order.
 */

const char = (id: string, name: string, over: Partial<Character> = {}) =>
  ({ id, name, initials: name.slice(0, 2).toUpperCase(), color: "#888", role: "", type: "", desc: "", bio: "", traits: [], goals: [], motivations: "", want: "", need: "", notes: "", ...over }) as Character;
const entry = (id: string, name: string) =>
  ({ id, name, cat: "Place", desc: "", notes: "", refs: [] }) as unknown as WorldEntry;

function makeDoc(over: Partial<StoryDoc> = {}): StoryDoc {
  return normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [{ id: "c1", title: "Arrival", scenes: ["She lands."] }],
    characters: [char("a", "Ada"), char("b", "Bo"), char("c", "Cy")],
    world: [entry("w1", "Harbour"), entry("w2", "Guild")],
    ...over,
  });
}
const keysOf = (mine: StoryDoc, theirs: StoryDoc) =>
  diffDocs(mine, theirs).sections.flatMap((s) => s.items.map((i) => i.key));

describe("diffDocs: order units", () => {
  it("names an order-only difference instead of 'details this report doesn't name'", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ characters: [char("c", "Cy"), char("a", "Ada"), char("b", "Bo")] });
    const diff = diffDocs(mine, theirs);
    expect(keysOf(mine, theirs)).toEqual(["doc:charOrder"]);
    expect(diff.lines).toContain("Character order differs");
    const item = diff.sections.flatMap((s) => s.items)[0];
    expect(item.detail[0]).toEqual({ label: "order", mine: "1. Ada, 2. Bo, 3. Cy", theirs: "1. Cy, 2. Ada, 3. Bo" });
  });

  it("does not call an added or deleted record an order change", () => {
    const mine = makeDoc();
    const added = makeDoc({ characters: [char("a", "Ada"), char("z", "Zed"), char("b", "Bo"), char("c", "Cy")] });
    expect(keysOf(mine, added)).toEqual(["character:z"]);
    const deleted = makeDoc({ characters: [char("a", "Ada"), char("c", "Cy")] });
    expect(keysOf(mine, deleted)).toEqual(["character:b"]);
  });

  it("counts an archived record's slot, but only shows visible names", () => {
    const mine = makeDoc({ characters: [char("a", "Ada"), char("b", "Bo", { archived: true }), char("c", "Cy")] });
    const theirs = makeDoc({ characters: [char("b", "Bo", { archived: true }), char("a", "Ada"), char("c", "Cy")] });
    const item = diffDocs(mine, theirs).sections.flatMap((s) => s.items).find((i) => i.key === "doc:charOrder")!;
    expect(item.detail[0].mine).toBe("1. Ada, 2. Cy");
  });

  it("has world and library order units too", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ world: [entry("w2", "Guild"), entry("w1", "Harbour")] });
    expect(keysOf(mine, theirs)).toEqual(["doc:worldOrder"]);
  });
});

describe("mergeDocs: order units", () => {
  it("keeps this copy's order unless the file's is chosen", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ characters: [char("c", "Cy"), char("a", "Ada"), char("b", "Bo")] });
    const diff = diffDocs(mine, theirs);
    expect(mergeDocs(mine, theirs, diff, {}).doc.characters.map((c) => c.id)).toEqual(["a", "b", "c"]);
    const taken = mergeDocs(mine, theirs, diff, { "doc:charOrder": "theirs" });
    expect(taken.doc.characters.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(taken.fromFile).toBe(1);
  });

  it("places a record taken from the file, and keeps one only here in its slot", () => {
    const mine = makeDoc({ characters: [char("a", "Ada"), char("m", "Mine only"), char("b", "Bo"), char("c", "Cy")] });
    const theirs = makeDoc({ characters: [char("t", "Theirs only"), char("c", "Cy"), char("b", "Bo"), char("a", "Ada")] });
    const diff = diffDocs(mine, theirs);
    const merged = mergeDocs(mine, theirs, diff, { "doc:charOrder": "theirs", "character:t": "theirs" });
    expect(merged.doc.characters.map((c) => c.id)).toEqual(["t", "m", "c", "b", "a"]);
  });
});

describe("followOrder", () => {
  it("returns the same array when nothing moves", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(followOrder(list, [{ id: "a" }, { id: "x" }, { id: "b" }])).toBe(list);
  });
});

describe("store: reorderCharacter / reorderWorldEntry", () => {
  it("counts visible items only and leaves archived ones in their slots", () => {
    useStore.setState({
      doc: makeDoc({ characters: [char("a", "Ada"), char("x", "Gone", { archived: true }), char("b", "Bo"), char("c", "Cy")] }),
    });
    useStore.getState().reorderCharacter("c", 0);
    expect(useStore.getState().doc.characters.map((c) => c.id)).toEqual(["c", "x", "a", "b"]);
    useStore.getState().reorderWorldEntry("w2", 0);
    expect(useStore.getState().doc.world.map((w) => w.id)).toEqual(["w2", "w1"]);
  });
});
