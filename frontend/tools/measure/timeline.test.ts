// P11-D0's timeline joins: a hand-made step whose every time is known.
import { describe, expect, it } from "vitest";
import {
  SLICES,
  clockOffset,
  frameSplit,
  momentRows,
  momentSteps,
  readMarks,
  traceClock,
  workerSlices,
  type Mark,
  type Msg,
  type PageRun,
} from "./timeline";

/** The container's clock runs 5 ms ahead of the PC's; marks are microseconds. */
const OFFSET = 5;
const us = (hostMs: number) => Math.round((hostMs + OFFSET) * 1000);

const msg = (over: Partial<Msg>): Msg => ({
  t0: 0,
  t1: 0,
  parse: 0,
  type: "MATCH_SNAPSHOT",
  messageId: "",
  rev: null,
  decisionId: null,
  epoch: 1,
  bytes: 100,
  damage: false,
  stack: false,
  ...over,
});

// The host clicks at 1000 and its answer (decision 7) leaves at 1002; it reaches
// the server 1 ms later, the receipt comes back in 1 ms. Forge decides for 2 ms,
// then one board round builds seat 1's board, then seat 2's.
const server: Mark[] = [
  { ev: "in", t: us(1003), type: "DECISION_RESPONSE", decisionId: 7, handled: 400 },
  { ev: "fwd", t: 1_008_200, what: "an answer", dur: 100 },
  { ev: "out", t: 1_008_400, type: "DECISION_ACCEPTED", messageId: "r1", decisionId: 7, dur: 50 },
  { ev: "wk", t: 1_012_800, type: "MATCH_SNAPSHOT", n: 10, parse: 100, record: 50 },
  { ev: "art", t: 1_012_950, dur: 300 },
  {
    ev: "out",
    t: 1_013_300,
    messageId: "m1",
    type: "MATCH_SNAPSHOT",
    fromType: "MATCH_SNAPSHOT",
    fromN: 10,
    dur: 100,
  },
  { ev: "wkDone", t: 1_013_450, type: "MATCH_SNAPSHOT", n: 10 },
  { ev: "wk", t: 1_013_950, type: "MATCH_SNAPSHOT", n: 11, parse: 100, record: 50 },
  { ev: "art", t: 1_014_100, dur: 250 },
  {
    ev: "out",
    t: 1_014_400,
    messageId: "m2",
    type: "MATCH_SNAPSHOT",
    fromType: "MATCH_SNAPSHOT",
    fromN: 11,
    dur: 100,
  },
  { ev: "wkDone", t: 1_014_550, type: "MATCH_SNAPSHOT", n: 11 },
];
const worker: Mark[] = [
  { ev: "rx", t: 1_008_500, decisionId: 7, parse: 50 },
  { ev: "gate", t: 1_008_600, decisionId: 7, accepted: true },
  { ev: "wake", t: 1_008_700, decisionId: 7 },
  { ev: "seat", t: 1_011_200, rev: 41, seat: 1, view: 800, extras: 200, hide: 300, send: 200 },
  { ev: "sent", t: 1_012_500, type: "MATCH_SNAPSHOT", n: 10, seat: 1, rev: 41, dur: 200 },
  { ev: "seat", t: 1_012_700, rev: 41, seat: 2, view: 700, extras: 100, hide: 200, send: 200 },
  { ev: "sent", t: 1_013_700, type: "MATCH_SNAPSHOT", n: 11, seat: 2, rev: 41, dur: 200 },
  { ev: "pub", t: 1_010_700, rev: 41, prep: 500, dur: 3_200 },
];
const host: PageRun = {
  role: "host",
  inputs: [
    { t: 1000, kind: "pointerdown" },
    { t: 1000.5, kind: "click" },
  ],
  sends: [{ t: 1002, type: "DECISION_RESPONSE", decisionId: 7 }],
  msgs: [
    msg({ t0: 1004.6, t1: 1004.8, type: "DECISION_ACCEPTED", messageId: "r1", decisionId: 7 }),
    msg({ t0: 1010, t1: 1012, parse: 1.2, messageId: "m1", rev: 41 }),
  ],
  commits: [
    // An animation's commit while the board was being read: not the board's.
    { t: 1011, after: 1, raf: 1013, painted: 1014 },
    { t: 1015, after: 2, raf: 1020, painted: 1026 },
  ],
  net: { r1: 1004.45, m1: 1009.4 },
  frames: { 1: { style: 2, layout: 1, paint: 1.5 } },
};
const guest: PageRun = {
  role: "guest",
  inputs: [],
  sends: [],
  msgs: [msg({ t0: 1011, t1: 1012.5, parse: 0.8, messageId: "m2", rev: 41 })],
  commits: [{ t: 1014, after: 1, raf: 1016.7, painted: 1022 }],
  net: { m2: 1010.5 },
  frames: {},
};

