import { useEffect, useRef, useState, type DragEvent } from "react";
import { useStore } from "@/store/useStore";
import { ChapterModal } from "@/components/ChapterModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChapterCrash } from "@/components/CrashScreen";
import { Popover } from "@/components/ui/Popover";
import { wordsMeta } from "@/lib/manuscript";
import { displaySummary } from "@/lib/drafts";
import { kindInfo } from "@/lib/piece";
import { bands, inOrder, pieceKind, pieceNouns } from "@/lib/anthology";
import type { Chapter } from "@/types";

/**
 * An anthology on screen (docs/PLAN-anthology.md §4.2–4.3): its board of
 * pieces, or one piece opened as a page.
 *
 * Opening a piece points `openCh` at it, exactly as opening a chapter does,
 * so everything keyed on the open chapter (the word-count recompute, the beat
 * rail, the prose flush on the way out) works unchanged. Closing it, with
 * ‹ Board or by switching projects, comes back to the board.
 */
export function AnthologyView() {
  const openCh = useStore((s) => s.openCh);
  const exists = useStore((s) => s.doc.chapters.some((c) => c.id === s.openCh));
  return openCh && exists ? <AnthologyPiece /> : <AnthologyBoard />;
}

const statusColor = (s: Chapter["status"]) =>
  s === "done" ? "var(--therefore)" : s === "draft" ? "var(--but)" : "var(--faint)";

// ---- the board ---------------------------------------------------------------

/**
 * Each card is a piece; each dashed band is a section. Cards flow in rows in
 * book order (`num`), so what you see left to right is the book. Drag a card to
 * reorder it, or into another band to change its section; click to open it.
 */
function AnthologyBoard() {
  const doc = useStore((s) => s.doc);
  const pending = useStore((s) => s.pendingSections);
  const openChapter = useStore((s) => s.openChapter);
  const movePieces = useStore((s) => s.movePieces);
  const setAddPieceDialog = useStore((s) => s.setAddPieceDialog);
  const addPendingSection = useStore((s) => s.addPendingSection);
  // Several pieces picked at once (Shift, Cmd or Ctrl and click), to move or
  // delete together. Dragging a picked piece takes all of them along.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // A piece that left (deleted, taken out) leaves the selection too.
  const live = new Set(doc.chapters.map((c) => c.id));
  const picked = [...selected].filter((id) => live.has(id));
  const [dragId, setDragIdState] = useState<string | null>(null);
  const [over, setOverState] = useState<{ band: string; id: string | null; after: boolean } | null>(null);
  // Mirrored in refs: drag events can arrive before React has re-rendered with
  // the state the previous event set.
  const dragRef = useRef<string | null>(null);
  const overRef = useRef<{ band: string; id: string | null; after: boolean } | null>(null);
  const setDragId = (id: string | null) => {
    dragRef.current = id;
    setDragIdState(id);
  };
  const setOver = (o: { band: string; id: string | null; after: boolean } | null) => {
    overRef.current = o;
    setOverState(o);
  };

  const real = bands(doc.chapters);
  const all = [...real, ...pending.map((section) => ({ section, pieces: [] as Chapter[] }))];
  const hasSections = all.some((b) => b.section);
  const words = doc.chapters.reduce((n, c) => n + c.words, 0);

  const onOver = (e: DragEvent, band: string, id: string | null) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    let after = false;
    if (id) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      after = e.clientX > r.left + r.width / 2;
    }
    const o = overRef.current;
    if (o?.band !== band || o.id !== id || o.after !== after) setOver({ band, id, after });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const id = dragRef.current;
    const o = overRef.current;
    if (id && o) {
      const ids = selected.has(id) ? picked : [id];
      movePieces(ids, o.id && ids.includes(o.id) ? null : o.id, o.after, o.band);
    }
    setDragId(null);
    setOver(null);
  };

  return (
    <div
      // No bg-bg of its own: the app root under it paints --bg (and Plain's
      // paper texture), or lets a background scene through.
      className="scene-dots min-h-0 flex-1 overflow-auto"
      style={{ backgroundImage: "radial-gradient(var(--dot) 1.2px, transparent 1.2px)", backgroundSize: "22px 22px" }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-[18px] px-[26px] pb-[40px] pt-[22px]">
        <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[4px]">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">Anthology</div>
          <div className="font-mono text-[11px] text-soft">
            {doc.chapters.length} {doc.chapters.length === 1 ? "piece" : "pieces"} · {words.toLocaleString()} words
            {hasSections ? ` · ${all.filter((b) => b.section).length} sections` : ""}
          </div>
          <div className="text-[11.5px] text-faint">
            Drag a piece to reorder it{hasSections ? ", or into another section" : ""}. Click to open it. Shift-click
            to pick several.
          </div>
        </div>

        {all.map((b, bi) => (
          <section
            key={`${b.section}:${bi}`}
            onDragOver={(e) => onOver(e, b.section, null)}
            onDrop={onDrop}
            className="relative rounded-2xl border border-dashed px-[18px] pb-[18px] pt-[14px]"
            style={{
              borderColor: over?.band === b.section && dragId ? "var(--therefore)" : "var(--line)",
              background: "color-mix(in srgb, var(--panel) 45%, transparent)",
            }}
          >
            {b.section ? (
              <SectionHead name={b.section} count={b.pieces.length} index={bi} total={all.length} pending={!b.pieces.length} />
            ) : hasSections ? (
              <div className="mb-[12px] text-[11px] font-semibold uppercase tracking-wider text-faint">
                No section
              </div>
            ) : null}
            <div className="flex flex-wrap gap-[18px]">
              {b.pieces.map((c) => (
                <PieceCard
                  key={c.id}
                  c={c}
                  picked={selected.has(c.id)}
                  dragging={dragId === c.id || (!!dragId && selected.has(dragId) && selected.has(c.id))}
                  mark={over?.id === c.id && dragId !== c.id ? (over.after ? "after" : "before") : null}
                  onOpen={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggle(c.id) : openChapter(c.id))}
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => onOver(e, b.section, c.id)}
                  onDrop={onDrop}
                />
              ))}
              <button
                onClick={() => setAddPieceDialog({ section: b.section })}
                className="flex min-h-[142px] w-[244px] flex-col items-center justify-center gap-[4px] rounded-xl border-[1.5px] border-dashed border-line text-[13px] font-semibold text-soft hover:border-ink hover:text-ink"
              >
                + Add piece
                {b.section && <span className="text-[11px] font-normal text-faint">to {b.section}</span>}
              </button>
            </div>
          </section>
        ))}

        <button
          onClick={addPendingSection}
          className="rounded-2xl border-[1.5px] border-dashed border-line px-[14px] py-[13px] text-[13px] font-semibold text-soft hover:border-ink hover:text-ink"
        >
          + Add section
        </button>
      </div>
      {picked.length > 0 && (
        <SelectionBar ids={picked} sections={all.map((b) => b.section)} clear={() => setSelected(new Set())} />
      )}
    </div>
  );
}

