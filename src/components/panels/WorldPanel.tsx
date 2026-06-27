import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";

export function WorldPanel() {
  const show = useStore((s) => s.showWorld);
  const world = useStore((s) => s.doc.world);
  const sel = useStore((s) => s.selWorld);
  const setPanel = useStore((s) => s.setPanel);
  const selectWorld = useStore((s) => s.selectWorld);
  const addWorldEntry = useStore((s) => s.addWorldEntry);
  if (!show) return null;
  const close = () => setPanel("showWorld", false);

  return (
    <Scrim onClose={close} z={55}>
      <div
        onMouseDown={stop}
        className="absolute bottom-0 right-0 top-0 w-[400px] overflow-auto border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
      >
        <div className="sticky top-0 z-[2] flex items-center border-b border-rule bg-panel px-[22px] py-5">
          <div>
            <div className="font-serif text-[18px] font-semibold text-ink">World</div>
            <div className="mt-[2px] text-[11.5px] font-medium text-soft">
              Places, factions, lore &amp; references
            </div>
          </div>
          <div className="flex-1" />
          <CloseButton onClick={close} />
        </div>
        <div className="flex flex-col gap-[11px] px-[18px] py-[14px]">
          {world.map((w) => {
            const open = sel === w.id;
            return (
              <div
                key={w.id}
                onClick={() => selectWorld(w.id)}
                className="cursor-pointer rounded-[13px] border border-rule bg-card p-[14px] hover:border-faint"
              >
                <div className="flex items-center gap-[11px]">
                  <span className="h-[10px] w-[10px] rounded-full bg-soft" />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[15px] font-semibold text-ink">{w.name}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                      {w.cat}
                    </div>
                  </div>
                  <span className="text-[13px] font-medium text-faint">{open ? "▴" : "▾"}</span>
                </div>
                {open && (
                  <div className="mt-[13px] flex flex-col gap-3 border-t border-rule pt-[13px]">
                    <div className="text-[13px] leading-[1.55] text-ink">{w.desc}</div>
                    {w.notes && (
                      <div>
                        <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
                          Notes
                        </div>
                        <div className="text-[12.5px] leading-[1.5] text-ink">{w.notes}</div>
                      </div>
                    )}
                    {w.refs.length > 0 && (
                      <div className="flex flex-wrap gap-[5px]">
                        {w.refs.map((r, i) => (
                          <span
                            key={i}
                            className="rounded-md border border-rule px-[8px] py-[2px] font-mono text-[10.5px] font-medium text-soft"
                          >
                            {r.kind} · {r.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={addWorldEntry}
            className="flex w-full items-center justify-center gap-[7px] rounded-[13px] border-[1.5px] border-dashed border-line py-[13px] text-[13px] font-semibold text-soft hover:border-faint hover:text-ink"
          >
            + Add world entry
          </button>
        </div>
      </div>
    </Scrim>
  );
}
