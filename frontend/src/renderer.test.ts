import { describe, expect, it } from "vitest";
import { mountRenderer, liveRendererCount, fitCanvas } from "./renderer";
import type { PixiLike } from "./renderer";

function fakePixi() {
  const ticks: (() => void)[] = [];
  const sizes: [number, number][] = [];
  // A canvas stand-in. Typed through its own interface first so
  // `this.removed` is checked, THEN widened -- casting straight to
  // HTMLCanvasElement would silence a typo in the fake itself.
  const canvas: { removed: boolean; remove(): void } = {
    removed: false,
    remove() {
      this.removed = true;
    },
  };

  const app: PixiLike & {
    destroyed: boolean;
    tickCount: () => number;
    sizes: () => [number, number][];
  } = {
    destroyed: false,
    canvas: canvas as unknown as HTMLCanvasElement,
    async init() {},
    destroy() {
      this.destroyed = true;
    },
    ticker: {
      add(fn: () => void) {
        ticks.push(fn);
      },
      remove(fn: () => void) {
        const i = ticks.indexOf(fn);
        if (i >= 0) ticks.splice(i, 1);
      },
    },
    stage: { addChild() {} },
    renderer: {
      resize(w: number, h: number) {
        sizes.push([w, h]);
      },
    },
    tickCount: () => ticks.length,
    sizes: () => sizes,
  };
  return app;
}

const container = () => ({ appendChild() {} }) as unknown as HTMLElement;

describe("renderer lifecycle (PHASE_01 1.17-1.18)", () => {
  it("mounts and destroys cleanly, leaving nothing running", async () => {
    const app = fakePixi();
    const before = liveRendererCount();
    const h = await mountRenderer({ container: container(), width: 800, height: 450, app });
    expect(liveRendererCount()).toBe(before + 1);
    expect(app.tickCount()).toBe(1);

    h.destroy();
    // The abandoned ticker is the leak 1.18 names, and it is
    // invisible in a screenshot.
    expect(app.tickCount()).toBe(0);
    expect(app.destroyed).toBe(true);
    expect(liveRendererCount()).toBe(before);
  });

  it("leaves no duplicate when mounted, unmounted and mounted again", async () => {
    const before = liveRendererCount();
    const a = await mountRenderer({ container: container(), width: 800, height: 450, app: fakePixi() });
    a.destroy();
    const b = await mountRenderer({ container: container(), width: 800, height: 450, app: fakePixi() });
    expect(liveRendererCount()).toBe(before + 1);
    b.destroy();
    expect(liveRendererCount()).toBe(before);
  });

  it("survives a double destroy without corrupting the count", async () => {
    // React Strict Mode and an error path can both call it.
    const before = liveRendererCount();
    const h = await mountRenderer({ container: container(), width: 800, height: 450, app: fakePixi() });
    h.destroy();
    h.destroy();
    expect(liveRendererCount()).toBe(before);
  });
});

describe("responsive canvas (PHASE_01 1.19)", () => {
  it("re-fits on resize and ignores a resize after destroy", async () => {
    const app = fakePixi();
    const h = await mountRenderer({ container: container(), width: 800, height: 450, app });
    h.resize(1920, 1080);
    expect(app.sizes()).toEqual([[1920, 1080]]);

    h.destroy();
    // A window resize can land between unmount and the next frame,
    // and resizing a destroyed Pixi renderer throws.
    h.resize(1366, 768);
    expect(app.sizes().length).toBe(1);
  });

  it("fits 16:9 inside the required viewports", () => {
    // 1.19 names these three explicitly.
    for (const [w, h] of [
      [1366, 768],
      [1920, 1080],
      [2560, 1440],
    ] as const) {
      const f = fitCanvas(w, h);
      expect(f.width).toBeLessThanOrEqual(w);
      expect(f.height).toBeLessThanOrEqual(h);
      expect(Math.abs(f.width / f.height - 16 / 9)).toBeLessThan(0.01);
    }
  });

  it("letterboxes rather than overflowing on an ultrawide viewport", () => {
    const f = fitCanvas(3440, 1440);
    expect(f.height).toBe(1440);
    expect(f.width).toBeLessThan(3440);
  });

  it("never returns a zero or negative size", () => {
    const f = fitCanvas(0, 0);
    expect(f.width).toBeGreaterThan(0);
    expect(f.height).toBeGreaterThan(0);
  });
});
