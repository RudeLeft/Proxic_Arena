// @vitest-environment jsdom

// Spec 0102 -- the parts that are the game screen's: Karn's restart (F-0102-A:
// the window first, holding game 1's table until it is closed or 4 s pass;
// then every card sweeps into its OWNER's library, the libraries riffle, and
// game 2's deal plays; the restarter's page sweeps at once), Mindslaver
// (F-0102-C: "Playing for Alice", never a seat number; the gold chain round
// the controlled player's plate), and, fixed while building it, a board
// skipped during a hold giving its one-time moments to the board drawn. The
// real game screen, its socket replaced, handed the boards the worker sends.
// (Harness as fixes0089screen's.)

import { readFileSync } from "node:fs";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState, type Snapshot } from "../match";
import { endLifeSteps } from "./lifeTicks";
import { openingOf } from "./fromSnapshot";
import { RESTART_HOLD_MS, betweenGames } from "./restart";
import { carryMoments } from "./carry";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  closed: [] as number[],
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
      reportsClosed: (upTo: number) => socket.closed.push(upTo),
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
};
let animations: Recorded[] = [];
let reduce = false;
beforeEach(() => {
  animations = [];
  socket.closed = [];
  reduce = false;
  endLifeSteps();
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("CSSAnimation", class {});
  vi.stubGlobal("CSSTransition", class {});
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
    return {
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
  matchId: "m-102",
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
function message(m: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, m)));
}
function state(over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 12,
    phase: "MAIN1",
    activeSeat: 2,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 11, handCount: 1, libraryCount: 43, graveyardCount: 2 },
      { seat: 2, name: "Bob", life: 16, handCount: 2, libraryCount: 44, graveyardCount: 0 },
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
const card = (id: string, seat: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: "Creature",
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  known: true,
  ...over,
});
const runsOn = (el: Element | null) => animations.filter((a) => a.element === el);
/** The y a ghost's last keyframe puts it at. */
const endY = (el: Element) => {
  const t = String(runsOn(el).at(-1)?.frames.at(-1)?.transform ?? "");
  const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(t);
  return m ? Number(m[2]) : NaN;
};

// --- F-0102-A: Karn's restart ---------------------------------------------------------------------

// Game 1: Alice's Grizzly Bears and Bob's Serra Angel she has taken (owner
// Bob, on her side), Bob's Karn; her Opt in hand; Bob's two hidden cards;
// two cards in her graveyard. Bob's Karn −14 on the stack.
const bears = card("card:20", 1, "Grizzly Bears");
const angel = card("card:31", 1, "Serra Angel", { owner: 2 });
const karn = card("card:30", 2, "Karn Liberated", { kind: "planeswalker", types: "Planeswalker" });
const opt = card("card:21", 1, "Opt", { kind: "instant", types: "Instant" });
const ultimate = {
  id: "stack:5",
  kind: "ability",
  source: "card:30",
  controller: 2,
  name: "Karn Liberated",
  description: "Restart the game.",
  targets: [],
};
const game1 = (stack: unknown[] = []) =>
  state({
    battlefield: [bears, angel, karn],
    hand: [opt],
    graveyard: [card("card:40", 1, "Shock"), card("card:41", 1, "Opt")],
    stack,
  });
/** Game 2's first board: seven each dealt (ids kept: card:20 is in Alice's new hand). */
const newHand = Array.from({ length: 7 }, (_, i) =>
  card(`card:${i === 0 ? 20 : 50 + i}`, 1, `Forest ${i}`, { kind: "land", types: "Basic Land" }),
);
const restartReport = {
  key: "action:1",
  stamp: 1,
  by: 2,
  source: "Karn Liberated",
  said: "Bob restarted the game. This is game 2.",
  cards: [
    {
      id: "action:1:0",
      seat: 2,
      name: "Karn Liberated",
      kind: "planeswalker",
      types: "Planeswalker",
      known: true,
      faceDown: false,
    },
  ],
};
const game2 = (over: Record<string, unknown> = {}) =>
  state({
    gameEpoch: 2,
    turn: 0,
    phase: "",
    activeSeat: 2,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 7, libraryCount: 53, graveyardCount: 0 },
      { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 53, graveyardCount: 0 },
    ],
    hand: newHand,
    moves: [
      ...newHand.map((c) => ({
        card: c.id,
        from: { zone: "library", seat: 1 },
        to: { zone: "hand", seat: 1 },
      })),
      ...newHand.map(() => ({ from: { zone: "library", seat: 2 }, to: { zone: "hand", seat: 2 } })),
    ],
    ...over,
  });
