import { beforeAll, describe, expect, it } from "vitest";
import { emptyStory } from "@/data/emptyStory";
import {
  addWords,
  dayKey,
  dropTyping,
  noteTyping,
  parseLog,
  projectWords,
  refreshProject,
  settleTyping,
  WORD_LOG_KEY,
  wordsToday,
} from "@/lib/wordLog";
import type { StoryDoc } from "@/types";

const DAY = new Date(2026, 9, 29, 14, 0);

// The suite runs in node, which has no localStorage; a Map stands in for it.
beforeAll(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const chapter = (id: string, words: number, manuscript?: string) =>
  ({ id, words, manuscript }) as unknown as StoryDoc["chapters"][number];

function doc(id: string, chapters: StoryDoc["chapters"]): StoryDoc {
  const d = emptyStory();
  d.id = id;
  d.projectTitle = `Project ${id}`;
  d.chapters = chapters;
  return d;
}

const stored = () => parseLog(localStorage.getItem(WORD_LOG_KEY));

describe("dayKey", () => {
  it("is the local calendar day, never UTC-shifted", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("projectWords", () => {
  it("counts every book's active version but not inactive versions", () => {
    const d = doc("pw", [chapter("a", 100, "…"), chapter("b", 50, "…")]);
    d.draftData = { fork: { chapters: [chapter("a", 9999, "…")] } } as unknown as StoryDoc["draftData"];
    d.bookData = { other: { chapters: [chapter("x", 400, "…")] } } as unknown as StoryDoc["bookData"];
    expect(projectWords(d)).toBe(550);
  });

  it("leaves out a chapter's planned count until it has prose", () => {
    const d = doc("pp", [chapter("a", 120, "…"), chapter("b", 3200)]);
    d.bookData = { other: { chapters: [chapter("x", 2800)] } } as unknown as StoryDoc["bookData"];
    expect(projectWords(d)).toBe(120);
  });
});

describe("addWords", () => {
  it("adds to the day and drops a day that nets to zero", () => {
    let log = parseLog(null);
    log = addWords(log, "p", "P", 10, "2026-10-29", 300, "t");
    log = addWords(log, "p", "P", 10, "2026-10-29", 200, "t");
    expect(log.projects.p.days["2026-10-29"]).toBe(500);
    log = addWords(log, "p", "P", 10, "2026-10-29", -500, "t");
    expect(log.projects.p.days["2026-10-29"]).toBeUndefined();
  });

  it("keeps a net-negative day", () => {
    const log = addWords(parseLog(null), "p", "P", 0, "2026-10-29", -120, "t");
    expect(log.projects.p.days["2026-10-29"]).toBe(-120);
  });
});

describe("parseLog", () => {
  it("forgives junk", () => {
    expect(parseLog("{nope").projects).toEqual({});
    expect(parseLog(JSON.stringify({ version: 2, projects: {} })).projects).toEqual({});
  });
});

describe("typing bursts", () => {
  it("books the net change between a burst's first keystroke and its settle", () => {
    const before = doc("t1", [chapter("c", 3, "one two three")]);
    noteTyping(before, "c", () => 3);
    // More keystrokes in the same burst do not move the baseline.
    noteTyping(before, "c", () => 999);
    const after = doc("t1", [chapter("c", 7, "one two three four five six seven")]);
    settleTyping(after, "c", 7, DAY);
    expect(wordsToday("t1", DAY)).toBe(4);
    expect(stored().projects.t1.total).toBe(7);
  });

  it("starts a chapter's first prose from zero, not from its planned count", () => {
    // `words` still holds the plan (3000) until the recompute, so the baseline
    // must come from the prose, which did not exist.
    const before = doc("t2", [chapter("c", 3000)]);
    noteTyping(before, "c", () => 0);
    settleTyping(doc("t2", [chapter("c", 2, "Hello there")]), "c", 2, DAY);
    expect(wordsToday("t2", DAY)).toBe(2);
  });

  it("books nothing for a recompute that typing did not open", () => {
    settleTyping(doc("t3", [chapter("c", 500, "x")]), "c", 500, DAY);
    expect(stored().projects.t3).toBeUndefined();
  });

  it("books nothing when prose was swapped out mid-burst", () => {
    const d = doc("t4", [chapter("c", 10, "x")]);
    noteTyping(d, "c", () => 10);
    dropTyping(); // a pull, undo or document arriving
    settleTyping(d, "c", 5000, DAY);
    expect(stored().projects.t4).toBeUndefined();
  });

  it("does not let a burst in another version settle against this one", () => {
    const main = doc("t5", [chapter("c", 10, "x")]);
    noteTyping(main, "c", () => 10);
    const fork = { ...main, activeDraftId: "fork" };
    noteTyping(fork, "c", () => 40);
    // Back on main, the old baseline is gone: this burst starts fresh.
    noteTyping(main, "c", () => 20);
    settleTyping(main, "c", 25, DAY);
    expect(wordsToday("t5", DAY)).toBe(5);
  });
});

describe("refreshProject", () => {
  it("follows the total without booking words, and only for logged projects", () => {
    refreshProject(doc("r1", [chapter("c", 100)]), DAY);
    expect(stored().projects.r1).toBeUndefined();

    const d = doc("r2", [chapter("c", 10, "x")]);
    noteTyping(d, "c", () => 0);
    settleTyping(d, "c", 10, DAY);
    refreshProject(doc("r2", [chapter("c", 10, "x"), chapter("d", 2000, "y")]), DAY);
    expect(stored().projects.r2.total).toBe(2010);
    expect(wordsToday("r2", DAY)).toBe(10);
  });
});
