// @vitest-environment jsdom

// Phase 9 W-17 (Amendment 19) -- dice, rolls and the Un-set choices.

import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Decision, DiceLayout, Snapshot, SnapshotCard, SnapshotRoll } from "../match";
import { cubeTurn } from "./Die3D";
import { PASS_ANSWER, yesNo } from "./triggers";
import {
  CrankWindow,
  DiceWindow,
  DungeonWindow,
  dungeonDepth,
  dungeonWords,
  ROLL_LINGER_MS,
  RollsOverlay,
  SectorWindow,
  SprocketWindow,
  binaryTitle,
  diceWords,
  isCoinCall,
  rollWords,
} from "./DiceWindows";
import type { Geometry } from "./layout";
import type { Question } from "./interaction";

const geometry = {
  play: { x: 0, y: 0, w: 1600, h: 1000 },
  inset: 12,
  height: 1080,
} as unknown as Geometry;
const anchor = { x: 1200, y: 300, w: 120, h: 168, scale: 1, rotation: 0, z: 0 };

function card(over: Partial<SnapshotCard>): SnapshotCard {
  return {
    id: "card:1",
    art: null,
    seat: 1,
    name: "Savannah Lions",
    kind: "creature",
    types: "Creature — Cat",
    sector: null,
    sprocket: null,
    ...over,
  } as SnapshotCard;
}

function board(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seat: 1,
    battlefield: [],
    hand: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    players: [],
    ...over,
  } as unknown as Snapshot;
}

function decision(over: Record<string, unknown>): Decision {
  return {
    decisionId: 7,
    kind: "chooseDiceToReroll",
    prompt: "",
    mandatory: false,
    options: [],
    about: null,
    arrange: null,
    ...over,
  } as unknown as Decision;
}

const dice = (over: Partial<DiceLayout>): DiceLayout => ({
  how: "reroll",
  sides: 6,
  rolls: [4],
  by: [],
  price: null,
  power: null,
  toughness: null,
  ...over,
});

function common(d: Decision, b: Snapshot, onAnswer = vi.fn()) {
  return {
    decision: d,
    question: { listed: d.options, onBoard: new Map() } as unknown as Question,
    board: b,
    geometry,
    anchor,
    busy: false,
    notice: null,
    heading: "",
    passWord: "Pass",
    artUrl: (a: string) => a,
    onAnswer,
  };
}

describe("two-way choices (W-17)", () => {
  it("only a coin call is 'Call it'", () => {
    const binary = (b: string | null) => decision({ kind: "chooseBinary", arrange: { binary: b } });
    expect(binaryTitle(binary("HeadsOrTails"))).toBe("Call it");
    expect(binaryTitle(binary("IncreaseOrDecrease"))).toBe("Raise or lower the roll");
    expect(binaryTitle(binary("OddsOrEvens"))).toBe("Odd or even");
    expect(binaryTitle(binary(null))).toBeNull();
    expect(isCoinCall(binary("IncreaseOrDecrease"))).toBe(false);
    expect(isCoinCall(binary("HeadsOrTails"))).toBe(true);
  });
});

