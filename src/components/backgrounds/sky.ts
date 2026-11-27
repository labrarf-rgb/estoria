import type { SceneId } from "./scenes";

export type DrawnScene = Exclude<SceneId, "plain">;

/*
 * Each scene's sky is a CSS gradient built from the live tokens with
 * color-mix, so it always lands on the page's own --bg and follows any token
 * change. The canvas only draws the moving parts.
 *
 * Retuned from TTePub's sky.ts for Estoria's warm palette, with the stops Ray
 * approved in the mockup (docs/backgrounds/mockup/index.html): the tints move
 * from blue (hue 240 to 262) to brown (hue 55 to 70) at lower chroma, and
 * underwater's teal toward a muted sea green.
 *
 * Light skies never go darker than --bg: light --soft on --bg is already under
 * 4.5:1, so a darker sky would push panel text further down. Dark skies stay
 * within a few L of --bg-deep / --bg.
 */
export const SCENE_SKY: Record<DrawnScene, string> = {
  "starry-night":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg-deep) 66%, oklch(0.2 0.022 55)) 0%, color-mix(in oklab, var(--bg-deep) 88%, oklch(0.22 0.016 60)) 45%, var(--bg) 100%)",
  underwater:
    "linear-gradient(180deg, color-mix(in oklab, var(--bg) 66%, oklch(0.3 0.03 185)) 0%, color-mix(in oklab, var(--bg) 74%, oklch(0.25 0.025 190)) 50%, color-mix(in oklab, var(--bg-deep) 82%, oklch(0.19 0.02 195)) 100%)",
  "snowy-night":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg-deep) 80%, oklch(0.22 0.014 70)) 0%, var(--bg) 70%, color-mix(in oklab, var(--bg) 88%, oklch(0.34 0.01 70)) 100%)",
  "rainy-night":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg-deep) 76%, oklch(0.22 0.012 65)) 0%, var(--bg) 75%, color-mix(in oklab, var(--bg) 90%, oklch(0.3 0.008 65)) 100%)",
  // A page a touch paler than --bg; the sun's glow is painted on the canvas, since it moves with the time of day.
  "sunny-day": "linear-gradient(180deg, color-mix(in oklab, var(--bg) 80%, var(--card)) 0%, var(--bg) 100%)",
  // Shallow sunlit water: a pale sea-green wash that brightens toward the surface.
  "underwater-day":
    "linear-gradient(180deg, color-mix(in oklab, var(--card) 62%, oklch(0.95 0.028 180)) 0%, color-mix(in oklab, var(--bg) 56%, oklch(0.93 0.032 178)) 45%, color-mix(in oklab, var(--bg) 60%, oklch(0.915 0.032 175)) 100%)",
  "snowy-day":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg) 70%, oklch(0.935 0.01 80)) 0%, color-mix(in oklab, var(--bg) 86%, oklch(0.93 0.008 80)) 55%, color-mix(in oklab, var(--bg) 62%, var(--card)) 100%)",
  "rainy-day":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg) 66%, oklch(0.92 0.012 70)) 0%, color-mix(in oklab, var(--bg) 86%, oklch(0.915 0.008 70)) 60%, var(--bg) 100%)",
};
