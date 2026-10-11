import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import type { SyncFolder } from "@/lib/syncFolder";
import type { DriveLink } from "@/lib/driveFolder";
import { DriveRevisionMovedError } from "@/lib/driveErrors";
import { FakeDrive } from "@/test/fakeDrive";
import { memoryStorage } from "@/test/memoryDir";

/**
 * Sync (lib/sync.ts) running over Google Drive: the same three-way compare,
 * conflict copies and backups as the folder target, plus Drive's rules: ask
 * before creating (H2b), follow the file by ID through renames (H3), and
 * never overwrite a file that moved mid-sync (H4).
 */

let active: SyncFolder | null = null;

vi.mock("@/lib/syncFolder", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/syncFolder")>();
  return { ...real, getSyncFolder: vi.fn(async () => active), forgetSyncFolder: vi.fn(async () => {}) };
});

const { DriveFolder } = await import("@/lib/driveFolder");
const { checkRemoteChanged, fingerprint, listProjectFiles, pushCanonicalIfSafe, resolveConflict, syncProject } =
  await import("@/lib/sync");

let fake: FakeDrive;
let folderId: string;
let links: Map<string, DriveLink>;
let drive: InstanceType<typeof DriveFolder>;

const LIVE = "my-story.estoria.json";

function makeDoc(): StoryDoc {
  return normalizeDoc({
    id: "p1",
    projectTitle: "My Story",
    chapters: [{ id: "c1", title: "Arrival", scenes: ["She lands."] }],
  });
}
const retitle = (doc: StoryDoc, title: string): StoryDoc => ({
  ...doc,
  chapters: doc.chapters.map((c) => ({ ...c, title })),
});
const content = (id: string) => normalizeDoc(JSON.parse(fake.files.get(id)!.content));

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11, 9, 0, 0));
  fake = new FakeDrive();
  folderId = fake.folder();
  links = new Map();
  drive = new DriveFolder(
    fake.api(),
    folderId,
    { get: (id) => links.get(id) ?? null, set: (id, l) => (l ? links.set(id, l) : links.delete(id)) },
    () => false
  );
  active = drive;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tick = () => vi.setSystemTime(Date.now() + 1000);

/** Link the project the way "Create it" will: an explicit step, then a normal Sync. */
async function connected(doc = makeDoc()) {
  const id = await drive.createLive(doc.id, LIVE, JSON.stringify(doc));
  expect((await syncProject(doc)).kind).toBe("in-sync");
  return id;
}

describe("before a file is linked (H2b)", () => {
  it("Sync asks instead of creating", async () => {
    expect(await syncProject(makeDoc())).toEqual({ kind: "needs-link", fileName: LIVE });
    expect(fake.live(folderId)).toHaveLength(0);
  });

  it("the background mirror never creates a file either", async () => {
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("unlinked");
    expect(await checkRemoteChanged(makeDoc())).toBe(false);
    expect(fake.calls.some((c) => c.startsWith("create"))).toBe(false);
  });

  it("an existing Drive copy, once picked, starts as a conflict if it differs (H1/H17)", async () => {
    const theirs = fake.put(folderId, LIVE, JSON.stringify(retitle(makeDoc(), "From the phone")));
    drive.link("p1", theirs);
    expect((await syncProject(makeDoc())).kind).toBe("conflict");
  });

  it("an existing Drive copy, once picked, reads in sync when it matches (H8)", async () => {
    const same = fake.put(folderId, LIVE, JSON.stringify(makeDoc()));
    drive.link("p1", same);
    expect((await syncProject(makeDoc())).kind).toBe("in-sync");
  });
});

