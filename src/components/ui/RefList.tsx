import { useEffect, useRef, useState } from "react";
import { useStore, type ConfirmRequest } from "@/store/useStore";
import { readImageForStorage } from "@/lib/files";
import { isAssetEmpty } from "@/lib/prune";
import { uid } from "@/lib/ids";
import type { RefKind, TodoItem } from "@/types";
import type { ResolvedRef } from "@/lib/refs";
import { DetailCard, EmptyBody, InkBadge, TileGrid } from "@/components/ui/DetailCard";
import { DetailWindow, WindowButton } from "@/components/ui/DetailWindow";

/**
 * Editable collection of pinned references — notes, uploadable images, and (since
 * schema v6) to-do lists. Reused by the chapter detail, the World panel, and the
 * notes/assets library.
 *
 * Since schema v5 the list is "dumb": it renders **resolved** items (content
 * pulled from the shared asset each ref links to) and reports edits/removals by
 * the item's `id`. The callers decide what an edit or a removal *means* — chapter
 * and world callers route `onUpdate` to `updateAsset` (live write-through) and
 * `onDelete` to an unlink; the library routes them straight to the asset.
 * `deletePrompt` lets each caller phrase its own confirm (unlink vs. delete).
 *
 * **`removeMode` decides how removal is offered, and the app-wide rule is: an ✕
 * detaches, a word destroys.** A ✕ next to a note means the same thing it means
 * on a chapter's character chip — take it off *this* thing, the record survives.
 * The shared library has nothing to detach from, so there removal is irreversible
 * and wears a label ("Delete") instead of a glyph — the confirm is what spells
 * out that it reaches everywhere. Same widget, same icon, two different blast
 * radii was the trap this avoids. `onArchive` (library only) sits beside it as
 * the reversible retirement: unpin everywhere, keep the record.
 *
 * "+ Note" / "+ Image" / "+ To-do" do NOT create anything: they open a **draft**
 * row held in local state under the id it will keep, and `onAdd(kind, id)` is
 * called with that id on the first typed character (or the first uploaded file),
 * followed immediately by the edit. So an untitled, empty resource is never
 * written to the document, and the commit doesn't remount the field being typed
 * into.
 *
 * `onReorder` turns on ordering: a grip to drag tiles into place, and a typed
 * position number that is the tile's badge (the library and every pin list
 * already have an order, so the position takes the chapter number's place).
 * Each surface owns its own order (a chapter's pin order is not the library's),
 * so the caller decides what moving means: see `reorderAsset` /
 * `reorderChapterRef` / `reorderWorldRef`.
 *
 * Layout (since the detail-card restyle, 2026-11-22): every item is a
 * chapter-style `DetailCard` tile, one column where it's narrow or a grid of
 * tiles at least `tileMin` px wide where there's room. A tile never edits:
 * clicking it opens the item in a `DetailWindow`, which holds the title, the
 * note / checklist / picture, the caller's `extra` (the library's "Pinned in")
 * and the remove controls. The old list / card switch is gone.
 */
const ADD_BTN =
  "rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-faint";

const KIND_WORD: Record<RefKind, string> = { IMAGE: "Image", NOTE: "Note", TODO: "To-do" };

const untitled = (kind: RefKind) =>
  kind === "IMAGE" ? "Untitled image" : kind === "TODO" ? "Untitled list" : "Untitled note";

const newLabel = (kind: RefKind) =>
  kind === "IMAGE" ? "New image" : kind === "TODO" ? "New to-do" : "New note";

/** "3/7 done" — the at-a-glance state of a checklist. */
export function todoProgress(items: TodoItem[] | undefined): string {
  const list = items ?? [];
  if (list.length === 0) return "No tasks yet";
  return `${list.filter((i) => i.done).length}/${list.length} done`;
}

