import { Fragment, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { inlineTokens } from "@/lib/inline";
import { isWritten, paragraphs, sections } from "@/lib/manuscript";
import type { Chapter, ConnType } from "@/types";

const CONN: Record<ConnType, { label: string; color: string }> = {
  therefore: { label: "Therefore", color: "var(--therefore)" },
  but: { label: "But", color: "var(--but)" },
  and: { label: "And", color: "var(--and)" },
};

/**
 * One chapter's prose, as the timeline reads it.
 *
 * This is the **View** half of the editor's one Edit/View toggle, and it is
 * where the `***` contract pays for itself twice over: the break renders as the
 * horizontal rule a scene break has always looked like, and reading mode
 * decorates that rule with the causal type from `sceneLinks[i]` — the therefore
 * and but the map already knows, shown over the prose without ever being stored
 * in it. See docs/manuscript-mode-build.md §3 and §8 phase 4.
 */
export function ProseChapter({
  ch,
  width,
  onPickScene,
}: {
  ch: Chapter;
  width?: number;
  /**
   * What clicking a beat does. The timeline leaves this off and gets the
   * default — open the chapter there. The editor's own View mode passes one,
   * because it is already in the chapter and only needs to move the caret.
   */
  onPickScene?: (scene: number) => void;
}) {
  const openChapterAtScene = useStore((s) => s.openChapterAtScene);
  const openChapter = useStore((s) => s.openChapter);
  const manuscriptState = useStore((s) => s.manuscriptState);
  const setManuscriptState = useStore((s) => s.setManuscriptState);

  const text = ch.manuscript ?? "";
  const secs = useMemo(() => sections(text), [text]);

  /** Read the chapter with the sheet already open, not the planning canvas. */
  const openToWrite = (scene?: number) => {
    if (onPickScene) return onPickScene(scene ?? 0);
    if (manuscriptState === "min") setManuscriptState("regular");
    if (scene === undefined) openChapter(ch.id);
    else openChapterAtScene(ch.id, scene);
  };

  if (ch.manuscript === undefined || text.trim().length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line px-[20px] py-[34px]"
        style={{ width }}
      >
        <button
          onClick={() => openToWrite()}
          className="text-[12.5px] font-medium text-faint hover:text-soft"
        >
          Nothing written yet, open the chapter to start
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto" style={{ width, maxWidth: 660 }}>
      {secs.map((sec, i) => {
        const paras = paragraphs(text.slice(sec.start, sec.end));
        // The type belongs to the connector *before* this scene, so it decorates
        // the rule drawn above it. Scene 1 has no rule above it.
        const type = ch.sceneLinks[i - 1] ?? "therefore";
        return (
          <Fragment key={i}>
            {i > 0 && <SceneRule type={type} />}
            <div className="group">
              {/* A marker, not a wrapper: the prose itself stays selectable, so
                  the reading view can still be read from and copied out of. */}
              <button
                onClick={() => openToWrite(i)}
                title={`Open chapter ${ch.num} at scene ${i + 1}${
                  ch.scenes[i] ? ` · ${ch.scenes[i]}` : ""
                }`}
                className="mb-[6px] font-mono text-[9.5px] font-semibold uppercase tracking-[.09em] text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              >
                Scene {i + 1}
                {!isWritten(text, sec) && " · not written"}
              </button>
              {paras.length === 0 ? (
                <p className="mb-[14px] font-serif text-[15.5px] italic leading-[1.85] text-faint">
                  (not written)
                </p>
              ) : (
                paras.map((p, j) => (
                  <p key={j} className="mb-[14px] font-serif text-[15.5px] leading-[1.85] text-ink">
                    <Inline text={p} />
                  </p>
                ))
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The scene break: a centred rule with its causal type sitting on it, in the
 * same colour the connector pill uses everywhere else. This is what a `***`
 * looks like once it stops being markdown.
 */
function SceneRule({ type }: { type: ConnType }) {
  return (
    <div className="my-[22px] flex items-center gap-[12px]">
      <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
      <span
        className="rounded-full border bg-bg px-[9px] py-[1px] text-[9.5px] font-semibold uppercase tracking-wide"
        style={{ color: CONN[type].color, borderColor: CONN[type].color }}
      >
        {CONN[type].label}
      </span>
      <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
    </div>
  );
}

/**
 * Inline markdown, and deliberately only the four marks a novelist actually
 * types: bold-italic, bold, italic and code. No library and no wider parser —
 * §2 says default markdown rendering with no extra styling, and anything this
 * doesn't know is left as the literal characters the writer typed, which is
 * both honest and reversible.
 */
function Inline({ text }: { text: string }) {
  // Tokenized by the shared parser, so what is emphasised here and what is
  // emphasised in the .docx export can never drift apart. See lib/inline.ts.
  return (
    <>
      {inlineTokens(text).map((t, i) => {
        if (t.code)
          return (
            <code key={i} className="rounded bg-chip px-[4px] font-mono text-[13px]">
              {t.text}
            </code>
          );
        let node: React.ReactNode = t.text;
        if (t.italic) node = <em>{node}</em>;
        if (t.bold) node = <strong>{node}</strong>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}
