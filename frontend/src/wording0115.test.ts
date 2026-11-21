// Spec 0115 (F-0115-A, F-0115-B) -- the Admin page's words built in plain
// functions (docs/features/wording/0115-wording-table.md). The words read
// off the rendered page are in wording0115pages.test.tsx.

import { describe, expect, it } from "vitest";
import {
  REASON_WORDS,
  closesText,
  forceClosedText,
  outcomeText,
  purgeText,
  workerText,
  type AdminMatch,
  type PurgeCounts,
} from "./admin";

const counts = (over: Partial<PurgeCounts> = {}): PurgeCounts => ({
  games: 0,
  against: {},
  decks: 0,
  rooms: 0,
  reports: 0,
  signIns: 0,
  accountsKept: 0,
  refused: null,
  ...over,
});

const match = (over: Partial<AdminMatch>): AdminMatch => ({
  matchId: "m",
  status: "ENDED",
  createdAt: "2026-11-21T10:00:00Z",
  endedAt: null,
  players: "Pat vs Sam",
  recordBytes: null,
  ending: null,
  ...over,
});

describe("spec 0115: the Admin page's words", () => {
  it("W3-001 a player with no games is This player, never They has", () => {
    const scope = { scope: "player", userId: "u" } as const;
    expect(purgeText(scope, counts())).toBe("This player has no finished games to delete.");
    expect(purgeText(scope, counts(), "Pat")).toBe("Pat has no finished games to delete.");
  });

  it("W3-002 every worker state in words, Problem as the last resort", () => {
    const state = { version: "v", database: "PostgreSQL 16", uptimeSeconds: 0, gamesRunning: 0 };
    const words = (forgeWorker: string, gamesRunning = 0) =>
      workerText({ ...state, forgeWorker, gamesRunning });
    expect(words("unreachable", 2)).toBe("Unreachable · 2 games");
    expect(words("incompatible")).toBe("Version mismatch");
    expect(words("resources-missing")).toBe("Data files missing");
    expect(words("something-new")).toBe("Problem");
    expect(words("something-new", 1)).toBe("Problem · 1 game");
  });

  it("W3-003 an unknown match status is Unknown state, the status in the tooltip", () => {
    expect(outcomeText(match({ status: "PAUSED" }))).toEqual({
      text: "Unknown state",
      tone: "plain",
      code: "PAUSED",
    });
  });

  it("W3-004 an unmapped reason says reason not known; Problem (code) only in the tooltip", () => {
    expect(
      outcomeText(match({ status: "FAILED_STARTUP", ending: "Did not start: BRAND_NEW" })),
    ).toEqual({
      text: "Didn't start (reason not known)",
      tone: "warn",
      code: "Problem (BRAND_NEW)",
    });
    expect(
      outcomeText(match({ status: "FAILED_RUNTIME", ending: "Stopped: BRAND_NEW" })).text,
    ).toBe("Stopped (reason not known)");
    // No code at all: the old short words.
    expect(outcomeText(match({ status: "FAILED_RUNTIME" })).text).toBe("Stopped by a fault");
    expect(outcomeText(match({ status: "FAILED_STARTUP" })).text).toBe("Didn't start");
  });

  it("W3-005 a finished game shows the server's words, which carry no codes", () => {
    expect(outcomeText(match({ ending: "Someone won on turn 9" })).text).toBe(
      "Finished · Someone won on turn 9",
    );
  });

  it("F-0115-B W3-022 every code the server can store has words", () => {
    // Server: MatchWorker, MatchRuntime, MatchRecords, MatchRecovery; worker: WorkerMain.
    const stored = [
      "WORKER_UNREACHABLE",
      "WORKER_STOPPED",
      "WORKER_INCOMPATIBLE",
      "WORKER_UNCONFIGURED",
      "WORKER_MISSING",
      "GAME_START_FAILED",
      "GAME_START_TIMEOUT",
      "DECK_UNAVAILABLE",
      "SERVER_RESTARTED",
      "DECK_UNRESOLVED",
      "BUILD_FAILED",
      "RESOLVE_FAILED",
      "CARD_POOL_FAILED",
      "LAB_DEAL_REFUSED",
      "MALFORMED_MESSAGE",
      "UNKNOWN_TYPE",
      "NO_GAME",
      "SEARCH_REFUSED",
      "GAME_RESULT_FAILED",
    ];
    for (const code of stored) {
      const stopped = outcomeText(match({ status: "FAILED_RUNTIME", ending: `Stopped: ${code}` }));
      expect(stopped.text, code).toBe(`Stopped · ${REASON_WORDS[code]}`);
      expect(stopped.text, code).not.toContain(code);
      expect(stopped.code).toBe(code);
      const didNot = outcomeText(
        match({ status: "FAILED_STARTUP", ending: `Did not start: ${code}` }),
      );
      expect(didNot.text, code).toBe(`Didn't start · ${REASON_WORDS[code]}`);
    }
    expect(
      outcomeText(match({ status: "FAILED_RUNTIME", ending: "Stopped: WORKER_STOPPED" })).text,
    ).toBe("Stopped · the rules engine stopped");
  });

  it("W3-009 and W3-017 Force close's own sentence, the game said when there was one", () => {
    expect(forceClosedText("Pat's room", false)).toBe(
      "Pat's room is closed. Both players were told an administrator closed it.",
    );
    expect(forceClosedText("Pat's room", true)).toBe(
      "Pat's room is closed. The game in it ended with no winner. Both players were told an administrator closed it.",
    );
  });

  it("W3-035 closes now, never closes in now; the short forms kept (W3-008)", () => {
    const now = Date.parse("2026-11-21T12:00:00Z");
    expect(closesText(now, "2026-11-21T12:00:20Z")).toBe("closes now");
    expect(closesText(now, "2026-11-21T11:59:00Z")).toBe("closes now");
    expect(closesText(now, "2026-11-21T14:00:00Z")).toBe("closes in 2h");
    expect(closesText(now, "2026-11-21T12:15:00Z")).toBe("closes in 15m");
  });
});
