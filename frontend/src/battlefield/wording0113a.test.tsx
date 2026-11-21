// @vitest-environment jsdom

// Spec 0113 (F-0113-D, the questions, windows, trays and buttons half) --
// the new words of every W1 row page1 built, one exact assertion each.
// Pure word builders are called directly; words that only exist in a
// rendered window are read from the rendered window.

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MatchOutcome, MatchView } from "../lobby";
import type { Decision, DecisionOption, Snapshot, SnapshotCard } from "../match";
import { awayEndText } from "../match";
import {
  NameSearch,
  cancelWords,
  headingFor,
  hintFor,
  resultText,
  targetWords,
  winWords,
} from "../matchText";
import { AwayWindow } from "./AwayWindow";
import {
  DamageTray,
  DivideTray,
  HiddenZoneTray,
  tileLabel,
  OrderCardsTray,
  PilesTray,
  RowsTray,
  SplitTray,
} from "./CardTrays";
import { placeWords } from "./cardPlans";
import {
  CrankWindow,
  DiceWindow,
  ModesWindow,
  SprocketWindow,
  dungeonWords,
  modesTitle,
  diceWords,
} from "./DiceWindows";
import { Die3D } from "./Die3D";
import { discardWords } from "./discard";
import type { Question } from "./interaction";
import type { Geometry } from "./layout";
import { OpeningHand, times } from "./OpeningHand";
import { PlayLogView } from "./GameChat";
import {
  ChoiceWindow,
  ListTray,
  NameWindow,
  NumberWindow,
  chosenWords,
  dialWords,
  optionWords,
  targetsTitle,
} from "./QuestionWindows";
import { RESTING_WORDS, gameOverWords, passWords, waitingLine } from "./stops";
import { ConfirmWindow, CopyTargetWindow, OrderTray } from "./TriggerWindows";

const geometry = {
  play: { x: 0, y: 0, w: 1600, h: 1000 },
  inset: 12,
  height: 1080,
} as unknown as Geometry;
const anchor = { x: 1200, y: 300, w: 120, h: 168, scale: 1, rotation: 0, z: 0 };

function card(id: string, name: string, over: Partial<SnapshotCard> = {}): SnapshotCard {
  return {
    id,
    art: null,
    seat: 1,
    name,
    kind: "creature",
    types: "Creature — Bear",
    power: 2,
    toughness: 2,
    keywords: [],
    tapped: false,
    sick: false,
    ...over,
  } as unknown as SnapshotCard;
}

function board(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seat: 1,
    turn: 3,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    battlefield: [],
    hand: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    combat: null,
    players: [
      { seat: 1, name: "Alice", life: 20, mulligans: 0, counters: [] },
      { seat: 2, name: "Bob", life: 20, mulligans: 0, counters: [] },
    ],
    ...over,
  } as unknown as Snapshot;
}

function decision(over: Record<string, unknown>): Decision {
  return {
    decisionId: 7,
    kind: "chooseSingleEntityForEffect",
    prompt: "",
    mandatory: false,
    options: [],
    about: null,
    arrange: null,
    looking: [],
    ...over,
  } as unknown as Decision;
}

const option = (actionId: string, over: Partial<DecisionOption> = {}): DecisionOption => ({
  actionId,
  label: null,
  objectId: null,
  payable: true,
  cost: null,
  ...over,
});

function common(d: Decision, b: Snapshot) {
  return {
    decision: d,
    question: {
      listed: d.options,
      onBoard: new Map(),
      cancel: null,
      context: "choose",
      canPass: true,
    } as unknown as Question,
    board: b,
    geometry,
    anchor,
    busy: false,
    notice: null,
    heading: "Choose one",
    passWord: "Pass",
    artUrl: (a: string) => a,
    onAnswer: vi.fn(),
  };
}

const tray = (d: Decision, b: Snapshot) => ({
  decision: d,
  board: b,
  geometry,
  busy: false,
  artUrl: (a: string) => a,
  onAnswer: vi.fn(),
  onPlan: vi.fn(),
});

const text = (c: Element, sel: string) => c.querySelector(sel)?.textContent ?? null;

