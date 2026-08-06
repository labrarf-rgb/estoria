import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { ChapterDetail } from "@/components/ChapterDetail";
import { ManuscriptModal } from "@/components/ManuscriptModal";

/**
 * One chapter, two modals, and whichever of them you were last in.
 *
 * `ChapterDetail` is the story map: scenes, cast, world, notes, refs.
 * `ManuscriptModal` is the writing pane with the beats beside it. A button on
 * the meta line both of them share swaps between the two without closing and
 * reopening the chapter. See `ChapterMode` in the store for why the manuscript
 * stopped being a section of the chapter modal.
 *
 * **What this component is for, beyond choosing: the word-count recompute.** It
 * is debounced by 700ms off the prose, and it belongs to the open *chapter*
 * rather than to either face of it. Left in the manuscript modal, switching to
 * the story map would unmount it and clear the pending timer, so the count
 * would stop updating on exactly the click that goes to look at it.
 *
 * The prose flush needs no help here: the manuscript modal registers `flushNow`
 * as an effect *cleanup*, so unmounting it — which is what a mode switch does —
 * writes the words through on the way out.
 */
export function ChapterModal() {
  const openCh = useStore((s) => s.openCh);
  const mode = useStore((s) => s.chapterMode);
  const doc = useStore((s) => s.doc);
  const recomputeWords = useStore((s) => s.recomputeWords);

  const ch = doc.chapters.find((c) => c.id === openCh);

  // `words` follows the prose on the save rhythm rather than per keystroke: each
  // edit resets the timer, so counting a long chapter happens once, when the
  // typing stops.
  //
  // **And the timer has to be flushed, not dropped.** Closing the chapter — or
  // stepping to the next one — inside those 700ms used to clear a pending count
  // and leave it cleared: the board went back to the number from before that
  // last burst of typing, and nothing would correct it until you came back and
  // typed again. `pending` holds the chapter still owed a count, so the same
  // unmount that flushes the prose settles the number too.
  const chId = ch?.id ?? null;
  const pending = useRef<string | null>(null);
  const manuscriptText = ch?.manuscript;
  useEffect(() => {
    if (!chId || manuscriptText === undefined) return;
    pending.current = chId;
    const t = setTimeout(() => {
      if (pending.current === chId) pending.current = null;
      recomputeWords(chId);
    }, 700);
    return () => clearTimeout(t);
  }, [manuscriptText, chId, recomputeWords]);

  // Keyed on the chapter, so this cleanup runs both when the arrows step to
  // another one and when the modal closes — and `pending` still names the
  // chapter being left, since a cleanup runs before the next render's effect.
  useEffect(
    () => () => {
      const owed = pending.current;
      if (!owed) return;
      pending.current = null;
      recomputeWords(owed);
    },
    [chId, recomputeWords]
  );

  if (!ch) return null;
  return mode === "manuscript" ? <ManuscriptModal ch={ch} /> : <ChapterDetail />;
}
