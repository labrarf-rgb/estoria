import { drive, type DriveApi, type DriveFile } from "@/lib/drive";
import {
  DriveDuplicateError,
  DriveFileMissingError,
  DriveOfflineError,
  DrivePausedError,
  DriveRevisionMovedError,
} from "@/lib/driveErrors";
import type { SyncFileEntry, SyncFileRead, SyncFolder } from "@/lib/syncFolder";
import { drivePaused, driveFolderRef } from "@/lib/syncTarget";

/**
 * The Estoria folder in the user's Google Drive, as a `SyncFolder`, so Drive
 * gets Sync's three-way compare, conflict copies, backups and history
 * unchanged (docs/PLAN-drive-sync.md, "Shape of the solution").
 *
 * What Drive needs that a folder on disk doesn't:
 * - **H2a:** the live file is found by the Drive file ID this device linked to
 *   the project, not by name. Drive allows two files with one name, and a
 *   listing can miss a brand-new file for a moment.
 * - **H2b:** a project with no link reads as `"unlinked"`. Sync then asks
 *   "pick the existing file, or create one?" instead of ever creating one.
 * - **H2c/d:** a failed create is checked by listing before anything else;
 *   after a create, two files with the name stops everything (`DriveDuplicateError`).
 * - **H3:** a renamed project renames its file in place, so the phone, which
 *   follows the file, keeps following it.
 * - **H4:** a live write first checks the file's revision against the one the
 *   compare read; if it moved, nothing is written.
 * - **H7:** removing (backup pruning) moves files to Drive's trash.
 * - **Kill switch:** while paused, every write throws `DrivePausedError`.
 */

const LINK_PREFIX = "estoria:drive:link:";

/** Which Drive file is a project's live file, on this device. */
export interface DriveLink {
  fileId: string;
  /** The account it was linked under (H16). */
  account?: string;
}

export interface LinkStore {
  get(projectId: string): DriveLink | null;
  set(projectId: string, link: DriveLink | null): void;
}

export const localLinks: LinkStore = {
  get(projectId) {
    try {
      const v = JSON.parse(localStorage.getItem(LINK_PREFIX + projectId) ?? "null") as DriveLink | null;
      return v && typeof v.fileId === "string" ? v : null;
    } catch {
      return null;
    }
  },
  set(projectId, link) {
    try {
      if (link) localStorage.setItem(LINK_PREFIX + projectId, JSON.stringify(link));
      else localStorage.removeItem(LINK_PREFIX + projectId);
    } catch {
      // Without storage the project reads as unlinked and Sync asks again.
    }
  },
};

const newestFirst = (a: DriveFile, b: DriveFile) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? "");

/** A project's live file, as opposed to its backups, conflict copies and saved copies. */
export const isLiveFileName = (name: string) =>
  name.endsWith(".estoria.json") && !/-(backup|conflict|saved)-/.test(name);

export class DriveFolder implements SyncFolder {
  readonly target = "drive" as const;
  readonly label = "Google Drive";

  constructor(
    private readonly api: DriveApi,
    readonly folderId: string,
    private readonly links: LinkStore,
    private readonly paused: () => boolean,
    private readonly account?: string
  ) {}

  private guard(): void {
    if (this.paused()) throw new DrivePausedError();
  }

  private async byName(name: string): Promise<DriveFile[]> {
    return (await this.api.list({ parent: this.folderId, name })).sort(newestFirst);
  }

  /**
   * Create, without ever making a second copy: a create is never retried, and
   * after one fails the folder is listed to see whether it landed anyway.
   */
  private async createOnce(name: string, text: string): Promise<DriveFile> {
    try {
      return await this.api.create(this.folderId, name, text);
    } catch (e) {
      if (!(e instanceof DriveOfflineError)) throw e;
      const landed = await this.byName(name).catch(() => []);
      if (landed.length) return landed[0];
      throw e;
    }
  }

  // ---- Any file, by name (backups, conflict copies, saved copies) ----------------

  async read(name: string): Promise<SyncFileRead | null> {
    const [file] = await this.byName(name);
    if (!file) return null;
    return { text: await this.api.download(file.id), rev: file.headRevisionId };
  }

  async write(name: string, text: string): Promise<void> {
    this.guard();
    const [existing] = await this.byName(name);
    if (existing) await this.api.update(existing.id, text);
    else await this.createOnce(name, text);
  }

  async list(): Promise<SyncFileEntry[]> {
    return (await this.api.list({ parent: this.folderId }))
      .filter((f) => f.name.endsWith(".estoria.json"))
      .map((f) => ({ name: f.name, lastModified: Date.parse(f.modifiedTime ?? "") || 0 }));
  }

  async remove(name: string): Promise<void> {
    this.guard();
    for (const f of await this.byName(name)) await this.api.trash(f.id);
  }

  // ---- The live file, by its linked ID ---------------------------------------------

  private async linkedFile(projectId: string): Promise<DriveFile | "unlinked"> {
    const link = this.links.get(projectId);
    if (!link) return "unlinked";
    const meta = await this.api.get(link.fileId);
    if (!meta || meta.trashed) throw new DriveFileMissingError();
    return meta;
  }

  async readLive(projectId: string): Promise<SyncFileRead | "unlinked"> {
    // Metadata before content: if the file moves in between, the revision we
    // hold is the older one, so the next write's check fails safe.
    const file = await this.linkedFile(projectId);
    if (file === "unlinked") return file;
    return { text: await this.api.download(file.id), rev: file.headRevisionId };
  }

  async writeLive(projectId: string, name: string, text: string, opts?: { expectRev?: string }): Promise<void> {
    this.guard();
    const file = await this.linkedFile(projectId);
    if (file === "unlinked") throw new Error("This project isn't linked to a Drive file yet.");
    if (opts?.expectRev && file.headRevisionId !== opts.expectRev) throw new DriveRevisionMovedError();
    if (file.name !== name) await this.api.rename(file.id, name);
    await this.api.update(file.id, text);
  }

  // ---- Linking a project to its file (the "needs-link" answers) --------------------

  /** Live project files in the Estoria folder, newest first ("Open from Google Drive", H8). */
  async liveFiles(): Promise<DriveFile[]> {
    return (await this.api.list({ parent: this.folderId })).filter((f) => isLiveFileName(f.name)).sort(newestFirst);
  }

  /** Files already carrying this name: the "is it already in Drive?" candidates. */
  candidates(name: string): Promise<DriveFile[]> {
    return this.byName(name);
  }

  /** "Pick it": this project's live file is that one. */
  link(projectId: string, fileId: string): void {
    this.links.set(projectId, { fileId, account: this.account });
  }

  isLinked(projectId: string): boolean {
    return !!this.links.get(projectId);
  }

  /**
   * "Create it": make the project's live file, only after the person said so.
   * Refuses if the name is already taken (offer those files instead), and
   * stops if the create left two files behind (H2d).
   */
  async createLive(projectId: string, name: string, text: string): Promise<string> {
    this.guard();
    const taken = await this.byName(name);
    if (taken.length) throw new DriveDuplicateError(name, taken.map((f) => f.id));
    const created = await this.createOnce(name, text);
    const after = await this.byName(name);
    if (after.length > 1) throw new DriveDuplicateError(name, after.map((f) => f.id));
    this.link(projectId, created.id);
    return created.id;
  }
}

/** This device's Drive target, or null until Drive has been set up here. */
export function driveSyncFolder(): DriveFolder | null {
  const ref = driveFolderRef();
  return ref ? new DriveFolder(drive, ref.id, localLinks, drivePaused, ref.account) : null;
}
