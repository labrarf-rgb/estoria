import type { DriveFile } from "@/lib/drive";
import type { DriveFolder } from "@/lib/driveFolder";
import { markBackedUp } from "@/lib/driveSession";
import { canonicalFileName, projectFileText, pushCanonicalIfSafe } from "@/lib/sync";
import { normalizeDoc } from "@/store/persistence";
import { useStore } from "@/store/useStore";
import type { StoryDoc } from "@/types";

/**
 * Projects and Google Drive, from the Projects window
 * (docs/PLAN-drive-sync.md): opening a project that's only in Drive (H8, also
 * how a new iPad, or one Safari wiped, gets its work back), and backing up
 * every project at once (H11), since the mirror only covers the open one.
 */

/**
 * Open a Drive project here and link it. A project already in this browser
 * (same project ID) is switched to rather than duplicated; the next Sync then
 * compares the two like any other.
 */
export async function openFromDrive(folder: DriveFolder, file: DriveFile): Promise<"opened" | "switched"> {
  const { text } = await folder.readFile(file.id);
  const doc = normalizeDoc(JSON.parse(text));
  const st = useStore.getState();
  if (doc.id === st.doc.id || st.projectStash[doc.id]) {
    if (doc.id !== st.doc.id) st.switchProject(doc.id);
    folder.link(doc.id, file.id);
    return "switched";
  }
  st.openDoc(doc);
  const opened = useStore.getState().doc.id;
  folder.link(opened, file.id);
  markBackedUp(opened);
  return "opened";
}

export type BackupResult = "backed-up" | "needs-review" | "failed";

/** Every project in this browser, current one included, saved copies left out. */
export function allProjectDocs(): StoryDoc[] {
  const st = useStore.getState();
  return [st.doc, ...Object.values(st.projectStash)].filter((d) => !d.savedCopy);
}

/**
 * Back up each project, one at a time, without ever guessing:
 * - linked: the mirror's fast-forward (a file changed elsewhere is "needs review");
 * - not linked, name free: create its file (the click on "Back up all" is the ask, H2b);
 * - not linked, a file with its name is already there: "needs review", so the
 *   person picks or creates it from that project's own Sync.
 */
export async function backUpAll(
  folder: DriveFolder,
  onProgress: (projectId: string, result: BackupResult | "working") => void
): Promise<Record<string, BackupResult>> {
  const results: Record<string, BackupResult> = {};
  for (const doc of allProjectDocs()) {
    onProgress(doc.id, "working");
    let result: BackupResult;
    try {
      if (folder.isLinked(doc.id)) {
        const r = await pushCanonicalIfSafe(doc);
        result = r === "created" || r === "updated" || r === "in-sync" ? "backed-up" : r === "behind" ? "needs-review" : "failed";
      } else {
        const name = canonicalFileName(doc);
        if ((await folder.candidates(name)).length) result = "needs-review";
        else {
          await folder.createLive(doc.id, name, projectFileText(doc));
          // Record that Drive and this browser now agree (the fast-forward
          // reads "in sync"), or the next run would see both sides changed.
          const r = await pushCanonicalIfSafe(doc);
          result = r === "in-sync" ? "backed-up" : "failed";
        }
      }
    } catch {
      result = "failed";
    }
    if (result === "backed-up") markBackedUp(doc.id);
    results[doc.id] = result;
    onProgress(doc.id, result);
  }
  return results;
}
