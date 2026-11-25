// Phase 11 P11-D0, "where the time goes, end to end": one moment's
// timeline, from a player's click to both screens showing the result,
// every step timed. Pure functions over what the probes collected; the
// spec (timeline.spec.ts) gathers it and writes the rows.
//
// Where each time comes from:
// - the pages (timeline-probe.ts, put in each page before its scripts): the
//   click, the answer sent, each match message's handler (its JSON.parse
//   apart), each React commit, the next frame after it (requestAnimationFrame,
//   then a message posted from it: the frame's style, layout and paint are
//   done by then), and Chrome's own account of that frame (the trace's
//   UpdateLayoutTree, Layout and paint events); the moment each message
//   reached the page (CDP Network.webSocketFrameReceived: measured
//   2026-11-21, Chrome stamps it as the page's main thread takes the frame,
//   so the page's own queue is inside `netDown`, not `pageBusy`);
// - the server's log (match/MatchTiming.kt): `in`, `fwd`, `wk`, `wkDone`,
//   `art`, `out`;
// - the match's worker log (game/Timing.java): `rx`, `gate`, `wake`, `pub`,
//   `seat`, `ask`, `sent`.
//
// They join up by: the page's answer and the server's `in` and the worker's
// `rx`/`gate`/`wake` by decision id; a message the page read and the server's
// `out` by the envelope's messageId; the server's `out` and the worker frame
// it came from by (type, ordinal among frames of that type), which the
// server's `wk` and the worker's `sent` count the same way.
//
// Clocks: the pages run on the PC's clock, the server and worker on the
// container's. The two are joined by the answer's round trip (an NTP-style
// estimate from the answer sent, the server reading it, the server's receipt
// and the page receiving it: `clockOffset`). The total of every step is the
// page's own clock, click to paint, whatever the offset; the offset only
// splits the two network legs from the server's and worker's time.

/** A match message as a page handled it. Times are epoch ms (the PC's clock). */
export interface Msg {
  /** The handler started and ended. */
  t0: number;
  t1: number;
  /** JSON.parse inside the handler, ms. */
  parse: number;
  type: string;
  messageId: string;
  rev: number | null;
  decisionId: number | null;
  epoch: number | null;
  bytes: number;
  damage: boolean;
  stack: boolean;
}
export interface Send {
  t: number;
  type: string;
  decisionId: number | null;
}
export interface Input {
  t: number;
  kind: string;
}
export interface Commit {
  t: number;
  /** How many messages had been handled when it committed (inside a handler: that one too). */
  after: number;
  raf: number;
  painted: number;
}
/** Chrome's trace for the frame after a commit, ms. */
export interface FrameSplit {
  style: number;
  layout: number;
  paint: number;
}
export interface PageRun {
  role: "host" | "guest";
  msgs: Msg[];
  sends: Send[];
  inputs: Input[];
  commits: Commit[];
  /** messageId -> when the frame reached the page's network side, epoch ms. */
  net: Record<string, number>;
  /** Commit index -> the frame after it, from Chrome's trace. */
  frames: Record<number, FrameSplit>;
}
/** A server or worker mark: `t` in epoch microseconds (the container's clock). */
export type Mark = { ev: string; t: number } & Record<string, unknown>;

