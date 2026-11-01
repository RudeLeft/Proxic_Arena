// Spec 0045 -- seeing what happened: counters' origins, an empty library,
// what a stack object does, where revealed cards went.

import { describe, expect, it } from "vitest";
import { counterName, counterWords } from "./Board";
import { libraryWarning, libraryWords } from "./GameScreen";
import { wentWords } from "./RevealTray";
import { stackWords } from "./triggers";

describe("a card's counters, and where they came from", () => {
  it("names counters as players say them", () => {
    expect(counterName("P1P1")).toBe("+1/+1");
    expect(counterName("M1M1")).toBe("-1/-1");
    expect(counterName("CHARGE")).toBe("Charge");
  });

  it("says where the last ones came from, and nothing it doesn't know", () => {
    const pridemate = {
      counters: [{ name: "P1P1", count: 1 }],
      counterFrom: [
        {
          counter: "P1P1",
          added: 1,
          from: "Ajani's Pridemate's trigger: RudeLeft gained 1 life (Soul Warden)",
        },
      ],
    };
    expect(counterWords(pridemate)).toEqual([
      "1 +1/+1 counter, the last from Ajani's Pridemate's trigger: RudeLeft gained 1 life (Soul Warden)",
    ]);
    expect(counterWords({ counters: [{ name: "P1P1", count: 2 }] })).toEqual(["2 +1/+1 counters"]);
  });
});

describe("an empty library", () => {
  it("warns at 3 or fewer and at 0", () => {
    expect(libraryWarning(4)).toBeNull();
    expect(libraryWarning(3)).toBe("low");
    expect(libraryWarning(0)).toBe("empty");
    expect(libraryWords(0, null)).toBe("Empty: your next draw loses the game");
    expect(libraryWords(0, "Pat")).toBe("Empty: Pat’s next draw loses the game");
    expect(libraryWords(1, null)).toMatch(/^1 card left/);
    expect(libraryWords(9, null)).toBeNull();
  });
});

describe("what a stack object does", () => {
  it("drops the card's name, its numbers and the cause in brackets", () => {
    expect(
      stackWords(
        "Ajani's Pridemate (65) - Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.",
        "Ajani's Pridemate",
      ),
    ).toBe("Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.");
    // A trigger's words follow its card's name after "->".
    expect(
      stackWords(
        "Ajani's Pridemate (65) -> Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.",
        "Ajani's Pridemate",
      ),
    ).toBe("Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.");
    expect(
      stackWords(
        "Boggart Shenanigans — {0} — Deal 1 damage. [Zone Changer: Goblin Token (122)]",
        "Boggart Shenanigans",
      ),
    ).toBe("Deal 1 damage.");
  });
});

describe("where a revealed card went", () => {
  it("says it in a few words, or nothing yet", () => {
    expect(wentWords("hand")).toBe("→ hand");
    expect(wentWords("bottom")).toBe("→ bottom of library");
    expect(wentWords(null)).toBeNull();
  });
});
