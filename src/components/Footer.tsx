import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { partNouns } from "@/lib/piece";
import { getSaveStatus, onSaveStatus, type SaveStatus } from "@/store/persistence";
import { chooseBackupFolder, getBackupDirName, isBackupPickerSupported } from "@/lib/backup";
import {
  checkRemoteChanged,
  getLocalEditedAt,
  pushCanonicalIfSafe,
  recordLocalEdit,
  resolveConflict,
  syncProject,
  type Resolution,
} from "@/lib/sync";
import { SyncConflictModal, type SyncConflict } from "@/components/modals/SyncConflictModal";
import { DriveLinkModal } from "@/components/modals/DriveLinkModal";
import { SyncHistoryPopover } from "@/components/SyncHistoryPopover";
import { driveAuth } from "@/lib/driveAuth";
import { driveSyncFolder } from "@/lib/driveFolder";
import { createWantedDriveFile, wantsDriveBackup } from "@/lib/driveProjects";
import {
  ago,
  backedUpAt,
  clearDriveNotice,
  confirmAccountSwitch,
  markBackedUp,
  openDriveChooser,
  startDriveConnect,
  useDriveSession,
} from "@/lib/driveSession";
import { activeTarget, chosenTarget, currentDriveStatus, driveAvailableHere } from "@/lib/syncTarget";
import type { StoryDoc } from "@/types";

// Chrome refuses system-adjacent folders (home root, Library, drive roots)
// with a "contains system files" dialog; a normal subfolder always works.
const FOLDER_TIP =
  'No folder set. Tip: pick or create a normal folder like Documents/Estoria (browsers block system folders).';

/** How long after an auto-save settles before mirroring it to the folder file. */
const AUTO_PUSH_DEBOUNCE_MS = 2500;
/**
 * Drive: at most one mirror write per 30 s while typing (a big project is
 * several MB, often over cellular), plus one straight away when the tab is
 * hidden (docs/PLAN-drive-sync.md, H13).
 */
const DRIVE_PUSH_EVERY_MS = 30_000;
/** Warn when edits haven't reached Drive for this long (H9). */
const DRIVE_STALE_MS = 30 * 60 * 1000;

