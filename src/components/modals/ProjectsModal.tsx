import { useState, useSyncExternalStore } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import {
  discardQuarantined,
  downloadQuarantined,
  getQuarantined,
  onQuarantined,
  readProjectFile,
  type Quarantined,
} from "@/store/persistence";
import { shortCount } from "@/lib/manuscript";
import { SAVED_REASON, countParts, shortDate } from "@/lib/piece";
import type { ProjectMeta } from "@/store/useStore";
import type { DriveFile } from "@/lib/drive";
import { driveAuth } from "@/lib/driveAuth";
import { driveSyncFolder } from "@/lib/driveFolder";
import { pickFromDrive } from "@/lib/drivePicker";
import { backUpAll, openFromDrive, type BackupResult } from "@/lib/driveProjects";
import { ago, backedUpAt, useDriveSession } from "@/lib/driveSession";
import { activeTarget } from "@/lib/syncTarget";

/** "Short story · 7 scenes · 4.3k words", "Series · 3 books · 8 chapters". */
function metaLine(p: ProjectMeta): string {
  if (p.isPiece) return `${p.label} · ${countParts(p, p.parts)} · ${shortCount(p.words)} words`;
  const chapters = `${p.chapters} ${p.chapters === 1 ? "chapter" : "chapters"}`;
  return `${p.isSeries ? `Series · ${p.books} books` : p.label ? `${p.label}` : "Standalone"} · ${chapters}`;
}

