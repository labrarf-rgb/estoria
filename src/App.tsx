import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Toolbar } from "@/components/Toolbar";
import { Board } from "@/components/Board";
import { Timeline } from "@/components/Timeline";
import { SeriesMap } from "@/components/SeriesMap";
import { Footer } from "@/components/Footer";
import { ChapterModal } from "@/components/ChapterModal";
import { PieceView } from "@/components/PieceView";
import { AnthologyView } from "@/components/AnthologyView";
import { AddPieceModal, TakeOutModal } from "@/components/modals/AnthologyModals";
import { FormChangeModal, SavedNotice } from "@/components/modals/FormChangeModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChapterCrash } from "@/components/CrashScreen";
import { Lightbox } from "@/components/Lightbox";
import { Welcome } from "@/components/Welcome";
import { Recovery } from "@/components/Recovery";
import { CharactersPanel } from "@/components/panels/CharactersPanel";
import { WorldPanel } from "@/components/panels/WorldPanel";
import { NotesPanel } from "@/components/panels/NotesPanel";
import { ExportModal } from "@/components/modals/ExportModal";
import { TemplatesModal } from "@/components/modals/TemplatesModal";
import { ImportModal } from "@/components/modals/ImportModal";
import { NewBookModal } from "@/components/modals/NewBookModal";
import { ProjectsModal } from "@/components/modals/ProjectsModal";
import { BackupsModal } from "@/components/modals/BackupsModal";
import { DriveChooserModal } from "@/components/modals/DriveChooserModal";
import { startDriveRuntime } from "@/lib/driveSession";
import { AboutModal } from "@/components/modals/AboutModal";
import { AuthorModal } from "@/components/modals/AuthorModal";
import { PaceModal } from "@/components/modals/PaceModal";
import { InstallModal } from "@/components/modals/InstallModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UpdateToast } from "@/components/UpdateToast";
import { SceneBackground } from "@/components/backgrounds";
import { paperTile } from "@/components/backgrounds/paper";
import { sceneToShow } from "@/lib/look";

export function App() {
  const theme = useStore((s) => s.theme);
  const themeMode = useStore((s) => s.themeMode);
  const tickAutoTheme = useStore((s) => s.tickAutoTheme);
  const sceneLight = useStore((s) => s.sceneLight);
  const sceneDark = useStore((s) => s.sceneDark);
  const shufflePicks = useStore((s) => s.shufflePicks);
  const scene = sceneToShow({ sceneLight, sceneDark }, shufflePicks, theme);
  const openCh = useStore((s) => s.openCh);
  const seriesMode = useStore((s) => s.doc.seriesMode);
  const level = useStore((s) => s.level);
  const view = useStore((s) => s.view);
  const chapterMode = useStore((s) => s.chapterMode);
  // A single piece has no board: it is its own page. See `PieceView`.
  const piece = useStore((s) => s.doc.form === "piece");
  // An anthology has its own board, and opens a piece as a page. See `AnthologyView`.
  const anthology = useStore((s) => s.doc.form === "anthology");
  const onSeriesMap = seriesMode && level === "series";
  // The book-level timeline is its own surface (a scrolling rail + scene pane),
  // not a mode of the board's canvas. The series map still renders its own
  // timeline of books internally.
  const onTimeline = !onSeriesMap && view === "timeline";

  // Google Drive, on devices where it's switched on: kill-switch checks, and
  // the result of a sign-in that just returned. A no-op everywhere else.
  useEffect(() => startDriveRuntime(), []);

  // Drive theming off the document model via the data-theme attribute.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Plain's paper texture, painted once per theme (index.css `.scene-paper`).
  useEffect(() => {
    const url = paperTile(theme);
    document.documentElement.style.setProperty("--paper", url ? `url(${url})` : "none");
  }, [theme]);

  // Auto theme follows the clock: checked now, about once a minute, and when
  // the tab comes back (a laptop opened at night after a day asleep).
  useEffect(() => {
    if (themeMode !== "auto") return;
    tickAutoTheme();
    const iv = window.setInterval(tickAutoTheme, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tickAutoTheme();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [themeMode, tickAutoTheme]);

  return (
    <div
      data-theme={theme}
      // With a scene on, the root lets it through (the scene layer sits behind
      // the app, fixed to the viewport). On Plain it paints --bg as always.
      className={`scene-paper fixed inset-0 flex flex-col overflow-hidden text-ink ${scene === "plain" ? "bg-bg" : ""}`}
    >
      <SceneBackground scene={scene} theme={theme} />
      <Toolbar />
      {/* `contents`: no box of its own, it only hides the view behind a
          full-window modal while a scene is on (index.css). */}
      <div className="scene-hide-under-modal contents">
        {piece ? <PieceView /> : anthology ? <AnthologyView /> : onSeriesMap ? <SeriesMap /> : onTimeline ? <Timeline /> : <Board />}
      </div>
      <Footer />

      {/* The chapter modal catches its own errors, because the board behind it
          is still perfectly good: a chapter that won't draw should cost you the
          chapter, not the session. Keyed on which chapter and which face of it,
          so closing it or stepping to the next one re-arms the boundary. */}
      {openCh && !onSeriesMap && !piece && !anthology && (
        <ErrorBoundary
          resetKey={`${openCh}:${chapterMode}`}
          fallback={(error, retry) => <ChapterCrash error={error} retry={retry} />}
        >
          <ChapterModal />
        </ErrorBoundary>
      )}
      {/* The panels are full-screen modal overlays: the app behind them is
          inert, one panel at a time (see `Drawer`). */}
      <CharactersPanel />
      <WorldPanel />
      <NotesPanel />
      <ExportModal />
      <TemplatesModal />
      <ImportModal />
      <NewBookModal />
      <ProjectsModal />
      <FormChangeModal />
      <AddPieceModal />
      <TakeOutModal />
      <SavedNotice />
      <BackupsModal />
      <DriveChooserModal />
      <AboutModal />
      <AuthorModal />
      <PaceModal />
      <InstallModal />
      <ConfirmDialog />
      <Lightbox />
      <Welcome />
      {/* Above everything: when the stored document couldn't be read, nothing
          else on screen is safe to act on. See components/Recovery.tsx. */}
      <Recovery />
      <UpdateToast />
    </div>
  );
}
