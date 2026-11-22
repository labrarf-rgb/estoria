import { relationshipFieldsAmong, unionRelationshipFields } from "@/lib/relationships";
import { reconcileIncoming } from "@/lib/join";
import type { Chapter, PaceCell, PaceLog, PieceKind, StoryDoc, VersionData } from "@/types";
import { emptyStory } from "@/data/emptyStory";
import { uid } from "@/lib/ids";
import { partNouns } from "@/lib/piece";

/**
 * Anthologies: a standalone book whose chapters are **pieces** that keep their
 * own form (docs/PLAN-anthology.md).
 *
 * The same trick as a single piece (`lib/piece.ts`): underneath, each piece is
 * still a chapter, so it already has scenes, prose, cast, world, pins, notes,
 * status, target and per-version forks. What an anthology adds is three
 * optional chapter fields, read only while `form === "anthology"`:
 *
 * - `kind` and `keepLineBreaks`, so a poem keeps its stanzas and line breaks
 *   beside a story that keeps its scenes and paragraphs;
 * - `section`, the heading the piece sits under, set on every piece of the
 *   section (a section is a run of consecutive pieces sharing the name).
 *
 * Order is `num`, as board order is in a book. Acts, chapter numbers, chapter
 * links and board positions stay in the file and are simply not shown.
 *
 * **An ordinary book never reads these fields** (every lookup below falls back
 * to the project's own setting when the doc is not an anthology), which is what
 * keeps a regular book exactly as it was (PLAN §4.8).
 */

export const isAnthology = (doc: Pick<StoryDoc, "form">): boolean => doc.form === "anthology";

/** A standalone book, which is what can become an anthology. */
export const canMakeAnthology = (doc: StoryDoc): boolean => !doc.form && !doc.seriesMode;

// ---- per-piece lookups --------------------------------------------------------

/** This piece's kind: its own in an anthology, the project's anywhere else. */
export function pieceKind(doc: Pick<StoryDoc, "form" | "kind">, ch: Pick<Chapter, "kind"> | undefined): PieceKind {
  if (isAnthology(doc) && ch?.kind) return ch.kind;
  return doc.kind ?? "story";
}

/** Whether this piece keeps single line breaks. */
export function pieceLineBreaks(
  doc: Pick<StoryDoc, "form" | "keepLineBreaks">,
  ch: Pick<Chapter, "keepLineBreaks"> | undefined
): boolean {
  if (isAnthology(doc) && typeof ch?.keepLineBreaks === "boolean") return ch.keepLineBreaks;
  return !!doc.keepLineBreaks;
}

/** What this piece's parts are called: stanzas for a poem, scenes for a story. */
export const pieceNouns = (doc: Pick<StoryDoc, "form" | "kind">, ch: Pick<Chapter, "kind"> | undefined) =>
  partNouns({ kind: pieceKind(doc, ch) });

// ---- order and sections ---------------------------------------------------------

export const inOrder = (chs: Chapter[]): Chapter[] => [...chs].sort((a, b) => a.num - b.num);

/** Numbers 1..n in the order given. Returns the same objects where nothing changed. */
export const renumber = (chs: Chapter[]): Chapter[] =>
  chs.map((c, i) => (c.num === i + 1 ? c : { ...c, num: i + 1 }));

const sec = (c: Pick<Chapter, "section">): string => c.section?.trim() ?? "";

export interface Band {
  /** The heading, or "" for pieces before the first section. */
  section: string;
  pieces: Chapter[];
}

/** The pieces in order, grouped into runs that share a section. */
export function bands(chs: Chapter[]): Band[] {
  const out: Band[] = [];
  for (const c of inOrder(chs)) {
    const s = sec(c);
    const last = out[out.length - 1];
    if (last && last.section === s) last.pieces.push(c);
    else out.push({ section: s, pieces: [c] });
  }
  return out;
}

/** Every section name, in order, once each. */
export const sectionNames = (chs: Chapter[]): string[] => [
  ...new Set(bands(chs).map((b) => b.section).filter(Boolean)),
];

/** Where a new piece in `section` goes: after that section's last piece, or at the end. */
function endOfSection(ordered: Chapter[], section: string): number {
  let at = -1;
  ordered.forEach((c, i) => {
    if (sec(c) === section) at = i + 1;
  });
  return at < 0 ? ordered.length : at;
}

