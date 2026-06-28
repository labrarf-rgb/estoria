import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";

/** "Open project" — switch between independent projects in the library. */
export function ProjectsModal() {
  const show = useStore((s) => s.showProjects);
  const activeId = useStore((s) => s.doc.id);
  const listProjects = useStore((s) => s.listProjects);
  const switchProject = useStore((s) => s.switchProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const setPanel = useStore((s) => s.setPanel);
  if (!show) return null;
  const close = () => setPanel("showProjects", false);
  const projects = listProjects();

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[86vh] w-[min(680px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-[24px] py-[20px]">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">Your projects</div>
            <div className="mt-[3px] text-[12.5px] font-medium text-soft">
              Each project is independent, with its own books, characters and world.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="flex flex-col gap-[10px] overflow-auto px-[22px] py-[18px]">
          {projects.map((p) => {
            const isActive = p.id === activeId;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-[12px] rounded-[13px] border bg-card p-[14px] ${
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
                {projects.length > 1 && (
                  <button
                    onClick={() => deleteProject(p.id)}
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

        <div className="flex items-center gap-[10px] border-t border-rule px-[24px] py-[14px]">
          <button
            onClick={() => setPanel("showNewBook", true)}
            className="rounded-lg bg-ink px-[14px] py-[9px] text-[13px] font-semibold text-bg"
          >
            + New project
          </button>
          <span className="text-[11.5px] font-medium text-faint">
            {projects.length} project{projects.length === 1 ? "" : "s"} · saved in this browser
          </span>
        </div>
      </div>
    </Scrim>
  );
}