describe("the roll windows (W-17)", () => {
  it("say what passing means, name the card letting you change it and its price", () => {
    const reroll = decision({
      prompt: "You rolled 4. Choose dice to reroll, or pass.",
      arrange: {
        dice: dice({ by: [{ id: "card:9", name: "Monitor Monitor" }], price: "{1}" }),
      },
    });
    expect(diceWords(reroll)).toMatchObject({
      title: "Reroll the 4 for {1}?",
      says: "Monitor Monitor lets you reroll for {1}.",
      pass: "Keep the 4",
      main: "Reroll · {1}",
    });
    const nudge = decision({
      kind: "chooseRollToModify",
      arrange: {
        dice: dice({ how: "nudge", rolls: [6], by: [{ id: "c", name: "Xenosquirrels" }] }),
      },
    });
    expect(diceWords(nudge)).toMatchObject({ title: "Change the 6 by one?", pass: "Keep the 6" });
    expect(rollWords([1, 4, 6])).toBe("1, 4 and 6");
  });

  it("draws each roll as a 3D die to click; the pass keeps it; ignoring has no pass", () => {
    const onAnswer = vi.fn();
    const d = decision({
      kind: "chooseRollToIgnore",
      mandatory: true,
      options: [
        { actionId: "chooseRollToIgnore:0", label: "Roll: 4" },
        { actionId: "chooseRollToIgnore:1", label: "Roll: 5" },
      ] as Decision["options"],
      arrange: { dice: dice({ how: "ignore", rolls: [4, 5] }) },
    });
    const c = render(<DiceWindow {...common(d, board(), onAnswer)} />).container;
    const dies = [...c.querySelectorAll("[data-value]")];
    expect(dies.map((x) => x.getAttribute("data-value"))).toEqual(["4", "5"]);
    expect(c.querySelectorAll(".gs-die-cube .gs-die-face")).toHaveLength(12);
    fireEvent.click(c.querySelectorAll<HTMLButtonElement>(".gs-dice-pick")[1]!);
    expect(onAnswer).toHaveBeenCalledWith("chooseRollToIgnore:1");
    expect([...c.querySelectorAll("button")].some((b) => b.textContent === "Pass")).toBe(false);
  });

  it("the power-or-toughness buttons show the creature's numbers", () => {
    const onAnswer = vi.fn();
    const d = decision({
      kind: "chooseRollSwapValue",
      options: [
        { actionId: "v:0", label: "Power" },
        { actionId: "v:1", label: "Toughness" },
      ] as Decision["options"],
      arrange: {
        dice: dice({ how: "swapValue", rolls: [1], power: 5, toughness: 1 }),
      },
    });
    const c = render(<DiceWindow {...common(d, board(), onAnswer)} />).container;
    const words = [...c.querySelectorAll("button")].map((b) => b.textContent);
    expect(words).toEqual(expect.arrayContaining(["Power (5)", "Toughness (1)", "Don't swap"]));
    fireEvent.click([...c.querySelectorAll("button")].find((b) => b.textContent === "Don't swap")!);
    expect(onAnswer).toHaveBeenCalledWith(null);
  });

  it("a d20 is drawn in its own shape with its number", () => {
    const d = decision({
      options: [{ actionId: "chooseDiceToReroll:0", label: "Roll: 17" }] as Decision["options"],
      arrange: { dice: dice({ sides: 20, rolls: [17] }) },
    });
    const c = render(<DiceWindow {...common(d, board())} />).container;
    expect(c.querySelector(".gs-die-poly")!.getAttribute("aria-label")).toBe(
      "a 20-sided die showing 17",
    );
  });
});

describe("the 3D die", () => {
  it("lands on the face rolled, always turning forward with whole extra spins", () => {
    expect(cubeTurn(1, [0, 0], false)).toEqual([0, 0]);
    expect(cubeTurn(5, [0, 0], false)).toEqual([-90, 0]);
    const [x, y] = cubeTurn(3, [720, 360], true);
    expect(x).toBeGreaterThan(720);
    expect(y).toBeGreaterThan(360);
    expect(((x % 360) + 360) % 360).toBe(0);
    expect(((y % 360) + 360) % 360).toBe(270);
  });
});

