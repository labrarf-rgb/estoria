import { beforeEach, describe, expect, it } from "vitest";
import { DriveFolder, isLiveFileName, type DriveLink, type LinkStore } from "@/lib/driveFolder";
import {
  DriveDuplicateError,
  DriveFileMissingError,
  DriveOfflineError,
  DrivePausedError,
  DriveRevisionMovedError,
} from "@/lib/driveErrors";
import { FakeDrive } from "@/test/fakeDrive";

/** DriveFolder's own rules (docs/PLAN-drive-sync.md hazard register), against an in-memory Drive. */

let fake: FakeDrive;
let folderId: string;
let links: Map<string, DriveLink>;
let paused: boolean;
let folder: DriveFolder;

const store = (): LinkStore => ({
  get: (id) => links.get(id) ?? null,
  set: (id, link) => (link ? links.set(id, link) : links.delete(id)),
});

beforeEach(() => {
  fake = new FakeDrive();
  folderId = fake.folder();
  links = new Map();
  paused = false;
  folder = new DriveFolder(fake.api(), folderId, store(), () => paused, "writer@example.com");
});

describe("files by name (backups, conflict copies)", () => {
  it("writes, then updates the same file rather than making another", async () => {
    await folder.write("a-backup-1.estoria.json", "one");
    await folder.write("a-backup-1.estoria.json", "two");
    const files = fake.named(folderId, "a-backup-1.estoria.json");
    expect(files).toHaveLength(1);
    expect(files[0].content).toBe("two");
  });

  it("reads a file, and null for a missing one", async () => {
    fake.put(folderId, "x.estoria.json", "hello");
    expect((await folder.read("x.estoria.json"))?.text).toBe("hello");
    expect(await folder.read("missing.estoria.json")).toBeNull();
  });

  it("lists project files only, with their times", async () => {
    fake.put(folderId, "a.estoria.json", "{}");
    fake.put(folderId, "notes.txt", "x");
    fake.put("elsewhere", "b.estoria.json", "{}");
    const list = await folder.list();
    expect(list.map((f) => f.name)).toEqual(["a.estoria.json"]);
    expect(list[0].lastModified).toBeGreaterThan(0);
  });

  it("removes by moving to Drive's trash, never deleting (H7)", async () => {
    const id = fake.put(folderId, "a-backup-1.estoria.json", "{}");
    await folder.remove("a-backup-1.estoria.json");
    expect(fake.files.get(id)?.trashed).toBe(true);
    expect(fake.files.has(id)).toBe(true);
  });

  it("checks before creating again when a create's reply was lost (H2c)", async () => {
    fake.failNextCreate = "landed";
    await folder.write("a-backup-1.estoria.json", "one");
    expect(fake.named(folderId, "a-backup-1.estoria.json")).toHaveLength(1);
  });

  it("still fails when a create truly didn't land", async () => {
    fake.failNextCreate = "lost";
    await expect(folder.write("a-backup-1.estoria.json", "one")).rejects.toBeInstanceOf(DriveOfflineError);
    expect(fake.named(folderId, "a-backup-1.estoria.json")).toHaveLength(0);
  });
});

