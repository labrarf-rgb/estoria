#!/usr/bin/env node
/**
 * Build a `.estoria.json` at whatever scale you ask for, so the app can be run
 * against a real book collection instead of a few thousand words.
 *
 * The target the scale test is written around (SPECS §9 / the manuscript build
 * brief §8) is **300k words per version, 5 versions, 5 books** — 25 manuscripts,
 * ~7.5M words, roughly 45M characters. Nothing in manuscript mode has ever been
 * run against more than a few thousand.
 *
 *   node scripts/make-fixture.mjs --out /tmp/big.estoria.json
 *   node scripts/make-fixture.mjs --books 1 --versions 1 --words 50000 --out /tmp/small.estoria.json
 *
 * At the full target this writes a file of roughly 100MB and needs a good chunk
 * of heap to do it. If node dies with a heap error, raise it:
 *
 *   node --max-old-space-size=8192 scripts/make-fixture.mjs --out ...
 *
 * **Import it through the normal path** (Projects → Open file…), not by poking
 * at storage: the point is that the at-rest prose split, the word-count cache
 * and the sync fingerprint all see the same document a user would produce. And
 * run it on the isolated port so it never lands in your real browser storage:
 *
 *   npx vite --port 5199 --strictPort
 *
 * The output is deliberately reproducible — same arguments, byte-identical file
 * — so two runs can be compared without the fixture being a variable.
 */

import { writeFileSync } from "node:fs";

// ---- arguments --------------------------------------------------------------

const DEFAULTS = {
  books: 5,
  versions: 5,
  chapters: 30,
  /** Words **per version**, split across its chapters. */
  words: 300_000,
  scenes: 9,
  characters: 24,
  world: 18,
  seed: 20260802,
  out: "fixture.estoria.json",
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (!(key in DEFAULTS)) {
      console.error(`Unknown option --${key}. Known: ${Object.keys(DEFAULTS).join(", ")}`);
      process.exit(1);
    }
    const raw = argv[++i];
    if (raw === undefined) {
      console.error(`--${key} needs a value`);
      process.exit(1);
    }
    out[key] = key === "out" ? raw : Number(raw);
    if (key !== "out" && !Number.isFinite(out[key])) {
      console.error(`--${key} must be a number, got ${raw}`);
      process.exit(1);
    }
  }
  return out;
}

const opt = parseArgs(process.argv.slice(2));

// ---- deterministic randomness ----------------------------------------------

/** mulberry32 — small, fast, and seeded, so a fixture is reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(opt.seed);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// ---- word bank --------------------------------------------------------------

// Ordinary English rather than lorem ipsum: `countWords` strips markdown and
// splits on whitespace, so the words need to behave like words, and prose that
// reads as prose makes the rendered view worth looking at while measuring.
const WORDS = `the a of and to in that it was he she they we you but for with as his her their our not
on at by from up out over under again then once here there all any both each few more most other some
such only own same so than too very can will just should now river light shadow morning winter door
window stone water road field house name voice hand eye face heart word year day night time hour month
letter question answer reason moment silence memory promise story mother father sister brother friend
stranger soldier captain merchant scholar keeper the wind carried salt across the water and no one
spoke first held quiet long enough remember what had been said before turned away toward south where
lamps still burned against grey morning air smelled of rain iron old rope table between them scarred
knife marks older than either could count`
  .split(/\s+/)
  .filter(Boolean);

const NAMES = `Adan Beatriz Caius Delia Ewan Fiora Gareth Halina Ivo Juno Kestrel Lucia Mabon Nerys
Oren Perrin Quillon Rosa Sable Tomas Ulla Vesper Wren Yara Zeno Alma Bram Cora Dain Elis`.split(/\s+/);

const SURNAMES = `Vance Alder Roth Mercer Quill Salter Vane Ashby Coates Drell Frost Garrow Holt
Ives Larkin Moore Nash Orrell Pike Reyes`.split(/\s+/);

const PLACES = `Ashfall Bellmoor Cinderhold Drywater Eastmarch Farrow Greyhaven Hollowmere Ironpost
Juniper Kettle Lowfield Marrowgate Northreach Oldwell Pinehurst Quarry Redbank Stonewatch Thornfield`.split(
  /\s+/
);

// ---- prose ------------------------------------------------------------------

function sentence() {
  const n = between(8, 22);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(WORDS));
  // A little markdown, at roughly the rate real prose carries it — enough that
  // the renderer and the .docx exporter have something to do, not so much that
  // the word count is mostly markup.
  if (rand() < 0.05) {
    const i = between(0, parts.length - 1);
    parts[i] = `**${parts[i]}**`;
  }
  if (rand() < 0.04) {
    const i = between(0, parts.length - 1);
    parts[i] = `*${parts[i]}*`;
  }
  const s = parts.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + pick([".", ".", ".", ".", "?", "!"]);
}

function paragraph() {
  const n = between(3, 7);
  const out = [];
  for (let i = 0; i < n; i++) out.push(sentence());
  return out.join(" ");
}

/**
 * A chapter's prose, to approximately `targetWords`.
 *
 * Built into an array and joined once — concatenating a 60k-character string a
 * paragraph at a time is the kind of quadratic that makes the generator itself
 * the slow part of the exercise.
 */
