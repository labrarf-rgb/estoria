import { useStore } from "@/store/useStore";

export function Toolbar() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const orient = useStore((s) => s.timelineOrient);
  const draft = useStore((s) => s.draft);
  const zoom = useStore((s) => s.zoom);
  const theme = useStore((s) => s.theme);
  const newMenu = useStore((s) => s.newMenu);

  const setView = useStore((s) => s.setView);
  const setOrient = useStore((s) => s.setOrient);
  const toggleDraft = useStore((s) => s.toggleDraft);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const zoomIn = useStore((s) => s.zoomIn);
  const zoomOut = useStore((s) => s.zoomOut);
  const setPanel = useStore((s) => s.setPanel);
  const toggleNewMenu = useStore((s) => s.toggleNewMenu);
  const closeNewMenu = useStore((s) => s.closeNewMenu);
  const addChapter = useStore((s) => s.addChapter);

  const words = doc.chapters.reduce((a, c) => a + c.words, 0);
  const bookStat = `${(words / 1000).toFixed(1).replace(/\.0$/, "")}k words · ${doc.chapters.length} chapters`;

  const seg =
    "px-3 py-[6px] rounded-[7px] text-[12px] font-medium cursor-pointer whitespace-nowrap";
  const segOn = `${seg} bg-card text-ink`;
  const segOff = `${seg} bg-transparent text-soft hover:bg-card`;

  return (
    <div className="relative z-30 flex items-center gap-3 border-b border-rule bg-panel px-4 py-[9px]">
      {/* Brand */}
      <div className="flex flex-shrink-0 items-center gap-[9px]">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-ink font-serif text-[14px] font-semibold text-bg">
          E
        </div>
        <div className="flex min-w-0 flex-col leading-[1.15]">
          <span className="truncate text-[13.5px] font-semibold text-ink">{doc.projectTitle}</span>
          <span className="text-[10.5px] font-medium tracking-wide text-soft">{bookStat}</span>
        </div>
        <button
          onClick={toggleDraft}
          className="ml-[6px] flex items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[9px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-but" />
          {draft === "alt" ? "Alt draft" : "Main draft"} <span className="text-faint">▾</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* View toggle */}
      <div className="flex rounded-[9px] bg-chip p-[3px]">
        <button className={view === "board" ? segOn : segOff} onClick={() => setView("board")}>
          Board
        </button>
        <button className={view === "timeline" ? segOn : segOff} onClick={() => setView("timeline")}>
          Timeline
        </button>
      </div>

      {view === "timeline" && (
        <div className="flex rounded-[9px] bg-chip p-[3px]">
          <button
            className={orient === "vertical" ? segOn : segOff}
            onClick={() => setOrient("vertical")}
          >
            Vertical
          </button>
          <button
            className={orient === "horizontal" ? segOn : segOff}
            onClick={() => setOrient("horizontal")}
          >
            Horizontal
          </button>
        </div>
      )}

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
            <div className="absolute right-0 top-[40px] z-40 flex w-[228px] flex-col gap-[2px] rounded-[11px] border border-rule bg-card p-[7px] shadow-[0_16px_44px_rgba(0,0,0,0.32)]">
              <MenuItem
                title="New chapter"
                sub="A single empty chapter"
                onClick={() => {
                  addChapter();
                  closeNewMenu();
                }}
              />
              <MenuItem
                title="Use a template…"
                sub="Three-act, Hero’s Journey, Save the Cat…"
                onClick={() => setPanel("showTemplates", true)}
              />
              <MenuItem
                title="Import markdown…"
                sub="Bring an existing draft via AI"
                onClick={() => setPanel("showImport", true)}
              />
              <div className="mx-[6px] my-1 h-px bg-rule" />
              <MenuItem
                title="Series planner…"
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
