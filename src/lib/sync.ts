import type {
  Asset,
  Chapter,
  ChapterLink,
  ConnType,
  PinnedRef,
  StoryDoc,
  TodoItem,
} from "@/types";
import { normalizeDoc, SchemaTooNewError, slugify, stampModified } from "@/store/persistence";
import { countWords } from "@/lib/manuscript";
import { AUTHOR_FIELDS, AUTHOR_LABELS, authorOf } from "@/lib/author";
import { fileStamp, parseCopyName, writeRotatingBackup } from "@/lib/backup";
import { getLastSynced, setLastSynced } from "@/lib/syncBaseline";
import { DriveAccountChangedError } from "@/lib/driveErrors";
import {
  forgetSyncFolder,
  getSyncFolder,
  SyncFolderGoneError,
  type SyncFolder,
} from "@/lib/syncFolder";

/**
 * Cross-app Sync — the web half of the contract in docs/SPECS.md §8
 * ("Cross-app Sync — CONTRACT SETTLED 2026-07-03"), shared with the Android
 * companion app.
 *
 * One canonical file per project lives in the user's Estoria folder (a
 * `SyncFolder`, lib/syncFolder.ts): `<slug>.estoria.json`.
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
// Kept per target in lib/syncBaseline.ts, where DriveFolder can forget it too.

export { lastSyncedKey } from "@/lib/syncBaseline";

// ---- "Last edited here" per project (display only, like modifiedAt) -----------

const lastEditKey = (docId: string) => `estoria:sync:lastEdit:${docId}`;

/**
 * Note that the project was just edited on this device (called on every
 * successful auto-save). Only used to tell the user which side *looks* newer
 * in a conflict — never for conflict logic, same rule as `modifiedAt`.
 */
export function recordLocalEdit(docId: string): void {
  try {
    localStorage.setItem(lastEditKey(docId), String(Date.now()));
  } catch {
    // Display-only nicety; losing it just hides the "newer" hint.
  }
}

export function getLocalEditedAt(docId: string): number | null {
  try {
    const v = Number(localStorage.getItem(lastEditKey(docId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

// ---- Canonical file I/O ------------------------------------------------------

export function canonicalFileName(doc: StoryDoc): string {
  return `${slugify(doc.projectTitle || "story")}.estoria.json`;
}

/**
 * Read + normalize the project's live file, with the folder's revision of it
 * (so a later overwrite can insist nothing moved in between). null = doesn't
 * exist; "unlinked" = Drive hasn't been told which file is this project's
 * (H2b: ask, never create); throws if corrupt.
 */
async function readCanonical(
  folder: SyncFolder,
  projectId: string,
  fileName: string
): Promise<{ doc: StoryDoc; rev?: string } | null | "unlinked"> {
  const file = await folder.readLive(projectId, fileName);
  if (!file || file === "unlinked") return file;
  try {
    return { doc: normalizeDoc(JSON.parse(file.text)), rev: file.rev };
  } catch (e) {
    // A too-new file must surface as exactly that — syncing over it from an
    // older app would silently drop the fields this app doesn't know.
    if (e instanceof SchemaTooNewError) throw e;
    throw new Error(`"${fileName}" exists but couldn't be read as an Estoria project.`);
  }
}

const serialize = (doc: StoryDoc) => JSON.stringify(stampModified(doc), null, 2);

/** A project as its `.estoria.json` file text (for creating a project's Drive file). */
export const projectFileText = serialize;

/** A copy beside the live file (conflict copy, saved copy). */
async function writeDoc(folder: SyncFolder, fileName: string, doc: StoryDoc): Promise<void> {
  await folder.write(fileName, serialize(doc));
}

/** The project's live file. `expectRev`: refuse if it moved since that read (H4). */
async function writeLiveDoc(
  folder: SyncFolder,
  projectId: string,
  fileName: string,
  doc: StoryDoc,
  expectRev?: string
): Promise<void> {
  await folder.writeLive(projectId, fileName, serialize(doc), { expectRev });
}

// ---- Serialization of folder operations ----------------------------------------

/**
 * All folder read/compare/write sequences run one at a time: the background
 * auto-push and an explicit Sync click must never interleave their three-way
 * compares. A folder that vanished mid-operation (moved/deleted) is forgotten
 * so the next action re-prompts instead of failing forever; the folder decides
 * what "vanished" means (`SyncFolderGoneError`).
 *
 * The per-tab chain keeps this tab's operations in order; the Web Lock makes
 * every tab of this browser take turns too, since two open tabs share one
 * folder and one set of baselines (docs/PLAN-drive-sync.md, H12). Where Web
 * Locks are missing, tabs fall back to the per-tab queue alone.
 */
let opChain: Promise<unknown> = Promise.resolve();

const SYNC_LOCK = "estoria-sync";

function acrossTabs<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(SYNC_LOCK, fn) : fn();
}

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SyncFolderGoneError) {
        await forgetSyncFolder();
        throw new Error(e.message);
      }
      throw e;
    }
  };
  const next = opChain.then(
    () => acrossTabs(run),
    () => acrossTabs(run)
  );
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
  /** Drive: no file is linked to this project on this device yet. Ask "pick it or create it" (H2b). */
  | { kind: "needs-link"; fileName: string }
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
      diff: DocDiff;
      /** When the file was last written (its `modifiedAt`), for display. */
      fileModifiedAt?: string;
      /** When this device last auto-saved this project, for display. */
      localEditedAt?: number;
      /** The file's revision the compare read; resolving refuses if it moved since (R8). */
      rev?: string;
    }
  /**
   * Drive: this project was linked under another Google account (H16). Ask
   * before continuing, so work doesn't quietly split across two Drives.
   */
  | { kind: "account-changed"; fileName: string; from: string; to: string };