export function RefList({
  refs,
  onAdd,
  onUpdate,
  onDelete,
  onLink,
  linkLabel = "Link asset",
  deletePrompt,
  onArchive,
  archivePrompt,
  caption,
  extra,
  tileMin,
  idPrefix = "r",
  removeMode = "detach",
  removeLabel = "Remove from here",
  onReorder,
}: {
  refs: ResolvedRef[];
  /** Create the record under `id` — the id the draft row already renders with. */
  onAdd: (kind: RefKind, id: string) => void;
  /**
   * Prefix for that id. Items are ref links ("r") everywhere except the shared
   * library, where the item id IS the asset id ("a") — keeps ids self-describing.
   */
  idPrefix?: "r" | "a";
  onUpdate: (
    id: string,
    patch: Partial<Pick<ResolvedRef, "label" | "body" | "src" | "items">>
  ) => void;
  onDelete: (id: string) => void;
  onLink?: () => void;
  linkLabel?: string;
  /**
   * "detach" (default) — removal only unpins from the surface being edited, and
   * is offered as an ✕. "destroy" — removal is irreversible, so it's offered as
   * a labelled button instead. See the note above.
   */
  removeMode?: "detach" | "destroy";
  /** Per-item confirm copy; defaults to a plain danger "Delete this note/image?". */
  deletePrompt?: (r: ResolvedRef) => Omit<ConfirmRequest, "onConfirm">;
  /** Offered as an "Archive" button beside Delete when given (library only). */
  onArchive?: (id: string) => void;
  archivePrompt?: (r: ResolvedRef) => Omit<ConfirmRequest, "onConfirm">;
  /** Optional small muted line under each item (e.g. "Linked in 3 places"). */
  caption?: (r: ResolvedRef) => string | undefined;
  /** Optional extra content inside an item's window (e.g. the pin list). */
  extra?: (r: ResolvedRef) => React.ReactNode;
  /** Lay tiles out in a grid of at least this many px each; omitted, one column. */
  tileMin?: number;
  /** The detach button's words in the window (e.g. "Remove from this chapter"). */
  removeLabel?: string;
  /** Enables ordering: grip-drag and a typed position (the tile's badge). */
  onReorder?: (id: string, toIdx: number) => void;
}) {
  const openLightbox = useStore((s) => s.openLightbox);
  const askConfirm = useStore((s) => s.askConfirm);
  const [openId, setOpenId] = useState<string | null>(null);
  // The blank row from "+ Note" / "+ Image" / "+ To-do": rendered like any other
  // item, but it exists only here until it has content.
  const [draft, setDraft] = useState<ResolvedRef | null>(null);
  // Grip-drag ordering. Pointer-based (mousedown + window listeners), the same
  // mechanic the board and the scene canvas use — not HTML5 drag-and-drop, so
  // dragging behaves identically to every other drag in the app.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  // Detach fn for an in-flight grip drag, so an unmount mid-drag can't leak
  // window listeners.
  const endGripDrag = useRef<(() => void) | null>(null);
  // Live registry of the task <input>s, so the task Enter creates (or the one
  // Backspace falls back into) can be focused once the render settles. Keyed by
  // task id, not index: inserting or removing shifts every index below it, and
  // the row we want to reach is a specific task, not a position.
  const taskEls = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null>(null);
  const items = draft ? refs.concat(draft) : refs;

  useEffect(() => () => endGripDrag.current?.(), []);

  /**
   * Move the caret into the task the last edit pointed at. Deliberately runs
   * after *every* render rather than on a dep: a new task can take two renders
   * to appear (a draft list commits through the store, which re-resolves the
   * refs), and the id stays pending until the input it names actually exists.
   *
   * Always lands at the end of the text — which is what Backspace merging back
   * into the task above needs, and a no-op on the empty task Enter creates.
   */
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = taskEls.current.get(id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  /**
   * Start a grip drag. Listeners are attached here rather than from an effect on
   * `dragId`: an effect only runs after the next render, so a drag completed
   * inside a single frame would finish before anything was listening.
   */
  const startGripDrag = (id: string) => {
    /** The tile whose box the pointer is inside, if any (tiles may be a grid). */
    const rowAt = (x: number, y: number) => {
      for (const [rid, el] of rowEls.current) {
        const box = el.getBoundingClientRect();
        if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return rid;
      }
      return null;
    };
    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      endGripDrag.current = null;
    };
    const onMove = (e: MouseEvent) => {
      const over = rowAt(e.clientX, e.clientY);
      setOverId(over && over !== id ? over : null);
    };
    const onUp = (e: MouseEvent) => {
      const targetId = rowAt(e.clientX, e.clientY);
      detach();
      setDragId(null);
      setOverId(null);
      if (!onReorder || !targetId || targetId === id) return;
      const to = refs.findIndex((r) => r.id === targetId);
      if (to !== -1) onReorder(id, to);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    endGripDrag.current = detach;
    setDragId(id);
  };

  const startDraft = (kind: RefKind) => {
    const d: ResolvedRef = {
      id: uid(idPrefix),
      kind,
      label: "",
      ...(kind === "NOTE" ? { body: "" } : {}),
      ...(kind === "TODO" ? { items: [] } : {}),
    };
    setDraft(d);
    setOpenId(d.id);
  };

  /** Edits route to the store — except on the draft, which the first one creates. */
  const update = (
    id: string,
    patch: Partial<Pick<ResolvedRef, "label" | "body" | "src" | "items">>
  ) => {
    if (!draft || id !== draft.id) return onUpdate(id, patch);
    const merged = { ...draft, ...patch };
    if (isAssetEmpty(merged)) return setDraft(merged);
    setDraft(null);
    onAdd(draft.kind, draft.id);
    onUpdate(draft.id, patch);
  };

  /** No caption on the draft — it isn't pinned anywhere until it exists. */
  /**
   * The small caption under a row/card. An archived asset says so here, which
   * is the marker card view leans on: cards are inline editors, so dimming one
   * would fight the typing it exists for. List view dims its header instead.
   */
  const capOf = (r: ResolvedRef) => {
    if (r.id === draft?.id) return undefined;
    const cap = caption?.(r);
    if (!r.archived) return cap;
    return cap ? `Archived · ${cap}` : "Archived";
  };

  const upload = async (id: string, file: File | undefined) => {
    if (!file) return;
    const src = await readImageForStorage(file);
    update(id, { src, label: file.name.replace(/\.[^.]+$/, "") });
  };

  // ── Checklist editing (TODO) ───────────────────────────────────────────────
  const itemsOf = (r: ResolvedRef) => r.items ?? [];
  /**
   * Add a blank task and put the caret in it. `afterId` is the task Enter was
   * pressed in — the new one lands directly *below* it, because a list editor
   * that answers Enter by appending to the bottom sends you somewhere you
   * weren't looking. "+ Add task" passes nothing and so still appends.
   */
  const addItem = (r: ResolvedRef, afterId?: string) => {
    const list = itemsOf(r);
    const task = { id: uid("t"), text: "", done: false };
    const at = afterId ? list.findIndex((i) => i.id === afterId) : -1;
    const next =
      at === -1 ? list.concat(task) : list.slice(0, at + 1).concat(task, list.slice(at + 1));
    pendingFocus.current = task.id;
    update(r.id, { items: next });
  };
  const setItemText = (r: ResolvedRef, itemId: string, text: string) =>
    update(r.id, { items: itemsOf(r).map((i) => (i.id === itemId ? { ...i, text } : i)) });
  const toggleItem = (r: ResolvedRef, itemId: string) =>
    update(r.id, { items: itemsOf(r).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) });
  const removeItem = (r: ResolvedRef, itemId: string) =>
    update(r.id, { items: itemsOf(r).filter((i) => i.id !== itemId) });
  /**
   * Backspace in an *empty* task deletes it and merges back into the one above,
   * caret at the end of that line — the undo of the Enter that made it.
   *
   * Only when there is a task above: on the first row there is nowhere to merge
   * into, so Backspace does nothing and the ✕ stays the way to remove it. That
   * also means a held Backspace can never chew through the whole list — it stops
   * at the top row instead of deleting it and starting on the next one.
   *
   * Returns whether it handled the key, so the caller knows to preventDefault.
   */
  const backspaceItem = (r: ResolvedRef, itemId: string) => {
    const list = itemsOf(r);
    const at = list.findIndex((i) => i.id === itemId);
    if (at <= 0) return false;
    pendingFocus.current = list[at - 1].id;
    update(r.id, { items: list.filter((i) => i.id !== itemId) });
    return true;
  };

  const confirmDelete = (r: ResolvedRef) => {
    // Nothing to confirm on a draft — there's nothing saved to lose.
    if (draft && r.id === draft.id) return setDraft(null);
    const prompt = deletePrompt?.(r) ?? {
      message: `Delete this ${r.kind === "IMAGE" ? "image" : r.kind === "TODO" ? "to-do list" : "note"}?`,
      danger: true,
    };
    askConfirm({ ...prompt, onConfirm: () => onDelete(r.id) });
  };

  const confirmArchive = (r: ResolvedRef) => {
    if (!onArchive || (draft && r.id === draft.id)) return;
    const prompt = archivePrompt?.(r) ?? { message: "Archive this?", confirmLabel: "Archive" };
    askConfirm({ ...prompt, onConfirm: () => onArchive(r.id) });
  };

  // Note · To-do · Image, in that order everywhere this list appears (chapter
  // modal, World panel, shared library) — the two text kinds together, the
  // upload last.
  const addButtons = () => (
    <>
      <button onClick={() => startDraft("NOTE")} disabled={!!draft} className={ADD_BTN}>
        + Note
      </button>
      <button onClick={() => startDraft("TODO")} disabled={!!draft} className={ADD_BTN}>
        + To-do
      </button>
      <button onClick={() => startDraft("IMAGE")} disabled={!!draft} className={ADD_BTN}>
        + Image
      </button>
      {onLink && (
        <button onClick={onLink} className={ADD_BTN}>
          {linkLabel}
        </button>
      )}
    </>
  );

  /**
   * The tile's badge: its 1-based position, as an input you can type a new
   * position into when the surface is ordered (commits on Enter or blur), or
   * plain ink otherwise. The draft has no position yet.
   */
  const badgeOf = (r: ResolvedRef) => {
    if (r.id === draft?.id) return <InkBadge>New</InkBadge>;
    const idx = refs.findIndex((x) => x.id === r.id);
    if (!onReorder || idx === -1) return <InkBadge>{String(idx + 1).padStart(2, "0")}</InkBadge>;
    return (
      <span data-no-open className="shrink-0">
        <PositionInput index={idx} total={refs.length} onCommit={(to) => onReorder(r.id, to)} />
      </span>
    );
  };

  /** The checklist editor, shared by both views. */
  const checklist = (r: ResolvedRef, compact = false) => {
    const list = itemsOf(r);
    return (
      <div className={`flex flex-col ${compact ? "gap-[3px]" : "gap-[5px]"}`}>
        {list.map((it) => (
          <div key={it.id} className="group/item flex items-center gap-[7px]">
            <button
              onClick={() => toggleItem(r, it.id)}
              title={it.done ? "Mark as not done" : "Mark as done"}
              className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-bold leading-none"
              style={{
                borderColor: it.done ? "var(--therefore)" : "var(--faint)",
                background: it.done ? "var(--therefore)" : "transparent",
                color: "var(--bg)",
              }}
            >
              {it.done ? "✓" : ""}
            </button>
            <input
              ref={(el) => {
                if (el) taskEls.current.set(it.id, el);
                else taskEls.current.delete(it.id);
              }}
              value={it.text}
              onChange={(e) => setItemText(r, it.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem(r, it.id);
                }
                // Only on an empty task: with text in the field Backspace has to
                // stay a plain delete-a-character, or you'd lose the row on the
                // keystroke that clears the last letter.
                if (e.key === "Backspace" && it.text === "" && backspaceItem(r, it.id)) {
                  e.preventDefault();
                }
              }}
              placeholder="Task..."
              className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint ${
                compact ? "text-[11.5px]" : "text-[12.5px]"
              } ${it.done ? "text-faint line-through" : "text-ink"}`}
            />
            <button
              onClick={() => removeItem(r, it.id)}
              title="Remove task"
              className="shrink-0 text-[11px] text-faint opacity-0 transition-opacity hover:text-but group-hover/item:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => addItem(r)}
          className={`self-start font-semibold text-faint hover:text-ink ${
            compact ? "text-[10.5px]" : "text-[11.5px]"
          }`}
        >
          + Add task
        </button>
      </div>
    );
  };

  const openItem = items.find((r) => r.id === openId) ?? null;
  const openIsDraft = !!openItem && openItem.id === draft?.id;
  /** Closing an untouched draft drops it: there was nothing to keep. */
  const closeWindow = () => {
    if (openIsDraft) setDraft(null);
    setOpenId(null);
  };

  /** What the tile shows under the title: the note, the open tasks, the picture. */
  const bodyOf = (r: ResolvedRef) => {
    if (r.id === draft?.id) return <EmptyBody>Nothing saved yet, type anything to add it</EmptyBody>;
    if (r.kind === "IMAGE")
      return r.src ? (
        <img src={r.src} alt={r.label} className="h-[64px] w-full rounded-lg border border-rule object-cover" />
      ) : (
        <EmptyBody>No image yet</EmptyBody>
      );
    if (r.kind === "TODO") {
      const list = itemsOf(r);
      const open = list.filter((i) => !i.done && i.text.trim());
      if (open.length) return open.map((i) => i.text.trim()).join(" · ");
      return <EmptyBody>{list.length ? "All done" : "No tasks yet"}</EmptyBody>;
    }
    return (r.body ?? "").trim() || <EmptyBody>Empty note</EmptyBody>;
  };

  return (
    <div className="flex flex-col gap-[9px]">
      {items.length === 0 && <div className="px-[2px] text-[12px] text-faint">No references yet.</div>}
      {items.length > 0 && (
        <TileGrid min={tileMin}>
          {items.map((r) => {
            const isDraft = r.id === draft?.id;
            return (
              <div
                key={r.id}
                ref={(el) => {
                  // Live registry of tile boxes, so a drag can hit-test tiles by
                  // pointer position without measuring the whole list each move.
                  if (el) rowEls.current.set(r.id, el);
                  else rowEls.current.delete(r.id);
                }}
                className="flex"
              >
                <div className="min-w-0 flex-1">
                  <DetailCard
                    onOpen={() => setOpenId(r.id)}
                    minHeight={tileMin ? (tileMin < 200 ? 120 : 142) : 0}
                    grip={
                      onReorder && !isDraft ? (
                        <span
                          data-no-open
                          // The grip is the only drag handle, so a click anywhere
                          // else on the tile always opens it.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            startGripDrag(r.id);
                          }}
                          // Padded well past the glyph: a bare 8px dot-grid is a
                          // fiddly thing to catch with a pointer.
                          className={`-my-[4px] -ml-[4px] flex h-[26px] w-[18px] shrink-0 select-none items-center justify-center text-[12px] leading-none text-faint hover:text-soft ${
                            dragId === r.id ? "cursor-grabbing" : "cursor-grab"
                          }`}
                          title="Drag to reorder"
                        >
                          ⠿
                        </span>
                      ) : undefined
                    }
                    badge={badgeOf(r)}
                    tag={KIND_WORD[r.kind]}
                    title={r.label || (isDraft ? newLabel(r.kind) : untitled(r.kind))}
                    untitled={!r.label}
                    body={bodyOf(r)}
                    meta={[r.kind === "TODO" && !isDraft ? todoProgress(r.items) : null, capOf(r)]}
                    dim={r.archived}
                    highlight={overId === r.id}
                    faded={dragId === r.id || isDraft}
                  />
                </div>
              </div>
            );
          })}
        </TileGrid>
      )}
      <div className="grid grid-cols-2 gap-[7px] sm:grid-cols-4">{addButtons()}</div>

      {openItem && (
        <DetailWindow
          onClose={closeWindow}
          badge={
            <>
              {openIsDraft ? (
                <InkBadge>New</InkBadge>
              ) : (
                <InkBadge>{String(refs.findIndex((x) => x.id === openItem.id) + 1).padStart(2, "0")}</InkBadge>
              )}
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
                {KIND_WORD[openItem.kind]}
              </span>
            </>
          }
          title={openItem.label || (openIsDraft ? newLabel(openItem.kind) : untitled(openItem.kind))}
          untitled={!openItem.label}
          footer={
            openIsDraft ? (
              // Same escape hatch the draft character and world windows offer.
              <>
                <WindowButton onClick={() => confirmDelete(openItem)} danger>
                  Discard
                </WindowButton>
                <span className="text-[11.5px] text-faint">Nothing saved yet, type anything to add it</span>
              </>
            ) : removeMode === "destroy" ? (
              // Irreversible, so it gets a word, like "Delete character".
              <>
                {onArchive && <WindowButton onClick={() => confirmArchive(openItem)}>Archive</WindowButton>}
                <WindowButton onClick={() => confirmDelete(openItem)} danger>
                  Delete
                </WindowButton>
                {openItem.archived && <span className="text-[11.5px] text-faint">Archived</span>}
              </>
            ) : (
              // Detach: takes it off this surface only.
              <>
                <WindowButton onClick={() => confirmDelete(openItem)}>{removeLabel}</WindowButton>
                <span className="text-[11.5px] text-faint">
                  {openItem.archived ? "Archived · " : ""}It stays in the shared library.
                </span>
              </>
            )
          }
        >
          <div className="flex flex-col gap-[12px]">
            <div>
              <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">Title</div>
              <input
                autoFocus={openIsDraft && openItem.kind !== "IMAGE"}
                value={openItem.label}
                onChange={(e) => update(openItem.id, { label: e.target.value })}
                placeholder={
                  openItem.kind === "IMAGE" ? "Image title" : openItem.kind === "TODO" ? "List title" : "Note title"
                }
                className="w-full rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] font-semibold text-ink outline-none placeholder:text-faint focus:border-faint"
              />
            </div>
            {openItem.kind === "IMAGE" ? (
              openItem.src ? (
                <button
                  onClick={() => openLightbox(openItem.src!)}
                  className="block overflow-hidden rounded-[10px] border border-rule"
                  title="Click to view"
                >
                  <img src={openItem.src} alt={openItem.label} className="max-h-[360px] w-full object-contain" />
                </button>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-line py-[28px] text-center text-[11.5px] font-medium text-faint hover:border-faint hover:text-ink">
                  Upload image
                  <span className="text-[10.5px]">click to browse</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => upload(openItem.id, e.target.files?.[0])}
                  />
                </label>
              )
            ) : openItem.kind === "TODO" ? (
              <div>
                <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-wide text-faint">Tasks</div>
                {checklist(openItem)}
              </div>
            ) : (
              <div>
                <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">Note</div>
                <textarea
                  value={openItem.body ?? ""}
                  onChange={(e) => update(openItem.id, { body: e.target.value })}
                  placeholder="Note..."
                  rows={8}
                  className="w-full resize-y rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] leading-[1.55] text-ink outline-none placeholder:text-faint focus:border-faint"
                />
              </div>
            )}
            {!openIsDraft && extra?.(openItem)}
          </div>
        </DetailWindow>
      )}
    </div>
  );
}

/**
 * The typed half of reordering: shows an item's 1-based position and moves it
 * there. Held in local state while being typed (so a half-typed "1" on the way
 * to "12" doesn't move anything) and committed on Enter or blur.
 */
function PositionInput({
  index,
  total,
  onCommit,
}: {
  index: number;
  total: number;
  onCommit: (toIdx: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  // Shown like a chapter number ("03") at rest; editing shows what's typed.
  const shown = typed ?? String(index + 1).padStart(2, "0");
  const commit = () => {
    if (typed === null) return;
    const n = parseInt(typed, 10);
    setTyped(null);
    if (!Number.isFinite(n)) return;
    const to = Math.max(0, Math.min(total - 1, n - 1));
    if (to !== index) onCommit(to);
  };
  return (
    <input
      value={shown}
      onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") setTyped(null);
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      title={`Position ${index + 1} of ${total}, type a number to move it`}
      aria-label={`Position ${index + 1} of ${total}`}
      className="h-[20px] w-[32px] shrink-0 rounded-md border border-transparent bg-ink text-center font-mono text-[11px] font-semibold text-bg outline-none hover:border-faint focus:border-ink focus:bg-card focus:text-ink"
    />
  );
}
