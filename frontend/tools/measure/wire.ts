// The wire measure's byte counter (PHASE_11 P11-D1): every message each
// page's sockets bring or send, as the browser sees it (Playwright's
// `websocket` events: the message after any permessage-deflate is undone,
// so these are the bytes the page reads, not the bytes on the wire).

import type { Page } from "@playwright/test";
import { percentile } from "./probes";

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
  const boards = inMatch.filter((f) => f.type === "MATCH_SNAPSHOT").map((f) => f.bytes);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    matchMessages: inMatch.length,
    boards: boards.length,
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
