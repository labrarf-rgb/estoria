import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { flushNow } from "@/store/persistence";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { ChapterMetaRow, ChapterModeTabs } from "@/components/ChapterMeta";
import { countWords, shortCount } from "@/lib/manuscript";
import { ProseChapter } from "@/components/ProsePane";
import type { Chapter, ConnType } from "@/types";

/**
 * Manuscript mode — the writing pane, with the chapter's beats in a rail beside
 * it. One of the chapter's two modals; the other is `ChapterDetail`, and
 * `ChapterModal` decides which one you get.
 *
 * The point of the feature is not the editor. Any text box can hold prose; what
 * no writing app can do is show you the beats you planned while you draft them,
 * because no writing app has the beats. So the editor is deliberately plain —
 * one textarea, markdown, no formatting toolbar — and the beats beside it are
 * the part that is worth building.
 *
 * **Why this is a modal and not a section of the chapter modal.** It was a
 * section, and a writing surface and a planning surface competing for one
 * scrolling column produced four separate complaints that all had one cause:
 * beat cards too tall, the controls scrolling out of reach, an empty sheet
 * making the modal scroll with no visible scrollbar, and moving between the
 * canvas and the prose feeling messy. Each was patched; the cause was not. The
 * shapes that fix it are here and are worth not undoing:
 *
 *  - **The modal is a fixed height** (`h-[92vh]`), not a maximum. An empty
 *    chapter and a finished one are the same size, so nothing reflows under you
 *    and there is no page scroll for a scrollbar to go missing from.
 *  - **The rail and the prose scroll side by side**, not nested. Neither needs
 *    to be sticky, which is what removes all three sticky layers at once.
 *  - **The rail's cards may grow downwards.** The horizontal strip's could not:
 *    a card that grew down made the guide as tall as its wordiest beat and
 *    pushed the writing off the screen. A rail has the room, so a beat at the
 *    200-character cap shows whole rather than in one of three width steps.
 *
 * **The beats are a guide, not a structure the prose has to satisfy.** An
 * earlier version bound them together with `***` scene breaks, tracked which
 * beat the caret was in, and raised a drift bar whenever the two disagreed. It
 * was dropped: see the note at the top of `lib/manuscript.ts` for why, and what
 * went with it.
 */

const CONN: Record<ConnType, { label: string; color: string }> = {
  therefore: { label: "Therefore", color: "var(--therefore)" },
  but: { label: "But", color: "var(--but)" },
  and: { label: "And", color: "var(--and)" },
  /** Never rendered — `Pill` draws nothing for an unlabeled seam. */
  none: { label: "", color: "var(--line)" },
};

/** The rail's width. Enough for a beat at the 200-character cap in a few lines. */
const RAIL_W = 284;