/**
 * Reconcile the given project with its canonical file — the explicit Sync
 * button. Fast-forwards are applied (a Sync click is explicit intent); a true
 * conflict is returned for the user to decide — never auto-resolved. Every
 * completed sync also drops one rotating timestamped backup of the state the
 * project ends up in (conflicts get theirs when resolved).
 */
export function syncProject(doc: StoryDoc): Promise<SyncOutcome> {
  return locked(async () => {
    const folder = await getSyncFolder({ requestPermission: true });
    if (!folder) return { kind: "no-folder" };

    const fileName = canonicalFileName(doc);
    let read: Awaited<ReturnType<typeof readCanonical>>;
    try {
      read = await readCanonical(folder, doc.id, fileName);
    } catch (e) {
      if (e instanceof DriveAccountChangedError) return { kind: "account-changed", fileName, from: e.from, to: e.to };
      throw e;
    }
    if (read === "unlinked") return { kind: "needs-link", fileName };
    const localHash = await fingerprint(doc);

    if (!read) {
      await writeLiveDoc(folder, doc.id, fileName, doc);
      setLastSynced(folder.target, doc.id, localHash);
      return { kind: "created", fileName, backup: await writeRotatingBackup(folder, doc) };
    }

    const remote = read.doc;
    const remoteHash = await fingerprint(remote);
    if (remoteHash === localHash) {
      setLastSynced(folder.target, doc.id, localHash);
      return { kind: "in-sync", fileName, backup: await writeRotatingBackup(folder, doc) };
    }

    const last = getLastSynced(folder.target, doc.id);
    if (remoteHash === last) {
      await writeLiveDoc(folder, doc.id, fileName, doc, read.rev);
      setLastSynced(folder.target, doc.id, localHash);
      return { kind: "pushed", fileName, backup: await writeRotatingBackup(folder, doc) };
    }
    if (localHash === last) {
      // The incoming copy is about to replace local state, so keep local state
      // first (H15b). It may not be in the file's history: a phone reading a
      // stale cached copy can write it back over newer work, and this pull
      // would then be the moment it disappeared.
      await writeRotatingBackup(folder, doc, { tag: "before-pull" });
      // Record under the incoming doc's id — after the caller applies it, that
      // is the active project the next sync will look up.
      setLastSynced(folder.target, remote.id, remoteHash);
      if (remote.id !== doc.id) folder.moveProject?.(doc.id, remote.id);
      return {
        kind: "pulled",
        fileName,
        doc: remote,
        backup: await writeRotatingBackup(folder, remote),
      };
    }

    const localEditedAt = getLocalEditedAt(doc.id);
    return {
      kind: "conflict",
      fileName,
      remote,
      diff: diffDocs(doc, remote),
      ...(remote.modifiedAt ? { fileModifiedAt: remote.modifiedAt } : {}),
      ...(localEditedAt ? { localEditedAt } : {}),
      ...(read.rev ? { rev: read.rev } : {}),
    };
  });
}

/**
 * How the user settled a conflict: keep one whole side, or keep a per-entity
 * merge of the two (built by `lib/merge.ts` from the same `DocDiff` the dialog
 * showed).
 */
export type Resolution = "mine" | "theirs" | { merged: StoryDoc };

export interface ResolveReceipt {
  /** Conflict copies written before anything was overwritten. */
  conflictFileNames: string[];
  /** The doc to load locally, or null when local state already is the winner. */
  applied: StoryDoc | null;
  backup: BackupReceipt;
}

/**
 * Apply the user's conflict choice. Whatever is not kept is preserved first as
 * `<slug>-conflict-<stamp>….estoria.json` (never pruned by backup rotation),
 * and only then does the winner become the canonical file.
 *
 * A merge has no losing side — both copies are being partly superseded — so it
 * preserves *both*, suffixed `-local` and `-file`. That keeps the contract's
 * promise ("the copy NOT kept can never override the canonical file and can be
 * merged manually later") true of a merge as well, and both copies still read
 * as conflict copies in the folder history, whose badge matches on the
 * `-conflict-` prefix.
 */
