import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop, CloseButton } from "@/components/ui/Overlay";
import {
  KINDS,
  SAVED_COPIES_KEPT,
  SAVED_REASON,
  canCollapse,
  collapsePreview,
  kindInfo,
  partNouns,
  type ChapterJoin,
} from "@/lib/piece";
import type { GrownInto, PieceKind } from "@/types";
import { storageWarning, useStorageUse } from "@/lib/storageDurability";

/**
 * The three changes of form: a piece into a book, a book into a piece, and a
 * book into a series. One dialog each, all saying the same thing at the bottom:
 * **a copy is saved first.** That line is what makes these safe to try, so it
 * is never left out, and each dialog names what is kept and what is dropped
 * before anything happens.
 *
 * The fourth way a project changes form, merging a book into a series, starts
 * in the projects list and says the same there.
 */
export function FormChangeModal() {
  const which = useStore((s) => s.formDialog);
  const setFormDialog = useStore((s) => s.setFormDialog);
  if (!which) return null;
  const close = () => setFormDialog(null);
  if (which === "expand") return <ExpandDialog close={close} />;
  if (which === "collapse") return <CollapseDialog close={close} />;
  if (which === "anthology") return <AnthologyDialog close={close} />;
  if (which === "book") return <BookDialog close={close} />;
  return <SeriesDialog close={close} />;
}

function ExpandDialog({ close }: { close: () => void }) {
  const doc = useStore((s) => s.doc);
  const expand = useStore((s) => s.expandIntoBook);
  const [grow, setGrow] = useState<GrownInto>("work");
  const k = kindInfo(doc.kind);
  const nouns = partNouns(doc);
  const parts = doc.chapters[0]?.scenes.length ?? 0;

  return (
    <Dialog
      close={close}
      title="Expand into a book?"
      sub={
        grow === "collection"
          ? `"${doc.projectTitle}" becomes an anthology, with this ${k.label.toLowerCase()} as its first piece.`
          : `"${doc.projectTitle}" becomes a book, with this ${k.label.toLowerCase()} as Chapter 1.`
      }
      confirm={grow === "collection" ? "Make an anthology" : "Expand into a book"}
      onConfirm={() => {
        expand(grow);
        close();
      }}
    >
      <Section label="Growing it into">
        <Choices
          cols={2}
          value={grow}
          onChange={setGrow}
          options={(["work", "collection"] as const).map((g) => ({
            value: g,
            label: k.grow[g].label,
            hint: k.grow[g].hint,
          }))}
        />
      </Section>
      {grow === "collection" ? (
        <>
          <p>
            <b className="text-ink">"{doc.projectTitle}"</b> becomes the first piece. It stays a{" "}
            {k.label.toLowerCase()}: its {nouns.many}, {doc.keepLineBreaks ? "its line breaks, " : ""}its own page
            with Map and Write. Add more pieces of any kind, new or brought in from your other projects.
          </p>
          <p>No chapter numbers, acts or chapter links. Pieces can be grouped into sections.</p>
        </>
      ) : (
        <p>
          Everything comes along: the writing, all {parts} {parts === 1 ? nouns.one : nouns.many} and their
          layout, characters, world, notes, pins, and every version. Parts are still called {nouns.many}
          {doc.keepLineBreaks ? ", and line breaks are still kept" : ""}. You can add chapters, acts and the
          Timeline.
        </p>
      )}
      <CopyNote />
    </Dialog>
  );
}

