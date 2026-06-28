import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { downloadProjectFile } from "@/store/persistence";

type Mode = "choose" | "save" | "pickSeries";

/**
 * "New book" chooser. A new book is never assumed to be part of a series:
 * the user picks standalone, a new series, or adds to an existing series. When a
 * new project would replace the current one, we prompt how to keep it.
 */
export function NewBookModal() {
  const show = useStore((s) => s.showNewBook);
  const doc = useStore((s) => s.doc);
  const setPanel = useStore((s) => s.setPanel);
  const newProject = useStore((s) => s.newProject);
  const addBook = useStore((s) => s.addBook);
  const switchProject = useStore((s) => s.switchProject);
  const listProjects = useStore((s) => s.listProjects);

  const [mode, setMode] = useState<Mode>("choose");
  const [pendingSeries, setPendingSeries] = useState(false);

  if (!show) return null;
  const close = () => {
    setMode("choose");
    setPanel("showNewBook", false);
  };

  const hasContent =
    doc.chapters.length > 0 || doc.characters.length > 0 || doc.world.length > 0;
  const seriesProjects = listProjects().filter((p) => p.isSeries);

  const begin = (series: boolean) => {
    if (hasContent) {
      setPendingSeries(series);
      setMode("save");
    } else {
      newProject({ series, keepCurrent: false });
      setMode("choose");
    }
  };

  const finish = (keepCurrent: boolean, exportFirst: boolean) => {
    if (exportFirst) downloadProjectFile(doc);
    newProject({ series: pendingSeries, keepCurrent });
    setMode("choose");
  };

  const addToSeries = (projectId: string) => {
    if (projectId !== doc.id) switchProject(projectId);
    addBook();
    setMode("choose");
  };

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="w-[min(740px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-[26px] py-[20px]">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">
              {mode === "save" ? "Keep your current project?" : "New book"}
            </div>
            <div className="mt-[3px] text-[12.5px] font-medium text-soft">
              {mode === "save"
                ? `Starting a new project. Decide what happens to "${doc.projectTitle}".`
                : mode === "pickSeries"
                  ? "Which series should the new book join?"
                  : "A book can stand alone, start a series, or join one you already have."}
            </div>
          </div>
          {mode === "choose" ? (
            <CloseButton onClick={close} />
          ) : (
            <button
              onClick={() => setMode("choose")}
              className="rounded-lg border border-rule bg-card px-[10px] py-[6px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Back
            </button>
          )}
        </div>

        {mode === "choose" && (
          <div className="grid grid-cols-1 gap-[14px] p-[24px] sm:grid-cols-3">
            <Card
              title="Standalone book"
              body="A new, separate project with its own characters and world."
              tag="Not a series"
              onClick={() => begin(false)}
            />
            <Card
              title="Start a series"
              body="A new project in series mode, with this as Book One."
              tag="New series"
              onClick={() => begin(true)}
            />
            <Card
              title="Add to a series"
              body={
                seriesProjects.length
                  ? "Add the next volume to a series you already have."
                  : "You don't have any series yet."
              }
              tag={`${seriesProjects.length} available`}
              disabled={seriesProjects.length === 0}
              onClick={() => setMode("pickSeries")}
            />
          </div>
        )}

        {mode === "save" && (
          <div className="grid grid-cols-1 gap-[14px] p-[24px] sm:grid-cols-3">
            <Card
              title="Keep it"
              body="Save it in your projects so you can open it again anytime."
              tag="Recommended"
              onClick={() => finish(true, false)}
            />
            <Card
              title="Export a copy, then keep"
              body="Download a project file as a backup, then keep it in your projects."
              tag="Backup"
              onClick={() => finish(true, true)}
            />
            <Card
              title="Discard it"
              body="Permanently remove the current project. This cannot be undone."
              tag="Delete"
              danger
              onClick={() => finish(false, false)}
            />
          </div>
        )}

        {mode === "pickSeries" && (
          <div className="flex flex-col gap-[10px] p-[24px]">
            {seriesProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => addToSeries(p.id)}
                className="flex items-center gap-[12px] rounded-[13px] border border-rule bg-card p-[14px] text-left hover:border-faint"
              >
                <div className="flex-1">
                  <div className="font-serif text-[15px] font-semibold text-ink">{p.title}</div>
                  <div className="mt-[2px] font-mono text-[11px] font-medium text-soft">
                    {p.books} books · {p.chapters} chapters
                  </div>
                </div>
                <span className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg">
                  Add book
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Scrim>
  );
}

function Card({
  title,
  body,
  tag,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col gap-[8px] rounded-[15px] border border-rule bg-card p-[16px] text-left hover:border-faint disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="font-serif text-[16px] font-semibold text-ink">{title}</span>
      <span className="flex-1 text-[12px] leading-[1.5] text-soft">{body}</span>
      <span
        className={`text-[10.5px] font-semibold uppercase tracking-wide ${
          danger ? "text-but" : "text-faint"
        }`}
      >
        {tag}
      </span>
    </button>
  );
}
