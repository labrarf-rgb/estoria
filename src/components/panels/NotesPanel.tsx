import { useStore } from "@/store/useStore";
import { Drawer, SizeButton, CloseButton } from "@/components/ui/Overlay";
import { ArchiveShelf } from "@/components/ui/ArchiveShelf";
import { RefList, todoProgress } from "@/components/ui/RefList";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { countAllAssetLinks, findAssetPins, type AssetPin } from "@/lib/refs";
import type { Asset } from "@/types";

export function NotesPanel() {
  const show = useStore((s) => s.showNotes);
  const doc = useStore((s) => s.doc);
  const notes = useStore((s) => s.doc.storyNotes);
  const activeBook = useStore((s) => s.doc.books.find((b) => b.id === s.doc.activeBookId));
  const setNotes = useStore((s) => s.setStoryNotes);
  const setPanel = useStore((s) => s.setPanel);
  const addAsset = useStore((s) => s.addAsset);
  const updateAsset = useStore((s) => s.updateAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const reorderAsset = useStore((s) => s.reorderAsset);
  const archiveAsset = useStore((s) => s.archiveAsset);
  const unarchiveAsset = useStore((s) => s.unarchiveAsset);
  const askConfirm = useStore((s) => s.askConfirm);
  const jumpToChapter = useStore((s) => s.jumpToChapter);
  const jumpToWorldEntry = useStore((s) => s.jumpToWorldEntry);
  const libView = useStore((s) => s.refView);
  const setLibView = useStore((s) => s.setRefView);
  const notesExpanded = useStore((s) => s.textareaExpanded.storyNotes);
  const toggleTextarea = useStore((s) => s.toggleTextarea);
  const panelExpanded = useStore((s) => s.panelExpanded);
  const setPanelExpanded = useStore((s) => s.setPanelExpanded);
  if (!show) return null;
  const close = () => setPanel("showNotes", false);
  // One walk of the doc for every asset's link count (used by the caption and
  // the delete confirm), instead of re-walking once per asset per render.
  const linkCounts = countAllAssetLinks(doc);
  // Archived assets keep their pins (dimmed where they sit) but leave the
  // library list and the link picker, so nothing new can be pinned to them.
  const assets = doc.assets.filter((a) => !a.archived);
  const archived = doc.assets.filter((a) => a.archived);

  // Chips read like a character's "Appears in": the chapter number, not the
  // whole title. The title attribute carries the name (and the book/version,
  // when the pin isn't in the board on screen) so nothing is actually lost.
  const pinLabel = (p: AssetPin) => (p.target === "world" ? p.worldName : `Ch ${p.chapterNum}`);

  /** Where a pin lives, when that isn't the board already on screen. */
  const pinWhere = (p: AssetPin) =>
    p.target === "world" || p.current
      ? ""
      : `${doc.books.length > 1 ? `${p.bookTitle} · ` : ""}${p.draftName}`;

  const pinTitle = (p: AssetPin) => {
    if (p.target === "world") return `Open ${p.worldName} · world entry`;
    const name = p.chapterTitle || "this chapter";
    return p.current ? `Open ${name}` : `Go to ${pinWhere(p)} and open ${name}`;
  };

  /**
   * Group pins by *where* they are so each chip can stay as short as a
   * character's "Appears in" chip. Pins in the board on screen come first with
   * no heading; anything in another version, book, or the world gets one small
   * label above its row rather than repeating the location on every chip.
   */
  const groupPins = (pins: AssetPin[]) => {
    const groups: { label: string; pins: AssetPin[] }[] = [];
    for (const p of pins) {
      const label = p.target === "world" ? "World" : p.current ? "" : pinWhere(p);
      const g = groups.find((x) => x.label === label);
      if (g) g.pins.push(p);
      else groups.push({ label, pins: [p] });
    }
    // The current board's row first, then the labelled ones in discovery order.
    return groups.sort((a, b) => (a.label === "" ? -1 : b.label === "" ? 1 : 0));
  };

  const jump = (p: AssetPin) =>
    p.target === "world"
      ? jumpToWorldEntry(p.worldId)
      : jumpToChapter(p.bookId, p.draftId, p.chapterId);

  const untitledLabel = (a: Asset) =>
    a.label || (a.kind === "IMAGE" ? "Untitled image" : a.kind === "TODO" ? "Untitled list" : "Untitled note");

  return (
    <Drawer
      expanded={panelExpanded}
      onClose={close}
      header={
        <div className="flex items-center px-[22px] py-5">
          <div>
            <div className="font-serif text-[18px] font-semibold text-ink">Story notes</div>
            <div className="mt-[2px] text-[11.5px] font-medium text-soft">
              {activeBook ? activeBook.title : "This book"} · themes, questions &amp; reminders
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-[8px]">
            <SizeButton expanded={panelExpanded} onClick={() => setPanelExpanded(!panelExpanded)} />
            <CloseButton onClick={close} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-[18px]">
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
            onAdd={(kind, id) => addAsset(kind, id)}
            idPrefix="a"
            onUpdate={(id, patch) => updateAsset(id, patch)}
            onDelete={(id) => deleteAsset(id)}
            // The library owns the asset — removal here is the irreversible
            // one, so it gets a labelled button rather than the detach ✕.
            removeMode="destroy"
            onReorder={(id, toIdx) => reorderAsset(id, toIdx)}
            onArchive={(id) => archiveAsset(id)}
            archivePrompt={(r) => {
              const n = linkCounts.get(r.id) ?? 0;
              return {
                message: "Archive this from the library?",
                // Archiving keeps the pins, so this says what stays. It used to
                // warn that pins were dropped, which is what changed in v8.
                detail:
                  n > 0
                    ? `It stays pinned in ${n} place${n === 1 ? "" : "s"}, shown dimmed, and leaves the library. Restoring brings it back unchanged.`
                    : "It moves to the archive, where you can restore it any time.",
                confirmLabel: "Archive",
              };
            }}
            deletePrompt={(r) => {
              const n = linkCounts.get(r.id) ?? 0;
              return {
                message: `Delete this ${r.kind === "IMAGE" ? "image" : r.kind === "TODO" ? "to-do list" : "note"} everywhere?`,
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
            // Expanding an item lists exactly where it's pinned — each one a
            // button that takes you there, switching book/version if it has to.
            extra={(r) => {
              const pins = findAssetPins(doc, r.id);
              return (
                <div className="flex flex-col gap-[5px]">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                    Pinned in
                  </div>
                  {pins.length === 0 ? (
                    <div className="text-[11.5px] text-faint">
                      Not pinned yet. Link it from a chapter or a world entry.
                    </div>
                  ) : (
                    groupPins(pins).map((g) => (
                      <div key={g.label || "here"} className="flex flex-col gap-[4px]">
                        {g.label && (
                          <div className="text-[10.5px] font-medium text-faint">{g.label}</div>
                        )}
                        <div className="flex flex-wrap gap-[5px]">
                          {g.pins.map((p) => (
                            <button
                              key={
                                p.target === "world"
                                  ? `w-${p.worldId}`
                                  : `c-${p.bookId}-${p.draftId}-${p.chapterId}`
                              }
                              onClick={() => jump(p)}
                              title={pinTitle(p)}
                              className="flex items-center gap-[5px] rounded-md border border-rule px-[8px] py-[2px] font-mono text-[11px] font-medium text-soft hover:border-faint hover:text-ink"
                            >
                              {pinLabel(p)}
                              <span className="text-[10px] text-faint">↗</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            }}
            view={libView}
          />
        </div>

        <ArchiveShelf
          blurb="Archived items stay pinned where they are, shown dimmed, but leave the library so nothing new can be pinned to them. Restoring puts one back unchanged."
          items={archived.map((a) => ({
            id: a.id,
            icon: a.kind === "IMAGE" ? "🖼" : a.kind === "TODO" ? "☑" : "📝",
            title: untitledLabel(a),
            caption:
              a.kind === "TODO"
                ? todoProgress(a.items)
                : a.kind === "IMAGE"
                  ? "Image"
                  : (a.body ?? "").trim() || "Empty note",
          }))}
          onRestore={(id) => unarchiveAsset(id)}
          onDelete={(it) => {
            const n = linkCounts.get(it.id) ?? 0;
            askConfirm({
              message: `Delete "${it.title}" for good?`,
              detail:
                n > 0
                  ? `It is still pinned in ${n} place${n === 1 ? "" : "s"} across your versions and books.`
                  : "It isn't pinned anywhere.",
              danger: true,
              onConfirm: () => deleteAsset(it.id),
            });
          }}
        />

        <div className="text-[11px] font-medium text-faint">
          Notes are per book · the library is shared across the series · included in markdown export
        </div>
      </div>
    </Drawer>
  );
}
