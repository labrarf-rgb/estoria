import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Toolbar } from "@/components/Toolbar";
import { Board } from "@/components/Board";
import { Timeline } from "@/components/Timeline";
import { SeriesMap } from "@/components/SeriesMap";
import { Footer } from "@/components/Footer";
import { ChapterModal } from "@/components/ChapterModal";
import { Lightbox } from "@/components/Lightbox";
import { Welcome } from "@/components/Welcome";
import { CharactersPanel } from "@/components/panels/CharactersPanel";
import { WorldPanel } from "@/components/panels/WorldPanel";
import { NotesPanel } from "@/components/panels/NotesPanel";
import { ExportModal } from "@/components/modals/ExportModal";
import { TemplatesModal } from "@/components/modals/TemplatesModal";
import { ImportModal } from "@/components/modals/ImportModal";
import { NewBookModal } from "@/components/modals/NewBookModal";
import { ProjectsModal } from "@/components/modals/ProjectsModal";
import { BackupsModal } from "@/components/modals/BackupsModal";
import { AboutModal } from "@/components/modals/AboutModal";
import { InstallModal } from "@/components/modals/InstallModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UpdateToast } from "@/components/UpdateToast";

export function App() {
  const theme = useStore((s) => s.theme);
  const openCh = useStore((s) => s.openCh);
  const seriesMode = useStore((s) => s.doc.seriesMode);
  const level = useStore((s) => s.level);
  const view = useStore((s) => s.view);
  const onSeriesMap = seriesMode && level === "series";
  // The book-level timeline is its own surface (a scrolling rail + scene pane),
  // not a mode of the board's canvas. The series map still renders its own
  // timeline of books internally.
  const onTimeline = !onSeriesMap && view === "timeline";

  // Drive theming off the document model via the data-theme attribute.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div
      data-theme={theme}
      className="fixed inset-0 flex flex-col overflow-hidden bg-bg text-ink"
    >
      <Toolbar />
      {onSeriesMap ? <SeriesMap /> : onTimeline ? <Timeline /> : <Board />}
      <Footer />

      {openCh && !onSeriesMap && <ChapterModal />}
      {/* Side panels are modal overlays: the app behind them is dimmed and
          inert, one panel at a time (see `Drawer`). */}
      <CharactersPanel />
      <WorldPanel />
      <NotesPanel />
      <ExportModal />
      <TemplatesModal />
      <ImportModal />
      <NewBookModal />
      <ProjectsModal />
      <BackupsModal />
      <AboutModal />
      <InstallModal />
      <ConfirmDialog />
      <Lightbox />
      <Welcome />
      <UpdateToast />
    </div>
  );
}
