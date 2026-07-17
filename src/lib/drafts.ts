import type { Chapter, StoryDoc, VersionData } from "@/types";

/**
 * Versions are standalone forks: the active version's board lives at
 * `doc.chapters`/`links`/`storyNotes`, inactive versions are stashed in
 * `doc.draftData`. There is no override layer to resolve — a chapter's
 * `title`/`summary` are always the real text for the version being viewed.
 */

/** Summary for display, falling back to the first scene when empty. */
export function displaySummary(c: Chapter): string {
  return c.summary || c.scenes[0] || "";
}

/** Snapshot the active version's board (by reference — for stashing). */
export function activeVersionData(doc: StoryDoc): VersionData {
  return { chapters: doc.chapters, links: doc.links, storyNotes: doc.storyNotes };
}

/** Deep-copy a version's board so a fork can diverge without sharing state. */
export function cloneVersionData(v: VersionData): VersionData {
  return structuredClone(v);
}
