/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// --- Build identity -------------------------------------------------------
// The About dialog shows a build number that increments on EVERY commit, so any
// change you deploy gets a distinct, auto-derived number — nothing to bump by
// hand. It starts again at 1 with each new version: the commit that set
// package.json's `version` is build 1, and each commit after it adds one
// (v4 · build 1 → 2 → 3 …). The version shown is package.json's major number
// alone: npm needs "4.0.0" there, and only the first number is ever changed.
// `commit` = short SHA ("-dev" when the tree is dirty, i.e. uncommitted work).
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
  build: string; // commits since this version was set, counting that one, e.g. "3"
  commit: string; // short SHA, "-dev" suffix if working tree is dirty
  builtAt: string; // ISO timestamp
}

/** Build number within the current version: 1 at the commit that set it. */
function buildInVersion(version: string): string {
  // The newest commit that added or removed this exact version line.
  const since = git(`log -1 --format=%H -S'"version": "${version}"' -- package.json`);
  if (!since) return "1"; // the version is set but not committed yet
  const after = Number(git(`rev-list --count ${since}..HEAD`)) || 0;
  return String(after + 1);
}

function currentBuild(): BuildInfo {
  const count = buildInVersion(pkg.version);
  const sha = git("rev-parse --short HEAD");
  const dirty = git("status --porcelain").length > 0;
  return {
    version: String(pkg.version).split(".")[0],
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
    // The app's suite only. auth-server/ has its own (node:test, `npm test` there).
    test: { include: ["src/**/*.test.ts"] },
    // PORT lets a harness assign a free port; default stays 5173 for plain `npm run dev`.
    server: {
      port: Number(process.env.PORT) || 5173,
      open: !process.env.PORT,
      // Dev only. Unlocks the JS Self-Profiling API (`new Profiler(...)`) in
      // Chrome, which is how the per-keystroke cost in SPECS §9 item 14 was
      // attributed. Costs nothing when unused and never reaches production —
      // this block configures the dev server only.
      headers: { "Document-Policy": "js-profiling" },
    },
  };
});
