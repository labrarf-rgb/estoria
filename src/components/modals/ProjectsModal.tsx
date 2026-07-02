import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { readProjectFile } from "@/store/persistence";

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
  const askConfirm = useStore((s) => s.askConfirm);
  const setPanel = useStore((s) => s.setPanel);

  const [mergeId, setMergeId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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
    setPanel("showProjects", false);
  };
  const projects = listProjects();
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
              {mergeId ? "Move into which series?" : "Your projects"}
            </div>
            <div className="mt-[3px] text-[12.5px] font-medium text-soft">
              {mergeId
                ? "Its books, characters and world will be added to the series you choose."
                : "Each project is independent, with its own books, characters and world."}
            </div>
          </div>
          {mergeId ? (
            <button
              onClick={() => setMergeId(null)}
              className="rounded-lg border border-rule bg-card px-[10px] py-[6px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Back
            </button>
          ) : (
            <CloseButton onClick={close} />
          )}
        </div>

        {mergeId ? (
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
                  <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">
                    {t.books} books · {t.chapters} chapters
                  </div>
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
              const canMerge = projects.some((q) => q.isSeries && q.id !== p.id);
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
                      {isActive && (
                        <span className="rounded-full bg-ink px-[8px] py-[2px] text-[9px] font-semibold uppercase tracking-wide text-bg">
                          Open
                        </span>
                      )}
                    </div>
                    <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">
                      {p.isSeries ? `Series · ${p.books} books` : "Standalone"} · {p.chapters} chapters
                    </div>
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
          </div>
        )}

        {!mergeId && (
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
