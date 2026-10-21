// PHASE_07 §7.67 — the Admin page's client, without a browser.

import { describe, expect, it, vi } from "vitest";
import {
  groupSignIns,
  idleText,
  setStatus,
  uptimeText,
  workerText,
  type SignInEvent,
} from "./admin";

const event = (overrides: Partial<SignInEvent>): SignInEvent => ({
  at: "2026-10-21T12:00:00Z",
  kind: "FAILED",
  username: "pat",
  known: true,
  address: "203.0.113.7",
  ...overrides,
});

describe("sign-in activity", () => {
  it("reads a run of the same attempt as one line with a count", () => {
    const lines = groupSignIns([
      event({}),
      event({}),
      event({}),
      event({ kind: "SIGNED_IN" }),
      event({ address: "198.51.100.2" }),
    ]);
    expect(lines.map((l) => [l.kind, l.count, l.address])).toEqual([
      ["FAILED", 3, "203.0.113.7"],
      ["SIGNED_IN", 1, "203.0.113.7"],
      ["FAILED", 1, "198.51.100.2"],
    ]);
  });

  it("does not merge different names, even from one address", () => {
    expect(groupSignIns([event({}), event({ username: "admin", known: false })])).toHaveLength(2);
  });
});

describe("the words the page shows", () => {
  it("says uptime and idleness the way the canvas does", () => {
    expect(uptimeText(6 * 86_400 + 2 * 3_600)).toBe("6d 02h");
    expect(uptimeText(3 * 3_600 + 12 * 60)).toBe("3h 12m");
    expect(uptimeText(45 * 60)).toBe("45m");
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(idleText("2026-10-21T09:00:00Z", now)).toBe("3h");
    expect(idleText("2026-10-21T11:45:00Z", now)).toBe("15m");
    expect(idleText("2026-10-21T11:59:30Z", now)).toBe("now");
  });

  it("names the worker's state and the games it is running", () => {
    const state = { version: "v", database: "PostgreSQL 16.4", uptimeSeconds: 0 };
    expect(workerText({ ...state, forgeWorker: "ok", gamesRunning: 0 })).toBe("Ready");
    expect(workerText({ ...state, forgeWorker: "ok", gamesRunning: 2 })).toBe("Ready · 2 games");
    expect(workerText({ ...state, forgeWorker: "unconfigured", gamesRunning: 0 })).toBe(
      "Not configured",
    );
  });
});

describe("admin actions", () => {
  it("passes the server's refusal on in its own words", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            errorCode: "LAST_ADMIN",
            detail: "RudeLeft is the only active administrator. Make somebody else one first.",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as unknown as typeof fetch;
    expect(await setStatus("u-1", "DISABLED", fetchFn)).toEqual({
      ok: false,
      message: "RudeLeft is the only active administrator. Make somebody else one first.",
    });
  });
});
