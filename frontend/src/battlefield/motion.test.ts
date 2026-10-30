import { describe, expect, it } from "vitest";
import { HAND_ORIGIN, TAPPED_ORIGIN, geometry, layout, type Box } from "./layout";
import { HAND_ZOOM, anchors, handZoomBox } from "./motion";
import { applyChanges, syntheticBoard } from "./fixture";
import { SCENARIO_NAMES, scenarioBoard } from "./scenarios";

/**
 * Movement geometry — BATTLEFIELD_RENDERING.md §7 step 4, PHASE 7
 * AMENDMENTS 4 and 6, spec 0040. Pure, like layout(): the browser only applies it.
 */

const VIEWPORTS = [
  { width: 1920, height: 947 }, // in a browser window (AGENTS UI-006)
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
  { width: 2560, height: 1440 },
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

describe("tapped cards fit their line (spec 0040, F-0040-B)", () => {
  it("every card's drawn corners stay inside its line, so nothing is cut", () => {
    const boards = [syntheticBoard(90, 30, 3), ...SCENARIO_NAMES.map((n) => scenarioBoard(n)!)];
    for (const vp of VIEWPORTS) {
      for (const board of boards) {
        const out = layout(board, vp);
        const g = out.geometry;
        const rects = new Map(out.lines.map((l) => [l.id, l.rect]));
        for (const slot of out.slots) {
          if (slot.rides) continue; // a blocker hangs off its attacker on purpose (spec 0037)
          const rect = rects.get(slot.row)!;
          const at = drawn(slot.box, g.cardW, g.cardH, TAPPED_ORIGIN);
          const ys = [
            [0, 0],
            [g.cardW, 0],
            [0, g.cardH],
            [g.cardW, g.cardH],
          ].map(([x, y]) => at(x!, y!).y);
          // A 5-degree tilt is at most half a pixel taller than its line at 1080.
          const slack = 0.005 * rect.h;
          expect(Math.min(...ys)).toBeGreaterThanOrEqual(rect.y - slack);
          expect(Math.max(...ys)).toBeLessThanOrEqual(rect.y + rect.h + slack);
        }
      }
    }
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
      // Spec 0031: the opponent's hand fans down from the top edge, above
      // their back row.
      expect(a["opponent:hand"].y).toBeLessThan(g.halves.opponent.y);
      expect(a["viewer:hand"].y).toBeGreaterThan(g.handTop);
    }
  });

  it("sit on the plates' tiles and the life banner (specs 0029, 0038)", () => {
    const g = geometry({ width: 1600, height: 900 });
    const a = anchors(g);
    const at = (x: number) => g.rail.x + x; // the rail is 900 high here: 1 px = 1 unit
    // Spec 0031 — both plates: Library across the row, then Graveyard / Exile.
    for (const [side, top] of [
      // Spec 0038: the plates' tops in the evenly spaced rail.
      ["opponent", 26],
      ["viewer", 675],
    ] as const) {
      expect(a[`${side}:library`].x).toBeCloseTo(at(115.4), 0);
      expect(a[`${side}:library`].y).toBeCloseTo(top + 104, 0);
      expect(a[`${side}:graveyard`].x).toBeCloseTo(at(65.4), 0);
      expect(a[`${side}:exile`].x).toBeCloseTo(at(165.4), 0);
      expect(a[`${side}:exile`].y).toBe(a[`${side}:graveyard`].y);
      expect(a[`${side}:graveyard`].y).toBeCloseTo(top + 162, 0);
    }
    // Life: the banner at the head's right.
    expect(a["opponent:life"].x).toBeCloseTo(at(189.4), 0);
    expect(a["opponent:life"].y).toBeCloseTo(66, 0);
    expect(a["viewer:life"].y).toBeCloseTo(715, 0);
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
