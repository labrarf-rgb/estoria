import { useEffect, useRef, useState } from "react";
import { useStore, type ConfirmRequest } from "@/store/useStore";
import { readFileAsDataURL } from "@/lib/files";
import { isAssetEmpty } from "@/lib/prune";
import { uid } from "@/lib/ids";
import type { RefKind, TodoItem } from "@/types";
import type { ResolvedRef } from "@/lib/refs";
import type { RefView } from "@/components/ui/ViewToggle";

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
 * `onReorder` turns on ordering: a grip to drag rows into place in list view, and
 * a typed position number in both views. Both live at the head of the row/cell,
 * so the two ways to move something sit together. Each surface owns its own order
 * (a chapter's pin order is not the library's), so the caller decides what moving
 * means — see `reorderAsset` / `reorderChapterRef` / `reorderWorldRef`.
 *
 * Two layouts, chosen by `view`:
 *  - "card": a wrap grid of fixed-size cells (default).
 *  - "list": compact rows you click to expand into an inline detail editor.
 * Images open in the lightbox.
 */
const DISCARD_BTN =
  "self-start rounded-lg border border-rule px-[10px] py-[5px] text-[11.5px] font-medium text-soft hover:border-faint hover:text-but";

/** Compact variant — a card cell is only 150px tall, so no border/padding. */
const DISCARD_LINK = "self-start shrink-0 text-[10.5px] font-medium text-faint hover:text-but";

const DESTROY_BTN =
  "self-start rounded-lg border border-rule px-[10px] py-[5px] text-[11.5px] font-medium text-soft hover:border-faint hover:text-but";

/**
 * Card cells are a fixed 164x150, so the destroy controls take over the caption's
 * line on hover rather than adding one: words, but only on the card you're
 * pointing at — 13 permanent "Delete" labels in a grid is just noise.
 */
const DESTROY_ROW = "hidden shrink-0 items-center gap-[8px] group-hover:flex";
const DESTROY_WORD = "text-[10.5px] font-medium text-faint hover:text-but";

const ADD_BTN =
  "rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-faint";

