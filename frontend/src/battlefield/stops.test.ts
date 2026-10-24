// PHASE_07 §7.53, AMENDMENT 13 — the Pass button's words, and the stops a
// player saves.

import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../match";
import { fetchStops, passWords, saveStops, waitingLine } from "./stops";

function board(
  phase: string,
  activeSeat: number,
  stack: { name: string }[] = [],
  battlefield: { seat: number; attacking: boolean }[] = [],
): Snapshot {
  return {
    phase,
    activeSeat,
    stack,
    battlefield,
    players: [
      { seat: 1, name: "Alice" },
      { seat: 2, name: "Bob" },
    ],
  } as unknown as Snapshot;
}

describe("passWords", () => {
  it("says what passing does next, as MTG Arena's button does", () => {
    expect(passWords(board("MAIN1", 1), 1)).toEqual({ word: "Next", sub: "To combat" });
    expect(passWords(board("UPKEEP", 1), 1).word).toBe("Next");
    expect(passWords(board("MAIN2", 1), 1)).toEqual({ word: "End turn", sub: "Over to Bob" });
    expect(passWords(board("COMBAT_DECLARE_BLOCKERS", 1), 1).word).toBe("Next");
  });

  it("on the opponent's turn hands it back, and a spell on the stack resolves", () => {
    expect(passWords(board("MAIN1", 2), 1)).toEqual({ word: "Pass", sub: "Back to Bob" });
    expect(passWords(board("MAIN1", 1, [{ name: "Shock" }]), 1)).toEqual({
      word: "Resolve",
      sub: "Lets Shock resolve",
    });
  });

  it("while they attack, says the blocks come next rather than Pass (owner 2026-10-22)", () => {
    const attacking = [
      { seat: 2, attacking: true },
      { seat: 2, attacking: true },
      { seat: 1, attacking: false },
    ];
    expect(passWords(board("COMBAT_DECLARE_ATTACKERS", 2, [], attacking), 1)).toEqual({
      word: "To blocks",
      sub: "Bob attacks with 2 — you choose blockers next",
    });
    expect(passWords(board("COMBAT_DECLARE_BLOCKERS", 2, [], attacking), 1).word).toBe("To damage");
    // No attack, or another step of their turn: back to them.
    expect(passWords(board("COMBAT_DECLARE_ATTACKERS", 2, [], []), 1).word).toBe("Pass");
    expect(passWords(board("COMBAT_END", 2, [], attacking), 1).word).toBe("Pass");
  });
});

describe("stops over HTTP", () => {
  it("reads the saved settings, and sends a change as PUT", async () => {
    const answer = { own: ["MAIN1", "MAIN2"], opponent: ["END_OF_TURN"], hold: true };
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(answer), { status: 200 })),
    );
    expect(await fetchStops(fetchFn as unknown as typeof fetch)).toEqual(answer);
    expect(await saveStops(answer, fetchFn as unknown as typeof fetch)).toEqual(answer);
    const [url, init] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/matches/stops");
    expect(init.method).toBe("PUT");
  });

  it("is null, not a guess, when the server refuses or sends nonsense", async () => {
    const refused = vi.fn(() => Promise.resolve(new Response("{}", { status: 400 })));
    expect(
      await saveStops({ own: [], opponent: [], hold: false }, refused as unknown as typeof fetch),
    ).toBeNull();
    const nonsense = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ own: "MAIN1" }), { status: 200 })),
    );
    expect(await fetchStops(nonsense as unknown as typeof fetch)).toBeNull();
    // Spec 0004 -- an older server says nothing of hold: off, never a guess of on.
    const older = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ own: [], opponent: [] }), { status: 200 })),
    );
    expect((await fetchStops(older as unknown as typeof fetch))?.hold).toBe(false);
  });
});

// Spec 0002 -- owner report 2026-10-23: while Krenko made Goblins, each
// screen said it was waiting for the other player.
describe("waitingLine", () => {
  const krenko = { name: "Krenko, Mob Boss", controller: 1 };
  const table = (prioritySeat: number, stack: object[] = []) =>
    ({ ...board("MAIN1", 1, stack as { name: string }[]), prioritySeat }) as Snapshot;

  it("while nobody is asked, both players read Resolving, naming the top of the stack", () => {
    const busy = table(2, [krenko]);
    expect(waitingLine(busy, 1, { seat: null }, 2, true)).toBe("Resolving Krenko, Mob Boss…");
    expect(waitingLine(busy, 2, { seat: null }, 2, true)).toBe("Resolving Krenko, Mob Boss…");
    expect(waitingLine(table(2), 1, { seat: null }, 2, true)).toBe("Resolving…");
  });

  it("names the seat the server says is asked, not the one with priority", () => {
    // Priority says seat 2; the server says seat 1 is deciding.
    expect(waitingLine(table(2), 2, { seat: 1 }, 1, false)).toBe("Waiting for Alice");
    expect(waitingLine(table(2), 1, { seat: 1 }, 1, false)).toBe("One moment");
  });

  it("between two questions, stays on whoever was last asked rather than flicker", () => {
    expect(waitingLine(table(2), 1, { seat: null }, 2, false)).toBe("Waiting for Bob");
    expect(waitingLine(table(2), 1, { seat: null }, null, false)).toBe("One moment");
  });

  it("guesses from priority as before when the server has never said", () => {
    expect(waitingLine(table(2), 1, null, null, false)).toBe("Waiting for Bob");
    expect(waitingLine(table(1), 1, null, null, false)).toBe("One moment");
    // Their spell on the stack: it is theirs that is going on.
    const theirs = table(1, [{ name: "Shock", controller: 2 }]);
    expect(waitingLine(theirs, 1, null, null, false)).toBe("Waiting for Bob");
  });
});
