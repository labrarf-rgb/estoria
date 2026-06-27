import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Toolbar } from "@/components/Toolbar";
import { Board } from "@/components/Board";
import { SeriesMap } from "@/components/SeriesMap";
import { Footer } from "@/components/Footer";
import { ChapterDetail } from "@/components/ChapterDetail";
import { Lightbox } from "@/components/Lightbox";
import { CharactersPanel } from "@/components/panels/CharactersPanel";
import { WorldPanel } from "@/components/panels/WorldPanel";
import { NotesPanel } from "@/components/panels/NotesPanel";
import { ExportModal } from "@/components/modals/ExportModal";
import { TemplatesModal } from "@/components/modals/TemplatesModal";
import { ImportModal } from "@/components/modals/ImportModal";

export function App() {
  const theme = useStore((s) => s.theme);
  const openCh = useStore((s) => s.openCh);
  const seriesMode = useStore((s) => s.doc.seriesMode);
  const level = useStore((s) => s.level);
  const onSeriesMap = seriesMode && level === "series";

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
      {onSeriesMap ? <SeriesMap /> : <Board />}
      <Footer />

      {openCh && !onSeriesMap && <ChapterDetail />}
      <CharactersPanel />
      <WorldPanel />
      <NotesPanel />
      <ExportModal />
      <TemplatesModal />
      <ImportModal />
      <Lightbox />
    </div>
  );
}
