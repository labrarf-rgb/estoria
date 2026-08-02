import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { isWritten, sectionAt, sections, seedManuscript } from "@/lib/manuscript";
import type { Chapter, ConnType } from "@/types";

/**
 * Manuscript mode, Regular state — the writing pane, with the chapter's beats
 * above it.
 *
 * The point of the feature is not the editor. Any text box can hold prose; what
 * no writing app can do is show you the beats you planned while you draft them,
 * because no writing app has the beats. So the editor here is deliberately
 * plain — one textarea, markdown, no formatting toolbar — and the carousel is
 * the part that is worth building.
 *
 * See docs/manuscript-mode-build.md §4. Phase 0 builds this state only:
 * Minimized and Full screen, the drift bar, and the *write* direction of the
 * `***` contract (typing a break creating a beat) all come in Phase 1.
 */

const CONN: Record<ConnType, { label: string; color: string }> = {
  therefore: { label: "Therefore", color: "var(--therefore)" },
  but: { label: "But", color: "var(--but)" },
  and: { label: "And", color: "var(--and)" },
};

/** Card widths from §4: one card legible at a time, its neighbours peeking. */
const FOCUS_W = 352;
const PEEK_W = 118;
const PILL_W = 62;

export function ManuscriptSheet({
  ch,
  scroller,
  stickyTop,
}: {
  ch: Chapter;
  /** The chapter modal's scroll container — see `stickyTop`. */
  scroller: React.RefObject<HTMLDivElement | null>;
  /** Height of the modal's sticky header, so the carousel pins below it. */
  stickyTop: number;
}) {
  const setManuscript = useStore((s) => s.setManuscript);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);

  /**
   * Seed on first open, from the breaks this chapter's scenes already imply.
   * Keyed on `undefined`, never on emptiness: a one-scene chapter seeds to `""`,
   * which is a written-in manuscript with nothing in it, and re-seeding it every
   * render would be harmless but wrong.
   */
  const text = ch.manuscript ?? "";
  useEffect(() => {
    if (ch.manuscript === undefined) setManuscript(ch.id, seedManuscript(ch.scenes.length));
  }, [ch.id, ch.manuscript, ch.scenes.length, setManuscript]);

  const secs = useMemo(() => sections(text), [text]);
  const idx = sectionAt(text, caret, ch.scenes.length);

  const readCaret = () => setCaret(taRef.current?.selectionStart ?? 0);

  /**
   * Clicking a beat moves the caret to that scene's prose. **Nothing is
   * written** — a card is a place to go, not an edit (§3's interaction table).
   */
  const jumpToSection = (i: number) => {
    const ta = taRef.current;
    const sec = secs[Math.min(i, secs.length - 1)];
    if (!ta || !sec) return;
    ta.focus();
    // Setting a collapsed selection on a focused textarea scrolls the caret
    // into view; the focus has to land first or there is nothing to scroll.
    ta.setSelectionRange(sec.start, sec.start);
    setCaret(sec.start);
  };

  // Keep the carousel honest when the prose is replaced under it (a version
  // switch, a chapter switch), rather than pointing at an offset that is now
  // somewhere else entirely.
  useEffect(() => setCaret(0), [ch.id]);

  /**
   * Bring the sheet up to the top of the modal on open. Without this the writer
   * lands wherever the scroll happened to be — usually mid-canvas, with the
   * carousel above the fold, which is precisely the thing the feature is for.
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

  const beat = (i: number) => ({
    i,
    text: ch.scenes[i] ?? "",
    written: secs[i] ? isWritten(text, secs[i]) : false,
  });
  const prev = idx > 0 ? beat(idx - 1) : null;
  const next = idx < ch.scenes.length - 1 ? beat(idx + 1) : null;
  const here = beat(idx);

  return (
    <div ref={rootRef} className="mx-[22px] mb-[6px] rounded-xl border border-rule bg-bg">
      {/* Carousel. One card is legible at a time, so the position readout says
          where in the chapter that card is.

          Sticky, not merely above the sheet: the whole feature is *seeing your
          beats while you draft*, and a beat that scrolls away the moment you
          start writing is the feature not happening. No `overflow-hidden` on
          the wrapper for the same reason — it would make this box the sticky
          scrollport, and a box that never scrolls never sticks. */}
      <div
        className="sticky z-[1] flex items-stretch justify-center gap-[8px] rounded-t-xl border-b border-rule bg-bg px-[16px] py-[14px]"
        style={{ top: stickyTop }}
      >
        <Slot width={PEEK_W} shrink>
          {prev && <PeekCard beat={prev} onClick={() => jumpToSection(prev.i)} />}
        </Slot>
        <Slot width={PILL_W}>{prev && <Pill type={ch.sceneLinks[idx - 1] ?? "therefore"} />}</Slot>
        <FocusCard beat={here} count={ch.scenes.length} />
        <Slot width={PILL_W}>{next && <Pill type={ch.sceneLinks[idx] ?? "therefore"} />}</Slot>
        <Slot width={PEEK_W} shrink>
          {next && <PeekCard beat={next} onClick={() => jumpToSection(next.i)} />}
        </Slot>

        <span className="absolute right-[14px] top-[10px] font-mono text-[11px] font-semibold text-faint">
          {idx + 1} / {ch.scenes.length}
        </span>
      </div>

      {/* The sheet. Its own scroll container, so the beat above stays put
          however far into the chapter you write. */}
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => {
          setManuscript(ch.id, e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onSelect={readCaret}
        onClick={readCaret}
        onKeyUp={readCaret}
        spellCheck
        placeholder="Write the chapter here. A *** on its own line is a scene break."
        className="block h-[52vh] w-full resize-none rounded-b-xl bg-transparent px-[max(24px,calc(50%-330px))] py-[26px] font-serif text-[15.5px] leading-[1.8] text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}

/**
 * Fixed-width slot, so the focused card stays centred with no neighbour to
 * balance it. The peek slots are allowed to `shrink`: on a narrow window the
 * neighbours give up their room before the focused card does, which is the
 * right order — a beat you cannot read is worth nothing.
 */
function Slot({
  width,
  shrink,
  children,
}: {
  width: number;
  shrink?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-center ${shrink ? "min-w-0" : "shrink-0"}`}
      style={shrink ? { flex: `0 1 ${width}px` } : { width }}
    >
      {children}
    </div>
  );
}

interface Beat {
  i: number;
  text: string;
  written: boolean;
}

function FocusCard({ beat, count }: { beat: Beat; count: number }) {
  return (
    <div
      className="shrink-0 rounded-[11px] border bg-card p-[12px_13px] shadow-[var(--shadow)]"
      style={{
        width: FOCUS_W,
        borderColor: "var(--therefore)",
        boxShadow: "0 0 0 2px color-mix(in srgb, var(--therefore) 45%, transparent), var(--shadow)",
      }}
    >
      <div className="flex items-center gap-[6px]">
        <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
          SCENE {beat.i + 1}
        </span>
        <div className="flex-1" />
        <WrittenMark written={beat.written} />
      </div>
      {/* Never clamped. A scene card that cuts its text off reads as a finished
          sentence, which is the bug Session 56 exists to have fixed. */}
      <div className="mt-[7px] text-[13px] leading-[1.5] text-ink">
        {beat.text || <span className="text-faint">New scene</span>}
      </div>
      <div className="sr-only">
        Scene {beat.i + 1} of {count}
      </div>
    </div>
  );
}

/**
 * A peek card shows its **label only**, never clipped body text — hard-clipping
 * mid-word would contradict the rule the scene card was rebuilt around (§4).
 */
function PeekCard({ beat, onClick }: { beat: Beat; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={beat.text || "New scene"}
      style={{ maxWidth: PEEK_W }}
      className="flex h-full w-full flex-col items-start gap-[6px] overflow-hidden rounded-[11px] border border-rule bg-card p-[10px] text-left opacity-70 shadow-[var(--shadow)] transition-opacity hover:border-faint hover:opacity-100"
    >
      <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
        SCENE {beat.i + 1}
      </span>
      <WrittenMark written={beat.written} />
    </button>
  );
}

/** Whether the scene has prose under it. Not a word count — that is §5, Phase 5. */
function WrittenMark({ written }: { written: boolean }) {
  return (
    <span className="flex items-center gap-[5px] text-[10px] font-medium text-faint">
      <span
        className="h-[6px] w-[6px] rounded-full"
        style={{
          background: written ? "var(--therefore)" : "transparent",
          border: written ? "none" : "1px solid var(--faint)",
        }}
      />
      {written ? "written" : "not written"}
    </span>
  );
}

function Pill({ type }: { type: ConnType }) {
  return (
    <span
      className="rounded-full border bg-bg px-[8px] py-[2px] text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ color: CONN[type].color, borderColor: CONN[type].color }}
    >
      {CONN[type].label}
    </span>
  );
}
