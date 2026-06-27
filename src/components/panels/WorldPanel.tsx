import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import type { WorldCategory } from "@/types";

const CATEGORIES: WorldCategory[] = ["Place", "Faction", "Lore", "Event"];

export function WorldPanel() {
  const show = useStore((s) => s.showWorld);
  const world = useStore((s) => s.doc.world);
  const sel = useStore((s) => s.selWorld);
  const setPanel = useStore((s) => s.setPanel);
  const selectWorld = useStore((s) => s.selectWorld);
  const addWorldEntry = useStore((s) => s.addWorldEntry);
  const updateWorldEntry = useStore((s) => s.updateWorldEntry);
  const deleteWorldEntry = useStore((s) => s.deleteWorldEntry);
  const addWorldRef = useStore((s) => s.addWorldRef);
  const updateWorldRef = useStore((s) => s.updateWorldRef);
  const deleteWorldRef = useStore((s) => s.deleteWorldRef);
  if (!show) return null;
  const close = () => setPanel("showWorld", false);

  return (
    <Scrim onClose={close} z={55}>
      <div
        onMouseDown={stop}
        className="absolute bottom-0 right-0 top-0 w-[440px] overflow-auto border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
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
              <div key={w.id} className="rounded-[13px] border border-rule bg-card p-[14px]">
                <div className="flex items-center gap-[11px]">
                  <span className="h-[10px] w-[10px] flex-shrink-0 rounded-full bg-soft" />
                  <button onClick={() => selectWorld(w.id)} className="min-w-0 flex-1 text-left">
                    <div className="font-serif text-[15px] font-semibold text-ink">{w.name}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                      {w.cat}
                    </div>
                  </button>
                  <button
                    onClick={() => selectWorld(w.id)}
                    className="text-[13px] font-medium text-faint"
                  >
                    {open ? "▴" : "▾"}
                  </button>
                </div>
                {open && (
                  <div className="mt-[13px] flex flex-col gap-[12px] border-t border-rule pt-[13px]">
                    <div className="flex gap-[12px]">
                      <div className="flex-1">
                        <Label>Name</Label>
                        <input
                          value={w.name}
                          onChange={(e) => updateWorldEntry(w.id, { name: e.target.value })}
                          className="w-full rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] text-ink outline-none focus:border-faint"
                        />
                      </div>
                      <div className="w-[120px]">
                        <Label>Category</Label>
                        <select
                          value={w.cat}
                          onChange={(e) =>
                            updateWorldEntry(w.id, { cat: e.target.value as WorldCategory })
                          }
                          className="w-full rounded-lg border border-rule bg-panel px-[8px] py-[6px] text-[12.5px] text-ink outline-none focus:border-faint"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <textarea
                        value={w.desc}
                        onChange={(e) => updateWorldEntry(w.id, { desc: e.target.value })}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.5] text-ink outline-none focus:border-faint"
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <textarea
                        value={w.notes}
                        onChange={(e) => updateWorldEntry(w.id, { notes: e.target.value })}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.5] text-ink outline-none focus:border-faint"
                      />
                    </div>
                    <div>
                      <Label>References</Label>
                      <RefList
                        refs={w.refs}
                        onAdd={(kind) => addWorldRef(w.id, kind)}
                        onUpdate={(refId, patch) => updateWorldRef(w.id, refId, patch)}
                        onDelete={(refId) => deleteWorldRef(w.id, refId)}
                      />
                    </div>
                    <button
                      onClick={() => deleteWorldEntry(w.id)}
                      className="self-start rounded-lg border border-rule px-[12px] py-[6px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
                    >
                      Delete entry
                    </button>
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
}
