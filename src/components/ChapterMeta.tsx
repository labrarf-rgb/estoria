import type { ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { hasProse } from "@/lib/manuscript";
import type { Chapter, ChapterStatus } from "@/types";
import { partNouns } from "@/lib/piece";

const STATUSES: { value: ChapterStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "done", label: "Done" },
];

/**
 * The chapter's meta line — words, target, scene count and status.
 *
 * **Shared by both modals deliberately.** What splitting the manuscript out
 * into its own surface costs is a second thing to keep in step with the first,
 * and this row is exactly where the two would drift: it is the one piece of
 * chrome both have to show identically.
 *
 * The story map keeps the switch between the two on its working area's section
 * header; the manuscript passes it in as `trail` — see `ChapterModeTabs`.
 */
export function ChapterMetaRow({
  ch,
  act,
  lead,
  trail,
}: {
  ch: Chapter;
  act?: ReactNode;
  lead?: ReactNode;
  /** Last on the line. The manuscript puts its mode tabs and its page controls
   *  (Edit / View, the size) here. */
  trail?: ReactNode;
}) {
  const patchChapter = useStore((s) => s.patchChapter);
  const kind = useStore((s) => s.doc.kind);
  const nouns = partNouns({ kind });

  // Does this chapter's count come from its prose rather than from the keyboard?
  const counted = hasProse(ch.manuscript);

  return (
    <div className="mt-[11px] flex flex-wrap items-center gap-[10px]">
      {/* A single piece leads with what it is. */}
      {lead}
      {/* Counted, not typed, once the chapter has prose — so the field stops
          being editable rather than silently ignoring edits. A chapter with
          nothing written keeps the hand-typed estimate it has always had. */}
      {counted ? (
        <span
          className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]"
          title="Counted from the manuscript, and updated as you write."
        >
          <span className="font-mono text-[12px] font-medium text-ink">
            {ch.words.toLocaleString()}
          </span>
          <span className="font-mono text-[11px] font-medium text-soft">words</span>
        </span>
      ) : (
        <label className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]">
          <input
            type="number"
            min={0}
            value={ch.words}
            onChange={(e) =>
              patchChapter(ch.id, { words: Math.max(0, parseInt(e.target.value, 10) || 0) })
            }
            className="w-[56px] bg-transparent text-right font-mono text-[12px] font-medium text-ink outline-none [appearance:textfield]"
            title="Words so far. Once you write, this is counted for you."
          />
          <span className="font-mono text-[11px] font-medium text-soft">words</span>
        </label>
      )}

      <label
        className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]"
        title="How long you mean this to be. The gap is the progress."
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-faint">
          Target
        </span>
        <input
          type="number"
          min={0}
          value={ch.target ?? ""}
          placeholder="none"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            patchChapter(ch.id, {
              target: e.target.value.trim() === "" || isNaN(v) ? undefined : Math.max(0, v),
            });
          }}
          className="w-[52px] bg-transparent text-right font-mono text-[12px] font-medium text-ink outline-none [appearance:textfield] placeholder:text-faint"
        />
      </label>

      <span className="font-mono text-[11.5px] font-medium text-faint">
        · {ch.scenes.length} {ch.scenes.length === 1 ? nouns.one : nouns.many}
      </span>

      <div className="flex rounded-lg bg-chip p-[3px]">
        {STATUSES.map((st) => (
          <button
            key={st.value}
            onClick={() => patchChapter(ch.id, { status: st.value })}
            className={`rounded-md px-[9px] py-[3px] text-[11px] font-medium ${
              ch.status === st.value ? "bg-card text-ink" : "text-soft hover:bg-card"
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* The act stepper is a planning control, so only the story map passes
          one. The manuscript's `trail` brings its mode tabs and page controls;
          the story map keeps its tabs on the Scene flow row. See
          `ChapterModeTabs`. */}
      {act}
      {trail}
    </div>
  );
}

/**
 * Scene flow / Manuscript — the switch between the chapter's two modals.
 *
 * A two-segment tab rather than a button naming its destination. In the story
 * map it sits on the **section header** of the working area, the Scene flow
 * row, so the control that swaps the working area is on the working area. In
 * the manuscript it sits on the meta line, after the status: it used to head
 * the beat rail, and folding the rail moved it, so it went where folding
 * cannot reach.
 *
 * Both segments are always shown and the current one is lit, which is what
 * makes it read as two views of one thing rather than a mode with an on and an
 * off. The same component in both modals, so the pair cannot drift apart.
 */
export function ChapterModeTabs() {
  const mode = useStore((s) => s.chapterMode);
  const setMode = useStore((s) => s.setChapterMode);
  // Same control, same place; a single piece names its two faces in plainer
  // words than a book's chapter does.
  const piece = useStore((s) => s.doc.form === "piece");

  const seg = (m: "map" | "manuscript", label: string, hint: string) => (
    <button
      onClick={() => setMode(m)}
      title={hint}
      className={`rounded-md px-[10px] py-[4px] text-[11px] font-semibold uppercase tracking-wider ${
        mode === m ? "bg-card text-ink" : "text-soft hover:bg-card"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex rounded-lg bg-chip p-[3px]">
      {piece ? (
        <>
          {seg("map", "Map", "Map the parts")}
          {seg("manuscript", "Write", "Write it, with the parts beside you")}
        </>
      ) : (
        <>
          {seg("map", "Scene flow", "Plan this chapter's beats")}
          {seg("manuscript", "Manuscript", "Write this chapter, with its beats beside you")}
        </>
      )}
    </div>
  );
}