/** "Open project" - switch between independent projects, or merge one into a series. */
export function ProjectsModal() {
  const show = useStore((s) => s.showProjects);
  const activeId = useStore((s) => s.doc.id);
  // Subscribe to the doc and stash so the list re-renders immediately when a
  // project is added, deleted, or merged (listProjects itself isn't reactive).
  useStore((s) => s.doc);
  useStore((s) => s.projectStash);
  const listProjects = useStore((s) => s.listProjects);
  const switchProject = useStore((s) => s.switchProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const mergeProjectIntoSeries = useStore((s) => s.mergeProjectIntoSeries);
  const openDoc = useStore((s) => s.openDoc);
  const openSavedCopy = useStore((s) => s.openSavedCopy);
  const askConfirm = useStore((s) => s.askConfirm);
  const setPanel = useStore((s) => s.setPanel);

  const quarantined = useSyncExternalStore(onQuarantined, getQuarantined);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Google Drive, when it's this device's target.
  useDriveSession();
  const driveFolder = activeTarget() === "drive" ? driveSyncFolder() : null;
  /** "Open from Google Drive": the folder's projects, null while closed. */
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | "loading" | null>(null);
  const [driveResults, setDriveResults] = useState<Record<string, BackupResult | "working">>({});
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveNote, setDriveNote] = useState<{ text: string; error?: boolean } | null>(null);

  const showDriveFiles = async () => {
    if (!driveFolder) return;
    setDriveNote(null);
    setDriveFiles("loading");
    try {
      setDriveFiles(await driveFolder.liveFiles());
    } catch (e) {
      setDriveFiles(null);
      setDriveNote({ text: e instanceof Error ? e.message : "Couldn't read your Estoria folder.", error: true });
    }
  };

  const openDriveFile = async (f: DriveFile) => {
    if (!driveFolder) return;
    setDriveBusy(true);
    try {
      const how = await openFromDrive(driveFolder, f);
      setDriveFiles(null);
      setDriveNote({
        text:
          how === "switched"
            ? `"${f.name}" is already here, so it's open and linked. Press Sync to compare it with Drive.`
            : `Opened "${f.name}" from Google Drive.`,
      });
    } catch (e) {
      setDriveNote({ text: e instanceof Error ? e.message : "Couldn't open that file.", error: true });
    } finally {
      setDriveBusy(false);
    }
  };

  /**
   * Estoria only sees project files it made or was handed (drive.file), so one
   * the Drive app or the phone wrote is chosen here, in Google's picker, the
   * first time it's opened on any device.
   */
  const pickDriveFile = async () => {
    if (!driveFolder) return;
    setDriveNote(null);
    try {
      const [picked] = await pickFromDrive("files", {
        parentId: driveFolder.folderId,
        title: "Choose a project to open",
      });
      if (picked) await openDriveFile({ id: picked.id, name: picked.name });
    } catch (e) {
      setDriveNote({ text: e instanceof Error ? e.message : "Couldn't open Google's file picker.", error: true });
    }
  };

  const runBackUpAll = async () => {
    if (!driveFolder) return;
    setDriveBusy(true);
    setDriveNote(null);
    try {
      // Signed out or offline is one message, not a failure per project.
      await driveAuth.getAccessToken();
    } catch (e) {
      setDriveBusy(false);
      setDriveNote({
        text: e instanceof Error && e.name === "DriveReconnectError" ? "Reconnect Google Drive first (in the footer)." : (e as Error).message,
        error: true,
      });
      return;
    }
    const results = await backUpAll(driveFolder, (id, r) => setDriveResults((prev) => ({ ...prev, [id]: r })));
    const all = Object.values(results);
    const review = all.filter((r) => r === "needs-review").length;
    const failed = all.filter((r) => r === "failed").length;
    setDriveNote({
      text:
        `Backed up ${all.length - review - failed} of ${all.length}.` +
        (review ? ` ${review} need a look: open each one and press Sync.` : "") +
        (failed ? ` ${failed} couldn't be backed up right now.` : ""),
      error: failed > 0,
    });
    setDriveBusy(false);
  };

  const onOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setFileError(null);
    try {
      openDoc(await readProjectFile(f));
    } catch {
      setFileError("That isn't a valid Estoria project file.");
    }
  };

  if (!show) return null;
  const close = () => {
    setMergeId(null);
    setDriveFiles(null);
    setDriveNote(null);
    setPanel("showProjects", false);
  };
  const all = listProjects();
  // Saved copies are projects too, but they are the way back from a change of
  // form rather than something being worked on, so they are listed apart.
  const projects = all.filter((p) => !p.savedCopy);
  const savedCopies = all
    .filter((p) => p.savedCopy)
    .sort((a, b) => (b.savedCopy!.savedAt > a.savedCopy!.savedAt ? 1 : -1));
  const seriesTargets = projects.filter((p) => p.isSeries && p.id !== mergeId);

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[86vh] w-[min(680px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-[24px] py-[20px]">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">
              {mergeId ? "Move into which series?" : driveFiles ? "Open from Google Drive" : "Your projects"}
            </div>
            <div className="mt-[3px] text-[12.5px] font-medium text-soft">
              {mergeId
                ? "Its books, characters and world will be added to the series you choose. A copy of both is saved first, under Saved copies."
                : driveFiles
                  ? "Projects in your Estoria folder on Google Drive. Opening one links it, so Sync keeps it up to date."
                  : "Each project is independent, with its own books, characters and world."}
            </div>
          </div>
          {mergeId || driveFiles ? (
            <button
              onClick={() => {
                setMergeId(null);
                setDriveFiles(null);
              }}
              className="rounded-lg border border-rule bg-card px-[10px] py-[6px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Back
            </button>
          ) : (
            <CloseButton onClick={close} />
          )}
        </div>

        {driveFiles ? (
          <div className="flex flex-col gap-[8px] overflow-auto px-[22px] py-[18px]">
            {driveFiles === "loading" ? (
              <div className="text-[12.5px] text-soft">Reading your Estoria folder…</div>
            ) : driveFiles.length === 0 ? (
              <div className="text-[12.5px] text-soft">Estoria doesn't see any projects in your Estoria folder yet.</div>
            ) : (
              driveFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-[10px] rounded-[13px] border border-rule bg-card p-[12px_14px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{f.name}</div>
                    <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">
                      written {f.modifiedTime ? shortDate(f.modifiedTime) : "earlier"}
                    </div>
                  </div>
                  <button
                    disabled={driveBusy}
                    onClick={() => void openDriveFile(f)}
                    className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg disabled:opacity-60"
                  >
                    Open
                  </button>
                </div>
              ))
            )}
            {driveFiles !== "loading" && (
              <button
                disabled={driveBusy}
                onClick={() => void pickDriveFile()}
                className="self-start px-[2px] text-[11.5px] font-medium text-soft underline decoration-rule underline-offset-2 hover:text-ink disabled:opacity-60"
              >
                Not listed? Choose it in Google Drive…
              </button>
            )}
          </div>
        ) : mergeId ? (
          <div className="flex flex-col gap-[10px] overflow-auto px-[22px] py-[18px]">
            {seriesTargets.length === 0 && (
              <div className="text-[12.5px] text-soft">You have no other series to merge into.</div>
            )}
            {seriesTargets.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  mergeProjectIntoSeries(mergeId, t.id);
                  setMergeId(null);
                }}
                className="flex items-center gap-[12px] rounded-[13px] border border-rule bg-card p-[14px] text-left hover:border-faint"
              >
                <div className="flex-1">
                  <div className="font-serif text-[15px] font-semibold text-ink">{t.title}</div>
                  <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">{metaLine(t)}</div>
                </div>
                <span className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg">
                  Merge here
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-[10px] overflow-auto px-[22px] py-[18px]">
            {projects.map((p) => {
              const isActive = p.id === activeId;
              // A piece has no books to move into a series; expand it first.
              const canMerge = !p.isPiece && projects.some((q) => q.isSeries && q.id !== p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-[10px] rounded-[13px] border bg-card p-[14px] ${
                    isActive ? "border-faint" : "border-rule"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[8px]">
                      <span className="truncate font-serif text-[16px] font-semibold text-ink">
                        {p.title}
                      </span>
                      {p.label && <KindTag label={p.label} />}
                      {isActive && (
                        <span className="rounded-full bg-ink px-[8px] py-[2px] text-[9px] font-semibold uppercase tracking-wide text-bg">
                          Open
                        </span>
                      )}
                    </div>
                    <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">{metaLine(p)}</div>
                    {driveFolder && <DriveState folderLinked={driveFolder.isLinked(p.id)} id={p.id} result={driveResults[p.id]} />}
                  </div>
                  {!isActive && (
                    <button
                      onClick={() => switchProject(p.id)}
                      className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg"
                    >
                      Open
                    </button>
                  )}
                  {canMerge && (
                    <button
                      onClick={() => setMergeId(p.id)}
                      className="rounded-lg border border-rule px-[10px] py-[7px] text-[12px] font-medium text-ink hover:border-faint"
                      title="Move this project into a series"
                    >
                      Merge
                    </button>
                  )}
                  {projects.length > 1 && (
                    <button
                      onClick={() =>
                        askConfirm({
                          message: `Delete "${p.title}"?`,
                          detail: "The whole project and everything in it will be permanently removed.",
                          danger: true,
                          onConfirm: () => deleteProject(p.id),
                        })
                      }
                      className="h-[30px] w-[30px] rounded-lg border border-rule text-[13px] text-faint hover:border-faint hover:text-but"
                      title="Delete project"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            {savedCopies.length > 0 && (
              <>
                <div className="mt-[14px] flex items-baseline gap-[10px]">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Saved copies</span>
                  <span className="text-[11.5px] text-faint">Taken automatically before a project changed form</span>
                </div>
                {savedCopies.map((p) => (
                  <div key={p.id} className="flex items-center gap-[10px] rounded-[13px] border border-rule p-[12px_14px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-[8px]">
                        <span className="truncate font-serif text-[14.5px] font-semibold text-ink">{p.title}</span>
                        {p.label && <KindTag label={p.label} />}
                      </div>
                      <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">
                        {SAVED_REASON[p.savedCopy!.reason]} · {shortDate(p.savedCopy!.savedAt)} · {metaLine(p)}
                      </div>
                    </div>
                    <button
                      onClick={() => openSavedCopy(p.id)}
                      className="rounded-lg border border-rule bg-card px-[12px] py-[7px] text-[12px] font-medium text-ink hover:border-faint"
                      title="Bring this copy back as an ordinary project, and open it"
                    >
                      Open as a project
                    </button>
                    <button
                      onClick={() =>
                        askConfirm({
                          message: `Delete this saved copy of "${p.title}"?`,
                          detail: "The project it was saved from is not affected. The copy is permanently removed.",
                          danger: true,
                          onConfirm: () => deleteProject(p.id),
                        })
                      }
                      className="h-[30px] w-[30px] rounded-lg border border-rule text-[13px] text-faint hover:border-faint hover:text-but"
                      title="Delete saved copy"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </>
            )}

            {quarantined.length > 0 && (
              <SetAside entries={quarantined} askConfirm={askConfirm} />
            )}
          </div>
        )}

        {driveFolder && !mergeId && !driveFiles && (
          <div className="flex flex-wrap items-center gap-[10px] border-t border-rule px-[24px] py-[12px]">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-therefore">Google Drive</span>
            <button
              disabled={driveBusy}
              onClick={() => void showDriveFiles()}
              className="rounded-lg border border-rule bg-card px-[12px] py-[6px] text-[12px] font-medium text-ink hover:border-faint disabled:opacity-60"
            >
              Open from Google Drive…
            </button>
            <button
              disabled={driveBusy}
              onClick={() => void runBackUpAll()}
              className="rounded-lg border border-rule bg-card px-[12px] py-[6px] text-[12px] font-medium text-ink hover:border-faint disabled:opacity-60"
            >
              {driveBusy ? "Backing up…" : "Back up all to Drive"}
            </button>
          </div>
        )}
        {driveNote && (
          <div
            className="border-t border-rule px-[24px] py-[10px] text-[12px]"
            style={{ color: driveNote.error ? "var(--but)" : "var(--soft)" }}
          >
            {driveNote.text}
          </div>
        )}

        {!mergeId && !driveFiles && (
          <div className="flex items-center gap-[10px] border-t border-rule px-[24px] py-[14px]">
            <button
              onClick={() => {
                setPanel("showProjects", false);
                setPanel("showNewBook", true);
              }}
              className="rounded-lg bg-ink px-[14px] py-[9px] text-[13px] font-semibold text-bg"
            >
              + New project
            </button>
            <label className="cursor-pointer rounded-lg border border-rule bg-card px-[14px] py-[9px] text-[13px] font-medium text-ink hover:border-faint">
              Open file...
              <input
                type="file"
                accept=".json,application/json"
                onChange={onOpenFile}
                className="hidden"
              />
            </label>
            <span className="text-[11.5px] font-medium text-faint">
              {fileError ?? `${projects.length} project${projects.length === 1 ? "" : "s"} · saved in this browser`}
            </span>
          </div>
        )}
      </div>
    </Scrim>
  );
}

/** A project's Drive state, under its meta line (H11). */
function DriveState({
  folderLinked,
  id,
  result,
}: {
  folderLinked: boolean;
  id: string;
  result?: BackupResult | "working";
}) {
  const at = backedUpAt(id);
  const [text, warn] =
    result === "working"
      ? ["Backing up…", false]
      : result === "needs-review"
        ? ["Needs a look: open it and press Sync", true]
        : result === "failed"
          ? ["Couldn't back up right now", true]
          : folderLinked
            ? [at ? `On Drive · backed up ${ago(at)}` : "On Drive", false]
            : ["Not on Drive yet", false];
  return (
    <div className="mt-[2px] text-[11px] font-medium" style={{ color: warn ? "var(--but)" : "var(--faint)" }}>
      {text}
    </div>
  );
}

function KindTag({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-chip px-[7px] py-[2px] text-[9px] font-bold uppercase tracking-wide text-soft">
      {label}
    </span>
  );
}

/**
 * Projects the last load could not read. Each is left exactly as it was found
 * (see `Quarantined` in store/persistence.ts) — never saved over, never
 * deleted — until the writer takes its data or lets it go.
 */
function SetAside({
  entries,
  askConfirm,
}: {
  entries: Quarantined[];
  askConfirm: ReturnType<typeof useStore.getState>["askConfirm"];
}) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <div className="mt-[14px] flex items-baseline gap-[10px]">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
          Couldn't be read
        </span>
        <span className="text-[11.5px] text-faint">Left untouched. Your other projects are fine.</span>
      </div>
      {entries.map((q) => (
        <div key={q.id} className="flex items-center gap-[10px] rounded-[13px] border border-rule p-[12px_14px]">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-ink">
              {q.reason === "missing"
                ? "A project listed here couldn't be found"
                : "A project saved here wouldn't load"}
            </div>
            <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">
              Since {shortDate(q.since) || "this session"}
              {note && ` · ${note}`}
            </div>
          </div>
          {q.key && (
            <button
              onClick={() =>
                void downloadQuarantined(q).then((ok) => !ok && setNote("its data is no longer there"))
              }
              className="rounded-lg border border-rule bg-card px-[12px] py-[7px] text-[12px] font-medium text-ink hover:border-faint"
              title="Download its raw data, so the writing can be recovered by hand"
            >
              Download data
            </button>
          )}
          <button
            onClick={() =>
              askConfirm({
                message: "Remove this unreadable project?",
                detail: q.key
                  ? "Download its data first if you might want it. It will be permanently removed from this browser."
                  : "There is nothing left to recover. This only clears the notice.",
                danger: true,
                onConfirm: () => void discardQuarantined(q).catch(() => setNote("couldn't remove it, try again")),
              })
            }
            className="h-[30px] w-[30px] rounded-lg border border-rule text-[13px] text-faint hover:border-faint hover:text-but"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
    </>
  );
}
