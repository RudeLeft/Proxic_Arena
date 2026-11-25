// @vitest-environment jsdom

// PHASE_11 P11-E7 -- the Admin page opens at once. It reads the open tab's
// list and one small overview (not all seven lists), keeps each list for
// the tab, draws a kept list at once on a revisit or a tab click, reads
// nothing while its browser tab is hidden, and after an admin action reads
// the open list again before saying how it went (and forgets the others).

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "./auth";
import { EMPTY_LOBBY } from "./lobby";
import { forgetKept, keptFor } from "./kept";

const held: { auth: AuthState } = vi.hoisted(() => ({ auth: { status: "loading" } }));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ state: held.auth, setUser: () => {} }),
}));
vi.mock("./shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

import AdminPage from "./AdminPage";

const me = {
  userId: "u-me",
  username: "rudeleft",
  displayName: "RudeLeft",
  role: "ADMIN" as const,
};

const account = (userId: string, displayName: string, status = "ACTIVE") => ({
  userId,
  username: displayName.toLowerCase(),
  displayName,
  role: userId === "u-me" ? "ADMIN" : "PLAYER",
  status,
  sessions: 1,
  lastSignInAt: null,
  lastAdmin: userId === "u-me",
  email: null,
  computers: 0,
});

let patStatus = "ACTIVE";
const overview = () => ({
  accounts: patStatus === "ACTIVE" ? 2 : 1,
  disabled: patStatus === "ACTIVE" ? 0 : 1,
  rooms: 1,
  playing: 0,
  games: 0,
  gamesToday: 0,
  didNotStart: 0,
  signInNames: 1,
  signedInToday: 1,
  failedToday: 0,
  reports: 0,
  newReports: 0,
  computers: 0,
  keepDays: 30,
  server: {
    version: "1.75.0",
    database: "PostgreSQL 16",
    forgeWorker: "ok",
    gamesRunning: 0,
    uptimeSeconds: 5,
  },
});
const ROOM = {
  room: {
    roomId: "r1",
    name: "Pat's table",
    hostUserId: "u-pat",
    status: "OPEN",
    desiredPlayerCount: 2,
    seats: [{ userId: "u-pat", displayName: "Pat", ready: false }],
    clearsAt: null,
    held: null,
  },
  lastActivityAt: new Date().toISOString(),
};

function answer(url: string): unknown {
  if (url.startsWith("/api/admin/overview?since=")) return overview();
  switch (url) {
    case "/api/admin/accounts":
      return { accounts: [account("u-me", "RudeLeft"), account("u-pat", "Pat", patStatus)] };
    case "/api/admin/invites":
      return { invites: [], emailReady: true };
    case "/api/admin/rooms":
      return { rooms: [ROOM] };
    case "/api/admin/matches":
      return { matches: [], keepDays: 30 };
    case "/api/admin/reports":
      return { reports: [], newCount: 0 };
    case "/api/admin/sign-ins":
      return { events: [] };
    case "/api/admin/computers":
      return { computers: [] };
    case "/api/admin/accounts/u-pat/status":
      patStatus = "DISABLED";
      return { username: "pat", detail: "done" };
    default:
      return null;
  }
}

/** Every request, in order; [hold] keeps a GET's answer back until let go. */
let asked: string[] = [];
let hold: ((url: string) => boolean) | null = null;
let heldBack: (() => void)[] = [];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: body === null ? 404 : 200,
    headers: { "Content-Type": "application/json" },
  });

const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

const draw = (path = "/admin") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminPage />
    </MemoryRouter>,
  );

let hidden = false;

