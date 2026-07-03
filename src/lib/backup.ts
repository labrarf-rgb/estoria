import type { StoryDoc } from "@/types";
import { slugify, stampModified } from "@/store/persistence";

/**
 * The user's Estoria folder + rotating backups.
 *
 * The user picks their Estoria folder once (File System Access API); the
 * directory handle is remembered in IndexedDB so later writes need no dialogs.
 * This folder is where cross-app Sync (lib/sync.ts) keeps the canonical
 * `<slug>.estoria.json`, and where each explicit Sync also drops a timestamped
 * `<slug>-backup-<stamp>.estoria.json` — the newest MAX_BACKUPS per project
 * are kept and older ones pruned, so a bad state can never overwrite the only
 * good copy. Browsers without the API (Firefox/Safari) get neither: they keep
 * local auto-save and the export menus only.
 */

/** How many rotating backups to keep per project before pruning the oldest. */
export const MAX_BACKUPS = 5;

// lib.dom ships the FileSystem*Handle types but not the WICG directory picker
// or the permission / iteration methods, so declare the few extras we use.
export interface BackupDirHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  queryPermission(desc: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(desc: { mode: "readwrite" }): Promise<PermissionState>;
}
type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }) => Promise<FileSystemDirectoryHandle>;
};

// Set when the picker throws SecurityError at runtime; from then on backups
// go straight to the download fallback instead of failing.
let pickerBlocked = false;

/**
 * Chromium blocks the File System Access pickers inside cross-origin iframes
 * (e.g. the portfolio embed on labrarf.com iframing the github.io app) — the
 * call throws SecurityError and no dialog appears. There is no Permissions-
 * Policy `allow` token to delegate it (unlike clipboard), so detect the
 * situation and use the download fallback there.
 */
function inCrossOriginFrame(): boolean {
  if (typeof window === "undefined" || window.self === window.top) return false;
  try {
    // Throws for a cross-origin parent; same-origin frames may use pickers.
    void window.top!.location.href;
    return false;
  } catch {
    return true;
  }
}

/** Whether this context can remember a backup folder (Chromium, not embedded). */
export function isBackupPickerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as PickerWindow).showDirectoryPicker &&
    !inCrossOriginFrame() &&
    !pickerBlocked
  );
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
 * The remembered folder handle with readwrite permission, or null. This is the
 * shared "Estoria folder" the cross-app Sync feature reads/writes too (see
 * lib/sync.ts). With `requestPermission: false` it never shows a permission
 * prompt — required for background checks, which run without a user gesture.
 */
export async function getBackupDir(opts?: {
  requestPermission?: boolean;
}): Promise<BackupDirHandle | null> {
  const dir = sessionDir ?? (await idbGetDir());
  if (!dir) return null;
  sessionDir = dir;
  if ((await dir.queryPermission({ mode: "readwrite" })) === "granted") return dir;
  if (!opts?.requestPermission) return null;
  return (await dir.requestPermission({ mode: "readwrite" })) === "granted" ? dir : null;
}

/**
 * Let the user pick (or change) the backup folder. Returns its name, or null
 * if they cancelled the picker.
 */
export async function chooseBackupFolder(): Promise<string | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    // startIn steers the first pick toward Documents: Chrome refuses
    // system-adjacent locations (home root, Library, drive roots) with a
    // "contains system files" message, so a normal subfolder is what we want.
    // With `id` set, later picks reopen wherever the user last chose.
    const dir = (await picker({
      id: "estoria-backups",
      mode: "readwrite",
      startIn: "documents",
    })) as BackupDirHandle;
    sessionDir = dir;
    await idbSetDir(dir);
    return dir.name;
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return null; // user cancelled
    // Blocked picker (e.g. an embedding context the support check missed):
    // remember, so the UI stops offering folder features this session.
    if ((e as DOMException)?.name === "SecurityError") {
      pickerBlocked = true;
      return null;
    }
    throw e;
  }
}

/**
 * Forget the remembered folder (it was moved/deleted, or writes started
 * failing) so the next folder action re-prompts instead of failing forever.
 */
export async function forgetBackupDir(): Promise<void> {
  sessionDir = null;
  await idbSetDir(null);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local-time stamp for file names; lexicographic order == date order. */
export function fileStamp(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Write a timestamped `<slug>-backup-<stamp>.estoria.json` into the folder,
 * then prune to the newest MAX_BACKUPS for that project (timestamps in the
 * name sort lexicographically, so a name sort is a date sort). Called by Sync
 * on every explicit sync — the rotating safety net under the canonical file.
 */
export async function writeRotatingBackup(
  dir: BackupDirHandle,
  doc: StoryDoc
): Promise<{ fileName: string; kept: number }> {
  const prefix = `${slugify(doc.projectTitle || "story")}-backup-`;
  const fileName = `${prefix}${fileStamp()}.estoria.json`;
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(stampModified(doc), null, 2));
  await w.close();

  const mine: string[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && entry.name.startsWith(prefix) && entry.name.endsWith(".estoria.json")) {
      mine.push(entry.name);
    }
  }
  mine.sort(); // oldest first
  for (const name of mine.slice(0, Math.max(0, mine.length - MAX_BACKUPS))) {
    await dir.removeEntry(name).catch(() => {});
  }
  return { fileName, kept: Math.min(mine.length, MAX_BACKUPS) };
}
