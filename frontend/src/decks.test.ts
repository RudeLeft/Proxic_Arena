import { describe, expect, it, vi } from "vitest";
import {
  bandsOf,
  deleteDeck,
  getDeck,
  listDecks,
  listShares,
  renameDeck,
  type CardCategory,
} from "./decks";

/**
 * Deck Depot client. The server's behaviour is covered by its own suite;
 * what is worth asserting here is the shaping a player sees. Since spec
 * 0022 decks arrive from the Deck Builder, so there is no upload to test.
 */

function respondWith(status: number, body: unknown): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("deck queries", () => {
  it("says it could not read the library rather than throwing, or claiming it is empty", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    // Spec 0008 — null, not an empty library: "Nothing imported yet"
    // would be untrue when the server did not answer.
    expect(await listDecks(dead)).toBeNull();
    expect(await getDeck("abc", dead)).toBeNull();
    expect(await deleteDeck("abc", dead)).toBe(false);
  });

  it("treats a 404 deck as null, not as an error", async () => {
    expect(await getDeck("abc", respondWith(404, { errorCode: "DECK_NOT_FOUND" }))).toBeNull();
  });
});

describe("rename (PHASE_07 §7.65)", () => {
  it("renames with PATCH and reports the server's words when refused", async () => {
    const ok = respondWith(200, { deckId: "abc", displayName: "Gruul" });
    expect(await renameDeck("abc", "Gruul", ok)).toEqual({ ok: true, displayName: "Gruul" });
    expect(vi.mocked(ok).mock.calls[0]?.[1]?.method).toBe("PATCH");

    const refused = respondWith(409, {
      errorCode: "DECK_NAME_TAKEN",
      detail: 'You already have a deck called "Gruul". Choose another name.',
    });
    expect(await renameDeck("abc", "Gruul", refused)).toEqual({
      ok: false,
      message: 'You already have a deck called "Gruul". Choose another name.',
    });
  });
});

describe("the share list (PHASE_07 Amendment 10)", () => {
  it("carries the players the deck could still go to", async () => {
    const list = await listShares(
      "abc",
      respondWith(200, {
        shares: [],
        shareCount: 0,
        candidates: [{ username: "parsley", displayName: "Parsley" }],
      }),
    );
    expect(list?.candidates).toEqual([{ username: "parsley", displayName: "Parsley" }]);
  });

  it("is null when the deck is not yours, not an empty list", async () => {
    expect(await listShares("abc", respondWith(403, { errorCode: "DECK_OWNER_REQUIRED" }))).toBe(
      null,
    );
  });
});

describe("bands (PHASE_07 Amendment 10)", () => {
  const entry = (lineNumber: number, quantity: number, category?: CardCategory) => ({
    lineNumber,
    quantity,
    cardName: `card ${lineNumber}`,
    resolutionStatus: "RESOLVED",
    ...(category ? { category } : {}),
  });

  it("bands lands, creatures and spells in that order, counting cards not lines", () => {
    const bands = bandsOf([
      entry(1, 4, "SPELL"),
      entry(2, 20, "LAND"),
      entry(3, 4, "CREATURE"),
      entry(4, 2, "SPELL"),
    ]);
    expect(bands.map((b) => [b.label, b.count])).toEqual([
      ["Lands", 20],
      ["Creatures", 4],
      ["Spells", 6],
    ]);
    // Decklist order inside a band.
    expect(bands[2]?.entries.map((e) => e.lineNumber)).toEqual([1, 4]);
  });

  it("never guesses: a card Forge has not sorted yet goes in its own band", () => {
    const bands = bandsOf([entry(1, 4, "LAND"), entry(2, 3)]);
    expect(bands.map((b) => b.label)).toEqual(["Lands", "Not sorted yet"]);
    expect(bands[1]?.count).toBe(3);
  });

  it("leaves out an empty band", () => {
    expect(bandsOf([entry(1, 60, "LAND")]).map((b) => b.label)).toEqual(["Lands"]);
    expect(bandsOf([])).toEqual([]);
  });
});
