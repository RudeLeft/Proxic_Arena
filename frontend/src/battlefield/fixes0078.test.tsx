// @vitest-environment jsdom

// Spec 0078 -- creatures getting bigger or smaller, damage left, loyalty
// (F-0078-A..G). The real Board, handed one board and then the next as the
// game screen hands them, with the round's size changes worked out from the
// two boards as the game screen works them out (sizeChanges). The board's
// clocks are the test's: each animation records its call, and a test moves
// the size clock's time.

import { cloneElement } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type StackView } from "./Board";
import {
  BADGE_LEAD_MS,
  countSpan,
  endSizeSteps,
  redrawSizes,
  SHRINK_BEAT_MS,
  sizeChanges,
  TICK_LEAD_MS,
  type SizeChanges,
} from "./sizeTicks";
import { boardFromSnapshot } from "./fromSnapshot";
import type { Snapshot, SnapshotCard } from "../match";

const RESOLVE_MS = 380;
const GREEN = "#7be08a";
const RED = "#ff6b57";
const GREY = "#c9d2cc";
const GOLD = "#f2c95c";
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
  endSizeSteps();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let next = 1;
function permanent(over: Partial<BoardCard>): BoardCard {
  return {
    id: `card:${next++}`,
    seat: 1,
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
    basePower: 2,
    baseToughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    art: null,
    ...over,
  };
}

function draw(battlefield: BoardCard[], stack: StackView[] = [], sizes: SizeChanges | null = null) {
  return (
    <Board
      battlefield={battlefield}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(a) => a}
      arrivals={new Map()}
      departures={new Map()}
      returns={new Map()}
      graves={new Map()}
      tileMoves={[]}
      countered={new Set()}
      stack={stack}
      combat={null}
      damage={null}
      sizeChanges={sizes}
    />
  );
}

let round = 0;
/** The next board, with the round's changes as the game screen works them out. */
function then(
  before: BoardCard[],
  after: BoardCard[],
  opts: {
    wornOff?: boolean;
    struck?: string[];
    last?: [string, { power: number; toughness: number }][];
  } = {},
): SizeChanges {
  return {
    key: `round:${++round}`,
    changes: sizeChanges(before, after, {
      wornOff: opts.wornOff ?? false,
      struck: new Set(opts.struck ?? []),
    }),
    last: new Map(opts.last ?? []),
  };
}

const sizeClock = () => calls.filter((c) => c.options.id === "size-clock").at(-1);
const cardOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!;
const ptOf = (c: HTMLElement, id: string) => cardOf(c, id).querySelector<HTMLElement>(".bf-pt")!;
const floats = (c: HTMLElement, id?: string) =>
  [...c.querySelectorAll<HTMLElement>(".bf-size-float")].filter(
    (f) => id === undefined || f.dataset.sizeFloat === id,
  );
const callOf = (el: Element) => calls.filter((c) => c.element === el);
const shakes = (el: Element) => callOf(el).filter((c) => c.options.composite === "add");
const glows = (el: Element) => callOf(el).filter((c) => "boxShadow" in (c.frames[1] ?? {}));

/** Move the size clock to [t] and let the numbers read it. */
function at(view: ReturnType<typeof render>, t: number, el: React.ReactElement) {
  sizeClock()!.animation.currentTime = t;
  view.rerender(cloneElement(el));
  act(() => redrawSizes());
}

const GROWTH = (target: string): StackView => ({
  id: "stack:1",
  name: "Giant Growth",
  kind: "spell",
  source: null,
  card: "card:900",
  seat: 1,
  targets: [{ object: target }],
});

