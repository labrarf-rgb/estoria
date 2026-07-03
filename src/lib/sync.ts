import type { StoryDoc } from "@/types";
import { normalizeDoc, slugify, stampModified } from "@/store/persistence";
import {
  fileStamp,
  forgetBackupDir,
  getBackupDir,
  writeRotatingBackup,
  type BackupDirHandle,
} from "@/lib/backup";

/**
 * Cross-app Sync — the web half of the contract in docs/SPECS.md §8
 * ("Cross-app Sync — CONTRACT SETTLED 2026-07-03"), shared with the Android
 * companion app.
 *
 * One canonical file per project lives in the user's Estoria folder (the same
 * remembered directory handle lib/backup.ts uses): `<slug>.estoria.json`.
 * Reconciliation is three-way, by content fingerprint:
 *
 *   local == remote                → in sync
 *   remote == last-synced          → only we changed  → write the file
 *   local  == last-synced          → only file changed → load it
 *   otherwise                      → conflict → user picks, loser preserved as
 *                                    `<slug>-conflict-<stamp>.estoria.json`
 *
 * The fingerprint is SHA-256 over a canonical (key-sorted) JSON serialization
 * with `modifiedAt` stripped. Hashes never leave this device, so they don't
 * need to match Android's — each app only ever compares its own. `modifiedAt`
 * is stamped on every write but is display-only (clock skew), never used to
 * decide direction.
 */

// ---- Content fingerprint -----------------------------------------------------

/** Recursively sort object keys so serialization is order-independent. */
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] !== undefined) out[k] = sortKeysDeep(src[k]);
    }
    return out;
  }
  return v;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const d = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Non-secure-context fallback (FNV-1a). Weaker, but these hashes only ever
  // compare a device's own states against each other — never cross devices.
  let h = 0x811c9dc5;
  for (const byte of data) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return `fnv-${h.toString(16)}-${data.length}`;
}

/**
 * Fingerprint of a doc's content, ignoring `modifiedAt`. Normalized first so a
 * doc and its written-then-reread self hash identically.
 */
export async function fingerprint(doc: StoryDoc): Promise<string> {
  const norm: StoryDoc = { ...normalizeDoc(doc) };
  delete norm.modifiedAt;
  return sha256Hex(JSON.stringify(sortKeysDeep(norm)));
}

// ---- "Last agreed" hash per project (the third point of the 3-way compare) ---

const lastSyncedKey = (docId: string) => `estoria:sync:lastHash:${docId}`;

function getLastSynced(docId: string): string | null {
  try {
    return localStorage.getItem(lastSyncedKey(docId));
  } catch {
    return null;
  }
}

function setLastSynced(docId: string, hash: string): void {
  try {
    localStorage.setItem(lastSyncedKey(docId), hash);
  } catch {
    // Non-fatal: without it the next divergence shows as a conflict instead
    // of a fast-forward — safe, just noisier.
  }
}

// ---- Canonical file I/O ------------------------------------------------------

export function canonicalFileName(doc: StoryDoc): string {
  return `${slugify(doc.projectTitle || "story")}.estoria.json`;
}

/** Read + normalize the canonical file. null = doesn't exist; throws if corrupt. */
async function readCanonical(dir: BackupDirHandle, fileName: string): Promise<StoryDoc | null> {
  let text: string;
  try {
    const fh = await dir.getFileHandle(fileName);
    text = await (await fh.getFile()).text();
  } catch (e) {
    if ((e as DOMException)?.name === "NotFoundError") return null;
    throw e;
  }
  try {
    return normalizeDoc(JSON.parse(text));
  } catch {
    throw new Error(`"${fileName}" exists but couldn't be read as an Estoria project.`);
  }
}

async function writeDoc(dir: BackupDirHandle, fileName: string, doc: StoryDoc): Promise<void> {
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(stampModified(doc), null, 2));
  await w.close();
}

// ---- Serialization of folder operations ----------------------------------------

/**
 * All folder read/compare/write sequences run one at a time: the background
 * auto-push and an explicit Sync click must never interleave their three-way
 * compares. A folder that vanished mid-operation (moved/deleted) is forgotten
 * so the next action re-prompts instead of failing forever.
 */
let opChain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if ((e as DOMException)?.name === "NotFoundError") {
        await forgetBackupDir();
        throw new Error(
          "The Estoria folder seems to have moved — click the folder icon to pick it again."
        );
      }
      throw e;
    }
  };
  const next = opChain.then(run, run);
  opChain = next.catch(() => {});
  return next;
}

