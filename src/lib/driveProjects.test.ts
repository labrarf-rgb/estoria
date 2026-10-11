import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import type { SyncFolder } from "@/lib/syncFolder";
import type { DriveLink } from "@/lib/driveFolder";
import { FakeDrive } from "@/test/fakeDrive";
import { memoryStorage } from "@/test/memoryDir";

/** "Open from Google Drive" (H8) and "Back up all" (H11), against an in-memory Drive and a stand-in store. */

let active: SyncFolder | null = null;
vi.mock("@/lib/syncFolder", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/syncFolder")>();
  return { ...real, getSyncFolder: vi.fn(async () => active), forgetSyncFolder: vi.fn(async () => {}) };
});

const store = {
  doc: null as unknown as StoryDoc,
  projectStash: {} as Record<string, StoryDoc>,
  switchProject: vi.fn((id: string) => {
    const next = store.projectStash[id];
    store.projectStash = { ...store.projectStash, [store.doc.id]: store.doc };
    delete store.projectStash[id];
    store.doc = next;
  }),
  openDoc: vi.fn((doc: StoryDoc) => {
    store.projectStash = { ...store.projectStash, [store.doc.id]: store.doc };
    store.doc = doc;
  }),
};
vi.mock("@/store/useStore", () => ({ useStore: { getState: () => store } }));

const { DriveFolder } = await import("@/lib/driveFolder");
const { backUpAll, openFromDrive } = await import("@/lib/driveProjects");
const { pushCanonicalIfSafe } = await import("@/lib/sync");

let fake: FakeDrive;
let folderId: string;
let links: Map<string, DriveLink>;
let drive: InstanceType<typeof DriveFolder>;

const project = (id: string, title: string, chapter = "One"): StoryDoc =>
  normalizeDoc({ id, projectTitle: title, chapters: [{ id: "c1", title: chapter }] });

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
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
  store.doc = project("a", "Alpha");
  store.projectStash = { b: project("b", "Beta") };
  vi.clearAllMocks();
});

afterEach(() => vi.unstubAllGlobals());

describe("Open from Google Drive (H8)", () => {
  it("opens a project that's only in Drive, and links it", async () => {
    const id = fake.put(folderId, "gamma.estoria.json", JSON.stringify(project("g", "Gamma")));
    const [file] = await drive.liveFiles();
    expect(await openFromDrive(drive, file)).toBe("opened");
    expect(store.doc.projectTitle).toBe("Gamma");
    expect(links.get(store.doc.id)?.fileId).toBe(id);
  });

  it("a project opened from Drive starts in agreement with its file", async () => {
    const id = fake.put(folderId, "gamma.estoria.json", JSON.stringify(project("g", "Gamma")));
    // Opening tidies the project (the real store recounts words and brings
    // older files up to date), so the copy here can differ from the file.
    store.openDoc.mockImplementationOnce((doc: StoryDoc) => {
      store.projectStash = { ...store.projectStash, [store.doc.id]: store.doc };
      store.doc = { ...doc, chapters: doc.chapters.map((c) => ({ ...c, title: `${c.title} (tidied)` })) };
    });
    const [file] = await drive.liveFiles();
    await openFromDrive(drive, file);
    // A fast-forward to Drive, not "changed elsewhere" and a conflict.
    expect(await pushCanonicalIfSafe(store.doc)).toBe("updated");
    expect(JSON.parse(fake.files.get(id)!.content).chapters[0].title).toBe("One (tidied)");
  });

  it("switches to a project already here instead of duplicating it", async () => {
    const id = fake.put(folderId, "beta.estoria.json", JSON.stringify(project("b", "Beta", "Changed on the phone")));
    const [file] = await drive.liveFiles();
    expect(await openFromDrive(drive, file)).toBe("switched");
    expect(store.openDoc).not.toHaveBeenCalled();
    expect(store.doc.id).toBe("b");
    expect(store.doc.chapters[0].title).toBe("One"); // local work untouched; Sync will compare
    expect(links.get("b")?.fileId).toBe(id);
  });
});

describe("Back up all (H11)", () => {
  it("creates files for projects not in Drive yet", async () => {
    const results = await backUpAll(drive, () => {});
    expect(results).toEqual({ a: "backed-up", b: "backed-up" });
    expect(fake.live(folderId).map((f) => f.name).sort()).toEqual(["alpha.estoria.json", "beta.estoria.json"]);
    expect(links.has("a") && links.has("b")).toBe(true);
  });

  it("never guesses: a name already in Drive is left for the person to pick", async () => {
    fake.put(folderId, "beta.estoria.json", JSON.stringify(project("b", "Beta", "Phone")));
    const results = await backUpAll(drive, () => {});
    expect(results.b).toBe("needs-review");
    expect(links.has("b")).toBe(false);
    expect(fake.named(folderId, "beta.estoria.json")).toHaveLength(1);
  });

  it("fast-forwards linked projects, and flags one changed elsewhere", async () => {
    await backUpAll(drive, () => {});
    // Alpha edited here; Beta's file edited on the phone.
    store.doc = project("a", "Alpha", "Edited here");
    const beta = fake.named(folderId, "beta.estoria.json")[0];
    fake.writeExternally(beta.id, JSON.stringify(project("b", "Beta", "Phone")));
    const results = await backUpAll(drive, () => {});
    expect(results).toEqual({ a: "backed-up", b: "needs-review" });
    expect(JSON.parse(fake.named(folderId, "alpha.estoria.json")[0].content).chapters[0].title).toBe("Edited here");
    expect(JSON.parse(fake.files.get(beta.id)!.content).chapters[0].title).toBe("Phone");
  });

  it("reports progress per project, and leaves saved copies out", async () => {
    store.projectStash.s = { ...project("s", "Saved"), savedCopy: { reason: "expand", savedAt: "2026-10-11T09:00:00Z", fromId: "a" } };
    const seen: string[] = [];
    await backUpAll(drive, (id, r) => seen.push(`${id}:${r}`));
    expect(seen).toEqual(["a:working", "a:backed-up", "b:working", "b:backed-up"]);
  });
});
