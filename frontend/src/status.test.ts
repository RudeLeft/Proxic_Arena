import { describe, expect, it, vi } from "vitest";
import { checkState, versionState, fetchStatus, connectSystemSocket, isNewBuild } from "./status";
import type { VersionInfo } from "./status";

const GOOD: VersionInfo = {
  proxicVersion: "0.1.0",
  protocolVersion: 1,
  forgeCommit: "4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676",
  forgeRelease: "forge-2.0.15",
  javaVersion: "17",
  buildId: null,
};

describe("service status (PHASE_01 1.69)", () => {
  // The whole point of 1.69: a check we did not make is NOT green.
  it("never reports an unchecked dependency as ready", () => {
    expect(checkState("unconfigured")).toBe("degraded");
    expect(checkState(undefined)).toBe("unavailable");
    expect(checkState("missing")).toBe("degraded");
    expect(checkState("ok")).toBe("ready");
  });

  it("treats a protocol mismatch as its own state, not a generic failure", () => {
    expect(versionState({ ...GOOD, protocolVersion: 99 })).toBe("version-mismatch");
    expect(versionState(null)).toBe("unavailable");
    expect(versionState(GOOD)).toBe("ready");
  });

  it("reads a 503 readiness body instead of treating it as unreachable", async () => {
    const fake = vi.fn((url: string) => {
      if (String(url).includes("version")) {
        return Promise.resolve(new Response(JSON.stringify(GOOD), { status: 200 }));
      }
      // Degraded readiness answers 503 WITH a body. Ignoring it would
      // report "unavailable" for a server that is answering fine.
      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: "degraded",
            checks: { database: "ok", forgeWorker: "missing" },
          }),
          { status: 503 },
        ),
      );
    }) as unknown as typeof fetch;

    const s = await fetchStatus(fake);
    expect(s.server).toBe("ready");
    expect(s.database).toBe("ready");
    expect(s.forgeRuntime).toBe("degraded");
    // The RAW value must survive to the UI. Collapsing every non-ok
    // state to one label told an operator "Not configured" for a
    // worker that was configured and unreachable.
    expect(s.checks["forgeWorker"]).toBe("missing");
  });

  it("reports unavailable when the server cannot be reached", async () => {
    const fake = vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    const s = await fetchStatus(fake);
    expect(s.server).toBe("unavailable");
    expect(s.version).toBeNull();
  });

  it("a version mismatch overrides every other indicator", async () => {
    const fake = vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes("version")
          ? new Response(JSON.stringify({ ...GOOD, protocolVersion: 99 }), { status: 200 })
          : new Response(JSON.stringify({ status: "ok", checks: { database: "ok" } }), {
              status: 200,
            }),
      ),
    ) as unknown as typeof fetch;
    const s = await fetchStatus(fake);
    expect(s.server).toBe("version-mismatch");
    expect(s.database).toBe("version-mismatch");
  });
});

class FakeSocket {
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {}
  addEventListener(t: string, fn: (e: unknown) => void) {
    (this.listeners[t] ??= []).push(fn);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
    this.fire("close", {});
  }
  fire(t: string, e: unknown) {
    for (const fn of this.listeners[t] ?? []) fn(e);
  }
}

describe("system socket", () => {
  it("answers HELLO with a PING and reports ready", () => {
    let socket!: FakeSocket;
    const Impl = function (url: string) {
      socket = new FakeSocket(url);
      return socket;
    } as unknown as typeof WebSocket;
    const states: string[] = [];
    const dispose = connectSystemSocket("ws://x/ws/system", (s) => states.push(s), Impl);

    socket.fire("open", {});
    socket.fire("message", {
      data: JSON.stringify({ protocolVersion: 1, type: "HELLO", messageId: "a", payload: {} }),
    });

    expect(states).toContain("ready");
    expect(socket.sent.length).toBe(1);
    const sent = JSON.parse(socket.sent[0]!) as { type: string };
    expect(sent.type).toBe("PING");
    dispose();
  });

  it("distinguishes a dropped connection from a deliberate close", () => {
    let socket!: FakeSocket;
    const Impl = function (url: string) {
      socket = new FakeSocket(url);
      return socket;
    } as unknown as typeof WebSocket;
    const states: string[] = [];
    const dispose = connectSystemSocket("ws://x/ws/system", (s) => states.push(s), Impl);

    // A drop we did not ask for is "disconnected"...
    socket.fire("close", {});
    expect(states).toContain("disconnected");

    // ...but disposing must NOT look like a failure to the user.
    const before = states.length;
    dispose();
    expect(states.length).toBe(before);
  });

  it("surfaces a protocol mismatch from the socket as its own state", () => {
    let socket!: FakeSocket;
    const Impl = function (url: string) {
      socket = new FakeSocket(url);
      return socket;
    } as unknown as typeof WebSocket;
    const states: string[] = [];
    connectSystemSocket("ws://x/ws/system", (s) => states.push(s), Impl);
    socket.fire("message", {
      data: JSON.stringify({ protocolVersion: 99, type: "HELLO", messageId: "a", payload: {} }),
    });
    expect(states).toContain("version-mismatch");
  });
});

describe("isNewBuild", () => {
  it("is a new build only when both builds are known and differ", () => {
    expect(isNewBuild("f1794ba", "f7e5a8e")).toBe(true);
    expect(isNewBuild("f1794ba", "f1794ba")).toBe(false);
    // Unknown is not newer: an older server, or a development run.
    expect(isNewBuild(null, "f7e5a8e")).toBe(false);
    expect(isNewBuild("f1794ba", null)).toBe(false);
  });
});