describe("Giant Growth, then the turn's end (F-0078-A)", () => {
  it("pops and switches 2/2 -> 5/5 at once with a green +3/+3, green at rest; back in grey", () => {
    const bears = permanent({});
    const grown = { ...bears, power: 5, toughness: 5 };
    const view = render(draw([bears], [GROWTH(bears.id)]));
    const after = then([bears], [grown]);
    const el = draw([grown], [], after);
    view.rerender(el);
    const c = view.container;
    // Held at 2/2 until the spell's beam lands.
    expect(ptOf(c, bears.id).dataset.size).toBe("2/2");
    expect(cardOf(c, bears.id).dataset.pt).toBe("5/5"); // the board's own number is the game's
    const pt = ptOf(c, bears.id);
    const pop = callOf(pt).at(-1)!;
    expect(pop.options.delay).toBe(RESOLVE_MS);
    expect(pop.frames.map((f) => f.transform)).toEqual(["scale(1)", "scale(1.3)", "scale(1)"]);
    const [float] = floats(c, bears.id);
    expect(float!.textContent).toBe("+3/+3");
    expect(float!.style.color).toBe("rgb(123, 224, 138)");
    expect(callOf(float!)[0]!.options.delay).toBe(RESOLVE_MS);
    expect(glows(cardOf(c, bears.id))).toHaveLength(1);
    expect(shakes(cardOf(c, bears.id))).toHaveLength(0);
    // Amendment 1: one switch, no count.
    const seen: string[] = [];
    for (const t of [RESOLVE_MS, RESOLVE_MS + TICK_LEAD_MS - 1, RESOLVE_MS + TICK_LEAD_MS]) {
      at(view, t, el);
      seen.push(ptOf(c, bears.id).dataset.size!);
    }
    expect(seen).toEqual(["2/2", "2/2", "5/5"]);
    expect(ptOf(c, bears.id).dataset.tint).toBe(GREEN);
    // The clock ends: at rest, green (bigger than printed), the printed size said.
    act(() => endSizeSteps());
    expect(ptOf(c, bears.id).dataset.tint).toBeUndefined();
    expect([...ptOf(c, bears.id).querySelectorAll(".g")].map((s) => s.textContent)).toEqual([
      "5",
      "5",
    ]);
    expect(ptOf(c, bears.id).title).toBe("5/5, printed 2/2");
    // The turn ends: back in grey with a grey −3/−3 and a pop, no glow, no shake.
    calls.length = 0;
    const back = then([grown], [bears], { wornOff: true });
    const el2 = draw([bears], [], back);
    view.rerender(el2);
    const [grey] = floats(c, bears.id).filter((f) => f.textContent === "−3/−3");
    expect(grey!.style.color).toBe("rgb(201, 210, 204)");
    expect(glows(cardOf(c, bears.id))).toHaveLength(0);
    expect(shakes(cardOf(c, bears.id))).toHaveLength(0);
    expect(callOf(ptOf(c, bears.id))).toHaveLength(1); // the pop
    at(view, TICK_LEAD_MS, el2);
    expect(ptOf(c, bears.id).dataset.size).toBe("2/2");
    expect(ptOf(c, bears.id).dataset.tint).toBe(GREY);
  });
});

describe("Soul Warden and Ajani's Pridemate (F-0078-B)", () => {
  it("the badge grows in, then the number pops and switches, the +1/+1 rising off the badge", () => {
    const pride = permanent({ name: "Ajani's Pridemate" });
    const more = { ...pride, power: 3, toughness: 3, counters: [{ name: "P1P1", count: 1 }] };
    const view = render(draw([pride]));
    const el = draw([more], [], then([pride], [more]));
    view.rerender(el);
    const c = view.container;
    const badge = cardOf(c, pride.id).querySelector<HTMLElement>('[data-counter="P1P1"]')!;
    const grow = callOf(badge).at(-1)!;
    expect(grow.frames[0]!.transform).toBe("scale(0.010)");
    expect(grow.options.fill).toBe("backwards"); // unseen until it grows
    expect(grow.options.delay).toBe(0);
    expect(callOf(ptOf(c, pride.id)).at(-1)!.options.delay).toBe(BADGE_LEAD_MS);
    const [float] = floats(c, pride.id);
    expect(float!.textContent).toBe("+1/+1");
    expect(float!.style.top).toBe("calc(var(--card-h) * 0.620)"); // off the badge
    expect(callOf(float!)[0]!.options.delay).toBe(BADGE_LEAD_MS);
    at(view, BADGE_LEAD_MS + TICK_LEAD_MS - 1, el);
    expect(ptOf(c, pride.id).dataset.size).toBe("2/2");
    at(view, BADGE_LEAD_MS + TICK_LEAD_MS, el);
    expect(ptOf(c, pride.id).dataset.size).toBe("3/3");
    // A second counter: its number pops (no grow-in).
    calls.length = 0;
    const two = { ...more, power: 4, toughness: 4, counters: [{ name: "P1P1", count: 2 }] };
    view.rerender(draw([two], [], then([more], [two])));
    const n = cardOf(c, pride.id).querySelector('[data-counter="P1P1"] .bf-badge-n')!;
    expect(callOf(n).at(-1)!.frames[1]!.transform).toBe("scale(1.5)");
    expect(callOf(badge).some((x) => x.frames[0]!.transform === "scale(0.010)")).toBe(false);
  });
});

