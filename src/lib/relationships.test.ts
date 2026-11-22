import { describe, expect, it } from "vitest";
import type { Character, StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { diffDocs } from "@/lib/sync";
import { mergeDocs } from "@/lib/merge";
import { deleteCharacterDoc } from "@/lib/entities";
import {
  STARTER_KINDS,
  kindName,
  kindsOf,
  relationshipFieldsAmong,
  tiesOf,
  unionRelationshipFields,
} from "@/lib/relationships";
import { pruneEmptyEntries } from "@/lib/prune";

/**
 * Relationships (SPECS §4 "Relationships"): three optional top-level fields
 * that must survive a file round trip, read defensively, clean up after a
 * deleted character, and show up in compare and merge.
 */

const char = (id: string, name: string, archived = false): Character => ({
  id,
  name,
  role: "",
  type: "",
  initials: name.slice(0, 2).toUpperCase(),
  color: "oklch(0.6 0.1 200)",
  desc: "",
  bio: "",
  traits: [],
  goals: [],
  motivations: "",
  want: "",
  need: "",
  notes: "",
  ...(archived ? { archived: true } : {}),
});

function makeDoc(over: Partial<StoryDoc> = {}): StoryDoc {
  return normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [{ id: "c1", title: "Arrival", scenes: ["She lands."], chars: ["wren", "sela"] }],
    characters: [char("wren", "Wren"), char("sela", "Sela"), char("bram", "Bram")],
    ...over,
  });
}

describe("normalizeDoc: relationships", () => {
  it("keeps all three fields through a file round trip", () => {
    const doc = makeDoc({
      relationships: [{ id: "r1", a: "sela", b: "wren", kind: "mentor", label: "former mentor", aView: "Wants her back." }],
      relationshipKinds: [...STARTER_KINDS, { id: "k1", name: "Debt", color: 8 }],
      relationshipLayout: { wren: { x: 0.25, y: 0.5 } },
    });
    const again = normalizeDoc(JSON.parse(JSON.stringify(doc)));
    expect(again.relationships).toEqual(doc.relationships);
    expect(again.relationshipKinds).toEqual(doc.relationshipKinds);
    expect(again.relationshipLayout).toEqual({ wren: { x: 0.25, y: 0.5 } });
  });

  it("leaves a project without them exactly as before", () => {
    const doc = makeDoc();
    expect(doc.relationships).toBeUndefined();
    expect(doc.relationshipKinds).toBeUndefined();
    expect(doc.relationshipLayout).toBeUndefined();
    expect(kindsOf(doc)).toBe(STARTER_KINDS);
  });

  it("drops a tie to a missing character, a tie to oneself, and a second record for a pair", () => {
    const doc = makeDoc({
      relationships: [
        { id: "r1", a: "wren", b: "sela" },
        { id: "r2", a: "sela", b: "wren" }, // same pair the other way round
        { id: "r3", a: "wren", b: "wren" },
        { id: "r4", a: "wren", b: "ghost" }, // deleted on the phone, say
        { id: "r5", a: "bram", b: "wren", kind: "nope" },
      ],
    });
    expect(doc.relationships!.map((r) => r.id)).toEqual(["r1", "r5"]);
    // A kind that names no kind is cleared; the tie is kept.
    expect(doc.relationships![1].kind).toBeUndefined();
  });

  it("keeps an empty kind list as 'no kinds', distinct from absent", () => {
    const doc = makeDoc({ relationshipKinds: [] });
    expect(doc.relationshipKinds).toEqual([]);
    expect(kindName(doc, "family")).toBe("No kind");
  });

  it("clamps chart positions and drops ones for characters that don't exist", () => {
    const doc = makeDoc({
      relationshipLayout: { wren: { x: 1.4, y: -2 }, ghost: { x: 0.5, y: 0.5 }, sela: { x: NaN, y: 0 } } as never,
    });
    expect(doc.relationshipLayout).toEqual({ wren: { x: 1, y: 0 } });
  });
});

describe("deleting and archiving a character", () => {
  const withTies = () =>
    makeDoc({
      relationships: [
        { id: "r1", a: "wren", b: "sela" },
        { id: "r2", a: "bram", b: "wren" },
        { id: "r3", a: "sela", b: "bram" },
      ],
      relationshipLayout: { wren: { x: 0.2, y: 0.2 }, sela: { x: 0.8, y: 0.8 } },
    });

  it("removes the character's relationships and chart position on delete", () => {
    const doc = deleteCharacterDoc(withTies(), "wren");
    expect(doc.relationships!.map((r) => r.id)).toEqual(["r3"]);
    expect(doc.relationshipLayout).toEqual({ sela: { x: 0.8, y: 0.8 } });
  });

  it("keeps them when the character is archived", () => {
    const doc = makeDoc({
      characters: [char("wren", "Wren"), char("sela", "Sela", true)],
      relationships: [{ id: "r1", a: "wren", b: "sela" }],
    });
    expect(tiesOf(doc, "sela")).toHaveLength(1);
  });
});