// ---- Sync (the explicit button) ----------------------------------------------

/** Rotating-backup receipt attached to outcomes of an explicit sync. */
export interface BackupReceipt {
  fileName: string;
  kept: number;
}

export type SyncOutcome =
  /** No usable folder handle (unset, or permission not granted). */
  | { kind: "no-folder" }
  | { kind: "in-sync"; fileName: string; backup: BackupReceipt }
  /** File didn't exist yet — created it from the local project. */
  | { kind: "created"; fileName: string; backup: BackupReceipt }
  /** Only this app had changed — local state written to the file. */
  | { kind: "pushed"; fileName: string; backup: BackupReceipt }
  /** Only the file had changed — caller should replace local state with `doc`. */
  | { kind: "pulled"; fileName: string; doc: StoryDoc; backup: BackupReceipt }
  /** Both changed — caller must ask the user (then resolveConflict). */
  | {
      kind: "conflict";
      fileName: string;
      remote: StoryDoc;
      summary: string[];
      fileModifiedAt?: string;
    };

/**
 * Reconcile the given project with its canonical file — the explicit Sync
 * button. Fast-forwards are applied (a Sync click is explicit intent); a true
 * conflict is returned for the user to decide — never auto-resolved. Every
 * completed sync also drops one rotating timestamped backup of the state the
 * project ends up in (conflicts get theirs when resolved).
 */
export function syncProject(doc: StoryDoc): Promise<SyncOutcome> {
  return locked(async () => {
    const dir = await getBackupDir({ requestPermission: true });
    if (!dir) return { kind: "no-folder" };

    const fileName = canonicalFileName(doc);
    const remote = await readCanonical(dir, fileName);
    const localHash = await fingerprint(doc);

    if (!remote) {
      await writeDoc(dir, fileName, doc);
      setLastSynced(doc.id, localHash);
      return { kind: "created", fileName, backup: await writeRotatingBackup(dir, doc) };
    }

    const remoteHash = await fingerprint(remote);
    if (remoteHash === localHash) {
      setLastSynced(doc.id, localHash);
      return { kind: "in-sync", fileName, backup: await writeRotatingBackup(dir, doc) };
    }

    const last = getLastSynced(doc.id);
    if (remoteHash === last) {
      await writeDoc(dir, fileName, doc);
      setLastSynced(doc.id, localHash);
      return { kind: "pushed", fileName, backup: await writeRotatingBackup(dir, doc) };
    }
    if (localHash === last) {
      // Record under the incoming doc's id — after the caller applies it, that
      // is the active project the next sync will look up.
      setLastSynced(remote.id, remoteHash);
      return {
        kind: "pulled",
        fileName,
        doc: remote,
        backup: await writeRotatingBackup(dir, remote),
      };
    }

    return {
      kind: "conflict",
      fileName,
      remote,
      summary: summarizeDiff(doc, remote),
      ...(remote.modifiedAt ? { fileModifiedAt: remote.modifiedAt } : {}),
    };
  });
}

/**
 * Apply the user's whole-file conflict choice. The copy NOT kept is first
 * written as `<slug>-conflict-<stamp>.estoria.json` (never pruned by backup
 * rotation), then the winner becomes the canonical file. Returns the doc to
 * load locally when the file version won.
 */
export function resolveConflict(
  local: StoryDoc,
  remote: StoryDoc,
  keep: "mine" | "theirs"
): Promise<{ conflictFileName: string; applied: StoryDoc | null; backup: BackupReceipt }> {
  return locked(async () => {
    const dir = await getBackupDir({ requestPermission: true });
    if (!dir) throw new Error("The sync folder is no longer available.");

    const winner = keep === "mine" ? local : remote;
    const loser = keep === "mine" ? remote : local;
    const slug = slugify(local.projectTitle || "story");
    const conflictFileName = `${slug}-conflict-${fileStamp()}.estoria.json`;

    await writeDoc(dir, conflictFileName, loser); // preserve first, then overwrite
    await writeDoc(dir, canonicalFileName(local), winner);
    setLastSynced(winner.id, await fingerprint(winner));

    return {
      conflictFileName,
      applied: keep === "theirs" ? remote : null,
      backup: await writeRotatingBackup(dir, winner),
    };
  });
}

// ---- Auto-save mirror (background push) -----------------------------------------

