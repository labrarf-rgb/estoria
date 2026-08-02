import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { countWords, shortCount } from "@/lib/manuscript";
import { Popover } from "@/components/ui/Popover";
import { isBackupPickerSupported } from "@/lib/backup";

export function Toolbar() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const level = useStore((s) => s.level);
  const goToSeries = useStore((s) => s.goToSeries);
  const setLevel = useStore((s) => s.setLevel);
  const orient = useStore((s) => s.timelineOrient);
  const pane = useStore((s) => s.timelinePane);
  const setTimelinePane = useStore((s) => s.setTimelinePane);
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
  const autoArrangeBoard = useStore((s) => s.autoArrangeBoard);
  const autoArrangeSeries = useStore((s) => s.autoArrangeSeries);
  const makeSeries = useStore((s) => s.makeSeries);
  const setProjectTitle = useStore((s) => s.setProjectTitle);
  const updateBook = useStore((s) => s.updateBook);
  const setActiveDraft = useStore((s) => s.setActiveDraft);
  const addDraft = useStore((s) => s.addDraft);
  const renameDraft = useStore((s) => s.renameDraft);
  const deleteDraft = useStore((s) => s.deleteDraft);
  const setMainDraft = useStore((s) => s.setMainDraft);
  const askConfirm = useStore((s) => s.askConfirm);

  const [versionMenu, setVersionMenu] = useState(false);
  // "+ Add version" expands into the prose question rather than acting at once.
  const [forkChoice, setForkChoice] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [compact, setCompact] = useState(false);
  const versionBtnRef = useRef<HTMLButtonElement>(null);
  const fileBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Collapse the zoom + theme controls into a "more" menu only when the toolbar
  // genuinely doesn't fit. We remember the width the bar needs while expanded
  // (`fullWidth`) so that, once compacted, we know exactly when there's room to
  // expand again — instead of guessing from the compacted layout's own width.
  const compactRef = useRef(false);
  compactRef.current = compact;
  const fullWidth = useRef(0);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => {
      if (!el.isConnected) return;
      if (!compactRef.current) {
        // Expanded: this is the true width everything needs.
        fullWidth.current = el.scrollWidth;
        if (el.scrollWidth > el.clientWidth + 2) setCompact(true);
      } else {
        // Compacted: expand once the viewport can hold the full bar again.
        if (fullWidth.current && el.clientWidth >= fullWidth.current + 8) setCompact(false);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  const words = doc.chapters.reduce((a, c) => a + c.words, 0);
  const activeBook = doc.books.find((b) => b.id === doc.activeBookId);
  const activeDraft = doc.drafts.find((d) => d.id === doc.activeDraftId);
  const mainDraftId = doc.mainDraftId;
  // The starred version heads the menu — it's the trunk, so it reads first.
  // Display order only: `doc.drafts` keeps the order versions were created in,
  // so promoting one doesn't shuffle the rest.
  const draftsByRank = [...doc.drafts].sort(
    (a, b) => Number(b.id === mainDraftId) - Number(a.id === mainDraftId)
  );
  /**
   * Words in a version. Read off the stored `words` cache rather than counted
   * from the prose: it is the same number every other surface shows, and the
   * menu should not scan four manuscripts to open.
   */
  const versionWords = (id: string): number =>
    (id === doc.activeDraftId ? doc.chapters : (doc.draftData[id]?.chapters ?? [])).reduce(
      (a, c) => a + c.words,
      0
    );
  /** Whether forking would actually copy anything, i.e. whether to ask. */
  const activeProseWords = doc.chapters.reduce(
    (a, c) => a + (c.manuscript ? countWords(c.manuscript) : 0),
    0
  );
  const onSeriesMap = doc.seriesMode && level === "series";
  // The book timeline is a scrolling surface with no camera, so a zoom readout
  // there would report a number that controls nothing.
  const showZoom = !onSeriesMap && view !== "timeline";
  const bookStat = `${(words / 1000).toFixed(1).replace(/\.0$/, "")}k words · ${doc.chapters.length} chapters`;

  const seg = "px-3 py-[6px] rounded-[7px] text-[12px] font-medium cursor-pointer whitespace-nowrap";
  const segOn = `${seg} bg-card text-ink`;
  const segOff = `${seg} bg-transparent text-soft hover:bg-card`;
  const action =
    "flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[11px] py-[7px] text-[12px] font-semibold text-ink hover:border-faint";

  return (
    <div
      ref={barRef}
      className="relative z-30 flex items-center gap-[10px] overflow-x-auto border-b border-rule bg-panel px-4 py-[8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Brand wordmark */}
      <span className="shrink-0 select-none font-serif text-[21px] font-semibold italic tracking-tight text-ink">
        Estoria
      </span>

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

        {/* Version / draft dropdown — versions are per book, so hide on the
            series map. */}
        {!onSeriesMap && (
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
          <Popover
            anchorRef={versionBtnRef}
            open={versionMenu}
            onClose={() => {
              setVersionMenu(false);
              setForkChoice(false);
            }}
            width={250}
          >
            <div className="px-[8px] pb-[4px] pt-[2px] text-[10px] font-semibold uppercase tracking-wide text-faint">
              Versions
            </div>
            {draftsByRank.map((d) => (
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
                {/* The star marks the canonical version: it can't be deleted,
                    it's where deleting the version you're on drops you, and it
                    reads as the real book rather than an experiment. Separate
                    from the radio, which is only what you're looking at now. */}
                {/* What this version costs, so a fork's price is visible from
                    the menu that offers one. */}
                <span className="shrink-0 font-mono text-[10px] font-medium text-faint">
                  {shortCount(versionWords(d.id))}
                </span>
                <button
                  onClick={() => setMainDraft(d.id)}
                  title={
                    d.id === mainDraftId
                      ? "This is the main version"
                      : `Make "${d.name}" the main version`
                  }
                  className={`px-[5px] text-[12px] leading-none ${
                    d.id === mainDraftId ? "text-ink" : "text-faint hover:text-soft"
                  }`}
                >
                  {d.id === mainDraftId ? "★" : "☆"}
                </button>
                {d.id !== mainDraftId && (
                  <button
                    onClick={() =>
                      askConfirm({
                        message: `Delete the "${d.name}" version?`,
                        detail: "This version's chapters and edits will be deleted. Other versions are not affected.",
                        danger: true,
                        onConfirm: () => deleteDraft(d.id),
                      })
                    }
                    className="px-[6px] text-[12px] text-faint hover:text-but"
                    title="Delete version"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="px-[8px] pb-[2px] pt-[4px] text-[10px] leading-[1.4] text-faint">
              ★ marks the main version
            </div>
            <div className="mx-[6px] my-1 h-px bg-rule" />
            {/* Prose forks with the version, so a fork has a cost — and the
                question is only worth asking when there is prose to copy.
                With none written, the two answers are the same and it just adds
                a click. */}
            {forkChoice ? (
              <div className="px-[8px] pb-[6px] pt-[2px]">
                <div className="pb-[6px] text-[11px] leading-[1.45] text-soft">
                  Take the writing with it?
                </div>
                <button
                  onClick={() => {
                    addDraft(undefined, { copyProse: true });
                    setForkChoice(false);
                    setVersionMenu(false);
                  }}
                  className="w-full rounded-lg bg-ink px-[10px] py-[7px] text-left text-[12px] font-semibold text-bg"
                >
                  Copy the manuscript
                </button>
                <button
                  onClick={() => {
                    addDraft(undefined, { copyProse: false });
                    setForkChoice(false);
                    setVersionMenu(false);
                  }}
                  className="mt-[5px] w-full rounded-lg border border-rule bg-card px-[10px] py-[7px] text-left text-[12px] font-medium text-ink hover:border-faint"
                >
                  Structure only
                  <span className="block text-[10.5px] font-normal text-faint">
                    The map, with none of the prose
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (activeProseWords > 0) return setForkChoice(true);
                  addDraft();
                  setVersionMenu(false);
                }}
                className="w-full rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip"
              >
                + Add version
              </button>
            )}
          </Popover>
        </div>
        )}
      </div>

      <div className="flex-1" />

      {/* New chapter / Auto-arrange — board only.
          Neither does anything the timeline can show. Auto-arrange lays out the
          board's free-floating cards, and the timeline's rail is an ordered list
          with no positions to arrange; a new chapter would be appended somewhere
          off screen. Both dropped drag-to-reorder when the timeline became a
          reading surface (§4), and this is the same rule applied to the toolbar. */}
      {!onSeriesMap && view === "board" && (
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

      {/* New book / Auto-arrange (series map only) */}
      {onSeriesMap && (
        <>
          <button onClick={addBook} className={action}>
            <span className="-mt-px text-[15px] font-normal leading-none">+</span> New book
          </button>
          <button onClick={autoArrangeSeries} className={action}>
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
        {/* Scenes / Manuscript — a pane toggle, not a fourth view: the rail
            either side of it is the same rail. Shown only on the timeline,
            because that is the only surface with a pane to change.
            "Manuscript" rather than "Prose", so one word means one thing here
            and in the chapter modal. It is also what the export is called. */}
        {view === "timeline" && (
          <div className="flex rounded-[9px] bg-chip p-[3px]">
            <button
              title="Read the scene flow"
              onClick={() => setTimelinePane("scenes")}
              className={pane === "scenes" ? segOn : segOff}
            >
              Scenes
            </button>
            <button
              title="Read the chapters' manuscript"
              onClick={() => setTimelinePane("prose")}
              className={pane === "prose" ? segOn : segOff}
            >
              Manuscript
            </button>
          </div>
        )}
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
        {/* Item names and order mirror the Android app's ⋮ menu (SPECS §8);
            Android-only entries (Sync settings, Books/Series, Versions) are
            simply absent here. */}
        <Popover anchorRef={fileBtnRef} open={newMenu} onClose={closeNewMenu} align="right" width={244}>
          <MenuItem
            title="Open project"
            sub="Switch between your projects"
            onClick={() => setPanel("showProjects", true)}
          />
          <MenuItem
            title="Save to file"
            sub="Markdown vault or project file"
            onClick={() => setPanel("showExport", true)}
          />
          <MenuItem
            title="Import markdown"
            sub="Bring an existing draft via AI"
            onClick={() => setPanel("showImport", true)}
          />
          {/* Needs folder access (File System Access API) like the footer Sync. */}
          {isBackupPickerSupported() && (
            <MenuItem
              title="Backups & conflict copies"
              sub="Restore a copy from your Estoria folder"
              onClick={() => setPanel("showBackups", true)}
            />
          )}
          <div className="mx-[6px] my-1 h-px bg-rule" />
          <MenuItem
            title="New book"
            sub="Standalone, new series, or add to a series"
            onClick={() => setPanel("showNewBook", true)}
          />
          {/* Chapter-level actions don't apply to the series map. */}
          {!onSeriesMap && (
            <MenuItem
              title="New chapter"
              sub="A single empty chapter"
              onClick={() => {
                addChapter();
                closeNewMenu();
              }}
            />
          )}
          {!doc.seriesMode && (
            <MenuItem
              title="Make this a series"
              sub="Turn this book into a multi-book series"
              onClick={() => {
                makeSeries();
                goToSeries();
                closeNewMenu();
              }}
            />
          )}
          {!onSeriesMap && (
            <MenuItem
              title="Use a template"
              sub="Three-act, Hero's Journey, Save the Cat..."
              onClick={() => setPanel("showTemplates", true)}
            />
          )}
          <div className="mx-[6px] my-1 h-px bg-rule" />
          <a
            href="https://www.labrarf.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeNewMenu}
            className="flex flex-col gap-[2px] rounded-lg px-[11px] py-[9px] text-left hover:bg-chip"
          >
            <span className="text-[12.5px] font-semibold text-ink">Contact</span>
            <span className="text-[11px] font-normal text-soft">Questions, feedback, or say hello</span>
          </a>
          <MenuItem title="About Estoria" onClick={() => setPanel("showAbout", true)} />
        </Popover>
      </div>

      {/* Utility controls: inline when they fit, otherwise a "more" menu. */}
      {compact ? (
        <div className="shrink-0">
          <button
            ref={moreBtnRef}
            onClick={() => setMoreMenu((v) => !v)}
            title="More controls"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-rule bg-card text-[18px] leading-none text-ink hover:border-faint"
          >
            ⋯
          </button>
          <Popover anchorRef={moreBtnRef} open={moreMenu} onClose={() => setMoreMenu(false)} align="right" width={200}>
            {showZoom && (
              <div className="flex items-center justify-between px-[8px] py-[6px]">
                <span className="text-[12px] font-medium text-soft">Zoom</span>
                <div className="flex items-center gap-[2px] rounded-[9px] bg-chip p-[3px]">
                  <button onClick={zoomOut} className="h-[24px] w-[26px] rounded-md text-[16px] font-semibold text-ink hover:bg-card">−</button>
                  <span className="min-w-[40px] text-center font-mono text-[11px] font-medium text-soft">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button onClick={zoomIn} className="h-[24px] w-[26px] rounded-md text-[15px] font-semibold text-ink hover:bg-card">+</button>
                </div>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-between rounded-lg px-[8px] py-[8px] text-left text-[12.5px] font-medium text-ink hover:bg-chip"
            >
              Theme
              <span className="text-soft">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
          </Popover>
        </div>
      ) : (
        <>
          {showZoom && (
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
        </>
      )}
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

function MenuItem({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-[2px] rounded-lg px-[11px] py-[9px] text-left hover:bg-chip"
    >
      <span className="text-[12.5px] font-semibold text-ink">{title}</span>
      {sub && <span className="text-[11px] font-normal text-soft">{sub}</span>}
    </button>
  );
}
