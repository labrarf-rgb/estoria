import { MAIN_DRAFT_ID, type Chapter, type DraftVersion, type StoryDoc, type VersionData } from "@/types";

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

/**
 * Pin a `mainDraftId` to a version that actually exists. Docs written before
 * the pointer existed have none, and there the seed version *was* main — hence
 * the `MAIN_DRAFT_ID` step. The last fallback only matters for a doc whose
 * pointer names a deleted version.
 */
export function resolveMainDraftId(drafts: DraftVersion[] | undefined, id: string | undefined): string {
  const list = drafts ?? [];
  if (id && list.some((d) => d.id === id)) return id;
  if (list.some((d) => d.id === MAIN_DRAFT_ID)) return MAIN_DRAFT_ID;
  return list[0]?.id ?? MAIN_DRAFT_ID;
}

/** Normalize an incoming document (file open, sync, import) in place of a migration. */
export function withMainDraft(doc: StoryDoc): StoryDoc {
  return {
    ...doc,
    mainDraftId: resolveMainDraftId(doc.drafts, doc.mainDraftId),
    bookData: Object.fromEntries(
      Object.entries(doc.bookData ?? {}).map(([id, b]) => [
        id,
        { ...b, mainDraftId: resolveMainDraftId(b.drafts, b.mainDraftId) },
      ])
    ),
  };
}
