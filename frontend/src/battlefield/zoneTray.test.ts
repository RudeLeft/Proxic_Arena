// Phase 9 W-18 and W-19 -- the tray's grouping and words, and the close-up's
// printed power and toughness.

import { describe, expect, it } from "vitest";
import type { SnapshotCard } from "../match";
import { groupCopies, printedPt, zoneNotes } from "./zoneTray";

const card = (id: string, name: string, more: Partial<SnapshotCard> = {}) =>
  ({
    id,
    name,
    art: `art-${name}`,
    counters: [],
    power: null,
    toughness: null,
    ...more,
  }) as unknown as SnapshotCard;

describe("the graveyard and exile tray (W-18)", () => {
  it("shows identical cards as one, in the order given", () => {
    const grouped = groupCopies([
      card("card:1", "Rift Bolt"),
      card("card:2", "Staggershock"),
      card("card:3", "Rift Bolt"),
    ]);
    expect(grouped.map((g) => [g.card.name, g.copies])).toEqual([
      ["Rift Bolt", 2],
      ["Staggershock", 1],
    ]);
  });

  it("keeps apart copies that differ: another picture, a counter, a reason in exile", () => {
    const grouped = groupCopies([
      card("card:1", "Mountain"),
      card("card:2", "Mountain", { art: "art-other-printing" }),
      card("card:3", "Rift Bolt", { counters: [{ name: "TIME", count: 1 }] }),
      card("card:4", "Rift Bolt"),
      card("card:5", "Mountain", { playable: true }),
    ]);
    expect(grouped.map((g) => g.copies)).toEqual([1, 1, 1, 1, 1]);
  });

  it("says why a card is in exile", () => {
    const lit = card("card:1", "Mountain", { exiledBy: "Light Up the Stage", playable: true });
    expect(zoneNotes(lit, "exile")).toEqual(["You may play it", "Exiled by Light Up the Stage"]);
    const suspended = card("card:2", "Rift Bolt", { counters: [{ name: "TIME", count: 1 }] });
    expect(zoneNotes(suspended, "exile")).toEqual(["1 time counter"]);
    // In a graveyard, exile's words never show.
    expect(zoneNotes(lit, "graveyard")).toEqual([]);
  });
});

describe("the close-up's power and toughness (W-19)", () => {
  it("gives the printed numbers only when they differ from now", () => {
    expect(
      printedPt(
        card("card:1", "Storm", { power: 4, toughness: 5, basePower: 2, baseToughness: 3 }),
      ),
    ).toBe("2/3");
    expect(
      printedPt(
        card("card:1", "Storm", { power: 2, toughness: 3, basePower: 2, baseToughness: 3 }),
      ),
    ).toBeNull();
    expect(printedPt(card("card:1", "Storm", { power: 2, toughness: 3 }))).toBeNull();
  });
});
