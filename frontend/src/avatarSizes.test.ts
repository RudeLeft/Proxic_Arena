// Spec 0020 F-0020-A — every page's pictures use the lobby's two sizes:
// ICON (40) in lists and chat, SEAT_AVATAR (56) for featured players. The
// Account page's picture editor is a preview, not a list, so it is left out.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON, SEAT_AVATAR } from "./lobbyView";

const PAGES = ["LobbyPage.tsx", "LobbyChat.tsx", "HallPage.tsx", "AdminPage.tsx", "DecksPage.tsx"];

describe("picture sizes (F-0020-A)", () => {
  it("are the lobby's two", () => {
    expect([ICON, SEAT_AVATAR]).toEqual([40, 56]);
  });

  it.each(PAGES)("%s uses only ICON or SEAT_AVATAR", (page) => {
    const source = readFileSync(join(__dirname, page), "utf8");
    const sizes = [...source.matchAll(/<Avatar\b[^>]*?\bsize=\{([^}]+)\}/gs)].map((m) => m[1]);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((size) => size !== "ICON" && size !== "SEAT_AVATAR")).toEqual([]);
  });

  it("the leaderboard's deck icon is the size of the player's picture (owner 2026-10-28)", () => {
    const source = readFileSync(join(__dirname, "HallPage.tsx"), "utf8");
    const sizes = [...source.matchAll(/<DeckIcon\b[^>]*?\bsize=\{([^}]+)\}/gs)].map((m) => m[1]);
    expect(sizes).toEqual(["ICON"]);
  });
});
