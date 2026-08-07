/*
 * Estoria service worker — the app shell, offline.
 *
 * Estoria already keeps your work in this browser, so the only thing standing
 * between you and writing on a plane is the HTML/JS/CSS. This caches those.
 *
 * Versioning: this file is static (it lives in public/ and Vite never touches
 * it), so it can't have a build number baked in. Instead the page registers it
 * as `sw.js?v=<build>` — the same incrementing commit count the About dialog
 * shows. A new build means a new script URL, which means the browser installs a
 * new worker, which fills a new cache and drops the old ones on activate. One
 * version source, no second thing to bump.
 *
 * It deliberately does NOT call skipWaiting() on install: a new version sitting
 * in `waiting` lets the app offer a reload instead of swapping the code out
 * from under someone mid-sentence. See src/lib/sw.ts.
 */

/**
 * KILL SWITCH — flip to `true`, commit, `npm run deploy`.
 *
 * Every installed copy then tears itself down on its next visit: caches
 * deleted, registration unregistered, every request straight to the network.
 * This is the way back out if a cached shell ever goes bad, and it's here
 * because there is otherwise no way to reach code that's already on someone
 * else's machine.
 *
 * It works even when the shell is badly broken, because a service worker
 * script is never served by itself — the browser re-fetches sw.js from the
 * network on navigation, so a deployed `true` reaches clients regardless of
 * what's in their cache.
 *
 * It does NOT reload anyone: it clears the caches and steps out of the way, so
 * the session in front of the user keeps working and their next load is a
 * plain, uncontrolled one. Flip it back to `false` when the cause is fixed.
 */
const KILL_SWITCH = false;

const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL = `estoria-shell-${BUILD}`;
const FONTS = "estoria-fonts"; // survives builds — the webfonts don't change

/** Delete every cache this app has ever created. */
async function dropAllCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith("estoria-")).map((n) => caches.delete(n)));
}

/**
 * Drop shell caches belonging to neither this worker nor the one currently
 * running the app.
 *
 * `activate` can't be the only place this happens. A worker that installs but
 * never activates — because the reader hasn't taken the update yet — still
 * fills a cache, so someone who visits across several deploys without ever
 * reloading collects one whole app shell per deploy. This runs at install
 * instead, which bounds it to two: the running one, and the one waiting.
 *
 * `registration.active` is how an installing worker finds out which version is
 * in charge; its `?v=` is that worker's cache name.
 */
async function dropSupersededShells() {
  const keep = new Set([SHELL]);
  const active = self.registration.active?.scriptURL;
  if (active) keep.add(`estoria-shell-${new URL(active).searchParams.get("v") || "dev"}`);
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((n) => n.startsWith("estoria-shell-") && !keep.has(n))
      .map((n) => caches.delete(n)),
  );
}

/**
 * Precache the shell at install time by reading index.html and pulling the
 * hashed /assets/ URLs out of it. Without this, a first visit would cache
 * nothing (the worker doesn't control the page that loaded it), and Estoria
 * would only work offline from the second visit on.
 */
async function precache() {
  await dropSupersededShells(); // free the space before claiming more of it
  const cache = await caches.open(SHELL);
  const urls = new Set(["./", "./manifest.webmanifest", "./favicon-32.png", "./icon-192.png"]);
  try {
    const res = await fetch("./", { cache: "reload" });
    const html = await res.text();
    for (const m of html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)) urls.add(m[1]);
    await cache.put("./", new Response(html, { headers: res.headers }));
  } catch {
    // Offline or a failed fetch during install: cache what we can and let the
    // runtime handler fill the rest in later. A rejected install would leave
    // the user with no worker at all, which is strictly worse.
  }
  await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener("install", (e) => {
  // Disarmed: take over immediately rather than waiting politely behind the
  // worker we're here to replace.
  if (KILL_SWITCH) return void self.skipWaiting();
  e.waitUntil(precache());
});

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      if (KILL_SWITCH) {
        await dropAllCaches();
        await self.registration.unregister();
        return;
      }
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("estoria-shell-") && n !== SHELL)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  // Disarmed: answer nothing, so every request goes to the network exactly as
  // it would with no worker installed at all.
  if (KILL_SWITCH) return;
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Webfonts: cross-origin, immutable, and the app looks wrong without them.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req, FONTS));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // version.json is how a deploy is verified — it must never be served stale,
  // and it must never be answered from a cache that predates the deploy.
  if (url.pathname.endsWith("/version.json")) return;

  // Navigations: network first, so a fresh deploy is picked up as soon as it
  // exists; the cached shell is the fallback when there's no network.
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put("./", res.clone());
          return res;
        } catch {
          return (await caches.match("./")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed build assets are immutable by construction — the filename changes
  // when the contents do, so a cache hit is always correct.
  if (url.pathname.includes("/assets/")) {
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }

  // Everything else same-origin (icons, the manifest): cache, but refresh in the
  // background so a changed icon isn't pinned for the life of the build.
  e.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      return hit ?? net;
    })(),
  );
});
