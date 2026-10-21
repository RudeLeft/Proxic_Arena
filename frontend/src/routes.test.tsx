// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppRoutes } from "./routes";
import { AuthProvider } from "./AuthContext";

/**
 * Client-side routing — PHASE_01 §1.109, and the client half of
 * §1.27's SPA fallback.
 *
 * The server serves index.html for every unmatched path, so an
 * unknown route reaches React. If React then rendered the foundation
 * page for it, a typo'd URL would look like a working page.
 */
describe("routes", () => {
  beforeEach(() => {
    // App polls on mount; routing tests must not depend on a server.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("no server in this test"))),
    );
    vi.stubGlobal(
      "WebSocket",
      class {
        addEventListener() {}
        send() {}
        close() {}
      },
    );
  });

  function at(path: string) {
    // AuthProvider, because the foundation page now reports who you
    // are (§3.69) and every route may ask. main.tsx wraps the app
    // the same way; rendering routes without it was only ever
    // possible while no page cared about identity.
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it("serves the foundation page at /status", () => {
    at("/status");
    expect(screen.getByText(/Foundation Build/i)).toBeDefined();
  });

  /** PHASE_07 §7.62, the canvas's note f1: the address everyone types
   * lands on Sign in when signed out (and the Lobby when signed in). */
  it("sends an anonymous visitor from / to sign in", async () => {
    at("/");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("answers an unknown route honestly instead of showing the home page", () => {
    at("/no/such/page");
    expect(screen.getByText("Not found")).toBeDefined();
    expect(screen.queryByText(/Foundation Build/i)).toBeNull();
  });

  /**
   * PHASE_05 AMENDMENT 4 — /play is the lobby now.
   *
   * This test used to assert the §1.105 placeholder ("no fake
   * gameplay"). That rule has not gone away: the 404 test above
   * still covers the only placeholder left, and the lobby is not a
   * mock — it renders what the server says and nothing else.
   *
   * What is worth asserting here instead is the gate. Every room
   * endpoint requires a session, so an anonymous visitor must meet
   * a login form rather than a page of 401s.
   */
  it("sends an anonymous visitor from /play to sign in", async () => {
    at("/play");
    // The form, not the heading: both say "Sign in".
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeDefined();
  });
});
