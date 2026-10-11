import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryDoc } from "@/types";
import { normalizeDoc } from "@/store/persistence";
import type { SyncFolder, SyncTarget } from "@/lib/syncFolder";
import { MemoryDir, memoryStorage } from "@/test/memoryDir";

/**
 * The two Phase A safety rules that need more than one folder or one tab
 * (docs/PLAN-drive-sync.md): baselines kept per target (H1), and every tab
 * taking turns through one Web Lock (H12).
 */

let active: SyncFolder | null = null;

vi.mock("@/lib/syncFolder", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/syncFolder")>();
  return {
    ...real,
    getSyncFolder: vi.fn(async () => active),
    forgetSyncFolder: vi.fn(async () => {
      active = null;
    }),
  };
});

const { LocalFolder } = await import("@/lib/syncFolder");

/** An in-memory folder presenting itself as the given target. */
function folderAs(target: SyncTarget, dir: MemoryDir): SyncFolder {
  const f = new LocalFolder(dir.asHandle());
  return {
    target,
    label: target,
    read: (n) => f.read(n),
    write: (n, t) => f.write(n, t),
    list: () => f.list(),
    remove: (n) => f.remove(n),
  };
}

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

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  active = null;
});

describe("per-target baselines (H1)", () => {
  it("an older copy on a newly chosen target is a conflict, never a pull over newer work", async () => {
    const { syncProject, pushCanonicalIfSafe } = await import("@/lib/sync");
    const folderDir = new MemoryDir();
    const driveDir = new MemoryDir();
    const v1 = makeDoc();
    const v2 = retitle(v1, "Arrival, revised");

    // Drive got v1 some time ago (say, from another device).
    driveDir.put(LIVE, JSON.stringify(v1));

    // This device works on the folder target up to v2.
    active = folderAs("folder", folderDir);
    await syncProject(v1);
    expect(await pushCanonicalIfSafe(v2)).toBe("updated");

    // Switching to Drive must not treat v1 as "only the file changed".
    active = folderAs("drive", driveDir);
    const res = await syncProject(v2);
    expect(res.kind).toBe("conflict");
    expect(await pushCanonicalIfSafe(v2)).toBe("behind");
  });

  it("each target fast-forwards against its own agreement", async () => {
    const { syncProject } = await import("@/lib/sync");
    const folderDir = new MemoryDir();
    const driveDir = new MemoryDir();
    const doc = makeDoc();

    active = folderAs("folder", folderDir);
    await syncProject(doc);
    active = folderAs("drive", driveDir);
    await syncProject(doc);

    const next = retitle(doc, "Arrival, revised");
    expect((await syncProject(next)).kind).toBe("pushed");
    active = folderAs("folder", folderDir);
    expect((await syncProject(next)).kind).toBe("pushed");
  });

  it("the folder target keeps the baseline earlier builds saved", async () => {
    const { fingerprint, lastSyncedKey, syncProject } = await import("@/lib/sync");
    const dir = new MemoryDir();
    const doc = makeDoc();
    dir.put(LIVE, JSON.stringify(doc));
    localStorage.setItem("estoria:sync:lastHash:p1", await fingerprint(doc));

    active = folderAs("folder", dir);
    expect(lastSyncedKey("folder", "p1")).toBe("estoria:sync:lastHash:p1");
    expect((await syncProject(retitle(doc, "Edited here"))).kind).toBe("pushed");
  });
});

describe("tabs take turns (H12)", () => {
  /** Two copies of the sync module, as two open tabs would each have. */
  async function twoTabs() {
    vi.resetModules();
    const a = await import("@/lib/sync");
    vi.resetModules();
    const b = await import("@/lib/sync");
    return [a, b] as const;
  }

  async function raceMirrors() {
    const dir = new MemoryDir();
    active = folderAs("folder", dir);
    const [tabA, tabB] = await twoTabs();
    const doc = makeDoc();
    await tabA.pushCanonicalIfSafe(doc);
    dir.log = [];
    dir.slowReads = true;
    await Promise.all([
      tabA.pushCanonicalIfSafe(retitle(doc, "From tab A")),
      tabB.pushCanonicalIfSafe(retitle(doc, "From tab B")),
    ]);
    return dir.log;
  }

  it("serializes two tabs' compare-and-write through the shared lock", async () => {
    expect(await raceMirrors()).toEqual([
      `read:${LIVE}`,
      `write:${LIVE}`,
      `read:${LIVE}`,
      `write:${LIVE}`,
    ]);
  });

  it("without Web Locks, two tabs would interleave (why the lock exists)", async () => {
    vi.stubGlobal("navigator", {});
    // Both tabs read before either writes: each compare runs on a state the
    // other is about to change.
    expect((await raceMirrors()).slice(0, 2)).toEqual([`read:${LIVE}`, `read:${LIVE}`]);
  });
});