describe("Grasp of Darkness (F-0078-C)", () => {
  it("on a 5/5 that lives: the small shake, a red −4/−4, straight to 1/1, red at rest", () => {
    const baloth = permanent({
      name: "Durkwood Baloth",
      power: 5,
      toughness: 5,
      basePower: 5,
      baseToughness: 5,
    });
    const small = { ...baloth, power: 1, toughness: 1 };
    const view = render(draw([baloth], [GROWTH(baloth.id)]));
    const el = draw([small], [], then([baloth], [small]));
    view.rerender(el);
    const c = view.container;
    const card = cardOf(c, baloth.id);
    expect(shakes(card)).toHaveLength(1);
    expect(shakes(card)[0]!.options.delay).toBe(RESOLVE_MS);
    expect(floats(c, baloth.id).map((f) => f.textContent)).toEqual(["−4/−4"]);
    expect(floats(c, baloth.id)[0]!.style.color).toBe("rgb(255, 107, 87)");
    at(view, RESOLVE_MS + TICK_LEAD_MS, el);
    expect(ptOf(c, baloth.id).dataset.size).toBe("1/1");
    expect(ptOf(c, baloth.id).dataset.tint).toBe(RED);
    act(() => endSizeSteps());
    expect([...ptOf(c, baloth.id).querySelectorAll(".r")].map((s) => s.textContent)).toEqual([
      "1",
      "1",
    ]);
  });

  it("on a 4/4 that dies: its red −4/−4 rises, it reads 0/0 in red, then shatters", () => {
    const baloth = permanent({
      name: "Rumbling Baloth",
      power: 4,
      toughness: 4,
      basePower: 4,
      baseToughness: 4,
    });
    const view = render(draw([baloth], [GROWTH(baloth.id)]));
    view.rerender(
      draw([], [], then([baloth], [], { last: [[baloth.id, { power: 0, toughness: 0 }]] })),
    );
    const c = view.container;
    const ghost = c.querySelector<HTMLElement>(`[data-ghost-of="${baloth.id}"]`)!;
    expect(ghost.dataset.fate).toBe("defeated");
    const pt = ghost.querySelector<HTMLElement>(".bf-pt")!;
    expect(pt.dataset.size).toBe("4/4"); // its last board's size first
    const death = calls.filter((x) => x.options.id === "death-size-clock").at(-1)!;
    // It breaks only once it has shrunk, and a beat.
    const change = {
      fromBadge: false,
      from: { power: 4, toughness: 4, loyalty: null },
      to: { power: 0, toughness: 0, loyalty: null },
    };
    const span = countSpan({ ...change, card: baloth.id, look: "down", float: null, badges: [] });
    const fate = callOf(ghost).find((x) => x.options.delay !== undefined)!;
    expect(Number(fate.options.delay)).toBe(RESOLVE_MS + span + SHRINK_BEAT_MS);
    const [float] = floats(c, baloth.id);
    expect(float!.textContent).toBe("−4/−4");
    expect(shakes(ghost.querySelector(".bf-card")!)).toHaveLength(1);
    death.animation.currentTime = RESOLVE_MS + span;
    act(() => redrawSizes());
    expect(ghost.querySelector<HTMLElement>(".bf-pt")!.dataset.size).toBe("0/0");
  });
});

