import { describe, expect, it } from "vitest";
import type { Decision, DecisionOption, Snapshot } from "../match";
import {
  BUBBLE_MOST,
  colourSymbol,
  dialWords,
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
    casting: [],
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

  it("shows the card being cast, not another copy on the battlefield (spec 0042)", () => {
    const b = board(["card:1"], { "card:1": "Sinew Sliver" });
    (b as unknown as { casting: unknown[] }).casting = [{ id: "card:9", name: "Sinew Sliver" }];
    const d = { about: { name: "Sinew Sliver" }, prompt: null } as unknown as Decision;
    expect(sourceOf(b, d)?.id).toBe("card:9");
  });
});

// W-11 (Amendment 14): the dial's words, as the owner approved them.
describe("the dial's words", () => {
  const ask = (kind: string, number: object, extra: Partial<Decision> = {}): Decision =>
    ({
      kind,
      prompt: null,
      about: { name: "Fireball", kind: "spell", from: "hand", copy: null, copies: null },
      arrange: {
        number: {
          values: [0, 1, 2],
          canMake: null,
          keyword: null,
          each: null,
          says: null,
          ...number,
        },
      },
      ...extra,
    }) as unknown as Decision;

  it("X: the card's sentence, what can be made, and a button that casts", () => {
    const words = dialWords(
      ask("announceRequirements", { canMake: 5, says: "Fireball deals X damage." }),
      "Fireball",
      null,
    );
    expect(words.title).toBe("Choose X");
    expect(words.says).toBe("Fireball deals X damage. You can make 5 mana.");
    expect(words.button(3)).toBe("Cast Fireball with X = 3");
  });

  it("multikicker: how many times, what each time costs", () => {
    const words = dialWords(
      ask("chooseNumberForKeywordCost", { keyword: "Multikicker", each: "{2}", canMake: 5 }),
      "Everflowing Chalice",
      null,
    );
    expect(words.title).toBe("Kick it how many times?");
    expect(words.says).toBe("Each time costs {2} more. You can make 5 mana.");
    expect(words.button(0)).toBe("Cast it unkicked");
    expect(words.button(1)).toBe("Kick it 1 time");
    expect(words.button(2)).toBe("Kick it 2 times");
  });

  it("energy: how much there is", () => {
    const words = dialWords(
      ask(
        "chooseNumber",
        { says: "Harnessed Lightning deals that much damage to that creature." },
        { prompt: "amount of energy to pay" },
      ),
      "Harnessed Lightning",
      3,
    );
    expect(words.title).toBe("Pay how much energy?");
    expect(words.says).toBe(
      "Harnessed Lightning deals that much damage to that creature. You have 3.",
    );
    expect(words.button(2)).toBe("Pay 2 energy");
  });
});
