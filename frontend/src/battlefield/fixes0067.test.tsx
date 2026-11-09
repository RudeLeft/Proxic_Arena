// @vitest-environment jsdom

// Spec 0067 -- life that steps per hit (F-0067-A), negative life (F-0067-B,
// the words are stops.test.ts), Switch sides (F-0067-F), a spectator told
// the end and who is watching (match state; the socket's no-retry is
// reconnect.test.ts), and the lobby's Starting... / Spectate (F-0067-G).

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { planFights, type CombatWave, type Stand } from "./fights";
import type { Box } from "./layout";
import {
  endLifeSteps,
  lifeSteps,
  lifeStillPlaying,
  shownLife,
  startLifeSteps,
  useShownLife,
} from "./lifeTicks";
import { lifeIsLong, turnedRound } from "./GameScreen";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import { EMPTY_LOBBY, reduceLobby } from "../lobby";
import { RoomCard } from "../LobbyPage";

const box = (x: number, y: number): Box => ({ x, y, w: 100, h: 140, scale: 1, rotation: 0, z: 1 });

/** Alice's Grizzly Bears (2), Hill Giant (3) and Serra Angel (4) attack Bob; he does not block. */
function threeAttackers() {
  const stands: Record<string, Stand> = {
    "card:1": { box: box(200, 300), item: "card:1", name: "Grizzly Bears", seat: 1, count: 1 },
    "card:2": { box: box(320, 300), item: "card:2", name: "Hill Giant", seat: 1, count: 1 },
    "card:3": { box: box(440, 300), item: "card:3", name: "Serra Angel", seat: 1, count: 1 },
  };
  const wave: CombatWave = {
    key: "damage:9",
    combat: "regular",
    hits: [
      { source: "card:1", target: { player: 2 }, amount: 2 },
      { source: "card:2", target: { player: 2 }, amount: 3 },
      { source: "card:3", target: { player: 2 }, amount: 4 },
    ],
    fights: ["card:1", "card:2", "card:3"].map((attacker) => ({
      attacker,
      defender: { player: 2 },
      blockers: [],
    })),
  };
  return planFights({
    wave,
    at: (id) => stands[id] ?? null,
    life: () => ({ x: 1750, y: 120 }),
    lifeR: 27,
    viewerSeat: 1,
    opponentName: "Bob",
  })!;
}

afterEach(() => endLifeSteps());

describe("life steps down per hit (F-0067-A)", () => {
  it("holds the life from before the damage and drops at each attacker's impact", () => {
    const plan = threeAttackers();
    const steps = lifeSteps(plan);
    expect(steps.map((s) => [s.seat, s.amount])).toEqual([
      [2, -2],
      [2, -3],
      [2, -4],
    ]);
    // Each step is its own fight's impact, in order.
    expect(steps.map((s) => s.at)).toEqual(plan.fights.map((f) => f.impact));
    // Bob's board says 11; the plate reads 20, 18, 15, 11 as the blows land.
    const at = (t: number) => shownLife(11, steps, 2, t);
    expect(at(0)).toBe(20);
    expect(at(steps[0]!.at - 1)).toBe(20);
    expect(at(steps[0]!.at)).toBe(18);
    expect(at(steps[1]!.at)).toBe(15);
    expect(at(steps[2]!.at)).toBe(11);
    expect(at(plan.total)).toBe(11);
    // Alice's plate is not touched.
    expect(shownLife(20, steps, 1, 0)).toBe(20);
  });

  it("a pile of identical tokens is one step for its total", () => {
    const pile: Stand = { box: box(300, 300), item: "card:5", name: "Soldier", seat: 1, count: 5 };
    const wave: CombatWave = {
      key: "damage:10",
      combat: "regular",
      hits: [5, 6, 7, 8, 9].map((n) => ({ source: `card:${n}`, target: { player: 2 }, amount: 1 })),
      fights: [5, 6, 7, 8, 9].map((n) => ({
        attacker: `card:${n}`,
        defender: { player: 2 },
        blockers: [],
      })),
    };
    const plan = planFights({
      wave,
      at: () => pile,
      life: () => ({ x: 1750, y: 120 }),
      lifeR: 27,
      viewerSeat: 1,
      opponentName: "Bob",
    })!;
    expect(lifeSteps(plan).map((s) => s.amount)).toEqual([-5]);
  });

  it("lifelink adds when its blow lands", () => {
    const stands: Record<string, Stand> = {
      "card:1": { box: box(200, 300), item: "card:1", name: "Vampire", seat: 1, count: 1 },
    };
    const plan = planFights({
      wave: {
        key: "damage:11",
        combat: "regular",
        hits: [{ source: "card:1", target: { player: 2 }, amount: 3 }],
        fights: [{ attacker: "card:1", defender: { player: 2 }, blockers: [] }],
        gains: [{ player: 1, amount: 3, source: "card:1" }],
      },
      at: (id) => stands[id] ?? null,
      life: () => ({ x: 1750, y: 120 }),
      lifeR: 27,
      viewerSeat: 1,
      opponentName: "Bob",
    })!;
    const steps = lifeSteps(plan, 100);
    const impact = plan.fights[0]!.impact + 100;
    expect(shownLife(23, steps, 1, impact - 1)).toBe(20);
    expect(shownLife(23, steps, 1, impact)).toBe(23);
    expect(shownLife(17, steps, 2, impact)).toBe(17);
  });

  it("a plate follows the fight clock, and settles at once when the clock ends or is hurried", () => {
    const steps = lifeSteps(threeAttackers());
    let t = 0;
    function Plate() {
      const shown = useShownLife(2, 11);
      return <span data-testid="life">{shown.life}</span>;
    }
    render(<Plate />);
    expect(screen.getByTestId("life").textContent).toBe("11");
    act(() => startLifeSteps(() => t, steps));
    expect(screen.getByTestId("life").textContent).toBe("20");
    act(() => {
      t = steps[0]!.at;
      // A new damage step carries what is still to come onto its own clock.
      expect(lifeStillPlaying().map((s) => s.amount)).toEqual([-3, -4]);
      startLifeSteps(() => t, steps);
    });
    expect(screen.getByTestId("life").textContent).toBe("18");
    // A click hurries the fights to their end: the board's number.
    act(() => endLifeSteps());
    expect(screen.getByTestId("life").textContent).toBe("11");
  });
});

