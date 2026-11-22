import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Choices, CopyNote, Dialog, Section } from "@/components/modals/FormChangeModal";
import { KINDS, countParts, kindInfo } from "@/lib/piece";
import { canBringIn, mainBoard, pieceKind, pieceLineBreaks } from "@/lib/anthology";
import type { PieceKind, StoryDoc } from "@/types";

/**
 * The two anthology dialogs (docs/PLAN-anthology.md §4.4–4.5): adding a piece,
 * new or brought in from another project, and taking one out as its own.
 */

const KIND_BLURB: Record<PieceKind, string> = {
  story: "Scenes, characters, a world.",
  essay: "An argument or a reflection, in sections.",
  poem: "Stanzas, with line breaks kept.",
  other: "Anything else.",
};

export function AddPieceModal() {
  const dialog = useStore((s) => s.addPieceDialog);
  const setDialog = useStore((s) => s.setAddPieceDialog);
  if (!dialog) return null;
  return <AddPiece section={dialog.section} close={() => setDialog(null)} />;
}

function AddPiece({ section, close }: { section: string; close: () => void }) {
  const doc = useStore((s) => s.doc);
  const stash = useStore((s) => s.projectStash);
  const addPiece = useStore((s) => s.addPiece);
  const bringInPiece = useStore((s) => s.bringInPiece);
  const [tab, setTab] = useState<"new" | "bring">("new");
  const [pick, setPick] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const where = section ? <b className="text-ink">{section}</b> : "the anthology";

  const pieces = Object.values(stash)
    .filter(canBringIn)
    .sort((a, b) => a.projectTitle.localeCompare(b.projectTitle));
  const others = Object.values(stash).filter((d) => !d.savedCopy && d.form !== "piece").length;
  const chosen = pieces.find((p) => p.id === pick) ?? null;

  if (tab === "bring" && confirming && chosen) {
    return <BringInConfirm source={chosen} section={section} back={() => setConfirming(false)} close={close} onConfirm={() => bringInPiece(chosen.id, section)} />;
  }

  const tabBtn = (t: "new" | "bring", label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`border-b-2 px-[12px] py-[9px] text-[12.5px] font-semibold ${tab === t ? "border-ink text-ink" : "border-transparent text-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <Dialog
      close={close}
      wide
      title="Add a piece"
      sub="Start a new one, or bring in a piece you've already written."
      confirm={tab === "bring" ? "Bring in…" : undefined}
      onConfirm={tab === "bring" && chosen ? () => setConfirming(true) : undefined}
    >
      <div className="-mx-[26px] -mt-[20px] mb-[2px] flex gap-[4px] border-b border-rule px-[26px]">
        {tabBtn("new", "New piece")}
        {tabBtn("bring", "Bring in a project")}
      </div>
      {tab === "new" ? (
        <>
          <p>A blank piece at the end of {where}. It keeps its own kind and line breaks.</p>
          <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-4">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                onClick={() => addPiece(k.kind, section)}
                className="flex min-h-[118px] flex-col gap-[6px] rounded-[13px] border border-rule bg-card p-[13px] text-left hover:border-faint hover:shadow-[var(--shadow)]"
              >
                <span className="font-serif text-[15px] font-semibold text-ink">{k.label}</span>
                <span className="flex-1 text-[11.5px] leading-[1.45] text-soft">{KIND_BLURB[k.kind]}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">Parts are {k.many}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>Your single-piece projects. Books and series can't come in.</p>
          {pieces.length === 0 ? (
            <div className="rounded-[10px] border border-rule bg-card px-[12px] py-[10px] text-[12px]">
              You have no other single pieces yet.{others ? ` (${others} ${others === 1 ? "book or series" : "books or series"} not shown.)` : ""}
            </div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {pieces.map((p) => {
                const board = mainBoard(p);
                const ch = board.chapters[0];
                const words = ch?.words ?? 0;
                const label = kindInfo(p.kind).label;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPick(p.id)}
                    onDoubleClick={() => {
                      setPick(p.id);
                      setConfirming(true);
                    }}
                    className={`flex items-center gap-[10px] rounded-[11px] border bg-card px-[13px] py-[11px] text-left ${pick === p.id ? "border-ink shadow-[var(--shadow)]" : "border-rule hover:border-faint"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[15px] font-semibold text-ink">{p.projectTitle}</span>
                      <span className="block font-mono text-[10.5px] text-soft">
                        {label} · {countParts(p, ch?.scenes.length ?? 0)} · {words.toLocaleString()} words
                        {p.drafts.length > 1 ? ` · ${p.drafts.length} versions` : ""}
                      </span>
                    </span>
                    <span className="rounded-full bg-chip px-[8px] py-[2px] text-[9.5px] font-bold uppercase tracking-wide text-soft">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {doc.drafts.length > 1 && (
            <p className="text-[12px]">It joins the version you're viewing.</p>
          )}
        </>
      )}
    </Dialog>
  );
}

