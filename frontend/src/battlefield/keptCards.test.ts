// P11-C2 (2026-11-25) -- each update is read for what changed, not in full.
//
// A card nothing happened to is the SAME object from the socket onward: the
// delta's rebuild keeps its row (delta.ts applyDelta), the page reads a row
// once (match.ts keptCards), the board draws a card once (fromSnapshot.ts
// tableCards, keptHandCard) and keepCards then sees it at a glance. These
// tests hold that end to end, that everything read from two boards (where a
// card went, the one-time moments carried across a skipped board) still comes
// out as before, and that a drawing is made again whenever what it reads
// changed (combat, a prepared spell, a held card, a partner, a count used up).

import { describe, expect, it } from "vitest";
import { deltaOf } from "../delta";
import { EMPTY_MATCH, reduceMatch, type MatchState, type Snapshot } from "../match";
import { carryMoments } from "./carry";
import { boardFromSnapshot, keepCards, tableCards, type BoardData } from "./fromSnapshot";
import { sizeChanges } from "./sizeTicks";

type Row = Record<string, unknown>;

const card = (id: string, seat: number, name: string, more: Row = {}): Row => ({
  id,
  seat,
  name,
  kind: "creature",
  types: "Creature - Bear",
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  known: true,
  ...more,
});

function board(revision: number, more: Row = {}): Row {
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 4,
    phase: "MAIN1",
    activeSeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 50 },
      { seat: 2, name: "Bob", life: 20, handCount: 3, libraryCount: 50 },
    ],
    battlefield: [
      card("card:1", 1, "Forest", { kind: "land", types: "Basic Land - Forest" }),
      card("card:2", 1, "Grizzly Bears"),
      card("card:3", 2, "Runeclaw Bear"),
    ],
    hand: [card("card:10", 1, "Giant Growth", { kind: "instant" })],
    graveyard: [],
    exile: [],
    stack: [],
    ...more,
  };
}

/** A page's match state fed as the server feeds it: whole first, then MATCH_DELTAs, through the wire (JSON). */
function page() {
  let state: MatchState = EMPTY_MATCH;
  let base: Row | null = null;
  const take = (message: Row) => {
    state = reduceMatch(state, JSON.parse(JSON.stringify(message)) as Row);
    expect(state.resync ?? false).toBe(false);
    return state.board!;
  };
  return {
    whole(b: Row): Snapshot {
      base = b;
      return take({ type: "MATCH_SNAPSHOT", state: b });
    },
    delta(b: Row): Snapshot {
      const from = base!;
      base = b;
      return take({
        type: "MATCH_DELTA",
        gameEpoch: b["gameEpoch"],
        from: from["stateRevision"],
        to: b["stateRevision"],
        ...deltaOf(from, b),
      });
    },
  };
}

/** GameScreen's data memo, as it is: carryMoments, boardFromSnapshot, keepCards. */
function drawer() {
  let previous: Snapshot | null = null;
  let data: BoardData | null = null;
  return (s: Snapshot, skipped: Snapshot[] = []): BoardData => {
    data = keepCards(boardFromSnapshot(carryMoments(s, skipped), previous), data);
    previous = s;
    return data;
  };
}

const tap = (b: Row, id: string): Row => ({
  ...b,
  battlefield: (b["battlefield"] as Row[]).map((c) =>
    c["id"] === id ? { ...c, tapped: true } : c,
  ),
});

