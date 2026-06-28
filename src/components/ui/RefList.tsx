import { useStore } from "@/store/useStore";
import { readFileAsDataURL } from "@/lib/files";
import type { PinnedRef, RefKind } from "@/types";

/**
 * Editable grid of pinned references (notes + uploadable images). Reused by the
 * chapter detail, the World panel, and the notes/assets library. Every cell is
 * the same fixed size so the grid lines up. Images open in the lightbox.
 */
export function RefList({
  refs,
  onAdd,
  onUpdate,
  onDelete,
  onLink,
  linkLabel = "Link asset",
}: {
  refs: PinnedRef[];
  onAdd: (kind: RefKind) => void;
  onUpdate: (refId: string, patch: Partial<PinnedRef>) => void;
  onDelete: (refId: string) => void;
  onLink?: () => void;
  linkLabel?: string;
}) {
  const openLightbox = useStore((s) => s.openLightbox);
  const askConfirm = useStore((s) => s.askConfirm);

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

      <div className={`flex flex-col justify-center gap-[6px] ${CELL}`}>
        <button
          onClick={() => onAdd("NOTE")}
          className="w-full rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
        >
          + Note
        </button>
        <button
          onClick={() => onAdd("IMAGE")}
          className="w-full rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
        >
          + Image
        </button>
        {onLink && (
          <button
            onClick={onLink}
            className="w-full rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
          >
            {linkLabel}
          </button>
        )}
      </div>
    </div>
  );
}
