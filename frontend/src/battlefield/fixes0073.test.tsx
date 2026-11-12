// @vitest-environment jsdom

// Spec 0073 -- cards and tokens visibly join a pile, and peel off it
// (F-0073-A, B, C, D, F). The real Board, handed one board and then the
// next, as the game screen hands them (the round's arrivals and departures
// from the game's moves; the other player's hand as backs only).

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type BoardHandCard, type StackView } from "./Board";
import { MOVE_MS, type AnchorId } from "./motion";
import { PEEL_MS, TOKEN_AFTER_MS, TOKEN_BEAT_ABILITY_MS, TOKEN_BEAT_MS, TOKEN_MS } from "./piles";
import type { CombatWave } from "./fights";
import { geometry } from "./layout";

const size = { width: 1920, height: 1080 };
type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  rate: number[];
  animation: Animation;
};
const calls: Call[] = [];
let still = false;
beforeEach(() => {
  calls.length = 0;
  still = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? still : false,
  }));
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const call = { element: this, frames, options, rate: [] as number[] } as Call;
    const animation = {
      onfinish: null,
      oncancel: null,
      cancel() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      id: options.id ?? "",
      effect: {
        getComputedTiming: () => ({
          endTime: Number(options.duration ?? 0) + Number(options.delay ?? 0),
          iterations: options.iterations ?? 1,
        }),
      },
      updatePlaybackRate: (rate: number) => call.rate.push(rate),
    } as unknown as Animation;
    call.animation = animation;
    calls.push(call);
    return animation;
  };
  // A click hurries what is moving on the board (A-00): the board's
  // animations, as a browser lists them.
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
    this: Element,
  ) {
    return this.classList.contains("bf-board")
      ? calls.filter((c) => this.contains(c.element)).map((c) => c.animation)
      : [];
  };
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let entered = 0;
function card(id: string, seat: number, name: string, extra: Partial<BoardCard> = {}): BoardCard {
  const land = name === "Forest" || name === "Mountain" || name === "Plains";
  return {
    id,
    seat,
    name,
    kind: land ? "land" : "creature",
    types: land ? `Basic Land — ${name}` : `Creature — ${name}`,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: land ? null : 1,
    toughness: land ? null : 1,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}
const token = (id: string, name: string, extra: Partial<BoardCard> = {}) =>
  card(id, 1, name, { token: true, types: `Token Creature — ${name}`, ...extra });
const handCard = (c: BoardCard): BoardHandCard => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  types: c.types,
  power: c.power,
  toughness: c.toughness,
  art: null,
});
const backs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:2:${i}`, shown: null }));

function draw(
  battlefield: BoardCard[],
  extra: {
    hand?: BoardHandCard[];
    opponentHand?: ReturnType<typeof backs>;
    stack?: StackView[];
    arrivals?: Map<string, AnchorId>;
    departures?: Map<string, AnchorId>;
    combat?: Parameters<typeof Board>[0]["combat"];
    damage?: CombatWave | null;
  } = {},
) {
  return (
    <Board
      battlefield={battlefield}
      hand={extra.hand ?? []}
      opponentHand={extra.opponentHand ?? backs(3)}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={extra.arrivals ?? new Map()}
      departures={extra.departures ?? new Map()}
      returns={new Map()}
      stack={extra.stack ?? []}
      combat={extra.combat ?? null}
      damage={extra.damage ?? null}
    />
  );
}

const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
const ghostsOf = (container: HTMLElement, id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-ghost-of="${id}"]`),
];
const runOf = (element: Element) => calls.filter((c) => c.element === element).at(-1);
const end = (c: Call) => Number(c.options.delay ?? 0) + Number(c.options.duration ?? 0);
/** Where a transform puts a card's centre (cardW x cardH about `origin`, in px). */
function centre(transform: string, origin: string) {
  const m =
    /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\) rotate\([-\d.e]+deg\) scale\(([-\d.e]+)/.exec(
      transform,
    )!;
  const [ox, oy] = origin.split(" ").map((v) => Number(v.replace("px", "")));
  const s = Number(m[3]);
  const g = geometry(size);
  return {
    x: Number(m[1]) + ox! * (1 - s) + (s * g.cardW) / 2,
    y: Number(m[2]) + oy! * (1 - s) + (s * g.cardH) / 2,
    s,
  };
}

