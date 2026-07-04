import { useState } from "react";
import { Scrim, stop } from "@/components/ui/Overlay";
import type { DiffItem, DocDiff } from "@/lib/sync";

export interface SyncConflict {
  fileName: string;
  diff: DocDiff;
  fileModifiedAt?: string;
  localEditedAt?: number;
}

const MAGNITUDE_TEXT: Record<DocDiff["magnitude"], string> = {
  small: "Small difference",
  moderate: "Moderate difference",
  large: "Large difference",
};

const STATE_TEXT: Record<DiffItem["state"], string> = {
  changed: "differs",
  "only-here": "only in this app",
  "only-file": "only in the file",
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A "newer" tag for the side that was written more recently. */
function NewerTag() {
  return (
    <span
      className="rounded-md border px-[5px] py-[1px] text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ borderColor: "var(--therefore)", color: "var(--therefore)" }}
    >
      newer
    </span>
  );
}

/**
 * Whole-file conflict choice for cross-app Sync (docs/SPECS.md §8): both this
 * app and the synced file changed since they last agreed. Shows which side is
 * newer (display only — never used to auto-pick), how much differs, and a
 * full per-item report on demand. Whichever copy loses is preserved as a
 * conflict file, so neither choice destroys work.
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
  const [showReport, setShowReport] = useState(false);

  const pick = (keep: "mine" | "theirs") => {
    if (busy) return;
    setBusy(true);
    // The owner closes the dialog when done; on failure it surfaces the error.
    void onResolve(keep).finally(() => setBusy(false));
  };

  const { diff } = conflict;
  const fileT = conflict.fileModifiedAt ? Date.parse(conflict.fileModifiedAt) : NaN;
  const localT = conflict.localEditedAt ?? NaN;
  // Which side looks newer. Display only: clocks across devices can disagree,
  // so this labels, it never decides.
  const newer: "mine" | "theirs" | null =
    Number.isNaN(fileT) || Number.isNaN(localT) ? null : localT > fileT ? "mine" : "theirs";

  return (
    <Scrim onClose={busy ? () => {} : onClose} z={80} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[min(560px,90vh)] w-[min(520px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="min-h-0 overflow-y-auto px-[24px] pb-[6px] pt-[22px]">
          <div className="font-serif text-[18px] font-semibold text-ink">
            This project changed in two places
          </div>
          <div className="mt-[6px] text-[12.5px] leading-[1.5] text-soft">
            Both this app and the file in your Estoria folder were edited since they last
            agreed, so Estoria can't fast-forward — you choose which version to keep.
          </div>

          {/* Which side is newer */}
          <div className="mt-[12px] flex flex-col gap-[5px] rounded-xl border border-rule bg-card px-[12px] py-[9px] text-[12px]">
            <div className="flex items-center gap-[8px]">
              <span className="w-[86px] shrink-0 font-semibold text-ink">This app</span>
              <span className="min-w-0 flex-1 truncate text-soft">
                {Number.isNaN(localT) ? "last edit time unknown" : `last edited ${fmt(localT)}`}
              </span>
              {newer === "mine" && <NewerTag />}
            </div>
            <div className="flex items-center gap-[8px]">
              <span className="w-[86px] shrink-0 font-semibold text-ink">The file</span>
              <span className="min-w-0 flex-1 truncate text-soft" title={conflict.fileName}>
                {Number.isNaN(fileT) ? "last write time unknown" : `last written ${fmt(fileT)}`}
              </span>
              {newer === "theirs" && <NewerTag />}
            </div>
            {newer === null && (
              <div className="text-[11px] text-faint">
                Couldn't tell which is newer — compare the details below.
              </div>
            )}
          </div>

          {/* How much differs */}
          <div className="mt-[12px] text-[12.5px] font-semibold text-ink">
            {MAGNITUDE_TEXT[diff.magnitude]} —{" "}
            {diff.differing === 1
              ? "1 item differs"
              : `${diff.differing} of ${diff.total} items differ`}
          </div>
          <ul className="mt-[6px] list-disc space-y-[3px] pl-[18px] text-[12.5px] leading-[1.5] text-soft">
            {diff.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          {/* Full report, on demand */}
          {diff.sections.length > 0 && (
            <button
              onClick={() => setShowReport((v) => !v)}
              className="mt-[10px] rounded-md border border-rule bg-card px-[9px] py-[4px] text-[11.5px] font-semibold text-soft hover:border-faint hover:text-ink"
            >
              {showReport ? "Hide report" : "See full report"}
            </button>
          )}
          {showReport && (
            <div className="mt-[8px] flex flex-col gap-[10px] rounded-xl border border-rule bg-card px-[12px] py-[10px]">
              {diff.sections.map((s) => (
                <div key={s.label}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                    {s.label}
                  </div>
                  <ul className="mt-[3px] space-y-[3px]">
                    {s.items.map((it, i) => (
                      <li key={i} className="text-[12px] leading-[1.45] text-soft">
                        <span className="font-medium text-ink">“{it.name}”</span>{" "}
                        <span
                          style={
                            it.state === "changed" ? undefined : { color: "var(--but)" }
                          }
                        >
                          {STATE_TEXT[it.state]}
                        </span>
                        {it.fields && it.fields.length > 0 && (
                          <span className="text-faint"> — {it.fields.join(", ")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="mt-[12px] text-[12px] leading-[1.5] text-faint">
            The version you don't keep is saved next to the sync file as a conflict copy —
            nothing is lost either way.
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-[10px] px-[24px] py-[18px]">
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
            Keep file version{newer === "theirs" ? " · newer" : ""}
          </button>
          <button
            onClick={() => pick("mine")}
            disabled={busy}
            className="rounded-lg px-[14px] py-[8px] text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink)" }}
          >
            Keep this version{newer === "mine" ? " · newer" : ""}
          </button>
        </div>
      </div>
    </Scrim>
  );
}
