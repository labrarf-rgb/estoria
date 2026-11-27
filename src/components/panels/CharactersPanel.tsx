import { useStore } from "@/store/useStore";
import { Drawer, MetaChip } from "@/components/ui/Overlay";
import { ArchiveShelf } from "@/components/ui/ArchiveShelf";
import { DetailCard, EmptyBody, InitialsBadge, TileGrid, AddTile } from "@/components/ui/DetailCard";
import { DetailWindow, WindowButton } from "@/components/ui/DetailWindow";
import { PositionInput } from "@/components/ui/PositionInput";
import { Grip, ReorderItem, ReorderLive, useTileReorder } from "@/components/ui/useTileReorder";
import { countCharacterCastings } from "@/lib/entities";
import { otherEnd, tiesOf } from "@/lib/relationships";
import { RelationshipsField } from "@/components/relationships/RelationshipsField";
import { RelationshipChart } from "@/components/relationships/RelationshipChart";
import type { Character } from "@/types";

export function CharactersPanel() {
  const show = useStore((s) => s.showChars);
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selChar);
  const setPanel = useStore((s) => s.setPanel);
  const selectChar = useStore((s) => s.selectChar);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  const archiveCharacter = useStore((s) => s.archiveCharacter);
  const unarchiveCharacter = useStore((s) => s.unarchiveCharacter);
  const askConfirm = useStore((s) => s.askConfirm);
  // The blank card from "+ Add character": not a character yet (see the store).
  const draft = useStore((s) => s.charDraft);
  const startDraft = useStore((s) => s.startCharDraft);
  const updateDraft = useStore((s) => s.updateCharDraft);
  const discardDraft = useStore((s) => s.discardCharDraft);
  const jumpToChapter = useStore((s) => s.jumpToChapter);
  const reorderCharacter = useStore((s) => s.reorderCharacter);
  const charsView = useStore((s) => s.charsView);
  const setCharsView = useStore((s) => s.setCharsView);
  const setChartFocus = useStore((s) => s.setChartFocus);
  // Grip-drag ordering of the roster (archived characters keep their slots).
  const reorder = useTileReorder({
    ids: doc.characters.filter((c) => !c.archived).map((c) => c.id),
    onMove: reorderCharacter,
    nameOf: (id) => doc.characters.find((c) => c.id === id)?.name || "Unnamed character",
  });

  if (!show) return null;
  const close = () => setPanel("showChars", false);

  // Archived characters keep every casting, so they stay on the board (dimmed)
  // but leave the roster and the chapter picker. The shelf below is the only
  // place they're listed until restored.
  const roster = doc.characters.filter((c) => !c.archived);
  const archived = doc.characters.filter((c) => c.archived);
  /** Relationships between two characters still on the roster: the header's
   *  tie count, on the same rule as the tiles' (archived partners don't count). */
  const onRoster = new Set(roster.map((c) => c.id));
  const liveTies = (doc.relationships ?? []).filter((r) => onRoster.has(r.a) && onRoster.has(r.b)).length;
  // The draft tile sits last, exactly where it lands once committed, so the
  // window open on it keeps the same id and never remounts mid-typing.
  const tiles = draft ? roster.concat(draft) : roster;
  const open = tiles.find((c) => c.id === sel) ?? null;
  const openIsDraft = !!open && open.id === draft?.id;

  const chapterCount = (id: string) => doc.chapters.filter((c) => c.chars.includes(id)).length;
  /** Chapters of the loaded board this character is cast in: same scope as the
   *  "in N chapters" line on the tile. */
  const appearsIn = (id: string) => doc.chapters.filter((c) => c.chars.includes(id));
  /** Relationships with someone still on the roster (archived partners aren't counted on the tile). */
  const tieCount = (id: string) =>
    tiesOf(doc, id).filter((r) => !doc.characters.find((c) => c.id === otherEnd(r, id))?.archived).length;
  /** The delete confirms' line about relationships, which go with the character. */
  const tiesGone = (id: string) => {
    const t = tiesOf(doc, id).length;
    return t ? ` Their ${t} relationship${t === 1 ? "" : "s"} will be deleted too.` : "";
  };
  /** Closing the window on an untouched draft drops it: there's nothing to keep. */
  const closeWindow = () => (openIsDraft ? discardDraft() : sel && selectChar(sel));
  /** Leave for a chapter: the window and the panel close on the way. */
  const jumpTo = (chapterId: string) => {
    closeWindow();
    jumpToChapter(doc.activeBookId, doc.activeDraftId, chapterId);
  };

  /** One roster tile. The grip is the only drag handle; the position number
   *  shows only while the roster is being rearranged. */
  const tileFor = (p: Character) => {
    const isDraft = p.id === draft?.id;
    const n = chapterCount(p.id);
    const name = p.name || (isDraft ? "New character" : "Unnamed character");
    const idx = reorder.indexOf(p.id);
    return (
      <div className="min-w-0 flex-1">
        <DetailCard
          onOpen={() => selectChar(p.id)}
          grip={isDraft ? undefined : <Grip r={reorder} id={p.id} name={name} />}
          position={
            isDraft || idx === -1 ? undefined : (
              <PositionInput
                look="faint"
                hidden={!reorder.arranging}
                index={idx}
                total={roster.length}
                onCommit={(to) => reorderCharacter(p.id, to)}
              />
            )
          }
          badge={<InitialsBadge initials={p.initials} color={p.color} />}
          tag={isDraft ? undefined : p.role || "No role"}
          title={name}
          untitled={!p.name}
          faded={isDraft}
          body={
            isDraft ? (
              <EmptyBody>Nothing saved yet, type anything to add them</EmptyBody>
            ) : p.desc ? (
              p.desc
            ) : (
              <EmptyBody>No description yet</EmptyBody>
            )
          }
          meta={
            isDraft
              ? []
              : [
                  p.type,
                  `in ${n} chapter${n === 1 ? "" : "s"}`,
                  tieCount(p.id) ? `${tieCount(p.id)} tie${tieCount(p.id) === 1 ? "" : "s"}` : null,
                ]
          }
        />
      </div>
    );
  };

  return (
    <Drawer
      onClose={close}
      label="Characters"
      title="Characters"
      subtitle={`Who's in ${doc.projectTitle || "this story"}, and how they're tied together`}
      meta={
        <>
          <div className="flex rounded-lg bg-chip p-[3px]" role="group" aria-label="Characters view">
            {(["roster", "chart"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={charsView === v}
                onClick={() => setCharsView(v)}
                title={v === "chart" ? "Relationship chart" : "Character cards"}
                className={`rounded-md px-[10px] py-[3px] text-[11.5px] font-medium capitalize ${
                  charsView === v ? "bg-card text-ink" : "text-soft hover:bg-card"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <MetaChip n={roster.length} unit="on the roster" />
          <MetaChip n={liveTies} unit={liveTies === 1 ? "tie" : "ties"} />
        </>
      }
    >
      {charsView === "chart" ? (
        <RelationshipChart onOpenCard={(id) => selectChar(id)} />
      ) : (
      <div className="flex flex-col gap-[14px] px-[26px] py-[22px]">
        <div {...reorder.containerProps}>
          <TileGrid min={230}>
            {reorder.order.map((id) => {
              const p = roster.find((c) => c.id === id);
              return p ? (
                <ReorderItem key={id} r={reorder} id={id} className="flex">
                  {tileFor(p)}
                </ReorderItem>
              ) : null;
            })}
            {draft && (
              <div key={draft.id} className="flex">
                {tileFor(draft)}
              </div>
            )}
            <AddTile onClick={startDraft} disabled={!!draft}>
              + Add character
            </AddTile>
          </TileGrid>
          {reorder.dragId && reorder.renderLifted(tileFor(roster.find((c) => c.id === reorder.dragId)!))}
          <ReorderLive r={reorder} />
        </div>

        <ArchiveShelf
          blurb="Archived characters stay in the chapters they appear in, shown dimmed, but can't be cast into new ones. Restoring puts them back on the roster unchanged."
          items={archived.map((c) => {
            const n = countCharacterCastings(doc, c.id);
            return {
              id: c.id,
              icon: (
                <span
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-semibold text-white"
                  style={{ background: c.color }}
                >
                  {c.initials || "?"}
                </span>
              ),
              title: c.name || "Unnamed character",
              caption: `${c.role || "No role"} · in ${n} chapter${n === 1 ? "" : "s"}`,
            };
          })}
          onRestore={(id) => unarchiveCharacter(id)}
          onDelete={(it) => {
            const n = countCharacterCastings(doc, it.id);
            askConfirm({
              message: `Delete ${it.title} for good?`,
              detail:
                (n > 0
                  ? `They will be removed from the ${n} chapter${n === 1 ? "" : "s"} they still appear in, across your versions and books.`
                  : "They aren't in any chapters.") + tiesGone(it.id),
              danger: true,
              onConfirm: () => deleteCharacter(it.id),
            });
          }}
        />
      </div>
      )}

      {open && (
        <CharacterWindow
          p={open}
          isDraft={openIsDraft}
          set={(patch) => (openIsDraft ? updateDraft(patch) : updateCharacter(open.id, patch))}
          appearsIn={appearsIn(open.id)}
          onJump={jumpTo}
          onClose={closeWindow}
          onSeeChart={() => {
            const id = open.id;
            closeWindow();
            setChartFocus(id);
            setCharsView("chart");
          }}
          footer={
            <DrawerFooter
              isDraft={openIsDraft}
              deleteLabel="Delete character"
              draftHint="Nothing saved yet, type anything to add them"
              onArchive={() => {
            const n = countCharacterCastings(doc, open.id);
            askConfirm({
              message: `Archive ${open.name || "this character"}?`,
              // Archiving keeps everything, so this reassures rather than warns.
              // It says what stays, because "archive" is the word people expect
              // to mean loss. The count spans versions and books, so it says so:
              // the tile counts the loaded board only, and the two numbers
              // differ often enough that an unexplained jump reads like a bug.
              detail:
                n > 0
                  ? `They leave the roster but stay in the ${n} chapter${n === 1 ? "" : "s"} they appear in across your versions and books, shown dimmed. Restoring brings them back unchanged.`
                  : "They leave the roster and move to the archive, where you can restore them any time.",
              confirmLabel: "Archive",
              onConfirm: () => archiveCharacter(open.id),
            });
          }}
              onDelete={() =>
            // Nothing to confirm on a draft: there's nothing saved to lose.
            openIsDraft
              ? discardDraft()
              : askConfirm({
                  message: `Delete ${open.name || "this character"}?`,
                  detail: `They will be removed from every chapter they appear in.${tiesGone(open.id)}`,
                  danger: true,
                  onConfirm: () => deleteCharacter(open.id),
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
 * The drawer's window footer: Archive before Delete, matching the shared
 * library's destroy row (the reversible action reads first). A draft has
 * nothing to retire, so it offers Discard.
 */
export function DrawerFooter({
  isDraft,
  deleteLabel,
  draftHint,
  onArchive,
  onDelete,
}: {
  isDraft: boolean;
  deleteLabel: string;
  draftHint: string;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      {!isDraft && <WindowButton onClick={onArchive}>Archive</WindowButton>}
      <WindowButton onClick={onDelete} danger>
        {isDraft ? "Discard" : deleteLabel}
      </WindowButton>
      {isDraft && <span className="text-[11.5px] text-faint">{draftHint}</span>}
    </>
  );
}

/**
 * The footer when a character or world entry is opened from a chapter or
 * piece: take it off this one only. Archive and Delete stay in the drawer.
 */
export function DetachFooter({ label, hint, onRemove }: { label: string; hint: string; onRemove: () => void }) {
  return (
    <>
      <WindowButton onClick={onRemove}>{label}</WindowButton>
      <span className="text-[11.5px] text-faint">{hint}</span>
    </>
  );
}

/**
 * One character, open. The fields are the ones the expanded card had, in the
 * same order; only where they live changed (a window, not the list). Opened
 * from the Characters drawer and from a chapter's or piece's Characters chips,
 * each passing its own footer.
 */
export function CharacterWindow({
  p,
  isDraft = false,
  set,
  appearsIn,
  onJump,
  onClose,
  onSeeChart,
  footer,
}: {
  p: Character;
  isDraft?: boolean;
  set: (patch: Partial<Character>) => void;
  appearsIn: { id: string; num: number; title: string }[];
  onJump: (chapterId: string) => void;
  onClose: () => void;
  /** Close the window and show this character on the relationship chart (drawer only). */
  onSeeChart?: () => void;
  footer: React.ReactNode;
}) {
  return (
    <DetailWindow
      onClose={onClose}
      badge={
        <>
          <InitialsBadge initials={p.initials} color={p.color} />
          {!isDraft && p.role && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
              {p.role}
            </span>
          )}
        </>
      }
      title={p.name || (isDraft ? "New character" : "Unnamed character")}
      untitled={!p.name}
      footer={footer}
    >
      <div className="flex flex-col gap-[12px]">
        <Row>
          <Field label="Name" className="flex-1">
            <Input value={p.name} onChange={(v) => set({ name: v })} placeholder="Character name" autoFocus={isDraft} />
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
          <Area value={p.bio} onChange={(v) => set({ bio: v })} rows={3} placeholder="Backstory and background" />
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
        {appearsIn.length > 0 && (
          <Field label="Appears in">
            <div className="flex flex-wrap gap-[5px]">
              {/* Each chapter is a way in, not just a label: clicking closes
                  the window and the panel and opens that chapter, the same
                  move as a note's "Pinned in" list. */}
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
          </Field>
        )}
        {/* A draft isn't a character yet, so there's no one to tie it to. */}
        {!isDraft && <RelationshipsField id={p.id} onSeeChart={onSeeChart} />}
      </div>
    </DetailWindow>
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
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-faint"
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
      className="w-full resize-y rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] leading-[1.5] text-ink outline-none placeholder:text-faint focus:border-faint"
    />
  );
}
