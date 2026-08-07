import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// Side-effect import: the install prompt event fires before React mounts, so
// its listener has to be registered at startup (see lib/install.ts).
import "@/lib/install";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
