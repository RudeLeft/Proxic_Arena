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
