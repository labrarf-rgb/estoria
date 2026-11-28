/*
 * <SceneBackground scene theme />: a fixed, inert layer behind the whole app.
 * Renders nothing for `plain`. Portaled to <body> so no stacking context in
 * the app can trap it; z-index -1 puts it under all content but over the
 * page's own background (body's --bg is painted on the root canvas).
 *
 * Ported from TTePub (src/ui/backgrounds/SceneBackground.tsx). The layer is
 * fixed to the viewport: it does not pan or zoom with the board. While it is
 * mounted, <html> carries `data-scene="<id>"`, which is what the CSS keys on.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ABOVE_WATER_DAY, ABOVE_WATER_NIGHT, createAboveWater } from "./abovewater";
import { runScene, type SceneRenderer } from "./engine";
import { createRain, RAIN_DAY, RAIN_NIGHT } from "./rain";
import { sceneForTheme, type SceneId, type SceneTheme } from "./scenes";
import { SCENE_SKY as SKY, type DrawnScene } from "./sky";
import { createSnow, SNOW_DAY, SNOW_NIGHT } from "./snow";
import { createStarry } from "./starry";
import { createSunny } from "./sunny";
import { createUnderwater, SEA_BED_DAY, SEA_BED_NIGHT, UNDERWATER_DAY, UNDERWATER_NIGHT } from "./underwater";

function makeRenderer(scene: DrawnScene, clock?: () => Date): SceneRenderer {
  switch (scene) {
    case "starry-night":
      return createStarry();
    case "underwater":
      return createUnderwater(UNDERWATER_NIGHT);
    case "underwater-day":
      return createUnderwater(UNDERWATER_DAY);
    case "sea-bed":
      return createUnderwater(SEA_BED_NIGHT);
    case "sea-bed-day":
      return createUnderwater(SEA_BED_DAY);
    case "above-water":
      return createAboveWater(ABOVE_WATER_NIGHT);
    case "above-water-day":
      return createAboveWater(ABOVE_WATER_DAY, clock ? { now: clock } : {});
    case "snowy-night":
      return createSnow(SNOW_NIGHT);
    case "sunny-day":
      return createSunny(clock ? { now: clock } : {});
    case "snowy-day":
      return createSnow(SNOW_DAY);
    case "rainy-night":
      return createRain(RAIN_NIGHT);
    case "rainy-day":
      return createRain(RAIN_DAY);
  }
}

export interface SceneBackgroundProps {
  /** The stored choice. Mapped onto `theme` with `sceneForTheme`, so a mismatch can't paint a night sky on a light page. */
  scene: SceneId;
  theme: SceneTheme;
  /** Draw one still frame and stop. Reduced motion does this on its own. */
  still?: boolean;
  /** Test and preview only: a fixed "now" for the sun's position (Sunny day, and Above water's glints by day). Defaults to the real clock. */
  clock?: () => Date;
}

export function SceneBackground({ scene, theme, still = false, clock }: SceneBackgroundProps) {
  const shown = sceneForTheme(scene, theme);
  if (shown === "plain" || typeof document === "undefined") return null;
  // key: a new scene gets a fresh layer and a fresh loop; the old one is fully stopped.
  return createPortal(<SceneLayer key={shown} scene={shown} still={still} clock={clock} />, document.body);
}

const LAYER: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: -1,
  pointerEvents: "none",
  overflow: "hidden",
  contain: "strict",
};

const CANVAS: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

function SceneLayer({ scene, still, clock }: { scene: DrawnScene; still: boolean; clock: (() => Date) | undefined }) {
  const staticRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sc = staticRef.current;
    const lc = liveRef.current;
    if (!sc || !lc) return;
    const runner = runScene(sc, lc, makeRenderer(scene, clock), { still });
    const root = document.documentElement;
    root.dataset.scene = scene;
    return () => {
      runner.stop();
      if (root.dataset.scene === scene) delete root.dataset.scene;
    };
  }, [scene, still, clock]);

  return (
    <div className="scene-bg" data-scene={scene} aria-hidden="true" style={{ ...LAYER, background: SKY[scene] }}>
      <canvas ref={staticRef} style={CANVAS} />
      <canvas ref={liveRef} style={CANVAS} />
    </div>
  );
}