describe("a card nothing happened to is the same object end to end (P11-C2)", () => {
  it("one land tapping: the other cards are the same objects from the socket to the board", () => {
    const p = page();
    const draw = drawer();
    const first = board(1);
    const s1 = p.whole(first);
    const d1 = draw(s1);
    const s2 = p.delta(tap({ ...first, stateRevision: 2 }, "card:1"));
    const d2 = draw(s2);
    // The page's parsed board: the rows the delta did not name are read once.
    expect(s2.battlefield[1]).toBe(s1.battlefield[1]);
    expect(s2.battlefield[2]).toBe(s1.battlefield[2]);
    expect(s2.hand[0]).toBe(s1.hand[0]);
    expect(s2.battlefield[0]).not.toBe(s1.battlefield[0]);
    expect(s2.battlefield[0]!.tapped).toBe(true);
    // What the board draws: the same drawings, and the tapped land a new one.
    expect(d2.battlefield[1]).toBe(d1.battlefield[1]);
    expect(d2.battlefield[2]).toBe(d1.battlefield[2]);
    expect(d2.battlefield[0]).not.toBe(d1.battlefield[0]);
    expect(d2.battlefield[0]!.tapped).toBe(true);
    // Nothing in the hand changed: the very list drawn before.
    expect(d2.hand).toBe(d1.hand);
  });

  it("an unchanged card is drawn once: the drawing is reused before any compare", () => {
    const p = page();
    const first = board(1);
    const s1 = p.whole(first);
    const t1 = tableCards(s1, null);
    const s2 = p.delta(tap({ ...first, stateRevision: 2 }, "card:3"));
    const t2 = tableCards(s2, s1);
    // Not equal-and-kept later by keepCards: the same object out of the derivation itself.
    expect(t2[0]).toBe(t1[0]);
    expect(t2[1]).toBe(t1[1]);
    expect(t2[2]).not.toBe(t1[2]);
  });

  it("a whole board (new rows) is read afresh, and keepCards still keeps the equal cards", () => {
    const p = page();
    const draw = drawer();
    const s1 = p.whole(board(1));
    const d1 = draw(s1);
    const s2 = p.whole(tap(board(2), "card:2"));
    const d2 = draw(s2);
    expect(s2.battlefield[0]).not.toBe(s1.battlefield[0]);
    expect(d2.battlefield[0]).toBe(d1.battlefield[0]);
    expect(d2.battlefield[1]).not.toBe(d1.battlefield[1]);
    expect(d2.hand).toBe(d1.hand);
  });

  it("the same rows reach the same answers as fresh ones, board after board", () => {
    // A row the delta keeps and a row read afresh draw alike (the kept path is no shortcut).
    const p = page();
    const steps = [
      board(1),
      tap(board(2), "card:1"),
      {
        ...tap(board(3), "card:1"),
        phase: "COMBAT_DECLARE_ATTACKERS",
        blockerCandidates: ["card:3"],
      },
      {
        ...board(4),
        battlefield: [
          card("card:2", 1, "Grizzly Bears", {
            counters: [{ name: "P1P1", count: 1 }],
            power: 3,
            toughness: 3,
          }),
        ],
      },
    ];
    let viaDelta: BoardData | null = null;
    let viaWhole: BoardData | null = null;
    let pd: Snapshot | null = null;
    let pw: Snapshot | null = null;
    steps.forEach((b, i) => {
      const sd = i === 0 ? p.whole(b) : p.delta(b);
      const sw = reduceMatch(EMPTY_MATCH, {
        type: "MATCH_SNAPSHOT",
        state: JSON.parse(JSON.stringify(b)) as Row,
      }).board!;
      viaDelta = keepCards(boardFromSnapshot(sd, pd), viaDelta);
      viaWhole = keepCards(boardFromSnapshot(sw, pw), viaWhole);
      expect(JSON.stringify(viaDelta, mapsAsLists)).toBe(JSON.stringify(viaWhole, mapsAsLists));
      pd = sd;
      pw = sw;
    });
  });
});

describe("the delta's in-place patch (P11-C2)", () => {
  it("a delta that puts one card twice does not fit: the page asks for the whole board, as before", () => {
    const first = board(1);
    let state = reduceMatch(EMPTY_MATCH, { type: "MATCH_SNAPSHOT", state: first });
    // A first delta through the full rule, so the list is one the page rebuilt (the in-place path's).
    state = reduceMatch(state, {
      type: "MATCH_DELTA",
      gameEpoch: 1,
      from: 1,
      to: 2,
      ...deltaOf(first, tap({ ...first, stateRevision: 2 }, "card:1")),
    });
    expect(state.resync ?? false).toBe(false);
    const twice = card("card:2", 1, "Grizzly Bears", { tapped: true });
    const after = reduceMatch(state, {
      type: "MATCH_DELTA",
      gameEpoch: 1,
      from: 2,
      to: 3,
      lists: { battlefield: { put: [twice, { ...twice, tapped: false }] } },
    });
    expect(after.resync).toBe(true);
    expect(after.board).toBe(state.board);
  });

  it("rebuilds exactly what was sent over 300 random changes, keeping every untouched row", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    let base: Row = board(1);
    let state = reduceMatch(EMPTY_MATCH, { type: "MATCH_SNAPSHOT", state: base });
    let next = 100;
    for (let r = 2; r < 300; r++) {
      const list = [...(base["battlefield"] as Row[])];
      const k = rand(5);
      if (k <= 1 && list.length > 0) {
        const i = rand(list.length);
        list[i] = { ...list[i], tapped: !list[i]!["tapped"] };
      } else if (k === 2) list.push(card(`card:${next++}`, 1 + rand(2), "Bear"));
      else if (k === 3 && list.length > 1) list.splice(rand(list.length), 1);
      else if (list.length > 1) list.reverse();
      const b: Row = { ...base, stateRevision: r, battlefield: list };
      const message = {
        type: "MATCH_DELTA",
        gameEpoch: 1,
        from: base["stateRevision"],
        to: r,
        ...deltaOf(base, b),
      };
      const had = state.base!["battlefield"] as Row[];
      state = reduceMatch(state, message);
      expect(state.resync ?? false).toBe(false);
      expect(JSON.stringify(state.base)).toBe(JSON.stringify(b));
      // Rows the delta did not put are the page's own objects still.
      const put = new Set(
        (
          (message as Row & { lists?: Record<string, { put?: Row[] }> }).lists?.["battlefield"]
            ?.put ?? []
        ).map((x) => x["id"]),
      );
      const before = new Map(had.map((x) => [x["id"], x]));
      for (const row of state.base!["battlefield"] as Row[])
        if (!put.has(row["id"]) && before.has(row["id"])) expect(row).toBe(before.get(row["id"]));
      base = b;
    }
  });
});

