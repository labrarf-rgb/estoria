import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { ChapterModal } from "@/components/ChapterModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChapterCrash } from "@/components/CrashScreen";

/**
 * A single piece, on screen. Where a book shows its board, a piece shows
 * itself: the map or the writing, as a page rather than a modal over cards.
 *
 * It is the chapter modal in page mode, opened on the piece's one chapter.
 * Keeping `openCh` pointed at that chapter is what lets everything keyed on
 * the open chapter (the word-count recompute, focusing a scene from the beat
 * rail, the prose flush on the way out) work for a piece without knowing it
 * is one. If something closes it — switching projects does — it is reopened.
 */
export function PieceView() {
  const chId = useStore((s) => s.doc.chapters[0]?.id ?? null);
  const openCh = useStore((s) => s.openCh);
  const openChapter = useStore((s) => s.openChapter);
  const mode = useStore((s) => s.chapterMode);
  const extra = useStore((s) => s.doc.chapters.length - 1);
  const setFormDialog = useStore((s) => s.setFormDialog);

  useEffect(() => {
    if (chId && openCh !== chId) openChapter(chId);
  }, [chId, openCh, openChapter]);

  if (!chId || openCh !== chId) return <div className="flex-1 bg-panel" />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The phone shows a piece as a one-chapter book, so a chapter can be
          added there. A piece only shows its first; rather than hide the rest,
          say so and offer the form that can show them. */}
      {extra > 0 && (
        <div className="flex shrink-0 items-center gap-[12px] border-b border-rule bg-card px-[26px] py-[9px] text-[12.5px] text-soft">
          <span>
            This piece has {extra} more {extra === 1 ? "chapter" : "chapters"}, added somewhere else. Only the first
            is shown here.
          </span>
          <button
            onClick={() => setFormDialog("expand")}
            className="rounded-lg border border-rule bg-panel px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
          >
            Expand into a book to see them
          </button>
        </div>
      )}
      <ErrorBoundary
        resetKey={`${chId}:${mode}`}
        fallback={(error, retry) => <ChapterCrash error={error} retry={retry} />}
      >
        <ChapterModal page />
      </ErrorBoundary>
    </div>
  );
}
