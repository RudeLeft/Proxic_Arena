import { describe, expect, it } from "vitest";
import { TAPPED_ORIGIN, inCombat, layout, type Box } from "./layout";
import { pointOn } from "./effects";
import { combatScript } from "./fixture";
import {
  captionOf,
  FIGHT_BEAT_MS,
  FIGHTS_FASTEST,
  fighterFrames,
  planFights,
  type CombatWave,
  type FightInput,
  type Pose,
  type Stand,
} from "./fights";

/**
 * Combat damage, one fight at a time -- Phase 10 A-13 (Amendment 15). Pure:
 * the order, the timing, where each fighter goes, and that fighters meet
 * edge to edge without ever overlapping.
 */

/** The drawn outline of a box (its tilt included), as a polygon. */
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

const vp = { width: 1920, height: 1080 };
const LIFE = { x: 1750, y: 960 };

/** The fixture's combat as it stood before damage (step 4), and the wave of step 5. */
function setup(step: 3 | 5 = 5) {
  const before = combatScript(step - 1);
  const out = layout(
    { ...before.board, battlefield: inCombat(before.board.battlefield, before.combat!) },
    vp,
  );
  const cards = new Map(before.board.battlefield.map((c) => [c.id, c]));
  const at = (id: string): Stand | null => {
    const slot = out.slots.find((s) => s.ids.includes(id));
    const card = cards.get(id);
    if (!slot || !card) return null;
    return { box: slot.box, item: slot.ids[0]!, name: card.name, seat: card.seat, count: 1 };
  };
  const input: FightInput = {
    wave: combatScript(step).damage as CombatWave,
    at,
    life: () => LIFE,
    lifeR: 27,
    viewerSeat: 1,
    opponentName: "Bob",
  };
  return { out, at, input, plan: planFights(input)! };
}

/** A fighter's pose at a moment: the pose it holds then (poses are the plan's corners). */
function poseAt(poses: Pose[], at: number): Pose {
  return poses.filter((p) => p.at <= at + 1e-6).pop()!;
}

describe("the fights, in order (A-13)", () => {
  it("each attacker with its blockers first, then each unblocked attacker; one at a time", () => {
    const { plan } = setup();
    expect(plan.fights.map((f) => f.attacker)).toEqual(["card:201", "card:203"]);
    expect(plan.fights[0]!.blockers.sort()).toEqual(["card:211", "card:212"]);
    // The next starts only once the one before has ended (and its dead cracked).
    expect(plan.fights[1]!.start).toBeGreaterThanOrEqual(plan.fights[0]!.end);
    expect(plan.fights.map((f) => f.caption)).toEqual([
      "Damage · the Serra Angel against your Goblin Guide and Llanowar Elves",
      "Damage · Bob's Goblin Token hit The Wandering Emperor",
    ]);
    // The White Knight dealt nothing in this step: no fight.
    expect(plan.fighters.has("card:202")).toBe(false);
  });

  it("first strike is its own wave, its caption says so", () => {
    const { plan } = setup(3);
    expect(plan.firstStrike).toBe(true);
    expect(plan.fights.map((f) => f.caption)).toEqual([
      "First strike · the White Knight against your Grizzly Bears",
    ]);
  });

  it("every blow lands as the fighters meet; the dead shatter after a beat", () => {
    const { plan } = setup();
    for (const fight of plan.fights) {
      expect(fight.impact).toBeGreaterThan(fight.start);
      expect(fight.shatterAt).toBeGreaterThanOrEqual(fight.impact + FIGHT_BEAT_MS);
      for (const strike of fight.strikes) expect(strike.at).toBeGreaterThanOrEqual(fight.impact);
    }
    const struck = plan.fights[0]!.strikes.map((s) => `${s.target} ${s.amount}`).sort();
    expect(struck).toEqual(["card:201 3", "card:211 2", "card:212 2"]);
  });

  it("nothing for a spell's damage", () => {
    const { input } = setup();
    expect(planFights({ ...input, wave: { key: "bolt", hits: input.wave.hits } })).toBeNull();
  });
});

