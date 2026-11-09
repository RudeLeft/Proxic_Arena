// Spec 0042 — the spell being cast: its cost as it is paid, its colour.

import { describe, expect, it } from "vitest";
import type { Decision } from "../match";
import { optionalCostTitle } from "../matchText";
import { clickOn, type Question } from "./interaction";
import { castingBox, costPips, emberColour, stillOwing } from "./CastingCard";
import { geometry } from "./layout";
import { stackSpotBoxes } from "./effects";

describe("the cost under the card being cast", () => {
  it("reads Forge's own still owing", () => {
    expect(stillOwing(["Plains — still owing {2}{W}", null])).toEqual(["2", "W"]);
    expect(stillOwing(["Choose a target"])).toBeNull();
  });

  it("lights each symbol once paid; generic mana one pip per point (spec 0058, item 6)", () => {
    const g = (paid: boolean) => ({ symbol: "1", paid, generic: true });
    expect(costPips("{2}{W}", null)).toEqual([g(false), g(false), { symbol: "W", paid: false }]);
    expect(costPips("{2}{W}", ["1", "W"])).toEqual([
      g(true),
      g(false),
      { symbol: "W", paid: false },
    ]);
    expect(costPips("{2}{W}", ["2"])).toEqual([g(false), g(false), { symbol: "W", paid: true }]);
    expect(costPips("{2}{W}", [])).toEqual([g(true), g(true), { symbol: "W", paid: true }]);
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

// Spec 0068 -- supersedes spec 0044's docking and owner 2026-11-01 item 4's
// sliding aside: the card is always centred on the middle of the screen,
// at full size, whatever is under it; after a resize, the new middle.
describe("the card being cast, in the middle of the screen (F-0068-A)", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1920, 947],
    [2560, 1440],
    [3440, 1440],
    [3840, 2160],
  ] as const) {
    it(`is centred at ${width}x${height}, full size`, () => {
      const g = geometry({ width, height });
      const box = castingBox(g);
      expect(box.x + box.w / 2).toBeCloseTo(width / 2, 6);
      expect(box.y + box.h / 2).toBeCloseTo(height / 2, 6);
      expect(box.h).toBeCloseTo(Math.min(g.cardH * 2.5, height * 0.5), 6);
      // Never over the stack's spot in the right-hand column.
      expect(box.x + box.w).toBeLessThan(stackSpotBoxes(g, 1)[0]!.x);
    });
  }
});
