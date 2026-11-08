import { describe, expect, it } from "vitest";
import { geometry, inCombat, layout, TAPPED_ORIGIN, type Box } from "./layout";
import {
  arrowHead,
  curve,
  facingPort,
  lifePort,
  pathOf,
  pointOn,
  rectEdge,
  ride,
  ringEdge,
  routePoints,
  shownShare,
  TIP_GAP,
  STACK_READ_SCALE,
  stackSpotBoxes,
  STACK_PEEK,
  STACK_PEEK_MIN,
} from "./effects";
import { combatScript } from "./fixture";
import { anchors, LIFE_R } from "./motion";
import { SCENARIO_NAMES, scenarioBoard } from "./scenarios";

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

/**
 * Spec 0063 (owner 2026-11-07, curve B "ride the middle"): an attack arrow
 * leaves its attacker's edge facing the middle straight out, rides the open
 * strip along the middle and lands straight onto its target; lines from a
 * row to one target never cross, and never pass over a card. Measured on
 * the standard boards (the owner's ten and the dev boards), every creature
 * of a side attacking, from both seats, at the supported screens.
 */
describe("attack arrows ride the middle (F-0063-C)", () => {
  const screens = [
    { width: 1920, height: 1080 },
    { width: 1920, height: 947 },
    { width: 2560, height: 1440 },
    { width: 3440, height: 1440 },
  ];
  const boards = ["attack8", "fight7", "arrows", ...SCENARIO_NAMES];
  type P = { x: number; y: number };

  /** Every creature of `seat` attacks the other player. */
  function attack(name: string, seat: number, size: { width: number; height: number }) {
    const b = scenarioBoard(name)!;
    const battlefield = b.battlefield.map((c) =>
      c.kind === "creature" ? { ...c, attacking: c.seat === seat, tapped: c.seat === seat } : c,
    );
    const attackers = battlefield.filter((c) => c.attacking);
    const combat = {
      attackers: attackers.map((c) => ({ id: c.id, target: { player: seat === 1 ? 2 : 1 } })),
      blocks: [],
    };
    const l = layout({ ...b, battlefield: inCombat(battlefield, combat) }, size);
    return { l, attackers };
  }
  /** The arrow the board draws from `id` to the defender's life circle (the viewer is seat 1). */
  const routeOf = (l: ReturnType<typeof layout>, id: string, defender: number) => {
    const g = l.geometry;
    const ring = anchors(g)[defender === 1 ? "viewer:life" : "opponent:life"];
    const reach = LIFE_R * g.height + TIP_GAP * g.cardH;
    return {
      route: ride(
        facingPort(l.boxes.get(id)!, TAPPED_ORIGIN, g.height / 2, 0, shownShare(l.slots, id)),
        lifePort(ring, g, reach),
        g.height / 2,
        g.cardH,
        g.rail.x,
      ),
      ring,
      reach,
    };
  };
  const corners = (box: Box) =>
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([fx, fy]) => pointOn(box, TAPPED_ORIGIN, fx!, fy!));
  /** Inside a convex polygon, more than `inset` px in from every edge. */
  const within = (p: P, poly: P[], inset: number) => {
    const sign = Math.sign(
      (poly[1]!.x - poly[0]!.x) * (poly[2]!.y - poly[0]!.y) -
        (poly[1]!.y - poly[0]!.y) * (poly[2]!.x - poly[0]!.x),
    );
    return poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return (sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len > inset;
    });
  };
  /** Do two polylines properly cross (not merely touch or run together)? */
  const cross = (a: P[], b: P[]) => {
    const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const eps = 1e-3;
    const apart = (u: number, v: number) => (u > eps && v < -eps) || (u < -eps && v > eps);
    for (let i = 1; i < a.length; i++)
      for (let j = 1; j < b.length; j++) {
        const [p1, p2, q1, q2] = [a[i - 1]!, a[i]!, b[j - 1]!, b[j]!];
        if (apart(o(q1, q2, p1), o(q1, q2, p2)) && apart(o(p1, p2, q1), o(p1, p2, q2))) return true;
      }
    return false;
  };

  it("leaves the attacker's edge facing the middle, straight out, and lands straight on the life circle's rim", () => {
    for (const seat of [1, 2]) {
      const { l, attackers } = attack("attack8", seat, screens[0]!);
      const g = l.geometry;
      expect(attackers.length).toBeGreaterThan(2);
      for (const a of attackers) {
        const box = l.boxes.get(a.id)!;
        const { route, ring, reach } = routeOf(l, a.id, seat === 1 ? 2 : 1);
        const first = route[0]!;
        const last = route[route.length - 1]!;
        // On the frame's edge facing the middle: the top edge on your side, the bottom on theirs.
        const edgeAt = pointOn(box, TAPPED_ORIGIN, 0.5, seat === 1 ? 0 : 1);
        expect(first.start.x).toBeCloseTo(edgeAt.x, 6);
        expect(first.start.y).toBeCloseTo(edgeAt.y, 6);
        // Straight out, toward the middle; then it rides the middle.
        expect(first.c1.x).toBeCloseTo(first.start.x, 6);
        expect(Math.sign(first.c1.y - first.start.y)).toBe(seat === 1 ? -1 : 1);
        expect(first.end.y).toBeCloseTo(g.height / 2, 6);
        // Its tip a hair off the life circle, never over the total, in from the table's side.
        expect(Math.hypot(last.end.x - ring.x, last.end.y - ring.y)).toBeCloseTo(reach, 6);
        expect(last.c2.x).toBeLessThan(last.end.x);
        // The arrowhead: the same size on every line, along the curve's way in.
        const size = 20;
        const pts = arrowHead(route, size)
          .split(" ")
          .map((q) => q.split(",").map(Number) as [number, number]);
        expect(Math.abs(pts[0]![0] - last.end.x)).toBeLessThan(0.1);
        expect(Math.abs(pts[0]![1] - last.end.y)).toBeLessThan(0.1);
        const mid = { x: (pts[1]![0] + pts[3]![0]) / 2, y: (pts[1]![1] + pts[3]![1]) / 2 };
        expect(Math.abs(Math.hypot(mid.x - pts[0]![0], mid.y - pts[0]![1]) - size)).toBeLessThan(
          0.2,
        );
        const way = { x: last.end.x - last.c2.x, y: last.end.y - last.c2.y };
        const axis = { x: pts[0]![0] - mid.x, y: pts[0]![1] - mid.y };
        const cos =
          (way.x * axis.x + way.y * axis.y) /
          (Math.hypot(way.x, way.y) * Math.hypot(axis.x, axis.y));
        expect(cos).toBeGreaterThan(0.999);
      }
    }
  });

  it("a row of attackers at one target never cross, and no arrow passes over a card", () => {
    let checked = 0;
    for (const size of screens) {
      for (const name of boards) {
        for (const seat of [1, 2]) {
          const { l, attackers } = attack(name, seat, size);
          const where = `${name} ${size.width}x${size.height} seat ${seat}`;
          const leads = [
            ...new Set(attackers.map((a) => l.slots.find((s) => s.ids.includes(a.id))!.ids[0]!)),
          ];
          const routes = leads.map((id) => ({
            id,
            pts: routePoints(routeOf(l, id, seat === 1 ? 2 : 1).route, 48),
          }));
          for (let i = 0; i < routes.length; i++)
            for (let j = i + 1; j < routes.length; j++)
              expect(
                cross(routes[i]!.pts, routes[j]!.pts),
                `${where}: ${routes[i]!.id} and ${routes[j]!.id} cross`,
              ).toBe(false);
          // Over no card face: the line's middle stays off every card, its own too.
          for (const r of routes) {
            for (const slot of l.slots) {
              const over = r.pts.filter((p) => within(p, corners(slot.box), 0.5));
              expect(over.length, `${where}: ${r.id}'s arrow over ${slot.ids[0]}`).toBe(0);
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("a planeswalker: lands straight onto its edge facing the middle", () => {
    const { l } = attack("attack8", 2, screens[0]!);
    const g = l.geometry;
    const walker = scenarioBoard("attack8")!.battlefield.find((c) => /Planeswalker/.test(c.types))!;
    const attacker = l.slots.find((s) => s.row === "opponent:creature-1")!.ids[0]!;
    const gap = TIP_GAP * g.cardH;
    const route = ride(
      facingPort(l.boxes.get(attacker)!, TAPPED_ORIGIN, g.height / 2),
      facingPort(l.boxes.get(walker.id)!, TAPPED_ORIGIN, g.height / 2, gap),
      g.height / 2,
      g.cardH,
    );
    const last = route[route.length - 1]!;
    const edge = pointOn(l.boxes.get(walker.id)!, TAPPED_ORIGIN, 0.5, 0);
    expect(last.end.x).toBeCloseTo(edge.x, 6);
    expect(last.end.y).toBeCloseTo(edge.y - gap, 6);
    // Straight down onto it (your planeswalker is below the middle).
    expect(last.c2.x).toBeCloseTo(last.end.x, 6);
    expect(last.c2.y).toBeLessThan(last.end.y);
  });

  it("the same board always draws the same arrow; ends straight across do not wander", () => {
    const { l } = attack("attack8", 2, screens[0]!);
    const id = l.slots.find((s) => s.row === "opponent:creature-1")!.ids[0]!;
    expect(pathOf(routeOf(l, id, 1).route)).toBe(pathOf(routeOf(l, id, 1).route));
    const r = ride(
      { at: { x: 500, y: 534 }, out: { x: 0, y: 1 } },
      { at: { x: 500, y: 560 }, out: { x: 0, y: -1 } },
      540,
      136,
    );
    for (const p of routePoints(r)) expect(p.x).toBeCloseTo(500, 6);
  });
});
