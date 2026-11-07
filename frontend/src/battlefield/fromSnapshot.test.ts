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

  // Phase 10 A-10 -- as the Lab measured them (seat 2's snapshots).
  it("a meld: the partner exiled `into` the melded card is one merge, not a departure guessed", () => {
    const ratsAndScavengers = snapshot(1, {
      battlefield: [card("card:12", 1, "Graf Rats"), card("card:28", 1, "Midnight Scavengers")],
    });
    const after = snapshot(2, {
      battlefield: [card("card:12", 1, "Chittering Host")],
      moves: [
        { card: "card:12", from: { zone: "battlefield", seat: 1 }, to: { zone: "exile", seat: 1 } },
        {
          card: "card:28",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "exile", seat: 1 },
          into: "card:12",
        },
        { card: "card:12", from: { zone: "exile", seat: 1 }, to: { zone: "battlefield", seat: 1 } },
      ],
    });
    expect(after.moves?.[1]?.into).toBe("card:12");
    const board = boardFromSnapshot(after, ratsAndScavengers);
    expect([...board.merges]).toEqual([["card:12", { kind: "meld", partners: ["card:28"] }]]);
    // The Rats never left as far as the board is concerned: no arrival.
    expect(board.arrivals.has("card:12")).toBe(false);
  });

  it("a mutate: the spell gone to the merged zone `into` its creature", () => {
    const after = snapshot(2, {
      battlefield: [card("card:13", 1, "Gemrazer")],
      moves: [
        {
          card: "card:19",
          from: { zone: "stack" },
          to: { zone: "merged", seat: 1 },
          into: "card:13",
        },
      ],
    });
    const board = boardFromSnapshot(
      after,
      snapshot(1, { battlefield: [card("card:13", 1, "Grizzly Bears")] }),
    );
    expect(board.merges.get("card:13")).toEqual({ kind: "mutate", partners: ["card:19"] });
  });

  it("no merge without the game saying so: a rename and a card exiled are not guessed into one", () => {
    const after = snapshot(2, {
      battlefield: [card("card:12", 1, "Chittering Host")],
      moves: [
        { card: "card:28", from: { zone: "battlefield", seat: 1 }, to: { zone: "exile", seat: 1 } },
      ],
    });
    expect(boardFromSnapshot(after, before).merges.size).toBe(0);
    // Nor into a permanent this viewer's board does not have.
    const elsewhere = snapshot(3, {
      battlefield: [],
      moves: [
        {
          card: "card:19",
          from: { zone: "stack" },
          to: { zone: "merged", seat: 1 },
          into: "card:13",
        },
      ],
    });
    expect(boardFromSnapshot(elsewhere, before).merges.size).toBe(0);
  });
});
