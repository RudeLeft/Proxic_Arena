// @vitest-environment jsdom

// Spec 0009 — online, away, offline: the 5-minute rule, the words, and
// what the page believes from the server's messages.

import { afterEach, describe, expect, it, vi } from "vitest";
import { IDLE_MS, holdActive, isAway, watchActivity } from "./activity";
import { EMPTY_LOBBY, reduceLobby, type LobbyState } from "./lobby";
import { agoText, playerRows, statusOf } from "./lobbyView";

const pat = { userId: "u-pat", username: "Pat", displayName: "Pat" };
const dana = { userId: "u-dana", username: "Dana", displayName: "Dana" };
const NOW = Date.parse("2026-10-24T20:00:00Z");
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

const apply = (messages: Record<string, unknown>[], from: LobbyState = EMPTY_LOBBY) =>
  messages.reduce(reduceLobby, from);

afterEach(() => {
  vi.useRealTimers();
  holdActive(false);
});

describe("away after 5 minutes (A2)", () => {
  it("is active until 5 minutes without a move, and never while the game is asking", () => {
    expect(isAway({ lastMove: 0, held: false }, IDLE_MS - 1)).toBe(false);
    expect(isAway({ lastMove: 0, held: false }, IDLE_MS)).toBe(true);
    expect(isAway({ lastMove: 0, held: true }, IDLE_MS * 10)).toBe(false);
  });

  it("says so once when it goes away, once when a move brings it back, and nothing between", () => {
    vi.useFakeTimers({ now: NOW });
    const said: boolean[] = [];
    const stop = watchActivity((away) => said.push(away));

    vi.advanceTimersByTime(IDLE_MS - 30_000);
    window.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(IDLE_MS - 30_000);
    expect(said).toEqual([]); // a move reset the clock

    vi.advanceTimersByTime(60_000);
    expect(said).toEqual([true]);
    vi.advanceTimersByTime(IDLE_MS);
    expect(said).toEqual([true]); // still away: nothing more said

    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(said).toEqual([true, false]);

    vi.advanceTimersByTime(IDLE_MS + 15_000);
    expect(said).toEqual([true, false, true]);
    holdActive(true); // the game asks something: here again at once
    expect(said).toEqual([true, false, true, false]);
    stop();
  });
});

describe("the words (A1)", () => {
  it("says how long ago, roughly", () => {
    expect(agoText(minutesAgo(0), NOW)).toBe("just now");
    expect(agoText(minutesAgo(5), NOW)).toBe("5 min ago");
    expect(agoText(minutesAgo(130), NOW)).toBe("2h ago");
    expect(agoText(minutesAgo(30 * 60), NOW)).toBe("yesterday");
    expect(agoText(minutesAgo(72 * 60), NOW)).toBe("3 days ago");
  });

  it("is online, away for so long, or offline and last seen", () => {
    const lobby = apply([
      { type: "PRESENCE", users: [pat, { ...dana, awaySince: minutesAgo(7) }] },
      {
        type: "PLAYERS",
        players: [
          pat,
          dana,
          { userId: "u-ash", displayName: "Ash", lastSeenAt: minutesAgo(125) },
          { userId: "u-kit", displayName: "Kit" },
        ],
      },
    ]);
    expect(statusOf(lobby, "u-pat", NOW)).toEqual({ kind: "online", label: "Online" });
    expect(statusOf(lobby, "u-dana", NOW)).toEqual({ kind: "away", label: "Away 7 min" });
    expect(statusOf(lobby, "u-ash", NOW)).toEqual({
      kind: "offline",
      label: "Offline · last seen 2h ago",
    });
    // No session left (signed out everywhere): just offline.
    expect(statusOf(lobby, "u-kit", NOW)).toEqual({ kind: "offline", label: "Offline" });

    const rows = playerRows(lobby, "u-me", NOW);
    expect(rows.find((r) => r.user.userId === "u-dana")?.where).toBe("Away 7 min · in the lobby");
    expect(rows.find((r) => r.user.userId === "u-ash")?.where).toBe("Offline · last seen 2h ago");
  });
});

describe("what the page believes (A3)", () => {
  it("marks a player away and back, and starts last seen when they leave", () => {
    let lobby = apply([
      { type: "PRESENCE", users: [pat] },
      { type: "PLAYERS", players: [pat] },
      { type: "PRESENCE_AWAY", userId: "u-pat", awaySince: minutesAgo(5) },
    ]);
    expect(statusOf(lobby, "u-pat", NOW).kind).toBe("away");
    lobby = apply([{ type: "PRESENCE_AWAY", userId: "u-pat" }], lobby);
    expect(statusOf(lobby, "u-pat", NOW).kind).toBe("online");
    lobby = apply([{ type: "PRESENCE_LEFT", userId: "u-pat", lastSeenAt: minutesAgo(0) }], lobby);
    expect(statusOf(lobby, "u-pat", NOW)).toEqual({
      kind: "offline",
      label: "Offline · last seen just now",
    });
  });

  it("ignores a time that is not one", () => {
    const lobby = apply([
      { type: "PRESENCE", users: [pat] },
      { type: "PRESENCE_AWAY", userId: "u-pat", awaySince: "soon" },
    ]);
    expect(statusOf(lobby, "u-pat", NOW).kind).toBe("online");
  });
});
