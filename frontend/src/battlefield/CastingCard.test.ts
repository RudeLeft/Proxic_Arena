// Spec 0042 — the spell being cast: its cost as it is paid, its colour.

import { describe, expect, it } from "vitest";
import type { Decision } from "../match";
import { optionalCostTitle } from "../matchText";
import { clickOn, type Question } from "./interaction";
import { castingBox, castingSpot, costPips, docks, emberColour, stillOwing } from "./CastingCard";
import { geometry } from "./layout";
import { stackSpotBoxes } from "./effects";

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

// Spec 0044 -- out of the way while a question needs the table.
describe("the card being cast, docked", () => {
  const question = (ids: string[]) =>
    ({ onBoard: new Map(ids.map((id) => [id, []])), listed: [] }) as unknown as Question;
  const decision = (kind: string) => ({ kind }) as unknown as Decision;

  it("docks for a target or a sacrifice on the table, not for paying", () => {
    expect(docks(decision("chooseTargets"), question(["card:7"]), "card:3")).toBe(true);
    expect(docks(decision("chooseCardsForEffect"), question(["card:7"]), "card:3")).toBe(true);
    expect(docks(decision("applyManaToCost"), question(["card:12"]), "card:3")).toBe(false);
    expect(docks(decision("chooseTargets"), question(["card:3"]), "card:3")).toBe(false);
    expect(docks(decision("chooseTargets"), question([]), "card:3")).toBe(false);
    expect(docks(null, null, "card:3")).toBe(false);
  });

  it("sits just left of the stack, smaller, clear of the middle", () => {
    const g = geometry({ width: 1920, height: 1080 });
    const middle = castingBox(g);
    const docked = castingBox(g, true);
    const stack = stackSpotBoxes(g, 1)[0]!;
    expect(docked.h).toBeLessThan(middle.h);
    expect(docked.x + docked.w).toBeLessThan(stack.x);
    expect(docked.x).toBeGreaterThan(middle.x + middle.w);
  });
});

describe("the card being cast never covers what is to be clicked (owner 2026-11-01, item 4)", () => {
  const g = geometry({ width: 1920, height: 1080 });
  const middle = castingBox(g);
  const card = (x: number, y: number) => ({
    x,
    y,
    w: g.cardW,
    h: g.cardH,
    scale: 1,
    rotation: 0,
    z: 0,
  });
  const covers = (a: ReturnType<typeof castingBox>, b: ReturnType<typeof card>) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("stays big in the middle when nothing to click is under it", () => {
    expect(castingSpot(g, false, [])).toEqual(middle);
    expect(castingSpot(g, false, [card(g.play.x + 4, g.play.y + g.play.h - g.cardH - 4)])).toEqual(
      middle,
    );
  });

  it("moves aside, the same size, off a mana elf under it", () => {
    const elf = card(middle.x + middle.w / 2 - g.cardW / 2, middle.y + middle.h - g.cardH);
    const spot = castingSpot(g, false, [elf]);
    expect(covers(spot, elf)).toBe(false);
    expect(spot.h).toBe(middle.h);
    expect(spot.y).toBeLessThan(middle.y);
    // Never over the stack.
    expect(spot.x + spot.w).toBeLessThanOrEqual(stackSpotBoxes(g, 1)[0]!.x);
  });

  it("goes beside the stack, smaller, when no big place is clear", () => {
    const everywhere: ReturnType<typeof card>[] = [];
    for (let x = g.play.x; x < g.play.x + g.play.w; x += g.cardW)
      for (let y = g.play.y; y < g.play.y + g.play.h; y += g.cardH) everywhere.push(card(x, y));
    expect(castingSpot(g, false, everywhere)).toEqual(castingBox(g, true));
  });

  it("is beside the stack whenever it docks for a question about the table", () => {
    expect(castingSpot(g, true, [])).toEqual(castingBox(g, true));
  });
});
