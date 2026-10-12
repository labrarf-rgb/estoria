import { useState } from "react";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { chooseBackupFolder, isBackupPickerSupported } from "@/lib/backup";
import { driveAuth } from "@/lib/driveAuth";
import { pickFromDrive } from "@/lib/drivePicker";
import {
  chooseFolderTarget,
  disconnectDrive,
  driveSetUpHere,
  makeNewDriveFolder,
  needsFolderAnswer,
  openDriveChooser,
  startDriveConnect,
  useDriveSession,
  useExistingDriveFolder,
} from "@/lib/driveSession";
import { activeTarget, chosenTarget, driveAvailableHere } from "@/lib/syncTarget";

/**
 * Where this device backs up: Google Drive, or (desktop Chrome) a folder on
 * this computer. Opened by Sync when nothing is chosen yet, and by "Change…".
 */
export function DriveChooserModal() {
  const session = useDriveSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!session.chooserOpen || !driveAvailableHere()) return null;

  const close = () => openDriveChooser(false);
  const onDrive = activeTarget() === "drive";
  const connectedAs = driveAuth.status().state === "connected" ? driveAuth.connectedEmail() : undefined;
  const folderPossible = isBackupPickerSupported();

  /**
   * Moving from the Drive desktop app (H17): hand Estoria the existing Estoria
   * folder. Only the folder: project files in it are handed over one at a
   * time, when the person opens or links one (Open from Google Drive, or
   * "Which file is this project?"), so nothing here asks about files.
   */
  const chooseExistingFolder = async () => {
    setErr(null);
    try {
      const [folder] = await pickFromDrive("folder");
      if (folder) useExistingDriveFolder(folder);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open Google's file picker.");
    }
  };

  const makeNewFolder = async () => {
    setErr(null);
    setBusy(true);
    await makeNewDriveFolder();
    setBusy(false);
  };

  if (needsFolderAnswer()) {
    // Connected, and Estoria sees no Estoria folder in this Drive. One may
    // exist anyway (H17): making a second would split the work in two.
    return (
      <Scrim onClose={close} z={70} center>
        <div
          onMouseDown={stop}
          className="flex w-[min(460px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-start justify-between px-[24px] pb-[4px] pt-[20px]">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-therefore">Google Drive</div>
              <div className="font-serif text-[18px] font-semibold text-ink">
                Is there an Estoria folder in your Drive already?
              </div>
              {connectedAs && (
                <div className="mt-[2px] text-[12px] text-soft">
                  Connected as <span className="font-medium text-ink">{connectedAs}</span>
                </div>
              )}
              <div className="mt-[6px] text-[12px] text-soft">
                If the Google Drive app on your computer or the Estoria Android app already keeps your projects
                in an Estoria folder, choose that folder so every device works on the same files. Estoria can't
                see it until you choose it.
              </div>
            </div>
            <CloseButton onClick={close} />
          </div>
          <div className="flex flex-wrap items-center gap-[8px] px-[24px] pb-[18px] pt-[12px]">
            <button
              disabled={busy}
              onClick={() => void chooseExistingFolder()}
              className="rounded-md bg-ink px-[12px] py-[5px] text-[12px] font-semibold text-panel hover:opacity-90 disabled:opacity-60"
            >
              Yes, choose it in Google Drive…
            </button>
            <button
              disabled={busy}
              onClick={() => void makeNewFolder()}
              className="rounded-md border border-rule bg-panel px-[10px] py-[4px] text-[11.5px] font-medium text-soft hover:border-faint hover:text-ink disabled:opacity-60"
            >
              {busy ? "Making it…" : "No, make a new one"}
            </button>
          </div>
          <div className="border-t border-rule px-[24px] py-[10px] text-[11px] text-faint">
            Choosing it opens Google's file picker, where you pick the folder. Nothing in it is opened or changed.
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

  const pickFolder = async () => {
    setErr(null);
    try {
      const name = await chooseBackupFolder();
      if (name) chooseFolderTarget();
    } catch {
      setErr("Couldn't open that folder. Pick a normal folder like Documents/Estoria.");
    }
  };

  return (
    <Scrim onClose={close} z={70} center>
      <div
        onMouseDown={stop}
        className="flex w-[min(460px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start justify-between px-[24px] pb-[4px] pt-[20px]">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-therefore">Sync</div>
            <div className="font-serif text-[18px] font-semibold text-ink">Back up with</div>
            <div className="mt-[2px] text-[12px] text-soft">
              Your work always saves in this browser. Sync keeps a copy where your other devices can open it.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="flex flex-col gap-[10px] px-[24px] py-[14px]">
          <div className="rounded-xl border bg-card px-[14px] py-[12px]" style={{ borderColor: onDrive ? "var(--therefore)" : "var(--rule)" }}>
            <div className="text-[13px] font-semibold text-ink">Google Drive</div>
            <div className="mt-[2px] text-[12px] text-soft">
              Works on this computer, an iPad and the Android app. Estoria only sees the files it creates in
              your Drive.
            </div>
            <div className="mt-[10px] flex flex-wrap items-center gap-[8px]">
              {onDrive && connectedAs ? (
                <span className="text-[12px] text-soft">
                  In use · <span className="font-medium text-ink">{connectedAs}</span>
                </span>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    startDriveConnect();
                  }}
                  className="rounded-md bg-ink px-[12px] py-[5px] text-[12px] font-semibold text-panel hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Opening Google…" : driveSetUpHere() ? "Reconnect Google Drive" : "Connect Google Drive"}
                </button>
              )}
              {onDrive && (
                <button
                  onClick={() => void disconnectDrive()}
                  className="rounded-md border border-rule bg-panel px-[10px] py-[4px] text-[11.5px] font-medium text-soft hover:border-faint hover:text-ink"
                >
                  Disconnect
                </button>
              )}
            </div>
            {!onDrive && (
              <div className="mt-[8px] text-[11px] text-faint">
                You'll sign in with Google on its own page, then come straight back here.
              </div>
            )}
            {onDrive && connectedAs && (
              <button
                onClick={() => void chooseExistingFolder()}
                className="mt-[8px] text-[11.5px] font-medium text-soft underline decoration-rule underline-offset-2 hover:text-ink"
              >
                Already have an Estoria folder in Drive? Choose it…
              </button>
            )}
          </div>

          {folderPossible && (
            <div
              className="rounded-xl border bg-card px-[14px] py-[12px]"
              style={{ borderColor: chosenTarget() === "folder" ? "var(--therefore)" : "var(--rule)" }}
            >
              <div className="text-[13px] font-semibold text-ink">A folder on this computer</div>
              <div className="mt-[2px] text-[12px] text-soft">
                For a folder outside Google Drive. Works in desktop Chrome and Edge only.
              </div>
              <button
                onClick={() => void pickFolder()}
                className="mt-[10px] rounded-md border border-rule bg-panel px-[10px] py-[4px] text-[11.5px] font-medium text-soft hover:border-faint hover:text-ink"
              >
                Choose folder…
              </button>
            </div>
          )}
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
