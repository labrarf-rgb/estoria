import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Version is the source of truth in package.json; the git SHA and build time are
// stamped at build (and dev-server start) so the About dialog can prove exactly
// which commit/bundle is live.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
);

// Short commit SHA of the deployed build. Falls back gracefully if git isn't
// available (e.g. building from a source tarball) or the tree is dirty.
function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const dirty =
      execSync("git status --porcelain", {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim().length > 0;
    return dirty ? `${sha}-dev` : sha;
  } catch {
    return "unknown";
  }
}

// https://vite.dev/config/
// In production the app is served from a GitHub Pages project path
// (https://labrarf-rgb.github.io/estoria/), so assets need the "/estoria/" base.
// Local dev/preview stay at "/".
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/estoria/" : "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // PORT lets a harness assign a free port; default stays 5173 for plain `npm run dev`.
  server: { port: Number(process.env.PORT) || 5173, open: !process.env.PORT },
}));
