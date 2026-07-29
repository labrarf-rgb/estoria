/**
 * Estoria document model.
 *
 * The entire project is one serializable JSON object (`StoryDoc`). It is what we
 * auto-save to browser storage, what the user exports as a project file, and
 * what a future cloud backend would persist. Keep it plain-data and versioned.
 *
 * Multi-book: the active book's board lives at the top level (`chapters`,
 * `links`, `storyNotes`) so the canvas components stay simple; inactive books
 * are stashed in `bookData` and swapped in when you switch books.
 */

export const SCHEMA_VERSION = 7;

/** Story-causality link type - the "but / therefore / and" method. */
export type ConnType = "therefore" | "but" | "and";

/**
 * What a pinnable resource *is*. `TODO` arrived in schema v6 — a checklist that
 * lives in the same shared pool as notes and images, so it can be pinned to a
 * chapter or a world entry exactly like they can.
 */
export type RefKind = "IMAGE" | "NOTE" | "TODO";

/** One line of a `TODO` asset's checklist. */
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * A pinned reference on a chapter or world entry. Since schema v5 a ref is a
 * pure *link* to a shared `Asset` — it carries no content of its own, so the
 * asset is the single source of truth and can never go stale in a stashed
 * book/version we don't cheaply sweep. Content edits go through `updateAsset`;
 * a ref only records "this asset is pinned here" (`id` is the link's own id,
 * unique within its list, so the same asset can be pinned once per location).
 */
export interface PinnedRef {
  id: string;
  assetId: string;
}

/** A shared, book-level note, image or checklist that can be linked into many chapters. */
export interface Asset {
  id: string;
  kind: RefKind;
  label: string;
  body?: string;
  src?: string;
  /** Checklist lines — `TODO` assets only. */
  items?: TodoItem[];
  /**
   * Archived (v6): retired from the shared library. Archiving **unpins the asset
   * everywhere** first, so an archived asset is by definition attached to
   * nothing — it stays in the pool only so it can be restored, and it is hidden
   * from the library list and the link picker until it is.
   */
  archived?: boolean;
}

/**
 * A named draft / version of the story. Which one is "main" is a movable
 * pointer (`mainDraftId`), not this id — see the note on `MAIN_DRAFT_ID`.
 */
export interface DraftVersion {
  id: string;
  name: string;
}

/**
 * The full board contents of one draft version — a standalone fork. Creating a
 * version deep-copies the active board, so versions diverge freely and edits
 * never leak between them. The active version's content lives at the top level
 * (`chapters`/`links`/`storyNotes`); inactive versions are stashed in
 * `draftData`, mirroring how inactive books are stashed in `bookData`.
 */
export interface VersionData {
  chapters: Chapter[];
  links: ChapterLink[];
  storyNotes: string;
}

export type ChapterStatus = "done" | "draft" | "idea";

export interface Character {
  id: string;
  name: string;
  role: string; // Protagonist, Antagonist, Ally, ...
  type: string; // archetype: Hero, Shadow, Trickster, ...
  initials: string;
  color: string; // oklch() string used for the avatar chip
  desc: string;
  bio: string;
  traits: string[];
  goals: string[];
  motivations: string;
  want: string;
  need: string;
  notes: string;
}

export type WorldCategory = "Place" | "Faction" | "Lore" | "Event";
export interface WorldEntry {
  id: string;
  cat: WorldCategory;
  name: string;
  desc: string;
  notes: string;
  refs: PinnedRef[];
}

export type BookStatus = "drafting" | "planned" | "idea";

/** Series-level metadata for a book. The board itself lives in BookData. */
export interface BookMeta {
  id: string;
  title: string;
  subtitle: string;
  status: BookStatus;
  /** One-paragraph synopsis. */
  premise: string;
  /** The arc this book carries. */
  arc: string;
  /** Free-form notes shown on the series map card. */
  notes?: string;
  /** Optional cover image (data URL). */
  coverSrc?: string;
  /** Position on the series map canvas. */
  x: number;
  y: number;
}

