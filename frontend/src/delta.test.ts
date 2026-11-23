// @vitest-environment jsdom

// P11-D4 (spec 0117, F-0117-B, F-0117-C) -- each page is sent only what
// changed. The page rebuilds the whole board from the base it holds and a
// MATCH_DELTA; unchanged items stay the same objects; MATCH_STEP never
// touches the base; a delta that does not fit asks once for the whole board
// and drops deltas until it comes; a full board is taken at any time; the
// test-only `whole` is compared and a difference logged. The shared fixtures
// (protocol/fixtures/delta/) are made and applied as the server and the Lab
// gate make them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeltaStream, applyDelta, deltaOf, firstDifference, sameJson } from "./delta";
import { withHistory } from "./history";
import {
  EMPTY_MATCH,
  MATCH_RESYNC_WAIT_MS,
  connectMatch,
  reduceMatch,
  type MatchState,
} from "./match";

type Board = Record<string, unknown>;
type Fixture = {
  boards: Board[];
  diffs: Board[];
  sent: [string, Board][];
  reasons: Record<string, number>;
};

const FIXTURES = join(__dirname, "..", "..", "protocol", "fixtures", "delta");
const NAMES = ["big-combat", "karn-restart", "hand-bounce"];
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Fixture;
const HISTORY = new Set(["payments", "rolls", "notices", "kept"]);
const withoutHistory = (b: Board) =>
  Object.fromEntries(Object.entries(b).filter(([k]) => !HISTORY.has(k)));

/** A message as the server sends it: a MATCH_SNAPSHOT around a board, or a MATCH_DELTA's fields. */
const message = (type: string, body: Board): Board =>
  type === "MATCH_DELTA"
    ? { protocolVersion: 1, type, messageId: "m", ...body }
    : { protocolVersion: 1, type, messageId: "m", state: body };

const card = (id: string, tapped = false) => ({
  id,
  seat: 1,
  name: "Forest",
  tapped,
  kind: "land",
});
const board = (
  rev: number,
  cards = [1, 2, 3, 4, 5].map((n) => card(`card:${n}`)),
  turn = 3,
): Board => ({
  stateRevision: rev,
  gameEpoch: 1,
  seat: 1,
  turn,
  phase: "MAIN1",
  activeSeat: 1,
  prioritySeat: 1,
  players: [
    { seat: 1, name: "Alice", life: 20 },
    { seat: 2, name: "Bob", life: 20 },
  ],
  battlefield: cards,
  hand: [],
  stack: [],
  graveyard: [],
});

const feed = (state: MatchState, ...messages: Board[]) =>
  messages.reduce((s, m) => reduceMatch(s, m), state);

describe("the shared fixtures (three Lab traces)", () => {
  for (const name of NAMES) {
    it(`${name}: the same diffs, the same messages, every board rebuilt`, () => {
      const doc = fixture(name);
      doc.boards.slice(1).forEach((b, i) => {
        const a = doc.boards[i]!;
        expect(deltaOf(a, b), `diff ${i}`).toEqual(doc.diffs[i]);
        expect(applyDelta(a, deltaOf(a, b)), `apply ${i}`).toEqual(withoutHistory(b));
      });
      const stream = new DeltaStream();
      let state: MatchState = { ...EMPTY_MATCH };
      doc.boards.forEach((b, i) => {
        const { type, body } = stream.step(b);
        expect([type, body], `sent ${i}`).toEqual(doc.sent[i]);
        state = reduceMatch(state, message(type, body));
        expect(state.resync ?? false, `fits ${i}`).toBe(false);
        expect(sameJson(state.base, b), `rebuilt ${i}: ${firstDifference(state.base, b)}`).toBe(
          true,
        );
      });
    });
  }
});

