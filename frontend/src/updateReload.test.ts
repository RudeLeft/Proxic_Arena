// @vitest-environment jsdom

// Owner 2026-11-06: a page open across an update reloads itself, once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELOAD_WINDOW_MS, looksLikeUpdate, reloadForUpdate } from "./updateReload";

describe("a page open across an update", () => {
  const reload = vi.fn();
  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    vi.stubGlobal("location", { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("knows the browser's words for a part replaced by an update", () => {
    expect(looksLikeUpdate(new Error("Unable to preload CSS for /assets/CHD7CQ2m.css"))).toBe(true);
    expect(
      looksLikeUpdate(new TypeError("Failed to fetch dynamically imported module: /assets/a.js")),
    ).toBe(true);
    expect(looksLikeUpdate(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("reloads once, and not again within the minute (never a loop)", () => {
    const t = 1_000_000;
    expect(reloadForUpdate(t)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForUpdate(t + 5_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForUpdate(t + RELOAD_WINDOW_MS + 1)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