describe("negative life (F-0067-B)", () => {
  it("three characters shrink the number to fit the shield", () => {
    expect(lifeIsLong(-12)).toBe(true);
    expect(lifeIsLong(100)).toBe(true);
    expect(lifeIsLong(-3)).toBe(false);
    expect(lifeIsLong(20)).toBe(false);
  });

  it("a negative total reaches the plate as the board has it", () => {
    const state = reduceMatch(EMPTY_MATCH, {
      type: "MATCH_SNAPSHOT",
      state: {
        stateRevision: 4,
        seat: 1,
        players: [
          { seat: 1, name: "Alice", life: 14 },
          { seat: 2, name: "Bob", life: -3 },
        ],
        battlefield: [],
      },
    });
    expect(state.board?.players.find((p) => p.seat === 2)?.life).toBe(-3);
  });
});

describe("Switch sides (F-0067-F)", () => {
  const publicView = {
    stateRevision: 3,
    seat: 1,
    spectator: true,
    players: [
      { seat: 1, name: "Alice", life: 14, handCount: 4 },
      { seat: 2, name: "Bob", life: 9, handCount: 2 },
    ],
    hand: [],
    battlefield: [{ id: "card:4", seat: 2, name: "Grizzly Bears" }],
  } as unknown as Snapshot;

  it("turns the table round for a spectator and changes nothing else", () => {
    const turned = turnedRound(publicView, true)!;
    expect(turned.seat).toBe(2);
    expect(turned.battlefield).toBe(publicView.battlefield);
    expect(turned.hand).toEqual([]);
    expect(turnedRound(publicView, false)).toBe(publicView);
    // A player's own board is never turned.
    const mine = { ...publicView, spectator: undefined } as unknown as Snapshot;
    expect(turnedRound(mine, true)).toBe(mine);
  });
});

describe("a spectator is told the end and who is watching (F-0067-C, F-0067-H)", () => {
  it("reads MATCH_ENDED: who won and why, by seat", () => {
    const state = reduceMatch(EMPTY_MATCH, {
      type: "MATCH_ENDED",
      matchId: "m-1",
      status: "ENDED",
      outcome: "WINNER",
      winningSeat: 1,
      endedOnTurn: 9,
      lossReason: "LifeReachedZero",
    });
    expect(state.ended).toEqual({
      matchId: "m-1",
      status: "ENDED",
      failureCode: null,
      outcome: {
        kind: "WINNER",
        winningSeat: 1,
        endedOnTurn: 9,
        reason: null,
        concededSeat: null,
        lossReason: "LifeReachedZero",
      },
    });
  });

  it("reads who is watching, by name", () => {
    const state = reduceMatch(EMPTY_MATCH, {
      type: "WATCHING",
      count: 2,
      names: ["Carol", "Dave"],
    });
    expect(state.watching).toBe(2);
    expect(state.watchers).toEqual(["Carol", "Dave"]);
  });
});

describe("the lobby: Starting... until the board is up, then Spectate (F-0067-G)", () => {
  const rooms = (spectatable: boolean) =>
    reduceLobby(EMPTY_LOBBY, {
      type: "ROOMS",
      rooms: [
        {
          roomId: "r1",
          name: "Alice's room",
          hostUserId: "u1",
          status: "IN_MATCH",
          desiredPlayerCount: 2,
          spectatable,
          seats: [
            { seatNumber: 1, userId: "u1", displayName: "Alice", ready: false, isHost: true },
            { seatNumber: 2, userId: "u2", displayName: "Bob", ready: false, isHost: false },
          ],
        },
      ],
    });
  const card = (spectatable: boolean, me = "u3") => {
    const lobby = rooms(spectatable);
    return render(
      <MemoryRouter>
        <RoomCard
          room={lobby.rooms[0]!}
          lobby={lobby}
          me={me}
          now={Date.now()}
          onAccept={() => {}}
          onDecline={() => {}}
          onAsk={() => {}}
          onCancelAsk={() => {}}
        />
      </MemoryRouter>,
    );
  };

  it("a greyed Starting... while the players load and choose their hands", () => {
    card(false);
    expect(screen.getByRole("button", { name: "Starting…" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("link", { name: /Spectate/ })).toBeNull();
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("Spectate with a LIVE badge once the board is up", () => {
    card(true);
    const link = screen.getByRole("link", { name: /Spectate/ });
    expect(link.getAttribute("href")).toBe("/watch/r1");
    expect(link.textContent).toBe("Spectate");
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Starting…" })).toBeNull();
  });

  it("never for your own game, and never a watchable checkbox or 'said no' note", () => {
    card(true, "u1");
    expect(screen.queryByRole("link", { name: /Spectate/ })).toBeNull();
    expect(screen.queryByText(/said no watching/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
