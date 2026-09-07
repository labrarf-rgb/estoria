import { useState } from "react";
import { useStore } from "@/store/useStore";
import { downloadProjectFile, flushNow } from "@/store/persistence";
import { AppIcon } from "@/components/ui/AppIcon";
import { Scrim, stop } from "@/components/ui/Overlay";

/**
 * The two faces of a caught render error. See `ErrorBoundary` for the catching.
 *
 * They follow the order `Recovery` sets for a failed *load*, because a failed
 * *render* frightens a writer in exactly the same way and deserves the same
 * answer: say plainly that nothing has been lost, put a copy of the work within
 * one click, and only then offer the way forward. What is different is that
 * here the document is fine — it is in memory and already on disk — so the
 * reassurance is the honest headline rather than a hedge.
 */

/** Serialise the live document straight out of the store, crash or no crash. */
function DownloadCopy({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const save = () => {
    try {
      flushNow();
      downloadProjectFile(useStore.getState().doc);
      setState("done");
    } catch {
      // The store itself may be what broke. Say so rather than looking dead.
      setState("failed");
    }
  };
  return (
    <button
      onClick={save}
      className={`rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint ${className}`}
      title="Write the whole project out to a .estoria.json file you can reopen or import"
    >
      {state === "done"
        ? "Saved a copy ✓"
        : state === "failed"
          ? "Couldn't save a copy"
          : "Download a copy"}
    </button>
  );
}

/** The error itself, kept small and selectable so it can be reported. */
function Detail({ error }: { error: Error }) {
  return (
    <div className="mt-[16px] select-text rounded-[10px] border border-rule bg-card px-[12px] py-[9px] font-mono text-[11.5px] leading-[1.5] text-soft">
      {error.message || String(error)}
    </div>
  );
}

/**
 * A theme for a crash that happened before the app could set one.
 *
 * Usually there is nothing to do here. The app writes `data-theme` onto the
 * document element from an effect, and that attribute outlives the tree that
 * set it, so a crash screen mounted afterwards inherits the right palette for
 * free. The gap is a crash on the very first render: no effect has run, and the
 * store rehydrates asynchronously, so the saved theme is not knowable yet by
 * any route. The OS preference is the only signal left, and guessing with it
 * beats flashing a bright page at someone who chose the dark one.
 */
function fallbackTheme(): string | undefined {
  try {
    if (document.documentElement.getAttribute("data-theme")) return undefined;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return undefined;
  }
}

/**
 * Whole-app crash: everything below the root threw, so this replaces the app.
 *
 * A reload is the real fix and gets the emphasis, because the state that broke
 * the render is in memory and a reload is what clears it. It is also the button
 * the installed app cannot otherwise offer — no address bar, no refresh key
 * anyone thinks to press, which is what turned a crash into "quit and restart".
 */
export function AppCrash({ error }: { error: Error }) {
  return (
    <div
      // Left off entirely when the app already set one on the document, which
      // is the ordinary case. See fallbackTheme.
      data-theme={fallbackTheme()}
      className="fixed inset-0 flex items-center justify-center overflow-auto bg-bg p-[24px] text-ink"
    >
      <div className="w-[min(560px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-[12px] border-b border-rule px-[28px] py-[22px]">
          <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-rule bg-card">
            <AppIcon size={34} />
          </div>
          <div>
            <div className="font-serif text-[21px] font-semibold text-ink">
              Estoria stopped drawing the page
            </div>
            <div className="text-[12.5px] font-medium text-soft">
              Your writing is saved. This is the screen that failed, not the book.
            </div>
          </div>
        </div>

        <div className="px-[28px] py-[22px]">
          <div className="text-[13px] leading-[1.6] text-ink">
            Something in the interface hit an error partway through drawing, and Estoria
            stopped rather than leave you looking at half a screen. Reloading rebuilds it
            from what is on disk, which is everything up to your last save.
          </div>
          <div className="mt-[14px] text-[12.5px] leading-[1.6] text-soft">
            If it happens again in the same place, download a copy first and note what you
            were doing — that is the part a fix needs.
          </div>
          <Detail error={error} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-[10px] border-t border-rule px-[28px] py-[18px]">
          <DownloadCopy className="mr-auto" />
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-ink px-[14px] py-[8px] text-[13px] font-semibold text-bg"
          >
            Reload Estoria
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Chapter crash: the modal threw, the board behind it did not.
 *
 * Which makes closing the chapter the good ending rather than a consolation —
 * you keep the session, the undo history and everything you have not saved yet,
 * and the boundary re-arms as `openCh` changes. `Try again` is offered second
 * because a render that just failed usually fails the same way twice; it is
 * there for the cases where something asynchronous had simply not arrived.
 */
export function ChapterCrash({ error, retry }: { error: Error; retry: () => void }) {
  const closeChapter = useStore((s) => s.closeChapter);
  return (
    // 50, the chapter modal's own layer: this stands exactly where that
    // modal stands, so anything the app raises above a chapter — a confirm,
    // the recovery screen, the update toast — still comes up over it.
    <Scrim onClose={closeChapter} z={50} center>
      <div
        onMouseDown={stop}
        className="w-[min(460px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="px-[24px] pb-[8px] pt-[22px]">
          <div className="font-serif text-[18px] font-semibold text-ink">
            This chapter couldn't be drawn
          </div>
          <div className="mt-[6px] text-[12.5px] leading-[1.55] text-soft">
            The rest of Estoria is fine and nothing has been lost. Close the chapter to go
            back to your board and carry on.
          </div>
          <Detail error={error} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-[10px] px-[24px] py-[18px]">
          <DownloadCopy className="mr-auto" />
          <button
            onClick={retry}
            className="rounded-lg border border-rule bg-card px-[14px] py-[8px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Try again
          </button>
          <button
            onClick={closeChapter}
            className="rounded-lg bg-ink px-[14px] py-[8px] text-[13px] font-semibold text-bg"
          >
            Close the chapter
          </button>
        </div>
      </div>
    </Scrim>
  );
}