const ICON: Record<RefKind, string> = { IMAGE: "🖼", NOTE: "📝", TODO: "☑" };

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
  view = "list",
  idPrefix = "r",
  removeMode = "detach",
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
  /** Optional extra content inside an expanded row (e.g. the pin list). */
  extra?: (r: ResolvedRef) => React.ReactNode;
  view?: RefView;
  /** Enables ordering — grip-drag (list view) and a typed position (both views). */
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
  // Live registry of the task <input>s, so a task created by Enter can be
  // focused once it exists. Keyed by task id, not index: inserting shifts every
  // index below it, and the row we want to reach is the one that just mounted.
  const taskEls = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null>(null);
  const items = draft ? refs.concat(draft) : refs;

  useEffect(() => () => endGripDrag.current?.(), []);

  /**
   * Move the caret into a task the last render created. Deliberately runs after
   * *every* render rather than on a dep: a new task can take two renders to
   * appear (a draft list commits through the store, which re-resolves the refs),
   * and the id stays pending until the input it names actually exists.
   */
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = taskEls.current.get(id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
  });

  /**
   * Start a grip drag. Listeners are attached here rather than from an effect on
   * `dragId`: an effect only runs after the next render, so a drag completed
   * inside a single frame would finish before anything was listening.
   */
  const startGripDrag = (id: string) => {
    /** The row whose box the pointer is inside, if any. */
    const rowAt = (y: number) => {
      for (const [rid, el] of rowEls.current) {
        const box = el.getBoundingClientRect();
        if (y >= box.top && y <= box.bottom) return rid;
      }
      return null;
    };
    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      endGripDrag.current = null;
    };
    const onMove = (e: MouseEvent) => {
      const over = rowAt(e.clientY);
      setOverId(over && over !== id ? over : null);
    };
    const onUp = (e: MouseEvent) => {
      const targetId = rowAt(e.clientY);
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
  const capOf = (r: ResolvedRef) => (r.id === draft?.id ? undefined : caption?.(r));

  const upload = async (id: string, file: File | undefined) => {
    if (!file) return;
    const src = await readFileAsDataURL(file);
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

  /** Typed ordering: shows this item's 1-based position, commits on Enter/blur. */
  const position = (r: ResolvedRef, compact = false) => {
    if (!onReorder || r.id === draft?.id) return null;
    const idx = refs.findIndex((x) => x.id === r.id);
    if (idx === -1) return null;
    return (
      <PositionInput
        index={idx}
        total={refs.length}
        compact={compact}
        onCommit={(to) => onReorder(r.id, to)}
      />
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

  // ── List view ──────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="flex flex-col gap-[7px]">
        {items.length === 0 && (
          <div className="px-[2px] text-[12px] text-faint">No references yet.</div>
        )}
        {items.map((r) => {
          const open = openId === r.id;
          const isDraft = r.id === draft?.id;
          const snippet = isDraft
            ? "Nothing saved yet — type anything to add it"
            : r.kind === "IMAGE"
              ? "Image"
              : r.kind === "TODO"
                ? todoProgress(r.items)
                : (r.body ?? "").trim() || "Empty note";
          const cap = capOf(r);
          return (
            <div
              key={r.id}
              ref={(el) => {
                // Live registry of row boxes, so a drag can hit-test rows by
                // pointer position without measuring the whole list each move.
                if (el) rowEls.current.set(r.id, el);
                else rowEls.current.delete(r.id);
              }}
              className={`rounded-[10px] border bg-card ${
                overId === r.id ? "border-faint" : "border-rule"
              } ${dragId === r.id ? "opacity-50" : ""}`}
            >
              <div className="group flex items-center gap-[10px] px-[12px] py-[9px]">
                {onReorder && !isDraft && (
                  <span
                    // The grip is the only drag handle: text selection inside an
                    // expanded row can never turn into a reorder.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startGripDrag(r.id);
                    }}
                    // Padded well past the glyph — a bare 8px dot-grid is a
                    // fiddly thing to catch with a pointer.
                    className={`-my-[6px] -ml-[4px] flex h-[28px] w-[20px] shrink-0 select-none items-center justify-center text-[12px] leading-none text-faint hover:text-soft ${
                      dragId === r.id ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                )}
                {/* The number sits with the grip, left of the icon: both views
                    now lead with position, and the two ordering controls read as
                    one pair instead of sitting at opposite ends of the row. */}
                {position(r)}
                {/* The draft row has neither grip nor number — without this it
                    would hang left of every saved row above it. */}
                {onReorder && isDraft && <span className="w-[56px] shrink-0" />}
                <span className="text-[13px]">{ICON[r.kind]}</span>
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div
                    className={`truncate text-[12.5px] font-semibold ${isDraft ? "text-faint" : "text-ink"}`}
                  >
                    {r.label || (isDraft ? newLabel(r.kind) : untitled(r.kind))}
                  </div>
                  <div className="truncate text-[11.5px] text-soft">{snippet}</div>
                  {cap && <div className="truncate text-[10.5px] text-faint">{cap}</div>}
                </button>
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="text-[12px] font-medium text-faint"
                  title={open ? "Collapse" : "Expand"}
                >
                  {open ? "▴" : "▾"}
                </button>
              </div>
              {open && (
                <div className="flex flex-col gap-[9px] border-t border-rule px-[12px] py-[11px]">
                  <div className="flex items-center gap-[8px]">
                    <input
                      value={r.label}
                      onChange={(e) => update(r.id, { label: e.target.value })}
                      placeholder={
                        r.kind === "IMAGE"
                          ? "Image title"
                          : r.kind === "TODO"
                            ? "List title"
                            : "Note title"
                      }
                      className="min-w-0 flex-1 rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] font-semibold text-ink outline-none focus:border-faint"
                    />
                    {(isDraft || removeMode === "detach") && (
                      <button
                        onClick={() => confirmDelete(r)}
                        className="shrink-0 text-[12px] text-faint hover:text-but"
                        title={isDraft ? "Discard" : "Remove from here"}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {r.kind === "IMAGE" ? (
                    r.src ? (
                      <button
                        onClick={() => openLightbox(r.src!)}
                        className="block max-h-[220px] overflow-hidden rounded-[10px] border border-rule"
                        title="Click to view"
                      >
                        <img src={r.src} alt={r.label} className="max-h-[220px] w-full object-cover" />
                      </button>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-line py-[18px] text-center text-[11px] font-medium text-faint hover:border-faint hover:text-ink">
                        Upload image
                        <span className="text-[10px]">click to browse</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => upload(r.id, e.target.files?.[0])}
                        />
                      </label>
                    )
                  ) : r.kind === "TODO" ? (
                    checklist(r)
                  ) : (
                    <textarea
                      value={r.body ?? ""}
                      onChange={(e) => update(r.id, { body: e.target.value })}
                      placeholder="Note..."
                      rows={4}
                      className="w-full resize-y rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.55] text-ink outline-none focus:border-faint"
                    />
                  )}
                  {!isDraft && extra?.(r)}
                  {/* Same escape hatch the draft character/world cards offer. */}
                  {isDraft && (
                    <button onClick={() => setDraft(null)} className={DISCARD_BTN}>
                      Discard
                    </button>
                  )}
                  {/* Irreversible, so it gets a word — like "Delete character". */}
                  {!isDraft && removeMode === "destroy" && (
                    <div className="flex items-center gap-[8px]">
                      {onArchive && (
                        <button onClick={() => confirmArchive(r)} className={DESTROY_BTN}>
                          Archive
                        </button>
                      )}
                      <button onClick={() => confirmDelete(r)} className={DESTROY_BTN}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-[2px] grid grid-cols-2 gap-[7px] sm:grid-cols-4">{addButtons()}</div>
      </div>
    );
  }

  // ── Card view ────────────────────────────────────────────────────────────────
  const CELL = "w-[164px] h-[150px]";

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((r) =>
        r.kind === "IMAGE" ? (
          <div key={r.id} className={`group relative flex flex-col ${CELL}`}>
            {r.src ? (
              <button
                onClick={() => openLightbox(r.src!)}
                className="block w-full flex-1 overflow-hidden rounded-[11px] border border-rule"
                title="Click to view"
              >
                <img src={r.src} alt={r.label} className="h-full w-full object-cover" />
              </button>
            ) : (
              <label className="flex w-full flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[11px] border-[1.5px] border-dashed border-line text-center text-[11px] font-medium text-faint hover:border-faint hover:text-ink">
                Upload image
                <span className="text-[10px]">click to browse</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => upload(r.id, e.target.files?.[0])}
                />
              </label>
            )}
            <div className="mt-[5px] flex shrink-0 items-center gap-[5px]">
              {position(r, true)}
              <input
                value={r.label}
                onChange={(e) => update(r.id, { label: e.target.value })}
                className="h-[20px] min-w-0 flex-1 bg-transparent text-[11.5px] font-medium text-ink outline-none"
              />
            </div>
            {capOf(r) && (
              <div
                className={`shrink-0 truncate text-[10.5px] text-faint ${
                  removeMode === "destroy" ? "group-hover:hidden" : ""
                }`}
              >
                {capOf(r)}
              </div>
            )}
            {r.id === draft?.id && (
              <button onClick={() => setDraft(null)} className={DISCARD_LINK}>
                Discard
              </button>
            )}
            {r.id !== draft?.id && removeMode === "destroy" && (
              <div className={DESTROY_ROW}>
                {onArchive && (
                  <button onClick={() => confirmArchive(r)} className={DESTROY_WORD}>
                    Archive
                  </button>
                )}
                <button onClick={() => confirmDelete(r)} className={DESTROY_WORD}>
                  Delete
                </button>
              </div>
            )}
            {(r.id === draft?.id || removeMode === "detach") && (
              <button
                onClick={() => confirmDelete(r)}
                className="absolute right-[5px] top-[5px] hidden h-[20px] w-[20px] items-center justify-center rounded-md bg-black/45 text-[11px] text-white group-hover:flex"
                title={r.id === draft?.id ? "Discard" : "Remove from here"}
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div
            key={r.id}
            className={`group relative flex flex-col gap-[6px] rounded-[11px] border border-rule bg-card p-[11px] shadow-[var(--shadow)] ${CELL}`}
          >
            <div className="flex shrink-0 items-center gap-[5px]">
              {position(r, true)}
              <input
                value={r.label}
                onChange={(e) => update(r.id, { label: e.target.value })}
                placeholder={r.kind === "TODO" ? "List title" : "Note title"}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold text-ink outline-none placeholder:text-faint"
              />
            </div>
            {r.kind === "TODO" ? (
              <div className="min-h-0 flex-1 overflow-auto">{checklist(r, true)}</div>
            ) : (
              <textarea
                value={r.body ?? ""}
                onChange={(e) => update(r.id, { body: e.target.value })}
                placeholder="Note..."
                className="flex-1 resize-none bg-transparent text-[12px] leading-[1.45] text-soft outline-none placeholder:text-faint"
              />
            )}
            {capOf(r) && (
              <div
                className={`shrink-0 truncate text-[10.5px] text-faint ${
                  removeMode === "destroy" ? "group-hover:hidden" : ""
                }`}
              >
                {capOf(r)}
              </div>
            )}
            {r.id === draft?.id && (
              <button onClick={() => setDraft(null)} className={DISCARD_LINK}>
                Discard
              </button>
            )}
            {r.id !== draft?.id && removeMode === "destroy" && (
              <div className={DESTROY_ROW}>
                {onArchive && (
                  <button onClick={() => confirmArchive(r)} className={DESTROY_WORD}>
                    Archive
                  </button>
                )}
                <button onClick={() => confirmDelete(r)} className={DESTROY_WORD}>
                  Delete
                </button>
              </div>
            )}
            {(r.id === draft?.id || removeMode === "detach") && (
              <button
                onClick={() => confirmDelete(r)}
                className="absolute right-[7px] top-[7px] hidden text-[12px] text-faint hover:text-but group-hover:block"
                title={r.id === draft?.id ? "Discard" : "Remove from here"}
              >
                ✕
              </button>
            )}
          </div>
        )
      )}

      <div className={`flex flex-col justify-center gap-[6px] ${CELL}`}>{addButtons()}</div>
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
  compact,
  onCommit,
}: {
  index: number;
  total: number;
  compact?: boolean;
  onCommit: (toIdx: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? String(index + 1);
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
      onBlur={commit}
      title={`Position ${index + 1} of ${total} — type a number to move it`}
      className={`shrink-0 rounded-md border border-rule bg-panel text-center font-mono font-medium text-soft outline-none focus:border-faint focus:text-ink ${
        compact ? "h-[18px] w-[24px] text-[10px]" : "h-[22px] w-[30px] text-[11px]"
      }`}
    />
  );
}