export function resolveConflict(
  local: StoryDoc,
  remote: StoryDoc,
  keep: Resolution,
  /** The conflict's `rev`: if another device wrote while the dialog was open, write nothing (R8). */
  expectRev?: string
): Promise<ResolveReceipt> {
  return locked(async () => {
    const folder = await getSyncFolder({ requestPermission: true });
    if (!folder) throw new Error("The sync folder is no longer available.");

    const slug = slugify(local.projectTitle || "story");
    const stamp = fileStamp();
    const conflictFileNames: string[] = [];
    const preserve = async (doc: StoryDoc, suffix: string) => {
      const name = `${slug}-conflict-${stamp}${suffix}.estoria.json`;
      await writeDoc(folder, name, doc);
      conflictFileNames.push(name);
    };

    let winner: StoryDoc;
    let applied: StoryDoc | null;
    if (typeof keep === "object") {
      // Neither side survives whole, so neither side is thrown away.
      await preserve(local, "-local");
      await preserve(remote, "-file");
      winner = keep.merged;
      applied = keep.merged;
    } else {
      winner = keep === "mine" ? local : remote;
      await preserve(keep === "mine" ? remote : local, "");
      applied = keep === "theirs" ? remote : null;
    }

    // Drive follows the file by ID and names it after what it holds, so the
    // winner's title names it (no rename now and back on the next Sync). A
    // folder finds the live file by name, so it keeps the name it was read at.
    const liveName = folder.target === "drive" ? canonicalFileName(winner) : canonicalFileName(local);
    await writeLiveDoc(folder, local.id, liveName, winner, expectRev);
    setLastSynced(folder.target, winner.id, await fingerprint(winner));
    if (winner.id !== local.id) folder.moveProject?.(local.id, winner.id);

    return { conflictFileNames, applied, backup: await writeRotatingBackup(folder, winner) };
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
): Promise<"created" | "updated" | "in-sync" | "behind" | "unlinked" | "missing" | "account-changed" | "unavailable"> {
  return locked(async () => {
    const folder = await getSyncFolder();
    if (!folder) return "unavailable" as const;

    const fileName = canonicalFileName(doc);
    let read: Awaited<ReturnType<typeof readCanonical>>;
    try {
      read = await readCanonical(folder, doc.id, fileName);
    } catch (e) {
      // Offline, signed out or paused is not "the file changed": let it fall
      // through to "unavailable" so the next save retries quietly.
      if (e instanceof Error && e.name.startsWith("Drive")) throw e;
      return "behind" as const; // unreadable — don't overwrite what we can't compare
    }
    // Drive with no file chosen yet: never create one in the background (H2b).
    if (read === "unlinked") return "unlinked" as const;
    const localHash = await fingerprint(doc);

    if (!read) {
      await writeLiveDoc(folder, doc.id, fileName, doc);
      setLastSynced(folder.target, doc.id, localHash);
      return "created" as const;
    }
    const remoteHash = await fingerprint(read.doc);
    if (remoteHash === localHash) {
      setLastSynced(folder.target, doc.id, localHash);
      return "in-sync" as const;
    }
    if (remoteHash === getLastSynced(folder.target, doc.id)) {
      await writeLiveDoc(folder, doc.id, fileName, doc, read.rev);
      setLastSynced(folder.target, doc.id, localHash);
      return "updated" as const;
    }
    return "behind" as const;
  }).catch((e: unknown) => {
    // Drive's two states the footer names (H9); everything else retries quietly.
    const name = e instanceof Error ? e.name : "";
    if (name === "DriveFileMissingError") return "missing" as const;
    if (name === "DriveAccountChangedError") return "account-changed" as const;
    return "unavailable" as const;
  });
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
    const folder = await getSyncFolder();
    if (!folder) return false;
    const read = await readCanonical(folder, doc.id, canonicalFileName(doc));
    if (!read || read === "unlinked") return false;
    const last = getLastSynced(folder.target, doc.id);
    if (!last) return false; // never synced — nothing to compare against
    const remoteHash = await fingerprint(read.doc);
    return remoteHash !== last && remoteHash !== (await fingerprint(doc));
  } catch {
    return false;
  }
}

// ---- Folder history (list + restore) --------------------------------------------

export interface ProjectFileInfo {
  name: string;
  /** "live" = the canonical sync file; the others are never touched by sync. */
  role: "live" | "backup" | "conflict";
  /** File mtime (ms epoch) for display. */
  lastModified: number;
}

/**
 * The current project's files in the Estoria folder: the live file first,
 * then backups and conflict copies newest-first. null = no usable folder.
 */
export function listProjectFiles(doc: StoryDoc): Promise<ProjectFileInfo[] | null> {
  return locked(async () => {
    const folder = await getSyncFolder({ requestPermission: true });
    if (!folder) return null;

    const live = canonicalFileName(doc);
    const slug = slugify(doc.projectTitle || "story");
    const files: ProjectFileInfo[] = [];
    for (const { name, lastModified } of await folder.list()) {
      const copy = parseCopyName(name);
      const role =
        name === live
          ? ("live" as const)
          : copy?.slug === slug && copy.kind !== "saved"
            ? copy.kind
            : null;
      if (!role) continue; // some other project's files
      files.push({ name, role, lastModified });
    }
    files.sort((a, b) =>
      a.role === "live" ? -1 : b.role === "live" ? 1 : b.lastModified - a.lastModified
    );
    return files;
  });
}

/**
 * Load a copy from the folder as the working project. Only local state is
 * replaced — the live file is deliberately left alone, so the auto-save
 * mirror / Sync reconcile it afterwards with all the usual protections
 * (a phone-side change can still surface as a conflict instead of being
 * clobbered by a restore). The state being replaced is written as a rotating
 * backup first, so a restore is always undoable from this same list.
 */
export function restoreFromFile(
  current: StoryDoc,
  fileName: string
): Promise<{ doc: StoryDoc; backedUpAs: string }> {
  return locked(async () => {
    const folder = await getSyncFolder({ requestPermission: true });
    if (!folder) throw new Error("The Estoria folder is no longer available.");

    // Read the copy before writing anything: the pre-restore backup below may
    // prune this very file if it is the oldest of 5.
    let restored: StoryDoc;
    try {
      const file = await folder.read(fileName);
      if (!file) throw new Error("missing");
      restored = normalizeDoc(JSON.parse(file.text));
    } catch (e) {
      if (e instanceof SchemaTooNewError) throw e;
      throw new Error(`"${fileName}" couldn't be read as an Estoria project.`);
    }
    const receipt = await writeRotatingBackup(folder, current);
    return { doc: restored, backedUpAs: receipt.fileName };
  });
}

// ---- Saved copies -----------------------------------------------------------------

/**
 * Write a saved copy (see `lib/piece.ts`) into the Estoria folder as its own
 * file, `<slug>-saved-<reason>-<stamp>.estoria.json`, beside the project's live
 * file and backups. Best effort and silent: only when a folder is already
 * connected with permission, because a change of form is not a moment to show
 * a folder picker. Without one, the copy still lives in this browser's
 * projects. Never pruned — unlike backups, a saved copy is the way back from a
 * specific change, and only the writer knows when that is no longer wanted.
 */
export async function writeSavedCopyFile(doc: StoryDoc): Promise<void> {
  try {
    const folder = await getSyncFolder({ requestPermission: false });
    if (!folder || !doc.savedCopy) return;
    const name = `${slugify(doc.projectTitle || "story")}-saved-${doc.savedCopy.reason}-${fileStamp()}.estoria.json`;
    await writeDoc(folder, name, doc);
  } catch {
    // The browser copy is the copy; the file is a bonus.
  }
}

// ---- Conflict diff report --------------------------------------------------------

/** Which copy a difference is taken from. */
export type Side = "mine" | "theirs";

/**
 * The doc-level things compared as one unit each, because their parts only mean
 * anything together: a connection is a relationship between two chapters, a
 * draft version is a standalone fork of a whole board. Splitting either one per
 * item would let a merge keep a link pointing at a chapter it didn't keep.
 */
export type DocUnit =
  | "title"
  | "author"
  | "storyNotes"
  | "connections"
  | "versions"
  | "seriesMap"
  | "view"
  | "form"
  | "lineBreaks";

/**
 * Where a difference lives, structurally — everything a merge needs to apply a
 * side choice without re-deriving it from a string.
 *
 * Chapters carry a book id rather than a slot, because which slot holds a
 * book's board depends on which book each side had *active* (the active book's
 * chapters are top-level; every other book's are stashed in `bookData`), and
 * the two sides can disagree about that.
 */
export type DiffAddress =
  | { kind: "chapter"; bookId: string; id: string }
  | { kind: "character"; id: string }
  | { kind: "world"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "book"; id: string }
  | { kind: "doc"; unit: DocUnit };

/** Stable string form of an address, for `Record` and React keys. */
export function addressKey(a: DiffAddress): string {
  if (a.kind === "doc") return `doc:${a.unit}`;
  if (a.kind === "chapter") return `chapter:${a.bookId}:${a.id}`;
  return `${a.kind}:${a.id}`;
}

/** One field's value on each side, already rendered for display. */
export interface FieldDiff {
  label: string;
  mine: string;
  theirs: string;
}

export interface DiffItem {
  /** Stable address; a merge plan is keyed by `addressKey(addr)`. */
  addr: DiffAddress;
  key: string;
  /** Display name of the entity (title / name / label). */
  name: string;
  state: "changed" | "only-here" | "only-file";
  /** Friendly names of the fields that differ (state === "changed" only). */
  fields?: string[];
  /** Both sides' values, per differing field — the detailed compare. */
  detail: FieldDiff[];
}

export interface DiffSection {
  label: string;
  items: DiffItem[];
}

/** Quantified, reviewable difference between the local doc and the file. */
export interface DocDiff {
  /** One compact line per section, for the collapsed dialog view. */
  lines: string[];
  /** The full per-entity report (empty sections are omitted). */
  sections: DiffSection[];
  /** How many items differ, out of how many compared (union of both sides). */
  differing: number;
  total: number;
  magnitude: "small" | "moderate" | "large";
  /**
   * Set when the two copies can't be merged field by field, saying why; the
   * dialog then offers keep-one only. Today that is a change of form (a piece
   * on one side, a book on the other): taking a book's chapters into a piece
   * would make a piece with N chapters.
   */
  mergeBlocked?: string;
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/**
 * Each book's chapters, wherever that book's board currently sits. Covers a
 * book's *active version* only — chapters stashed inside inactive versions move
 * with the `versions` unit, which is what keeps a fork whole.
 */
function chaptersByBook(doc: StoryDoc): Map<string, Chapter[]> {
  const m = new Map<string, Chapter[]>([[doc.activeBookId, doc.chapters]]);
  for (const [id, b] of Object.entries(doc.bookData)) if (!m.has(id)) m.set(id, b.chapters);
  return m;
}

/** Each book's story notes, same slot rule as `chaptersByBook`. */
function notesByBook(doc: StoryDoc): Map<string, string> {
  const m = new Map<string, string>([[doc.activeBookId, doc.storyNotes]]);
  for (const [id, b] of Object.entries(doc.bookData)) if (!m.has(id)) m.set(id, b.storyNotes);
  return m;
}

/** Every chapter link in the document, keyed by book. */
function linksByBook(doc: StoryDoc): Record<string, ChapterLink[]> {
  const out: Record<string, ChapterLink[]> = { [doc.activeBookId]: doc.links };
  for (const [id, b] of Object.entries(doc.bookData)) if (!(id in out)) out[id] = b.links;
  return out;
}

/** Everything that makes up a book's draft versions, keyed by book. */
function versionsByBook(doc: StoryDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [doc.activeBookId]: {
      drafts: doc.drafts,
      mainDraftId: doc.mainDraftId,
      draftData: doc.draftData,
    },
  };
  for (const [id, b] of Object.entries(doc.bookData)) {
    if (id in out) continue;
    out[id] = { drafts: b.drafts, mainDraftId: b.mainDraftId, draftData: b.draftData };
  }
  return out;
}

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));