const sweeps = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>("[data-ghost-of]")].filter(
    (g) => g.dataset.return === "library",
  );
const ghostOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-ghost-of="${id}"][data-return="library"]`);
const onTable = (c: HTMLElement, id: string) =>
  c.querySelector(`.bf-board [data-object-id="${id}"]:not(.bf-ghost)`);

describe("F-0102-A · Karn's restart: the window holds the table; the sweep to the owners' libraries; riffle; deal", () => {
  it("Alice's page: nothing moves while the window is open; Close sweeps every card to its OWNER's tile", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(game1());
    send(game1([ultimate]));
    send(game2({ action: restartReport }));
    // The window first, its bar draining over 4 s; game 1's table still drawn.
    const win = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(win.textContent).toContain("Bob restarted the game. This is game 2.");
    expect(c.querySelector<HTMLElement>(".gs-reveal-drain")!.style.animationDuration).toBe(
      `${RESTART_HOLD_MS}ms`,
    );
    expect(onTable(c, "card:30")).toBeTruthy();
    expect(sweeps(c)).toHaveLength(0);
    // No question over the held table (game 2's mulligan waits for its deal).
    message({
      type: "DECISION_REQUEST",
      decisionId: 3,
      actedForSeat: 1,
      stateVersion: revision,
      kind: "mulliganKeepHand",
      prompt: "Keep?",
      mandatory: true,
      options: [
        { actionId: "mulligan:keep", label: "Keep", objectId: null },
        { actionId: "mulligan:again", label: "Mulligan", objectId: null },
      ],
    });
    expect(c.querySelector(".gs-opening")).toBeNull();
    // Alice really closes it: the sweep.
    fireEvent.click(c.querySelector(".gs-reveal-close")!);
    expect(socket.closed).toEqual([1]);
    expect(onTable(c, "card:30")).toBeNull();
    expect(sweeps(c).length).toBeGreaterThanOrEqual(5);
    // Each glides home to its owner's tile: the Angel Alice had taken goes to
    // BOB's library (the top of the screen), her Bears to hers.
    const toBob = endY(ghostOf(c, "card:31")!);
    const toAlice = endY(ghostOf(c, "card:20")!);
    expect(toBob).toBeLessThan(400);
    expect(toAlice).toBeGreaterThan(500);
    expect(Math.abs(endY(ghostOf(c, "card:30")!) - toBob)).toBeLessThan(2);
    // One after another, all within about 1.5 s.
    const delays = sweeps(c).map((g) => Number(runsOn(g).at(-1)!.options.delay));
    expect(new Set(delays).size).toBe(delays.length);
    expect(Math.max(...delays)).toBeLessThan(1500);
    // Both libraries riffle once the cards are in.
    const riffles = [...c.querySelectorAll<HTMLElement>(".bf-return-riffle")];
    expect(riffles.some((r) => r.dataset.riffle === "library:viewer")).toBe(true);
    expect(riffles.some((r) => r.dataset.riffle === "library:opponent")).toBe(true);
    expect(
      Math.min(...riffles.map((r) => Number(runsOn(r).at(-1)?.options.delay))),
    ).toBeGreaterThan(Math.max(...delays));
    // The libraries count up as the cards land, to the game's numbers.
    expect(c.querySelector('[data-zone-tile="viewer:library"] .gs-zone-n')!.textContent).toBe("60");
    // Then game 2's board and 0089's deal: "−7" off each library.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(c.querySelector('[data-object-id="card:30"]')).toBeNull();
    const numbers = [...c.querySelectorAll<HTMLElement>('[data-fight="number"]')].map(
      (n) => n.textContent,
    );
    expect(numbers).toContain("−7");
    // ...and only now game 2's mulligan, in the opening-hand window.
    expect(c.querySelector(".gs-opening")).toBeTruthy();
    // The window stays until it was closed (it was): gone.
    expect(c.querySelector(".gs-reveal")).toBeNull();
  });

  it("4 s pass with the window open: the sweep plays, and the window stays open until closed", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(game1([ultimate]));
    send(game2({ action: restartReport }));
    act(() => {
      vi.advanceTimersByTime(RESTART_HOLD_MS - 100);
    });
    expect(sweeps(c)).toHaveLength(0);
    expect(onTable(c, "card:30")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(sweeps(c).length).toBeGreaterThanOrEqual(5);
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("restarted the game");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("restarted the game");
  });

  it("Bob's page (he restarted it, no window): the sweep at once, from the moment between the games", () => {
    const view = render(<GameScreen match={match} me="u-2" onLeave={() => {}} />);
    const c = view.container;
    const asBob = (s: Record<string, unknown>) => ({
      ...s,
      seat: 2,
      hand: [],
      otherHands: [],
    });
    send(asBob(game1()));
    send(asBob(game1([ultimate])));
    // The worker's own board of the moment between the games (epoch 1, turn 0).
    send(
      asBob(
        state({
          turn: 0,
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 60, graveyardCount: 0 },
            { seat: 2, name: "Bob", life: 20, handCount: 0, libraryCount: 60, graveyardCount: 0 },
          ],
        }),
      ),
    );
    expect(c.querySelector(".gs-reveal")).toBeNull();
    expect(sweeps(c).length).toBeGreaterThanOrEqual(3);
    // From Bob's seat his Karn and his Angel go to HIS library (the bottom).
    expect(endY(ghostOf(c, "card:31")!)).toBeGreaterThan(500);
    expect(endY(ghostOf(c, "card:20")!)).toBeLessThan(400);
    // Alice's hidden hand: backs, never a face.
    const backs = [...c.querySelectorAll<HTMLElement>('[data-ghost-of^="hidden-hand:"]')];
    for (const b of backs) expect(b.dataset.turn).toBe("back");
    // The sweep ends; game 2's board comes on the empty table: its deal
    // plays at once -- the same restart's second step, not a second sweep.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    animations = [];
    send(
      asBob(
        game2({
          seat: 2,
          hand: [],
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: 7, libraryCount: 53, graveyardCount: 0 },
            { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 53, graveyardCount: 0 },
          ],
        }),
      ),
    );
    // (The first sweep's ghosts stay in this harness: none glides anew.)
    expect(
      animations.filter((a) => (a.element as HTMLElement).dataset.return === "library"),
    ).toHaveLength(0);
    expect(
      [...c.querySelectorAll<HTMLElement>('[data-fight="number"]')].map((n) => n.textContent),
    ).toContain("−7");
  });

  it("reduce motion: no hold and no sweep -- the window, and game 2's table", () => {
    reduce = true;
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(game1([ultimate]));
    send(game2({ action: restartReport }));
    // (The other player's ability is held on the stack HOLD_MS, as any.)
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onTable(c, "card:30")).toBeNull();
    expect(sweeps(c)).toHaveLength(0);
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("restarted the game");
  });

  it("openingOf: game 2's deal after the empty table between the games, never across any other epoch change", () => {
    const parse = (s: Record<string, unknown>) =>
      reduceMatch({ board: null } as MatchState, {
        type: "MATCH_SNAPSHOT",
        state: s,
      }).board as Snapshot;
    const one = parse(game1());
    const two = parse(game2());
    expect(openingOf(two, one)).toBeNull();
    const between = { ...betweenGames(two), gameEpoch: 1 };
    const dealt = openingOf(two, between);
    expect(dealt?.sides.get("viewer")?.dealt).toBe(7);
    expect(dealt?.sides.get("opponent")?.dealt).toBe(7);
  });
});

// --- F-0102-C: Mindslaver ---------------------------------------------------------------------------

describe("F-0102-C · Mindslaver: 'Playing for Alice'; the chain round the controlled plate", () => {
  it("Bob's window heading names Alice, never a seat; the chain round Alice's plate with Mindslaver's square", () => {
    const view = render(<GameScreen match={match} me="u-2" onLeave={() => {}} />);
    const c = view.container;
    const slaver = card("card:60", 2, "Mindslaver", {
      kind: "artifact",
      types: "Legendary Artifact",
      art: "art-ms",
    });
    send(
      state({
        seat: 2,
        turn: 9,
        activeSeat: 1,
        players: [
          {
            seat: 1,
            name: "Alice",
            life: 20,
            handCount: 3,
            libraryCount: 40,
            controlledBy: 2,
            controlledFrom: "card:60",
          },
          { seat: 2, name: "Bob", life: 20, handCount: 3, libraryCount: 40 },
        ],
        graveyard: [slaver],
      }),
    );
    message({
      type: "DECISION_REQUEST",
      decisionId: 7,
      actedForSeat: 1,
      authorisedSeat: 2,
      stateVersion: revision,
      kind: "chooseSingleEntityForEffect",
      prompt: "Choose a card",
      mandatory: true,
      options: ["Island", "Forest", "Swamp", "Plains"].map((label, i) => ({
        actionId: `o:${i}`,
        label,
        objectId: null,
      })),
    });
    const headings = [...c.querySelectorAll("h2, h3, .gs-win-acting")].map((h) => h.textContent);
    expect(headings.some((h) => h?.includes("Playing for Alice"))).toBe(true);
    expect(headings.some((h) => /seat \d/.test(h ?? ""))).toBe(false);
    const chain = c.querySelector<HTMLElement>('.gs-seat[data-seat="1"] .gs-control')!;
    expect(chain).toBeTruthy();
    expect(chain.dataset.controlledBy).toBe("2");
    expect(chain.querySelector<HTMLElement>(".gs-control-sign")!.dataset.card).toBe("card:60");
    expect(c.querySelector('.gs-seat[data-seat="2"] .gs-control')).toBeNull();
  });

  it("no chain once control has ended", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send(state({ turn: 10 }));
    expect(view.container.querySelector(".gs-control")).toBeNull();
  });

  it("no heading in the game screen names a seat number", () => {
    const source = readFileSync("src/battlefield/GameScreen.tsx", "utf-8");
    expect(source).not.toMatch(/Playing for seat/);
  });
});

// --- Fixed while building: a skipped board's one-time moments -------------------------------------

describe("fixed while building 0102 · a board skipped during a hold gives its moments to the board drawn", () => {
  it("Bob's Murder held on the stack; the shield-counter save arrives and is passed at once by combat: the silver shield still plays", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    const agent = card("card:70", 1, "Wingshield Agent", {
      counters: [{ name: "SHIELD", count: 1 }],
    });
    const murder = {
      id: "stack:9",
      kind: "spell",
      source: "card:80",
      card: "card:80",
      controller: 2,
      name: "Murder",
      description: "",
      targets: [{ object: "card:70" }],
    };
    send(state({ battlefield: [agent] }));
    // Bob's Murder: the page holds this board (the other player's spell).
    send(state({ battlefield: [agent], stack: [murder] }));
    // It resolves: the shield counter saved the Agent (this board is passed...)
    const saved = { ...agent, counters: [] };
    send(state({ battlefield: [saved], survived: [{ card: "card:70", how: "shield" }] }));
    // ...by the next, in combat, inside the hold.
    send(state({ battlefield: [saved], phase: "COMBAT_DECLARE_ATTACKERS" }));
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    const silver = [...c.querySelectorAll<HTMLElement>('[data-fight="silvershield"]')].filter(
      (m) => m.dataset.of === "card:70",
    );
    expect(silver.length).toBeGreaterThan(0);
  });

  it("carryMoments: only boards never drawn, only cards still there, nothing twice", () => {
    const parse = (s: Record<string, unknown>) =>
      reduceMatch({ board: null } as MatchState, { type: "MATCH_SNAPSHOT", state: s })
        .board as Snapshot;
    const a = card("card:70", 1, "Wingshield Agent");
    const skipped = parse(
      state({
        battlefield: [a],
        survived: [
          { card: "card:70", how: "shield" },
          { card: "card:71", how: "indestructible" },
        ],
      }),
    );
    const drawn = parse(state({ battlefield: [a] }));
    const carried = carryMoments(drawn, [skipped]);
    expect(carried.survived).toEqual([{ card: "card:70", how: "shield" }]);
    // A later board (or the same) carries nothing back.
    expect(carryMoments(skipped, [drawn])).toBe(skipped);
    expect(carryMoments(drawn, [])).toBe(drawn);
  });
});
