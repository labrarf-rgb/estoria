import { useState } from "react";
import { Scrim, stop } from "@/components/ui/Overlay";

export interface SyncConflict {
  fileName: string;
  summary: string[];
  fileModifiedAt?: string;
}

/**
 * Whole-file conflict choice for cross-app Sync (docs/SPECS.md §8): both this
 * app and the synced file changed since they last agreed. The user picks a
 * side; whichever copy loses is preserved as a conflict file, so neither
 * choice destroys work.
 */
export function SyncConflictModal({
  conflict,
  onResolve,
  onClose,
}: {
  conflict: SyncConflict;
  onResolve: (keep: "mine" | "theirs") => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const pick = (keep: "mine" | "theirs") => {
    if (busy) return;
    setBusy(true);
    // The owner closes the dialog when done; on failure it surfaces the error.
    void onResolve(keep).finally(() => setBusy(false));
  };

  const written = conflict.fileModifiedAt ? new Date(conflict.fileModifiedAt) : null;

  return (
    <Scrim onClose={busy ? () => {} : onClose} z={80} center>
      <div
        onMouseDown={stop}
        className="w-[min(480px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="px-[24px] pb-[6px] pt-[22px]">
          <div className="font-serif text-[18px] font-semibold text-ink">
            This project changed in two places
          </div>
          <div className="mt-[6px] text-[12.5px] leading-[1.5] text-soft">
            Both this app and {conflict.fileName} have changes since they were last in sync
            {written && !isNaN(written.getTime())
              ? ` (file last written ${written.toLocaleString()})`
              : ""}
            . Choose which version to keep:
          </div>
          <ul className="mt-[10px] list-disc space-y-[3px] pl-[18px] text-[12.5px] leading-[1.5] text-soft">
            {conflict.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div className="mt-[12px] text-[12px] leading-[1.5] text-faint">
            The version you don't keep is saved next to the sync file as a conflict copy —
            nothing is lost either way.
          </div>
        </div>
        <div className="flex items-center justify-end gap-[10px] px-[24px] py-[18px]">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint disabled:opacity-60"
          >
            Not now
          </button>
          <button
            onClick={() => pick("theirs")}
            disabled={busy}
            className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-semibold text-ink hover:border-faint disabled:opacity-60"
          >
            Keep file version
          </button>
          <button
            onClick={() => pick("mine")}
            disabled={busy}
            className="rounded-lg px-[14px] py-[8px] text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink)" }}
          >
            Keep this version
          </button>
        </div>
      </div>
    </Scrim>
  );
}
