import { describe, expect, it } from "vitest";
import { geometry, layout, type Box } from "./layout";
import {
  arrowHead,
  curve,
  rectEdge,
  ringEdge,
  STACK_READ_SCALE,
  stackSpotBoxes,
  STACK_PEEK,
  STACK_PEEK_MIN,
} from "./effects";
import { combatScript } from "./fixture";

/**
 * Lines — BATTLEFIELD_RENDERING.md §7 step 5, PHASE 7 AMENDMENTS 4 and 7
 * (the combat swoop is gone: Phase 10 A-13's fights are fights.test.ts). Pure geometry; the Playwright bridge checks the
 * browser draws it.
 */

describe("line curves", () => {
  it("start and end where they are told to, the arrowhead on the end", () => {
    const g = geometry({ width: 1920, height: 1080 });
    for (const kind of ["attack", "block", "target", "attach"] as const) {
      for (const lane of [-1, 0, 1]) {
        const start = { x: 300, y: 400 };
        const end = { x: 900 + lane * 10, y: 700 };
        const c = curve(kind, start, end, lane);
        expect(c.start).toEqual(start);
        expect(c.end).toEqual(end);
      }
    }
    const c = curve("attack", { x: 0, y: 0 }, { x: 100, y: 300 });
    const first = arrowHead(c, g.cardH * 0.2).split(" ")[0]!;
    expect(first).toBe("100,300");
  });
});

describe("the stack, as cards (owner 2026-10-21)", () => {
  const g = layout(combatScript(0).board, { width: 1920, height: 1080 }).geometry;

  it("sits at the play area's right edge, centred on the middle line (one card)", () => {
    const [top] = stackSpotBoxes(g, 1);
    expect(top!.x + top!.w).toBeLessThanOrEqual(g.play.x + g.play.w);
    expect(top!.x).toBeGreaterThan(g.play.x + g.play.w / 2);
    expect(top!.y + top!.h / 2).toBeCloseTo(g.height / 2, 0);
    expect(top!.w).toBeGreaterThan(g.cardW);
  });

  it("fans every object so each name bar shows, the next to resolve in front and lowest (F-0028-A)", () => {
    const boxes = stackSpotBoxes(g, 3);
    expect(boxes).toHaveLength(3);
    const [front, second, third] = boxes;
    // The same size, one above the other by a name bar's height.
    expect(second!.w).toBe(front!.w);
    expect(front!.y - second!.y).toBeCloseTo(front!.h * STACK_PEEK, 5);
    expect(second!.y - third!.y).toBeCloseTo(front!.h * STACK_PEEK, 5);
    expect(second!.x).toBe(front!.x);
    expect(stackSpotBoxes(g, 0)).toHaveLength(0);
  });

  it("tightens a tall stack to fit between the turn track and the hand (F-0028-F)", () => {
    for (const n of [6, 10, 30]) {
      const boxes = stackSpotBoxes(g, n);
      const top = Math.min(...boxes.map((b) => b.y));
      const bottom = Math.max(...boxes.map((b) => b.y + b.h));
      expect(top, `${n}: below the turn track`).toBeGreaterThanOrEqual(g.height * 0.1 - 0.5);
      expect(bottom, `${n}: above the hand`).toBeLessThanOrEqual(g.handTop + 0.5);
      // Never tighter than a name bar.
      if (boxes.length > 1) {
        expect(boxes[0]!.y - boxes[1]!.y).toBeGreaterThanOrEqual(
          boxes[0]!.h * STACK_PEEK_MIN - 0.01,
        );
      }
    }
    // Ten fit at 1080 high; thirty do not, and the oldest are left out.
    expect(stackSpotBoxes(g, 10)).toHaveLength(10);
    expect(stackSpotBoxes(g, 30).length).toBeLessThan(30);
  });

  it("readable (Phase 9 W-20): twice as big, still on the play area and between the turn track and the hand", () => {
    const [small] = stackSpotBoxes(g, 1);
    const [big] = stackSpotBoxes(g, 1, STACK_READ_SCALE);
    expect(big!.w).toBeCloseTo(small!.w * 2, 5);
    expect(big!.x + big!.w).toBe(small!.x + small!.w);
    expect(big!.x).toBeGreaterThan(g.play.x + g.play.w / 2);
    for (const n of [1, 3, 6, 10, 30]) {
      const boxes = stackSpotBoxes(g, n, STACK_READ_SCALE);
      const top = Math.min(...boxes.map((b) => b.y));
      const bottom = Math.max(...boxes.map((b) => b.y + b.h));
      expect(top, `${n}: below the turn track`).toBeGreaterThanOrEqual(g.height * 0.1 - 0.5);
      expect(bottom, `${n}: above the hand`).toBeLessThanOrEqual(g.handTop + 0.5);
      expect(boxes.every((b) => b.scale === STACK_READ_SCALE)).toBe(true);
    }
  });

  it("a line leaves a card at its edge and meets a life circle at its rim", () => {
    const box: Box = { x: 100, y: 100, w: 60, h: 80, scale: 1, rotation: 0, z: 0 };
    expect(rectEdge(box, { x: 400, y: 140 })).toEqual({ x: 160, y: 140 });
    expect(rectEdge(box, { x: 130, y: 0 })).toEqual({ x: 130, y: 100 });
    const rim = ringEdge({ x: 0, y: 0 }, { x: 30, y: 40 }, 10);
    expect(rim.x).toBeCloseTo(6);
    expect(rim.y).toBeCloseTo(8);
  });
});