describe("W1 matchText: headings, hints, targets, Cancel, the result", () => {
  it("W1-001: the non-Vampire hint names the creature", () => {
    const w = targetWords(
      "Destroy target non-Vampire, non-Werewolf, non-Zombie creature.",
      "Victim of Night",
    );
    expect(w!.hint).toBe("Click a creature that isn't a Vampire, Werewolf or Zombie.");
  });
  it("W1-023: a digit count in the card's words is a number word", () => {
    expect(targetWords("Arc Trail deals 2 damage to 2 target creatures.", "Arc Trail")!.hint).toBe(
      "Click two creatures.",
    );
  });
  it("W1-357: 'copies' is made an instruction", () => {
    expect(targetWords("Twincast copies target spell.", "Twincast")!.title).toBe("Copy a spell");
  });
  it("W1-004..W1-008, W1-368: the headings", () => {
    expect(headingFor("chooseTarget")).toBe("Choose a new target");
    expect(headingFor("chooseCardsForSplice")).toBe("Splice a card onto it?");
    expect(headingFor("chooseCardsToDiscardUnlessType")).toBe("Choose a card to discard");
    expect(headingFor("choosePermanentsToSacrifice")).toBe("Choose what to sacrifice");
    expect(headingFor("choosePermanentsToDestroy")).toBe("Choose what to destroy");
    expect(headingFor("chooseFlipResult")).toBe("Choose how the coin lands");
    expect(headingFor("chooseSomeType")).toBe("Choose a type");
    expect(headingFor("chooseColor")).toBe("Choose a color");
    expect(headingFor("specifyManaCombo")).toBe("Choose the mana's colors");
    expect(headingFor("chooseProtectionType")).toBe("Choose protection");
    expect(headingFor("chooseCardName")).toBe("Name a card");
    expect(headingFor("chooseBinary")).toBe("Call it");
  });
  it("W1-010..W1-022: the hints", () => {
    expect(hintFor("chooseNumber", 0)).toBe(
      "There is nothing you can do right now. Pass to go on.",
    );
    expect(hintFor("applyManaToCost", 2)).toBe(
      "Tap a land or another mana source, or use mana you already made. Cancel (or Esc) takes back the whole spell.",
    );
    expect(hintFor("assignCombatDamage", 2)).toBe(
      "Assign the damage one point at a time. The game assigns none of it for you.",
    );
    expect(hintFor("chooseCounterType", 2)).toBe(
      "Each kind of counter does something different. You have to choose one.",
    );
    expect(hintFor("chooseModeForAbility", 2)).toBe(
      "The card does the mode you pick. If you can pass, passing means no more modes.",
    );
    expect(hintFor("chooseSingleEntityForEffect", 2)).toBe(
      "Only these can be chosen. The line above says why.",
    );
    expect(hintFor("mulliganKeepHand", 2)).toBe(
      "A mulligan draws a new hand of seven. Each time, you put one more card back.",
    );
    expect(hintFor("chooseColor", 2)).toBe(
      "Choose one of these. None of them is a card on the board.",
    );
    expect(hintFor("orderMoveToZoneList", 2)).toBe(
      "Pick them one by one, in order. You have to put them all in order.",
    );
    expect(hintFor("announceRequirements", 2)).toBe(
      "You pay for the number you choose. Bigger numbers appear when you have the mana for them.",
    );
    expect(hintFor("divideAsYouChoose", 2)).toBe(
      "Each target gets at least one. What is left goes to the targets after this one.",
    );
    expect(hintFor("chooseNumber", 2)).toBe("Choose one of these numbers. You have to choose.");
    expect(hintFor("chooseNumberForKeywordCost", 2)).toBe(
      "Each extra time costs more and does more. You can also choose None.",
    );
  });
  it("W1-046..W1-048: Cancel", () => {
    const about = { copy: null, copies: null, from: "hand" };
    expect(cancelWords({ ...about, name: "Shock", kind: "spell" })).toEqual({
      word: "Cancel Shock",
      sub: "It goes back to your hand. Nothing is spent.",
    });
    expect(cancelWords({ ...about, name: "Cave", kind: "ability" }).sub).toBe(
      "The ability is not used. Nothing is spent.",
    );
    expect(cancelWords({ ...about, name: "Wall", kind: "trigger" }).sub).toBe(
      "The trigger does nothing",
    );
  });
  it("W1-131, W1-132: who won and why, never 'The winner' or a seat", () => {
    const outcome = {
      kind: "WINNER",
      winningSeat: 1,
      concededSeat: null,
      endedOnTurn: 5,
      reason: "has won due to effect of 'Laboratory Maniac'",
    } as unknown as MatchOutcome;
    const match = {
      status: "FINISHED",
      outcome,
      participants: [{}, {}],
    } as unknown as MatchView;
    expect(resultText(match, 1)).toBe("You won on turn 5 because of Laboratory Maniac.");
    expect(resultText(match, 2)).toBe("Your opponent won on turn 5 because of Laboratory Maniac.");
    expect(
      resultText({ ...match, outcome: { ...outcome, reason: null } }, null, () => undefined),
    ).toBe("A player won on turn 5.");
    expect(winWords("Bob", "has won because all opponents have lost")).toBe(
      "Bob won because all opponents have lost",
    );
  });
  it("W1-032, W1-299: the name search", () => {
    const d = decision({
      kind: "chooseCardName",
      optionCount: 30000,
      results: { query: "zz", total: 0, options: [] },
    });
    const c = render(
      <NameSearch decision={d} disabled={false} onSearch={vi.fn()} onChoose={vi.fn()} />,
    ).container;
    fireEvent.change(c.querySelector("input")!, { target: { value: "zz" } });
    expect(c.textContent).toContain("No card has that name.");
    const d2 = decision({
      kind: "chooseCardName",
      optionCount: 30000,
      results: { query: "aa", total: 1, options: [option("name:1")] },
    });
    const c2 = render(
      <NameSearch decision={d2} disabled={false} onSearch={vi.fn()} onChoose={vi.fn()} />,
    ).container;
    fireEvent.change(c2.querySelector("input")!, { target: { value: "aa" } });
    expect(text(c2, ".actions-list button")).toBe("This name");
  });
});

