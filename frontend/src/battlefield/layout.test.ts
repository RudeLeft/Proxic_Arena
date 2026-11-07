// Tier 1 of BATTLEFIELD_RENDERING.md §6: the layout maths, proved before
// a pixel exists. PHASE_07 §7.42's properties, across viewports × card
// counts × both seats, plus every 2026-10-20 layout decision (§7.52a) and
// spec 0040's lines.

import { describe, expect, it } from "vitest";
import {
  FAN_EXTRA,
  GROW_SHOW,
  HAND_ORIGIN,
  LAND_GAP,
  OPPONENT_HAND_ORIGIN,
  SHARE_GAP,
  TAPPED_ORIGIN,
  TAB_W,
  tabAt,
  tabRoom,
  SHOW_MIN,
  TAPPED_TILT,
  kindOf,
  tiltOverhang,
  geometry,
  inCombat,
  layout,
  type Box,
  type LayoutCard,
  type LayoutInput,
  type Viewport,
} from "./layout";
import { syntheticBoard } from "./fixture";
import { SCENARIO_NAMES, scenarioBoard } from "./scenarios";

const VIEWPORTS: Viewport[] = [
  // AGENTS UI-006 (owner 2026-10-30): the supported screen is 1920x1080,
  // full screen and in a browser window; bigger screens work by design.
  { width: 1920, height: 1080 },
  { width: 1920, height: 947 }, // 1080p with browser chrome
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 }, // ultrawide
  { width: 3840, height: 2160 },
];
const COUNTS = [0, 1, 8, 9, 23, 31, 60];
const EPS = 1e-6;

let nextId = 1;
function card(over: Partial<LayoutCard> & { seat: number }): LayoutCard {
  return {
    id: `card:${nextId++}`,
    name: "Grizzly Bears",
    kind: "creature",
    types: "Creature — Bear",
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: 2,
    toughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    ...over,
  };
}

/** n distinct (never-piling) permanents of one kind for a seat; every
 * `tappedEvery`-th one tapped (0 = none). */
function many(
  n: number,
  seat: number,
  kind: "creature" | "land" | "other",
  tappedEvery = 0,
): LayoutCard[] {
  return Array.from({ length: n }, (_, i) =>
    card({
      seat,
      kind,
      tapped: tappedEvery > 0 && i % tappedEvery === 0,
      name: `${kind} ${i}`,
      types: kind === "land" ? "Land" : kind === "creature" ? "Creature — Test" : "Artifact",
      power: kind === "creature" ? 2 : null,
      toughness: kind === "creature" ? 2 : null,
    }),
  );
}

function board(n: number, seat = 1): LayoutInput {
  return {
    viewerSeat: seat,
    hand: [],
    battlefield: [
      ...many(n, 1, "creature", 3),
      ...many(n, 1, "land", 2),
      ...many(n, 1, "other", 4),
      ...many(n, 2, "creature", 3),
      ...many(n, 2, "land", 2),
      ...many(n, 2, "other", 4),
    ],
  };
}

const right = (b: Box) => b.x + b.w;
/** The card's outline as drawn: a tilted card reaches past its box. */
const reach = (b: Box) =>
  b.rotation === TAPPED_TILT ? tiltOverhang(b.w, b.h) : { left: 0, right: 0 };
/** Each line, by id. */
const linesOf = (out: ReturnType<typeof layout>) => new Map(out.lines.map((l) => [l.id, l]));

describe("geometry", () => {
  it("keeps the contract's card, and a full-size line is one of its rows (§2 Verification)", () => {
    const g = geometry({ width: 1920, height: 1080 });
    // The contract's measured card at 1080: 97.5 x 136.5.
    expect(g.cardW).toBeCloseTo(97.5, 0);
    expect(g.cardH).toBeCloseTo(136.5, 0);
    expect(g.lineH).toBeCloseTo(0.1333 * 1080, 6);
    // The opponent's band is where the contract's three rows were, reaching
    // on (spec 0059) to LAND_GAP from their hand: 4 px at 1080.
    expect(g.halves.opponent.y).toBeCloseTo(1080 - g.handTop + 4, 6);
    expect(g.halves.opponent.y).toBeLessThan(0.0964 * 1080);
    expect(g.halves.opponent.y + g.halves.opponent.h).toBeCloseTo((0.3642 + 0.1333) * 1080, 6);
    // And the rail starts where the lines stop.
    expect(g.rail.x).toBeCloseTo(0.8529 * 1920, 1);
    expect(g.halves.viewer.w).toBeCloseTo(g.rail.x, 6);
  });

  it("mirrors the viewer's band about the middle", () => {
    for (const vp of VIEWPORTS) {
      const g = geometry(vp);
      expect(g.halves.viewer.h).toBeCloseTo(g.halves.opponent.h, 6);
      expect(g.halves.viewer.y + g.halves.viewer.h).toBeCloseTo(vp.height - g.halves.opponent.y, 6);
    }
  });

  it("stretches lines on a wide window and keeps the rail's width to the height (§7.52a L1, L2)", () => {
    const normal = geometry({ width: 2560, height: 1440 });
    const wide = geometry({ width: 3440, height: 1440 });
    expect(wide.cardW).toBeCloseTo(normal.cardW, 9);
    expect(wide.rail.w).toBeCloseTo(normal.rail.w, 9);
    expect(wide.halves.viewer.w).toBeGreaterThan(normal.halves.viewer.w * 1.3);
  });
});

describe("§7.42 properties, across viewports × counts × both seats", () => {
  for (const vp of VIEWPORTS) {
    for (const n of COUNTS) {
      for (const seat of [1, 2]) {
        it(`${vp.width}x${vp.height}, ${n} per kind, seat ${seat}`, () => {
          const input = board(n, seat);
          const out = layout(input, vp);
          const g = out.geometry;

          // Every permanent is placed, nothing twice.
          expect(out.boxes.size).toBe(input.battlefield.length);

          // Deterministic.
          const again = layout(input, vp);
          expect([...again.boxes.entries()]).toEqual([...out.boxes.entries()]);

          const lines = linesOf(out);
          for (const c of input.battlefield) {
            const b = out.boxes.get(c.id)!;
            const row = lines.get(out.rowOf.get(c.id)!)!.rect;
            // The right side of the table: own cards below the middle.
            const mine = c.seat === seat;
            expect(mine ? b.y >= vp.height / 2 : b.y + b.h <= vp.height / 2).toBe(true);
            // No card escapes its line (§7.42), nor runs into the rail.
            // Tilt included: a tapped card's drawn outline stays in its line.
            const r = reach(b);
            expect(b.x - r.left).toBeGreaterThanOrEqual(row.x - EPS);
            expect(right(b) + r.right).toBeLessThanOrEqual(row.x + row.w + EPS);
            expect(right(b) + r.right).toBeLessThanOrEqual(g.rail.x + EPS);
            expect(b.y).toBeGreaterThanOrEqual(row.y - EPS);
            expect(b.y + b.h).toBeLessThanOrEqual(row.y + row.h + EPS);
            // Never smaller than the floor (spec 0040: 70%).
            expect(b.scale).toBeGreaterThanOrEqual(0.7 - EPS);
          }

          // Within a line: left to right, later on top, and never closer
          // than the minimum sliver unless reported overcrowded.
          const byRow = new Map<string, Box[]>();
          for (const s of out.slots) byRow.set(s.row, [...(byRow.get(s.row) ?? []), s.box]);
          for (const [rowId, list] of byRow) {
            const sorted = [...list].sort((a, b) => a.x - b.x);
            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1]!;
              const cur = sorted[i]!;
              expect(cur.z).toBeGreaterThan(prev.z);
              const exposed = cur.x - prev.x;
              const group = rowId.startsWith("viewer") ? "viewer" : "opponent";
              const crowded = out.overcrowded.some((k) => k.startsWith(group));
              if (!crowded) expect(exposed).toBeGreaterThanOrEqual(0.33 * prev.w - EPS);
              // The minimum hit region, crowded or not: something of every
              // card stays clickable.
              expect(exposed).toBeGreaterThan(0);
            }
          }
        });
      }
    }
  }
});

