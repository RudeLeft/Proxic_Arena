import { describe, expect, it } from "vitest";
import { geometry, inCombat, layout, TAPPED_ORIGIN, type Box } from "./layout";
import {
  arc,
  arcHeight,
  arcLift,
  arcToRing,
  ARC_HIGH,
  ARC_LOW,
  beamToBanner,
  bladePath,
  entersAny,
  facingPort,
  pathOf,
  pointOn,
  rectEdge,
  ringEdge,
  routePoints,
  shownShare,
  STUD_AT,
  stackBadgeRects,
  studY,
  TIP_GAP,
  topOf,
  type Route,
  STACK_READ_SCALE,
  STACK_SCALE,
  stackCaptionBottom,
  stackSpotBoxes,
  STACK_PEEK,
  STACK_PEEK_MIN,
} from "./effects";
import { combatScript } from "./fixture";
import { anchors, LIFE_R, plateRects } from "./motion";
import { SCENARIO_NAMES, scenarioBoard } from "./scenarios";

/**
 * Lines — BATTLEFIELD_RENDERING.md §7 step 5, PHASE 7 AMENDMENTS 4 and 7
 * (the combat swoop is gone: Phase 10 A-13's fights are fights.test.ts). Pure geometry; the Playwright bridge checks the
 * browser draws it.
 */

