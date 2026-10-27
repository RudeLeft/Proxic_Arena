// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatars";
import { EMPTY_LOBBY, reduceLobby, type LobbyState } from "./lobby";
import { rankOf } from "./lobbyView";

/** Spec 0011 STANDINGS (since spec 0018 the season's places), and the rings they hand out. */

const players = ["Pat", "RudeLeft", "Ash", "Bree", "Dana"].map((name) => ({
  userId: `id-${name}`,
  username: name.toLowerCase(),
  displayName: name,
}));

function lobbyWith(message: Record<string, unknown>): LobbyState {
  return reduceLobby({ ...EMPTY_LOBBY, players }, { type: "STANDINGS", ...message });
}

const FULL = {
  podium: [
    { place: 1, userId: "id-Pat", wins: 14, games: 19 },
    { place: 2, userId: "id-RudeLeft", wins: 11, games: 18 },
    { place: 3, userId: "id-Ash", wins: 7, games: 12 },
  ],
  last: { userId: "id-Dana", wins: 1, games: 9 },
};

describe("STANDINGS", () => {
  it("keeps the podium in order and dead last", () => {
    const lobby = lobbyWith(FULL);
    expect(lobby.standings?.podium.map((s) => s.userId)).toEqual([
      "id-Pat",
      "id-RudeLeft",
      "id-Ash",
    ]);
    expect(lobby.standings?.last).toEqual({ userId: "id-Dana", wins: 1, games: 9 });
  });

  it("drops a malformed row rather than the message", () => {
    const lobby = lobbyWith({ podium: [{ userId: "id-Pat", wins: "many" }, FULL.podium[1]] });
    expect(lobby.standings?.podium.map((s) => s.userId)).toEqual(["id-RudeLeft"]);
    expect(lobby.standings?.last).toBeNull();
  });

  it("gives each place its ring, and nobody else one", () => {
    const lobby = lobbyWith(FULL);
    expect(rankOf(lobby, "id-Pat")).toBe(1);
    expect(rankOf(lobby, "id-RudeLeft")).toBe(2);
    expect(rankOf(lobby, "id-Ash")).toBe(3);
    expect(rankOf(lobby, "id-Dana")).toBe("last");
    expect(rankOf(lobby, "id-Bree")).toBeUndefined();
    expect(rankOf(EMPTY_LOBBY, "id-Pat")).toBeUndefined();
  });
});

describe("Avatar with a place", () => {
  it("keeps its size: the ring is inside the same square", () => {
    const { container } = render(<Avatar avatar={null} size={40} rank={2} />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.style.width).toBe("40px");
    expect(wrap.style.height).toBe("40px");
    expect(wrap.className).toContain("pa-rank-2");
    expect(screen.getByRole("img", { name: "2nd place" }).textContent).toBe("2");
  });

  it("without a place or a status is just the picture", () => {
    const { container } = render(<Avatar avatar={null} size={40} />);
    expect(container.firstElementChild?.tagName).toBe("IMG");
  });
});
