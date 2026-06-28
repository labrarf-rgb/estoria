import { useStore } from "@/store/useStore";

/** First-launch chooser: explore the sample story, or start a fresh project. */
export function Welcome() {
  const onboarded = useStore((s) => s.onboarded);
  const useSample = useStore((s) => s.useSample);
  const startFresh = useStore((s) => s.startFresh);
  if (onboarded) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "rgba(20,14,6,.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="w-[min(720px,100%)] overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-[12px] border-b border-rule px-[28px] py-[22px]">
          <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[9px] bg-ink font-serif text-[18px] font-semibold text-bg">
            E
          </div>
          <div>
            <div className="font-serif text-[22px] font-semibold text-ink">Welcome to Estoria</div>
            <div className="text-[12.5px] font-medium text-soft">
              A visual map for your chapters, scenes, characters and worlds.
            </div>
          </div>
        </div>

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
