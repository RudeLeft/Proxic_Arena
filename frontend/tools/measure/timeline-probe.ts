// P11-D0's page probes (timeline.ts reads what they collect). Chromium only.
//
// `installProbe` runs in the page before its own scripts (addInitScript):
// - the match socket's handler, timed, with its JSON.parse apart, and each
//   message's type, messageId, board revision and decision id read after the
//   handler is done (so the reading is not in the handler's time);
// - every answer the page sends (DECISION_RESPONSE and the rest);
// - every pointerdown and click (capture phase, before the app's own);
// - every React commit (the devtools hook, as speed-kit's RECORDER), the
//   next animation frame after it, and a message posted from that frame,
//   which runs once the frame's style, layout and paint are done.
// Times are epoch ms on the page's clock (timeOrigin + now).
//
// `pageProbe` (Node side) adds what the page can't see itself: when each
// message reached the page (CDP Network.webSocketFrameReceived, stamped as the
// page's main thread takes it: see timeline.ts)
// and Chrome's trace of the frame after each commit.

import type { Browser, CDPSession, Page } from "@playwright/test";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  frameSplit,
  traceClock,
  type Commit,
  type FrameSplit,
  type Input,
  type Msg,
  type PageRun,
  type Send,
  type TraceEvent,
} from "./timeline";

interface Probe {
  msgs: Msg[];
  sends: Send[];
  inputs: Input[];
  commits: Commit[];
  inHandler: boolean;
  parseMs: number;
}

/** Runs in the page (Playwright serialises it), before the page's scripts. */
export function installProbe() {
  const now = () => performance.timeOrigin + performance.now();
  const P: Probe = { msgs: [], sends: [], inputs: [], commits: [], inHandler: false, parseMs: 0 };
  (window as unknown as { __tl: Probe }).__tl = P;

  const nativeParse = JSON.parse;
  JSON.parse = function (text: string, reviver?: (k: string, v: unknown) => unknown): unknown {
    if (!P.inHandler) return nativeParse(text, reviver) as unknown;
    const t0 = performance.now();
    try {
      return nativeParse(text, reviver) as unknown;
    } finally {
      P.parseMs += performance.now() - t0;
    }
  } as typeof JSON.parse;

  const field = (s: string, re: RegExp) => {
    const m = re.exec(s);
    return m ? Number(m[1]) : null;
  };
  const Native = window.WebSocket;
  const onmessage = Object.getOwnPropertyDescriptor(Native.prototype, "onmessage")!;
  class Probed extends Native {
    private readonly match: boolean;
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.match = String(url).includes("/ws/matches/");
      if (!this.match) return;
      const ws = this as WebSocket;
      Object.defineProperty(ws, "onmessage", {
        configurable: true,
        get: (): unknown => onmessage.get!.call(ws) as unknown,
        set: (fn: ((ev: MessageEvent) => unknown) | null) => {
          if (!fn) {
            onmessage.set!.call(ws, null);
            return;
          }
          onmessage.set!.call(ws, function (this: WebSocket, ev: MessageEvent) {
            const t0 = now();
            P.inHandler = true;
            P.parseMs = 0;
            try {
              return fn.call(this, ev);
            } finally {
              const t1 = now();
              P.inHandler = false;
              const d = typeof ev.data === "string" ? ev.data : "";
              const head = d.slice(0, 300);
              P.msgs.push({
                t0,
                t1,
                parse: P.parseMs,
                type: /"type":"([A-Z_]+)"/.exec(head)?.[1] ?? "?",
                messageId: /"messageId":"([^"]+)"/.exec(head)?.[1] ?? "",
                rev: field(d, /"stateRevision":(\d+)/),
                decisionId: field(head, /"decisionId":(\d+)/),
                epoch: field(d, /"gameEpoch":(\d+)/),
                bytes: d.length,
                damage: d.includes('"damage":{'),
                stack: d.includes('"stack":[{'),
              });
            }
          });
        },
      });
    }
    override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (this.match && typeof data === "string") {
        P.sends.push({
          t: now(),
          type: /"type":"([A-Z_]+)"/.exec(data)?.[1] ?? "?",
          decisionId: field(data, /"decisionId":(\d+)/),
        });
      }
      super.send(data);
    }
  }
  window.WebSocket = Probed;

  for (const kind of ["pointerdown", "click"])
    window.addEventListener(kind, () => P.inputs.push({ t: now(), kind }), true);

  // React's devtools hook, as speed-kit's RECORDER: each commit, then its frame.
  (
    window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
  ).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(this: { renderers: Map<number, unknown> }, r: unknown) {
      this.renderers.set(1, r);
      return 1;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot() {
      const c: Commit = {
        t: now(),
        after: P.msgs.length + (P.inHandler ? 1 : 0),
        raf: 0,
        painted: 0,
      };
      P.commits.push(c);
      requestAnimationFrame(() => {
        c.raf = now();
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          c.painted = now();
        };
        channel.port2.postMessage(0);
      });
    },
  };
}

