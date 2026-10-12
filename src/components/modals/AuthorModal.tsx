import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import { authorOf, hasAuthor, sameAuthor, type AuthorField } from "@/lib/author";

/**
 * File → Author details. Edits **this project's** byline and title-page contact
 * block, and saves them as the default every new project starts with.
 *
 * The default is copied in, never read live: a project keeps its own details,
 * so they travel with its file to Drive and Android, and one project can carry
 * a different pen name without touching the rest. Opening this on a project
 * that has none fills them from the default first, so the usual case is open,
 * glance, close.
 */
const FIELDS: {
  key: AuthorField;
  label: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  {
    key: "byline",
    label: "Byline",
    placeholder: "The name on the cover, a pen name if you use one",
  },
  {
    key: "legalName",
    label: "Legal name",
    placeholder: "Only if it differs from the byline",
  },
  {
    key: "address",
    label: "Address",
    placeholder: "Street\nCity, State Zip",
    multiline: true,
  },
  { key: "phone", label: "Phone", placeholder: "Optional" },
  { key: "email", label: "Email", placeholder: "Optional" },
  { key: "website", label: "Website", placeholder: "Optional" },
];

const inputClass =
  "w-full rounded-lg border border-rule bg-card px-[10px] py-[7px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-faint";

export function AuthorModal() {
  const show = useStore((s) => s.showAuthor);
  const doc = useStore((s) => s.doc);
  const saved = useStore((s) => s.authorDefault);
  const setPanel = useStore((s) => s.setPanel);
  const setAuthorDetails = useStore((s) => s.setAuthorDetails);
  const setAuthorDefault = useStore((s) => s.setAuthorDefault);
  const fillAuthorFromDefault = useStore((s) => s.fillAuthorFromDefault);

  useEffect(() => {
    if (show) fillAuthorFromDefault();
  }, [show, fillAuthorFromDefault]);

  if (!show) return null;
  const close = () => setPanel("showAuthor", false);

  const details = authorOf(doc);
  const filled = hasAuthor(details);
  const hasSaved = hasAuthor(saved);
  const matches = hasSaved && sameAuthor(details, saved);
  const edit = (key: AuthorField, value: string) => setAuthorDetails({ ...details, [key]: value });

  return (
    <Scrim onClose={close} z={70} center>
      <div
        onMouseDown={stop}
        className="flex max-h-[86vh] w-[min(520px,100%)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start gap-3 border-b border-rule px-[24px] py-5">
          <div className="flex-1">
            <div className="font-serif text-[18px] font-semibold text-ink">Author details</div>
            <div className="mt-[3px] text-[12px] font-medium text-soft">
              For this project's manuscript title page and running header. Anything left blank stays off the
              page.
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-x-[14px] gap-y-[12px] overflow-auto px-[24px] py-5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label
              key={f.key}
              className={`flex flex-col gap-[5px] ${f.key === "phone" || f.key === "email" ? "" : "sm:col-span-2"}`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">{f.label}</span>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={details[f.key] ?? ""}
                  onChange={(e) => edit(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className={`${inputClass} resize-none leading-[1.5]`}
                />
              ) : (
                <input
                  value={details[f.key] ?? ""}
                  onChange={(e) => edit(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  type={f.key === "email" ? "email" : f.key === "phone" ? "tel" : "text"}
                  className={inputClass}
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-[10px] border-t border-rule px-[24px] py-4">
          <span className="text-[11.5px] font-medium text-faint">
            {!hasSaved
              ? "Save these as your default and every new project starts with them."
              : matches
                ? "Same as your saved default. New projects start with these."
                : "Different from your saved default. Only this project changes."}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-[10px]">
            {hasSaved && !matches && (
              <button
                onClick={() => setAuthorDetails(saved)}
                className="rounded-[9px] border border-rule bg-card px-[14px] py-[8px] text-[12.5px] font-medium text-ink hover:border-faint"
              >
                Use saved default
              </button>
            )}
            {!matches && (
              <button
                disabled={!filled}
                onClick={() => setAuthorDefault(details)}
                className="rounded-[9px] border border-rule bg-card px-[14px] py-[8px] text-[12.5px] font-medium text-ink hover:border-faint disabled:opacity-40"
              >
                Save as default
              </button>
            )}
            <button
              onClick={close}
              className="rounded-[9px] bg-ink px-4 py-[8px] text-[12.5px] font-semibold text-bg"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Scrim>
  );
}
