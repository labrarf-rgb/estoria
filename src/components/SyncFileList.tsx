import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { listProjectFiles, restoreFromFile, type ProjectFileInfo } from "@/lib/sync";

const ROLE_LABEL: Record<ProjectFileInfo["role"], string> = {
  live: "Live file",
  backup: "Backup",
  conflict: "Conflict copy",
};

function when(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The current project's files in the Estoria folder — live sync file,
 * rotating backups, conflict copies — with badges and an undoable Restore per
 * row. Shared by the footer folder-icon popover and the File-menu
 * "Backups & conflict copies" modal. Restoring replaces only the working copy
 * (current state is backed up first); the live file catches up through the
 * normal mirror/Sync path, keeping its never-clobber guarantees.
 */
export function SyncFileList({
  active,
  reloadKey = 0,
  onBeforeConfirm,
  onRestored,
  onError,
}: {
  /** Load (and re-load) while true — pass the container's open state. */
  active: boolean;
  /** Bump to force a re-read of the folder (e.g. after a restore). */
  reloadKey?: number;
  /** Called before the confirm dialog opens (popover closes itself here). */
  onBeforeConfirm?: () => void;
  onRestored: (fileName: string, backedUpAs: string) => void;
  onError: (message: string) => void;
}) {
  const askConfirm = useStore((s) => s.askConfirm);
  const replaceDoc = useStore((s) => s.replaceDoc);
  const [files, setFiles] = useState<ProjectFileInfo[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stale = false;
    setLoading(true);
    void listProjectFiles(useStore.getState().doc)
      .then((f) => {
        if (!stale) setFiles(f);
      })
      .catch(() => {
        if (!stale) setFiles(null);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [active, reloadKey]);

  const restore = (f: ProjectFileInfo) => {
    onBeforeConfirm?.();
    askConfirm({
      message:
        f.role === "live"
          ? "Load the live file version?"
          : `Restore this ${f.role === "conflict" ? "conflict copy" : "backup"}?`,
      detail:
        `Your current version is saved as a new backup first, so this is undoable. ` +
        (f.role === "live"
          ? "The file's contents replace what's open in the app."
          : `"${f.name}" becomes your working copy and syncs to the live file.`),
      confirmLabel: "Restore",
      onConfirm: () => {
        void (async () => {
          try {
            const res = await restoreFromFile(useStore.getState().doc, f.name);
            replaceDoc(res.doc);
            onRestored(f.name, res.backedUpAs);
          } catch (e) {
            onError(e instanceof Error ? e.message : "Restore failed. Nothing was changed.");
          }
        })();
      },
    });
  };

  if (loading) {
    return <div className="px-[8px] py-[10px] text-[11px] text-faint">Reading folder…</div>;
  }
  if (!files) {
    return (
      <div className="px-[8px] py-[10px] text-[11px] text-faint">
        Estoria wasn't allowed to read the folder.
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="px-[8px] py-[10px] text-[11px] text-faint">
        No files for this project yet. Press Sync to create the live file.
      </div>
    );
  }
  return (
    <>
      {files.map((f) => (
        <div
          key={f.name}
          className="group flex items-center gap-[8px] rounded-lg px-[8px] py-[5px] hover:bg-panel"
        >
          <span
            className="shrink-0 rounded-md border px-[5px] py-[1px] text-[9.5px] font-semibold uppercase tracking-wide"
            style={
              f.role === "live"
                ? { borderColor: "var(--therefore)", color: "var(--therefore)" }
                : f.role === "conflict"
                  ? { borderColor: "var(--but)", color: "var(--but)" }
                  : { borderColor: "var(--rule)", color: "var(--faint)" }
            }
          >
            {ROLE_LABEL[f.role]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium text-ink" title={f.name}>
              {f.name}
            </span>
            <span className="block text-[10px] text-faint">written {when(f.lastModified)}</span>
          </span>
          <button
            onClick={() => restore(f)}
            className="shrink-0 rounded-md border border-rule bg-card px-[7px] py-[2px] text-[10.5px] font-semibold text-soft opacity-0 hover:border-faint hover:text-ink focus:opacity-100 group-hover:opacity-100"
          >
            Restore
          </button>
        </div>
      ))}
    </>
  );
}