describe("where the fighters go (A-13)", () => {
  it("they meet edge to edge, never overlapping", () => {
    const { plan, at } = setup();
    const fight = plan.fights[0]!;
    const moved = (id: string) => {
      const p = poseAt(fight.moves.get(id)!, fight.impact);
      const box = at(id)!.box;
      return { ...box, x: box.x + p.dx, y: box.y + p.dy, rotation: box.rotation + p.r };
    };
    const angel = moved("card:201");
    for (const id of ["card:211", "card:212"]) {
      const blocker = moved(id);
      // Never overlapping, tilt and all...
      expect(overlapArea(outline(angel), outline(blocker))).toBe(0);
      // ...and touching: the gap between them is a couple of pixels at most.
      const angelLow = Math.max(...outline(angel).map(([, y]) => y));
      const blockerHigh = Math.min(...outline(blocker).map(([, y]) => y));
      expect(blockerHigh - angelLow).toBeLessThan(3);
    }
    // The angel was apart from them before the lunge.
    const was = at("card:201")!.box;
    const guide = at("card:211")!.box;
    expect(guide.y - (was.y + was.h)).toBeGreaterThan(3);
  });

  it("they rear back first: away from each other", () => {
    const { plan } = setup();
    const fight = plan.fights[0]!;
    const rear = (id: string) => fight.moves.get(id)!.find((p) => p.s > 1)!;
    // The opponent's Angel is above: it rears up, the blockers down.
    expect(rear("card:201").dy).toBeLessThan(0);
    expect(rear("card:211").dy).toBeGreaterThan(0);
  });

  it("an unblocked attacker lunges at a planeswalker edge to edge", () => {
    const { plan, at } = setup();
    const fight = plan.fights[1]!;
    const p = poseAt(fight.moves.get("card:203")!, fight.impact);
    const box = at("card:203")!.box;
    const token = { ...box, x: box.x + p.dx, y: box.y + p.dy };
    const emperor = at("card:215")!.box;
    expect(overlapArea(outline(token), outline(emperor))).toBe(0);
    expect(emperor.y - (token.y + token.h)).toBeLessThan(box.h * 0.1);
  });

  it("an unblocked attacker at a player stops at the plate's ring, never over the life total", () => {
    const { input, at } = setup();
    const wave: CombatWave = {
      key: "w",
      combat: "regular",
      hits: [{ source: "card:202", target: { player: 1 }, amount: 2 }],
      fights: [{ attacker: "card:202", defender: { player: 1 }, blockers: [] }],
    };
    const plan = planFights({ ...input, wave })!;
    const fight = plan.fights[0]!;
    const p = poseAt(fight.moves.get("card:202")!, fight.impact);
    const box = at("card:202")!.box;
    const x = Math.max(box.x + p.dx, Math.min(LIFE.x, box.x + p.dx + box.w));
    const y = Math.max(box.y + p.dy, Math.min(LIFE.y, box.y + p.dy + box.h));
    expect(Math.hypot(LIFE.x - x, LIFE.y - y)).toBeGreaterThanOrEqual(27);
    expect(Math.hypot(p.dx, p.dy)).toBeGreaterThan(box.h);
    expect(fight.strikes.map((s) => s.target)).toEqual(["player:1"]);
    expect(fight.caption).toBe("Damage · Bob's White Knight hit you");
  });

  it("trample's excess slashes the player in the same fight; lifelink rises as it lands", () => {
    const { input } = setup();
    const wave: CombatWave = {
      key: "t",
      combat: "regular",
      hits: [
        { source: "card:201", target: { object: "card:211" }, amount: 2 },
        { source: "card:201", target: { player: 1 }, amount: 2 },
      ],
      fights: [{ attacker: "card:201", defender: { player: 1 }, blockers: ["card:211"] }],
      gains: [{ player: 2, amount: 4, source: "card:201" }],
    };
    const plan = planFights({ ...input, wave })!;
    expect(plan.fights).toHaveLength(1);
    const fight = plan.fights[0]!;
    expect(fight.strikes.map((s) => s.target).sort()).toEqual(["card:211", "player:1"]);
    expect(fight.gains).toEqual([{ player: 2, amount: 4, at: fight.impact }]);
    expect(plan.unsourced).toEqual([]);
  });
});

