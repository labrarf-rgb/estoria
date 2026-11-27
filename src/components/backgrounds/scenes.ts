/*
 * Background scenes: ids, labels and theme rules. Pure data, no DOM, so the
 * Settings popover and prefs can import it without pulling in any canvas code.
 *
 * Ported from TTePub (src/ui/backgrounds/scenes.ts). One change: in Estoria
 * Starry night and Sunny day are each other's counterpart (Ray, mockup
 * round 2), so every scene has one.
 */

export type SceneTheme = "light" | "dark";

export type SceneId =
  | "plain"
  | "starry-night"
  | "underwater"
  | "snowy-night"
  | "rainy-night"
  | "sunny-day"
  | "underwater-day"
  | "snowy-day"
  | "rainy-day";

export interface SceneMeta {
  id: SceneId;
  /** Settings label, neutral voice, sentence case. */
  label: string;
  /** Themes the scene is drawn in. `plain` works in both. */
  themes: readonly SceneTheme[];
}

/** In display order: Plain first, then the dark scenes, then the light ones. */
export const SCENES: readonly SceneMeta[] = [
  { id: "plain", label: "Plain", themes: ["light", "dark"] },
  { id: "starry-night", label: "Starry night", themes: ["dark"] },
  { id: "underwater", label: "Underwater", themes: ["dark"] },
  { id: "snowy-night", label: "Snowy night", themes: ["dark"] },
  { id: "rainy-night", label: "Rainy night", themes: ["dark"] },
  { id: "sunny-day", label: "Sunny day", themes: ["light"] },
  { id: "underwater-day", label: "Underwater", themes: ["light"] },
  { id: "snowy-day", label: "Snowy day", themes: ["light"] },
  { id: "rainy-day", label: "Rainy day", themes: ["light"] },
];

export const DEFAULT_SCENE: SceneId = "plain";

/** What to store before anything is picked: Plain in both themes. */
export const DEFAULT_SCENES_BY_THEME: Readonly<Record<SceneTheme, SceneId>> = {
  light: "plain",
  dark: "plain",
};

const BY_ID: ReadonlyMap<SceneId, SceneMeta> = new Map(SCENES.map((s) => [s.id, s]));

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && BY_ID.has(value as SceneId);
}

/** For values read back from storage: anything unknown becomes `plain`. */
export function parseSceneId(value: unknown): SceneId {
  return isSceneId(value) ? value : DEFAULT_SCENE;
}

export function sceneMeta(id: SceneId): SceneMeta {
  return BY_ID.get(id) ?? SCENES[0]!;
}

export function sceneSupports(id: SceneId, theme: SceneTheme): boolean {
  return sceneMeta(id).themes.includes(theme);
}

/** The scenes Settings should offer in a theme, in display order. */
export function scenesForTheme(theme: SceneTheme): SceneMeta[] {
  return SCENES.filter((s) => s.themes.includes(theme));
}

/** Each scene's counterpart in the other theme, where one exists. */
const COUNTERPART: Partial<Record<SceneId, SceneId>> = {
  "starry-night": "sunny-day",
  "sunny-day": "starry-night",
  underwater: "underwater-day",
  "underwater-day": "underwater",
  "snowy-night": "snowy-day",
  "snowy-day": "snowy-night",
  "rainy-night": "rainy-day",
  "rainy-day": "rainy-night",
};

/** The scene's counterpart in the other theme, if it has one (plain has none). */
export function counterpartOf(id: SceneId): SceneId | undefined {
  return COUNTERPART[id];
}

/**
 * Maps a choice onto a theme: unchanged if the scene works there, else its
 * counterpart (starry night and sunny day, underwater by night and by day,
 * snowy night and snowy day, rainy night and rainy day), else `plain`.
 */
export function sceneForTheme(id: SceneId, theme: SceneTheme): SceneId {
  if (sceneSupports(id, theme)) return id;
  const other = COUNTERPART[id];
  return other && sceneSupports(other, theme) ? other : DEFAULT_SCENE;
}