/**
 * While pieces are picked: how many, Move to section, Delete, Clear. Floats
 * over the board as the book board's selection bar does.
 */
function SelectionBar({ ids, sections, clear }: { ids: string[]; sections: string[]; clear: () => void }) {
  const doc = useStore((s) => s.doc);
  const movePieces = useStore((s) => s.movePieces);
  const deleteChapters = useStore((s) => s.deleteChapters);
  const askConfirm = useStore((s) => s.askConfirm);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const n = ids.length;
  const names = [...new Set(sections)];
  const taken = new Set(names);
  let k = names.filter(Boolean).length + 1;
  while (taken.has(`Section ${k}`)) k++;
  const fresh = `Section ${k}`;
  const btnCls = "rounded-lg border border-rule bg-card px-[12px] py-[6px] text-[12px] font-medium hover:border-faint";
  const move = (section: string) => {
    setOpen(false);
    movePieces(ids, null, false, section);
    clear();
  };
  return (
    <div className="scene-bar fixed bottom-[46px] left-1/2 z-[40] flex w-max max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-[10px] rounded-2xl border border-rule bg-panel px-[16px] py-[11px] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
      <span className="text-[12.5px] font-medium text-ink">
        {n} {n === 1 ? "piece" : "pieces"} selected
      </span>
      <span className="text-[11.5px] text-faint">drag one to move them all</span>
      <span className="mx-[2px] h-[20px] w-px bg-rule" />
      <button ref={btn} onClick={() => setOpen((o) => !o)} className={`${btnCls} text-ink`}>
        Move to section <span className="text-[9px] text-faint">▾</span>
      </button>
      <Popover anchorRef={btn} open={open} onClose={() => setOpen(false)} align="left" side="above" width={240}>
        <div className="flex flex-col p-[6px]">
          {names.map((name) => (
            <button
              key={name || "(none)"}
              onClick={() => move(name)}
              className={`truncate rounded-lg px-[11px] py-[7px] text-left text-[12.5px] text-ink hover:bg-chip ${name ? "font-serif italic" : ""}`}
            >
              {name || "No section"}
            </button>
          ))}
          <div className="mx-[6px] my-1 h-px bg-rule" />
          <button onClick={() => move(fresh)} className="rounded-lg px-[11px] py-[7px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip">
            New section
            <span className="block text-[11px] font-normal text-soft">"{fresh}", at the end; rename it after</span>
          </button>
        </div>
      </Popover>
      <button
        onClick={() => {
          if (n >= doc.chapters.length) {
            askConfirm({
              message: "An anthology keeps at least one piece",
              detail: "Leave one piece unselected, then delete the rest.",
              confirmLabel: "Got it",
              onConfirm: () => {},
            });
            return;
          }
          const titles = doc.chapters.filter((c) => ids.includes(c.id)).map((c) => c.title || "Untitled piece");
          askConfirm({
            message: `Delete ${n} ${n === 1 ? "piece" : "pieces"}?`,
            detail: `${titles.slice(0, 4).join(", ")}${titles.length > 4 ? `, and ${titles.length - 4} more` : ""}. Their writing, maps and notes go with them. This can't be undone.`,
            confirmLabel: "Delete",
            danger: true,
            onConfirm: () => {
              deleteChapters(ids);
              clear();
            },
          });
        }}
        className={`${btnCls} text-but hover:border-but`}
      >
        Delete
      </button>
      <button onClick={clear} className={`${btnCls} text-ink`}>
        Clear
      </button>
    </div>
  );
}