function mapsAsLists(_key: string, value: unknown): unknown {
  if (value instanceof Map) return [...(value as Map<unknown, unknown>).entries()];
  if (value instanceof Set) return [...(value as Set<unknown>)];
  return value;
}

describe("what is read from two boards still comes out right (P11-C2)", () => {
  it("a card gone to the graveyard and one put into a library: their departures", () => {
    const p = page();
    const draw = drawer();
    const first = board(1);
    draw(p.whole(first));
    const next = {
      ...first,
      stateRevision: 2,
      battlefield: [(first["battlefield"] as Row[])[0]],
      graveyard: [card("card:2", 1, "Grizzly Bears")],
      moves: [
        {
          card: "card:2",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
        },
        {
          card: "card:3",
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "library", seat: 2 },
        },
      ],
    };
    const d = draw(p.delta(next));
    expect([...d.departures]).toEqual([
      ["card:2", "viewer:graveyard"],
      ["card:3", "opponent:library"],
    ]);
    expect(d.battlefield.map((c) => c.id)).toEqual(["card:1"]);
  });

  it("a card played from the hand: it arrives from there, the rest kept", () => {
    const p = page();
    const draw = drawer();
    const first = board(1);
    const d1 = draw(p.whole(first));
    const next = {
      ...first,
      stateRevision: 2,
      hand: [],
      battlefield: [...(first["battlefield"] as Row[]), card("card:10", 1, "Giant Growth")],
    };
    const d2 = draw(p.delta(next));
    expect(d2.arrivals.get("card:10")).toBe("viewer:hand");
    expect(d2.battlefield.slice(0, 3)).toEqual(d1.battlefield);
    d1.battlefield.forEach((c, i) => expect(d2.battlefield[i]).toBe(c));
  });

  it("a skipped board's survivor is carried onto the board drawn, its card the same object", () => {
    const p = page();
    const draw = drawer();
    const first = board(1);
    const s1 = p.whole(first);
    draw(s1);
    // Board 2 (never drawn): a shield counter saved Grizzly Bears.
    const s2 = p.delta({
      ...first,
      stateRevision: 2,
      survived: [{ card: "card:2", how: "shield" }],
    });
    // Board 3 is drawn; it has no moments of its own.
    const s3 = p.delta(tap({ ...first, stateRevision: 3 }, "card:1"));
    expect(s3.battlefield[1]).toBe(s1.battlefield[1]);
    const d3 = draw(s3, [s2]);
    expect(d3.survive?.survived.get("card:2")).toBe("shield");
    expect(d3.survive?.key).toBe("1:3");
  });

  it("a size change on a changed card still ticks; an unchanged one is skipped at a glance", () => {
    const p = page();
    const first = board(1);
    const s1 = p.whole(first);
    const grown = {
      ...first,
      stateRevision: 2,
      battlefield: (first["battlefield"] as Row[]).map((c) =>
        c["id"] === "card:2"
          ? { ...c, power: 3, toughness: 3, counters: [{ name: "P1P1", count: 1 }] }
          : c,
      ),
    };
    const s2 = p.delta(grown);
    const changes = sizeChanges(s1.battlefield, s2.battlefield, {
      wornOff: false,
      struck: new Set(),
    });
    expect(changes.map((c) => [c.card, c.look, c.float])).toEqual([["card:2", "up", "+1/+1"]]);
    expect(boardFromSnapshot(s2, s1).sizes?.changes).toHaveLength(1);
  });
});

