import { useStore } from "@/store/useStore";
import { Scrim, stop } from "@/components/ui/Overlay";

/**
 * Global confirmation prompt shown before destructive actions.
 *
 * Above everything, including the recovery screen (95) and the update toast
 * (90): a confirm that renders under the thing that raised it is a button that
 * appears not to work, and this one guards the irreversible actions.
 */
export function ConfirmDialog() {
  const confirm = useStore((s) => s.confirm);
  const close = useStore((s) => s.closeConfirm);
  if (!confirm) return null;

  const run = () => {
    confirm.onConfirm();
    close();
  };

  return (
    <Scrim onClose={close} z={100} center>
      <div
        onMouseDown={stop}
        className="w-[min(420px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="px-[24px] pb-[6px] pt-[22px]">
          <div className="font-serif text-[18px] font-semibold text-ink">{confirm.message}</div>
          {confirm.detail && (
            <div className="mt-[6px] text-[12.5px] leading-[1.5] text-soft">{confirm.detail}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-[10px] px-[24px] py-[18px]">
          {/* Left of the choice, and deliberately not an answer to it: the
              dialog stays open so "save a copy" can be done *before* deciding. */}
          {confirm.extraAction && (
            <button
              onClick={confirm.extraAction.onClick}
              className="mr-auto rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint"
            >
              {confirm.extraAction.label}
            </button>
          )}
          <button
            onClick={close}
            className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Cancel
          </button>
          <button
            onClick={run}
            className="rounded-lg px-[14px] py-[8px] text-[13px] font-semibold text-white"
            style={{ background: confirm.danger ? "var(--but)" : "var(--ink)" }}
          >
            {confirm.confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </Scrim>
  );
}