describe("sectors and sprockets (W-17)", () => {
  it("each sector says who is in it, and pointing at one lights them", () => {
    const onLight = vi.fn();
    const b = board({
      battlefield: [
        card({ id: "card:1", sector: "Gamma" }),
        card({ id: "card:2", seat: 2, name: "Hill Giant", sector: "Gamma" }),
        card({ id: "card:3", sector: "Alpha" }),
      ],
    });
    const d = decision({
      kind: "chooseSector",
      mandatory: true,
      prompt: "Choose a sector.",
      options: ["Alpha", "Beta", "Gamma"].map((l, i) => ({
        actionId: `chooseSector:${i}`,
        label: l,
      })),
    });
    const c = render(<SectorWindow {...common(d, b)} onLight={onLight} />).container;
    const places = [...c.querySelectorAll(".gs-place")];
    expect(places.map((p) => p.textContent)).toEqual([
      "Alphayour Savannah Lions",
      "Betaempty",
      "Gammayour Savannah Lions, their Hill Giant",
    ]);
    fireEvent.mouseEnter(places[2]!);
    expect(onLight).toHaveBeenLastCalledWith(["card:1", "card:2"]);
  });

  it("each sprocket says when it cranks and what is on it", () => {
    const b = board({
      battlefield: [card({ id: "card:5", name: "Boomflinger", kind: "artifact", sprocket: 3 })],
    });
    const d = decision({
      kind: "chooseSprocket",
      mandatory: true,
      prompt: "Assemble Goblin Slingshot onto a sprocket.",
      options: [
        { actionId: "chooseSprocket:0", label: "Sprocket 1, cranks next turn" },
        { actionId: "chooseSprocket:1", label: "Sprocket 2" },
        { actionId: "chooseSprocket:2", label: "Sprocket 3 (1 there)" },
      ] as Decision["options"],
      arrange: { crankNext: 1 },
    });
    const c = render(<SprocketWindow {...common(d, b)} onLight={vi.fn()} />).container;
    expect([...c.querySelectorAll(".gs-place")].map((p) => p.textContent)).toEqual([
      "Sprocket 1cranks next turn · empty",
      "Sprocket 2cranks in 2 turns · empty",
      "Sprocket 3cranks in 3 turns · Boomflinger",
    ]);
  });

  it("cranking shows the Contraption and says Crank / Don't crank", () => {
    const onAnswer = vi.fn();
    const b = board({
      battlefield: [
        card({ id: "card:68", name: "Goblin Slingshot", kind: "artifact", sprocket: 3 }),
      ],
    });
    const d = decision({
      kind: "chooseContraptionsToCrank",
      prompt: "Crank which Contraptions on sprocket 3? (up to 1, or pass)",
      options: [
        { actionId: "card:68", label: "Goblin Slingshot", objectId: "card:68" },
      ] as Decision["options"],
    });
    const c = render(<CrankWindow {...common(d, b, onAnswer)} />).container;
    expect(c.textContent).toContain("Crank Goblin Slingshot?");
    expect(c.querySelector(".gs-win-bigcard")).not.toBeNull();
    fireEvent.click([...c.querySelectorAll("button")].find((x) => x.textContent === "Crank")!);
    expect(onAnswer).toHaveBeenCalledWith("card:68");
  });
});

describe("a roll on the stack (W-17)", () => {
  const roll = (n: number, source = "card:51"): SnapshotRoll => ({
    n,
    seat: 1,
    source,
    name: "Ebony Fly",
    sides: 6,
    results: [4],
  });
  const at = (id: string) =>
    id === "stack:14" || id === "card:51" ? { x: 1300, y: 200, w: 120, h: 168 } : null;

  it("tumbles beside the card that rolled while it is on the stack, then lingers and goes", () => {
    const stack = [{ id: "stack:14", source: "card:51" }];
    const arrived = new Map([[3, 1000]]);
    const draw = (now: number, onStack: boolean) =>
      render(
        <RollsOverlay
          rolls={[roll(2), roll(3)]}
          stack={onStack ? stack : []}
          since={1}
          arrived={arrived}
          now={now}
          at={at}
        />,
      ).container;
    // Only the newest roll for the card (a reroll replaces the die).
    const on = draw(1500, true);
    expect([...on.querySelectorAll("[data-roll]")].map((x) => x.getAttribute("data-roll"))).toEqual(
      ["3"],
    );
    expect(on.textContent).toContain("Ebony Fly rolled 4");
    expect(on.querySelector(".gs-roll-fading")).toBeNull();
    // Resolved: a moment more, fading, then gone.
    expect(draw(1500, false).querySelector(".gs-roll-fading")).not.toBeNull();
    expect(draw(1000 + ROLL_LINGER_MS + 700, false).querySelector("[data-roll]")).toBeNull();
  });

  it("rolls made before the page opened don't tumble", () => {
    const c = render(
      <RollsOverlay
        rolls={[roll(2)]}
        stack={[{ id: "stack:14", source: "card:51" }]}
        since={2}
        arrived={new Map()}
        now={0}
        at={at}
      />,
    ).container;
    expect(c.querySelector("[data-roll]")).toBeNull();
    act(() => {});
  });
});

