import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryDoc } from "@/types";
import { normalizeDoc, SchemaTooNewError } from "@/store/persistence";
import { MemoryDir, memoryStorage } from "@/test/memoryDir";

/**
 * Behavior of cross-app Sync (SPECS §8) against an in-memory Estoria folder.
 *
 * The only seam is the folder handle: `getBackupDir` / `forgetBackupDir` are
 * swapped for an in-memory directory, and everything else is the real code.
 * The suite was written against sync.ts before the SyncFolder refactor and must
 * pass unchanged after it (docs/PLAN-drive-sync.md, Phase A). So it checks
 * outcomes and file contents, never storage key names or internal calls.
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

const sync = await import("@/lib/sync");
const backup = await import("@/lib/backup");
const {
  checkRemoteChanged,
  fingerprint,
  listProjectFiles,
  pushCanonicalIfSafe,
  resolveConflict,
  restoreFromFile,
  syncProject,
} = sync;

const LIVE = "my-story.estoria.json";

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

/** The same project with one chapter retitled: a real, diffable change. */
function edit(doc: StoryDoc, chapterId: string, title: string): StoryDoc {
  return {
    ...doc,
    chapters: doc.chapters.map((c) => (c.id === chapterId ? { ...c, title } : c)),
  };
}

/** Write a doc into the folder the way another device would. */
function writeExternally(dir: MemoryDir, name: string, doc: StoryDoc): void {
  dir.put(name, JSON.stringify(doc, null, 2));
}

async function sameContent(a: unknown, b: StoryDoc): Promise<boolean> {
  return (await fingerprint(normalizeDoc(a))) === (await fingerprint(b));
}

const backupsOf = (dir: MemoryDir, slug = "my-story") =>
  dir.names().filter((n) => n.startsWith(`${slug}-backup-`));
const conflictsOf = (dir: MemoryDir) => dir.names().filter((n) => n.includes("-conflict-"));

/** Backup names are stamped to the second, so move the clock between syncs. */
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

const dir = () => folder!;

describe("syncProject (the Sync button)", () => {
  it("reports no-folder when none is connected", async () => {
    folder = null;
    expect(await syncProject(makeDoc())).toEqual({ kind: "no-folder" });
  });

  it("creates the live file when it doesn't exist", async () => {
    const doc = makeDoc();
    const res = await syncProject(doc);
    expect(res.kind).toBe("created");
    expect(res.kind === "created" && res.fileName).toBe(LIVE);
    expect(await sameContent(dir().json(LIVE), doc)).toBe(true);
    expect(backupsOf(dir())).toHaveLength(1);
  });

  it("stamps modifiedAt on what it writes", async () => {
    await syncProject(makeDoc());
    expect((dir().json(LIVE) as StoryDoc).modifiedAt).toBe(new Date().toISOString());
  });

  it("is in sync when nothing changed", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    const before = dir().text(LIVE);
    const res = await syncProject(doc);
    expect(res.kind).toBe("in-sync");
    expect(dir().text(LIVE)).toBe(before);
  });

  it("pushes when only this app changed", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    const mine = edit(doc, "c1", "Arrival, revised");
    const res = await syncProject(mine);
    expect(res.kind).toBe("pushed");
    expect(await sameContent(dir().json(LIVE), mine)).toBe(true);
  });

  it("pulls when only the file changed, and backs up what it loads", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    const theirs = edit(doc, "c2", "Departure, from the phone");
    writeExternally(dir(), LIVE, theirs);
    const res = await syncProject(doc);
    expect(res.kind).toBe("pulled");
    if (res.kind !== "pulled") return;
    expect(await fingerprint(res.doc)).toBe(await fingerprint(theirs));
    const newest = backupsOf(dir()).at(-1)!;
    expect(await sameContent(dir().json(newest), theirs)).toBe(true);

    // Once loaded, the next sync agrees with the file.
    tick();
    expect((await syncProject(res.doc)).kind).toBe("in-sync");
  });

  it("returns a conflict when both sides changed, and touches nothing", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    const theirs = edit(doc, "c2", "Departure, from the phone");
    writeExternally(dir(), LIVE, theirs);
    const fileBefore = dir().text(LIVE);
    const namesBefore = dir().names();

    const mine = edit(doc, "c1", "Arrival, from the laptop");
    const res = await syncProject(mine);
    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") return;
    expect(res.diff.differing).toBe(2);
    expect(res.diff.sections[0].items.map((i) => i.state)).toEqual(["changed", "changed"]);
    expect(dir().text(LIVE)).toBe(fileBefore);
    expect(dir().names()).toEqual(namesBefore);
  });

  it("treats a difference with no agreed baseline as a conflict, never a silent pull", async () => {
    const doc = makeDoc();
    writeExternally(dir(), LIVE, edit(doc, "c1", "Someone else's version"));
    const res = await syncProject(doc);
    expect(res.kind).toBe("conflict");
  });

  it("refuses a file from a newer app and leaves it alone", async () => {
    const doc = makeDoc();
    dir().put(LIVE, JSON.stringify({ ...doc, schemaVersion: 999 }));
    const before = dir().text(LIVE);
    await expect(syncProject(doc)).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(dir().text(LIVE)).toBe(before);
  });

  it("refuses a corrupt file without overwriting it", async () => {
    dir().put(LIVE, "{ not json");
    await expect(syncProject(makeDoc())).rejects.toThrow(/couldn't be read/);
    expect(dir().text(LIVE)).toBe("{ not json");
  });

  it("forgets a folder that vanished mid-operation and says so", async () => {
    await syncProject(makeDoc());
    dir().gone = true;
    await expect(syncProject(edit(makeDoc(), "c1", "x"))).rejects.toThrow(/moved/);
    expect(backup.forgetBackupDir).toHaveBeenCalled();
    expect(await syncProject(makeDoc())).toEqual({ kind: "no-folder" });
  });
});

