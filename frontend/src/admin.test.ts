// PHASE_07 §7.67 — the Admin page's client, without a browser.

import { describe, expect, it, vi } from "vitest";
import {
  groupSignIns,
  idleText,
  outcomeText,
  overview,
  signInsByPerson,
  sizeText,
  setStatus,
  uptimeText,
  versionParts,
  workerText,
  type AdminAccount,
  type AdminMatch,
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

describe("game record sizes (§7.56)", () => {
  it("read as KB or MB, never 0 KB", () => {
    expect(sizeText(120)).toBe("1 KB");
    expect(sizeText(6_400)).toBe("6 KB");
    expect(sizeText(1_400_000)).toBe("1.4 MB");
  });
});

// --- spec 0010 ---------------------------------------------------------------------

describe("the overview (spec 0010)", () => {
  it("shows the version, and the build id short", () => {
    expect(versionParts("1.2.0 (512116e5405fb9c0b49ada0854cfc9d1bdce399c)")).toEqual({
      number: "1.2.0",
      build: "512116e",
      full: "1.2.0 (512116e5405fb9c0b49ada0854cfc9d1bdce399c)",
    });
    expect(versionParts("1.2.0 (dev)").build).toBe("dev");
    expect(versionParts("1.2.0")).toEqual({ number: "1.2.0", build: null, full: "1.2.0" });
  });

  const match = (overrides: Partial<AdminMatch>): AdminMatch => ({
    matchId: "m",
    status: "ENDED",
    createdAt: "2026-10-24T10:00:00Z",
    endedAt: null,
    players: "RudeLeft vs Pat",
    recordBytes: 3000,
    ending: null,
    ...overrides,
  });

  it("says how a game ended in plain words, keeping the code for the tooltip", () => {
    expect(outcomeText(match({ status: "ENDED", ending: "RudeLeft won" })).text).toBe(
      "Finished · RudeLeft won",
    );
    const didNot = outcomeText(
      match({ status: "FAILED_STARTUP", ending: "Did not start: WORKER_UNREACHABLE" }),
    );
    expect(didNot).toEqual({
      text: "Didn't start · couldn't reach the rules engine",
      tone: "warn",
      code: "WORKER_UNREACHABLE",
    });
    expect(
      outcomeText(match({ status: "FAILED_RUNTIME", ending: "Stopped: SERVER_RESTARTED" })).text,
    ).toBe("Stopped · the server restarted");
    // A reason it has no words for is shown as it came.
    expect(
      outcomeText(match({ status: "FAILED_RUNTIME", ending: "Stopped: something new" })).text,
    ).toBe("Stopped · something new");
    expect(outcomeText(match({ status: "TERMINATED" })).text).toBe("Abandoned");
  });

  it("groups sign-ins by person, trouble first", () => {
    const people = signInsByPerson([
      event({ kind: "SIGNED_IN", username: "rudeleft", at: "2026-10-24T21:42:00Z" }),
      event({ kind: "SIGNED_IN", username: "RudeLeft", at: "2026-10-24T21:40:00Z" }),
      event({ kind: "FAILED", username: "admin", known: false, at: "2026-10-24T21:30:00Z" }),
      event({ kind: "FAILED", username: "admin", known: false, at: "2026-10-24T21:29:00Z" }),
    ]);
    expect(people.map((p) => p.username)).toEqual(["admin", "rudeleft"]);
    expect(people[0]).toMatchObject({ failed: 2, signedIn: 0, known: false });
    expect(people[1]).toMatchObject({ signedIn: 2, failed: 0, last: "2026-10-24T21:42:00Z" });
  });

  it("counts today's tiles", () => {
    const account = (status: AdminAccount["status"]): AdminAccount => ({
      userId: status + Math.random(),
      username: "u",
      displayName: "U",
      role: "PLAYER",
      status,
      sessions: 0,
      lastSignInAt: null,
      lastAdmin: false,
    });
    const today = Date.parse("2026-10-24T00:00:00Z");
    const numbers = overview({
      online: 2,
      away: 1,
      accounts: [account("ACTIVE"), account("ACTIVE"), account("DISABLED")],
      rooms: [],
      matches: [
        match({ createdAt: "2026-10-24T09:00:00Z" }),
        match({ createdAt: "2026-10-24T10:00:00Z", status: "FAILED_STARTUP" }),
        match({ createdAt: "2026-10-23T23:00:00Z" }),
      ],
      signIns: [
        event({ kind: "SIGNED_IN", at: "2026-10-24T08:00:00Z" }),
        event({ kind: "FAILED", at: "2026-10-24T08:01:00Z" }),
        event({ kind: "SIGNED_IN", at: "2026-10-23T22:00:00Z" }),
      ],
      today,
    });
    expect(numbers).toMatchObject({
      active: 2,
      disabled: 1,
      gamesToday: 2,
      didNotStart: 1,
      signedIn: 1,
      failed: 1,
    });
  });
});