/**
 * The numbers a pile's card shows at `t` ms from the update: each badge it
 * has, seen when its own animation says so (or, with none, as drawn).
 */
function badgeAt(container: HTMLElement, lead: string, t: number): string[] {
  const button = container.querySelector(`[data-object-id="${lead}"]`)!;
  return [...button.querySelectorAll<HTMLElement>(":scope > .bf-pile")]
    .filter((badge) => {
      const run = runOf(badge);
      if (!run) return badge.style.opacity !== "0";
      const total = Number(run.options.duration);
      if (t >= total) return badge.style.opacity !== "0";
      let opacity = 1;
      for (const f of run.frames) if (Number(f.offset) * total <= t) opacity = Number(f.opacity);
      return opacity > 0;
    })
    .map((b) => b.textContent ?? "");
}

describe("F-0073-A · a card joining a pile glides onto it; the number ticks as it lands", () => {
  const f1 = card("card:1", 1, "Forest");
  const f2 = card("card:2", 1, "Forest");
  const f3 = card("card:3", 1, "Forest");
  const m1 = card("card:11", 2, "Mountain");
  const m2 = card("card:12", 2, "Mountain");
  const m3 = card("card:13", 2, "Mountain");

  it("your third Forest, from your hand: it glides onto the pile; ×2 until it lands, then ×3", () => {
    const view = render(draw([f1, f2, m1], { hand: [handCard(f3)] }));
    calls.length = 0;
    view.rerender(draw([f1, f2, f3, m1]));
    const pile = slotOf(view.container, f1.id);
    const [ghost] = ghostsOf(view.container, f3.id);
    const flight = runOf(ghost!)!;
    expect(String(flight.frames.at(-1)!.transform)).toBe(pile.style.transform);
    const lands = end(flight);
    expect(lands).toBe(MOVE_MS);
    expect(badgeAt(view.container, f1.id, 0)).toEqual(["×2"]);
    expect(badgeAt(view.container, f1.id, lands - 1)).toEqual(["×2"]);
    expect(badgeAt(view.container, f1.id, lands)).toEqual(["×3"]);
  });

  it("Bob's third Mountain, from his hidden hand: out of the middle of his fan, turning face up, onto his pile", () => {
    const view = render(draw([f1, m1, m2], { opponentHand: backs(5) }));
    // Five backs: the middle one (index 2) is where it leaves from, as his casts do.
    const middle = slotOf(view.container, "hidden-hand:2:2").style.transform;
    calls.length = 0;
    view.rerender(
      draw([f1, m1, m2, m3], {
        opponentHand: backs(4),
        arrivals: new Map([[m3.id, "opponent:hand"]]),
      }),
    );
    const pile = slotOf(view.container, m1.id);
    const ghosts = ghostsOf(view.container, m3.id);
    const back = ghosts.find((g) => g.dataset.turn === "back")!;
    const face = ghosts.find((g) => g.dataset.turn === "face")!;
    expect(back.querySelector(".bf-opp-back")).toBeTruthy(); // a card back: nothing named yet
    const backRun = runOf(back)!;
    const faceRun = runOf(face)!;
    expect(String(backRun.frames[0]!.transform)).toBe(middle);
    expect(backRun.frames[0]!.opacity).toBe(1);
    expect(backRun.frames.at(-1)!.opacity).toBe(0);
    // One picture at a time: the face unseen until the back has turned away.
    for (let i = 0; i < faceRun.frames.length; i++) {
      expect(Number(faceRun.frames[i]!.opacity) + Number(backRun.frames[i]!.opacity)).toBe(1);
    }
    expect(String(faceRun.frames.at(-1)!.transform)).toBe(pile.style.transform);
    // The last back does not fly off to his graveyard: the fan closes on the gap.
    expect(ghostsOf(view.container, "hidden-hand:2:4")).toHaveLength(0);
    expect(badgeAt(view.container, m1.id, MOVE_MS - 1)).toEqual(["×2"]);
    expect(badgeAt(view.container, m1.id, MOVE_MS)).toEqual(["×3"]);
  });

  it("a card resolving from the stack onto its twins glides from its stack spot", () => {
    const b1 = card("card:21", 1, "Grizzly Bears");
    const b2 = card("card:22", 1, "Grizzly Bears");
    const spell: StackView = {
      id: "stack:22",
      name: "Grizzly Bears",
      kind: "spell",
      source: null,
      targets: [],
      seat: 1,
      card: b2.id,
    };
    const view = render(draw([f1, b1], { stack: [spell] }));
    calls.length = 0;
    view.rerender(draw([f1, b1, b2]));
    const [ghost] = ghostsOf(view.container, b2.id);
    expect(ghost).toBeTruthy();
    expect(String(runOf(ghost!)!.frames.at(-1)!.transform)).toBe(
      slotOf(view.container, b1.id).style.transform,
    );
    expect(badgeAt(view.container, b1.id, MOVE_MS - 1)).toEqual([]);
    expect(badgeAt(view.container, b1.id, MOVE_MS)).toEqual(["×2"]);
  });
});