describe("applyDelta", () => {
  it("rebuilds the board, and every item it does not name is the same object", () => {
    const a = board(1);
    const b = board(2, [card("card:2"), card("card:1", true), card("card:3"), card("card:6")]);
    const delta = deltaOf(a, b);
    const rebuilt = applyDelta(a, delta);
    expect(rebuilt).toEqual(b);
    const cards = rebuilt["battlefield"] as Board[];
    const before = a["battlefield"] as Board[];
    expect(cards[0]).toBe(before[1]); // card:2 only moved
    expect(cards[2]).toBe(before[2]); // card:3 unchanged
    expect(cards[1]).not.toBe(before[0]); // card:1 changed: sent whole
    expect(rebuilt["players"]).toBe(a["players"]);
    expect(rebuilt["hand"]).toBe(a["hand"]);
  });

  it("300 random boards round-trip exactly (cards added, moved, changed, removed; keys come and go)", () => {
    let seed = 117;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const pool = NAMES.flatMap((n) => fixture(n).boards);
    for (let n = 0; n < 300; n += 1) {
      const a = pool[Math.floor(rnd() * pool.length)]!;
      const b: Board = JSON.parse(JSON.stringify(a)) as Board;
      b["stateRevision"] = 100_000 + n;
      const list = (b["battlefield"] as Board[] | undefined) ?? [];
      const r = rnd();
      if (r < 0.2 && list.length) list.splice(Math.floor(rnd() * list.length), 1);
      else if (r < 0.4)
        list.splice(Math.floor(rnd() * (list.length + 1)), 0, card(`card:${9000 + n}`));
      else if (r < 0.6) list.reverse();
      else if (r < 0.8 && list.length) list[0] = { ...list[0], tapped: !list[0]!["tapped"] };
      else if (r < 0.9) b[`extra${n}`] = [n];
      else delete b["players"];
      expect(applyDelta(a, deltaOf(a, b))).toEqual(withoutHistory(b));
    }
  });

  it("a delta's history fields finish as P11-D3's do", () => {
    const pay = (n: number) => ({ n, seat: 1, kind: "cast" });
    const a = { ...board(1), payments: [pay(1), pay(2)] };
    const stream = new DeltaStream();
    stream.step(a);
    const b = { ...board(2, [card("card:1", true)]), payments: [pay(1), pay(2), pay(3)] };
    const { type, body } = stream.step(b);
    expect(type).toBe("MATCH_DELTA");
    expect(body["payments"]).toEqual([pay(3)]);
    expect(body["kept"]).toEqual({ payments: 2 });
    const held = withHistory(undefined, a).history;
    expect(withHistory(held, applyDelta(a, body)).state).toEqual(b);
  });
});

describe("the page (match.ts)", () => {
  afterEach(() => vi.restoreAllMocks());

  const start = () => feed({ ...EMPTY_MATCH }, message("MATCH_SNAPSHOT", board(1)));
  const tapped = (rev: number) =>
    board(
      rev,
      [1, 2, 3, 4, 5].map((n) => card(`card:${n}`, n === 2)),
    );
  const deltaFrom = (from: Board, to: Board) => {
    const stream = new DeltaStream();
    stream.step(from);
    const { type, body } = stream.step(to);
    expect(type).toBe("MATCH_DELTA");
    return message(type, body);
  };

  it("applies a delta: the board shown and the base are the server's board", () => {
    const next = feed(start(), deltaFrom(board(1), tapped(2)));
    expect(next.base).toEqual(tapped(2));
    expect(next.board?.stateRevision).toBe(2);
    expect(next.board?.battlefield.find((c) => c.id === "card:2")?.tapped).toBe(true);
    expect(next.resync ?? false).toBe(false);
  });

  it("MATCH_STEP moves the board shown, never the base", () => {
    const shown = start();
    const base = shown.base;
    const stepped = reduceMatch(shown, {
      type: "MATCH_STEP",
      state: { gameEpoch: 1, turn: 3, phase: "COMBAT_BEGIN", activeSeat: 2, prioritySeat: 2 },
    });
    expect(stepped.board?.phase).toBe("COMBAT_BEGIN");
    expect(stepped.base).toBe(base);
    expect(stepped.base?.["phase"]).toBe("MAIN1");
    // and the next delta builds on the base, as sent
    const next = feed(stepped, deltaFrom(board(1), tapped(2)));
    expect(next.resync ?? false).toBe(false);
    expect(next.base).toEqual(tapped(2));
  });

  it("a delta that does not fit asks once, drops deltas until a full board, then goes on", () => {
    const shown = start();
    const misfit = deltaFrom(board(7), tapped(8)); // builds on a board this page never had
    const waiting = feed(shown, misfit);
    expect(waiting.resync).toBe(true);
    expect(waiting.board).toBe(shown.board); // the table stays as it is
    const later = deltaFrom(board(1), tapped(2));
    expect(reduceMatch(waiting, later)).toBe(waiting); // dropped
    const whole = feed(waiting, message("MATCH_SNAPSHOT", board(9)));
    expect(whole.resync).toBe(false);
    expect(whole.base).toEqual(board(9));
    expect(feed(whole, deltaFrom(board(9), tapped(10))).board?.stateRevision).toBe(10);
  });

  it("a malformed delta is treated the same way", () => {
    const shown = start();
    const bad = message("MATCH_DELTA", {
      gameEpoch: 1,
      from: 1,
      to: 2,
      lists: { battlefield: { order: ["card:99"] } },
    });
    expect(feed(shown, bad).resync).toBe(true);
    const noList = message("MATCH_DELTA", { gameEpoch: 1, from: 1, to: 2, lists: { nothing: {} } });
    expect(feed(shown, noList).resync).toBe(true);
  });

  it("a dropped item is gone and `order` is followed", () => {
    const shown = start();
    const fewer = board(2, [card("card:5"), card("card:4"), card("card:1")]);
    const next = feed(shown, deltaFrom(board(1), fewer));
    expect(next.board?.battlefield.map((c) => c.id)).toEqual(["card:5", "card:4", "card:1"]);
    expect(next.base).toEqual(fewer);
  });

  it("a full board is taken at any time, and an older one is not the base", () => {
    const shown = feed(start(), message("MATCH_SNAPSHOT", board(5)));
    expect(shown.base).toEqual(board(5));
    const stale = feed(shown, message("MATCH_SNAPSHOT", board(3)));
    expect(stale.base).toEqual(board(5));
    expect(stale.board?.stateRevision).toBe(5);
  });

  it("with `whole` (test only): compared, a planted difference logged, the rebuilt board drawn", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = deltaFrom(board(1), tapped(2));
    feed(start(), { ...good, whole: tapped(2) });
    expect(errors).not.toHaveBeenCalled();
    const planted = { ...tapped(2), battlefield: [card("card:1")] };
    const next = feed(start(), { ...good, whole: planted });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toMatch(/^DELTA_MISMATCH at \/battlefield/);
    expect(next.board?.battlefield).toHaveLength(5); // the rebuilt board, never `whole`
  });
});

