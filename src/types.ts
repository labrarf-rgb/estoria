/**
 * Estoria document model.
 *
 * The entire story is one serializable JSON object (`StoryDoc`). It is what we
 * auto-save to browser storage, what the user exports as a project file, and
 * what a future cloud backend would persist. Keep it plain-data and versioned.
 */

export const SCHEMA_VERSION = 1;

/** Story-causality link type — the "but / therefore / and" method. */
export type ConnType = "therefore" | "but" | "and";

/** A pinned reference on a chapter or world entry. */
export type RefKind = "IMAGE" | "NOTE";
export interface PinnedRef {
  kind: RefKind;
  label: string;
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
export interface SeriesBook {
  id: string;
  title: string;
  subtitle: string;
  status: BookStatus;
  live: boolean;
  premise: string;
  arc: string;
  outline: string[];
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
  words: number;
  /** Board position. */
  x: number;
  y: number;
  /** Slight rotation applied by auto-arrange for a hand-laid feel. */
  rot?: number;
  /** Character ids appearing in this chapter. */
  chars: string[];
  /** Scene beats, in order. */
  scenes: string[];
  /** Link type between scene i and i+1 (length = scenes.length - 1). */
  sceneLinks: ConnType[];
  /** Free positions of scene nodes inside the detail canvas. */
  scenePos?: Vec2[];
  refs: PinnedRef[];
  /** Alternate-draft overrides. */
  altTitle?: string;
  altSummaryFlag?: boolean;
}

/** A connector between two chapters on the board. */
export interface ChapterLink {
  fromId: string;
  toId: string;
  type: ConnType;
  /** Optional alternate-draft type. */
  alt?: ConnType;
}

export interface StoryDoc {
  schemaVersion: number;
  id: string;
  projectTitle: string;
  storyNotes: string;
  seriesMode: boolean;
  activeBook: string;
  characters: Character[];
  world: WorldEntry[];
  series: SeriesBook[];
  chapters: Chapter[];
  links: ChapterLink[];
}
