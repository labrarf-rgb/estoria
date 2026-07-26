import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { Drawer, SizeButton, CloseButton } from "@/components/ui/Overlay";
import type { Character } from "@/types";

export function CharactersPanel() {
  const show = useStore((s) => s.showChars);
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selChar);
  const setPanel = useStore((s) => s.setPanel);
  const selectChar = useStore((s) => s.selectChar);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  const askConfirm = useStore((s) => s.askConfirm);
  // The blank card from "+ Add character" — not a character yet (see the store).
  const draft = useStore((s) => s.charDraft);
  const startDraft = useStore((s) => s.startCharDraft);
  const updateDraft = useStore((s) => s.updateCharDraft);
  const discardDraft = useStore((s) => s.discardCharDraft);
  const panelExpanded = useStore((s) => s.panelExpanded);
  const setPanelExpanded = useStore((s) => s.setPanelExpanded);
  const jumpToChapter = useStore((s) => s.jumpToChapter);

  // Scroll the selected character's card into view whenever the selection
  // changes — e.g. after "+ Create new character" from the chapter modal, which
  // opens this panel and selects the (last-in-list) new character; without this
  // its input fields sit below the fold on a long roster.
  const selCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // `nearest` so we only scroll when the selected card isn't already fully in
    // view: after "+ Add character" the new (expanded, taller-than-panel) card
    // is off-screen, so its top edge aligns just under the sticky header
    // (`scroll-mt` clears the bar). But manually expanding an already-visible
    // card — or reopening the panel onto one — leaves the scroll untouched,
    // instead of yanking every selection to the top as `start` would.
    if (show && sel) selCardRef.current?.scrollIntoView({ block: "nearest" });
  }, [show, sel]);

  if (!show) return null;
  const close = () => setPanel("showChars", false);

  const chapterCount = (id: string) => doc.chapters.filter((c) => c.chars.includes(id)).length;
  /** Chapters of the loaded board this character is cast in — same scope as the
   *  "in N chapters" line above it. */
  const appearsIn = (id: string) => doc.chapters.filter((c) => c.chars.includes(id));
  /** Leave for a chapter: the panel closes on the way (see `jumpToChapter`). */
  const jumpTo = (chapterId: string) =>
    jumpToChapter(doc.activeBookId, doc.activeDraftId, chapterId);

  return (
    <Drawer
      expanded={panelExpanded}
      onClose={close}
      header={
        <div className="flex items-center px-[22px] py-5">
          <div className="font-serif text-[18px] font-semibold text-ink">Characters</div>
          <div className="flex-1" />
          <div className="flex items-center gap-[8px]">
            <SizeButton expanded={panelExpanded} onClick={() => setPanelExpanded(!panelExpanded)} />
            <CloseButton onClick={close} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[11px] px-[18px] py-[14px]">
          {/* The draft renders last, exactly where it will land once committed —
              same id, same position, so typing doesn't remount the card. */}
          {(draft ? doc.characters.concat(draft) : doc.characters).map((p) => {
            const open = sel === p.id;
            const isDraft = p.id === draft?.id;
            const set = (patch: Partial<Character>) =>
              isDraft ? updateDraft(patch) : updateCharacter(p.id, patch);
            return (
              <div
                key={p.id}
                ref={open ? selCardRef : undefined}
                className="scroll-mt-[76px] rounded-[13px] border border-rule bg-card p-[14px]"
              >
                <div className="flex items-center gap-[11px]">
                  <span
                    className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                    style={{ background: p.color }}
                  >
                    {p.initials || "?"}
                  </span>
                  <button onClick={() => selectChar(p.id)} className="min-w-0 flex-1 text-left">
                    <div
                      className={`font-serif text-[15px] font-semibold ${isDraft ? "text-faint" : "text-ink"}`}
                    >
                      {p.name || (isDraft ? "New character" : "Unnamed character")}
                    </div>
                    <div className="text-[11.5px] font-medium text-soft">
                      {isDraft
                        ? "Nothing saved yet — type anything to add them"
                        : `${p.role || "No role"} · in ${chapterCount(p.id)} chapters`}
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
                        <Input value={p.name} onChange={(v) => set({ name: v })} placeholder="Character name" />
                      </Field>
                      <Field label="Initials" className="w-[70px]">
                        <Input value={p.initials} onChange={(v) => set({ initials: v })} placeholder="AB" />
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Role" className="flex-1">
                        <Input value={p.role} onChange={(v) => set({ role: v })} placeholder="e.g. Protagonist" />
                      </Field>
                      <Field label="Archetype" className="flex-1">
                        <Input value={p.type} onChange={(v) => set({ type: v })} placeholder="e.g. Mentor" />
                      </Field>
                    </Row>
                    <Field label="Description">
                      <Area value={p.desc} onChange={(v) => set({ desc: v })} rows={2} placeholder="A one-line description of this character" />
                    </Field>
                    <Field label="Bio">
                      <Area value={p.bio} onChange={(v) => set({ bio: v })} rows={2} placeholder="Backstory and background" />
                    </Field>
                    <Field label="Traits (comma separated)">
                      <Input
                        value={p.traits.join(", ")}
                        onChange={(v) => set({ traits: splitList(v) })}
                        placeholder="brave, guarded, curious"
                      />
                    </Field>
                    <Field label="Goals (comma separated)">
                      <Input
                        value={p.goals.join(", ")}
                        onChange={(v) => set({ goals: splitList(v) })}
                        placeholder="What they're trying to achieve"
                      />
                    </Field>
                    <Field label="Motivations">
                      <Area value={p.motivations} onChange={(v) => set({ motivations: v })} rows={2} placeholder="What drives them beneath the surface" />
                    </Field>
                    <Row>
                      <Field label="Wants" className="flex-1">
                        <Area value={p.want} onChange={(v) => set({ want: v })} rows={2} placeholder="What they want" />
                      </Field>
                      <Field label="Needs" className="flex-1">
                        <Area value={p.need} onChange={(v) => set({ need: v })} rows={2} placeholder="What they need" />
                      </Field>
                    </Row>
                    <Field label="Notes">
                      <Area value={p.notes} onChange={(v) => set({ notes: v })} rows={2} placeholder="Other notes about this character" />
                    </Field>
                    {appearsIn(p.id).length > 0 && (
                      <Field label="Appears in">
                        <div className="flex flex-wrap gap-[5px]">
                          {/* Each chapter is a way in, not just a label: clicking
                              closes this panel and opens that chapter — the same
                              move as a note's "Pinned in" list. */}
                          {appearsIn(p.id).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => jumpTo(c.id)}
                              title={`Open ${c.title || "this chapter"}`}
                              className="flex items-center gap-[5px] rounded-md border border-rule px-[8px] py-[2px] font-mono text-[11px] font-medium text-soft hover:border-faint hover:text-ink"
                            >
                              Ch {c.num}
                              <span className="text-[10px] text-faint">↗</span>
                            </button>
                          ))}
                        </div>
                      </Field>
                    )}
                    <button
                      onClick={() =>
                        // Nothing to confirm on a draft — there's nothing saved to lose.
                        isDraft
                          ? discardDraft()
                          : askConfirm({
                              message: `Delete ${p.name || "this character"}?`,
                              detail: "They will be removed from every chapter they appear in.",
                              danger: true,
                              onConfirm: () => deleteCharacter(p.id),
                            })
                      }
                      className="self-start rounded-lg border border-rule px-[12px] py-[6px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
                    >
                      {isDraft ? "Discard" : "Delete character"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={startDraft}
            disabled={!!draft}
            className="flex w-full items-center justify-center gap-[7px] rounded-[13px] border-[1.5px] border-dashed border-line py-[13px] text-[13px] font-semibold text-soft hover:border-faint hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-soft"
          >
            + Add character
          </button>
      </div>
    </Drawer>
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

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-faint"
    />
  );
}

function Area({
  value,
  onChange,
  rows = 2,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint focus:border-faint"
    />
  );
}
