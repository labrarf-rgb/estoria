import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { flushNow } from "@/store/persistence";
import { countWords, shortCount } from "@/lib/manuscript";
import { ProseChapter } from "@/components/ProsePane";
import type { Chapter, ConnType } from "@/types";

/**
 * Manuscript mode — the writing pane, with the chapter's beats above it.
 *
 * The point of the feature is not the editor. Any text box can hold prose; what
 * no writing app can do is show you the beats you planned while you draft them,
 * because no writing app has the beats. So the editor is deliberately plain —
 * one textarea, markdown, no formatting toolbar — and the scene flow above it is
 * the part that is worth building.
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
};

export function ManuscriptSheet({
  ch,
  scroller,
  stickyTop,
  expanded,
  view,
}: {
  ch: Chapter;
  /** The chapter modal's scroll container — see `stickyTop`. */
  scroller: React.RefObject<HTMLDivElement | null>;
  /** Height of the modal's sticky header, so the guide pins below it. */
  stickyTop: number;
  /** Expanded: the sheet gets more room, as the scene canvas does. */
  expanded: boolean;
  /** Edit (the textarea) or View (the same markdown, rendered). */
  view: "edit" | "read";
}) {
  const setManuscript = useStore((s) => s.setManuscript);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const text = ch.manuscript ?? "";
  /**
   * An empty manuscript takes only the room it needs.
   *
   * Reserving the full writing height for a chapter nobody has written in makes
   * the modal taller than the window on a chapter with nothing in it — so it
   * scrolls, and because the sheet's own headers are pinned it reads as the
   * manuscript area scrolling, with the scrollbar somewhere else entirely. The
   * room appears when there are words to put in it.
   */
  const empty = text.trim() === "";
  const sheetHeight = empty ? "h-[18vh]" : expanded ? "h-[74vh]" : "h-[46vh]";

  /**
   * Bring the sheet up to the top of the modal on open. Without this the writer
   * lands wherever the scroll happened to be — usually mid-canvas, with the
   * beats above the fold, which is precisely the thing the feature is for.
   */
  useEffect(() => {
    const box = scroller.current;
    const root = rootRef.current;
    if (!box || !root) return;
    box.scrollTop += root.getBoundingClientRect().top - box.getBoundingClientRect().top - stickyTop;
    // Once, on open. Re-running it on every header resize would yank the page
    // out from under someone who is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving a chapter forces the prose out: the chapter you just left is the
  // one nobody is going to notice losing.
  useEffect(() => flushNow, [ch.id]);

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

  return (
    <div
      ref={rootRef}
      className="mx-[22px] mb-[6px] mt-[12px] rounded-xl border border-rule bg-bg"
    >
      {/* The beats, as a guide. Sticky rather than merely above the sheet: the
          whole feature is *seeing your beats while you draft*, and a beat that
          scrolls away the moment you start writing is the feature not happening.
          No `overflow-hidden` on the wrapper for the same reason — it would make
          this box the sticky scrollport, and a box that never scrolls never
          sticks. */}
      <div
        className="sticky z-[1] shrink-0 rounded-t-xl border-b border-rule bg-bg"
        style={{ top: stickyTop }}
      >
        <div className="flex items-center gap-[8px] px-[16px] pb-[6px] pt-[10px]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-faint">
            Scene flow
          </span>
          <span className="font-mono text-[10.5px] font-medium text-faint">
            {ch.scenes.length} {ch.scenes.length === 1 ? "beat" : "beats"}
          </span>
          <div className="flex-1" />
          {confirmed && (
            <span
              className="rounded-full px-[8px] py-[1px] text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--therefore)", border: "1px solid var(--therefore)" }}
            >
              Saved
            </span>
          )}
        </div>
        <div className="flex items-stretch gap-[8px] overflow-x-auto px-[16px] pb-[12px]">
          {ch.scenes.map((s, i) => (
            <div key={i} className="flex shrink-0 items-stretch gap-[8px]">
              {i > 0 && (
                <span className="flex items-center">
                  <Pill type={ch.sceneLinks[i - 1] ?? "therefore"} />
                </span>
              )}
              <BeatCard num={i + 1} text={s} />
            </div>
          ))}
        </div>
      </div>

      {view === "read" ? (
        <div
          data-print-root
          className={`overflow-y-auto px-[clamp(20px,4%,56px)] py-[26px] ${
            empty ? "" : sheetHeight
          }`}
        >
          <ProseChapter ch={ch} maxWidth="none" />
        </div>
      ) : (
        /* The sheet. Its own scroll container, so the beats above stay put
           however far into the chapter you write. */
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setManuscript(ch.id, e.target.value)}
          // Write-through on blur. The prose debounce is short, but "I stopped
          // typing and clicked away" is the moment a writer assumes their words
          // are safe, and it costs nothing to make that true.
          onBlur={flushNow}
          spellCheck
          placeholder="Write the chapter here. Markdown works: **bold**, *italic*, # heading."
          className={`block w-full resize-none rounded-b-xl bg-transparent px-[clamp(20px,4%,56px)] py-[26px] font-serif text-[15.5px] leading-[1.8] text-ink outline-none placeholder:text-faint ${sheetHeight}`}
        />
      )}
    </div>
  );
}

/**
 * One beat. Reference material while you draft, so it is readable and inert.
 *
 * **Fixed height, growing sideways** — the same rule the timeline card follows.
 * Letting a card grow *downwards* makes the guide as tall as its wordiest beat
 * and pushes the writing pane off the screen, which is the wrong thing to spend
 * vertical space on when the point is to write.
 */
function BeatCard({ num, text }: { num: number; text: string }) {
  // Three width steps rather than a measured fit: enough that a scene at the
  // 200-character cap still shows whole, without the probe machinery the
  // timeline needs for a grid it has to pack.
  const n = text.trim().length;
  const width = n > 130 ? 460 : n > 62 ? 340 : 230;
  return (
    <div
      className="h-[74px] shrink-0 overflow-hidden rounded-[11px] border border-rule bg-card p-[8px_12px] shadow-[var(--shadow)]"
      style={{ width }}
    >
      <span className="font-mono text-[9.5px] font-semibold tracking-wide text-faint">
        SCENE {num}
      </span>
      <div className="mt-[3px] text-[12px] leading-[1.4] text-ink">
        {text || <span className="text-faint">New scene</span>}
      </div>
    </div>
  );
}

function Pill({ type }: { type: ConnType }) {
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
      <div className="mx-[22px] mb-[8px] flex flex-wrap items-center gap-[10px] rounded-xl border border-rule bg-card px-[14px] py-[10px] text-[12px] font-medium text-ink">
        <span className="flex-1">{myUndo.label}</span>
        <button
          onClick={undoManuscript}
          className="shrink-0 rounded-lg border border-rule bg-card px-3 py-[5px] text-[12px] font-medium text-ink hover:border-faint"
        >
          Undo
        </button>
      </div>
    );
  }

  if (elsewhere.length === 0) return null;

  return (
    <div className="mx-[22px] mb-[8px] flex flex-wrap items-center gap-[8px] text-[11.5px] font-medium text-faint">
      <span>Also written in</span>
      {elsewhere.map((v) => (
        <button
          key={v.id}
          onClick={() =>
            askConfirm({
              message: `Replace this chapter's writing with the copy from "${v.name}"?`,
              detail: `${v.words.toLocaleString()} words come across. What is here now can be put back with a single undo, but only once.`,
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
