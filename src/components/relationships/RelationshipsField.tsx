import { useState } from "react";
import { useStore } from "@/store/useStore";
import { tiesOf } from "@/lib/relationships";
import { AddTieButton, FieldLabel, TextButton, TieRow } from "@/components/relationships/parts";
import { RelationshipDialog } from "@/components/relationships/RelationshipDialog";

/**
 * The character window's "Relationships" field, under "Appears in": each tie
 * with both points of view, click to edit, "+ Add relationship" to add. The
 * editor opens on top of the window. "See on chart" is offered only where the
 * chart is one step away (the Characters drawer).
 */
export function RelationshipsField({ id, onSeeChart }: { id: string; onSeeChart?: () => void }) {
  const doc = useStore((s) => s.doc);
  const [dialog, setDialog] = useState<{ id?: string } | null>(null);
  const me = doc.characters.find((c) => c.id === id);
  if (!me) return null;
  const ties = tiesOf(doc, id);

  return (
    <div>
      <FieldLabel right={onSeeChart && <TextButton onClick={onSeeChart}>See on chart ↗</TextButton>}>
        Relationships
      </FieldLabel>
      {ties.length > 0 ? (
        <div className="flex flex-col gap-[2px]">
          {ties.map((r) => (
            <TieRow key={r.id} doc={doc} r={r} me={id} onOpen={() => setDialog({ id: r.id })} />
          ))}
        </div>
      ) : (
        <div className="py-[2px] text-[12px] italic text-faint">No relationships yet.</div>
      )}
      {/* An archived character can't be tied to anyone new, the same rule as casting. */}
      {!me.archived && <AddTieButton className="mt-[6px]" onClick={() => setDialog({})} />}
      {dialog && <RelationshipDialog id={dialog.id} from={id} onClose={() => setDialog(null)} />}
    </div>
  );
}