function manuscript(targetWords, chapterTitle) {
  const parts = [`# ${chapterTitle}`, ""];
  let words = 0;
  let sinceBreak = 0;
  while (words < targetWords) {
    const p = paragraph();
    parts.push(p, "");
    words += p.split(/\s+/).length;
    sinceBreak++;
    // A passage break every so often, which is what a scene change looks like
    // in prose. Nothing inserts these for the user; a real manuscript has them
    // because the writer typed them, so the fixture types them too.
    if (sinceBreak > between(6, 14)) {
      parts.push("***", "");
      sinceBreak = 0;
    }
  }
  return parts.join("\n");
}

/** Scene beats stay under SCENE_TEXT_MAX (200), like the app enforces on input. */
function sceneText() {
  let s = "";
  while (s.length < between(70, 150)) s += (s ? " " : "") + pick(WORDS);
  const who = pick(NAMES);
  const where = pick(PLACES);
  const out = `${who} at ${where}: ${s}`;
  return out.length > 195 ? out.slice(0, 195) : out;
}

// ---- document ---------------------------------------------------------------

const CONN = ["therefore", "but", "and"];
const STATUS = ["idea", "draft", "done"];
const CATS = ["Place", "Faction", "Lore", "Event"];

// Matches the app's scene-canvas grid closely enough to look like a real board.
const SCENE_W = 208;
const SCENE_H = 124;

function makeCharacters(n) {
  const roles = ["Protagonist", "Antagonist", "Ally", "Mentor", "Foil", "Love interest"];
  const types = ["Hero", "Shadow", "Trickster", "Herald", "Threshold guardian", "Shapeshifter"];
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = `${NAMES[i % NAMES.length]} ${SURNAMES[i % SURNAMES.length]}`;
    out.push({
      id: `char-${i}`,
      name,
      role: roles[i % roles.length],
      type: types[i % types.length],
      initials: name
        .split(" ")
        .map((w) => w[0])
        .join(""),
      color: `oklch(0.7 0.14 ${(i * 37) % 360})`,
      desc: paragraph(),
      bio: paragraph(),
      traits: [pick(WORDS), pick(WORDS), pick(WORDS)],
      goals: [sentence()],
      motivations: sentence(),
      want: sentence(),
      need: sentence(),
      notes: "",
    });
  }
  return out;
}

function makeWorld(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `world-${i}`,
      cat: CATS[i % CATS.length],
      name: PLACES[i % PLACES.length] + (i >= PLACES.length ? ` ${Math.floor(i / PLACES.length)}` : ""),
      desc: paragraph(),
      notes: sentence(),
      refs: [],
    });
  }
  return out;
}

