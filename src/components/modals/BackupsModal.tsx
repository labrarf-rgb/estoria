import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { SyncFileList } from "@/components/SyncFileList";
import { chooseBackupFolder, getBackupDirName } from "@/lib/backup";

/**
 * File → "Backups & conflict copies" (mirrors the Android app's menu item):
 * the current project's files in the Estoria folder with undoable Restore.
 * Same list as the footer folder-icon popover (SyncFileList); this surface
 * stays open across restores and shows its result inline.
 */
export function BackupsModal() {
  const show = useStore((s) => s.showBackups);
  const setPanel = useStore((s) => s.setPanel);

  const [dirName, setDirName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!show) return;
    setMsg(null);
    void getBackupDirName().then(setDirName);
  }, [show]);

  if (!show) return null;
  const close = () => setPanel("showBackups", false);

  const pickFolder = async () => {
    try {
      const name = await chooseBackupFolder();
      if (name) {
        setDirName(name);
        setMsg(null);
        setReloadKey((k) => k + 1);
      }
    } catch {
      setMsg({ text: "Couldn't open that folder.", error: true });
    }
  };

  return (
    <Scrim onClose={close} z={70} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[min(540px,90vh)] w-[min(480px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between px-[24px] pb-[6px] pt-[20px]">
          <div>
            <div className="font-serif text-[18px] font-semibold text-ink">
              Backups &amp; conflict copies
            </div>
            <div className="mt-[2px] text-[12px] text-soft">
              This project's files in your Estoria folder. Restoring is undoable, your
              current version is backed up first.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="mx-[24px] mt-[10px] flex items-center justify-between rounded-xl border border-rule bg-card px-[12px] py-[8px]">
          <span className="text-[12px] font-semibold text-ink">
            Estoria folder:{" "}
            <span className="font-normal text-soft">{dirName ?? "not set yet"}</span>
          </span>
          <button
            onClick={() => void pickFolder()}
            className="shrink-0 rounded-md border border-rule bg-panel px-[9px] py-[3px] text-[11px] font-medium text-soft hover:border-faint hover:text-ink"
          >
            {dirName ? "Change…" : "Choose folder…"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[10px]">
          {dirName ? (
            <SyncFileList
              active={show}
              reloadKey={reloadKey}
              onRestored={(fileName, backedUpAs) => {
                setMsg({ text: `Restored ${fileName}. Previous version saved as ${backedUpAs}` });
                setReloadKey((k) => k + 1);
              }}
              onError={(text) => setMsg({ text, error: true })}
            />
          ) : (
            <div className="px-[8px] py-[10px] text-[12px] text-faint">
              Pick your Estoria folder to see this project's live file, backups, and
              conflict copies.
            </div>
          )}
        </div>

        {msg && (
          <div
            className="border-t border-rule px-[24px] py-[10px] text-[12px]"
            style={msg.error ? { color: "var(--but)" } : { color: "var(--soft)" }}
          >
            {msg.text}
          </div>
        )}
      </div>
    </Scrim>
  );
}
