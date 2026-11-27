import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Drawer, MetaChip } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { AssetLinkPicker } from "@/components/ui/AssetLinkPicker";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { ArchiveShelf } from "@/components/ui/ArchiveShelf";
import { DetailCard, EmptyBody, InkBadge, TileGrid, AddTile } from "@/components/ui/DetailCard";
import { PositionInput } from "@/components/ui/PositionInput";
import { Grip, ReorderItem, ReorderLive, useTileReorder } from "@/components/ui/useTileReorder";
import { DetailWindow } from "@/components/ui/DetailWindow";
import { DrawerFooter } from "@/components/panels/CharactersPanel";
import { resolveRefs } from "@/lib/refs";
import { countWorldReferences } from "@/lib/entities";
import type { WorldCategory, WorldEntry } from "@/types";

const CATEGORIES: WorldCategory[] = ["Place", "Faction", "Lore", "Event"];

const FIELD =
  "w-full rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-faint";

export function WorldPanel() {
  const show = useStore((s) => s.showWorld);
  // Reference counts span every version and book, so the shelf needs the doc,
  // not just the world list (same reason NotesPanel takes the whole doc).
  const doc = useStore((s) => s.doc);
  const world = useStore((s) => s.doc.world);
  const sel = useStore((s) => s.selWorld);
  const setPanel = useStore((s) => s.setPanel);
  const selectWorld = useStore((s) => s.selectWorld);
  // The blank card from "+ Add world entry": not an entry yet (see the store).
  const draft = useStore((s) => s.worldDraft);
  const startDraft = useStore((s) => s.startWorldDraft);
  const updateDraft = useStore((s) => s.updateWorldDraft);
  const discardDraft = useStore((s) => s.discardWorldDraft);
  const updateWorldEntry = useStore((s) => s.updateWorldEntry);
  const deleteWorldEntry = useStore((s) => s.deleteWorldEntry);
  const archiveWorldEntry = useStore((s) => s.archiveWorldEntry);
  const unarchiveWorldEntry = useStore((s) => s.unarchiveWorldEntry);
  const askConfirm = useStore((s) => s.askConfirm);
  const jumpToChapter = useStore((s) => s.jumpToChapter);
  const chapters = useStore((s) => s.doc.chapters);
  const activeBookId = useStore((s) => s.doc.activeBookId);
  const activeDraftId = useStore((s) => s.doc.activeDraftId);
  const reorderWorldEntry = useStore((s) => s.reorderWorldEntry);
  // Grip-drag ordering of the live entries (archived ones keep their slots).
  const reorder = useTileReorder({
    ids: world.filter((w) => !w.archived).map((w) => w.id),
    onMove: reorderWorldEntry,
    nameOf: (id) => world.find((w) => w.id === id)?.name || "Untitled entry",
  });
  if (!show) return null;
  const close = () => setPanel("showWorld", false);
  // Archived entries keep their chapter references but leave this list.
  const entries = world.filter((w) => !w.archived);
  const archived = world.filter((w) => w.archived);
  // The draft tile sits last, where it lands once committed (same id), so the
  // window open on it never remounts mid-typing.
  const tiles = draft ? entries.concat(draft) : entries;
  const open = tiles.find((w) => w.id === sel) ?? null;
  const openIsDraft = !!open && open.id === draft?.id;
  /** Chapters of the loaded board that reference this entry. */
  const appearsIn = (id: string) => chapters.filter((c) => (c.worldRefs ?? []).includes(id));
  const closeWindow = () => (openIsDraft ? discardDraft() : sel && selectWorld(sel));
  const jumpTo = (chapterId: string) => {
    closeWindow();
    jumpToChapter(activeBookId, activeDraftId, chapterId);
  };

  /** One world tile. The grip is the only drag handle; the position number
   *  shows only while the list is being rearranged. */
  const tileFor = (w: WorldEntry) => {
    const isDraft = w.id === draft?.id;
    const n = appearsIn(w.id).length;
    const refs = w.refs.length;
    const name = w.name || (isDraft ? "New entry" : "Untitled entry");
    const idx = reorder.indexOf(w.id);
    return (
      <div className="min-w-0 flex-1">
        <DetailCard
          onOpen={() => selectWorld(w.id)}
          grip={isDraft ? undefined : <Grip r={reorder} id={w.id} name={name} />}
          position={
            isDraft || idx === -1 ? undefined : (
              <PositionInput
                look="faint"
                hidden={!reorder.arranging}
                index={idx}
                total={entries.length}
                onCommit={(to) => reorderWorldEntry(w.id, to)}
              />
            )
          }
          badge={<InkBadge>{w.cat}</InkBadge>}
          title={name}
          untitled={!w.name}
          faded={isDraft}
          body={
            isDraft ? (
              <EmptyBody>Nothing saved yet, type anything to add it</EmptyBody>
            ) : w.desc ? (
              w.desc
            ) : (
              <EmptyBody>No description yet</EmptyBody>
            )
          }
          meta={isDraft ? [] : [`on ${n} chapter${n === 1 ? "" : "s"}`, refs > 0 && `${refs} ref${refs === 1 ? "" : "s"}`]}
        />
      </div>
    );
  };

  return (
    <Drawer
      onClose={close}
      label="World"
      title="World"
      subtitle="Places, factions, lore & references"
      meta={CATEGORIES.map((k) => (
        <MetaChip key={k} k={k} n={entries.filter((w) => w.cat === k).length} />
      ))}
    >
      <div className="flex flex-col gap-[14px] px-[26px] py-[22px]">
        <div {...reorder.containerProps}>
          <TileGrid min={230}>
            {reorder.order.map((id) => {
              const w = entries.find((x) => x.id === id);
              return w ? (
                <ReorderItem key={id} r={reorder} id={id} className="flex">
                  {tileFor(w)}
                </ReorderItem>
              ) : null;
            })}
            {draft && (
              <div key={draft.id} className="flex">
                {tileFor(draft)}
              </div>
            )}
            <AddTile onClick={startDraft} disabled={!!draft}>
              + Add world entry
            </AddTile>
          </TileGrid>
          {reorder.dragId && reorder.renderLifted(tileFor(entries.find((x) => x.id === reorder.dragId)!))}
          <ReorderLive r={reorder} />
        </div>

        <ArchiveShelf
          blurb="Archived entries stay on the chapters that reference them, shown dimmed, but can't be added to new ones. Restoring puts them back in the world list unchanged."
          items={archived.map((w) => {
            const n = countWorldReferences(doc, w.id);
            return {
              id: w.id,
              icon: <span className="block h-[10px] w-[10px] rounded-full bg-soft" />,
              title: w.name || "Untitled entry",
              caption: `${w.cat} · on ${n} chapter${n === 1 ? "" : "s"}`,
            };
          })}
          onRestore={(id) => unarchiveWorldEntry(id)}
          onDelete={(it) => {
            const n = countWorldReferences(doc, it.id);
            askConfirm({
              message: `Delete "${it.title}" for good?`,
              detail:
                n > 0
                  ? `It will be removed from the ${n} chapter${n === 1 ? "" : "s"} that still reference it, across your versions and books.`
                  : "No chapters reference it.",
              danger: true,
              onConfirm: () => deleteWorldEntry(it.id),
            });
          }}
        />
      </div>

      {open && (
        <WorldWindow
          w={open}
          isDraft={openIsDraft}
          set={(patch) => (openIsDraft ? updateDraft(patch) : updateWorldEntry(open.id, patch))}
          appearsIn={appearsIn(open.id)}
          onJump={jumpTo}
          onClose={closeWindow}
          footer={
            <DrawerFooter
              isDraft={openIsDraft}
              deleteLabel="Delete entry"
              draftHint="Nothing saved yet, type anything to add it"
              onArchive={() => {
            const n = countWorldReferences(doc, open.id);
            askConfirm({
              message: `Archive "${open.name || "this entry"}"?`,
              // Counted across versions and books, like the character archive
              // confirm, and says so.
              detail:
                n > 0
                  ? `It leaves the world list but stays on the ${n} chapter${n === 1 ? "" : "s"} that reference it across your versions and books, shown dimmed. Restoring brings it back unchanged.`
                  : "It leaves the world list and moves to the archive, where you can restore it any time.",
              confirmLabel: "Archive",
              onConfirm: () => archiveWorldEntry(open.id),
            });
          }}
              onDelete={() =>
            // Nothing to confirm on a draft: there's nothing saved to lose.
            openIsDraft
              ? discardDraft()
              : askConfirm({
                  message: `Delete "${open.name || "this entry"}"?`,
                  danger: true,
                  onConfirm: () => deleteWorldEntry(open.id),
                })
              }
            />
          }
        />
      )}
    </Drawer>
  );
}

