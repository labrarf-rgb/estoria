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
