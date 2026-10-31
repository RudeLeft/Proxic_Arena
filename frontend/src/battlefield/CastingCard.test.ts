// Spec 0042 — the spell being cast: its cost as it is paid, its colour.

import { describe, expect, it } from "vitest";
import type { Decision } from "../match";
import { optionalCostTitle } from "../matchText";
import { clickOn, type Question } from "./interaction";
import { costPips, emberColour, stillOwing } from "./CastingCard";

describe("the cost under the card being cast", () => {
  it("reads Forge's own still owing", () => {
    expect(stillOwing(["Plains — still owing {2}{W}", null])).toEqual(["2", "W"]);
    expect(stillOwing(["Choose a target"])).toBeNull();
  });

  it("lights each symbol once paid, and counts down a generic one", () => {
    expect(costPips("{2}{W}", null)).toEqual([
      { symbol: "2", paid: false },
      { symbol: "W", paid: false },
    ]);
    expect(costPips("{2}{W}", ["1", "W"])).toEqual([
      { symbol: "1", paid: false },
      { symbol: "W", paid: false },
    ]);
    expect(costPips("{2}{W}", ["2"])).toEqual([
      { symbol: "2", paid: false },
      { symbol: "W", paid: true },
    ]);
    expect(costPips("{2}{W}", [])).toEqual([
      { symbol: "2", paid: true },
      { symbol: "W", paid: true },
    ]);
  });
});

describe("the sparks' colour", () => {
  it("is the card's one colour, gold for several or none", () => {
    expect(emberColour("{R}")).toBe("#ff7a3c");
    expect(emberColour("{1}{W}{W}")).toBe("#f6e7b0");
    expect(emberColour("{W}{U}")).toBe("#f1c36a");
    expect(emberColour(null)).toBe("#f1c36a");
  });
});

describe("an optional cost asked as itself", () => {
  it("names a single cost, and says so for several", () => {
    const one = {
      options: [{ label: "Bargain – Sacrifice an artifact, enchantment or token" }],
    } as unknown as Decision;
    expect(optionalCostTitle(one)).toBe("Bargain?");
    const two = {
      options: [{ label: "Kicker – {2}" }, { label: "Buyback – {3}" }],
    } as unknown as Decision;
    expect(optionalCostTitle(two)).toBe("Pay optional costs?");
  });
});

describe("a click on an attacker or blocker", () => {
  it("takes it back, even when it could also block another", () => {
    const options = [
      { actionId: "blocker:card:4", label: "Sinew Sliver", objectId: "card:4", payable: true },
      {
        actionId: "unblock:card:4",
        label: "Stop blocking — Sinew Sliver",
        objectId: "card:4",
        payable: true,
      },
    ];
    const question = {
      context: "choose",
      onBoard: new Map([["card:4", options]]),
      listed: [],
      canPass: true,
    } as unknown as Question;
    expect(clickOn(question, "card:4")).toEqual({ kind: "answer", actionId: "unblock:card:4" });
  });
});
