// Spec 0110 (owner 2026-11-20, A · at its stack place through targeting and
// paying) -- where the card being cast waits: the stack's next slot, at the
// casting size, for every question of the cast and either seat.
//
// F-0110-A: castingStackBox at 1920x1080, 1920x947, 2560x1440 and 3840x2160
// with 0, 1, 3 and 9 entries already on the stack: inside the play area,
// never over the rail (where the act panel and the turn rail are), its
// centre on the stack column's side of the table, never over the middle of
// the table (where the two creature lines meet), at the stack's next slot.
// TEST-007: each size really changes the box. TEST-008: each count moves it.

import { describe, expect, it } from "vitest";
import { STACK_SCALE, stackSpotBoxes } from "./effects";
import { geometry, type Box } from "./layout";
import { asideOffset, castCoverBox, castingStackBox } from "./stepAside";

const SIZES = [
  [1920, 1080],
  [1920, 947],
  [2560, 1440],
  [3840, 2160],
] as const;
const COUNTS = [0, 1, 3, 9] as const;
const key = (b: Box) => `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)}`;

describe("F-0110-A · the casting card waits at the stack's next slot", () => {
  for (const [width, height] of SIZES) {
    const g = geometry({ width, height });
    for (const count of COUNTS) {
      it(`${width}x${height}, ${count} on the stack: inside the play area, beside the stack, off the middle`, () => {
        const box = castingStackBox(g, count);
        // The casting size (spec 0068): 2.5 table cards, at most half the screen.
        expect(box.h).toBeCloseTo(Math.min(g.cardH * 2.5, height * 0.5), 6);
        expect(box.w / box.h).toBeCloseTo(g.cardW / g.cardH, 6);
        // Inside the play area: never right of it (the rail holds the act
        // panel and the turn rail), never off the screen, under the turn
        // track, its cost pips (66 px) above the hand.
        expect(box.x).toBeGreaterThanOrEqual(g.play.x);
        expect(box.x + box.w).toBeLessThanOrEqual(g.play.x + g.play.w);
        expect(box.x + box.w).toBeLessThanOrEqual(g.rail.x);
        expect(box.x + box.w).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(height * 0.1 - 0.001);
        expect(box.y + box.h + 66).toBeLessThanOrEqual(g.handTop);
        // At the stack's next slot: its right edge, and its middle when it fits.
        const slot = stackSpotBoxes(g, count + 1, STACK_SCALE)[0]!;
        expect(box.x + box.w).toBeCloseTo(slot.x + slot.w, 6);
        const fits = slot.y + slot.h / 2 - box.h / 2 >= height * 0.1;
        if (fits && box.y + box.h + 66 < g.handTop - g.inset - 0.5) {
          expect(box.y + box.h / 2).toBeCloseTo(slot.y + slot.h / 2, 6);
        }
        // On the stack column's side, and never over the middle of the
        // table (the creature lines' meeting point).
        const middle = {
          x: g.play.x + g.play.w / 2,
          y: (g.halves.opponent.y + g.halves.opponent.h + g.halves.viewer.y) / 2,
        };
        expect(box.x + box.w / 2).toBeGreaterThan(middle.x);
        expect(box.x).toBeGreaterThan(middle.x);
        // Its cover (card and pips) also stays off the middle.
        const cover = castCoverBox(box);
        expect(cover.x).toBeGreaterThan(middle.x);
      });
    }
  }

  it("each size really changes the box (TEST-007), each count moves it (TEST-008)", () => {
    const bySize = new Set(
      SIZES.map(([width, height]) => key(castingStackBox(geometry({ width, height }), 0))),
    );
    expect(bySize.size).toBe(SIZES.length);
    for (const [width, height] of SIZES) {
      const g = geometry({ width, height });
      const ys = COUNTS.map((n) => castingStackBox(g, n).y);
      // A taller stack centres lower: the next slot (the lowest, front) moves down.
      for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
      // The width never changes with the count: only its height on the column.
      expect(new Set(COUNTS.map((n) => castingStackBox(g, n).x.toFixed(3))).size).toBe(1);
    }
  });

  it("a stack too tall to show whole still keeps it inside the play area", () => {
    for (const [width, height] of SIZES) {
      const g = geometry({ width, height });
      const box = castingStackBox(g, 60);
      expect(box.y + box.h + 66).toBeLessThanOrEqual(g.handTop);
      expect(box.y).toBeGreaterThanOrEqual(height * 0.1 - 0.001);
    }
  });
});

describe("spec 0091's step aside at the new place (spec 0110)", () => {
  const g = geometry({ width: 1920, height: 1080 });
  const card = castingStackBox(g, 0);

  it("the cover follows the card it is given", () => {
    const cover = castCoverBox(card);
    expect(cover.x).toBeLessThan(card.x);
    expect(cover.x + cover.w).toBeGreaterThan(card.x + card.w);
    expect(cover.y).toBe(card.y);
    expect(cover.h).toBeGreaterThan(card.h);
  });

  it("never steps off the play area into the rail, and steps for a card under it", () => {
    const under: Box = {
      x: card.x + 10,
      y: card.y + card.h - 40,
      w: g.cardW,
      h: g.cardH,
      scale: 1,
      rotation: 0,
      z: 0,
    };
    const away = asideOffset(g, card, [{ id: "card:1", box: under, kind: "tapped" }])!;
    expect(away).not.toBeNull();
    expect(card.x + card.w + away.dx).toBeLessThanOrEqual(g.play.x + g.play.w);
    // Still a little sideways (spec 0091): the card it uncovers is left of
    // its middle, so "away" is right -- no room there, so it goes left.
    expect(away.dx).toBeCloseTo(-card.w * 0.2, 6);
    expect(card.y + away.dy).toBeGreaterThanOrEqual(0);
    // Up, clear of it (your card is below its middle).
    expect(card.y + card.h + 66 + away.dy).toBeLessThanOrEqual(under.y);
    // A card in the middle of the table is not under it: no step.
    const middle: Box = { ...under, x: g.play.w / 2 - g.cardW / 2 };
    expect(asideOffset(g, card, [{ id: "card:2", box: middle, kind: "tapped" }])).toBeNull();
  });
});
