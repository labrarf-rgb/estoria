import { useEffect, useState } from "react";
import { docHasContent, useStore } from "@/store/useStore";
import { useHydrated, useLoadState } from "@/store/hydration";
import { AppIcon } from "@/components/ui/AppIcon";

/** How long a load may take before we say something rather than show nothing. */
const PATIENCE_MS = 600;

/**
 * First-launch chooser: explore the sample story, or start a fresh project.
 *
 * **Gated on hydration, which is the whole point.** `onboarded` is false in the
 * store's defaults, so before the persisted state is read back this screen is
 * what an existing writer's document looks like — and its buttons replace that
 * document. It renders only once the load has actually finished and actually
 * found nothing. See store/hydration.ts.
 */
export function Welcome() {
  const onboarded = useStore((s) => s.onboarded);
  const useSample = useStore((s) => s.useSample);
  const startFresh = useStore((s) => s.startFresh);
  const keepCurrent = useStore((s) => s.keepCurrent);
  const doc = useStore((s) => s.doc);
  const hydrated = useHydrated();
  const load = useLoadState();
  // A load is normally over in a few milliseconds and a spinner would be a
  // flash of noise. A load that isn't needs to say so, because an empty board
  // with nothing on it reads as work that has gone missing.
  const [patienceUp, setPatienceUp] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    const t = setTimeout(() => setPatienceUp(true), PATIENCE_MS);
    return () => clearTimeout(t);
  }, [hydrated]);

  if (!hydrated) return patienceUp ? <Restoring /> : null;
  // A failed load has its own screen, which must not be raced by this one.
  if (load.kind === "failed") return null;
  if (onboarded) return null;
  const existing = docHasContent(doc);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "rgba(20,14,6,.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="w-[min(720px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-[12px] border-b border-rule px-[28px] py-[22px]">
          {/* The card keeps its full 40px and the circle is sized to hold it —
              57px is where a rotated 40px square just fits, so 64 leaves the
              corners room to breathe rather than grazing the edge. */}
          <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border border-rule bg-card">
            <AppIcon size={40} />
          </div>
          <div>
            <div className="font-serif text-[22px] font-semibold text-ink">Welcome to Estoria</div>
            <div className="text-[12.5px] font-medium text-soft">
              Map and Write Your Story. Chapters, scenes, characters and worlds.
            </div>
          </div>
        </div>

        {/* A project is loaded behind this screen — so the only safe answer is
            already on the table, and it goes first. Reaching this state means
            something is off (nothing sets `onboarded: false` over real work),
            but "we are confused, choose which way to destroy it" is not a
            question to ask a writer. Both other options stay, behind confirms
            that carry a download of their own. */}
        {existing && (
          <div className="border-b border-rule bg-card px-[24px] py-[18px]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Already open
            </div>
            <div className="mt-[6px] flex flex-wrap items-center justify-between gap-[12px]">
              <div>
                <div className="font-serif text-[17px] font-semibold text-ink">
                  {doc.projectTitle}
                </div>
                <div className="text-[12.5px] text-soft">
                  {summarize(doc.chapters.length, doc.characters.length, doc.world.length)} · saved
                  in this browser
                </div>
              </div>
              <button
                onClick={keepCurrent}
                className="rounded-lg bg-ink px-[16px] py-[8px] text-[13px] font-semibold text-bg"
              >
                Keep working on this
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-[14px] p-[24px] sm:grid-cols-2">
          <button
            onClick={useSample}
            className="flex flex-col gap-[8px] rounded-[15px] border border-rule bg-card p-[18px] text-left hover:border-faint"
          >
            <span className="font-serif text-[17px] font-semibold text-ink">Explore the sample</span>
            <span className="text-[12.5px] leading-[1.5] text-soft">
              Open "The Drowned Map", a finished 8-chapter example with characters, a world, and a
              3-book series. Best way to see what Estoria does.
            </span>
            <span className="mt-[4px] text-[11px] font-semibold uppercase tracking-wide text-faint">
              Recommended for a first look
            </span>
          </button>

          <button
            onClick={startFresh}
            className="flex flex-col gap-[8px] rounded-[15px] border border-rule bg-card p-[18px] text-left hover:border-faint"
          >
            <span className="font-serif text-[17px] font-semibold text-ink">Start fresh</span>
            <span className="text-[12.5px] leading-[1.5] text-soft">
              Begin a new, empty project. You'll pick how to start your first book: a proven
              structure template, a blank chapter, or import an existing draft.
            </span>
            <span className="mt-[4px] text-[11px] font-semibold uppercase tracking-wide text-faint">
              A blank canvas
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** "8 chapters · 5 characters · 3 world entries", skipping whatever is zero. */
function summarize(chapters: number, characters: number, world: number): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (chapters > 0) parts.push(count(chapters, "chapter", "chapters"));
  if (characters > 0) parts.push(count(characters, "character", "characters"));
  if (world > 0) parts.push(count(world, "world entry", "world entries"));
  return parts.length ? parts.join(" · ") : "no chapters yet";
}

/**
 * Shown while the stored document is still being read, and only once that has
 * taken long enough to be worth mentioning. It says "your work" on purpose:
 * the one thing someone staring at a slow launch needs to know is that nothing
 * has been lost or overwritten.
 */
function Restoring() {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "rgba(20,14,6,.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="flex items-center gap-[14px] rounded-2xl border border-rule bg-panel px-[26px] py-[20px] shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-rule bg-card">
          <AppIcon size={30} />
        </div>
        <div>
          <div className="font-serif text-[17px] font-semibold text-ink">Opening your work…</div>
          <div className="text-[12.5px] text-soft">
            Reading the projects saved in this browser. Nothing is being changed.
          </div>
        </div>
      </div>
    </div>
  );
}
