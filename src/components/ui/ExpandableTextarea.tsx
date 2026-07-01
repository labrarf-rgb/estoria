import { useState } from "react";

/**
 * A textarea whose reading/editing area can be enlarged: an Expand/Collapse pill
 * swaps between a compact row count and a tall fixed height, and the user can
 * also drag the bottom edge (`resize-y`) for fine control. Reused by story
 * notes, world description/notes, and chapter notes.
 */
export function ExpandableTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  collapsedRows = 2,
  expandedHeight = "48vh",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  collapsedRows?: number;
  expandedHeight?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={expanded ? undefined : collapsedRows}
        style={expanded ? { height: expandedHeight } : undefined}
        className={`w-full resize-y ${className}`}
      />
      <button
        onClick={() => setExpanded((v) => !v)}
        className="absolute right-[8px] top-[8px] rounded-md bg-chip px-[8px] py-[2px] text-[10px] font-semibold uppercase tracking-wide text-soft hover:text-ink"
        title={expanded ? "Shrink" : "Make longer"}
      >
        {expanded ? "Collapse" : "Expand"}
      </button>
    </div>
  );
}
