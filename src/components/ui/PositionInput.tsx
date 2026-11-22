import { useState } from "react";

/**
 * The typed half of reordering: shows an item's 1-based position and moves it
 * there. Held in local state while being typed (so a half-typed "1" on the way
 * to "12" doesn't move anything) and committed on Enter or blur.
 *
 * Three looks:
 * - `badge` (default): the ink badge a library or reference tile carries, "03".
 * - `chip`: the same, pill-sized, for a pinned-reference chip.
 * - `faint`: a quiet field at the end of a character or world tile's top row,
 *   shown only while its list is being rearranged (`hidden` otherwise; it stays
 *   in the tab order, so Tab from the grip reaches it and reveals the rest).
 *
 * Marked `data-no-open` and `data-reorder-pos`: it never opens the tile it sits
 * on, and focusing it counts as rearranging.
 */
export function PositionInput({
  index,
  total,
  look = "badge",
  hidden = false,
  onCommit,
}: {
  index: number;
  total: number;
  look?: "badge" | "chip" | "faint";
  hidden?: boolean;
  onCommit: (toIdx: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const resting = look === "faint" ? String(index + 1) : String(index + 1).padStart(2, "0");
  const shown = typed ?? resting;
  const commit = () => {
    if (typed === null) return;
    const n = parseInt(typed, 10);
    setTyped(null);
    if (!Number.isFinite(n)) return;
    const to = Math.max(0, Math.min(total - 1, n - 1));
    if (to !== index) onCommit(to);
  };
  const lookClass =
    look === "faint"
      ? "h-[22px] w-[30px] rounded-md border-rule bg-panel font-medium text-soft hover:border-faint focus:border-faint focus:bg-card focus:text-ink text-[11px]"
      : `border-transparent bg-ink font-semibold text-bg hover:border-faint focus:border-ink focus:bg-card focus:text-ink ${
          look === "chip" ? "h-[18px] w-[26px] rounded-full text-[10px]" : "h-[20px] w-[32px] rounded-md text-[11px]"
        }`;
  return (
    <input
      data-no-open
      data-reorder-pos
      inputMode="numeric"
      value={shown}
      onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        // Cancels the typing only: the window or drawer this sits in stays open.
        if (e.key === "Escape") {
          e.stopPropagation();
          setTyped(null);
        }
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      title={`Position ${index + 1} of ${total}, type a number to move it`}
      aria-label={`Position ${index + 1} of ${total}, type a number to move it`}
      className={`shrink-0 border text-center font-mono outline-none transition-opacity duration-200 ${lookClass} ${
        hidden ? "pointer-events-none opacity-0 focus:pointer-events-auto focus:opacity-100" : ""
      }`}
    />
  );
}