/** The probe's records so far, read from the page. */
async function records(page: Page): Promise<Omit<Probe, "inHandler" | "parseMs">> {
  return page.evaluate(() => {
    const P = (window as unknown as { __tl: Probe }).__tl;
    return { msgs: P.msgs, sends: P.sends, inputs: P.inputs, commits: P.commits };
  });
}

export interface PageProbe {
  page: Page;
  role: "host" | "guest";
  cdp: CDPSession;
  /** messageId -> the network side's monotonic time (s). */
  netTs: Map<string, number>;
  /** When the page last read a match message (Node's clock): for "quiet". */
  lastMatchMessage: number;
  /** When the page last sent an answer (Node's clock). */
  lastAnswer: number;
  /** What its boards have shown so far: boards with damage, the last game epoch, boards with a stack. */
  seen: { damage: number; epoch: number; stacked: number; asking: boolean };
}

/** The Node side of a page's probe: its CDP session, the network times, the CPU rate. */
export async function pageProbe(
  page: Page,
  role: "host" | "guest",
  cpu: number,
): Promise<PageProbe> {
  const cdp = await page.context().newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await cdp.send("Network.enable");
  const probe: PageProbe = {
    page,
    role,
    cdp,
    netTs: new Map(),
    lastMatchMessage: Date.now(),
    lastAnswer: 0,
    seen: { damage: 0, epoch: 0, stacked: 0, asking: true },
  };
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.payloadData.includes('"DECISION_RESPONSE"')) probe.lastAnswer = Date.now();
  });
  cdp.on("Network.webSocketFrameReceived", (e) => {
    const data = e.response.payloadData;
    const head = data.slice(0, 300);
    const id = /"messageId":"([^"]+)"/.exec(head)?.[1];
    if (id) probe.netTs.set(id, e.timestamp);
    // The match socket's messages (the lobby's have other types). Read here, not
    // from Playwright's websocket event: the socket was opened before the probe.
    if (/"type":"(MATCH_|DECISION_)/.test(head)) probe.lastMatchMessage = Date.now();
    // Spec 0002: who is asked now; a null seat is the game working (or resting).
    if (data.slice(0, 120).includes('"MATCH_ASKING"'))
      probe.seen.asking = !/"seat":null/.test(data);
    // P11-D4: a delta names what changed: damage in `set`, a stack entry in `set` or `lists`.
    if (/"MATCH_(SNAPSHOT|DELTA)"/.test(data.slice(0, 120))) {
      if (data.includes('"damage":{')) probe.seen.damage++;
      if (data.includes('"stack":[{') || data.includes('"stack":{"put":[{')) probe.seen.stacked++;
      const epoch = /"gameEpoch":(\d+)/.exec(data);
      if (epoch) probe.seen.epoch = Number(epoch[1]);
    }
  });
  return probe;
}