describe("W1 stops.ts: the act button, the waiting line, game over", () => {
  const bolt = (targets: unknown[], players?: unknown[]) =>
    board({
      activeSeat: 2,
      stack: [{ id: "stack:1", name: "Lightning Bolt", controller: 2, targets }] as never,
      ...(players ? { players: players as never } : {}),
    });
  it("W1-034: Resolve names the target and how many more", () => {
    expect(passWords(bolt([{ player: 1 }, { player: 2 }]), 1)).toEqual({
      word: "Resolve",
      sub: "Bob’s Lightning Bolt at you (and one more)",
    });
  });
  it("W1-290: no 'Their’s'", () => {
    const b = bolt([], [{ seat: 1, name: "Alice", life: 20 }]);
    expect(passWords(b, 1).sub).toBe("Their Lightning Bolt");
    const over = board({
      players: [
        { seat: 1, name: "Alice", life: 20 },
        { seat: 2, life: -3 },
      ] as never,
    });
    const won = {
      kind: "WINNER",
      winningSeat: 1,
      concededSeat: null,
      endedOnTurn: 4,
      reason: null,
      lossReason: "LifeReachedZero",
    } as unknown as MatchOutcome;
    expect(gameOverWords(over, 1, won).sub).toBe("Their life fell to -3");
  });
  it("W1-035: the attackers coming", () => {
    const b = board({
      activeSeat: 2,
      phase: "COMBAT_DECLARE_ATTACKERS",
      battlefield: [
        card("card:1", "Hill Giant", { seat: 2, attacking: true, power: 3 }),
        card("card:2", "Bear", { seat: 2, attacking: true, power: 2 }),
      ],
    });
    expect(passWords(b, 1)).toEqual({
      word: "To blocks",
      sub: "Two attackers with 5 power coming",
    });
  });
  it("W1-036: nothing can attack", () => {
    expect(passWords(board(), 1)).toEqual({
      word: "Next",
      sub: "Nothing can attack. On to Main 2.",
    });
  });
  it("W1-356: Pat goes on to attack", () => {
    expect(passWords(board({ activeSeat: 2, phase: "COMBAT_BEGIN" }), 1).sub).toBe(
      "Bob goes on to attack",
    );
  });
  it("W1-037: resting on the stack", () => {
    expect(RESTING_WORDS).toBe("Resolving. Nobody can respond.");
    const b = board({
      stack: [{ id: "stack:1", name: "Bear", controller: 1, rest: true }] as never,
    });
    expect(waitingLine(b, 1, { seat: null }, null, false, true)).toEqual({
      word: "One moment",
      sub: "Resolving. Nobody can respond.",
      seat: null,
    });
  });
  it("W1-038: mulliganed three times", () => {
    const b = board({
      turn: 0,
      players: [
        { seat: 1, name: "Alice", life: 20, mulligans: 0 },
        { seat: 2, name: "Bob", life: 20, mulligans: 3 },
      ] as never,
    });
    expect(waitingLine(b, 1, { seat: 2 }, 2, false).sub).toBe("Mulliganed three times");
  });
  it("W1-039: the step, a comma, whose turn", () => {
    expect(waitingLine(board(), 1, { seat: 2 }, 2, false).sub).toBe("Main 1, your turn");
  });
  it("W1-125..W1-130: why the loser lost, as a sentence", () => {
    const lost = (lossReason: string, mySeat = 1) =>
      gameOverWords(board(), mySeat, {
        kind: "WINNER",
        winningSeat: 1,
        concededSeat: null,
        endedOnTurn: 4,
        reason: null,
        lossReason,
      }).sub;
    expect(lost("Milled")).toBe("Bob had to draw from an empty library");
    expect(lost("LifeReachedZero")).toBe("Bob’s life reached zero");
    expect(lost("Poisoned")).toBe("Bob got ten poison counters");
    expect(lost("CommanderDamage")).toBe("Bob took 21 damage from one commander");
    expect(lost("SpellEffect")).toBe("Bob lost because of a card");
    expect(lost("OpponentWon")).toBe("Bob lost because a card made their opponent win");
    expect(lost("OpponentWon", 2)).toBe("You lost because a card made your opponent win");
  });
  it("W1-131: game over with Forge's reason", () => {
    const won = {
      kind: "WINNER",
      winningSeat: 1,
      concededSeat: null,
      endedOnTurn: 4,
      reason: "has won due to effect of 'Laboratory Maniac'",
    } as unknown as MatchOutcome;
    expect(gameOverWords(board(), 2, won).sub).toBe("Alice won because of Laboratory Maniac");
    expect(gameOverWords(board(), 1, won).sub).toBe("You won because of Laboratory Maniac");
  });
});

