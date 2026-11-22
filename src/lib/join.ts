import type { Chapter, Relationship, StoryDoc, VersionData } from "@/types";
import { uid } from "@/lib/ids";

/**
 * Joining two projects (bringing a piece into an anthology, merging a book into
 * a series) adds the incoming project's characters, world entries, library
 * items and relationships to the target's lists, matched by id.
 *
 * Matching by id alone was the review's S1 (docs/REVIEW-2026-11-22.md): two
 * projects can hold the same id for records that have since drifted apart (a
 * piece copied out of an anthology and revised, two files imported without
 * ids, two projects started from the sample), and the target's record won, so
 * the incoming project's version vanished, or its pins pointed at someone
 * else's note.
 *
 * `reconcileIncoming` runs first: an incoming record whose id the target also
 * has, **with different content**, gets a fresh id, and every reference to it
 * inside the incoming project follows. A record that is the same in both stays
 * one record. So the join keeps both versions of anything that differs, which
 * is what the bring-in dialog promises ("shows up twice until you archive one").
 *
 * Relationship kinds are re-ided only when the incoming project has its own
 * stored list; a project still on the starter kinds simply uses the target's.
 */

/** Stable JSON, so two records with the same fields in a different key order compare equal. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])])
    );
  }
  return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** Fresh ids for the incoming records that clash with a different record in the target. */
function clashes<T extends { id: string }>(target: T[], incoming: T[], prefix: string): Map<string, string> {
  const byId = new Map(target.map((x) => [x.id, x]));
  const out = new Map<string, string>();
  for (const x of incoming) {
    const t = byId.get(x.id);
    if (t && !same(t, x)) out.set(x.id, uid(prefix));
  }
  return out;
}

function mapBoards(doc: StoryDoc, fn: (c: Chapter) => Chapter): StoryDoc {
  const versions = (dd: Record<string, VersionData>) =>
    Object.fromEntries(Object.entries(dd).map(([id, v]) => [id, { ...v, chapters: v.chapters.map(fn) }]));
  return {
    ...doc,
    chapters: doc.chapters.map(fn),
    draftData: versions(doc.draftData),
    bookData: Object.fromEntries(
      Object.entries(doc.bookData).map(([id, b]) => [
        id,
        { ...b, chapters: b.chapters.map(fn), draftData: versions(b.draftData) },
      ])
    ),
  };
}

export interface Reconciled {
  /** The incoming project, with clashing ids replaced everywhere inside it. */
  source: StoryDoc;
  /** How many records were kept as a second copy, by list. */
  kept: { characters: number; world: number; assets: number; relationships: number; kinds: number };
}

export function reconcileIncoming(target: StoryDoc, source: StoryDoc): Reconciled {
  const chars = clashes(target.characters, source.characters, "p");
  const world = clashes(target.world, source.world, "w");
  const assets = clashes(target.assets, source.assets, "a");
  const kinds = source.relationshipKinds
    ? clashes(target.relationshipKinds ?? [], source.relationshipKinds, "k")
    : new Map<string, string>();
  const ch = (id: string) => chars.get(id) ?? id;
  const as = (id: string) => assets.get(id) ?? id;

  // Relationships first take their characters' and kind's new ids; one that
  // still clashes with a different target record by id then gets its own.
  const remapped: Relationship[] = (source.relationships ?? []).map((r) => ({
    ...r,
    a: ch(r.a),
    b: ch(r.b),
    ...(r.kind ? { kind: kinds.get(r.kind) ?? r.kind } : {}),
  }));
  const rels = clashes(target.relationships ?? [], remapped, "rel");

  const kept = {
    characters: chars.size,
    world: world.size,
    assets: assets.size,
    relationships: rels.size,
    kinds: kinds.size,
  };
  if (!chars.size && !world.size && !assets.size && !kinds.size && !rels.size) return { source, kept };

  const boards = mapBoards(source, (c) => ({
    ...c,
    chars: c.chars.map(ch),
    ...(c.worldRefs ? { worldRefs: c.worldRefs.map((id) => world.get(id) ?? id) } : {}),
    refs: c.refs.map((r) => (assets.has(r.assetId) ? { ...r, assetId: as(r.assetId) } : r)),
  }));
  const next: StoryDoc = {
    ...boards,
    characters: source.characters.map((c) => (chars.has(c.id) ? { ...c, id: ch(c.id) } : c)),
    world: source.world.map((w) => ({
      ...w,
      id: world.get(w.id) ?? w.id,
      refs: w.refs.map((r) => (assets.has(r.assetId) ? { ...r, assetId: as(r.assetId) } : r)),
    })),
    assets: source.assets.map((a) => (assets.has(a.id) ? { ...a, id: as(a.id) } : a)),
  };
  if (source.relationshipKinds) {
    next.relationshipKinds = source.relationshipKinds.map((k) => (kinds.has(k.id) ? { ...k, id: kinds.get(k.id)! } : k));
  }
  if (source.relationships) {
    next.relationships = remapped.map((r) => (rels.has(r.id) ? { ...r, id: rels.get(r.id)! } : r));
  }
  if (source.relationshipLayout) {
    next.relationshipLayout = Object.fromEntries(
      Object.entries(source.relationshipLayout).map(([id, p]) => [ch(id), p])
    );
  }
  return { source: next, kept };
}