describe("mirror symmetry within a viewer (§7.8)", () => {
  it("a board mirrored across the seats is laid out mirrored", () => {
    for (const vp of VIEWPORTS) {
      // The same permanents for both seats, in the same order.
      const mine = many(9, 1, "creature").concat(many(5, 1, "land"), many(3, 1, "other"));
      const theirs = mine.map((c) => ({ ...c, id: `${c.id}-o`, seat: 2 }));
      const out = layout({ viewerSeat: 1, hand: [], battlefield: [...mine, ...theirs] }, vp);
      for (const c of mine) {
        const a = out.boxes.get(c.id)!;
        const b = out.boxes.get(`${c.id}-o`)!;
        expect(a.x).toBeCloseTo(b.x, 6);
        expect(a.y + a.h).toBeCloseTo(vp.height - b.y, 6);
      }
    }
  });
});

describe("continuity (§7.42 as amended: PHASE 7 AMENDMENT 2)", () => {
  /** The kind groups (side + kind) in which some card changed lines, and
   * every group of a side that changed size (spec 0040). */
  function hopped(
    input: LayoutInput,
    a: ReturnType<typeof layout>,
    b: ReturnType<typeof layout>,
  ): Set<string> {
    const groups = new Set<string>();
    for (const c of input.battlefield) {
      const side = c.seat === input.viewerSeat ? "viewer" : "opponent";
      if (a.rowOf.get(c.id) !== b.rowOf.get(c.id) || a.scales[side] !== b.scales[side]) {
        groups.add(`${c.seat}:${c.kind}`);
      }
    }
    return groups;
  }

  function assertSmooth(
    input: LayoutInput,
    a: ReturnType<typeof layout>,
    b: ReturnType<typeof layout>,
    dy: number,
  ) {
    const skip = hopped(input, a, b);
    for (const c of input.battlefield) {
      // At a capacity point one card changes lines and its line-mates
      // re-centre by half a card: that group is exempt, nothing else.
      if (skip.has(`${c.seat}:${c.kind}`)) continue;
      const ba = a.boxes.get(c.id)!;
      const bb = b.boxes.get(c.id)!;
      expect(Math.abs(ba.x - bb.x)).toBeLessThan(6);
      expect(Math.abs(ba.y - bb.y)).toBeLessThan(dy);
    }
  }

  it("a 1px resize moves no card more than a few px, except where a card changed lines", () => {
    let hops = 0;
    for (const n of [1, 8, 9, 23, 31]) {
      for (const height of [947, 1080]) {
        for (let width = 1920; width <= 2600; width += 37) {
          const input = board(n);
          const a = layout(input, { width, height });
          const wider = layout(input, { width: width + 1, height });
          const taller = layout(input, { width, height: height + 1 });
          hops += hopped(input, a, wider).size + hopped(input, a, taller).size;
          assertSmooth(input, a, wider, 1);
          assertSmooth(input, a, taller, 2);
        }
      }
    }
    // The exemption is for a rare event, not a loophole.
    expect(hops).toBeLessThan(20);
  });
});

describe("lines (spec 0040, replacing §7.52a L3, L4)", () => {
  const vp = { width: 1920, height: 1080 };

  it("creature before land before other", () => {
    const arbor = card({
      seat: 1,
      name: "Dryad Arbor",
      kind: "creature",
      types: "Land Creature — Forest Dryad",
    });
    const saga = card({
      seat: 1,
      name: "Urza's Saga",
      kind: "land",
      types: "Enchantment Land — Urza's Saga",
      power: null,
      toughness: null,
    });
    const citadel = card({
      seat: 1,
      name: "Darksteel Citadel",
      kind: "land",
      types: "Artifact Land",
      power: null,
      toughness: null,
    });
    const ravager = card({
      seat: 1,
      name: "Arcbound Ravager",
      kind: "creature",
      types: "Artifact Creature — Beast",
    });
    const karn = card({
      seat: 1,
      name: "Karn Liberated",
      kind: "other",
      types: "Legendary Planeswalker — Karn",
      power: null,
      toughness: null,
    });
    const hidden = card({ seat: 2, name: "Face-down", kind: "unknown", types: "", known: false });
    const out = layout(
      { viewerSeat: 1, hand: [], battlefield: [arbor, saga, citadel, ravager, karn, hidden] },
      vp,
    );
    expect(out.rowOf.get(arbor.id)).toBe("viewer:creature-1");
    expect(out.rowOf.get(ravager.id)).toBe("viewer:creature-1");
    expect(out.rowOf.get(saga.id)).toBe("viewer:land-1");
    expect(out.rowOf.get(citadel.id)).toBe("viewer:land-1");
    expect(out.rowOf.get(karn.id)).toBe("viewer:other-1");
    // An unrecognised kind falls back to the noncreature line, never vanishes (§7.10).
    expect(out.rowOf.get(hidden.id)).toBe("opponent:other-1");
  });

  it("a permanent that changes type moves lines at once (§7.11, P7-D)", () => {
    // A creature-land animates, then stops; an Equipment that was a
    // creature (reconfigure) stops being one. Same card, same id: the next
    // layout puts it in the line its new type says, and nothing else moves lines.
    const land = card({
      seat: 1,
      name: "Mutavault",
      kind: "land",
      types: "Land",
      power: null,
      toughness: null,
    });
    const rabbit = card({
      seat: 1,
      name: "Rabbit Battery",
      kind: "creature",
      types: "Artifact Creature — Equipment Rabbit",
    });
    const bear = card({ seat: 1 });
    const at = (battlefield: LayoutCard[]) =>
      layout({ viewerSeat: 1, hand: [], battlefield }, vp).rowOf;

    const before = at([land, rabbit, bear]);
    expect(before.get(land.id)).toBe("viewer:land-1");
    expect(before.get(rabbit.id)).toBe("viewer:creature-1");

    const animated = {
      ...land,
      kind: "creature",
      types: "Land Creature — All",
      power: 2,
      toughness: 2,
    };
    const attached = {
      ...rabbit,
      kind: "other",
      types: "Artifact — Equipment Rabbit",
      power: null,
      toughness: null,
    };
    const after = at([animated, attached, bear]);
    expect(after.get(land.id)).toBe("viewer:creature-1");
    expect(after.get(rabbit.id)).toBe("viewer:other-1");
    expect(after.get(bear.id)).toBe(before.get(bear.id));

    // And back, the moment it stops.
    expect(at([land, rabbit, bear]).get(land.id)).toBe("viewer:land-1");
  });

  it("F-0040-A: no line ever holds two kinds, on every named board and seeded boards up to 200", () => {
    const boards = [
      ...SCENARIO_NAMES.map((n) => scenarioBoard(n)!),
      ...[12, 40, 90, 200].map((n) => syntheticBoard(n, 30, n)),
    ];
    for (const viewport of VIEWPORTS) {
      for (const board of boards) {
        const out = layout(board, viewport);
        const byId = new Map(board.battlefield.map((c) => [c.id, c]));
        const lines = linesOf(out);
        for (const slot of out.slots) {
          const line = lines.get(slot.row)!;
          for (const id of slot.ids) expect(kindOf(byId.get(id)!)).toBe(line.kind);
        }
        // From the middle outward: creatures, then the rest, then lands at the
        // edge -- or (spec 0059) the rest sharing the land line.
        for (const side of ["viewer", "opponent"] as const) {
          const mid = viewport.height / 2;
          const distance = (kind: string) =>
            out.lines
              .filter((l) => l.side === side && l.kind === kind)
              .map((l) => Math.abs(l.rect.y + l.rect.h / 2 - mid));
          const creature = distance("creature");
          const other = distance("other");
          const land = distance("land");
          if (creature.length && other.length) {
            if (out.sharing[side] === "creature") {
              expect(Math.max(...creature)).toBeCloseTo(Math.min(...other), 6);
            } else expect(Math.max(...creature)).toBeLessThan(Math.min(...other));
          }
          if (land.length && creature.length) {
            expect(Math.min(...land)).toBeGreaterThan(Math.max(...creature));
          }
          if (land.length && other.length) {
            if (out.sharing[side] === "land") {
              expect(Math.min(...land)).toBeCloseTo(Math.max(...other), 6);
            } else expect(Math.min(...land)).toBeGreaterThan(Math.max(...other));
          }
        }
      }
    }
  });

  it("F-0040-C: a normal midgame is full size, three lines a side", () => {
    const out = layout(scenarioBoard("mid")!, vp);
    expect(out.scales).toEqual({ viewer: 1, opponent: 1 });
    for (const side of ["viewer", "opponent"] as const) {
      expect(out.lines.filter((l) => l.side === side)).toHaveLength(3);
    }
  });

  it("F-0040-C: cards overlap down to half before anything shrinks", () => {
    const creatures = many(24, 1, "creature");
    const out = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [...creatures, ...many(2, 1, "land"), ...many(2, 1, "other")],
      },
      vp,
    );
    // 24 creatures in one full-width line: they overlap, but each shows half.
    expect(out.scales.viewer).toBe(1);
    const xs = creatures.map((c) => out.boxes.get(c.id)!.x).sort((a, b) => a - b);
    const least = Math.min(...xs.slice(1).map((x, i) => x - xs[i]!));
    expect(least).toBeLessThan(out.geometry.cardW);
    expect(least).toBeGreaterThanOrEqual(SHOW_MIN * out.geometry.cardW - EPS);
  });

  it("F-0040-C: a horde takes the line no other kind needs, before shrinking", () => {
    const out = layout(scenarioBoard("horde")!, vp);
    expect(out.scales.viewer).toBe(1);
    const mine = out.lines.filter((l) => l.side === "viewer");
    expect(mine.filter((l) => l.kind === "creature")).toHaveLength(2);
    expect(mine.filter((l) => l.kind === "other")).toHaveLength(0);
  });

  it("F-0040-C: the biggest boards shrink in steps, each card still showing half", () => {
    for (const viewport of [vp, { width: 1920, height: 947 }]) {
      const out = layout(scenarioBoard("commander")!, viewport);
      // A step, always; below full size at 1920x1080 (a browser window
      // is wider for its height, and fits it whole).
      expect([1, 0.9, 0.8, 0.75, 0.7]).toContain(out.scales.viewer);
      if (viewport === vp) expect(out.scales.viewer).toBeLessThan(1);
      expect(out.overcrowded).toEqual([]);
      for (const slot of out.slots) {
        const side = slot.row.startsWith("viewer") ? "viewer" : "opponent";
        expect(slot.box.scale).toBe(out.scales[side]);
      }
    }
  });

  it("F-0040-C: four lines open at 75%", () => {
    const out = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [...many(60, 1, "creature"), ...many(14, 1, "other"), ...many(14, 1, "land")],
      },
      vp,
    );
    expect(out.scales.viewer).toBeLessThanOrEqual(0.75);
    expect(out.lines.filter((l) => l.side === "viewer")).toHaveLength(4);
  });

  it("F-0040-C: each side is sized alone", () => {
    const mine = many(5, 1, "creature").concat(many(4, 1, "land"));
    const quiet = layout({ viewerSeat: 1, hand: [], battlefield: mine }, vp);
    const busy = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [
          ...mine,
          ...many(60, 2, "creature"),
          ...many(20, 2, "other"),
          ...many(20, 2, "land"),
        ],
      },
      vp,
    );
    expect(busy.scales.opponent).toBeLessThan(1);
    expect(busy.scales.viewer).toBe(1);
    for (const c of mine) expect(busy.boxes.get(c.id)).toEqual(quiet.boxes.get(c.id));
  });

  it("F-0040-D: a side grows back only with room to spare", () => {
    const input = (n: number): LayoutInput => ({
      viewerSeat: 1,
      hand: [],
      battlefield: [...many(n, 1, "creature"), ...many(16, 1, "other"), ...many(16, 1, "land")],
    });
    // Some board is full size when seen fresh, yet stays at 90% after a
    // 90% layout: growing back needs GROW_SHOW, not SHOW_MIN.
    const held = Array.from({ length: 60 }, (_, i) => i + 20).filter((n) => {
      const fresh = layout(input(n), vp).scales.viewer;
      const after = layout({ ...input(n), previousScale: { viewer: 0.9 } }, vp).scales.viewer;
      return fresh === 1 && after === 0.9;
    });
    expect(held.length).toBeGreaterThan(0);
    expect(GROW_SHOW).toBeGreaterThan(SHOW_MIN);
    // And a side that has a size keeps it: laying out again from it changes nothing.
    for (let n = 20; n < 80; n += 3) {
      const first = layout(input(n), vp);
      const again = layout({ ...input(n), previousScale: first.scales }, vp);
      expect(again.scales).toEqual(first.scales);
    }
  });

  it("one land starts at the left edge; one creature sits in the middle of the table", () => {
    const [land] = many(1, 1, "land");
    const [bear] = many(1, 1, "creature");
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [land!, bear!] }, vp);
    const g = out.geometry;
    expect(out.boxes.get(land!.id)!.x).toBeCloseTo(g.play.x + g.inset, 6);
    const b = out.boxes.get(bear!.id)!;
    expect(b.x + b.w / 2).toBeCloseTo(g.play.x + g.play.w / 2, 6);
  });
});