export function ManuscriptModal({ ch }: { ch: Chapter }) {
  const doc = useStore((s) => s.doc);
  const closeChapter = useStore((s) => s.closeChapter);
  const openChapter = useStore((s) => s.openChapter);
  const editChapterText = useStore((s) => s.editChapterText);
  const setManuscript = useStore((s) => s.setManuscript);
  const expanded = useStore((s) => s.manuscriptExpanded);
  const setExpanded = useStore((s) => s.setManuscriptExpanded);

  const taRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Edit / View. Local, and always starts on Edit: unlike the mode itself, this
   * one has a wrong side to land on — opening the manuscript unable to type
   * because a previous session left it in View is a trap, not a preference.
   */
  const [view, setView] = useState<"edit" | "read">("edit");

  const text = ch.manuscript ?? "";
  // Memoized because this component re-renders on every keystroke and the count
  // is a full regex sweep of the chapter: 3.3ms on a 10k-word chapter, spent
  // again for each character typed into it.
  const proseWords = useMemo(() => (text ? countWords(text) : 0), [text]);

  // Leaving a chapter forces the prose out, and so does leaving for the story
  // map: the chapter you just left is the one nobody is going to notice losing.
  useEffect(() => flushNow, [ch.id]);

  /**
   * Land in the text, at the end of it. The surface exists to be written in,
   * and the alternative is a writer who has to click before they can type.
   * The caret goes to the end rather than the start because opening a chapter
   * you have already written means carrying on from where it stops, not
   * typing into the front of your first sentence. Re-runs per chapter so the
   * prev/next arrows keep the caret where it is wanted, and per view so
   * switching back from View is not a dead end.
   */
  useEffect(() => {
    if (view !== "edit") return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    // Read the live value, not `text`: this runs on the same tick the
    // textarea mounts with the chapter's prose, and the end is wherever that
    // ends. Setting the selection alone does not always scroll the caret into
    // view, so the scroll is explicit.
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.scrollTop = ta.scrollHeight;
  }, [ch.id, view]);

  /**
   * `Cmd+S` does not save — saving is automatic — but it must not do *nothing*
   * either. Writers press it reflexively, and silence reads as failure, so it
   * forces everything out to disk now and says so.
   */
  const [confirmed, setConfirmed] = useState(false);
  const confirmTimer = useRef<number | null>(null);
  useEffect(() => () => void (confirmTimer.current && clearTimeout(confirmTimer.current)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s")) return;
      e.preventDefault();
      flushNow();
      setConfirmed(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmed(false), 1800);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A single click on a card opens this modal, so the second click of a
  // double-click lands on the backdrop that just appeared. The same 400ms guard
  // the story map modal has, for the same habit.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [ch.id]);
  const closeFromScrim = () => {
    if (Date.now() - openedAt.current < 400) return;
    closeChapter();
  };

  const chIdx = doc.chapters.findIndex((c) => c.id === ch.id);
  const prevCh = chIdx > 0 ? doc.chapters[chIdx - 1] : null;
  const nextCh = chIdx >= 0 && chIdx < doc.chapters.length - 1 ? doc.chapters[chIdx + 1] : null;

  const draftId = doc.activeDraftId;
  const draftName = doc.drafts.find((d) => d.id === draftId)?.name ?? "Main draft";

  return (
    <Scrim onClose={closeFromScrim} z={50} center>
      <div
        onMouseDown={stop}
        // A fixed height, not a maximum. See the note at the top of the file:
        // sizing to the content is what made an empty chapter scroll.
        className={`flex h-[92vh] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)] ${
          expanded ? "w-[min(1500px,96vw)]" : "w-[min(980px,100%)]"
        }`}
      >
        {/* Header. Not sticky, because nothing scrolls past it: the modal itself
            does not scroll, only the two columns below do. */}
        <div className="flex shrink-0 items-start gap-[14px] border-b border-rule bg-panel px-[26px] py-[22px]">
          <span className="mt-[6px] rounded-[7px] bg-ink px-[9px] py-[4px] font-mono text-[13px] font-semibold text-bg">
            {String(ch.num).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={ch.title}
              onChange={(e) => editChapterText(ch.id, { title: e.target.value })}
              placeholder="Chapter title"
              className="w-full bg-transparent font-serif text-[24px] font-semibold leading-tight text-ink outline-none placeholder:text-faint"
            />
            {draftId !== doc.mainDraftId && (
              <div className="mt-[4px] text-[10.5px] font-semibold uppercase tracking-wide text-but">
                Editing {draftName} · changes stay in this version
              </div>
            )}
            {/* Drafting sheds the planning chrome: the summary and the act
                stepper are things you set once, so neither is here. The words
                chip and the status are the two you watch while writing, and
                they come with the shared row. */}
            <ChapterMetaRow ch={ch} />
          </div>
          <div className="flex items-center gap-[6px]">
            {confirmed && (
              <span
                className="mr-[2px] rounded-full px-[8px] py-[2px] text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--therefore)", border: "1px solid var(--therefore)" }}
              >
                Saved
              </span>
            )}
            <SheetViewToggle view={view} onChange={setView} />
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
              title={expanded ? "Narrow the page" : "Widen the page"}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <button
              onClick={() => prevCh && openChapter(prevCh.id)}
              disabled={!prevCh}
              title={prevCh ? `Previous chapter · ${prevCh.title}` : "No previous chapter"}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-rule bg-card text-[16px] font-medium text-ink hover:border-faint disabled:cursor-default disabled:opacity-40 disabled:hover:border-rule"
            >
              ‹
            </button>
            <button
              onClick={() => nextCh && openChapter(nextCh.id)}
              disabled={!nextCh}
              title={nextCh ? `Next chapter · ${nextCh.title}` : "No next chapter"}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-rule bg-card text-[16px] font-medium text-ink hover:border-faint disabled:cursor-default disabled:opacity-40 disabled:hover:border-rule"
            >
              ›
            </button>
            <CloseButton onClick={closeChapter} />
          </div>
        </div>

        {/* Rail beside prose, each scrolling on its own. `min-h-0` on both is
            what lets a flex child scroll rather than grow the row. */}
        <div className="flex min-h-0 flex-1">
          <BeatRail ch={ch} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {view === "read" ? (
              <div
                data-print-root
                className="min-h-0 flex-1 overflow-y-auto px-[clamp(20px,4%,56px)] py-[26px]"
              >
                <ProseChapter ch={ch} maxWidth="none" />
              </div>
            ) : (
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setManuscript(ch.id, e.target.value)}
                // Write-through on blur. The prose debounce is short, but "I
                // stopped typing and clicked away" is the moment a writer
                // assumes their words are safe, and it costs nothing to make
                // that true.
                onBlur={flushNow}
                spellCheck
                placeholder="Write the chapter here. Markdown works: **bold**, *italic*, # heading."
                className="min-h-0 w-full flex-1 resize-none bg-transparent px-[clamp(20px,4%,56px)] py-[26px] font-serif text-[15.5px] leading-[1.8] text-ink outline-none placeholder:text-faint"
              />
            )}
            {/* Counted off the prose in front of you, so it moves as you type.
                The chip in the header is the saved cache, which follows on the
                save rhythm; a writer watching a target wants the live one. */}
            <div className="shrink-0 border-t border-rule px-[clamp(20px,4%,56px)] py-[7px] text-right font-mono text-[10.5px] font-medium text-faint">
              {proseWords.toLocaleString()} {proseWords === 1 ? "word" : "words"}
              {ch.target ? ` of ${ch.target.toLocaleString()}` : ""}
            </div>
          </div>
        </div>
      </div>
    </Scrim>
  );
}

