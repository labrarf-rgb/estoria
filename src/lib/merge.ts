import type {
  Asset,
  BookData,
  Chapter,
  ChapterLink,
  Character,
  DraftVersion,
  StoryDoc,
  VersionData,
  WorldEntry,
} from "@/types";
import { MAIN_DRAFT_ID } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import type { DiffItem, DocDiff, Side } from "@/lib/sync";

/**
 * Per-entity conflict merge — the "later evolution" the Cross-app Sync contract
 * left open (docs/SPECS.md §8, "Conflicts (v1)").
 *
 * A merge is the local copy with individual units swapped for the file's. Every
 * unit is one entry in the `DocDiff` the conflict dialog is already showing, so
 * a choice is `{ [addressKey]: "mine" | "theirs" }` and an absent key means
 * "mine". Choosing nothing therefore reproduces keep-mine exactly, which is what
 * makes the merge safe to default into.
 *
 * Two rules do the real work:
 *
 * 1. **Boards are addressed by book, not by slot.** The active book's board sits
 *    at the top level and every other book's is stashed in `bookData` — and the
 *    two copies can disagree about which book is active. So a merge pulls both
 *    documents apart into per-book boards, applies the choices there, and only
 *    then decides which book ends up on top.
 * 2. **References are closed over.** Keep a chapter from the file and it may cast
 *    a character this copy has never seen. Rather than write a dangling id (the
 *    bug class SPECS §9 item 5 records), the record it points at is brought in
 *    too, and `MergeResult.carried` names every one so the user is told before
 *    they commit rather than after.
 */

// ---- Per-book boards ----------------------------------------------------------------

interface BookVersions {
  drafts: DraftVersion[];
  mainDraftId: string;
  draftData: Record<string, VersionData>;
}

interface Boards {
  chapters: Map<string, Chapter[]>;
  links: Map<string, ChapterLink[]>;
  notes: Map<string, string>;
  versions: Map<string, BookVersions>;
  activeDraftId: Map<string, string>;
}

/** An untouched board for a book that arrived without one. */
function emptyBoard(): BookData {
  return {
    chapters: [],
    links: [],
    storyNotes: "",
    drafts: [{ id: MAIN_DRAFT_ID, name: "Main draft" }],
    activeDraftId: MAIN_DRAFT_ID,
    mainDraftId: MAIN_DRAFT_ID,
    draftData: {},
  };
}

/** Pull a document apart into one board per book, wherever that board lived. */
function boardsOf(doc: StoryDoc): Boards {
  const b: Boards = {
    chapters: new Map(),
    links: new Map(),
    notes: new Map(),
    versions: new Map(),
    activeDraftId: new Map(),
  };
  const put = (id: string, board: Omit<BookData, "activeDraftId"> & { activeDraftId: string }) => {
    if (b.chapters.has(id)) return; // the active book wins over a stale stash
    b.chapters.set(id, board.chapters);
    b.links.set(id, board.links);
    b.notes.set(id, board.storyNotes);
    b.versions.set(id, {
      drafts: board.drafts,
      mainDraftId: board.mainDraftId,
      draftData: board.draftData,
    });
    b.activeDraftId.set(id, board.activeDraftId);
  };
  put(doc.activeBookId, {
    chapters: doc.chapters,
    links: doc.links,
    storyNotes: doc.storyNotes,
    drafts: doc.drafts,
    activeDraftId: doc.activeDraftId,
    mainDraftId: doc.mainDraftId,
    draftData: doc.draftData,
  });
  for (const [id, bk] of Object.entries(doc.bookData)) put(id, bk);
  return b;
}

