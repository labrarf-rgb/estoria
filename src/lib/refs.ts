import type { Asset, Chapter, PinnedRef, StoryDoc, VersionData } from "@/types";

/**
 * Ref/asset plumbing shared by the store, the UI, and export.
 *
 * Since schema v5 a `PinnedRef` is a pure link (`{ id, assetId }`) into the
 * doc-level `assets` pool. Refs live in FIVE places and every one must be kept
 * in sync when an asset is deleted (or counted, for the delete confirm):
 *
 *   1. `doc.chapters[*].refs`                       (active book, active version)
 *   2. `doc.draftData[*].chapters[*].refs`          (active book, stashed versions)
 *   3. `doc.bookData[*].chapters[*].refs`           (stashed books)
 *   4. `doc.bookData[*].draftData[*].chapters[*].refs` (stashed books' versions)
 *   5. `doc.world[*].refs`                          (doc-level, one copy)
 *
 * Missing a location is exactly the class of bug SPECS §9 item 5 records for
 * `deleteCharacter` — so both helpers below walk all five, once.
 */

/** A ref resolved against the asset pool — what the UI actually renders/edits. */
export interface ResolvedRef {
  /** The link's own id (unique within its list), NOT the asset id. */
  id: string;
  kind: Asset["kind"];
  label: string;
  body?: string;
  src?: string;
}

/** Resolve a chapter/world entry's refs to their assets, dropping danglers. */
export function resolveRefs(refs: PinnedRef[], assets: Asset[]): ResolvedRef[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out: ResolvedRef[] = [];
  for (const r of refs) {
    const a = byId.get(r.assetId);
    if (!a) continue; // normalizeDoc prunes danglers; render must not crash on a stray
    out.push({ id: r.id, kind: a.kind, label: a.label, body: a.body, src: a.src });
  }
  return out;
}

/**
 * Count links per asset across all five ref locations in ONE walk. Returns a
 * Map keyed by `assetId`; assets with no links are simply absent (read with
 * `?? 0`). Used by the Notes library so a panel that re-renders on every
 * keystroke walks the doc once, not once per asset.
 */
export function countAllAssetLinks(doc: StoryDoc): Map<string, number> {
  const counts = new Map<string, number>();
  const tally = (refs: PinnedRef[] | undefined) => {
    if (refs) for (const r of refs) counts.set(r.assetId, (counts.get(r.assetId) ?? 0) + 1);
  };
  const board = (chapters: Chapter[], draftData: Record<string, VersionData>) => {
    for (const c of chapters) tally(c.refs);
    for (const v of Object.values(draftData)) for (const c of v.chapters) tally(c.refs);
  };
  board(doc.chapters, doc.draftData);
  for (const b of Object.values(doc.bookData)) board(b.chapters, b.draftData);
  for (const w of doc.world) tally(w.refs);
  return counts;
}

/** Return a copy of the doc with every ref to `assetId` unpinned, everywhere. */
export function removeAssetLinks(doc: StoryDoc, assetId: string): StoryDoc {
  const dropCh = (chapters: Chapter[]): Chapter[] =>
    chapters.map((c) =>
      c.refs.some((r) => r.assetId === assetId)
        ? { ...c, refs: c.refs.filter((r) => r.assetId !== assetId) }
        : c
    );
  const dropVersions = (dd: Record<string, VersionData>): Record<string, VersionData> =>
    Object.fromEntries(
      Object.entries(dd).map(([id, v]) => [id, { ...v, chapters: dropCh(v.chapters) }])
    );
  return {
    ...doc,
    chapters: dropCh(doc.chapters),
    draftData: dropVersions(doc.draftData),
    bookData: Object.fromEntries(
      Object.entries(doc.bookData).map(([id, b]) => [
        id,
        { ...b, chapters: dropCh(b.chapters), draftData: dropVersions(b.draftData) },
      ])
    ),
    world: doc.world.map((w) =>
      w.refs.some((r) => r.assetId === assetId)
        ? { ...w, refs: w.refs.filter((r) => r.assetId !== assetId) }
        : w
    ),
  };
}