describe("Glorious Anthem (F-0078-D)", () => {
  it("every creature pops, switches and floats +1/+1 at the same moment", () => {
    const team = [
      permanent({}),
      permanent({ name: "Llanowar Elves", power: 1, toughness: 1, basePower: 1, baseToughness: 1 }),
      permanent({ name: "Serra Angel", power: 4, toughness: 4, basePower: 4, baseToughness: 4 }),
    ];
    const anthem: StackView = {
      id: "stack:7",
      name: "Glorious Anthem",
      kind: "spell",
      source: null,
      card: "card:950",
      seat: 1,
      targets: [],
    };
    const anthemCard = permanent({
      id: "card:950",
      name: "Glorious Anthem",
      kind: "other",
      types: "Enchantment",
      power: null,
      toughness: null,
      basePower: undefined,
      baseToughness: undefined,
    });
    const view = render(draw(team, [anthem]));
    const up = team.map((t) => ({ ...t, power: t.power! + 1, toughness: t.toughness! + 1 }));
    view.rerender(draw([...up, anthemCard], [], then(team, [...up, anthemCard])));
    const c = view.container;
    const all = floats(c);
    expect(all.map((f) => f.textContent)).toEqual(["+1/+1", "+1/+1", "+1/+1"]);
    const delays = all.map((f) => callOf(f)[0]!.options.delay);
    // Together, once the Anthem has landed on the table.
    expect(new Set(delays).size).toBe(1);
    expect(delays[0]).toBe(450);
  });
});

describe("A 4/4 left with 3 damage (F-0078-E)", () => {
  it("reads 4/1, the 1 in red, until the turn's end; pointing and the label say 3 damage", () => {
    const baloth = permanent({
      name: "Rumbling Baloth",
      power: 4,
      toughness: 4,
      basePower: 4,
      baseToughness: 4,
    });
    const hurt = { ...baloth, damage: 3 };
    const view = render(draw([baloth]));
    const el = draw([hurt], [], then([baloth], [hurt], { struck: [baloth.id] }));
    view.rerender(el);
    const c = view.container;
    // The fight (or the spell's burst) showed the 3: no float of its own, no shake.
    expect(floats(c, baloth.id)).toHaveLength(0);
    expect(shakes(cardOf(c, baloth.id))).toHaveLength(0);
    expect(callOf(ptOf(c, baloth.id)).at(-1)!.frames[1]!.transform).toBe("scale(1.3)");
    // Held until the hit lands: 4/4, and not red yet.
    at(view, 0, el);
    expect(ptOf(c, baloth.id).textContent).toBe("4/4");
    expect(ptOf(c, baloth.id).querySelector(".r")).toBeNull();
    at(view, 1000, el);
    expect(ptOf(c, baloth.id).textContent).toBe("4/1");
    expect(ptOf(c, baloth.id).querySelector(".r")!.textContent).toBe("1");
    expect(ptOf(c, baloth.id).title).toBe("4/4 with 3 damage");
    expect(cardOf(c, baloth.id).getAttribute("aria-label")).toContain("4/4, 3 damage");
    // The turn ends: the damage goes, grey, with a grey "+3" rising (Amendment 1).
    calls.length = 0;
    const el2 = draw([baloth], [], then([hurt], [baloth], { wornOff: true }));
    view.rerender(el2);
    expect(floats(c, baloth.id).map((f) => [f.textContent, f.style.color])).toEqual([
      ["+3", "rgb(201, 210, 204)"],
    ]);
    at(view, TICK_LEAD_MS, el2);
    expect(ptOf(c, baloth.id).dataset.tint).toBe(GREY);
    act(() => endSizeSteps());
    expect(ptOf(c, baloth.id).textContent).toBe("4/4");
    expect(ptOf(c, baloth.id).querySelector(".r")).toBeNull();
  });
});

