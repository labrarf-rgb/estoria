import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { ViewToggle, type RefView } from "@/components/ui/ViewToggle";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import type { PinnedRef } from "@/types";

export function NotesPanel() {
  const show = useStore((s) => s.showNotes);
  const notes = useStore((s) => s.doc.storyNotes);
  const assets = useStore((s) => s.doc.assets);
  const activeBook = useStore((s) => s.doc.books.find((b) => b.id === s.doc.activeBookId));
  const setNotes = useStore((s) => s.setStoryNotes);
  const setPanel = useStore((s) => s.setPanel);
  const addAsset = useStore((s) => s.addAsset);
  const updateAsset = useStore((s) => s.updateAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const [libView, setLibView] = useState<RefView>("list");
  if (!show) return null;
  const close = () => setPanel("showNotes", false);

  return (
    <Scrim onClose={close} z={55}>
      <div
        onMouseDown={stop}
        className="absolute bottom-0 right-0 top-0 flex w-[460px] flex-col border-l border-rule bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-center border-b border-rule px-[22px] py-5">
          <div>
            <div className="font-serif text-[18px] font-semibold text-ink">Story notes</div>
            <div className="mt-[2px] text-[11.5px] font-medium text-soft">
              {activeBook ? activeBook.title : "This book"} · themes, questions &amp; reminders
            </div>
          </div>
          <div className="flex-1" />
          <CloseButton onClick={close} />
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-auto p-[18px]">
          <ExpandableTextarea
            value={notes}
            onChange={setNotes}
            placeholder="Jot themes, throughlines, open questions, pacing notes..."
            collapsedRows={9}
            expandedHeight="62vh"
            className="rounded-xl border border-rule bg-card p-4 font-serif text-[13.5px] leading-[1.65] text-ink outline-none"
          />

          <div>
            <div className="mb-[8px] flex items-center gap-[10px]">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                Shared library · link these into any chapter
              </div>
              <div className="flex-1" />
              <ViewToggle view={libView} onChange={setLibView} />
            </div>
            <RefList
              refs={assets as PinnedRef[]}
              onAdd={(kind) => addAsset(kind)}
              onUpdate={(id, patch) => updateAsset(id, patch)}
              onDelete={(id) => deleteAsset(id)}
              view={libView}
            />
          </div>

          <div className="text-[11px] font-medium text-faint">
            Notes are per book · the library is shared across the series · included in markdown export
          </div>
        </div>
      </div>
    </Scrim>
  );
}