describe("order within a line (§7.52a L6)", () => {
  const vp = { width: 1920, height: 1080 };

  it("is arrival order, by Forge's timestamp when given", () => {
    const [a, b, c] = many(3, 1, "creature");
    const out = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [
          { ...a!, enteredAt: 30 },
          { ...b!, enteredAt: 10 },
          { ...c!, enteredAt: 20 },
        ],
      },
      vp,
    );
    const xs = [b!, c!, a!].map((x) => out.boxes.get(x.id)!.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });

  it("is the snapshot's own order otherwise, and a newcomer never reorders the rest", () => {
    const list = many(4, 1, "creature");
    const before = layout({ viewerSeat: 1, hand: [], battlefield: list.slice(0, 3) }, vp);
    const after = layout({ viewerSeat: 1, hand: [], battlefield: list }, vp);
    const order = (o: typeof before, ids: string[]) =>
      [...ids].sort((p, q) => o.boxes.get(p)!.x - o.boxes.get(q)!.x);
    const ids = list.slice(0, 3).map((c) => c.id);
    expect(order(before, ids)).toEqual(ids);
    expect(order(after, ids)).toEqual(ids);
    expect(after.boxes.get(list[3]!.id)!.x).toBeGreaterThan(after.boxes.get(list[2]!.id)!.x);
  });
});

