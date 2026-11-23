// P11-D3 -- history sent once: the page rebuilds the whole board from the
// entries it is sent and the lists it holds, so every board it takes has
// the worker's lists exactly; a connection's first board (no `kept`) and an
// older server's boards carry their lists whole.

import { describe, expect, it } from "vitest";
import { EMPTY_MATCH, reduceMatch, type MatchState } from "./match";
import { trimHistory, withHistory, type HeldHistory } from "./history";
import { WholeBoards } from "./delta";

type Raw = Record<string, unknown>;

/** The server's rule (BoardHistory.kt `trim`), as history.ts copies it for tools. */
const trim = (state: Raw, held: HeldHistory) => trimHistory(held, state);

const pay = (n: number, from = `card:${100 + n}`) => ({
  n,
  seat: 1,
  payment: n,
  for: "card:7",
  kind: "cast",
  mana: [{ colour: "G", from }],
});

const board = (rev: number, payments: unknown[], notices: string[] = []): Raw => ({
  stateRevision: rev,
  gameEpoch: 1,
  turn: 1,
  phase: "MAIN1",
  activeSeat: 1,
  seat: 1,
  players: [],
  battlefield: [],
  hand: [],
  notices,
  noticesTotal: notices.length,
  payments,
});

const snap = (state: Raw) => ({ type: "MATCH_SNAPSHOT", state });

describe("history sent once (P11-D3)", () => {
  it("a board without kept is taken whole, as an older server's", () => {
    const whole = board(1, [pay(1), pay(2)], ["You looked at Opt."]);
    const { state, history } = withHistory(undefined, whole);
    expect(state).toEqual(whole);
    expect(history?.["payments"]).toEqual([pay(1), pay(2)]);
    expect(history?.["rolls"]).toEqual([]);
  });

  it("keeps the last m of its own and adds the rest", () => {
    const held = { payments: [pay(1), pay(2), pay(3)], rolls: [], notices: ["a", "b"] };
    const { state } = withHistory(held, {
      ...board(2, [pay(4)], []),
      notices: ["c"],
      kept: { payments: 2, notices: 2 },
    });
    const s = state as Raw;
    expect(s["payments"]).toEqual([pay(2), pay(3), pay(4)]);
    expect(s["notices"]).toEqual(["a", "b", "c"]);
    expect(s["kept"]).toBeUndefined();
    // A kept list with nothing new: the key is absent from what was sent.
    const same = withHistory(held, { stateRevision: 3, kept: { payments: 3 } }).state as Raw;
    expect(same["payments"]).toEqual([pay(1), pay(2), pay(3)]);
  });

  it("the reducer's boards have the worker's lists, board after board, and an old board changes nothing", () => {
    let page: MatchState = { ...EMPTY_MATCH };
    let held: HeldHistory = {};
    let payments: unknown[] = [];
    let notices: string[] = [];
    for (let rev = 1; rev <= 80; rev++) {
      if (rev % 2 === 0) payments = [...payments, pay(rev)].slice(-24);
      if (rev % 7 === 0) notices = [...notices, `notice ${rev % 3}`].slice(-6);
      // An id stripped mid-list (its card went into a hand): the list goes whole.
      if (rev === 41) payments = payments.map((p, i) => (i === 3 ? pay(999, "unseen") : p));
      const full = board(rev, payments, notices);
      const t = trim(full, held);
      held = t.held;
      page = reduceMatch(page, snap(t.sent));
      expect(page.board?.payments?.map((p) => p.n)).toEqual(
        (payments as { n: number }[]).map((p) => p.n),
      );
      expect(page.board?.notices).toEqual(notices);
      if (rev >= 41 && rev <= 50) expect(page.board?.payments?.some((p) => p.n === 999)).toBe(true);
    }
    // A stored board overtaken by a live one (a reconnect): dropped, and the history with it.
    const before = page.history;
    page = reduceMatch(page, snap(board(5, [pay(5)])));
    expect(page.history).toBe(before);
    expect(page.board?.stateRevision).toBe(80);
  });

  it("only the trimmed board crosses: about one entry a board once the list is full", () => {
    let held: HeldHistory = {};
    let payments: unknown[] = [];
    let sentEntries = 0;
    for (let rev = 1; rev <= 100; rev++) {
      payments = [...payments, pay(rev)].slice(-24);
      const t = trim(board(rev, payments), held);
      held = t.held;
      sentEntries += Array.isArray(t.sent["payments"])
        ? (t.sent["payments"] as unknown[]).length
        : 0;
    }
    expect(sentEntries).toBe(100);
  });

  it("WholeBoards gives a test back the whole board, idempotent for a re-sent clone", () => {
    const whole = new WholeBoards();
    const one = board(1, [pay(1), pay(2)]);
    expect((JSON.parse(whole.take(JSON.stringify(snap(one)))) as { state: Raw }).state).toEqual(
      one,
    );
    const two = JSON.parse(
      whole.take(JSON.stringify(snap({ ...board(2, [pay(3)]), kept: { payments: 2 } }))),
    ) as { state: Raw };
    expect(two.state["payments"]).toEqual([pay(1), pay(2), pay(3)]);
    expect(two.state["kept"]).toBeUndefined();
  });
});
