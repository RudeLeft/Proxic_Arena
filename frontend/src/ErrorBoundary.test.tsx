// @vitest-environment jsdom

import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Error boundary — PHASE_01 §1.109.
 *
 * The failure being prevented is a WHITE PAGE: without a boundary, a
 * render error unmounts the whole tree and the user gets an empty
 * browser window with nothing to report.
 */
describe("ErrorBoundary", () => {
  afterEach(() => {
    // Braced on purpose: the expression form returns VitestUtils,
    // which is not a valid afterEach result under strict types.
    vi.restoreAllMocks();
  });

  function Boom(): never {
    throw new Error("component exploded");
  }

  it("renders a message instead of a blank page", () => {
    // React logs caught errors to console.error by design; silencing
    // it keeps the test output readable without hiding our own
    // logging, which is asserted separately below.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/failed to render/i)).toBeDefined();
    expect(screen.getByText("component exploded")).toBeDefined();
    // The heading proves the page is still a page, not an empty body.
    expect(screen.getByRole("heading", { name: "PROXIC ARENA" })).toBeDefined();
  });

  it("logs the error rather than swallowing it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // A boundary that renders a tidy message and tells nobody turns
    // a white page into a wrong page, which is harder to diagnose.
    expect(spy.mock.calls.some((args) => String(args[0]).includes("render error"))).toBe(true);
  });

  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all fine")).toBeDefined();
    expect(screen.queryByText(/failed to render/i)).toBeNull();
  });

  it("recovers when the cause is gone", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    function Flaky() {
      const [broken, setBroken] = useState(true);
      return broken ? (
        <ErrorBoundary
          fallback={(_error, reset) => (
            <button
              type="button"
              onClick={() => {
                setBroken(false);
                reset();
              }}
            >
              retry
            </button>
          )}
        >
          <Boom />
        </ErrorBoundary>
      ) : (
        <p>recovered</p>
      );
    }

    render(<Flaky />);
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    // Retrying must actually re-render, not leave the fallback up
    // forever -- a "Try again" button that does nothing is worse
    // than no button.
    expect(screen.getByText("recovered")).toBeDefined();
  });
});
