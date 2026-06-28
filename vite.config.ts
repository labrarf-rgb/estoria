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
  server: { port: 5173, open: true },
}));
