import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
// In production the app is served from a GitHub Pages project path
// (https://labrarf-rgb.github.io/estoria/), so assets need the "/estoria/" base.
// Local dev/preview stay at "/".
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/estoria/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // PORT lets a harness assign a free port; default stays 5173 for plain `npm run dev`.
  server: { port: Number(process.env.PORT) || 5173, open: !process.env.PORT },
}));