describe("the frames (A-13)", () => {
  it("start and end exactly at rest, in time order, over the whole sequence", () => {
    const { plan, at } = setup();
    for (const item of plan.fighters.keys()) {
      const frames = fighterFrames(plan, item, at(item)!.box);
      const rest = "translate(0px, 0px) rotate(0deg) scale(1)";
      expect(frames[0]!.offset).toBe(0);
      expect(frames[0]!.transform).toBe(rest);
      expect(frames[frames.length - 1]!.offset).toBe(1);
      expect(frames[frames.length - 1]!.transform).toBe(rest);
      const offsets = frames.map((f) => Number(f.offset));
      expect([...offsets].sort((p, q) => p - q)).toEqual(offsets);
    }
  });

  it("a fighter is dimmed while another fight plays; one that dies stays lit to shatter", () => {
    const { plan, at } = setup();
    // The Goblin token fights second: dimmed while the Angel fights.
    const token = fighterFrames(plan, "card:203", at("card:203")!.box);
    const during = token.filter((f) => Number(f.offset) * plan.total < plan.fights[1]!.start);
    expect(during.some((f) => String(f.filter).startsWith("brightness(0.4)"))).toBe(true);
    // ...right up to its own fight, not brightening while it waits.
    const atStart = token.find(
      (f) => Math.abs(Number(f.offset) * plan.total - plan.fights[1]!.start) < 1e-6,
    )!;
    expect(String(atStart.filter)).toMatch(/^brightness\(0\.4\)/);
    // The Guide dies in the first fight: lit after it, until it shatters.
    const guide = fighterFrames(plan, "card:211", at("card:211")!.box, true);
    const after = guide.filter((f) => {
      const t = Number(f.offset) * plan.total;
      return t > plan.fights[0]!.end && Number(f.offset) < 1;
    });
    expect(after.every((f) => String(f.filter).startsWith("brightness(1)"))).toBe(true);
  });

  it("many fights speed up together, never faster than FIGHTS_FASTEST", () => {
    const { input, at } = setup();
    const ids = ["card:201", "card:202", "card:203"];
    const one = planFights({
      ...input,
      wave: {
        key: "1",
        combat: "regular",
        hits: [{ source: ids[0]!, target: { player: 1 }, amount: 1 }],
        fights: [{ attacker: ids[0]!, defender: { player: 1 }, blockers: [] }],
      },
    })!;
    expect(one.speed).toBe(1);
    // Twenty unblocked attackers, each its own drawn card.
    const many: CombatWave = {
      key: "20",
      combat: "regular",
      hits: Array.from({ length: 20 }, (_, i) => ({
        source: `x:${i}`,
        target: { player: 1 },
        amount: 1,
      })),
      fights: Array.from({ length: 20 }, (_, i) => ({
        attacker: `x:${i}`,
        defender: { player: 1 },
        blockers: [],
      })),
    };
    const plan = planFights({
      ...input,
      wave: many,
      at: (id) => (id.startsWith("x:") ? { ...at("card:202")!, item: id } : at(id)),
    })!;
    expect(plan.fights).toHaveLength(20);
    expect(plan.speed).toBe(FIGHTS_FASTEST);
    expect(plan.total).toBeLessThan(20 * 1500 * FIGHTS_FASTEST + 300);
  });
});

describe("captions", () => {
  it("say who fights whom in a player's words", () => {
    const giant: Stand = {
      box: { x: 0, y: 0, w: 1, h: 1, scale: 1, rotation: 0, z: 0 },
      item: "a",
      name: "Hill Giant",
      seat: 1,
      count: 1,
    };
    const bears: Stand = { ...giant, item: "b", name: "Grizzly Bears", seat: 2 };
    expect(captionOf(giant, [bears, { ...bears, item: "c" }], { player: 2 }, 1, "Bob", false)).toBe(
      "Damage · your Hill Giant against their two Grizzly Bears",
    );
    expect(captionOf(giant, [], { player: 2 }, 1, "Bob", false)).toBe(
      "Damage · your Hill Giant hit Bob",
    );
    expect(captionOf({ ...giant, count: 5 }, [], { player: 2 }, 1, "Bob", true)).toBe(
      "First strike · your 5 Hill Giant hit Bob",
    );
  });
});
