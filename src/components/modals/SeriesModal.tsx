import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import type { BookStatus } from "@/types";

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
              The view above your books — premise, status and arc for each volume in order.
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
          {doc.series.map((b, i) => (
            <div key={b.id} className="rounded-2xl border border-rule bg-card p-[18px]">
              <div className="flex items-start gap-[14px]">
                <span className="flex h-[48px] w-[44px] items-center justify-center rounded-md bg-but font-serif text-[20px] font-semibold text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-[10px]">
                    <span className="font-serif text-[18px] font-semibold text-ink">{b.title}</span>
                    <span className="rounded-full border border-rule px-[9px] py-[2px] text-[10px] font-semibold uppercase tracking-wide text-soft">
                      {STATUS_LABEL[b.status]}
                    </span>
                    {b.live && (
                      <span className="rounded-full bg-ink px-[9px] py-[2px] text-[10px] font-semibold uppercase tracking-wide text-bg">
                        Editing now
                      </span>
                    )}
                  </div>
                  <div className="mt-[3px] text-[11.5px] font-medium text-soft">
                    {b.subtitle} · {b.outline.length > 0 ? `${b.outline.length} beats outlined` : "—"}
                  </div>
                  <div className="mt-[10px] text-[13px] leading-[1.5] text-ink">{b.premise}</div>
                  <div className="mt-[8px] flex gap-[8px] text-[12px] text-soft">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-faint">
                      Arc
                    </span>
                    {b.arc}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Scrim>
  );
}