describe("A planeswalker, and a counter taken off (F-0078-F)", () => {
  const jace = permanent({
    name: "Jace Beleren",
    kind: "other",
    types: "Legendary Planeswalker — Jace",
    power: null,
    toughness: null,
    basePower: undefined,
    baseToughness: undefined,
    counters: [{ name: "LOYALTY", count: 3 }],
  });
  it("+2: a gold pop and a gold +2; −3: the small shake and a red −3, 5 straight to 2", () => {
    const five = { ...jace, counters: [{ name: "LOYALTY", count: 5 }] };
    const view = render(draw([jace]));
    view.rerender(draw([five], [], then([jace], [five])));
    const c = view.container;
    expect(floats(c, jace.id).map((f) => [f.textContent, f.style.color])).toEqual([
      ["+2", "rgb(242, 201, 92)"],
    ]);
    expect(shakes(cardOf(c, jace.id))).toHaveLength(0);
    act(() => endSizeSteps()); // the +2's clock ends
    calls.length = 0;
    const two = { ...jace, counters: [{ name: "LOYALTY", count: 2 }] };
    const el = draw([two], [], then([five], [two]));
    view.rerender(el);
    expect(floats(c, jace.id).at(-1)!.textContent).toBe("−3");
    expect(shakes(cardOf(c, jace.id))).toHaveLength(1);
    const seen: string[] = [];
    for (const t of [TICK_LEAD_MS - 1, TICK_LEAD_MS, TICK_LEAD_MS + 90]) {
      at(view, t, el);
      seen.push(ptOf(c, jace.id).dataset.size!);
    }
    expect(seen).toEqual(["5", "2", "2"]);
    expect(ptOf(c, jace.id).dataset.tint).toBe(RED);
    // No loyalty badge: loyalty is the number (spec 0076).
    expect(cardOf(c, jace.id).querySelector('[data-counter="LOYALTY"]')).toBeNull();
    void GOLD;
  });

  it("a +1/+1 counter taken off: like a shrink -- the shake, a red −1/−1; the last badge shrinks away", () => {
    const feeder = permanent({
      name: "Spike Feeder",
      power: 2,
      toughness: 2,
      basePower: 0,
      baseToughness: 0,
      counters: [{ name: "P1P1", count: 2 }],
    });
    const one = { ...feeder, power: 1, toughness: 1, counters: [{ name: "P1P1", count: 1 }] };
    const view = render(draw([feeder]));
    view.rerender(draw([one], [], then([feeder], [one])));
    const c = view.container;
    expect(floats(c, feeder.id).map((f) => f.textContent)).toEqual(["−1/−1"]);
    expect(floats(c, feeder.id)[0]!.style.color).toBe("rgb(255, 107, 87)");
    expect(shakes(cardOf(c, feeder.id))).toHaveLength(1);
    const n = cardOf(c, feeder.id).querySelector('[data-counter="P1P1"] .bf-badge-n')!;
    expect(callOf(n).at(-1)!.frames[1]!.transform).toBe("scale(1.5)");
    // The last one: its badge stays, shrinking away, then goes.
    calls.length = 0;
    const none = { ...one, power: 0, toughness: 0, counters: [] };
    const el = draw([none], [], then([one], [none]));
    view.rerender(el);
    const leaving = cardOf(c, feeder.id).querySelector<HTMLElement>('[data-counter="P1P1"]')!;
    expect(leaving.dataset.leaving).toBe("true");
    expect(leaving.querySelector(".bf-badge-n")!.textContent).toBe("1");
    expect(callOf(leaving).at(-1)!.frames.at(-1)!.transform).toBe("scale(0)");
    act(() => endSizeSteps());
    expect(cardOf(c, feeder.id).querySelector('[data-counter="P1P1"]')).toBeNull();
  });
});

describe("No counting on cards (Amendment 1)", () => {
  it("a card's number never shows a value between the old and the new", () => {
    const cases: [BoardCard, BoardCard][] = [];
    const bears = permanent({});
    cases.push([bears, { ...bears, power: 9, toughness: 9 }]);
    const big = permanent({ power: 6, toughness: 6, basePower: 6, baseToughness: 6 });
    cases.push([big, { ...big, power: 1, toughness: 1 }]);
    const jace = permanent({
      name: "Jace",
      kind: "other",
      power: null,
      toughness: null,
      counters: [{ name: "LOYALTY", count: 6 }],
    });
    cases.push([jace, { ...jace, counters: [{ name: "LOYALTY", count: 1 }] }]);
    for (const [was, now] of cases) {
      endSizeSteps();
      const view = render(draw([was]));
      const el = draw([now], [], then([was], [now]));
      view.rerender(el);
      const shown = new Set<string>();
      for (let t = 0; t <= 1500; t += 5) {
        at(view, t, el);
        shown.add(ptOf(view.container, was.id).dataset.size!);
      }
      const size = (c: BoardCard) =>
        c.power === null ? String(c.counters[0]!.count) : `${c.power}/${c.toughness}`;
      expect([...shown]).toEqual([size(was), size(now)]);
      view.unmount();
    }
  });
});

