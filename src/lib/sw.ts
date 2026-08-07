import { useEffect, useState } from "react";

/**
 * Service worker registration and the update handshake.
 *
 * Production only. A dev server serves modules fresh over HMR, and a worker
 * caching them is a way to spend an afternoon debugging a stale bundle.
 *
 * The worker is registered as `sw.js?v=<build>` so the script URL changes on
 * every commit — that's what makes the browser notice a new version at all, and
 * it's what keys the cache inside sw.js. `<build>` is the same commit count the
 * About dialog reports, injected into index.html by the estoria-build-info
 * plugin, so an installed copy and a browser tab agree on what "current" means.
 */

const swUrl = () =>
  `${import.meta.env.BASE_URL}sw.js?v=${window.__ESTORIA_BUILD__?.build ?? "0"}`;

/**
 * Sticky, because otherwise the reload at the end of a reset would re-register
 * the worker on the way back in — which repairs a stale cache but is no use at
 * all to someone the worker itself is breaking.
 */
const DISABLED_KEY = "estoria:sw-disabled";

function swDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === "1";
  } catch {
    return false; // private mode with storage denied — nothing was ever set
  }
}

/**
 * Per-person escape hatch:
 *
 *   …/estoria/?sw=off — unregister the worker, drop every cache, and stay off
 *                       in this browser until told otherwise
 *   …/estoria/?sw=on  — allow it again
 *
 * The kill switch in `public/sw.js` is the fleet-wide version and needs a
 * deploy. This is the one you can hand to a single person in a reply — "open
 * this link" — when they're the only one stuck behind a bad cached shell.
 *
 * Called from main.tsx *before* React renders, deliberately: the shell it's
 * there to rescue someone from may be the reason the app won't mount at all.
 *
 * Returns true when it's taking over the page load, so the caller stops.
 */
export function resetIfRequested(): boolean {
  if (!("serviceWorker" in navigator)) return false;
  const url = new URL(window.location.href);
  const arg = url.searchParams.get("sw");
  if (arg !== "off" && arg !== "on") return false;

  void (async () => {
    try {
      try {
        if (arg === "off") localStorage.setItem(DISABLED_KEY, "1");
        else localStorage.removeItem(DISABLED_KEY);
      } catch {
        // Storage denied: the teardown below still runs, it just won't persist.
      }
      if (arg === "off") {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        const names = await caches.keys();
        await Promise.all(
          names.filter((n) => n.startsWith("estoria-")).map((n) => caches.delete(n)),
        );
      }
    } finally {
      // Drop the parameter before reloading, or this runs forever.
      url.searchParams.delete("sw");
      window.location.replace(url.toString());
    }
  })();
  return true;
}

/** Tell the waiting worker to take over, then reload once it has. */
function activateUpdate(waiting: ServiceWorker) {
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  waiting.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Registers the worker and reports a newer version waiting to take over.
 * `applyUpdate` is null until there is one.
 *
 * Deliberately not automatic: swapping the running code out mid-session would
 * reload the page under someone who is in the middle of a sentence. The app
 * offers; the writer decides.
 */
export function useServiceWorker(): { applyUpdate: (() => void) | null } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    if (swDisabled()) return; // turned off by ?sw=off in this browser
    let cancelled = false;

    navigator.serviceWorker
      .register(swUrl(), { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        if (cancelled) return;
        // A worker can already be waiting from a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // `controller` is null on the very first install — that's the app
            // going offline-capable, not an update to announce.
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              if (!cancelled) setWaiting(next);
            }
          });
        });
      })
      .catch(() => {
        // No offline support this session (private mode, blocked worker, an
        // unreachable sw.js). Everything else in the app still works.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { applyUpdate: waiting ? () => activateUpdate(waiting) : null };
}