describe("piles (§7.58, §7.52a L5, L8)", () => {
  const vp = { width: 1920, height: 1080 };
  const forest = (over: Partial<LayoutCard> = {}) =>
    card({
      seat: 1,
      name: "Forest",
      kind: "land",
      types: "Basic Land — Forest",
      power: null,
      toughness: null,
      ...over,
    });

  it("identical untapped basics are one slot from the start", () => {
    const five = Array.from({ length: 5 }, () => forest());
    const out = layout({ viewerSeat: 1, hand: [], battlefield: five }, vp);
    expect(out.slots).toHaveLength(1);
    expect(out.slots[0]!.ids).toEqual(five.map((c) => c.id));
    const boxes = five.map((c) => out.boxes.get(c.id));
    expect(new Set(boxes.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("tapped basics form their own pile", () => {
    const lands = [
      forest(),
      forest({ tapped: true }),
      forest(),
      forest({ tapped: true }),
      forest({ tapped: true }),
    ];
    const out = layout({ viewerSeat: 1, hand: [], battlefield: lands }, vp);
    expect(out.slots.map((s) => s.ids.length).sort()).toEqual([2, 3]);
    const tapped = out.slots.find((s) => s.ids.length === 3)!;
    expect(tapped.box.rotation).toBe(TAPPED_TILT);
  });

  it("identical tokens pile; a token that differs does not", () => {
    const goblin = (over: Partial<LayoutCard> = {}) =>
      card({
        seat: 1,
        name: "Goblin Token",
        types: "Creature — Goblin",
        power: 1,
        toughness: 1,
        token: true,
        ...over,
      });
    const g1 = goblin();
    const g2 = goblin();
    const pumped = goblin({ counters: [{ name: "P1P1", count: 1 }] });
    const attacker = goblin({ attacking: true });
    const fresh = goblin({ sick: true });
    const out = layout(
      { viewerSeat: 1, hand: [], battlefield: [g1, g2, pumped, attacker, fresh] },
      vp,
    );
    expect(out.slots.find((s) => s.ids.includes(g1.id))!.ids).toEqual([g1.id, g2.id]);
    for (const loner of [pumped, attacker, fresh]) {
      expect(out.slots.find((s) => s.ids.includes(loner.id))!.ids).toEqual([loner.id]);
    }
  });

  it("spec 0036: nonbasic lands and non-tokens pile; face-down cards never do", () => {
    const canopy = () =>
      card({
        seat: 1,
        name: "Horizon Canopy",
        kind: "land",
        types: "Land",
        power: null,
        toughness: null,
      });
    const bears = () => card({ seat: 1 });
    const hidden = () =>
      card({ seat: 2, name: "Face-down", faceDown: true, known: false, token: true });
    const list = [canopy(), canopy(), bears(), bears(), hidden(), hidden()];
    const out = layout({ viewerSeat: 1, hand: [], battlefield: list }, vp);
    expect(out.slots.map((s) => s.ids.length).sort()).toEqual([1, 1, 2, 2]);
  });

  it("a pile is one slot of the overflow ladder", () => {
    const twenty = Array.from({ length: 20 }, () => forest());
    const out = layout({ viewerSeat: 1, hand: [], battlefield: twenty }, vp);
    expect(out.overcrowded).toEqual([]);
    expect(out.slots[0]!.box.scale).toBe(1);
  });
});

describe("attachments (§7.52a L7, PHASE 7 AMENDMENT 4)", () => {
  const vp = { width: 1920, height: 1080 };

  it("share the host's slot and box: they are drawn as name tags on it", () => {
    const goblin = card({ seat: 1, name: "Goblin" });
    const splitter = card({
      seat: 1,
      name: "Bonesplitter",
      kind: "other",
      types: "Artifact — Equipment",
      attachedTo: goblin.id,
      power: null,
      toughness: null,
    });
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [goblin, splitter] }, vp);
    expect(out.slots).toHaveLength(1);
    expect(out.slots[0]!.attached).toEqual([splitter.id]);
    expect(out.boxes.get(splitter.id)).toEqual(out.boxes.get(goblin.id));
  });

  // Phase 10 A-17 (owner 2026-11-06, Amendment 9): side tabs need room.
  function row(attachedToSecond: number) {
    const cards = [0, 1, 2].map((i) => card({ seat: 1, name: `Creature ${i}` }));
    const gear = Array.from({ length: attachedToSecond }, (_, i) =>
      card({
        seat: 1,
        name: `Equipment ${i}`,
        kind: "other",
        types: "Artifact — Equipment",
        attachedTo: cards[1]!.id,
        power: null,
        toughness: null,
      }),
    );
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [...cards, ...gear] }, vp);
    const x = (c: LayoutCard) => out.boxes.get(c.id)!.x;
    const s = out.boxes.get(cards[0]!.id)!.scale;
    return {
      before: x(cards[1]!) - x(cards[0]!),
      after: x(cards[2]!) - x(cards[1]!),
      tab: out.geometry.cardH * TAB_W * s,
    };
  }

  it("a host's tabs push the next card over by one tab each", () => {
    for (const n of [1, 2, 4]) {
      const { before, after, tab } = row(n);
      expect(after - before).toBeCloseTo(n * tab, 6);
    }
  });

  it("past four, the tabs fan in the room of four (plus a little): the row stops growing", () => {
    const four = row(4);
    for (const n of [5, 8, 12]) {
      const { before, after, tab } = row(n);
      expect(after - before).toBeCloseTo(4 * tab + (FAN_EXTRA / TAB_W) * tab, 6);
      expect(after - before).toBeLessThan(four.after - four.before + tab);
    }
  });

  it("each tab's place: side by side up to four, then fanned, first to last", () => {
    expect([0, 1, 2, 3].map((i) => tabAt(i, 4))).toEqual([0, TAB_W, 2 * TAB_W, 3 * TAB_W]);
    const fan = [0, 1, 2, 3, 4, 5].map((i) => tabAt(i, 6));
    expect(fan[0]).toBe(0);
    expect(fan.at(-1)! + TAB_W).toBeCloseTo(tabRoom(6), 9);
    for (let i = 1; i < fan.length; i++) expect(fan[i]!).toBeGreaterThan(fan[i - 1]!);
  });

  it("sit on the host's side of the table whoever controls them", () => {
    const angel = card({ seat: 2, name: "Serra Angel" });
    const pacifism = card({
      seat: 1,
      name: "Pacifism",
      kind: "other",
      types: "Enchantment — Aura",
      attachedTo: angel.id,
      power: null,
      toughness: null,
    });
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [angel, pacifism] }, vp);
    expect(out.rowOf.get(pacifism.id)).toBe(out.rowOf.get(angel.id));
    expect(out.rowOf.get(angel.id)!.startsWith("opponent")).toBe(true);
  });

  it("an Aura on something not on the battlefield is laid out on its own", () => {
    const curse = card({
      seat: 1,
      name: "Curse",
      kind: "other",
      types: "Enchantment — Aura Curse",
      attachedTo: "player:2",
      power: null,
      toughness: null,
    });
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [curse] }, vp);
    expect(out.slots).toHaveLength(1);
    expect(out.rowOf.get(curse.id)).toBe("viewer:other-1");
  });
});

describe("tapped cards (PHASE 7 AMENDMENT 3)", () => {
  const vp = { width: 1920, height: 1080 };

  it("the overhang is computed from the rotation: ~1% left, ~11% right at 5 degrees (spec 0040)", () => {
    expect(TAPPED_TILT).toBe(5);
    const { left, right: r } = tiltOverhang(100, 140);
    expect(left).toBeGreaterThan(0.5);
    expect(left).toBeLessThan(1.2);
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(12);
  });

  it("a tapped card overlaps nothing while its line is not overflowing", () => {
    for (const viewport of VIEWPORTS) {
      for (const every of [1, 2, 3]) {
        const lands = many(6, 1, "land", every);
        const out = layout({ viewerSeat: 1, hand: [], battlefield: lands }, viewport);
        const g = out.geometry;
        expect(out.overcrowded).toEqual([]);
        for (const rowId of new Set(out.slots.map((s) => s.row))) {
          const list = out.slots
            .filter((s) => s.row === rowId)
            .map((s) => s.box)
            .sort((a, b) => a.x - b.x);
          for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1]!;
            const cur = list[i]!;
            const gap = cur.x - reach(cur).left - (right(prev) + reach(prev).right);
            expect(gap).toBeGreaterThanOrEqual(g.inset - EPS);
          }
        }
      }
    }
  });

  it("tapped cards take more room: tapped neighbours stand a tilt further apart", () => {
    const upright = layout({ viewerSeat: 1, hand: [], battlefield: many(5, 1, "land") }, vp);
    const tapped = layout({ viewerSeat: 1, hand: [], battlefield: many(5, 1, "land", 1) }, vp);
    const step = (o: typeof upright) => {
      const xs = o.slots.map((s) => s.box.x).sort((p, q) => p - q);
      return xs[1]! - xs[0]!;
    };
    const { left, right: r } = tiltOverhang(upright.geometry.cardW, upright.geometry.cardH);
    expect(step(tapped)).toBeCloseTo(step(upright) + left + r, 6);
    expect(tapped.overcrowded).toEqual([]);
  });

  it("tapping one card moves its neighbours a little, nothing jumps", () => {
    const lands = many(5, 1, "land");
    const before = layout({ viewerSeat: 1, hand: [], battlefield: lands }, vp);
    const withTap = lands.map((c, i) => (i === 2 ? { ...c, tapped: true } : c));
    const after = layout({ viewerSeat: 1, hand: [], battlefield: withTap }, vp);
    // Lands start at the left edge, so the cards after it move by the tilt room.
    const { left, right: r } = tiltOverhang(before.geometry.cardW, before.geometry.cardH);
    for (const c of lands) {
      const moved = Math.abs(before.boxes.get(c.id)!.x - after.boxes.get(c.id)!.x);
      expect(moved).toBeLessThanOrEqual(left + r + EPS);
    }
  });
});