describe("dungeons (Phase 9 Amendment 20)", () => {
  const lostMine = {
    name: "Lost Mine of Phandelver",
    rooms: [
      { name: "Cave Entrance", says: "Scry 1.", next: ["Goblin Lair", "Mine Tunnels"] },
      {
        name: "Goblin Lair",
        says: "Create a 1/1 red Goblin creature token.",
        next: ["Storeroom", "Dark Pool"],
      },
      {
        name: "Mine Tunnels",
        says: "Create a Treasure token.",
        next: ["Dark Pool", "Fungi Cavern"],
      },
      {
        name: "Storeroom",
        says: "Put a +1/+1 counter on target creature.",
        next: ["Temple of Dumathoin"],
      },
      {
        name: "Dark Pool",
        says: "Each opponent loses 1 life and you gain 1 life.",
        next: ["Temple of Dumathoin"],
      },
      {
        name: "Fungi Cavern",
        says: "Target creature gets -4/-0 until your next turn.",
        next: ["Temple of Dumathoin"],
      },
      { name: "Temple of Dumathoin", says: "Draw a card.", next: [] },
    ],
  };

  it("says how many rooms, how deep, and the first and last room's words", () => {
    expect(dungeonDepth(lostMine)).toBe(4);
    expect(dungeonWords(lostMine)).toBe(
      "7 rooms, 4 deep: Cave Entrance (scry 1) → … → Temple of Dumathoin (draw a card)",
    );
  });

  it("shows each dungeon with its rooms, naming the card asking", () => {
    const onAnswer = vi.fn();
    const d = decision({
      kind: "chooseSingleCardFace",
      mandatory: true,
      prompt: "Which dungeon do you want to venture into?",
      options: [{ actionId: "chooseSingleCardFace:0", label: "Lost Mine of Phandelver" }],
      arrange: { dungeons: [lostMine] },
    });
    const b = board({ stack: [{ id: "stack:1", name: "Nadaar, Selfless Paladin" }] as never });
    const c = render(<DungeonWindow {...common(d, b, onAnswer)} />).container;
    expect(c.textContent).toContain("Nadaar, Selfless Paladin");
    expect(c.querySelector(".gs-place")!.textContent).toContain("7 rooms, 4 deep");
    fireEvent.click(c.querySelector(".gs-place")!);
    expect(onAnswer).toHaveBeenCalledWith("chooseSingleCardFace:0");
  });
});

describe("a yes/no worded as one answer (Phase 9 Amendment 20)", () => {
  it("a lone 'Pay the cost' and a pass are a yes and a no", () => {
    const pair = yesNo(
      decision({
        kind: "confirmPayment",
        prompt: "Exile Grizzly Bears?",
        options: [{ actionId: "confirm:yes", label: "Pay the cost" }],
      }),
    );
    expect(pair?.yes.actionId).toBe("confirm:yes");
    expect(pair?.no.actionId).toBe(PASS_ANSWER);
    // A mandatory one-answer question is not a yes/no.
    expect(
      yesNo(
        decision({
          kind: "confirmPayment",
          mandatory: true,
          options: [{ actionId: "confirm:yes", label: "Pay the cost" }],
        }),
      ),
    ).toBeNull();
  });

  it("Mages' Contest's bid is a yes/no", () => {
    expect(
      yesNo(
        decision({
          kind: "confirmBidAction",
          options: [
            { actionId: "y", label: "Yes: Mages' Contest: top the bid?" },
            { actionId: "n", label: "No" },
          ],
        }),
      ),
    ).not.toBeNull();
  });
});
