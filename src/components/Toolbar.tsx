import { useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { Popover } from "@/components/ui/Popover";

export function Toolbar() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const level = useStore((s) => s.level);
  const goToSeries = useStore((s) => s.goToSeries);
  const setLevel = useStore((s) => s.setLevel);
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
  const autoArrangeBoard = useStore((s) => s.autoArrangeBoard);
  const toggleSeriesMode = useStore((s) => s.toggleSeriesMode);
  const setProjectTitle = useStore((s) => s.setProjectTitle);
  const setActiveDraft = useStore((s) => s.setActiveDraft);
  const addDraft = useStore((s) => s.addDraft);
  const deleteDraft = useStore((s) => s.deleteDraft);

  const [versionMenu, setVersionMenu] = useState(false);
  const versionBtnRef = useRef<HTMLButtonElement>(null);
  const newBtnRef = useRef<HTMLButtonElement>(null);

  const words = doc.chapters.reduce((a, c) => a + c.words, 0);
  const activeBook = doc.books.find((b) => b.id === doc.activeBookId);
  const activeDraft = doc.drafts.find((d) => d.id === doc.activeDraftId);
  const onSeriesMap = doc.seriesMode && level === "series";
  const bookStat = `${(words / 1000).toFixed(1).replace(/\.0$/, "")}k words · ${doc.chapters.length} chapters`;

  const seg = "px-3 py-[6px] rounded-[7px] text-[12px] font-medium cursor-pointer whitespace-nowrap";
  const segOn = `${seg} bg-card text-ink`;
  const segOff = `${seg} bg-transparent text-soft hover:bg-card`;
  const action =
    "flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[11px] py-[7px] text-[12px] font-semibold text-ink hover:border-faint";

  return (
    <div className="relative z-30 flex items-center gap-[10px] overflow-x-auto border-b border-rule bg-panel px-4 py-[9px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            className="w-[150px] bg-transparent text-[13.5px] font-semibold text-ink outline-none placeholder:text-faint"
            title="Click to rename project"
          />
          <span className="text-[10.5px] font-medium tracking-wide text-soft">{bookStat}</span>
        </div>

        {/* Version / draft dropdown */}
        <div className="ml-[4px]">
          <button
            ref={versionBtnRef}
            onClick={() => setVersionMenu((v) => !v)}
            className="flex items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[9px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
          >
            <span className="h-[7px] w-[7px] rounded-full bg-but" />
            {activeDraft?.name ?? "Main draft"} <span className="text-faint">▾</span>
          </button>
          <Popover
            anchorRef={versionBtnRef}
            open={versionMenu}
            onClose={() => setVersionMenu(false)}
            width={220}
          >
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
          </Popover>
        </div>
      </div>

      <div className="flex-1" />

      {/* Series breadcrumb (only once the project is a series) */}
      {doc.seriesMode && (
        <div className="flex shrink-0 items-center gap-[5px] text-[12px] font-medium">
          <button
            onClick={goToSeries}
            className={`rounded-md px-[8px] py-[5px] ${
              onSeriesMap ? "bg-chip text-ink" : "text-soft hover:bg-chip"
            }`}
          >
            Series
          </button>
          <span className="text-faint">▸</span>
          <button
            onClick={() => setLevel("book")}
            className={`rounded-md px-[8px] py-[5px] ${
              !onSeriesMap ? "bg-chip text-ink" : "text-soft hover:bg-chip"
            }`}
          >
            {activeBook ? activeBook.subtitle || activeBook.title : "Book"}
          </button>
          <span className="mx-[2px] h-[22px] w-px shrink-0 bg-rule" />
        </div>
      )}

      {/* New chapter / Auto-arrange (book level only) */}
      {!onSeriesMap && (
        <>
          <button onClick={addChapter} className={action}>
            <span className="-mt-px text-[15px] font-normal leading-none">+</span> New chapter
          </button>
          <button onClick={autoArrangeBoard} className={action}>
            Auto-arrange
          </button>

          <span className="h-[22px] w-px shrink-0 bg-rule" />
        </>
      )}

      {/* View toggle: Board/Map vs Timeline (both levels) */}
      {
          <div className="flex shrink-0 items-center gap-[6px]">
            <div className="flex rounded-[9px] bg-chip p-[3px]">
              <button className={view === "board" ? segOn : segOff} onClick={() => setView("board")}>
                {onSeriesMap ? "Map" : "Board"}
              </button>
              <button className={view === "timeline" ? segOn : segOff} onClick={() => setView("timeline")}>
                Timeline
              </button>
            </div>
            <div className="flex rounded-[9px] bg-chip p-[3px]">
              <button
                title="Vertical timeline"
                onClick={() => {
                  setOrient("vertical");
                  setView("timeline");
                }}
                className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[14px] ${
                  view === "timeline" && orient === "vertical" ? "bg-card text-ink" : "text-soft hover:bg-card"
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
                  view === "timeline" && orient === "horizontal" ? "bg-card text-ink" : "text-soft hover:bg-card"
                }`}
              >
                →
              </button>
            </div>
          </div>
      }

      {/* Side panels */}
      <div className="flex shrink-0 gap-[2px] rounded-[9px] bg-chip p-[3px]">
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
      <div className="shrink-0">
        <button
          ref={newBtnRef}
          onClick={toggleNewMenu}
          className="flex items-center gap-[6px] whitespace-nowrap rounded-lg bg-ink px-3 py-[7px] text-[12px] font-semibold text-bg"
        >
          + New <span className="opacity-70">▾</span>
        </button>
        <Popover anchorRef={newBtnRef} open={newMenu} onClose={closeNewMenu} align="right" width={236}>
          <MenuItem
            title="New book"
            sub="Standalone, or add to this series"
            onClick={() => setPanel("showNewBook", true)}
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
            title={doc.seriesMode ? "Open series map" : "Make this a series"}
            sub="Map and connect multiple books"
            onClick={() => {
              if (!doc.seriesMode) toggleSeriesMode();
              goToSeries();
              closeNewMenu();
            }}
          />
        </Popover>
      </div>

      <button
        onClick={() => setPanel("showExport", true)}
        className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-[7px] text-[12px] font-medium text-ink hover:border-faint"
      >
        Export <span className="text-faint">↓</span>
      </button>

      {/* Zoom (board level only; the series map has its own zoom) */}
      {!onSeriesMap && (
        <div className="flex shrink-0 items-center gap-[2px] rounded-[9px] bg-chip p-[3px]">
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
      )}

      {/* Theme (icon only to save space) */}
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "Dark theme" : "Light theme"}
        className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-ink hover:border-faint"
      >
        <span
          className="h-[14px] w-[14px] rounded-full border-[1.5px] border-ink"
          style={{ background: "linear-gradient(90deg,var(--ink) 50%,transparent 50%)" }}
        />
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