function makeChapters(bookIdx, versionIdx, charIds, worldIds) {
  const perChapter = Math.max(1, Math.round(opt.words / opt.chapters));
  const chapters = [];
  for (let c = 0; c < opt.chapters; c++) {
    const id = `b${bookIdx}-v${versionIdx}-ch${c}`;
    const title = `${pick(["The", "A", "Of"])} ${pick(WORDS)} ${pick(WORDS)}`.replace(/\b\w/g, (m) =>
      m.toUpperCase()
    );
    const scenes = [];
    for (let s = 0; s < opt.scenes; s++) scenes.push(sceneText());
    const sceneLinks = [];
    for (let s = 0; s < scenes.length - 1; s++) sceneLinks.push(pick(CONN));
    const scenePos = scenes.map((_, s) => ({
      x: 20 + (s % 4) * (SCENE_W + 28),
      y: 20 + Math.floor(s / 4) * (SCENE_H + 34),
    }));
    const text = manuscript(perChapter, title);
    chapters.push({
      id,
      num: c + 1,
      act: Math.min(3, Math.floor((c / opt.chapters) * 3) + 1),
      status: STATUS[c % STATUS.length],
      title,
      summary: sentence(),
      notes: rand() < 0.3 ? paragraph() : undefined,
      // Counted the way the app counts: markdown stripped, `***` ignored.
      words: text
        .replace(/\*\*\*/g, " ")
        .replace(/[*_`#>]/g, "")
        .split(/\s+/)
        .filter(Boolean).length,
      target: perChapter,
      x: 60 + (c % 6) * 300,
      y: 60 + Math.floor(c / 6) * 220,
      chars: charIds.filter(() => rand() < 0.2),
      worldRefs: worldIds.filter(() => rand() < 0.15),
      manuscript: text,
      scenes,
      sceneLinks,
      scenePos,
      refs: [],
    });
  }
  const links = [];
  for (let c = 0; c < chapters.length - 1; c++)
    links.push({ fromId: chapters[c].id, toId: chapters[c + 1].id, type: pick(CONN) });
  return { chapters, links, storyNotes: paragraph() };
}

function makeVersionSet(bookIdx, charIds, worldIds) {
  const drafts = [];
  const draftData = {};
  let active = null;
  for (let v = 0; v < opt.versions; v++) {
    const id = v === 0 ? "main" : `b${bookIdx}-v${v}`;
    drafts.push({ id, name: v === 0 ? "First draft" : `Revision ${v}` });
    const data = makeChapters(bookIdx, v, charIds, worldIds);
    if (v === 0) active = data;
    else draftData[id] = data;
    process.stderr.write(`  book ${bookIdx + 1} version ${v + 1}/${opt.versions}\r`);
  }
  return { drafts, draftData, active, activeDraftId: "main", mainDraftId: "main" };
}

console.error(
  `Generating ${opt.books} books x ${opt.versions} versions x ${opt.chapters} chapters ` +
    `at ~${opt.words.toLocaleString()} words per version...`
);

const characters = makeCharacters(opt.characters);
const world = makeWorld(opt.world);
const charIds = characters.map((c) => c.id);
const worldIds = world.map((w) => w.id);

const books = [];
const bookData = {};
let activeBook = null;

for (let b = 0; b < opt.books; b++) {
  const id = b === 0 ? "book-main" : `book-${b}`;
  books.push({
    id,
    title: `${pick(PLACES)} ${pick(["Cycle", "Saga", "Book", "Chronicle"])}`,
    subtitle: sentence(),
    status: ["drafting", "planned", "idea"][b % 3],
    premise: paragraph(),
    arc: sentence(),
    notes: sentence(),
    x: 80 + (b % 4) * 340,
    y: 80 + Math.floor(b / 4) * 260,
  });
  const set = makeVersionSet(b, charIds, worldIds);
  if (b === 0) activeBook = set;
  else
    bookData[id] = {
      chapters: set.active.chapters,
      links: set.active.links,
      storyNotes: set.active.storyNotes,
      drafts: set.drafts,
      activeDraftId: set.activeDraftId,
      mainDraftId: set.mainDraftId,
      draftData: set.draftData,
    };
}
process.stderr.write("\n");

const doc = {
  schemaVersion: 8,
  id: `fixture-${opt.seed}`,
  projectTitle: `Scale fixture ${opt.books}x${opt.versions}`,
  author: "R. F. Labra",
  seriesMode: opt.books > 1,
  drafts: activeBook.drafts,
  activeDraftId: activeBook.activeDraftId,
  mainDraftId: activeBook.mainDraftId,
  characters,
  world,
  assets: [],
  books,
  // `id` is required — SeriesMap keys its React list on it, and a link without
  // one renders with an undefined key and a console warning that looks like an
  // app bug until you check the type.
  bookLinks: books.slice(0, -1).map((b, i) => ({
    id: `booklink-${i}`,
    fromId: b.id,
    toId: books[i + 1].id,
    label: "then",
  })),
  activeBookId: "book-main",
  chapters: activeBook.active.chapters,
  links: activeBook.active.links,
  storyNotes: activeBook.active.storyNotes,
  draftData: activeBook.draftData,
  bookData,
};

console.error("Serializing...");
const json = JSON.stringify(doc, null, 2);
writeFileSync(opt.out, json);

// ---- what was actually produced --------------------------------------------

let manuscripts = 0;
let totalWords = 0;
let totalChars = 0;
let biggest = 0;
const visit = (chapters) => {
  for (const c of chapters) {
    if (!c.manuscript) continue;
    manuscripts++;
    totalWords += c.words;
    totalChars += c.manuscript.length;
    biggest = Math.max(biggest, c.manuscript.length);
  }
};
visit(doc.chapters);
for (const d of Object.values(doc.draftData)) visit(d.chapters);
for (const bd of Object.values(doc.bookData)) {
  visit(bd.chapters);
  for (const d of Object.values(bd.draftData)) visit(d.chapters);
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
console.error(`
Wrote ${opt.out}
  file            ${mb(Buffer.byteLength(json))}
  manuscripts     ${manuscripts}
  words           ${totalWords.toLocaleString()}
  prose chars     ${totalChars.toLocaleString()} (${mb(totalChars * 2)} as UTF-16 in memory)
  largest chapter ${biggest.toLocaleString()} chars (${mb(biggest * 2)} in the crash pad)
`);
