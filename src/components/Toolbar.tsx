import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useStore } from "@/store/useStore";
import { countWords, shortCount } from "@/lib/manuscript";
import { Popover } from "@/components/ui/Popover";
import { isBackupPickerSupported } from "@/lib/backup";
import { activeTarget, driveAvailableHere } from "@/lib/syncTarget";
import { driveAuth } from "@/lib/driveAuth";
import { openDriveChooser } from "@/lib/driveSession";
import { isStandalone } from "@/lib/install";
import { canCollapse, countParts, formLabel, isPiece } from "@/lib/piece";
import { canMakeAnthology, isAnthology } from "@/lib/anthology";
import { FULL, fitToolbar, sameFit, type Fit, type FoldKey } from "@/lib/toolbarFit";
import { LookSettings } from "@/components/LookSettings";

/** Which page of the More menu is showing: its own items, or File / Settings inside it. */
type MoreLevel = "top" | "file" | "settings";

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
  const newMenu = useStore((s) => s.newMenu);

  const setView = useStore((s) => s.setView);
  const setOrient = useStore((s) => s.setOrient);
  const zoomIn = useStore((s) => s.zoomIn);
  const zoomOut = useStore((s) => s.zoomOut);
  const setPanel = useStore((s) => s.setPanel);
  const toggleNewMenu = useStore((s) => s.toggleNewMenu);
  const closeNewMenu = useStore((s) => s.closeNewMenu);
  const addChapter = useStore((s) => s.addChapter);
  const addBook = useStore((s) => s.addBook);
  const autoArrangeBoard = useStore((s) => s.autoArrangeBoard);
  const autoArrangeSeries = useStore((s) => s.autoArrangeSeries);
  const setProjectTitle = useStore((s) => s.setProjectTitle);
  const updateBook = useStore((s) => s.updateBook);
  const setActiveDraft = useStore((s) => s.setActiveDraft);
  const addDraft = useStore((s) => s.addDraft);
  const renameDraft = useStore((s) => s.renameDraft);
  const deleteDraft = useStore((s) => s.deleteDraft);
  const setMainDraft = useStore((s) => s.setMainDraft);
  const askConfirm = useStore((s) => s.askConfirm);
  const setFormDialog = useStore((s) => s.setFormDialog);
  // A single piece has no board, chapters or timeline, so none of their
  // controls; it switches Scene flow / Manuscript where a chapter does.
  const piece = isPiece(doc);
  // An anthology has a board of its own (`AnthologyBoard`): pieces in sections,
  // no chapters, acts, timeline, templates or zoom.
  const anth = isAnthology(doc);
  const noBoard = piece || anth;
  const setAddPieceDialog = useStore((s) => s.setAddPieceDialog);
  const openCh = useStore((s) => s.openCh);
  const closeChapter = useStore((s) => s.closeChapter);

  const [versionMenu, setVersionMenu] = useState(false);
  // "+ Add version" expands into the prose question rather than acting at once.
  const [forkChoice, setForkChoice] = useState(false);
  const [settingsMenu, setSettingsMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreLevel, setMoreLevel] = useState<MoreLevel>("top");
  // The page you just stepped back out of, so focus lands on its row again.
  const [moreFrom, setMoreFrom] = useState<MoreLevel>("top");
  const versionBtnRef = useRef<HTMLButtonElement>(null);
  const fileBtnRef = useRef<HTMLButtonElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // Install is offered until Estoria runs in its own window; until then the
  // Settings button carries a dot so the offer isn't buried in a menu.
  const offerInstall = !isStandalone();

  /**
   * How the bar fits the window (`lib/toolbarFit.ts`): word labels, icons,
   * then File and Settings folding into More, then the rest. Decided from an
   * off-layout copy of every control (the measurer below), so a wide window
   * renders exactly the bar it always did, and the answer never feeds back
   * into what it was measured from. Re-run whenever the bar's room changes
   * (window resize) or the copy's width does (a view switch, a rename, a
   * version name, fonts arriving).
   */
  const [fit, setFit] = useState<Fit>(FULL);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const m = measureRef.current;
    if (!bar || !m) return;
    const run = () => {
      const w = (k: string) => {
        const e = m.querySelector(`[data-m="${k}"]`);
        return e ? e.getBoundingClientRect().width : undefined;
      };
      const labelled = (k: string) => {
        const lw = w(k);
        return lw == null ? undefined : { w: lw, icon: w(`${k}-icon`) };
      };
      const cs = getComputedStyle(bar);
      const next = fitToolbar({
        // Fractional, like the measured widths (clientWidth rounds).
        avail: bar.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        gap: parseFloat(cs.columnGap) || 10,
        innerGap: 6, // the view group's gap-[6px]
        fixed: [w("brand") ?? 0, w("divider") ?? 0, w("identity") ?? 0],
        add: labelled("add"),
        arrange: labelled("arrange"),
        actSep: w("actsep") ?? 1,
        viewseg: w("viewseg"),
        orient: w("orient"),
        pane: w("pane"),
        panels: labelled("panels") ?? { w: 0 },
        file: w("file") ?? 0,
        settings: w("settings") ?? 0,
        more: w("more") ?? 0,
      });
      setFit((prev) => (sameFit(prev, next) ? prev : next));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(bar);
    ro.observe(m);
    return () => ro.disconnect();
  }, []);
  const folds = (k: FoldKey) => fit.folded.has(k);
  const compact = fit.compact;

  const closeMore = () => {
    setMoreOpen(false);
    setMoreLevel("top");
    setMoreFrom("top");
  };
  /** After the bar has re-rendered, so it lands on the More button that is
      there then (a view switch can refold the bar). */
  const refocusMore = () => requestAnimationFrame(() => moreBtnRef.current?.focus());
  const moreBack = () => {
    setMoreFrom(moreLevel);
    setMoreLevel("top");
  };
  // A menu whose button just folded away (or came back) closes rather than
  // hanging off a button that is no longer there.
  useEffect(() => {
    if (document.getElementById("toolbar-more")?.contains(document.activeElement)) refocusMore();
    closeMore();
    if (fit.folded.has("file")) useStore.getState().closeNewMenu();
    if (fit.folded.has("settings")) setSettingsMenu(false);
  }, [fit]);

  const words = doc.chapters.reduce((a, c) => a + c.words, 0);
  const activeBook = doc.books.find((b) => b.id === doc.activeBookId);
  const activeDraft = doc.drafts.find((d) => d.id === doc.activeDraftId);
  const draftName = activeDraft?.name ?? "Main draft";
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
  /**
   * Whether forking would actually copy anything, i.e. whether to ask.
   *
   * **A question, not a number.** This used to `reduce` `countWords` over every
   * chapter's manuscript — an exact total, computed on every render of a
   * component that is always mounted, to answer a yes/no. On a 300k-word book
   * that is a regex sweep of 1.7M characters per keystroke, and it was **the**
   * cost behind SPECS §9 item 14 (52ms per keystroke at 42MB, profiled to
   * `countWords`). `some` stops at the first chapter with prose, so the common
   * answer costs one chapter instead of thirty.
   *
   * Kept `countWords` rather than a `.trim()` test so the meaning does not
   * drift: a chapter holding only `***` counts zero words, and "has prose" must
   * keep agreeing with the number shown everywhere else.
   */
  const hasProseToFork = doc.chapters.some((c) => (c.manuscript ? countWords(c.manuscript) > 0 : false));
  const onSeriesMap = doc.seriesMode && level === "series";
  // The book timeline is a scrolling surface with no camera, so a zoom readout
  // there would report a number that controls nothing.
  const showZoom = !noBoard && !onSeriesMap && view !== "timeline";
  const wordStat = words >= 1000 ? `${(words / 1000).toFixed(1).replace(/\.0$/, "")}k words` : `${words} words`;
  const bookStat = piece
    ? `${formLabel(doc)} · ${wordStat} · ${countParts(doc, doc.chapters[0]?.scenes.length ?? 0)}`
    : anth
      ? `Anthology · ${wordStat} · ${doc.chapters.length} ${doc.chapters.length === 1 ? "piece" : "pieces"}`
      : `${formLabel(doc) ? `${formLabel(doc)} · ` : ""}${wordStat} · ${doc.chapters.length} chapters`;

  const seg = "px-3 py-[6px] rounded-[7px] text-[12px] font-medium cursor-pointer whitespace-nowrap";
  const segOn = `${seg} bg-card text-ink`;
  const segOff = `${seg} bg-transparent text-soft hover:bg-card`;
  const segIcon = "flex items-center rounded-[7px] px-[8px] py-[6px] text-soft hover:bg-card hover:text-ink";
  const action =
    "flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[11px] py-[7px] text-[12px] font-semibold text-ink hover:border-faint";
  const actionIcon =
    "flex shrink-0 items-center rounded-lg border border-rule bg-card px-[9px] py-[7px] text-ink hover:border-faint";
  const menuBtn =
    "relative flex items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-[7px] text-[12px] font-semibold text-ink hover:border-faint";
  const installDot = (
    <span
      aria-label="Install available"
      className="absolute -right-[3px] -top-[3px] h-[8px] w-[8px] rounded-full border-2 border-panel bg-but"
    />
  );

  /* ---- The bar's controls. Each is drawn live and again in the measurer,
     so both copies share one definition and cannot drift apart. ---- */

  const brand = (
    <span className="shrink-0 select-none font-serif text-[21px] font-semibold italic tracking-tight text-ink">
      Estoria
    </span>
  );
  const divider = <span className="h-[24px] w-px shrink-0 bg-rule" />;

  const versionChip = (ref?: RefObject<HTMLButtonElement | null>) => (
    <button
      ref={ref}
      onClick={() => setVersionMenu((v) => !v)}
      aria-expanded={ref ? versionMenu : undefined}
      // Capped, so a long version name cannot push the bar off the window.
      className="flex max-w-[190px] items-center gap-[6px] whitespace-nowrap rounded-lg border border-rule bg-card px-[9px] py-[5px] text-[12px] font-medium text-ink hover:border-faint"
      title={`Draft version: ${draftName}`}
    >
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-but" />
      <span className="truncate">{draftName}</span>
      <span className="shrink-0 text-faint">▾</span>
    </button>
  );

  /** Identity: series name -> book name, stat underneath, version to the right. */
  const identity = (live: boolean) => (
    <div className={`flex min-w-0 items-center gap-[10px] ${live && fit.squeeze ? "shrink" : "flex-shrink-0"}`}>
      <div className="flex min-w-0 flex-col leading-[1.15]">
        <div className="flex min-w-0 items-center gap-[5px]">
          {/* While a name is being renamed, the measurer's names reserve the
              rename input's 150px, so a short name turning into the input
              can't push the bar off the window. */}
          {doc.seriesMode ? (
            <>
              <EditableName
                value={doc.projectTitle}
                onChange={setProjectTitle}
                onNavigate={goToSeries}
                active={onSeriesMap}
                reserveInput={!live && renaming}
                onEditing={live ? setRenaming : undefined}
                placeholder="Series name"
              />
              <span className="text-faint">▸</span>
              <EditableName
                value={activeBook?.title ?? "Book"}
                onChange={(t) => activeBook && updateBook(activeBook.id, { title: t })}
                onNavigate={() => setLevel("book")}
                active={!onSeriesMap}
                reserveInput={!live && renaming}
                onEditing={live ? setRenaming : undefined}
                placeholder="Book name"
              />
            </>
          ) : (
            <EditableName
              value={doc.projectTitle}
              onChange={setProjectTitle}
              reserveInput={!live && renaming}
              onEditing={live ? setRenaming : undefined}
              placeholder={piece ? "Title" : "Story name"}
            />
          )}
        </div>
        <span className="truncate text-[10.5px] font-medium tracking-wide text-soft">{bookStat}</span>
      </div>

      {/* Version / draft dropdown — versions are per book, so hide on the
          series map. */}
      {!onSeriesMap && (
        <div className="shrink-0">
          {live ? versionChip(versionBtnRef) : versionChip()}
          {live && versionPopover}
        </div>
      )}
    </div>
  );

  // New chapter / Auto-arrange — board only.
  // Neither does anything the timeline can show. Auto-arrange lays out the
  // board's free-floating cards, and the timeline's rail is an ordered list
  // with no positions to arrange; a new chapter would be appended somewhere
  // off screen. Both dropped drag-to-reorder when the timeline became a
  // reading surface (§4), and this is the same rule applied to the toolbar.
  // The series map has New book / Auto-arrange, an anthology Add piece.
  const onBookBoard = !noBoard && !onSeriesMap && view === "board";
  const add = anth
    ? { label: "Add piece", run: () => setAddPieceDialog({ section: "" }) }
    : onSeriesMap
      ? { label: "New book", run: addBook }
      : onBookBoard
        ? { label: "New chapter", run: addChapter }
        : null;
  const arrange = onSeriesMap ? autoArrangeSeries : onBookBoard ? autoArrangeBoard : null;

  const addBtn = (icon: boolean) =>
    add &&
    (icon ? (
      <button onClick={add.run} className={actionIcon} title={add.label} aria-label={add.label}>
        <Icon name="plus" />
      </button>
    ) : (
      <button onClick={add.run} className={action}>
        <span className="-mt-px text-[15px] font-normal leading-none">+</span> {add.label}
      </button>
    ));
  const arrangeBtn = (icon: boolean) =>
    arrange &&
    (icon ? (
      <button onClick={arrange} className={actionIcon} title="Auto-arrange" aria-label="Auto-arrange">
        <Icon name="grid" />
      </button>
    ) : (
      <button onClick={arrange} className={action}>
        Auto-arrange
      </button>
    ));
  const actSep = <span className="h-[22px] w-px shrink-0 bg-rule" />;

  // View toggle: Board/Map vs Timeline. An anthology's Board sits where a
  // book's Board / Timeline switch does, so the way back from a piece is in the
  // same place as in a book.
  const viewSeg = anth ? (
    <div className="flex shrink-0 rounded-[9px] bg-chip p-[3px]">
      <button
        className={openCh ? segOff : segOn}
        onClick={closeChapter}
        aria-pressed={!openCh}
        title={openCh ? "Back to the board" : "The board of pieces"}
      >
        Board
      </button>
    </div>
  ) : !noBoard ? (
    <div className="flex shrink-0 rounded-[9px] bg-chip p-[3px]">
      <button className={view === "board" ? segOn : segOff} onClick={() => setView("board")} aria-pressed={view === "board"}>
        {onSeriesMap ? "Map" : "Board"}
      </button>
      <button
        className={view === "timeline" ? segOn : segOff}
        onClick={() => setView("timeline")}
        aria-pressed={view === "timeline"}
      >
        Timeline
      </button>
    </div>
  ) : null;
  const orientOn = (o: "vertical" | "horizontal") => view === "timeline" && orient === o;
  const pickOrient = (o: "vertical" | "horizontal") => {
    setOrient(o);
    setView("timeline");
  };
  const orientSeg = !noBoard && (
    <div className="flex shrink-0 rounded-[9px] bg-chip p-[3px]">
      {(["vertical", "horizontal"] as const).map((o) => (
        <button
          key={o}
          title={o === "vertical" ? "Vertical timeline" : "Horizontal timeline"}
          aria-label={o === "vertical" ? "Vertical timeline" : "Horizontal timeline"}
          aria-pressed={orientOn(o)}
          onClick={() => pickOrient(o)}
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[14px] ${
            orientOn(o) ? "bg-card text-ink" : "text-soft hover:bg-card"
          }`}
        >
          {o === "vertical" ? "↓" : "→"}
        </button>
      ))}
    </div>
  );
  // Scenes / Manuscript — a pane toggle, not a fourth view: the rail either
  // side of it is the same rail. Shown only on the timeline, because that is
  // the only surface with a pane to change. "Manuscript" rather than "Prose",
  // so one word means one thing here and in the chapter modal. It is also what
  // the export is called.
  const paneSeg = !noBoard && view === "timeline" && (
    <div className="flex shrink-0 rounded-[9px] bg-chip p-[3px]">
      <button
        title="Read the scene flow"
        onClick={() => setTimelinePane("scenes")}
        aria-pressed={pane === "scenes"}
        className={pane === "scenes" ? segOn : segOff}
      >
        Scenes
      </button>
      <button
        title="Read the chapters' manuscript"
        onClick={() => setTimelinePane("prose")}
        aria-pressed={pane === "prose"}
        className={pane === "prose" ? segOn : segOff}
      >
        Manuscript
      </button>
    </div>
  );

  // Characters / World / Notes (full-screen panels, see `Drawer`)
  const PANELS = [
    { key: "showChars", label: "Characters", icon: "user" },
    { key: "showWorld", label: "World", icon: "globe" },
    { key: "showNotes", label: "Notes", icon: "notes" },
  ] as const;
  const panelsSeg = (icon: boolean) => (
    <div className="flex shrink-0 gap-[2px] rounded-[9px] bg-chip p-[3px]">
      {PANELS.map((p) =>
        icon ? (
          <button key={p.key} className={segIcon} onClick={() => setPanel(p.key, true)} title={p.label} aria-label={p.label}>
            <Icon name={p.icon} />
          </button>
        ) : (
          <button key={p.key} className={segOff} onClick={() => setPanel(p.key, true)}>
            {p.label}
          </button>
        )
      )}
    </div>
  );

  const fileBtn = (ref?: RefObject<HTMLButtonElement | null>) => (
    <button ref={ref} onClick={toggleNewMenu} aria-expanded={ref ? newMenu : undefined} className={menuBtn}>
      File <span className="opacity-70">▾</span>
    </button>
  );
  const settingsBtn = (ref?: RefObject<HTMLButtonElement | null>) => (
    <button
      ref={ref}
      onClick={() => setSettingsMenu((v) => !v)}
      aria-expanded={ref ? settingsMenu : undefined}
      className={menuBtn}
    >
      Settings <span className="opacity-70">▾</span>
      {offerInstall && installDot}
    </button>
  );
  const moreBtn = (ref?: RefObject<HTMLButtonElement | null>) => (
    <button
      ref={ref}
      onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}
      aria-expanded={ref ? moreOpen : undefined}
      aria-controls={ref && moreOpen ? "toolbar-more" : undefined}
      title="More commands"
      className={menuBtn}
    >
      More <span className="opacity-70">▾</span>
      {/* The install offer follows Settings into More. */}
      {ref && folds("settings") && offerInstall && installDot}
    </button>
  );

  /* ---- Menu contents, shared by each menu's own button and by More. ---- */

  /** Your work only; the app itself lives under Settings. Groups: projects and
      their shape; files in and out, and backups; author details, on their own
      because they change least often. Android-only entries (Sync settings,
      Books/Series, Versions) are simply absent here. `done` closes whichever
      menu is showing these. */
  const fileItems = (done: () => void) => {
    const go = (fn: () => void) => () => {
      fn();
      done();
    };
    return (
      <>
        <MenuItem title="Open project" sub="Switch between your projects" onClick={go(() => setPanel("showProjects", true))} />
        <MenuItem
          title="New project"
          sub="A single piece, a book, or a series"
          onClick={go(() => setPanel("showNewBook", true))}
        />
        {/* Changes of form. Each opens a dialog that says what happens, and
            each saves a copy first. */}
        {piece && (
          <MenuItem
            title="Expand into a book"
            sub="This becomes Chapter 1. A copy is saved first."
            onClick={go(() => setFormDialog("expand"))}
          />
        )}
        {canCollapse(doc) && (
          <MenuItem
            title="Turn into single piece"
            sub="Join the chapters into one piece. A copy is saved first."
            onClick={go(() => setFormDialog("collapse"))}
          />
        )}
        {canMakeAnthology(doc) && (
          <MenuItem
            title="Make this an anthology"
            sub="Each chapter becomes a piece. Nothing is joined. A copy is saved first."
            onClick={go(() => setFormDialog("anthology"))}
          />
        )}
        {anth && (
          <MenuItem
            title="Make this a book"
            sub="The pieces become numbered chapters. A copy is saved first."
            onClick={go(() => setFormDialog("book"))}
          />
        )}
        {!doc.form && !doc.seriesMode && (
          <MenuItem
            title="Make this a series"
            sub="This becomes Book One. A copy is saved first."
            onClick={go(() => setFormDialog("series"))}
          />
        )}
        {!noBoard && !onSeriesMap && (
          <MenuItem
            title="Use a template"
            sub="Three-act, Hero's Journey, Save the Cat..."
            onClick={go(() => setPanel("showTemplates", true))}
          />
        )}
        <div className="mx-[6px] my-1 h-px bg-rule" />
        <MenuItem title="Import markdown" sub="Bring an existing draft via AI" onClick={go(() => setPanel("showImport", true))} />
        <MenuItem title="Save to file" sub="Markdown vault or project file" onClick={go(() => setPanel("showExport", true))} />
        {/* Needs folder access (File System Access API) or Google Drive, like the footer Sync. */}
        {(isBackupPickerSupported() || activeTarget() === "drive") && (
          <MenuItem
            title="Backups & conflict copies"
            sub="Restore a copy from your Estoria folder"
            onClick={go(() => setPanel("showBackups", true))}
          />
        )}
        <div className="mx-[6px] my-1 h-px bg-rule" />
        <MenuItem title="Pace" sub="Your writing pace against your goals" onClick={go(() => setPanel("showPace", true))} />
        <div className="mx-[6px] my-1 h-px bg-rule" />
        <MenuItem
          title="Author details"
          sub="Byline and contact for the title page"
          onClick={go(() => setPanel("showAuthor", true))}
        />
      </>
    );
  };

  /** Settings: the app rather than the work. Display first, then where this
      device backs up, then the "about this app" items last, the way a Settings
      screen ends on iOS, Android and Windows. */
  const settingsItems = (done: () => void) => (
    <>
      {/* Stays open while stepping, so you can watch the board resize. */}
      {showZoom && (
        <div className="flex items-center justify-between px-[11px] py-[6px]">
          <span className="text-[12.5px] font-semibold text-ink">Zoom</span>
          <div className="flex items-center gap-[2px] rounded-[9px] bg-chip p-[3px]">
            <button
              onClick={zoomOut}
              aria-label="Zoom out"
              className="h-[24px] w-[26px] rounded-md text-[16px] font-semibold text-ink hover:bg-card"
            >
              −
            </button>
            <span className="min-w-[40px] text-center font-mono text-[11px] font-medium text-soft">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              aria-label="Zoom in"
              className="h-[24px] w-[26px] rounded-md text-[15px] font-semibold text-ink hover:bg-card"
            >
              +
            </button>
          </div>
        </div>
      )}
      {/* Theme (Light / Dark / Auto) and Background (the scene). */}
      <LookSettings />
      {/* Where this device backs up: connect Google Drive, or change or disconnect it. */}
      {driveAvailableHere() && (
        <MenuItem
          title="Google Drive"
          sub={
            activeTarget() === "drive"
              ? `Backing up${driveAuth.connectedEmail() ? ` as ${driveAuth.connectedEmail()}` : " to your Drive"}`
              : "Back up and sync with your Google Drive"
          }
          onClick={() => {
            done();
            openDriveChooser();
          }}
        />
      )}
      <div className="mx-[6px] my-1 h-px bg-rule" />
      {/* Pointless once Estoria is already running in its own window. */}
      {offerInstall && (
        <MenuItem
          title="Install Estoria"
          sub="Own window and icon, works offline"
          onClick={() => {
            done();
            setPanel("showInstall", true);
          }}
        />
      )}
      <a
        href="https://www.labrarf.com/contact"
        target="_blank"
        rel="noopener noreferrer"
        onClick={done}
        className="flex flex-col gap-[2px] rounded-lg px-[11px] py-[9px] text-left hover:bg-chip"
      >
        <span className="text-[12.5px] font-semibold text-ink">Contact</span>
        <span className="text-[11px] font-normal text-soft">Questions, feedback, or say hello</span>
      </a>
      <MenuItem
        title="About Estoria"
        onClick={() => {
          done();
          setPanel("showAbout", true);
        }}
      />
    </>
  );

  /** More: whatever has folded off the bar, in the bar's own order, with File
      and Settings as rows that open their full menu in place. */
  const moreTop = () => {
    // Rows that change something in place hand focus back to More, as the
    // bar's own button would have kept it; rows that open a panel don't,
    // because the panel takes focus.
    const pick = (fn: () => void, keepFocus = true) => () => {
      fn();
      closeMore();
      if (keepFocus) refocusMore();
    };
    const acts = [
      folds("add") && add && <MoreItem key="add" label={`+ ${add.label}`} onClick={pick(add.run, !anth)} />,
      folds("arrange") && arrange && <MoreItem key="arr" label="Auto-arrange" onClick={pick(arrange)} />,
    ].filter(Boolean);
    const views = [
      ...(folds("viewseg") && anth
        ? [<MoreItem key="b" label="Board" pressed={!openCh} onClick={pick(closeChapter)} />]
        : folds("viewseg") && !noBoard
          ? [
              <MoreItem key="b" label={onSeriesMap ? "Map" : "Board"} pressed={view === "board"} onClick={pick(() => setView("board"))} />,
              <MoreItem key="t" label="Timeline" pressed={view === "timeline"} onClick={pick(() => setView("timeline"))} />,
            ]
          : []),
      ...(folds("orient") && !noBoard
        ? [
            <MoreItem key="v" label="Vertical timeline ↓" pressed={orientOn("vertical")} onClick={pick(() => pickOrient("vertical"))} />,
            <MoreItem key="h" label="Horizontal timeline →" pressed={orientOn("horizontal")} onClick={pick(() => pickOrient("horizontal"))} />,
          ]
        : []),
      ...(folds("pane") && paneSeg
        ? [
            <MoreItem key="s" label="Scenes" pressed={pane === "scenes"} onClick={pick(() => setTimelinePane("scenes"))} />,
            <MoreItem key="m" label="Manuscript" pressed={pane === "prose"} onClick={pick(() => setTimelinePane("prose"))} />,
          ]
        : []),
    ];
    const sections: ReactNode[] = [];
    const section = (key: string, heading: string | null, rows: ReactNode[]) => {
      if (!rows.length) return;
      if (sections.length) sections.push(<div key={`${key}-sep`} className="mx-[6px] my-1 h-px bg-rule" />);
      if (heading) sections.push(<MenuHeading key={`${key}-h`}>{heading}</MenuHeading>);
      sections.push(...rows);
    };
    section("acts", onSeriesMap ? "On the map" : "On the board", acts);
    section("view", "View", views);
    section(
      "open",
      "Open",
      folds("panels") ? PANELS.map((p) => <MoreItem key={p.key} label={p.label} onClick={pick(() => setPanel(p.key, true), false)} />) : []
    );
    section("menus", null, [
      folds("file") && (
        <MoreDrill key="file" label="File" autoFocus={moreFrom === "file"} onClick={() => setMoreLevel("file")} />
      ),
      folds("settings") && (
        <MoreDrill
          key="settings"
          label="Settings"
          dot={offerInstall}
          autoFocus={moreFrom === "settings"}
          onClick={() => setMoreLevel("settings")}
        />
      ),
    ].filter(Boolean));
    return sections;
  };

  const versionPopover = (
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
            title={d.id === mainDraftId ? "This is the main version" : `Make "${d.name}" the main version`}
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
      <div className="px-[8px] pb-[2px] pt-[4px] text-[10px] leading-[1.4] text-faint">★ marks the main version</div>
      <div className="mx-[6px] my-1 h-px bg-rule" />
      {/* Prose forks with the version, so a fork has a cost — and the
          question is only worth asking when there is prose to copy.
          With none written, the two answers are the same and it just adds
          a click. */}
      {forkChoice ? (
        <div className="px-[8px] pb-[6px] pt-[2px]">
          <div className="pb-[6px] text-[11px] leading-[1.45] text-soft">Take the writing with it?</div>
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
            <span className="block text-[10.5px] font-normal text-faint">The map, with none of the prose</span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            if (hasProseToFork) return setForkChoice(true);
            addDraft();
            setVersionMenu(false);
          }}
          className="w-full rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip"
        >
          + Add version
        </button>
      )}
    </Popover>
  );

  const showAdd = !!add && !folds("add");
  const showArrange = !!arrange && !folds("arrange");
  const showViewSeg = !!viewSeg && !folds("viewseg");
  const showOrient = !!orientSeg && !folds("orient");
  const showPane = !!paneSeg && !folds("pane");

  return (
    <>
      <div
        ref={barRef}
        // No sideways scroll: what doesn't fit folds into More instead.
        className="scene-bar scene-hide-under-modal relative z-30 flex items-center gap-[10px] overflow-hidden border-b border-rule bg-panel px-4 py-[8px]"
      >
        {brand}
        {divider}
        {identity(true)}

        <div className="flex-1" />

        {showAdd && addBtn(compact)}
        {showArrange && arrangeBtn(compact)}
        {(showAdd || showArrange) && actSep}

        {(showViewSeg || showOrient || showPane) && (
          <div className="flex shrink-0 items-center gap-[6px]">
            {showViewSeg && viewSeg}
            {showOrient && orientSeg}
            {showPane && paneSeg}
          </div>
        )}

        {!folds("panels") && panelsSeg(compact)}

        {fit.folded.size > 0 && (
          <div className="shrink-0">
            {moreBtn(moreBtnRef)}
            <Popover
              id="toolbar-more"
              label={moreLevel === "file" ? "File" : moreLevel === "settings" ? "Settings" : "More"}
              anchorRef={moreBtnRef}
              open={moreOpen}
              onClose={closeMore}
              align="right"
              width={260}
              navigable
              focusKey={moreLevel}
              onEscape={moreLevel === "top" ? undefined : moreBack}
            >
              {moreLevel === "top" ? (
                moreTop()
              ) : (
                <>
                  <button
                    onClick={moreBack}
                    aria-label="Back to More"
                    data-skip-focus
                    className="flex items-center gap-[8px] rounded-lg px-[11px] py-[7px] text-left text-[12.5px] font-medium text-soft hover:bg-chip focus-visible:bg-chip"
                  >
                    <span aria-hidden="true">‹</span> More
                  </button>
                  <div className="mx-[6px] my-1 h-px bg-rule" />
                  <MenuHeading>{moreLevel === "file" ? "File" : "Settings"}</MenuHeading>
                  {moreLevel === "file" ? fileItems(closeMore) : settingsItems(closeMore)}
                </>
              )}
            </Popover>
          </div>
        )}

        {/* File menu */}
        {!folds("file") && (
          <div className="shrink-0">
            {fileBtn(fileBtnRef)}
            <Popover anchorRef={fileBtnRef} open={newMenu} onClose={closeNewMenu} align="right" width={244}>
              {fileItems(closeNewMenu)}
            </Popover>
          </div>
        )}

        {/* Settings */}
        {!folds("settings") && (
          <div className="shrink-0">
            {settingsBtn(settingsBtnRef)}
            <Popover
              anchorRef={settingsBtnRef}
              open={settingsMenu}
              onClose={() => setSettingsMenu(false)}
              align="right"
              width={244}
            >
              {settingsItems(() => setSettingsMenu(false))}
            </Popover>
          </div>
        )}
      </div>

      {/* The measurer: every control in both forms, off-layout and invisible,
          so `fitToolbar` always knows what the full bar would need. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        inert
        className="pointer-events-none invisible fixed left-0 top-0 -z-10 flex w-max items-center gap-[10px]"
      >
        <Measure k="brand">{brand}</Measure>
        <Measure k="divider">{divider}</Measure>
        <Measure k="identity">{identity(false)}</Measure>
        {add && <Measure k="add">{addBtn(false)}</Measure>}
        {add && <Measure k="add-icon">{addBtn(true)}</Measure>}
        {arrange && <Measure k="arrange">{arrangeBtn(false)}</Measure>}
        {arrange && <Measure k="arrange-icon">{arrangeBtn(true)}</Measure>}
        <Measure k="actsep">{actSep}</Measure>
        {viewSeg && <Measure k="viewseg">{viewSeg}</Measure>}
        {orientSeg && <Measure k="orient">{orientSeg}</Measure>}
        {paneSeg && <Measure k="pane">{paneSeg}</Measure>}
        <Measure k="panels">{panelsSeg(false)}</Measure>
        <Measure k="panels-icon">{panelsSeg(true)}</Measure>
        <Measure k="file">{fileBtn()}</Measure>
        <Measure k="settings">{settingsBtn()}</Measure>
        <Measure k="more">{moreBtn()}</Measure>
      </div>
    </>
  );
}

function Measure({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span data-m={k} className="flex shrink-0">
      {children}
    </span>
  );
}

/** Feather-style line icons (24 grid, 2px stroke), as in `LookSettings`. */
function Icon({ name }: { name: "plus" | "grid" | "user" | "globe" | "notes" }) {
  // The 18px box matches a 12px label's line, so icon buttons stand as tall as worded ones.
  return (
    <span className="flex h-[18px] items-center">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        {name === "plus" && (
          <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </>
        )}
        {name === "grid" && (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </>
        )}
        {name === "user" && (
          <>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </>
        )}
        {name === "globe" && (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </>
        )}
        {name === "notes" && (
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </>
        )}
      </svg>
    </span>
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
  reserveInput,
  onEditing,
}: {
  value: string;
  onChange: (v: string) => void;
  onNavigate?: () => void;
  active?: boolean;
  placeholder?: string;
  /** At least as wide as the rename input (the toolbar's measurer copy). */
  reserveInput?: boolean;
  onEditing?: (on: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    onEditing?.(editing);
    // Unmounted mid-rename (a project switch): stop reserving the room.
    return () => {
      if (editing) onEditing?.(false);
    };
  }, [editing, onEditing]);
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
      className={`${reserveInput ? "min-w-[150px] text-left " : ""}max-w-[200px] truncate text-[13.5px] font-semibold decoration-dotted decoration-rule underline-offset-2 hover:underline ${
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
      className="flex flex-col gap-[2px] rounded-lg px-[11px] py-[9px] text-left hover:bg-chip focus-visible:bg-chip"
    >
      <span className="text-[12.5px] font-semibold text-ink">{title}</span>
      {sub && <span className="text-[11px] font-normal text-soft">{sub}</span>}
    </button>
  );
}

function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-[11px] pb-[3px] pt-[5px] text-[10px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
}

/** A More row. `pressed` makes it a toggle, shown with a filled or open dot. */
function MoreItem({ label, pressed, onClick }: { label: string; pressed?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className="flex items-center gap-[9px] rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip focus-visible:bg-chip"
    >
      <span aria-hidden="true" className="flex w-[9px] shrink-0 justify-center">
        {pressed != null && (
          <span className={`h-[7px] w-[7px] rounded-full ${pressed ? "bg-therefore" : "border border-faint"}`} />
        )}
      </span>
      {label}
    </button>
  );
}

/** A More row that opens File or Settings in place. */
function MoreDrill({
  label,
  dot,
  autoFocus,
  onClick,
}: {
  label: string;
  dot?: boolean;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-autofocus={autoFocus || undefined}
      className="flex items-center gap-[9px] rounded-lg px-[11px] py-[8px] text-left text-[12.5px] font-semibold text-ink hover:bg-chip focus-visible:bg-chip"
    >
      <span aria-hidden="true" className="w-[9px] shrink-0" />
      {label}
      {dot && <span aria-label="Install available" className="h-[7px] w-[7px] rounded-full bg-but" />}
      <span aria-hidden="true" className="ml-auto text-[15px] leading-none text-faint">
        ›
      </span>
    </button>
  );
}