describe("once linked", () => {
  it("pushes local edits into the same file, and backs up beside it", async () => {
    const id = await connected();
    tick();
    const mine = retitle(makeDoc(), "Arrival, revised");
    expect((await syncProject(mine)).kind).toBe("pushed");
    expect(content(id).chapters[0].title).toBe("Arrival, revised");
    expect(fake.named(folderId, LIVE).map((f) => f.id)).toEqual([id]);
    expect(fake.live(folderId).filter((f) => f.name.includes("-backup-")).length).toBe(2);
  });

  it("the mirror fast-forwards in the background", async () => {
    const id = await connected();
    expect(await pushCanonicalIfSafe(retitle(makeDoc(), "Mirrored"))).toBe("updated");
    expect(content(id).chapters[0].title).toBe("Mirrored");
  });

  it("pulls what the phone wrote, and notices it in the background", async () => {
    const id = await connected();
    const theirs = retitle(makeDoc(), "From the phone");
    fake.writeExternally(id, JSON.stringify(theirs));
    expect(await checkRemoteChanged(makeDoc())).toBe(true);
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("behind");
    tick();
    const res = await syncProject(makeDoc());
    expect(res.kind).toBe("pulled");
    if (res.kind === "pulled") expect(await fingerprint(res.doc)).toBe(await fingerprint(theirs));
  });

  it("keeps the link when the pulled file carries another project ID", async () => {
    const id = await connected();
    // Linked to a file that holds a different project ID (picked by hand, or
    // written by another device's copy of the project).
    const theirs = { ...retitle(makeDoc(), "From the phone"), id: "p9" };
    fake.writeExternally(id, JSON.stringify(theirs));
    tick();
    const res = await syncProject(makeDoc());
    expect(res.kind).toBe("pulled");
    if (res.kind !== "pulled") return;
    // The app now works on the pulled project, under its ID.
    expect(links.get("p9")?.fileId).toBe(id);
    expect(links.has("p1")).toBe(false);
    tick();
    expect((await syncProject(res.doc)).kind).toBe("in-sync");
  });

  it("keeps the link when 'theirs' wins a conflict and carries another project ID", async () => {
    const id = await connected();
    const theirs = { ...retitle(makeDoc(), "From the phone"), id: "p9" };
    fake.writeExternally(id, JSON.stringify(theirs));
    tick();
    const mine = retitle(makeDoc(), "From the laptop");
    const res = await syncProject(mine);
    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") return;
    const receipt = await resolveConflict(mine, res.remote, "theirs", res.rev);
    expect(links.get("p9")?.fileId).toBe(id);
    tick();
    expect((await syncProject(receipt.applied!)).kind).toBe("in-sync");
  });

  it("downloads the live file only when its revision moved (H13)", async () => {
    const id = await connected();
    const downloads = () => fake.calls.filter((c) => c === `download:${id}`).length;
    const before = downloads();
    // Mirror writes while typing, and checks on focus: the file only changes
    // by this device's own writes, so nothing is downloaded.
    let doc = makeDoc();
    for (let i = 0; i < 3; i++) {
      doc = retitle(doc, `Take ${i}`);
      expect(await pushCanonicalIfSafe(doc)).toBe("updated");
      expect(await checkRemoteChanged(doc)).toBe(false);
    }
    expect(downloads()).toBe(before);
    // The phone writes: one download, then nothing again until the next change.
    fake.writeExternally(id, JSON.stringify(retitle(makeDoc(), "From the phone")));
    expect(await checkRemoteChanged(doc)).toBe(true);
    expect(await checkRemoteChanged(doc)).toBe(true);
    expect(await pushCanonicalIfSafe(doc)).toBe("behind");
    expect(downloads()).toBe(before + 1);
  });

  it("keeping 'theirs' names the file after the kept title, once", async () => {
    const id = await connected();
    const theirs = { ...retitle(makeDoc(), "From the phone"), projectTitle: "Phone Title" };
    fake.writeExternally(id, JSON.stringify(theirs));
    tick();
    const mine = retitle(makeDoc(), "From the laptop");
    const res = await syncProject(mine);
    if (res.kind !== "conflict") throw new Error(res.kind);
    const receipt = await resolveConflict(mine, res.remote, "theirs", res.rev);
    expect(fake.files.get(id)!.name).toBe("phone-title.estoria.json");
    const renames = () => fake.calls.filter((c) => c.startsWith(`rename:${id}`)).length;
    const before = renames();
    tick();
    expect((await syncProject(receipt.applied!)).kind).toBe("in-sync");
    expect(renames()).toBe(before);
  });

  it("a conflict keeps both: the copy not kept is saved beside the live file", async () => {
    const id = await connected();
    fake.writeExternally(id, JSON.stringify(retitle(makeDoc(), "From the phone")));
    tick();
    const mine = retitle(makeDoc(), "From the laptop");
    const res = await syncProject(mine);
    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") return;
    const receipt = await resolveConflict(mine, res.remote, "mine");
    expect(content(id).chapters[0].title).toBe("From the laptop");
    const copy = fake.named(folderId, receipt.conflictFileNames[0])[0];
    expect(content(copy.id).chapters[0].title).toBe("From the phone");
  });

  it("a renamed project renames its file in place: same ID, so the phone keeps following it (H3)", async () => {
    const id = await connected();
    tick();
    const renamed = { ...makeDoc(), projectTitle: "Better Title" };
    expect((await syncProject(renamed)).kind).toBe("pushed");
    expect(fake.files.get(id)?.name).toBe("better-title.estoria.json");
    expect(fake.live(folderId).filter((f) => !f.name.includes("-backup-")).map((f) => f.id)).toEqual([id]);
  });

  it("writes nothing when another device wrote between the compare and the write (H4)", async () => {
    const id = await connected();
    tick();
    // The phone writes right after Estoria read the file, before it writes.
    let gets = 0;
    fake.beforeGet = (fid) => {
      if (fid === id && ++gets === 2) fake.writeExternally(id, JSON.stringify(retitle(makeDoc(), "From the phone")));
    };
    await expect(syncProject(retitle(makeDoc(), "From the laptop"))).rejects.toBeInstanceOf(DriveRevisionMovedError);
    expect(content(id).chapters[0].title).toBe("From the phone");

    // The next Sync sees both sides changed: a conflict, nothing lost.
    fake.beforeGet = null;
    tick();
    expect((await syncProject(retitle(makeDoc(), "From the laptop"))).kind).toBe("conflict");
  });

  it("backups rotate to 5, and the older ones go to Drive's trash (H7)", async () => {
    await connected();
    for (let i = 0; i < 6; i++) {
      tick();
      await syncProject(retitle(makeDoc(), `Take ${i}`));
    }
    const backups = [...fake.files.values()].filter((f) => f.name.includes("-backup-"));
    expect(backups.filter((f) => !f.trashed)).toHaveLength(5);
    expect(backups.filter((f) => f.trashed)).toHaveLength(2);
  });

  it("history lists the live file first", async () => {
    await connected();
    tick();
    await syncProject(retitle(makeDoc(), "Second"));
    const files = (await listProjectFiles(makeDoc()))!;
    expect(files[0]).toMatchObject({ name: LIVE, role: "live" });
    expect(files.slice(1).every((f) => f.role === "backup")).toBe(true);
  });
});

