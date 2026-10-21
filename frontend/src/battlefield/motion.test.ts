import { describe, expect, it } from "vitest";
import { HAND_ORIGIN, TAPPED_ORIGIN, geometry, layout, type Box } from "./layout";
import { HAND_ZOOM, anchors, bandClip, bandOf, handZoomBox } from "./motion";
import { applyChanges, syntheticBoard } from "./fixture";

/**
 * Movement geometry — BATTLEFIELD_RENDERING.md §7 step 4, PHASE 7
 * AMENDMENTS 4 and 6. Pure, like layout(): the browser only applies it.
 */

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
  { width: 1280, height: 1024 },
];

/** Where CSS draws the local point (x, y) of a card placed at `box`. */
function drawn(box: Box, cardW: number, cardH: number, origin: { x: number; y: number }) {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const tx = box.x - ox * (1 - box.scale);
  const ty = box.y - oy * (1 - box.scale);
  const t = (box.rotation * Math.PI) / 180;
  return (x: number, y: number) => ({
    x: tx + ox + box.scale * (Math.cos(t) * (x - ox) - Math.sin(t) * (y - oy)),
    y: ty + oy + box.scale * (Math.sin(t) * (x - ox) + Math.cos(t) * (y - oy)),
  });
}

function points(clip: string): [number, number][] {
  return [...clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe("the band clip (AMENDMENT 4)", () => {
  it("keeps exactly the part of every card drawn inside its band", () => {
    for (const vp of VIEWPORTS) {
      const board = syntheticBoard(90, 30, 3);
      const out = layout(board, vp);
      const g = out.geometry;
      for (const slot of out.slots) {
        const band = bandOf(g, slot.row);
        const clip = bandClip(slot.box, g.cardW, g.cardH, TAPPED_ORIGIN, band.top, band.bottom);
        const at = drawn(slot.box, g.cardW, g.cardH, TAPPED_ORIGIN);
        const ys = points(clip).map(([x, y]) => at(x, y).y);
        expect(ys.length).toBeGreaterThanOrEqual(3);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(band.top - 0.05);
        expect(Math.max(...ys)).toBeLessThanOrEqual(band.bottom + 0.05);
        // An upright card fits its band, so nothing of it is cut.
        if (slot.box.rotation === 0) {
          expect(points(clip)).toHaveLength(4);
        }
      }
    }
  });

  it("cuts a tilted card's corner tips, and only them", () => {
    const g = geometry({ width: 1920, height: 1080 });
    const box: Box = {
      x: 100,
      y: g.rows["viewer:land-back"].y + 4,
      w: g.cardW,
      h: g.cardH,
      scale: 1,
      rotation: 15,
      z: 0,
    };
    const band = bandOf(g, "viewer:land-back");
    const clip = points(bandClip(box, g.cardW, g.cardH, TAPPED_ORIGIN, band.top, band.bottom));
    expect(clip.length).toBeGreaterThan(4);
    // Most of the card survives: the cut corners are small.
    const area = clip.reduce((sum, [x1, y1], i) => {
      const [x2, y2] = clip[(i + 1) % clip.length]!;
      return sum + (x1 * y2 - x2 * y1) / 2;
    }, 0);
    expect(Math.abs(area)).toBeGreaterThan(0.95 * g.cardW * g.cardH);
  });
});

describe("the rail's zones (AMENDMENT 6)", () => {
  it("are in the rail, the opponent's above the stack above the viewer's", () => {
    for (const vp of VIEWPORTS) {
      const g = geometry(vp);
      const a = anchors(g);
      for (const id of ["stack", "viewer:graveyard", "opponent:exile", "viewer:library"] as const) {
        expect(a[id].x).toBeGreaterThan(g.rail.x);
        expect(a[id].x).toBeLessThan(g.rail.x + g.rail.w);
      }
      expect(a["opponent:exile"].y).toBeLessThan(a.stack.y);
      expect(a.stack.y).toBeLessThan(a["viewer:life"].y);
      expect(a["opponent:life"].y).toBeLessThan(a["opponent:library"].y);
      expect(a["opponent:hand"].y).toBeLessThan(0);
      expect(a["viewer:hand"].y).toBeGreaterThan(g.handTop);
    }
  });
});

describe("a pointed-at hand card (AMENDMENT 6)", () => {
  it("rises upright, twice the size, wholly on screen and in the play area", () => {
    for (const vp of VIEWPORTS) {
      for (const n of [1, 7, 12]) {
        const hand = Array.from({ length: n }, (_, i) => ({ id: `card:h${i}` }));
        const out = layout({ viewerSeat: 1, battlefield: [], hand }, vp);
        const g = out.geometry;
        for (const card of hand) {
          const rest = out.boxes.get(card.id)!;
          const zoom = handZoomBox(rest, g);
          expect(zoom.rotation).toBe(0);
          expect(zoom.scale).toBe(HAND_ZOOM);
          const at = drawn(zoom, g.cardW, g.cardH, HAND_ORIGIN);
          const top = at(0, 0);
          const bottom = at(g.cardW, g.cardH);
          expect(top.y).toBeGreaterThanOrEqual(0);
          expect(bottom.y).toBeCloseTo(g.height - g.inset, 6);
          expect(top.x).toBeGreaterThanOrEqual(g.play.x + g.inset - 1e-6);
          expect(bottom.x).toBeLessThanOrEqual(g.play.x + g.play.w - g.inset + 1e-6);
          expect(bottom.x - top.x).toBeCloseTo(g.cardW * HAND_ZOOM, 6);
        }
      }
    }
  });
});

describe("synthetic changes (the dev page's Next change)", () => {
  const start = syntheticBoard(40, 30, 1);

  it("are the same for the same seed and step", () => {
    expect(applyChanges(start, 9, 1).board).toEqual(applyChanges(start, 9, 1).board);
    expect(applyChanges(start, 0, 1).board).toEqual(start);
  });

  it("each does what it says", () => {
    let before = start;
    for (let n = 1; n <= 16; n++) {
      const step = applyChanges(start, n, 1);
      const was = new Set(before.battlefield.map((c) => c.id));
      const is = new Set(step.board.battlefield.map((c) => c.id));
      if (step.what.endsWith("dies")) {
        expect(step.departures.size).toBeGreaterThan(0);
        for (const id of step.departures.keys()) expect(is.has(id)).toBe(false);
      }
      if (step.what.includes("resolves")) {
        const [id, from] = [...step.arrivals][0]!;
        expect(from).toBe("stack");
        expect(was.has(id)).toBe(false);
        expect(is.has(id)).toBe(true);
      }
      if (step.what === "a land is played from the hand") {
        const moved = before.hand[0]!.id;
        expect(is.has(moved)).toBe(true);
        expect(step.board.hand.some((c) => c.id === moved)).toBe(false);
      }
      if (step.what.endsWith("returns to your hand")) {
        const back = step.board.hand[step.board.hand.length - 1]!.id;
        expect(was.has(back)).toBe(true);
        expect(is.has(back)).toBe(false);
      }
      before = step.board;
    }
  });
});
