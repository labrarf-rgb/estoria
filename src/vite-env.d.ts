/// <reference types="vite/client" />

// Injected into index.html by the estoria-build-info Vite plugin (see
// vite.config.ts): fresh per request in dev, frozen at build time in prod.
interface EstoriaBuild {
  version: string; // package.json semver, e.g. "0.1.0"
  build: string; // git commit count — increments on every commit, e.g. "48"
  commit: string; // short SHA, "-dev" suffix when built from a dirty tree
  builtAt: string; // ISO timestamp
}

interface Window {
  __ESTORIA_BUILD__?: EstoriaBuild;
}
