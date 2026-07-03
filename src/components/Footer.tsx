import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { getSaveStatus, onSaveStatus, type SaveStatus } from "@/store/persistence";
import { chooseBackupFolder, getBackupDirName, isBackupPickerSupported } from "@/lib/backup";
import {
  checkRemoteChanged,
  pushCanonicalIfSafe,
  resolveConflict,
  syncProject,
} from "@/lib/sync";
import { SyncConflictModal, type SyncConflict } from "@/components/modals/SyncConflictModal";
import type { StoryDoc } from "@/types";

// Chrome refuses system-adjacent folders (home root, Library, drive roots)
// with a "contains system files" dialog; a normal subfolder always works.
const FOLDER_TIP =
  'No folder set. Tip: pick or create a normal folder like Documents/Estoria (browsers block system folders).';

/** How long after an auto-save settles before mirroring it to the folder file. */
const AUTO_PUSH_DEBOUNCE_MS = 2500;

/** Bottom bar: autosave/mirror status + cross-app Sync + canvas hint + attribution. */
export function Footer() {
  const view = useStore((s) => s.view);
  const replaceDoc = useStore((s) => s.replaceDoc);
  // Real persistence status from the storage layer — not a guess from state
  // changes, so a failed write (e.g. storage quota full) is actually visible.
  const [status, setStatus] = useState<SaveStatus>(getSaveStatus());
  useEffect(() => onSaveStatus(setStatus), []);

  // Cross-app Sync (docs/SPECS.md §8): reconcile with the canonical
  // <slug>.estoria.json in the user's Estoria folder, shared with the Android
  // app. Hidden entirely where folder access doesn't exist (Firefox/Safari,
  // cross-origin embeds) — those contexts keep local auto-save + export menus.
  const pickerSupported = isBackupPickerSupported();
  const [dirName, setDirName] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [conflict, setConflict] = useState<(SyncConflict & { remote: StoryDoc }) | null>(null);
  /** Relation of the folder file to local state, shown on the autosave line. */
  const [mirror, setMirror] = useState<"unknown" | "current" | "behind">("unknown");
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void getBackupDirName().then(setDirName);
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const syncDone = (text: string) => {
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
      let res = await syncProject(useStore.getState().doc);
      if (res.kind === "no-folder") {
        // First run (or lost permission): pick the Estoria folder, then retry.
        const name = await chooseBackupFolder();
        if (!name) {
          setSyncState("idle");
          setMsg({ text: FOLDER_TIP });
          return;
        }
        setDirName(name);
        res = await syncProject(useStore.getState().doc);
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
          syncDone(`Synced · changes written to file · backup saved (${res.backup.kept} kept)`);
          return;
        case "pulled":
          replaceDoc(res.doc);
          syncDone(`Synced · loaded newer changes from file · backup saved (${res.backup.kept} kept)`);
          return;
        case "conflict":
          setSyncState("idle");
          setMirror("behind");
          setConflict(res);
          return;
      }
    } catch (e) {
      setSyncState("idle");
      setMsg({
        text: e instanceof Error ? e.message : "Sync failed — nothing was changed.",
        error: true,
      });
    }
  };

  const resolveSyncConflict = async (keep: "mine" | "theirs") => {
    if (!conflict) return;
    try {
      const res = await resolveConflict(useStore.getState().doc, conflict.remote, keep);
      if (res.applied) replaceDoc(res.applied);
      setConflict(null);
      syncDone(
        keep === "mine"
          ? `Synced · kept this version — file copy saved as ${res.conflictFileName}`
          : `Synced · loaded file version — your copy saved as ${res.conflictFileName}`
      );
    } catch {
      setConflict(null);
      setMsg({ text: "Couldn't resolve the conflict — nothing was changed.", error: true });
    }
  };

  // Auto-save mirror: once local auto-save settles, push the state into the
  // canonical file too — fast-forward only, so it can never clobber changes
  // made on another device (those flip the status to "behind" instead).
  useEffect(() => {
    if (!pickerSupported) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onSaveStatus((s) => {
      if (s.state !== "saved") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (stopped) return;
        void pushCanonicalIfSafe(useStore.getState().doc).then((r) => {
          if (stopped || r === "unavailable") return;
          setMirror(r === "behind" ? "behind" : "current");
        });
      }, AUTO_PUSH_DEBOUNCE_MS);
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      off();
    };
  }, [pickerSupported]);

  // Contract's check cadence: on focus + every 5 min (mirrors the Android
  // default), notify-only — the user reviews via the Sync button, changes are
  // never auto-applied. Silent unless folder permission is already granted.
  useEffect(() => {
    if (!pickerSupported) return;
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
  }, [pickerSupported]);

  const failed = status.state === "error";
  const mirrorSuffix =
    !pickerSupported || mirror === "unknown"
      ? ""
      : mirror === "current"
        ? " · synced to file"
        : " · file changed elsewhere — press Sync";
  const saveText = failed
    ? "Couldn't save: browser storage is full. Export your project to keep a copy."
    : status.state === "saving"
      ? "Auto-saving..."
      : (status.savedAt
          ? `Auto-saved at ${new Date(status.savedAt).toLocaleTimeString()}`
          : "Auto-saved to this browser") + mirrorSuffix;

  const hint =
    view === "timeline"
      ? "Scroll to pan the timeline · use the arrows to flip orientation"
      : "Double-click a chapter to map its scenes · drag to rearrange · scroll to zoom";

  return (
    <div className="flex items-center gap-3 border-t border-rule bg-panel px-4 py-[6px] text-[11px] font-medium text-faint">
      <span
        className="flex shrink-0 items-center gap-[6px]"
        style={
          failed
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
      {pickerSupported && (
        <span className="flex shrink-0 items-center gap-[5px]">
          <button
            onClick={() => void runSync()}
            disabled={syncState === "busy"}
            title={
              dirName
                ? `Sync this project with its file in "${dirName}" (shared with other devices) — also saves a backup copy`
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
            onClick={() => {
              void (async () => {
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
              })();
            }}
            title={
              dirName ? `Estoria folder: ${dirName} · click to change` : "Choose your Estoria folder"
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

      <span className="hidden flex-1 truncate text-center md:block">{hint}</span>
      <div className="flex-1 md:hidden" />
      <span className="shrink-0">
        Built by{" "}
        <a
          href="https://labrarf.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-soft underline decoration-rule underline-offset-2 hover:text-ink"
        >
          Ray Labra
        </a>
      </span>

      {conflict && (
        <SyncConflictModal
          conflict={conflict}
          onResolve={resolveSyncConflict}
          onClose={() => setConflict(null)}
        />
      )}
    </div>
  );
}
