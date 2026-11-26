// The repaint probe's arithmetic (P11-C5): what it counts from the
// compositor's layer snapshots, without a browser.
import { describe, expect, it } from "vitest";
import type { State } from "./bench";
import {
  changedIds,
  clientName,
  measureSnapshots,
  targetMask,
  targetsOf,
  type Layer,
  type Snapshot,
} from "./repaint";

/** A layer at (x, y) on screen, w x h, unrotated, with [rects] invalidated in its own space. */
function layer(x: number, y: number, w: number, h: number, rects: number[][] = [], mem = 0): Layer {
  return {
    layer_id: x * 10_000 + y,
    bounds: { width: w, height: h },
    layer_quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    draws_content: 1,
    gpu_memory_usage: mem,
    annotated_invalidation_rects: rects.map((r) => ({
      client: "LayoutBlockFlow (positioned) DIV class='bf-slot bf-moving'",
      geometry_rect: r,
      reason: "full layer",
    })),
  };
}
const snap = (frame: number, layers: Layer[], tileBytes = 0, tree = 1): Snapshot => ({
  pid: 1,
  ts: frame,
  tree,
  frame,
  layers,
  tileBytes,
});

describe("measureSnapshots", () => {
  it("counts a commit once, however many frames show it", () => {
    const l = layer(100, 100, 100, 50, [[0, 0, 100, 50]]);
    const r = measureSnapshots([snap(1, [l]), snap(1, [l]), snap(1, [l])], targetMask([]));
    expect(r.commits).toBe(1);
    expect(r.paintedKpx).toBe(5);
    expect(r.outsideKpx).toBe(5);
  });

  it("places a layer's rectangle on screen by its quad, and splits inside from outside", () => {
    // The layer's (10, 0) 20 x 10 is the screen's (110, 100); the target covers its left 6 px.
    const l = layer(100, 100, 100, 50, [[10, 0, 20, 10]]);
    const mask = targetMask([{ x: 110, y: 100, width: 6, height: 10 }]);
    const r = measureSnapshots([snap(1, [l])], mask);
    expect(r.paintedKpx).toBe(0.2);
    expect(r.outsideKpx).toBe(0.1);
    expect(r.byClient["DIV bf-slot"]).toEqual({
      inside: 60,
      outside: 140,
      reasons: ["full layer"],
    });
  });

  it("takes the union of one commit's rectangles, and adds commits up", () => {
    const a = layer(0, 0, 100, 100, [[0, 0, 100, 100]]);
    const b = layer(50, 0, 100, 100, [[0, 0, 100, 100]]);
    const r = measureSnapshots([snap(1, [a, b]), snap(2, [a])], targetMask([]));
    expect(r.commits).toBe(2);
    expect(r.paintedKpx).toBe(15 + 10);
  });

  it("clips to the window and leaves a still frame out", () => {
    const off = layer(1900, 1070, 100, 100, [[0, 0, 100, 100]]);
    const still = layer(0, 0, 10, 10);
    const r = measureSnapshots([snap(1, [off]), snap(2, [still])], targetMask([]));
    expect(r.commits).toBe(1);
    expect(r.paintedKpx).toBe(0.2);
  });

  it("reads layers and memory as the most at once", () => {
    const r = measureSnapshots(
      [
        snap(1, [layer(0, 0, 1, 1), layer(2, 0, 1, 1)], 4096),
        snap(
          2,
          [layer(0, 0, 1, 1), { ...layer(4, 0, 1, 1), draws_content: 0 }, layer(6, 0, 1, 1)],
          2048,
        ),
      ],
      targetMask([]),
    );
    expect(r.layers).toBe(3);
    expect(r.drawingLayers).toBe(2);
    expect(r.layerMemKb).toBe(4);
  });

  it("counts a card's lift shadow in with the shadow mask only", () => {
    // A 100 x 100 card at (500, 500); its layer reaches 20 px past it on every side.
    const l = layer(480, 480, 140, 140, [[0, 0, 140, 140]]);
    const box = { x: 500, y: 500, width: 100, height: 100, card: true };
    const r = measureSnapshots([snap(1, [l])], targetMask([box]), targetMask([box], true));
    expect(r.outsideKpx).toBe(9.6);
    expect(r.outsideShadowKpx).toBe(0);
    // A plate is not a card: nothing grows.
    const plate = { ...box, card: false };
    const p = measureSnapshots([snap(1, [l])], targetMask([plate]), targetMask([plate], true));
    expect(p.outsideShadowKpx).toBe(9.6);
  });
});

describe("clientName", () => {
  it("keeps the tag and the first class", () => {
    expect(
      clientName("LayoutBlockFlow (positioned, children-inline) DIV class='bf-slot bf-moving'"),
    ).toBe("DIV bf-slot");
    expect(clientName("LayoutFlexibleBox (positioned) BUTTON class='gs-chat-tab'")).toBe(
      "BUTTON gs-chat-tab",
    );
    expect(clientName("LayoutText #text")).toBe("#text");
  });
});

describe("a board's targets", () => {
  const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, seat: 1, ...extra });
  const state = (battlefield: State["battlefield"], life = 20, stack: unknown[] = []): State => ({
    seat: 1,
    battlefield,
    hand: [card("card:9")],
    players: [
      { seat: 1, life: 20 },
      { seat: 2, life },
    ],
    stateRevision: 1,
    stack,
  });

  it("are the cards that changed, came or went", () => {
    const before = state([card("card:1"), card("card:2"), card("card:3")]);
    const after = state([card("card:1", { tapped: true }), card("card:3"), card("card:4")]);
    expect(changedIds(before, after).sort()).toEqual(["card:1", "card:2", "card:4"]);
  });

  it("name a pile holding the card, the stack while a spell is on it, and the plates on a life change", () => {
    const before = state([card("card:1")]);
    const sel = targetsOf(
      before,
      state([card("card:1", { tapped: true })], 18, [{ id: "stack:1" }]),
    );
    expect(sel).toContain('.bf-cards [data-object-id="card:1"]');
    expect(sel).toContain('.bf-cards [data-members-ids~="card:1"]');
    expect(sel).toContain(".bf-stack-slot");
    expect(sel).toContain(".gs-seat");
    expect(targetsOf(before, state([card("card:1", { tapped: true })]))).not.toContain(".gs-seat");
  });
});