describe("compare and merge: relationships", () => {
  it("shows a relationship row, named by its two characters", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ relationships: [{ id: "r1", a: "wren", b: "sela", kind: "rival" }] });
    const items = diffDocs(mine, theirs).sections.flatMap((s) => s.items);
    expect(items.map((i) => i.key)).toEqual(["relationship:r1"]);
    expect(items[0].name).toBe("Wren and Sela");
    expect(items[0].state).toBe("only-file");
  });

  it("treats absent kinds and the starter list written out as the same", () => {
    const mine = makeDoc();
    const theirs = makeDoc({ relationshipKinds: STARTER_KINDS.map((k) => ({ ...k })) });
    expect(diffDocs(mine, theirs).sections.flatMap((s) => s.items)).toEqual([]);
  });

  it("shows kinds and chart layout as one story-wide row each, and merges them whole", () => {
    const mine = makeDoc();
    const theirs = makeDoc({
      relationshipKinds: [{ id: "k1", name: "Debt", color: 8 }],
      relationshipLayout: { wren: { x: 0.1, y: 0.9 } },
    });
    const diff = diffDocs(mine, theirs);
    const keys = diff.sections.flatMap((s) => s.items.map((i) => i.key));
    expect(keys).toEqual(["doc:relKinds", "doc:relLayout"]);
    expect(mergeDocs(mine, theirs, diff, {}).doc.relationshipKinds).toBeUndefined();
    const taken = mergeDocs(mine, theirs, diff, { "doc:relKinds": "theirs", "doc:relLayout": "theirs" }).doc;
    expect(taken.relationshipKinds).toEqual([{ id: "k1", name: "Debt", color: 8 }]);
    expect(taken.relationshipLayout).toEqual({ wren: { x: 0.1, y: 0.9 } });
  });

  it("brings in the character and the kind a relationship taken from the file needs", () => {
    const mine = makeDoc();
    const theirs = makeDoc({
      characters: [char("wren", "Wren"), char("sela", "Sela"), char("bram", "Bram"), char("pip", "Pip")],
      relationshipKinds: [...STARTER_KINDS, { id: "k1", name: "Debt", color: 8 }],
      relationships: [{ id: "r1", a: "pip", b: "wren", kind: "k1" }],
    });
    const diff = diffDocs(mine, theirs);
    const res = mergeDocs(mine, theirs, diff, { "relationship:r1": "theirs" });
    expect(res.doc.relationships).toEqual([{ id: "r1", a: "pip", b: "wren", kind: "k1" }]);
    expect(res.doc.characters.map((c) => c.id)).toContain("pip");
    expect(kindName(res.doc, "k1")).toBe("Debt");
    expect(res.carried.map((c) => c.kind).sort()).toEqual(["character", "relationship kind"]);
  });

  it("keeps this copy's relationships unless a row is taken", () => {
    const mine = makeDoc({ relationships: [{ id: "r1", a: "wren", b: "sela", label: "here" }] });
    const theirs = makeDoc({ relationships: [{ id: "r1", a: "wren", b: "sela", label: "there" }] });
    const diff = diffDocs(mine, theirs);
    expect(mergeDocs(mine, theirs, diff, {}).doc.relationships![0].label).toBe("here");
    expect(mergeDocs(mine, theirs, diff, { "relationship:r1": "theirs" }).doc.relationships![0].label).toBe("there");
  });
});

describe("joining projects (merge into a series, bring into an anthology)", () => {
  it("keeps both projects' relationships, the target winning on a shared pair", () => {
    const target = makeDoc({
      relationships: [{ id: "r1", a: "wren", b: "sela", label: "here" }],
      relationshipLayout: { wren: { x: 0.1, y: 0.1 } },
    });
    const source = {
      relationships: [
        { id: "r9", a: "sela", b: "wren", label: "there" }, // same pair
        { id: "r2", a: "pip", b: "tam" },
      ],
      relationshipKinds: [{ id: "k1", name: "Debt", color: 8 }],
      relationshipLayout: { wren: { x: 0.9, y: 0.9 }, pip: { x: 0.5, y: 0.5 } },
    };
    const u = unionRelationshipFields(target, source);
    expect(u.relationships!.map((r) => r.id)).toEqual(["r1", "r2"]);
    // The target had no list of its own, so it brings the starters and the source adds Debt.
    expect(u.relationshipKinds!.map((k) => k.id)).toEqual([...STARTER_KINDS.map((k) => k.id), "k1"]);
    expect(u.relationshipLayout).toEqual({ wren: { x: 0.1, y: 0.1 }, pip: { x: 0.5, y: 0.5 } });
  });

  it("leaves kinds absent when neither project has its own list", () => {
    expect(unionRelationshipFields(makeDoc(), makeDoc()).relationshipKinds).toBeUndefined();
  });

  it("takes out only the relationships among the piece's own cast", () => {
    const doc = makeDoc({
      relationships: [
        { id: "r1", a: "wren", b: "sela" },
        { id: "r2", a: "wren", b: "bram" },
      ],
    });
    expect(relationshipFieldsAmong(doc, new Set(["wren", "sela"])).relationships!.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("pruning blank characters", () => {
  it("keeps a blank character that has relationships", () => {
    const blank = { ...char("x", ""), initials: "" };
    const doc = makeDoc({
      characters: [char("wren", "Wren"), blank, { ...char("y", ""), initials: "" }],
      relationships: [{ id: "r1", a: "wren", b: "x" }],
    });
    const pruned = pruneEmptyEntries(doc);
    expect(pruned.characters.map((c) => c.id)).toEqual(["wren", "x"]);
    expect(pruned.relationships).toHaveLength(1);
  });
});