describe("W1 discard.ts", () => {
  it("W1-049..W1-051: counts in words", () => {
    expect(discardWords([], 2)).toEqual({
      word: "Discard two",
      sub: "Click two cards to pick them",
      ready: false,
    });
    expect(discardWords(["Shock"], 2).sub).toBe("One picked. Click one more.");
    expect(discardWords(["Shock", "Bolt"], 2).word).toBe("Discard two cards");
  });
});

describe("W1 QuestionWindows: targets, the dial, the lists", () => {
  const asked = (chosen: string[], more: number, enough = true) =>
    decision({
      kind: "chooseTargetsFor",
      arrange: { targets: { chosen, enough, more, cancel: "target:cancel" } },
    });
  const table = board({ battlefield: [card("card:7", "Hill Giant")] });
  it("W1-009 (and the 0109 note): how many more, in words", () => {
    expect(targetsTitle(asked(["card:7"], 1), "Choose a target")).toBe(
      "Choose up to one more target",
    );
    expect(targetsTitle(asked(["card:7"], 2), "Choose a target")).toBe(
      "Choose up to two more targets",
    );
  });
  it("W1-024, W1-026: chosen so far; never 'Seat 3'", () => {
    expect(chosenWords(asked(["player:2", "card:7"], 1), table)).toBe(
      "Chosen so far: Bob and Hill Giant",
    );
    expect(chosenWords(asked(["player:3"], 1), table)).toBe("Chosen so far: the other player");
  });
  it("W1-025: Done with two targets", () => {
    const d = asked(["player:2", "card:7"], 1);
    const c = render(<ChoiceWindow {...common(d, table)} />).container;
    expect(text(c, ".gs-targets-done")).toBe("Done with two targets");
    const none = render(<ChoiceWindow {...common(asked([], 1), table)} />).container;
    expect(text(none, ".gs-targets-done")).toBe("Done with no target");
  });
  it("W1-027, W1-028: the list's hidden card prefix and its line", () => {
    const cave = card("card:5", "Forgotten Cave", { kind: "land", types: "Land" });
    const d = decision({
      kind: "chooseSpellAbilityToPlay",
      prompt: null,
      options: [
        option("play:1", { objectId: "card:5", label: "Forgotten Cave · Cycling {R}" }),
        option("play:2", { objectId: "card:5", label: "Forgotten Cave · Play it", payable: false }),
      ],
    });
    const c = render(
      <ListTray {...common(d, board({ battlefield: [cave] }))} onClose={vi.fn()} />,
    ).container;
    // W1-027 (lead): the card and its option, two facts on one button: " · " kept.
    expect(text(c, ".gs-win-option-card")).toBe("Forgotten Cave · ");
    expect(c.textContent).toContain("Dimmed ones can't be paid for right now.");
    expect(text(c, ".gs-win-from")).toBe("Two choices");
  });
  it("W1-029 (kept), W1-030, W1-296, W1-297: the dial's words", () => {
    const ask = (kind: string, number: Record<string, unknown>, over = {}) =>
      decision({ kind, arrange: { number: { values: [0, 1, 2], ...number } }, ...over });
    const x = dialWords(ask("announceRequirements", { canMake: 3 }), "Fireball", null);
    expect(x.says).toBe("You can make three mana.");
    expect(x.button(3)).toBe("Cast Fireball with X = 3");
    const kick = dialWords(
      ask("chooseNumberForKeywordCost", { keyword: "Multikicker", canMake: null }),
      "Chalice",
      null,
    );
    expect(kick.button(2)).toBe("Kick it twice");
    expect(
      dialWords(ask("chooseNumberForKeywordCost", { keyword: "Buyback" }), "It", null).button(3),
    ).toBe("Pay it three times");
    const energy = dialWords(
      ask("chooseNumber", {}, { prompt: "amount of energy to pay" }),
      "Harnessed Lightning",
      3,
    );
    expect(energy.says).toBe("You have three energy.");
    expect(energy.button(2)).toBe("Pay two energy");
  });
  it("W1-031: more than you can pay, in one sentence", () => {
    const d = decision({
      kind: "chooseNumber",
      options: [option("n:0", { payable: false, cost: "{3}" })],
      arrange: { number: { values: [3], canMake: 1, says: null } },
    });
    const c = render(<NumberWindow {...common(d, board())} />).container;
    expect(text(c, ".gs-dial-over")).toBe(", which is more than you can pay now");
    expect(text(c, ".gs-dial-cost")!.startsWith("Costs ")).toBe(true);
  });
  it("W1-032: the name window", () => {
    const d = decision({
      kind: "chooseCardName",
      arrange: { name: { title: "Name a card", says: null, objects: [] } },
      results: { query: "zz", total: 0, options: [] },
    });
    const c = render(
      <NameWindow {...common(d, board())} onSearch={vi.fn()} naming={null} />,
    ).container;
    fireEvent.change(c.querySelector("input")!, { target: { value: "zz" } });
    expect(c.textContent).toContain("No card has that name.");
  });
  it("W1-298: an option with no words is 'This choice', never its id", () => {
    expect(optionWords(option("choose:7"), null)).toBe("This choice");
  });
});

