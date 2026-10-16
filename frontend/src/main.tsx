// React entry point — PHASE_01 §1.16, §1.109.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { AppRoutes } from "./routes";
import "./styles.css";

const host = document.getElementById("root");
if (!host) {
  // Failing loudly beats a blank page that looks like a render bug.
  throw new Error("index.html is missing #root");
}

// Order matters. The boundary sits OUTSIDE the router so that a
// render error anywhere, including in routing itself, still produces
// a page with a message instead of a white screen.
//
// StrictMode is deliberate: it double-mounts every effect in
// development, which is exactly the pressure §1.18's renderer
// lifecycle must survive. Turning it off would hide the leak.
createRoot(host).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {/* Inside the router, because RequireAuth needs useLocation
            to remember where someone was going (§3.67). */}
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
