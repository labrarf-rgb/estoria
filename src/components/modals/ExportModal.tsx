import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { buildMarkdown } from "@/lib/markdown";
import { downloadProjectFile, slugify } from "@/store/persistence";

export function ExportModal() {
  const show = useStore((s) => s.showExport);
  const doc = useStore((s) => s.doc);
  const draft = useStore((s) => s.draft);
  const setPanel = useStore((s) => s.setPanel);
  const [copied, setCopied] = useState(false);
  if (!show) return null;
  const close = () => setPanel("showExport", false);

  const md = buildMarkdown(doc, draft);
  const words = doc.chapters.reduce((a, c) => a + c.words, 0);

  const copy = () => {
    navigator.clipboard?.writeText(md).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(doc.projectTitle)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[86vh] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-[24px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[18px] font-semibold text-ink">Export to Markdown</div>
            <div className="mt-[3px] text-[12px] font-medium text-soft">
              Vault-ready — chapters become notes, characters become{" "}
              <span className="font-mono">[[wikilinks]]</span> for Obsidian.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>
        <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap bg-card px-[24px] py-5 font-mono text-[12.5px] leading-[1.7] text-ink">
          {md}
        </pre>
        <div className="flex items-center gap-[10px] border-t border-rule px-[24px] py-4">
          <button
            onClick={copy}
            className="rounded-[9px] bg-ink px-4 py-[9px] text-[13px] font-semibold text-bg"
          >
            {copied ? "Copied ✓" : "Copy markdown"}
          </button>
          <button
            onClick={download}
            className="rounded-[9px] border border-rule bg-card px-4 py-[9px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Download .md
          </button>
          <button
            onClick={() => downloadProjectFile(doc)}
            className="rounded-[9px] border border-rule bg-card px-4 py-[9px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Save project (.json)
          </button>
          <div className="flex-1" />
          <span className="text-[11.5px] font-medium text-faint">
            {words.toLocaleString()} words · {doc.chapters.length} chapters
          </span>
        </div>
      </div>
    </Scrim>
  );
}
