// @vitest-environment jsdom

// Spec 0115 (F-0115-A) -- the Admin page's words as the owner reads them on
// the page (docs/features/wording/0115-wording-table.md): the page is
// rendered from what the Admin API answers and the words -- visible and
// aria-label -- are read off it. The plain functions are in wording0115.test.ts.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "./auth";
import { EMPTY_LOBBY, type LobbyState } from "./lobby";
import { forgetKept } from "./kept";

const held: { auth: AuthState; lobby: LobbyState; setLobby: () => void; send: () => void } =
  vi.hoisted(() => ({
    auth: { status: "loading" },
    lobby: {} as LobbyState,
    setLobby: () => {},
    send: () => {},
  }));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    state: held.auth,
    signIn: () => Promise.resolve(null),
    signOut: () => Promise.resolve(),
    signOutEverywhere: () => Promise.resolve(0),
    sessionExpired: () => {},
    setUser: () => {},
  }),
  RequireAuth: ({ children }: { children: unknown }) => children,
}));
vi.mock("./shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: held.lobby, setLobby: held.setLobby, send: held.send }),
}));

import AdminPage from "./AdminPage";

const NOW = Date.now();
const me = { userId: "u-me", username: "rudeleft", displayName: "RudeLeft", role: "ADMIN" };

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

const account = (over: Record<string, unknown>) => ({
  userId: "u-x",
  username: "x",
  displayName: "X",
  role: "PLAYER",
  status: "ACTIVE",
  sessions: 2,
  lastSignInAt: null,
  lastAdmin: false,
  email: "x@example.com",
  computers: 0,
  ...over,
});

const ROUTES: Record<string, () => Promise<Response>> = {
  "/api/admin/accounts": () =>
    json({
      accounts: [
        account({
          userId: "u-me",
          username: "rudeleft",
          displayName: "RudeLeft",
          role: "ADMIN",
          lastAdmin: true,
        }),
        account({ userId: "u-pat", username: "pat", displayName: "Pat" }),
      ],
    }),
  "/api/admin/rooms": () =>
    json({
      rooms: [
        {
          room: {
            roomId: "r1",
            name: "Pat's room",
            hostUserId: "u-pat",
            status: "IN_MATCH",
            desiredPlayerCount: 2,
            seats: [{ userId: "u-pat", displayName: "Pat", ready: true }],
            clearsAt: new Date(NOW - 5_000).toISOString(),
            held: null,
          },
          lastActivityAt: new Date(NOW - 3 * 3_600_000).toISOString(),
        },
      ],
    }),
  "/api/admin/server": () =>
    json({
      version: "1.75.0 (abc)",
      database: "PostgreSQL 16",
      forgeWorker: "ok",
      gamesRunning: 0,
      uptimeSeconds: 60,
    }),
  "/api/admin/sign-ins": () =>
    json({
      events: [
        {
          at: new Date(NOW - 60_000).toISOString(),
          kind: "THROTTLED",
          username: "guess",
          known: false,
          address: "10.0.0.9",
        },
        {
          at: new Date(NOW - 70_000).toISOString(),
          kind: "THROTTLED",
          username: "guess",
          known: false,
          address: "10.0.0.9",
        },
      ],
    }),
  "/api/admin/matches": () =>
    json({
      matches: [
        {
          matchId: "m1",
          status: "FAILED_RUNTIME",
          createdAt: new Date(NOW - 60_000).toISOString(),
          endedAt: null,
          players: "",
          recordBytes: null,
          ending: "Stopped: WORKER_STOPPED",
        },
      ],
      keepDays: 30,
    }),
  "/api/admin/accounts/u-pat/password-reset": () =>
    json({ username: "pat", detail: "Reset email sent to p•••@example.com." }),
  "/api/admin/rooms/r1/close": () =>
    json({ username: "Pat's room", detail: "Closed. The game in it ended with no winner." }),
};

const page = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminPage />
    </MemoryRouter>,
  );

const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

beforeEach(() => {
  forgetKept();
  held.auth = { status: "authenticated", user: me };
  held.lobby = EMPTY_LOBBY;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => (ROUTES[url] ?? (() => json({ detail: "no" }, 404)))()),
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const row = (name: string) =>
  screen
    .getAllByRole("listitem")
    .find((li) => li.classList.contains("pa-admin-account") && li.textContent?.includes(name))!;

describe("spec 0115: the Admin page", () => {
  it("W3-011, W3-012: the Manage menu's words", async () => {
    page("/admin");
    await settle();
    fireEvent.click(within(row("RudeLeft")).getByRole("button", { name: "Manage RudeLeft" }));
    const last = within(row("RudeLeft")).getByRole("menuitem", {
      name: "The last administrator can't be made a player or switched off",
    });
    expect((last as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Last Administrator: Cannot Remove/)).toBeNull();
    fireEvent.click(within(row("Pat")).getByRole("button", { name: "Manage Pat" }));
    expect(
      within(row("Pat")).getByRole("menuitem", { name: "Sign Pat out everywhere" }),
    ).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Revoke/ })).toBeNull();
  });

  it("W3-010: a reset's own sentence, never the server's detail glued in", async () => {
    page("/admin");
    await settle();
    fireEvent.click(within(row("Pat")).getByRole("button", { name: "Manage Pat" }));
    fireEvent.click(
      within(row("Pat")).getByRole("menuitem", { name: "Send Pat a password reset" }),
    );
    await settle();
    expect(screen.getByRole("status").textContent).toContain(
      "A reset link was sent to Pat. Pat chooses a new password from the link.",
    );
    expect(screen.getByRole("status").textContent).not.toContain("Reset email sent");
  });

  it("W3-009, W3-035: Force close's sentence, and closes now", async () => {
    page("/admin?tab=rooms");
    await settle();
    const rooms = screen.getByRole("region", { name: "Rooms" });
    expect(rooms.textContent).toContain("3h · closes now");
    expect(rooms.textContent).not.toContain("closes in now");
    fireEvent.click(within(rooms).getByRole("button", { name: "Force close Pat's room" }));
    fireEvent.click(within(rooms).getByRole("button", { name: "Close it" }));
    await settle();
    expect(screen.getByRole("status").textContent).toContain(
      "Pat's room is closed. The game in it ended with no winner. Both players were told an administrator closed it.",
    );
    expect(screen.getByRole("status").textContent).not.toContain("..");
    expect(screen.getByRole("status").textContent).not.toContain("Closed.");
  });

  it("W3-013, W3-022: a game with no players is Nobody, its stop in words", async () => {
    page("/admin?tab=games");
    await settle();
    const records = screen.getByRole("region", { name: "Game records" });
    expect(within(records).getByText("Nobody")).toBeTruthy();
    expect(within(records).queryByText("none")).toBeNull();
    const outcome = within(records).getByText("Stopped · the rules engine stopped");
    expect(outcome.getAttribute("title")).toBe("WORKER_STOPPED");
  });

  it("W3-014: made to wait, never throttled", async () => {
    page("/admin?tab=sign-ins");
    await settle();
    const signIns = screen.getByRole("region", { name: "Sign-in activity" });
    expect(within(signIns).getByText("Made to wait")).toBeTruthy();
    expect(signIns.textContent).toContain("2 made to wait (too many tries)");
    expect(signIns.textContent?.toLowerCase()).not.toContain("throttled");
  });
});
