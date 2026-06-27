import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import type { BookStatus } from "@/types";

const STATUSES: BookStatus[] = ["drafting", "planned", "idea"];
const STATUS_LABEL: Record<BookStatus, string> = {
  drafting: "Drafting",
  planned: "Planned",
  idea: "Idea",
};

export function SeriesModal() {
  const show = useStore((s) => s.showSeries);
  const doc = useStore((s) => s.doc);
  const setPanel = useStore((s) => s.setPanel);
  const toggleSeriesMode = useStore((s) => s.toggleSeriesMode);
  const switchBook = useStore((s) => s.switchBook);
  const updateBook = useStore((s) => s.updateBook);
  const addBook = useStore((s) => s.addBook);
  const deleteBook = useStore((s) => s.deleteBook);
  if (!show) return null;
  const close = () => setPanel("showSeries", false);

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[88vh] w-[min(900px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-[26px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[20px] font-semibold text-ink">Series planner</div>
            <div className="mt-1 text-[12.5px] font-medium text-soft">
              The view above your books. Premise, status and arc for each volume in order.
            </div>
          </div>
          <button
            onClick={toggleSeriesMode}
            className="flex items-center gap-[10px] rounded-lg border border-rule bg-card px-3 py-[7px] text-[12px] font-medium text-ink hover:border-faint"
          >
            Series mode
            <span
              className="relative h-[18px] w-[32px] rounded-full transition-colors"
              style={{ background: doc.seriesMode ? "var(--therefore)" : "var(--line)" }}
            >
              <span
                className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all"
                style={{ left: doc.seriesMode ? "16px" : "2px" }}
              />
            </span>
          </button>
          <CloseButton onClick={close} />
        </div>

        <div className="flex flex-col gap-[14px] overflow-auto px-[26px] py-[20px]">
          {doc.books.map((b, i) => {
            const active = b.id === doc.activeBookId;
            return (
              <div key={b.id} className="rounded-2xl border border-rule bg-card p-[18px]">
                <div className="flex items-start gap-[14px]">
                  <span className="flex h-[48px] w-[44px] flex-shrink-0 items-center justify-center rounded-md bg-but font-serif text-[20px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[10px]">
                      <input
                        value={b.title}
                        onChange={(e) => updateBook(b.id, { title: e.target.value })}
                        className="bg-transparent font-serif text-[18px] font-semibold text-ink outline-none"
                      />
                      {active && (
                        <span className="rounded-full bg-ink px-[9px] py-[2px] text-[10px] font-semibold uppercase tracking-wide text-bg">
                          Editing now
                        </span>
                      )}
                      <div className="flex-1" />
                      <select
                        value={b.status}
                        onChange={(e) => updateBook(b.id, { status: e.target.value as BookStatus })}
                        className="rounded-md border border-rule bg-panel px-[8px] py-[3px] text-[11px] font-medium text-ink outline-none"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      value={b.subtitle}
                      onChange={(e) => updateBook(b.id, { subtitle: e.target.value })}
                      placeholder="Subtitle"
                      className="mt-[2px] w-full bg-transparent text-[11.5px] font-medium text-soft outline-none placeholder:text-faint"
                    />
                    <textarea
                      value={b.premise}
                      onChange={(e) => updateBook(b.id, { premise: e.target.value })}
                      placeholder="Premise..."
                      rows={2}
                      className="mt-[8px] w-full resize-none rounded-lg border border-rule bg-panel p-[9px] text-[13px] leading-[1.5] text-ink outline-none placeholder:text-faint"
                    />
                    <div className="mt-[8px] flex items-start gap-[8px]">
                      <span className="mt-[8px] font-mono text-[10px] font-semibold uppercase tracking-wide text-faint">
                        Arc
                      </span>
                      <textarea
                        value={b.arc}
                        onChange={(e) => updateBook(b.id, { arc: e.target.value })}
                        placeholder="The arc this book carries..."
                        rows={1}
                        className="flex-1 resize-none rounded-lg border border-rule bg-panel p-[9px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint"
                      />
                    </div>
                    <div className="mt-[10px] flex items-center gap-[8px]">
                      {!active && (
                        <button
                          onClick={() => switchBook(b.id)}
                          className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg"
                        >
                          Open board
                        </button>
                      )}
                      {doc.books.length > 1 && !active && (
                        <button
                          onClick={() => deleteBook(b.id)}
                          className="rounded-lg border border-rule bg-panel px-[12px] py-[7px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={addBook}
            className="flex w-full items-center justify-center gap-[7px] rounded-2xl border-[1.5px] border-dashed border-line py-[14px] text-[13px] font-semibold text-soft hover:border-faint hover:text-ink"
          >
            + Add book
          </button>
        </div>
      </div>
    </Scrim>
  );
}
