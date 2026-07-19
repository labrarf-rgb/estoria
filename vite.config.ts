import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// --- Build identity -------------------------------------------------------
// The About dialog shows a build number that increments on EVERY commit, so any
// change you deploy gets a distinct, auto-derived number — nothing to bump by
// hand. `build` = git commit count (47 → 48 → 49 …); `commit` = short SHA
// ("-dev" when the tree is dirty, i.e. uncommitted work). The semver `version`
// (package.json) is just the human release label on top.
//
// It's injected into index.html rather than baked via `define`, and in dev the
// injection runs on every page load — so a long-running dev server never shows a
// stale number. In a production build it's computed once and frozen so
// index.html and version.json agree.

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
);

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

interface BuildInfo {
  version: string;
  build: string; // incrementing commit count, e.g. "48"
  commit: string; // short SHA, "-dev" suffix if working tree is dirty
  builtAt: string; // ISO timestamp
}

function currentBuild(): BuildInfo {
  const count = git("rev-list --count HEAD");
  const sha = git("rev-parse --short HEAD");
  const dirty = git("status --porcelain").length > 0;
  return {
    version: pkg.version,
    build: count || "0",
    commit: sha ? (dirty ? `${sha}-dev` : sha) : "unknown",
    builtAt: new Date().toISOString(),
  };
}

// https://vite.dev/config/
// In production the app is served from a GitHub Pages project path
// (https://labrarf-rgb.github.io/estoria/), so assets need the "/estoria/" base.
// Local dev/preview stay at "/".
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  // Freeze one snapshot for a production build so index.html + version.json match.
  const frozen = isProd ? currentBuild() : null;

  return {
    base: isProd ? "/estoria/" : "/",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "estoria-build-info",
        // Runs per-request in dev (always fresh) and once at build in prod.
        transformIndexHtml(html: string) {
          const info = frozen ?? currentBuild();
          const tag = `<script>window.__ESTORIA_BUILD__=${JSON.stringify(info)}</script>`;
          return html.replace("</head>", `    ${tag}\n  </head>`);
        },
      },
      // Machine-readable manifest at the site root, so a deploy can be verified:
      // fetch /estoria/version.json and compare .build / .commit to what you shipped.
      isProd && {
        name: "estoria-version-json",
        closeBundle() {
          writeFileSync(
            fileURLToPath(new URL("./dist/version.json", import.meta.url)),
            JSON.stringify(frozen) + "\n",
          );
        },
      },
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    // PORT lets a harness assign a free port; default stays 5173 for plain `npm run dev`.
    server: { port: Number(process.env.PORT) || 5173, open: !process.env.PORT },
  };
});
