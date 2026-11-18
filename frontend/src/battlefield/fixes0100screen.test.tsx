// @vitest-environment jsdom

// Spec 0100 (owner 2026-11-17, deep dive 3) -- the game screen's half. The
// real game screen, its socket replaced, handed the boards the worker sends:
//
//  F-0100-D  Meren's end-step trigger on Llanowar Elves (card:28) in Alice's
//            graveyard: the beam runs to the Graveyard tile, the Elves peek
//            out of it with the corners, and opening the pile shows the
//            corners on them there -- on both seats.
//  F-0100-F  Bob's Curse on Alice: a tab on Alice's plate, the card still in
//            Bob's rows; the tab glows when its trigger rises.
//  F-0100-C  the screen's part of item 1 and the close-up: the X medallion
//            on the card flying to the stack; "X is 6", the modes and the
//            extra costs in the close-up.
//  item 9    the life shield follows the stack entry pointed at, not the
//            front one.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: () => {},
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      reportsClosed: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation?: Animation;
};
let animations: Recorded[] = [];
beforeEach(() => {
  animations = [];
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("CSSAnimation", class {});
  vi.stubGlobal("CSSTransition", class {});
  vi.stubGlobal("PointerEvent", class extends MouseEvent {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    animations.push({
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
    });
    const animation = {
      cancel() {},
      finish() {},
      onfinish: null,
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }) },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
    animations[animations.length - 1]!.animation = animation;
    return animation;
  };
  (Element.prototype as { getAnimations?: unknown }).getAnimations = () => [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 947,
});

const match = {
  matchId: "m-100",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

let revision = 0;
function send(state: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) => reduceMatch(previous, { type: "MATCH_SNAPSHOT", state })),
  );
}
function state(seat: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 7,
    phase: "END_OF_TURN",
    activeSeat: 1,
    seat,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 41, graveyardCount: 1 },
      { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 44 },
    ],
    battlefield: [],
    hand: [],
    otherHands: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    moves: [],
    ...over,
  };
}
const open = (me: string) =>
  render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
const card = (id: string, seat: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: `Creature — ${name}`,
  tapped: false,
  faceDown: false,
  known: true,
  power: 1,
  toughness: 1,
  art: null,
  ...extra,
});

// --- F-0100-D ------------------------------------------------------------------------------------

describe("F-0100-D · Meren's trigger on a card in Alice's graveyard", () => {
  const meren = card("card:14", 1, "Meren of Clan Nel Toth", { power: 3, toughness: 4 });
  const elves = card("card:28", 1, "Llanowar Elves");
  const trigger = {
    id: "stack:23",
    kind: "trigger",
    source: "card:14",
    controller: 1,
    name: "Meren of Clan Nel Toth",
    description: "Meren returns target creature card.",
    targets: [{ object: "card:28" }],
  };
  for (const [seat, me] of [
    [1, "u-1"],
    [2, "u-2"],
  ] as const)
    it(`seat ${seat}: a beam to the Graveyard tile, the peek card with corners, corners in the opened pile`, () => {
      const c = open(me);
      send(state(seat, { battlefield: [meren], graveyard: [elves] }));
      send(state(seat, { battlefield: [meren], graveyard: [elves], stack: [trigger] }));
      // Its arrows wait until it has arrived on the stack (spec 0066).
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      send(state(seat, { battlefield: [meren], graveyard: [elves], stack: [trigger] }));
      const line = c.querySelector<SVGGElement>('[data-line="target"][data-to="card:28"]');
      expect(line).toBeTruthy();
      const peek = c.querySelector<HTMLElement>('[data-peek-of="card:28"]')!;
      expect(peek).toBeTruthy();
      expect(peek.querySelector('[data-sight="true"]')).toBeTruthy();
      // The beam ends just over the peek card, by the tile.
      const end = line!.dataset.end!.split(",").map(Number);
      const top = parseFloat(peek.style.top);
      const left = parseFloat(peek.style.left);
      const w = parseFloat(peek.style.width);
      expect(Math.abs(end[0]! - (left + w / 2))).toBeLessThan(2);
      expect(end[1]!).toBeLessThan(top);
      // It peeks out of the tile of the side it lies on.
      const tile = c.querySelector<HTMLElement>(
        `[data-zone-tile="${seat === 1 ? "viewer" : "opponent"}:graveyard"]`,
      )!;
      expect(tile).toBeTruthy();
      // Open the pile: the Elves wear the corners there too.
      fireEvent.click(tile);
      const shown = c.querySelector<HTMLElement>('.gs-ztray-card[data-aimed="true"]')!;
      expect(shown).toBeTruthy();
      expect(shown.querySelector('[data-sight="true"]')).toBeTruthy();
      expect(shown.getAttribute("aria-label")).toContain("Llanowar Elves");
    });
});

// --- F-0100-F ------------------------------------------------------------------------------------

