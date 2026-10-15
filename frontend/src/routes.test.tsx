// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppRoutes } from "./routes";

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
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
    );
  }

  it("serves the foundation page at /", () => {
    at("/");
    expect(screen.getByText(/Foundation Build/i)).toBeDefined();
  });

  it("answers an unknown route honestly instead of showing the home page", () => {
    at("/no/such/page");
    expect(screen.getByText("Not found")).toBeDefined();
    expect(screen.queryByText(/Foundation Build/i)).toBeNull();
  });

  it("names the owning phase on a placeholder rather than faking it", () => {
    at("/play");
    expect(screen.getByText(/Not implemented yet/i)).toBeDefined();
    // §1.105: no fake gameplay. A mock table would look like
    // progress and would have to be deleted before the real one
    // could be built.
    expect(screen.getByText(/Phases 5–7/)).toBeDefined();
  });
});
