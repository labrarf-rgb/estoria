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

export const SCHEMA_VERSION = 9;

/**
 * Story-causality link type - the "but / therefore / and" method.
 *
 * `"none"` (v9) is the opt-out: two scenes are still connected and still
 * ordered, but the seam between them makes no causal claim. It exists because
 * every other value asserts something about the relationship, so before v9 a
 * seam the *app* opened (a reorder, a scene pulled out of a run) had to invent
 * a "therefore" the writer never chose. `"none"` is what those seams get now.
 *
 * It renders as a plain line with no pill, and exports with no `(therefore)`
 * tag — so an untagged scene in markdown reads back as `"none"`, not as a
 * causal link (see `parseImportMarkdown`).
 */
export type ConnType = "therefore" | "but" | "and" | "none";

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
   * Archived: retired from the shared library. See the shared archive rule on
   * `Character.archived` — the pins this asset already has are **kept**, and
   * render dimmed wherever they sit.
   *
   * ⚠️ The rule changed in v8. Under v6/v7 archiving unpinned the asset
   * everywhere first, so an archived asset was attached to nothing by
   * construction and readers were told they could assume that. They no longer
   * can: a v8 doc can hold an archived asset with live pins.
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

/**
 * The shared archive rule (v8), for characters, world entries and assets alike.
 *
 * Archiving retires a record from its roster/library and from every picker, so
 * nothing new can be attached to it — but it leaves everything it is *already*
 * attached to exactly as it was. A chapter still remembers the character it
 * cast, the world entry it referenced, the note it pinned; those attachments
 * just render dimmed and marked "archived". Restoring is therefore always
 * lossless, which is what makes archiving a low-stakes move rather than a soft
 * delete.
 *
 * This is deliberately *not* how it worked before v8 — see `Asset.archived`.
 */
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
  /** Retired from the roster; existing castings are kept. See the rule above. */
  archived?: boolean;
}

export type WorldCategory = "Place" | "Faction" | "Lore" | "Event";
export interface WorldEntry {
  id: string;
  cat: WorldCategory;
  name: string;
  desc: string;
  notes: string;
  refs: PinnedRef[];
  /** Retired from the world list; existing chapter references are kept. */
  archived?: boolean;
}

export type BookStatus = "drafting" | "planned" | "idea";

/** A project that is not a book. See `StoryDoc.form`. */
export type ProjectForm = "piece";
/** What a single piece is. See `StoryDoc.kind`. */
export type PieceKind = "story" | "essay" | "poem" | "other";
/** What an expanded piece became. See `StoryDoc.grownInto`. */
export type GrownInto = "work" | "collection";
/** The change of form a saved copy was taken before. */
export type SavedCopyReason = "expand" | "collapse" | "series" | "merge";
export interface SavedCopyInfo {
  reason: SavedCopyReason;
  /** ISO 8601. */
  savedAt: string;
  /** The project it was copied from, for "saved from …" wording. */
  fromId: string;
}

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
  /**
   * Words in this chapter. Historically hand-typed and meaning *planned*; once
   * the chapter has prose it is a **cache of the real count**, recomputed from
   * `manuscript` and written back. Deliberately still a stored field — eight
   * places read it (board, rail, toolbar, series map, export header, markdown
   * export, importer), and deriving at those call sites instead would put a
   * manuscript scan inside every render.
   */
  words: number;
  /**
   * The hand-set goal for this chapter, kept apart from `words` because that
   * field used to mean *planned* — the AI import prompt literally says "estimate
   * from scene length" — and auto-updating it would silently redefine it as
   * *actual*. The gap between the two is the most motivating number a planning
   * tool can show, so it is worth the extra field. Absent until set; the first
   * time real prose appears, an existing hand-typed `words` is promoted here.
   */
  target?: number;
  /** Board position. */
  x: number;
  y: number;
  /** Slight rotation applied by auto-arrange for a hand-laid feel. */
  rot?: number;
  /** Character ids appearing in this chapter. */
  chars: string[];
  /** World-entry ids referenced in this chapter. */
  worldRefs?: string[];
  /**
   * The chapter's prose, as markdown — one string, **not divided by the
   * scenes**. An earlier design separated them with `***` thematic breaks and
   * kept prose and beats in step; it was dropped, because the app *seeded*
   * those breaks and a fresh nine-scene chapter opened on eight rows of `***`
   * with nothing between them. So a `***` here is a plain thematic break
   * meaning nothing more than it says, a chapter may hold any number of them or
   * none, and adding, deleting or reordering a beat leaves every word where it
   * is. See docs/SPECS.md §4 ("The beats are a guide, not a structure") — and
   * do not reintroduce the coupling without reading it first.
   *
   * Absent until the chapter is written in. Optional on purpose: that is what
   * every existing document already has, so this field needs no
   * `SCHEMA_VERSION` bump and is not a cross-app event — it rides through the
   * Android app's unknown-key passthrough untouched (SPECS.md §6).
   */
  manuscript?: string;
  /** Scene beats, in order. */
  scenes: string[];
  /**
   * Link type between scene i and i+1 (length = scenes.length - 1).
   *
   * Positional: a link is the *gap* between two adjacent scenes, never a
   * property of either scene, so moving a scene never carries its links along.
   * A missing entry reads as `"none"` — an unlabeled seam, not a causal one.
   */
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
  /**
   * Who wrote it. Used only by the standard-manuscript-format export, which
   * needs a name for the title block and the running header — nothing else in
   * the app reads it, and no name is invented when it is absent. Optional, so
   * every existing document already has the shape; no `SCHEMA_VERSION` bump.
   */
  author?: string;
  seriesMode: boolean;

  /**
   * The project's form, when it is not a book. `"piece"` is a **single piece**:
   * one work with no chapters (a short story, an essay, a poem). Absent means a
   * book, or a series when `seriesMode` is on — which is every document written
   * before single pieces existed, so the field is optional and needs no
   * `SCHEMA_VERSION` bump. The Android app keeps it through its top-level
   * unknown-key passthrough, and shows a piece as a book with one chapter.
   *
   * **A piece is still one chapter underneath.** Its scenes, prose, cast, pins
   * and versions live on `chapters[0]` exactly as a chapter's do, so every
   * feature a chapter has, a piece has, and turning one into the other moves
   * nothing. See `lib/piece.ts`.
   */
  form?: ProjectForm;
  /**
   * What kind of writing this is. A label: it changes what the parts are
   * called (scenes, sections, stanzas) and a few defaults, never which
   * features exist. Kept when a piece is expanded into a book, so a poem that
   * grows keeps calling its parts stanzas. Absent means a story.
   */
  kind?: PieceKind;
  /**
   * What an expanded piece grew into, asked when it expands: one longer work
   * (a novel, a long poem) or a collection. A label only, read by `formLabel`.
   */
  grownInto?: GrownInto;
  /**
   * Keep single line breaks in the prose as typed, instead of joining them into
   * the paragraph the way markdown does. On by default for a poem. Applies to
   * the reading view and every manuscript export.
   */
  keepLineBreaks?: boolean;
  /**
   * Set only on a **saved copy**: the project as it was just before it changed
   * form, kept so the change can be walked back by opening the copy. A saved
   * copy lives in the projects library like any project, but is listed apart
   * and is never the one being worked on. Opening it clears this field.
   */
  savedCopy?: SavedCopyInfo;

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