describe("F-0100-F · Bob's Curse on Alice", () => {
  const curse = card("card:40", 2, "Curse of the Pierced Heart", {
    kind: "other",
    types: "Enchantment — Aura Curse",
    power: null,
    toughness: null,
    attachedToPlayer: 1,
  });
  const upkeep = {
    id: "stack:31",
    kind: "trigger",
    source: "card:40",
    controller: 2,
    name: "Curse of the Pierced Heart",
    description: "Curse of the Pierced Heart deals 1 damage to Alice.",
    targets: [],
  };
  for (const [seat, me] of [
    [1, "u-1"],
    [2, "u-2"],
  ] as const)
    it(`seat ${seat}: a tab on Alice's plate, the card still among Bob's; the tab glows as its trigger rises`, () => {
      const c = open(me);
      send(state(seat, { battlefield: [] }));
      send(state(seat, { battlefield: [curse] }));
      const alice = c.querySelector<HTMLElement>('.gs-seat[data-seat="1"]')!;
      const bob = c.querySelector<HTMLElement>('.gs-seat[data-seat="2"]')!;
      const tab = alice.querySelector<HTMLElement>('.gs-curse-tab[data-curse="card:40"]')!;
      expect(tab).toBeTruthy();
      expect(tab.textContent).toContain("Curse of the Pierced Heart");
      expect(bob.querySelector(".gs-curse-tab")).toBeNull();
      // The card stays on the table on Bob's side (the board draws it).
      const onTable = c.querySelector<HTMLElement>('.bf-board [data-object-id="card:40"]')!;
      expect(onTable).toBeTruthy();
      expect(onTable.closest(".bf-slot")).toBeTruthy();
      // It unfolded (no pop) and the thread ran once.
      expect(animations.some((a) => a.element === tab)).toBe(true);
      expect(tab.dataset.glowing).toBeUndefined();
      send(state(seat, { battlefield: [curse], stack: [upkeep], phase: "UPKEEP" }));
      const glowing = alice.querySelector<HTMLElement>('.gs-curse-tab[data-curse="card:40"]')!;
      expect(glowing.dataset.glowing).toBe("true");
      expect(
        animations.some(
          (a) => a.element === glowing && JSON.stringify(a.frames).includes("rgb(241 195 106"),
        ),
      ).toBe(true);
    });

  it("a spectator (the public view) sees the tab on Alice's plate, the card among Bob's", () => {
    const c = render(<GameScreen match={match} me="u-9" watching onLeave={() => {}} />).container;
    const watch = { spectator: true, viewFrom: 1 };
    send(state(1, { ...watch, battlefield: [] }));
    send(state(1, { ...watch, battlefield: [curse] }));
    const alice = c.querySelector<HTMLElement>('.gs-seat[data-seat="1"]')!;
    const bob = c.querySelector<HTMLElement>('.gs-seat[data-seat="2"]')!;
    expect(alice.querySelector('.gs-curse-tab[data-curse="card:40"]')).toBeTruthy();
    expect(bob.querySelector(".gs-curse-tab")).toBeNull();
    expect(c.querySelector('.bf-board [data-object-id="card:40"]')).toBeTruthy();
  });

  it("two Curses: two tabs", () => {
    const c = open("u-1");
    const other = { ...curse, id: "card:41", name: "Curse of Thirst" };
    send(state(1, { battlefield: [curse, other] }));
    expect(c.querySelectorAll('.gs-seat[data-seat="1"] .gs-curse-tab')).toHaveLength(2);
  });
});

// --- F-0100-C, the screen's part ---------------------------------------------------------------------

describe("F-0100-C · the X medallion flies with the card; the close-up's words", () => {
  const fireball = card("card:50", 2, "Fireball", {
    kind: "other",
    types: "Sorcery",
    manaCost: "{X}{R}",
    power: null,
    toughness: null,
  });
  const onStack = {
    id: "stack:9",
    kind: "spell",
    source: "card:50",
    controller: 2,
    name: "Fireball",
    description: "Fireball deals 6 damage divided evenly...",
    manaCost: "{X}{R}",
    x: 6,
    targets: [{ player: 1 }],
  };
  it("Bob's Fireball X=6: the card flying to the stack wears the X=6 medallion", () => {
    const c = open("u-1");
    send(state(1, { phase: "MAIN1", activeSeat: 2 }));
    send(state(1, { phase: "MAIN1", activeSeat: 2, casting: [fireball] }));
    send(
      state(1, {
        phase: "MAIN1",
        activeSeat: 2,
        stack: [onStack],
        moves: [
          { card: "card:50", from: { zone: "hand", seat: 2 }, to: { zone: "stack", seat: 2 } },
        ],
      }),
    );
    const flying = c.querySelector<HTMLElement>(".gs-cast-leaving .gs-cast-xmed");
    expect(flying).toBeTruthy();
    expect(flying!.textContent).toBe("X=6");
  });

  it("the close-up says X is 6", () => {
    const c = open("u-1");
    send(state(1, { phase: "MAIN1", stack: [onStack] }));
    fireEvent.click(c.querySelector<HTMLElement>('[data-object-id="stack:9"]')!);
    expect(c.querySelector('[data-close-x="6"]')!.textContent).toBe("X is 6");
  });

  it("the close-up lists the modes (chosen and not) and the extra costs", () => {
    const c = open("u-1");
    const cryptic = {
      ...onStack,
      name: "Cryptic Command",
      x: undefined,
      modes: [
        { text: "Counter target spell.", chosen: false },
        { text: "Draw a card.", chosen: true },
      ],
      extra: ["kicked"],
    };
    send(state(1, { phase: "MAIN1", stack: [cryptic] }));
    fireEvent.click(c.querySelector<HTMLElement>('[data-object-id="stack:9"]')!);
    const modes = [...c.querySelectorAll<HTMLElement>(".gs-inspect-modes li")];
    expect(modes.map((m) => m.dataset.mode)).toEqual(["not-chosen", "chosen"]);
    expect(modes[1]!.textContent).toBe("Draw a card.");
    expect(c.querySelector("[data-close-extra]")!.textContent).toBe("Kicked");
  });
});