/** Add a piece at the end of its section (or of the anthology), renumbered. */
export function insertPiece(chs: Chapter[], piece: Chapter): Chapter[] {
  const ordered = inOrder(chs);
  ordered.splice(endOfSection(ordered, sec(piece)), 0, piece);
  return renumber(ordered);
}

/**
 * Move a piece. Dropped on another piece it lands before or after it and joins
 * that piece's section; dropped on a section's empty space (`targetId` null) it
 * goes to the end of `section`.
 */
export function movePiece(
  chs: Chapter[],
  id: string,
  targetId: string | null,
  after: boolean,
  section: string
): Chapter[] {
  return movePieces(chs, [id], targetId, after, section);
}

/**
 * Move several pieces as one block, keeping the order they are in now. The
 * same drop rules as `movePiece`; a drop onto one of the moving pieces lands
 * the block at the end of that piece's section.
 */
export function movePieces(
  chs: Chapter[],
  ids: string[],
  targetId: string | null,
  after: boolean,
  section: string
): Chapter[] {
  const moving = new Set(ids);
  const ordered = inOrder(chs);
  const block = ordered.filter((c) => moving.has(c.id));
  if (!block.length) return chs;
  const onSelf = targetId !== null && moving.has(targetId);
  const target = targetId && !onSelf ? ordered.find((c) => c.id === targetId) : undefined;
  const name = target ? sec(target) : onSelf ? sec(ordered.find((c) => c.id === targetId)!) : section.trim();
  const rest = ordered.filter((c) => !moving.has(c.id));
  const placed = block.map((c) => ({ ...c, section: name || undefined }));
  let at = target ? rest.indexOf(target) + (after ? 1 : 0) : endOfSection(rest, name);
  if (at < 0) at = rest.length;
  rest.splice(at, 0, ...placed);
  return renumber(rest);
}

/**
 * The first section of an anthology: the pieces already there become `first`,
 * rather than being left in a band with no heading. Only when nothing has a
 * section yet; otherwise returns `chs` unchanged.
 */
export function startSections(chs: Chapter[], first: string): Chapter[] {
  if (!chs.length || chs.some((c) => sec(c))) return chs;
  return chs.map((c) => ({ ...c, section: first }));
}

/** Rename a section: every piece under it. A clash with another name is refused. */
export function renameSection(chs: Chapter[], from: string, to: string): Chapter[] {
  const name = to.trim();
  if (!name || name === from || sectionNames(chs).includes(name)) return chs;
  return chs.map((c) => (sec(c) === from ? { ...c, section: name } : c));
}

/** Swap a section with its neighbour, pieces and all. */
export function moveSection(chs: Chapter[], name: string, dir: -1 | 1): Chapter[] {
  const bs = bands(chs);
  const i = bs.findIndex((b) => b.section === name);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= bs.length) return chs;
  [bs[i], bs[j]] = [bs[j], bs[i]];
  return renumber(bs.flatMap((b) => b.pieces));
}

/**
 * Remove a section heading. Only the heading goes: its pieces join the section
 * above, or, for the first section, the one below (or no section at all).
 */
export function removeSection(chs: Chapter[], name: string): Chapter[] {
  const bs = bands(chs);
  const i = bs.findIndex((b) => b.section === name);
  if (i < 0) return chs;
  const into = (i > 0 ? bs[i - 1].section : bs[i + 1]?.section) ?? "";
  return chs.map((c) => (sec(c) === name ? { ...c, section: into || undefined } : c));
}

// ---- making and unmaking --------------------------------------------------------

/** Every version's board, active one included. */
function mapVersions(doc: StoryDoc, fn: (v: VersionData) => VersionData): StoryDoc {
  const active = fn({ chapters: doc.chapters, links: doc.links, storyNotes: doc.storyNotes });
  return {
    ...doc,
    ...active,
    draftData: Object.fromEntries(Object.entries(doc.draftData).map(([id, v]) => [id, fn(v)])),
  };
}

/** The settings each chapter had from the project, written onto the chapter. */
const asPiece = (doc: StoryDoc) => (c: Chapter): Chapter => ({
  ...c,
  kind: c.kind ?? doc.kind ?? "story",
  keepLineBreaks: typeof c.keepLineBreaks === "boolean" ? c.keepLineBreaks : !!doc.keepLineBreaks,
});

