import type { StoryDoc } from "@/types";
import { normalizeDoc, SchemaTooNewError, slugify, stampModified } from "@/store/persistence";
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

function getLocalEditedAt(docId: string): number | null {
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
  } catch (e) {
    // A too-new file must surface as exactly that — syncing over it from an
    // older app would silently drop the fields this app doesn't know.
    if (e instanceof SchemaTooNewError) throw e;
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
      diff: DocDiff;
      /** When the file was last written (its `modifiedAt`), for display. */
      fileModifiedAt?: string;
      /** When this device last auto-saved this project, for display. */
      localEditedAt?: number;
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

    const localEditedAt = getLocalEditedAt(doc.id);
    return {
      kind: "conflict",
      fileName,
      remote,
      diff: diffDocs(doc, remote),
      ...(remote.modifiedAt ? { fileModifiedAt: remote.modifiedAt } : {}),
      ...(localEditedAt ? { localEditedAt } : {}),
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
    const dir = await getBackupDir({ requestPermission: true });
    if (!dir) return null;

    const live = canonicalFileName(doc);
    const slug = slugify(doc.projectTitle || "story");
    const files: ProjectFileInfo[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(".estoria.json")) continue;
      const role =
        entry.name === live
          ? ("live" as const)
          : entry.name.startsWith(`${slug}-backup-`)
            ? ("backup" as const)
            : entry.name.startsWith(`${slug}-conflict-`)
              ? ("conflict" as const)
              : null;
      if (!role) continue; // some other project's files
      const f = await (entry as FileSystemFileHandle).getFile();
      files.push({ name: entry.name, role, lastModified: f.lastModified });
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
    const dir = await getBackupDir({ requestPermission: true });
    if (!dir) throw new Error("The Estoria folder is no longer available.");

    // Read the copy before writing anything: the pre-restore backup below may
    // prune this very file if it is the oldest of 5.
    let restored: StoryDoc;
    try {
      const text = await (await (await dir.getFileHandle(fileName)).getFile()).text();
      restored = normalizeDoc(JSON.parse(text));
    } catch (e) {
      if (e instanceof SchemaTooNewError) throw e;
      throw new Error(`"${fileName}" couldn't be read as an Estoria project.`);
    }
    const receipt = await writeRotatingBackup(dir, current);
    return { doc: restored, backedUpAs: receipt.fileName };
  });
}

// ---- Conflict diff report --------------------------------------------------------

export interface DiffItem {
  /** Display name of the entity (title / name / label). */
  name: string;
  state: "changed" | "only-here" | "only-file";
  /** Friendly names of the fields that differ (state === "changed" only). */
  fields?: string[];
}

export interface DiffSection {
  label: string;
  items: DiffItem[];
}

/** Quantified, reviewable difference between the local doc and the file. */
export interface DocDiff {
  /** One compact line per section, for the collapsed dialog view. */
  lines: string[];
  /** The full per-entity report (empty items are omitted). */
  sections: DiffSection[];
  /** How many items differ, out of how many compared (union of both sides). */
  differing: number;
  total: number;
  magnitude: "small" | "moderate" | "large";
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** All chapters across every book (active board + stashed bookData). */
function allChapters(doc: StoryDoc) {
  return byId([...doc.chapters, ...Object.values(doc.bookData).flatMap((b) => b.chapters)]);
}

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));

/**
 * Friendly names for entity fields in the report. Board-position fields all
 * map to "layout" (the Set collapses them into one entry); unlisted fields
 * fall back to the raw key so nothing ever hides from the report.
 */
const FIELD_LABELS: Record<string, string> = {
  x: "layout",
  y: "layout",
  rot: "layout",
  scenePos: "layout",
  coverSrc: "cover image",
  worldRefs: "world links",
  chars: "characters in chapter",
  sceneLinks: "scene connections",
  refs: "pinned references",
  storyNotes: "story notes",
  desc: "description",
  cat: "category",
};

function changedFields<T extends object>(mine: T, theirs: T): string[] {
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  const out = new Set<string>();
  for (const key of keys) {
    if (key === "id") continue;
    const a = (mine as Record<string, unknown>)[key];
    const b = (theirs as Record<string, unknown>)[key];
    if (sameJson(a, b)) continue;
    // Quantify list fields whose length changed (e.g. "scenes (5 here / 7 in file)").
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
      out.add(`${FIELD_LABELS[key] ?? key} (${a.length} here / ${b.length} in file)`);
    } else {
      out.add(FIELD_LABELS[key] ?? key);
    }
  }
  return [...out];
}

