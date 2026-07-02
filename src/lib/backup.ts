import type { StoryDoc } from "@/types";
import { downloadProjectFile, slugify } from "@/store/persistence";

/**
 * One-click project backups (Footer "Back up" button).
 *
 * The user picks a backup folder once (File System Access API); the directory
 * handle is remembered in IndexedDB so every later click writes straight into
 * that folder with no dialogs. Each backup is a timestamped
 * `<project>-backup-<stamp>.estoria.json`; the newest MAX_BACKUPS per project
 * are kept and older ones pruned, so a bad state can never overwrite the only
 * good copy. Browsers without the API (Firefox/Safari) fall back to a plain
 * download.
 */

/** How many backups to keep per project before pruning the oldest. */
const MAX_BACKUPS = 5;

// lib.dom ships the FileSystem*Handle types but not the WICG directory picker
// or the permission / iteration methods, so declare the few extras we use.
interface BackupDirHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  queryPermission(desc: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(desc: { mode: "readwrite" }): Promise<PermissionState>;
}
type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

/** Whether this browser can remember a backup folder (Chromium only). */
export function isBackupPickerSupported(): boolean {
  return typeof window !== "undefined" && !!(window as PickerWindow).showDirectoryPicker;
}

// ---- Remembering the folder handle (IndexedDB; handles can't go in
// localStorage). All best-effort: if IDB is unavailable (private mode), the
// feature still works — the user is just re-prompted per session. ------------

const DB_NAME = "estoria-backup";
const DB_STORE = "handles";
const DB_KEY = "dir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetDir(): Promise<BackupDirHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve((req.result as BackupDirHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSetDir(handle: BackupDirHandle | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const store = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE);
      const req = handle ? store.put(handle, DB_KEY) : store.delete(DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Non-fatal: the in-session handle still works, it just isn't remembered.
  }
}

// In-session cache so a failed IDB doesn't force a re-prompt on every click.
let sessionDir: BackupDirHandle | null = null;

/** Name of the currently configured backup folder, or null if unset. */
export async function getBackupDirName(): Promise<string | null> {
  const dir = sessionDir ?? (await idbGetDir());
  return dir?.name ?? null;
}

/**
 * Let the user pick (or change) the backup folder. Returns its name, or null
 * if they cancelled the picker.
 */
export async function chooseBackupFolder(): Promise<string | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const dir = (await picker({ id: "estoria-backups", mode: "readwrite" })) as BackupDirHandle;
    sessionDir = dir;
    await idbSetDir(dir);
    return dir.name;
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return null; // user cancelled
    throw e;
  }
}

export interface BackupResult {
  fileName: string;
  dirName: string | null;
  /** "folder" = written into the chosen folder; "download" = browser fallback. */
  via: "folder" | "download";
  /** How many backups of this project remain after pruning. */
  kept: number;
}

async function ensurePermission(dir: BackupDirHandle): Promise<boolean> {
  if ((await dir.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await dir.requestPermission({ mode: "readwrite" })) === "granted";
}

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Back up the given project. Uses the remembered folder, prompting for one on
 * first use; falls back to a plain download where pickers are unsupported.
 * Returns null if the user cancelled the folder prompt.
 */
export async function backupProject(doc: StoryDoc): Promise<BackupResult | null> {
  const slug = slugify(doc.projectTitle || "story");

  if (!isBackupPickerSupported()) {
    downloadProjectFile(doc);
    return { fileName: `${slug}.estoria.json`, dirName: null, via: "download", kept: 1 };
  }

  let dir = sessionDir ?? (await idbGetDir());
  if (!dir) {
    if ((await chooseBackupFolder()) === null) return null;
    dir = sessionDir;
    if (!dir) return null;
  }
  sessionDir = dir;

  if (!(await ensurePermission(dir))) {
    throw new Error("Estoria wasn't allowed to write to the backup folder.");
  }

  const prefix = `${slug}-backup-`;
  const fileName = `${prefix}${stamp()}.estoria.json`;
  try {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(doc, null, 2));
    await w.close();

    // Prune: keep only the newest MAX_BACKUPS for this project. Timestamps in
    // the name sort lexicographically, so a name sort is a date sort.
    const mine: string[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "file" && entry.name.startsWith(prefix) && entry.name.endsWith(".estoria.json")) {
        mine.push(entry.name);
      }
    }
    mine.sort(); // oldest first
    const excess = mine.slice(0, Math.max(0, mine.length - MAX_BACKUPS));
    for (const name of excess) {
      await dir.removeEntry(name).catch(() => {});
    }

    return {
      fileName,
      dirName: dir.name,
      via: "folder",
      kept: Math.min(mine.length, MAX_BACKUPS),
    };
  } catch (e) {
    // The folder may have been deleted/moved since it was picked — forget it
    // so the next click re-prompts instead of failing forever.
    if ((e as DOMException)?.name === "NotFoundError") {
      sessionDir = null;
      await idbSetDir(null);
    }
    throw e;
  }
}