beforeEach(() => {
  forgetKept();
  patStatus = "ACTIVE";
  asked = [];
  hold = null;
  heldBack = [];
  hidden = false;
  held.auth = { status: "authenticated", user: me };
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      asked.push(input);
      const body = answer(input);
      if (hold?.(input))
        return new Promise<Response>((resolve) => heldBack.push(() => resolve(json(body))));
      return Promise.resolve(json(body));
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const lists = () => asked.filter((a) => a.startsWith("/api/admin/")).map((a) => a.split("?")[0]);

describe("the Admin page opens at once (P11-E7)", () => {
  it("reads the open tab's lists and the overview first, then the other tabs' lists behind", async () => {
    hold = () => true;
    draw();
    await settle();
    expect(new Set(lists())).toEqual(
      new Set(["/api/admin/accounts", "/api/admin/overview", "/api/admin/invites"]),
    );
    // Busy until the open tab's list is in; nothing else is asked meanwhile.
    expect(screen.getByRole("tabpanel").getAttribute("aria-busy")).toBe("true");
    hold = null;
    for (const go of heldBack) go();
    await settle();
    expect(screen.getByRole("tabpanel").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByText("Pat")).toBeTruthy();
    expect(new Set(lists().slice(3))).toEqual(
      new Set([
        "/api/admin/rooms",
        "/api/admin/matches",
        "/api/admin/reports",
        "/api/admin/sign-ins",
        "/api/admin/computers",
      ]),
    );
  });

  it("a tab click shows the list read ahead at once, and reads it again behind", async () => {
    draw();
    await settle();
    hold = () => true;
    asked = [];
    fireEvent.click(screen.getByRole("tab", { name: /^Rooms/ }));
    // Drawn from what was kept, before the new read has answered.
    expect(screen.getByText("Pat's table")).toBeTruthy();
    expect(screen.getByRole("tabpanel").getAttribute("aria-busy")).toBe("false");
    expect(lists()).toContain("/api/admin/rooms");
  });

  it("a revisit draws the kept accounts and numbers at once, and reads them again", async () => {
    const first = draw();
    await settle();
    first.unmount();
    hold = () => true;
    asked = [];
    draw();
    expect(screen.getByText("Pat")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByRole("tabpanel").getAttribute("aria-busy")).toBe("false");
    await settle();
    expect(new Set(lists())).toEqual(
      new Set(["/api/admin/accounts", "/api/admin/overview", "/api/admin/invites"]),
    );
  });

  it("reads nothing while its browser tab is hidden, and once on coming back", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    draw();
    await settle();
    asked = [];
    hidden = true;
    vi.advanceTimersByTime(10 * 60_000);
    await settle();
    expect(asked).toEqual([]);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(lists()).toEqual(["/api/admin/accounts", "/api/admin/overview"]);
    // Seen, it reads again every 30 s.
    asked = [];
    vi.advanceTimersByTime(30_000);
    await settle();
    expect(lists()).toEqual(["/api/admin/accounts", "/api/admin/overview"]);
  });

  it("after an action the list is read again before the outcome is said, and the other tabs are forgotten", async () => {
    draw();
    await settle();
    expect(keptFor("u-me", "admin/rooms")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Manage Pat" }));
    hold = (url) => url === "/api/admin/accounts";
    fireEvent.click(screen.getByRole("menuitem", { name: "Disable Pat" }));
    await settle();
    // The server has disabled Pat; the re-read is out: no message yet, and
    // the list still says what it said (not yet replaced by the answer).
    expect(screen.queryByText(/Pat is disabled/)).toBeNull();
    expect(keptFor("u-me", "admin/rooms")).toBeUndefined();
    hold = null;
    for (const go of heldBack) go();
    await settle();
    expect(screen.getByText(/Pat is disabled/)).toBeTruthy();
    // Pat is now under "Disabled", not among the active accounts.
    expect(screen.getByText(/Disabled · 1/)).toBeTruthy();
  });

  it("a player is shown the notice and reads no admin list", async () => {
    held.auth = { status: "authenticated", user: { ...me, role: "PLAYER" } };
    draw();
    await settle();
    expect(lists()).toEqual([]);
  });
});