/** The slices of a step, in order along the path; each belongs to one part of the system. */
export const SLICES = [
  ["input", "browser", "click to the answer sent (the page's own handling)"],
  ["netUp", "network", "the answer on its way to the server"],
  ["serverIn", "server", "the server reads it, checks it, writes it to the worker"],
  ["pipeIn", "pipe", "the pipe to the worker"],
  ["workerIn", "worker", "the worker reads it and the gate takes it"],
  ["handoff", "worker", "Forge's thread wakes with it"],
  [
    "engine",
    "engine",
    "Forge decides (everything the worker's game thread does that is not below)",
  ],
  [
    "paced",
    "paced",
    "deliberate waits so the eye can follow: the stack's rest (spec 0105) and a passed step's pause (spec 0061)",
  ],
  ["prep", "worker", "a board round's shared work (damage, moves, hidden zones, the public log)"],
  ["view", "board", "each seat's view of the game, asked of Forge (ViewerSnapshot)"],
  ["history", "board", "the history and extras added to each seat's board"],
  ["hide", "board", "hidden ids and texts removed from each board (HID-001)"],
  ["write", "worker", "boards, steps and questions serialised and written to the pipe"],
  ["question", "worker", "a question built and written"],
  ["pipeOut", "pipe", "the pipe back to the server"],
  ["serverBusy", "server", "the server still busy with earlier frames"],
  ["serverParse", "server", "the server parses the frame and writes the game record"],
  ["pictures", "server", "the server adds the pictures (MatchArt)"],
  [
    "serverOther",
    "server",
    "the server's other work on the frame first (other messages it causes)",
  ],
  ["serverSend", "server", "the message put on the player's socket"],
  [
    "netDown",
    "network",
    "the socket write, the network, and the page's main thread coming free to take it (Chrome stamps a frame's arrival as the page takes it, RUN 2026-11-21)",
  ],
  ["pageBusy", "browser", "arrival stamp to the handler (about 0: see netDown)"],
  ["pageParse", "browser", "JSON.parse"],
  ["handler", "browser", "the rest of the message handler"],
  ["react", "browser", "React: render and commit (and any wait before it)"],
  ["waitFrame", "browser", "waiting for the next frame"],
  ["style", "browser", "style"],
  ["layout", "browser", "layout"],
  ["paint", "browser", "paint (pre-paint, paint, layerize, commit to the compositor)"],
  ["frameOther", "browser", "the rest of the frame (animation callbacks)"],
] as const;
export type Slice = (typeof SLICES)[number][0];

