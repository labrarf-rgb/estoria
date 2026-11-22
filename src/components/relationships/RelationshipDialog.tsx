import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { DetailWindow, WindowButton } from "@/components/ui/DetailWindow";
import { kindColor, kindOf, kindsOf, pairKey } from "@/lib/relationships";
import { Avatar, FieldLabel, TextButton, firstName } from "@/components/relationships/parts";
import { KindsDialog } from "@/components/relationships/KindsDialog";

/**
 * Add or edit one relationship. Opened from a character's window (stacking on
 * top of it, like a reference opened from a world entry) or from the chart.
 * Edits are held here and saved on Save, so Cancel (or clicking outside, or
 * Escape) leaves the relationship as it was.
 *
 * Adding: `from` is the character it was opened from; the picker leaves out
 * them, archived characters, and anyone they already have a relationship with,
 * since a pair has one record.
 */
export function RelationshipDialog({
  id,
  from,
  onClose,
}: {
  /** The relationship to edit; absent when adding. */
  id?: string;
  from: string;
  onClose: () => void;
}) {
  const doc = useStore((s) => s.doc);
  const addRelationship = useStore((s) => s.addRelationship);
  const updateRelationship = useStore((s) => s.updateRelationship);
  const removeRelationship = useStore((s) => s.removeRelationship);
  const fillKindsFromDefault = useStore((s) => s.fillKindsFromDefault);

  const existing = id ? doc.relationships?.find((r) => r.id === id) : undefined;
  const kinds = kindsOf(doc);
  const a = existing ? existing.a : from;
  const [withId, setWithId] = useState<string | null>(existing ? existing.b : null);
  const [kind, setKind] = useState<string | undefined>(existing ? existing.kind : kinds[0]?.id);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [aView, setAView] = useState(existing?.aView ?? "");
  const [bView, setBView] = useState(existing?.bView ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [editKinds, setEditKinds] = useState(false);

  useEffect(() => {
    fillKindsFromDefault();
  }, [fillKindsFromDefault]);

  const A = doc.characters.find((c) => c.id === a);
  const B = withId ? doc.characters.find((c) => c.id === withId) : undefined;
  // The relationship was removed elsewhere (a sync, another tab) while this was open.
  if (!A || (id && !existing)) return null;

  const taken = new Set(
    (doc.relationships ?? []).filter((r) => r.a === a || r.b === a).map((r) => (r.a === a ? r.b : r.a))
  );
  const candidates = doc.characters.filter((c) => !c.archived && c.id !== a);
  // A kind removed in Edit kinds while this was open reads as No kind.
  const kindNow = kindOf(doc, kind) ? kind : undefined;

  const save = () => {
    const fields = { kind: kindNow, label, aView, bView, notes };
    if (existing) updateRelationship(existing.id, fields);
    else if (withId && !(doc.relationships ?? []).some((r) => pairKey(r.a, r.b) === pairKey(a, withId))) {
      addRelationship({ a, b: withId, ...fields });
    }
    onClose();
  };

  const wn = B ? firstName(B) : "them";
  const title = existing && B ? `${firstName(A)} and ${firstName(B)}` : `New relationship for ${firstName(A)}`;

  return (
    <>
      <DetailWindow
        onClose={onClose}
        badge={
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-therefore">
            {existing ? "Relationship" : "Add relationship"}
          </span>
        }
        title={title}
        footer={
          <>
            {existing && (
              <WindowButton
                danger
                onClick={() => {
                  removeRelationship(existing.id);
                  onClose();
                }}
              >
                Remove relationship
              </WindowButton>
            )}
            <span className="flex-1" />
            <WindowButton onClick={onClose}>Cancel</WindowButton>
            <button
              type="button"
              onClick={save}
              disabled={!existing && !withId}
              className="rounded-lg bg-ink px-[14px] py-[6px] text-[12px] font-semibold text-bg disabled:opacity-40"
            >
              {existing ? "Save" : "Add"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          {!existing && (
            <div>
              <FieldLabel>With</FieldLabel>
              <div className="flex flex-wrap gap-[6px]">
                {candidates.map((c) => {
                  const on = c.id === withId;
                  const off = taken.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={off}
                      aria-pressed={on}
                      title={off ? `Already has a relationship with ${firstName(A)}` : undefined}
                      onClick={() => setWithId(c.id)}
                      className={`flex items-center gap-[7px] rounded-full border bg-card py-[3px] pl-[3px] pr-[10px] text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                        on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-rule hover:border-faint"
                      }`}
                    >
                      <Avatar c={c} />
                      {c.name || "Unnamed"}
                    </button>
                  );
                })}
              </div>
              <div className="mt-[4px] text-[11.5px] text-faint">
                {candidates.length === 0
                  ? "There's no one else on the roster yet."
                  : `Greyed out: already tied to ${firstName(A)}. Archived characters aren't offered.`}
              </div>
            </div>
          )}

          <div>
            <FieldLabel right={<TextButton onClick={() => setEditKinds(true)}>Edit kinds</TextButton>}>Kind</FieldLabel>
            <div className="flex flex-wrap gap-[6px]">
              {kinds.map((k) => (
                <KindChip key={k.id} on={k.id === kindNow} color={kindColor(doc, k.id)} onClick={() => setKind(k.id)}>
                  {k.name.trim() || "Unnamed kind"}
                </KindChip>
              ))}
              <KindChip on={!kindNow} color="var(--faint)" onClick={() => setKind(undefined)}>
                No kind
              </KindChip>
            </div>
          </div>

          <label className="block">
            <FieldLabel>Label</FieldLabel>
            <input
              autoFocus={!!existing}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. sisters, former partners, uneasy truce"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
            <label className="block">
              <FieldLabel>
                How {firstName(A)} sees {wn}
              </FieldLabel>
              <textarea rows={3} value={aView} onChange={(e) => setAView(e.target.value)} placeholder="Optional" className={areaClass} />
            </label>
            <label className="block">
              <FieldLabel>
                How {wn} sees {firstName(A)}
              </FieldLabel>
              <textarea rows={3} value={bView} onChange={(e) => setBView(e.target.value)} placeholder="Optional" className={areaClass} />
            </label>
          </div>

          <label className="block">
            <FieldLabel>Notes</FieldLabel>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else about the two of them"
              className={areaClass}
            />
          </label>
        </div>
      </DetailWindow>
      {editKinds && <KindsDialog onClose={() => setEditKinds(false)} />}
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-faint";
const areaClass = `${inputClass} resize-y leading-[1.5]`;

function KindChip({
  on,
  color,
  onClick,
  children,
}: {
  on: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-[6px] rounded-[7px] border bg-card px-[9px] py-[5px] text-[12px] ${
        on ? "font-semibold" : "border-rule font-medium text-ink hover:border-faint"
      }`}
      style={on ? { borderColor: color, color, boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
    >
      <span className="h-[8px] w-[8px] rounded-full" style={{ background: color }} />
      {children}
    </button>
  );
}
