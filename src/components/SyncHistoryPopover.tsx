import type { RefObject } from "react";
import { Popover } from "@/components/ui/Popover";
import { SyncFileList } from "@/components/SyncFileList";

/**
 * Footer folder-icon popover: this project's files in the Estoria folder (on
 * this computer or in Google Drive) —
 * the live sync file, rotating backups, conflict copies — each restorable
 * (see SyncFileList). The same list is reachable from File →
 * "Backups & conflict copies" (BackupsModal).
 */
export function SyncHistoryPopover({
  open,
  anchorRef,
  title,
  detail,
  onClose,
  onChangeFolder,
  onRestored,
  onError,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** "Estoria folder" or "Google Drive". */
  title: string;
  /** The folder's name, or the connected account. */
  detail: string;
  onClose: () => void;
  onChangeFolder: () => void;
  onRestored: (fileName: string, backedUpAs: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} side="above" width={330}>
      <div className="flex items-center justify-between px-[8px] pb-[4px] pt-[5px]">
        <span className="text-[11px] font-semibold text-ink">
          {title}
          {detail && (
            <>
              : <span className="font-normal text-soft">{detail}</span>
            </>
          )}
        </span>
        <button
          onClick={onChangeFolder}
          className="shrink-0 rounded-md border border-rule bg-panel px-[7px] py-[2px] text-[10.5px] font-medium text-soft hover:border-faint hover:text-ink"
        >
          Change…
        </button>
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        <SyncFileList
          active={open}
          onBeforeConfirm={onClose}
          onRestored={onRestored}
          onError={onError}
        />
      </div>
    </Popover>
  );
}
