import type { Chapter, StoryDoc, VersionData } from "@/types";

/**
 * Series-level entity deletes (character, world entry).
 *
 * Characters and world entries are shared across all books and versions, but
 * chapters that reference them (via `chars` / `worldRefs`) live in FOUR
 * places, same as the ref locations `lib/refs.ts` walks for assets:
 *
 *   1. `doc.chapters`                      (active book, active version)
 *   2. `doc.draftData[*].chapters`         (active book, stashed versions)
 *   3. `doc.bookData[*].chapters`          (stashed books)
 *   4. `doc.bookData[*].draftData[*].chapters` (stashed books' versions)
 *
 * Missing a location leaves dangling ids in chapters that aren't currently
 * loaded — mirrors Android's `lib/Entities.kt`, so both apps produce
 * byte-identical docs from the same delete.
 */

/** Apply fn to every chapter in the doc — all four board locations. */
function mapEveryChapter(doc: StoryDoc, fn: (c: Chapter) => Chapter): StoryDoc {
  const mapChapters = (chapters: Chapter[]): Chapter[] => chapters.map(fn);
  const mapVersions = (dd: Record<string, VersionData>): Record<string, VersionData> =>
    Object.fromEntries(
      Object.entries(dd).map(([id, v]) => [id, { ...v, chapters: mapChapters(v.chapters) }])
    );
  return {
    ...doc,
    chapters: mapChapters(doc.chapters),
    draftData: mapVersions(doc.draftData),
    bookData: Object.fromEntries(
      Object.entries(doc.bookData).map(([id, b]) => [
        id,
        { ...b, chapters: mapChapters(b.chapters), draftData: mapVersions(b.draftData) },
      ])
    ),
  };
}

/** Drop a character and clear its id from every chapter's `chars`, everywhere. */
export function deleteCharacterDoc(doc: StoryDoc, id: string): StoryDoc {
  const dropped = mapEveryChapter(doc, (c) =>
    c.chars.includes(id) ? { ...c, chars: c.chars.filter((x) => x !== id) } : c
  );
  return { ...dropped, characters: doc.characters.filter((c) => c.id !== id) };
}

/** Drop a world entry and clear its id from every chapter's `worldRefs`, everywhere. */
export function deleteWorldEntryDoc(doc: StoryDoc, id: string): StoryDoc {
  const dropped = mapEveryChapter(doc, (c) =>
    c.worldRefs?.includes(id) ? { ...c, worldRefs: c.worldRefs.filter((x) => x !== id) } : c
  );
  return { ...dropped, world: doc.world.filter((w) => w.id !== id) };
}