describe("resolveConflict", () => {
  async function setUpConflict() {
    const doc = makeDoc();
    await syncProject(doc);
    tick();
    const theirs = edit(doc, "c2", "Departure, from the phone");
    writeExternally(dir(), LIVE, theirs);
    const mine = edit(doc, "c1", "Arrival, from the laptop");
    const res = await syncProject(mine);
    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") throw new Error("expected a conflict");
    tick();
    return { mine, theirs: res.remote };
  }

  it("keeps mine: the file copy is preserved, then mine becomes the live file", async () => {
    const { mine, theirs } = await setUpConflict();
    const res = await resolveConflict(mine, theirs, "mine");
    expect(res.applied).toBeNull();
    expect(res.conflictFileNames).toEqual(conflictsOf(dir()));
    expect(res.conflictFileNames).toHaveLength(1);
    expect(await sameContent(dir().json(res.conflictFileNames[0]), theirs)).toBe(true);
    expect(await sameContent(dir().json(LIVE), mine)).toBe(true);
    tick();
    expect((await syncProject(mine)).kind).toBe("in-sync");
  });

  it("keeps theirs: my copy is preserved, and theirs is applied", async () => {
    const { mine, theirs } = await setUpConflict();
    const res = await resolveConflict(mine, theirs, "theirs");
    expect(res.applied && (await fingerprint(res.applied))).toBe(await fingerprint(theirs));
    expect(await sameContent(dir().json(res.conflictFileNames[0]), mine)).toBe(true);
    expect(await sameContent(dir().json(LIVE), theirs)).toBe(true);
    tick();
    expect((await syncProject(theirs)).kind).toBe("in-sync");
  });

  it("merge: both copies are preserved, and the merge becomes the live file", async () => {
    const { mine, theirs } = await setUpConflict();
    const merged = edit(mine, "c2", "Departure, from the phone");
    const res = await resolveConflict(mine, theirs, { merged });
    expect(res.conflictFileNames).toHaveLength(2);
    const local = res.conflictFileNames.find((n) => n.endsWith("-local.estoria.json"))!;
    const file = res.conflictFileNames.find((n) => n.endsWith("-file.estoria.json"))!;
    expect(await sameContent(dir().json(local), mine)).toBe(true);
    expect(await sameContent(dir().json(file), theirs)).toBe(true);
    expect(await sameContent(dir().json(LIVE), merged)).toBe(true);
    expect(res.applied && (await fingerprint(res.applied))).toBe(await fingerprint(merged));
  });

  it("conflict copies are never pruned by backup rotation", async () => {
    const { mine, theirs } = await setUpConflict();
    const { conflictFileNames } = await resolveConflict(mine, theirs, "mine");
    for (let i = 0; i < 7; i++) {
      tick();
      await syncProject(mine);
    }
    for (const n of conflictFileNames) expect(dir().names()).toContain(n);
  });
});