describe("combat and tapped", () => {
  const vp = { width: 1920, height: 1080 };

  it("A-11: attackers step forward -- the line nearest the middle, ahead of the rest of their side; a tapped card tilts 5 degrees", () => {
    for (const viewerAttacks of [true, false]) {
      const att = viewerAttacks ? 1 : 2;
      const home = card({ seat: att });
      const attacker = card({ seat: att, attacking: true, tapped: true });
      const land = card({ seat: att, kind: "land", types: "Land", name: "Forest" });
      const other = card({ seat: 3 - att });
      const out = layout(
        { viewerSeat: 1, hand: [], battlefield: [home, attacker, land, other] },
        vp,
      );
      const mid = vp.height / 2;
      const from = (id: string) => {
        const b = out.boxes.get(id)!;
        return Math.abs(b.y + b.h / 2 - mid);
      };
      // In front of its own side's creatures and lands.
      expect(from(attacker.id)).toBeLessThan(from(home.id));
      expect(from(home.id)).toBeLessThan(from(land.id));
      const side = viewerAttacks ? "viewer" : "opponent";
      expect(out.rowOf.get(attacker.id)).toBe(`${side}:creature-1`);
      expect(out.rowOf.get(home.id)).toBe(`${side}:creature-2`);
      expect(out.boxes.get(attacker.id)!.rotation).toBe(TAPPED_TILT);
      expect(out.boxes.get(home.id)!.rotation).toBe(0);
      // Home again: with combat over, it is where it was before.
      const after = layout(
        {
          viewerSeat: 1,
          hand: [],
          battlefield: [home, { ...attacker, attacking: false }, land, other],
        },
        vp,
      );
      expect(after.rowOf.get(attacker.id)).toBe(`${side}:creature-1`);
      expect(after.boxes.get(attacker.id)!.y).toBe(after.boxes.get(home.id)!.y);
    }
  });

  it("A-11: the front line never makes a side's lines cover each other (90 permanents, seed 3, 1920x947)", () => {
    const check = (input: LayoutInput, viewport: Viewport, what: string) => {
      const out = layout(input, viewport);
      for (const side of ["viewer", "opponent"] as const) {
        const rects = out.lines.filter((l) => l.side === side).map((l) => l.rect);
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]!;
            const b = rects[j]!;
            const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            // Spec 0059: two kinds sharing a line keep to their own ends of it.
            const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            expect(Math.min(x, y), `${what}: ${side} lines ${i} and ${j}`).toBeLessThanOrEqual(EPS);
          }
        const band = out.geometry.halves[side];
        for (const r of rects) {
          expect(r.y, what).toBeGreaterThanOrEqual(band.y - EPS);
          expect(r.y + r.h, what).toBeLessThanOrEqual(band.y + band.h + EPS);
        }
      }
      // And card by card, tilt included: no card covers a card of another
      // line (or of the other kind sharing its line), and none leaves its line.
      const drawn = out.slots.map((slot) => {
        const b = slot.box;
        const r = reach(b);
        return { row: slot.row, l: b.x - r.left, r: right(b) + r.right, t: b.y, b: b.y + b.h };
      });
      const lines = linesOf(out);
      for (const d of drawn) {
        const rect = lines.get(d.row)!.rect;
        expect(d.l, `${what}: ${d.row} leaves its line`).toBeGreaterThanOrEqual(rect.x - EPS);
        expect(d.r, `${what}: ${d.row} leaves its line`).toBeLessThanOrEqual(rect.x + rect.w + EPS);
      }
      for (let i = 0; i < drawn.length; i++)
        for (let j = i + 1; j < drawn.length; j++) {
          const a = drawn[i]!;
          const b = drawn[j]!;
          if (a.row === b.row) continue; // a squeezed line overlaps by design
          const x = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          const y = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          expect(Math.min(x, y), `${what}: ${a.row} covers ${b.row}`).toBeLessThanOrEqual(EPS);
        }
      return out;
    };
    const shared = new Map<string, number>();
    for (const viewport of VIEWPORTS) {
      for (const seed of [1, 2, 3, 4, 5]) {
        for (const n of [12, 40, 90, 200]) {
          const board = syntheticBoard(n, 30, seed);
          const attackers = board.battlefield.filter((c) => c.attacking);
          // Without combat (attackers only), and with Forge's combat and blocks.
          check(
            board,
            viewport,
            `${n} permanents, seed ${seed}, ${viewport.width}x${viewport.height}`,
          );
          const mine = board.battlefield.filter(
            (c) => c.seat === board.viewerSeat && c.kind === "creature" && !c.attacking,
          );
          const blocks = attackers.slice(0, mine.length).map((a, i) => ({
            blocker: mine[i]!.id,
            attacker: a.id,
          }));
          const blocking = new Set(blocks.map((b) => b.blocker));
          const fought = inCombat(
            board.battlefield.map((c) => (blocking.has(c.id) ? { ...c, blocking: true } : c)),
            { attackers: attackers.map((a) => ({ id: a.id, target: { player: 1 } })), blocks },
          );
          const out = check(
            { ...board, battlefield: fought },
            viewport,
            `${n} permanents, seed ${seed}, ${viewport.width}x${viewport.height}, with blocks`,
          );
          for (const side of ["viewer", "opponent"] as const) {
            const way = out.sharing[side] ?? "none";
            shared.set(way, (shared.get(way) ?? 0) + 1);
          }
        }
      }
    }
    // The sweep reached both sharings and boards that share nothing (TEST-001).
    expect(shared.get("land") ?? 0).toBeGreaterThan(0);
    expect(shared.get("none") ?? 0).toBeGreaterThan(0);
  });

  it("A-11: a side whose every creature attacks needs no extra line", () => {
    const a = card({ seat: 2, attacking: true, tapped: true });
    const b = card({ seat: 2, attacking: true, tapped: true, name: "Hill Giant" });
    const land = card({ seat: 2, kind: "land", types: "Land", name: "Mountain" });
    const calm = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [{ ...a, attacking: false }, { ...b, attacking: false }, land],
      },
      vp,
    );
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [a, b, land] }, vp);
    expect(out.lines.filter((l) => l.side === "opponent")).toHaveLength(2);
    expect(out.boxes.get(a.id)!.y).toBe(calm.boxes.get(a.id)!.y);
    expect(out.scales.opponent).toBe(calm.scales.opponent);
  });
});

