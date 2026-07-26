import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Drawer, SizeButton, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { AssetLinkPicker } from "@/components/ui/AssetLinkPicker";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { resolveRefs } from "@/lib/refs";
import type { WorldCategory, WorldEntry } from "@/types";

const CATEGORIES: WorldCategory[] = ["Place", "Faction", "Lore", "Event"];

export function WorldPanel() {
  const show = useStore((s) => s.showWorld);
  const world = useStore((s) => s.doc.world);
  const assets = useStore((s) => s.doc.assets);
  const sel = useStore((s) => s.selWorld);
  const setPanel = useStore((s) => s.setPanel);
  const selectWorld = useStore((s) => s.selectWorld);
  // The blank card from "+ Add world entry" — not an entry yet (see the store).
  const draft = useStore((s) => s.worldDraft);
  const startDraft = useStore((s) => s.startWorldDraft);
  const updateDraft = useStore((s) => s.updateWorldDraft);
  const discardDraft = useStore((s) => s.discardWorldDraft);
  const updateWorldEntry = useStore((s) => s.updateWorldEntry);
  const deleteWorldEntry = useStore((s) => s.deleteWorldEntry);
  const addWorldRef = useStore((s) => s.addWorldRef);
  const deleteWorldRef = useStore((s) => s.deleteWorldRef);
  const reorderWorldRef = useStore((s) => s.reorderWorldRef);
  const linkAssetToWorld = useStore((s) => s.linkAssetToWorld);
  const updateWorldRefAsset = useStore((s) => s.updateWorldRefAsset);
  const askConfirm = useStore((s) => s.askConfirm);
  // Which world entry currently has the "link book asset" picker open.
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const refView = useStore((s) => s.refView);
  const setRefView = useStore((s) => s.setRefView);
  const descExpanded = useStore((s) => s.textareaExpanded.worldDesc);
  const notesExpanded = useStore((s) => s.textareaExpanded.worldNotes);
  const toggleTextarea = useStore((s) => s.toggleTextarea);
  const panelExpanded = useStore((s) => s.panelExpanded);
  const setPanelExpanded = useStore((s) => s.setPanelExpanded);
  const jumpToChapter = useStore((s) => s.jumpToChapter);
  const chapters = useStore((s) => s.doc.chapters);
  const activeBookId = useStore((s) => s.doc.activeBookId);
  const activeDraftId = useStore((s) => s.doc.activeDraftId);
  if (!show) return null;
  const close = () => setPanel("showWorld", false);
  // Archived assets are unpinned and retired — never offered for linking.
  const linkable = assets.filter((a) => !a.archived);
  /** Chapters of the loaded board that reference this entry. */
  const appearsIn = (id: string) => chapters.filter((c) => (c.worldRefs ?? []).includes(id));
  const jumpTo = (chapterId: string) => jumpToChapter(activeBookId, activeDraftId, chapterId);

  return (
    <Drawer
      expanded={panelExpanded}
      onClose={close}
      header={
        <div className="flex items-center px-[22px] py-5">
          <div>
            <div className="font-serif text-[18px] font-semibold text-ink">World</div>
            <div className="mt-[2px] text-[11.5px] font-medium text-soft">
              Places, factions, lore &amp; references
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
      <div className="flex flex-col gap-[11px] px-[18px] py-[14px]">
          {/* The draft renders last, exactly where it will land once committed —
              same id, same position, so typing doesn't remount the card. */}
          {(draft ? world.concat(draft) : world).map((w) => {
            const open = sel === w.id;
            const isDraft = w.id === draft?.id;
            const set = (patch: Partial<WorldEntry>) =>
              isDraft ? updateDraft(patch) : updateWorldEntry(w.id, patch);
            return (
              <div key={w.id} className="rounded-[13px] border border-rule bg-card p-[14px]">
                <div className="flex items-center gap-[11px]">
                  <span className="h-[10px] w-[10px] flex-shrink-0 rounded-full bg-soft" />
                  <button onClick={() => selectWorld(w.id)} className="min-w-0 flex-1 text-left">
                    <div
                      className={`font-serif text-[15px] font-semibold ${isDraft ? "text-faint" : "text-ink"}`}
                    >
                      {w.name || (isDraft ? "New entry" : "Untitled entry")}
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                      {isDraft ? "Nothing saved yet — type anything to add it" : w.cat}
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
                          onChange={(e) => set({ name: e.target.value })}
                          placeholder="e.g. The Drowned City"
                          className="w-full rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-faint"
                        />
                      </div>
                      <div className="w-[120px]">
                        <Label>Category</Label>
                        <select
                          value={w.cat}
                          onChange={(e) => set({ cat: e.target.value as WorldCategory })}
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
                      <ExpandableTextarea
                        value={w.desc}
                        onChange={(v) => set({ desc: v })}
                        placeholder="Describe this piece of the world"
                        expandedHeight="40vh"
                        expanded={descExpanded}
                        onToggleExpanded={() => toggleTextarea("worldDesc")}
                        className="rounded-lg border border-rule bg-panel px-[9px] py-[6px] pr-[70px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint focus:border-faint"
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <ExpandableTextarea
                        value={w.notes}
                        onChange={(v) => set({ notes: v })}
                        placeholder="Extra notes, connections, open questions"
                        expandedHeight="40vh"
                        expanded={notesExpanded}
                        onToggleExpanded={() => toggleTextarea("worldNotes")}
                        className="rounded-lg border border-rule bg-panel px-[9px] py-[6px] pr-[70px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint focus:border-faint"
                      />
                    </div>
                    {/* Where this entry is referenced — each chapter a way in,
                        like a character's "Appears in" and a note's pin list. */}
                    {appearsIn(w.id).length > 0 && (
                      <div>
                        <Label>Appears in</Label>
                        <div className="flex flex-wrap gap-[5px]">
                          {appearsIn(w.id).map((c) => (
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
                      </div>
                    )}
                    {/* A reference has to hang off a saved entry, so this appears
                        once the draft has content and becomes one. */}
                    <div className={isDraft ? "hidden" : undefined}>
                      <div className="mb-[5px] flex items-center gap-[10px]">
                        <Label>References</Label>
                        <div className="flex-1" />
                        <ViewToggle view={refView} onChange={setRefView} />
                      </div>
                      <RefList
                        refs={resolveRefs(w.refs, assets)}
                        onAdd={(kind, id) => addWorldRef(w.id, kind, id)}
                        // Content edits write through to the shared asset; the
                        // store resolves ref → asset against current state.
                        onUpdate={(refId, patch) => updateWorldRefAsset(w.id, refId, patch)}
                        onDelete={(refId) => deleteWorldRef(w.id, refId)}
                        // This entry's own pin order, independent of the library's.
                        onReorder={(refId, toIdx) => reorderWorldRef(w.id, refId, toIdx)}
                        deletePrompt={() => ({
                          message: "Remove from this world entry?",
                          detail: "It stays in the shared library.",
                          // Not a delete — the button must not say one.
                          confirmLabel: "Remove",
                        })}
                        onLink={() => setLinkFor((v) => (v === w.id ? null : w.id))}
                        linkLabel="Link book asset"
                        view={refView}
                      />
                      {linkFor === w.id && (
                        <AssetLinkPicker
                          assets={linkable}
                          linkedAssetIds={new Set(w.refs.map((r) => r.assetId))}
                          onPick={(assetId) => {
                            linkAssetToWorld(w.id, assetId);
                            setLinkFor(null);
                          }}
                        />
                      )}
                    </div>
                    <button
                      onClick={() =>
                        // Nothing to confirm on a draft — there's nothing saved to lose.
                        isDraft
                          ? discardDraft()
                          : askConfirm({
                              message: `Delete "${w.name || "this entry"}"?`,
                              danger: true,
                              onConfirm: () => deleteWorldEntry(w.id),
                            })
                      }
                      className="self-start rounded-lg border border-rule px-[12px] py-[6px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
                    >
                      {isDraft ? "Discard" : "Delete entry"}
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
            + Add world entry
          </button>
      </div>
    </Drawer>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
}