describe("pushCanonicalIfSafe (the auto-save mirror)", () => {
  it("is unavailable without a folder", async () => {
    folder = null;
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("unavailable");
  });

  it("creates, stays in sync, then fast-forwards local edits", async () => {
    const doc = makeDoc();
    expect(await pushCanonicalIfSafe(doc)).toBe("created");
    expect(await pushCanonicalIfSafe(doc)).toBe("in-sync");
    const mine = edit(doc, "c1", "Arrival, revised");
    expect(await pushCanonicalIfSafe(mine)).toBe("updated");
    expect(await sameContent(dir().json(LIVE), mine)).toBe(true);
  });

  it("never rotates backups", async () => {
    const doc = makeDoc();
    await pushCanonicalIfSafe(doc);
    await pushCanonicalIfSafe(edit(doc, "c1", "x"));
    expect(backupsOf(dir())).toHaveLength(0);
  });

  it("reports behind and leaves a file changed elsewhere alone", async () => {
    const doc = makeDoc();
    await pushCanonicalIfSafe(doc);
    const theirs = edit(doc, "c2", "From the phone");
    writeExternally(dir(), LIVE, theirs);
    const before = dir().text(LIVE);
    expect(await pushCanonicalIfSafe(edit(doc, "c1", "From the laptop"))).toBe("behind");
    expect(dir().text(LIVE)).toBe(before);
  });

  it("reports behind on a file it has never agreed with", async () => {
    writeExternally(dir(), LIVE, edit(makeDoc(), "c1", "Someone else's"));
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("behind");
  });

  it("never overwrites a corrupt file", async () => {
    dir().put(LIVE, "{ not json");
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("behind");
    expect(dir().text(LIVE)).toBe("{ not json");
  });

  it("never overwrites a file from a newer app", async () => {
    const raw = JSON.stringify({ ...makeDoc(), schemaVersion: 999 });
    dir().put(LIVE, raw);
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("behind");
    expect(dir().text(LIVE)).toBe(raw);
  });

  it("swallows I/O failures as unavailable", async () => {
    await pushCanonicalIfSafe(makeDoc());
    dir().gone = true;
    expect(await pushCanonicalIfSafe(edit(makeDoc(), "c1", "x"))).toBe("unavailable");
  });

  it("runs one compare-and-write at a time, even when called concurrently", async () => {
    const doc = makeDoc();
    await pushCanonicalIfSafe(doc);
    dir().log = [];
    dir().slowReads = true;
    const a = edit(doc, "c1", "First");
    const b = edit(a, "c2", "Second");
    const [ra, rb] = await Promise.all([pushCanonicalIfSafe(a), pushCanonicalIfSafe(b)]);
    expect([ra, rb]).toEqual(["updated", "updated"]);
    expect(dir().log).toEqual([`read:${LIVE}`, `write:${LIVE}`, `read:${LIVE}`, `write:${LIVE}`]);
    expect(await sameContent(dir().json(LIVE), b)).toBe(true);
  });
});

describe("checkRemoteChanged (the background check)", () => {
  it("is false without a folder or a file", async () => {
    expect(await checkRemoteChanged(makeDoc())).toBe(false);
    folder = null;
    expect(await checkRemoteChanged(makeDoc())).toBe(false);
  });

  it("is false for a project never synced on this device", async () => {
    writeExternally(dir(), LIVE, edit(makeDoc(), "c1", "x"));
    expect(await checkRemoteChanged(makeDoc())).toBe(false);
  });

  it("is false after a sync, and for local-only edits", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    expect(await checkRemoteChanged(doc)).toBe(false);
    expect(await checkRemoteChanged(edit(doc, "c1", "Local only"))).toBe(false);
  });

  it("is true when the file moved on since the last agreement", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    writeExternally(dir(), LIVE, edit(doc, "c2", "From the phone"));
    expect(await checkRemoteChanged(doc)).toBe(true);
  });

  it("is false when the file already matches local state", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    const same = edit(doc, "c1", "Both made this edit");
    writeExternally(dir(), LIVE, same);
    expect(await checkRemoteChanged(same)).toBe(false);
  });
});

