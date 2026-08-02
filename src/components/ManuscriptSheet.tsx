import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { flushNow } from "@/store/persistence";
import {
  applyReorder,
  appendBreaks,
  breakCount,
  breaksBefore,
  changedAt,
  isWritten,
  removeBreak,
  SCENE_BREAK,
  sectionAt,
  sections,
  seedManuscript,
} from "@/lib/manuscript";
import { ProseChapter } from "@/components/ProsePane";
import type { Chapter, ConnType } from "@/types";

/**
 * Manuscript mode — the writing pane, with the chapter's beats above it.
 *
 * The point of the feature is not the editor. Any text box can hold prose; what
 * no writing app can do is show you the beats you planned while you draft them,
 * because no writing app has the beats. So the editor here is deliberately
 * plain — one textarea, markdown, no formatting toolbar — and the carousel is
 * the part that is worth building.
 *
 * See docs/manuscript-mode-build.md §3 and §4.
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
  full,
  view,
  onView,
}: {
  ch: Chapter;
  /** The chapter modal's scroll container — see `stickyTop`. */
  scroller: React.RefObject<HTMLDivElement | null>;
  /** Height of the modal's sticky header, so the carousel pins below it. */
  stickyTop: number;
  /** Full screen: the sheet fills what is left rather than taking a fixed slice. */
  full: boolean;
  /** Edit (the textarea) or View (the same rendering the timeline reads). */
  view: "edit" | "read";
  onView: (v: "edit" | "read") => void;
}) {
  const setManuscript = useStore((s) => s.setManuscript);
  const insertScene = useStore((s) => s.insertScene);
  const focusScene = useStore((s) => s.focusScene);
  const clearFocusScene = useStore((s) => s.clearFocusScene);
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
   * Every keystroke, and the one place prose is allowed to change the map.
   *
   * Typing `***` is how a writer says "new scene" in the middle of drafting, so
   * a beat appears for it — but only when the two were in step beforehand. Once
   * they have drifted, a second guess stacked on an unanswered first one is how
   * a manuscript ends up shuffled with no way back; the drift bar asks instead.
   */
  const onWrite = (next: string, pos: number) => {
    const before = breakCount(text);
    const after = breakCount(next);
    setManuscript(ch.id, next);
    setCaret(pos);
    if (before === ch.sceneLinks.length && after === before + 1) {
      // Where the *text* changed, not where the caret ended up: typing the three
      // asterisks leaves the caret on the break line, while inserting one from
      // the keyboard leaves it two lines below, and only this gets both right.
      insertScene(ch.id, breaksBefore(next, changedAt(text, next)) + 1);
    }
  };

  /**
   * Clicking a beat moves the caret to that scene's prose. **Nothing is
   * written** — a card is a place to go, not an edit (§3's interaction table).
   */
  const jumpToSection = (i: number) => {
    const ta = taRef.current;
    const sec = secs[Math.max(0, Math.min(i, secs.length - 1))];
    if (!ta || !sec) return;
    ta.focus();
    // Setting a collapsed selection on a focused textarea scrolls the caret
    // into view; the focus has to land first or there is nothing to scroll.
    ta.setSelectionRange(sec.start, sec.start);
    setCaret(sec.start);
  };

  /**
   * Jumping to a beat from View mode has to wait for the textarea to exist, so
   * the click records where to go and an effect makes the move once Edit is back.
   */
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  useEffect(() => {
    if (pendingJump == null || view !== "edit" || !taRef.current) return;
    jumpToSection(pendingJump);
    setPendingJump(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, view]);

  /**
   * `Cmd+S` does not save — saving is automatic — but it must not do *nothing*
   * either. Writers press it reflexively, and silence reads as failure, so it
   * forces everything out to disk now and says so.
   */
  const [confirmed, setConfirmed] = useState(false);
  const confirmTimer = useRef<number | null>(null);
  useEffect(() => () => void (confirmTimer.current && clearTimeout(confirmTimer.current)), []);
  const forceSave = () => {
    flushNow();
    setConfirmed(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmed(false), 1800);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        forceSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The shortcuts worth having are **not** formatting ones. They are the two
   * moves this editor can make that a text box cannot: go to the next or
   * previous beat, and start a new one.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      jumpToSection(idx + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      // `execCommand` rather than splicing the value and setting the selection:
      // assigning `selectionStart`/`selectionEnd` directly **destroys the
      // browser's native undo stack**, and losing Cmd+Z in a writing pane is a
      // far worse trade than depending on a deprecated-but-universal API.
      document.execCommand("insertText", false, `\n\n${SCENE_BREAK}\n\n`);
    }
  };

  // Keep the carousel honest when the prose is replaced under it (a version
  // switch, a chapter switch), rather than pointing at an offset that is now
  // somewhere else entirely. Leaving a chapter also forces the prose out: the
  // chapter you just left is the one nobody is going to notice losing.
  useEffect(() => {
    setCaret(0);
    return flushNow;
  }, [ch.id]);

  /**
   * A scene clicked on the timeline opens this chapter on that beat. With the
   * sheet open that means the caret, not a card — same marker, same one-shot
   * consumption, and still **nothing written** (§3).
   */
  useEffect(() => {
    if (!focusScene || focusScene.chapterId !== ch.id) return;
    // Wait for the seed: on the very first open the prose is still `undefined`
    // for one render, and jumping then would land everything on section 0.
    if (ch.manuscript === undefined) return;
    clearFocusScene();
    jumpToSection(Math.max(0, Math.min(focusScene.index, ch.scenes.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusScene, ch.id, ch.manuscript === undefined]);

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
    <div
      ref={rootRef}
      className={`mx-[22px] mb-[6px] mt-[12px] rounded-xl border border-rule bg-bg ${
        full ? "flex min-h-0 flex-1 flex-col" : ""
      }`}
    >
      {/* Carousel. One card is legible at a time, so the position readout says
          where in the chapter that card is.

          Sticky, not merely above the sheet: the whole feature is *seeing your
          beats while you draft*, and a beat that scrolls away the moment you
          start writing is the feature not happening. No `overflow-hidden` on
          the wrapper for the same reason — it would make this box the sticky
          scrollport, and a box that never scrolls never sticks. */}
      <div
        className="sticky z-[1] flex shrink-0 items-stretch justify-center gap-[8px] rounded-t-xl border-b border-rule bg-bg px-[16px] py-[14px]"
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
        {confirmed && (
          <span
            className="absolute left-[14px] top-[10px] rounded-full px-[8px] py-[1px] text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--therefore)", border: "1px solid var(--therefore)" }}
          >
            Saved
          </span>
        )}
      </div>

      {/* View: the same rendering the timeline reads the book with, so the
          `***` you typed is the centred rule it will be, decorated with the
          connector the map already knows. Clicking a beat comes back to Edit
          with the caret in it. */}
      {view === "read" ? (
        <div
          className={`overflow-y-auto px-[max(24px,calc(50%-330px))] py-[26px] ${
            full ? "min-h-0 flex-1" : "h-[52vh]"
          }`}
        >
          <ProseChapter
            ch={ch}
            onPickScene={(i) => {
              onView("edit");
              setPendingJump(i);
            }}
          />
        </div>
      ) : (
      /* The sheet. Its own scroll container, so the beat above stays put
         however far into the chapter you write. */
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => onWrite(e.target.value, e.target.selectionStart)}
        onSelect={readCaret}
        onClick={readCaret}
        onKeyUp={readCaret}
        onKeyDown={onKeyDown}
        // Write-through on blur. The prose debounce is short, but "I stopped
        // typing and clicked away" is the moment a writer assumes their words
        // are safe, and it costs nothing to make that true.
        onBlur={flushNow}
        spellCheck
        placeholder="Write the chapter here. A *** on its own line is a scene break."
        className={`block w-full resize-none rounded-b-xl bg-transparent px-[max(24px,calc(50%-330px))] py-[26px] font-serif text-[15.5px] leading-[1.8] text-ink outline-none placeholder:text-faint ${
          full ? "min-h-0 flex-1" : "h-[52vh]"
        }`}
      />
      )}
    </div>
  );
}

