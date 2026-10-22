import { describe, expect, it, vi } from "vitest";
import {
  bandsOf,
  deleteDeck,
  getDeck,
  headingFor,
  importDeck,
  listDecks,
  listShares,
  renameDeck,
  type CardCategory,
} from "./decks";

/**
 * Deck import client — PHASE_02 §2.75, §2.84, §2.86.
 *
 * The server's behaviour is covered by its own suite; what is worth
 * asserting here is the shaping a player sees: that a rejection is
 * an ordinary result rather than an exception, that every problem
 * survives to the screen, and that an unknown error code does not
 * produce a blank page.
 */

const file = () =>
  new File([new Uint8Array([1, 2, 3])], "My Deck.zip", { type: "application/zip" });

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

describe("importDeck", () => {
  it("returns the imported deck on success", async () => {
    const result = await importDeck(
      file(),
      respondWith(201, {
        deckId: "abc",
        displayName: "My Deck",
        status: "ready",
        totalCards: 65,
        distinctCards: 11,
        artStored: 11,
        entriesWithoutArt: 0,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.deck.totalCards).toBe(65);
  });

  it("returns a rejection as a RESULT, not an exception", async () => {
    // §2.86: a package mistake is an ordinary outcome the page
    // displays. A thrown error would reach the error boundary and
    // replace the page with a crash screen.
    const result = await importDeck(
      file(),
      respondWith(422, {
        errorCode: "DECK_NOT_LEGAL",
        detail: "The deck is not legal in Open Format.",
        problems: ['Open Format allows at most 4 copies of "Fiery Temper"; this deck has 5.'],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.errorCode).toBe("DECK_NOT_LEGAL");
      expect(result.failure.problems).toHaveLength(1);
    }
  });

  it("keeps EVERY problem, not just the first", async () => {
    const problems = ["one", "two", "three"];
    const result = await importDeck(
      file(),
      respondWith(422, { errorCode: "DECK_NOT_LEGAL", detail: "no", problems }),
    );
    if (!result.ok) expect(result.failure.problems).toEqual(problems);
  });

  it("surfaces the existing deck id for a duplicate", async () => {
    // Owner decision D3: refusing is right, but a dead end is not —
    // the player should be able to reach the deck they already have.
    const result = await importDeck(
      file(),
      respondWith(409, {
        errorCode: "DUPLICATE_PACKAGE",
        detail: "Already imported.",
        problems: ["deck-123"],
      }),
    );
    if (!result.ok) expect(result.failure.existingDeckId).toBe("deck-123");
  });

  it("reports an unreachable server as a failure, not a crash", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    const result = await importDeck(file(), dead);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.errorCode).toBe("NETWORK");
  });

  it("survives a response that is not JSON", async () => {
    const html = vi.fn(() =>
      Promise.resolve(new Response("<html>gateway error</html>", { status: 502 })),
    ) as unknown as typeof fetch;
    const result = await importDeck(file(), html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.errorCode).toBe("UNREADABLE_RESPONSE");
  });
});

describe("error headings (§2.86)", () => {
  it("gives a human category for the codes the server sends", () => {
    for (const code of ["NOT_A_ZIP", "DECK_NOT_LEGAL", "CARDS_NOT_RESOLVED", "DUPLICATE_PACKAGE"]) {
      expect(headingFor(code), code).toBeTruthy();
    }
  });

  it("returns null for an unknown code rather than inventing one", () => {
    // A newer server must not produce a blank or misleading heading
    // on an older client; the page falls back to the server's own
    // sentence.
    expect(headingFor("SOMETHING_NEW_IN_PHASE_4")).toBeNull();
  });
});

describe("deck queries", () => {
  it("returns an empty list rather than throwing when the server is down", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    // PHASE_04 §4.58/§4.59 — the library is two named lists now, so
    // "nothing" is an empty library rather than an empty array.
    expect(await listDecks(dead)).toEqual({ mine: [], sharedWithMe: [] });
    expect(await getDeck("abc", dead)).toBeNull();
    expect(await deleteDeck("abc", dead)).toBe(false);
  });

  it("treats a 404 deck as null, not as an error", async () => {
    expect(await getDeck("abc", respondWith(404, { errorCode: "DECK_NOT_FOUND" }))).toBeNull();
  });
});

describe("one name per owner and rename (PHASE_07 §7.65)", () => {
  it("hands a name clash back with the name, so the page can offer it to edit", async () => {
    const result = await importDeck(
      file(),
      respondWith(409, {
        errorCode: "DECK_NAME_TAKEN",
        detail: 'You already have a deck called "Burn". Choose another name.',
        problems: ["Burn"],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.takenName).toBe("Burn");
      expect(result.failure.existingDeckId).toBeUndefined();
      expect(headingFor(result.failure.errorCode)).toMatch(/already have a deck with that name/);
    }
  });

  it("sends a chosen name with the package, and none when there is none", async () => {
    const fetchFn = respondWith(201, { deckId: "abc", displayName: "Burn 2" });
    await importDeck(file(), fetchFn, "Burn 2");
    await importDeck(file(), fetchFn);
    const bodies = vi.mocked(fetchFn).mock.calls.map((call) => call[1]?.body as FormData);
    expect(bodies[0]?.get("name")).toBe("Burn 2");
    expect(bodies[1]?.has("name")).toBe(false);
  });

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