// --- item 9: the life shield follows the entry in focus --------------------------------------------

describe("item 9 · the life shield follows the stack card pointed at", () => {
  it("Bob's Shock at Alice under his Murder: pointing at the Shock lights Alice's shield", () => {
    const c = open("u-1");
    const bears = card("card:61", 1, "Grizzly Bears", { power: 2, toughness: 2 });
    const murder = {
      id: "stack:8",
      kind: "spell",
      source: "card:70",
      controller: 2,
      name: "Murder",
      description: "Murder",
      targets: [{ object: "card:61" }],
    };
    const shock = {
      ...murder,
      id: "stack:7",
      source: "card:71",
      name: "Shock",
      targets: [{ player: 1 }],
    };
    send(state(1, { phase: "MAIN1", battlefield: [bears], stack: [murder, shock] }));
    const shield = () => c.querySelector<HTMLElement>('.gs-seat[data-seat="1"] .gs-life')!;
    expect(shield().className).not.toContain("gs-targeted");
    fireEvent.pointerEnter(c.querySelector<HTMLElement>('[data-object-id="stack:7"]')!);
    expect(shield().className).toContain("gs-targeted");
  });
});

// --- item 8 (owner 2026-11-18): the board is held for the swing -------------------------------------

describe("item 8 · a spell's target changed: the next board waits for the swing", () => {
  const goblin = card("card:30", 2, "Goblin Guide", { power: 2, toughness: 2 });
  const skite = card("card:22", 2, "Spellskite", { power: 0, toughness: 4 });
  const bolt = (target: string) => ({
    id: "stack:5",
    kind: "spell",
    source: "card:9",
    controller: 1,
    name: "Lightning Bolt",
    description: "Lightning Bolt",
    targets: [{ object: target }],
  });
  const ability = {
    id: "stack:6",
    kind: "ability",
    source: "card:22",
    controller: 2,
    name: "Spellskite",
    description: "Change a target of target spell or ability to Spellskite.",
    targets: [{ object: "stack:5" }],
  };
  const boards = (c: HTMLElement) => {
    const table = { phase: "MAIN1", activeSeat: 1, battlefield: [goblin, skite] };
    send(state(1, { ...table, stack: [bolt(goblin.id)] }));
    send(state(1, { ...table, stack: [ability, bolt(goblin.id)] }));
    // The ability resolved: the Bolt now aims at Spellskite (the caster
    // cannot answer, so the next board, a third of a second later, has
    // the Bolt resolved).
    send(state(1, { ...table, stack: [bolt(skite.id)] }));
    send(state(1, { ...table, stack: [] }));
    return () => c.querySelector('[data-object-id="stack:5"]');
  };

  it("the Bolt stays on the stack, its beam swinging, until it lands; then the board moves on", () => {
    const c = open("u-1");
    const bolted = boards(c);
    expect(bolted(), "held: the Bolt still on the stack").toBeTruthy();
    const swing = c.querySelector("[data-swing]");
    expect(swing, "its beam swings to Spellskite").toBeTruthy();
    // It lands (its clock finishes): the held board goes, the Bolt resolves.
    const clock = animations.find((a) => a.element === swing)!.animation!;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(bolted(), "still held while it swings").toBeTruthy();
    expect(c.querySelector('.gs-seat[data-seat="2"]')).toBeTruthy();
    act(() => (clock.onfinish as unknown as () => void)());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(bolted()).toBeNull();
  });

  it("never held longer than SWING_HOLD_MS", () => {
    const c = open("u-1");
    const bolted = boards(c);
    expect(bolted()).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(bolted()).toBeNull();
  });
});