describe("a drawing is made again when what it reads changed (P11-C2)", () => {
  it("combat: the same card object, now offered as a blocker, is drawn in combat", () => {
    const p = page();
    const first = board(1);
    const s1 = p.whole(first);
    const t1 = tableCards(s1, null);
    const s2 = p.delta({
      ...first,
      stateRevision: 2,
      phase: "COMBAT_DECLARE_BLOCKERS",
      blockerCandidates: ["card:3"],
    });
    expect(s2.battlefield[2]).toBe(s1.battlefield[2]);
    const t2 = tableCards(s2, s1);
    expect(t2[2]).not.toBe(t1[2]);
    expect(t2[2]!.inCombat).toBe(true);
    expect(t2[1]).toBe(t1[1]);
    // And out of combat again: drawn without it.
    const s3 = p.delta({ ...first, stateRevision: 3, phase: "MAIN2" });
    expect(tableCards(s3, s2)[2]!.inCombat).toBeUndefined();
  });

  it("a prepared spell and a held card: a change in exile draws the permanent again", () => {
    const p = page();
    const spell = card("card:20", 1, "Opt", { kind: "instant", art: "a".repeat(64) });
    const held = card("card:21", 2, "Swords", { kind: "instant" });
    const first = board(1, {
      battlefield: [
        card("card:2", 1, "Grizzly Bears", { prepared: "card:20" }),
        card("card:5", 1, "Banisher Priest", { holds: ["card:21"] }),
      ],
      exile: [spell, held],
    });
    const s1 = p.whole(first);
    const t1 = tableCards(s1, null);
    expect(t1[0]!.prepared?.name).toBe("Opt");
    expect(t1[1]!.holding?.map((h) => h.name)).toEqual(["Swords"]);
    const s2 = p.delta({
      ...first,
      stateRevision: 2,
      exile: [
        { ...spell, art: "b".repeat(64) },
        { ...held, name: "Swords to Plowshares" },
      ],
    });
    expect(s2.battlefield[0]).toBe(s1.battlefield[0]);
    const t2 = tableCards(s2, s1);
    expect(t2[0]).not.toBe(t1[0]);
    expect(t2[0]!.prepared?.art).toBe("b".repeat(64));
    expect(t2[1]).not.toBe(t1[1]);
    expect(t2[1]!.holding?.map((h) => h.name)).toEqual(["Swords to Plowshares"]);
  });

  it("a 'prevent the next N' used up is drawn with its tick, then without it", () => {
    const p = page();
    const first = board(1, {
      battlefield: [card("card:2", 1, "Grizzly Bears", { preventNext: 3 })],
    });
    const s1 = p.whole(first);
    tableCards(s1, null);
    const hit = {
      key: "dmg:2",
      hits: [{ source: "card:9", target: { object: "card:2" }, amount: 2, by: "prevent-next" }],
    };
    const s2 = p.delta({
      ...first,
      stateRevision: 2,
      battlefield: [card("card:2", 1, "Grizzly Bears", { preventNext: 1 })],
      damage: hit,
    });
    const t2 = tableCards(s2, s1);
    expect(t2[0]!.preventUsed).toEqual({ from: 3, to: 1 });
    // The next board, the card unchanged and no hit: drawn without the tick (never the kept one).
    const s3 = p.delta({
      ...first,
      stateRevision: 3,
      battlefield: [card("card:2", 1, "Grizzly Bears", { preventNext: 1 })],
    });
    expect(s3.battlefield[0]).toBe(s2.battlefield[0]);
    expect(tableCards(s3, s2)[0]!.preventUsed).toBeUndefined();
  });

  it("a soulbond partner turned face down: its partner's words change", () => {
    const p = page();
    const draw = drawer();
    const first = board(1, {
      battlefield: [
        card("card:2", 1, "Wolfir Silverheart", { pairedWith: "card:4" }),
        card("card:4", 1, "Elf", { pairedWith: "card:2" }),
      ],
    });
    const d1 = draw(p.whole(first));
    expect(d1.battlefield[0]!.pairedName).toBe("Elf");
    const d2 = draw(p.delta({ ...first, stateRevision: 2 }));
    expect(d2.battlefield[0]).toBe(d1.battlefield[0]);
    const d3 = draw(
      p.delta({
        ...first,
        stateRevision: 3,
        battlefield: [
          card("card:2", 1, "Wolfir Silverheart", { pairedWith: "card:4" }),
          card("card:4", 1, "Face-down", { pairedWith: "card:2", faceDown: true, known: false }),
        ],
      }),
    );
    expect(d3.battlefield[0]!.pairedName).toBe("a face-down creature");
  });

  it("a card changed by a delta is read again (a row is never mistaken for another with its id)", () => {
    const p = page();
    const first = board(1);
    const s1 = p.whole(first);
    const s2 = p.delta(tap({ ...first, stateRevision: 2 }, "card:2"));
    const s3 = p.delta({ ...first, stateRevision: 3 });
    expect(s2.battlefield[1]!.tapped).toBe(true);
    expect(s3.battlefield[1]!.tapped).toBe(false);
    expect(s3.battlefield[1]).not.toBe(s1.battlefield[1]);
    expect(s3.hand[0]).toBe(s1.hand[0]);
  });
});