/**
 * The beats, as a guide, down the left.
 *
 * A rail rather than the strip this replaced. The strip had to be sticky (the
 * whole feature is *seeing your beats while you draft*, and a beat that scrolls
 * away the moment you start writing is the feature not happening) and its cards
 * had to keep a fixed height and grow sideways, or the guide became as tall as
 * its wordiest beat. A column beside the prose needs neither rule: it is always
 * on screen because it never scrolls with the text, and it has the vertical room
 * to show a beat whole.
 *
 * Left, not right, because the timeline's vertical rail is on the left and the
 * beats should not change sides depending on where you are in the app.
 */
function BeatRail({ ch }: { ch: Chapter }) {
  const openAtScene = useStore((s) => s.openChapterAtScene);

  return (
    <aside className="flex shrink-0 flex-col border-r border-rule bg-bg" style={{ width: RAIL_W }}>
      {/* The rail's header is this modal's section header, so it carries the
          mode tabs — the same control, in the same relative place, as the story
          map's Scene flow row. Full width because the rail is narrow and two
          segments sharing it read better than two segments and a gap. */}
      <div className="shrink-0 px-[16px] pb-[8px] pt-[14px]">
        <ChapterModeTabs full />
        <div className="mt-[8px] font-mono text-[10.5px] font-medium text-faint">
          {ch.scenes.length} {ch.scenes.length === 1 ? "beat" : "beats"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[16px] pb-[16px]">
        {ch.scenes.length === 0 ? (
          <div className="rounded-[11px] border border-dashed border-line px-[12px] py-[18px] text-center text-[11.5px] font-medium text-faint">
            No beats yet. Plan some on the story map.
          </div>
        ) : (
          ch.scenes.map((s, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="flex justify-center py-[6px]">
                  <Pill type={ch.sceneLinks[i - 1] ?? "none"} />
                </div>
              )}
              <BeatCard num={i + 1} text={s} onOpen={() => openAtScene(ch.id, i)} />
            </div>
          ))
        )}
      </div>

      {/* Pinned below the beats rather than inside their scroll: it is an action
          on the chapter, not one of them, and it must not be scrolled past. */}
      <PullFromVersion ch={ch} />
    </aside>
  );
}

/**
 * One beat. Reference material while you draft, so it is quiet, and it wraps.
 *
 * Clicking it goes to that scene on the story map rather than editing it here.
 * Two editing surfaces on one chapter is the pattern this restructure exists to
 * undo, and `openChapterAtScene` already lands on a scene, focuses it and
 * flashes it — so the card only has to name which one.
 */
