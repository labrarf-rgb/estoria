import {
  type Chapter,
  type ChapterStatus,
  type GrownInto,
  type PieceKind,
  type PinnedRef,
  type SavedCopyReason,
  type StoryDoc,
  type VersionData,
} from "@/types";
import { emptyStory } from "@/data/emptyStory";
import { uid } from "@/lib/ids";

/**
 * Single pieces, and the three changes of form between a piece, a book and a
 * series.
 *
 * **A piece is one chapter that is never shown as a chapter.** Everything a
 * chapter has (scenes, prose, cast, world, pins, versions, word counts) a piece
 * has, for free, because it is one. The difference is presentation: no board,
 * no chapter numbers, no acts, and connectors that are plain lines. That is
 * why expanding a piece into a book moves nothing, and why this file is mostly
 * labels and the one genuinely lossy operation, collapsing a book into a piece.
 *
 * **Every change of form saves a copy first** (`makeSavedCopy`). The copy is a
 * separate project, listed apart from the working ones, and opening it is how a
 * change is walked back. Nothing stays linked to its copy, so no change ever
 * blocks another.
 */

export interface KindInfo {
  kind: PieceKind;
  label: string;
  /** What one part is called, lower case: "scene", "section", "stanza", "part". */
  one: string;
  many: string;
  /** The "growing it into" choices offered when a piece of this kind expands. */
  grow: Record<GrownInto, { label: string; hint: string; tag: string }>;
}

export const KINDS: KindInfo[] = [
  {
    kind: "story",
    label: "Short story",
    one: "scene",
    many: "scenes",
    grow: {
      work: { label: "One longer work", hint: "A novella or a novel", tag: "Novel" },
      collection: { label: "A collection", hint: "A story collection", tag: "Story collection" },
    },
  },
  {
    kind: "essay",
    label: "Essay",
    one: "section",
    many: "sections",
    grow: {
      work: { label: "One longer work", hint: "A long essay or a book", tag: "Long essay" },
      collection: { label: "A collection", hint: "An essay collection", tag: "Essay collection" },
    },
  },
  {
    kind: "poem",
    label: "Poem",
    one: "stanza",
    many: "stanzas",
    grow: {
      work: { label: "One longer work", hint: "A long poem", tag: "Long poem" },
      collection: { label: "A collection", hint: "A poetry collection", tag: "Poetry collection" },
    },
  },
  {
    kind: "other",
    label: "Other",
    one: "part",
    many: "parts",
    grow: {
      work: { label: "One longer work", hint: "A book", tag: "Book" },
      collection: { label: "A collection", hint: "A collection of pieces", tag: "Collection" },
    },
  },
];

export const kindInfo = (kind: PieceKind | undefined): KindInfo =>
  KINDS.find((k) => k.kind === (kind ?? "story")) ?? KINDS[0];

export const isPiece = (doc: Pick<StoryDoc, "form">): boolean => doc.form === "piece";

/**
 * What the parts of this project are called. A book with no kind keeps calling
 * them scenes, exactly as before single pieces existed; a book expanded from a
 * poem keeps calling them stanzas.
 */
export function partNouns(doc: Pick<StoryDoc, "kind">): { one: string; many: string; One: string; Many: string } {
  const k = kindInfo(doc.kind);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { one: k.one, many: k.many, One: cap(k.one), Many: cap(k.many) };
}

/** "7 scenes", "1 stanza". */
export const countParts = (doc: Pick<StoryDoc, "kind">, n: number): string => {
  const p = partNouns(doc);
  return `${n} ${n === 1 ? p.one : p.many}`;
};

/**
 * The short label a project carries in the projects list and the toolbar, or
 * `null` for an ordinary book that has nothing to add. A piece names its kind
 * ("Other" reads as "Piece"); an expanded piece names what it grew into.
 */
export function formLabel(doc: Pick<StoryDoc, "form" | "kind" | "grownInto">): string | null {
  if (doc.form === "piece") return doc.kind === "other" ? "Piece" : kindInfo(doc.kind).label;
  if (doc.grownInto) return kindInfo(doc.kind).grow[doc.grownInto].tag;
  return null;
}

