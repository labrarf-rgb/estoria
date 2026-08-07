import { useState } from "react";
import { useServiceWorker } from "@/lib/sw";

/**
 * "A new version is ready" — shown when the service worker has a newer build
 * installed and waiting.
 *
 * It sits above the footer and is dismissible, because the running version is
 * still perfectly good: the update applies on the next reload whether or not
 * this is ever clicked. Nothing here interrupts typing.
 */
export function UpdateToast() {
  const { applyUpdate } = useServiceWorker();
  const [hidden, setHidden] = useState(false);
  if (!applyUpdate || hidden) return null;

  return (
    // Above every scrim in the app (modals reach 80). At 60 it rendered *under*
    // the welcome screen and the dialogs — dimmed by their backdrop and
    // unclickable, which is worse than not showing it at all. It's a small pill
    // at the bottom edge, so it never covers a centred dialog's controls.
    <div className="pointer-events-none fixed inset-x-0 bottom-[46px] z-[90] flex justify-center">
      <div className="pointer-events-auto flex items-center gap-[12px] rounded-full border border-rule bg-card px-[16px] py-[9px] shadow-[var(--shadow)]">
        <span className="text-[12.5px] text-ink">A new version of Estoria is ready.</span>
        <button
          onClick={applyUpdate}
          className="rounded-lg bg-ink px-[11px] py-[5px] text-[12px] font-semibold text-bg"
        >
          Reload
        </button>
        <button
          onClick={() => setHidden(true)}
          title="Dismiss — the update applies next time you reload"
          className="text-[13px] leading-none text-soft hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
