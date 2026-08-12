import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useLoadState } from "@/store/hydration";
import { armWrites, readUnreadableBackups, type LoadFailure } from "@/store/persistence";
import { AppIcon } from "@/components/ui/AppIcon";

/**
 * What shows when the stored document could not be read.
 *
 * The alternative — and what the app did before — is the first-launch chooser,
 * because a failed load and an empty browser both arrive as "no state". They
 * are not the same thing at all: one of them has a manuscript behind it, and
 * both of that screen's buttons overwrite it.
 *
 * So this screen exists to do three things, in order of how much they matter:
 * say plainly that nothing has been overwritten, get any rescued copy onto
 * disk, and only then offer a way forward. Auto-save stays locked the whole
 * time (see `writesArmed` in store/persistence.ts) — the app is deliberately
 * read-only until the reader decides, so nothing they do here can make it
 * worse.
 */
export function Recovery() {
  const load = useLoadState();
  const askConfirm = useStore((s) => s.askConfirm);
  const startFresh = useStore((s) => s.startFresh);
  const [dismissed, setDismissed] = useState(false);
  const [rescued] = useState(readUnreadableBackups);

  if (load.kind !== "failed" || dismissed) return null;
  const { failure } = load;

  const download = (key: string, raw: string) => {
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estoria-recovered-${key.split(":").pop()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Deliberately the smallest of the three buttons, and the only one behind a
  // confirm: it is the one that makes the failure permanent.
  const overwrite = () =>
    askConfirm({
      message: "Start over and overwrite what couldn't be read?",
      detail:
        "Estoria will begin a new, empty project and save over the copy it can't open. If you haven't downloaded that copy, do it first — this cannot be undone.",
      confirmLabel: "Start over",
      danger: true,
      onConfirm: () => {
        armWrites();
        startFresh();
        setDismissed(true);
      },
    });

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-6"
      style={{ background: "rgba(20,14,6,.72)", backdropFilter: "blur(3px)" }}
    >
      <div className="w-[min(620px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-[12px] border-b border-rule px-[28px] py-[22px]">
          <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-rule bg-card">
            <AppIcon size={34} />
          </div>
          <div>
            <div className="font-serif text-[21px] font-semibold text-ink">
              Estoria couldn't open your saved work
            </div>
            <div className="text-[12.5px] font-medium text-soft">
              Nothing has been changed or overwritten. Auto-save is paused until you choose.
            </div>
          </div>
        </div>

        <div className="px-[28px] py-[22px]">
          <div className="text-[13px] leading-[1.6] text-ink">{explain(failure)}</div>

          {rescued.length > 0 && (
            <div className="mt-[18px] rounded-[14px] border border-rule bg-card p-[16px]">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                Rescued copy
              </div>
              <div className="mt-[6px] text-[12.5px] leading-[1.5] text-soft">
                Estoria set the unreadable data aside instead of writing over it. Download it
                before anything else — it is the last copy, and a person or a text editor can
                often get the writing back out of it.
              </div>
              <div className="mt-[10px] flex flex-wrap gap-[8px]">
                {rescued.map(({ key, raw }) => (
                  <button
                    key={key}
                    onClick={() => download(key, raw)}
                    className="rounded-lg bg-ink px-[14px] py-[7px] text-[13px] font-semibold text-bg"
                  >
                    Download ({Math.round(raw.length / 1024)} KB)
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-[18px] text-[12.5px] leading-[1.6] text-soft">
            If you sync to a folder or keep exports, that copy is untouched — reloading and
            importing it is the safest way back. Most failures here are temporary; a reload is
            worth trying first.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-[10px] border-t border-rule px-[28px] py-[18px]">
          <button
            onClick={overwrite}
            className="mr-auto rounded-lg border border-rule bg-card px-[12px] py-[7px] text-[12.5px] font-medium text-soft hover:border-faint"
          >
            Start over instead
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg border border-rule bg-card px-[14px] py-[7px] text-[13px] font-medium text-ink hover:border-faint"
            title="Look around without saving. Auto-save stays paused."
          >
            Continue without saving
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-ink px-[14px] py-[7px] text-[13px] font-semibold text-bg"
          >
            Reload and try again
          </button>
        </div>
      </div>
    </div>
  );
}

function explain(f: LoadFailure): string {
  switch (f.code) {
    case "unavailable":
      return `This browser wouldn't let Estoria read its storage, so we can't tell whether a project is saved here. This is usually a private window, a blocked-cookies setting for this site, or storage that's temporarily unavailable. (${f.detail})`;
    case "unreadable":
      return f.savedAs
        ? "There is a project saved here, but it wouldn't parse — most often a save that was cut off partway. It has been copied aside untouched, and you can download it below."
        : "There is a project saved here, but it wouldn't parse, and there wasn't room to copy it aside. Don't start over until you've exported or synced from another device.";
    case "prose-unreachable":
      return `Your project map loaded, but the database holding the chapter manuscripts couldn't be opened, so every chapter would look empty. Estoria stopped rather than show you a blank book and save it that way. This often clears on a reload, or after closing other Estoria windows. (${f.detail})`;
  }
}
