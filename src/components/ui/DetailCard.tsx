import type { ReactNode } from "react";
import { ARCHIVED_DIM } from "@/components/ui/ArchiveShelf";

/**
 * The tile every detail record is shown as: a character, a world entry, a
 * library item, a pinned reference. It is the board's chapter card face
 * (`Board.tsx`) on purpose, so everything you can open reads the same way:
 * badge row, serif title, two lines of body, a small mono count line.
 *
 * A tile never edits. Clicking it calls `onOpen`, and the caller opens the
 * record in a `DetailWindow`, the way clicking a chapter opens the chapter.
 *
 * Two optional slots are kept for ordering (`docs/PLAN-detail-cards-reorder.md`):
 * `grip` leads the top row, `position` ends it. Neither is required, and with
 * neither the tile is exactly the restyle's design. Anything inside the tile
 * marked `data-no-open` (a grip, a typed position number) never opens it.
 */
export function DetailCard({
  badge,
  tag,
  title,
  untitled = false,
  body,
  meta = [],
  onOpen,
  grip,
  position,
  dim = false,
  highlight = false,
  faded = false,
  minHeight = 142,
  label,
}: {
  /** The ink badge in the chapter number's place (initials, category, position). */
  badge: ReactNode;
  /** Small uppercase word beside the badge, where a chapter has its status dot. */
  tag?: ReactNode;
  title: string;
  /** Title is placeholder copy ("Unnamed character"), so it reads faint. */
  untitled?: boolean;
  /** A string is clamped to two lines; a node (an image, say) is drawn as given. */
  body?: ReactNode;
  /** The mono line at the bottom right, joined with the app's `·`. */
  meta?: ReactNode[];
  onOpen: () => void;
  grip?: ReactNode;
  position?: ReactNode;
  /** Archived: still attached somewhere, retired from pickers. */
  dim?: boolean;
  /** A drag is hovering over this tile. */
  highlight?: boolean;
  /** This tile is the one being dragged, or a blank draft. */
  faded?: boolean;
  minHeight?: number;
  /** Accessible name for the open action. */
  label?: string;
}) {
  const shown = meta.filter((m) => m !== null && m !== undefined && m !== false && m !== "");
  const open = (e: React.SyntheticEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-open]")) return;
    onOpen();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label ?? `Open ${title}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ minHeight }}
      className={`flex cursor-pointer flex-col gap-[7px] rounded-xl border bg-card p-[12px_14px] text-left shadow-[var(--shadow)] outline-none transition-colors hover:border-faint focus-visible:border-faint focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--therefore)_35%,transparent)] ${
        highlight ? "border-faint" : "border-rule"
      } ${faded ? "opacity-50" : ""}`}
    >
      <div className={`flex min-h-[22px] items-center gap-2 ${dim ? ARCHIVED_DIM : ""}`}>
        {grip}
        {badge}
        {tag && (
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
            {tag}
          </span>
        )}
        <div className="flex-1" />
        {position}
      </div>
      <div className={`flex flex-1 flex-col gap-[7px] ${dim ? ARCHIVED_DIM : ""}`}>
        <div
          className={`break-words font-serif text-[16px] font-semibold leading-tight ${
            untitled ? "text-faint" : "text-ink"
          }`}
        >
          {title}
        </div>
        {typeof body === "string" ? (
          <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-soft">{body}</div>
        ) : (
          body
        )}
        <div className="flex-1" />
        {shown.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-[7px] font-mono text-[11px] font-medium text-soft">
            {shown.map((m, i) => (
              <span key={i} className="flex items-center gap-[7px]">
                {i > 0 && <span className="text-faint">·</span>}
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Faint body line for a tile with nothing to show ("No description yet"). */
export function EmptyBody({ children }: { children: ReactNode }) {
  return <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-faint">{children}</div>;
}

/** The ink badge, as on a chapter card. */
export function InkBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-ink px-[7px] py-[2px] font-mono text-[11px] font-semibold uppercase text-bg">
      {children}
    </span>
  );
}

/** A character's badge: their initials in their own colour. */
export function InitialsBadge({ initials, color }: { initials: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-md px-[7px] py-[2px] font-mono text-[11px] font-semibold text-white"
      style={{ background: color }}
    >
      {initials || "?"}
    </span>
  );
}

/**
 * The tile list: one column in a narrow place (the side panel), a grid of
 * tiles of at least `min` px where there is room. Reading order is row-major
 * either way, so array order maps straight onto what you see.
 */
export function TileGrid({ min, children }: { min?: number; children: ReactNode }) {
  return min ? (
    <div className="grid gap-[14px]" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  ) : (
    <div className="flex flex-col gap-[11px]">{children}</div>
  );
}

/** The dashed "+ Add …" tile at the end of a list or grid. */
export function AddTile({
  onClick,
  disabled,
  grid,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  grid?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-[7px] rounded-xl border-[1.5px] border-dashed border-line text-[13px] font-semibold text-soft hover:border-faint hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-soft ${
        grid ? "min-h-[142px]" : "py-[13px]"
      }`}
    >
      {children}
    </button>
  );
}