describe("the timeline of one step", () => {
  it("finds the clocks' offset from the answer's round trip", () => {
    const clock = clockOffset([host, guest], server)!;
    expect(clock.offset).toBeCloseTo(OFFSET, 6);
    expect(clock.rtt).toBeCloseTo(2, 6);
  });

  const [step] = momentSteps([host, guest], server, worker, OFFSET, 900, 1100);

  it("joins each page's result to the click, and the slices add up to it", () => {
    expect(step!.acting).toBe("host");
    expect(step!.missing).toEqual([]);
    expect(step!.seats.map((s) => [s.role, s.totalMs])).toEqual([
      ["host", 25.5],
      ["guest", 21.5],
    ]);
    expect(step!.bothMs).toBe(25.5);
    for (const seat of step!.seats) {
      const sum = SLICES.reduce((a, [k]) => a + seat.slices[k], 0);
      expect(sum).toBeCloseTo(seat.totalMs, 6);
    }
  });

  it("puts each part of the path in its slice", () => {
    const h = step!.seats[0]!.slices;
    expect(h.input).toBeCloseTo(1.5, 6); // from the click, not the pointerdown
    expect(h.netUp).toBeCloseTo(1, 6);
    expect(h.serverIn).toBeCloseTo(0.3, 6);
    expect(h.pipeIn).toBeCloseTo(0.2, 6);
    expect(h.workerIn).toBeCloseTo(0.1, 6);
    expect(h.handoff).toBeCloseTo(0.1, 6);
    expect(h.engine).toBeCloseTo(2, 6);
    expect(h.prep).toBeCloseTo(0.5, 6);
    expect(h.view).toBeCloseTo(0.8, 6);
    expect(h.history).toBeCloseTo(0.2, 6);
    expect(h.hide).toBeCloseTo(0.3, 6);
    expect(h.write).toBeCloseTo(0.2, 6);
    expect(h.pipeOut).toBeCloseTo(0.1, 6);
    expect(h.serverParse).toBeCloseTo(0.15, 6);
    expect(h.pictures).toBeCloseTo(0.3, 6);
    expect(h.serverOther).toBeCloseTo(0.05, 6);
    expect(h.serverSend).toBeCloseTo(0.1, 6);
    expect(h.netDown).toBeCloseTo(1, 6);
    expect(h.pageBusy).toBeCloseTo(0.6, 6);
    expect(h.pageParse).toBeCloseTo(1.2, 6);
    expect(h.handler).toBeCloseTo(0.8, 6);
    expect(h.react).toBeCloseTo(3, 6);
    expect(h.waitFrame).toBeCloseTo(5, 6);
    expect([h.style, h.layout, h.paint, h.frameOther]).toEqual([2, 1, 1.5, 1.5]);
  });

  it("counts the other seat's board on the path of the seat built after it", () => {
    const g = step!.seats[1]!.slices;
    expect(g.view).toBeCloseTo(1.5, 6);
    expect(g.hide).toBeCloseTo(0.5, 6);
    expect(g.write).toBeCloseTo(0.4, 6);
    expect(g.pipeOut).toBeCloseTo(0.05, 6);
    expect(g.serverBusy).toBeCloseTo(0, 6);
    // No trace for its frame: all of it is "the rest of the frame".
    expect(g.frameOther).toBeCloseTo(5.3, 6);
  });

  it("names what it could not join, rather than guessing", () => {
    const lost = momentSteps(
      [host, guest],
      server.filter((m) => m["messageId"] !== "m2"),
      worker,
      OFFSET,
      900,
      1100,
    );
    expect(lost[0]!.seats.map((s) => s.role)).toEqual(["host"]);
    expect(lost[0]!.missing).toEqual(["guest: no result joined up"]);
    const noWake = momentSteps(
      [host, guest],
      server,
      worker.filter((m) => m.ev !== "wake"),
      OFFSET,
      900,
      1100,
    );
    expect(noWake[0]!.missing).toEqual(["decision 7: wake"]);
  });

  it("sums a moment's steps into one row per page and one for both", () => {
    const rows = momentRows("1x tap-one-land", [step!, step!]);
    expect(rows.map((r) => r["key"])).toEqual([
      "1x tap-one-land host",
      "1x tap-one-land guest",
      "1x tap-one-land both",
    ]);
    expect(rows[0]!["totalMs"]).toBe(51);
    expect(rows[0]!["ms_engine"]).toBe(4);
    expect(rows[2]!["bothMs"]).toBe(51);
  });
});

