import { MAIN_DRAFT_ID, type Chapter } from "@/types";

/** Resolve a chapter's title for the active draft, falling back to the base. */
export function resolveTitle(c: Chapter, draftId: string): string {
  if (draftId !== MAIN_DRAFT_ID && c.overrides?.[draftId]?.title != null) {
    return c.overrides[draftId].title!;
  }
  return c.title;
}

/** Resolve a chapter's summary for the active draft (no scene fallback). */
export function resolveSummary(c: Chapter, draftId: string): string {
  if (draftId !== MAIN_DRAFT_ID && c.overrides?.[draftId]?.summary != null) {
    return c.overrides[draftId].summary!;
  }
  return c.summary ?? "";
}

/** Summary for display, falling back to the first scene when empty. */
export function displaySummary(c: Chapter, draftId: string): string {
  return resolveSummary(c, draftId) || c.scenes[0] || "";
}