/**
 * A standalone book becomes an anthology: every chapter a piece of the book's
 * kind, with the book's line breaks, in board order. Nothing is joined; acts,
 * links and layout stay in the file, unshown.
 */
export function toAnthology(doc: StoryDoc): StoryDoc {
  const made = mapVersions(doc, (v) => ({ ...v, chapters: renumber(inOrder(v.chapters).map(asPiece(doc))) }));
  return { ...made, form: "anthology" };
}

/**
 * An anthology goes back to being a book. The pieces become numbered chapters
 * again; their own kinds and line breaks stay in the file but a book does not
 * read them, so the book's settings apply to every chapter.
 */
export function fromAnthology(doc: StoryDoc): StoryDoc {
  // Pieces have no board positions of their own (an anthology lays them out in
  // rows), so a book gets a fresh grid in reading order, the same grid a file
  // without positions gets on load.
  const laid = mapVersions(doc, (v) => ({
    ...v,
    chapters: renumber(inOrder(v.chapters)).map((c, i) => ({
      ...c,
      x: 60 + (i % 4) * 316,
      y: 90 + Math.floor(i / 4) * 224,
      rot: undefined,
    })),
  }));
  const { form: _form, ...rest } = laid;
  return rest;
}

/** A blank piece of the given kind, ready to be inserted. */
export function newPieceChapter(kind: PieceKind, section: string): Chapter {
  const name = { story: "Untitled story", essay: "Untitled essay", poem: "Untitled poem", other: "Untitled piece" }[kind];
  return {
    id: uid("c"),
    num: 0,
    act: 1,
    status: "idea",
    title: name,
    summary: "",
    words: 0,
    x: 60,
    y: 90,
    chars: [],
    scenes: [""],
    sceneLinks: [],
    refs: [],
    kind,
    keepLineBreaks: kind === "poem",
    ...(section.trim() ? { section: section.trim() } : {}),
  };
}

// ---- bringing a piece in, taking one out ----------------------------------------

/** The version a project treats as canonical. */
export function mainBoard(doc: StoryDoc): VersionData {
  if (doc.activeDraftId === doc.mainDraftId || !doc.draftData[doc.mainDraftId]) {
    return { chapters: doc.chapters, links: doc.links, storyNotes: doc.storyNotes };
  }
  return doc.draftData[doc.mainDraftId];
}

