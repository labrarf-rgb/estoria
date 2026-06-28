import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";

/**
 * "+ New -> New book" chooser. A new book is NOT assumed to be part of a series:
 * the user picks a standalone project or adding a volume to the current series.
 */
export function NewBookModal() {
  const show = useStore((s) => s.showNewBook);
  const doc = useStore((s) => s.doc);
  const setPanel = useStore((s) => s.setPanel);
  const addBook = useStore((s) => s.addBook);
  const startFresh = useStore((s) => s.startFresh);
  if (!show) return null;
  const close = () => setPanel("showNewBook", false);

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="w-[min(720px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-[26px] py-[20px]">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">New book</div>
            <div className="mt-[3px] text-[12.5px] font-medium text-soft">
              A book can stand on its own or be one volume of a series. Which is this?
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="grid grid-cols-1 gap-[14px] p-[24px] sm:grid-cols-2">
          <button
            onClick={startFresh}
            className="flex flex-col gap-[8px] rounded-[15px] border border-rule bg-card p-[18px] text-left hover:border-faint"
          >
            <span className="font-serif text-[17px] font-semibold text-ink">Standalone book</span>
            <span className="text-[12.5px] leading-[1.5] text-soft">
              Start a brand-new, separate project with its own characters and world. You'll choose
              how to begin (template, blank, or import).
            </span>
            <span className="mt-[4px] text-[11px] font-semibold uppercase tracking-wide text-but">
              Replaces the current project — export it first to keep it
            </span>
          </button>

          <button
            onClick={addBook}
            className="flex flex-col gap-[8px] rounded-[15px] border border-rule bg-card p-[18px] text-left hover:border-faint"
          >
            <span className="font-serif text-[17px] font-semibold text-ink">Add to this series</span>
            <span className="text-[12.5px] leading-[1.5] text-soft">
              Add the next volume to "{doc.projectTitle}", sharing its characters and world. Turns on
              the series view so you can map books together.
            </span>
            <span className="mt-[4px] text-[11px] font-semibold uppercase tracking-wide text-faint">
              Keeps your current work
            </span>
          </button>
        </div>
      </div>
    </Scrim>
  );
}
