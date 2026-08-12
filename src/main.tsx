import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// Side-effect import: the install prompt event fires before React mounts, so
// its listener has to be registered at startup (see lib/install.ts).
import "@/lib/install";
import { resetIfRequested } from "@/lib/sw";
import { requestDurableStorage } from "@/lib/storageDurability";
import { App } from "@/App";

// "?sw=off" tears out the service worker and its caches, then reloads. It runs
// before anything else because the shell it rescues someone from could be the
// reason the app fails to render at all. See lib/sw.ts.
if (!resetIfRequested()) {
  // Ask the browser to stop treating this origin's storage as disposable.
  // Fire-and-forget: nothing waits on the answer, but About reports it.
  void requestDurableStorage();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
