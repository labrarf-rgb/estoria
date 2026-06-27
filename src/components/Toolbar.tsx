import { useState } from "react";
import { useStore } from "@/store/useStore";

export function Toolbar() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const orient = useStore((s) => s.timelineOrient);
  const zoom = useStore((s) => s.zoom);
  const theme = useStore((s) => s.theme);
  const newMenu = useStore((s) => s.newMenu);

  const setView = useStore((s) => s.setView);
  const setOrient = useStore((s) => s.setOrient);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const zoomIn = useStore((s) => s.zoomIn);
  const zoomOut = useStore((s) => s.zoomOut);
  const setPanel = useStore((s) => s.setPanel);
  const toggleNewMenu = useStore((s) => s.toggleNewMenu);
  const closeNewMenu = useStore((s) => s.closeNewMenu);
  const addChapter = useStore((s) => s.addChapter);
  const addBook = useStore((s) => s.addBook);
  const setProjectTitle = useStore((s) => s.setProjectTitle);
  const setActiveDraft = useStore((s) => s.setActiveDraft);
  const addDraft = useStore((s) => s.addDraft);
  const deleteDraft = useStore((s) => s.deleteDraft);

  const [versionMenu, setVersionMenu] = useState(false);

  const words = doc.chapters.reduce((a, c) => a + c.words, 0);
  const activeBook = doc.books.find((b) => b.id === doc.activeBookId);
  const activeDraft = doc.drafts.find((d) => d.id === doc.activeDraftId);
  const bookStat = `${(words / 1000).toFixed(1).replace(/\.0$/, "")}k words · ${doc.chapters.length} chapters`;

  const seg = "px-3 py-[6px] rounded-[7px] text-[12px] font-medium cursor-pointer whitespace-nowrap";
  const segOn = `${seg} bg-card text-ink`;
  const segOff = `${seg} bg-transparent text-soft hover:bg-card`;

  return (
    <div className="relative z-30 flex items-center gap-3 border-b border-rule bg-panel px-4 py-[9px]">
      {/* Brand + editable title */}
      <div className="flex flex-shrink-0 items-center gap-[9px]">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-ink font-serif text-[14px] font-semibold text-bg">
          E
        </div>
        <div className="flex min-w-0 flex-col leading-[1.15]">
          <input
            value={doc.projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Project name"
            className="w-[170px] bg-transparent text-[13.5px] font-semibold text-ink outline-none placeholder:text-faint"
            title="Click to rename project"
          />
          <span className="text-[10.5px] font-medium tracking-wide text-soft">{bookStat}</span>
        </div>

        {/* Version / draft dropdown */}
        <div className="relative ml-[6px]">
          <button
            onClick={() => setVersionMenu((v) => !v)}
            className="flex items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[9px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
          >
            <span className="h-[7px] w-[7px] rounded-full bg-but" />
            {activeDraft?.name ?? "Main draft"} <span className="text-faint">▾</span>
          </button>
          {versionMenu && (
            <>
              <div className="fixed inset-0 z-[39]" onMouseDown={() => setVersionMenu(false)} />
              <div className="absolute left-0 top-[38px] z-40 flex w-[220px] flex-col gap-[2px] rounded-[11px] border border-rule bg-card p-[7px] shadow-[0_16px_44px_rgba(0,0,0,0.32)]">
                {doc.drafts.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-1 rounded-lg px-[6px] ${
                      d.id === doc.activeDraftId ? "bg-chip" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveDraft(d.id);
                        setVersionMenu(false);
                      }}
                      className="flex-1 py-[8px] text-left text-[12.5px] font-medium text-ink"
                    >
                      {d.name}
                    </button>
                    {d.id !== "main" && (
                      <button
                        onClick={() => deleteDraft(d.id)}
                        className="px-[6px] text-[12px] text-faint hover:text-but"
                        title="Delete version"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <div className="mx-[6px] my-1 h-px bg-rule" />
                <button
                  onClick={() => {
                    addDraft();
                    setVersionMenu(false);
                  }}
                  className="rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip"
                >
                  + Add version
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* View toggle with always-visible orientation arrows */}
      <div className="flex items-center gap-[6px]">
        <div className="flex rounded-[9px] bg-chip p-[3px]">
          <button className={view === "board" ? segOn : segOff} onClick={() => setView("board")}>
            Board
          </button>
          <button className={view === "timeline" ? segOn : segOff} onClick={() => setView("timeline")}>
            Timeline
          </button>
        </div>
        {/* Orientation: down = vertical, right = horizontal. Always shown, obvious. */}
        <div className="flex rounded-[9px] bg-chip p-[3px]">
          <button
            title="Vertical timeline"
            onClick={() => {
              setOrient("vertical");
              setView("timeline");
            }}
            className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[14px] ${
              view === "timeline" && orient === "vertical"
                ? "bg-card text-ink"
                : "text-soft hover:bg-card"
            }`}
          >
            ↓
          </button>
          <button
            title="Horizontal timeline"
            onClick={() => {
              setOrient("horizontal");
              setView("timeline");
            }}
            className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[14px] ${
              view === "timeline" && orient === "horizontal"
                ? "bg-card text-ink"
                : "text-soft hover:bg-card"
            }`}
          >
            →
          </button>
        </div>
      </div>

      {/* Side panels */}
      <div className="flex gap-[2px] rounded-[9px] bg-chip p-[3px]">
        <button className={segOff} onClick={() => setPanel("showChars", true)}>
          Characters
        </button>
        <button className={segOff} onClick={() => setPanel("showWorld", true)}>
          World
        </button>
        <button className={segOff} onClick={() => setPanel("showNotes", true)}>
          Notes
        </button>
      </div>

      {/* Series / multi-book */}
      <button
        onClick={() => setPanel("showSeries", true)}
        className="flex items-center gap-[7px] whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-[7px] text-[12px] font-semibold text-ink hover:border-faint"
        title="Zoom out to the series view"
      >
        <span className="flex gap-[2px]">
          <span className="h-[13px] w-[5px] rounded-[1px] bg-but" />
          <span className="h-[13px] w-[5px] rounded-[1px] bg-and" />
          <span className="h-[13px] w-[5px] rounded-[1px] bg-faint" />
        </span>
        {activeBook ? activeBook.subtitle || activeBook.title : "Series"}
      </button>

      {/* New menu */}
      <div className="relative">
        <button
          onClick={toggleNewMenu}
          className="flex items-center gap-[6px] whitespace-nowrap rounded-lg bg-ink px-3 py-[7px] text-[12px] font-semibold text-bg"
        >
          + New <span className="opacity-70">▾</span>
        </button>
        {newMenu && (
          <>
            <div className="fixed inset-0 z-[39]" onMouseDown={closeNewMenu} />
            <div className="absolute right-0 top-[40px] z-40 flex w-[236px] flex-col gap-[2px] rounded-[11px] border border-rule bg-card p-[7px] shadow-[0_16px_44px_rgba(0,0,0,0.32)]">
              <MenuItem
                title="New book"
                sub="Start another volume in the series"
                onClick={addBook}
              />
              <MenuItem
                title="New chapter"
                sub="A single empty chapter"
                onClick={() => {
                  addChapter();
                  closeNewMenu();
                }}
              />
              <MenuItem
                title="Use a template..."
                sub="Three-act, Hero's Journey, Save the Cat..."
                onClick={() => setPanel("showTemplates", true)}
              />
              <MenuItem
                title="Import markdown..."
                sub="Bring an existing draft via AI"
                onClick={() => setPanel("showImport", true)}
              />
              <div className="mx-[6px] my-1 h-px bg-rule" />
              <MenuItem
                title="Series planner..."
                sub="Plan multiple books"
                onClick={() => setPanel("showSeries", true)}
              />
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => setPanel("showExport", true)}
        className="flex items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-[7px] text-[12px] font-medium text-ink hover:border-faint"
      >
        Export <span className="text-faint">↓</span>
      </button>

      {/* Zoom */}
      <div className="flex items-center gap-[2px] rounded-[9px] bg-chip p-[3px]">
        <button
          onClick={zoomOut}
          className="h-[24px] w-[26px] rounded-md text-[16px] font-semibold text-ink hover:bg-card"
        >
          −
        </button>
        <span className="min-w-[40px] text-center font-mono text-[11px] font-medium text-soft">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="h-[24px] w-[26px] rounded-md text-[15px] font-semibold text-ink hover:bg-card"
        >
          +
        </button>
      </div>

      <button
        onClick={toggleTheme}
        className="flex items-center gap-[7px] rounded-lg border border-rule bg-card px-[11px] py-[7px] text-[12px] font-medium text-ink hover:border-faint"
      >
        <span
          className="h-[13px] w-[13px] rounded-full border-[1.5px] border-ink"
          style={{ background: "linear-gradient(90deg,var(--ink) 50%,transparent 50%)" }}
        />
        {theme === "dark" ? "Dark" : "Light"}
      </button>
    </div>
  );
}

function MenuItem({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-[2px] rounded-lg px-[11px] py-[9px] text-left hover:bg-chip"
    >
      <span className="text-[12.5px] font-semibold text-ink">{title}</span>
      <span className="text-[11px] font-normal text-soft">{sub}</span>
    </button>
  );
}
