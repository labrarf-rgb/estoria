import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Scrim, stop } from "@/components/ui/Overlay";
import { detectBrowser, promptInstall, useCanInstall, type Browser } from "@/lib/install";

/**
 * File → Install Estoria.
 *
 * Two shapes, depending on the browser. Chromium fires `beforeinstallprompt`,
 * so there's a real button that opens the native dialog. Safari and Firefox
 * have no such event — installing is a menu the user has to find themselves —
 * so the dialog turns into directions instead of pretending to have a button.
 */

/** Manual steps, for browsers that won't give us a prompt to fire. */
const STEPS: Record<Browser, string[]> = {
  chromium: [
    "Open the ⋮ menu at the top right of the browser",
    "Choose Cast, save and share → Install page as app",
    "Confirm — Estoria opens in its own window",
  ],
  safari: [
    "Open the File menu in Safari",
    "Choose Add to Dock…",
    "Confirm — Estoria gets its own Dock icon and window",
  ],
  "ios-safari": [
    "Tap the Share button at the bottom of Safari",
    "Scroll down and tap Add to Home Screen",
    "Tap Add — Estoria appears with the other apps",
  ],
  firefox: [
    "Firefox on the desktop can't install web apps yet",
    "Chrome, Edge, or Safari will give Estoria its own window",
    "Bookmarking this page works everywhere in the meantime",
  ],
  other: [
    "Look for Install, Add to Home Screen, or Add to Dock in the browser's menu",
    "Not every browser can do this — Chrome, Edge and Safari can",
  ],
};

export function InstallModal() {
  const show = useStore((s) => s.showInstall);
  const setPanel = useStore((s) => s.setPanel);
  const canInstall = useCanInstall();
  const [dismissed, setDismissed] = useState(false);
  if (!show) return null;
  const close = () => setPanel("showInstall", false);

  const onInstall = async () => {
    const outcome = await promptInstall();
    // Accepting closes this dialog behind the browser's own install flow;
    // declining keeps it open with the manual steps, since the captured
    // prompt is now spent and the button can't be offered a second time.
    if (outcome === "accepted") close();
    else setDismissed(true);
  };

  const steps = STEPS[detectBrowser()];

  return (
    <Scrim onClose={close} z={70} center>
      <div
        onMouseDown={stop}
        className="w-[min(430px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="px-[26px] pb-[8px] pt-[24px]">
          <div className="font-serif text-[24px] font-semibold text-ink">Install Estoria</div>
          <div className="mt-[4px] text-[13px] leading-[1.55] text-soft">
            Keep it out of the browser: its own window, its own icon in the dock or
            taskbar, and no address bar over your board.
          </div>

          <ul className="mt-[14px] space-y-[6px] text-[12.5px] leading-[1.5] text-soft">
            <li>· Opens in a plain window — no tabs, no address bar</li>
            <li>· Works with no connection once it has loaded once</li>
            <li>· Same projects, same browser storage — nothing moves or is copied</li>
          </ul>

          {canInstall && !dismissed ? (
            <div className="mt-[16px] text-[12px] text-faint">
              Your browser can do this in one step.
            </div>
          ) : (
            <div className="mt-[16px]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                How to install
              </div>
              <ol className="mt-[8px] space-y-[6px] text-[12.5px] leading-[1.5] text-soft">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-[8px]">
                    <span className="font-mono text-[11px] text-faint">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[26px] py-[16px]">
          <button
            onClick={close}
            className="rounded-lg border border-rule bg-card px-[14px] py-[7px] text-[13px] font-medium text-ink hover:border-faint"
          >
            {canInstall && !dismissed ? "Not now" : "Close"}
          </button>
          {canInstall && !dismissed && (
            <button
              onClick={onInstall}
              className="rounded-lg bg-ink px-[14px] py-[7px] text-[13px] font-semibold text-bg"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </Scrim>
  );
}
