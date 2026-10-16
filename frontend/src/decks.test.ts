import { describe, expect, it, vi } from "vitest";
import { deleteDeck, getDeck, headingFor, importDeck, listDecks } from "./decks";

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
  ) as unknown as typeof fetch;
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
    expect(await listDecks(dead)).toEqual([]);
    expect(await getDeck("abc", dead)).toBeNull();
    expect(await deleteDeck("abc", dead)).toBe(false);
  });

  it("treats a 404 deck as null, not as an error", async () => {
    expect(await getDeck("abc", respondWith(404, { errorCode: "DECK_NOT_FOUND" }))).toBeNull();
  });
});
