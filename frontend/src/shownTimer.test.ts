// @vitest-environment jsdom

// PHASE_11 P11-E15 -- a page clock that only keeps words up to date rests
// while its tab is hidden, and is read again the moment the tab is shown.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { everyWhileShown } from "./shownTimer";

let hidden = false;
const setHidden = (on: boolean) => {
  hidden = on;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("everyWhileShown", () => {
  it("runs on its beat while shown", () => {
    const run = vi.fn();
    const stop = everyWhileShown(run, 15_000);
    vi.advanceTimersByTime(45_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does nothing at all while hidden: no call, no timer left running", () => {
    const run = vi.fn();
    const stop = everyWhileShown(run, 15_000);
    setHidden(true);
    vi.advanceTimersByTime(10 * 60_000);
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount(), "the interval itself is stopped").toBe(0);
    stop();
  });

  it("runs at once when shown again, then on its beat from there", () => {
    const run = vi.fn();
    const stop = everyWhileShown(run, 15_000);
    setHidden(true);
    vi.advanceTimersByTime(60_000);
    setHidden(false);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("a page opened hidden waits to be shown", () => {
    hidden = true;
    const run = vi.fn();
    const stop = everyWhileShown(run, 5_000);
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
    setHidden(false);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stopped, it listens to nothing and runs nothing", () => {
    const run = vi.fn();
    const stop = everyWhileShown(run, 15_000);
    stop();
    setHidden(true);
    setHidden(false);
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
