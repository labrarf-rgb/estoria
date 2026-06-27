import { useStore } from "@/store/useStore";
import { readFileAsDataURL } from "@/lib/files";
import type { PinnedRef, RefKind } from "@/types";

/**
 * Editable grid of pinned references (notes + uploadable images). Reused by the
 * chapter detail, the World panel, and (with linking off) elsewhere. Images open
 * in the lightbox for viewing/zooming.
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

  const upload = async (refId: string, file: File | undefined) => {
    if (!file) return;
    const src = await readFileAsDataURL(file);
    onUpdate(refId, { src, label: file.name.replace(/\.[^.]+$/, "") });
  };

  return (
    <div className="flex flex-wrap items-start gap-3">
      {refs.map((r) =>
        r.kind === "IMAGE" ? (
          <div key={r.id} className="group relative w-[150px]">
            {r.src ? (
              <button
                onClick={() => openLightbox(r.src!)}
                className="block h-[92px] w-full overflow-hidden rounded-[11px] border border-rule"
                title="Click to view"
              >
                <img src={r.src} alt={r.label} className="h-full w-full object-cover" />
              </button>
            ) : (
              <label className="flex h-[92px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[11px] border-[1.5px] border-dashed border-line text-center text-[11px] font-medium text-faint hover:border-faint hover:text-ink">
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
              className="mt-[5px] w-full bg-transparent text-[11.5px] font-medium text-ink outline-none"
            />
            <button
              onClick={() => onDelete(r.id)}
              className="absolute right-[5px] top-[5px] hidden h-[20px] w-[20px] items-center justify-center rounded-md bg-black/45 text-[11px] text-white group-hover:flex"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            key={r.id}
            className="group relative flex min-h-[92px] w-[180px] flex-col gap-[6px] rounded-[11px] border border-rule bg-card p-[11px] shadow-[var(--shadow)]"
          >
            <input
              value={r.label}
              onChange={(e) => onUpdate(r.id, { label: e.target.value })}
              placeholder="Note title"
              className="bg-transparent text-[12.5px] font-semibold text-ink outline-none placeholder:text-faint"
            />
            <textarea
              value={r.body ?? ""}
              onChange={(e) => onUpdate(r.id, { body: e.target.value })}
              placeholder="Note..."
              rows={3}
              className="flex-1 resize-none bg-transparent text-[12px] leading-[1.45] text-soft outline-none placeholder:text-faint"
            />
            <button
              onClick={() => onDelete(r.id)}
              className="absolute right-[7px] top-[7px] hidden text-[12px] text-faint hover:text-but group-hover:block"
              title="Delete"
            >
              ✕
            </button>
          </div>
        )
      )}

      <div className="flex flex-col gap-[6px]">
        <button
          onClick={() => onAdd("NOTE")}
          className="w-[88px] rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
        >
          + Note
        </button>
        <button
          onClick={() => onAdd("IMAGE")}
          className="w-[88px] rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
        >
          + Image
        </button>
        {onLink && (
          <button
            onClick={onLink}
            className="w-[88px] rounded-[10px] border-[1.5px] border-dashed border-line py-[8px] text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
          >
            {linkLabel}
          </button>
        )}
      </div>
    </div>
  );
}
