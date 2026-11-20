// @vitest-environment jsdom

// Spec 0101 -- outcomes: every survive status's badge and its look when used
// (combat Q6 v3, missed Q3 A), one grey crumble for anything that didn't
// happen (combat Q5 A, missed Q5 A), printed combat abilities in combat
// (combat Q1 A). The real Board, handed one board and then the next, as the
// game screen hands them; and fromSnapshot, from the snapshots the worker
// sends.

import { render } from "@testing-library/react";
import { paced } from "./motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type StackView } from "./Board";
import { boardFromSnapshot, type Survive } from "./fromSnapshot";
import { cardMarks } from "./marks";
import { SHAPE_IN_MS, SHIELD_UP_MS, WARD_MS } from "./survive";
import { SHIELD_LEAD_MS, UNFOLD_MS, umbraTimes } from "./umbra";
import { PREVENT_STEP_MS, PREVENT_TICK_AT_MS } from "./CardBadges";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";

const size = { width: 1920, height: 1080 };
type Call = { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions };
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
    calls.push({ element: this, frames, options });
    return {
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
      updatePlaybackRate() {},
    } as unknown as Animation;
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [];
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let entered = 0;
function card(id: string, seat: number, name: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    seat,
    name,
    kind: "creature",
    types: `Creature — ${name}`,
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
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}

type Extra = {
  stack?: StackView[];
  survive?: Survive | null;
  damage?: Parameters<typeof Board>[0]["damage"];
  countered?: Set<string>;
  leftBy?: Map<string, string>;
};
function draw(battlefield: BoardCard[], extra: Extra = {}) {
  return (
    <Board
      battlefield={battlefield}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={new Map()}
      departures={new Map()}
      returns={new Map()}
      tileMoves={[]}
      countered={extra.countered ?? new Set()}
      leftBy={extra.leftBy ?? new Map()}
      fizzled={new Set()}
      survive={extra.survive ?? null}
      stack={extra.stack ?? []}
      combat={null}
      damage={extra.damage ?? null}
    />
  );
}

