// Tier 1 of BATTLEFIELD_RENDERING.md §6: the layout maths, proved before
// a pixel exists. PHASE_07 §7.42's properties, across viewports × card
// counts × both seats, plus every 2026-10-20 layout decision (§7.52a).

import { describe, expect, it } from "vitest";
import {
  geometry,
  layout,
  type Box,
  type LayoutCard,
  type LayoutInput,
  type Viewport,
} from "./layout";

const VIEWPORTS: Viewport[] = [
  { width: 1366, height: 768 }, // the minimum (§1.19)
  { width: 1536, height: 864 },
  { width: 1710, height: 960 },
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

/** n distinct (never-piling) permanents of one kind for a seat. */
function many(n: number, seat: number, kind: "creature" | "land" | "other"): LayoutCard[] {
  return Array.from({ length: n }, (_, i) =>
    card({
      seat,
      kind,
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
      ...many(n, 1, "creature"),
      ...many(n, 1, "land"),
      ...many(n, 1, "other"),
      ...many(n, 2, "creature"),
      ...many(n, 2, "land"),
      ...many(n, 2, "other"),
    ],
  };
}

const right = (b: Box) => b.x + b.w;

describe("geometry", () => {
  it("reproduces the contract's rectangles at 16:9 (§2 Verification)", () => {
    // The contract's own table at 1920x1080, opponent half.
    const g = geometry({ width: 1920, height: 1080 });
    const table: [string, number, number, number][] = [
      ["opponent:land-back", 0.0, 0.0964, 0.425],
      ["opponent:other-back", 0.4293, 0.0964, 0.4238],
      ["opponent:land-front", 0.0, 0.2302, 0.1609],
      ["opponent:creature-back", 0.1883, 0.2302, 0.4246],
      ["opponent:other-front", 0.64, 0.2302, 0.2129],
      ["opponent:creature-front", 0.0, 0.3642, 0.7422],
    ];
    for (const [id, x, y, w] of table) {
      const r = g.rows[id as keyof typeof g.rows];
      expect(r.x).toBeCloseTo(x * 1920, 1);
      expect(r.y).toBeCloseTo(y * 1080, 1);
      expect(r.w).toBeCloseTo(w * 1920, 1);
      expect(r.h).toBeCloseTo(0.1333 * 1080, 1);
    }
    // The contract's measured card at 1080: 97.5 x 136.5.
    expect(g.cardW).toBeCloseTo(97.5, 0);
    expect(g.cardH).toBeCloseTo(136.5, 0);
    // And the rail starts where every rectangle stops.
    expect(g.rail.x).toBeCloseTo(0.8529 * 1920, 1);
  });

  it("mirrors each viewer row about the middle", () => {
    for (const vp of VIEWPORTS) {
      const g = geometry(vp);
      for (const name of [
        "land-back",
        "other-back",
        "land-front",
        "creature-back",
        "other-front",
        "creature-front",
      ] as const) {
        const o = g.rows[`opponent:${name}`];
        const v = g.rows[`viewer:${name}`];
        expect(v.x).toBeCloseTo(o.x, 6);
        expect(v.w).toBeCloseTo(o.w, 6);
        expect(v.y + v.h).toBeCloseTo(vp.height - o.y, 6);
      }
    }
  });

  it("stretches rows on a wide window and keeps the rail's width to the height (§7.52a L1, L2)", () => {
    const normal = geometry({ width: 2560, height: 1440 });
    const wide = geometry({ width: 3440, height: 1440 });
    expect(wide.cardW).toBeCloseTo(normal.cardW, 9);
    expect(wide.rail.w).toBeCloseTo(normal.rail.w, 9);
    expect(wide.rows["viewer:creature-front"].w).toBeGreaterThan(
      normal.rows["viewer:creature-front"].w * 1.3,
    );
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

          for (const c of input.battlefield) {
            const b = out.boxes.get(c.id)!;
            const row = g.rows[out.rowOf.get(c.id)!];
            // The right side of the table: own cards below the middle.
            const mine = c.seat === seat;
            expect(mine ? b.y >= vp.height / 2 : b.y + b.h <= vp.height / 2).toBe(true);
            // No card escapes its row (§7.42), nor runs into the rail.
            expect(b.x).toBeGreaterThanOrEqual(row.x - EPS);
            expect(right(b)).toBeLessThanOrEqual(row.x + row.w + EPS);
            expect(right(b)).toBeLessThanOrEqual(g.rail.x + EPS);
            expect(b.y).toBeGreaterThanOrEqual(row.y - EPS);
            expect(b.y + b.h).toBeLessThanOrEqual(row.y + row.h + EPS);
            // Never smaller than the floor.
            expect(b.scale).toBeGreaterThanOrEqual(0.75 - EPS);
          }

          // Within a row: left to right, later on top, and never closer
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
  /** The kind groups (side + kind) in which some card changed rows. */
  function hopped(
    input: LayoutInput,
    a: ReturnType<typeof layout>,
    b: ReturnType<typeof layout>,
  ): Set<string> {
    const groups = new Set<string>();
    for (const c of input.battlefield) {
      if (a.rowOf.get(c.id) !== b.rowOf.get(c.id)) groups.add(`${c.seat}:${c.kind}`);
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
      // At a capacity point one card changes rows and its row-mates
      // re-centre by half a card: that group is exempt, nothing else.
      if (skip.has(`${c.seat}:${c.kind}`)) continue;
      const ba = a.boxes.get(c.id)!;
      const bb = b.boxes.get(c.id)!;
      expect(Math.abs(ba.x - bb.x)).toBeLessThan(6);
      expect(Math.abs(ba.y - bb.y)).toBeLessThan(dy);
    }
  }

  it("a 1px resize moves no card more than a few px, except where a card changed rows", () => {
    let hops = 0;
    for (const n of [1, 8, 9, 23, 31]) {
      for (const height of [768, 1080]) {
        for (let width = 1366; width <= 2600; width += 37) {
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

describe("rows (§7.52a L3, L4)", () => {
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
    expect(out.rowOf.get(arbor.id)).toBe("viewer:creature-front");
    expect(out.rowOf.get(ravager.id)).toBe("viewer:creature-front");
    expect(out.rowOf.get(saga.id)).toBe("viewer:land-back");
    expect(out.rowOf.get(citadel.id)).toBe("viewer:land-back");
    expect(out.rowOf.get(karn.id)).toBe("viewer:other-front");
    // An unrecognised kind falls back to the noncreature row, never vanishes (§7.10).
    expect(out.rowOf.get(hidden.id)).toBe("opponent:other-front");
  });

  it("lands fill the back row first, then spill forward; creatures fill the front first", () => {
    const g = geometry(vp);
    const out = layout(
      { viewerSeat: 1, hand: [], battlefield: [...many(9, 1, "land"), ...many(15, 1, "creature")] },
      vp,
    );
    const rows = (prefix: string) =>
      out.slots.filter((s) => s.row.startsWith(prefix)).map((s) => s.row);
    const landRows = rows("viewer:land");
    const back = landRows.filter((r) => r === "viewer:land-back").length;
    expect(back).toBeGreaterThan(0);
    expect(landRows.filter((r) => r === "viewer:land-front").length).toBe(9 - back);
    // The back row is full before anything goes forward.
    const backCap =
      1 + Math.floor((g.rows["viewer:land-back"].w - 2 * g.inset - g.cardW) / g.referencePitch);
    expect(back).toBe(Math.min(9, backCap));
    const creatureRows = rows("viewer:creature");
    expect(creatureRows[0]).toBe("viewer:creature-front");
  });

  it("one land sits in the middle of the back row (centre-out)", () => {
    const [land] = many(1, 1, "land");
    const out = layout({ viewerSeat: 1, hand: [], battlefield: [land!] }, vp);
    const b = out.boxes.get(land!.id)!;
    const row = out.geometry.rows["viewer:land-back"];
    expect(b.x + b.w / 2).toBeCloseTo(row.x + row.w / 2, 6);
  });
});

describe("order within a row (§7.52a L6)", () => {
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
    expect(tapped.box.rotation).toBe(15);
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

  it("nonbasic lands, non-tokens and face-down cards never pile", () => {
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
    expect(out.slots).toHaveLength(6);
  });

  it("a pile is one slot of the overflow ladder", () => {
    const twenty = Array.from({ length: 20 }, () => forest());
    const out = layout({ viewerSeat: 1, hand: [], battlefield: twenty }, vp);
    expect(out.overcrowded).toEqual([]);
    expect(out.slots[0]!.box.scale).toBe(1);
  });
});

describe("attachments (§7.52a L7)", () => {
  const vp = { width: 1920, height: 1080 };

  it("tuck behind the host, share its slot, and peek above it", () => {
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
    const host = out.boxes.get(goblin.id)!;
    const tucked = out.boxes.get(splitter.id)!;
    expect(tucked.x).toBe(host.x);
    expect(tucked.y).toBeLessThan(host.y);
    expect(tucked.z).toBeLessThan(host.z);
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
    expect(out.rowOf.get(curse.id)).toBe("viewer:other-front");
  });
});

describe("combat and tapped", () => {
  const vp = { width: 1920, height: 1080 };

  it("an attacker steps toward the divider; a tapped card tilts 15 degrees", () => {
    const mine = card({ seat: 1 });
    const mineAttacking = card({ seat: 1, attacking: true, tapped: true });
    const theirs = card({ seat: 2 });
    const theirsAttacking = card({ seat: 2, attacking: true });
    const out = layout(
      { viewerSeat: 1, hand: [], battlefield: [mine, mineAttacking, theirs, theirsAttacking] },
      vp,
    );
    expect(out.boxes.get(mineAttacking.id)!.y).toBeLessThan(out.boxes.get(mine.id)!.y);
    expect(out.boxes.get(theirsAttacking.id)!.y).toBeGreaterThan(out.boxes.get(theirs.id)!.y);
    expect(out.boxes.get(mineAttacking.id)!.rotation).toBe(15);
    expect(out.boxes.get(mine.id)!.rotation).toBe(0);
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
});