// Spec 0059 item 10 (owner 2026-11-07): share a line before shrinking.
describe("sharing a line before shrinking (spec 0059)", () => {
  const vp = { width: 1920, height: 1080 };
  /** A side in combat: `att` attackers, `cre` other creatures, `oth` other permanents, `lan` lands. */
  function side(att: number, cre: number, oth: number, lan: number, seat = 1) {
    const attackers = many(att, seat, "creature").map((c) => ({
      ...c,
      name: `attacker ${c.id}`,
      attacking: true,
      tapped: true,
    }));
    return {
      attackers,
      creatures: many(cre, seat, "creature"),
      others: many(oth, seat, "other"),
      lands: many(lan, seat, "land", 2),
    };
  }
  const all = (s: ReturnType<typeof side>) => [
    ...s.attackers,
    ...s.creatures,
    ...s.others,
    ...s.lands,
  ];

  it("F-0059-B: a 7-card side in combat stays at full size (the canvas's board), on every screen", () => {
    const mine = side(2, 1, 1, 3);
    for (const viewport of VIEWPORTS) {
      for (const viewerSeat of [1, 2]) {
        const out = layout({ viewerSeat, hand: [], battlefield: all(mine) }, viewport);
        const at = viewerSeat === 1 ? "viewer" : "opponent";
        expect(out.scales[at]).toBe(1);
        expect(out.sharing[at]).toBe("land");
        // Three lines: the front, the creature behind it, lands and the Mind Stone.
        const ys = new Set(out.lines.filter((l) => l.side === at).map((l) => l.rect.y));
        expect(ys.size).toBe(3);
      }
    }
    // Before 0059 four kinds of line took the 75% step however few the cards.
    expect(
      layout({ viewerSeat: 1, hand: [], battlefield: all(side(2, 1, 1, 3)) }, vp).scales,
    ).toEqual({
      viewer: 1,
      opponent: 1,
    });
  });

  it("F-0059-B: lands from the left end, the others from the right end, a gap between", () => {
    const mine = side(2, 1, 3, 4);
    const out = layout({ viewerSeat: 1, hand: [], battlefield: all(mine) }, vp);
    const g = out.geometry;
    const lines = linesOf(out);
    const land = lines.get("viewer:land-1")!;
    const other = lines.get("viewer:other-1")!;
    // The same line (ids unchanged, so the cards Glide, never jump: P10-R1).
    expect(land.rect.y).toBe(other.rect.y);
    expect(land.shared && other.shared).toBe(true);
    for (const c of mine.others) expect(out.rowOf.get(c.id)).toBe("viewer:other-1");
    for (const c of mine.lands) expect(out.rowOf.get(c.id)).toBe("viewer:land-1");
    // The first land at the left end, the oldest other at the right end,
    // each newer one further in.
    const first = out.boxes.get(mine.lands[0]!.id)!; // tapped: its tilt starts at the end
    expect(first.x - reach(first).left).toBeCloseTo(g.play.x + g.inset, 6);
    const xs = mine.others.map((c) => out.boxes.get(c.id)!.x);
    expect(xs[0]! + g.cardW).toBeCloseTo(g.play.x + g.play.w - g.inset, 6);
    expect(xs[1]!).toBeLessThan(xs[0]!);
    expect(xs[2]!).toBeLessThan(xs[1]!);
    // A gap of at least SHARE_GAP of a step between the two kinds.
    const lastLand = Math.max(
      ...mine.lands.map((c) => {
        const b = out.boxes.get(c.id)!;
        return right(b) + reach(b).right;
      }),
    );
    expect(Math.min(...xs) - lastLand).toBeGreaterThanOrEqual(SHARE_GAP * g.referencePitch - EPS);
    // The owner's rule (2026-11-07, SHARE_SHOW = 1): a shared line never
    // squeezes its cards -- 16 lands and 6 others would overlap there, so the
    // others share the creatures' line instead, every card side by side.
    const tight = side(2, 1, 6, 16);
    const unsqueezed = layout({ viewerSeat: 1, hand: [], battlefield: all(tight) }, vp);
    expect(unsqueezed.sharing.viewer).toBe("creature");
    const sharedRows = linesOf(unsqueezed);
    for (const [id, line] of sharedRows) {
      if (!line.shared) continue;
      const xs = unsqueezed.slots
        .filter((sl) => sl.row === id)
        .map((sl) => sl.box.x)
        .sort((p, q) => p - q);
      for (let k = 1; k < xs.length; k++)
        expect(xs[k]! - xs[k - 1]!, id).toBeGreaterThanOrEqual(g.cardW - EPS);
    }
    // Outside combat nothing shares: three kinds, three lines, as before.
    const calm = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: all(mine).map((c) => ({ ...c, attacking: false })),
      },
      vp,
    );
    expect(calm.sharing.viewer).toBeNull();
    expect(calm.rowOf.get(mine.others[0]!.id)).toBe("viewer:other-1");
    expect(linesOf(calm).get("viewer:other-1")!.shared).toBeUndefined();
  });

  it("F-0059-B: the order -- the land line, then the creature line behind the front, then a size step", () => {
    // Few lands: the others share the land line.
    expect(
      layout({ viewerSeat: 1, hand: [], battlefield: all(side(2, 2, 3, 6)) }, vp).sharing.viewer,
    ).toBe("land");
    // So many lands that sharing their line would make cards overlap (the
    // owner's rule): the others share the creatures' line instead, full size.
    const crowded = side(2, 2, 6, 16);
    const out = layout({ viewerSeat: 1, hand: [], battlefield: all(crowded) }, vp);
    expect(out.scales.viewer).toBe(1);
    expect(out.sharing.viewer).toBe("creature");
    const lines = linesOf(out);
    expect(lines.get("viewer:other-1")!.rect.y).toBe(lines.get("viewer:creature-2")!.rect.y);
    for (const c of crowded.creatures) expect(out.rowOf.get(c.id)).toBe("viewer:creature-2");
    for (const c of crowded.attackers) expect(out.rowOf.get(c.id)).toBe("viewer:creature-1");
    // The front line is never shared.
    expect(lines.get("viewer:creature-1")!.shared).toBeUndefined();
    // And when no shared line has room, the side steps down a size.
    const busy = layout({ viewerSeat: 1, hand: [], battlefield: all(side(2, 20, 14, 26)) }, vp);
    expect(busy.scales.viewer).toBeLessThan(1);
    // Every card in every case still shows at least half of itself.
    for (const o of [out, busy]) {
      for (const row of new Set(o.slots.map((s) => s.row))) {
        const list = o.slots.filter((s) => s.row === row);
        const xs = list.map((s) => s.box.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++)
          expect(xs[i]! - xs[i - 1]!, row).toBeGreaterThanOrEqual(SHOW_MIN * list[0]!.box.w - EPS);
      }
    }
  });

  it("F-0059-B: on the canvas's slider mix a side in combat stays full size to about 30 cards", () => {
    // The canvas's mix: a quarter fighting, a fifth other creatures, 15%
    // other permanents, the rest lands. The owner's rule (SHARE_SHOW = 1):
    // a shared line is full as soon as its cards would overlap.
    for (let n = 4; n <= 28; n++) {
      const a = Math.round(n * 0.25);
      const c = Math.round(n * 0.2);
      const o = Math.round(n * 0.15);
      const out = layout(
        { viewerSeat: 1, hand: [], battlefield: all(side(a, c, o, n - a - c - o)) },
        vp,
      );
      expect(out.scales.viewer, `${n} cards`).toBe(1);
      if (o > 0) expect(out.sharing.viewer, `${n} cards`).not.toBeNull();
    }
  });
});

// Spec 0059 item 11 (owner 2026-11-07, Option 1): lands nearer the hand.
describe("the land line (spec 0059)", () => {
  /** A box's four corners as drawn, rotated about its origin. */
  const outline = (b: Box, origin: { x: number; y: number }): [number, number][] => {
    const t = (b.rotation * Math.PI) / 180;
    const px = b.x + origin.x * b.w;
    const py = b.y + origin.y * b.h;
    return [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ].map(([x, y]) => [
      px + (x! - px) * Math.cos(t) - (y! - py) * Math.sin(t),
      py + (x! - px) * Math.sin(t) + (y! - py) * Math.cos(t),
    ]);
  };
  /** Two convex outlines overlap (separating axes). */
  const overlaps = (a: [number, number][], b: [number, number][]) => {
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i]!;
        const [x2, y2] = poly[(i + 1) % poly.length]!;
        const [nx, ny] = [y1 - y2, x2 - x1];
        const pa = a.map(([x, y]) => x * nx + y * ny);
        const pb = b.map(([x, y]) => x * nx + y * ny);
        if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS)
          return false;
      }
    }
    return true;
  };

  it("F-0059-C: sits 4 px above the hand's resting top at 1920x1080, scaled with the screen, mirrored", () => {
    for (const vp of VIEWPORTS) {
      const out = layout(
        { viewerSeat: 1, hand: [], battlefield: [...many(5, 1, "land"), ...many(5, 2, "land")] },
        vp,
      );
      const g = out.geometry;
      const lines = linesOf(out);
      const mine = lines.get("viewer:land-1")!.rect;
      const theirs = lines.get("opponent:land-1")!.rect;
      expect(g.handTop - (mine.y + mine.h)).toBeCloseTo(LAND_GAP * vp.height, 6);
      expect(theirs.y - (vp.height - g.handTop)).toBeCloseTo(LAND_GAP * vp.height, 6);
      if (vp.height === 1080) {
        expect(g.handTop - (mine.y + mine.h)).toBeCloseTo(4, 6);
        // A land's own edge: about 8 px (18 before 0059).
        const land = out.boxes.get(out.slots.find((s) => s.row === "viewer:land-1")!.ids[0]!)!;
        expect(g.handTop - (land.y + land.h)).toBeGreaterThan(7);
        expect(g.handTop - (land.y + land.h)).toBeLessThan(8.5);
      }
    }
  });

  it("F-0059-C: no land, tapped or not, touches either hand fan, at any hand size or screen", () => {
    for (const vp of VIEWPORTS) {
      for (const n of [1, 2, 7, 8, 15]) {
        const hand = Array.from({ length: n }, (_, i) => ({ id: `card:h${i}` }));
        const theirs = Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:2:${i}` }));
        for (const tappedEvery of [1, 2]) {
          const battlefield = [
            ...many(30, 1, "land", tappedEvery),
            ...many(30, 2, "land", tappedEvery),
          ];
          const out = layout({ viewerSeat: 1, hand, opponentHand: theirs, battlefield }, vp);
          const fan = [
            ...hand.map((h) => outline(out.boxes.get(h.id)!, HAND_ORIGIN)),
            ...theirs.map((h) => outline(out.boxes.get(h.id)!, OPPONENT_HAND_ORIGIN)),
          ];
          for (const slot of out.slots) {
            const land = outline(slot.box, TAPPED_ORIGIN);
            for (const card of fan)
              expect(overlaps(land, card), `${vp.width}x${vp.height}`).toBe(false);
          }
        }
      }
    }
  });

  it("F-0059-C: only the land line moved -- the lines from the middle are where they were", () => {
    const vp = { width: 1920, height: 1080 };
    const out = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [...many(3, 1, "creature"), ...many(3, 1, "other"), ...many(3, 1, "land")],
      },
      vp,
    );
    const lines = linesOf(out);
    // The contract's rows: the creature line at the middle, the next a pitch on.
    expect(lines.get("viewer:creature-1")!.rect.y).toBeCloseTo((1 - (0.3642 + 0.1333)) * 1080, 6);
    expect(lines.get("viewer:other-1")!.rect.y).toBeCloseTo(
      (1 - (0.3642 + 0.1333) + (0.2302 - 0.0964)) * 1080,
      6,
    );
    // The land line about 10 px lower than the contract's third row.
    const was = (1 - 0.0964 - 0.1333) * 1080;
    expect(lines.get("viewer:land-1")!.rect.y - was).toBeGreaterThan(9);
    expect(lines.get("viewer:land-1")!.rect.y - was).toBeLessThan(11);
  });
});

describe("the hand", () => {
  it("fans symmetrically, centred in the play area, above the battlefield", () => {
    for (const vp of VIEWPORTS) {
      for (const n of [1, 7, 15]) {
        const hand = Array.from({ length: n }, (_, i) => ({ id: `card:h${i}` }));
        const out = layout({ viewerSeat: 1, hand, battlefield: many(3, 1, "creature") }, vp);
        const g = out.geometry;
        const boxes = hand.map((h) => out.boxes.get(h.id)!);
        const first = boxes[0]!;
        const last = boxes[n - 1]!;
        expect((first.x + right(last)) / 2).toBeCloseTo(g.play.x + g.play.w / 2, 6);
        expect(first.rotation).toBeCloseTo(-last.rotation, 9);
        expect(first.y).toBeCloseTo(last.y, 9);
        expect(right(last)).toBeLessThanOrEqual(g.rail.x + EPS);
        for (const b of boxes) expect(b.z).toBeGreaterThan(900);
      }
    }
  });

  it("the opponent's mirrors yours from the top edge, above their lines (spec 0031)", () => {
    for (const vp of VIEWPORTS) {
      for (const n of [1, 7, 15]) {
        const hand = Array.from({ length: n }, (_, i) => ({ id: `card:h${i}` }));
        const theirs = Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:2:${i}` }));
        const out = layout({ viewerSeat: 1, hand, opponentHand: theirs, battlefield: [] }, vp);
        const g = out.geometry;
        const backRow = g.halves.opponent.y;
        theirs.forEach((card, i) => {
          const b = out.boxes.get(card.id)!;
          const mine = out.boxes.get(hand[i]!.id)!;
          // The same fan, flipped top to bottom.
          expect(b.x).toBeCloseTo(mine.x, 9);
          expect(b.rotation).toBeCloseTo(-mine.rotation, 9);
          expect(b.y + b.h).toBeCloseTo(g.height - mine.y, 9);
          // Partly off the top edge, and clear of the opponent's cards.
          expect(b.y).toBeLessThan(0);
          expect(b.y + b.h).toBeLessThan(backRow);
          expect(right(b)).toBeLessThanOrEqual(g.rail.x + EPS);
        });
      }
    }
  });
});

