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
          "The Estoria folder seems to have moved. Click the folder icon to pick it again."
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
  keep: Resolution
): Promise<ResolveReceipt> {
  return locked(async () => {
    const dir = await getBackupDir({ requestPermission: true });
    if (!dir) throw new Error("The sync folder is no longer available.");

    const slug = slugify(local.projectTitle || "story");
    const stamp = fileStamp();
    const conflictFileNames: string[] = [];
    const preserve = async (doc: StoryDoc, suffix: string) => {
      const name = `${slug}-conflict-${stamp}${suffix}.estoria.json`;
      await writeDoc(dir, name, doc);
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

    await writeDoc(dir, canonicalFileName(local), winner);
    setLastSynced(winner.id, await fingerprint(winner));

    return { conflictFileNames, applied, backup: await writeRotatingBackup(dir, winner) };
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
  | "view";

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
  storyWide.push(
    docItem("author", "Author", mine.author ?? "", theirs.author ?? "", [
      { label: "author", mine: mine.author || "not set", theirs: theirs.author || "not set" },
    ])
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

  const storyItems = storyWide.filter((i): i is DiffItem => i !== null);
  total += 7; // the seven story-wide units above, differing or not
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
  return { lines, sections, differing: Math.max(differing, 1), total: Math.max(total, 1), magnitude };
}