function diffCollection<T extends { id: string }>(
  label: string,
  mine: Map<string, T>,
  theirs: Map<string, T>,
  nameOf: (e: T) => string
): { section: DiffSection; line: string | null; differing: number; total: number } {
  const items: DiffItem[] = [];
  let changed = 0;
  let onlyMine = 0;
  let onlyTheirs = 0;
  for (const [id, m] of mine) {
    const t = theirs.get(id);
    if (!t) {
      onlyMine++;
      items.push({ name: nameOf(m), state: "only-here" });
    } else if (!sameJson(m, t)) {
      changed++;
      items.push({ name: nameOf(m), state: "changed", fields: changedFields(m, t) });
    }
  }
  for (const [id, t] of theirs) {
    if (!mine.has(id)) {
      onlyTheirs++;
      items.push({ name: nameOf(t), state: "only-file" });
    }
  }

  const parts: string[] = [];
  if (changed) parts.push(`${changed} differ`);
  if (onlyMine) parts.push(`${onlyMine} only in this app`);
  if (onlyTheirs) parts.push(`${onlyTheirs} only in the file`);
  return {
    section: { label, items },
    line: parts.length ? `${label}: ${parts.join(" · ")}` : null,
    differing: items.length,
    total: new Set([...mine.keys(), ...theirs.keys()]).size,
  };
}

/**
 * Neutral, id-matched report of what differs between the local project and
 * the file version, for the conflict dialog: compact lines, per-entity detail
 * with the fields that changed, and a quantified magnitude. Whole-entity
 * resolution stays the rule — the per-field merge is the contract's "later
 * evolution"; this only *reports* at field level.
 */
export function diffDocs(mine: StoryDoc, theirs: StoryDoc): DocDiff {
  const lines: string[] = [];
  const sections: DiffSection[] = [];
  let differing = 0;
  let total = 2; // the two doc-level pseudo-items below (title, story notes)

  if (mine.projectTitle !== theirs.projectTitle) {
    differing++;
    lines.push(`Title: “${mine.projectTitle}” here, “${theirs.projectTitle}” in the file`);
  }

  const collections: Array<ReturnType<typeof diffCollection>> = [
    diffCollection("Chapters", allChapters(mine), allChapters(theirs), (c) => c.title),
    diffCollection("Characters", byId(mine.characters), byId(theirs.characters), (c) => c.name),
    diffCollection("World entries", byId(mine.world), byId(theirs.world), (w) => w.name),
    diffCollection("Books", byId(mine.books), byId(theirs.books), (b) => b.title),
    diffCollection("Shared assets", byId(mine.assets), byId(theirs.assets), (a) => a.label),
  ];
  for (const c of collections) {
    if (c.line) lines.push(c.line);
    if (c.section.items.length) sections.push(c.section);
    differing += c.differing;
    total += c.total;
  }

  if (mine.storyNotes !== theirs.storyNotes) {
    differing++;
    lines.push("Story notes differ");
  }
  total++; // chapter connections, compared as one pseudo-item across all books
  const connectionsOf = (d: StoryDoc) => ({
    links: d.links,
    stashed: Object.fromEntries(Object.entries(d.bookData).map(([id, b]) => [id, b.links])),
  });
  if (!sameJson(connectionsOf(mine), connectionsOf(theirs))) {
    differing++;
    lines.push("Chapter connections (therefore / but / and) differ");
  }
  total++; // draft versions (standalone forks), compared as one pseudo-item across all books
  const versionsOf = (d: StoryDoc) => ({
    drafts: d.drafts,
    mainDraftId: d.mainDraftId,
    draftData: d.draftData,
    stashed: Object.fromEntries(
      Object.entries(d.bookData).map(([id, b]) => [
        id,
        { drafts: b.drafts, mainDraftId: b.mainDraftId, draftData: b.draftData },
      ])
    ),
  });
  if (!sameJson(versionsOf(mine), versionsOf(theirs))) {
    differing++;
    lines.push("Draft versions differ");
  }
  if (!lines.length) {
    // The hash said the docs differ, so something outside the reported
    // collections changed (e.g. view settings) — never claim "0 items".
    lines.push("The versions differ only in layout or other details.");
    differing = Math.max(differing, 1);
  }

  const magnitude: DocDiff["magnitude"] =
    differing <= 2 ? "small" : differing >= 10 || differing / total >= 0.25 ? "large" : "moderate";
  return { lines, sections, differing, total, magnitude };
}
