// React entry point — PHASE_01 1.16.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const host = document.getElementById("root");
if (!host) {
  // Failing loudly beats a blank page that looks like a render bug.
  throw new Error("index.html is missing #root");
}

// StrictMode is deliberate: it double-mounts every effect in
// development, which is exactly the pressure 1.18's renderer
// lifecycle must survive. Turning it off would hide the leak.
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
