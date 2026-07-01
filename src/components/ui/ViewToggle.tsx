export type RefView = "card" | "list";

/** Small segmented Card / List switch. Reused wherever a RefList can flip views. */
export function ViewToggle({ view, onChange }: { view: RefView; onChange: (v: RefView) => void }) {
  return (
    <div className="flex rounded-lg bg-chip p-[3px]">
      {(["card", "list"] as RefView[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-[9px] py-[3px] text-[11px] font-medium capitalize ${
            view === v ? "bg-card text-ink" : "text-soft hover:bg-card"
          }`}
          title={`${v === "card" ? "Card" : "List"} view`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