describe("W1 TriggerWindows", () => {
  const goblin = (n: number, targets: unknown[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      id: `stack:${i}`,
      name: "Goblin Arsonist",
      kind: "trigger",
      controller: 1,
      description: "Goblin Arsonist deals 1 damage to any target.",
      targets,
    }));
  const confirm = (kind: string, b: Snapshot) => {
    const d = decision({
      kind,
      about: { name: "Goblin Arsonist", kind: "trigger" },
      options: [option("yes", { label: "Yes" }), option("no", { label: "No" })],
    });
    return render(
      <ConfirmWindow
        decision={d}
        board={b}
        anchor={anchor}
        geometry={geometry}
        busy={false}
        artUrl={(a) => a}
        onAnswer={vi.fn()}
        onYesToAll={vi.fn()}
        onSkipAll={vi.fn()}
      />,
    ).container;
  };
  it("W1-052, W1-054, W1-057: seven copies, Yes to all seven, at the other player", () => {
    const c = confirm("confirmTrigger", board({ stack: goblin(7, [{ player: 3 }]) as never }));
    expect(text(c, ".gs-win-from")).toBe("Goblin Arsonist: seven copies on the stack");
    expect(c.textContent).toContain("Yes to all seven");
    expect(text(c, ".gs-win-target")).toBe("At the other player");
  });
  it("W1-053: Skip all seven", () => {
    const c = confirm("confirmPayment", board({ stack: goblin(7) as never }));
    expect(c.textContent).toContain("Skip all seven");
  });
  it("W1-055, W1-056, W1-301, W1-358: the copy's target window", () => {
    const d = decision({
      kind: "chooseTargetsFor",
      prompt: "Goblin Arsonist deals 1 damage to any target.",
      about: { name: "Goblin Arsonist", kind: "trigger", copy: 1, copies: 7 },
      options: [option("t:1", { objectId: "player:1" }), option("t:2", { objectId: "card:9" })],
    });
    const c = render(
      <CopyTargetWindow
        decision={d}
        board={board()}
        anchor={anchor}
        geometry={geometry}
        busy={false}
        same
        artUrl={(a) => a}
        onSame={vi.fn()}
        onAnswer={vi.fn()}
      />,
    ).container;
    expect(text(c, ".gs-win-from")).toBe("Goblin Arsonist: trigger one of seven");
    expect(text(c, ".gs-win-check")).toBe("Same target for all seven");
    expect([...c.querySelectorAll(".gs-win-chip")].map((b) => b.textContent)).toEqual([
      "You",
      "This choice",
    ]);
  });
  it("W1-058, W1-059: the order tray", () => {
    const d = decision({
      kind: "orderSimultaneousAbilities",
      options: [
        option("o:1", { label: "Soul Warden: gain 1 life" }),
        option("o:2", { label: "Ajani's Pridemate: put a counter" }),
        option("o:3", { label: "Goblin Arsonist: deal 1 damage" }),
      ],
    });
    const c = render(
      <OrderTray
        decision={d}
        board={board()}
        geometry={geometry}
        busy={false}
        artUrl={(a) => a}
        onDone={vi.fn()}
      />,
    ).container;
    expect(text(c, ".gs-win-from")).toBe("Three triggers at once");
    expect(text(c, ".gs-win-prompt")).toBe(
      "They are numbered in a sensible order: damage first, payments last. Click Done, or click them in your own order. The first one you click resolves first.",
    );
  });
});