/** Put the boards back together, with `activeBookId` deciding what sits on top. */
function recompose(shell: StoryDoc, boards: Boards, activeBookId: string): StoryDoc {
  const board = (id: string) => ({
    chapters: boards.chapters.get(id) ?? [],
    links: boards.links.get(id) ?? [],
    storyNotes: boards.notes.get(id) ?? "",
    ...(boards.versions.get(id) ?? {
      drafts: emptyBoard().drafts,
      mainDraftId: MAIN_DRAFT_ID,
      draftData: {},
    }),
    activeDraftId: boards.activeDraftId.get(id) ?? MAIN_DRAFT_ID,
  });

  const active = board(activeBookId);
  const bookData: Record<string, BookData> = {};
  // Every book that isn't on top keeps its board stashed. Boards whose book
  // record was dropped are kept too: they are inert without a `BookMeta`, and
  // discarding them would silently delete chapters along with a checkbox.
  for (const id of boards.chapters.keys()) {
    if (id === activeBookId) continue;
    bookData[id] = board(id);
  }

  return {
    ...shell,
    activeBookId,
    chapters: active.chapters,
    links: active.links,
    storyNotes: active.storyNotes,
    drafts: active.drafts,
    activeDraftId: active.activeDraftId,
    mainDraftId: active.mainDraftId,
    draftData: active.draftData,
    bookData,
  };
}

// ---- Choices -------------------------------------------------------------------------

/** Which side each addressable difference is taken from. Absent = `"mine"`. */
export type MergeChoices = Record<string, Side>;

/** A record brought in so a kept entity's reference doesn't dangle. */
export interface CarriedRef {
  kind: "character" | "world entry" | "shared asset";
  name: string;
}

export interface MergeResult {
  doc: StoryDoc;
  /** Records pulled in to keep references whole. */
  carried: CarriedRef[];
  /** How many units the user took from the file. */
  fromFile: number;
}

const sideOf = (choices: MergeChoices, item: DiffItem): Side => choices[item.key] ?? "mine";

/** Replace or append `rec` in a list matched by id, preserving existing order. */
function upsert<T extends { id: string }>(list: T[], rec: T): T[] {
  const i = list.findIndex((x) => x.id === rec.id);
  if (i === -1) return [...list, rec];
  const out = list.slice();
  out[i] = rec;
  return out;
}

const removeById = <T extends { id: string }>(list: T[], id: string): T[] =>
  list.filter((x) => x.id !== id);

// ---- The merge -----------------------------------------------------------------------

/**
 * Build the merged project from a set of per-unit side choices.
 *
 * Pure and cheap enough to run on every toggle, so the dialog can show the real
 * consequences (including `carried`) before anything is written. The result is
 * put through `normalizeDoc`, so a merge can never produce a document the app
 * wouldn't accept from a file.
 */