/**
 * Wait until a match message came after [after] (Date.now(): an answer was
 * just sent), neither page has read one for [quietMs], and a player
 * is being asked something (a deliberate wait, the stack's rest, can hold the
 * game silent for seconds with nobody asked), or [maxMs] passed.
 */
export async function quiet(probes: PageProbe[], after = 0, quietMs = 1_200, maxMs = 30_000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    const last = Math.max(...probes.map((p) => p.lastMatchMessage));
    if (last > after && Date.now() - last >= quietMs && probes.every((p) => p.seen.asking)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** After an action begun at [at]: if it sent an answer, wait for what that brings, then quiet. */
export async function settle(probes: PageProbe[], at: number) {
  // The sent frame's event reaches Node a moment after the click returns.
  const sent = () => probes.some((p) => p.lastAnswer >= at);
  for (let k = 0; k < 6 && !sent(); k++) await new Promise((r) => setTimeout(r, 50));
  await quiet(probes, sent() ? at : 0);
}

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink.user_timing",
  "toplevel",
];

/**
 * A moment under Chrome's trace (both pages: the trace is the browser's).
 * Returns each page's run: its records, the network times on the page's
 * clock (through the sync mark each page makes in the trace), and the
 * style, layout and paint of the frame after each commit in the moment.
 */
export async function traced(
  browser: Browser,
  probes: PageProbe[],
  during: () => Promise<void>,
): Promise<{ runs: PageRun[]; from: number; to: number; traceSynced: boolean[] }> {
  const file = join(tmpdir(), `proxic-timeline-${process.pid}-${Date.now()}.json`);
  await browser.startTracing(probes[0]!.page, { path: file, categories: CATEGORIES });
  const sync = async () =>
    Promise.all(
      probes.map((p) =>
        p.page.evaluate((name) => {
          const at = performance.timeOrigin + performance.now();
          performance.mark(name);
          return at;
        }, `proxic-tl-sync-${p.role}`),
      ),
    );
  const synced = await sync();
  const from = Math.min(...synced);
  await during();
  const to = Date.now();
  const got = await Promise.all(probes.map((p) => records(p.page)));
  await browser.stopTracing();
  const trace = JSON.parse(readFileSync(file, "utf8")) as
    | { traceEvents: TraceEvent[] }
    | TraceEvent[];
  rmSync(file, { force: true });
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const traceSynced: boolean[] = [];
  const runs = probes.map((p, k): PageRun => {
    const r = got[k]!;
    const clock = traceClock(events, `proxic-tl-sync-${p.role}`, synced[k]!);
    traceSynced.push(clock !== null);
    const net: Record<string, number> = {};
    // The network's monotonic seconds on the page's clock: through the trace when
    // its sync mark is there (trace and network share Chrome's monotonic clock),
    // else assuming the quickest message was read the moment it arrived.
    let toEpoch: (ts: number) => number;
    if (clock) toEpoch = (ts) => clock.toEpoch(ts * 1e6);
    else {
      let offset = Infinity;
      for (const m of r.msgs) {
        const ts = p.netTs.get(m.messageId);
        if (ts !== undefined) offset = Math.min(offset, m.t0 - ts * 1000);
      }
      toEpoch = (ts) => ts * 1000 + (Number.isFinite(offset) ? offset : 0);
    }
    for (const m of r.msgs) {
      const ts = p.netTs.get(m.messageId);
      if (ts !== undefined) net[m.messageId] = toEpoch(ts);
    }
    const frames: Record<number, FrameSplit> = {};
    if (clock)
      r.commits.forEach((c, i) => {
        if (c.t < from || !c.painted) return;
        frames[i] = frameSplit(
          events,
          clock.pid,
          clock.tid,
          clock.toTrace(c.raf),
          clock.toTrace(c.painted),
        );
      });
    return { role: p.role, ...r, net, frames };
  });
  return { runs, from, to, traceSynced };
}
