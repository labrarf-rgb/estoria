import type { ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { hasProse } from "@/lib/manuscript";
import type { Chapter, ChapterStatus } from "@/types";

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
 * The switch between the two lives on the working area's section header, not
 * here — see `ChapterModeTabs`.
 */
export function ChapterMetaRow({ ch, act }: { ch: Chapter; act?: ReactNode }) {
  const patchChapter = useStore((s) => s.patchChapter);

  // Does this chapter's count come from its prose rather than from the keyboard?
  const counted = hasProse(ch.manuscript);

  return (
    <div className="mt-[11px] flex flex-wrap items-center gap-[10px]">
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
            title="Words in this chapter. Once you write in it, this is counted for you."
          />
          <span className="font-mono text-[11px] font-medium text-soft">words</span>
        </label>
      )}

      <label
        className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]"
        title="How long you mean this chapter to be. The gap is the progress."
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
        · {ch.scenes.length} {ch.scenes.length === 1 ? "scene" : "scenes"}
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
          one. The mode switch is not here: it is a tab on the section header
          below, so the row that swaps the working area sits with that area. See
          `ChapterModeTabs`. */}
      {act}
    </div>
  );
}

/**
 * Scene flow / Manuscript — the switch between the chapter's two modals.
 *
 * A two-segment tab rather than a button naming its destination, and it sits on
 * the **section header** of the working area in each modal: the Scene flow row
 * in the story map, the head of the beat rail in the manuscript. That puts the
 * control that swaps the working area on the working area itself, so the header
 * above stays about the chapter and this stays about what you are doing to it.
 *
 * Both segments are always shown and the current one is lit, which is what
 * makes it read as two views of one thing rather than a mode with an on and an
 * off. The same component in both modals, so the pair cannot drift apart.
 */
export function ChapterModeTabs({ full = false }: { full?: boolean }) {
  const mode = useStore((s) => s.chapterMode);
  const setMode = useStore((s) => s.setChapterMode);

  const seg = (m: "map" | "manuscript", label: string, hint: string) => (
    <button
      onClick={() => setMode(m)}
      title={hint}
      className={`rounded-md px-[10px] py-[4px] text-[11px] font-semibold uppercase tracking-wider ${
        full ? "flex-1" : ""
      } ${mode === m ? "bg-card text-ink" : "text-soft hover:bg-card"}`}
    >
      {label}
    </button>
  );

  return (
    <div className={`flex rounded-lg bg-chip p-[3px] ${full ? "w-full" : ""}`}>
      {seg("map", "Scene flow", "Plan this chapter's beats")}
      {seg("manuscript", "Manuscript", "Write this chapter, with its beats beside you")}
    </div>
  );
}
