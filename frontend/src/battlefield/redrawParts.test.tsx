// @vitest-environment jsdom

// Phase 11 P11-C4 -- a board update draws again only the parts whose data
// changed: a land tapping leaves both plates as they were (each plate draws
// its player's picture, avatarOf, once per drawing), and a plate whose
// player changed is drawn again, with what changed.

import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
const drawn = vi.hoisted(() => ({ plates: 0 }));
vi.mock("../lobbyView", async (original) => {
  const real = await original<typeof import("../lobbyView")>();
  return {
    ...real,
    avatarOf: (...args: Parameters<typeof real.avatarOf>) => {
      drawn.plates += 1;
      return real.avatarOf(...args);
    },
  };
});

const { GameScreen } = await import("./GameScreen");

beforeEach(() => {
  drawn.plates = 0;
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
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

const forest = (id: string, tapped: boolean) => ({
  id,
  name: "Forest",
  kind: "land",
  types: "Basic Land - Forest",
  makes: ["G"],
  seat: 1,
  owner: 1,
  known: true,
  faceDown: false,
  tapped,
});

function board(rev: number, tapped: boolean, bobLife = 20) {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "MATCH_SNAPSHOT",
        state: {
          stateRevision: rev,
          gameEpoch: 1,
          turn: 5,
          phase: "MAIN1",
          activeSeat: 1,
          prioritySeat: 1,
          seat: 1,
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 50 },
            { seat: 2, name: "Bob", life: bobLife, handCount: 6, libraryCount: 50 },
          ],
          battlefield: [forest("card:1", tapped), forest("card:2", false)],
          hand: [],
          graveyard: [],
          exile: [],
          stack: [],
        },
      }),
    ),
  );
}

const lifeOf = (c: HTMLElement, seat: number) =>
  c.querySelector(`.gs-life[data-object-id="player:${seat}"]`)?.getAttribute("data-life");

describe("P11-C4: a board update draws only what changed", () => {
  it("leaves both plates as they were when only a land taps", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    board(10, false);
    expect(view.container.querySelectorAll(".gs-seat")).toHaveLength(2);
    const before = drawn.plates;
    expect(before).toBeGreaterThan(0);
    board(11, true);
    board(12, false);
    expect(drawn.plates).toBe(before);
  });

  it("draws a plate again when its player's life changes, and shows it", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    board(10, false);
    const before = drawn.plates;
    board(11, false, 17);
    expect(drawn.plates).toBe(before + 1);
    expect(lifeOf(view.container, 2)).toBe("17");
    expect(lifeOf(view.container, 1)).toBe("20");
  });
});