describe("W1 CardTrays and cardPlans", () => {
  const lib = [card("card:1", "Island"), card("card:2", "Forest"), card("card:3", "Swamp")];
  const asking = (kind: string, arrange: Record<string, unknown>, over = {}) =>
    decision({
      kind,
      looking: lib,
      options: lib.map((c) => option(`pick:${c.id}`, { objectId: c.id, label: c.name })),
      arrange,
      ...over,
    });
  it("W1-060, W1-063: to the graveyard in order; only you can see these", () => {
    const c = render(
      <OrderCardsTray {...tray(asking("orderMoveToZoneList", { to: "graveyard" }), board())} />,
    ).container;
    expect(text(c, ".gs-win-title")).toBe("Choose the order they go to your graveyard");
    expect(text(c, ".gs-win-from")).toBe("Only you can see these");
  });
  it("W1-061, W1-062: the bottom prompts", () => {
    const bottom = (first: string) =>
      render(
        <OrderCardsTray
          {...tray(asking("orderMoveToZoneList", { to: "bottom", first }), board())}
        />,
      ).container;
    expect(text(bottom("bottom"), ".gs-win-prompt")).toBe(
      "Click them in order: 1 goes to the very bottom. Or click Any order. Click a numbered card to take it back.",
    );
    expect(text(bottom("top"), ".gs-win-prompt")).toBe(
      "Click them in order: 1 ends up nearest the top. Or click Any order. Click a numbered card to take it back.",
    );
  });
  it("W1-064: where a numbered card ends up", () => {
    expect(placeWords(1, "top", "top")).toBe("Second from the top");
    expect(placeWords(1, "bottom", "bottom")).toBe("Second from the bottom");
    expect(placeWords(0, "bottom", "top")).toBe("Nearest the top");
    expect(placeWords(1, "bottom", "top")).toBe("Second down");
    expect(placeWords(1, null, null)).toBe("Second");
  });
  it("W1-065, W1-066: the scry tray", () => {
    const c = render(<RowsTray {...tray(asking("arrangeForScry", {}), board())} />).container;
    expect(text(c, ".gs-win-prompt")).toBe(
      "Click a card to move it to the other row. In the top row, card 1 is drawn first. Click Sooner to move a card up.",
    );
    expect(c.textContent).toContain("Top of library, in draw order");
  });
  it("W1-067: no full stop in the hand tray's title", () => {
    const d = asking("chooseSingleEntityForEffect", { zone: "hand", owner: 2 });
    const c = render(<HiddenZoneTray {...tray(d, board())} />).container;
    expect(text(c, ".gs-win-title")).toBe("Look at Bob’s hand");
  });
  it("W1-302: a hidden zone tile's spoken name (lead)", () => {
    expect(tileLabel("Island", 3, "can't be chosen")).toBe("Island, three copies, can't be chosen");
    expect(tileLabel("Island", 1, null)).toBe("Island");
  });
  it("W1-068: a split pile's label", () => {
    const c = render(<SplitTray {...tray(asking("chooseCardsPile", {}), board())} />).container;
    expect([...c.querySelectorAll(".gs-win-row-name")].map((r) => r.textContent)).toContain(
      "Pile 1: three cards",
    );
  });
  it("W1-069, W1-361: a pile to choose", () => {
    const d = asking("chooseCardsPile", {
      piles: [
        { cards: ["card:1", "card:2"], count: 3 },
        { cards: ["card:3"], count: 1 },
      ],
    });
    const c = render(<PilesTray {...tray(d, board())} />).container;
    expect(text(c, ".gs-win-row-name")).toBe("Pile 1: three cards, one face down");
  });
  it("W1-070..W1-072: the damage tray", () => {
    const fight = (trample: boolean) =>
      decision({
        kind: "assignCombatDamage",
        options: [],
        arrange: {
          damage: {
            damage: 6,
            attacker: "card:9",
            blockers: [{ card: "card:1", lethal: 2 }],
            trample,
            divides: false,
          },
        },
      });
    const b = board({
      battlefield: [card("card:1", "Bear", { seat: 2 }), card("card:9", "Giant", { power: 6 })],
    });
    const t = render(<DamageTray {...tray(fight(true), b)} />).container;
    expect(text(t, ".gs-win-prompt")).toBe(
      "Already filled in: enough to destroy each blocker, the rest to the player (trample). Use + and − to change it.",
    );
    const n = render(<DamageTray {...tray(fight(false), b)} />).container;
    expect(text(n, ".gs-win-prompt")).toBe(
      "Already filled in: enough to destroy each blocker in order, the rest to the last one. Use + and − to change it.",
    );
  });
  it("W1-073: the divide tray", () => {
    const d = decision({
      kind: "divideAsYouChoose",
      arrange: {
        divide: {
          total: 3,
          what: "damage",
          targets: [
            { object: "card:1", lethal: 2 },
            { object: "card:2", lethal: 2 },
          ],
          at: 0,
          values: [1, 2],
        },
      },
    });
    const c = render(
      <DivideTray
        {...tray(d, board({ battlefield: [card("card:1", "Bear"), card("card:2", "Elf")] }))}
      />,
    ).container;
    expect(text(c, ".gs-win-prompt")).toBe(
      "Each target gets at least one. Use + and − to change it.",
    );
  });
});

