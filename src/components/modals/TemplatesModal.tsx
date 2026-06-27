import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { TEMPLATES } from "@/lib/templates";

export function TemplatesModal() {
  const show = useStore((s) => s.showTemplates);
  const setPanel = useStore((s) => s.setPanel);
  const applyTemplate = useStore((s) => s.applyTemplate);
  if (!show) return null;
  const close = () => setPanel("showTemplates", false);

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[88vh] w-[min(880px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start gap-3 border-b border-rule px-[24px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">Start from a structure</div>
            <div className="mt-1 text-[12.5px] font-medium leading-[1.5] text-soft">
              Insert a proven story skeleton as chapters, pre-sorted into acts. Insert adds to your
              board; Replace starts fresh.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>
        <div className="grid grid-cols-2 gap-[14px] overflow-auto px-[24px] py-5">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-[9px] rounded-[13px] border border-rule bg-card p-[16px]"
            >
              <div className="flex items-center gap-[9px]">
                <span className="font-serif text-[16px] font-semibold text-ink">{t.name}</span>
                <span className="rounded-full bg-chip px-[8px] py-[3px] text-[9.5px] font-semibold uppercase tracking-wide text-soft">
                  {t.tag}
                </span>
              </div>
              <div className="flex-1 text-[12.5px] leading-[1.5] text-soft">{t.blurb}</div>
              <div className="mt-[2px] flex items-center gap-2">
                <span className="flex-1 font-mono text-[11px] font-medium text-faint">
                  {t.beats.length} beats
                </span>
                <button
                  onClick={() => applyTemplate(t.id, "replace")}
                  className="rounded-lg border border-rule bg-panel px-3 py-[7px] text-[12px] font-medium text-ink hover:border-faint"
                >
                  Replace
                </button>
                <button
                  onClick={() => applyTemplate(t.id, "insert")}
                  className="rounded-lg bg-ink px-[14px] py-[7px] text-[12px] font-semibold text-bg"
                >
                  Insert
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Scrim>
  );
}
