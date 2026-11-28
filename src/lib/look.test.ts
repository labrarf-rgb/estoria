import { describe, expect, it } from "vitest";
import {
  autoTheme,
  chooseScene,
  effectiveTheme,
  freshShufflePicks,
  isThemeMode,
  lookPrefsToStore,
  parseSceneChoice,
  readLookPrefs,
  pickShuffle,
  sceneToShow,
  shufflePool,
  type ScenePrefs,
  type ShufflePicks,
} from "./look";
import { SCENES, counterpartOf, sceneForTheme, scenesForTheme } from "@/components/backgrounds/scenes";

const at = (h: number, m = 0) => {
  const d = new Date(2026, 10, 27);
  d.setHours(h, m, 0, 0);
  return d;
};

/** A rand that walks through the given values, then repeats the last. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)]!;
};

const PLAIN: ScenePrefs = { sceneLight: "plain", sceneDark: "plain" };
const PICKS: ShufflePicks = { light: "rainy-day", dark: "snowy-night" };

describe("Auto theme by the clock", () => {
  it.each([
    [0, 0, "dark"],
    [5, 59, "dark"],
    [6, 0, "light"],
    [12, 0, "light"],
    [17, 59, "light"],
    [18, 0, "dark"],
    [23, 30, "dark"],
  ] as const)("%i:%i is %s", (h, m, theme) => {
    expect(autoTheme(at(h, m))).toBe(theme);
  });

  it("only Auto follows the clock", () => {
    expect(effectiveTheme("auto", at(9))).toBe("light");
    expect(effectiveTheme("auto", at(21))).toBe("dark");
    expect(effectiveTheme("light", at(21))).toBe("light");
    expect(effectiveTheme("dark", at(9))).toBe("dark");
  });

  it("recognizes the three modes and nothing else", () => {
    expect(["light", "dark", "auto"].every(isThemeMode)).toBe(true);
    for (const bad of [undefined, null, "", "system", 1]) expect(isThemeMode(bad)).toBe(false);
  });
});

describe("pairing", () => {
  it("pairs Starry night with Sunny day", () => {
    expect(counterpartOf("starry-night")).toBe("sunny-day");
    expect(counterpartOf("sunny-day")).toBe("starry-night");
    expect(sceneForTheme("starry-night", "light")).toBe("sunny-day");
    expect(sceneForTheme("sunny-day", "dark")).toBe("starry-night");
  });

  it("gives every scene but Plain a counterpart in the other theme", () => {
    for (const s of SCENES) {
      const pair = counterpartOf(s.id);
      if (s.id === "plain") {
        expect(pair).toBeUndefined();
        continue;
      }
      expect(pair).toBeDefined();
      const theme = s.themes[0]!;
      const other = theme === "dark" ? "light" : "dark";
      expect(scenesForTheme(other).map((x) => x.id)).toContain(pair);
      expect(counterpartOf(pair!)).toBe(s.id);
    }
  });

  it("picking a scene sets the other theme to its counterpart", () => {
    expect(chooseScene(PLAIN, PICKS, "dark", "snowy-night").prefs).toEqual({ sceneDark: "snowy-night", sceneLight: "snowy-day" });
    expect(chooseScene(PLAIN, PICKS, "light", "sunny-day").prefs).toEqual({ sceneLight: "sunny-day", sceneDark: "starry-night" });
    expect(chooseScene(PLAIN, PICKS, "light", "underwater-day").prefs).toEqual({ sceneLight: "underwater-day", sceneDark: "underwater" });
    expect(chooseScene(PLAIN, PICKS, "dark", "sea-bed").prefs).toEqual({ sceneDark: "sea-bed", sceneLight: "sea-bed-day" });
    expect(chooseScene(PLAIN, PICKS, "light", "above-water-day").prefs).toEqual({ sceneLight: "above-water-day", sceneDark: "above-water" });
  });

  it("picking Plain leaves the other theme alone", () => {
    const prefs: ScenePrefs = { sceneLight: "rainy-day", sceneDark: "rainy-night" };
    expect(chooseScene(prefs, PICKS, "light", "plain").prefs).toEqual({ sceneLight: "plain", sceneDark: "rainy-night" });
  });

  it("picking a scene from the wrong theme maps it first", () => {
    expect(chooseScene(PLAIN, PICKS, "light", "starry-night").prefs).toEqual({ sceneLight: "sunny-day", sceneDark: "starry-night" });
  });
});

describe("Shuffle", () => {
  it("never draws Plain, and draws only the theme's scenes", () => {
    for (const theme of ["light", "dark"] as const) {
      const pool = shufflePool(theme);
      expect(pool).not.toContain("plain");
      expect(pool).toHaveLength(6);
      for (const id of pool) expect(sceneForTheme(id, theme)).toBe(id);
    }
  });

  it("draws from all six scenes of each theme, Sea bed and Above water included", () => {
    expect(shufflePool("dark")).toEqual(["starry-night", "underwater", "sea-bed", "above-water", "snowy-night", "rainy-night"]);
    expect(shufflePool("light")).toEqual(["sunny-day", "underwater-day", "sea-bed-day", "above-water-day", "snowy-day", "rainy-day"]);
    // Walking the random number across its range reaches every scene in the pool.
    for (const theme of ["light", "dark"] as const) {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) seen.add(pickShuffle(theme, undefined, () => i / 60));
      expect([...seen].sort()).toEqual([...shufflePool(theme)].sort());
    }
  });

  it("never repeats the scene showing, the new ones included", () => {
    for (const showing of ["sea-bed", "above-water"] as const) {
      for (let i = 0; i < 40; i++) expect(pickShuffle("dark", showing, () => i / 40)).not.toBe(showing);
    }
    for (const showing of ["sea-bed-day", "above-water-day"] as const) {
      for (let i = 0; i < 40; i++) expect(pickShuffle("light", showing, () => i / 40)).not.toBe(showing);
    }
  });

  it("never repeats the previous pick", () => {
    for (let i = 0; i < 40; i++) {
      const r = i / 40;
      expect(pickShuffle("dark", "starry-night", () => r)).not.toBe("starry-night");
    }
  });

  it("makes a pick for each theme when the app opens", () => {
    const picks = freshShufflePicks(seq(0, 0.99));
    expect(shufflePool("light")).toContain(picks.light);
    expect(shufflePool("dark")).toContain(picks.dark);
  });

  it("choosing it sets both themes to Shuffle and repicks the theme on screen", () => {
    const prefs: ScenePrefs = { sceneLight: "plain", sceneDark: "snowy-night" };
    const out = chooseScene(prefs, { light: "rainy-day", dark: "snowy-night" }, "dark", "shuffle", () => 0);
    expect(out.prefs).toEqual({ sceneLight: "shuffle", sceneDark: "shuffle" });
    expect(out.picks.dark).not.toBe("snowy-night");
    expect(out.picks.light).toBe("rainy-day");
  });

  it("shows the theme's pick, so a theme change keeps shuffling", () => {
    const prefs: ScenePrefs = { sceneLight: "shuffle", sceneDark: "shuffle" };
    expect(sceneToShow(prefs, PICKS, "light")).toBe("rainy-day");
    expect(sceneToShow(prefs, PICKS, "dark")).toBe("snowy-night");
  });

  it("never shows a pick that doesn't fit the theme", () => {
    const prefs: ScenePrefs = { sceneLight: "shuffle", sceneDark: "shuffle" };
    const wrong: ShufflePicks = { light: "starry-night", dark: "sunny-day" };
    expect(shufflePool("light")).toContain(sceneToShow(prefs, wrong, "light"));
    expect(shufflePool("dark")).toContain(sceneToShow(prefs, wrong, "dark"));
  });
});

describe("stored values", () => {
  it("reads back scenes and Shuffle, and anything else as Plain", () => {
    expect(parseSceneChoice("shuffle")).toBe("shuffle");
    expect(parseSceneChoice("rainy-night")).toBe("rainy-night");
    for (const bad of [undefined, null, "", "sunset", 3, {}]) expect(parseSceneChoice(bad)).toBe("plain");
  });

  it("reads a shell from before the look prefs: its theme becomes the mode, scenes are Plain", () => {
    expect(readLookPrefs({ theme: "dark" })).toEqual({ themeMode: "dark", sceneLight: "plain", sceneDark: "plain" });
    expect(readLookPrefs({ theme: "light" })).toEqual({ themeMode: "light", sceneLight: "plain", sceneDark: "plain" });
    expect(readLookPrefs({})).toEqual({ themeMode: "light", sceneLight: "plain", sceneDark: "plain" });
  });

  it("keeps valid look prefs, Shuffle and Auto included, and resets junk", () => {
    expect(readLookPrefs({ theme: "light", themeMode: "auto", sceneLight: "shuffle", sceneDark: "rainy-night" })).toEqual({
      themeMode: "auto",
      sceneLight: "shuffle",
      sceneDark: "rainy-night",
    });
    expect(readLookPrefs({ theme: "dark", themeMode: "system", sceneLight: "sunset", sceneDark: 7 })).toEqual({
      themeMode: "dark",
      sceneLight: "plain",
      sceneDark: "plain",
    });
  });

  it("checks each stored scene against its own theme", () => {
    expect(readLookPrefs({ sceneLight: "starry-night", sceneDark: "sunny-day" })).toEqual({
      themeMode: "light",
      sceneLight: "sunny-day",
      sceneDark: "starry-night",
    });
    expect(readLookPrefs({ sceneLight: "rainy-night", sceneDark: "underwater-day" })).toMatchObject({
      sceneLight: "rainy-day",
      sceneDark: "underwater",
    });
    expect(readLookPrefs({ sceneLight: "shuffle", sceneDark: "plain" })).toMatchObject({ sceneLight: "shuffle", sceneDark: "plain" });
  });

  it("keeps a shell saved before round 7 as it was, and reads the new scenes back", () => {
    // Saved with the scenes shipped on 2026-11-27: every id is still valid.
    expect(readLookPrefs({ theme: "dark", themeMode: "dark", sceneLight: "underwater-day", sceneDark: "underwater" })).toEqual({
      themeMode: "dark",
      sceneLight: "underwater-day",
      sceneDark: "underwater",
    });
    expect(readLookPrefs({ themeMode: "auto", sceneLight: "sea-bed-day", sceneDark: "above-water" })).toMatchObject({
      sceneLight: "sea-bed-day",
      sceneDark: "above-water",
    });
  });

  it("maps a new scene stored under the wrong theme to its counterpart, and unknown ids to Plain", () => {
    expect(readLookPrefs({ sceneLight: "sea-bed", sceneDark: "above-water-day" })).toMatchObject({
      sceneLight: "sea-bed-day",
      sceneDark: "above-water",
    });
    // An id from a later version, or the mockup's working names, loads as Plain rather than failing.
    expect(readLookPrefs({ sceneLight: "coral-reef", sceneDark: "above" })).toMatchObject({ sceneLight: "plain", sceneDark: "plain" });
  });

  it("stores the three look prefs and never the Shuffle picks", () => {
    const state = { themeMode: "auto" as const, sceneLight: "shuffle" as const, sceneDark: "shuffle" as const, shufflePicks: PICKS };
    const stored = lookPrefsToStore(state);
    expect(stored).toEqual({ themeMode: "auto", sceneLight: "shuffle", sceneDark: "shuffle" });
    expect("shufflePicks" in stored).toBe(false);
  });

  it("shows a choice mapped onto the theme on screen", () => {
    const prefs: ScenePrefs = { sceneLight: "plain", sceneDark: "underwater" };
    expect(sceneToShow(prefs, PICKS, "dark")).toBe("underwater");
    expect(sceneToShow(prefs, PICKS, "light")).toBe("plain");
    // A stored choice from the wrong theme (hand-edited storage) still maps.
    expect(sceneToShow({ sceneLight: "snowy-night", sceneDark: "plain" }, PICKS, "light")).toBe("snowy-day");
  });
});
