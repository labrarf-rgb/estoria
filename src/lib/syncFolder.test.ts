import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDoc } from "@/store/persistence";
import { MemoryDir, memoryStorage } from "@/test/memoryDir";

/**
 * The SyncFolder contract (lib/syncFolder.ts) as the local folder keeps it,
 * plus the saved-copy writer that goes through it. Added with the refactor;
 * sync.test.ts is the behavior suite that predates it.
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

const { LocalFolder, SyncFolderGoneError, getSyncFolder } = await import("@/lib/syncFolder");
const { writeSavedCopyFile } = await import("@/lib/sync");

beforeEach(() => {
  folder = new MemoryDir();
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LocalFolder", () => {
  const local = () => new LocalFolder(folder!.asHandle());

  it("reads a file's text, and null for a missing one", async () => {
    folder!.put("a.estoria.json", "{}");
    expect(await local().read("a.estoria.json")).toEqual({ text: "{}" });
    expect(await local().read("missing.estoria.json")).toBeNull();
  });

  it("writes, creating the file when needed", async () => {
    await local().write("a.estoria.json", "one");
    await local().write("a.estoria.json", "two");
    expect(folder!.text("a.estoria.json")).toBe("two");
  });

  it("lists only project files, with their times", async () => {
    folder!.put("a.estoria.json", "{}", 1000);
    folder!.put("notes.txt", "x", 2000);
    expect(await local().list()).toEqual([{ name: "a.estoria.json", lastModified: 1000 }]);
  });

  it("removes a file", async () => {
    folder!.put("a.estoria.json", "{}");
    await local().remove("a.estoria.json");
    expect(folder!.names()).toEqual([]);
  });

  it("reports a vanished folder as gone on write, list and remove", async () => {
    const f = local();
    folder!.gone = true;
    await expect(f.write("a.estoria.json", "x")).rejects.toBeInstanceOf(SyncFolderGoneError);
    await expect(f.list()).rejects.toBeInstanceOf(SyncFolderGoneError);
    await expect(f.remove("a.estoria.json")).rejects.toBeInstanceOf(SyncFolderGoneError);
  });

  it("passes other read failures through rather than calling them absent", async () => {
    const dir = folder!.asHandle();
    dir.getFileHandle = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
    await expect(new LocalFolder(dir).read("a.estoria.json")).rejects.toThrow("denied");
  });

  it("is the active target when a folder is connected", async () => {
    expect((await getSyncFolder())?.target).toBe("folder");
    folder = null;
    expect(await getSyncFolder()).toBeNull();
  });
});

describe("writeSavedCopyFile", () => {
  const doc = normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [{ id: "c1", title: "One" }],
    savedCopy: { reason: "expand", savedAt: "2026-10-11T09:00:00.000Z", fromId: "p0" },
  });

  it("writes the copy beside the project's files", async () => {
    await writeSavedCopyFile(doc);
    const names = folder!.names();
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^my-story-saved-expand-\d{8}-\d{6}\.estoria\.json$/);
  });

  it("does nothing without a folder, or for a doc that isn't a saved copy", async () => {
    await writeSavedCopyFile({ ...doc, savedCopy: undefined });
    expect(folder!.names()).toEqual([]);
    folder = null;
    await expect(writeSavedCopyFile(doc)).resolves.toBeUndefined();
  });

  it("stays silent when the folder is gone", async () => {
    folder!.gone = true;
    await expect(writeSavedCopyFile(doc)).resolves.toBeUndefined();
  });
});

describe("backup before a pull (H15b, folder target)", () => {
  it("keeps local state as a backup before loading a newer file over it", async () => {
    const { syncProject, fingerprint } = await import("@/lib/sync");
    const doc = normalizeDoc({ id: "p1", projectTitle: "My Story", chapters: [{ id: "c1", title: "Mine" }] });
    await syncProject(doc);
    const theirs = { ...doc, chapters: [{ ...doc.chapters[0], title: "From the phone" }] };
    folder!.put("my-story.estoria.json", JSON.stringify(theirs));
    expect((await syncProject(doc)).kind).toBe("pulled");
    const saved = folder!.names().find((n) => n.endsWith("-before-pull.estoria.json"));
    expect(saved).toBeDefined();
    expect(await fingerprint(normalizeDoc(folder!.json(saved!)))).toBe(await fingerprint(doc));
  });
});
