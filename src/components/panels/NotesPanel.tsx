import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { countAllAssetLinks } from "@/lib/refs";

export function NotesPanel() {
  const show = useStore((s) => s.showNotes);
  const doc = useStore((s) => s.doc);
  const notes = useStore((s) => s.doc.storyNotes);
  const assets = useStore((s) => s.doc.assets);
  const activeBook = useStore((s) => s.doc.books.find((b) => b.id === s.doc.activeBookId));
  const setNotes = useStore((s) => s.setStoryNotes);
  const setPanel = useStore((s) => s.setPanel);
  const addAsset = useStore((s) => s.addAsset);
  const updateAsset = useStore((s) => s.updateAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const libView = useStore((s) => s.refView);
  const setLibView = useStore((s) => s.setRefView);
  const notesExpanded = useStore((s) => s.textareaExpanded.storyNotes);
  const toggleTextarea = useStore((s) => s.toggleTextarea);
  if (!show) return null;
  const close = () => setPanel("showNotes", false);
  // One walk of the doc for every asset's link count (used by the caption and
  // the delete confirm), instead of re-walking once per asset per render.
  const linkCounts = countAllAssetLinks(doc);

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
            expanded={notesExpanded}
            onToggleExpanded={() => toggleTextarea("storyNotes")}
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
              refs={assets}
              onAdd={(kind) => addAsset(kind)}
              onUpdate={(id, patch) => updateAsset(id, patch)}
              onDelete={(id) => deleteAsset(id)}
              deletePrompt={(r) => {
                const n = linkCounts.get(r.id) ?? 0;
                return {
                  message: `Delete this ${r.kind === "IMAGE" ? "image" : "note"} everywhere?`,
                  // "places" spans versions and books (matching the delete sweep),
                  // so say so — a bare count reads like chapters.
                  detail:
                    n > 0
                      ? `It is pinned in ${n} place${n === 1 ? "" : "s"} across your versions and books.`
                      : "It isn't pinned anywhere.",
                  danger: true,
                };
              }}
              caption={(r) => {
                const n = linkCounts.get(r.id) ?? 0;
                return n > 0 ? `${n} pin${n === 1 ? "" : "s"} across versions & books` : "Not pinned yet";
              }}
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
