import { describe, expect, it } from "vitest";
import { TAPPED_ORIGIN, geometry, layout, type Box } from "./layout";
import { arrowHead, centreOf, curve, pointOn, swoopBox } from "./effects";
import { combatScript } from "./fixture";

/**
 * Lines and the combat swoop — BATTLEFIELD_RENDERING.md §7 step 5, PHASE 7
 * AMENDMENTS 4 and 7. Pure geometry; the Playwright bridge checks the
 * browser draws it.
 */

/** The drawn outline of a box, as a polygon. */
function outline(box: Box): [number, number][] {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([fx, fy]) => {
    const p = pointOn(box, TAPPED_ORIGIN, fx!, fy!);
    return [p.x, p.y];
  });
}

/** Area of the overlap of two convex polygons (clip one by the other). */
function overlapArea(a: [number, number][], b: [number, number][]): number {
  let poly = a;
  for (let i = 0; i < b.length; i++) {
    const [x1, y1] = b[i]!;
    const [x2, y2] = b[(i + 1) % b.length]!;
    const side = (p: [number, number]) => (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1);
    const sign = Math.sign(side(b[(i + 2) % b.length]!));
    const out: [number, number][] = [];
    poly.forEach((p, j) => {
      const q = poly[(j + 1) % poly.length]!;
      const sp = side(p) * sign;
      const sq = side(q) * sign;
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    });
    poly = out;
    if (poly.length === 0) return 0;
  }
  return Math.abs(
    poly.reduce((n, [x1, y1], i) => {
      const [x2, y2] = poly[(i + 1) % poly.length]!;
      return n + (x1 * y2 - x2 * y1) / 2;
    }, 0),
  );
}

const area = (box: Box) => box.w * box.h;

describe("the swoop (AMENDMENT 4 item 2, AMENDMENT 7 item 6)", () => {
  const vp = { width: 1920, height: 1080 };
  const scene = combatScript(5);
  const out = layout(scene.board, vp);
  const box = (id: string) => out.boxes.get(id)!;

  it("lands over about half of a single blocker", () => {
    // White Knight against Grizzly Bears (script step 3's pairing).
    const blocked = combatScript(3);
    const at = layout(blocked.board, vp);
    const knight = at.boxes.get("card:202")!;
    const bears = at.boxes.get("card:213")!;
    const landing = swoopBox(knight, TAPPED_ORIGIN, { boxes: [bears] });
    const covered = overlapArea(outline(landing), outline(bears)) / area(bears);
    expect(covered).toBeGreaterThan(0.35);
    expect(covered).toBeLessThan(0.65);
  });

  it("lands between two blockers, over part of each", () => {
    const angel = box("card:201");
    const guide = box("card:211");
    const elves = box("card:212");
    const landing = swoopBox(angel, TAPPED_ORIGIN, { boxes: [guide, elves] });
    for (const blocker of [guide, elves]) {
      const covered = overlapArea(outline(landing), outline(blocker)) / area(blocker);
      // The inner half of its width, half its height: about a quarter.
      expect(covered).toBeGreaterThan(0.15);
      expect(covered).toBeLessThan(0.4);
    }
    // ...and it lands centred between them.
    const mid = (centreOf(guide, TAPPED_ORIGIN).x + centreOf(elves, TAPPED_ORIGIN).x) / 2;
    expect(centreOf(landing, TAPPED_ORIGIN).x).toBeCloseTo(mid, 0);
  });

  it("onto a player: its near edge reaches the life total", () => {
    const angel = box("card:201");
    const point = { x: 1700, y: 760 };
    const landing = swoopBox(angel, TAPPED_ORIGIN, { point });
    const c = centreOf(landing, TAPPED_ORIGIN);
    expect(Math.hypot(c.x - point.x, c.y - point.y)).toBeCloseTo(angel.h / 2, 6);
  });

  it("keeps the attacker's size and tilt", () => {
    const knight = box("card:202");
    const landing = swoopBox(knight, TAPPED_ORIGIN, { point: { x: 100, y: 900 } });
    expect([landing.w, landing.h, landing.scale, landing.rotation]).toEqual([
      knight.w,
      knight.h,
      knight.scale,
      knight.rotation,
    ]);
  });
});

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
