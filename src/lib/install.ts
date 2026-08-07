import { useSyncExternalStore } from "react";

/**
 * Installing Estoria as an app.
 *
 * Chrome fires `beforeinstallprompt` once, early — usually before React has
 * mounted — and the event is only usable if you hold on to it. So the listeners
 * live at module scope and run on import (main.tsx), not in a component. React
 * reads the captured state through `useCanInstall`.
 *
 * The prompt can only be shown from a user gesture, and only once per event:
 * after `prompt()` resolves the event is spent, whatever the user chose.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress Chrome's own mini-infobar; we have a menu item
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when a native install prompt is available to show right now. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false, // no prompt during SSR/prerender
  );
}

/** True once `appinstalled` has fired in this session. */
export function useJustInstalled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => installed,
    () => false,
  );
}

/**
 * Show the browser's install dialog. Returns what the user chose, or null if
 * there was no prompt to show. Must be called from a click handler.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const e = deferred;
  if (!e) return null;
  deferred = null; // spent either way — a second prompt() on it throws
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}

/** Already running as an installed app, rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    // iOS Safari predates display-mode and still reports it its own way.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Running inside an iframe.
 *
 * Chrome never fires `beforeinstallprompt` in a frame — installability belongs
 * to the top-level page — so a framed Estoria can't offer the real button, and
 * the browser's own install menu would target the *host* page rather than this
 * one. Production hits this: labrarf.com/estoria-app.html is a full-page iframe
 * around /estoria/.
 *
 * A cross-origin parent makes `window.top` throw on access, which is itself
 * proof of being framed.
 */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export type Browser = "chromium" | "safari" | "ios-safari" | "firefox" | "other";

/**
 * Which set of manual install steps to show. Only used for wording when there's
 * no `beforeinstallprompt` to fire — never to gate a feature, so UA sniffing is
 * doing no harm here beyond occasionally naming the wrong menu.
 */
export function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (iOS) return "ios-safari";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return "chromium";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}
