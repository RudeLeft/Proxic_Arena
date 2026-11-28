// P11-D6 (spec 0119) -- a page's game connection over a link the test controls.
//
// Chrome's network emulation does not reach WebSocket frames (RUN
// 2026-11-26, spec 0119 "inferences checked" 9), so a slow link is made
// here instead: the page's match socket is routed (routeWebSocket) to this
// relay, which opens its OWN connection to the server over raw TCP and
// passes messages both ways. Because the relay reads the server's socket
// itself, it can do what a real link does to the bytes on the wire:
//
//   - `delayMs`: each chunk of the server's bytes reaches the page this much
//     later (and each page message reaches the server this much later);
//   - `bytesPerSecond`: the server's bytes are let through no faster than
//     this, on the bytes as they are on the wire (compressed when the server
//     compresses, as a browser's would be);
//   - `bufferBytes`: what the link itself holds; past it the relay stops
//     reading the socket, so TCP pushes back on the server, as a full
//     bottleneck does;
//   - `stall()`: nothing read at all (a page that stopped reading, or a link
//     that froze): the server's socket fills; `resume()` reads on;
//   - `plain`: no compression offered and no `?deltas=1`, so every board goes
//     whole: the most bytes a connection can be sent (a proxy that strips
//     compression), to fill a stuck connection's buffers in seconds.
//
// The page sees an ordinary WebSocket (Playwright's frame events included).
// The server's pings are answered as they are let through, so a stalled link
// does not answer them either.
import type { BrowserContext, Page, WebSocketRoute } from "@playwright/test";
import { connect, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { constants as zlibConstants, inflateRawSync } from "node:zlib";
import { WholeBoards } from "../src/delta";

export type LinkOptions = {
  delayMs?: number;
  bytesPerSecond?: number;
  bufferBytes?: number;
  plain?: boolean;
  /**
   * Spec 0120 -- the line is down: a new connection never gets through (it
   * is closed at once, as a dead network fails it), so a page that gives up
   * and reconnects gets no further.
   * Read when each connection opens: set it, and clear it, on the options
   * object given to `slowLink`.
   */
  down?: boolean;
};

/** D6's poor link (owner decision 4): 1 Mbit/s, 300 ms each way. */
export const POOR_LINK: LinkOptions = {
  delayMs: 300,
  bytesPerSecond: 125_000,
  bufferBytes: 64 * 1024,
};

const PIECE = 1460; // one TCP segment's payload: pacing is this fine
const WINDOW = 32 * 1024; // permessage-deflate's window (the server keeps its context)
const TAIL = Buffer.from([0x00, 0x00, 0xff, 0xff]);

/** One relayed connection. */
export class Link {
  readonly url: string;
  readonly opened = Date.now();
  /** Bytes read off the server's socket (as on the wire). */
  wireBytes = 0;
  /** Messages handed to the page, and the most any waited in the relay (ms) since it came off the socket. */
  toPage = 0;
  longestHeldMs = 0;
  /** The server's close frame, if one got through: its code. */
  closeCode: number | null = null;
  /** When the server's side ended (a close frame or the socket's end), in ms since the epoch. */
  endedAt: number | null = null;
  /** When writing to the server first failed (the server had closed), ms since the epoch. */
  writeFailedAt: number | null = null;
  compressed = false;
  /**
   * What the page was handed, as a test reads a socket: when each message
   * went to the page, and its boards rebuilt (a routed socket that never
   * connects to the server raises no page `websocket` events).
   */
  readonly at: number[] = [];
  readonly whole = new WholeBoards();
  boards = 0;

  private socket: Socket | null = null;
  private stalled = false;
  private spam: ReturnType<typeof setInterval> | null = null;
  private backlog: { at: number; bytes: Buffer }[] = [];
  private backlogBytes = 0;
  private nextFree = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private parsed = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentRsv1 = false;
  private window = Buffer.alloc(0);
  private socketEnded = false;
  private done = false;

  constructor(
    private readonly route: WebSocketRoute,
    private readonly options: LinkOptions,
  ) {
    this.url = route.url();
  }

  /** Stop reading the server's socket. [askForBoards]: and ask for the whole board once a second meanwhile. */
  stall(askForBoards = false) {
    this.stalled = true;
    this.socket?.pause();
    if (askForBoards)
      this.spam = setInterval(() => this.write(JSON.stringify({ type: "MATCH_RESYNC" })), 1_000);
  }

  /**
   * Spec 0120 -- the page goes away cleanly (a tab closed): a close frame
   * (1001, "going away") to the server, as a browser sends, then the socket ends.
   */
  goAway() {
    const code = Buffer.alloc(2);
    code.writeUInt16BE(1001, 0);
    this.send(0x8, code);
    this.socket?.end();
  }

  resume() {
    this.stalled = false;
    if (this.spam) clearInterval(this.spam);
    this.spam = null;
    this.socket?.resume();
    this.pump();
  }

  async open(context: BrowserContext) {
    // Spec 0120 -- the line is down: the connection never gets through.
    if (this.options.down) {
      this.finish(1011, "the line is down");
      return;
    }
    const target = new URL(this.url);
    if (this.options.plain) target.searchParams.delete("deltas");
    const origin = `http://${target.host}`;
    const cookie = (await context.cookies(origin)).map((c) => `${c.name}=${c.value}`).join("; ");
    const socket = connect(Number(target.port || 80), target.hostname);
    this.socket = socket;
    socket.setNoDelay(true);
    const offer = this.options.plain ? "" : "Sec-WebSocket-Extensions: permessage-deflate\r\n";
    socket.on("connect", () =>
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\nOrigin: ${origin}\r\n` +
          `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n` +
          `Sec-WebSocket-Version: 13\r\n${offer}Cookie: ${cookie}\r\n\r\n`,
      ),
    );
    let head = Buffer.alloc(0);
    let upgraded = false;
    socket.on("data", (chunk: Buffer) => {
      if (!upgraded) {
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf("\r\n\r\n");
        if (end < 0) return;
        const text = head.subarray(0, end).toString("latin1");
        if (!text.startsWith("HTTP/1.1 101")) {
          this.finish(1011, "refused");
          return;
        }
        this.compressed = /permessage-deflate/i.test(text);
        upgraded = true;
        chunk = head.subarray(end + 4);
        for (const queued of this.early) this.write(queued);
        this.early = [];
        if (chunk.length === 0) return;
      }
      this.arrive(chunk);
    });
    socket.on("end", () => {
      this.socketEnded = true;
      this.pump();
    });
    socket.on("error", () => {
      this.socketEnded = true;
      this.writeFailedAt ??= Date.now();
      this.pump();
    });
    socket.on("close", () => {
      this.socketEnded = true;
      this.pump();
    });
    this.route.onMessage((message) => {
      const text = typeof message === "string" ? message : message.toString();
      setTimeout(
        () => (upgraded ? this.write(text) : this.early.push(text)),
        this.options.delayMs ?? 0,
      );
    });
    this.route.onClose((code, reason) => {
      this.done = true;
      if (this.spam) clearInterval(this.spam);
      socket.destroy();
      // The page closed it: closed for the page too (a handler set here replaces Playwright's own).
      void this.route.close({ code: code ?? 1000, reason: reason ?? "" }).catch(() => undefined);
    });
  }

  private early: string[] = [];

  private arrive(chunk: Buffer) {
    this.wireBytes += chunk.length;
    const at = Date.now();
    for (let i = 0; i < chunk.length; i += PIECE)
      this.backlog.push({ at, bytes: chunk.subarray(i, i + PIECE) });
    this.backlogBytes += chunk.length;
    if (this.backlogBytes > (this.options.bufferBytes ?? Infinity)) this.socket?.pause();
    this.pump();
  }

  /** Let the backlog through at the link's pace. */
  private pump() {
    if (this.timer) return;
    while (!this.stalled && this.backlog.length > 0) {
      const head = this.backlog[0]!;
      const now = Date.now();
      const due = Math.max(head.at + (this.options.delayMs ?? 0), this.nextFree);
      if (due > now) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.pump();
        }, due - now);
        return;
      }
      this.backlog.shift();
      this.backlogBytes -= head.bytes.length;
      const rate = this.options.bytesPerSecond;
      this.nextFree = rate ? due + (head.bytes.length * 1000) / rate : due;
      this.longestHeldMs = Math.max(this.longestHeldMs, now - head.at);
      this.frames(head.bytes);
      if (this.backlogBytes <= (this.options.bufferBytes ?? Infinity) && !this.stalled)
        this.socket?.resume();
    }
    if (!this.stalled && this.backlog.length === 0 && this.socketEnded)
      this.finish(1011, "the link closed");
  }

  /** The server's frames, as they are let through. */
  private frames(bytes: Buffer) {
    this.parsed = Buffer.concat([this.parsed, bytes]);
    for (;;) {
      const b = this.parsed;
      if (b.length < 2) return;
      let length = b[1]! & 0x7f;
      let at = 2;
      if (length === 126) {
        if (b.length < 4) return;
        length = b.readUInt16BE(2);
        at = 4;
      } else if (length === 127) {
        if (b.length < 10) return;
        length = Number(b.readBigUInt64BE(2));
        at = 10;
      }
      if (b.length < at + length) return;
      const fin = (b[0]! & 0x80) !== 0;
      const rsv1 = (b[0]! & 0x40) !== 0;
      const opcode = b[0]! & 0x0f;
      const payload = b.subarray(at, at + length);
      this.parsed = b.subarray(at + length);
      this.frame(fin, rsv1, opcode, payload);
    }
  }

  private frame(fin: boolean, rsv1: boolean, opcode: number, payload: Buffer) {
    if (opcode === 0x9) return this.control(0xa, payload); // ping -> pong
    if (opcode === 0xa) return;
    if (opcode === 0x8) {
      this.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
      const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
      this.finish(this.closeCode === 1005 ? 1000 : this.closeCode, reason);
      return;
    }
    if (opcode !== 0x0) this.fragmentRsv1 = rsv1;
    this.fragments.push(Buffer.from(payload));
    if (!fin) return;
    let data = Buffer.concat(this.fragments);
    this.fragments = [];
    if (this.fragmentRsv1) {
      // The server keeps its compressor's window between messages: the last
      // 32 KB of what came before is this message's dictionary.
      // (Each message ends on a sync flush, not the stream's end.)
      data = inflateRawSync(Buffer.concat([data, TAIL]), {
        finishFlush: zlibConstants.Z_SYNC_FLUSH,
        ...(this.window.length ? { dictionary: this.window } : {}),
      });
      const seen = Buffer.concat([this.window, data]);
      this.window = seen.subarray(Math.max(0, seen.length - WINDOW));
    }
    if (this.done) return;
    this.toPage += 1;
    const text = data.toString("utf8");
    const head = text.slice(0, 80);
    // P11-D6 (spec 0119) -- a quiet line's beat is not a game message (it still reaches the page).
    if (!head.includes('"MATCH_BEAT"')) this.at.push(Date.now());
    if (head.includes('"MATCH_SNAPSHOT"') || head.includes('"MATCH_DELTA"')) {
      this.whole.take(text);
      this.boards += 1;
    }
    this.route.send(text);
  }

  private finish(code: number, reason: string) {
    if (this.endedAt !== null) return;
    this.endedAt = Date.now();
    if (this.spam) clearInterval(this.spam);
    this.socket?.destroy();
    if (this.done) return;
    this.done = true;
    void this.route.close({ code, reason }).catch(() => undefined);
  }

  /** A text message to the server (masked, as a client's must be). */
  private write(text: string) {
    this.send(0x1, Buffer.from(text, "utf8"));
  }

  private control(opcode: number, payload: Buffer) {
    this.send(opcode, payload);
  }

  private send(opcode: number, payload: Buffer) {
    const socket = this.socket;
    if (!socket || socket.destroyed) return;
    const mask = randomBytes(4);
    const length = payload.length;
    const head =
      length < 126
        ? Buffer.from([0x80 | opcode, 0x80 | length])
        : length < 65536
          ? Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 0xff])
          : (() => {
              const h = Buffer.alloc(10);
              h[0] = 0x80 | opcode;
              h[1] = 0x80 | 127;
              h.writeBigUInt64BE(BigInt(length), 2);
              return h;
            })();
    const body = Buffer.alloc(length);
    for (let i = 0; i < length; i += 1) body[i] = payload[i]! ^ mask[i % 4]!;
    socket.write(Buffer.concat([head, mask, body]), (error) => {
      if (error) this.writeFailedAt ??= Date.now();
    });
  }
}

/**
 * The newest board a page was sent over all its [links] (each connection's
 * own `whole.last`), newest link first, or null. A connection that came back
 * holding the newest board is sent no board at all (spec 0119,
 * `firstBoards`' Resume.Newest), so the newest link alone can have none while
 * the page draws, correctly, the board the link before it sent.
 */
export function newestSent(
  links: readonly { whole: { last: Record<string, unknown> | null } }[],
): Record<string, unknown> | null {
  for (let i = links.length - 1; i >= 0; i -= 1) {
    const last = links[i]!.whole.last;
    if (last) return last;
  }
  return null;
}

/**
 * Route [page]'s match sockets through links with [options] (each new
 * connection, a reconnect's too, gets its own). Returns the links as they
 * open, the newest last.
 */
export async function slowLink(page: Page, options: LinkOptions): Promise<Link[]> {
  const links: Link[] = [];
  await page.routeWebSocket("**/ws/matches/**", async (route) => {
    const link = new Link(route, options);
    links.push(link);
    await link.open(page.context());
  });
  return links;
}

/**
 * The server's board for a seat now, as a NEW connection is sent it (the
 * stored board, whole): a plain connection opened with [context]'s cookies
 * to [url] (a page's match socket address), read until its first board.
 */
export async function serverBoard(
  context: BrowserContext,
  url: string,
): Promise<Record<string, unknown>> {
  const target = new URL(url);
  target.searchParams.delete("deltas");
  // P11-D6 (spec 0119) -- a fresh connection, never a resume (that may send no board at all).
  target.searchParams.delete("resume");
  const origin = `http://${target.host}`;
  const cookie = (await context.cookies(origin)).map((c) => `${c.name}=${c.value}`).join("; ");
  return new Promise((resolve, reject) => {
    const socket = connect(Number(target.port || 80), target.hostname);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("no board from a fresh connection in 15 s"));
    }, 15_000);
    socket.on("connect", () =>
      socket.write(
        `GET ${target.pathname} HTTP/1.1\r\nHost: ${target.host}\r\nOrigin: ${origin}\r\n` +
          `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n` +
          `Sec-WebSocket-Version: 13\r\nCookie: ${cookie}\r\n\r\n`,
      ),
    );
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) return;
        upgraded = true;
        buffer = buffer.subarray(end + 4);
      }
      for (;;) {
        if (buffer.length < 2) return;
        let length = buffer[1]! & 0x7f;
        let at = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          at = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          at = 10;
        }
        if (buffer.length < at + length) return;
        const text = buffer.subarray(at, at + length).toString("utf8");
        buffer = buffer.subarray(at + length);
        if (text.slice(0, 80).includes('"MATCH_SNAPSHOT"')) {
          clearTimeout(timer);
          socket.destroy();
          resolve((JSON.parse(text) as { state: Record<string, unknown> }).state);
          return;
        }
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
