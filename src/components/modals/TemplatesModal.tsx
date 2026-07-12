import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { TEMPLATES, TEMPLATE_GROUPS } from "@/lib/templates";

export function TemplatesModal() {
  const show = useStore((s) => s.showTemplates);
  const setPanel = useStore((s) => s.setPanel);
  const applyTemplate = useStore((s) => s.applyTemplate);
  // Which facet is active in the filter bar; "All" shows every template.
  const [filter, setFilter] = useState<string>("All");
  if (!show) return null;
  const close = () => setPanel("showTemplates", false);

  const filters = ["All", ...TEMPLATE_GROUPS];
  const shown = filter === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.groups.includes(filter));

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[88vh] w-[min(980px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
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
        {/* Facet filter bar. A plain flex-wrap row: sits on one line when the
            modal is wide, wraps on its own when it narrows. */}
        <div className="flex flex-wrap items-center gap-[7px] border-b border-rule px-[24px] py-[13px]">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-[13px] py-[6px] text-[12.5px] font-medium ${
                filter === f
                  ? "border-ink bg-ink text-bg"
                  : "border-rule text-soft hover:border-faint hover:text-ink"
              }`}
            >
              {f}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] font-medium text-faint">
            {shown.length} {shown.length === 1 ? "template" : "templates"}
          </span>
        </div>
        {/* Responsive grid: auto-fill sizes columns to the modal width — 3 wide,
            2 at ~half screen, 1 on a phone — without any breakpoints. */}
        <div className="grid gap-[14px] overflow-auto px-[24px] py-5 [grid-template-columns:repeat(auto-fill,minmax(235px,1fr))]">
          {shown.map((t) => (
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