function PieceCard({
  c,
  picked,
  dragging,
  mark,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  c: Chapter;
  picked: boolean;
  dragging: boolean;
  mark: "before" | "after" | null;
  onOpen: (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const doc = useStore((s) => s.doc);
  const k = kindInfo(pieceKind(doc, c));
  const nouns = pieceNouns(doc, c);
  const n = c.scenes.length;
  const edge =
    (mark === "before" ? "-4px 0 0 0 var(--therefore), " : mark === "after" ? "4px 0 0 0 var(--therefore), " : "") +
    (picked ? "0 0 0 3px color-mix(in srgb, var(--therefore) 30%, transparent), " : "");
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(e);
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-pressed={picked}
      className={`scene-solid flex min-h-[142px] w-[244px] cursor-grab flex-col gap-[7px] rounded-xl border bg-card p-[12px_14px] text-left hover:border-faint focus-visible:outline-2 focus-visible:outline-therefore ${
        picked ? "border-therefore" : "border-rule"
      }`}
      style={{ boxShadow: `${edge}var(--shadow)`, opacity: dragging ? 0.4 : 1 }}
      title={`Open ${c.title || "this piece"}`}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-chip px-[8px] py-[2px] text-[9.5px] font-bold uppercase tracking-wide text-soft">
          {k.kind === "other" ? "Piece" : k.label}
        </span>
        <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: statusColor(c.status) }} title={c.status} />
      </div>
      <div className={`font-serif text-[16px] font-semibold leading-tight ${c.title ? "text-ink" : "text-faint"}`}>
        {c.title || "Untitled piece"}
      </div>
      <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-soft">{displaySummary(c)}</div>
      <div className="flex-1" />
      <div className="flex items-center justify-end gap-[7px] font-mono text-[11px] font-medium text-soft">
        <span>
          {n} {n === 1 ? nouns.one : nouns.many}
        </span>
        <span className="text-faint">·</span>
        <span>{wordsMeta(c.words, c.target)}</span>
      </div>
    </div>
  );
}

