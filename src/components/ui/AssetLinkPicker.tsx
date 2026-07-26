import type { Asset } from "@/types";

/**
 * The "Link from the shared library" chooser, shared by the chapter detail and
 * the World panel. Lists every book asset as a pick-to-link chip; assets already
 * pinned in the current location are shown disabled so the same note/image/to-do
 * is never double-linked. Callers pass the linkable assets only — archived ones
 * are filtered out before they get here. Rendered only while open — the caller
 * owns the toggle.
 */
export function AssetLinkPicker({
  assets,
  linkedAssetIds,
  onPick,
}: {
  assets: Asset[];
  /** Asset ids already linked here — rendered disabled. */
  linkedAssetIds: Set<string>;
  onPick: (assetId: string) => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-rule bg-card p-3">
      <div className="mb-[8px] text-[10px] font-semibold uppercase tracking-wide text-faint">
        Link from the shared library
      </div>
      {assets.length === 0 ? (
        <div className="text-[12px] text-faint">
          No book assets yet. Add notes or images in the Notes panel&apos;s shared library.
        </div>
      ) : (
        <div className="flex flex-wrap gap-[7px]">
          {assets.map((a) => {
            const linked = linkedAssetIds.has(a.id);
            return (
              <button
                key={a.id}
                disabled={linked}
                onClick={() => onPick(a.id)}
                className="rounded-lg border border-rule bg-panel px-[10px] py-[6px] text-[12px] font-medium text-ink hover:border-faint disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-rule"
                title={linked ? "Already linked here" : undefined}
              >
                {a.kind === "IMAGE" ? "🖼 " : a.kind === "TODO" ? "☑ " : "📝 "}
                {a.label ||
                  (a.kind === "IMAGE"
                    ? "Untitled image"
                    : a.kind === "TODO"
                      ? "Untitled list"
                      : "Untitled note")}
                {linked ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