function CollapseDialog({ close }: { close: () => void }) {
  const doc = useStore((s) => s.doc);
  const turnIntoPiece = useStore((s) => s.turnIntoPiece);
  const [kind, setKind] = useState<PieceKind>(doc.kind ?? "story");
  const [join, setJoin] = useState<ChapterJoin>("break");
  const nouns = partNouns({ kind });
  const { chapters, parts } = collapsePreview(doc);
  const versions = doc.drafts.length;

  if (!canCollapse(doc)) {
    return (
      <Dialog close={close} title="Turn into a single piece" sub="Only a standalone book can become a single piece.">
        <p>
          {doc.form === "anthology"
            ? "An anthology would join every piece into one. Make it a book first (File › Make this a book) if that is what you want."
            : "A book inside a series would have to leave the series first."}
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      close={close}
      wide
      title="Turn into a single piece?"
      sub={`"${doc.projectTitle}" has ${chapters} ${chapters === 1 ? "chapter" : "chapters"}. They join into one piece, in board order.`}
      confirm="Turn into single piece"
      onConfirm={() => {
        turnIntoPiece(kind, join);
        close();
      }}
    >
      <Section label="It becomes a">
        <Choices
          cols={4}
          value={kind}
          onChange={setKind}
          options={KINDS.map((k) => ({ value: k.kind, label: k.label, hint: k.many.charAt(0).toUpperCase() + k.many.slice(1) }))}
        />
      </Section>
      {chapters > 1 && (
        <Section label="Where one chapter ends and the next begins">
          <Choices
            cols={3}
            value={join}
            onChange={setJoin}
            options={[
              { value: "break", label: "A break", hint: "* * * between them" },
              { value: "heading", label: "A heading", hint: "The chapter title" },
              { value: "none", label: "Nothing", hint: "Run straight on" },
            ]}
          />
        </Section>
      )}
      <Section label="What happens">
        <ul className="list-disc pl-[18px] [&>li]:mb-[3px]">
          <li>
            <b className="text-ink">Writing:</b> every chapter joined into one manuscript
          </li>
          <li>
            <b className="text-ink">{nouns.Many}:</b> {parts} in one flow, laid out fresh
          </li>
          <li>
            <b className="text-ink">Cast, world, pins:</b> everything any chapter used
          </li>
          {chapters > 1 && (
            <li>
              <b className="text-ink">Summaries and chapter notes:</b> gathered into the piece's notes, under each
              chapter title
            </li>
          )}
          <li>
            <b className="text-ink">Dropped:</b> acts, chapter statuses, the board layout, chapter links
          </li>
          {versions > 1 && (
            <li>
              <b className="text-ink">Versions:</b> all {versions} are turned the same way
            </li>
          )}
        </ul>
      </Section>
      <CopyNote what="The book as it is now, chapters and all," />
    </Dialog>
  );
}

function SeriesDialog({ close }: { close: () => void }) {
  const doc = useStore((s) => s.doc);
  const makeSeries = useStore((s) => s.makeSeries);
  const goToSeries = useStore((s) => s.goToSeries);
  return (
    <Dialog
      close={close}
      title="Make it a series?"
      sub={`"${doc.projectTitle}" becomes Book One of a new series.`}
      confirm="Make it a series"
      onConfirm={() => {
        makeSeries();
        goToSeries();
        close();
      }}
    >
      <p>
        The book keeps its title and everything in it. The series starts as "Untitled Series" for you to rename,
        with a series map and timeline above the book.
      </p>
      <CopyNote />
    </Dialog>
  );
}

function AnthologyDialog({ close }: { close: () => void }) {
  const doc = useStore((s) => s.doc);
  const makeAnthology = useStore((s) => s.makeAnthology);
  const k = kindInfo(doc.kind);
  const n = doc.chapters.length;
  return (
    <Dialog
      close={close}
      title="Make this an anthology?"
      sub={`"${doc.projectTitle}" becomes an anthology of ${n} ${n === 1 ? "piece" : "pieces"}.`}
      confirm="Make an anthology"
      onConfirm={() => {
        makeAnthology();
        close();
      }}
    >
      <ul className="list-disc pl-[18px] [&>li]:mb-[3px]">
        <li>
          <b className="text-ink">Each chapter becomes a piece</b>, in board order, under its own title. Nothing is
          joined.
        </li>
        <li>
          <b className="text-ink">Each piece starts as a {k.label.toLowerCase()}</b>
          {doc.keepLineBreaks ? ", line breaks kept" : ""} (a chapter that was a piece in an anthology before
          keeps what it was). Change any piece's kind on its page.
        </li>
        <li>
          <b className="text-ink">Not shown:</b> chapter numbers, acts, chapter links and the Timeline. They stay in
          the file.
        </li>
      </ul>
      <CopyNote />
    </Dialog>
  );
}

function BookDialog({ close }: { close: () => void }) {
  const doc = useStore((s) => s.doc);
  const makeBook = useStore((s) => s.makeBook);
  return (
    <Dialog
      close={close}
      title="Make this a book?"
      sub={`"${doc.projectTitle}" becomes an ordinary book. Its pieces become numbered chapters.`}
      confirm="Make it a book"
      onConfirm={() => {
        makeBook();
        close();
      }}
    >
      <p>
        Nothing is joined or lost. The book uses one kind and one line-break setting for every chapter, so a poem
        beside a story reads the book's way. Sections are no longer shown. You get the board, acts and the Timeline.
      </p>
      <CopyNote />
    </Dialog>
  );
}

/** The line every change of form carries. */
export function CopyNote({ what }: { what?: string }) {
  const full = storageWarning(useStorageUse());
  return (
    <div className="flex items-start gap-[10px] rounded-[10px] border border-rule bg-card px-[12px] py-[10px] text-[12px]">
      <span className="text-[15px] leading-none text-soft">↺</span>
      <div>
        <b className="text-ink">A copy is saved first.</b> {what ?? "The project as it is now"} is saved as its
        own project, under <b className="text-ink">Projects › Saved copies</b>. Open it any time to go back.
        {full && (
          <div className="mt-[6px]" style={{ color: "var(--but)" }}>
            Browser storage is {full} full, and each saved copy keeps every picture. Delete old copies under Projects ›
            Saved copies, or export this project, first.
          </div>
        )}
      </div>
    </div>
  );
}

export function Dialog({
  close,
  title,
  sub,
  confirm,
  onConfirm,
  wide,
  children,
}: {
  close: () => void;
  title: string;
  sub: string;
  confirm?: string;
  onConfirm?: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Scrim onClose={close} z={65} center>
      <div
        onMouseDown={stop}
        className={`flex max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)] ${
          wide ? "w-[min(640px,100%)]" : "w-[min(560px,100%)]"
        }`}
      >
        <div className="flex items-start gap-3 border-b border-rule px-[26px] py-[20px]">
          <div className="flex-1">
            <div className="font-serif text-[19px] font-semibold text-ink">{title}</div>
            <div className="mt-[3px] text-[12.5px] font-medium text-soft">{sub}</div>
          </div>
          <CloseButton onClick={close} />
        </div>
        <div className="flex flex-col gap-[14px] overflow-auto px-[26px] py-[20px] text-[13px] leading-[1.55] text-soft">
          {children}
        </div>
        {confirm && onConfirm && (
          <div className="flex justify-end gap-[8px] border-t border-rule px-[26px] py-[14px]">
            <button
              onClick={close}
              className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint"
            >
              Cancel
            </button>
            <button onClick={onConfirm} className="rounded-lg bg-ink px-[14px] py-[8px] text-[13px] font-semibold text-bg">
              {confirm}
            </button>
          </div>
        )}
      </div>
    </Scrim>
  );
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[8px] text-[10.5px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      {children}
    </div>
  );
}

/** A row of choice cards: the one picked is outlined in ink. */
export function Choices<T extends string>({
  value,
  onChange,
  options,
  cols,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint: string }[];
  cols: number;
}) {
  return (
    <div className="grid gap-[8px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[10px] border px-[12px] py-[10px] text-left ${
            value === o.value ? "border-ink bg-card shadow-[var(--shadow)]" : "border-rule bg-panel hover:border-faint"
          }`}
        >
          <span className="block text-[12.5px] font-semibold text-ink">{o.label}</span>
          <span className="block text-[11px] text-soft">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * After a change of form: where the copy went. It goes away by itself, because
 * the copy is safe whether or not anyone reads this.
 */
export function SavedNotice() {
  const notice = useStore((s) => s.savedNotice);
  const trim = useStore((s) => s.trimNotice);
  const dismissSaved = useStore((s) => s.dismissSavedNotice);
  const dismissTrim = useStore((s) => s.dismissTrimNotice);
  const setPanel = useStore((s) => s.setPanel);
  const dismiss = () => {
    dismissSaved();
    dismissTrim();
  };
  useEffect(() => {
    if (!notice && !trim) return;
    const t = setTimeout(() => {
      dismissSaved();
      dismissTrim();
    }, 9000);
    return () => clearTimeout(t);
  }, [notice, trim, dismissSaved, dismissTrim]);
  if (!notice && !trim) return null;
  return (
    <div className="fixed bottom-[44px] left-1/2 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-[12px] rounded-xl bg-ink px-[16px] py-[10px] text-[12.5px] text-bg shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
      <span>
        {notice && <>Saved a copy of "{notice.title}" · {SAVED_REASON[notice.reason].toLowerCase()}. </>}
        {trim && (
          <>
            Removed the {trim.n === 1 ? "oldest saved copy" : `${trim.n} oldest saved copies`} of "{trim.title}" from this
            browser ({SAVED_COPIES_KEPT} are kept); {trim.n === 1 ? "its file stays" : "their files stay"} in your Estoria
            folder.
          </>
        )}
      </span>
      <button
        onClick={() => {
          setPanel("showProjects", true);
          dismiss();
        }}
        className="font-semibold underline underline-offset-2"
      >
        View saved copies
      </button>
      <button onClick={dismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
