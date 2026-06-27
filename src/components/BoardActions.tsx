import { useStore } from "@/store/useStore";

/** Thin strip under the toolbar: primary board actions + the canvas hint. */
export function BoardActions() {
  const addChapter = useStore((s) => s.addChapter);
  const autoArrangeBoard = useStore((s) => s.autoArrangeBoard);
  const view = useStore((s) => s.view);

  return (
    <div className="flex items-center gap-[9px] border-b border-rule bg-panel px-4 py-[7px]">
      <button
        onClick={addChapter}
        className="flex items-center gap-2 rounded-lg border border-rule bg-card px-[13px] py-[6px] text-[12px] font-semibold text-ink hover:border-faint"
      >
        <span className="-mt-px text-[15px] font-normal leading-none">+</span> New chapter
      </button>
      <button
        onClick={autoArrangeBoard}
        className="rounded-lg border border-rule bg-card px-[13px] py-[6px] text-[12px] font-semibold text-ink hover:border-faint"
      >
        Auto-arrange
      </button>
      <div className="flex-1" />
      <span className="hidden text-[11px] font-medium text-faint sm:block">
        {view === "timeline"
          ? "Scroll to pan the timeline · use the arrows to flip orientation"
          : "Double-click a chapter to map its scenes · drag to rearrange · scroll to zoom"}
      </span>
    </div>
  );
}
