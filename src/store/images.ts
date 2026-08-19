import type { Asset, BookMeta, StoryDoc } from "@/types";
import { loadAllFrom, STORE_IMAGES, writeTo } from "@/store/idb";

/**
 * Where pictures live at rest.
 *
 * The same idea as `store/prose.ts`, applied to the other payload that does not
 * belong in a ~5MB localStorage blob: an image the user picked is inlined into
 * the document as a base64 data URL, and base64 costs a third more than the
 * file did. One phone photo is ~5.5MB of string — **the entire quota, in a
 * single drop**, after which every subsequent save fails, including the ones
 * that have nothing to do with the picture. SPECS §9 item 2 named this in July:
 * with base64 images in the doc, quota exhaustion is a *when*, not an *if*.
 *
 * **The split is at the at-rest layer only**, exactly as it is for prose.
 * `StoryDoc` keeps `src` and `coverSrc` as real data URLs in memory and in
 * every file, so `<img src>` renders unchanged, export and Sync write the same
 * bytes they always did, and the Android app reading the shared
 * `.estoria.json` cannot tell this happened. The only thing that changes is
 * that the auto-save writes the pictures to IndexedDB and the map without
 * them, and the load puts them back before the store ever sees the document.
 *
 * Why data URLs rather than Blobs, given we are already in IndexedDB: because
 * ids in the document would change what the document *is*. `contentKey` in
 * `persistence.migrateRefsToAssets` hashes `src` to decide whether two assets
 * are the same asset, `lib/sync.ts` diffs `coverSrc` by value, and every
 * `<img>` would need an object URL with a lifetime to manage. Keeping the
 * document whole keeps all of that untouched, and the cost — a third of a
 * picture's size, in memory only — buys a change that reaches two functions
 * instead of a dozen.
 */

/**
 * Pictures hang off two places, and both sit at the top level of a document
 * rather than buried in the book/version/chapter tree the way prose is: the
 * series-bible `assets` and each book's cover. `kind` distinguishes them so an
 * asset and a book that somehow share an id cannot collide.
 */
export type ImageKind = "asset" | "cover";

/**
 * JSON rather than a joined string, for the reason `proseKey` gives: ids are
 * normally `uid()` output, but `normalizeDoc` accepts any non-empty string from
 * an imported or hand-edited file, so there is no separator character that is
 * safe to assume is absent from one.
 *
 * The project id comes first because `staleKeys` reads it back out to decide
 * what a snapshot is entitled to delete.
 */
export const imageKey = (projectId: string, kind: ImageKind, id: string): string =>
  JSON.stringify([projectId, kind, id]);

/**
 * Lift every picture out of a document, returning the picture-free document to
 * be serialized and the pictures to be written separately.
 *
 * Returns the SAME doc (and the same arrays) when there is nothing to lift, so
 * a project with no images costs one walk and no allocation — and, more to the
 * point, does not dirty the doc for the auto-save or the sync fingerprint.
 */
export function splitImages(doc: StoryDoc): { doc: StoryDoc; images: Map<string, string> } {
  const images = new Map<string, string>();

  let assetsChanged = false;
  const assets = doc.assets.map((a) => {
    if (a.src === undefined) return a;
    images.set(imageKey(doc.id, "asset", a.id), a.src);
    assetsChanged = true;
    const { src: _lifted, ...rest } = a;
    return rest as Asset;
  });

  let booksChanged = false;
  const books = doc.books.map((b) => {
    if (b.coverSrc === undefined) return b;
    images.set(imageKey(doc.id, "cover", b.id), b.coverSrc);
    booksChanged = true;
    const { coverSrc: _lifted, ...rest } = b;
    return rest as BookMeta;
  });

  if (!assetsChanged && !booksChanged) return { doc, images };
  return {
    doc: {
      ...doc,
      assets: assetsChanged ? assets : doc.assets,
      books: booksChanged ? books : doc.books,
    },
    images,
  };
}

/** Put the pictures back, so the store only ever sees a whole `StoryDoc`. */
export function mergeImages(doc: StoryDoc, images: Map<string, string>): StoryDoc {
  if (images.size === 0) return doc;

  let assetsChanged = false;
  const assets = doc.assets.map((a) => {
    const src = images.get(imageKey(doc.id, "asset", a.id));
    if (src === undefined || src === a.src) return a;
    assetsChanged = true;
    return { ...a, src };
  });

  let booksChanged = false;
  const books = doc.books.map((b) => {
    const coverSrc = images.get(imageKey(doc.id, "cover", b.id));
    if (coverSrc === undefined || coverSrc === b.coverSrc) return b;
    booksChanged = true;
    return { ...b, coverSrc };
  });

  if (!assetsChanged && !booksChanged) return doc;
  return {
    ...doc,
    assets: assetsChanged ? assets : doc.assets,
    books: booksChanged ? books : doc.books,
  };
}

/** Every picture on this origin, keyed by `imageKey`. */
export const loadAllImages = (): Promise<Map<string, string>> => loadAllFrom(STORE_IMAGES);

/** Apply one batch of writes and deletes in a single transaction. */
export const writeImages = (puts: Map<string, string>, deletes: Iterable<string>): Promise<void> =>
  writeTo(STORE_IMAGES, puts, deletes);