describe("Hurry, reduce motion, hidden information (F-0078-G)", () => {
  it("a click hurries the count with everything else (A-00)", () => {
    const bears = permanent({});
    const grown = { ...bears, power: 5, toughness: 5 };
    const view = render(draw([bears], [GROWTH(bears.id)]));
    view.rerender(draw([grown], [], then([bears], [grown])));
    fireEvent.pointerDown(document.body);
    expect(sizeClock()!.rate.length).toBeGreaterThan(0);
    const [float] = floats(view.container, bears.id);
    expect(callOf(float!)[0]!.rate.length).toBeGreaterThan(0);
  });

  it("reduce motion: no pop, shake, glow or float -- the number just changes", () => {
    still = true;
    const bears = permanent({});
    const grown = { ...bears, power: 5, toughness: 5 };
    const view = render(draw([bears], [GROWTH(bears.id)]));
    view.rerender(draw([grown], [], then([bears], [grown])));
    const c = view.container;
    expect(sizeClock()).toBeUndefined();
    expect(floats(c)).toHaveLength(0);
    expect(callOf(ptOf(c, bears.id))).toHaveLength(0);
    expect(ptOf(c, bears.id).dataset.size).toBe("5/5");
  });

  it("a face-down card turned face up is not counted as a size change; a move with no card has no size", () => {
    const down = permanent({ name: "", faceDown: true, known: false, power: 2, toughness: 2 });
    const up = {
      ...down,
      name: "Hooded Hydra",
      faceDown: false,
      known: true,
      power: 5,
      toughness: 5,
    };
    expect(sizeChanges([down], [up], { wornOff: false, struck: new Set() })).toEqual([]);
    const card = (over: Partial<SnapshotCard>) => ({
      id: "card:5",
      seat: 2,
      name: "Rumbling Baloth",
      kind: "creature",
      types: "Creature — Beast",
      tapped: false,
      faceDown: false,
      known: true,
      power: 4,
      toughness: 4,
      damage: 0,
      sick: false,
      attacking: false,
      blocking: false,
      counters: [],
      keywords: [],
      attachedTo: null,
      ringBearer: false,
      sector: null,
      sprocket: null,
      enteredAt: 1,
      token: false,
      manaCost: null,
      art: null,
      ...over,
    });
    const board = (over: Partial<Snapshot>) =>
      ({
        stateRevision: 1,
        gameEpoch: 1,
        dayTime: null,
        turn: 3,
        phase: "MAIN1",
        activeSeat: 1,
        prioritySeat: 1,
        seat: 1,
        players: [],
        notices: [],
        battlefield: [],
        hand: [],
        otherHands: [],
        casting: [],
        graveyard: [],
        exile: [],
        stack: [],
        combat: null,
        damage: null,
        moves: [],
        ...over,
      }) as unknown as Snapshot;
    const was = board({ battlefield: [card({})] });
    const now = board({
      stateRevision: 2,
      graveyard: [card({ power: 4, toughness: 4 })],
      moves: [
        {
          card: "card:5",
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "graveyard", seat: 2 },
          why: "died",
          last: { power: 0, toughness: 0 },
        },
        {
          card: null,
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "library", seat: 2 },
          why: null,
          last: { power: 9, toughness: 9 },
        },
      ],
    });
    const sizes = boardFromSnapshot(now, was).sizes!;
    expect([...sizes.last]).toEqual([["card:5", { power: 0, toughness: 0 }]]);
  });
});
