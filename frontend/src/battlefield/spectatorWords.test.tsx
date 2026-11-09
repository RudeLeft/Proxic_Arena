// @vitest-environment jsdom

// Spec 0067 -- a spectator is nobody's "you". Every word the game screen
// says to a spectator names the players: the fights' captions, the stack's
// line, the move pill and its step, the step ladder, the trays, the plates'
// screen-reader words, the result -- before and after Switch sides. A
// player's own screen keeps "you" (checked last, so the test bites both
// ways).

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
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

/** Every animation the board starts: its marks (the fights' captions) are drawn from them. */
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
    return {
      finished: new Promise(() => {}),
      onfinish: null,
      oncancel: null,
      cancel() {},
      finish() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0 }) },
    };
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 1080,
});

const match: MatchView = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1" },
    { seatNumber: 2, userId: "u-2" },
  ],
  outcome: null,
} as unknown as MatchView;

const creature = (id: string, seat: number, name: string, extra: object = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  known: true,
  kind: "creature",
  types: "Creature — Bear",
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  ...extra,
});

let rev = 1;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
  heard.push(words(document.body));
  // Past any board held on screen (another player's spell is shown a moment).
  act(() => {
    vi.advanceTimersByTime(2_000);
  });
  heard.push(words(document.body));
}

/** What the screen said after every message, so a moment that passes is checked too. */
const heard: string[] = [];
function board(more: Record<string, unknown>, spectator = true, life: [number, number] = [20, 20]) {
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: rev++,
      gameEpoch: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 1,
      prioritySeat: 1,
      seat: spectator ? 0 : 1,
      ...(spectator ? { spectator: true, viewFrom: 1 } : {}),
      players: [
        {
          seat: 1,
          name: "Alice",
          life: life[0],
          handCount: 4,
          libraryCount: 40,
          graveyardCount: 0,
        },
        { seat: 2, name: "Bob", life: life[1], handCount: 3, libraryCount: 40, graveyardCount: 0 },
      ],
      battlefield: [creature("card:1", 1, "Grizzly Bears"), creature("card:2", 2, "Hill Giant")],
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...more,
    },
  });
}

/** Everything the screen says: its text and every label a screen reader reads. */
function words(root: Element): string {
  const labels = [...root.querySelectorAll("[aria-label], [title]")].map(
    (el) => `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`,
  );
  return `${root.textContent ?? ""} ${labels.join(" ")}`.replace(/\s+/g, " ");
}

/** A player's words that are not a spectator's: you, your, yours, opponent, "their turn", "their <card>". */
const PLAYER_WORDS =
  /\byou\b|\byour\b|\byours\b|\byou're\b|\bopponent|\btheir turn\b|\btheir (Grizzly|Hill|Lightning)/i;

function playMoments(spectator: boolean) {
  // Bob's turn, Bob deciding: the move pill and its step.
  board({ activeSeat: 2, prioritySeat: 2 }, spectator);
  send({ type: "MATCH_ASKING", seat: 2 });
  // Bob casts Lightning Bolt at Alice; Bob is asked.
  board(
    {
      activeSeat: 2,
      prioritySeat: 2,
      stack: [
        {
          id: "stack:1",
          name: "Lightning Bolt",
          controller: 2,
          kind: "spell",
          targets: [{ player: 1 }],
        },
      ],
    },
    spectator,
  );
  send({ type: "MATCH_ASKING", seat: 2, doing: "Choosing" });
  // A trigger of Alice's on the stack.
  board(
    {
      stack: [
        { id: "stack:2", name: "Soul Warden", controller: 1, kind: "trigger", source: "card:1" },
      ],
    },
    spectator,
  );
  send({ type: "MATCH_ASKING", seat: 1 });
  // Combat: Alice's Grizzly Bears hits Bob; Bob's Hill Giant is unblocked at Alice later.
  board(
    {
      phase: "COMBAT_DAMAGE",
      battlefield: [
        creature("card:1", 1, "Grizzly Bears", { attacking: true, tapped: true }),
        creature("card:2", 2, "Hill Giant"),
      ],
      combat: { attackers: [{ id: "card:1", target: { player: 2 } }], blocks: [] },
      damage: {
        key: `damage:${rev}`,
        combat: "regular",
        hits: [{ source: "card:1", target: { player: 2 }, amount: 2 }],
        fights: [{ attacker: "card:1", defender: { player: 2 }, blockers: [] }],
      },
    },
    spectator,
    [20, 18],
  );
}

describe("a spectator is nobody's you (spec 0067)", () => {
  it("names the players through a cast, a trigger, combat and the end -- both sides round", () => {
    const view = render(<GameScreen match={match} me="u-9" watching onLeave={() => {}} />);
    heard.length = 0;
    playMoments(true);
    const said = heard.join(" ");
    // The moments did reach the screen, in names.
    expect(said).toContain("Alice");
    expect(said).toMatch(/Damage · Alice's Grizzly Bears hit Bob/);
    expect(said).toContain("Main 1 · Bob’s turn");
    expect(said).toContain("Next: Alice's trigger");
    expect(said).not.toMatch(PLAYER_WORDS);

    // Switch sides: Bob at the bottom, still nobody's "you".
    fireEvent.click(view.getByRole("button", { name: "Switch sides" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(view.container.querySelector(".gs-seat-viewer")?.getAttribute("data-seat")).toBe("2");
    heard.length = 0;
    playMoments(true);
    const turned = heard.join(" ");
    expect(turned).toMatch(/Damage · Alice's Grizzly Bears hit Bob/);
    expect(turned).not.toMatch(PLAYER_WORDS);

    // The end: who won and why, by name.
    board({}, true, [20, -3]);
    send({
      type: "MATCH_ENDED",
      matchId: "m-1",
      status: "ENDED",
      outcome: "WINNER",
      winningSeat: 1,
      endedOnTurn: 9,
      lossReason: "LifeReachedZero",
    });
    const ended = words(view.container);
    expect(ended).toContain("Alice won");
    expect(ended).toContain("Bob’s life fell to -3");
    expect(ended).not.toMatch(PLAYER_WORDS);
  });

  it("a player's own screen still says you (the test bites)", () => {
    render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    heard.length = 0;
    playMoments(false);
    expect(heard.join(" ")).toMatch(/Damage · your Grizzly Bears hit Bob/);
    expect(heard.join(" ")).toMatch(PLAYER_WORDS);
  });
});
