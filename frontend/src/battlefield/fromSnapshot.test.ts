// Phase 10 A-00 -- the board takes each card's destination from the game's
// own move record; it compares boards (and guessed) only without one.
import { describe, expect, it } from "vitest";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import { boardFromSnapshot } from "./fromSnapshot";

const card = (id: string, seat: number, name: string) => ({
  id,
  seat,
  name,
  tapped: false,
  faceDown: false,
  known: true,
});

function snapshot(revision: number, state: Record<string, unknown>): Snapshot {
  const reduced = reduceMatch(EMPTY_MATCH, {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 4,
      phase: "MAIN1",
      activeSeat: 1,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 3, libraryCount: 50 },
      ],
      battlefield: [],
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...state,
    },
  });
  return reduced.board!;
}

const before = snapshot(1, {
  battlefield: [
    card("card:7", 2, "Grizzly Bears"),
    card("card:8", 2, "Leashling"),
    card("card:9", 1, "Walking Corpse"),
  ],
});

describe("where a card went (Phase 10 A-00)", () => {
  it("goes where the game says: a library, the other player's hand, a graveyard", () => {
    const after = snapshot(2, {
      battlefield: [],
      graveyard: [card("card:9", 1, "Walking Corpse")],
      moves: [
        {
          card: "card:7",
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "library", seat: 2 },
        },
        { card: "card:8", from: { zone: "battlefield", seat: 2 }, to: { zone: "hand", seat: 2 } },
        {
          card: "card:9",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "sacrificed",
        },
      ],
    });
    const board = boardFromSnapshot(after, before);
    expect(board.departures.get("card:7")).toBe("opponent:library");
    expect(board.departures.get("card:8")).toBe("opponent:hand");
    expect(board.departures.get("card:9")).toBe("viewer:graveyard");
    expect(after.moves?.[2]?.why).toBe("sacrificed");
  });

  it("without the game's record, guesses as before (exile for a card gone from sight)", () => {
    const after = snapshot(2, { battlefield: [] });
    const board = boardFromSnapshot(after, before);
    expect(board.departures.get("card:7")).toBe("opponent:exile");
  });

  it("comes from where the game says: a graveyard, a library", () => {
    const empty = snapshot(1, { battlefield: [] });
    const after = snapshot(2, {
      battlefield: [card("card:20", 1, "Gravecrawler"), card("card:21", 1, "Forest")],
      moves: [
        {
          card: "card:20",
          from: { zone: "graveyard", seat: 1 },
          to: { zone: "battlefield", seat: 1 },
        },
        {
          card: "card:21",
          from: { zone: "library", seat: 1 },
          to: { zone: "battlefield", seat: 1 },
        },
      ],
    });
    const board = boardFromSnapshot(after, empty);
    expect(board.arrivals.get("card:20")).toBe("viewer:graveyard");
    expect(board.arrivals.get("card:21")).toBe("viewer:library");
  });

  it("reads a move that names no card (the other player drew) without failing", () => {
    const after = snapshot(2, {
      battlefield: before.battlefield,
      moves: [{ from: { zone: "library", seat: 2 }, to: { zone: "hand", seat: 2 } }],
    });
    expect(after.moves?.[0]?.card).toBeNull();
    expect(boardFromSnapshot(after, before).departures.size).toBe(0);
  });
});