const survive = (key: string, s: Partial<Survive>): Survive => ({
  key,
  flickers: new Map(),
  survived: new Map(),
  phased: new Map(),
  ...s,
});
const marks = (c: HTMLElement, kind: string, of?: string) =>
  [...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`)].filter(
    (m) => of === undefined || m.dataset["of"] === of,
  );
const callOf = (el: Element) => calls.filter((c) => c.element === el).at(-1)!;
const delayOf = (c: Call) => Number(c.options.delay ?? 0);
/** When a mark is first wholly up (opacity 1), on the board's clock. */
const upAt = (el: Element) => {
  const c = callOf(el);
  const f = c.frames.find((x) => Number(x.opacity) === 1)!;
  return delayOf(c) + Number(f.offset) * Number(c.options.duration);
};
const greys = (c: HTMLElement, of: string) =>
  marks(c, "number", of).filter((m) => m.classList.contains("bf-fight-grey"));

// Bob's Lightning Bolt on the stack, aimed at the creature, resolves on the
// next board: the blow lands when its spark does (RESOLVE_MS = 380).
const BLOW = paced(380);
const FRAME = 17;
function bolt(target: string): StackView {
  return {
    id: "stack:40",
    name: "Lightning Bolt",
    kind: "spell",
    source: null,
    targets: [{ object: target }],
    seat: 2,
    card: "card:90",
  };
}
const hitOn = (target: string, amount: number, more: Record<string, unknown> = {}) => ({
  key: "dmg:1",
  hits: [{ source: "card:90", target: { object: target }, amount, ...more }],
});

describe("F-0101-C · the seven survive rows: shield up 0.15 s before the hit, a grey number, the badge", () => {
  it("1 · regeneration: the green shield up before the blow, the badge bursts, a grey 3, no red −3", () => {
    const boa = card("card:5", 1, "River Boa", { shields: 1 });
    const view = render(draw([boa], { stack: [bolt(boa.id)] }));
    calls.length = 0;
    view.rerender(
      draw([{ ...boa, shields: undefined, tapped: true }], {
        damage: hitOn(boa.id, 3),
        survive: survive("1:2", { survived: new Map([[boa.id, "regenerated"]]) }),
      }),
    );
    const shield = marks(view.container, "regenshield", boa.id)[0]!;
    expect(shield).toBeTruthy();
    expect(Math.abs(upAt(shield) - (BLOW - SHIELD_UP_MS))).toBeLessThanOrEqual(FRAME);
    expect(marks(view.container, "shieldbreak", boa.id)).toHaveLength(1);
    expect(greys(view.container, boa.id).map((m) => m.textContent)).toEqual(["3"]);
    expect(view.container.querySelector(`[data-damage-number="${boa.id}"]`)).toBeNull();
    // The badge is gone (the board says no shield).
    expect(view.container.querySelector('[data-mark="shield"]')).toBeNull();
  });

  it("2 · indestructible: the dome up before the blow, the hexagon pulses and stays, a grey 3", () => {
    const myr = card("card:6", 1, "Darksteel Myr", { indestructible: true });
    const view = render(draw([myr], { stack: [bolt(myr.id)] }));
    calls.length = 0;
    view.rerender(
      draw([myr], {
        damage: hitOn(myr.id, 3),
        survive: survive("1:3", { survived: new Map([[myr.id, "indestructible"]]) }),
      }),
    );
    const dome = marks(view.container, "dome", myr.id)[0]!;
    expect(Math.abs(upAt(dome) - (BLOW - SHIELD_UP_MS))).toBeLessThanOrEqual(FRAME);
    const hex = view.container.querySelector('[data-mark="indestructible"]')!;
    expect(hex).toBeTruthy();
    expect(delayOf(callOf(hex))).toBe(BLOW);
    expect(greys(view.container, myr.id).map((m) => m.textContent)).toEqual(["3"]);
  });

  it("3 · a shield counter: the silver shield up before the hit, cracks, a grey 0; on a Murder, no number", () => {
    const knight = card("card:7", 1, "Benalish Knight", {
      counters: [{ name: "SHIELD", count: 2 }],
    });
    const view = render(draw([knight], { stack: [bolt(knight.id)] }));
    calls.length = 0;
    view.rerender(
      draw([{ ...knight, counters: [{ name: "SHIELD", count: 1 }] }], {
        damage: hitOn(knight.id, 0, { prevented: 3, by: "shield" }),
      }),
    );
    const silver = marks(view.container, "silvershield", knight.id)[0]!;
    expect(silver).toBeTruthy();
    expect(Math.abs(upAt(silver) - (BLOW - SHIELD_UP_MS))).toBeLessThanOrEqual(FRAME);
    expect(silver.style.getPropertyValue("--crack-at")).toBe(`${BLOW}ms`);
    expect(silver.querySelector(".bf-umbra-crack")).toBeTruthy();
    expect(marks(view.container, "shard", knight.id).length).toBeGreaterThan(0);
    expect(marks(view.container, "ward", knight.id)).toHaveLength(0);
    expect(greys(view.container, knight.id).map((m) => m.textContent)).toEqual(["0"]);
    expect(view.container.querySelector('[data-counter="SHIELD"]')).toBeTruthy();

    // Bob's Murder: Forge's "shield" survivor -- the silver shield, no number.
    const angel = card("card:8", 1, "Serra Angel", { counters: [{ name: "SHIELD", count: 1 }] });
    const murder = { ...bolt(angel.id), name: "Murder", id: "stack:41" };
    const v2 = render(draw([angel], { stack: [murder] }));
    calls.length = 0;
    v2.rerender(
      draw([{ ...angel, counters: [] }], {
        survive: survive("1:4", { survived: new Map([[angel.id, "shield"]]) }),
      }),
    );
    const s2 = marks(v2.container, "silvershield", angel.id)[0]!;
    expect(Math.abs(upAt(s2) - (BLOW - SHIELD_UP_MS))).toBeLessThanOrEqual(FRAME);
    expect(greys(v2.container, angel.id)).toHaveLength(0);
  });

  it("4 · umbra armor: the shield whole 0.15 s before the blow, after its unfold; a grey 0", () => {
    expect(SHIELD_LEAD_MS).toBe(UNFOLD_MS + SHIELD_UP_MS);
    const t = umbraTimes(2000);
    expect(t.blow - (t.start + UNFOLD_MS)).toBe(SHIELD_UP_MS);
    const lion = card("card:9", 1, "Silvercoat Lion");
    const view = render(draw([lion], { stack: [bolt(lion.id)] }));
    calls.length = 0;
    view.rerender(
      draw([lion], {
        survive: survive("1:5", {
          survived: new Map([[lion.id, "umbra"]]),
          umbras: new Map([["card:31", lion.id]]),
        }),
      }),
    );
    const zero = greys(view.container, lion.id);
    expect(zero.map((m) => m.textContent)).toEqual(["0"]);
    expect(delayOf(callOf(zero[0]!))).toBe(umbraTimes(BLOW).blow + paced(50));
  });

  it("5 · protection from red: the pale shield up before the hit, the square pulses and stays, a grey 0", () => {
    const bears = card("card:10", 1, "Grizzly Bears", { keywords: ["Protection from red"] });
    const view = render(draw([bears], { stack: [bolt(bears.id)] }));
    calls.length = 0;
    view.rerender(draw([bears], { damage: hitOn(bears.id, 0, { prevented: 3 }) }));
    const ward = marks(view.container, "ward", bears.id)[0]!;
    expect(Number(callOf(ward).options.duration)).toBe(WARD_MS);
    expect(Math.abs(upAt(ward) - (BLOW - SHIELD_UP_MS))).toBeLessThanOrEqual(FRAME);
    const square = view.container.querySelector(".bf-mark-kw:not([data-folds])")!;
    expect(square).toBeTruthy();
    expect(delayOf(callOf(square))).toBe(BLOW);
    expect(greys(view.container, bears.id).map((m) => m.textContent)).toEqual(["0"]);
  });

  it("6 · ward: flare and ring as the trigger rises, and as it counters; paid, the flare only", () => {
    const terror = card("card:11", 1, "Tomakul Honor Guard", { keywords: ["Ward {2}"] });
    const spell = bolt(terror.id);
    const trigger: StackView = {
      id: "stack:42",
      name: "Tomakul Honor Guard",
      kind: "trigger",
      source: terror.id,
      targets: [],
      seat: 1,
      ward: terror.id,
    };
    const wardSquare = (c: HTMLElement) => c.querySelector('.bf-mark[data-mark^="kw:ward"]')!;
    const flares = (c: HTMLElement) => calls.filter((x) => x.element === wardSquare(c));
    // Not paid: rises (flare + ring), then counters (flare + ring + grey 0).
    const view = render(draw([terror], { stack: [spell] }));
    calls.length = 0;
    view.rerender(draw([terror], { stack: [trigger, spell] }));
    expect(flares(view.container)).toHaveLength(1);
    expect(marks(view.container, "wardring", terror.id)).toHaveLength(1);
    calls.length = 0;
    view.rerender(
      draw([terror], {
        countered: new Set([spell.card!, spell.id]),
        leftBy: new Map([[spell.id, terror.id]]),
      }),
    );
    expect(flares(view.container)).toHaveLength(1);
    expect(marks(view.container, "wardring", terror.id)).toHaveLength(2);
    expect(greys(view.container, terror.id).map((m) => m.textContent)).toEqual(["0"]);
    // The Bolt crumbles where it is, struck by the ward trigger's beam.
    expect(view.container.querySelector(`[data-strike="${spell.card}"]`)).toBeTruthy();

    // Paid (Decided 2): the trigger leaves, nothing countered -- the flare only.
    const v2 = render(draw([terror], { stack: [trigger, spell] }));
    calls.length = 0;
    v2.rerender(draw([terror], { stack: [spell] }));
    expect(flares(v2.container)).toHaveLength(1);
    expect(marks(v2.container, "wardring", terror.id)).toHaveLength(0);
    expect(greys(v2.container, terror.id)).toHaveLength(0);
  });

  it("7 · prevent the next 3: the new badge with 3; used, the pale shield up before the hit, 3 → 0, gone, a grey 0", () => {
    const bears = card("card:12", 1, "Grizzly Bears", { preventNext: 3 });
    const view = render(draw([bears], { stack: [bolt(bears.id)] }));
    const badge = view.container.querySelector<HTMLElement>('[data-mark="prevent-next"]')!;
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("3");
    calls.length = 0;
    view.rerender(
      draw([{ ...bears, preventNext: undefined, preventUsed: { from: 3, to: 0 } }], {
        damage: hitOn(bears.id, 0, { prevented: 3, by: "prevent-next" }),
      }),
    );
    const used = view.container.querySelector<HTMLElement>('[data-mark="prevent-next"]')!;
    expect(used.dataset["used"]).toBe("true");
    const steps = [...used.querySelectorAll<HTMLElement>(".bf-prevent-step")];
    expect(steps.map((s) => s.textContent)).toEqual(["3", "2", "1", "0"]);
    expect(steps[1]!.style.getPropertyValue("--step-at")).toBe(`${PREVENT_TICK_AT_MS}ms`);
    expect(used.style.getPropertyValue("--gone-at")).toBe(
      `${PREVENT_TICK_AT_MS + 4 * PREVENT_STEP_MS}ms`,
    );
    const ward = marks(view.container, "ward", bears.id)[0]!;
    expect(Math.abs(upAt(ward) - (BLOW - SHIELD_UP_MS))).toBeLessThanOrEqual(FRAME);
    expect(greys(view.container, bears.id).map((m) => m.textContent)).toEqual(["0"]);
    // Gone from the next board: no badge.
    view.rerender(draw([{ ...bears, preventNext: undefined }]));
    expect(view.container.querySelector('[data-mark="prevent-next"]')).toBeNull();
  });

  it("every shape takes SHAPE_IN_MS to come up (the shared lead)", () => {
    expect(SHIELD_UP_MS).toBe(paced(150));
    expect(SHAPE_IN_MS).toBe(paced(120));
  });
});

describe("F-0101-D · a countered ability crumbles: no glow, no spark; a resolved one still sparks", () => {
  const elves = card("card:20", 2, "Llanowar Elves");
  const pyro = card("card:21", 1, "Prodigal Pyromancer");
  const ping: StackView = {
    id: "stack:50",
    name: "Prodigal Pyromancer",
    kind: "ability",
    source: pyro.id,
    targets: [{ object: elves.id }],
    seat: 1,
  };
  const stifle: StackView = {
    id: "stack:51",
    name: "Stifle",
    kind: "spell",
    source: null,
    targets: [{ object: ping.id }],
    seat: 2,
    card: "card:77",
  };

  it("Stifle on the ping (`left`, by stack id): Stifle's beam strikes it, grey ash, no spark at the Elves", () => {
    const view = render(draw([pyro, elves], { stack: [stifle, ping] }));
    calls.length = 0;
    view.rerender(
      draw([pyro, elves], {
        countered: new Set([ping.id]),
        leftBy: new Map([[ping.id, stifle.card!]]),
      }),
    );
    const ghost = [
      ...view.container.querySelectorAll<HTMLElement>(`[data-ghost-of="${ping.id}"]`),
    ][0]!;
    expect(ghost.dataset["countered"]).toBe("true");
    expect(view.container.querySelector(`[data-strike="${ping.id}"]`)).toBeTruthy();
    expect(view.container.querySelector(`[data-spark="${elves.id}"]`)).toBeNull();
  });

  it("the same ping resolving: it glows and its spark runs to the Elves", () => {
    const view = render(draw([pyro, elves], { stack: [ping] }));
    calls.length = 0;
    view.rerender(draw([pyro, elves]));
    expect(view.container.querySelector(`[data-spark="${elves.id}"]`)).toBeTruthy();
  });

  it("fromSnapshot: `left` puts the entry's stack id among the countered, with what did it", () => {
    const before = snap(1, 1, {
      stack: [{ id: "stack:50", kind: "ability", source: "card:21", controller: 1, targets: [] }],
    });
    const after = snap(1, 2, { left: [{ stack: "stack:50", why: "countered", by: "card:77" }] });
    const data = boardFromSnapshot(after, before);
    expect(data.countered.has("stack:50")).toBe(true);
    expect(data.leftBy.get("stack:50")).toBe("card:77");
    const ended = boardFromSnapshot(
      snap(1, 3, { left: [{ stack: "stack:52", why: "ended" }] }),
      after,
    );
    expect(ended.countered.has("stack:52")).toBe(true);
  });
});

/** A snapshot as the worker sends it, through the page's own parser. */
function snap(seat: number, revision: number, body: Record<string, unknown>): Snapshot {
  const state = reduceMatch(EMPTY_MATCH, {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      seat,
      turn: 8,
      phase: "MAIN1",
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 40 },
        { seat: 2, name: "Bob", life: 20, handCount: 0, libraryCount: 40 },
      ],
      battlefield: [],
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...body,
    },
  });
  return state.board!;
}
const row = (id: string, seat: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: `Creature — ${name}`,
  tapped: false,
  faceDown: false,
  known: true,
  power: 2,
  toughness: 2,
  damage: 0,
  ...extra,
});

describe("F-0101-E · printed combat abilities, from the attack through damage", () => {
  const nighthawk = row("card:60", 2, "Vampire Nighthawk", {
    keywords: ["Flying", "Deathtouch", "Lifelink"],
    attacking: true,
  });
  const knight = row("card:61", 1, "Benalish Knight", { keywords: ["First Strike"] });
  const elves = row("card:62", 1, "Llanowar Elves", { tapped: true });
  const at = (phase: string, extra: Record<string, unknown> = {}) =>
    boardFromSnapshot(
      snap(1, 10, { phase, battlefield: [nighthawk, knight, elves], ...extra }),
      null,
    );
  const keys = (data: ReturnType<typeof at>, id: string) =>
    cardMarks(data.battlefield.find((c) => c.id === id)!).map((m) => m.key);

  it("on the attacker from declare attackers; on a blocker candidate, not on a creature that is not one", () => {
    const data = at("COMBAT_DECLARE_ATTACKERS", { blockerCandidates: ["card:61"] });
    expect(keys(data, "card:60")).toEqual(["kw:deathtouch", "kw:lifelink"]);
    expect(keys(data, "card:61")).toEqual(["kw:first strike"]);
    expect(keys(data, "card:62")).toEqual([]);
    // Flying is left out (the card already hovers).
    expect(keys(data, "card:60")).not.toContain("kw:flying");
  });

  it("outside combat, and once combat is over, not shown; gained ones unchanged", () => {
    expect(keys(at("MAIN1"), "card:60")).toEqual([]);
    expect(keys(at("MAIN2", { blockerCandidates: ["card:61"] }), "card:61")).toEqual([]);
    const gained = boardFromSnapshot(
      snap(1, 11, {
        phase: "MAIN1",
        battlefield: [
          { ...knight, gained: ["Deathtouch"], keywords: ["First Strike", "Deathtouch"] },
        ],
      }),
      null,
    );
    const m = cardMarks(gained.battlefield[0]!);
    expect(m.map((x) => [x.key, x.words, !!x.combat])).toEqual([
      ["kw:deathtouch", "Deathtouch (gained)", false],
    ]);
  });

  it("pops on as it is declared (no riser), and pops on the deathtouch hit; gone at end of combat", () => {
    const hawk = card("card:60", 2, "Vampire Nighthawk", {
      keywords: ["Flying", "Deathtouch", "Lifelink"],
    });
    const kn = card("card:61", 1, "Benalish Knight", { keywords: ["First Strike"] });
    const view = render(draw([hawk, kn]));
    calls.length = 0;
    view.rerender(
      draw([
        { ...hawk, attacking: true, inCombat: true },
        { ...kn, inCombat: true },
      ]),
    );
    const dt = view.container
      .querySelector('[data-object-id="card:60"]')!
      .closest(".bf-slot")!
      .querySelector('.bf-mark[data-mark="kw:deathtouch"]')!;
    expect(dt).toBeTruthy();
    expect(calls.some((c) => c.element === dt)).toBe(true);
    expect(view.container.querySelector('[data-fight="riser"]')).toBeNull();
    calls.length = 0;
    view.rerender(
      draw(
        [
          { ...hawk, attacking: true, inCombat: true },
          { ...kn, blocking: true, inCombat: true },
        ],
        {
          damage: {
            key: "dmg:c1",
            combat: "regular",
            hits: [
              { source: "card:60", target: { object: "card:61" }, amount: 2, deathtouch: true },
              { source: "card:61", target: { object: "card:60" }, amount: 2 },
            ],
            fights: [{ attacker: "card:60", defender: { player: 1 }, blockers: ["card:61"] }],
          },
        },
      ),
    );
    const dt2 = view.container
      .querySelector('[data-object-id="card:60"]')!
      .closest(".bf-slot")!
      .querySelector('.bf-mark[data-mark="kw:deathtouch"]')!;
    expect(calls.some((c) => c.element === dt2)).toBe(true);
    view.rerender(draw([hawk, kn]));
    expect(
      view.container.querySelector('.bf-mark[data-mark="kw:deathtouch"][data-leaving]') ??
        view.container.querySelector('.bf-mark[data-mark="kw:deathtouch"]'),
    ).toBeTruthy();
    expect(cardMarks(hawk).map((x) => x.key)).toEqual([]);
  });
});
