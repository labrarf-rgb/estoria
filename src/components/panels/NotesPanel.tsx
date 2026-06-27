import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";

export function NotesPanel() {
  const show = useStore((s) => s.showNotes);
  const notes = useStore((s) => s.doc.storyNotes);
  const setNotes = useStore((s) => s.setStoryNotes);
  const setPanel = useStore((s) => s.setPanel);
  if (!show) return null;
  const close = () => setPanel("showNotes", false);

  return (
    <Scrim onClose={close} z={55}>
      <div
        onMouseDown={stop}
        className="absolute bottom-0 right-0 top-0 flex w-[440px] flex-col border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-center border-b border-rule px-[22px] py-5">
          <div>
            <div className="font-serif text-[18px] font-semibold text-ink">Story notes</div>
            <div className="mt-[2px] text-[11.5px] font-medium text-soft">
              Themes, questions &amp; reminders for the whole book
            </div>
          </div>
          <div className="flex-1" />
          <CloseButton onClick={close} />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Jot themes, throughlines, open questions, pacing notes…"
          className="m-[18px] flex-1 resize-none rounded-xl border border-rule bg-card p-4 font-serif text-[13.5px] leading-[1.65] text-ink outline-none"
        />
        <div className="px-[22px] pb-[18px] text-[11px] font-medium text-faint">
          Saved to your story · included in markdown export
        </div>
      </div>
    </Scrim>
  );
}