class FakeSocket {
  static made: FakeSocket[] = [];
  sent: string[] = [];
  closed: number[] = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.closed.push(code);
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
  opened() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  says(m: Board) {
    this.onmessage?.({ data: JSON.stringify(m) } as MessageEvent);
  }
}

describe("the game connection asks for the whole board", () => {
  afterEach(() => {
    vi.useRealTimers();
    FakeSocket.made = [];
  });

  function game() {
    let state: MatchState = { ...EMPTY_MATCH };
    connectMatch(
      "ws://x/ws/matches/m?deltas=1",
      (apply) => {
        state = apply(state);
      },
      (url) => new FakeSocket(url) as unknown as WebSocket,
      [100],
    );
    const socket = FakeSocket.made[0]!;
    socket.opened();
    socket.says({ type: "MATCH_HELLO", seat: 1 });
    socket.says(message("MATCH_SNAPSHOT", board(1)));
    return { socket, now: () => state };
  }

  const resyncs = (s: FakeSocket) => s.sent.filter((t) => t.includes('"MATCH_RESYNC"'));
  const misfit = () => {
    const stream = new DeltaStream();
    stream.step(board(7));
    return message("MATCH_DELTA", stream.step(board(8, [card("card:1", true)])).body);
  };

  it("once, naming what it had, and the full board ends the wait", () => {
    vi.useFakeTimers();
    const { socket, now } = game();
    socket.says(misfit());
    socket.says(misfit());
    expect(resyncs(socket)).toEqual([
      JSON.stringify({ type: "MATCH_RESYNC", have: { gameEpoch: 1, stateRevision: 1 } }),
    ]);
    socket.says(message("MATCH_SNAPSHOT", board(9)));
    expect(now().resync).toBe(false);
    vi.advanceTimersByTime(MATCH_RESYNC_WAIT_MS + 100);
    expect(socket.closed).toEqual([]);
  });

  it("closes the socket when no full board has come in 3 s, and the reconnect brings one", () => {
    vi.useFakeTimers();
    const { socket } = game();
    socket.says(misfit());
    vi.advanceTimersByTime(MATCH_RESYNC_WAIT_MS + 10);
    expect(socket.closed).toEqual([4000]);
    vi.advanceTimersByTime(200);
    expect(FakeSocket.made).toHaveLength(2);
  });
});
