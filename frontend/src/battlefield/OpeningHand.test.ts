// Phase 9 W-15 -- the opening hand's helpers: which option is a card's,
// how many are still to go back, and "once, twice, 3 times".

import { describe, expect, it } from "vitest";
import type { Decision, SnapshotCard } from "../match";
import { optionFor, times, toGo } from "./OpeningHand";

const decision = (prompt: string, ids: string[]) =>
  ({
    kind: "tuckCardsViaMulligan",
    prompt,
    options: ids.map((id) => ({ actionId: id, label: id, objectId: null })),
  }) as unknown as Decision;
const card = (id: string) => ({ id }) as SnapshotCard;

describe("the opening hand (W-15)", () => {
  it("finds a card's option by the game's own ids, never a near miss", () => {
    const d = decision("Choose a card to put back (2 to go).", ["tuck:card:12", "tuck:card:112"]);
    expect(optionFor(d, card("card:12"))?.actionId).toBe("tuck:card:12");
    expect(optionFor(d, card("card:112"))?.actionId).toBe("tuck:card:112");
    expect(optionFor(d, card("card:2"))).toBeUndefined();
    const ley = decision("Begin the game with any of these?", ["opening:card:7"]);
    expect(optionFor(ley, card("card:7"))?.actionId).toBe("opening:card:7");
  });

  it("reads how many are still to go back from the game's words", () => {
    expect(toGo(decision("Choose a card to put back (2 to go).", []))).toBe(2);
    expect(toGo(decision("Choose a card to put back.", []))).toBe(1);
  });

  it("says how many times in words", () => {
    expect([1, 2, 3].map(times)).toEqual(["once", "twice", "3 times"]);
  });
});