describe("W1 DiceWindows and Die3D", () => {
  const dice = (over: Record<string, unknown>) => ({
    how: "reroll",
    sides: 6,
    rolls: [4],
    by: [],
    price: null,
    power: null,
    toughness: null,
    roller: null,
    ...over,
  });
  it("W1-074: Reroll for {1}", () => {
    expect(
      diceWords(decision({ kind: "chooseDiceToReroll", arrange: { dice: dice({ price: "{1}" }) } }))
        .main,
    ).toBe("Reroll for {1}");
  });
  it("W1-075, W1-306, W1-360: the die's caption, its spoken words, no '(?)'", () => {
    const d = decision({
      kind: "chooseRollSwapValue",
      options: [option("s:p", { label: "Power" }), option("s:t", { label: "Toughness" })],
      arrange: { dice: dice({ how: "swapValue", power: 3 }) },
    });
    const c = render(<DiceWindow {...common(d, board())} />).container;
    expect(text(c, ".gs-dice-pick > span:last-child")).toBe("your roll of 4");
    expect([...c.querySelectorAll("button.gs-option")].map((b) => b.textContent)).toEqual([
      "Power (3)",
      "Toughness",
    ]);
    const die = render(<Die3D value={4} sides={6} size={52} roll={1} />).container;
    expect(die.querySelector("[aria-label]")!.getAttribute("aria-label")).toBe(
      "a six-sided die showing 4",
    );
  });
  it("W1-076, W1-077: the sprocket window", () => {
    const d = decision({
      kind: "chooseSprocket",
      prompt: "Assemble Boomflinger onto a sprocket",
      options: [
        option("s:1", { label: "Sprocket 1" }),
        option("s:2", { label: "Sprocket 2" }),
        option("s:3", { label: "Sprocket 3" }),
      ],
      arrange: { crankNext: 1 },
    });
    const c = render(<SprocketWindow {...common(d, board())} onLight={vi.fn()} />).container;
    expect(c.textContent).toContain("cranks in two turns");
    expect(c.textContent).toContain(
      "On each of your turns, one sprocket cranks: 1, then 2, then 3, then 1 again.",
    );
  });
  it("W1-078, W1-079: the crank window", () => {
    const gadget = (id: string, name: string) =>
      card(id, name, { kind: "artifact", types: "Artifact — Contraption", sprocket: 1 });
    const b = board({
      battlefield: [gadget("card:1", "Boomflinger"), gadget("card:2", "Gift Maker")],
    });
    const crank = (ids: string[]) =>
      render(
        <CrankWindow
          {...common(
            decision({
              kind: "chooseContraptionsToCrank",
              options: ids.map((id) => option(`c:${id}`, { objectId: id })),
              arrange: { crankNext: 1 },
            }),
            b,
          )}
        />,
      ).container;
    expect(crank(["card:1"]).textContent).toContain(
      "When cranked, it does what it says right away.",
    );
    expect(crank(["card:1", "card:2"]).textContent).toContain(
      "Click each one you want to crank, then click Don't crank for the rest.",
    );
  });
  it("W1-080: a dungeon in words", () => {
    const room = (name: string, says: string, next: string[]) => ({ name, says, next });
    expect(
      dungeonWords({
        name: "Tomb",
        rooms: [
          room("Yawning Portal", "Gain 1 life.", ["Dungeon Level"]),
          room("Dungeon Level", "Scry 1.", ["Goblin Bazaar"]),
          room("Goblin Bazaar", "Create a Treasure token.", ["Throne of the Dead Three"]),
          room("Throne of the Dead Three", "Reveal the top ten cards.", []),
        ],
      }),
    ).toBe(
      "Four rooms, four deep: Yawning Portal (gain 1 life) to Throne of the Dead Three (reveal the top ten cards)",
    );
  });
  it("W1-081..W1-084: the modes window's title and button", () => {
    const modes = {
      num: 2,
      min: 2,
      repeat: false,
      budget: null,
      spent: null,
      chosen: [],
      paws: [],
      escalate: null,
    };
    expect(modesTitle({ ...modes, budget: 5, repeat: true }, 0, 3)).toBe(
      "Choose modes: 3 of 5 paw prints used",
    );
    expect(modesTitle(modes, 1, 0)).toBe("Choose two (one chosen)");
    expect(modesTitle({ ...modes, num: 3, min: 1 }, 2, 0)).toBe("Choose one to three (two chosen)");
    const d = decision({
      kind: "chooseModeForAbility",
      options: [
        option("m:1", { label: "Draw a card." }),
        option("m:2", { label: "Gain 2 life." }),
        option("m:3", { label: "Scry 2." }),
      ],
      arrange: { modes },
    });
    const c = render(<ModesWindow {...common(d, board())} onDone={vi.fn()} />).container;
    fireEvent.click(c.querySelector(".gs-mode")!);
    expect(text(c, ".gs-modes-done")).toBe("Pick one more");
  });
  it("W1-085: a Season mode's paw prints in brackets", () => {
    const d = decision({
      kind: "chooseModeForAbility",
      options: [option("m:1", { label: "Draw a card." })],
      arrange: {
        modes: {
          num: 5,
          min: 0,
          repeat: true,
          budget: 5,
          spent: 0,
          chosen: [],
          paws: [2],
          escalate: null,
        },
      },
    });
    const c = render(<ModesWindow {...common(d, board())} onDone={vi.fn()} />).container;
    expect(text(c, ".gs-mode-words small")).toBe(" (2 paw prints)");
  });
});

describe("W1 the opening hand, the away window", () => {
  it("W1-086: times in words", () => {
    expect([1, 2, 3].map(times)).toEqual(["once", "twice", "three times"]);
  });
  it("W1-133..W1-135: away words", () => {
    expect(awayEndText("NOT_AWAY", "Pat")).toBe(
      "Pat is back, or hasn't been gone ten minutes yet.",
    );
    const c = render(
      <AwayWindow
        name="Pat"
        face={null}
        minutes={10}
        note={null}
        sent={false}
        onWait={vi.fn()}
        onEnd={vi.fn()}
      />,
    ).container;
    expect(c.textContent).toContain("Pat has been gone ten minutes");
    expect(c.textContent).toContain("End the game. You win.");
  });
});

