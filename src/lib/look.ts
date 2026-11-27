/**
 * The look: theme mode (Light, Dark, or Auto by the clock) and the background
 * scene for each theme, including Shuffle. Pure functions, no DOM and no
 * store, so the rules can be tested on their own. After TTePub's
 * `src/ui/state/look.ts`.
 *
 * All of it is a local UI preference, kept in the shell (`estoria:shell:v2`)
 * like `theme`. None of it is in the project file, so the phone never sees it.
 */
import {
  counterpartOf,
  parseSceneId,
  sceneForTheme,
  scenesForTheme,
  type SceneId,
  type SceneTheme,
} from "@/components/backgrounds/scenes";

export type Theme = SceneTheme;
export type ThemeMode = Theme | "auto";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "auto"];

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "auto";
}

/** Auto: light from 6:00 to 17:59 local time, dark otherwise (as TTePub). */
export function autoTheme(at: Date): Theme {
  const h = at.getHours();
  return h >= 6 && h < 18 ? "light" : "dark";
}

/** The theme to show for a mode at a time. */
export function effectiveTheme(mode: ThemeMode, at: Date): Theme {
  return mode === "auto" ? autoTheme(at) : mode;
}

/** A theme's background choice: a scene, or Shuffle (a random scene other than Plain). */
export type SceneChoice = SceneId | "shuffle";
export const SHUFFLE = "shuffle" as const;

/** For values read back from storage: anything unknown becomes Plain. */
export function parseSceneChoice(v: unknown): SceneChoice {
  return v === SHUFFLE ? SHUFFLE : parseSceneId(v);
}

/** The scenes Shuffle draws from in a theme: every scene for it except Plain, so the dot grid never flickers on. */
export function shufflePool(theme: Theme): SceneId[] {
  return scenesForTheme(theme)
    .map((s) => s.id)
    .filter((id) => id !== "plain");
}

/** A new Shuffle pick: never the previous one when there is another choice. */
export function pickShuffle(theme: Theme, previous?: SceneId, rand: () => number = Math.random): SceneId {
  const pool = shufflePool(theme);
  if (!pool.length) return "plain";
  const choices = pool.length > 1 && previous ? pool.filter((id) => id !== previous) : pool;
  return choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))]!;
}

/** One Shuffle pick per theme. Made fresh each time the app opens, never stored. */
export type ShufflePicks = Record<Theme, SceneId>;

export function freshShufflePicks(rand: () => number = Math.random): ShufflePicks {
  return { light: pickShuffle("light", undefined, rand), dark: pickShuffle("dark", undefined, rand) };
}

export interface ScenePrefs {
  sceneLight: SceneChoice;
  sceneDark: SceneChoice;
}

export function choiceFor(prefs: ScenePrefs, theme: Theme): SceneChoice {
  return theme === "dark" ? prefs.sceneDark : prefs.sceneLight;
}

/** The scene to draw: the theme's choice mapped onto it, or its Shuffle pick. */
export function sceneToShow(prefs: ScenePrefs, picks: ShufflePicks, theme: Theme): SceneId {
  const choice = choiceFor(prefs, theme);
  if (choice !== SHUFFLE) return sceneForTheme(choice, theme);
  const pick = picks[theme];
  const pool = shufflePool(theme);
  // Deterministic fallback: this runs on every render, and a random one would remount the scene each time.
  return pool.includes(pick) ? pick : (pool[0] ?? "plain");
}

/** The look prefs as the shell stores them (beside `theme`). Shuffle picks are never among them. */
export interface LookPrefs {
  themeMode: ThemeMode;
  sceneLight: SceneChoice;
  sceneDark: SceneChoice;
}

/**
 * A stored choice checked against its own theme: Shuffle stays, a scene from
 * the other theme becomes its counterpart (or Plain), so the dropdown and the
 * layer always agree.
 */
export function choiceForTheme(v: unknown, theme: Theme): SceneChoice {
  const choice = parseSceneChoice(v);
  return choice === SHUFFLE ? SHUFFLE : sceneForTheme(choice, theme);
}

/**
 * Reads the look prefs back from a stored shell, defensively. A shell written
 * before they existed has no `themeMode`: its stored theme becomes the mode,
 * so the Theme control matches what is on screen. Unknown scene values (or
 * none) become Plain, a scene stored under the wrong theme becomes its
 * counterpart, and Shuffle survives.
 */
export function readLookPrefs(stored: Record<string, unknown>): LookPrefs {
  return {
    themeMode: isThemeMode(stored.themeMode) ? stored.themeMode : stored.theme === "dark" ? "dark" : "light",
    sceneLight: choiceForTheme(stored.sceneLight, "light"),
    sceneDark: choiceForTheme(stored.sceneDark, "dark"),
  };
}

/** What the shell stores of the look: exactly the three prefs, never the Shuffle picks. */
export function lookPrefsToStore(s: LookPrefs): LookPrefs {
  return { themeMode: s.themeMode, sceneLight: s.sceneLight, sceneDark: s.sceneDark };
}

/**
 * What picking `choice` in Settings changes, while `theme` is on screen:
 *  - Shuffle: both themes shuffle, so a theme change keeps shuffling, and the
 *    theme on screen gets a new pick right away (never the scene showing now).
 *  - A scene: it becomes this theme's choice, and the other theme gets its
 *    counterpart, so switching theme keeps the idea (Snowy night gives Snowy
 *    day). Every scene except Plain has one; Plain leaves the other theme alone.
 */
export function chooseScene(
  prefs: ScenePrefs,
  picks: ShufflePicks,
  theme: Theme,
  choice: SceneChoice,
  rand: () => number = Math.random,
): { prefs: ScenePrefs; picks: ShufflePicks } {
  if (choice === SHUFFLE) {
    const showing = sceneToShow(prefs, picks, theme);
    return {
      prefs: { sceneLight: SHUFFLE, sceneDark: SHUFFLE },
      picks: { ...picks, [theme]: pickShuffle(theme, showing, rand) },
    };
  }
  const id = sceneForTheme(choice, theme);
  const next: ScenePrefs = theme === "dark" ? { ...prefs, sceneDark: id } : { ...prefs, sceneLight: id };
  const pair = counterpartOf(id);
  if (pair) {
    if (theme === "dark") next.sceneLight = pair;
    else next.sceneDark = pair;
  }
  return { prefs: next, picks };
}