// ---- Rendering values for display -------------------------------------------------

function snippet(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

const quoted = (s: string, n = 110) => (s.trim() ? `“${snippet(s, n)}”` : "empty");

function namesFor(ids: unknown, pool: Array<{ id: string; name: string }>): string {
  const list = Array.isArray(ids) ? (ids as string[]) : [];
  if (!list.length) return "none";
  const by = new Map(pool.map((p) => [p.id, p.name || "untitled"]));
  return list.map((id) => by.get(id) ?? "(not in this copy)").join(", ");
}

function pinLabels(refs: unknown, assets: Asset[]): string {
  const list = Array.isArray(refs) ? (refs as PinnedRef[]) : [];
  if (!list.length) return "none";
  const by = new Map(assets.map((a) => [a.id, a.label || "untitled"]));
  const names = list.map((r) => by.get(r.assetId) ?? "(not in this copy)");
  return `${list.length} ${list.length === 1 ? "pin" : "pins"}: ${names.join(", ")}`;
}

/** "6 therefore · 3 but · 2 none" — a link set at a glance. */
function connSummary(types: ConnType[]): string {
  if (!types.length) return "none";
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n} ${t}`).join(" · ");
}

/** Rough size of a data URL, for images we can't meaningfully diff. */
function approxSize(dataUrl: string): string {
  const kb = Math.round((dataUrl.length * 3) / 4 / 1024);
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toLocaleString()} KB`;
}

