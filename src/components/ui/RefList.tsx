import { useState } from "react";
import { useStore } from "@/store/useStore";
import { readFileAsDataURL } from "@/lib/files";
import type { PinnedRef, RefKind } from "@/types";
import type { RefView } from "@/components/ui/ViewToggle";

/**
 * Editable collection of pinned references (notes + uploadable images). Reused by
 * the chapter detail, the World panel, and the notes/assets library.
 *
 * Two layouts, chosen by `view`:
 *  - "card": a wrap grid of fixed-size cells (default).
 *  - "list": compact rows you click to expand into an inline detail editor.
 * Images open in the lightbox.
 */
export function RefList({
  refs,
  onAdd,
  onUpdate,
  onDelete,
  onLink,
  linkLabel = "Link asset",
  view = "list",
}: {
  refs: PinnedRef[];
  onAdd: (kind: RefKind) => void;
  onUpdate: (refId: string, patch: Partial<PinnedRef>) => void;
  onDelete: (refId: string) => void;
  onLink?: () => void;
  linkLabel?: string;
  view?: RefView;
}) {
  const openLightbox = useStore((s) => s.openLightbox);
  const askConfirm = useStore((s) => s.askConfirm);
  const [openId, setOpenId] = useState<string | null>(null);

  const upload = async (refId: string, file: File | undefined) => {
    if (!file) return;
    const src = await readFileAsDataURL(file);
    onUpdate(refId, { src, label: file.name.replace(/\.[^.]+$/, "") });
  };

  const confirmDelete = (r: PinnedRef) =>
    askConfirm({
      message: `Delete this ${r.kind === "IMAGE" ? "image" : "note"}?`,
      danger: true,
      onConfirm: () => onDelete(r.id),
    });

  const addButtons = () => (
    <>
      <button
        onClick={() => onAdd("NOTE")}
        className="rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
      >
        + Note
      </button>
      <button
        onClick={() => onAdd("IMAGE")}
        className="rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
      >
        + Image
      </button>
      {onLink && (
        <button
          onClick={onLink}
          className="rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
        >
          {linkLabel}
        </button>
      )}
    </>
  );

  // ── List view ──────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="flex flex-col gap-[7px]">
        {refs.length === 0 && (
          <div className="px-[2px] text-[12px] text-faint">No references yet.</div>
        )}
        {refs.map((r) => {
          const open = openId === r.id;
          const snippet =
            r.kind === "IMAGE" ? "Image" : (r.body ?? "").trim() || "Empty note";
          return (
            <div key={r.id} className="rounded-[10px] border border-rule bg-card">
              <div className="group flex items-center gap-[10px] px-[12px] py-[9px]">
                <span className="text-[13px]">{r.kind === "IMAGE" ? "🖼" : "📝"}</span>
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[12.5px] font-semibold text-ink">
                    {r.label || (r.kind === "IMAGE" ? "Untitled image" : "Untitled note")}
                  </div>
                  <div className="truncate text-[11.5px] text-soft">{snippet}</div>
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
                      onChange={(e) => onUpdate(r.id, { label: e.target.value })}
                      placeholder={r.kind === "IMAGE" ? "Image title" : "Note title"}
                      className="min-w-0 flex-1 rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] font-semibold text-ink outline-none focus:border-faint"
                    />
                    <button
                      onClick={() => confirmDelete(r)}
                      className="shrink-0 text-[12px] text-faint hover:text-but"
                      title="Delete"
                    >
                      ✕
                    </button>
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
                      onChange={(e) => onUpdate(r.id, { body: e.target.value })}
                      placeholder="Note..."
                      rows={4}
                      className="w-full resize-y rounded-lg border border-rule bg-panel px-[9px] py-[6px] text-[12.5px] leading-[1.55] text-ink outline-none focus:border-faint"
                    />
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
      {refs.map((r) =>
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
              onChange={(e) => onUpdate(r.id, { label: e.target.value })}
              className="mt-[5px] h-[20px] w-full shrink-0 bg-transparent text-[11.5px] font-medium text-ink outline-none"
            />
            <button
              onClick={() => confirmDelete(r)}
              className="absolute right-[5px] top-[5px] hidden h-[20px] w-[20px] items-center justify-center rounded-md bg-black/45 text-[11px] text-white group-hover:flex"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            key={r.id}
            className={`group relative flex flex-col gap-[6px] rounded-[11px] border border-rule bg-card p-[11px] shadow-[var(--shadow)] ${CELL}`}
          >
            <input
              value={r.label}
              onChange={(e) => onUpdate(r.id, { label: e.target.value })}
              placeholder="Note title"
              className="shrink-0 bg-transparent text-[12.5px] font-semibold text-ink outline-none placeholder:text-faint"
            />
            <textarea
              value={r.body ?? ""}
              onChange={(e) => onUpdate(r.id, { body: e.target.value })}
              placeholder="Note..."
              className="flex-1 resize-none bg-transparent text-[12px] leading-[1.45] text-soft outline-none placeholder:text-faint"
            />
            <button
              onClick={() => confirmDelete(r)}
              className="absolute right-[7px] top-[7px] hidden text-[12px] text-faint hover:text-but group-hover:block"
              title="Delete"
            >
              ✕
            </button>
          </div>
        )
      )}

      <div className={`flex flex-col justify-center gap-[6px] ${CELL}`}>{addButtons()}</div>
    </div>
  );
}