/**
 * Edit / View — the editor's one and only mode switch (§2). Both halves render
 * the same markdown; only Edit lets you change it, and only Edit shows `***` as
 * the literal characters a textarea can actually draw.
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
          title={v === "edit" ? "Write" : "Read it back, scene breaks and all"}
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

/**
 * What to do when the map and the prose disagree.
 *
 * Two kinds of disagreement reach here and they are not equally knowable. When
 * the map edit *just happened* the store recorded exactly what it was, so the
 * bar can name the scene and offer the matching change. When it did not — the
 * counts are simply out of step, after a reload or a hand-typed break — no
 * amount of counting says *which* pair drifted, so the only honest offers are
 * the ones that append at the end and guess at nothing.
 *
 * Both routes are confirmed and both keep an undo. See §7's first hard rule:
 * there is no undo model that covers silently rearranging finished paragraphs,
 * which is why nothing here happens without being asked for.
 */
export function DriftBar({ ch }: { ch: Chapter }) {
  const drift = useStore((s) => s.manuscriptDrift);
  const undo = useStore((s) => s.manuscriptUndo);
  const reconcile = useStore((s) => s.reconcileManuscript);
  const undoManuscript = useStore((s) => s.undoManuscript);
  const clearDrift = useStore((s) => s.clearManuscriptDrift);
  const addScene = useStore((s) => s.addScene);
  const askConfirm = useStore((s) => s.askConfirm);

  const text = ch.manuscript;
  const mine = drift?.chapterId === ch.id ? drift : null;
  const myUndo = undo?.chapterId === ch.id ? undo : null;

  if (myUndo) {
    return (
      <Bar tone="calm">
        <span className="flex-1">{myUndo.label}</span>
        <BarButton onClick={undoManuscript}>Undo</BarButton>
      </Bar>
    );
  }

  if (text === undefined) return null;
  const breaks = breakCount(text);
  const wanted = ch.sceneLinks.length;
  if (breaks === wanted && !mine) return null;

  // A recorded operation: name the scene and offer the matching change.
  if (mine?.op.kind === "merge") {
    const i = mine.op.index;
    // Merge into the scene above, the way an emptied to-do row merges upward.
    // The first scene has nothing above it, so it merges forward instead.
    const breakIdx = i > 0 ? i - 1 : 0;
    const into = i > 0 ? i : 1;
    return (
      <Bar tone="warn">
        <span className="flex-1">
          Scene {i + 1} is gone from the map, but its prose is still in the manuscript.
        </span>
        <BarButton
          onClick={() =>
            askConfirm({
              message: `Merge that prose into scene ${into}?`,
              detail: "Nothing is deleted. The two scenes' prose runs together as one.",
              confirmLabel: "Merge",
              onConfirm: () =>
                reconcile(ch.id, removeBreak(text, breakIdx), `Prose merged into scene ${into}.`),
            })
          }
        >
          Merge into scene {into}
        </BarButton>
        <BarButton onClick={clearDrift}>Leave it</BarButton>
      </Bar>
    );
  }

  if (mine?.op.kind === "reorder") {
    const { from, to } = mine.op;
    return (
      <Bar tone="warn">
        <span className="flex-1">
          Scene {from + 1} moved to position {to + 1} on the map. The prose is still in its old
          order.
        </span>
        <BarButton
          onClick={() =>
            askConfirm({
              message: "Reorder the prose to match the map?",
              detail:
                "The scene's writing moves with it. Blank lines between scenes are tidied up, so this is worth an undo if it isn't what you meant.",
              confirmLabel: "Reorder",
              onConfirm: () =>
                reconcile(ch.id, applyReorder(text, from, to), "Prose reordered to match the map."),
            })
          }
        >
          Reorder the prose
        </BarButton>
        <BarButton onClick={clearDrift}>Leave it</BarButton>
      </Bar>
    );
  }

  // No recorded operation — counts only. Append, and guess at nothing.
  const extra = breaks - wanted;
  if (extra > 0) {
    return (
      <Bar tone="warn">
        <span className="flex-1">
          The manuscript has {extra} more scene {extra === 1 ? "break" : "breaks"} than this chapter
          has scenes.
        </span>
        <BarButton
          onClick={() => {
            for (let i = 0; i < extra; i++) addScene(ch.id);
          }}
        >
          Add {extra} {extra === 1 ? "scene" : "scenes"}
        </BarButton>
      </Bar>
    );
  }
  const missing = wanted - breaks;
  return (
    <Bar tone="warn">
      <span className="flex-1">
        {missing} {missing === 1 ? "scene has" : "scenes have"} no scene break in the manuscript.
      </span>
      <BarButton
        onClick={() =>
          reconcile(
            ch.id,
            appendBreaks(text, missing),
            `${missing} scene ${missing === 1 ? "break" : "breaks"} added at the end.`
          )
        }
      >
        Add {missing} at the end
      </BarButton>
    </Bar>
  );
}

function Bar({ tone, children }: { tone: "warn" | "calm"; children: React.ReactNode }) {
  return (
    <div
      className="mx-[22px] mb-[10px] flex flex-wrap items-center gap-[10px] rounded-xl border px-[14px] py-[10px] text-[12px] font-medium text-ink"
      style={{
        borderColor: tone === "warn" ? "var(--but)" : "var(--rule)",
        background:
          tone === "warn" ? "color-mix(in srgb, var(--but) 7%, transparent)" : "var(--card)",
      }}
    >
      {children}
    </div>
  );
}

function BarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-lg border border-rule bg-card px-3 py-[5px] text-[12px] font-medium text-ink hover:border-faint"
    >
      {children}
    </button>
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
