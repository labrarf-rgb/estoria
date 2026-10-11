import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptPickedFolder,
  connectDriveFolder,
  DriveFolder,
  isLiveFileName,
  localLinks,
  type DriveLink,
  type LinkStore,
} from "@/lib/driveFolder";
import { driveFolderRef, setDriveFolderRef, type DriveFolderRef } from "@/lib/syncTarget";
import { memoryStorage } from "@/test/memoryDir";
import {
  DriveAccountChangedError,
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
  vi.stubGlobal("localStorage", memoryStorage());
  fake = new FakeDrive();
  folderId = fake.folder();
  links = new Map();
  paused = false;
  folder = new DriveFolder(fake.api(), folderId, store(), () => paused, "writer@example.com");
});

afterEach(() => vi.unstubAllGlobals());

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
    expect(isLiveFileName("my-story-backup-20261011-090000-before-pull.estoria.json")).toBe(false);
    expect(isLiveFileName("my-story-conflict-20261011-090000-local.estoria.json")).toBe(false);
  });

  it("lists projects whose titles contain backup, conflict or saved", async () => {
    // Titles like "My Backup Plan" are projects, not copies: only a real
    // stamped copy name is left out.
    for (const name of [
      "my-backup-plan.estoria.json",
      "conflict-resolution.estoria.json",
      "saved-by-the-bell.estoria.json",
      "alpha-backup-1.estoria.json",
    ]) {
      fake.put(folderId, name, "{}");
    }
    expect((await folder.liveFiles()).map((f) => f.name).sort()).toEqual([
      "alpha-backup-1.estoria.json",
      "conflict-resolution.estoria.json",
      "my-backup-plan.estoria.json",
      "saved-by-the-bell.estoria.json",
    ]);
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

describe("accounts and re-linking (H16, H1)", () => {
  it("refuses to read a project linked under another account", async () => {
    const id = fake.put(folderId, "a.estoria.json", "v1");
    links.set("p1", { fileId: id, account: "old@example.com" });
    const err = await folder.readLive("p1").catch((e) => e);
    expect(err).toBeInstanceOf(DriveAccountChangedError);
    expect(err).toMatchObject({ from: "old@example.com", to: "writer@example.com" });
  });

  it("linking a different file forgets the old agreement; re-linking the same one keeps it", async () => {
    const key = "estoria:sync:lastHash:drive:p1";
    const a = fake.put(folderId, "a.estoria.json", "v1");
    folder.link("p1", a);
    localStorage.setItem(key, "agreed");
    folder.link("p1", a);
    expect(localStorage.getItem(key)).toBe("agreed");
    folder.link("p1", fake.put(folderId, "a-copy.estoria.json", "v0"));
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("unlinking drops the link and the agreement, so the next Sync asks again", async () => {
    folder.link("p1", fake.put(folderId, "a.estoria.json", "v1"));
    localStorage.setItem("estoria:sync:lastHash:drive:p1", "agreed");
    folder.unlink("p1");
    expect(await folder.readLive("p1")).toBe("unlinked");
    expect(localStorage.getItem("estoria:sync:lastHash:drive:p1")).toBeNull();
  });
});

describe("setting up the Estoria folder", () => {
  let ref: DriveFolderRef | null;
  const refStore = { get: () => ref, set: (r: DriveFolderRef | null) => void (ref = r) };
  beforeEach(() => {
    ref = null;
    fake = new FakeDrive();
  });

  it("asks before creating one: an Estoria folder it can't see may exist (H17)", async () => {
    // The Drive desktop app's folder is invisible to drive.file.
    fake.put("root", "Estoria", "", "application/vnd.google-apps.folder");
    const hidden = { ...fake.api(), findFolders: async () => [] };
    expect(await connectDriveFolder(hidden, "me@example.com", {}, refStore)).toEqual({ kind: "none" });
    expect(ref).toBeNull();
    expect([...fake.files.values()].filter((f) => f.name === "Estoria")).toHaveLength(1);
  });

  it("creates it when asked to", async () => {
    const res = await connectDriveFolder(fake.api(), "me@example.com", { create: true }, refStore);
    expect(res).toMatchObject({ kind: "ready", created: true, several: false });
    expect(ref).toMatchObject({ name: "Estoria", account: "me@example.com" });
    expect(fake.files.get(ref!.id)?.mimeType).toBe("application/vnd.google-apps.folder");
  });

  it("finds the one it made before (another device, or a reinstall)", async () => {
    const existing = fake.folder();
    const res = await connectDriveFolder(fake.api(), "me@example.com", {}, refStore);
    expect(res).toMatchObject({ kind: "ready", created: false });
    expect(ref?.id).toBe(existing);
  });

  it("keeps the remembered folder while it's still there", async () => {
    fake.folder();
    const mine = fake.folder();
    ref = { id: mine, name: "Estoria", account: "me@example.com" };
    await connectDriveFolder(fake.api(), "me@example.com", {}, refStore);
    expect(ref?.id).toBe(mine);
  });

  it("looks again when the remembered folder was trashed", async () => {
    const old = fake.folder();
    fake.files.get(old)!.trashed = true;
    ref = { id: old, name: "Estoria", account: "me@example.com" };
    expect((await connectDriveFolder(fake.api(), "me@example.com", {}, refStore)).kind).toBe("none");
    const res = await connectDriveFolder(fake.api(), "me@example.com", { create: true }, refStore);
    expect(res).toMatchObject({ kind: "ready", created: true });
    expect(ref?.id).not.toBe(old);
  });

  it("asks before switching this device to another account", async () => {
    ref = { id: fake.folder(), name: "Estoria", account: "old@example.com" };
    expect(await connectDriveFolder(fake.api(), "new@example.com", {}, refStore)).toEqual({
      kind: "account-changed",
      previous: "old@example.com",
      current: "new@example.com",
    });
    expect(ref.account).toBe("old@example.com");
    const res = await connectDriveFolder(fake.api(), "new@example.com", { allowSwitch: true }, refStore);
    expect(res.kind).toBe("ready");
    expect(ref?.account).toBe("new@example.com");
  });

  it("doesn't make a second folder when the create's reply was lost", async () => {
    const api = fake.api();
    const flaky = {
      ...api,
      createFolder: async (name: string) => {
        await api.createFolder(name);
        throw new DriveOfflineError();
      },
    };
    const res = await connectDriveFolder(flaky, "me@example.com", { create: true }, refStore);
    expect(res.kind).toBe("ready");
    expect([...fake.files.values()].filter((f) => f.name === "Estoria")).toHaveLength(1);
  });

  it("choosing a different folder drops links to files in the old one", () => {
    setDriveFolderRef({ id: "old-folder", name: "Estoria", account: "me@example.com" });
    localLinks.set("p1", { fileId: "f-old", account: "me@example.com" });
    adoptPickedFolder({ id: "old-folder", name: "Estoria" }, "me@example.com");
    expect(localLinks.get("p1")?.fileId).toBe("f-old"); // same folder: links stay
    adoptPickedFolder({ id: "desktop-folder", name: "Estoria" }, "me@example.com");
    expect(localLinks.get("p1")).toBeNull();
    expect(driveFolderRef()?.id).toBe("desktop-folder");
  });

  it("says when several Estoria folders exist, and uses the newest", async () => {
    fake.folder();
    const newer = fake.folder();
    const res = await connectDriveFolder(fake.api(), "me@example.com", {}, refStore);
    expect(res).toMatchObject({ kind: "ready", several: true });
    expect(ref?.id).toBe(newer);
  });
});