describe("F-0073-B · tokens spark out of their source and join one by one", () => {
  const plains = card("card:1", 1, "Plains");
  const s1 = token("card:31", "Soldier");
  const s2 = token("card:32", "Soldier");
  const s3 = token("card:33", "Soldier");
  const s4 = token("card:34", "Soldier");
  const alarm: StackView = {
    id: "stack:9",
    name: "Raise the Alarm",
    kind: "spell",
    source: null,
    targets: [],
    seat: 1,
    card: "card:9",
  };

  it("Raise the Alarm: two Soldiers out of the spell, a beat apart; ×2, ×3, ×4 as they land", () => {
    const view = render(draw([plains, s1, s2], { stack: [alarm] }));
    calls.length = 0;
    view.rerender(draw([plains, s1, s2, s3, s4]));
    const spell = ghostsOf(view.container, alarm.id)[0]!;
    const spellRun = calls.find((c) => c.element === spell)!;
    const from = centre(String(spellRun.frames[0]!.transform), spell.style.transformOrigin);
    const made = [s3, s4].map((s) => ghostsOf(view.container, s.id)[0]!);
    made.forEach((ghost, i) => {
      expect(ghost.dataset.token).toBe("true");
      const run = runOf(ghost)!;
      expect(Number(run.options.delay)).toBe(TOKEN_AFTER_MS + i * TOKEN_BEAT_MS);
      expect(Number(run.options.duration)).toBe(TOKEN_MS);
      expect(run.frames[0]!.opacity).toBe(0); // unseen until its spark
      // It grows out of the spell's place on the stack...
      const at = centre(String(run.frames[0]!.transform), ghost.style.transformOrigin);
      expect(Math.abs(at.x - from.x)).toBeLessThan(2);
      expect(Math.abs(at.y - from.y)).toBeLessThan(2);
      // ...and lands on the pile.
      expect(String(run.frames.at(-1)!.transform)).toBe(
        slotOf(view.container, s1.id).style.transform,
      );
    });
    // A spark on the spell for each.
    const sparks = [...view.container.querySelectorAll<HTMLElement>("[data-spark]")];
    expect(sparks.map((s) => s.dataset.spark)).toEqual([s3.id, s4.id]);
    const land = made.map((g) => end(runOf(g)!));
    expect(land[1]! - land[0]!).toBe(TOKEN_BEAT_MS);
    expect(badgeAt(view.container, s1.id, land[0]! - 1)).toEqual(["×2"]);
    expect(badgeAt(view.container, s1.id, land[0]!)).toEqual(["×3"]);
    expect(badgeAt(view.container, s1.id, land[1]! - 1)).toEqual(["×3"]);
    expect(badgeAt(view.container, s1.id, land[1]!)).toEqual(["×4"]);
  });

  it("Krenko: his Goblins come out of Krenko himself -- the first to its own place, then two more onto it", () => {
    const krenko = card("card:40", 1, "Krenko, Mob Boss");
    const ability = (n: number): StackView => ({
      id: `stack:${n}`,
      name: "Krenko, Mob Boss",
      kind: "ability",
      source: krenko.id,
      targets: [],
      seat: 1,
    });
    const g1 = token("card:41", "Goblin");
    const g2 = token("card:42", "Goblin");
    const g3 = token("card:43", "Goblin");
    const view = render(draw([plains, krenko], { stack: [ability(1)] }));
    calls.length = 0;
    view.rerender(draw([plains, krenko, g1]));
    // Where Krenko is now (his line re-centres for the Goblin).
    const at = slotOf(view.container, krenko.id);
    const krenkoAt = centre(at.style.transform, at.style.transformOrigin);
    // The first has no pile yet: its own card grows out of Krenko and glides home.
    const own = slotOf(view.container, g1.id);
    const first = runOf(own)!;
    expect(Number(first.options.delay)).toBe(TOKEN_AFTER_MS);
    expect(first.frames[0]!.opacity).toBe(0);
    const start = centre(String(first.frames[0]!.transform), own.style.transformOrigin);
    expect(Math.abs(start.x - krenkoAt.x)).toBeLessThan(2);
    expect(Math.abs(start.y - krenkoAt.y)).toBeLessThan(2);
    expect(String(first.frames.at(-1)!.transform)).toBe(own.style.transform);
    view.rerender(draw([plains, krenko, g1], { stack: [ability(2)] }));
    calls.length = 0;
    view.rerender(draw([plains, krenko, g1, g2, g3]));
    const made = [g2, g3].map((g) => runOf(ghostsOf(view.container, g.id)[0]!)!);
    expect(made.map((r) => Number(r.options.delay))).toEqual([
      TOKEN_AFTER_MS,
      TOKEN_AFTER_MS + TOKEN_BEAT_ABILITY_MS,
    ]);
    const land = made.map(end);
    expect(badgeAt(view.container, g1.id, land[0]! - 1)).toEqual([]);
    expect(badgeAt(view.container, g1.id, land[0]!)).toEqual(["×2"]);
    expect(badgeAt(view.container, g1.id, land[1]!)).toEqual(["×3"]);
  });
});

