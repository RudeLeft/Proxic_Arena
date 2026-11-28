// @vitest-environment jsdom

// Spec 0125, item 1 (F-0125-B) -- a lone block refused because the attacker
// has menace (owner 2026-11-27, "At the refusal"): the attacker's menace
// square pops with the combat squares' pulse, on both screens, once per
// board; the block stays where the defender put it; reduce motion, no pop.
// The real Board, handed one board and then the next, as the game screen
// hands them; and fromSnapshot, from the snapshots the worker sends.

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type StackView } from "./Board";
import { boardFromSnapshot, type Moments, type Survive } from "./fromSnapshot";
import { WHY_PULSE_MS, whyPulseFrames } from "./markMotion";
import { PREVENT_STEP_MS, PREVENT_TICK_AT_MS } from "./CardBadges";
import { endLifeSteps, lifeStillPlaying } from "./lifeTicks";
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
  endLifeSteps();
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
  moments?: Moments | null;
  viewerSeat?: number;
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
      viewerSeat={extra.viewerSeat ?? 1}
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
      moments={extra.moments ?? null}
    />
  );
}

const brute = (extra: Partial<BoardCard> = {}) =>
  card("card:57", 2, "Boggart Brute", {
    power: 3,
    keywords: ["Menace"],
    attacking: true,
    inCombat: true,
    ...extra,
  });
const bears = (extra: Partial<BoardCard> = {}) =>
  card("card:75", 1, "Grizzly Bears", { blocking: true, inCombat: true, ...extra });
const refusedAt = (key: string): Moments => ({
  key,
  spent: new Set(),
  shuffles: [],
  crewed: new Map(),
  menaceRefused: new Set(["card:57"]),
});
const menaceOf = (c: HTMLElement, id = "card:57") =>
  c
    .querySelector(`[data-object-id="${id}"]`)!
    .closest(".bf-slot")!
    .querySelector<HTMLElement>('.bf-mark[data-mark="kw:menace"]');
const pulses = (el: Element | null) =>
  calls.filter(
    (c) =>
      c.element === el &&
      Number(c.options.duration) === WHY_PULSE_MS &&
      JSON.stringify(c.frames) === JSON.stringify(whyPulseFrames()),
  );

