import { useEffect, useState, type RefObject } from "react";
import { useStore } from "@/store/useStore";
import { Popover } from "@/components/ui/Popover";
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
 * Folder-icon popover: this project's files in the Estoria folder — the live
 * sync file, rotating backups, conflict copies — each restorable. Restoring
 * replaces only the working copy (current state is backed up first); the live
 * file catches up through the normal mirror/Sync path, keeping its
 * never-clobber guarantees.
 */
export function SyncHistoryPopover({
  open,
  anchorRef,
  dirName,
  onClose,
  onChangeFolder,
  onRestored,
  onError,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  dirName: string;
  onClose: () => void;
  onChangeFolder: () => void;
  onRestored: (fileName: string, backedUpAs: string) => void;
  onError: (message: string) => void;
}) {
  const askConfirm = useStore((s) => s.askConfirm);
  const replaceDoc = useStore((s) => s.replaceDoc);
  const [files, setFiles] = useState<ProjectFileInfo[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const restore = (f: ProjectFileInfo) => {
    onClose();
    askConfirm({
      message: f.role === "live" ? "Load the live file version?" : `Restore this ${f.role === "conflict" ? "conflict copy" : "backup"}?`,
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
            onError(e instanceof Error ? e.message : "Restore failed — nothing was changed.");
          }
        })();
      },
    });
  };

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} side="above" width={330}>
      <div className="flex items-center justify-between px-[8px] pb-[4px] pt-[5px]">
        <span className="text-[11px] font-semibold text-ink">
          Estoria folder: <span className="font-normal text-soft">{dirName}</span>
        </span>
        <button
          onClick={onChangeFolder}
          className="shrink-0 rounded-md border border-rule bg-panel px-[7px] py-[2px] text-[10.5px] font-medium text-soft hover:border-faint hover:text-ink"
        >
          Change…
        </button>
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {loading ? (
          <div className="px-[8px] py-[10px] text-[11px] text-faint">Reading folder…</div>
        ) : !files ? (
          <div className="px-[8px] py-[10px] text-[11px] text-faint">
            Estoria wasn't allowed to read the folder.
          </div>
        ) : files.length === 0 ? (
          <div className="px-[8px] py-[10px] text-[11px] text-faint">
            No files for this project yet — press Sync to create the live file.
          </div>
        ) : (
          files.map((f) => (
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
          ))
        )}
      </div>
    </Popover>
  );
}
