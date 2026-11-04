// Phase 9 W-16 -- an ability's line split into its cost and its words.

import { describe, expect, it } from "vitest";
import { abilityParts } from "./abilities";

describe("an ability's cost, first (W-16)", () => {
  it("splits a planeswalker's loyalty abilities", () => {
    expect(
      abilityParts(
        "Elspeth Resplendent — +1: Choose up to one target creature.",
        "Elspeth Resplendent",
      ),
    ).toEqual({ cost: "+1", kind: "up", text: "Choose up to one target creature." });
    expect(
      abilityParts("Elspeth Resplendent — −3: Look at the top seven.", "Elspeth Resplendent").kind,
    ).toBe("down");
    expect(abilityParts("Karn — -7: You get an emblem.", "Karn")).toMatchObject({
      cost: "-7",
      kind: "down",
    });
    expect(abilityParts("Teferi — 0: Untap two lands.", "Teferi").kind).toBe("loyalty");
  });

  it("splits a mana and tap cost", () => {
    expect(
      abilityParts(
        "Sensei's Divining Top — {1}: Look at the top three cards.",
        "Sensei's Divining Top",
      ),
    ).toEqual({ cost: "{1}", kind: "mana", text: "Look at the top three cards." });
    expect(
      abilityParts("Fiery Temper — {1}{R}{R} — Fiery Temper deals 3 damage.", "Fiery Temper"),
    ).toEqual({ cost: "{1}{R}{R}", kind: "mana", text: "Fiery Temper deals 3 damage." });
  });

  it("leaves a line without a cost whole, and never takes a sentence's colon for one", () => {
    expect(abilityParts("Mountain — Play this land", "Mountain")).toEqual({
      cost: null,
      kind: null,
      text: "Play this land",
    });
    expect(abilityParts("Card — Choose one: draw a card.", "Card").cost).toBeNull();
  });

  // Amendment 13 (item 4) -- the owner's Forgotten Cave.
  it("puts mana in the cost and the action in the words, dropping the bracketed reminder", () => {
    expect(
      abilityParts(
        "Forgotten Cave — {R}, Discard Forgotten Cave — Cycling ({R}, Discard this card: Draw a card.)",
        "Forgotten Cave",
      ),
    ).toEqual({ cost: "{R}", kind: "mana", text: "Cycling · Discard this card: draw a card." });
  });

  it("says a land play plainly, with nothing to pay", () => {
    expect(abilityParts("Forgotten Cave — no cost — Play land", "Forgotten Cave")).toEqual({
      cost: null,
      kind: null,
      text: "Play this land",
    });
  });
});
