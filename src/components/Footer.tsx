import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { getSaveStatus, onSaveStatus, type SaveStatus } from "@/store/persistence";
import {
  backupProject,
  chooseBackupFolder,
  getBackupDirName,
  isBackupPickerSupported,
} from "@/lib/backup";

/** Bottom bar: autosave indicator + one-click backup + canvas hint + attribution. */
export function Footer() {
  const view = useStore((s) => s.view);
  // Real persistence status from the storage layer — not a guess from state
  // changes, so a failed write (e.g. storage quota full) is actually visible.
  const [status, setStatus] = useState<SaveStatus>(getSaveStatus());
  useEffect(() => onSaveStatus(setStatus), []);

  // One-click backup: writes the current project into the remembered folder
  // (folder icon sets/changes it; first backup prompts if unset).
  const pickerSupported = isBackupPickerSupported();
  const [dirName, setDirName] = useState<string | null>(null);
  const [backupState, setBackupState] = useState<"idle" | "busy" | "done">("idle");
  const [backupMsg, setBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void getBackupDirName().then(setDirName);
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const runBackup = async () => {
    if (backupState === "busy") return;
    if (doneTimer.current) clearTimeout(doneTimer.current);
    setBackupState("busy");
    setBackupMsg(null);
    try {
      const res = await backupProject(useStore.getState().doc);
      if (!res) {
        setBackupState("idle"); // user cancelled the folder prompt
        return;
      }
      if (res.dirName) setDirName(res.dirName);
      setBackupMsg({
        text:
          res.via === "download"
            ? "Backup downloaded"
            : `Backed up · ${res.fileName} (${res.kept} kept)`,
      });
      // Flash the button itself green so success is unmissable even without
      // reading the message; the detail message stays until the next action.
      setBackupState("done");
      doneTimer.current = setTimeout(() => setBackupState("idle"), 2600);
    } catch {
      setBackupState("idle");
      setBackupMsg({
        text: "Backup failed — click the folder icon to re-choose where backups go",
        error: true,
      });
    }
  };

  const pickFolder = async () => {
    try {
      const name = await chooseBackupFolder();
      if (name) {
        setDirName(name);
        setBackupMsg({ text: `Backups will save to "${name}"` });
      }
    } catch {
      setBackupMsg({ text: "Couldn't open that folder", error: true });
    }
  };

  const failed = status.state === "error";
  const saveText = failed
    ? "Couldn't save — browser storage is full. Export your project to keep a copy."
    : status.state === "saving"
      ? "Auto-saving..."
      : status.savedAt
        ? `Auto-saved at ${new Date(status.savedAt).toLocaleTimeString()}`
        : "Auto-saved to this browser";

  const hint =
    view === "timeline"
      ? "Scroll to pan the timeline · use the arrows to flip orientation"
      : "Double-click a chapter to map its scenes · drag to rearrange · scroll to zoom";

  return (
    <div className="flex items-center gap-3 border-t border-rule bg-panel px-4 py-[6px] text-[11px] font-medium text-faint">
      <span
        className="flex shrink-0 items-center gap-[6px]"
        style={failed ? { color: "var(--but)" } : undefined}
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: failed ? "var(--but)" : "var(--therefore)" }}
        />
        {saveText}
      </span>

      {/* One-click backup */}
      <span className="flex shrink-0 items-center gap-[5px]">
        <button
          onClick={() => void runBackup()}
          disabled={backupState === "busy"}
          title={
            pickerSupported
              ? dirName
                ? `Save a backup copy into "${dirName}"`
                : "Save a backup copy (you'll pick a folder first)"
              : "Download a backup copy of this project"
          }
          className="rounded-md border px-[8px] py-[3px] text-[11px] font-semibold transition-colors disabled:opacity-60"
          style={
            backupState === "done"
              ? {
                  borderColor: "var(--therefore)",
                  color: "var(--therefore)",
                  background:
                    "color-mix(in srgb, var(--therefore) 12%, var(--card))",
                }
              : { borderColor: "var(--rule)", background: "var(--card)", color: "var(--soft)" }
          }
        >
          {backupState === "busy" ? "Backing up..." : backupState === "done" ? "Backed up ✓" : "Back up"}
        </button>
        {pickerSupported && (
          <button
            onClick={() => void pickFolder()}
            title={dirName ? `Backup folder: ${dirName} · click to change` : "Choose where backups are saved"}
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
        )}
        {backupMsg && (
          <span
            className="max-w-[340px] truncate"
            style={backupMsg.error ? { color: "var(--but)" } : undefined}
          >
            {backupMsg.text}
          </span>
        )}
      </span>

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
    </div>
  );
}
