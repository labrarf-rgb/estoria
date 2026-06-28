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

export const SCHEMA_VERSION = 3;

/** Story-causality link type - the "but / therefore / and" method. */
export type ConnType = "therefore" | "but" | "and";

export type RefKind = "IMAGE" | "NOTE";

/** A pinned reference on a chapter or world entry. */
export interface PinnedRef {
  id: string;
  kind: RefKind;
  label: string;
  /** Note text (for NOTE refs). */
  body?: string;
  /** Image data URL (for IMAGE refs uploaded by the user). */
  src?: string;
  /** When set, this ref mirrors a shared book-level asset. */
  assetId?: string;
}

/** A shared, book-level note or image that can be linked into many chapters. */
export interface Asset {
  id: string;
  kind: RefKind;
  label: string;
  body?: string;
  src?: string;
}

/** A named draft / version of the story. The "main" draft is the base text. */
export interface DraftVersion {
  id: string;
  name: string;
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

/** The editable board contents of a single book. */
export interface BookData {
  chapters: Chapter[];
  links: ChapterLink[];
  storyNotes: string;
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
  /** Free positions of scene nodes inside the detail canvas. */
  scenePos?: Vec2[];
  refs: PinnedRef[];
  /** Per-draft text overrides, keyed by draft id (title/summary only). */
  overrides?: Record<string, { title?: string; summary?: string }>;
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

  // Drafts / versions.
  drafts: DraftVersion[];
  activeDraftId: string;

  // Series bible, shared across all books.
  characters: Character[];
  world: WorldEntry[];
  assets: Asset[];

  // Books.
  books: BookMeta[];
  bookLinks: BookLink[];
  activeBookId: string;

  // Active book working set (top-level for simple canvas components).
  chapters: Chapter[];
  links: ChapterLink[];
  storyNotes: string;

  // Stashed boards for inactive books, keyed by book id.
  bookData: Record<string, BookData>;
}

export const MAIN_DRAFT_ID = "main";
