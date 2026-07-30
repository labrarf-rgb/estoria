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

/** Every chapter in the doc, across all four board locations. */
function everyChapter(doc: StoryDoc): Chapter[] {
  const fromVersions = (dd: Record<string, VersionData>): Chapter[] =>
    Object.values(dd).flatMap((v) => v.chapters);
  return [
    ...doc.chapters,
    ...fromVersions(doc.draftData),
    ...Object.values(doc.bookData).flatMap((b) => [...b.chapters, ...fromVersions(b.draftData)]),
  ];
}

/**
 * How many chapters cast this character, counting every version and book.
 *
 * Wider than the panel's own "in N chapters", which counts the loaded board
 * only. Archiving is doc-wide, so the confirm that describes it has to be too,
 * or it would understate what the user is retiring.
 */
export function countCharacterCastings(doc: StoryDoc, id: string): number {
  return everyChapter(doc).filter((c) => c.chars.includes(id)).length;
}

/** How many chapters reference this world entry, counting every version and book. */
export function countWorldReferences(doc: StoryDoc, id: string): number {
  return everyChapter(doc).filter((c) => (c.worldRefs ?? []).includes(id)).length;
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
