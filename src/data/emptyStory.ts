import { MAIN_DRAFT_ID, SCHEMA_VERSION, type StoryDoc } from "@/types";

/** A blank project: one empty book, no chapters. Used by "Start fresh". */
export function emptyStory(): StoryDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `story-${Date.now().toString(36)}`,
    projectTitle: "Untitled Story",
    seriesMode: false,
    drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
    activeDraftId: MAIN_DRAFT_ID,
    characters: [],
    world: [],
    assets: [],
    books: [
      {
        id: "book-1",
        title: "Untitled Book",
        subtitle: "Book One",
        status: "drafting",
        premise: "",
        arc: "",
        notes: "",
        x: 80,
        y: 90,
      },
    ],
    bookLinks: [],
    activeBookId: "book-1",
    chapters: [],
    links: [],
    storyNotes: "",
    bookData: {},
  };
}
