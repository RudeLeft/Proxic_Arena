// @vitest-environment jsdom

// P11-D6 (spec 0119) -- while the table catches up, every animation the page
// starts plays at CATCH_UP_RATE, once (never compounded), endless ones and the
// style sheets' own (already a third as long through `--pa-pace`) left alone.

import { afterEach, describe, expect, it, vi } from "vitest";
import { CATCH_UP_RATE, quicken } from "./catchUp";

afterEach(() => vi.unstubAllGlobals());

function run(iterations = 1, rate = 1) {
  const a = {
    playbackRate: rate,
    playState: "running",
    effect: { getComputedTiming: () => ({ iterations }) },
    updatePlaybackRate(r: number) {
      a.playbackRate = r;
    },
  };
  return a;
}

describe("quicken", () => {
  it("each running animation at 3x, once; endless ones and the style sheets' left alone", () => {
    class CSSAnimation {}
    vi.stubGlobal("CSSAnimation", CSSAnimation);
    vi.stubGlobal("CSSTransition", class {});
    const glide = run();
    const hurried = run(1, 10);
    const glow = run(Infinity);
    const sheet = Object.assign(new CSSAnimation(), run());
    const root = { getAnimations: () => [glide, hurried, glow, sheet] } as unknown as Element;
    const seen = new WeakSet<Animation>();
    quicken(root, seen);
    quicken(root, seen);
    expect(glide.playbackRate).toBe(CATCH_UP_RATE);
    expect(hurried.playbackRate).toBe(10 * CATCH_UP_RATE);
    expect(glow.playbackRate).toBe(1);
    expect(sheet.playbackRate).toBe(1);
  });
});
