// Spec 0055 (owner 2026-11-06): a target window says what it is for.
import { describe, expect, it } from "vitest";
import { targetWords } from "./matchText";

describe("target window words", () => {
  it("Boggart Shenanigans: the action, the card's words, what to click, and a way to decline", () => {
    const w = targetWords(
      "Boggart Shenanigans may deal 1 damage to target player or planeswalker.",
      "Boggart Shenanigans",
    )!;
    expect(w.title).toBe("Deal 1 damage");
    expect(w.said).toBe("Boggart Shenanigans may deal 1 damage to a player or planeswalker.");
    expect(w.hint).toBe("Click a player or planeswalker.");
    expect(w.decline).toBe("Don't deal 1 damage");
  });

  it("a spell: no decline, any target", () => {
    const w = targetWords("Lightning Bolt deals 3 damage to any target.", "Lightning Bolt")!;
    expect(w.title).toBe("Deal 3 damage");
    expect(w.hint).toBe("Click any creature, player or planeswalker.");
    expect(w.decline).toBeNull();
  });

  it("the older 'Name: It deals' form reads as a sentence about the card", () => {
    const w = targetWords("Mogg Fanatic: It deals 1 damage to any target.", "Mogg Fanatic")!;
    expect(w.said).toBe("Mogg Fanatic deals 1 damage to any target.");
    expect(w.title).toBe("Deal 1 damage");
  });

  it("instructions and other subjects", () => {
    expect(
      targetWords("Doom Blade: Destroy target nonblack creature.", "Doom Blade"),
    ).toMatchObject({
      title: "Destroy a nonblack creature",
      hint: "Click a nonblack creature.",
    });
    expect(
      targetWords(
        "Target creature you control gets +2/+0 and gains trample until end of turn.",
        "Storm-Charged Slasher",
      ),
    ).toMatchObject({
      said: "A creature you control gets +2/+0 and gains trample until end of turn.",
      hint: "Click a creature you control.",
    });
    expect(
      targetWords("Swords to Plowshares: Exile target creature.", "Swords to Plowshares")?.title,
    ).toBe("Exile a creature");
    expect(
      targetWords("Unsummon: Return target creature to its owner's hand.", "Unsummon")?.title,
    ).toBe("Return a creature");
  });

  it("no words, or no target in them: nothing to add", () => {
    expect(targetWords(null, "X")).toBeNull();
    expect(targetWords("Draw a card.", "Opt")).toBeNull();
  });
});
