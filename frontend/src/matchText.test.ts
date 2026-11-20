// Spec 0109, item 5 (canvas "5", "The hint fixed") -- F-0109-B: the target
// hint names the whole kind of thing to click, not the words up to the
// first comma ("Click a non-Vampire." was screenshot 4's).

import { describe, expect, it } from "vitest";
import { readNoun, targetWords } from "./matchText";

const hint = (prompt: string, name: string | null = null) => targetWords(prompt, name)?.hint;

describe("F-0109-B · the target hint reads the whole target phrase", () => {
  it("a run of non- words: the noun, then what it isn't", () => {
    expect(hint("Destroy target non-Vampire, non-Werewolf, non-Zombie creature.")).toBe(
      "Click a creature that isn't a Vampire, Werewolf or Zombie.",
    );
    // The same run with "or", and one alone.
    expect(hint("Exile target non-Angel, non-Demon, or non-Dragon creature.")).toBe(
      "Click a creature that isn't an Angel, Demon or Dragon.",
    );
    expect(hint("Destroy target non-Human creature.")).toBe("Click a creature that isn't a Human.");
  });

  it('a list with "or" is read whole', () => {
    expect(hint("Destroy target artifact, enchantment, or land.")).toBe(
      "Click an artifact, enchantment, or land.",
    );
    expect(hint("Shock deals 2 damage to target creature or planeswalker.")).toBe(
      "Click a creature or planeswalker.",
    );
  });

  it("counts: two, up to one", () => {
    expect(hint("Tap two target creatures.")).toBe("Click two creatures.");
    expect(hint("Return up to one target creature to its owner's hand.")).toBe(
      "Click up to one creature.",
    );
    expect(hint("Return up to one target non-Vampire, non-Zombie creature.")).toBe(
      "Click up to one creature that isn't a Vampire or Zombie.",
    );
  });

  it("a comma that is not a list still ends the phrase", () => {
    expect(hint("Tap target creature, then draw a card.")).toBe("Click a creature.");
    expect(hint("Target creature gets +2/+2 until end of turn.")).toBe("Click a creature.");
  });

  it("words that can't be read as a kind: a highlighted card", () => {
    expect(hint("Destroy target non-Vampire, its controller draws a card.")).toBe(
      "Click a highlighted card.",
    );
    expect(readNoun("non-Vampire.", true)).toBeNull();
  });

  it("the short window's line says Choose", () => {
    expect(
      targetWords("Destroy target non-Vampire, non-Werewolf, non-Zombie creature.", null)?.choose,
    ).toBe("Choose a creature that isn't a Vampire, Werewolf or Zombie.");
  });
});