describe("stacking", () => {
  it("every hand card is above every battlefield card, however full the board", () => {
    const board = syntheticBoard(200, 30, 3);
    for (const vp of VIEWPORTS) {
      const out = layout(board, vp);
      const field = board.battlefield.map((c) => out.boxes.get(c.id)!.z);
      const hand = board.hand.map((c) => out.boxes.get(c.id)!.z);
      // The lines (5000) and effects (6000) sit between the two.
      expect(Math.max(...field)).toBeLessThan(5000);
      expect(Math.min(...hand)).toBeGreaterThan(6000);
    }
  });
});

// Spec 0036 — identical cards stack, up to 15; any difference splits them.
describe("stacking identical cards (spec 0036)", () => {
  const vp = { width: 1920, height: 1080 };
  const bear = (over: Partial<LayoutCard> = {}) => card({ seat: 1, ...over });
  const pileSizes = (list: LayoutCard[]) =>
    layout({ viewerSeat: 1, hand: [], battlefield: list }, vp)
      .slots.map((s) => s.ids.length)
      .sort((a, b) => a - b);

  it("F-0036-A: identical non-token creatures, nonbasic lands, artifacts and enchantments stack", () => {
    const sol = () =>
      card({
        seat: 1,
        name: "Sol Ring",
        kind: "other",
        types: "Artifact",
        power: null,
        toughness: null,
      });
    const anthem = () =>
      card({
        seat: 1,
        name: "Glorious Anthem",
        kind: "other",
        types: "Enchantment",
        power: null,
        toughness: null,
      });
    expect(pileSizes([bear(), bear(), bear(), bear()])).toEqual([4]);
    expect(pileSizes([sol(), sol(), anthem(), anthem()])).toEqual([2, 2]);
  });

  it("F-0036-B: each fact splits a stack", () => {
    const splits: Partial<LayoutCard>[] = [
      { tapped: true },
      { sick: true },
      { power: 4, toughness: 4 },
      { keywords: ["Flying"] },
      { damage: 1 },
      { token: true },
      { types: "Artifact Creature — Bear" },
      { ringBearer: true },
      { counters: [{ name: "P1P1", count: 1 }] },
    ];
    for (const over of splits) {
      expect(pileSizes([bear(), bear(), bear(over)]), JSON.stringify(over)).toEqual([1, 2]);
    }
    // The owner's example: 4 with flying and 4 with deathtouch are two stacks of 4.
    const flying = Array.from({ length: 4 }, () => bear({ keywords: ["Flying"] }));
    const deathtouch = Array.from({ length: 4 }, () => bear({ keywords: ["Deathtouch"] }));
    expect(pileSizes([...flying, ...deathtouch])).toEqual([4, 4]);
    // Attacking, and at whom.
    expect(
      pileSizes([
        bear({ attacking: true, tapped: true, attackPile: "player:2" }),
        bear({ attacking: true, tapped: true, attackPile: "player:2" }),
        bear({ attacking: true, tapped: true, attackPile: "card:99" }),
      ]),
    ).toEqual([1, 2]);
  });

  it("F-0036-C: the same counters stack; a different count splits", () => {
    const two = () => bear({ counters: [{ name: "P1P1", count: 2 }] });
    expect(pileSizes([two(), two()])).toEqual([2]);
    expect(pileSizes([two(), two(), bear({ counters: [{ name: "P1P1", count: 1 }] })])).toEqual([
      1, 2,
    ]);
  });

  it("F-0036-D: different artwork stacks; a token copy and the real card do not", () => {
    // Artwork is not part of a layout card at all: nothing to compare.
    expect(
      pileSizes([bear({ token: false }), bear({ token: false }), bear({ token: true })]),
    ).toEqual([1, 2]);
  });

  it("F-0036-E: at most 15 to a stack, oldest first", () => {
    const goblins = Array.from({ length: 40 }, () =>
      card({ seat: 1, name: "Goblin Token", token: true, power: 1, toughness: 1 }),
    );
    expect(pileSizes(goblins)).toEqual([10, 15, 15]);
    const out = layout({ viewerSeat: 1, hand: [], battlefield: goblins }, vp);
    expect(out.slots[0]!.ids).toEqual(goblins.slice(0, 15).map((g) => g.id));
  });

  it("F-0036-F: attached, attached-to, blocking and face-down cards stand alone", () => {
    const host = bear();
    const aura = card({
      seat: 1,
      name: "Rancor",
      kind: "other",
      types: "Enchantment — Aura",
      attachedTo: host.id,
      power: null,
      toughness: null,
    });
    const lone = layout(
      {
        viewerSeat: 1,
        hand: [],
        battlefield: [
          host,
          bear(),
          bear(),
          aura,
          bear({ blocking: true }),
          bear({ faceDown: true, known: false }),
        ],
      },
      vp,
    );
    const sizes = lone.slots.map((s) => s.ids.length).sort((a, b) => a - b);
    expect(sizes).toEqual([1, 1, 1, 2]);
  });
});

/** No two drawn cards on the table overlap (their upright boxes, less a pixel). */
function overlaps(out: ReturnType<typeof layout>): string[] {
  const table = out.slots;
  const found: string[] = [];
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      const a = table[i]!.box;
      const b = table[j]!.box;
      const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (x > 1 && y > 1) found.push(`${table[i]!.ids[0]} / ${table[j]!.ids[0]}`);
    }
  }
  return found;
}