/**
 * Friendly names for entity fields in the report. Board-position fields all map
 * to "layout" (they collapse into one row); unlisted fields fall back to the raw
 * key so nothing ever hides from the report.
 */
const FIELD_LABELS: Record<string, string> = {
  x: "layout",
  y: "layout",
  rot: "layout",
  scenePos: "layout",
  scenePosCompact: "layout",
  coverSrc: "cover image",
  worldRefs: "world links",
  chars: "characters in chapter",
  sceneLinks: "scene connections",
  refs: "pinned references",
  storyNotes: "story notes",
  desc: "description",
  cat: "category",
};

/**
 * One field's value, rendered so the two sides can actually be read against
 * each other. Ids are resolved against the doc they came from — a character id
 * means nothing on screen, and the two copies may name it differently.
 */
function describeValue(key: string, v: unknown, doc: StoryDoc): string {
  if (v === undefined || v === null) return "not set";
  switch (key) {
    case "x":
    case "y":
    case "rot":
      return `${key} ${Math.round(Number(v))}`;
    case "scenePos":
    case "scenePosCompact":
      return `${(v as unknown[]).length} node positions`;
    case "manuscript": {
      const t = String(v).trim();
      return t ? `${countWords(t).toLocaleString()} words, opens “${snippet(t, 52)}”` : "no prose";
    }
    case "scenes": {
      const list = v as string[];
      if (!list.length) return "none";
      const n = list.length;
      return `${n} ${n === 1 ? "beat" : "beats"}, last: “${snippet(list[n - 1], 48)}”`;
    }
    case "sceneLinks":
      return connSummary(v as ConnType[]);
    case "chars":
      return namesFor(v, doc.characters);
    case "worldRefs":
      return namesFor(v, doc.world);
    case "refs":
      return pinLabels(v, doc.assets);
    case "coverSrc":
    case "src": {
      const s = String(v);
      return s ? `set, about ${approxSize(s)}` : "not set";
    }
    case "items": {
      const list = v as TodoItem[];
      return `${list.length} lines, ${list.filter((i) => i.done).length} done`;
    }
  }
  if (Array.isArray(v)) {
    if (!v.length) return "none";
    if (v.every((x) => typeof x === "string")) return (v as string[]).join(", ");
    return `${v.length} entries`;
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  return quoted(String(v));
}

/**
 * The fields that differ between two versions of one entity: friendly names for
 * the compact line, and both rendered values for the detailed compare.
 */
function compareFields<T extends object>(
  mine: T,
  theirs: T,
  mineDoc: StoryDoc,
  theirsDoc: StoryDoc
): { fields: string[]; detail: FieldDiff[] } {
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  const fields: string[] = [];
  const seen = new Set<string>();
  const detail = new Map<string, FieldDiff>();
  for (const key of [...keys].sort()) {
    if (key === "id") continue;
    const a = (mine as Record<string, unknown>)[key];
    const b = (theirs as Record<string, unknown>)[key];
    if (sameJson(a, b)) continue;
    const label = FIELD_LABELS[key] ?? key;
    if (!seen.has(label)) {
      seen.add(label);
      // Quantify list fields whose length changed ("scenes (5 here / 7 in file)").
      fields.push(
        Array.isArray(a) && Array.isArray(b) && a.length !== b.length
          ? `${label} (${a.length} here / ${b.length} in file)`
          : label
      );
    }
    const row = detail.get(label);
    if (row) {
      // A collapsed label (board position) keeps every part on the one row.
      row.mine = `${row.mine} · ${describeValue(key, a, mineDoc)}`;
      row.theirs = `${row.theirs} · ${describeValue(key, b, theirsDoc)}`;
    } else {
      detail.set(label, {
        label,
        mine: describeValue(key, a, mineDoc),
        theirs: describeValue(key, b, theirsDoc),
      });
    }
  }
  return { fields, detail: [...detail.values()] };
}

// ---- Collections ------------------------------------------------------------------

interface CollectionSpec<T extends { id: string }> {
  label: string;
  /** Singular noun for the "whole X" row on one-sided items. */
  unit: string;
  mine: Map<string, T>;
  theirs: Map<string, T>;
  nameOf: (e: T) => string;
  /** One-line description of a record that exists on only one side. */
  summaryOf: (e: T, doc: StoryDoc) => string;
  address: (id: string) => DiffAddress;
}

function diffCollection<T extends { id: string }>(
  spec: CollectionSpec<T>,
  mineDoc: StoryDoc,
  theirsDoc: StoryDoc
): { section: DiffSection; line: string | null; total: number } {
  const { label, unit, mine, theirs, nameOf, summaryOf, address } = spec;
  const items: DiffItem[] = [];
  let changed = 0;
  let onlyMine = 0;
  let onlyTheirs = 0;

  for (const [id, m] of mine) {
    const t = theirs.get(id);
    if (!t) {
      onlyMine++;
      items.push({
        addr: address(id),
        key: addressKey(address(id)),
        name: nameOf(m),
        state: "only-here",
        detail: [{ label: `whole ${unit}`, mine: summaryOf(m, mineDoc), theirs: "not in file" }],
      });
    } else if (!sameJson(m, t)) {
      changed++;
      const { fields, detail } = compareFields(m, t, mineDoc, theirsDoc);
      items.push({
        addr: address(id),
        key: addressKey(address(id)),
        name: nameOf(m),
        state: "changed",
        fields,
        detail,
      });
    }
  }
  for (const [id, t] of theirs) {
    if (mine.has(id)) continue;
    onlyTheirs++;
    items.push({
      addr: address(id),
      key: addressKey(address(id)),
      name: nameOf(t),
      state: "only-file",
      detail: [{ label: `whole ${unit}`, mine: "not here", theirs: summaryOf(t, theirsDoc) }],
    });
  }

  const parts: string[] = [];
  if (changed) parts.push(`${changed} differ`);
  if (onlyMine) parts.push(`${onlyMine} only in this app`);
  if (onlyTheirs) parts.push(`${onlyTheirs} only in the file`);
  return {
    section: { label, items },
    line: parts.length ? `${label}: ${parts.join(" · ")}` : null,
    total: new Set([...mine.keys(), ...theirs.keys()]).size,
  };
}

// ---- Doc-level units --------------------------------------------------------------

/** Build a story-wide item, or null when that unit is identical on both sides. */
function docItem(
  unit: DocUnit,
  name: string,
  mineVal: unknown,
  theirsVal: unknown,
  detail: FieldDiff[],
  meta?: string
): DiffItem | null {
  if (sameJson(mineVal, theirsVal)) return null;
  const addr: DiffAddress = { kind: "doc", unit };
  return {
    addr,
    key: addressKey(addr),
    name,
    state: "changed",
    ...(meta ? { fields: [meta] } : {}),
    detail,
  };
}

/** A book's display title, from whichever copy still has the book. */
function bookTitle(id: string, mine: StoryDoc, theirs: StoryDoc): string {
  const b = mine.books.find((x) => x.id === id) ?? theirs.books.find((x) => x.id === id);
  return b?.title || "Untitled book";
}

function wordsLine(text: string): string {
  const t = text.trim();
  if (!t) return "empty";
  return `${countWords(t).toLocaleString()} words, ends “${snippet(t.slice(-90), 46)}”`;
}

/**
 * Neutral, id-matched report of what differs between the local project and the
 * file version. Every difference is an addressable unit, so the same report
 * drives both the read-only summary and the per-entity merge in `lib/merge.ts`.
 *
 * Coverage is deliberately total: anything not matched by a named unit lands in
 * `view` or the fallback line, because a conflict dialog that says "0 items
 * differ" against a hash that says otherwise is worse than a vague one.
 */
export function diffDocs(mine: StoryDoc, theirs: StoryDoc): DocDiff {
  const lines: string[] = [];
  const sections: DiffSection[] = [];
  let total = 0;

  // --- Chapters, per book (the address a merge needs) ---
  const mineChapters = chaptersByBook(mine);
  const theirsChapters = chaptersByBook(theirs);
  const bookIds = [...new Set([...mineChapters.keys(), ...theirsChapters.keys()])];
  // The book the user is looking at comes first; the rest keep book order.
  bookIds.sort((a, b) =>
    a === mine.activeBookId ? -1 : b === mine.activeBookId ? 1 : 0
  );
  let chaptersChanged = 0;
  let chaptersOnlyMine = 0;
  let chaptersOnlyTheirs = 0;
  for (const bookId of bookIds) {
    const res = diffCollection(
      {
        label: bookIds.length > 1 ? `Chapters · ${bookTitle(bookId, mine, theirs)}` : "Chapters",
        unit: "chapter",
        mine: byId(mineChapters.get(bookId) ?? []),
        theirs: byId(theirsChapters.get(bookId) ?? []),
        nameOf: (c) => c.title,
        summaryOf: (c) =>
          `Chapter ${c.num}, act ${c.act}, ${c.status}, ${c.scenes.length} ${c.scenes.length === 1 ? "beat" : "beats"}`,
        address: (id) => ({ kind: "chapter", bookId, id }),
      },
      mine,
      theirs
    );
    total += res.total;
    if (res.section.items.length) sections.push(res.section);
    for (const it of res.section.items) {
      if (it.state === "changed") chaptersChanged++;
      else if (it.state === "only-here") chaptersOnlyMine++;
      else chaptersOnlyTheirs++;
    }
  }
  const chapterParts: string[] = [];
  if (chaptersChanged) chapterParts.push(`${chaptersChanged} differ`);
  if (chaptersOnlyMine) chapterParts.push(`${chaptersOnlyMine} only in this app`);
  if (chaptersOnlyTheirs) chapterParts.push(`${chaptersOnlyTheirs} only in the file`);
  if (chapterParts.length) lines.push(`Chapters: ${chapterParts.join(" · ")}`);

  // --- Series bible + books ---
  const collections = [
    diffCollection(
      {
        label: "Characters",
        unit: "character",
        mine: byId(mine.characters),
        theirs: byId(theirs.characters),
        nameOf: (c) => c.name || "Unnamed",
        summaryOf: (c) => [c.role, c.type].filter(Boolean).join(" · ") || quoted(c.desc),
        address: (id) => ({ kind: "character", id }),
      },
      mine,
      theirs
    ),
    diffCollection(
      {
        label: "World entries",
        unit: "entry",
        mine: byId(mine.world),
        theirs: byId(theirs.world),
        nameOf: (w) => w.name || "Untitled",
        summaryOf: (w) => `${w.cat} · ${quoted(w.desc, 70)}`,
        address: (id) => ({ kind: "world", id }),
      },
      mine,
      theirs
    ),
    diffCollection(
      {
        label: "Books",
        unit: "book",
        mine: byId(mine.books),
        theirs: byId(theirs.books),
        nameOf: (b) => b.title || "Untitled book",
        summaryOf: (b) => `${b.status} · ${quoted(b.premise, 70)}`,
        address: (id) => ({ kind: "book", id }),
      },
      mine,
      theirs
    ),
    diffCollection(
      {
        label: "Shared assets",
        unit: "asset",
        mine: byId(mine.assets),
        theirs: byId(theirs.assets),
        nameOf: (a) => a.label || "Untitled",
        summaryOf: (a) => `${a.kind.toLowerCase()} · ${quoted(a.body ?? "", 70)}`,
        address: (id) => ({ kind: "asset", id }),
      },
      mine,
      theirs
    ),
  ];
  for (const c of collections) {
    if (c.line) lines.push(c.line);
    if (c.section.items.length) sections.push(c.section);
    total += c.total;
  }

  // --- Story-wide units ---
  const storyWide: Array<DiffItem | null> = [];

  storyWide.push(
    docItem(
      "title",
      "Project title",
      mine.projectTitle,
      theirs.projectTitle,
      [{ label: "project title", mine: mine.projectTitle, theirs: theirs.projectTitle }]
    )
  );
  // The byline and the contact block are one unit: they describe one person,
  // and keeping one copy's name with the other's address describes nobody.
  const mineAuthor = authorOf(mine);
  const theirsAuthor = authorOf(theirs);
  storyWide.push(
    docItem(
      "author",
      "Author details",
      mineAuthor,
      theirsAuthor,
      AUTHOR_FIELDS.filter((k) => (mineAuthor[k] ?? "") !== (theirsAuthor[k] ?? "")).map((k) => ({
        label: AUTHOR_LABELS[k],
        mine: mineAuthor[k] || "not set",
        theirs: theirsAuthor[k] || "not set",
      }))
    )
  );

  const mineNotes = notesByBook(mine);
  const theirsNotes = notesByBook(theirs);
  const noteBooks = [...new Set([...mineNotes.keys(), ...theirsNotes.keys()])];
  storyWide.push(
    docItem(
      "storyNotes",
      "Story notes",
      Object.fromEntries(mineNotes),
      Object.fromEntries(theirsNotes),
      noteBooks
        .filter((id) => (mineNotes.get(id) ?? "") !== (theirsNotes.get(id) ?? ""))
        .map((id) => ({
          label: bookTitle(id, mine, theirs),
          mine: wordsLine(mineNotes.get(id) ?? ""),
          theirs: wordsLine(theirsNotes.get(id) ?? ""),
        })),
      noteBooks.length > 1 ? "across every book" : undefined
    )
  );

  const mineLinks = linksByBook(mine);
  const theirsLinks = linksByBook(theirs);
  const allLinks = (m: Record<string, ChapterLink[]>) => Object.values(m).flat();
  storyWide.push(
    docItem(
      "connections",
      "Chapter connections",
      mineLinks,
      theirsLinks,
      [
        {
          label: "connections",
          mine: `${allLinks(mineLinks).length} links: ${connSummary(allLinks(mineLinks).map((l) => l.type))}`,
          theirs: `${allLinks(theirsLinks).length} links: ${connSummary(allLinks(theirsLinks).map((l) => l.type))}`,
        },
      ],
      "therefore / but / and, taken as one set"
    )
  );

  const draftNames = (d: StoryDoc) => d.drafts.map((v) => v.name).join(", ") || "none";
  const mainName = (d: StoryDoc) =>
    d.drafts.find((v) => v.id === d.mainDraftId)?.name ?? "(unknown)";
  storyWide.push(
    docItem(
      "versions",
      "Draft versions",
      versionsByBook(mine),
      versionsByBook(theirs),
      [
        { label: "versions", mine: draftNames(mine), theirs: draftNames(theirs) },
        { label: "main version", mine: mainName(mine), theirs: mainName(theirs) },
      ],
      "standalone forks, taken as one set"
    )
  );

  storyWide.push(
    docItem("seriesMap", "Series map connections", mine.bookLinks, theirs.bookLinks, [
      {
        label: "book links",
        mine: `${mine.bookLinks.length} links`,
        theirs: `${theirs.bookLinks.length} links`,
      },
    ])
  );

  const viewOf = (d: StoryDoc) => ({
    seriesMode: d.seriesMode,
    activeBookId: d.activeBookId,
    activeDraftId: d.activeDraftId,
    stashed: Object.fromEntries(
      Object.entries(d.bookData).map(([id, b]) => [id, b.activeDraftId])
    ),
  });
  const activeVersionName = (d: StoryDoc) =>
    d.drafts.find((v) => v.id === d.activeDraftId)?.name ?? "(unknown)";
  storyWide.push(
    docItem("view", "Board view settings", viewOf(mine), viewOf(theirs), [
      {
        label: "active book",
        mine: bookTitle(mine.activeBookId, mine, theirs),
        theirs: bookTitle(theirs.activeBookId, mine, theirs),
      },
      { label: "active version", mine: activeVersionName(mine), theirs: activeVersionName(theirs) },
      { label: "series mode", mine: mine.seriesMode ? "on" : "off", theirs: theirs.seriesMode ? "on" : "off" },
    ])
  );

  // What the project is (a piece or a book) and the labels that go with it.
  // One unit, because a kind or a saved-copy note only means anything against
  // the form it was set for. Same key as the Android app's row.
  const formOf = (d: StoryDoc) => ({
    form: d.form ?? null,
    kind: d.kind ?? null,
    grownInto: d.grownInto ?? null,
    savedCopy: d.savedCopy ?? null,
  });
  const formName = (d: StoryDoc) =>
    d.form === "piece" ? "single piece" : d.seriesMode ? "series" : "book";
  const savedCopyLine = (d: StoryDoc) =>
    d.savedCopy ? `saved before ${d.savedCopy.reason}` : "no";
  storyWide.push(
    docItem(
      "form",
      "Form",
      formOf(mine),
      formOf(theirs),
      [
        { label: "form", mine: formName(mine), theirs: formName(theirs) },
        { label: "kind", mine: mine.kind ?? "story", theirs: theirs.kind ?? "story" },
        { label: "grown into", mine: mine.grownInto ?? "not set", theirs: theirs.grownInto ?? "not set" },
        { label: "saved copy", mine: savedCopyLine(mine), theirs: savedCopyLine(theirs) },
      ],
      "form, kind and saved-copy note, taken as one"
    )
  );
  storyWide.push(
    docItem("lineBreaks", "Line breaks", !!mine.keepLineBreaks, !!theirs.keepLineBreaks, [
      {
        label: "keep line breaks",
        mine: mine.keepLineBreaks ? "on" : "off",
        theirs: theirs.keepLineBreaks ? "on" : "off",
      },
    ])
  );

  const storyItems = storyWide.filter((i): i is DiffItem => i !== null);
  total += 9; // the nine story-wide units above, differing or not
  if (storyItems.length) {
    sections.push({ label: "Story-wide", items: storyItems });
    for (const it of storyItems) {
      lines.push(
        it.addr.kind === "doc" && it.addr.unit === "title"
          ? `Title: “${mine.projectTitle}” here, “${theirs.projectTitle}” in the file`
          : `${it.name} differ${it.name.endsWith("s") ? "" : "s"}`
      );
    }
  }

  const differing = sections.reduce((n, s) => n + s.items.length, 0);
  if (!lines.length) {
    // The hash said the docs differ, so something outside every unit above
    // changed — never claim "0 items".
    lines.push("The versions differ only in details this report doesn't name.");
  }

  const magnitude: DocDiff["magnitude"] =
    differing <= 2 ? "small" : differing >= 10 || differing / total >= 0.25 ? "large" : "moderate";
  const mergeBlocked =
    (mine.form ?? null) !== (theirs.form ?? null)
      ? `One copy is a ${formName(mine)} and the other a ${formName(theirs)}, so they can't be merged part by part. Keep one; the other is saved as a conflict copy.`
      : undefined;
  return {
    lines,
    sections,
    differing: Math.max(differing, 1),
    total: Math.max(total, 1),
    magnitude,
    ...(mergeBlocked ? { mergeBlocked } : {}),
  };
}