/** Whether single line breaks in the prose are kept as typed. */
export const keepsLineBreaks = (doc: Pick<StoryDoc, "keepLineBreaks">): boolean => !!doc.keepLineBreaks;

/** A new, empty single piece of the given kind: one blank part, ready to map. */
export function newPiece(kind: PieceKind): StoryDoc {
  const doc = emptyStory();
  // "Untitled Story", not "Untitled Short story": a title, so title case.
  const title = `Untitled ${{ story: "Story", essay: "Essay", poem: "Poem", other: "Piece" }[kind]}`;
  const ch: Chapter = {
    id: uid("c"),
    num: 1,
    act: 1,
    status: "idea",
    title,
    summary: "",
    words: 0,
    x: 60,
    y: 90,
    chars: [],
    scenes: [""],
    sceneLinks: [],
    refs: [],
  };
  return {
    ...doc,
    form: "piece",
    kind,
    keepLineBreaks: kind === "poem" ? true : undefined,
    projectTitle: title,
    books: doc.books.map((b) => ({ ...b, title })),
    chapters: [ch],
  };
}

/** Every version's board, active one included, for transforms that touch all of them. */
function mapVersions(doc: StoryDoc, fn: (v: VersionData) => VersionData): StoryDoc {
  const active = fn({ chapters: doc.chapters, links: doc.links, storyNotes: doc.storyNotes });
  return {
    ...doc,
    ...active,
    draftData: Object.fromEntries(Object.entries(doc.draftData).map(([id, v]) => [id, fn(v)])),
  };
}

// ---- Saved copies --------------------------------------------------------

/**
 * A copy of the project as it is now, taken before it changes form. A new id,
 * so it is its own project; `savedCopy` marks it, which is what lists it apart.
 */
export function makeSavedCopy(doc: StoryDoc, reason: SavedCopyReason): StoryDoc {
  const copy = structuredClone(doc);
  return {
    ...copy,
    id: uid("story"),
    savedCopy: { reason, savedAt: new Date().toISOString(), fromId: doc.id },
  };
}

export const SAVED_REASON: Record<SavedCopyReason, string> = {
  expand: "Before expanding into a book",
  collapse: "Before turning into a single piece",
  series: "Before becoming a series",
  merge: "Before a merge into a series",
};

/** "4 Oct", or "4 Oct 2025" when it isn't this year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// ---- Piece → book ----------------------------------------------------------

/**
 * Expand a piece into a book: the piece becomes Chapter 1, in every version.
 * Nothing moves, because the piece already was that chapter. Its title, which
 * the piece kept on the project, is written onto the chapter. Seams stay
 * unlabeled until the writer labels one; nothing is invented for them.
 */
export function expandToBook(doc: StoryDoc, grownInto: GrownInto): StoryDoc {
  const titled = mapVersions(doc, (v) => ({
    ...v,
    chapters: v.chapters.map((c, i) => (i === 0 ? { ...c, num: 1, title: doc.projectTitle || c.title } : c)),
  }));
  const { form: _form, ...rest } = titled;
  return { ...rest, grownInto };
}

// ---- Book → piece ----------------------------------------------------------

/** What separates one chapter's prose from the next when a book collapses. */
export type ChapterJoin = "break" | "heading" | "none";

const STATUS_RANK: Record<ChapterStatus, number> = { idea: 0, draft: 1, done: 2 };

/** Whether this project can be turned into a single piece: a standalone book only. */
export const canCollapse = (doc: StoryDoc): boolean => !isPiece(doc) && !doc.seriesMode;

/**
 * Collapse one version's chapters into the single chapter a piece is.
 *
 * In board order (`num`). Prose is joined with the chosen separator; scenes run
 * on in one flow, with every seam unlabeled because a piece's connectors are
 * plain; cast, world and pins are everything any chapter used; summaries and
 * chapter notes are gathered into the piece's notes under each chapter title,
 * so none of that writing is lost. Acts, statuses, the board layout and chapter
 * links have no place in a piece and are dropped — the saved copy keeps them.
 */
