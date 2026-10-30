import { describe, expect, it } from "vitest";
import type { Decision, DecisionOption, Snapshot } from "../match";
import {
  BUBBLE_MOST,
  colourSymbol,
  fitsBubble,
  listGroups,
  optionWords,
  plainHint,
  sourceOf,
} from "./QuestionWindows";

const option = (label: string, objectId: string | null = null): DecisionOption =>
  ({ actionId: label, label, objectId, payable: true }) as DecisionOption;

const board = (ids: string[], names: Record<string, string> = {}): Snapshot =>
  ({
    battlefield: ids.map((id) => ({ id, name: names[id] ?? id })),
    hand: [],
    graveyard: [],
    exile: [],
    stack: [],
  }) as unknown as Snapshot;

describe("group 2 windows", () => {
  it("drops the Esc sentence from the hint: Cancel is a button", () => {
    expect(plainHint("chooseTargetsFor", 2)).not.toMatch(/Esc/);
    expect(plainHint("chooseTargetsFor", 2).length).toBeGreaterThan(0);
  });

  it("shows an option without its card's name in front", () => {
    expect(optionWords(option("Shock — cast"), "Shock")).toBe("cast");
    expect(optionWords(option("Shock — cast"), "Bolt")).toBe("Shock — cast");
    expect(optionWords(option("Shock — cast"), null)).toBe("Shock — cast");
  });

  it("reads colours as mana symbols", () => {
    expect(colourSymbol("Red")).toBe("R");
    expect(colourSymbol("blue")).toBe("U");
    expect(colourSymbol("Cast it")).toBeNull();
    expect(colourSymbol(null)).toBeNull();
  });

  it("puts a few short choices in a bubble, many or cards in the tray", () => {
    const few = ["One", "Two", "Three"].map((l) => option(l));
    expect(fitsBubble(few, board([]))).toBe(true);
    const many = Array.from({ length: BUBBLE_MOST + 1 }, (_, i) => option(`Choice ${i}`));
    expect(fitsBubble(many, board([]))).toBe(false);
    expect(fitsBubble([option("x".repeat(80))], board([]))).toBe(false);
    expect(fitsBubble([option("Goblin", "card:7")], board(["card:7"]))).toBe(false);
  });

  it("lists copies offering the same choices once, x N", () => {
    const names = { "card:1": "Mountain", "card:2": "Mountain", "card:3": "Shock" };
    const groups = listGroups(
      [
        option("Mountain — {T}: Add {R}.", "card:1"),
        option("Mountain — {T}: Add {R}.", "card:2"),
        option("Shock — cast", "card:3"),
      ].map((o, i) => ({ ...o, actionId: `a${i}` })),
      board(["card:1", "card:2", "card:3"], names),
    );
    expect(groups.map((g) => [g.card?.name, g.count, g.options[0]!.actionId])).toEqual([
      ["Mountain", 2, "a0"],
      ["Shock", 1, "a2"],
    ]);
  });

  it("finds the card a question's words name when the game names none", () => {
    const b = board(["card:9"], { "card:9": "Fiery Confluence" });
    const d = { about: null, prompt: "Choose a mode for Fiery Confluence." } as unknown as Decision;
    expect(sourceOf(b, d)?.id).toBe("card:9");
    expect(sourceOf(b, { ...d, prompt: "Choose a mode." })).toBeNull();
  });
});