describe("spec 0069: the blade and the beam at a player", () => {
  const screens = [
    { width: 1920, height: 1080 },
    { width: 1920, height: 947 },
    { width: 2560, height: 1440 },
    { width: 3440, height: 1440 },
    { width: 3840, height: 2160 },
  ];

  it("the attack blade: a closed shape, widest at its attacker, a point at its tip", () => {
    const route: Route = [
      {
        start: { x: 100, y: 500 },
        c1: { x: 100, y: 300 },
        c2: { x: 600, y: 100 },
        end: { x: 900, y: 120 },
      },
    ];
    const d = bladePath(route, 20);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const pts = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
    // Its two sides start 20 apart at the attacker and meet at the tip.
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeCloseTo(20, 0);
    const mid = pts[(pts.length >> 1) - 1]!;
    const after = pts[pts.length >> 1]!;
    expect(Math.hypot(mid.x - 900, mid.y - 120)).toBeLessThan(0.2);
    expect(Math.hypot(after.x - 900, after.y - 120)).toBeLessThan(0.2);
  });

  it("F-0069-C: a stack card's beam lands on the life shield's rim in one arc that never turns back past its card, and never covers the number", () => {
    let checked = 0;
    for (const size of screens) {
      const g = geometry(size);
      const r = LIFE_R * g.height + TIP_GAP * g.cardH;
      for (const count of [1, 2, 3, 6]) {
        const spots = stackSpotBoxes(g, count);
        for (const card of spots) {
          for (const side of ["viewer:life", "opponent:life"] as const) {
            const ring = anchors(g)[side];
            const where = `${size.width}x${size.height} ${count} on the stack, ${side}`;
            const route = beamToBanner(card, ring, r);
            // One arc.
            expect(route, where).toHaveLength(1);
            const only = route[0]!;
            // It leaves the card's edge: the top edge for a shield above it,
            // the bottom corner for a shield below it.
            if (ring.y + r < card.y) expect(only.start.y, where).toBeCloseTo(card.y, 6);
            else if (ring.y - r > card.y + card.h) {
              expect(only.start.x, where).toBeCloseTo(card.x + card.w, 6);
              expect(only.start.y, where).toBeCloseTo(card.y + card.h, 6);
            }
            // It ends on the shield's rim...
            expect(Math.hypot(only.end.x - ring.x, only.end.y - ring.y), where).toBeCloseTo(r, 6);
            const pts = routePoints(route, 64);
            let before = pts[0]!;
            for (const p of pts.slice(1)) {
              // ...never over the number...
              expect(Math.hypot(p.x - ring.x, p.y - ring.y), where).toBeGreaterThan(r - 0.5);
              // ...never back toward or across its card (it only goes right)...
              expect(p.x, where).toBeGreaterThanOrEqual(before.x - 0.01);
              const inside =
                p.x > card.x + 1 &&
                p.x < card.x + card.w - 1 &&
                p.y > card.y + 1 &&
                p.y < card.y + card.h - 1;
              expect(inside, where).toBe(false);
              // ...and on the screen.
              expect(p.y, where).toBeGreaterThanOrEqual(0);
              expect(p.y, where).toBeLessThanOrEqual(g.height);
              before = p;
            }
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
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
 * Spec 0066 (owner 2026-11-08, A · Soft arc; replaces spec 0063's ride
 * along the middle): an arrow is one smooth curve that rises off the table
 * and comes down onto its target -- every one bending the same way (up the
 * screen), with no corner, higher the further it travels, a fixed-size
 * head along its own direction. Measured on the standard boards (the
 * owner's ten and the dev boards), every creature of a side attacking,
 * from both seats, at the supported screens.
 */
describe("soft arcs (F-0066-C)", () => {
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
      route: arcToRing(
        facingPort(l.boxes.get(id)!, TAPPED_ORIGIN, g.height / 2, 0, shownShare(l.slots, id)),
        ring,
        reach,
        g.cardH,
        undefined,
        plateRects(g),
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
  /**
   * One smooth bend, up the screen: the turn between neighbouring steps is
   * always the same way and small (no corner), and every point lies on or
   * above the straight line from start to end (y grows downward).
   */
  function softArc(r: Route, where: string, cardH: number, tight = false, landing = false) {
    // (Landing on your own circle below the stack: the round under the
    // caption, then its landing turn -- two pieces.)
    // (Or two, rounding a player's plate's corner from above.)
    expect(r.length, `${where}: one piece`).toBeLessThanOrEqual(3);
    const pts = routePoints(r, 96);
    const s = pts[0]!;
    const e = pts[pts.length - 1]!;
    let sign = 0;
    for (let i = 2; i < pts.length; i++) {
      const a = { x: pts[i - 1]!.x - pts[i - 2]!.x, y: pts[i - 1]!.y - pts[i - 2]!.y };
      const b = { x: pts[i]!.x - pts[i - 1]!.x, y: pts[i]!.y - pts[i - 1]!.y };
      const la = Math.hypot(a.x, a.y);
      const lb = Math.hypot(b.x, b.y);
      if (la < 1e-6 || lb < 1e-6) continue;
      const cross = (a.x * b.y - a.y * b.x) / (la * lb);
      const turn = Math.atan2(cross, (a.x * b.x + a.y * b.y) / (la * lb));
      // No corner: the drawn body (it stops under the arrowhead, the last
      // 0.2 card heights) nowhere bent tighter than a circle 0.1 of
      // a card high (spec 0063's knuckles: under 0.01, measured).
      const tipNear = Math.hypot(e.x - pts[i]!.x, e.y - pts[i]!.y) < cardH * 0.2;
      if (Math.abs(turn) > 1e-9 && !tipNear && !tight)
        expect(lb / Math.abs(turn), `${where}: a corner at step ${i}`).toBeGreaterThan(cardH * 0.1);
      // (Landing on your own circle below the stack from above: a second,
      // gentle turn in its second half: its landing piece.)
      if (Math.abs(cross) > 1e-6 && !(landing && i > pts.length * 0.45)) {
        if (sign === 0) sign = Math.sign(cross);
        expect(Math.sign(cross), `${where}: bends both ways at step ${i}`).toBe(sign);
      }
    }
    // Up the screen: on or above the chord (the side with the smaller y).
    // (Not asked of a climb past a card straight above: its chord is upright.)
    const len = Math.hypot(e.x - s.x, e.y - s.y);
    for (const p of tight || landing ? [] : pts) {
      const side = ((e.x - s.x) * (p.y - s.y) - (e.y - s.y) * (p.x - s.x)) / len;
      // For a chord left to right, "above" is a negative cross; right to left, positive.
      const above = e.x >= s.x ? -side : side;
      expect(above, `${where}: dips below its chord`).toBeGreaterThan(-0.5);
    }
  }

  it("leaves the attacker's edge facing the middle, rises, and comes down on the life circle's rim", () => {
    for (const seat of [1, 2]) {
      const { l, attackers } = attack("attack8", seat, screens[0]!);
      const g = l.geometry;
      expect(attackers.length).toBeGreaterThan(2);
      for (const a of attackers) {
        const box = l.boxes.get(a.id)!;
        const { route, ring, reach } = routeOf(l, a.id, seat === 1 ? 2 : 1);
        const only = route[0]!;
        // On the frame's edge facing the middle: the top edge on your side, the bottom on theirs.
        const edgeAt = pointOn(box, TAPPED_ORIGIN, 0.5, seat === 1 ? 0 : 1);
        expect(only.start.x).toBeCloseTo(edgeAt.x, 6);
        expect(only.start.y).toBeCloseTo(edgeAt.y, 6);
        // It leaves outward: up from your card's top edge; from theirs, never back up over it.
        if (seat === 1) expect(only.c1.y).toBeLessThan(only.start.y);
        else expect(only.c1.y).toBeGreaterThanOrEqual(only.start.y);
        // Its tip a hair off the life circle, never over the total, coming down onto it.
        expect(Math.hypot(only.end.x - ring.x, only.end.y - ring.y)).toBeCloseTo(reach, 6);
        expect(only.c2.y).toBeLessThan(only.end.y);
        for (const p of routePoints(route, 48))
          expect(Math.hypot(p.x - ring.x, p.y - ring.y)).toBeGreaterThan(reach - 0.5);
        void g;
      }
    }
  });

  it("every arc: one bend, up the screen, no corner; never over its own card or a life total, and on the board", () => {
    let checked = 0;
    for (const size of screens) {
      for (const name of boards) {
        for (const seat of [1, 2]) {
          const { l, attackers } = attack(name, seat, size);
          const g = l.geometry;
          const where = `${name} ${size.width}x${size.height} seat ${seat}`;
          const leads = [
            ...new Set(attackers.map((a) => l.slots.find((s) => s.ids.includes(a.id))!.ids[0]!)),
          ];
          const rings = [anchors(g)["viewer:life"], anchors(g)["opponent:life"]];
          for (const id of leads) {
            const { route } = routeOf(l, id, seat === 1 ? 2 : 1);
            softArc(route, `${where}: ${id}`, g.cardH);
            // Never across a player's picture, name or tiles (2026-11-08 review).
            expect(
              route.some((c) => entersAny(c, plateRects(g))),
              `${where}: ${id} across a player's plate`,
            ).toBe(false);
            const pts = routePoints(route, 48);
            // Off its own card once it has left it (its own face, never crossed).
            const own = corners(l.boxes.get(id)!);
            expect(
              pts.filter((p) => within(p, own, 0.5)).length,
              `${where}: ${id} over its own card`,
            ).toBe(0);
            for (const ring of rings)
              for (const p of pts)
                expect(
                  Math.hypot(p.x - ring.x, p.y - ring.y),
                  `${where}: over a life total`,
                ).toBeGreaterThanOrEqual(LIFE_R * g.height);
            for (const p of pts) {
              expect(p.y, `${where}: ${id} off the top`).toBeGreaterThan(0);
              expect(p.x, `${where}: ${id} off the side`).toBeLessThan(g.width);
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    // A sweep over every board, screen and seat.
  }, 60_000);

  it("higher the further it travels", () => {
    const { l, attackers } = attack("attack8", 1, screens[0]!);
    const g = l.geometry;
    const ring = anchors(g)["opponent:life"];
    const arcs = attackers
      .map((a) => {
        const r = routeOf(l, a.id, 2).route;
        return {
          far: Math.hypot(ring.x - r[0]!.start.x, ring.y - r[0]!.start.y),
          up: arcHeight(r),
        };
      })
      .sort((a, b) => a.far - b.far);
    for (let i = 1; i < arcs.length; i++)
      expect(arcs[i]!.up).toBeGreaterThanOrEqual(arcs[i - 1]!.up - 0.5);
    // Never lower than ARC_LOW nor higher than ARC_HIGH card heights, scaled as the canvas.
    expect(arcLift(1, g.cardH)).toBeCloseTo(ARC_LOW * g.cardH, 6);
    expect(arcLift(1e6, g.cardH)).toBeCloseTo(ARC_HIGH * g.cardH, 6);
  });

  it("an attacker at a planeswalker: lands on its top, coming down, never over its face", () => {
    const walker = scenarioBoard("attack8")!.battlefield.find((c) => /Planeswalker/.test(c.types))!;
    const seat = walker.seat === 1 ? 2 : 1;
    const { l, attackers } = attack("attack8", seat, screens[0]!);
    const g = l.geometry;
    const gap = TIP_GAP * g.cardH;
    const box = l.boxes.get(walker.id)!;
    for (const a of attackers) {
      const route = arc(
        facingPort(l.boxes.get(a.id)!, TAPPED_ORIGIN, g.height / 2),
        topOf(box, TAPPED_ORIGIN, gap),
        g.cardH,
      );
      const only = route[0]!;
      const top = Math.min(...corners(box).map((c) => c.y));
      expect(only.end.y).toBeCloseTo(top - gap, 6);
      expect(only.c2.y, "comes down onto it").toBeLessThan(only.end.y);
      softArc(route, `${a.id} at the planeswalker`, g.cardH);
      expect(
        routePoints(route, 48).filter((p) => within(p, corners(box), 0.5)).length,
        `${a.id} over the planeswalker's face`,
      ).toBe(0);
    }
  });

  it("from a stack card's stud (F-0066-B): out to the left and rising, down onto the top of any permanent or a life circle; one bend; never over its target, the caption or a life total", () => {
    let checked = 0;
    for (const size of screens) {
      for (const name of boards) {
        const { l } = attack(name, 2, size);
        const g = l.geometry;
        const gap = TIP_GAP * g.cardH;
        for (const scale of [STACK_SCALE, STACK_READ_SCALE]) {
          const spots = stackSpotBoxes(g, 2, scale);
          const box = spots[0]!;
          const clear = {
            top: Math.min(...spots.map((b) => b.y)) - g.cardH * 0.05,
            bottom: stackCaptionBottom(box, g),
          };
          const stud = {
            at: { x: box.x - box.h * 0.02, y: box.y + box.h * STUD_AT },
            out: { x: -1, y: 0 },
          };
          // The caption under the front card (Board.tsx: its box).
          const wide = Math.max(box.w, g.cardW * 2.6);
          const caption = [
            { x: box.x + box.w - wide, y: box.y + box.h + g.cardH * 0.05 },
            { x: box.x + box.w, y: box.y + box.h + g.cardH * 0.05 },
            { x: box.x + box.w, y: box.y + box.h + g.cardH * 0.2 },
            { x: box.x + box.w - wide, y: box.y + box.h + g.cardH * 0.2 },
          ];
          const where = `${name} ${size.width}x${size.height} x${scale}`;
          for (const slot of l.slots) {
            const route = arc(
              stud,
              topOf(slot.box, TAPPED_ORIGIN, gap),
              g.cardH,
              undefined,
              clear,
              corners(slot.box),
            );
            const only = route[0]!;
            const id = slot.ids[0]!;
            // A permanent under the stack card itself, or touching it (the stud
            // on its edge): its arrow is under the stack card too.
            const sb = corners(box);
            if (corners(slot.box).some((c) => within(c, sb, -g.cardH * 0.08))) continue;
            // A card right beside the stud (its edge within a fifth of a
            // card): the arc climbs past it, a tight turn at the top.
            const beside =
              Math.max(...corners(slot.box).map((c) => c.x)) > stud.at.x - g.cardH * 0.2;
            if (only.end.x < stud.at.x && !beside)
              expect(only.c1.x, `${where} ${id}: out left`).toBeLessThan(stud.at.x);
            // (A permanent beyond the stack and below it -- under the stack
            // card's right side -- is reached round the stack's foot.)
            if (only.end.x < stud.at.x)
              expect(only.c1.y, `${where} ${id}: rising`).toBeLessThan(stud.at.y);
            expect(only.c2.y, `${where} ${id}: coming down`).toBeLessThan(only.end.y);
            softArc(route, `${where} ${id}`, g.cardH, beside);
            const pts = routePoints(route, 48);
            expect(
              pts.filter((p) => within(p, corners(slot.box), 2)).length,
              `${where}: over ${id}`,
            ).toBe(0);
            // (A permanent lower on the table than the caption: the arc
            // passes under the caption, which is drawn over the lines.)
            if (only.end.y < caption[0]!.y)
              expect(
                pts.filter((p) => within(p, caption, 0)).length,
                `${where}: ${id} over the caption`,
              ).toBe(0);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    const { l } = attack("attack8", 2, screens[0]!);
    const id = l.slots.find((s) => s.row === "opponent:creature-1")!.ids[0]!;
    expect(pathOf(routeOf(l, id, 1).route)).toBe(pathOf(routeOf(l, id, 1).route));
  }, 60_000);

  // Owner, 2026-11-08 (folded into 0066 items 2-3): an arrow at a player
  // never passes behind a stack card -- its own or another -- nor under the
  // caption: it leaves the stud away from the stack and goes round it.
  it("a stack card's arrow at a player goes round the stack, never behind a stack card or the caption (F-0066-B)", () => {
    let checked = 0;
    for (const size of screens) {
      for (const name of boards) {
        for (const seat of [1, 2]) {
          const { l } = attack(name, seat, size);
          const g = l.geometry;
          const gap = TIP_GAP * g.cardH;
          for (const scale of [STACK_SCALE, STACK_READ_SCALE]) {
            for (const count of [1, 3]) {
              const spots = stackSpotBoxes(g, count, scale);
              const wide = Math.max(spots[0]!.w, g.cardW * 2.6);
              const clear = {
                top: Math.min(...spots.map((b) => b.y)) - g.cardH * 0.05,
                bottom: stackCaptionBottom(spots[0]!, g),
                captionLeft: spots[0]!.x + spots[0]!.w - wide,
                captionTop: spots[0]!.y + spots[0]!.h,
                badges: stackBadgeRects(spots, g.cardH),
              };
              const caption = [
                { x: spots[0]!.x + spots[0]!.w - wide, y: spots[0]!.y + spots[0]!.h },
                { x: spots[0]!.x + spots[0]!.w, y: spots[0]!.y + spots[0]!.h },
                { x: spots[0]!.x + spots[0]!.w, y: clear.bottom },
                { x: spots[0]!.x + spots[0]!.w - wide, y: clear.bottom },
              ];
              // The front card's stud, and one further back's (pointed at, it comes to the front).
              for (const box of [spots[0]!, spots[spots.length - 1]!]) {
                const stud = {
                  at: { x: box.x - box.h * 0.02, y: studY(spots, spots.indexOf(box), g.cardH) },
                  out: { x: -1, y: 0 },
                };
                for (const who of ["viewer:life", "opponent:life"] as const) {
                  const ring = anchors(g)[who];
                  const route = arcToRing(
                    stud,
                    ring,
                    LIFE_R * g.height + gap,
                    g.cardH,
                    clear,
                    plateRects(g),
                  );
                  const where = `${name} ${size.width}x${size.height} seat ${seat} x${scale} ${count} card(s), from ${box === spots[0] ? "the front" : "the back"} to ${who}`;
                  // Rounded everywhere (no corner) -- except the known limit below.
                  const limit = clear.bottom >= ring.y - LIFE_R * g.height - gap;
                  softArc(route, where, g.cardH, limit, true);
                  // Owner, 2026-11-08 ("tighter path"): no wide sweep -- never
                  // more than 0.6 card heights left of the stack's badges
                  // (or its caption, going under it).
                  const leftmost = Math.min(
                    ...clear.badges.map((b) => b.x0),
                    ring.y > clear.bottom ? clear.captionLeft : Infinity,
                  );
                  const far = Math.min(...routePoints(route, 48).map((p) => p.x));
                  expect(far, `${where}: a wide sweep`).toBeGreaterThanOrEqual(
                    leftmost - 0.6 * g.cardH,
                  );
                  const only = route[0]!;
                  // (Known limit: three or more cards at reading size put the
                  // caption below your circle's top; nothing then reaches it
                  // from above without crossing the stack, its caption or
                  // your plate, and it comes in across your plate.)
                  if (clear.bottom < ring.y - LIFE_R * g.height - gap)
                    expect(
                      route.some((c) => entersAny(c, plateRects(g))),
                      `${where}: across a player's plate`,
                    ).toBe(false);
                  // Out from the stud, away from the stack.
                  expect(only.c1.x, `${where}: out`).toBeLessThan(stud.at.x);
                  const pts = routePoints(route, 96);
                  // Past its first few px, never inside any stack card or the caption.
                  const away = pts.filter(
                    (p) => Math.hypot(p.x - stud.at.x, p.y - stud.at.y) > g.cardH * 0.05,
                  );
                  for (const b of spots)
                    expect(
                      away.filter((p) => within(p, corners(b), 0)).length,
                      `${where}: behind a stack card`,
                    ).toBe(0);
                  expect(
                    away.filter((p) => within(p, caption, 0)).length,
                    `${where}: under the caption`,
                  ).toBe(0);
                  expect(
                    away.filter(
                      (p) =>
                        // (Its way out, level with the stud: a card further
                        // back has its stud in the badges' column.)
                        Math.abs(p.y - stud.at.y) > g.cardH * 0.15 &&
                        // (Not in the known limit below.)
                        clear.bottom < ring.y - LIFE_R * g.height - gap &&
                        clear.badges.some(
                          (b) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1,
                        ),
                    ).length,
                    `${where}: under the badges`,
                  ).toBe(0);
                  for (const p of pts) {
                    expect(Math.hypot(p.x - ring.x, p.y - ring.y)).toBeGreaterThan(
                      LIFE_R * g.height,
                    );
                    expect(p.y, `${where}: off the top`).toBeGreaterThan(0);
                    expect(p.y, `${where}: off the bottom`).toBeLessThan(g.height);
                  }
                  checked++;
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 120_000);
});
