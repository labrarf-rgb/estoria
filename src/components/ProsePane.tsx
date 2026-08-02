import { useMemo, useRef } from "react";
import { useStore } from "@/store/useStore";
import { inlineTokens, type InlineToken } from "@/lib/inline";
import { parseBlocks, taskItem, type Block } from "@/lib/manuscript";
import type { Chapter } from "@/types";

/**
 * One chapter's prose, rendered as markdown.
 *
 * This is the **View** half of the editor's Edit/View toggle, and it is also
 * what the timeline reads the book with. You write markdown; View shows you
 * markdown — bold, italic, headings, quotes, lists.
 *
 * Nothing here knows anything about scenes. An earlier version drew a labelled
 * `Therefore` / `But` / `And` rule between them, which coupled the reading view
 * to the map and put the causality method in the middle of the prose, where it
 * is not what you are trying to read.
 */

export function ProseChapter({
  ch,
  width,
  maxWidth = 660,
  onOpen,
}: {
  ch: Chapter;
  width?: number;
  /**
   * Given by the timeline: click the prose to go and write it. Omitted by the
   * editor's own View mode, which is already in the chapter.
   */
  onOpen?: () => void;
  /**
   * The reading measure. 660px suits the timeline, where the prose is one column
   * inside a much wider pane. The editor's own View mode passes `"none"`, because
   * there the column *is* the pane.
   */
  maxWidth?: number | "none";
}) {
  const openChapter = useStore((s) => s.openChapter);
  const setChapterMode = useStore((s) => s.setChapterMode);

  const text = ch.manuscript ?? "";
  const blocks = useMemo(() => parseBlocks(text), [text]);

  if (blocks.length === 0) {
    return (
      <div
        // Nothing to print for a chapter nobody has written yet: a dashed
        // "start here" box is a screen affordance, not part of the book.
        data-print-skip
        className="flex items-center justify-center rounded-xl border border-dashed border-line px-[20px] py-[34px]"
        style={{ width }}
      >
        <button
          onClick={() => {
            setChapterMode("manuscript");
            openChapter(ch.id);
          }}
          className="text-[12.5px] font-medium text-faint hover:text-soft"
        >
          Nothing written yet, open the chapter to start
        </button>
      </div>
    );
  }

  /**
   * A press that doesn't move is a click; a press that moves is a text
   * selection. The same rule the board uses for cards, and the reason the prose
   * can be both a way in and something you can still select and copy out of.
   */
  const press = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      data-print-chapter
      className={`mx-auto ${onOpen ? "cursor-pointer" : ""}`}
      style={{ width, maxWidth }}
      title={onOpen ? `Open chapter ${ch.num} and write` : undefined}
      onMouseDown={onOpen ? (e) => (press.current = { x: e.clientX, y: e.clientY }) : undefined}
      onMouseUp={
        onOpen
          ? (e) => {
              const p = press.current;
              press.current = null;
              if (!p) return;
              if (Math.abs(e.clientX - p.x) > 4 || Math.abs(e.clientY - p.y) > 4) return;
              onOpen();
            }
          : undefined
      }
    >
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "hr":
      return <hr className="my-[26px] border-0 border-t" style={{ borderColor: "var(--rule)" }} />;
    case "h": {
      // Six real sizes, not three: `####` parsed correctly but looked exactly
      // like `###`, which makes a hierarchy you cannot see.
      const size = [22, 19, 17, 15.5, 14.5, 13.5][block.level - 1] ?? 15.5;
      return (
        <div
          className="mb-[10px] mt-[22px] font-serif font-semibold text-ink"
          style={{ fontSize: size, lineHeight: 1.3 }}
        >
          <Inline text={block.text} />
        </div>
      );
    }
    case "quote":
      return (
        <blockquote
          className="mb-[14px] border-l-2 pl-[14px] font-serif text-[15.5px] italic leading-[1.85] text-soft"
          style={{ borderColor: "var(--line)" }}
        >
          <Inline text={block.text} />
        </blockquote>
      );
    case "ul":
      return (
        <ul
          className={`mb-[14px] pl-[24px] font-serif text-[15.5px] leading-[1.85] text-ink ${
            block.items.every((it) => taskItem(it)) ? "list-none pl-[6px]" : "list-disc"
          }`}
        >
          {block.items.map((it, i) => {
            const task = taskItem(it);
            return (
              <li key={i} className="mb-[4px]">
                {task ? (
                  <span className="flex items-start gap-[8px]">
                    <span
                      aria-hidden
                      className="mt-[6px] flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[3px] border text-[9px] font-bold leading-none text-bg"
                      style={{
                        borderColor: task.done ? "var(--therefore)" : "var(--faint)",
                        background: task.done ? "var(--therefore)" : "transparent",
                      }}
                    >
                      {task.done ? "✓" : ""}
                    </span>
                    <span className={task.done ? "text-soft line-through" : undefined}>
                      <Inline text={task.text} />
                    </span>
                  </span>
                ) : (
                  <Inline text={it} />
                )}
              </li>
            );
          })}
        </ul>
      );
    case "ol":
      return (
        <ol className="mb-[14px] list-decimal pl-[24px] font-serif text-[15.5px] leading-[1.85] text-ink">
          {block.items.map((it, i) => (
            <li key={i} className="mb-[4px]">
              <Inline text={it} />
            </li>
          ))}
        </ol>
      );
    default:
      return (
        <p className="mb-[14px] font-serif text-[15.5px] leading-[1.85] text-ink">
          <Inline text={block.text} />
        </p>
      );
  }
}

/** Inline markdown, through the tokenizer the `.docx` export also uses. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((t: InlineToken, i: number) => {
        if (t.code)
          return (
            <code key={i} className="rounded bg-chip px-[4px] font-mono text-[13px]">
              {t.text}
            </code>
          );
        let node: React.ReactNode = t.text;
        if (t.strike) node = <s>{node}</s>;
        if (t.italic) node = <em>{node}</em>;
        if (t.bold) node = <strong>{node}</strong>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}