describe("the live file (H2a, H2b, H3, H4)", () => {
  it("reads as unlinked until a file is chosen, and never creates one on its own", async () => {
    expect(await folder.readLive("p1")).toBe("unlinked");
    await expect(folder.writeLive("p1", "a.estoria.json", "x")).rejects.toThrow(/isn't linked/);
    expect(fake.live(folderId)).toHaveLength(0);
  });

  it("follows the linked file by ID, even with another file of the same name", async () => {
    const mine = fake.put(folderId, "a.estoria.json", "mine");
    fake.put(folderId, "a.estoria.json", "a stranger's");
    folder.link("p1", mine);
    expect((await folder.readLive("p1")) as { text: string }).toMatchObject({ text: "mine" });
    expect(links.get("p1")).toEqual({ fileId: mine, account: "writer@example.com" });
  });

  it("writes a new revision of the same file", async () => {
    const id = fake.put(folderId, "a.estoria.json", "v1");
    folder.link("p1", id);
    const read = (await folder.readLive("p1")) as { rev?: string };
    await folder.writeLive("p1", "a.estoria.json", "v2", { expectRev: read.rev });
    expect(fake.files.get(id)?.content).toBe("v2");
    expect(fake.live(folderId)).toHaveLength(1);
  });

  it("renames the file in place when the project was renamed, keeping its ID (H3)", async () => {
    const id = fake.put(folderId, "old-title.estoria.json", "v1");
    folder.link("p1", id);
    await folder.writeLive("p1", "new-title.estoria.json", "v2");
    expect(fake.files.get(id)).toMatchObject({ name: "new-title.estoria.json", content: "v2" });
    expect(fake.live(folderId)).toHaveLength(1);
  });

  it("writes nothing when the file moved since it was read (H4)", async () => {
    const id = fake.put(folderId, "a.estoria.json", "v1");
    folder.link("p1", id);
    const read = (await folder.readLive("p1")) as { rev?: string };
    fake.writeExternally(id, "from the phone");
    await expect(
      folder.writeLive("p1", "a.estoria.json", "from the laptop", { expectRev: read.rev })
    ).rejects.toBeInstanceOf(DriveRevisionMovedError);
    expect(fake.files.get(id)?.content).toBe("from the phone");
  });

  it("says so when the linked file is in the trash, and never recreates it", async () => {
    const id = fake.put(folderId, "a.estoria.json", "v1");
    folder.link("p1", id);
    fake.files.get(id)!.trashed = true;
    await expect(folder.readLive("p1")).rejects.toBeInstanceOf(DriveFileMissingError);
    await expect(folder.writeLive("p1", "a.estoria.json", "x")).rejects.toBeInstanceOf(DriveFileMissingError);
    expect(fake.live(folderId)).toHaveLength(0);
  });

  it("says so when the linked file is gone entirely", async () => {
    folder.link("p1", "no-such-id");
    await expect(folder.readLive("p1")).rejects.toBeInstanceOf(DriveFileMissingError);
  });
});

describe("linking a project (the needs-link answers)", () => {
  it("creates the live file only when asked, and links it", async () => {
    const id = await folder.createLive("p1", "a.estoria.json", "v1");
    expect(links.get("p1")?.fileId).toBe(id);
    expect(fake.files.get(id)?.content).toBe("v1");
  });

  it("refuses to create over a name that's already there: offer those files instead", async () => {
    const existing = fake.put(folderId, "a.estoria.json", "from the phone");
    const err = await folder.createLive("p1", "a.estoria.json", "v1").catch((e) => e);
    expect(err).toBeInstanceOf(DriveDuplicateError);
    expect((err as DriveDuplicateError).fileIds).toEqual([existing]);
    expect(links.has("p1")).toBe(false);
    expect(fake.named(folderId, "a.estoria.json")).toHaveLength(1);
  });

  it("stops if the create left two files with the name (H2d)", async () => {
    // Another device creates the same name at the same moment.
    const api = fake.api();
    const racing = new DriveFolder(
      { ...api, create: async (p, n, t) => (fake.put(p, n, "other device"), api.create(p, n, t)) },
      folderId,
      store(),
      () => false
    );
    await expect(racing.createLive("p1", "a.estoria.json", "v1")).rejects.toBeInstanceOf(DriveDuplicateError);
    expect(links.has("p1")).toBe(false);
  });

  it("doesn't make a second copy when the create's reply was lost (H2c)", async () => {
    fake.failNextCreate = "landed";
    const id = await folder.createLive("p1", "a.estoria.json", "v1");
    expect(fake.named(folderId, "a.estoria.json").map((f) => f.id)).toEqual([id]);
  });

  it("lists live project files for 'Open from Google Drive' (H8), not backups", async () => {
    fake.put(folderId, "a.estoria.json", "{}");
    fake.put(folderId, "a-backup-20261011-090000.estoria.json", "{}");
    fake.put(folderId, "a-conflict-20261011-090000.estoria.json", "{}");
    fake.put(folderId, "a-saved-expand-20261011-090000.estoria.json", "{}");
    fake.put(folderId, "b.estoria.json", "{}");
    expect((await folder.liveFiles()).map((f) => f.name).sort()).toEqual(["a.estoria.json", "b.estoria.json"]);
    expect(isLiveFileName("my-story.estoria.json")).toBe(true);
    expect(isLiveFileName("my-story-backup-1.estoria.json")).toBe(false);
  });
});

describe("kill switch", () => {
  it("refuses every write while paused, and still reads", async () => {
    const id = fake.put(folderId, "a.estoria.json", "v1");
    folder.link("p1", id);
    paused = true;
    await expect(folder.write("b.estoria.json", "x")).rejects.toBeInstanceOf(DrivePausedError);
    await expect(folder.writeLive("p1", "a.estoria.json", "x")).rejects.toBeInstanceOf(DrivePausedError);
    await expect(folder.remove("a.estoria.json")).rejects.toBeInstanceOf(DrivePausedError);
    await expect(folder.createLive("p2", "c.estoria.json", "x")).rejects.toBeInstanceOf(DrivePausedError);
    expect(((await folder.readLive("p1")) as { text: string }).text).toBe("v1");
    expect(fake.calls.filter((c) => /^(create|update|rename|trash)/.test(c))).toEqual([]);
  });
});
