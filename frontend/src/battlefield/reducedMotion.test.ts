// @vitest-environment jsdom
// P11-C6 -- the less-motion setting is read from one live query list.
import { afterEach, describe, expect, it, vi } from "vitest";

/** A stand-in for the browser's own MediaQueryList: `matches` read live. */
class LiveList {
  constructor(private readonly read: () => boolean) {}
  get matches() {
    return this.read();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fresh() {
  return (await import("./reducedMotion")).reducedMotion;
}

describe("reducedMotion", () => {
  it("asks the browser once and then reads its live list", async () => {
    let reduce = false;
    const ask = vi.fn(() => new LiveList(() => reduce));
    vi.stubGlobal("MediaQueryList", LiveList);
    vi.stubGlobal("matchMedia", ask);
    const reducedMotion = await fresh();
    expect(reducedMotion()).toBe(false);
    expect(reducedMotion()).toBe(false);
    reduce = true;
    expect(reducedMotion()).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("asks again when matchMedia is replaced", async () => {
    vi.stubGlobal("MediaQueryList", LiveList);
    vi.stubGlobal("matchMedia", () => new LiveList(() => false));
    const reducedMotion = await fresh();
    expect(reducedMotion()).toBe(false);
    vi.stubGlobal("matchMedia", () => new LiveList(() => true));
    expect(reducedMotion()).toBe(true);
  });

  it("asks a stand-in that is not a query list every time", async () => {
    let reduce = false;
    const ask = vi.fn(() => ({ matches: reduce }));
    vi.stubGlobal("matchMedia", ask);
    const reducedMotion = await fresh();
    expect(reducedMotion()).toBe(false);
    reduce = true;
    expect(reducedMotion()).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("is true with no matchMedia to ask", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const reducedMotion = await fresh();
    expect(reducedMotion()).toBe(true);
  });
});
