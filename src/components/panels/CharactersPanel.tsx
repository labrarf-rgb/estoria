import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import type { Character } from "@/types";

export function CharactersPanel() {
  const show = useStore((s) => s.showChars);
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selChar);
  const setPanel = useStore((s) => s.setPanel);
  const selectChar = useStore((s) => s.selectChar);
  const addCharacter = useStore((s) => s.addCharacter);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  if (!show) return null;
  const close = () => setPanel("showChars", false);

  const chapterCount = (id: string) => doc.chapters.filter((c) => c.chars.includes(id)).length;
  const appearsIn = (id: string) =>
    doc.chapters.filter((c) => c.chars.includes(id)).map((c) => `Ch ${c.num}`);

  return (
    <Scrim onClose={close} z={55}>
      <div
        onMouseDown={stop}
        className="absolute bottom-0 right-0 top-0 w-[420px] overflow-auto border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
      >
        <div className="sticky top-0 z-[2] flex items-center border-b border-rule bg-panel px-[22px] py-5">
          <div className="font-serif text-[18px] font-semibold text-ink">Characters</div>
          <div className="flex-1" />
          <CloseButton onClick={close} />
        </div>
        <div className="flex flex-col gap-[11px] px-[18px] py-[14px]">
          {doc.characters.map((p) => {
            const open = sel === p.id;
            const set = (patch: Partial<Character>) => updateCharacter(p.id, patch);
            return (
              <div key={p.id} className="rounded-[13px] border border-rule bg-card p-[14px]">
                <div className="flex items-center gap-[11px]">
                  <span
                    className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                    style={{ background: p.color }}
                  >
                    {p.initials}
                  </span>
                  <button onClick={() => selectChar(p.id)} className="min-w-0 flex-1 text-left">
                    <div className="font-serif text-[15px] font-semibold text-ink">{p.name}</div>
                    <div className="text-[11.5px] font-medium text-soft">
                      {p.role} · in {chapterCount(p.id)} chapters
                    </div>
                  </button>
                  <button
                    onClick={() => selectChar(p.id)}
                    className="text-[13px] font-medium text-faint"
                  >
                    {open ? "▴" : "▾"}
                  </button>
                </div>

                {open && (
                  <div className="mt-[13px] flex flex-col gap-[12px] border-t border-rule pt-[13px]">
                    <Row>
                      <Field label="Name" className="flex-1">
                        <Input value={p.name} onChange={(v) => set({ name: v })} />
                      </Field>
                      <Field label="Initials" className="w-[70px]">
                        <Input value={p.initials} onChange={(v) => set({ initials: v })} />
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Role" className="flex-1">
                        <Input value={p.role} onChange={(v) => set({ role: v })} />
                      </Field>
                      <Field label="Archetype" className="flex-1">
                        <Input value={p.type} onChange={(v) => set({ type: v })} />
                      </Field>
                    </Row>
                    <Field label="Description">
                      <Area value={p.desc} onChange={(v) => set({ desc: v })} rows={2} />
                    </Field>
                    <Field label="Bio">
                      <Area value={p.bio} onChange={(v) => set({ bio: v })} rows={2} />
                    </Field>
                    <Field label="Traits (comma separated)">
                      <Input
                        value={p.traits.join(", ")}
                        onChange={(v) => set({ traits: splitList(v) })}
                      />
                    </Field>
                    <Field label="Goals (comma separated)">
                      <Input
                        value={p.goals.join(", ")}
                        onChange={(v) => set({ goals: splitList(v) })}
                      />
                    </Field>
                    <Field label="Motivations">
                      <Area value={p.motivations} onChange={(v) => set({ motivations: v })} rows={2} />
                    </Field>
                    <Row>
                      <Field label="Wants" className="flex-1">
                        <Area value={p.want} onChange={(v) => set({ want: v })} rows={2} />
                      </Field>
                      <Field label="Needs" className="flex-1">
                        <Area value={p.need} onChange={(v) => set({ need: v })} rows={2} />
                      </Field>
                    </Row>
                    <Field label="Notes">
                      <Area value={p.notes} onChange={(v) => set({ notes: v })} rows={2} />
                    </Field>
                    {appearsIn(p.id).length > 0 && (
                      <Field label="Appears in">
                        <div className="flex flex-wrap gap-[5px]">
                          {appearsIn(p.id).map((a) => (
                            <span
                              key={a}
                              className="rounded-md border border-rule px-[8px] py-[2px] font-mono text-[11px] font-medium text-soft"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </Field>
                    )}
                    <button
                      onClick={() => deleteCharacter(p.id)}
                      className="self-start rounded-lg border border-rule px-[12px] py-[6px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
                    >
                      Delete character
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={addCharacter}
            className="flex w-full items-center justify-center gap-[7px] rounded-[13px] border-[1.5px] border-dashed border-line py-[13px] text-[13px] font-semibold text-soft hover:border-faint hover:text-ink"
          >
            + Add character
          </button>
        </div>
      </div>
    </Scrim>
  );
}

function splitList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-[12px]">{children}</div>;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] text-ink outline-none focus:border-faint"
    />
  );
}

function Area({
  value,
  onChange,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full resize-none rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.5] text-ink outline-none focus:border-faint"
    />
  );
}