/**
 * A connector between two books on the series map. Plain (not therefore/but/and);
 * multiple links between the same pair are allowed, each with an optional label.
 */
export interface BookLink {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

/** The editable board contents of a single book. Drafts/versions are per book. */
export interface BookData {
  chapters: Chapter[];
  links: ChapterLink[];
  storyNotes: string;
  drafts: DraftVersion[];
  activeDraftId: string;
  /** Which version this book treats as canonical. Movable; see `MAIN_DRAFT_ID`. */
  mainDraftId: string;
  /** Stashed boards for this book's inactive versions, keyed by draft id. */
  draftData: Record<string, VersionData>;
}

/** A free position on a canvas. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Chapter {
  id: string;
  num: number;
  act: number;
  status: ChapterStatus;
  title: string;
  summary?: string;
  /** Chapter-level notes (separate from pinned references). */
  notes?: string;
  words: number;
  /** Board position. */
  x: number;
  y: number;
  /** Slight rotation applied by auto-arrange for a hand-laid feel. */
  rot?: number;
  /** Character ids appearing in this chapter. */
  chars: string[];
  /** World-entry ids referenced in this chapter. */
  worldRefs?: string[];
  /** Scene beats, in order. */
  scenes: string[];
  /** Link type between scene i and i+1 (length = scenes.length - 1). */
  sceneLinks: ConnType[];
  /**
   * Scene-node positions inside the detail canvas, for the **expanded** scene
   * flow. The canvas has two sizes, and each remembers its own layout — see
   * `scenePosCompact`.
   */
  scenePos?: Vec2[];
  /**
   * Scene-node positions for the **collapsed** scene flow (v6). The two modes
   * fit different column counts, so one shared layout meant toggling had to
   * re-arrange, which threw away how the scenes had been laid out. Keeping a
   * layout per mode is what makes the arrangement survive a toggle.
   */
  scenePosCompact?: Vec2[];
  refs: PinnedRef[];
}

/** A connector between two chapters on the board. */
export interface ChapterLink {
  fromId: string;
  toId: string;
  type: ConnType;
}

export interface StoryDoc {
  schemaVersion: number;
  id: string;
  projectTitle: string;
  seriesMode: boolean;

  /**
   * ISO 8601 stamp of the last *file* write (export/backup/sync), shared with
   * the Android app. Display only — cross-app conflict detection uses content
   * fingerprints, never clocks (see docs/SPECS.md §8 "Cross-app Sync").
   * Absent on docs that have never been written to a file.
   */
  modifiedAt?: string;

  // Drafts / versions (per book; these describe the active book, like
  // `chapters` below). Each version is a standalone fork of the board.
  drafts: DraftVersion[];
  activeDraftId: string;
  /** Which version the active book treats as canonical (movable). */
  mainDraftId: string;

  // Series bible, shared across all books.
  characters: Character[];
  world: WorldEntry[];
  assets: Asset[];

  // Books.
  books: BookMeta[];
  bookLinks: BookLink[];
  activeBookId: string;

  // Active book + active version working set (top-level for simple canvas
  // components).
  chapters: Chapter[];
  links: ChapterLink[];
  storyNotes: string;

  // Stashed boards for the active book's inactive versions, keyed by draft id.
  draftData: Record<string, VersionData>;

  // Stashed boards for inactive books, keyed by book id.
  bookData: Record<string, BookData>;
}

/**
 * The id every book's first version is seeded with, and the default value of
 * `mainDraftId` for documents written before the pointer existed. It is only a
 * seed: which version is *main* is whatever `mainDraftId` points at, so never
 * compare against this constant to answer "is this the main version?" — read
 * the pointer (or `resolveMainDraftId` when the data may be untrusted).
 */
export const MAIN_DRAFT_ID = "main";