describe("F-0073-C · one card of a pile destroyed or exiled peels off it", () => {
  const f1 = card("card:1", 1, "Forest");
  const f2 = card("card:2", 1, "Forest");
  const f3 = card("card:3", 1, "Forest");
  const rain: StackView = {
    id: "stack:50",
    name: "Stone Rain",
    kind: "spell",
    source: null,
    targets: [{ object: f2.id }],
    seat: 2,
    card: "card:50",
  };

  it("Stone Rain on the middle Forest of three: it lifts off the top, then shatters to your graveyard; ×3 → ×2", () => {
    const view = render(draw([f1, f2, f3], { stack: [rain] }));
    const pile = slotOf(view.container, f1.id).style.transform;
    calls.length = 0;
    view.rerender(draw([f1, f3], { departures: new Map([[f2.id, "viewer:graveyard"]]) }));
    const [ghost] = ghostsOf(view.container, f2.id);
    expect(ghost!.dataset.fate).toBe("defeated");
    expect(ghost!.dataset.peel).toBe("true");
    expect(ghost!.style.opacity).toBe("0"); // the pile draws it until it lifts
    const run = runOf(ghost!)!;
    expect(run.options.fill).toBe("forwards");
    expect(String(run.frames[0]!.transform)).toBe(pile);
    // Off the top: up and to the right, then the shatter's shake from there.
    const lifted = run.frames.find(
      (f) => Math.abs(Number(f.offset) - PEEL_MS / Number(run.options.duration)) < 1e-9,
    )!;
    const a = centre(pile, ghost!.style.transformOrigin);
    const b = centre(String(lifted.transform), ghost!.style.transformOrigin);
    expect(b.x).toBeGreaterThan(a.x + 10);
    expect(b.y).toBeLessThan(a.y - 5);
    expect(view.container.querySelector(".bf-fate-cracks")).toBeTruthy();
    expect(badgeAt(view.container, f1.id, 0)).toEqual(["×2"]);
  });

  it("Path to Exile on one Soldier of three: it peels off and is Banished", () => {
    const s = [31, 32, 33].map((n) => token(`card:${n}`, "Soldier"));
    const view = render(draw(s));
    view.rerender(draw([s[0]!, s[1]!], { departures: new Map([[s[2]!.id, "viewer:exile"]]) }));
    const [ghost] = ghostsOf(view.container, s[2]!.id);
    expect(ghost!.dataset.fate).toBe("exiled");
    expect(ghost!.dataset.peel).toBe("true");
    expect(ghost!.querySelector(".bf-motes")).toBeTruthy();
  });

  it("the pile's own (oldest) Forest destroyed: it peels off, the next takes over in place", () => {
    const view = render(draw([f1, f2, f3]));
    const pile = slotOf(view.container, f1.id).style.transform;
    calls.length = 0;
    view.rerender(draw([f2, f3]));
    expect(ghostsOf(view.container, f1.id)[0]!.dataset.peel).toBe("true");
    const heir = slotOf(view.container, f2.id);
    expect(heir.style.transform).toBe(pile);
    const glide = runOf(heir);
    if (glide) expect(String(glide.frames[0]!.transform)).toBe(pile); // no jump
    expect(badgeAt(view.container, f2.id, 0)).toEqual(["×2"]);
  });
});