describe("F-0125-B · the menace square pops at the refusal", () => {
  for (const viewerSeat of [1, 2]) {
    it(`pops once on the attacker, the lone block standing (seat ${viewerSeat}'s screen)`, () => {
      const view = render(draw([brute(), bears()], { viewerSeat }));
      const square = menaceOf(view.container);
      expect(square).toBeTruthy();
      calls.length = 0;
      view.rerender(draw([brute(), bears()], { viewerSeat, moments: refusedAt("1:197") }));
      expect(pulses(menaceOf(view.container))).toHaveLength(1);
      // No other square pulses, and the Bears do not move (nothing on them).
      expect(calls.filter((c) => Number(c.options.duration) === WHY_PULSE_MS)).toHaveLength(1);
      const slot = view.container.querySelector('[data-object-id="card:75"]')!.closest(".bf-slot")!;
      expect(calls.some((c) => c.element === slot)).toBe(false);
      // The same board drawn again: no second pop.
      calls.length = 0;
      view.rerender(draw([brute(), bears()], { viewerSeat, moments: refusedAt("1:197") }));
      expect(pulses(menaceOf(view.container))).toHaveLength(0);
    });
  }

  it("a board with no refusal pops nothing; reduce motion pops nothing", () => {
    const view = render(draw([brute(), bears()]));
    calls.length = 0;
    view.rerender(draw([brute(), bears({ blocking: false })]));
    expect(pulses(menaceOf(view.container))).toHaveLength(0);
    still = true;
    view.rerender(draw([brute(), bears()], { moments: refusedAt("1:198") }));
    expect(pulses(menaceOf(view.container))).toHaveLength(0);
  });

  it("fromSnapshot: blockRefused (why menace) names the attacker on the table, once per board", () => {
    const fighting = {
      phase: "COMBAT_DECLARE_BLOCKERS",
      battlefield: [
        row("card:57", 2, "Boggart Brute", { keywords: ["Menace"], attacking: true }),
        row("card:75", 1, "Grizzly Bears", { blocking: true }),
      ],
      combat: {
        attackers: [{ id: "card:57", target: { player: 1 } }],
        blocks: [{ blocker: "card:75", attacker: "card:57" }],
      },
    };
    const before = snap(1, 196, fighting);
    const after = snap(1, 197, {
      ...fighting,
      blockRefused: [{ attacker: "card:57", blockers: ["card:75"], why: "menace" }],
    });
    const data = boardFromSnapshot(after, before);
    expect([...(data.moments?.menaceRefused ?? [])]).toEqual(["card:57"]);
    expect(data.moments?.key).toBe("1:197");
    // The lone block is still drawn as the defender left it.
    expect(data.battlefield.find((c) => c.id === "card:75")?.blocking).toBe(true);
    // No refusal: nothing to pop; an unknown reason is not read as menace.
    expect(boardFromSnapshot(before, null).moments?.menaceRefused).toBeUndefined();
    const other = snap(1, 198, {
      ...fighting,
      blockRefused: [{ attacker: "card:57", blockers: ["card:75"], why: "other" }],
    });
    expect(boardFromSnapshot(other, after).moments?.menaceRefused).toBeUndefined();
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

describe("F-0125-F · a creature's prevent-the-next-N square ticks as its blow lands, in combat", () => {
  it("Bob's 3/3 blocked by Alice's shielded Bears: 3 holds until the blow on the fight clock", () => {
    // The page's clock held still, as the fight clock is here (its stub never
    // advances): the square is timed from when it was drawn, so a slow test
    // machine must not read as a late tick.
    vi.spyOn(performance, "now").mockReturnValue(5_000);
    const ogre = card("card:40", 2, "Hill Giant", { power: 3, toughness: 3, attacking: true });
    const bears = card("card:12", 1, "Grizzly Bears", { preventNext: 3, blocking: true });
    const view = render(draw([ogre, bears]));
    calls.length = 0;
    view.rerender(
      draw([ogre, { ...bears, preventNext: undefined, preventUsed: { from: 3, to: 0 } }], {
        damage: {
          key: "damage:c9",
          combat: "regular",
          hits: [
            {
              source: "card:40",
              target: { object: "card:12" },
              amount: 0,
              prevented: 3,
              by: "prevent-next",
            },
            { source: "card:12", target: { object: "card:40" }, amount: 2 },
          ],
          fights: [{ attacker: "card:40", defender: { player: 1 }, blockers: ["card:12"] }],
        },
      }),
    );
    // The Giant's blow on the Bears, on the fight clock.
    const blow = lifeStillPlaying("fights").find((s) => s.object === "card:12")!;
    expect(blow).toBeTruthy();
    expect(blow.at).toBeGreaterThan(PREVENT_TICK_AT_MS);
    const used = view.container.querySelector<HTMLElement>('[data-mark="prevent-next"]')!;
    expect(used.dataset["used"]).toBe("true");
    const steps = [...used.querySelectorAll<HTMLElement>(".bf-prevent-step")];
    const ms = (el: HTMLElement, v: string) => parseFloat(el.style.getPropertyValue(v));
    expect(ms(steps[0]!, "--step-at")).toBe(0);
    expect(ms(steps[0]!, "--step-ms")).toBe(blow.at);
    expect(steps.slice(1).map((s) => ms(s, "--step-at"))).toEqual([
      blow.at,
      blow.at + PREVENT_STEP_MS,
      blow.at + 2 * PREVENT_STEP_MS,
    ]);
    expect(ms(used, "--gone-at")).toBe(blow.at + 4 * PREVENT_STEP_MS);
  });
});

describe("F-0125-G · one look: part of a spell hit stopped, on a creature as on a player", () => {
  const fightMarks = (c: HTMLElement, kind: string, of: string) =>
    [...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`)].filter(
      (m) => m.dataset["of"] === of,
    );
  const axe = (target: string): StackView => ({
    id: "stack:41",
    name: "Lava Axe",
    kind: "spell",
    source: null,
    targets: [{ object: target }],
    seat: 2,
    card: "card:91",
  });
  it("Lava Axe's 5 into the Wurm's 3: the square ticks, the red −2, no pale shield; all of it stopped keeps it", () => {
    const wurm = card("card:13", 1, "Craw Wurm", { power: 6, toughness: 4, preventNext: 3 });
    const view = render(draw([wurm], { stack: [axe(wurm.id)] }));
    calls.length = 0;
    view.rerender(
      draw([{ ...wurm, preventNext: undefined, preventUsed: { from: 3, to: 0 } }], {
        damage: {
          key: "damage:axe",
          hits: [
            {
              source: "card:91",
              target: { object: wurm.id },
              amount: 0,
              prevented: 3,
              by: "prevent-next",
            },
            { source: "card:91", target: { object: wurm.id }, amount: 2 },
          ],
        },
      }),
    );
    const used = view.container.querySelector<HTMLElement>('[data-mark="prevent-next"]')!;
    expect(used.dataset["used"]).toBe("true");
    expect(fightMarks(view.container, "ward", wurm.id)).toEqual([]);
    const numbers = fightMarks(view.container, "number", wurm.id);
    expect(numbers.map((m) => m.textContent)).toEqual(["−2"]);
    expect(numbers[0]!.classList.contains("bf-fight-grey")).toBe(false);

    // The control: all 3 of a Bolt stopped -- the pale shield and the grey 0, as before.
    const bears = card("card:14", 1, "Grizzly Bears", { preventNext: 3 });
    const again = render(draw([bears], { stack: [{ ...axe(bears.id), name: "Lightning Bolt" }] }));
    again.rerender(
      draw([{ ...bears, preventNext: undefined, preventUsed: { from: 3, to: 0 } }], {
        damage: {
          key: "damage:bolt",
          hits: [
            {
              source: "card:91",
              target: { object: bears.id },
              amount: 0,
              prevented: 3,
              by: "prevent-next",
            },
          ],
        },
      }),
    );
    expect(fightMarks(again.container, "ward", bears.id)).toHaveLength(1);
    expect(fightMarks(again.container, "number", bears.id).map((m) => m.textContent)).toEqual([
      "0",
    ]);
  });
});

describe("F-0125-H · a creature's square ticks from what was left, even when that board was never drawn", () => {
  it("fromSnapshot: a hit it stopped with no earlier board showing the count: 3 -> 0", () => {
    const after = snap(1, 30, {
      battlefield: [row("card:12", 1, "Grizzly Bears")],
      damage: {
        key: "damage:30",
        hits: [
          {
            source: "card:90",
            target: { object: "card:12" },
            amount: 0,
            prevented: 3,
            by: "prevent-next",
          },
        ],
      },
    });
    const before = snap(1, 28, { battlefield: [row("card:12", 1, "Grizzly Bears")] });
    const data = boardFromSnapshot(after, before);
    expect(data.battlefield[0]!.preventUsed).toEqual({ from: 3, to: 0 });
  });
});
