import { useEffect, useRef, useState } from "react";
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
  const updateBook = useStore((s) => s.updateBook);
  const setActiveDraft = useStore((s) => s.setActiveDraft);
  const addDraft = useStore((s) => s.addDraft);
  const renameDraft = useStore((s) => s.renameDraft);
  const deleteDraft = useStore((s) => s.deleteDraft);

  const [versionMenu, setVersionMenu] = useState(false);
  const versionBtnRef = useRef<HTMLButtonElement>(null);
  const fileBtnRef = useRef<HTMLButtonElement>(null);

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
    <div className="relative z-30 flex items-center gap-[10px] overflow-x-auto border-b border-rule bg-panel px-4 py-[8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Brand wordmark */}
      <div className="flex flex-shrink-0 items-center gap-[8px]">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-ink font-serif text-[14px] font-semibold text-bg">
          E
        </div>
        <span className="font-serif text-[17px] font-semibold tracking-tight text-ink">Estoria</span>
      </div>

      <span className="h-[24px] w-px shrink-0 bg-rule" />

      {/* Identity: series name -> book name, stat underneath, version to the right */}
      <div className="flex min-w-0 flex-shrink-0 items-center gap-[10px]">
        <div className="flex min-w-0 flex-col leading-[1.15]">
          <div className="flex items-center gap-[5px]">
            {doc.seriesMode ? (
              <>
                <EditableName
                  value={doc.projectTitle}
                  onChange={setProjectTitle}
                  onNavigate={goToSeries}
                  active={onSeriesMap}
                  placeholder="Series name"
                />
                <span className="text-faint">▸</span>
                <EditableName
                  value={activeBook?.title ?? "Book"}
                  onChange={(t) => activeBook && updateBook(activeBook.id, { title: t })}
                  onNavigate={() => setLevel("book")}
                  active={!onSeriesMap}
                  placeholder="Book name"
                />
              </>
            ) : (
              <EditableName
                value={doc.projectTitle}
                onChange={setProjectTitle}
                placeholder="Story name"
              />
            )}
          </div>
          <span className="text-[10.5px] font-medium tracking-wide text-soft">{bookStat}</span>
        </div>

        {/* Version / draft dropdown */}
        <div>
          <button
            ref={versionBtnRef}
            onClick={() => setVersionMenu((v) => !v)}
            className="flex items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[9px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
            title="Draft version"
          >
            <span className="h-[7px] w-[7px] rounded-full bg-but" />
            {activeDraft?.name ?? "Main draft"} <span className="text-faint">▾</span>
          </button>
          <Popover anchorRef={versionBtnRef} open={versionMenu} onClose={() => setVersionMenu(false)} width={250}>
            <div className="px-[8px] pb-[4px] pt-[2px] text-[10px] font-semibold uppercase tracking-wide text-faint">
              Versions
            </div>
            {doc.drafts.map((d) => (
              <div
                key={d.id}
                className={`flex items-center gap-[4px] rounded-lg pl-[6px] pr-[4px] ${
                  d.id === doc.activeDraftId ? "bg-chip" : ""
                }`}
              >
                <button
                  onClick={() => setActiveDraft(d.id)}
                  title="Use this version"
                  className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border border-faint"
                >
                  {d.id === doc.activeDraftId && <span className="h-[7px] w-[7px] rounded-full bg-ink" />}
                </button>
                <input
                  value={d.name}
                  onChange={(e) => renameDraft(d.id, e.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-[8px] text-[12.5px] font-medium text-ink outline-none"
                />
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

      {/* View toggle: Board/Map vs Timeline */}
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

      {/* File menu */}
      <div className="shrink-0">
        <button
          ref={fileBtnRef}
          onClick={toggleNewMenu}
          className="flex items-center gap-[6px] whitespace-nowrap rounded-lg bg-ink px-3 py-[7px] text-[12px] font-semibold text-bg"
        >
          File <span className="opacity-70">▾</span>
        </button>
        <Popover anchorRef={fileBtnRef} open={newMenu} onClose={closeNewMenu} align="right" width={244}>
          <MenuItem
            title="New book"
            sub="Standalone, new series, or add to a series"
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
            title="Open project..."
            sub="Switch between your projects"
            onClick={() => setPanel("showProjects", true)}
          />
          {!doc.seriesMode && (
            <MenuItem
              title="Make this a series"
              sub="Turn this book into a multi-book series"
              onClick={() => {
                toggleSeriesMode();
                goToSeries();
                closeNewMenu();
              }}
            />
          )}
          <MenuItem
            title="Export..."
            sub="Markdown vault or project file"
            onClick={() => setPanel("showExport", true)}
          />
        </Popover>
      </div>

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

      {/* Theme (icon only) */}
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

/**
 * A name in the header. Single click navigates (when `onNavigate` is given);
 * double-click switches to an input to rename. Without `onNavigate`, a single
 * click renames directly.
 */
function EditableName({
  value,
  onChange,
  onNavigate,
  active,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onNavigate?: () => void;
  active?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange(draft.trim() || value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="w-[150px] rounded-[5px] bg-card px-[4px] text-[13.5px] font-semibold text-ink outline-none ring-1 ring-faint"
      />
    );
  }

  return (
    <button
      onClick={() => (onNavigate ? onNavigate() : setEditing(true))}
      onDoubleClick={() => setEditing(true)}
      title={onNavigate ? "Click to open · double-click to rename" : "Click to rename"}
      className={`max-w-[200px] truncate text-[13.5px] font-semibold decoration-dotted decoration-rule underline-offset-2 hover:underline ${
        active ? "text-ink" : onNavigate ? "text-soft hover:text-ink" : "text-ink"
      }`}
    >
      {value || placeholder}
    </button>
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
