// The loading measure's links (PHASE_11 P11-R6), the same in every engine: a
// small TCP relay in front of the local server that delays and paces what
// passes through it. Chrome's own network emulation (CDP) exists only in
// Chromium; this works for Firefox and WebKit as well, and for the sockets.
//
// The model: a new connection waits one round trip before anything passes
// (the TCP handshake); every chunk then takes half a round trip each way,
// after its turn on the link, which carries one chunk at a time at the
// link's speed in each direction (shared by every connection, as a home
// line is). TLS is not modelled (the local stack is plain HTTP), nor is
// compression ("poor" with compression on, as P11-R6 has it, waits for our
// server to compress: P11-E4).

import { createServer, connect, type Server, type Socket } from "node:net";

export interface Link {
  name: string;
  /** Round trip, ms. */
  rtt: number;
  /** Bits a second, down and up. */
  down: number;
  up: number;
}

export const LINKS: Record<string, Link | null> = {
  local: null,
  slow4g: { name: "slow4g", rtt: 150, down: 1.6e6, up: 750e3 },
  live: { name: "live", rtt: 150, down: 10e6, up: 5e6 },
  poor: { name: "poor", rtt: 300, down: 1e6, up: 500e3 },
};

/** One direction of the link: chunks leave one after another at its speed. */
class Lane {
  private free = 0;
  constructor(private bitsPerSecond: number) {}
  /** When a chunk of [bytes] put on the lane now has crossed it (ms, Date.now() clock). */
  take(bytes: number): number {
    const now = Date.now();
    this.free = Math.max(this.free, now) + (bytes * 8 * 1000) / this.bitsPerSecond;
    return this.free;
  }
}

export interface Relay {
  port: number;
  close(): Promise<void>;
}

/** Start a relay on a free local port, to [target] (host:port), over [link]. */
export async function relay(link: Link, target: { host: string; port: number }): Promise<Relay> {
  const down = new Lane(link.down);
  const up = new Lane(link.up);
  const half = link.rtt / 2;
  const sockets = new Set<Socket>();
  /** Returns when the last chunk it was given will have been passed on. */
  const pipe = (from: Socket, to: Socket, lane: Lane) => {
    let last = 0;
    from.on("data", (chunk) => {
      // In order on each connection, whatever the lane says.
      const at = Math.max(last, lane.take(chunk.length) + half);
      last = at;
      setTimeout(
        () => {
          if (!to.destroyed) to.write(chunk);
        },
        Math.max(0, at - Date.now()),
      );
    });
    from.on("end", () => {
      setTimeout(() => to.end(), Math.max(0, last - Date.now()));
    });
    return () => last;
  };
  const server: Server = createServer((client) => {
    sockets.add(client);
    client.pause();
    const upstream = connect(target.port, target.host);
    sockets.add(upstream);
    const kill = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", kill);
    upstream.on("error", kill);
    client.on("close", () => {
      sockets.delete(client);
      upstream.destroy();
    });
    pipe(client, upstream, up);
    const downDone = pipe(upstream, client, down);
    upstream.on("close", () => {
      sockets.delete(upstream);
      // Whatever is still crossing the link reaches the page first.
      setTimeout(() => client.destroy(), Math.max(0, downDone() - Date.now()) + 50);
    });
    // The handshake's round trip before the first byte.
    setTimeout(() => client.resume(), link.rtt);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((ok) => {
        for (const s of sockets) s.destroy();
        server.close(() => ok());
      }),
  };
}