export function mergeDocs(
  mine: StoryDoc,
  theirs: StoryDoc,
  diff: DocDiff,
  choices: MergeChoices
): MergeResult {
  const mineBoards = boardsOf(mine);
  const theirsBoards = boardsOf(theirs);

  // Start as a copy of the local document, then swap in what was chosen.
  const boards: Boards = {
    chapters: new Map(mineBoards.chapters),
    links: new Map(mineBoards.links),
    notes: new Map(mineBoards.notes),
    versions: new Map(mineBoards.versions),
    activeDraftId: new Map(mineBoards.activeDraftId),
  };
  let characters = mine.characters;
  let world = mine.world;
  let assets = mine.assets;
  let books = mine.books;
  let projectTitle = mine.projectTitle;
  let author = mine.author;
  let bookLinks = mine.bookLinks;
  let seriesMode = mine.seriesMode;
  let activeBookId = mine.activeBookId;
  let fromFile = 0;

  for (const section of diff.sections) {
    for (const item of section.items) {
      if (sideOf(choices, item) !== "theirs") continue;
      fromFile++;
      const a = item.addr;

      if (a.kind === "chapter") {
        const from = theirsBoards.chapters.get(a.bookId) ?? [];
        const into = boards.chapters.get(a.bookId) ?? [];
        const incoming = from.find((c) => c.id === a.id);
        boards.chapters.set(
          a.bookId,
          incoming ? upsert(into, incoming) : removeById(into, a.id)
        );
        continue;
      }

      if (a.kind === "character" || a.kind === "world" || a.kind === "asset" || a.kind === "book") {
        const pools = {
          character: [theirs.characters, characters] as const,
          world: [theirs.world, world] as const,
          asset: [theirs.assets, assets] as const,
          book: [theirs.books, books] as const,
        };
        const [source, current] = pools[a.kind];
        const incoming = (source as Array<{ id: string }>).find((x) => x.id === a.id);
        const next = incoming
          ? upsert(current as Array<{ id: string }>, incoming)
          : removeById(current as Array<{ id: string }>, a.id);
        if (a.kind === "character") characters = next as Character[];
        else if (a.kind === "world") world = next as WorldEntry[];
        else if (a.kind === "asset") assets = next as Asset[];
        else books = next as StoryDoc["books"];
        continue;
      }

      switch (a.unit) {
        case "title":
          projectTitle = theirs.projectTitle;
          break;
        case "author":
          author = theirs.author;
          break;
        case "storyNotes":
          for (const [id, text] of theirsBoards.notes) boards.notes.set(id, text);
          break;
        case "connections":
          for (const [id, links] of theirsBoards.links) boards.links.set(id, links);
          break;
        case "versions":
          for (const [id, v] of theirsBoards.versions) boards.versions.set(id, v);
          break;
        case "seriesMap":
          bookLinks = theirs.bookLinks;
          break;
        case "view":
          seriesMode = theirs.seriesMode;
          activeBookId = theirs.activeBookId;
          for (const [id, draftId] of theirsBoards.activeDraftId) {
            boards.activeDraftId.set(id, draftId);
          }
          break;
      }
    }
  }

  // A board only exists for books one side had; make sure every kept book has one.
  for (const b of books) {
    if (boards.chapters.has(b.id)) continue;
    const seed = emptyBoard();
    boards.chapters.set(b.id, seed.chapters);
    boards.links.set(b.id, seed.links);
    boards.notes.set(b.id, seed.storyNotes);
    boards.versions.set(b.id, {
      drafts: seed.drafts,
      mainDraftId: seed.mainDraftId,
      draftData: seed.draftData,
    });
    boards.activeDraftId.set(b.id, seed.activeDraftId);
  }
  // The book on top must be one the merge actually kept.
  if (!books.some((b) => b.id === activeBookId)) {
    activeBookId = books[0]?.id ?? mine.activeBookId;
  }

  // ---- Close over references -------------------------------------------------------
  const carried: CarriedRef[] = [];
  /** First pool that has the record wins — this copy's version is preferred. */
  const pickFrom = <T extends { id: string }>(id: string, ...pools: T[][]): T | undefined => {
    for (const pool of pools) {
      const found = pool.find((r) => r.id === id);
      if (found) return found;
    }
    return undefined;
  };

  const needChar = new Set<string>();
  const needWorld = new Set<string>();
  const needAsset = new Set<string>();
  const chapters: Chapter[] = [
    ...[...boards.chapters.values()].flat(),
    ...[...boards.versions.values()].flatMap((v) =>
      Object.values(v.draftData).flatMap((d) => d.chapters)
    ),
  ];
  for (const c of chapters) {
    for (const id of c.chars) needChar.add(id);
    for (const id of c.worldRefs ?? []) needWorld.add(id);
    for (const r of c.refs) needAsset.add(r.assetId);
  }
  for (const w of world) for (const r of w.refs) needAsset.add(r.assetId);

  for (const id of needChar) {
    if (characters.some((c) => c.id === id)) continue;
    const rec = pickFrom(id, mine.characters, theirs.characters);
    if (!rec) continue; // the id points at nothing on either side; normalize drops it
    characters = [...characters, rec];
    carried.push({ kind: "character", name: rec.name || "Unnamed" });
  }
  for (const id of needWorld) {
    if (world.some((w) => w.id === id)) continue;
    const rec = pickFrom(id, mine.world, theirs.world);
    if (!rec) continue;
    world = [...world, rec];
    carried.push({ kind: "world entry", name: rec.name || "Untitled" });
  }
  // World entries brought in above can themselves pin assets.
  for (const w of world) for (const r of w.refs) needAsset.add(r.assetId);
  for (const id of needAsset) {
    if (assets.some((a) => a.id === id)) continue;
    const rec = pickFrom(id, mine.assets, theirs.assets);
    if (!rec) continue;
    assets = [...assets, rec];
    carried.push({ kind: "shared asset", name: rec.label || "Untitled" });
  }

  const shell: StoryDoc = {
    ...mine,
    projectTitle,
    ...(author ? { author } : {}),
    seriesMode,
    characters,
    world,
    assets,
    books,
    bookLinks,
  };
  if (!author) delete shell.author;

  return { doc: normalizeDoc(recompose(shell, boards, activeBookId)), carried, fromFile };
}
