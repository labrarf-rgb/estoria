import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { DetailWindow, WindowButton } from "@/components/ui/DetailWindow";
import { SWATCHES, kindsOf, sameKinds } from "@/lib/relationships";
import { uid } from "@/lib/ids";
import type { RelationshipKind } from "@/types";

/**
 * The project's relationship kinds: rename, recolor, add, remove. Changes apply
 * as you make them (the first one writes the starter kinds out as the project's
 * own list). Removing a kind in use asks first, and its relationships stay,
 * shown as "No kind".
 *
 * The footer is Author details' saved-default footer, word for word in shape:
 * a saved default lives in this browser only and is copied into new projects.
 */
export function KindsDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const saved = useStore((s) => s.relationshipKindsDefault);
  const setKinds = useStore((s) => s.setRelationshipKinds);
  const setDefault = useStore((s) => s.setRelationshipKindsDefault);
  const fillKindsFromDefault = useStore((s) => s.fillKindsFromDefault);
  const kinds = kindsOf(doc);
  const used = (id: string) => (doc.relationships ?? []).filter((r) => r.kind === id).length;

  const [palette, setPalette] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmUse, setConfirmUse] = useState(false);
  const focusId = useRef<string | null>(null);

  useEffect(() => {
    fillKindsFromDefault();
  }, [fillKindsFromDefault]);

  useEffect(() => {
    if (!focusId.current) return;
    const el = document.querySelector<HTMLInputElement>(`[data-kind-name="${focusId.current}"]`);
    el?.focus();
    el?.select();
    focusId.current = null;
  });

  const write = (next: RelationshipKind[]) => setKinds(next);
  const patch = (id: string, p: Partial<RelationshipKind>) => write(kinds.map((k) => (k.id === id ? { ...k, ...p } : k)));
  const remove = (id: string) => {
    write(kinds.filter((k) => k.id !== id));
    setConfirmDel(null);
  };
  const add = () => {
    const taken = new Set(kinds.map((k) => k.color));
    let color = 1;
    while (taken.has(color) && color < SWATCHES) color++;
    const id = uid("kind");
    focusId.current = id;
    write([...kinds, { id, name: "New kind", color }]);
  };

  const matches = !!saved && sameKinds(kinds, saved);
  const orphans = saved
    ? (doc.relationships ?? []).filter((r) => r.kind && kinds.some((k) => k.id === r.kind) && !saved.some((k) => k.id === r.kind)).length
    : 0;
  const useSaved = () => {
    if (!saved) return;
    write(saved.map((k) => ({ ...k })));
    setConfirmUse(false);
  };

  return (
    <DetailWindow
      onClose={onClose}
      badge={
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-therefore">
          Relationship kinds
        </span>
      }
      title={doc.projectTitle || "This project"}
      footer={
        confirmUse ? (
          <>
            <span className="basis-full text-[12px] leading-[1.4] text-but">
              {orphans} {orphans === 1 ? "relationship uses a kind" : "relationships use kinds"} your default
              doesn't have. They'll stay, shown as No kind.
            </span>
            <span className="flex-1" />
            <WindowButton onClick={() => setConfirmUse(false)}>Cancel</WindowButton>
            <WindowButton danger onClick={useSaved}>
              Use saved default
            </WindowButton>
          </>
        ) : (
          <>
            <span className="basis-full text-[11.5px] font-medium text-faint">
              {!saved
                ? "Save these as your default and every new project starts with them."
                : matches
                  ? "Same as your saved default. New projects start with these."
                  : "Different from your saved default. Only this project changes."}
            </span>
            <span className="flex-1" />
            {saved && !matches && (
              <WindowButton onClick={() => (orphans ? setConfirmUse(true) : useSaved())}>Use saved default</WindowButton>
            )}
            {!matches && <WindowButton onClick={() => setDefault(kinds)}>Save as default</WindowButton>}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-ink px-[14px] py-[6px] text-[12px] font-semibold text-bg"
            >
              Done
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-[8px]">
        <p className="mb-[4px] text-[12px] leading-[1.5] text-soft">
          Rename them, change their color, add your own or remove any you don't use. They're saved in this
          project, so the phone and your other devices get the same list.
        </p>
        {kinds.map((k) => {
          const n = used(k.id);
          return (
            <div key={k.id} className="flex flex-col gap-[6px]">
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  aria-label={`Change the color of ${k.name || "this kind"}`}
                  aria-expanded={palette === k.id}
                  onClick={() => setPalette(palette === k.id ? null : k.id)}
                  className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-card"
                  style={{
                    background: `var(--sw-${k.color})`,
                    boxShadow: palette === k.id ? "0 0 0 2px var(--ink)" : "0 0 0 1px var(--rule)",
                  }}
                />
                <input
                  data-kind-name={k.id}
                  value={k.name}
                  onChange={(e) => patch(k.id, { name: e.target.value })}
                  placeholder="Kind name"
                  aria-label="Kind name"
                  className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-[9px] py-[6px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-faint"
                />
                <span className="w-[54px] shrink-0 text-right font-mono text-[10.5px] text-faint">
                  {n ? `${n} ${n === 1 ? "use" : "uses"}` : "unused"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${k.name || "this kind"}`}
                  onClick={() => (n ? setConfirmDel(k.id) : remove(k.id))}
                  className="h-[28px] w-[28px] shrink-0 rounded-lg border border-rule bg-card text-[12px] text-soft hover:border-faint hover:text-but"
                >
                  ✕
                </button>
              </div>
              {palette === k.id && (
                <div className="flex flex-wrap gap-[8px] pl-[30px]" role="group" aria-label="Colors">
                  {Array.from({ length: SWATCHES }, (_, i) => i + 1).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      aria-pressed={k.color === c}
                      onClick={() => {
                        patch(k.id, { color: c });
                        setPalette(null);
                      }}
                      className="h-[22px] w-[22px] rounded-full border-2 border-card"
                      style={{
                        background: `var(--sw-${c})`,
                        boxShadow: k.color === c ? "0 0 0 2px var(--ink)" : "0 0 0 1px var(--rule)",
                      }}
                    />
                  ))}
                </div>
              )}
              {confirmDel === k.id && (
                <div className="flex flex-wrap items-center gap-[8px] pl-[30px] text-[12px] text-but">
                  <span className="flex-1 basis-[200px]">
                    {n} {n === 1 ? "relationship uses" : "relationships use"} it. They'll stay, shown as No kind.
                  </span>
                  <WindowButton onClick={() => setConfirmDel(null)}>Keep</WindowButton>
                  <WindowButton danger onClick={() => remove(k.id)}>
                    Remove
                  </WindowButton>
                </div>
              )}
            </div>
          );
        })}
        {kinds.length === 0 && (
          <div className="text-[12px] text-faint">No kinds. Every relationship shows as No kind.</div>
        )}
        <button
          type="button"
          onClick={add}
          className="mt-[4px] w-full rounded-[11px] border-[1.5px] border-dashed border-line py-[9px] text-[12.5px] font-semibold text-soft hover:border-faint hover:text-ink"
        >
          + Add kind
        </button>
      </div>
    </DetailWindow>
  );
}