describe("the worker's game thread", () => {
  it("is Forge deciding wherever no other mark covers it", () => {
    const s = workerSlices(worker, 1_008_700, 1_010_700);
    expect(s.engine).toBeCloseTo(2, 6);
    expect(s.view ?? 0).toBe(0);
  });

  it("keeps a deliberate wait apart from Forge deciding", () => {
    const s = workerSlices(
      [{ ev: "paced", t: 3_000_000, why: "rest", dur: 2_500_000 }],
      2_999_000,
      5_600_000,
    );
    expect(s.paced).toBeCloseTo(2_500, 6);
    expect(s.engine).toBeCloseTo(101, 6);
  });

  it("counts a question from its mark to its frame written", () => {
    const s = workerSlices(
      [
        { ev: "ask", t: 2_000_000, decisionId: 8 },
        { ev: "sent", t: 2_000_400, type: "DECISION_REQUEST", decisionId: 8, n: 3, dur: 100 },
      ],
      1_999_000,
      2_001_000,
    );
    expect(s.question).toBeCloseTo(0.5, 6);
    expect(s.engine).toBeCloseTo(1.5, 6);
  });
});

describe("reading the logs and the trace", () => {
  it("reads marks out of log lines, skipping cut lines and other matches", () => {
    const text = [
      '12:00:00.000 INFO  arena-server [...] MatchTiming - proxic-timing {"ev":"in","t":5,"match":"a"}',
      "Read cards: 33980 files",
      'proxic-timing {"ev":"seat","t":3,"rev":1',
      'proxic-timing {"ev":"rx","t":4}',
      'proxic-timing {"ev":"out","t":6,"match":"b"}',
    ].join("\n");
    expect(readMarks(text, "a").map((m) => [m.ev, m.t])).toEqual([
      ["rx", 4],
      ["in", 5],
    ]);
  });

  it("puts the trace on the page's clock through its sync mark, and splits the frame", () => {
    const events = [
      { name: "proxic-tl-sync-host", ph: "R", ts: 5_000_000, pid: 1, tid: 2 },
      { name: "UpdateLayoutTree", ph: "X", ts: 5_010_000, dur: 2_000, pid: 1, tid: 2 },
      { name: "Layout", ph: "X", ts: 5_012_000, dur: 1_000, pid: 1, tid: 2 },
      { name: "Paint", ph: "X", ts: 5_013_000, dur: 500, pid: 1, tid: 2 },
      { name: "Paint", ph: "X", ts: 5_013_000, dur: 500, pid: 9, tid: 2 },
      { name: "Layout", ph: "X", ts: 5_030_000, dur: 1_000, pid: 1, tid: 2 },
    ];
    const clock = traceClock(events, "proxic-tl-sync-host", 1_000)!;
    expect(clock.toEpoch(5_010_000)).toBe(1_010);
    expect(clock.toTrace(1_010)).toBe(5_010_000);
    expect(
      frameSplit(events, clock.pid, clock.tid, clock.toTrace(1_009), clock.toTrace(1_020)),
    ).toEqual({
      style: 2,
      layout: 1,
      paint: 0.5,
    });
    expect(traceClock(events, "proxic-tl-sync-guest", 1_000)).toBeNull();
  });
});
