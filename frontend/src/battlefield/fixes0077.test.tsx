// @vitest-environment jsdom

// Spec 0077 -- damage, life and poison on a player's life shield (F-0077-A..F).
// The real Board, handed one board and then the next as the game screen hands
// them (the stack, then the round's damage wave and life changes), with a
// plate in the rail reading the life the way the game screen's plate does
// (useShownPlate). The board's clocks are the test's: each animation records
// its call, and a test moves the life clock's time.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, POISON_DX, POISON_DY, type BoardCard, type StackView } from "./Board";
import { planFights, type CombatWave, type Stand } from "./fights";
import { geometry, type Box } from "./layout";
import {
  endLifeSteps,
  lifeSteps,
  LIFE_CHANGE_MAX_MS,
  LIFE_POINT_MS,
  shownLife,
  shownPoison,
  useShownPlate,
} from "./lifeTicks";
import { PoisonBadge, poisonOf } from "./PoisonBadge";
import { StatusTray } from "./StatusTray";
import { EMPTY_MATCH, reduceMatch, type LifeChange, type Snapshot } from "../match";

const RESOLVE_MS = 380;
const size = { width: 1920, height: 1080 };
type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  rate: number[];
  animation: Animation & { currentTime: number };
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
    const call = { element: this, frames, options, rate: [] as number[] } as unknown as Call;
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
    } as unknown as Call["animation"];
    call.animation = animation;
    calls.push(call);
    return animation;
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
    this: Element,
  ) {
    return this.classList.contains("bf-board")
      ? calls.filter((c) => this.contains(c.element)).map((c) => c.animation)
      : [];
  };
});
afterEach(() => {
  endLifeSteps();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A plate as the game screen's reads it: its life, its poison, the blows landed. */
function Plate({ seat, life, poison = 0 }: { seat: number; life: number; poison?: number }) {
  const shown = useShownPlate(seat, life, poison);
  return (
    <span
      data-plate={seat}
      data-life={shown.life}
      data-hits={shown.hits}
      data-poison={shown.poison}
      data-pulses={shown.poisonHits}
    />
  );
}

const BOLT: StackView = {
  id: "stack:1",
  name: "Lightning Bolt",
  kind: "spell",
  source: null,
  card: "card:41",
  seat: 1,
  targets: [{ player: 2 }],
};
const SIGN: StackView = {
  ...BOLT,
  id: "stack:2",
  name: "Sign in Blood",
  card: "card:12",
  targets: [{ player: 1 }],
};

function draw(opts: {
  battlefield?: BoardCard[];
  stack?: StackView[];
  damage?: Parameters<typeof Board>[0]["damage"];
  life?: { key: string; changes: LifeChange[] } | null;
  lives?: Record<number, number>;
  poison?: Record<number, number>;
}) {
  const lives = opts.lives ?? { 1: 20, 2: 20 };
  return (
    <Board
      battlefield={opts.battlefield ?? []}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={new Map()}
      departures={new Map()}
      returns={new Map()}
      graves={new Map()}
      tileMoves={[]}
      countered={new Set()}
      stack={opts.stack ?? []}
      combat={null}
      damage={opts.damage ?? null}
      life={opts.life ?? null}
      rail={
        <>
          <Plate seat={1} life={lives[1]!} poison={opts.poison?.[1] ?? 0} />
          <Plate seat={2} life={lives[2]!} poison={opts.poison?.[2] ?? 0} />
        </>
      }
    />
  );
}

const lifeClock = () => calls.filter((c) => c.options.id === "life-clock").at(-1);
const plate = (c: HTMLElement, seat: number) =>
  c.querySelector<HTMLElement>(`[data-plate="${seat}"]`)!.dataset;
const marks = (c: HTMLElement, kind: string) => [
  ...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
];
const markCall = (el: Element) => calls.filter((c) => c.element === el).at(-1)!;

/** Bob's life shield's centre on the board (the opponent's plate, motion.ts). */
function shieldOfBob() {
  const h = size.height;
  const g = geometry(size);
  return { x: g.rail.x + ((7.4 + 216 - 1 - 10 - 23) / 900) * h, y: ((26 + 40) / 900) * h };
}

/** Spec 0077: nothing that says "life" for [of] -- no gain float, glow, crack or hurt glow. */
function noLifeLook(c: HTMLElement, of: string) {
  for (const kind of ["gain", "glow", "crack", "number", "plate"])
    expect(
      marks(c, kind).filter((m) => m.dataset.of === of),
      kind,
    ).toHaveLength(0);
  // No bare "+N" anywhere: a gain-style float.
  for (const m of c.querySelectorAll<HTMLElement>("[data-fight]"))
    expect(/^\+\d+$/.test(m.textContent ?? ""), m.className).toBe(false);
}

/** Move the life clock to [t] and let the plates read it. */
function at(view: ReturnType<typeof render>, t: number, el: Parameters<typeof draw>[0]) {
  lifeClock()!.animation.currentTime = t;
  view.rerender(draw(el));
}

describe("Lightning Bolt to Bob's face (F-0077-A)", () => {
  const after = {
    damage: { key: "damage:5", hits: [{ source: "card:41", target: { player: 2 }, amount: 3 }] },
    life: {
      key: "life:5",
      changes: [{ player: 2, kind: "damage" as const, amount: 3, source: "card:41" }],
    },
    lives: { 1: 20, 2: 17 },
  };

  it("holds the number until the beam lands, then shake, crack, a red −3, and 20, 19, 18, 17", () => {
    const view = render(draw({ stack: [BOLT] }));
    view.rerender(draw(after));
    const c = view.container;
    // The board says 17; the plate still reads 20 -- the hit has not landed.
    expect(plate(c, 2).life).toBe("20");
    expect(plate(c, 2).hits).toBe("0");
    // It lands when the resolving spell's spark reaches the shield.
    const [crack] = marks(c, "crack");
    expect(crack!.dataset.of).toBe("player:2");
    expect(Number(markCall(crack!).options.delay)).toBe(RESOLVE_MS);
    const number = marks(c, "number").find((m) => m.dataset.of === "player:2")!;
    expect(number.textContent).toBe("−3");
    expect(Number(markCall(number).options.delay)).toBe(RESOLVE_MS);
    // No card-wide burst on the shield any more: the Impact look instead.
    expect(c.querySelector('[data-impact="player:2"]')).toBeNull();
    at(view, RESOLVE_MS - 1, after);
    expect(plate(c, 2).life).toBe("20");
    at(view, RESOLVE_MS, after);
    expect(plate(c, 2).life).toBe("19");
    expect(plate(c, 2).hits).toBe("1"); // the shake: once, at the first point
    at(view, RESOLVE_MS + LIFE_POINT_MS, after);
    expect(plate(c, 2).life).toBe("18");
    at(view, RESOLVE_MS + 2 * LIFE_POINT_MS, after);
    expect(plate(c, 2).life).toBe("17");
    expect(plate(c, 2).hits).toBe("1");
    // Alice's plate is untouched.
    expect(plate(c, 1).life).toBe("20");
  });
});

describe("Sign in Blood (F-0077-B)", () => {
  it("a loss looks exactly as damage: crack, red −2, point by point", () => {
    const after = {
      life: {
        key: "life:6",
        changes: [{ player: 1, kind: "loss" as const, amount: 2, source: "card:12" }],
      },
      lives: { 1: 18, 2: 20 },
    };
    const view = render(draw({ stack: [SIGN] }));
    view.rerender(draw(after));
    const c = view.container;
    expect(plate(c, 1).life).toBe("20");
    expect(marks(c, "crack").map((m) => m.dataset.of)).toEqual(["player:1"]);
    expect(marks(c, "number").map((m) => m.textContent)).toEqual(["−2"]);
    expect(marks(c, "gain")).toHaveLength(0);
    at(view, RESOLVE_MS, after);
    expect(plate(c, 1).life).toBe("19");
    expect(plate(c, 1).hits).toBe("1");
    at(view, RESOLVE_MS + LIFE_POINT_MS, after);
    expect(plate(c, 1).life).toBe("18");
  });
});

describe("Soul Warden x3 (F-0077-C)", () => {
  it("three green ticks, one after another, with no crack and no shake", () => {
    const after = {
      life: {
        key: "life:7",
        changes: [1, 2, 3].map(() => ({
          player: 1,
          kind: "gain" as const,
          amount: 1,
          source: "card:5",
        })),
      },
      lives: { 1: 23, 2: 20 },
    };
    const view = render(draw({}));
    view.rerender(draw(after));
    const c = view.container;
    const gains = marks(c, "gain");
    expect(gains.map((m) => m.textContent)).toEqual(["+1", "+1", "+1"]);
    expect(marks(c, "glow")).toHaveLength(3);
    expect(marks(c, "crack")).toHaveLength(0);
    const times = gains.map((m) => Number(markCall(m).options.delay));
    // No beam: the first at once; each later one its own beat after.
    expect(times[0]).toBe(0);
    expect(times[1]!).toBeGreaterThan(times[0]!);
    expect(times[2]!).toBeGreaterThan(times[1]!);
    expect(plate(c, 1).life).toBe("21");
    at(view, times[1]! - 1, after);
    expect(plate(c, 1).life).toBe("21");
    at(view, times[1]!, after);
    expect(plate(c, 1).life).toBe("22");
    at(view, times[2]!, after);
    expect(plate(c, 1).life).toBe("23");
    expect(plate(c, 1).hits).toBe("0");
  });
});

describe("Gray Merchant drains 5 (F-0077-D)", () => {
  it("both shields step point by point, together", () => {
    const after = {
      life: {
        key: "life:8",
        changes: [
          { player: 2, kind: "loss" as const, amount: 5, source: "card:9" },
          { player: 1, kind: "gain" as const, amount: 5, source: "card:9" },
        ],
      },
      lives: { 1: 25, 2: 15 },
    };
    const view = render(draw({}));
    view.rerender(draw(after));
    const c = view.container;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      at(view, i * LIFE_POINT_MS, after);
      seen.push(`${plate(c, 2).life}/${plate(c, 1).life}`);
    }
    expect(seen).toEqual(["19/21", "18/22", "17/23", "16/24", "15/25"]);
    expect(marks(c, "number").map((m) => `${m.dataset.of} ${m.textContent}`)).toEqual([
      "player:2 −5",
    ]);
    expect(marks(c, "gain").map((m) => `${m.dataset.of} ${m.textContent}`)).toEqual([
      "player:1 +5",
    ]);
  });

  it("a big change keeps its pace readable and its length short", () => {
    const after = {
      life: { key: "life:9", changes: [{ player: 2, kind: "loss" as const, amount: 20 }] },
      lives: { 1: 20, 2: 0 },
    };
    const view = render(draw({}));
    view.rerender(draw(after));
    at(view, LIFE_CHANGE_MAX_MS, after);
    expect(plate(view.container, 2).life).toBe("0");
    at(view, LIFE_CHANGE_MAX_MS / 2 - 1, after);
    expect(Number(plate(view.container, 2).life)).toBeGreaterThan(5);
  });
});

/** Alice's Glistener Elf (infect, 3 power) hits Bob. */
function infectPlan() {
  const box: Box = { x: 300, y: 600, w: 100, h: 140, scale: 1, rotation: 0, z: 1 };
  const elf: Stand = { box, item: "card:30", name: "Glistener Elf", seat: 1, count: 1 };
  const wave: CombatWave = {
    key: "damage:12",
    combat: "regular",
    hits: [{ source: "card:30", target: { player: 2 }, amount: 3, infect: true }],
    fights: [{ attacker: "card:30", defender: { player: 2 }, blockers: [] }],
  };
  return planFights({
    wave,
    at: (id) => (id === "card:30" ? elf : null),
    life: () => ({ x: 1750, y: 120 }),
    lifeR: 27,
    viewerSeat: 1,
    opponentName: "Bob",
  })!;
}

describe("infect is poison, never life (F-0077-E)", () => {
  it("an infect hit counts on the badge at its blow and never off the life", () => {
    const plan = infectPlan();
    expect(plan.fights[0]!.strikes[0]!.poison).toBe(true);
    const changes: LifeChange[] = [
      { player: 2, kind: "poison", amount: 3, source: "card:30", combat: true },
    ];
    const steps = lifeSteps(plan, 0, changes);
    const impact = plan.fights[0]!.impact;
    // The board says life 20, poison 3: the plate never reads 23, 17 or anything but 20.
    for (const t of [0, impact - 1, impact, plan.total])
      expect(shownLife(20, steps, 2, t)).toBe(20);
    expect(shownPoison(3, steps, 2, impact - 1)).toBe(0);
    expect(shownPoison(3, steps, 2, impact)).toBe(3);
    // The told poison and the hit are one thing, not counted twice.
    expect(steps.filter((s) => s.poison).map((s) => s.amount)).toEqual([3]);
  });

  it("toxic's poison lands at its attacker's blow beside its damage", () => {
    const plan = infectPlan();
    const steps = lifeSteps(plan, 0, [
      { player: 2, kind: "poison", amount: 3, source: "card:30", combat: true },
      { player: 2, kind: "poison", amount: 1, source: "card:30", combat: true },
    ]);
    expect(steps.filter((s) => s.poison).map((s) => s.amount)).toEqual([3, 1]);
  });

  it("a poison change off combat counts up on the badge, with the poison mark at the badge", () => {
    const after = {
      life: { key: "life:13", changes: [{ player: 2, kind: "poison" as const, amount: 2 }] },
      poison: { 2: 9 },
    };
    const view = render(draw({ poison: { 2: 7 } }));
    view.rerender(draw(after));
    const c = view.container;
    // No beam: the first counter lands at once, the next a point later.
    expect(plate(c, 2).poison).toBe("8");
    expect(plate(c, 2).pulses).toBe("1");
    at(view, LIFE_POINT_MS - 1, after);
    expect(plate(c, 2).poison).toBe("8");
    at(view, LIFE_POINT_MS, after);
    expect(plate(c, 2).poison).toBe("9");
    expect(plate(c, 2).pulses).toBe("1");
    expect(plate(c, 2).life).toBe("20");
    expect(plate(c, 2).hits).toBe("0");
  });

  it("poison never looks like life: no gain float, no shake, crack or flash; its own mark at the badge", () => {
    const after = {
      life: { key: "life:14", changes: [{ player: 2, kind: "poison" as const, amount: 1 }] },
      poison: { 2: 1 },
    };
    const view = render(draw({}));
    view.rerender(draw(after));
    const c = view.container;
    noLifeLook(c, "player:2");
    const [mark] = marks(c, "poison");
    // The drop and the number, no "+": a different picture...
    expect(mark!.querySelector('[data-drop="poison"]')).not.toBeNull();
    expect(mark!.textContent).toBe("1");
    // ... in a different place: the badge, not the gain's spot off the shield.
    const left = parseFloat(mark!.style.left);
    const top = parseFloat(mark!.style.top);
    const unit = size.height / 900;
    const gainSpot = shieldOfBob();
    expect(Math.abs(left - (gainSpot.x + POISON_DX * unit))).toBeLessThan(1);
    expect(Math.abs(top - (gainSpot.y + POISON_DY * unit))).toBeLessThan(1);
    expect(plate(c, 2).hits).toBe("0");
  });

  it("an infect attacker strikes the badge: no hurt on the shield or the screen, no gain float", () => {
    const elf: BoardCard = {
      id: "card:30",
      seat: 1,
      name: "Glistener Elf",
      kind: "creature",
      types: "Creature — Phyrexian Elf Warrior",
      tapped: true,
      attacking: true,
      blocking: false,
      sick: false,
      faceDown: false,
      known: true,
      power: 1,
      toughness: 1,
      keywords: ["Infect"],
      counters: [],
      attachedTo: null,
      enteredAt: 1,
      art: null,
    };
    const after = {
      battlefield: [elf],
      damage: {
        key: "damage:30",
        combat: "regular" as const,
        hits: [{ source: "card:30", target: { player: 2 }, amount: 1, infect: true }],
        fights: [{ attacker: "card:30", defender: { player: 2 }, blockers: [] }],
      },
      life: {
        key: "life:30",
        changes: [
          { player: 2, kind: "poison" as const, amount: 1, source: "card:30", combat: true },
        ],
      },
      poison: { 2: 1 },
    };
    const view = render(draw({ battlefield: [elf] }));
    view.rerender(draw(after));
    const c = view.container;
    noLifeLook(c, "player:2");
    expect(marks(c, "edge")).toHaveLength(0);
    // The slash crosses the badge, in poison's colours.
    const slash = marks(c, "slash").find((m) => m.dataset.of === "player:2")!;
    expect(slash.classList.contains("bf-fight-poisoned")).toBe(true);
    const unit = size.height / 900;
    const badge = {
      x: shieldOfBob().x + POISON_DX * unit,
      y: shieldOfBob().y + POISON_DY * unit,
    };
    const mid = parseFloat(slash.style.left) + parseFloat(slash.style.width) / 2;
    expect(Math.abs(mid - badge.x)).toBeLessThan(2);
    expect(Math.abs(parseFloat(slash.style.top) - badge.y)).toBeLessThan(2);
    const [mark] = marks(c, "poison");
    expect(mark!.querySelector('[data-drop="poison"]')).not.toBeNull();
    expect(plate(c, 2).hits).toBe("0");
  });

  it("the first counter grows the badge in at its place; later ones pulse it", () => {
    const view = render(<PoisonBadge count={0} pulses={0} />);
    view.rerender(<PoisonBadge count={1} pulses={1} />);
    const badge = view.container.querySelector("[data-poison]")!;
    const first = calls.filter((c) => c.element === badge);
    expect(first).toHaveLength(1);
    expect(first[0]!.frames[0]!.transform).toBe("scale(0)");
    view.rerender(<PoisonBadge count={2} pulses={2} />);
    const later = calls.filter((c) => c.element === badge);
    expect(later).toHaveLength(2);
    expect(later[1]!.frames[0]!.transform).toBe("scale(1.25)");
  });

  it("the badge: count and ten notches, the ring full at 10; the tray says nothing of poison", () => {
    const three = render(<PoisonBadge count={3} pulses={0} />).container;
    expect(three.querySelector("[data-poison]")!.textContent).toBe("3");
    expect(three.querySelectorAll('[data-notch="lit"]')).toHaveLength(3);
    expect(three.querySelectorAll('[data-notch="unlit"]')).toHaveLength(7);
    expect(three.querySelector(".gs-poison-full")).toBeNull();
    const ten = render(<PoisonBadge count={10} pulses={0} />).container;
    expect(ten.querySelectorAll('[data-notch="lit"]')).toHaveLength(10);
    expect(ten.querySelector(".gs-poison-full")).not.toBeNull();
    expect(render(<PoisonBadge count={0} pulses={0} />).container.innerHTML).toBe("");
    const player = {
      seat: 2,
      name: "Bob",
      life: 20,
      manaPool: {},
      counters: [{ name: "POISON", count: 3 }],
      designations: [],
      ringTempted: 0,
      command: [],
    } as unknown as Snapshot["players"][number];
    expect(poisonOf(player)).toBe(3);
    const tray = render(<StatusTray player={player} side="opponent" />).container;
    expect(tray.textContent).not.toMatch(/poison/i);
  });

  it("the badge touches the shield and keeps clear of its number (game.css's numbers)", () => {
    // In the plate's padding box (game.css): the shield is 46 x 54 at (158, 11),
    // its number in the top 46 (8 px padding below), at most 24 px tall and,
    // three characters, about 28 px wide; the badge's centre is the shield's
    // plus (POISON_DX, POISON_DY), its ring 19.1 round.
    const shield = { x: 158, y: 11, w: 46, h: 54 };
    const centre = { x: shield.x + 23, y: shield.y + 27 };
    const badge = { x: centre.x + POISON_DX, y: centre.y + POISON_DY, r: 17.5 + 1.6 };
    expect(badge.x - 20).toBe(130); // game.css .gs-poison left
    expect(badge.y - 20).toBe(40); // and top
    const n = {
      x0: centre.x - 14,
      x1: centre.x + 14,
      y0: shield.y + 23 - 12,
      y1: shield.y + 23 + 12,
    };
    const dx = Math.max(n.x0 - badge.x, 0, badge.x - n.x1);
    const dy = Math.max(n.y0 - badge.y, 0, badge.y - n.y1);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(badge.r + 2);
    // It touches the shield: its left edge (x 158, down to y 51) is inside the ring.
    expect(Math.hypot(shield.x - badge.x, shield.y + 40 - badge.y)).toBeLessThan(badge.r);
  });
});

describe("hurry, reduce motion and what is sent (F-0077-F)", () => {
  const after = {
    life: {
      key: "life:20",
      changes: [{ player: 2, kind: "damage" as const, amount: 3, source: "card:41" }],
    },
    lives: { 1: 20, 2: 17 },
  };

  it("a click hurries the life clock to its end with everything else", () => {
    const view = render(draw({ stack: [BOLT] }));
    view.rerender(draw(after));
    const clock = lifeClock()!;
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(clock.rate.length).toBeGreaterThan(0);
    // The clock ends: the plate is the board's number.
    act(() => {
      (clock.animation.onfinish as (() => void) | null)?.call(clock.animation);
    });
    view.rerender(draw(after));
    expect(plate(view.container, 2).life).toBe("17");
  });

  it("with reduce motion: no clock, no crack, float or glow -- the numbers change", () => {
    still = true;
    const view = render(draw({ stack: [BOLT] }));
    view.rerender(draw(after));
    expect(lifeClock()).toBeUndefined();
    expect(marks(view.container, "crack")).toHaveLength(0);
    expect(marks(view.container, "number")).toHaveLength(0);
    expect(plate(view.container, 2).life).toBe("17");
  });

  it("combat's changes are left to the fights; a round is played once", () => {
    const view = render(draw({}));
    const combat = {
      life: {
        key: "life:21",
        changes: [{ player: 2, kind: "damage" as const, amount: 3, combat: true }],
      },
      lives: { 1: 20, 2: 17 },
    };
    view.rerender(draw(combat));
    expect(lifeClock()).toBeUndefined();
    view.rerender(draw(after));
    const n = calls.filter((c) => c.options.id === "life-clock").length;
    view.rerender(draw(after));
    expect(calls.filter((c) => c.options.id === "life-clock").length).toBe(n);
  });

  it("the page reads the round's changes, and keeps nothing malformed", () => {
    const state = reduceMatch(EMPTY_MATCH, {
      type: "MATCH_SNAPSHOT",
      state: {
        stateRevision: 4,
        seat: 1,
        players: [{ seat: 1, name: "Alice", life: 20 }],
        battlefield: [],
        damage: {
          key: "damage:4",
          hits: [{ source: "card:30", target: { player: 2 }, amount: 3, infect: true }],
        },
        life: {
          key: "life:4",
          changes: [
            { player: 2, kind: "poison", amount: 3, source: "card:30", combat: true },
            { player: 1, kind: "gain", amount: 1 },
            { player: 1, kind: "heal", amount: 1 },
            { player: 1, kind: "loss", amount: 0 },
          ],
        },
      },
    });
    expect(state.board?.damage?.hits[0]?.infect).toBe(true);
    expect(state.board?.life).toEqual({
      key: "life:4",
      changes: [
        { player: 2, kind: "poison", amount: 3, source: "card:30", combat: true },
        { player: 1, kind: "gain", amount: 1 },
      ],
    });
  });
});
