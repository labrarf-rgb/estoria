import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { SCENE_W, SCENE_H, sceneColumnsForWidth, sceneAutoArrange, sceneSlotFromPoint } from "@/lib/layout";
import { resolveSummary, resolveTitle } from "@/lib/drafts";
import { MAIN_DRAFT_ID, type ChapterStatus, type ConnType, type Vec2 } from "@/types";

const CONN: Record<ConnType, { label: string; color: string }> = {
  therefore: { label: "Therefore", color: "var(--therefore)" },
  but: { label: "But", color: "var(--but)" },
  and: { label: "And", color: "var(--and)" },
};

const STATUSES: { value: ChapterStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "done", label: "Done" },
];

export function ChapterDetail() {
  const openCh = useStore((s) => s.openCh);
  const doc = useStore((s) => s.doc);
  const closeChapter = useStore((s) => s.closeChapter);
  const bumpAct = useStore((s) => s.bumpChapterAct);
  const setAct = useStore((s) => s.setChapterAct);
  const patchChapter = useStore((s) => s.patchChapter);
  const editChapterText = useStore((s) => s.editChapterText);
  const toggleChapterChar = useStore((s) => s.toggleChapterChar);
  const toggleChapterWorld = useStore((s) => s.toggleChapterWorld);
  const deleteChapter = useStore((s) => s.deleteChapter);
  const addScene = useStore((s) => s.addScene);
  const insertScene = useStore((s) => s.insertScene);
  const updateScene = useStore((s) => s.updateScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const reorderScene = useStore((s) => s.reorderScene);
  const cycleSceneLink = useStore((s) => s.cycleSceneLink);
  const arrangeScenes = useStore((s) => s.arrangeScenes);
  const addChapterRef = useStore((s) => s.addChapterRef);
  const updateChapterRef = useStore((s) => s.updateChapterRef);
  const deleteChapterRef = useStore((s) => s.deleteChapterRef);
  const linkAssetToChapter = useStore((s) => s.linkAssetToChapter);
  const addCharacter = useStore((s) => s.addCharacter);
  const addWorldEntry = useStore((s) => s.addWorldEntry);
  const askConfirm = useStore((s) => s.askConfirm);
  const collapsed = useStore((s) => s.chapterSectionsCollapsed);
  const toggleSection = useStore((s) => s.toggleChapterSection);
  const refView = useStore((s) => s.refView);
  const setRefView = useStore((s) => s.setRefView);
  const expanded = useStore((s) => s.sceneFlowExpanded);
  const setSceneFlowExpanded = useStore((s) => s.setSceneFlowExpanded);
  const notesExpanded = useStore((s) => s.textareaExpanded.chapterNotes);
  const toggleTextarea = useStore((s) => s.toggleTextarea);

  const ch = doc.chapters.find((c) => c.id === openCh);
  const chIdRef = useRef<string | null>(null);
  chIdRef.current = ch?.id ?? null;

  const [linkOpen, setLinkOpen] = useState(false);
  const [charAdd, setCharAdd] = useState(false);
  const [worldAdd, setWorldAdd] = useState(false);
  const sceneBoxRef = useRef<HTMLDivElement>(null);

  // Scene drag-to-reorder: either an existing card ("move") or the ghost from
  // a long-pressed Add-scene button ("new"). Coordinates are canvas-local
  // (relative to sceneBoxRef's content, including its scroll offset) so they
  // line up directly with scenePos / sceneAutoArrange output.
  type SceneDrag =
    | {
        kind: "move";
        fromIdx: number;
        overIdx: number;
        cx: number;
        cy: number;
        clientY: number;
        offX: number;
        offY: number;
      }
    | { kind: "new"; overIdx: number; cx: number; cy: number; clientY: number };
  const [drag, setDrag] = useState<SceneDrag | null>(null);
  const dragRef = useRef<SceneDrag | null>(null);
  dragRef.current = drag;
  const addScenePressRef = useRef(false);

  const canvasPoint = (clientX: number, clientY: number) => {
    const box = sceneBoxRef.current;
    if (!box) return { x: 0, y: 0 };
    const rect = box.getBoundingClientRect();
    return { x: clientX - rect.left + box.scrollLeft, y: clientY - rect.top + box.scrollTop };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      const chId = chIdRef.current;
      const box = sceneBoxRef.current;
      if (!d || !chId || !box) return;
      const c = useStore.getState().doc.chapters.find((x) => x.id === chId);
      if (!c) return;
      const pt = canvasPoint(e.clientX, e.clientY);
      // Total slots rendered in the preview grid (including the gap) — must
      // match the `others.length + 1` used by the render logic below, or the
      // column count (and therefore the detected slot) desyncs from what's
      // actually on screen.
      const total = d.kind === "move" ? c.scenes.length : c.scenes.length + 1;
      const cols = sceneColumnsForWidth(total, box.clientWidth);
      const overIdx = Math.max(0, Math.min(sceneSlotFromPoint(pt.x, pt.y, cols), total - 1));
      setDrag({ ...d, cx: pt.x, cy: pt.y, clientY: e.clientY, overIdx });
    };
    const onUp = () => {
      const d = dragRef.current;
      const chId = chIdRef.current;
      const box = sceneBoxRef.current;
      if (d && chId) {
        const c = useStore.getState().doc.chapters.find((x) => x.id === chId);
        if (c) {
          const total = d.kind === "move" ? c.scenes.length : c.scenes.length + 1;
          const cols = sceneColumnsForWidth(total, box?.clientWidth ?? 0);
          if (d.kind === "move") reorderScene(chId, d.fromIdx, d.overIdx, cols);
          else insertScene(chId, d.overIdx, cols);
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [reorderScene, insertScene]);

  // Auto-scroll the scene canvas while dragging near its top/bottom edge, so
  // reordering works on boards with more scenes than fit on screen.
  useEffect(() => {
    if (!drag) return;
    const EDGE = 56;
    const MAX_SPEED = 16;
    let raf = 0;
    const tick = () => {
      const box = sceneBoxRef.current;
      const d = dragRef.current;
      if (box && d) {
        const rect = box.getBoundingClientRect();
        const y = d.clientY;
        if (y < rect.top + EDGE && box.scrollTop > 0) {
          box.scrollTop = Math.max(0, box.scrollTop - (MAX_SPEED * (rect.top + EDGE - y)) / EDGE);
        } else if (y > rect.bottom - EDGE) {
          box.scrollTop = Math.min(
            box.scrollHeight - box.clientHeight,
            box.scrollTop + (MAX_SPEED * (y - (rect.bottom - EDGE))) / EDGE
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // Reflow scenes to the new column count when the user toggles expand/collapse:
  // the visible width changes (~5 wide expanded, ~3 collapsed), so a fixed layout
  // would overflow or leave the canvas sparse. Only fires on an actual toggle, so
  // it never clobbers manual drags on open or when switching chapters.
  const prevExpanded = useRef<boolean | null>(null);
  useEffect(() => {
    const id = chIdRef.current;
    if (id && prevExpanded.current !== null && prevExpanded.current !== expanded) {
      const w = sceneBoxRef.current?.clientWidth ?? 0;
      const n = doc.chapters.find((c) => c.id === id)?.scenes.length ?? 0;
      arrangeScenes(id, false, sceneColumnsForWidth(n, w));
    }
    prevExpanded.current = expanded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (!ch) return null;

  const draftId = doc.activeDraftId;
  const draftName = doc.drafts.find((d) => d.id === draftId)?.name ?? "Main draft";
  const positions = ch.scenePos ?? [];
  const boxW = sceneBoxRef.current?.clientWidth ?? 0;

  // While dragging, build a preview layout: the moved (or not-yet-created)
  // scene occupies a "gap" slot that follows the pointer, and every other
  // card previews the grid position it will land in on release.
  let cardSlots: { idx: number; pos: Vec2; num: number }[] = ch.scenes.map((_, i) => ({
    idx: i,
    pos: positions[i] ?? { x: 0, y: 0 },
    num: i + 1,
  }));
  let gapPos: Vec2 | null = null;
  let ghostPos: Vec2 | null = null;
  let ghostText: string | null = null;
  let ghostNum = 1;

  if (drag) {
    const others =
      drag.kind === "move"
        ? ch.scenes.map((_, i) => i).filter((i) => i !== drag.fromIdx)
        : ch.scenes.map((_, i) => i);
    const at = Math.max(0, Math.min(drag.overIdx, others.length));
    const previewCols = sceneColumnsForWidth(others.length + 1, boxW);
    const previewPos = sceneAutoArrange(new Array(others.length + 1).fill(""), 0, previewCols);
    cardSlots = others.map((origIdx, i) => ({
      idx: origIdx,
      pos: previewPos[i < at ? i : i + 1],
      num: i < at ? i + 1 : i + 2,
    }));
    gapPos = previewPos[at];
    ghostNum = at + 1;
    ghostText = drag.kind === "move" ? ch.scenes[drag.fromIdx] : "New scene.";
    ghostPos =
      drag.kind === "move"
        ? { x: drag.cx - drag.offX, y: drag.cy - drag.offY }
        : { x: drag.cx - SCENE_W / 2, y: drag.cy - SCENE_H / 2 };
  }

  const extent = [...cardSlots.map((s) => s.pos), ...(gapPos ? [gapPos] : []), ...(ghostPos ? [ghostPos] : [])];
  const canvasW = Math.max(640, ...extent.map((p) => p.x + SCENE_W)) + 24;
  const canvasH = Math.max(260, ...extent.map((p) => p.y + SCENE_H)) + 24;

  // Auto-arrange scenes to fill the *visible* canvas (collapsed vs expanded use
  // different widths, so each mode arranges into a different column count).
  const onArrangeScenes = () => {
    arrangeScenes(ch.id, false, sceneColumnsForWidth(ch.scenes.length, boxW));
  };

  const onSceneDown = (e: React.MouseEvent, idx: number) => {
    const target = e.target as HTMLElement;
    if (target.closest("textarea") || target.closest("button")) return;
    e.preventDefault();
    const p = positions[idx] ?? { x: 0, y: 0 };
    const pt = canvasPoint(e.clientX, e.clientY);
    setDrag({
      kind: "move",
      fromIdx: idx,
      overIdx: idx,
      cx: pt.x,
      cy: pt.y,
      clientY: e.clientY,
      offX: pt.x - p.x,
      offY: pt.y - p.y,
    });
  };

  // Long-press the Add-scene button to get a draggable ghost card that can be
  // dropped anywhere in the grid; a plain click still appends to the end.
  const onAddSceneDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    addScenePressRef.current = false;
    const startClientY = e.clientY;
    const timer = window.setTimeout(() => {
      addScenePressRef.current = true;
      const box = sceneBoxRef.current;
      const cx = box ? box.scrollLeft + box.clientWidth / 2 : 0;
      const cy = box ? box.scrollTop + box.clientHeight / 2 : 0;
      const cols = sceneColumnsForWidth(ch.scenes.length + 1, box?.clientWidth ?? 0);
      const overIdx = Math.max(0, Math.min(sceneSlotFromPoint(cx, cy, cols), ch.scenes.length));
      setDrag({ kind: "new", cx, cy, clientY: startClientY, overIdx });
    }, 220);
    const cancel = () => window.clearTimeout(timer);
    window.addEventListener("mouseup", cancel, { once: true });
  };

  const onAddSceneClick = () => {
    if (addScenePressRef.current) {
      addScenePressRef.current = false;
      return;
    }
    addScene(ch.id, sceneColumnsForWidth(ch.scenes.length + 1, boxW));
  };

  const sceneCenter = (idx: number) => {
    const p = positions[idx] ?? { x: 0, y: 0 };
    return { x: p.x + SCENE_W / 2, y: p.y + SCENE_H / 2 };
  };

  return (
    <Scrim onClose={closeChapter} z={50} center>
      <div
        onMouseDown={stop}
        className={`max-h-[92vh] overflow-auto rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)] ${
          expanded ? "w-[min(1500px,96vw)]" : "w-[min(980px,100%)]"
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-[2] flex items-start gap-[14px] border-b border-rule bg-panel px-[26px] py-[22px]">
          <span className="mt-[6px] rounded-[7px] bg-ink px-[9px] py-[4px] font-mono text-[13px] font-semibold text-bg">
            {String(ch.num).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={resolveTitle(ch, draftId)}
              onChange={(e) => editChapterText(ch.id, { title: e.target.value })}
              placeholder="Chapter title"
              className="w-full bg-transparent font-serif text-[24px] font-semibold leading-tight text-ink outline-none placeholder:text-faint"
            />
            <textarea
              value={resolveSummary(ch, draftId)}
              onChange={(e) => editChapterText(ch.id, { summary: e.target.value })}
              placeholder="One-line chapter summary..."
              rows={1}
              className="mt-[5px] w-full resize-none bg-transparent text-[14px] leading-[1.5] text-soft outline-none placeholder:text-faint"
            />
            {draftId !== MAIN_DRAFT_ID && (
              <div className="mt-[4px] text-[10.5px] font-semibold uppercase tracking-wide text-but">
                Editing {draftName} · title &amp; summary differ from main
              </div>
            )}

            <div className="mt-[11px] flex flex-wrap items-center gap-[10px]">
              <label className="flex items-center gap-[5px] rounded-lg bg-chip px-[8px] py-[3px]">
                <input
                  type="number"
                  min={0}
                  value={ch.words}
                  onChange={(e) => patchChapter(ch.id, { words: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-[56px] bg-transparent text-right font-mono text-[12px] font-medium text-ink outline-none [appearance:textfield]"
                  title="Words in this chapter"
                />
                <span className="font-mono text-[11px] font-medium text-soft">words</span>
              </label>
              <span className="font-mono text-[11.5px] font-medium text-faint">
                · {ch.scenes.length} scenes
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

              <div className="flex-1" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Act
              </span>
              <div className="flex items-center rounded-lg bg-chip p-[3px]">
                <button
                  onClick={() => bumpAct(ch.id, -1)}
                  className="h-[24px] w-[24px] rounded-md text-[15px] font-semibold text-ink hover:bg-card"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={ch.act}
                  onChange={(e) => setAct(ch.id, parseInt(e.target.value, 10))}
                  className="h-[24px] w-[38px] bg-transparent text-center font-mono text-[13px] font-semibold text-ink [appearance:textfield]"
                />
                <button
                  onClick={() => bumpAct(ch.id, 1)}
                  className="h-[24px] w-[24px] rounded-md text-[15px] font-semibold text-ink hover:bg-card"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <CloseButton onClick={closeChapter} />
        </div>

        {/* Characters */}
        {(() => {
          const members = doc.characters.filter((c) => ch.chars.includes(c.id));
          const available = doc.characters.filter((c) => !ch.chars.includes(c.id));
          return (
            <div className="border-b border-rule px-[26px] py-[14px]">
              <SectionHeader
                label="Characters"
                count={members.length ? `${members.length}` : undefined}
                collapsed={collapsed.chars}
                onToggle={() => toggleSection("chars")}
              />
              {collapsed.chars ? null : (
              <>
              <div className="flex flex-wrap items-center gap-[7px]">
                {members.map((c) => (
                  <span
                    key={c.id}
                    className="flex items-center gap-[7px] rounded-full border border-transparent py-[5px] pl-[8px] pr-[6px] text-[12px] font-medium text-white"
                    style={{ background: c.color }}
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/25 text-[8.5px] font-semibold">
                      {c.initials}
                    </span>
                    {c.name}
                    <button
                      onClick={() => toggleChapterChar(ch.id, c.id)}
                      className="ml-[1px] flex h-[16px] w-[16px] items-center justify-center rounded-full text-[10px] hover:bg-black/25"
                      title={`Remove ${c.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {members.length === 0 && (
                  <span className="text-[12px] text-faint">No characters in this chapter yet.</span>
                )}
                <button
                  onClick={() => setCharAdd((v) => !v)}
                  className="rounded-full border border-dashed border-line px-[11px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                >
                  + Add character
                </button>
              </div>
              {charAdd && (
                <div className="mt-[10px] flex flex-wrap gap-[7px] rounded-xl border border-rule bg-card p-[10px]">
                  {available.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleChapterChar(ch.id, c.id)}
                      className="flex items-center gap-[6px] rounded-full border border-rule bg-panel px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
                    >
                      <span
                        className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[8px] font-semibold text-white"
                        style={{ background: c.color }}
                      >
                        {c.initials}
                      </span>
                      {c.name}
                    </button>
                  ))}
                  {available.length === 0 && (
                    <span className="text-[12px] text-faint">Everyone is already in this chapter.</span>
                  )}
                  <button
                    onClick={() => addCharacter()}
                    className="rounded-full border border-dashed border-line px-[10px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                  >
                    + Create new character
                  </button>
                </div>
              )}
              </>
              )}
            </div>
          );
        })()}

        {/* World details */}
        {(() => {
          const refs = ch.worldRefs ?? [];
          const members = doc.world.filter((w) => refs.includes(w.id));
          const available = doc.world.filter((w) => !refs.includes(w.id));
          return (
            <div className="border-b border-rule px-[26px] py-[14px]">
              <SectionHeader
                label="World details"
                count={members.length ? `${members.length}` : undefined}
                collapsed={collapsed.world}
                onToggle={() => toggleSection("world")}
              />
              {collapsed.world ? null : (
              <>
              <div className="flex flex-wrap items-center gap-[7px]">
                {members.map((w) => (
                  <span
                    key={w.id}
                    className="flex items-center gap-[6px] rounded-full border border-transparent bg-ink py-[5px] pl-[10px] pr-[6px] text-[12px] font-medium text-bg"
                  >
                    {w.name}
                    <span className="text-[9px] uppercase opacity-70">{w.cat}</span>
                    <button
                      onClick={() => toggleChapterWorld(ch.id, w.id)}
                      className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[10px] hover:bg-white/20"
                      title={`Remove ${w.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {members.length === 0 && (
                  <span className="text-[12px] text-faint">No world details in this chapter yet.</span>
                )}
                <button
                  onClick={() => setWorldAdd((v) => !v)}
                  className="rounded-full border border-dashed border-line px-[11px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                >
                  + Add world detail
                </button>
              </div>
              {worldAdd && (
                <div className="mt-[10px] flex flex-wrap gap-[7px] rounded-xl border border-rule bg-card p-[10px]">
                  {available.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => toggleChapterWorld(ch.id, w.id)}
                      className="flex items-center gap-[6px] rounded-full border border-rule bg-panel px-[10px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
                    >
                      <span className="h-[7px] w-[7px] rounded-full bg-soft" />
                      {w.name}
                      <span className="text-[9px] uppercase text-faint">{w.cat}</span>
                    </button>
                  ))}
                  {available.length === 0 && (
                    <span className="text-[12px] text-faint">Every world entry is already added.</span>
                  )}
                  <button
                    onClick={() => addWorldEntry()}
                    className="rounded-full border border-dashed border-line px-[10px] py-[5px] text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
                  >
                    + Create new entry
                  </button>
                </div>
              )}
              </>
              )}
            </div>
          );
        })()}

        {/* Scene flow toolbar */}
        <div className="flex items-center gap-[9px] px-[26px] pb-[12px] pt-[16px]">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-soft">
            Scene flow
          </span>
          <div className="ml-auto flex items-center gap-[9px]">
            <button
              onClick={() => setSceneFlowExpanded(!expanded)}
              className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
              title={expanded ? "Shrink the scene area" : "Expand the scene area"}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <button
              onClick={onArrangeScenes}
              className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Auto-arrange
            </button>
            <button
              onMouseDown={onAddSceneDown}
              onClick={onAddSceneClick}
              title="Click to append · press and hold to drag it into place"
              className="rounded-lg bg-ink px-3 py-[6px] text-[12px] font-semibold text-bg"
            >
              + Add scene
            </button>
          </div>
        </div>

        {/* Scene canvas. `isolate` keeps the absolutely-positioned scene cards
            (z-5/z-10) contained so they can't paint over the sticky header when
            the modal scrolls. */}
        <div
          ref={sceneBoxRef}
          className={`mx-[22px] isolate overflow-auto rounded-xl border border-rule bg-bg ${
            expanded ? "max-h-[78vh]" : "max-h-[40vh]"
          }`}
          style={{
            backgroundImage: "radial-gradient(var(--rule) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="relative" style={{ width: canvasW, height: canvasH }}>
            {!drag && (
              <svg
                width={canvasW}
                height={canvasH}
                className="pointer-events-none absolute left-0 top-0 overflow-visible"
              >
                {ch.scenes.slice(0, -1).map((_, i) => {
                  const a = sceneCenter(i);
                  const b = sceneCenter(i + 1);
                  return (
                    <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line)" strokeWidth={1.75} />
                  );
                })}
              </svg>
            )}

            {!drag &&
              ch.scenes.slice(0, -1).map((_, i) => {
                const a = sceneCenter(i);
                const b = sceneCenter(i + 1);
                const type = ch.sceneLinks[i] ?? "therefore";
                return (
                  <button
                    key={i}
                    onClick={() => cycleSceneLink(ch.id, i)}
                    className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-bg px-[10px] py-[2px] text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      left: (a.x + b.x) / 2,
                      top: (a.y + b.y) / 2,
                      color: CONN[type].color,
                      borderColor: CONN[type].color,
                    }}
                    title="Click to cycle Therefore / But / And"
                  >
                    {CONN[type].label}
                  </button>
                );
              })}

            {gapPos && (
              <div
                className="pointer-events-none absolute z-0 rounded-[11px] border-2 border-dashed border-faint/60 bg-faint/5"
                style={{ left: gapPos.x, top: gapPos.y, width: SCENE_W, minHeight: SCENE_H }}
              />
            )}

            {cardSlots.map((slot) => {
              const i = slot.idx;
              const s = ch.scenes[i];
              return (
                <div
                  key={i}
                  onMouseDown={(e) => onSceneDown(e, i)}
                  className="group absolute z-[5] cursor-grab transition-[left,top] duration-150 ease-out active:cursor-grabbing"
                  style={{ left: slot.pos.x, top: slot.pos.y, width: SCENE_W, minHeight: SCENE_H }}
                >
                  <div className="flex h-full flex-col gap-[7px] rounded-[11px] border border-rule bg-card p-[12px_13px] shadow-[var(--shadow)] hover:border-faint">
                    <div className="flex items-center">
                      <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
                        SCENE {slot.num}
                      </span>
                      <div className="flex-1" />
                      {ch.scenes.length > 1 && (
                        <button
                          onClick={() =>
                            askConfirm({
                              message: `Delete scene ${slot.num}?`,
                              danger: true,
                              onConfirm: () => deleteScene(ch.id, i),
                            })
                          }
                          className="text-[12px] leading-none text-faint opacity-0 transition-opacity hover:text-but group-hover:opacity-100"
                          title="Delete scene"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <textarea
                      value={s}
                      onChange={(e) => updateScene(ch.id, i, e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      rows={3}
                      className="w-full flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-ink outline-none"
                    />
                  </div>
                </div>
              );
            })}

            {ghostPos && (
              <div
                className="pointer-events-none absolute z-20 rotate-1 scale-[1.03] cursor-grabbing opacity-90"
                style={{ left: ghostPos.x, top: ghostPos.y, width: SCENE_W, minHeight: SCENE_H }}
              >
                <div className="flex h-full flex-col gap-[7px] rounded-[11px] border border-faint bg-card p-[12px_13px] shadow-[0_18px_38px_rgba(0,0,0,0.35)]">
                  <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
                    SCENE {ghostNum}
                  </span>
                  <div className="line-clamp-4 flex-1 text-[13px] leading-[1.5] text-ink">{ghostText}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-[26px] pt-[8px] text-[11px] font-medium text-faint">
          Drag scenes to reorder · press and hold Add scene to drop it in place · click a connector to toggle Therefore / But / And
        </div>

        {/* Chapter notes */}
        <div className="px-[26px] pt-[18px]">
          <SectionHeader
            label="Chapter notes"
            count={ch.notes?.trim() ? "written" : undefined}
            collapsed={collapsed.notes}
            onToggle={() => toggleSection("notes")}
          />
          {!collapsed.notes && (
            <ExpandableTextarea
              value={ch.notes ?? ""}
              onChange={(v) => patchChapter(ch.id, { notes: v })}
              placeholder="Reminders, revision ideas, continuity flags for this chapter..."
              collapsedRows={3}
              expandedHeight="52vh"
              expanded={notesExpanded}
              onToggleExpanded={() => toggleTextarea("chapterNotes")}
              className="rounded-xl border border-rule bg-card p-[12px] pr-[80px] text-[13px] leading-[1.55] text-ink outline-none"
            />
          )}
        </div>

        {/* Pinned refs */}
        <div className="px-[26px] py-[18px]">
          <div className={collapsed.refs ? "" : "mb-[13px]"}>
            <SectionHeader
              label="Pinned references"
              count={ch.refs.length ? `${ch.refs.length}` : undefined}
              collapsed={collapsed.refs}
              onToggle={() => toggleSection("refs")}
              right={collapsed.refs ? undefined : <ViewToggle view={refView} onChange={setRefView} />}
            />
          </div>
          {!collapsed.refs && (
          <>
          <RefList
            refs={ch.refs}
            onAdd={(kind) => addChapterRef(ch.id, kind)}
            onUpdate={(refId, patch) => updateChapterRef(ch.id, refId, patch)}
            onDelete={(refId) => deleteChapterRef(ch.id, refId)}
            onLink={() => setLinkOpen((v) => !v)}
            linkLabel="Link book asset"
            view={refView}
          />
          {linkOpen && (
            <div className="mt-3 rounded-xl border border-rule bg-card p-3">
              <div className="mb-[8px] text-[10px] font-semibold uppercase tracking-wide text-faint">
                Link from the shared library
              </div>
              {doc.assets.length === 0 ? (
                <div className="text-[12px] text-faint">
                  No book assets yet. Add notes or images in the Notes panel&apos;s shared library.
                </div>
              ) : (
                <div className="flex flex-wrap gap-[7px]">
                  {doc.assets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        linkAssetToChapter(ch.id, a.id);
                        setLinkOpen(false);
                      }}
                      className="rounded-lg border border-rule bg-panel px-[10px] py-[6px] text-[12px] font-medium text-ink hover:border-faint"
                    >
                      {a.kind === "IMAGE" ? "🖼 " : "📝 "}
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </div>

        {/* Danger zone */}
        <div className="flex items-center justify-end border-t border-rule px-[26px] py-[14px]">
          <button
            onClick={() =>
              askConfirm({
                message: `Delete "${ch.title}"?`,
                detail: "The chapter and its scenes will be permanently removed.",
                danger: true,
                onConfirm: () => deleteChapter(ch.id),
              })
            }
            className="rounded-lg border border-rule px-[12px] py-[7px] text-[12px] font-medium text-soft hover:border-faint hover:text-but"
          >
            Delete chapter
          </button>
        </div>
      </div>
    </Scrim>
  );
}

/** Collapsible section label for the chapter modal. Clicking the label (or its
 *  chevron) hides the section body while keeping this row visible. `right` holds
 *  optional controls (e.g. the refs view toggle) shown only when expanded. */
function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
  right,
}: {
  label: string;
  count?: string;
  collapsed: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-[12px]">
      <button
        onClick={onToggle}
        className="flex items-center gap-[8px] text-[11px] font-semibold uppercase tracking-widest text-soft hover:text-ink"
        title={collapsed ? "Expand section" : "Collapse section"}
      >
        <span className="text-[9px] font-medium text-faint">{collapsed ? "▸" : "▾"}</span>
        {label}
        {count && (
          <span className="font-medium normal-case tracking-normal text-faint">· {count}</span>
        )}
      </button>
      <div className="flex-1" />
      {right}
    </div>
  );
}