// Phase 10 A-12 (Amendment 15, replacing spec 0037's riding): a blocker
// stands facing the attacker it blocks; identical pairs still stack.
describe("big combats (spec 0037, Phase 10 A-12)", () => {
  const vp = { width: 1738, height: 1000 };
  const goblin = (seat: number, over: Partial<LayoutCard> = {}) =>
    card({
      seat,
      name: "Goblin Token",
      types: "Creature — Goblin",
      token: true,
      power: 2,
      toughness: 2,
      ...over,
    });

  it("A-12: two blockers stand side by side facing their attacker, across the middle, covering nothing", () => {
    const attacker = goblin(2, { attacking: true, tapped: true });
    const b1 = goblin(1, { blocking: true, blocks: attacker.id, power: 5, toughness: 5 });
    const b2 = card({ seat: 1, name: "Wall of Wood", blocking: true, blocks: attacker.id });
    const rest = [
      goblin(1),
      goblin(2),
      card({ seat: 1, kind: "land", types: "Land", name: "Forest" }),
    ];
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [attacker, b1, b2, ...rest] }, vp);
    const host = out.boxes.get(attacker.id)!;
    const facing = out.slots.filter((s) => s.faces === attacker.id);
    expect(facing).toHaveLength(2);
    const [l, r] = facing.map((s) => s.box).sort((p, q) => p.x - q.x);
    // Side by side, centred under it, in the viewer's front line, just
    // across the middle -- facing it, edge to edge but never on it.
    expect(l!.y).toBe(r!.y);
    expect(r!.x).toBeGreaterThan(l!.x + l!.w);
    expect((l!.x + r!.x + r!.w) / 2).toBeCloseTo(host.x + host.w / 2, 6);
    expect(l!.y).toBeGreaterThan(host.y + host.h);
    expect(l!.y - (host.y + host.h)).toBeLessThan(host.h * 0.15);
    expect(out.rowOf.get(b1.id)).toBe("viewer:creature-1");
    expect(out.rowOf.get(rest[0]!.id)).toBe("viewer:creature-2");
    expect(overlaps(out)).toEqual([]);
    // A blocker of your attacker stands above it, on their side.
    const mine = goblin(1, { attacking: true, tapped: true });
    const theirs = goblin(2, { blocking: true, blocks: mine.id });
    const up = layout({ viewerSeat: 1, hand: [], battlefield: [mine, theirs] }, vp);
    const m = up.boxes.get(mine.id)!;
    const t = up.boxes.get(theirs.id)!;
    expect(t.y + t.h).toBeLessThan(m.y);
    expect(t.x + t.w / 2).toBeCloseTo(m.x + m.w / 2, 6);
  });

  it("A-12: a blocker on each of several attackers, and three on one -- each faces its own, nothing covered", () => {
    for (const viewport of VIEWPORTS) {
      const attackers = ["Hill Giant", "Grizzly Bears", "Serra Angel", "Craw Wurm"].map((name) =>
        card({ seat: 2, name, attacking: true, tapped: true }),
      );
      const blockers = [
        card({ seat: 1, name: "Llanowar Elves", blocking: true, blocks: attackers[0]!.id }),
        card({ seat: 1, name: "Wall of Wood", blocking: true, blocks: attackers[1]!.id }),
        ...["Elvish Mystic", "Fyndhorn Elves", "Wood Elves"].map((name) =>
          card({ seat: 1, name, blocking: true, blocks: attackers[2]!.id }),
        ),
      ];
      const home = Array.from({ length: 6 }, (_, i) => card({ seat: 1, name: `Home ${i}` }));
      const out = layout(
        { viewerSeat: 1, hand: [], battlefield: [...attackers, ...blockers, ...home] },
        viewport,
      );
      expect(overlaps(out)).toEqual([]);
      for (const b of blockers) {
        const slot = out.slots.find((s) => s.ids.includes(b.id))!;
        expect(slot.faces).toBe(b.blocks);
        // Under its own attacker more than any other.
        const box = slot.box;
        const centre = box.x + box.w / 2;
        const nearest = [...attackers].sort((p, q) => {
          const pb = out.boxes.get(p.id)!;
          const qb = out.boxes.get(q.id)!;
          return Math.abs(pb.x + pb.w / 2 - centre) - Math.abs(qb.x + qb.w / 2 - centre);
        })[0]!;
        if (b.blocks !== attackers[2]!.id) expect(nearest.id).toBe(b.blocks);
      }
      // The three facing the Angel stand in a row, centred on it.
      const three = out.slots.filter((s) => s.faces === attackers[2]!.id).map((s) => s.box);
      const angel = out.boxes.get(attackers[2]!.id)!;
      const left = Math.min(...three.map((b) => b.x));
      const rightEdge = Math.max(...three.map((b) => b.x + b.w));
      expect((left + rightEdge) / 2).toBeCloseTo(angel.x + angel.w / 2, 4);
    }
  });

  it("A-12: a blocker of two attackers faces the first; the rest of its side steps back", () => {
    const a1 = card({ seat: 2, name: "Hill Giant", attacking: true, tapped: true });
    const a2 = card({ seat: 2, name: "Grizzly Bears", attacking: true, tapped: true });
    const wall = card({ seat: 1, name: "Two-Headed Wall", blocking: true, blocks: a1.id });
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [a1, a2, wall] }, vp);
    expect(out.slots.find((s) => s.ids.includes(wall.id))!.faces).toBe(a1.id);
    expect(overlaps(out)).toEqual([]);
  });

  it("F-0037-C: identical pairs stack, at most 15; a different blocker splits", () => {
    const list: LayoutCard[] = [];
    for (let i = 0; i < 20; i++) {
      const a = goblin(2, { attacking: true, tapped: true });
      list.push(a, goblin(1, { blocking: true, blocks: a.id, power: 5, toughness: 5 }));
    }
    const odd = goblin(2, { attacking: true, tapped: true });
    list.push(odd, card({ seat: 1, name: "Goblin Chieftain", blocking: true, blocks: odd.id }));
    const out = layout({ viewerSeat: 1, hand: [], battlefield: list }, vp);
    const hosts = out.slots.filter((s) => !s.faces && s.ids.length > 0);
    expect(hosts.map((s) => s.ids.length).sort((a, b) => a - b)).toEqual([1, 5, 15]);
    const facing = out.slots.filter((s) => s.faces);
    expect(facing.map((s) => s.ids.length).sort((a, b) => a - b)).toEqual([1, 5, 15]);
    // Each pile of blockers faces the pile of the attackers they block.
    for (const slot of facing) {
      const host = out.slots.find((s) => s.ids[0] === slot.faces)!;
      expect(host.ids).toHaveLength(slot.ids.length);
    }
    expect(overlaps(out)).toEqual([]);
  });

  it("F-0037-A: the owner's Goblin swarm, after 30 blocks, draws at most 16 cards a side", () => {
    const list: LayoutCard[] = [];
    const attackers = Array.from({ length: 85 }, () =>
      goblin(2, { attacking: true, tapped: true }),
    );
    const named = [
      "Krenko, Mob Boss",
      "Mogg Fanatic",
      "Goblin Instigator",
      "Goblin Ringleader",
      "Goblin Trashmaster",
      "Gempalm Incinerator",
    ].map((name) => card({ seat: 2, name, attacking: true, tapped: true, attackPile: "player:1" }));
    const defenders = Array.from({ length: 40 }, () => goblin(1, { power: 5, toughness: 5 }));
    attackers.forEach((a, i) => {
      if (i < 30) Object.assign(defenders[i]!, { blocking: true, blocks: a.id });
      else a.attackPile = "player:1";
    });
    list.push(...attackers, ...named, ...defenders);
    for (const name of [
      "Goblin Rabblemaster",
      "Goblin Warchief",
      "Goblin Chieftain",
      "Mogg Flunkies",
    ]) {
      list.push(card({ seat: 1, name, power: 6, toughness: 6 }));
    }
    const out = layout({ viewerSeat: 1, hand: [], battlefield: list }, vp);
    const drawn = (seat: number) =>
      out.slots.filter((s) => list.find((c) => c.id === s.ids[0])!.seat === seat).length;
    expect(drawn(2)).toBeLessThanOrEqual(16);
    expect(drawn(1)).toBeLessThanOrEqual(16);
    expect(out.overcrowded).toEqual([]);
  });
});