function BeatCard({ num, text, onOpen }: { num: number; text: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      title="Open this scene on the story map"
      className="block w-full rounded-[11px] border border-rule bg-card p-[8px_12px] text-left shadow-[var(--shadow)] hover:border-faint"
    >
      <span className="font-mono text-[9.5px] font-semibold tracking-wide text-faint">
        SCENE {num}
      </span>
      <div className="mt-[3px] text-[12px] leading-[1.45] text-ink">
        {text || <span className="text-faint">New scene</span>}
      </div>
    </button>
  );
}

function Pill({ type }: { type: ConnType }) {
  // An unlabeled seam says nothing, so it shows nothing. The gap between the
  // two beat cards is left in place: they are still separate beats.
  if (type === "none") return null;
  return (
    <span
      className="whitespace-nowrap rounded-full border bg-bg px-[8px] py-[2px] text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ color: CONN[type].color, borderColor: CONN[type].color }}
    >
      {CONN[type].label}
    </span>
  );
}

/**
 * The way back out of a fork.
 *
 * Prose forks with the version, which is right — "version" keeps meaning a
 * version of the book — but it means writing done in a fork you then abandon is
 * stranded, with no path out. This is that path: per chapter, replace what is
 * here with what that version has, behind a confirm and with one undo.
 *
 * Deliberately not a merge engine. Merging prose is a genuinely hard problem and
 * a bad one to half-solve; "take that version's copy of this chapter" is
 * unambiguous, and it is what someone abandoning a fork actually wants.
 */
export function PullFromVersion({ ch }: { ch: Chapter }) {
  const doc = useStore((s) => s.doc);
  const pull = useStore((s) => s.pullManuscriptFrom);
  const undo = useStore((s) => s.manuscriptUndo);
  const undoManuscript = useStore((s) => s.undoManuscript);
  const askConfirm = useStore((s) => s.askConfirm);

  const myUndo = undo?.chapterId === ch.id ? undo : null;
  const elsewhere = doc.drafts
    .filter((d) => d.id !== doc.activeDraftId)
    .map((d) => {
      const text = doc.draftData[d.id]?.chapters.find((c) => c.id === ch.id)?.manuscript;
      return { id: d.id, name: d.name, words: text ? countWords(text) : 0 };
    })
    .filter((v) => v.words > 0);

  if (myUndo) {
    return (
      <div className="shrink-0 border-t border-rule px-[16px] py-[10px] text-[12px] font-medium text-ink">
        <div>{myUndo.label}</div>
        <button
          onClick={undoManuscript}
          className="mt-[7px] rounded-lg border border-rule bg-card px-3 py-[5px] text-[12px] font-medium text-ink hover:border-faint"
        >
          Undo
        </button>
      </div>
    );
  }

  if (elsewhere.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-rule px-[16px] py-[10px]">
      <div className="text-[11px] font-medium text-faint">Also written in</div>
      <div className="mt-[6px] flex flex-wrap gap-[6px]">
        {elsewhere.map((v) => (
          <button
            key={v.id}
            onClick={() =>
              askConfirm({
                message: `Replace this chapter's writing with the copy from "${v.name}"?`,
                detail: `${v.words.toLocaleString()} words are copied in. What's here now can be put back with one undo, but only once.`,
                confirmLabel: "Pull it in",
                onConfirm: () => pull(ch.id, v.id),
              })
            }
            title={`Pull this chapter's text from "${v.name}"`}
            className="rounded-full border border-rule bg-card px-[9px] py-[3px] text-[11px] font-medium text-ink hover:border-faint"
          >
            {v.name} <span className="font-mono text-faint">{shortCount(v.words)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Edit / View — the editor's one and only mode switch. Both halves are the same
 * markdown; Edit is where you type it, View is where you see it rendered.
 */
export function SheetViewToggle({
  view,
  onChange,
}: {
  view: "edit" | "read";
  onChange: (v: "edit" | "read") => void;
}) {
  return (
    <div className="flex rounded-lg bg-chip p-[3px]">
      {(["edit", "read"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={v === "edit" ? "Write" : "See the markdown rendered"}
          className={`rounded-md px-[9px] py-[4px] text-[11px] font-medium ${
            view === v ? "bg-card text-ink" : "text-soft hover:bg-card"
          }`}
        >
          {v === "edit" ? "Edit" : "View"}
        </button>
      ))}
    </div>
  );
}