describe("F-0073-D · two tokens of a pile die in combat: they peel off together and shatter together", () => {
  it("four blocked Goblins, two die: the pile fights as one, then both peel off it at its fight's end", () => {
    const goblins = [1, 2, 3, 4].map((n) =>
      token(`card:${60 + n}`, "Goblin", { attacking: true, tapped: true }),
    );
    const bears = [1, 2, 3, 4].map((n) =>
      card(`card:${70 + n}`, 2, "Grizzly Bears", { blocking: true, power: 2, toughness: 2 }),
    );
    const combat = {
      attackers: goblins.map((g) => ({ id: g.id, target: { player: 2 } })),
      blocks: goblins.map((g, i) => ({ blocker: bears[i]!.id, attacker: g.id })),
    };
    const view = render(draw([...goblins, ...bears], { combat }));
    const lead = goblins[0]!.id;
    expect(
      view.container.querySelector(`[data-object-id="${lead}"]`)!.getAttribute("data-pile"),
    ).toBe("4");
    calls.length = 0;
    const dead = [goblins[0]!, goblins[2]!];
    const alive = goblins.filter((g) => !dead.includes(g));
    const wave: CombatWave = {
      key: "w1",
      combat: "regular",
      hits: goblins.flatMap((g, i) => [
        { source: bears[i]!.id, target: { object: g.id }, amount: 2 },
        { source: g.id, target: { object: bears[i]!.id }, amount: 1 },
      ]),
      fights: goblins.map((g, i) => ({
        attacker: g.id,
        defender: { player: 2 },
        blockers: [bears[i]!.id],
      })),
    };
    view.rerender(
      draw(
        [...alive, ...bears.map((b, i) => (i === 0 || i === 2 ? { ...b, blocking: false } : b))],
        {
          combat: {
            attackers: alive.map((g) => ({ id: g.id, target: { player: 2 } })),
            blocks: [1, 3].map((i) => ({ blocker: bears[i]!.id, attacker: goblins[i]!.id })),
          },
          damage: wave,
          departures: new Map(dead.map((g) => [g.id, "viewer:graveyard"])),
        },
      ),
    );
    const ghosts = dead.map((g) => ghostsOf(view.container, g.id)[0]!);
    const runs = ghosts.map((g) => runOf(g)!);
    for (const g of ghosts) {
      expect(g.dataset.fate).toBe("defeated");
      expect(g.dataset.peel).toBe("true");
      expect(g.style.opacity).toBe("0"); // the pile fights as itself first
      // Above the fights' dimming and the fighters (A-13's 4600), not under its neighbours.
      expect(Number(g.style.zIndex)).toBeGreaterThan(4600);
    }
    // Together: the same moment, the same length, fanning off to two places.
    expect(Number(runs[0]!.options.delay)).toBeGreaterThan(500);
    expect(runs[0]!.options.delay).toBe(runs[1]!.options.delay);
    expect(runs[0]!.options.duration).toBe(runs[1]!.options.duration);
    const lift = (r: Call) =>
      String(
        r.frames.find(
          (f) => Math.abs(Number(f.offset) - PEEL_MS / Number(r.options.duration)) < 1e-9,
        )!.transform,
      );
    expect(lift(runs[0]!)).not.toBe(lift(runs[1]!));
    // The pile -- drawn now by the next Goblin -- fights; the dead don't fight apart from it.
    const heir = slotOf(view.container, alive[0]!.id).querySelector(":scope > .bf-card")!;
    expect(calls.some((c) => c.element === heir && c.options.id === "fight")).toBe(true);
    for (const g of ghosts)
      expect(g.querySelector(":scope > .bf-card")!.getAnimations?.()).toEqual([]);
    expect(
      calls.filter((c) => c.options.id === "fight" && ghosts.some((g) => g.contains(c.element))),
    ).toEqual([]);
    // Not a board wipe: no flash across the table for a fight's dead.
    expect(view.container.querySelector(".bf-sweep")).toBeNull();
    // ×4 until they lift off, then ×2.
    const at = Number(runs[0]!.options.delay);
    expect(badgeAt(view.container, alive[0]!.id, at - 1)).toEqual(["×4"]);
    expect(badgeAt(view.container, alive[0]!.id, at)).toEqual(["×2"]);
  });
});