/** Bottom bar: autosave/mirror status + cross-app Sync + canvas hint + attribution. */
export function Footer() {
  const view = useStore((s) => s.view);
  const replaceDoc = useStore((s) => s.replaceDoc);
  // Real persistence status from the storage layer — not a guess from state
  // changes, so a failed write (e.g. storage quota full) is actually visible.
  const [status, setStatus] = useState<SaveStatus>(getSaveStatus());
  useEffect(() => onSaveStatus(setStatus), []);
  // Remember when this project was last edited on this device — shown in the
  // conflict dialog's "which side is newer" comparison (display only).
  useEffect(
    () =>
      onSaveStatus((s) => {
        if (s.state === "saved") recordLocalEdit(useStore.getState().doc.id);
      }),
    []
  );

  // Cross-app Sync (docs/SPECS.md §8): reconcile with the canonical
  // <slug>.estoria.json in the user's Estoria folder, shared with the Android
  // app. Hidden entirely where folder access doesn't exist (Firefox/Safari,
  // cross-origin embeds) — those contexts keep local auto-save + export menus.
  const pickerSupported = isBackupPickerSupported();
  // Google Drive: re-render on any change to the target,
  // the sign-in, the kill switch or a notice.
  const session = useDriveSession();
  const driveHere = driveAvailableHere();
  const driveMode = activeTarget() === "drive";
  const syncVisible = pickerSupported || driveHere;
  const askConfirm = useStore((s) => s.askConfirm);
  const docId = useStore((s) => s.doc.id);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  // Re-render each minute so "backed up · N min ago" stays true.
  const [, setMinute] = useState(0);
  useEffect(() => {
    if (!driveMode) return;
    const t = setInterval(() => setMinute((m) => m + 1), 60_000);
    return () => clearInterval(t);
  }, [driveMode]);
  const [dirName, setDirName] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [conflict, setConflict] = useState<
    (SyncConflict & { remote: StoryDoc; local: StoryDoc; rev?: string }) | null
  >(null);
  /** Relation of the folder file to local state, shown on the autosave line. */
  const [mirror, setMirror] = useState<
    "unknown" | "current" | "behind" | "unlinked" | "missing" | "account-changed"
  >("unknown");
  // A different project (or target) says nothing about the last one's file.
  useEffect(() => setMirror("unknown"), [docId, driveMode]);

  // Notices from connecting (the full-page sign-in returns here).
  useEffect(() => {
    if (!session.notice) return;
    setMsg(session.notice);
    clearDriveNotice();
  }, [session.notice]);

  // This device's Drive folder belongs to another account: ask first (H16).
  useEffect(() => {
    const sw = session.accountSwitch;
    if (!sw) return;
    askConfirm({
      message: `Switch this device to ${sw.current}?`,
      detail:
        `This device was backing up to ${sw.previous}'s Drive. Continuing uses ${sw.current}'s Drive from now on. ` +
        `Nothing is deleted from ${sw.previous}.`,
      confirmLabel: `Use ${sw.current}`,
      onConfirm: () => void confirmAccountSwitch(),
    });
    // Cancelling keeps the old setup: Drive stays unused until confirmed.
  }, [session.accountSwitch, askConfirm]);
  // Folder-icon popover: live file / backups / conflict copies, with restore.
  const [historyOpen, setHistoryOpen] = useState(false);
  const folderBtnRef = useRef<HTMLButtonElement | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void getBackupDirName().then(setDirName);
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const pickFolder = async () => {
    try {
      const name = await chooseBackupFolder();
      if (name) {
        setDirName(name);
        setMsg({ text: `Estoria folder set to "${name}"` });
      } else {
        setMsg({ text: FOLDER_TIP });
      }
    } catch {
      setMsg({ text: "Couldn't open that folder. " + FOLDER_TIP, error: true });
    }
  };

  const syncDone = (text: string) => {
    // Drive now holds this project's latest state (a write, or a match).
    if (activeTarget() === "drive") markBackedUp(useStore.getState().doc.id);
    setMsg({ text });
    setMirror("current");
    setSyncState("done");
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setSyncState("idle"), 2600);
  };

  const runSync = async () => {
    if (syncState === "busy") return;
    setSyncState("busy");
    setMsg(null);
    try {
      // The doc the compare was run against. A conflict's diff — and any merge
      // built from it — has to be applied to this exact snapshot, not to
      // whatever the store holds by the time the user decides.
      let compared = useStore.getState().doc;
      let res = await syncProject(compared);
      if (res.kind === "no-folder" && driveHere && chosenTarget() !== "folder") {
        // Drive is on for this device: choose where to back up first.
        setSyncState("idle");
        openDriveChooser();
        return;
      }
      if (res.kind === "no-folder") {
        // First run (or lost permission): pick the Estoria folder, then retry.
        const name = await chooseBackupFolder();
        if (!name) {
          setSyncState("idle");
          setMsg({ text: FOLDER_TIP });
          return;
        }
        setDirName(name);
        compared = useStore.getState().doc;
        res = await syncProject(compared);
      }
      switch (res.kind) {
        case "no-folder":
          setSyncState("idle");
          setMsg({ text: "Estoria wasn't allowed to use that folder.", error: true });
          return;
        case "created":
          syncDone(`Sync file created · ${res.fileName} · backup saved (${res.backup.kept} kept)`);
          return;
        case "in-sync":
          syncDone(`Already in sync · backup saved (${res.backup.kept} kept)`);
          return;
        case "pushed":
          syncDone(
            `Synced · changes written to ${driveMode ? "Drive" : "file"} · backup saved (${res.backup.kept} kept)`
          );
          return;
        case "pulled":
          replaceDoc(res.doc);
          syncDone(
            `Synced · loaded newer changes from ${driveMode ? "Drive" : "file"} · ` +
              `your previous version and a backup saved (${res.backup.kept} kept)`
          );
          return;
        case "account-changed": {
          // Drive (H16): don't split work across two Drives without asking.
          setSyncState("idle");
          setMirror("account-changed");
          const { from, to } = res;
          askConfirm({
            message: "This project was backed up to a different Google account",
            detail:
              `Its last backup went to ${from}. You're connected as ${to}. Continue with ${to}? ` +
              `You'll pick or create its file in ${to}'s Drive. Nothing is deleted from ${from}.`,
            confirmLabel: `Continue with ${to}`,
            onConfirm: () => {
              driveSyncFolder()?.unlink(useStore.getState().doc.id);
              void runSync();
            },
          });
          return;
        }
        case "needs-link":
          // Drive (H2b): never create the project's file unasked. Picking or
          // creating needs Drive, so sign-in has to work first.
          setSyncState("idle");
          setMirror("unlinked");
          try {
            await driveAuth.getAccessToken();
          } catch (e) {
            setMsg({
              text: e instanceof Error && e.name === "DriveReconnectError" ? "Reconnect Google Drive first." : (e as Error).message,
              error: true,
            });
            return;
          }
          setLinkFor(res.fileName);
          return;
        case "conflict":
          setSyncState("idle");
          setMirror("behind");
          setConflict({ ...res, local: compared });
          return;
      }
    } catch (e) {
      setSyncState("idle");
      setMsg({
        text: e instanceof Error ? e.message : "Sync failed. Nothing was changed.",
        error: true,
      });
    }
  };

  const resolveSyncConflict = async (keep: Resolution) => {
    if (!conflict) return;
    try {
      const res = await resolveConflict(useStore.getState().doc, conflict.remote, keep, conflict.rev);
      if (res.applied) replaceDoc(res.applied);
      setConflict(null);
      const copies = res.conflictFileNames.join(" and ");
      // syncDone marks Drive as holding the result.
      syncDone(
        typeof keep === "object"
          ? `Synced · merged version written, both copies saved as ${copies}`
          : keep === "mine"
            ? `Synced · kept this version, file copy saved as ${copies}`
            : `Synced · loaded file version, your copy saved as ${copies}`
      );
    } catch (e) {
      setConflict(null);
      setMsg({
        // Drive explains itself (e.g. the file changed while the dialog was open).
        text:
          e instanceof Error && e.name.startsWith("Drive")
            ? e.message
            : "Couldn't resolve the conflict. Nothing was changed.",
        error: true,
      });
    }
  };

  // Auto-save mirror: once local auto-save settles, push the state into the
  // canonical file too — fast-forward only, so it can never clobber changes
  // made on another device (those flip the status to "behind" instead).
  useEffect(() => {
    if (!pickerSupported && !driveMode) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let lastPush = 0;
    const push = () => {
      if (stopped) return;
      timer = null;
      pending = false;
      lastPush = Date.now();
      const doc = useStore.getState().doc;
      void pushCanonicalIfSafe(doc).then(async (r) => {
        if (stopped) return;
        // A new project the person asked to back up: make its file now, if its name is free.
        if (r === "unlinked" && wantsDriveBackup(doc.id)) {
          const folder = driveSyncFolder();
          if (folder && (await createWantedDriveFile(folder, doc).catch(() => false))) r = "created";
          if (stopped) return;
        }
        if (driveMode && (r === "created" || r === "updated" || r === "in-sync")) markBackedUp(doc.id);
        if (r === "unavailable") return; // offline, signed out or paused: shown from their own state
        setMirror(r === "created" || r === "updated" || r === "in-sync" ? "current" : r);
      });
    };
    const off = onSaveStatus((s) => {
      if (s.state !== "saved") return;
      pending = true;
      if (timer) clearTimeout(timer);
      const wait = driveMode
        ? Math.max(AUTO_PUSH_DEBOUNCE_MS, DRIVE_PUSH_EVERY_MS - (Date.now() - lastPush))
        : AUTO_PUSH_DEBOUNCE_MS;
      timer = setTimeout(push, wait);
    });
    // Drive: don't sit on edits when the tab goes away (best effort; a closing
    // tab can't carry a multi-MB upload, H13).
    const onHide = () => {
      if (driveMode && pending && document.visibilityState === "hidden") {
        if (timer) clearTimeout(timer);
        push();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      off();
    };
  }, [pickerSupported, driveMode]);

  // Contract's check cadence: on focus + every 5 min (mirrors the Android
  // default), notify-only — the user reviews via the Sync button, changes are
  // never auto-applied. Silent unless folder permission is already granted.
  useEffect(() => {
    if (!pickerSupported && !driveMode) return;
    let stopped = false;
    const check = () => {
      if (stopped || document.visibilityState === "hidden") return;
      void checkRemoteChanged(useStore.getState().doc).then((changed) => {
        if (!stopped && changed) setMirror("behind");
      });
    };
    check();
    window.addEventListener("focus", check);
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => {
      stopped = true;
      window.removeEventListener("focus", check);
      clearInterval(interval);
    };
  }, [pickerSupported, driveMode]);

  const failed = status.state === "error";
  const folderSuffix =
    !pickerSupported || mirror === "unknown"
      ? ""
      : mirror === "current"
        ? " · synced to file"
        : " · file changed elsewhere, press Sync";

  // Drive's line (H9): can I tell whether Drive has my latest work?
  const auth = driveAuth.status().state;
  const needsReconnect = driveMode && (auth === "reconnect" || auth === "not-connected");
  const backed = driveMode ? backedUpAt(docId) : null;
  const editedAt = getLocalEditedAt(docId) ?? 0;
  const driveStale = !!backed && editedAt > backed && Date.now() - backed > DRIVE_STALE_MS;
  const driveSuffix = !driveMode
    ? ""
    : needsReconnect
      ? " · Google Drive needs reconnecting"
      : currentDriveStatus() !== "on" && currentDriveStatus() !== "unknown"
        ? " · Drive backup paused"
        : mirror === "behind"
          ? " · changed elsewhere, press Sync"
          : mirror === "unlinked"
            ? " · not backed up to Drive yet, press Sync"
            : mirror === "missing"
              ? " · can't see this project's Drive file"
              : mirror === "account-changed"
                ? " · backed up under another account, press Sync"
                : auth === "offline"
                  ? " · Drive offline, will retry"
                  : driveStale
                    ? ` · not backed up to Drive for ${ago(backed!).replace(" ago", "")}`
                    : backed
                      ? ` · backed up to Drive ${ago(backed)}`
                      : "";
  const driveWarn = driveMode && (needsReconnect || driveStale || mirror === "missing");
  const mirrorSuffix = driveMode ? driveSuffix : folderSuffix;
  const saveText = failed
    ? status.reason === "locked"
      ? "Auto-save is paused: Estoria couldn't read what's already saved here, and won't write over it. Reload, or export this to a file."
      : status.reason === "prose"
        ? "Couldn't save this chapter's writing. It's safe until the next save, but export your project to keep a copy."
        : status.reason === "images"
          ? "Couldn't save an image. Everything else saved — try adding it again, or export your project to keep a copy."
          : status.reason === "map"
            ? "Couldn't save this project's story map. Your latest changes are held for the next save, but export your project to keep a copy."
            : "Couldn't save: browser storage is full. Export your project to keep a copy."
    : status.state === "saving"
      ? "Saving..."
      : (status.savedAt
          ? `Saved in this browser · ${new Date(status.savedAt).toLocaleTimeString()}`
          : "Saved in this browser") + mirrorSuffix;

  const pieceKind = useStore((s) => (s.doc.form === "piece" ? s.doc.kind ?? "story" : null));
  const hint = pieceKind
    ? `Map the ${partNouns({ kind: pieceKind }).many} · switch to Write to draft beside them`
    : view === "timeline"
      ? "Read the story straight through · click a chapter to jump, a scene to edit it · use the arrows to flip orientation"
      : "Click a chapter to map its scenes · drag to rearrange · scroll to zoom";

  return (
    <div className="flex items-center gap-3 border-t border-rule bg-panel px-4 py-[6px] text-[11px] font-medium text-faint">
      <span
        className="flex shrink-0 items-center gap-[6px]"
        style={
          failed || driveWarn
            ? { color: "var(--but)" }
            : mirror === "behind"
              ? { color: "var(--soft)" }
              : undefined
        }
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: failed ? "var(--but)" : "var(--therefore)" }}
        />
        {saveText}
      </span>

      {/* Cross-app Sync with the Estoria folder (shared with the Android app) */}
      {syncVisible && (
        <span className="flex shrink-0 items-center gap-[5px]">
          {needsReconnect && (
            <button
              onClick={() => startDriveConnect()}
              title="Sign in to Google again on its own page, then come straight back"
              className="rounded-md border px-[8px] py-[3px] text-[11px] font-semibold"
              style={{ borderColor: "var(--but)", color: "var(--but)", background: "var(--card)" }}
            >
              Reconnect
            </button>
          )}
          <button
            onClick={() => void runSync()}
            disabled={syncState === "busy"}
            title={
              driveMode
                ? `Sync this project with its file in your Estoria folder on Google Drive${
                    driveAuth.connectedEmail() ? ` (${driveAuth.connectedEmail()})` : ""
                  }. Also saves a backup copy`
                : dirName
                  ? `Sync this project with its file in "${dirName}" (shared with other devices). Also saves a backup copy`
                  : "Sync this project with its file in your Estoria folder (you'll pick the folder first)"
            }
            className="rounded-md border px-[8px] py-[3px] text-[11px] font-semibold transition-colors disabled:opacity-60"
            style={
              syncState === "done"
                ? {
                    borderColor: "var(--therefore)",
                    color: "var(--therefore)",
                    background: "color-mix(in srgb, var(--therefore) 12%, var(--card))",
                  }
                : { borderColor: "var(--rule)", background: "var(--card)", color: "var(--soft)" }
            }
          >
            {syncState === "busy" ? "Syncing..." : syncState === "done" ? "Synced ✓" : "Sync"}
          </button>
          <button
            ref={folderBtnRef}
            onClick={() => {
              // No folder yet → pick one; otherwise show this project's files
              // (live / backups / conflict copies) with restore.
              if (driveMode || dirName) setHistoryOpen((v) => !v);
              else if (driveHere) openDriveChooser();
              else void pickFolder();
            }}
            title={
              driveMode
                ? "Google Drive · click for files & restore"
                : dirName
                  ? `Estoria folder: ${dirName} · click for files & restore`
                  : "Choose your Estoria folder"
            }
            className="flex h-[22px] w-[24px] items-center justify-center rounded-md border border-rule bg-card text-soft hover:border-faint hover:text-ink"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M1.75 4A1.25 1.25 0 0 1 3 2.75h3.1l1.5 1.7H13A1.25 1.25 0 0 1 14.25 5.7v5.8A1.25 1.25 0 0 1 13 12.75H3A1.25 1.25 0 0 1 1.75 11.5V4Z"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>
          {msg && (
            <span
              className="max-w-[340px] truncate"
              style={msg.error ? { color: "var(--but)" } : undefined}
            >
              {msg.text}
            </span>
          )}
        </span>
      )}

      <div className="flex-1" />
      <span className="hidden shrink-0 max-w-[46vw] truncate text-right md:block">{hint}</span>

      {(driveMode || dirName) && (
        <SyncHistoryPopover
          open={historyOpen}
          anchorRef={folderBtnRef}
          title={driveMode ? "Google Drive" : "Estoria folder"}
          detail={driveMode ? (driveAuth.connectedEmail() ?? "") : (dirName ?? "")}
          onClose={() => setHistoryOpen(false)}
          onChangeFolder={() => {
            setHistoryOpen(false);
            if (driveHere) openDriveChooser();
            else void pickFolder();
          }}
          onRestored={(fileName, backedUpAs) => {
            // The mirror pushes the restored state to the live file on the
            // next auto-save (or a conflict surfaces if the file moved too).
            setMsg({ text: `Restored ${fileName}. Previous version saved as ${backedUpAs}` });
          }}
          onError={(message) => setMsg({ text: message, error: true })}
        />
      )}

      {linkFor && (
        <DriveLinkModal
          fileName={linkFor}
          onClose={() => setLinkFor(null)}
          onLinked={() => {
            setLinkFor(null);
            void runSync();
          }}
        />
      )}

      {conflict && (
        <SyncConflictModal
          conflict={conflict}
          local={conflict.local}
          remote={conflict.remote}
          onResolve={resolveSyncConflict}
          onClose={() => setConflict(null)}
        />
      )}
    </div>
  );
}
