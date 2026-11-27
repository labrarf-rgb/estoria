import { useStore } from "@/store/useStore";
import { scenesForTheme } from "@/components/backgrounds/scenes";
import { SHUFFLE, THEME_MODES, parseSceneChoice, type ThemeMode } from "@/lib/look";

/**
 * Theme and Background, in the toolbar's Settings popover (the approved
 * mockup, docs/backgrounds/mockup/).
 *
 *  - **Theme** is a three-way segment: Light, Dark, Auto. Auto follows the
 *    clock (light from 6:00 to 17:59), as in TTePub.
 *  - **Background** is a native dropdown for the theme on screen: Plain, that
 *    theme's scenes, then Shuffle. Picking a scene also sets the other theme to
 *    its counterpart (see `lib/look.ts`). No swatch, no theme label and no
 *    helper lines: Ray asked for none.
 */
export function LookSettings() {
  const theme = useStore((s) => s.theme);
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const choice = useStore((s) => (s.theme === "dark" ? s.sceneDark : s.sceneLight));
  const chooseScene = useStore((s) => s.chooseScene);

  return (
    <>
      <div className="px-[11px] pb-[6px] pt-[7px]">
        <span id="theme-label" className="text-[12.5px] font-semibold text-ink">
          Theme
        </span>
        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="mt-[7px] grid grid-cols-3 gap-[2px] rounded-[9px] bg-chip p-[3px]"
        >
          {THEME_MODES.map((m) => {
            const on = themeMode === m;
            return (
              <button
                key={m}
                role="radio"
                aria-checked={on}
                onClick={() => setThemeMode(m)}
                className={`flex h-[27px] items-center justify-center gap-[5px] rounded-[7px] text-[11.5px] ${
                  on ? "bg-card font-semibold text-ink" : "font-medium text-soft hover:text-ink"
                }`}
              >
                <ModeIcon mode={m} />
                {LABEL[m]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-[11px] pb-[6px] pt-[7px]">
        <label htmlFor="background-select" className="text-[12.5px] font-semibold text-ink">
          Background
        </label>
        <div className="relative mt-[7px]">
          <select
            id="background-select"
            value={choice}
            onChange={(e) => chooseScene(parseSceneChoice(e.target.value))}
            className="w-full cursor-pointer appearance-none rounded-lg border border-rule bg-card py-[6px] pl-[10px] pr-[28px] text-[12.5px] font-medium text-ink hover:border-faint"
          >
            {scenesForTheme(theme).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value={SHUFFLE}>Shuffle</option>
          </select>
          {/* The chevron: a native select drawn without the platform's arrow. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[11px] top-1/2 mt-[-5px] h-[6px] w-[6px] rotate-45 border-b-[1.5px] border-r-[1.5px] border-soft"
          />
        </div>
      </div>
    </>
  );
}

const LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark", auto: "Auto" };

/** Simple line icons, as in the mockup: a sun, a moon, and a half-shaded clock face for Auto. */
function ModeIcon({ mode }: { mode: ThemeMode }) {
  const props = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };
  if (mode === "light") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg {...props}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 7h5M12 12h7M12 17h5" />
    </svg>
  );
}
