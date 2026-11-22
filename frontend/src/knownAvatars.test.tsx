// @vitest-environment jsdom

// PHASE_11 P11-E2 -- avatars without the socket. A page that draws people
// from its own data drew the default face until the lobby connection's
// PLAYERS list arrived, then swapped. The data that names a person now
// carries their avatar's name, every name learned is kept for the tab, and
// the socket's list still wins once it lands.

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAccounts } from "./admin";
import { fetchAuthState } from "./auth";
import { avatarUrl } from "./avatars";
import { listShares } from "./decks";
import { fetchHall, type Hall } from "./hall";
import { forgetAvatars, knownAvatar, learnAvatars } from "./knownAvatars";
import { EMPTY_LOBBY, type LobbyState } from "./lobby";
import { avatarOf } from "./lobbyView";

const held = vi.hoisted(() => ({ lobby: {} as LobbyState }));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { userId: "u-me", username: "me", displayName: "Me" } },
  }),
}));
vi.mock("./shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: held.lobby, setLobby: () => {}, send: () => {} }),
}));

import HallPage from "./HallPage";

const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );

const player = (userId: string, avatar?: string) => ({
  userId,
  username: userId,
  displayName: userId,
  ...(avatar ? { avatar } : {}),
});

const hall = (avatars: Record<string, string | null>): Hall => ({
  season: {
    number: 1,
    month: "2026-11",
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    places: [{ place: 1, userId: "u-pat", rating: 1100, wins: 3, games: 4 }],
  },
  belt: { holder: "u-pat", since: null, defences: 0, defendBy: null, idleDays: 7 },
  board: [],
  allTime: [],
  qualifying: [],
  records: [],
  rivalries: [],
  rival: null,
  latest: [],
  past: [],
  avatars,
});

beforeEach(() => {
  forgetAvatars();
  held.lobby = EMPTY_LOBBY;
});
afterEach(() => vi.unstubAllGlobals());

describe("an avatar's name, before the lobby says", () => {
  it("is drawn from what the page's data said, and the socket's list wins once it lands", () => {
    learnAvatars([
      ["u-pat", "avatar-07"],
      ["u-ash", "avatar-77"],
    ]);
    expect(avatarOf(EMPTY_LOBBY, "u-pat")).toBe("avatar-07");
    expect(avatarOf(EMPTY_LOBBY, "u-nobody")).toBeNull();

    // The list says Pat changed it, and that Ash now has none: both win.
    const lobby: LobbyState = {
      ...EMPTY_LOBBY,
      players: [player("u-pat", "avatar-12"), player("u-ash")],
    };
    expect(avatarOf(lobby, "u-pat")).toBe("avatar-12");
    expect(avatarOf(lobby, "u-ash")).toBeNull();
    // Somebody the list leaves out (disabled since) is the default face, as before.
    learnAvatars([["u-gone", "avatar-05"]]);
    expect(avatarOf(lobby, "u-gone")).toBeNull();
  });

  it("is kept for the tab, ignores what is not a name of the set, and is forgotten at sign-out", async () => {
    learnAvatars([
      ["u-pat", "avatar-07"],
      ["u-bad", "../../etc"],
    ]);
    expect(JSON.parse(sessionStorage.getItem("proxic.avatars") ?? "{}")).toEqual({
      "u-pat": "avatar-07",
      "u-bad": null,
    });
    // A reload: the module starts again from what the tab kept.
    vi.resetModules();
    const again = await import("./knownAvatars");
    expect(again.knownAvatar("u-pat")).toBe("avatar-07");

    sessionStorage.setItem("proxic.avatars", "not json");
    vi.resetModules();
    expect((await import("./knownAvatars")).knownAvatar("u-pat")).toBeUndefined();

    forgetAvatars();
    expect(knownAvatar("u-pat")).toBeUndefined();
    expect(sessionStorage.getItem("proxic.avatars")).toBeNull();
  });

  it("comes with who you are, the Hall, the admin accounts and a deck's shares", async () => {
    await fetchAuthState(
      vi.fn(() =>
        json({
          authenticated: true,
          user: { ...player("u-me"), role: "PLAYER", avatar: "avatar-01" },
        }),
      ),
    );
    await fetchHall(vi.fn(() => json(hall({ "u-pat": "avatar-132", "u-dana": null }))));
    await fetchAccounts(
      vi.fn(() =>
        json({
          accounts: [
            { ...player("u-ash"), status: "ACTIVE", avatar: "avatar-77" },
            // A disabled account is not on the lobby's list either: no face learned.
            { ...player("u-gone"), status: "DISABLED", avatar: "avatar-05" },
          ],
        }),
      ),
    );
    await listShares(
      "d-1",
      vi.fn(() => json({ shares: [{ ...player("u-bree"), sharedAt: "x", avatar: "avatar-46" }] })),
    );
    expect(knownAvatar("u-me")).toBe("avatar-01");
    expect(knownAvatar("u-pat")).toBe("avatar-132");
    expect(knownAvatar("u-dana")).toBeNull();
    expect(knownAvatar("u-ash")).toBe("avatar-77");
    expect(knownAvatar("u-gone")).toBeUndefined();
    expect(knownAvatar("u-bree")).toBe("avatar-46");
  });

  it("puts the right face on the Hall's champion the moment the Hall is drawn, lobby or not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/hall" ? json(hall({ "u-pat": "avatar-132" })) : json({}),
      ),
    );
    render(
      <MemoryRouter>
        <HallPage />
      </MemoryRouter>,
    );
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(screen.getByText(/^Season 1/)).toBeTruthy();
    const faces = [...document.querySelectorAll<HTMLImageElement>("img.pa-avatar")].map((img) =>
      img.getAttribute("src"),
    );
    expect(faces.length).toBeGreaterThan(0);
    // Every portrait of Pat is Pat's own picture; none is the default face.
    expect(faces.every((src) => src === avatarUrl("avatar-132"))).toBe(true);
    expect(faces).not.toContain(avatarUrl(null));
  });
});
