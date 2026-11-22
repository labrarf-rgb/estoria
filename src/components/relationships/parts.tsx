import type { ReactNode } from "react";
import type { Character, Relationship, StoryDoc } from "@/types";
import { kindColor, kindName, otherEnd, viewOf } from "@/lib/relationships";

/** A character's round initials chip, as on the board's cast avatars. */
export function Avatar({ c, size = 24 }: { c: Character; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${c.archived ? "opacity-45" : ""}`}
      style={{ background: c.color, width: size, height: size, fontSize: size < 30 ? 9.5 : 12 }}
    >
      {c.initials || "?"}
    </span>
  );
}

/** A kind's name in its color, with a dot, so the color is never the only cue. */
export function KindPill({ doc, kind }: { doc: StoryDoc; kind: string | undefined }) {
  const color = kindColor(doc, kind);
  return (
    <span
      className="inline-flex items-center gap-[6px] whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.07em]"
      style={{ color }}
    >
      <span className="h-[8px] w-[8px] rounded-full" style={{ background: color }} />
      {kindName(doc, kind)}
    </span>
  );
}

/** The small uppercase field label used across the character window. */
export function FieldLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-[5px] flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
      <span>{children}</span>
      {right}
    </div>
  );
}

/** A quiet underlined text button ("See on chart", "Edit kinds"). */
export function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-medium normal-case tracking-normal text-soft underline decoration-line underline-offset-[3px] hover:text-ink"
    >
      {children}
    </button>
  );
}

/**
 * One relationship as seen from `me`: the other character, the kind, the label
 * and both points of view. Clicking it opens the editor.
 */
export function TieRow({
  doc,
  r,
  me,
  onOpen,
}: {
  doc: StoryDoc;
  r: Relationship;
  me: string;
  onOpen: () => void;
}) {
  const o = doc.characters.find((c) => c.id === otherEnd(r, me));
  const meC = doc.characters.find((c) => c.id === me);
  if (!o || !meC) return null;
  const mine = viewOf(r, me);
  const theirs = viewOf(r, o.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Edit ${meC.name || "this character"} and ${o.name || "this character"}`}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-[10px] gap-y-[3px] rounded-[9px] border border-transparent px-[6px] py-[7px] text-left hover:border-rule hover:bg-card"
    >
      <Avatar c={o} />
      <div className="min-w-0">
        <div className={`font-serif text-[14px] font-semibold ${o.archived ? "text-faint" : "text-ink"}`}>
          {o.name || "Unnamed character"}
          {o.archived && (
            <span className="ml-[6px] align-[1px] text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">
              Archived
            </span>
          )}
        </div>
        <div className="mt-[1px] flex flex-wrap items-center gap-x-[8px]">
          <KindPill doc={doc} kind={r.kind} />
          {r.label && <span className="text-[11.5px] text-soft">{r.label}</span>}
        </div>
      </div>
      {mine && (
        <div className="col-start-2 text-[12px] leading-[1.45] text-soft">
          <b className="font-semibold text-ink">{firstName(meC)}:</b> {mine}
        </div>
      )}
      {theirs && (
        <div className="col-start-2 text-[12px] leading-[1.45] text-soft">
          <b className="font-semibold text-ink">{firstName(o)}:</b> {theirs}
        </div>
      )}
    </button>
  );
}

export const firstName = (c: Character) => (c.name || "Unnamed").trim().split(/\s+/)[0];

/** The dashed "+ Add relationship" button. */
export function AddTieButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[11px] border-[1.5px] border-dashed border-line py-[9px] text-[12.5px] font-semibold text-soft hover:border-faint hover:text-ink ${className}`}
    >
      + Add relationship
    </button>
  );
}