/**
 * Mirror local auto-save into the canonical file — but only as a pure
 * fast-forward (file absent, identical, or unchanged since we last agreed).
 * If the file moved on its own, leave it alone and report "behind" so the UI
 * can point at the Sync button; the mirror must never clobber another
 * device's changes, and it never rotates backups (only explicit Sync does).
 *
 * Background-safe: prompt-free (query-only permission) and swallows I/O
 * errors into "unavailable" — a failed mirror is not an event, the next
 * save or Sync click will retry.
 */
export function pushCanonicalIfSafe(
  doc: StoryDoc
): Promise<"created" | "updated" | "in-sync" | "behind" | "unavailable"> {
  return locked(async () => {
    const dir = await getBackupDir();
    if (!dir) return "unavailable" as const;

    const fileName = canonicalFileName(doc);
    let remote: StoryDoc | null;
    try {
      remote = await readCanonical(dir, fileName);
    } catch {
      return "behind" as const; // unreadable — don't overwrite what we can't compare
    }
    const localHash = await fingerprint(doc);

    if (!remote) {
      await writeDoc(dir, fileName, doc);
      setLastSynced(doc.id, localHash);
      return "created" as const;
    }
    const remoteHash = await fingerprint(remote);
    if (remoteHash === localHash) {
      setLastSynced(doc.id, localHash);
      return "in-sync" as const;
    }
    if (remoteHash === getLastSynced(doc.id)) {
      await writeDoc(dir, fileName, doc);
      setLastSynced(doc.id, localHash);
      return "updated" as const;
    }
    return "behind" as const;
  }).catch(() => "unavailable" as const);
}

// ---- Background check (open/focus + interval; notify only, never apply) -------

/**
 * True when the canonical file has changed since this device last agreed with
 * it — i.e. there is something worth reviewing via the Sync button. Silent and
 * prompt-free: without an already-granted permission it just reports false.
 * Local-only edits never trigger it (that would nag on every keystroke).
 */
export async function checkRemoteChanged(doc: StoryDoc): Promise<boolean> {
  try {
    const dir = await getBackupDir();
    if (!dir) return false;
    const remote = await readCanonical(dir, canonicalFileName(doc));
    if (!remote) return false;
    const last = getLastSynced(doc.id);
    if (!last) return false; // never synced — nothing to compare against
    const remoteHash = await fingerprint(remote);
    return remoteHash !== last && remoteHash !== (await fingerprint(doc));
  } catch {
    return false;
  }
}

// ---- Conflict diff summary -----------------------------------------------------

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** All chapters across every book (active board + stashed bookData). */
function allChapters(doc: StoryDoc) {
  return byId([...doc.chapters, ...Object.values(doc.bookData).flatMap((b) => b.chapters)]);
}

function diffCollection<T extends { id: string }>(
  label: string,
  mine: Map<string, T>,
  theirs: Map<string, T>,
  lines: string[]
): void {
  let onlyMine = 0;
  let onlyTheirs = 0;
  let changed = 0;
  for (const [id, m] of mine) {
    const t = theirs.get(id);
    if (!t) onlyMine++;
    else if (JSON.stringify(sortKeysDeep(m)) !== JSON.stringify(sortKeysDeep(t))) changed++;
  }
  for (const id of theirs.keys()) if (!mine.has(id)) onlyTheirs++;

  const parts: string[] = [];
  if (changed) parts.push(`${changed} differ`);
  if (onlyMine) parts.push(`${onlyMine} only in this app`);
  if (onlyTheirs) parts.push(`${onlyTheirs} only in the file`);
  if (parts.length) lines.push(`${label}: ${parts.join(" · ")}`);
}

/**
 * Neutral, id-matched summary of what differs between the local project and
 * the file version, for the conflict dialog. Whole-entity granularity — the
 * per-field merge is the contract's "later evolution".
 */
export function summarizeDiff(mine: StoryDoc, theirs: StoryDoc): string[] {
  const lines: string[] = [];
  if (mine.projectTitle !== theirs.projectTitle) {
    lines.push(`Title: “${mine.projectTitle}” here, “${theirs.projectTitle}” in the file`);
  }
  diffCollection("Chapters", allChapters(mine), allChapters(theirs), lines);
  diffCollection("Characters", byId(mine.characters), byId(theirs.characters), lines);
  diffCollection("World entries", byId(mine.world), byId(theirs.world), lines);
  diffCollection("Books", byId(mine.books), byId(theirs.books), lines);
  diffCollection("Shared assets", byId(mine.assets), byId(theirs.assets), lines);
  if (mine.storyNotes !== theirs.storyNotes) lines.push("Story notes differ");
  if (!lines.length) lines.push("The versions differ only in layout, links, or other details.");
  return lines;
}
