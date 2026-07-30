import { useState, type ReactNode } from "react";

export interface ArchiveShelfItem {
  id: string;
  /** Small leading glyph: a kind icon, an avatar, a category dot. */
  icon: ReactNode;
  title: string;
  caption: string;
}

/**
 * The folded-away list of archived records, shared by the Characters, World and
 * Notes panels so all three read the same way.
 *
 * It stays collapsed until asked for, because the whole point of archiving is
 * to stop something being in the way. Each row offers Restore (lossless, by the
 * archive rule in `types.ts`) and a Delete the caller confirms, since only the
 * caller knows what deleting *that* kind of record costs.
 */
export function ArchiveShelf({
  items,
  blurb,
  onRestore,
  onDelete,
}: {
  items: ArchiveShelfItem[];
  /** One line explaining what archived means for this kind of record. */
  blurb: string;
  onRestore: (id: string) => void;
  onDelete: (item: ArchiveShelfItem) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[7px] text-[10px] font-semibold uppercase tracking-wide text-faint hover:text-ink"
      >
        <span className="text-[9px]">{open ? "▾" : "▸"}</span>
        Archived · {items.length}
      </button>
      {open && (
        <div className="mt-[8px] flex flex-col gap-[7px]">
          <div className="text-[11px] font-medium text-faint">{blurb}</div>
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-[10px] rounded-[10px] border border-rule bg-card px-[12px] py-[9px]"
            >
              <span className="flex-shrink-0 text-[13px]">{it.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-soft">{it.title}</div>
                <div className="truncate text-[11px] text-faint">{it.caption}</div>
              </div>
              <button
                onClick={() => onRestore(it.id)}
                className="shrink-0 rounded-lg border border-rule bg-panel px-[10px] py-[5px] text-[11.5px] font-medium text-ink hover:border-faint"
              >
                Restore
              </button>
              <button
                onClick={() => onDelete(it)}
                className="shrink-0 text-[11.5px] font-medium text-faint hover:text-but"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The look of a record that is archived but still attached to something.
 *
 * Archiving keeps every casting, reference and pin, so these keep rendering
 * where they always did. Dimming is what tells them apart from live ones
 * without removing information the chapter still depends on. Pair it with
 * `archivedTitle` so the reason is available on hover, not just implied by
 * the colour.
 */
export const ARCHIVED_DIM = "opacity-50";

/** Tooltip for a dimmed, still-attached record. */
export const archivedTitle = (name: string, kind = "") =>
  `${name} (archived${kind ? ` ${kind}` : ""})`;