/**
 * One world entry, open: the expanded card's fields, in the same order.
 * Opened from the World drawer and from a chapter's or piece's World chips,
 * each passing its own footer.
 */
export function WorldWindow({
  w,
  isDraft = false,
  set,
  appearsIn,
  onJump,
  onClose,
  footer,
}: {
  w: WorldEntry;
  isDraft?: boolean;
  set: (patch: Partial<WorldEntry>) => void;
  appearsIn: { id: string; num: number; title: string }[];
  onJump: (chapterId: string) => void;
  onClose: () => void;
  footer: React.ReactNode;
}) {
  const assets = useStore((s) => s.doc.assets);
  const addWorldRef = useStore((s) => s.addWorldRef);
  const deleteWorldRef = useStore((s) => s.deleteWorldRef);
  const reorderWorldRef = useStore((s) => s.reorderWorldRef);
  const linkAssetToWorld = useStore((s) => s.linkAssetToWorld);
  const updateWorldRefAsset = useStore((s) => s.updateWorldRefAsset);
  const descExpanded = useStore((s) => s.textareaExpanded.worldDesc);
  const notesExpanded = useStore((s) => s.textareaExpanded.worldNotes);
  const toggleTextarea = useStore((s) => s.toggleTextarea);
  // Whether the "link book asset" picker is open.
  const [linking, setLinking] = useState(false);
  // Archived assets are retired from the library: never offered for linking,
  // though the ones already pinned here stay pinned (dimmed on their tiles).
  const linkable = assets.filter((a) => !a.archived);

  return (
    <DetailWindow
      onClose={onClose}
      badge={<InkBadge>{w.cat}</InkBadge>}
      title={w.name || (isDraft ? "New entry" : "Untitled entry")}
      untitled={!w.name}
      footer={footer}
    >
      <div className="flex flex-col gap-[12px]">
        <div className="flex gap-[12px]">
          <div className="flex-1">
            <Label>Name</Label>
            <input
              autoFocus={isDraft}
              value={w.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. The Drowned City"
              className={FIELD}
            />
          </div>
          <div className="w-[120px]">
            <Label>Category</Label>
            <select
              value={w.cat}
              onChange={(e) => set({ cat: e.target.value as WorldCategory })}
              className={FIELD}
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
            className="rounded-lg border border-rule bg-card px-[9px] py-[6px] pr-[70px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint focus:border-faint"
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
            className="rounded-lg border border-rule bg-card px-[9px] py-[6px] pr-[70px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint focus:border-faint"
          />
        </div>
        {/* Where this entry is referenced: each chapter a way in, like a
            character's "Appears in" and a note's pin list. */}
        {appearsIn.length > 0 && (
          <div>
            <Label>Appears in</Label>
            <div className="flex flex-wrap gap-[5px]">
              {appearsIn.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onJump(c.id)}
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
        {/* A reference has to hang off a saved entry, so this appears once the
            draft has content and becomes one. */}
        {!isDraft && (
          <div>
            <Label>References</Label>
            <RefList
              refs={resolveRefs(w.refs, assets)}
              tileMin={170}
              onAdd={(kind, id) => addWorldRef(w.id, kind, id)}
              // Content edits write through to the shared asset; the store
              // resolves ref → asset against current state.
              onUpdate={(refId, patch) => updateWorldRefAsset(w.id, refId, patch)}
              onDelete={(refId) => deleteWorldRef(w.id, refId)}
              // This entry's own pin order, independent of the library's.
              onReorder={(refId, toIdx) => reorderWorldRef(w.id, refId, toIdx)}
              deletePrompt={() => ({
                message: "Remove from this world entry?",
                detail: "It stays in the shared library.",
                // Not a delete: the button must not say one.
                confirmLabel: "Remove",
              })}
              removeLabel="Remove from this entry"
              onLink={() => setLinking((v) => !v)}
              linkLabel="Link book asset"
            />
            {linking && (
              <AssetLinkPicker
                assets={linkable}
                linkedAssetIds={new Set(w.refs.map((r) => r.assetId))}
                onPick={(assetId) => {
                  linkAssetToWorld(w.id, assetId);
                  setLinking(false);
                }}
              />
            )}
          </div>
        )}
      </div>
    </DetailWindow>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
}
