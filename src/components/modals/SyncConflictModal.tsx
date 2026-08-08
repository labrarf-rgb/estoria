import { useMemo, useState } from "react";
import { Scrim, stop } from "@/components/ui/Overlay";
import type { DiffItem, DocDiff, Resolution, Side } from "@/lib/sync";
import { mergeDocs, type MergeChoices } from "@/lib/merge";
import type { StoryDoc } from "@/types";

export interface SyncConflict {
  fileName: string;
  diff: DocDiff;
  fileModifiedAt?: string;
  localEditedAt?: number;
}

const MAGNITUDE_TEXT: Record<DocDiff["magnitude"], string> = {
  small: "Small difference",
  moderate: "Moderate difference",
  large: "Large difference",
};

const STATE_TEXT: Record<DiffItem["state"], string> = {
  changed: "differs",
  "only-here": "only in this app",
  "only-file": "only in the file",
};

/**
 * What picking a side actually does to a row, said plainly. A bare
 * "This app / The file" toggle is ambiguous on a row that exists on one side
 * only — this is the half that tells you whether you're adding or removing.
 */
const EFFECT_TEXT: Record<DiffItem["state"], Record<Side, string>> = {
  changed: { mine: "keeping yours", theirs: "taking file's" },
  "only-here": { mine: "keeping yours", theirs: "will be removed" },
  "only-file": { mine: "stays out", theirs: "will be added" },
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A "newer" tag for the side that was written more recently. */
function NewerTag() {
  return (
    <span
      className="rounded-md border px-[5px] py-[1px] text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ borderColor: "var(--therefore)", color: "var(--therefore)" }}
    >
      newer
    </span>
  );
}

/** The two-way side picker on a merge row. */
function SidePicker({
  side,
  name,
  onPick,
  disabled,
}: {
  side: Side;
  name: string;
  onPick: (s: Side) => void;
  disabled: boolean;
}) {
  const cell = (value: Side, label: string, colour: string) => (
    <button
      type="button"
      onClick={() => onPick(value)}
      disabled={disabled}
      aria-pressed={side === value}
      className="px-[11px] py-[5px] text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-60"
      style={
        side === value
          ? { background: colour, color: "var(--card)" }
          : { color: "var(--soft)" }
      }
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={`Keep ${name} from`}
      className="flex shrink-0 divide-x divide-rule overflow-hidden rounded-lg border border-rule bg-panel"
    >
      {cell("mine", "This app", "var(--therefore)")}
      {cell("theirs", "The file", "var(--but)")}
    </div>
  );
}

/** One reviewable difference: name, what changed, side picker, field detail. */
function MergeRow({
  item,
  side,
  onPick,
  busy,
}: {
  item: DiffItem;
  side: Side;
  onPick: (s: Side) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-card">
      {/* Name and picker sit side by side when there's room, and stack when
          there isn't — a 92px effect column can't share a phone-width row. */}
      <div className="flex flex-col gap-[8px] px-[10px] py-[9px] sm:flex-row sm:items-center sm:gap-[10px]">
        <div className="flex min-w-0 flex-1 items-start gap-[4px]">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide the detailed compare" : "Show the detailed compare"}
            className="shrink-0 rounded-md px-[5px] text-[14px] leading-[1.4] text-faint hover:text-ink"
            style={{ transform: open ? "rotate(90deg)" : undefined }}
          >
            ›
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">
              {item.name}
              <span
                className="ml-[6px] inline-block rounded-md border px-[6px] py-[1px] align-[1px] text-[9.5px] font-semibold uppercase tracking-wide"
                style={{
                  color:
                    item.state === "only-here"
                      ? "var(--therefore)"
                      : item.state === "only-file"
                        ? "var(--but)"
                        : "var(--faint)",
                }}
              >
                {STATE_TEXT[item.state]}
              </span>
            </div>
            {item.fields && item.fields.length > 0 && (
              <div className="mt-[1px] truncate text-[11.5px] text-faint">
                {item.fields.join(" · ")}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[10px] pl-[26px] sm:pl-0">
          <SidePicker side={side} name={item.name} onPick={onPick} disabled={busy} />
          <div
            className="text-[11px] font-semibold sm:w-[92px] sm:text-right"
            style={{ color: side === "theirs" ? "var(--but)" : "var(--faint)" }}
          >
            {EFFECT_TEXT[item.state][side]}
          </div>
        </div>
      </div>
      {open && (
        <div className="overflow-x-auto border-t border-rule px-[12px] pb-[10px] pt-[4px]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-[9.5px] font-semibold uppercase tracking-wide">
                <th className="w-[26%] border-b border-rule py-[6px] pr-[8px] text-left text-faint">
                  Field
                </th>
                <th
                  className="w-[37%] border-b border-rule py-[6px] pr-[8px] text-left"
                  style={{ color: "var(--therefore)" }}
                >
                  This app
                </th>
                <th
                  className="w-[37%] border-b border-rule py-[6px] text-left"
                  style={{ color: "var(--but)" }}
                >
                  The file
                </th>
              </tr>
            </thead>
            <tbody>
              {item.detail.map((f) => (
                <tr key={f.label} className="align-top">
                  <td className="border-b border-rule py-[6px] pr-[8px] font-medium text-ink">
                    {f.label}
                  </td>
                  <td className="border-b border-rule py-[6px] pr-[8px] text-soft">{f.mine}</td>
                  <td className="border-b border-rule py-[6px] text-soft">{f.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Conflict resolution for cross-app Sync (docs/SPECS.md §8): both this app and
 * the synced file changed since they last agreed.
 *
 * Two modes. The summary is the fast path — which side is newer (display only,
 * never used to auto-pick), how much differs, and keep-this / keep-that. Compare
 * & merge is the per-entity path: every difference is a row you can take from
 * either side, starting entirely on "this app" so committing without touching a
 * thing is exactly keep-mine. Nothing is destroyed by either route; see
 * `resolveConflict` for what gets preserved.
 */
export function SyncConflictModal({
  conflict,
  local,
  remote,
  onResolve,
  onClose,
}: {
  conflict: SyncConflict;
  local: StoryDoc;
  remote: StoryDoc;
  onResolve: (keep: Resolution) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [merging, setMerging] = useState(false);
  const [choices, setChoices] = useState<MergeChoices>({});

  const pick = (keep: Resolution) => {
    if (busy) return;
    setBusy(true);
    // The owner closes the dialog when done; on failure it surfaces the error.
    void onResolve(keep).finally(() => setBusy(false));
  };

  const { diff } = conflict;
  const items = useMemo(() => diff.sections.flatMap((s) => s.items), [diff]);
  const sideOf = (item: DiffItem): Side => choices[item.key] ?? "mine";

  // Recomputed on every toggle so the row effects, the tally and the carried
  // references all describe the merge that would actually be written.
  const preview = useMemo(
    () => (merging ? mergeDocs(local, remote, diff, choices) : null),
    [merging, local, remote, diff, choices]
  );

  const setAll = (side: Side) =>
    setChoices(side === "mine" ? {} : Object.fromEntries(items.map((i) => [i.key, "theirs"])));

  const fileT = conflict.fileModifiedAt ? Date.parse(conflict.fileModifiedAt) : NaN;
  const localT = conflict.localEditedAt ?? NaN;
  // Which side looks newer. Display only: clocks across devices can disagree,
  // so this labels, it never decides.
  const newer: "mine" | "theirs" | null =
    Number.isNaN(fileT) || Number.isNaN(localT) ? null : localT > fileT ? "mine" : "theirs";

  return (
    <Scrim onClose={busy ? () => {} : onClose} z={80} center>
      <div
        onMouseDown={stop}
        className={`flex max-h-[min(640px,90vh)] flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)] ${
          merging ? "w-[min(860px,100%)]" : "w-[min(520px,100%)]"
        }`}
      >
        <div className="min-h-0 overflow-y-auto px-[24px] pb-[6px] pt-[22px]">
          {!merging ? (
            <>
              <div className="font-serif text-[18px] font-semibold text-ink">
                This project changed in two places
              </div>
              <div className="mt-[6px] text-[12.5px] leading-[1.5] text-soft">
                Both this app and the file in your Estoria folder were edited since they last
                agreed, so Estoria can't fast-forward. You choose which version to keep.
              </div>

              {/* Which side is newer */}
              <div className="mt-[12px] flex flex-col gap-[5px] rounded-xl border border-rule bg-card px-[12px] py-[9px] text-[12px]">
                <div className="flex items-center gap-[8px]">
                  <span className="w-[86px] shrink-0 font-semibold text-ink">This app</span>
                  <span className="min-w-0 flex-1 truncate text-soft">
                    {Number.isNaN(localT) ? "last edit time unknown" : `last edited ${fmt(localT)}`}
                  </span>
                  {newer === "mine" && <NewerTag />}
                </div>
                <div className="flex items-center gap-[8px]">
                  <span className="w-[86px] shrink-0 font-semibold text-ink">The file</span>
                  <span className="min-w-0 flex-1 truncate text-soft" title={conflict.fileName}>
                    {Number.isNaN(fileT)
                      ? "last write time unknown"
                      : `last written ${fmt(fileT)}`}
                  </span>
                  {newer === "theirs" && <NewerTag />}
                </div>
                {newer === null && (
                  <div className="text-[11px] text-faint">
                    Couldn't tell which is newer. Compare the details below.
                  </div>
                )}
              </div>

              {/* How much differs */}
              <div className="mt-[12px] text-[12.5px] font-semibold text-ink">
                {MAGNITUDE_TEXT[diff.magnitude]} ·{" "}
                {diff.differing === 1
                  ? "1 item differs"
                  : `${diff.differing} of ${diff.total} items differ`}
              </div>
              <ul className="mt-[6px] list-disc space-y-[3px] pl-[18px] text-[12.5px] leading-[1.5] text-soft">
                {diff.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>

              {/* Look closer: read the report, or go and merge the two copies. */}
              {diff.sections.length > 0 && (
                <div className="mt-[10px] flex flex-wrap gap-[8px]">
                  <button
                    onClick={() => setShowReport((v) => !v)}
                    className="rounded-md border border-rule bg-card px-[9px] py-[4px] text-[11.5px] font-semibold text-soft hover:border-faint hover:text-ink"
                  >
                    {showReport ? "Hide report" : "See full report"}
                  </button>
                  <button
                    onClick={() => setMerging(true)}
                    disabled={busy}
                    className="rounded-md border border-rule bg-card px-[9px] py-[4px] text-[11.5px] font-semibold text-ink hover:border-faint disabled:opacity-60"
                  >
                    Compare &amp; merge…
                  </button>
                </div>
              )}
              {showReport && (
                <div className="mt-[8px] flex flex-col gap-[10px] rounded-xl border border-rule bg-card px-[12px] py-[10px]">
                  {diff.sections.map((s) => (
                    <div key={s.label}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {s.label}
                      </div>
                      <ul className="mt-[3px] space-y-[3px]">
                        {s.items.map((it) => (
                          <li key={it.key} className="text-[12px] leading-[1.45] text-soft">
                            <span className="font-medium text-ink">{it.name}</span>{" "}
                            <span
                              style={it.state === "changed" ? undefined : { color: "var(--but)" }}
                            >
                              {STATE_TEXT[it.state]}
                            </span>
                            {it.fields && it.fields.length > 0 && (
                              <span className="text-faint"> ({it.fields.join(", ")})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-[12px] text-[12px] leading-[1.5] text-faint">
                The version you don't keep is saved next to the sync file as a conflict copy.
                Nothing is lost either way.
              </div>
            </>
          ) : (
            <>
              <div className="font-serif text-[18px] font-semibold text-ink">
                Compare and merge
              </div>
              <div className="mt-[6px] text-[12.5px] leading-[1.5] text-soft">
                Pick a side for each thing that differs. Everything starts on{" "}
                <b className="font-semibold text-ink">This app</b>; switch any row to{" "}
                <b className="font-semibold text-ink">The file</b> to take that version instead.
                Both full copies are saved beside the sync file before anything is written.
              </div>

              {/* Tally + bulk controls, pinned while the list scrolls */}
              <div className="sticky top-0 z-[2] -mx-[2px] mt-[14px] flex flex-wrap items-center gap-x-[12px] gap-y-[8px] border-b border-rule bg-panel px-[2px] py-[10px]">
                <div className="text-[12.5px] text-soft">
                  <b className="tabular-nums text-ink">{items.length}</b> differences ·{" "}
                  <span className="font-semibold" style={{ color: "var(--therefore)" }}>
                    <b className="tabular-nums">{items.length - (preview?.fromFile ?? 0)}</b> from
                    this app
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold" style={{ color: "var(--but)" }}>
                    <b className="tabular-nums">{preview?.fromFile ?? 0}</b> from the file
                  </span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={() => setAll("mine")}
                  disabled={busy}
                  className="rounded-md border border-rule bg-card px-[9px] py-[4px] text-[11.5px] font-semibold text-soft hover:border-faint hover:text-ink disabled:opacity-60"
                >
                  All from this app
                </button>
                <button
                  onClick={() => setAll("theirs")}
                  disabled={busy}
                  className="rounded-md border border-rule bg-card px-[9px] py-[4px] text-[11.5px] font-semibold text-soft hover:border-faint hover:text-ink disabled:opacity-60"
                >
                  All from the file
                </button>
              </div>

              {preview && preview.carried.length > 0 && (
                <div
                  className="mt-[10px] rounded-xl border border-rule bg-card px-[12px] py-[9px] text-[12px] leading-[1.5] text-soft"
                  style={{ borderLeft: "3px solid var(--and)" }}
                >
                  <b className="font-semibold text-ink">Also coming along:</b>{" "}
                  {preview.carried.map((c) => `${c.name} (${c.kind})`).join(", ")}, referenced by
                  rows you're taking from the file, so they're brought in rather than left
                  dangling.
                </div>
              )}

              {diff.sections.map((s) => (
                <div key={s.label} className="mt-[16px]">
                  <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">
                    {s.label}
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    {s.items.map((it) => (
                      <MergeRow
                        key={it.key}
                        item={it}
                        side={sideOf(it)}
                        busy={busy}
                        onPick={(side) =>
                          setChoices((c) => {
                            const next = { ...c };
                            if (side === "mine") delete next[it.key];
                            else next[it.key] = side;
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-[14px] text-[12px] leading-[1.5] text-faint">
                Merging saves both full copies beside the sync file as conflict copies, then
                writes the merged project as the sync file. Neither copy is ever pruned by
                backup rotation.
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-[10px] border-t border-rule px-[24px] py-[16px] [&>button]:whitespace-nowrap">
          {merging && (
            <button
              onClick={() => setMerging(false)}
              disabled={busy}
              className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint disabled:opacity-60"
            >
              ‹ Back
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint disabled:opacity-60"
          >
            Not now
          </button>
          {merging ? (
            <button
              onClick={() => preview && pick({ merged: preview.doc })}
              disabled={busy || !preview}
              className="rounded-lg bg-ink px-[14px] py-[8px] text-[13px] font-semibold text-bg disabled:opacity-60"
            >
              Keep merged version
            </button>
          ) : (
            <>
              <button
                onClick={() => pick("theirs")}
                disabled={busy}
                className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-semibold text-ink hover:border-faint disabled:opacity-60"
              >
                Keep file version{newer === "theirs" ? " · newer" : ""}
              </button>
              <button
                onClick={() => pick("mine")}
                disabled={busy}
                className="rounded-lg bg-ink px-[14px] py-[8px] text-[13px] font-semibold text-bg disabled:opacity-60"
              >
                Keep this version{newer === "mine" ? " · newer" : ""}
              </button>
            </>
          )}
        </div>
      </div>
    </Scrim>
  );
}
