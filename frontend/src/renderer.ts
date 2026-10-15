// PixiJS renderer lifecycle — PHASE_01 §1.17–§1.19.
//
// No cards, no battlefield, no game model. This proves exactly one
// thing: that a Pixi canvas can be mounted into a React page, draw,
// resize, and be destroyed cleanly — and that mounting twice does not
// leave the first one running.
//
// It is deliberately framework-free so §1.18's lifecycle claims can be
// asserted without a browser. The leak this guards against — an
// abandoned ticker still running after unmount — is invisible in a
// screenshot and obvious in a counter.

export interface RendererHandle {
  destroy: () => void;
  /** Re-fit the drawing surface. Ignored after destroy. */
  resize: (width: number, height: number) => void;
  readonly canvas: HTMLCanvasElement;
}

/** Live instances, so a leak is COUNTABLE rather than a suspicion. */
let liveRenderers = 0;
export function liveRendererCount(): number {
  return liveRenderers;
}

/** Minimal surface of what we use, so tests can supply a fake. */
export interface PixiLike {
  init(options: { width: number; height: number; background: string }): Promise<void>;
  canvas: HTMLCanvasElement;
  destroy(removeView?: boolean): void;
  ticker: { add(fn: () => void): void; remove(fn: () => void): void };
  stage: { addChild(child: unknown): void };
  renderer: { resize(width: number, height: number): void };
}

export interface MountOptions {
  container: HTMLElement;
  width: number;
  height: number;
  /** Injected in tests; real callers pass a Pixi Application. */
  app: PixiLike;
  onFrame?: () => void;
}

/**
 * Mount a renderer and return a handle that MUST be destroyed.
 *
 * The contract is deliberately "returns a disposer" rather than
 * "cleans up on its own": React Strict Mode mounts twice in
 * development, and an effect that cannot undo itself produces exactly
 * the duplicate canvas §1.18 names.
 */
export async function mountRenderer(opts: MountOptions): Promise<RendererHandle> {
  const { container, width, height, app } = opts;

  await app.init({ width, height, background: "#101418" });
  container.appendChild(app.canvas);
  liveRenderers += 1;

  const tick = opts.onFrame ?? (() => {});
  app.ticker.add(tick);

  let destroyed = false;
  const destroy = () => {
    // Idempotent on purpose: Strict Mode and an error path can both
    // call it, and double-destroy must not corrupt the count.
    if (destroyed) return;
    destroyed = true;
    app.ticker.remove(tick);
    try {
      app.canvas.remove();
    } catch {
      /* not attached */
    }
    app.destroy(true);
    liveRenderers -= 1;
  };

  const resize = (width: number, height: number) => {
    // A resize after destroy is not hypothetical: a window resize can
    // land between React's unmount and the browser's next frame, and
    // resizing a destroyed Pixi renderer throws.
    if (destroyed) return;
    const fitted = fitCanvas(width, height);
    app.renderer.resize(fitted.width, fitted.height);
  };

  return { destroy, resize, canvas: app.canvas };
}

/**
 * §1.19 — the responsive foundation.
 *
 * Returns the canvas size for a viewport, preserving 16:9 and fitting
 * inside the available box. The real battlefield layout is Phase 7's
 * and is governed by `BATTLEFIELD_LAYOUT_CONTRACT.md`; this only
 * proves the canvas tracks the window.
 */
export function fitCanvas(
  viewportWidth: number,
  viewportHeight: number,
  aspect = 16 / 9,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(viewportWidth));
  const h = Math.max(1, Math.floor(viewportHeight));
  // Both dimensions are clamped AFTER the division, not just before
  // it. A 1x1 viewport divides to floor(1 / 1.778) = 0, and a
  // zero-height canvas is not merely ugly -- WebGL rejects it. A
  // collapsed panel or a minimised window reaches this.
  if (w / h > aspect) {
    const height = h;
    return { width: Math.max(1, Math.floor(height * aspect)), height };
  }
  const width = w;
  return { width, height: Math.max(1, Math.floor(width / aspect)) };
}
