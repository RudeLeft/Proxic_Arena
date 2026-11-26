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
    window.dispatchEvent(new MouseEvent("pointermove", { screenX: 10, screenY: 10 }));
    vi.advanceTimersByTime(IDLE_MS - 30_000);
    expect(said).toEqual([]); // a move reset the clock

    // The page changing under a pointer that did not move is not a move.
    window.dispatchEvent(new MouseEvent("pointermove", { screenX: 10, screenY: 10 }));
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

describe("a hidden tab (P11-E15)", () => {
  let state: DocumentVisibilityState = "visible";
  const show = (to: DocumentVisibilityState) => {
    state = to;
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => show("visible"));

  it("sets one timer for the moment it goes away, not a look every 15 s, and none once away", () => {
    vi.useFakeTimers({ now: NOW });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    const said: boolean[] = [];
    const stop = watchActivity((away) => said.push(away));
    vi.advanceTimersByTime(60_000);
    const look = vi.spyOn(Date, "now");
    show("hidden");
    expect(vi.getTimerCount(), "one timer: the moment it goes away").toBe(1);
    look.mockClear();
    vi.advanceTimersByTime(IDLE_MS - 60_000 - 1);
    expect(said).toEqual([]);
    expect(look, "nothing looked at the clock meanwhile").not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(said, "away exactly 5 minutes after the last move").toEqual([true]);
    expect(vi.getTimerCount(), "away: no timer at all").toBe(0);
    look.mockRestore();

    show("visible");
    expect(said, "shown again is a move").toEqual([true, false]);
    vi.advanceTimersByTime(IDLE_MS + 15_000);
    expect(said, "and the 15 s look is back").toEqual([true, false, true]);
    stop();
  });

  it("a game asking while hidden still holds it active, and lets go when it stops", () => {
    vi.useFakeTimers({ now: NOW });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    const said: boolean[] = [];
    const stop = watchActivity((away) => said.push(away));
    holdActive(true);
    show("hidden");
    vi.advanceTimersByTime(IDLE_MS * 2);
    expect(said).toEqual([]);
    holdActive(false);
    expect(said).toEqual([true]);
    stop();
  });
});

describe("the words (A1)", () => {
  it("says how long ago, roughly", () => {
    expect(agoText(minutesAgo(0), NOW)).toBe("just now");
    expect(agoText(minutesAgo(5), NOW)).toBe("five minutes ago");
    expect(agoText(minutesAgo(130), NOW)).toBe("two hours ago");
    expect(agoText(minutesAgo(30 * 60), NOW)).toBe("yesterday");
    expect(agoText(minutesAgo(72 * 60), NOW)).toBe("three days ago");
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
    expect(statusOf(lobby, "u-dana", NOW)).toEqual({
      kind: "away",
      label: "Away for seven minutes",
      short: "Away 7 min",
    });
    expect(statusOf(lobby, "u-ash", NOW)).toEqual({
      kind: "offline",
      label: "Offline · last seen two hours ago",
    });
    // No session left (signed out everywhere): just offline.
    expect(statusOf(lobby, "u-kit", NOW)).toEqual({ kind: "offline", label: "Offline" });

    const rows = playerRows(lobby, "u-me", NOW);
    // Owner 2026-11-21: a row with an Invite button keeps the short form.
    expect(rows.find((r) => r.user.userId === "u-dana")?.control.kind).toBe("invite");
    expect(rows.find((r) => r.user.userId === "u-dana")?.where).toBe("Away 7 min · in the lobby");
    expect(rows.find((r) => r.user.userId === "u-ash")?.where).toBe(
      "Offline · last seen two hours ago",
    );
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