describe("B2 safety rules", () => {
  it("backs up local work before loading a newer file over it (H15b)", async () => {
    const id = await connected();
    const mineBefore = makeDoc();
    fake.writeExternally(id, JSON.stringify(retitle(makeDoc(), "From the phone")));
    tick();
    expect((await syncProject(mineBefore)).kind).toBe("pulled");
    const saved = fake.live(folderId).find((f) => f.name.endsWith("-before-pull.estoria.json"));
    expect(saved).toBeDefined();
    expect(await fingerprint(content(saved!.id))).toBe(await fingerprint(mineBefore));
  });

  it("resolving a conflict writes nothing if the phone saved while the dialog was open (R8)", async () => {
    const id = await connected();
    fake.writeExternally(id, JSON.stringify(retitle(makeDoc(), "Phone, first")));
    tick();
    const mine = retitle(makeDoc(), "Laptop");
    const res = await syncProject(mine);
    expect(res.kind).toBe("conflict");
    if (res.kind !== "conflict") return;
    expect(res.rev).toBeDefined();

    fake.writeExternally(id, JSON.stringify(retitle(makeDoc(), "Phone, while you decided")));
    await expect(resolveConflict(mine, res.remote, "mine", res.rev)).rejects.toBeInstanceOf(DriveRevisionMovedError);
    expect(content(id).chapters[0].title).toBe("Phone, while you decided");
  });

  it("asks before syncing a project linked under another account (H16)", async () => {
    const id = fake.put(folderId, LIVE, JSON.stringify(makeDoc()));
    links.set("p1", { fileId: id, account: "old@example.com" });
    active = new DriveFolder(
      fake.api(),
      folderId,
      { get: (pid) => links.get(pid) ?? null, set: (pid, l) => (l ? links.set(pid, l) : links.delete(pid)) },
      () => false,
      "new@example.com"
    );
    expect(await syncProject(makeDoc())).toEqual({
      kind: "account-changed",
      fileName: LIVE,
      from: "old@example.com",
      to: "new@example.com",
    });
    expect(await pushCanonicalIfSafe(makeDoc())).toBe("account-changed");
    expect(fake.calls.some((c) => /^(create|update)/.test(c))).toBe(false);
  });
});
