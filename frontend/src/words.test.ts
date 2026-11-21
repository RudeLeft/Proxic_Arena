import { describe, expect, it } from "vitest";
import {
  andList,
  article,
  capitalNumber,
  countWords,
  manaTextWords,
  manaWords,
  numberWord,
  ordinalWord,
  plural,
  someWords,
  symbolWords,
  timesWord,
  withArticle,
} from "./words";

// Spec 0113 -- the page's one number-word helper and one mana-words helper.
describe("numbers in sentences (spec 0113)", () => {
  it("says one to ten as words and bigger counts as digits", () => {
    expect(numberWord(0)).toBe("zero");
    expect(numberWord(1)).toBe("one");
    expect(numberWord(7)).toBe("seven");
    expect(numberWord(10)).toBe("ten");
    expect(numberWord(11)).toBe("11");
    expect(numberWord(-3)).toBe("-3");
    expect(capitalNumber(3)).toBe("Three");
    expect(ordinalWord(2)).toBe("second");
    expect(ordinalWord(12)).toBe("12th");
    expect(ordinalWord(21)).toBe("21st");
    expect(timesWord(1)).toBe("once");
    expect(timesWord(2)).toBe("twice");
    expect(timesWord(3)).toBe("three times");
  });

  it("counts a noun, with a or an for one", () => {
    expect(countWords(2, "card")).toBe("two cards");
    expect(countWords(1, "card")).toBe("one card");
    expect(countWords(0, "card")).toBe("no cards");
    expect(countWords(12, "Goblin token")).toBe("12 Goblin tokens");
    expect(countWords(3, "copy")).toBe("three copies");
    expect(someWords(1, "Island")).toBe("an Island");
    expect(someWords(1, "card")).toBe("a card");
    expect(withArticle("Elf Warrior token")).toBe("an Elf Warrior token");
    expect(article("one-eyed giant")).toBe("a");
    expect(article("8/8")).toBe("an");
    expect(plural("Elf")).toBe("Elves");
    expect(andList(["Ann", "Cal"])).toBe("Ann and Cal");
    expect(andList(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("mana in words (spec 0113, W1-271..W1-280)", () => {
  it("says each symbol in words", () => {
    expect(symbolWords("R")).toBe("red");
    expect(symbolWords("{2}")).toBe("two generic");
    expect(symbolWords("W/U")).toBe("white or blue");
    expect(symbolWords("G/P")).toBe("green Phyrexian");
    expect(symbolWords("C")).toBe("colorless");
    expect(symbolWords("T")).toBe("tap");
  });

  it("groups a cost", () => {
    expect(manaWords("{1}{R}{R}")).toBe("one generic and two red");
    expect(manaWords(["2", "R", "G"])).toBe("two generic, one red and one green");
    expect(manaWords("{X}{G}")).toBe("X and one green");
    expect(manaWords("")).toBe("");
  });

  it("reads card text aloud without braces", () => {
    expect(manaTextWords("{T}: Add {R}.")).toBe("Tap: add one red mana.");
    expect(manaTextWords("{2}{G}, {T}: Draw a card.")).toBe(
      "Two generic and one green, tap: Draw a card.",
    );
    expect(manaTextWords("Draw a card.")).toBe("Draw a card.");
    // W1-031: a cost on its own reads on in its sentence ("Costs three generic").
    expect(manaTextWords("{3}")).toBe("three generic");
    expect(manaTextWords("Cycling: {R}")).toBe("Cycling: one red");
  });
});
