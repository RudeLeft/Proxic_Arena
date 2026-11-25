// The wire measure's byte counter (PHASE_11 P11-D1): every message each
// page's sockets bring or send, as the browser sees it (Playwright's
// `websocket` events: the message after any permessage-deflate is undone,
// so these are the bytes the page reads, not the bytes on the wire). What
// crosses the wire is `tap`'s count (P11-D2), beside it in the real game.

import type { Page } from "@playwright/test";
import { createServer, connect, type Socket } from "node:net";
import { percentile } from "./probes";

/** Bytes a socket's TCP connection brought the page, after its handshake (P11-D2). */
export interface WireChunk {
  t: number;
  socket: "match" | "user" | "other";
  bytes: number;
}

export interface Tap {
  /** The address to give the page instead of the server's. */
  base: string;
  chunks: WireChunk[];
  close(): Promise<void>;
}

/**
 * A pass-through relay in front of the server that counts what really
 * crosses the wire on each socket's connection (P11-D2): the frames as
 * sent, compressed or not, with their headers. Playwright's events give
 * the message after permessage-deflate is undone; this gives the bytes
 * before. Nothing is delayed (link.ts makes slow links; this only counts).
 */
export async function tap(target: URL): Promise<Tap> {
  const chunks: WireChunk[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const upstream = connect(Number(target.port || 80), target.hostname);
    sockets.add(client).add(upstream);
    let socket: WireChunk["socket"] | null = null;
    let handshake = Buffer.alloc(0);
    let upgraded = false;
    client.on("data", (chunk) => {
      if (socket === null) {
        const first = chunk.toString("latin1", 0, Math.min(chunk.length, 200));
        socket = /^GET \/ws\/matches\//.test(first)
          ? "match"
          : /^GET \/ws\/(lobby|user)/.test(first)
            ? "user"
            : "other";
        // PROXIC_MEASURE_NO_DEFLATE=1: drop the browser's offer, as a proxy that
        // strips the header would (the same build, compression off, P11-D2's A/B).
        if (socket !== "other" && process.env.PROXIC_MEASURE_NO_DEFLATE === "1") {
          const head = chunk.toString("latin1");
          const stripped = head.replace(/\r\nSec-WebSocket-Extensions:[^\r]*/gi, "");
          if (stripped !== head) chunk = Buffer.from(stripped, "latin1");
        }
      }
      upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      client.write(chunk);
      if (socket === "other" || socket === null) return;
      if (!upgraded) {
        // The 101's headers are not the socket's traffic.
        handshake = Buffer.concat([handshake, chunk]);
        const end = handshake.indexOf("\r\n\r\n");
        if (end < 0) return;
        upgraded = true;
        const rest = handshake.length - end - 4;
        if (rest > 0) chunks.push({ t: Date.now(), socket, bytes: rest });
        return;
      }
      chunks.push({ t: Date.now(), socket, bytes: chunk.length });
    });
    const kill = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", kill).on("close", kill);
    upstream.on("error", kill).on("close", kill);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    base: `http://${target.hostname}:${port}`,
    chunks,
    close: () =>
      new Promise<void>((ok) => {
        for (const s of sockets) s.destroy();
        server.close(() => ok());
      }),
  };
}

/** The match socket's bytes on the wire in [from, to], from [tap]. */
export function wireBytesIn(chunks: WireChunk[], from: number, to = Infinity): number {
  return chunks
    .filter((c) => c.socket === "match" && c.t >= from && c.t <= to)
    .reduce((a, c) => a + c.bytes, 0);
}

export interface Frame {
  t: number;
  dir: "in" | "out";
  socket: "match" | "user" | "other";
  type: string;
  bytes: number;
}

export interface Counter {
  frames: Frame[];
  /** The largest board this page read, as sent (for what its bytes are made of). */
  largest: string;
  /** The frames from [from] (Date.now()) to [to]. */
  between(from: number, to?: number): Frame[];
}

