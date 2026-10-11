import { useEffect, useState } from "react";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import type { DriveFile } from "@/lib/drive";
import { DriveDuplicateError } from "@/lib/driveErrors";
import { driveSyncFolder } from "@/lib/driveFolder";
import { projectFileText } from "@/lib/sync";
import { useStore } from "@/store/useStore";

function when(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The project has no Drive file linked on this device (docs/PLAN-drive-sync.md
 * H2b). Estoria never creates one on its own: the person either picks the
 * copy already in their Estoria folder (from another device) or asks for a new
 * one. Either way the caller then runs a normal Sync, which reads "in sync",
 * or a conflict if the picked copy differs.
 */
export function DriveLinkModal({
  fileName,
  onLinked,
  onClose,
}: {
  fileName: string;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Listing failed: we can't tell whether the file is already there, so don't offer to create one. */
  const [unreadable, setUnreadable] = useState(false);
  const folder = driveSyncFolder();

  useEffect(() => {
    let stale = false;
    void folder
      ?.liveFiles()
      .then((all) => {
        // The same name first: the likeliest match.
        const sorted = [...all].sort((a, b) => Number(b.name === fileName) - Number(a.name === fileName));
        if (!stale) setFiles(sorted);
      })
      .catch((e: unknown) => {
        if (!stale) {
          setFiles([]);
          setUnreadable(true);
          setErr(e instanceof Error ? e.message : "Couldn't read your Estoria folder in Drive.");
        }
      });
    return () => {
      stale = true;
    };
    // The folder object is rebuilt each render; the folder itself doesn't change while open.
  }, [fileName]);

  if (!folder) return null;
  const doc = useStore.getState().doc;

  const pick = (f: DriveFile) => {
    folder.link(doc.id, f.id);
    onLinked();
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await folder.createLive(doc.id, fileName, projectFileText(useStore.getState().doc));
      onLinked();
    } catch (e) {
      setBusy(false);
      if (e instanceof DriveDuplicateError) {
        setErr(`"${fileName}" is already in your Estoria folder. If it's this project, pick it below.`);
        setFiles(await folder.liveFiles().catch(() => files ?? []));
      } else {
        setErr(e instanceof Error ? e.message : "Couldn't create the file. Nothing was changed.");
      }
    }
  };

  const sameName = files?.filter((f) => f.name === fileName) ?? [];

  return (
    <Scrim onClose={onClose} z={70} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[min(560px,90vh)] w-[min(480px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start justify-between px-[24px] pb-[6px] pt-[20px]">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-therefore">Google Drive</div>
            <div className="font-serif text-[18px] font-semibold text-ink">Which file is this project?</div>
            <div className="mt-[2px] text-[12px] text-soft">
              This project isn't linked to a file in your Estoria folder on this device yet. If you've backed it
              up from another device, pick that file. Otherwise, create one.
            </div>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[8px]">
          {files === null ? (
            <div className="px-[8px] py-[10px] text-[12px] text-faint">Reading your Estoria folder…</div>
          ) : unreadable ? (
            <div className="px-[8px] py-[10px] text-[12px] text-faint">
              Couldn't read your Estoria folder, so nothing can be picked or created right now.
            </div>
          ) : files.length === 0 ? (
            <div className="px-[8px] py-[10px] text-[12px] text-faint">Your Estoria folder has no projects yet.</div>
          ) : (
            files.map((f) => (
              <div key={f.id} className="flex items-center gap-[8px] rounded-lg px-[8px] py-[6px] hover:bg-card">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink" title={f.name}>
                    {f.name}
                    {f.name === fileName && (
                      <span className="ml-[6px] text-[10px] font-semibold uppercase tracking-wide text-therefore">
                        same name
                      </span>
                    )}
                  </span>
                  <span className="block text-[10.5px] text-faint">written {when(f.modifiedTime)}</span>
                </span>
                <button
                  disabled={busy}
                  onClick={() => pick(f)}
                  className="shrink-0 rounded-md border border-rule bg-card px-[9px] py-[3px] text-[11px] font-semibold text-soft hover:border-faint hover:text-ink disabled:opacity-60"
                >
                  This one
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-[12px] border-t border-rule px-[24px] py-[12px]">
          <span className="text-[11px] text-faint">
            {sameName.length
              ? "A file with this project's name is already there."
              : `Creates ${fileName} in your Estoria folder.`}
          </span>
          <button
            disabled={busy || files === null || unreadable || sameName.length > 0}
            onClick={() => void create()}
            className="shrink-0 rounded-md bg-ink px-[12px] py-[5px] text-[12px] font-semibold text-panel hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create it"}
          </button>
        </div>

        {err && (
          <div className="border-t border-rule px-[24px] py-[10px] text-[12px]" style={{ color: "var(--but)" }}>
            {err}
          </div>
        )}
      </div>
    </Scrim>
  );
}