/** A section's heading, with Rename / Move up / Move down / Remove behind ⋯. */
function SectionHead({
  name,
  count,
  index,
  total,
  pending,
}: {
  name: string;
  count: number;
  index: number;
  total: number;
  pending: boolean;
}) {
  const renameSection = useStore((s) => s.renameSection);
  const moveSection = useStore((s) => s.moveSection);
  const removeSection = useStore((s) => s.removeSection);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== name) renameSection(name, value);
    else setValue(name);
  };
  const item = "flex w-full flex-col gap-[2px] rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="mb-[12px] flex items-center gap-[10px]">
      {editing ? (
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(name);
              setEditing(false);
            }
          }}
          className="border-b border-therefore bg-transparent font-serif text-[15px] italic text-ink outline-none"
          aria-label="Section name"
        />
      ) : (
        <button onDoubleClick={() => setEditing(true)} className="font-serif text-[15px] italic text-soft" title="Double-click to rename">
          {name}
        </button>
      )}
      <span className="font-mono text-[10.5px] text-faint">
        {pending ? "add or drag a piece here to keep this section" : `${count} ${count === 1 ? "piece" : "pieces"}`}
      </span>
      <div className="flex-1" />
      <button
        ref={btn}
        onClick={() => setMenu((m) => !m)}
        className="rounded-md px-[8px] py-[1px] text-[15px] text-soft hover:bg-chip hover:text-ink"
        aria-label={`${name} menu`}
      >
        ⋯
      </button>
      <Popover anchorRef={btn} open={menu} onClose={() => setMenu(false)} align="right" width={250}>
        <div className="flex flex-col p-[6px]">
          <div className="px-[11px] pb-[4px] pt-[6px] text-[10.5px] font-semibold uppercase tracking-wider text-faint">{name}</div>
          <button
            className={item}
            onClick={() => {
              setMenu(false);
              setEditing(true);
            }}
          >
            Rename
          </button>
          {!pending && (
            <>
              <button className={item} disabled={index === 0} onClick={() => { setMenu(false); moveSection(name, -1); }}>
                Move section up
                <span className="text-[11px] font-normal text-soft">Its pieces move with it</span>
              </button>
              <button className={item} disabled={index === total - 1} onClick={() => { setMenu(false); moveSection(name, 1); }}>
                Move section down
              </button>
            </>
          )}
          <div className="mx-[6px] my-1 h-px bg-rule" />
          <button className={item} onClick={() => { setMenu(false); removeSection(name); }}>
            Remove section
            <span className="text-[11px] font-normal text-soft">
              {pending
                ? "It has no pieces."
                : `Only the heading goes. ${count === 1 ? "Its piece joins" : `Its ${count} pieces join`} ${index === 0 ? "the section below" : "the section above"}.`}
            </span>
          </button>
        </div>
      </Popover>
    </div>
  );
}

/**
 * Go to another section while reading a piece: a dropdown after the piece's ⋯
 * listing each section with its pieces. A section opens its first piece; a
 * piece opens itself. On the board every section is already in view, so this
 * lives only here. Drawn only when the anthology has sections.
 */