describe("F-0073-F · a click hurries it all; reduce motion: no glides, the number simply changes", () => {
  const plains = card("card:1", 1, "Plains");
  const s1 = token("card:31", "Soldier");
  const s2 = token("card:32", "Soldier");
  const s3 = token("card:33", "Soldier");
  const s4 = token("card:34", "Soldier");
  const alarm: StackView = {
    id: "stack:9",
    name: "Raise the Alarm",
    kind: "spell",
    source: null,
    targets: [],
    seat: 1,
    card: "card:9",
  };

  it("a click: the tokens, their sparks and the pile's numbers all finish in a tenth of a second", () => {
    const view = render(draw([plains, s1, s2], { stack: [alarm] }));
    calls.length = 0;
    view.rerender(draw([plains, s1, s2, s3, s4]));
    const tokens = [s3, s4].map((s) => runOf(ghostsOf(view.container, s.id)[0]!)!);
    const sparks = [...view.container.querySelectorAll("[data-spark]")].map((s) => runOf(s)!);
    const numbers = [
      ...view.container.querySelectorAll(`[data-object-id="${s1.id}"] > .bf-pile`),
    ].map((b) => runOf(b)!);
    expect(numbers.length).toBeGreaterThanOrEqual(2);
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    for (const run of [...tokens, ...sparks, ...numbers]) expect(run.rate.length).toBe(1);
  });

  it("reduce motion: no token flights, no sparks, no peeling, no held numbers -- ×4 at once", () => {
    still = true;
    const view = render(draw([plains, s1, s2], { stack: [alarm] }));
    calls.length = 0;
    view.rerender(draw([plains, s1, s2, s3, s4]));
    expect(view.container.querySelectorAll("[data-ghost-of]")).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-spark]")).toHaveLength(0);
    expect(view.container.querySelectorAll(".bf-pile-was")).toHaveLength(0);
    expect(badgeAt(view.container, s1.id, 0)).toEqual(["×4"]);
    view.rerender(draw([plains, s1, s2, s3]));
    expect(view.container.querySelectorAll("[data-ghost-of]")).toHaveLength(0);
    expect(badgeAt(view.container, s1.id, 0)).toEqual(["×3"]);
  });
});