describe("W1 the opening hand window", () => {
  const hand = [
    card("card:1", "Island", { kind: "land", types: "Basic Land — Island" }),
    card("card:2", "Forest", { kind: "land", types: "Basic Land — Forest" }),
    card("card:3", "Swamp", { kind: "land", types: "Basic Land — Swamp" }),
    card("card:4", "Bear"),
    card("card:5", "Elf"),
    card("card:6", "Giant"),
    card("card:7", "Shock", { kind: "instant", types: "Instant" }),
  ];
  const opening = (d: Decision, mulligans: number) =>
    render(
      <OpeningHand
        area={{ x: 0, w: 1600, h: 1000 }}
        decision={d}
        board={board({
          turn: 0,
          hand,
          players: [
            { seat: 1, name: "Alice", life: 20, mulligans, counters: [] },
            { seat: 2, name: "Bob", life: 20, mulligans: 3, counters: [] },
          ] as never,
        })}
        busy={false}
        artUrl={(a) => a}
        onAnswer={vi.fn()}
        onPutBack={vi.fn()}
        onBegin={vi.fn()}
      />,
    ).container;
  it("W1-086..W1-089: keep or mulligan", () => {
    const c = opening(
      decision({
        kind: "mulliganKeepHand",
        options: [option("mulligan:keep"), option("mulligan:again")],
      }),
      0,
    );
    expect(text(c, ".gs-opening-line")).toBe(
      "Seven cards, three lands. Bob mulliganed three times.",
    );
    const buttons = [...c.querySelectorAll(".gs-opening-button")].map((b) => b.textContent);
    expect(buttons[0]).toBe("Keep these seven");
    expect(buttons[1]).toContain("Draw seven again and put one back");
  });
  it("W1-090, W1-091: the cards to put back", () => {
    const d = decision({
      kind: "tuckCardsViaMulligan",
      prompt: "Choose cards to put on the bottom (2 to go)",
      options: hand.map((h) => option(`tuck:${h.id}`, { objectId: h.id })),
    });
    const c = opening(d, 2);
    expect(text(c, ".gs-opening-title")).toBe("Put two cards back");
    expect(text(c, ".gs-opening-line")).toBe(
      "Click the cards that go to the bottom of your library. Two more to go.",
    );
  });
  it("W1-092, W1-093: keep these five", () => {
    const d = decision({
      kind: "tuckCardsViaMulligan",
      prompt: "Choose cards to put on the bottom (2 to go)",
      options: hand.map((h) => option(`tuck:${h.id}`, { objectId: h.id })),
    });
    const c = opening(d, 2);
    const cards = c.querySelectorAll<HTMLButtonElement>(".gs-opening-card");
    fireEvent.click(cards[0]!);
    fireEvent.click(cards[1]!);
    const button = c.querySelector(".gs-opening-button")!.textContent;
    expect(button).toContain("Keep these five");
    expect(button).toContain("The two you picked go to the bottom");
  });
  it("W1-094: begin with two in play", () => {
    const d = decision({
      kind: "chooseSaToActivateFromOpeningHand",
      options: hand.map((h) => option(`opening:${h.id}`, { objectId: h.id })),
    });
    const c = opening(d, 0);
    const cards = c.querySelectorAll<HTMLButtonElement>(".gs-opening-card");
    fireEvent.click(cards[0]!);
    fireEvent.click(cards[1]!);
    expect(text(c, ".gs-opening-button")).toBe("Begin with two in play");
  });
});

describe("W1 the play log's turn line", () => {
  it("W1-138: Turn 3, Bob (your turn)", () => {
    const c = render(
      <PlayLogView
        lines={
          [
            {
              n: 1,
              rev: 1,
              turn: 3,
              active: 1,
              step: "Main 1",
              kind: "cast",
              parts: [{ text: "Bob cast a spell." }],
            },
          ] as never
        }
        nameOf={(seat) => (seat === 1 ? "Bob" : "Pat")}
        mySeat={1}
        onInspect={() => false}
      />,
    ).container;
    expect(text(c, ".gs-log-head")).toBe("Turn 3, Bob(your turn)");
  });
  it("a comma or 's after a name stays on the name's line", () => {
    const c = render(
      <PlayLogView
        lines={
          [
            {
              n: 1,
              rev: 1,
              turn: 1,
              active: 1,
              step: "Main 1",
              kind: "draw",
              parts: [
                { player: 1 },
                " drew ",
                { name: "Swamp" },
                ", ",
                { name: "Swamp" },
                " and ",
                { name: "Swamp" },
                ". ",
                { name: "Weaponcraft Enthusiast" },
                "'s ability triggered",
              ],
            },
          ] as never
        }
        nameOf={() => "Pat"}
        mySeat={1}
        onInspect={() => false}
      />,
    ).container;
    const glued = [...c.querySelectorAll(".gs-log-glue")].map((g) => g.textContent);
    expect(glued).toEqual(["Swamp,", "Swamp.", "Weaponcraft Enthusiast's"]);
    expect(text(c, ".gs-log-text")).toBe(
      "Pat drew Swamp, Swamp and Swamp. Weaponcraft Enthusiast's ability triggered",
    );
  });
});