function SectionJump({ here }: { here: Chapter }) {
  const doc = useStore((s) => s.doc);
  const openChapter = useStore((s) => s.openChapter);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const bs = bands(doc.chapters);
  if (!bs.some((b) => b.section)) return null;
  const mine = here.section?.trim() ?? "";
  const go = (id: string) => {
    setOpen(false);
    if (id !== here.id) openChapter(id);
  };
  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-[5px] rounded-lg border border-rule bg-card px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
        title="Go to another section"
      >
        Sections <span className="text-[9px] text-faint">▾</span>
      </button>
      <Popover anchorRef={btn} open={open} onClose={() => setOpen(false)} align="right" width={280}>
        <div className="flex flex-col p-[6px]">
          {bs.map((b, i) => (
            <div key={`${b.section}:${i}`} className={i ? "mt-[4px] border-t border-rule pt-[4px]" : ""}>
              <button
                onClick={() => go(b.pieces[0].id)}
                className={`w-full truncate rounded-lg px-[11px] py-[6px] text-left text-[13px] hover:bg-chip ${
                  b.section ? "font-serif italic" : "text-[11px] font-semibold uppercase tracking-wider"
                } ${b.section === mine ? "text-ink" : "text-soft"}`}
              >
                {b.section || "No section"}
              </button>
              {b.pieces.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(c.id)}
                  className={`w-full truncate rounded-lg py-[4px] pl-[22px] pr-[11px] text-left text-[12px] hover:bg-chip ${
                    c.id === here.id ? "font-semibold text-ink" : "text-soft"
                  }`}
                >
                  {c.id === here.id ? "· " : ""}
                  {c.title || "Untitled piece"}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}

// ---- one piece, as a page --------------------------------------------------------

/**
 * A piece opened: the single-piece page (the chapter modal in page mode), with
 * a bar above it to get back to the board, step to the next piece, and reach
 * the piece's own menu.
 */
function AnthologyPiece() {
  const doc = useStore((s) => s.doc);
  const openCh = useStore((s) => s.openCh);
  const mode = useStore((s) => s.chapterMode);
  const openChapter = useStore((s) => s.openChapter);
  const ordered = inOrder(doc.chapters);
  const i = ordered.findIndex((c) => c.id === openCh);
  const ch = ordered[i];
  if (!ch) return null;
  const prev = ordered[i - 1];
  const next = ordered[i + 1];
  const navBtn =
    "max-w-[220px] truncate rounded-lg border border-rule bg-card px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint disabled:cursor-default disabled:opacity-40";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scene-bar flex shrink-0 flex-wrap items-center gap-[8px] border-b border-rule bg-panel px-[26px] py-[8px] text-[12px] text-soft">
        {ch.section && (
          <>
            <span className="italic">{ch.section}</span>
            <span className="text-faint">·</span>
          </>
        )}
        <span>
          Piece {i + 1} of {ordered.length}
        </span>
        <div className="flex-1" />
        <button className={navBtn} disabled={!prev} onClick={() => prev && openChapter(prev.id)} title={prev ? `Previous: ${prev.title}` : "No previous piece"}>
          ‹ {prev ? prev.title || "Untitled piece" : "Previous"}
        </button>
        <button className={navBtn} disabled={!next} onClick={() => next && openChapter(next.id)} title={next ? `Next: ${next.title}` : "No next piece"}>
          {next ? next.title || "Untitled piece" : "Next"} ›
        </button>
        <PieceMenu ch={ch} />
        <SectionJump here={ch} />
      </div>
      <ErrorBoundary resetKey={`${ch.id}:${mode}`} fallback={(error, retry) => <ChapterCrash error={error} retry={retry} />}>
        <ChapterModal page />
      </ErrorBoundary>
    </div>
  );
}

/** Move to section, Make its own project, Delete piece. */
function PieceMenu({ ch }: { ch: Chapter }) {
  const doc = useStore((s) => s.doc);
  const movePiece = useStore((s) => s.movePiece);
  const deleteChapter = useStore((s) => s.deleteChapter);
  const askConfirm = useStore((s) => s.askConfirm);
  const setTakeOutDialog = useStore((s) => s.setTakeOutDialog);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const sections = [...new Set(bands(doc.chapters).map((b) => b.section))];
  const here = ch.section?.trim() ?? "";
  const item = "flex w-full flex-col gap-[2px] rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip";
  const only = doc.chapters.length <= 1;
  return (
    <>
      <button ref={btn} onClick={() => setOpen((o) => !o)} className="rounded-lg border border-rule bg-card px-[10px] py-[3px] text-[15px] text-ink hover:border-faint" aria-label="Piece menu">
        ⋯
      </button>
      <Popover anchorRef={btn} open={open} onClose={() => setOpen(false)} align="right" width={270}>
        <div className="flex flex-col p-[6px]">
          <div className="truncate px-[11px] pb-[4px] pt-[6px] text-[10.5px] font-semibold uppercase tracking-wider text-faint">
            {ch.title || "Untitled piece"}
          </div>
          {sections.filter((s) => s !== here).length > 0 && (
            <>
              <div className="px-[11px] pt-[4px] text-[11px] text-soft">Move to section</div>
              {sections
                .filter((s) => s !== here)
                .map((s) => (
                  <button
                    key={s || "(none)"}
                    className={`${item} pl-[20px] font-medium`}
                    onClick={() => {
                      setOpen(false);
                      movePiece(ch.id, null, false, s);
                    }}
                  >
                    {s || "No section"}
                  </button>
                ))}
              <div className="mx-[6px] my-1 h-px bg-rule" />
            </>
          )}
          <button
            className={item}
            onClick={() => {
              setOpen(false);
              setTakeOutDialog(ch.id);
            }}
          >
            Make its own project…
            <span className="text-[11px] font-normal text-soft">Take this {kindInfo(pieceKind(doc, ch)).label.toLowerCase()} out as a single piece</span>
          </button>
          <div className="mx-[6px] my-1 h-px bg-rule" />
          <button
            className={`${item} text-but disabled:opacity-40`}
            disabled={only}
            title={only ? "An anthology keeps at least one piece" : undefined}
            onClick={() => {
              setOpen(false);
              askConfirm({
                message: `Delete "${ch.title || "Untitled piece"}"?`,
                detail: "The piece and its writing are removed from this version of the anthology.",
                confirmLabel: "Delete piece",
                danger: true,
                onConfirm: () => deleteChapter(ch.id),
              });
            }}
          >
            Delete piece
          </button>
        </div>
      </Popover>
    </>
  );
}