export function collapseVersion(v: VersionData, title: string, join: ChapterJoin): VersionData {
  const chs = [...v.chapters].sort((a, b) => a.num - b.num);
  if (chs.length === 0) return v;
  const name = (c: Chapter) => c.title.trim() || `Chapter ${c.num}`;
  const single = chs.length === 1;

  const prose = chs
    .map((c) => {
      const body = (c.manuscript ?? "").trim();
      if (join === "heading" && !single) return body ? `## ${name(c)}\n\n${body}` : `## ${name(c)}`;
      return body;
    })
    .filter(Boolean);
  const manuscript = prose.length
    ? prose.join(join === "break" ? "\n\n***\n\n" : "\n\n")
    : undefined;

  const scenes = chs.flatMap((c) => c.scenes.filter((s) => s.trim()));
  const finalScenes = scenes.length ? scenes : [""];

  const notes = single
    ? chs[0].notes ?? ""
    : chs
        .map((c) => {
          const parts = [c.summary?.trim(), c.notes?.trim()].filter(Boolean);
          return parts.length ? `${name(c)}\n${parts.join("\n\n")}` : "";
        })
        .filter(Boolean)
        .join("\n\n");

  const seenRefs = new Set<string>();
  const refs: PinnedRef[] = [];
  for (const c of chs) {
    for (const r of c.refs) {
      if (seenRefs.has(r.assetId)) continue;
      seenRefs.add(r.assetId);
      refs.push(r);
    }
  }
  const targets = chs.map((c) => c.target).filter((t): t is number => typeof t === "number");
  const status = chs.reduce<ChapterStatus>(
    (lo, c) => (STATUS_RANK[c.status] < STATUS_RANK[lo] ? c.status : lo),
    "done"
  );

  const merged: Chapter = {
    id: chs[0].id,
    num: 1,
    act: 1,
    status,
    title,
    summary: single ? chs[0].summary ?? "" : "",
    notes: notes || undefined,
    words: chs.reduce((n, c) => n + c.words, 0),
    target: targets.length ? targets.reduce((a, b) => a + b, 0) : undefined,
    x: 60,
    y: 90,
    chars: [...new Set(chs.flatMap((c) => c.chars))],
    worldRefs: [...new Set(chs.flatMap((c) => c.worldRefs ?? []))],
    manuscript,
    scenes: finalScenes,
    sceneLinks: new Array(Math.max(0, finalScenes.length - 1)).fill("none"),
    refs,
  };
  return { chapters: [merged], links: [], storyNotes: v.storyNotes };
}

/** Turn a standalone book into a single piece of the given kind, in every version. */
export function collapseToPiece(doc: StoryDoc, kind: PieceKind, join: ChapterJoin): StoryDoc {
  const title = doc.projectTitle;
  const collapsed = mapVersions(doc, (v) => collapseVersion(v, title, join));
  const { grownInto: _grown, ...rest } = collapsed;
  return {
    ...rest,
    form: "piece",
    kind,
    keepLineBreaks: kind === "poem" ? true : doc.keepLineBreaks,
  };
}

/** Every seam unlabeled, which is what a piece's map shows. Used on load, too. */
export function plainSeams(doc: StoryDoc): StoryDoc {
  if (!isPiece(doc)) return doc;
  return mapVersions(doc, (v) => ({
    ...v,
    chapters: v.chapters.map((c) =>
      c.sceneLinks.every((l) => l === "none")
        ? c
        : { ...c, sceneLinks: c.sceneLinks.map(() => "none" as const) }
    ),
  }));
}

/** Book counts for a collapse preview: how many chapters and parts, in the active version. */
export function collapsePreview(doc: StoryDoc): { chapters: number; parts: number } {
  return {
    chapters: doc.chapters.length,
    parts: Math.max(1, doc.chapters.reduce((n, c) => n + c.scenes.filter((s) => s.trim()).length, 0)),
  };
}

