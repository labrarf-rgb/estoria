import type { SceneId } from "./scenes";

export type DrawnScene = Exclude<SceneId, "plain">;

/*
 * Each scene's sky is a CSS gradient. Starry night, Snowy and Rainy build
 * theirs from the live tokens with color-mix, so they land on the page's own
 * --bg and follow any token change; the round 7 skies (below) are fixed
 * colors. The canvas only draws the moving parts.
 *
 * Retuned from TTePub's sky.ts for Estoria's warm palette, with the stops Ray
 * approved in the mockup (docs/backgrounds/mockup/index.html): the tints move
 * from blue (hue 240 to 262) to brown (hue 55 to 70) at lower chroma.
 *
 * Light skies never go darker than --bg: light --soft on --bg is already under
 * 4.5:1, so a darker sky would push panel text further down. Dark skies stay
 * within a few L of --bg-deep / --bg.
 *
 * Round 7 (docs/backgrounds/mockup/NOTES.md, "Ray's picks") breaks that rule on
 * purpose for four light skies Ray chose by eye: Sunny day's deep blue, and the
 * turquoise of his reference photos for Underwater, Sea bed and Above water.
 * Soft text on a 40% frame drops to 2.75 to 3.19 over them (floor 3.99); prose
 * stays at 6.9 or more. Those skies and the round 7 dark ones are fixed colors, not
 * token mixes, written as hex so the browser blends them in sRGB exactly as
 * the mockup measured them. Every dark one holds the dark floor.
 */
export const SCENE_SKY: Record<DrawnScene, string> = {
  "starry-night":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg-deep) 66%, oklch(0.2 0.022 55)) 0%, color-mix(in oklab, var(--bg-deep) 88%, oklch(0.22 0.016 60)) 45%, var(--bg) 100%)",
  // Teal night, to go with the tropical lagoon: lighter near the surface, deeper below.
  underwater: "linear-gradient(180deg, #09282a 0%, #062023 50%, #05171b 100%)",
  // Deep teal water over a dark, warm sand floor.
  "sea-bed": "linear-gradient(180deg, #072426 0%, #071d1d 55%, #151911 80%, #211b11 100%)",
  // Deep teal easing to a darker warm grey.
  "above-water": "linear-gradient(180deg, #042326 0%, #071f20 35%, #14160f 70%, #13100d 100%)",
  "snowy-night":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg-deep) 80%, oklch(0.22 0.014 70)) 0%, var(--bg) 70%, color-mix(in oklab, var(--bg) 88%, oklch(0.34 0.01 70)) 100%)",
  "rainy-night":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg-deep) 76%, oklch(0.22 0.012 65)) 0%, var(--bg) 75%, color-mix(in oklab, var(--bg) 90%, oklch(0.3 0.008 65)) 100%)",
  // Deep blue: a midday blue at the top fading to a pale sunlit haze. The sun's glow is painted on the canvas, since it moves with the time of day.
  "sunny-day": "linear-gradient(180deg, #89c2ed 0%, #b2dbf4 50%, #f5eede 100%)",
  // The clear lagoon: turquoise shallows, brightest at the surface.
  "underwater-day": "linear-gradient(180deg, #a2dcdf 0%, #6ecbd0 40%, #40b6c0 100%)",
  // The lagoon over sand: turquoise easing to pale sand under the water at the bottom.
  "sea-bed-day": "linear-gradient(180deg, #a2dcdf 0%, #68c8cf 50%, #86cbc6 80%, #c6d8c0 100%)",
  // Shallow water from above (Ray's third photo): turquoise at the top, pale sandy shallows at the bottom.
  "above-water-day": "linear-gradient(180deg, #32bac0 0%, #5ac1c3 25%, #8bc5c7 45%, #b0d0d2 62%, #c4d6d8 100%)",
  "snowy-day":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg) 70%, oklch(0.935 0.01 80)) 0%, color-mix(in oklab, var(--bg) 86%, oklch(0.93 0.008 80)) 55%, color-mix(in oklab, var(--bg) 62%, var(--card)) 100%)",
  "rainy-day":
    "linear-gradient(180deg, color-mix(in oklab, var(--bg) 66%, oklch(0.92 0.012 70)) 0%, color-mix(in oklab, var(--bg) 86%, oklch(0.915 0.008 70)) 60%, var(--bg) 100%)",
};
