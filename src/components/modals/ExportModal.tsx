import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { buildMarkdown } from "@/lib/markdown";
import {
  buildDocx,
  buildManuscriptMarkdown,
  buildManuscriptText,
  manuscriptWordCount,
  writtenChapters,
} from "@/lib/manuscriptExport";
import { downloadProjectFile, slugify } from "@/store/persistence";

/**
 * Two exports, kept apart on purpose.
 *
 * **Story map** is the Obsidian-shaped export this app has always had: scenes as
 * bullets, connectors, characters as wikilinks. **Manuscript** is the prose, for
 * a person who is going to read the book. They have different purposes and
 * different audiences, and merging them would produce a file that serves
 * neither — so the modal says which is which rather than offering one export
 * with a format dropdown.
 */
type Tab = "map" | "manuscript";

function save(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportModal() {
  const show = useStore((s) => s.showExport);
  const doc = useStore((s) => s.doc);
  const setPanel = useStore((s) => s.setPanel);
  const setAuthor = useStore((s) => s.setAuthor);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  if (!show) return null;
  const close = () => setPanel("showExport", false);

  const md = buildMarkdown(doc);
  const written = writtenChapters(doc);
  const proseWords = manuscriptWordCount(doc);
  const slug = slugify(doc.projectTitle);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const preview = tab === "map" ? md : buildManuscriptMarkdown(doc);

  return (
    <Scrim onClose={close} z={60} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[86vh] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start gap-3 border-b border-rule px-[24px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[18px] font-semibold text-ink">Save to file</div>
            <div className="mt-[3px] text-[12px] font-medium text-soft">
              {tab === "map"
                ? "Your story map: chapters become notes, characters become [[wikilinks]], ready for an Obsidian vault. Or save the whole project as a file."
                : "Your writing, laid out for someone to read. Standard manuscript format is what agents and beta readers expect."}
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="flex gap-[3px] border-b border-rule bg-card px-[24px] py-[10px]">
          {(
            [
              ["map", "Story map"],
              ["manuscript", "Manuscript"],
            ] as [Tab, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`rounded-lg px-[12px] py-[6px] text-[12.5px] font-medium ${
                tab === v ? "bg-panel text-ink shadow-[var(--shadow)]" : "text-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "manuscript" && written.length === 0 ? (
          <div className="flex-1 px-[24px] py-[40px] text-center text-[13px] font-medium text-faint">
            Nothing written yet. Open a chapter's manuscript and it shows up here.
          </div>
        ) : (
          <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap bg-card px-[24px] py-5 font-mono text-[12.5px] leading-[1.7] text-ink">
            {preview}
          </pre>
        )}

        {tab === "manuscript" && (
          <label className="flex items-center gap-[10px] border-t border-rule px-[24px] py-[10px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Author
            </span>
            <input
              value={doc.author ?? ""}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="For the title page and the running header"
              className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-[10px] border-t border-rule px-[24px] py-4">
          {tab === "map" ? (
            <>
              <button
                onClick={() => copy(md)}
                className="rounded-[9px] bg-ink px-4 py-[9px] text-[13px] font-semibold text-bg"
              >
                {copied ? "Copied ✓" : "Copy markdown"}
              </button>
              <button
                onClick={() => save(`${slug}.md`, md, "text/markdown")}
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
                {doc.chapters.reduce((a, c) => a + c.words, 0).toLocaleString()} words ·{" "}
                {doc.chapters.length} chapters
              </span>
            </>
          ) : (
            <>
              <button
                disabled={written.length === 0}
                onClick={() =>
                  save(
                    `${slug}.docx`,
                    buildDocx(doc, doc.author ?? ""),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  )
                }
                className="rounded-[9px] bg-ink px-4 py-[9px] text-[13px] font-semibold text-bg disabled:opacity-40"
                title="Double spaced, 12pt, indented, # scene breaks, title page and running header"
              >
                Download .docx
              </button>
              <button
                disabled={written.length === 0}
                onClick={() =>
                  save(`${slug}-manuscript.md`, buildManuscriptMarkdown(doc), "text/markdown")
                }
                className="rounded-[9px] border border-rule bg-card px-4 py-[9px] text-[13px] font-medium text-ink hover:border-faint disabled:opacity-40"
              >
                Download .md
              </button>
              <button
                disabled={written.length === 0}
                onClick={() => save(`${slug}-manuscript.txt`, buildManuscriptText(doc), "text/plain")}
                className="rounded-[9px] border border-rule bg-card px-4 py-[9px] text-[13px] font-medium text-ink hover:border-faint disabled:opacity-40"
              >
                Download .txt
              </button>
              <div className="flex-1" />
              <span className="text-[11.5px] font-medium text-faint">
                {proseWords.toLocaleString()} words · {written.length} of {doc.chapters.length}{" "}
                {doc.chapters.length === 1 ? "chapter" : "chapters"} written
              </span>
            </>
          )}
        </div>
      </div>
    </Scrim>
  );
}
