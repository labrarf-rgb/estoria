import { useStore } from "@/store/useStore";
import { useDurability } from "@/lib/storageDurability";
import { Scrim, stop } from "@/components/ui/Overlay";
import { SCHEMA_VERSION } from "@/types";

/** File → About (mirrors the Android app's menu item). */
export function AboutModal() {
  const show = useStore((s) => s.showAbout);
  const setPanel = useStore((s) => s.setPanel);
  const durability = useDurability();
  if (!show) return null;
  const close = () => setPanel("showAbout", false);

  // Build stamp. `build` increments on every commit, so this changes for every
  // change you deploy — compare it (or the SHA) against what you shipped to
  // confirm the website is serving your latest build. Injected into index.html
  // by the estoria-build-info plugin: fresh per load in dev, frozen in prod.
  const b = window.__ESTORIA_BUILD__;
  const stamp = b
    ? `v${b.version} · build ${b.build} · ${b.commit}` +
      (b.builtAt ? ` · ${b.builtAt.slice(0, 16).replace("T", " ")} UTC` : "")
    : "build info unavailable";

  return (
    <Scrim onClose={close} z={70} center>
      <div
        onMouseDown={stop}
        className="w-[min(400px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="px-[26px] pb-[8px] pt-[24px]">
          <div className="font-serif text-[24px] font-semibold text-ink">Estoria</div>
          <div className="mt-[4px] text-[13px] leading-[1.55] text-soft">
            Map and Write Your Story. Chapters, scenes, characters and worlds.
          </div>
          <div className="mt-[14px] space-y-[5px] text-[12px] leading-[1.5] text-soft">
            <div>
              Your work auto-saves in this browser and can sync with the Estoria Android
              app through a shared folder (footer → Sync).
            </div>
            {/* Whether the browser has promised to keep this origin's storage,
                or only to keep it while it feels like it. The second answer is
                the reason the Sync folder and exports exist, so it says so. */}
            {durability === "best-effort" ? (
              <div style={{ color: "var(--but)" }}>
                This browser has not granted Estoria durable storage, so it may clear your
                projects if the disk runs low. Keep a synced folder or an export.
              </div>
            ) : durability === "persistent" ? (
              <div className="text-faint">
                Storage is durable — only you can clear this browser's copy.
              </div>
            ) : null}
            <div className="text-faint">Project file format: .estoria.json (schema v{SCHEMA_VERSION})</div>
            <div className="text-faint">{stamp}</div>
          </div>
          <div className="mt-[14px] text-[12.5px] text-soft">
            Built by{" "}
            <a
              href="https://labrarf.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink underline decoration-rule underline-offset-2"
            >
              Ray Labra
            </a>
          </div>
        </div>
        <div className="flex items-center justify-end px-[26px] py-[16px]">
          <button
            onClick={close}
            className="rounded-lg border border-rule bg-card px-[14px] py-[7px] text-[13px] font-medium text-ink hover:border-faint"
          >
            Close
          </button>
        </div>
      </div>
    </Scrim>
  );
}
