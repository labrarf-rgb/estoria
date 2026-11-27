// Ported from TTePub (src/ui/backgrounds/scenes.test.ts); Estoria pairs Starry night with Sunny day.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE,
  DEFAULT_SCENES_BY_THEME,
  isSceneId,
  parseSceneId,
  SCENES,
  sceneForTheme,
  sceneSupports,
  scenesForTheme,
  type SceneId,
} from "./scenes";
import { SCENE_SKY } from "./sky";

describe("scene metadata", () => {
  it("lists the nine scenes once each, Plain first", () => {
    expect(SCENES.map((s) => s.id)).toEqual([
      "plain",
      "starry-night",
      "underwater",
      "snowy-night",
      "rainy-night",
      "sunny-day",
      "underwater-day",
      "snowy-day",
      "rainy-day",
    ]);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  });

  it("uses neutral sentence-case labels with no dashes or first and second person", () => {
    for (const { label } of SCENES) {
      expect(label).toMatch(/^[A-Z][a-z]*( [a-z]+)*$/);
      expect(label).not.toMatch(/[-–—]/);
      expect(label).not.toMatch(/\b(you|your|I|my|me)\b/i);
    }
    expect(SCENES.map((s) => s.label)).toEqual([
      "Plain",
      "Starry night",
      "Underwater",
      "Snowy night",
      "Rainy night",
      "Sunny day",
      "Underwater",
      "Snowy day",
      "Rainy day",
    ]);
  });

  it("marks which themes each scene supports", () => {
    expect(sceneSupports("plain", "light")).toBe(true);
    expect(sceneSupports("plain", "dark")).toBe(true);
    for (const id of ["starry-night", "underwater", "snowy-night", "rainy-night"] as const) {
      expect(sceneSupports(id, "dark")).toBe(true);
      expect(sceneSupports(id, "light")).toBe(false);
    }
    for (const id of ["sunny-day", "underwater-day", "snowy-day", "rainy-day"] as const) {
      expect(sceneSupports(id, "light")).toBe(true);
      expect(sceneSupports(id, "dark")).toBe(false);
    }
  });

  it("labels each theme's scenes uniquely", () => {
    for (const theme of ["light", "dark"] as const) {
      const labels = scenesForTheme(theme).map((s) => s.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("offers each theme its own scenes in display order", () => {
    expect(scenesForTheme("dark").map((s) => s.id)).toEqual([
      "plain",
      "starry-night",
      "underwater",
      "snowy-night",
      "rainy-night",
    ]);
    expect(scenesForTheme("light").map((s) => s.id)).toEqual(["plain", "sunny-day", "underwater-day", "snowy-day", "rainy-day"]);
  });

  it("defaults to Plain in both themes", () => {
    expect(DEFAULT_SCENE).toBe("plain");
    expect(DEFAULT_SCENES_BY_THEME).toEqual({ light: "plain", dark: "plain" });
  });

  it("has a sky for every drawn scene", () => {
    for (const { id } of SCENES) {
      if (id === "plain") continue;
      expect(SCENE_SKY[id]).toMatch(/^(linear|radial)-gradient\(/);
    }
  });
});

describe("parseSceneId", () => {
  it("keeps known ids and turns anything else into plain", () => {
    expect(parseSceneId("underwater")).toBe("underwater");
    expect(parseSceneId("rainy-day")).toBe("rainy-day");
    for (const junk of [undefined, null, "", "Starry night", "cloudy-day", 3, {}]) {
      expect(parseSceneId(junk)).toBe("plain");
      expect(isSceneId(junk)).toBe(false);
    }
  });
});

describe("sceneForTheme", () => {
  const cases: [SceneId, SceneId, SceneId][] = [
    // scene, in light, in dark
    ["plain", "plain", "plain"],
    ["starry-night", "sunny-day", "starry-night"],
    ["underwater", "underwater-day", "underwater"],
    ["snowy-night", "snowy-day", "snowy-night"],
    ["rainy-night", "rainy-day", "rainy-night"],
    ["sunny-day", "sunny-day", "starry-night"],
    ["underwater-day", "underwater-day", "underwater"],
    ["snowy-day", "snowy-day", "snowy-night"],
    ["rainy-day", "rainy-day", "rainy-night"],
  ];

  it.each(cases)("maps %s to %s in light and %s in dark", (scene, light, dark) => {
    expect(sceneForTheme(scene, "light")).toBe(light);
    expect(sceneForTheme(scene, "dark")).toBe(dark);
  });

  it("always returns a scene the theme supports", () => {
    for (const { id } of SCENES) {
      for (const theme of ["light", "dark"] as const) {
        expect(sceneSupports(sceneForTheme(id, theme), theme)).toBe(true);
      }
    }
  });

  it("round-trips every pair across two switches, Starry night and Sunny day included", () => {
    for (const id of ["starry-night", "underwater", "snowy-night", "rainy-night"] as const) {
      expect(sceneForTheme(sceneForTheme(id, "light"), "dark")).toBe(id);
    }
  });
});
