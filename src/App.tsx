import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Toolbar } from "@/components/Toolbar";
import { Board } from "@/components/Board";
import { ChapterDetail } from "@/components/ChapterDetail";
import { CharactersPanel } from "@/components/panels/CharactersPanel";
import { WorldPanel } from "@/components/panels/WorldPanel";
import { NotesPanel } from "@/components/panels/NotesPanel";
import { ExportModal } from "@/components/modals/ExportModal";
import { TemplatesModal } from "@/components/modals/TemplatesModal";
import { ImportModal } from "@/components/modals/ImportModal";
import { SeriesModal } from "@/components/modals/SeriesModal";

export function App() {
  const theme = useStore((s) => s.theme);
  const openCh = useStore((s) => s.openCh);

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
      <Board />

      {openCh && <ChapterDetail />}
      <CharactersPanel />
      <WorldPanel />
      <NotesPanel />
      <ExportModal />
      <TemplatesModal />
      <ImportModal />
      <SeriesModal />
    </div>
  );
}
