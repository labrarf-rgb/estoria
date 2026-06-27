import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

/** Bottom bar: autosave indicator + attribution. */
export function Footer() {
  const doc = useStore((s) => s.doc);
  const [savedAt, setSavedAt] = useState<string>("");
  const first = useRef(true);

  // The store persists on every change; reflect that as a live "saved" stamp.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      setSavedAt("");
      return;
    }
    setSavedAt(new Date().toLocaleTimeString());
  }, [doc]);

  return (
    <div className="flex items-center gap-3 border-t border-rule bg-panel px-4 py-[6px] text-[11px] font-medium text-faint">
      <span className="flex items-center gap-[6px]">
        <span className="h-[6px] w-[6px] rounded-full bg-therefore" />
        {savedAt ? `Auto-saved at ${savedAt}` : "Auto-saved to this browser"}
      </span>
      <div className="flex-1" />
      <span>
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