const typeOf = (s: string) => {
  const m = /"type"\s*:\s*"([A-Z_]+)"/.exec(s.slice(0, 200));
  return m ? m[1]! : "?";
};

export function countBytes(page: Page): Counter {
  const frames: Frame[] = [];
  const counter = {
    frames,
    largest: "",
    between: (from: number, to = Infinity) => frames.filter((f) => f.t >= from && f.t <= to),
  };
  page.on("websocket", (ws) => {
    const socket = ws.url().includes("/ws/matches/")
      ? "match"
      : /\/ws\/(lobby|user)/.test(ws.url())
        ? "user"
        : "other";
    const add = (dir: "in" | "out") => (f: { payload: string | Buffer }) => {
      const s = typeof f.payload === "string" ? f.payload : f.payload.toString("utf8");
      const type = typeOf(s);
      frames.push({ t: Date.now(), dir, socket, type, bytes: Buffer.byteLength(s) });
      if (type === "MATCH_SNAPSHOT" && s.length > counter.largest.length) counter.largest = s;
    };
    ws.on("framereceived", add("in"));
    ws.on("framesent", add("out"));
  });
  return counter;
}

/** Each top-level field's share of a board's bytes, and the picture fields' share of its cards. */
export function boardMakeup(board: string): Record<string, number> {
  if (!board) return {};
  const state = (JSON.parse(board) as { state?: Record<string, unknown> }).state ?? {};
  const total = Buffer.byteLength(board);
  const out: Record<string, number> = { bytes: total };
  for (const [k, v] of Object.entries(state))
    out[`share_${k}`] = Math.round((Buffer.byteLength(JSON.stringify(v)) / total) * 1000) / 1000;
  // The fields the server adds to cards (MatchArt annotate): `art` and `crop`.
  let art = 0;
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object")
      for (const [k, v] of Object.entries(x)) {
        if ((k === "art" || k === "crop") && typeof v === "string")
          art += Buffer.byteLength(JSON.stringify(k)) + Buffer.byteLength(JSON.stringify(v)) + 2;
        else walk(v);
      }
  };
  walk(state);
  out["share_pictureFields"] = Math.round((art / total) * 1000) / 1000;
  return out;
}

/** The numbers D1 asks for, over [frames] (one seat's page). */
export function wireNumbers(frames: Frame[], seconds: number): Record<string, number> {
  const inMatch = frames.filter((f) => f.dir === "in" && f.socket === "match");
  // P11-D4: a MATCH_DELTA is an update too (the board the page rebuilds).
  const boards = inMatch
    .filter((f) => f.type === "MATCH_SNAPSHOT" || f.type === "MATCH_DELTA")
    .map((f) => f.bytes);
  const deltas = inMatch.filter((f) => f.type === "MATCH_DELTA").length;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    matchMessages: inMatch.length,
    boards: boards.length,
    deltas,
    boardBytesMedian: percentile(boards, 0.5),
    boardBytesP95: percentile(boards, 0.95),
    boardBytesLargest: Math.max(0, ...boards),
    matchBytesIn: sum(inMatch.map((f) => f.bytes)),
    matchBytesOut: sum(
      frames.filter((f) => f.dir === "out" && f.socket === "match").map((f) => f.bytes),
    ),
    userBytesIn: sum(
      frames.filter((f) => f.dir === "in" && f.socket === "user").map((f) => f.bytes),
    ),
    messagesPerSecond: Math.round((inMatch.length / Math.max(0.001, seconds)) * 10) / 10,
    // What the match socket's messages are, by type: how many, and their bytes.
    ...Object.fromEntries(
      [...new Set(inMatch.map((f) => f.type))].flatMap((type) => {
        const of = inMatch.filter((f) => f.type === type);
        return [
          [`n_${type}`, of.length],
          [`bytes_${type}`, sum(of.map((f) => f.bytes))],
        ];
      }),
    ),
  };
}