const dedupeById = <T extends { id: string }>(arr: T[]): T[] => {
  const seen = new Set<string>();
  return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

/**
 * Add another log's writing days into this one: the two projects' words were
 * written separately, so a day's cells add up rather than the newer one winning
 * (`unionPace` is for two copies of one log). Summed cells are stamped `at`, so
 * they win over any older copy of the anthology's log in a later merge.
 */
export function addPace(into: PaceLog | undefined, from: PaceLog | undefined, at: number): PaceLog | undefined {
  if (!from || !Object.keys(from.days).length) return into;
  const days: PaceLog["days"] = { ...(into?.days ?? {}) };
  for (const [day, cells] of Object.entries(from.days)) {
    const mine: Record<string, PaceCell> = { ...(days[day] ?? {}) };
    for (const [dev, c] of Object.entries(cells)) {
      mine[dev] = mine[dev] ? { n: mine[dev].n + c.n, at } : { n: c.n, at };
    }
    days[day] = mine;
  }
  return { ...(into?.settings ? { settings: into.settings } : {}), days, ...(into?.draft ? { draft: into.draft } : {}) };
}

/**
 * Move a single-piece project into an anthology, as one piece at the end of
 * `section`, in **every** version of the anthology (a piece brought in while
 * viewing a side version would otherwise vanish with that version). Its main
 * version comes in (the rest stay in the saved copy the caller takes first).
 *
 * Its characters, world entries, library and relationships are added the way
 * Merge into a series adds them, after `reconcileIncoming`: a record with the
 * same id as one here but different content comes in as a second record with
 * a fresh id, so neither version is lost. Its Story notes go into the piece's
 * own notes, which travel with it. Its Pace days add into the anthology's.
 */
export function bringIn(anth: StoryDoc, incoming: StoryDoc, section: string, at = Date.now()): StoryDoc {
  const { source } = reconcileIncoming(anth, incoming);
  const ch = mainBoard(source).chapters[0];
  if (!ch) return anth;
  const projectNotes = source.storyNotes.trim();
  const pieceNotes = (ch.notes ?? "").trim();
  const notes =
    projectNotes && projectNotes !== pieceNotes
      ? [pieceNotes, `From the project's notes:\n${projectNotes}`].filter(Boolean).join("\n\n")
      : ch.notes;
  const piece: Chapter = {
    ...ch,
    ...(notes !== undefined ? { notes } : {}),
    // A fresh id: a piece taken out by copy and brought back would otherwise
    // share its id with the one still here.
    id: uid("c"),
    num: 0,
    act: 1,
    title: source.projectTitle.trim() || ch.title,
    kind: source.kind ?? "story",
    keepLineBreaks: !!source.keepLineBreaks,
  };
  if (section.trim()) piece.section = section.trim();
  else delete piece.section;
  const pace = addPace(anth.pace, source.pace, at);
  const placed = mapVersions(anth, (v) => ({ ...v, chapters: insertPiece(v.chapters, piece) }));
  return {
    ...placed,
    characters: dedupeById(anth.characters.concat(source.characters)),
    world: dedupeById(anth.world.concat(source.world)),
    assets: dedupeById(anth.assets.concat(source.assets)),
    ...unionRelationshipFields(anth, source),
    ...(pace ? { pace } : {}),
  };
}

/**
 * A piece leaves the anthology: from **every** version, renumbered, with any
 * chapter links that touched it (hidden in an anthology, but a book made from
 * it later would show a broken chain). Used by "Move it out".
 */
export function removePiece(anth: StoryDoc, chId: string): StoryDoc {
  return mapVersions(anth, (v) =>
    // A version where it is the only piece keeps it: no board is ever left empty.
    v.chapters.length > 1 && v.chapters.some((c) => c.id === chId)
      ? {
          ...v,
          chapters: renumber(inOrder(v.chapters.filter((c) => c.id !== chId))),
          links: v.links.filter((l) => l.fromId !== chId && l.toId !== chId),
        }
      : v
  );
}

/**
 * One piece as its own single-piece project: its writing and map from the
 * version being viewed, its kind and line breaks, notes, status, target, pins,
 * and copies of the characters, world entries and library items it uses. The
 * anthology is not changed here; the caller removes the piece for a move.
 * Pace starts fresh: the anthology's history stays where it was written.
 */
export function takeOut(anth: StoryDoc, chId: string): StoryDoc | null {
  const ch = anth.chapters.find((c) => c.id === chId);
  if (!ch) return null;
  const kind = pieceKind(anth, ch);
  const keep = pieceLineBreaks(anth, ch);
  const { kind: _k, keepLineBreaks: _l, section: _s, ...rest } = ch;
  const title = ch.title.trim() || "Untitled piece";
  const base = emptyStory();
  const world = anth.world.filter((w) => (ch.worldRefs ?? []).includes(w.id));
  const assetIds = new Set([...ch.refs.map((r) => r.assetId), ...world.flatMap((w) => w.refs.map((r) => r.assetId))]);
  return {
    ...base,
    id: uid("story"),
    projectTitle: title,
    ...(anth.author ? { author: anth.author } : {}),
    ...(anth.authorContact ? { authorContact: anth.authorContact } : {}),
    form: "piece",
    kind,
    ...(keep ? { keepLineBreaks: true } : {}),
    books: base.books.map((b) => ({ ...b, title })),
    characters: anth.characters.filter((c) => ch.chars.includes(c.id)),
    // The relationships among the piece's own cast come along, with the kinds.
    ...relationshipFieldsAmong(anth, new Set(ch.chars)),
    world,
    assets: anth.assets.filter((a) => assetIds.has(a.id)),
    chapters: [{ ...rest, num: 1, act: 1, x: 60, y: 90, sceneLinks: rest.sceneLinks.map(() => "none" as const) }],
  };
}

/** The single-piece projects in a library, which are what can be brought in. */
export const canBringIn = (doc: StoryDoc): boolean => doc.form === "piece" && !doc.savedCopy;
