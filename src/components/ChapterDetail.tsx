import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { RefList } from "@/components/ui/RefList";
import { SCENE_W, SCENE_H } from "@/lib/layout";
import { resolveSummary, resolveTitle } from "@/lib/drafts";
import { MAIN_DRAFT_ID, type ChapterStatus, type ConnType } from "@/types";

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
  const updateScene = useStore((s) => s.updateScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const moveScene = useStore((s) => s.moveScene);
  const cycleSceneLink = useStore((s) => s.cycleSceneLink);
  const arrangeScenes = useStore((s) => s.arrangeScenes);
  const addChapterRef = useStore((s) => s.addChapterRef);
  const updateChapterRef = useStore((s) => s.updateChapterRef);
  const deleteChapterRef = useStore((s) => s.deleteChapterRef);
  const linkAssetToChapter = useStore((s) => s.linkAssetToChapter);
  const addCharacter = useStore((s) => s.addCharacter);
  const addWorldEntry = useStore((s) => s.addWorldEntry);
  const askConfirm = useStore((s) => s.askConfirm);

  const ch = doc.chapters.find((c) => c.id === openCh);
  const chIdRef = useRef<string | null>(null);
  chIdRef.current = ch?.id ?? null;

  const [linkOpen, setLinkOpen] = useState(false);
  const [charAdd, setCharAdd] = useState(false);
  const [worldAdd, setWorldAdd] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Scene-node drag, via window listeners (canvas isn't zoomed -> 1:1 deltas).
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

  const draftId = doc.activeDraftId;
  const draftName = doc.drafts.find((d) => d.id === draftId)?.name ?? "Main draft";
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
              <div className="mb-[8px] text-[11px] font-semibold uppercase tracking-widest text-soft">
                Characters
              </div>
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
              <div className="mb-[8px] text-[11px] font-semibold uppercase tracking-widest text-soft">
                World details
              </div>
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
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
              title={expanded ? "Shrink the scene area" : "Expand the scene area"}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <button
              onClick={() => arrangeScenes(ch.id, false)}
              className="rounded-lg border border-rule bg-card px-3 py-[6px] text-[12px] font-medium text-ink hover:border-faint"
            >
              Auto-arrange
            </button>
            <button
              onClick={() => addScene(ch.id)}
              className="rounded-lg bg-ink px-3 py-[6px] text-[12px] font-semibold text-bg"
            >
              + Add scene
            </button>
          </div>
        </div>

        {/* Scene canvas */}
        <div
          className={`mx-[22px] overflow-auto rounded-xl border border-rule bg-bg ${
            expanded ? "max-h-[74vh]" : "max-h-[40vh]"
          }`}
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
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line)" strokeWidth={1.75} />
                );
              })}
            </svg>

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
                          onClick={() =>
                            askConfirm({
                              message: `Delete scene ${i + 1}?`,
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
          </div>
        </div>
        <div className="px-[26px] pt-[8px] text-[11px] font-medium text-faint">
          Drag scenes to rearrange · click a connector to toggle Therefore / But / And
        </div>

        {/* Chapter notes */}
        <div className="px-[26px] pt-[18px]">
          <div className="mb-[8px] text-[11px] font-semibold uppercase tracking-widest text-soft">
            Chapter notes
          </div>
          <textarea
            value={ch.notes ?? ""}
            onChange={(e) => patchChapter(ch.id, { notes: e.target.value })}
            placeholder="Reminders, revision ideas, continuity flags for this chapter..."
            rows={2}
            className="w-full resize-none rounded-xl border border-rule bg-card p-[12px] text-[13px] leading-[1.55] text-ink outline-none"
          />
        </div>

        {/* Pinned refs */}
        <div className="px-[26px] py-[18px]">
          <div className="mb-[13px] text-[11px] font-semibold uppercase tracking-widest text-soft">
            Pinned references
          </div>
          <RefList
            refs={ch.refs}
            onAdd={(kind) => addChapterRef(ch.id, kind)}
            onUpdate={(refId, patch) => updateChapterRef(ch.id, refId, patch)}
            onDelete={(refId) => deleteChapterRef(ch.id, refId)}
            onLink={() => setLinkOpen((v) => !v)}
            linkLabel="Link book asset"
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