describe("rotating backups", () => {
  it("keeps the newest 5 per project and prunes the oldest", async () => {
    const doc = makeDoc();
    for (let i = 0; i < 7; i++) {
      tick();
      const res = await syncProject(edit(doc, "c1", `Take ${i}`));
      expect(res.kind !== "conflict" && res.kind !== "no-folder" && res.backup.kept).toBe(
        Math.min(i + 1, 5)
      );
    }
    const kept = backupsOf(dir());
    expect(kept).toHaveLength(5);
    const titles = kept.map((n) => (dir().json(n) as StoryDoc).chapters[0].title);
    expect(titles).toEqual(["Take 2", "Take 3", "Take 4", "Take 5", "Take 6"]);
  });

  it("leaves other projects' backups alone", async () => {
    const other = makeDoc({ id: "p2", projectTitle: "Other Tale" });
    for (let i = 0; i < 6; i++) {
      tick();
      await syncProject(edit(other, "c1", `Other ${i}`));
    }
    for (let i = 0; i < 6; i++) {
      tick();
      await syncProject(edit(makeDoc(), "c1", `Mine ${i}`));
    }
    expect(backupsOf(dir(), "other-tale")).toHaveLength(5);
    expect(backupsOf(dir())).toHaveLength(5);
  });
});

describe("folder history (list + restore)", () => {
  it("is null without a folder", async () => {
    folder = null;
    expect(await listProjectFiles(makeDoc())).toBeNull();
  });

  it("lists the live file first, then backups and conflict copies newest-first", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    tick(60);
    await syncProject(edit(doc, "c1", "Second"));
    tick(60);
    dir().put("my-story-conflict-20261011-090300.estoria.json", JSON.stringify(doc));
    dir().put("other-tale.estoria.json", JSON.stringify(doc));
    dir().put("notes.txt", "not a project");

    const files = (await listProjectFiles(doc))!;
    expect(files.map((f) => f.role)).toEqual(["live", "conflict", "backup", "backup"]);
    expect(files[0].name).toBe(LIVE);
    const times = files.slice(1).map((f) => f.lastModified);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("restores a copy, backing up the current state first, without touching the live file", async () => {
    const doc = makeDoc();
    await syncProject(doc);
    const first = backupsOf(dir())[0];
    tick();
    const current = edit(doc, "c1", "Current work");
    await syncProject(current);
    const live = dir().text(LIVE);
    tick();

    const res = await restoreFromFile(current, first);
    expect(await fingerprint(res.doc)).toBe(await fingerprint(doc));
    expect(await sameContent(dir().json(res.backedUpAs), current)).toBe(true);
    expect(dir().text(LIVE)).toBe(live);
  });

  it("reads the copy before the pre-restore backup can prune it", async () => {
    const doc = makeDoc();
    for (let i = 0; i < 5; i++) {
      tick();
      await syncProject(edit(doc, "c1", `Take ${i}`));
    }
    const oldest = backupsOf(dir())[0];
    tick();
    const res = await restoreFromFile(edit(doc, "c1", "Now"), oldest);
    expect(res.doc.chapters[0].title).toBe("Take 0");
    expect(dir().names()).not.toContain(oldest);
  });

  it("refuses a copy from a newer app", async () => {
    dir().put("my-story-backup-20261011-080000.estoria.json", JSON.stringify({ ...makeDoc(), schemaVersion: 999 }));
    await expect(
      restoreFromFile(makeDoc(), "my-story-backup-20261011-080000.estoria.json")
    ).rejects.toBeInstanceOf(SchemaTooNewError);
  });
});