function BringInConfirm({
  source,
  section,
  back,
  close,
  onConfirm,
}: {
  source: StoryDoc;
  section: string;
  back: () => void;
  close: () => void;
  onConfirm: () => void;
}) {
  const label = kindInfo(source.kind).label.toLowerCase();
  const versions = source.drafts.length;
  const castN = source.characters.length + source.world.length;
  return (
    <Dialog
      close={close}
      wide
      title={`Bring in "${source.projectTitle}"?`}
      sub={`It moves into this anthology as a ${label}, at the end of ${section || "the anthology"}.`}
      confirm="Bring it in"
      onConfirm={onConfirm}
    >
      <Section label="What happens">
        <ul className="list-disc pl-[18px] [&>li]:mb-[3px]">
          <li>
            <b className="text-ink">Writing, map, notes, status, target:</b> come in as one piece, still a {label}
            {source.keepLineBreaks ? ", line breaks kept" : ""}
            {source.storyNotes.trim() ? ". Its Story notes go into the piece's own notes" : ""}
          </li>
          <li>
            <b className="text-ink">Characters, world, library:</b>{" "}
            {castN
              ? "added to the anthology's lists. One that is the same in both stays one; one that differs, or was typed separately, shows up twice until you archive one"
              : "it has none"}
          </li>
          <li>
            <b className="text-ink">Versions:</b>{" "}
            {versions > 1 ? `its main version comes in; the other ${versions - 1} stay in the saved copy` : "its one version comes in"}
          </li>
          <li>
            <b className="text-ink">Pace:</b> its writing days are added into the anthology's history
          </li>
          <li>
            <b className="text-ink">The project:</b> leaves your project list
          </li>
        </ul>
      </Section>
      <CopyNote what={`"${source.projectTitle}" as it is now`} />
      <button onClick={back} className="self-start text-[12px] font-medium text-soft underline underline-offset-2 hover:text-ink">
        ‹ Back to the list
      </button>
    </Dialog>
  );
}

export function TakeOutModal() {
  const chId = useStore((s) => s.takeOutDialog);
  const setDialog = useStore((s) => s.setTakeOutDialog);
  if (!chId) return null;
  return <TakeOut chId={chId} close={() => setDialog(null)} />;
}

function TakeOut({ chId, close }: { chId: string; close: () => void }) {
  const doc = useStore((s) => s.doc);
  const takeOutPiece = useStore((s) => s.takeOutPiece);
  const [how, setHow] = useState<"move" | "copy">(doc.chapters.length <= 1 ? "copy" : "move");
  const ch = doc.chapters.find((c) => c.id === chId);
  if (!ch) return null;
  const k = kindInfo(pieceKind(doc, ch));
  const keep = pieceLineBreaks(doc, ch);
  const cast = doc.characters.filter((c) => ch.chars.includes(c.id)).map((c) => c.name || "Unnamed");
  const world = doc.world.filter((w) => (ch.worldRefs ?? []).includes(w.id)).map((w) => w.name || "Untitled");
  const used = [...cast, ...world];
  const version = doc.drafts.find((d) => d.id === doc.activeDraftId)?.name ?? "this version";
  const only = doc.chapters.length <= 1;
  const title = ch.title || "Untitled piece";
  return (
    <Dialog
      close={close}
      title={`Make "${title}" its own project?`}
      sub={`It becomes a single ${k.label.toLowerCase()}, as it would be on its own.`}
      confirm={how === "move" ? "Move it out" : "Copy it out"}
      onConfirm={() => takeOutPiece(chId, how)}
    >
      <Choices
        cols={2}
        value={how}
        onChange={(v) => !(only && v === "move") && setHow(v)}
        options={[
          { value: "move", label: "Move it out", hint: only ? "Not for the last piece" : "It leaves the anthology" },
          { value: "copy", label: "Copy it out", hint: "The anthology keeps it too; the two then drift apart" },
        ]}
      />
      <Section label="It takes with it">
        <ul className="list-disc pl-[18px] [&>li]:mb-[3px]">
          <li>
            <b className="text-ink">Writing and map:</b> from the version you're viewing ({version})
          </li>
          <li>
            <b className="text-ink">Its kind and line breaks:</b> {k.label.toLowerCase()}, line breaks {keep ? "kept" : "off"}
          </li>
          <li>
            <b className="text-ink">Notes, status, target, pins</b>
          </li>
          {used.length > 0 && (
            <li>
              <b className="text-ink">Characters and world it uses:</b> {used.join(", ")} (copied; the anthology keeps its own)
            </li>
          )}
          <li>
            <b className="text-ink">Pace:</b> starts fresh; the anthology's history stays where it was written
          </li>
        </ul>
      </Section>
      {how === "move" && <CopyNote what={`"${doc.projectTitle}" as it is now`} />}
    </Dialog>
  );
}
