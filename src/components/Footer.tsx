import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { getSaveStatus, onSaveStatus, type SaveStatus } from "@/store/persistence";

/** Bottom bar: autosave indicator + canvas hint + attribution. */
export function Footer() {
  const view = useStore((s) => s.view);
  // Real persistence status from the storage layer — not a guess from state
  // changes, so a failed write (e.g. storage quota full) is actually visible.
  const [status, setStatus] = useState<SaveStatus>(getSaveStatus());
  useEffect(() => onSaveStatus(setStatus), []);

  const failed = status.state === "error";
  const saveText = failed
    ? "Couldn't save — browser storage is full. Export your project to keep a copy."
    : status.state === "saving"
      ? "Auto-saving..."
      : status.savedAt
        ? `Auto-saved at ${new Date(status.savedAt).toLocaleTimeString()}`
        : "Auto-saved to this browser";

  const hint =
    view === "timeline"
      ? "Scroll to pan the timeline · use the arrows to flip orientation"
      : "Double-click a chapter to map its scenes · drag to rearrange · scroll to zoom";

  return (
    <div className="flex items-center gap-3 border-t border-rule bg-panel px-4 py-[6px] text-[11px] font-medium text-faint">
      <span
        className="flex shrink-0 items-center gap-[6px]"
        style={failed ? { color: "var(--but)" } : undefined}
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: failed ? "var(--but)" : "var(--therefore)" }}
        />
        {saveText}
      </span>
      <span className="hidden flex-1 truncate text-center md:block">{hint}</span>
      <div className="flex-1 md:hidden" />
      <span className="shrink-0">
        Built by{" "}
        <a
          href="https://labrarf.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-soft underline decoration-rule underline-offset-2 hover:text-ink"
        >
          Ray Labra
        </a>
      </span>
    </div>
  );
}
