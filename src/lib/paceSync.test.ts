import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaceLog, StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import { MemoryDir, memoryStorage } from "@/test/memoryDir";
import { addWords, dayTotals, draftDoneOn, reopenDraft } from "@/lib/paceLog";

/**
 * Sync and the Pace word log (`PaceLog`, grow-only). Same in-memory folder as
 * sync.test.ts. What must hold: a difference that is only the log never opens
 * the conflict dialog, and whichever side a conflict keeps, both sides' days
 * survive in the file and here.
 */

let folder: MemoryDir | null = null;

vi.mock("@/lib/backup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/backup")>();
  return {
    ...real,
    getBackupDir: vi.fn(async () => folder?.asHandle() ?? null),
    forgetBackupDir: vi.fn(async () => {
      folder = null;
    }),
  };
});

const { resolveConflict, syncProject } = await import("@/lib/sync");

const LIVE = "my-story.estoria.json";
const dir = () => folder!;

function makeDoc(over: Partial<StoryDoc> = {}): StoryDoc {
  return normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [
      { id: "c1", title: "Arrival", scenes: ["She lands."] },
      { id: "c2", title: "Departure", scenes: ["She leaves."] },
    ],
    ...over,
  });
}

const withWords = (doc: StoryDoc, device: string, n: number, at: number): StoryDoc => ({
  ...doc,
  pace: addWords(doc.pace, device, "2026-10-11", n, at),
});

const retitle = (doc: StoryDoc, id: string, title: string): StoryDoc => ({
  ...doc,
  chapters: doc.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
});

const today = (pace: PaceLog | undefined) => dayTotals(pace).get("2026-10-11");
const fileDoc = () => normalizeDoc(dir().json(LIVE));

function tick(seconds = 1): void {
  vi.setSystemTime(Date.now() + seconds * 1000);
}

beforeEach(() => {
  folder = new MemoryDir();
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a difference that is only the Pace log", () => {
  it("merges both sides' days without a conflict", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    dir().put(LIVE, JSON.stringify(withWords(doc, "android-b", 90, 2)));
    const mine = withWords(doc, "web-a", 400, 3);

    const res = await syncProject(mine);
    expect(res.kind).toBe("pulled");
    if (res.kind !== "pulled") return;
    expect(today(res.doc.pace)).toBe(490);
    expect(today(fileDoc().pace)).toBe(490);

    tick();
    expect((await syncProject(res.doc)).kind).toBe("in-sync");
  });

  it("a file an older app wrote without the log does not erase it", async () => {
    const mine = withWords(makeDoc(), "web-a", 400, 3);
    await syncProject(mine);
    tick();
    // An app that drops unknown fields read the file and wrote it back.
    const { pace: _dropped, ...stripped } = mine;
    dir().put(LIVE, JSON.stringify(stripped));

    // Nothing changed here, so this is a pull, and the pull keeps the days...
    const res = await syncProject(mine);
    expect(res.kind).toBe("pulled");
    if (res.kind !== "pulled") return;
    expect(today(res.doc.pace)).toBe(400);
    // ...and the next sync puts them back in the file.
    tick();
    expect((await syncProject(res.doc)).kind).toBe("pushed");
    expect(today(fileDoc().pace)).toBe(400);
  });
});

describe("draft done through sync", () => {
  it("a phone that strips the draft block can't undo it, and the next sync puts it back", async () => {
    const mine = withWords(makeDoc(), "web-a", 400, 3);
    const done: StoryDoc = { ...mine, pace: { ...mine.pace!, draft: { doneOn: "2026-10-11", at: 5 } } };
    await syncProject(done);
    tick();
    // Android 73 rebuilds `pace` from settings and days only, then saves.
    const { draft: _dropped, ...stripped } = done.pace!;
    dir().put(LIVE, JSON.stringify(withWords({ ...done, pace: stripped }, "android-b", 90, 6)));

    const res = await syncProject(done);
    expect(res.kind).toBe("pulled");
    if (res.kind !== "pulled") return;
    expect(draftDoneOn(res.doc.pace)).toBe("2026-10-11");
    expect(today(res.doc.pace)).toBe(490);
    tick();
    expect((await syncProject(res.doc)).kind).toBe("pushed");
    expect(draftDoneOn(fileDoc().pace)).toBe("2026-10-11");
  });

  it("reopening on one browser wins over a file that still says done", async () => {
    const done: StoryDoc = { ...makeDoc(), pace: { days: {}, draft: { doneOn: "2026-10-11", at: 5 } } };
    await syncProject(done);
    tick();
    const reopened: StoryDoc = { ...done, pace: reopenDraft(done.pace, 6) };
    const res = await syncProject(reopened);
    expect(res.kind).toBe("pushed");
    expect(draftDoneOn(fileDoc().pace)).toBeNull();
  });
});

describe("resolving a real conflict keeps both sides' days", () => {
  async function setUp() {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    const theirs = withWords(retitle(doc, "c2", "Departure, from the phone"), "android-b", 90, 2);
    dir().put(LIVE, JSON.stringify(theirs));
    const mine = withWords(retitle(doc, "c1", "Arrival, from the laptop"), "web-a", 400, 3);
    const res = await syncProject(mine);
    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") throw new Error("expected a conflict");
    tick();
    return { mine, theirs: res.remote };
  }

  it("keep mine: the board is not reloaded, and the merged log comes back to fold in", async () => {
    const { mine, theirs } = await setUp();
    const res = await resolveConflict(mine, theirs, "mine");
    expect(res.applied).toBeNull();
    expect(today(res.pace)).toBe(490);
    expect(today(fileDoc().pace)).toBe(490);
    expect(fileDoc().chapters[0].title).toBe("Arrival, from the laptop");
  });

  it("keep theirs: what is applied carries this copy's days too", async () => {
    const { mine, theirs } = await setUp();
    const res = await resolveConflict(mine, theirs, "theirs");
    expect(res.applied?.chapters[1].title).toBe("Departure, from the phone");
    expect(today(res.applied?.pace)).toBe(490);
    expect(today(fileDoc().pace)).toBe(490);
  });
});