export interface SeatPath {
  role: "host" | "guest";
  /** The message that showed the result on this page. */
  type: string;
  rev: number | null;
  totalMs: number;
  slices: Record<Slice, number>;
  /** Match messages this page read in the step, their bytes, and the handler time over all of them. */
  messages: number;
  boards: number;
  bytes: number;
  handlerMsAll: number;
  commits: number;
}
export interface StepTimeline {
  acting: "host" | "guest";
  decisionId: number;
  /** Click to the later of the two pages' paint. */
  bothMs: number;
  seats: SeatPath[];
  /** Why a seat has no path (nothing found to join). */
  missing: string[];
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const ms = (us: number) => us / 1000;

/** Result messages: what a page shows as the outcome of a step (not receipts). */
const RESULT = new Set([
  "MATCH_SNAPSHOT",
  // P11-D4: a board sent as what changed (the server's `out` still says MATCH_SNAPSHOT;
  // the messageId joins them).
  "MATCH_DELTA",
  "DECISION_REQUEST",
  "MATCH_STEP",
  "MATCH_ASKING",
  "DECISION_CLEARED",
]);
/** What a page draws as the outcome first: the board, the question. */
const SHOWN = new Set(["MATCH_SNAPSHOT", "MATCH_DELTA", "DECISION_REQUEST"]);
/** Worker frames Forge's own thread writes (receipts come from the worker's main thread). */
const FORGE_FRAMES = new Set(["MATCH_SNAPSHOT", "DECISION_REQUEST", "MATCH_STEP"]);

/**
 * The PC-to-container clock offset, ms (container = PC + offset), from the
 * answer round trip with the smallest round trip: the page sent the answer
 * (t0), the server read it (t1), sent its receipt (t2), the page's network
 * side got the receipt (t3). Null when no round trip joins up.
 */
export function clockOffset(
  pages: PageRun[],
  server: Mark[],
): { offset: number; rtt: number } | null {
  let best: { offset: number; rtt: number } | null = null;
  for (const page of pages)
    for (const send of page.sends) {
      if (send.type !== "DECISION_RESPONSE" || send.decisionId === null) continue;
      const read = server.find(
        (m) =>
          m.ev === "in" && m["decisionId"] === send.decisionId && m["type"] === "DECISION_RESPONSE",
      );
      if (!read) continue;
      const receipt = page.msgs.find(
        (m) => m.type === "DECISION_ACCEPTED" && m.decisionId === send.decisionId && m.t0 >= send.t,
      );
      if (!receipt) continue;
      const out = server.find((m) => m.ev === "out" && m["messageId"] === receipt.messageId);
      const t3 = page.net[receipt.messageId];
      if (!out || t3 === undefined) continue;
      const t0 = send.t;
      const t1 = ms(read.t);
      const t2 = ms(out.t + (num(out["dur"]) ?? 0));
      const rtt = t3 - t0 - (t2 - t1);
      const offset = (t1 - t0 + (t2 - t3)) / 2;
      if (!best || rtt < best.rtt) best = { offset, rtt };
    }
  return best;
}

/** The interval [a, b) clipped to [from, to), its length. */
const clip = (a: number, b: number, from: number, to: number) =>
  Math.max(0, Math.min(b, to) - Math.max(a, from));

/**
 * The worker's game thread from [from] to [to] (epoch us), by what it was
 * doing: board rounds (prep, each seat's view, history, hiding, writing),
 * questions, steps written; the rest is Forge deciding.
 */
export function workerSlices(
  worker: Mark[],
  from: number,
  to: number,
): Partial<Record<Slice, number>> {
  const out: Partial<Record<Slice, number>> = {};
  const add = (k: Slice, us: number) => (out[k] = (out[k] ?? 0) + ms(us));
  let covered = 0;
  for (const m of worker) {
    if (m.ev === "pub") {
      const dur = num(m["dur"]) ?? 0;
      if (m.t >= to || m.t + dur <= from) continue;
      // The round's own work: all of it but its seats' boards.
      const seats = worker.filter(
        (s) => s.ev === "seat" && s["rev"] === m["rev"] && s.t >= m.t && s.t <= m.t + dur,
      );
      let seatsMs = 0;
      for (const s of seats) {
        const parts: [Slice, number][] = [
          ["view", num(s["view"]) ?? 0],
          ["history", num(s["extras"]) ?? 0],
          ["hide", num(s["hide"]) ?? 0],
          ["write", num(s["send"]) ?? 0],
        ];
        let at = s.t;
        for (const [k, us] of parts) {
          const c = clip(at, at + us, from, to);
          add(k, c);
          seatsMs += c;
          at += us;
        }
      }
      const c = Math.max(0, clip(m.t, m.t + dur, from, to) - seatsMs);
      add("prep", c);
      covered += c + seatsMs;
    } else if (m.ev === "ask") {
      const sent = worker.find(
        (s) =>
          s.ev === "sent" &&
          s["type"] === "DECISION_REQUEST" &&
          s["decisionId"] === m["decisionId"],
      );
      const end = sent ? sent.t + (num(sent["dur"]) ?? 0) : m.t;
      const c = clip(m.t, end, from, to);
      add("question", c);
      covered += c;
    } else if (m.ev === "paced") {
      const c = clip(m.t, m.t + (num(m["dur"]) ?? 0), from, to);
      add("paced", c);
      covered += c;
    } else if (m.ev === "sent" && m["type"] === "MATCH_STEP") {
      const c = clip(m.t, m.t + (num(m["dur"]) ?? 0), from, to);
      add("write", c);
      covered += c;
    }
  }
  add("engine", Math.max(0, to - from - covered));
  return out;
}

/**
 * When the click behind [send] happened: the last click (else input) on the
 * page in the 2 s before the answer went. The click, not the pointerdown
 * before it: how long a button is held down is the player's (or the test's)
 * time, not the game's.
 */
export function clickOf(page: PageRun, send: Send): number | null {
  const before = page.inputs.filter((i) => i.t <= send.t && i.t >= send.t - 2_000);
  if (!before.length) return null;
  const clicks = before.filter((i) => i.kind === "click");
  return Math.max(...(clicks.length ? clicks : before).map((i) => i.t));
}

/** The first commit that shows message [index] of [page], or null. */
function commitFor(page: PageRun, index: number): { c: Commit; i: number } | null {
  const msg = page.msgs[index]!;
  for (let i = 0; i < page.commits.length; i++) {
    const c = page.commits[i]!;
    if (c.after > index && c.t >= msg.t0) return c.painted > 0 ? { c, i } : null;
  }
  return null;
}

/**
 * One step: the answer [send] of the [acting] page, and every page's
 * result up to [until] (epoch ms, the PC's clock: the next step's click, or
 * the moment's end).
 */
export function stepTimeline(
  acting: PageRun,
  send: Send,
  pages: PageRun[],
  server: Mark[],
  worker: Mark[],
  offsetMs: number,
  until: number,
): StepTimeline | null {
  const d = send.decisionId;
  if (d === null) return null;
  const missing: string[] = [];
  const clickT = clickOf(acting, send);
  if (clickT === null) return null;
  const toHost = (us: number) => ms(us) - offsetMs;
  const read = server.find(
    (m) => m.ev === "in" && m["decisionId"] === d && m["type"] === "DECISION_RESPONSE",
  );
  const rx = worker.find((m) => m.ev === "rx" && m["decisionId"] === d);
  const gate = worker.find((m) => m.ev === "gate" && m["decisionId"] === d);
  const wake = worker.find((m) => m.ev === "wake" && m["decisionId"] === d);
  if (!read || !rx || !gate || !wake) {
    missing.push(
      `decision ${d}: ${[!read && "in", !rx && "rx", !gate && "gate", !wake && "wake"].filter(Boolean).join(", ")}`,
    );
    return { acting: acting.role, decisionId: d, bothMs: 0, seats: [], missing };
  }
  // The answer written to the worker: the first `fwd` from the read on.
  const fwd = server.find((m) => m.ev === "fwd" && m.t >= read.t && m["what"] === "an answer");
  const fwdEnd = fwd ? fwd.t + (num(fwd["dur"]) ?? 0) : read.t + (num(read["handled"]) ?? 0);
  const prefix = {
    input: send.t - clickT,
    netUp: toHost(read.t) - send.t,
    serverIn: ms(fwdEnd - read.t),
    pipeIn: ms(rx.t - fwdEnd),
    workerIn: ms(gate.t - rx.t),
    handoff: ms(wake.t - gate.t),
  };
  const seats: SeatPath[] = [];
  for (const page of pages) {
    const inStep = page.msgs
      .map((m, i) => ({ m, i, at: page.net[m.messageId] ?? m.t0 }))
      .filter((x) => x.at > send.t && x.at <= until);
    // The last result this step brought, that came from Forge's thread after it woke.
    let path: SeatPath | null = null;
    // The board or the question it brought, else a step or the "who is asked" line.
    const latest = [...inStep].reverse().filter((x) => RESULT.has(x.m.type));
    const ordered = [
      ...latest.filter((x) => SHOWN.has(x.m.type)),
      ...latest.filter((x) => !SHOWN.has(x.m.type)),
    ];
    for (const { m, i } of ordered) {
      const out = server.find((s) => s.ev === "out" && s["messageId"] === m.messageId);
      if (!out || !FORGE_FRAMES.has(String(out["fromType"]))) continue;
      const sent = worker.find(
        (s) => s.ev === "sent" && s["type"] === out["fromType"] && s["n"] === out["fromN"],
      );
      const wk = server.find(
        (s) => s.ev === "wk" && s["type"] === out["fromType"] && s["n"] === out["fromN"],
      );
      if (!sent || !wk || sent.t < wake.t) continue;
      const shown = commitFor(page, i);
      const netAt = page.net[m.messageId];
      if (!shown || netAt === undefined) {
        missing.push(
          `${page.role}: ${m.type} ${m.messageId} ${!shown ? "never committed and painted" : "no network time"}`,
        );
        break;
      }
      const sentEnd = sent.t + (num(sent["dur"]) ?? 0);
      // The pump was free again when it finished the frame before this one.
      const pumpFree = Math.max(
        sentEnd,
        ...server.filter((s) => s.ev === "wkDone" && s.t <= wk.t).map((s) => s.t),
      );
      const parsed = wk.t + (num(wk["parse"]) ?? 0) + (num(wk["record"]) ?? 0);
      const art =
        out["type"] === "MATCH_SNAPSHOT"
          ? server.find((s) => s.ev === "art" && s.t >= parsed && s.t <= out.t)
          : undefined;
      const pictures = art ? (num(art["dur"]) ?? 0) : 0;
      const outEnd = out.t + (num(out["dur"]) ?? 0);
      const { c, i: ci } = shown;
      const frame = page.frames[ci] ?? { style: 0, layout: 0, paint: 0 };
      const slices = {
        ...emptySlices(),
        ...prefix,
        ...workerSlices(worker, wake.t, sentEnd),
        pipeOut: ms(wk.t - pumpFree),
        serverBusy: ms(pumpFree - sentEnd),
        serverParse: ms(parsed - wk.t),
        pictures: ms(pictures),
        serverOther: ms(out.t - parsed - pictures),
        serverSend: ms(outEnd - out.t),
        netDown: netAt - toHost(outEnd),
        pageBusy: m.t0 - netAt,
        pageParse: m.parse,
        handler: m.t1 - m.t0 - m.parse,
        react: c.t - m.t1,
        waitFrame: c.raf - c.t,
        style: frame.style,
        layout: frame.layout,
        paint: frame.paint,
        frameOther: c.painted - c.raf - frame.style - frame.layout - frame.paint,
      } as Record<Slice, number>;
      path = {
        role: page.role,
        type: m.type,
        rev: m.rev,
        totalMs: c.painted - clickT,
        slices,
        messages: inStep.length,
        boards: inStep.filter((x) => x.m.type === "MATCH_SNAPSHOT" || x.m.type === "MATCH_DELTA")
          .length,
        bytes: inStep.reduce((a, x) => a + x.m.bytes, 0),
        handlerMsAll: inStep.reduce((a, x) => a + x.m.t1 - x.m.t0, 0),
        commits: page.commits.filter((k) => k.t > send.t && k.t <= until).length,
      };
      break;
    }
    if (path) seats.push(path);
    else if (!missing.some((s) => s.startsWith(page.role)))
      missing.push(`${page.role}: no result joined up`);
  }
  return {
    acting: acting.role,
    decisionId: d,
    bothMs: Math.max(0, ...seats.map((s) => s.totalMs)),
    seats,
    missing,
  };
}

export function emptySlices(): Record<Slice, number> {
  return Object.fromEntries(SLICES.map(([k]) => [k, 0])) as Record<Slice, number>;
}

/** Every step of a moment: each answer a page sent from [from] to [to] (epoch ms), in order. */
export function momentSteps(
  pages: PageRun[],
  server: Mark[],
  worker: Mark[],
  offsetMs: number,
  from: number,
  to: number,
): StepTimeline[] {
  const sends = pages
    .flatMap((p) =>
      p.sends
        .filter((s) => s.type === "DECISION_RESPONSE" && s.t >= from && s.t <= to)
        .map((s) => ({ p, s })),
    )
    .sort((a, b) => a.s.t - b.s.t);
  const steps: StepTimeline[] = [];
  sends.forEach(({ p, s }, k) => {
    const next = sends[k + 1];
    // The step ends where the next one's click begins (the bot waits for quiet first).
    const nextClick = next ? (clickOf(next.p, next.s) ?? next.s.t) : to;
    const step = stepTimeline(p, s, pages, server, worker, offsetMs, Math.min(to, nextClick));
    if (step) steps.push(step);
  });
  return steps;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * A moment's rows for the kit's result file: one per page, every slice
 * summed over the moment's steps, and one for both pages (each step's later
 * paint, summed). Bot time between steps is not in any of them.
 */
export function momentRows(key: string, steps: StepTimeline[]): Record<string, number | string>[] {
  const rows: Record<string, number | string>[] = [];
  for (const role of ["host", "guest"] as const) {
    const paths = steps.flatMap((s) => s.seats.filter((p) => p.role === role));
    const row: Record<string, number | string> = { key: `${key} ${role}`, steps: paths.length };
    row["totalMs"] = r2(paths.reduce((a, p) => a + p.totalMs, 0));
    for (const [k] of SLICES) row[`ms_${k}`] = r2(paths.reduce((a, p) => a + p.slices[k], 0));
    // Without the deliberate waits: the time the system itself takes.
    row["unpacedMs"] = r2(paths.reduce((a, p) => a + p.totalMs - p.slices.paced, 0));
    row["messages"] = paths.reduce((a, p) => a + p.messages, 0);
    row["boards"] = paths.reduce((a, p) => a + p.boards, 0);
    row["bytes"] = paths.reduce((a, p) => a + p.bytes, 0);
    row["handlerMsAll"] = r2(paths.reduce((a, p) => a + p.handlerMsAll, 0));
    row["commits"] = paths.reduce((a, p) => a + p.commits, 0);
    rows.push(row);
  }
  rows.push({
    key: `${key} both`,
    steps: steps.length,
    bothMs: r2(steps.reduce((a, s) => a + s.bothMs, 0)),
    missing: steps.reduce((a, s) => a + s.missing.length, 0),
  });
  return rows;
}

/** Chrome's trace events, as the probes read them. */
export interface TraceEvent {
  name: string;
  ph?: string;
  ts?: number;
  dur?: number;
  pid?: number;
  tid?: number;
}

const STYLE = new Set(["UpdateLayoutTree", "RecalculateStyles"]);
const LAYOUT = new Set(["Layout"]);
const PAINT = new Set(["PrePaint", "Paint", "Layerize", "Commit", "UpdateLayerTree"]);

/**
 * The page's clock against the trace's: its sync mark (a `performance.mark`
 * named [mark], made when the page's clock read [epochMs]) is on the page's
 * main thread, which also names the thread the frame work is on.
 */
export function traceClock(events: TraceEvent[], mark: string, epochMs: number) {
  const sync = events.find((e) => e.name === mark && typeof e.ts === "number");
  if (!sync) return null;
  return {
    pid: sync.pid,
    tid: sync.tid,
    /** A trace time (us) on the page's clock (epoch ms). */
    toEpoch: (ts: number) => epochMs + (ts - sync.ts!) / 1000,
    /** A page time (epoch ms) on the trace's clock (us). */
    toTrace: (epoch: number) => sync.ts! + (epoch - epochMs) * 1000,
  };
}

/** Style, layout and paint on the page's main thread between [from] and [to] (trace us). */
export function frameSplit(
  events: TraceEvent[],
  pid: number | undefined,
  tid: number | undefined,
  from: number,
  to: number,
): FrameSplit {
  const out = { style: 0, layout: 0, paint: 0 };
  for (const e of events) {
    if (e.ph !== "X" || e.pid !== pid || e.tid !== tid || e.ts === undefined) continue;
    const c = clip(e.ts, e.ts + (e.dur ?? 0), from, to) / 1000;
    if (c <= 0) continue;
    if (STYLE.has(e.name)) out.style += c;
    else if (LAYOUT.has(e.name)) out.layout += c;
    else if (PAINT.has(e.name)) out.paint += c;
  }
  return out;
}

/** The marks in a log's text: every line holding the prefix, parsed; lines that do not parse are skipped. */
export function readMarks(text: string, matchId?: string): Mark[] {
  const out: Mark[] = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf("proxic-timing {");
    if (at < 0) continue;
    try {
      const m = JSON.parse(line.slice(at + "proxic-timing ".length)) as Mark;
      if (matchId && typeof m["match"] === "string" && m["match"] !== matchId) continue;
      out.push(m);
    } catch {
      // a line cut by another writer: skipped
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
