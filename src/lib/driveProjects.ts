import type { DriveFile } from "@/lib/drive";
import type { DriveFolder } from "@/lib/driveFolder";
import { markBackedUp, startDriveConnect } from "@/lib/driveSession";
import { activeTarget, chosenTarget, driveAvailableHere } from "@/lib/syncTarget";
import { canonicalFileName, fingerprint, projectFileText, pushCanonicalIfSafe } from "@/lib/sync";
import { setLastSynced } from "@/lib/syncBaseline";
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
  // This browser's copy was just read from that file, so the two agree.
  // Opening can tidy the project (word counts recounted, an older file
  // brought up to date); recording the file as agreed lets that tidy-up
  // fast-forward to Drive instead of reading as a conflict on the first Sync.
  setLastSynced("drive", opened, await fingerprint(doc));
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

// ---- Backing up a new project ----------------------------------------------------

const wantKey = (projectId: string) => `estoria:drive:wantBackup:${projectId}`;

/** The person said yes to backing up this project to Drive. */
export function wantDriveBackup(projectId: string): void {
  try {
    localStorage.setItem(wantKey(projectId), "1");
  } catch {
    // Without storage the project is backed up from its first Sync instead.
  }
}

export function wantsDriveBackup(projectId: string): boolean {
  try {
    return localStorage.getItem(wantKey(projectId)) === "1";
  } catch {
    return false;
  }
}

function clearWant(projectId: string): void {
  try {
    localStorage.removeItem(wantKey(projectId));
  } catch {
    // Nothing stored.
  }
}

/**
 * After a new project is created: ask whether to back it up to Google Drive,
 * or, on a device not connected yet, whether to connect. Only on devices with
 * Drive switched on, and never on one that chose a folder on this computer.
 */
export function offerDriveBackup(): void {
  if (!driveAvailableHere() || chosenTarget() === "folder") return;
  const st = useStore.getState();
  const id = st.doc.id;
  if (activeTarget() === "drive") {
    st.askConfirm({
      message: "Back up this project to Google Drive?",
      detail:
        "Estoria keeps a copy in your Estoria folder in Drive and updates it as you write, so your other devices " +
        "can open it.",
      confirmLabel: "Back up to Drive",
      cancelLabel: "Not now",
      onConfirm: () => wantDriveBackup(id),
    });
  } else {
    st.askConfirm({
      message: "Back up your projects with Google Drive?",
      detail:
        "Connect once and Estoria keeps a copy of your work in your own Google Drive, where your iPad and the " +
        "Android app can open it. You'll sign in on Google's page, then come straight back.",
      confirmLabel: "Connect Google Drive",
      cancelLabel: "Not now",
      onConfirm: () => {
        wantDriveBackup(id);
        startDriveConnect();
      },
    });
  }
}

/**
 * Make the Drive file for a project the person asked to back up, as soon as
 * that needs no guessing: its name must be free in the folder (H2b), so a
 * second "Untitled Story" waits until it's renamed. True once it's on Drive.
 */
export async function createWantedDriveFile(folder: DriveFolder, doc: StoryDoc): Promise<boolean> {
  if (!wantsDriveBackup(doc.id)) return false;
  if (folder.isLinked(doc.id)) {
    clearWant(doc.id);
    return true;
  }
  const name = canonicalFileName(doc);
  if ((await folder.candidates(name)).length) return false;
  await folder.createLive(doc.id, name, projectFileText(doc));
  clearWant(doc.id);
  // Records that Drive and this browser agree, like "Back up all".
  const r = await pushCanonicalIfSafe(doc);
  return r === "in-sync" || r === "updated";
}
