import { forgetBackupDir, getBackupDir, type BackupDirHandle } from "@/lib/backup";
import { driveSyncFolder } from "@/lib/driveFolder";
import { activeTarget } from "@/lib/syncTarget";

/**
 * SyncFolder — the four file operations cross-app Sync (lib/sync.ts) and the
 * rotating backups (lib/backup.ts) are built on, behind one interface, so a
 * second kind of Estoria folder (Google Drive, docs/PLAN-drive-sync.md) gets
 * the three-way compare, conflict copies, backups and history for free.
 *
 * Contract every implementation keeps:
 * - `read` returns null when the file doesn't exist, and throws for anything
 *   else (sync must never treat "couldn't read" as "absent" and create over it).
 * - `rev` is an opaque version of the file as read. Passing it back as
 *   `expectRev` asks the write to fail if the file moved on since that read.
 *   A folder without versions (the local one) has no `rev` and ignores it.
 * - `list` returns only `*.estoria.json` files, with a modification time for
 *   display.
 * - `remove` may be soft (Drive trashes); callers treat it as best effort.
 * - When the folder itself is gone (moved, deleted, access revoked), any
 *   operation except `read` throws `SyncFolderGoneError`, so the caller can
 *   forget it and re-prompt instead of failing forever.
 * - The project's **live file** goes through `readLive` / `writeLive`, which
 *   also know the project. A folder finds it by name. Drive finds it by the
 *   file ID this device linked to the project (H2a), renames it in place when
 *   the title changes (H3), and answers `"unlinked"` rather than ever creating
 *   one unasked (H2b).
 */

export interface SyncFileRead {
  text: string;
  rev?: string;
}

export interface SyncFileEntry {
  name: string;
  /** Modification time (ms epoch), display only. */
  lastModified: number;
}

export interface SyncFolder {
  /** Which kind of target this is; keys the per-target sync state. */
  readonly target: SyncTarget;
  /** Human name for the UI ("Estoria", "Google Drive"). */
  readonly label: string;
  read(name: string): Promise<SyncFileRead | null>;
  write(name: string, text: string, opts?: { expectRev?: string }): Promise<void>;
  list(): Promise<SyncFileEntry[]>;
  remove(name: string): Promise<void>;
  /** The project's live file: null = doesn't exist (folder), "unlinked" = no file chosen yet (Drive). */
  readLive(projectId: string, name: string): Promise<SyncFileRead | null | "unlinked">;
  writeLive(projectId: string, name: string, text: string, opts?: { expectRev?: string }): Promise<void>;
}

export type SyncTarget = "folder" | "drive";

export class SyncFolderGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncFolderGoneError";
  }
}

const isNotFound = (e: unknown) => (e as DOMException)?.name === "NotFoundError";

/**
 * A folder on this computer, through the remembered File System Access handle
 * (desktop Chromium). A NotFoundError on anything but a single-file read means
 * the folder itself went away.
 */
export class LocalFolder implements SyncFolder {
  readonly target = "folder" as const;

  constructor(private readonly dir: BackupDirHandle) {}

  get label(): string {
    return this.dir.name;
  }

  private gone(e: unknown): never {
    if (isNotFound(e)) {
      throw new SyncFolderGoneError(
        "The Estoria folder seems to have moved. Click the folder icon to pick it again."
      );
    }
    throw e;
  }

  async read(name: string): Promise<SyncFileRead | null> {
    try {
      const fh = await this.dir.getFileHandle(name);
      return { text: await (await fh.getFile()).text() };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async write(name: string, text: string): Promise<void> {
    try {
      const fh = await this.dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    } catch (e) {
      this.gone(e);
    }
  }

  async list(): Promise<SyncFileEntry[]> {
    try {
      const out: SyncFileEntry[] = [];
      for await (const entry of this.dir.values()) {
        if (entry.kind !== "file" || !entry.name.endsWith(".estoria.json")) continue;
        const f = await (entry as FileSystemFileHandle).getFile();
        out.push({ name: entry.name, lastModified: f.lastModified });
      }
      return out;
    } catch (e) {
      this.gone(e);
    }
  }

  async remove(name: string): Promise<void> {
    try {
      await this.dir.removeEntry(name);
    } catch (e) {
      this.gone(e);
    }
  }

  readLive(_projectId: string, name: string): Promise<SyncFileRead | null> {
    return this.read(name);
  }

  writeLive(_projectId: string, name: string, text: string): Promise<void> {
    return this.write(name, text);
  }
}

/**
 * This device's active Sync target, or null when none is usable. With
 * `requestPermission: false` (the default) it never prompts, which background
 * work (the mirror, the change check) requires: there is no user gesture.
 */
export async function getSyncFolder(opts?: {
  requestPermission?: boolean;
}): Promise<SyncFolder | null> {
  if (activeTarget() === "drive") return driveSyncFolder();
  const dir = await getBackupDir(opts);
  return dir ? new LocalFolder(dir) : null;
}

/** Forget the active target after it turned out to be gone, so the next action re-prompts. */
export async function forgetSyncFolder(): Promise<void> {
  // Drive never raises "gone" (a missing file is DriveFileMissingError), so
  // only the folder target has anything to forget.
  if (activeTarget() !== "drive") await forgetBackupDir();
}
