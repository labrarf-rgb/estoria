/*
 * Plain's paper texture: a faint grain of soft mottling, short fibres and
 * specks, painted once per theme onto a 360px tile that repeats without seams
 * (every mark is drawn at its wrapped offsets too). No frame cost: it is a
 * static background image. Ray asked for it on Plain only, and fainter than
 * first drawn, most of all in dark (docs/backgrounds/mockup/NOTES.md, rounds 3
 * and 4). The values here are the approved round 4 ones.
 */
import { makeRng } from "./engine";
import type { SceneTheme } from "./scenes";

export const PAPER_TILE = 360;

const cache: Partial<Record<SceneTheme, string>> = {};

/** A data: URL for the theme's tile, or "" where there is no canvas (tests, very old browsers). */
export function paperTile(theme: SceneTheme): string {
  const hit = cache[theme];
  if (hit !== undefined) return hit;
  const W = PAPER_TILE;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const g = c.getContext("2d");
  if (!g) return (cache[theme] = "");
  const dark = theme === "dark";
  const rnd = makeRng(dark ? 77 : 41);
  const ink = dark ? "236,226,210" : "96,74,40";
  const rgba = (a: number) => `rgba(${ink},${a})`;
  const wrap = (fn: (dx: number, dy: number) => void) => {
    for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) fn(dx, dy);
  };

  // Mottling: a few very soft, large blots.
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W;
    const y = rnd() * W;
    const r = 40 + rnd() * 90;
    const a = (dark ? 0.006 : 0.012) * (0.5 + rnd());
    wrap((dx, dy) => {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, rgba(a));
      grad.addColorStop(1, rgba(0));
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }

  // Fibres: short, slightly bent strokes.
  g.lineCap = "round";
  for (let i = 0; i < 240; i++) {
    const x = rnd() * W;
    const y = rnd() * W;
    const len = 6 + rnd() * 18;
    const ang = rnd() * Math.PI;
    const bend = (rnd() - 0.5) * 6;
    const ex = Math.cos(ang) * len;
    const ey = Math.sin(ang) * len;
    g.strokeStyle = rgba((dark ? 0.016 : 0.03) * (0.35 + rnd()));
    g.lineWidth = 0.5 + rnd() * 0.5;
    wrap((dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + ex / 2 - (ey / len) * bend, y + dy + ey / 2 + (ex / len) * bend, x + dx + ex, y + dy + ey);
      g.stroke();
    });
  }

  // Specks.
  for (let i = 0; i < 180; i++) {
    const x = rnd() * W;
    const y = rnd() * W;
    const r = 0.35 + rnd() * 0.6;
    g.fillStyle = rgba((dark ? 0.025 : 0.045) * (0.4 + rnd()));
    wrap((dx, dy) => {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  return (cache[theme] = c.toDataURL());
}
