import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { importPrompt, parseImportMarkdown, type ParseResult } from "@/lib/markdown";

export function ImportModal() {
  const show = useStore((s) => s.showImport);
  const setPanel = useStore((s) => s.setPanel);
  const openDoc = useStore((s) => s.openDoc);
  const [copied, setCopied] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!show) return null;
  const close = () => {
    setParsed(null);
    setError(null);
    setPanel("showImport", false);
  };

  const prompt = importPrompt();
  const copyPrompt = () => {
    navigator.clipboard?.writeText(prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const handleFile = async (f: File) => {
    setError(null);
    try {
      const text = await f.text();
      const res = parseImportMarkdown(text, f.name);
      if (res.summary.chapters === 0) {
        setError(
          "No chapters found. Make sure the file uses the schema above (## Act 1, then ### 1. Title)."
        );
        setParsed(null);
        return;
      }
      setParsed(res);
    } catch {
      setError("Could not read that file.");
      setParsed(null);
    }
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    void handleFile(f);
  };
  // Without these, dropping a file triggers the browser's default handling
  // and navigates away from the app.
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };
  const openImported = () => {
    if (parsed) openDoc(parsed.doc);
    setParsed(null);
  };

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="flex max-h-[88vh] w-[min(820px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start gap-3 border-b border-rule px-[24px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">Import an existing draft</div>
            <div className="mt-1 text-[12.5px] font-medium leading-[1.5] text-soft">
              Already have a manuscript in Word, Google Docs, or scattered notes? Let an AI turn it
              into an Estoria-ready markdown file, then drop it in below.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>
        <div className="flex flex-col gap-5 overflow-auto px-[24px] py-[22px]">
          <Step n={1} title="Copy this prompt into ChatGPT, Claude, or Gemini">
            <p className="mb-[11px] text-[12.5px] leading-[1.5] text-soft">
              Paste it along with your manuscript. The AI returns a markdown file that breaks your
              story into chapters and scenes, sets up characters, and maps the world.
            </p>
            <div className="relative overflow-hidden rounded-[11px] border border-rule bg-card">
              <pre className="m-0 max-h-[200px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[11.5px] leading-[1.6] text-ink">
                {prompt}
              </pre>
              <button
                onClick={copyPrompt}
                className="absolute right-[11px] top-[11px] rounded-lg bg-ink px-[13px] py-[7px] text-[12px] font-semibold text-bg"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </Step>
          <Step n={2} title="Upload the markdown file it gives you">
            <p className="mb-[11px] text-[12.5px] leading-[1.5] text-soft">
              Estoria reads the chapters, scenes, characters and world straight off the file and
              opens it as a new project (your current one stays in My Projects).
            </p>
            <label
              onDragOver={onDragOver}
              onDrop={onDrop}
              className="flex cursor-pointer flex-col items-center justify-center gap-[7px] rounded-xl border-[1.5px] border-dashed border-line bg-card p-[26px] text-center hover:border-faint"
            >
              <span className="text-[13px] font-semibold text-ink">
                Drop a .md file here, or click to browse
              </span>
              <span className="text-[11.5px] text-faint">Accepts Markdown (.md, .markdown, .txt)</span>
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={onFile}
                className="hidden"
              />
            </label>
            {error && (
              <div className="mt-3 rounded-[11px] border border-but bg-card px-[15px] py-[12px] text-[12.5px] font-medium text-ink">
                {error}
              </div>
            )}
            {parsed && (
              <div className="mt-3 flex items-center gap-3 rounded-[11px] border border-therefore bg-card px-[15px] py-[13px]">
                <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-therefore text-[15px] font-semibold text-white">
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">
                    {parsed.doc.projectTitle}
                  </div>
                  <div className="mt-[2px] font-mono text-[11.5px] font-medium text-soft">
                    {parsed.summary.chapters} chapters · {parsed.summary.scenes} scenes ·{" "}
                    {parsed.summary.characters} characters · {parsed.doc.world.length} world
                  </div>
                </div>
                <button
                  onClick={openImported}
                  className="flex-shrink-0 rounded-lg bg-ink px-[14px] py-[8px] text-[12.5px] font-semibold text-bg"
                >
                  Open imported story
                </button>
              </div>
            )}
          </Step>
        </div>
      </div>
    </Scrim>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-[14px]">
      <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-bg">
        {n}
      </span>
      <div className="flex-1">
        <div className="mb-1 text-[14px] font-semibold text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}
