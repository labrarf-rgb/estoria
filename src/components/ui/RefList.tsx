import { useState } from "react";
import { useStore, type ConfirmRequest } from "@/store/useStore";
import { readFileAsDataURL } from "@/lib/files";
import { isAssetEmpty } from "@/lib/prune";
import { uid } from "@/lib/ids";
import type { RefKind } from "@/types";
import type { ResolvedRef } from "@/lib/refs";
import type { RefView } from "@/components/ui/ViewToggle";

/**
 * Editable collection of pinned references (notes + uploadable images). Reused by
 * the chapter detail, the World panel, and the notes/assets library.
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
 * radii was the trap this avoids.
 *
 * "+ Note" / "+ Image" do NOT create anything: they open a **draft** row held in
 * local state under the id it will keep, and `onAdd(kind, id)` is called with
 * that id on the first typed character (or the first uploaded file), followed
 * immediately by the edit. So an untitled, bodyless note is never written to the
 * document, and the commit doesn't remount the field being typed into.
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
 * Card cells are a fixed 164x150, so the destroy control takes over the caption's
 * line on hover rather than adding one: a word, but only on the card you're
 * pointing at — 13 permanent "Delete" labels in a grid is just noise.
 */
const DESTROY_LINK =
  "hidden self-start shrink-0 text-[10.5px] font-medium text-faint hover:text-but group-hover:block";

const ADD_BTN =
  "rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-faint";

export function RefList({
  refs,
  onAdd,
  onUpdate,
  onDelete,
  onLink,
  linkLabel = "Link asset",
  deletePrompt,
  caption,
  view = "list",
  idPrefix = "r",
  removeMode = "detach",
}: {
  refs: ResolvedRef[];
  /** Create the record under `id` — the id the draft row already renders with. */
  onAdd: (kind: RefKind, id: string) => void;
  /**
   * Prefix for that id. Items are ref links ("r") everywhere except the shared
   * library, where the item id IS the asset id ("a") — keeps ids self-describing.
   */
  idPrefix?: "r" | "a";
  onUpdate: (id: string, patch: Partial<Pick<ResolvedRef, "label" | "body" | "src">>) => void;
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
  /** Optional small muted line under each item (e.g. "Linked in 3 places"). */
  caption?: (r: ResolvedRef) => string | undefined;
  view?: RefView;
}) {
  const openLightbox = useStore((s) => s.openLightbox);
  const askConfirm = useStore((s) => s.askConfirm);
  const [openId, setOpenId] = useState<string | null>(null);
  // The blank row from "+ Note" / "+ Image": rendered like any other item, but
  // it exists only here until it has content.
  const [draft, setDraft] = useState<ResolvedRef | null>(null);
  const items = draft ? refs.concat(draft) : refs;

  const startDraft = (kind: RefKind) => {
    const body = kind === "NOTE" ? "" : undefined;
    const d: ResolvedRef = { id: uid(idPrefix), kind, label: "", body };
    setDraft(d);
    setOpenId(d.id);
  };

  /** Edits route to the store — except on the draft, which the first one creates. */
  const update = (id: string, patch: Partial<Pick<ResolvedRef, "label" | "body" | "src">>) => {
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

  const confirmDelete = (r: ResolvedRef) => {
    // Nothing to confirm on a draft — there's nothing saved to lose.
    if (draft && r.id === draft.id) return setDraft(null);
    const prompt = deletePrompt?.(r) ?? {
      message: `Delete this ${r.kind === "IMAGE" ? "image" : "note"}?`,
      danger: true,
    };
    askConfirm({ ...prompt, onConfirm: () => onDelete(r.id) });
  };

  const addButtons = () => (
    <>
      <button onClick={() => startDraft("NOTE")} disabled={!!draft} className={ADD_BTN}>
        + Note
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
              : (r.body ?? "").trim() || "Empty note";
          const cap = capOf(r);
          return (
            <div key={r.id} className="rounded-[10px] border border-rule bg-card">
              <div className="group flex items-center gap-[10px] px-[12px] py-[9px]">
                <span className="text-[13px]">{r.kind === "IMAGE" ? "🖼" : "📝"}</span>
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div
                    className={`truncate text-[12.5px] font-semibold ${isDraft ? "text-faint" : "text-ink"}`}
                  >
                    {r.label ||
                      (isDraft
                        ? r.kind === "IMAGE"
                          ? "New image"
                          : "New note"
                        : r.kind === "IMAGE"
                          ? "Untitled image"
                          : "Untitled note")}
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
                      placeholder={r.kind === "IMAGE" ? "Image title" : "Note title"}
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
                  ) : (
                    <textarea
                      value={r.body ?? ""}
                      onChange={(e) => update(r.id, { body: e.target.value })}
                      placeholder="Note..."
                      rows={4}
                      className="w-full resize-y rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.55] text-ink outline-none focus:border-faint"
                    />
                  )}
                  {/* Same escape hatch the draft character/world cards offer. */}
                  {isDraft && (
                    <button onClick={() => setDraft(null)} className={DISCARD_BTN}>
                      Discard
                    </button>
                  )}
                  {/* Irreversible, so it gets a word — like "Delete character". */}
                  {!isDraft && removeMode === "destroy" && (
                    <button onClick={() => confirmDelete(r)} className={DESTROY_BTN}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-[2px] grid grid-cols-2 gap-[7px] sm:grid-cols-3">{addButtons()}</div>
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
            <input
              value={r.label}
              onChange={(e) => update(r.id, { label: e.target.value })}
              className="mt-[5px] h-[20px] w-full shrink-0 bg-transparent text-[11.5px] font-medium text-ink outline-none"
            />
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
              <button onClick={() => confirmDelete(r)} className={DESTROY_LINK}>
                Delete
              </button>
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
            <input
              value={r.label}
              onChange={(e) => update(r.id, { label: e.target.value })}
              placeholder="Note title"
              className="shrink-0 bg-transparent text-[12.5px] font-semibold text-ink outline-none placeholder:text-faint"
            />
            <textarea
              value={r.body ?? ""}
              onChange={(e) => update(r.id, { body: e.target.value })}
              placeholder="Note..."
              className="flex-1 resize-none bg-transparent text-[12px] leading-[1.45] text-soft outline-none placeholder:text-faint"
            />
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
              <button onClick={() => confirmDelete(r)} className={DESTROY_LINK}>
                Delete
              </button>
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
