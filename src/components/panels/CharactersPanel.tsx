import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";

export function CharactersPanel() {
  const show = useStore((s) => s.showChars);
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selChar);
  const setPanel = useStore((s) => s.setPanel);
  const selectChar = useStore((s) => s.selectChar);
  const addCharacter = useStore((s) => s.addCharacter);
  if (!show) return null;
  const close = () => setPanel("showChars", false);

  const chapterCount = (id: string) => doc.chapters.filter((c) => c.chars.includes(id)).length;
  const appearsIn = (id: string) =>
    doc.chapters.filter((c) => c.chars.includes(id)).map((c) => `Ch ${c.num}`);

  return (
    <Scrim onClose={close} z={55}>
      <div
        onMouseDown={stop}
        className="absolute bottom-0 right-0 top-0 w-[400px] overflow-auto border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
      >
        <div className="sticky top-0 z-[2] flex items-center border-b border-rule bg-panel px-[22px] py-5">
          <div className="font-serif text-[18px] font-semibold text-ink">Characters</div>
          <div className="flex-1" />
          <CloseButton onClick={close} />
        </div>
        <div className="flex flex-col gap-[11px] px-[18px] py-[14px]">
          {doc.characters.map((p) => {
            const open = sel === p.id;
            return (
              <div
                key={p.id}
                onClick={() => selectChar(p.id)}
                className="cursor-pointer rounded-[13px] border border-rule bg-card p-[14px] hover:border-faint"
              >
                <div className="flex items-center gap-[11px]">
                  <span
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[12px] font-semibold text-white"
                    style={{ background: p.color }}
                  >
                    {p.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-[15px] font-semibold text-ink">{p.name}</span>
                      <span className="rounded-full bg-chip px-[8px] py-[2px] text-[10px] font-semibold uppercase tracking-wide text-soft">
                        {p.type}
                      </span>
                    </div>
                    <div className="text-[11.5px] font-medium text-soft">
                      {p.role} · in {chapterCount(p.id)} chapters
                    </div>
                  </div>
                  <span className="text-[13px] font-medium text-faint">{open ? "▴" : "▾"}</span>
                </div>

                {open && (
                  <div className="mt-[13px] flex flex-col gap-[13px] border-t border-rule pt-[13px]">
                    <div className="text-[13px] leading-[1.55] text-ink">{p.desc}</div>
                    <Field label="Bio">{p.bio}</Field>
                    <div>
                      <Label>Traits</Label>
                      <div className="flex flex-wrap gap-[6px]">
                        {p.traits.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-chip px-[9px] py-[3px] text-[11px] font-medium text-soft"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Goals</Label>
                      <div className="flex flex-col gap-1">
                        {p.goals.map((g) => (
                          <div key={g} className="flex gap-[7px] text-[12.5px] leading-[1.4] text-ink">
                            <span className="text-faint">→</span>
                            {g}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Field label="Motivations">{p.motivations}</Field>
                    <div className="flex gap-[14px]">
                      <Field label="Wants" className="flex-1">
                        {p.want}
                      </Field>
                      <Field label="Needs" className="flex-1">
                        {p.need}
                      </Field>
                    </div>
                    <div>
                      <Label>Appears in</Label>
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
                    </div>
                    <Field label="Notes">{p.notes}</Field>
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
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
      <Label>{label}</Label>
      <div className="text-[12.5px] leading-[1.5] text-ink">{children}</div>
    </div>
  );
}
