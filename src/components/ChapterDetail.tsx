import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { SCENE_W, SCENE_H } from "@/lib/layout";
import type { ChapterStatus, ConnType } from "@/types";

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
  const addScene = useStore((s) => s.addScene);
  const updateScene = useStore((s) => s.updateScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const moveScene = useStore((s) => s.moveScene);
  const cycleSceneLink = useStore((s) => s.cycleSceneLink);
  const arrangeScenes = useStore((s) => s.arrangeScenes);
  const addChapterRef = useStore((s) => s.addChapterRef);

  const ch = doc.chapters.find((c) => c.id === openCh);
  const chIdRef = useRef<string | null>(null);
  chIdRef.current = ch?.id ?? null;

  // Scene-node drag, via window listeners (canvas isn't zoomed → 1:1 deltas).
  const sdrag = useRef<{ idx: number; mx: number; my: number; ox: number; oy: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = sdrag.current;
      if (!d || !chIdRef.current) return;
      const nx = Math.max(0, d.ox + (e.clientX - d.mx));
      const ny = Math.max(0, d.oy + (e.clientY - d.my));
      moveScene(chIdRef.current, d.idx, nx, ny);
    };
    const onUp = () => {
      sdrag.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [moveScene]);

  if (!ch) return null;

  const chars = ch.chars.map((id) => doc.characters.find((c) => c.id === id)).filter(Boolean);
  const positions = ch.scenePos ?? [];
  const canvasW = Math.max(640, ...positions.map((p) => p.x + SCENE_W)) + 24;
  const canvasH = Math.max(260, ...positions.map((p) => p.y + SCENE_H)) + 24;

  const onSceneDown = (e: React.MouseEvent, idx: number) => {
    const target = e.target as HTMLElement;
    if (target.closest("textarea") || target.closest("button")) return;
    e.preventDefault();
    const p = positions[idx] ?? { x: 0, y: 0 };
    sdrag.current = { idx, mx: e.clientX, my: e.clientY, ox: p.x, oy: p.y };
  };

  const sceneCenter = (idx: number) => {
    const p = positions[idx] ?? { x: 0, y: 0 };
    return { x: p.x + SCENE_W / 2, y: p.y + SCENE_H / 2 };
  };

  return (
    <Scrim onClose={closeChapter} z={50} center>
      <div
        onMouseDown={stop}
        className="max-h-[88vh] w-[min(980px,100%)] overflow-auto rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-[2] flex items-start gap-[14px] border-b border-rule bg-panel px-[26px] py-[22px]">
          <span className="mt-[6px] rounded-[7px] bg-ink px-[9px] py-[4px] font-mono text-[13px] font-semibold text-bg">
            {String(ch.num).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={ch.title}
              onChange={(e) => patchChapter(ch.id, { title: e.target.value })}
              placeholder="Chapter title"
              className="w-full bg-transparent font-serif text-[24px] font-semibold leading-tight text-ink outline-none placeholder:text-faint"
            />
            <textarea
              value={ch.summary ?? ""}
              onChange={(e) => patchChapter(ch.id, { summary: e.target.value })}
              placeholder="One-line chapter summary…"
              rows={1}
              className="mt-[5px] w-full resize-none bg-transparent text-[14px] leading-[1.5] text-soft outline-none placeholder:text-faint"
            />
            <div className="mt-[11px] flex flex-wrap items-center gap-[10px]">
              <div className="flex gap-1">
                {chars.map((c) => (
                  <span
                    key={c!.id}
                    className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
                    style={{ background: c!.color }}
                  >
                    {c!.initials}
                  </span>
                ))}
              </div>
              <span className="font-mono text-[11.5px] font-medium text-soft">
                {ch.words.toLocaleString()} words
              </span>
              <span className="font-mono text-[11.5px] font-medium text-faint">
                · {ch.scenes.length} scenes
              </span>

              {/* Status picker */}
              <div className="flex shrink-0 rounded-lg bg-chip p-[3px]">
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
              <div className="flex shrink-0 items-center rounded-lg bg-chip p-[3px]">
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

        {/* Scene flow toolbar */}
        <div className="flex items-center gap-[9px] px-[26px] pb-[12px] pt-[16px]">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-soft">
            Scene flow
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-[9px]">
            <button
              onClick={() => arrangeScenes(ch.id, false)}
              className="whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Auto-arrange
            </button>
            <button
              onClick={() => addScene(ch.id)}
              className="whitespace-nowrap rounded-lg bg-ink px-3 py-[6px] text-[12px] font-semibold text-bg"
            >
              + Add scene
            </button>
          </div>
        </div>

        {/* Scene canvas */}
        <div
          className="mx-[22px] max-h-[44vh] overflow-auto rounded-xl border border-rule bg-bg"
          style={{
            backgroundImage: "radial-gradient(var(--rule) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="relative" style={{ width: canvasW, height: canvasH }}>
            <svg
              width={canvasW}
              height={canvasH}
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
            >
              {ch.scenes.slice(0, -1).map((_, i) => {
                const a = sceneCenter(i);
                const b = sceneCenter(i + 1);
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--line)"
                    strokeWidth={1.75}
                  />
                );
              })}
            </svg>

            {/* Connector pills (clickable to cycle therefore/but/and) */}
            {ch.scenes.slice(0, -1).map((_, i) => {
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

            {/* Scene nodes */}
            {ch.scenes.map((s, i) => {
              const p = positions[i] ?? { x: 0, y: 0 };
              return (
                <div
                  key={i}
                  onMouseDown={(e) => onSceneDown(e, i)}
                  className="group absolute z-[5] cursor-grab active:cursor-grabbing"
                  style={{ left: p.x, top: p.y, width: SCENE_W, minHeight: SCENE_H }}
                >
                  <div className="flex h-full flex-col gap-[7px] rounded-[11px] border border-rule bg-card p-[12px_13px] shadow-[var(--shadow)] hover:border-faint">
                    <div className="flex items-center">
                      <span className="font-mono text-[10px] font-semibold tracking-wide text-faint">
                        SCENE {i + 1}
                      </span>
                      <div className="flex-1" />
                      {ch.scenes.length > 1 && (
                        <button
                          onClick={() => deleteScene(ch.id, i)}
                          className="opacity-0 transition-opacity hover:text-but group-hover:opacity-100 text-faint text-[12px] leading-none"
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
          </div>
        </div>
        <div className="px-[26px] pt-[8px] text-[11px] font-medium text-faint">
          Drag scenes to rearrange · click a connector to toggle Therefore / But / And
        </div>

        {/* Pinned refs */}
        <div className="px-[26px] py-[18px]">
          <div className="mb-[13px] text-[11px] font-semibold uppercase tracking-widest text-soft">
            Pinned references
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            {ch.refs.map((r, i) => (
              <div
                key={i}
                className="flex min-h-[92px] w-[150px] flex-col gap-[6px] rounded-[11px] border border-rule bg-card p-[11px] shadow-[var(--shadow)]"
              >
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wide opacity-75">
                  {r.kind}
                </span>
                <span className="text-[12.5px] font-medium leading-[1.4] text-ink">{r.label}</span>
              </div>
            ))}
            <button
              onClick={() => addChapterRef(ch.id, "NOTE")}
              className="min-h-[92px] w-[72px] rounded-[11px] border-[1.5px] border-dashed border-line text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
            >
              + Note
            </button>
            <button
              onClick={() => addChapterRef(ch.id, "IMAGE")}
              className="min-h-[92px] w-[72px] rounded-[11px] border-[1.5px] border-dashed border-line text-[11.5px] font-semibold text-faint hover:border-faint hover:text-ink"
            >
              + Image
            </button>
          </div>
        </div>
      </div>
    </Scrim>
  );
}
