// @vitest-environment jsdom

// Spec 0057 -- windows by the card asking, plainer words, Peek footers
// (F-0057-B, C, D, E, F, H).

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision, DecisionOption, Snapshot, SnapshotCard, SnapshotReveal } from "../match";
import { Board } from "./Board";
import { CastingFlight, docks, heldSpot } from "./CastingCard";
import { ActionPopup, askingCardAnchor, Inspect, StackInspect, ZoneViewer } from "./GameScreen";
import { Bubble, anchorByCard, bubbleBox } from "./GameWindow";
import type { Question } from "./interaction";
import { geometry as layoutGeometry, type Box, type Geometry } from "./layout";
import { RevealTray } from "./RevealTray";
import { StatusTray } from "./StatusTray";
import { ConfirmWindow } from "./TriggerWindows";

const geometry = {
  play: { x: 0, y: 0, w: 1600, h: 1000 },
  inset: 12,
  height: 1080,
  cardW: 100,
  cardH: 140,
} as unknown as Geometry;

const box = (x: number, y: number, w = 100, h = 140): Box => ({
  x,
  y,
  w,
  h,
  scale: 1,
  rotation: 0,
  z: 0,
});

function card(over: Partial<SnapshotCard>): SnapshotCard {
  return {
    id: "card:1",
    art: null,
    seat: 1,
    name: "Elvish Eulogist",
    tapped: false,
    faceDown: false,
    known: true,
    kind: "creature",
    types: "Creature — Elf Shaman",
    power: 1,
    toughness: 1,
    manaCost: "{G}",
    damage: 0,
    sick: false,
    attacking: false,
    blocking: false,
    counters: [],
    keywords: [],
    text: "",
    ...over,
  } as unknown as SnapshotCard;
}

function board(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seat: 1,
    battlefield: [],
    hand: [],
    graveyard: [],
    exile: [],
    otherHands: [],
    stack: [],
    casting: [],
    players: [{ seat: 1, name: "Pat" }],
    ...over,
  } as unknown as Snapshot;
}

function decision(over: Record<string, unknown>): Decision {
  return {
    decisionId: 7,
    kind: "confirmPayment",
    prompt: "",
    mandatory: false,
    options: [],
    about: null,
    arrange: null,
    ...over,
  } as unknown as Decision;
}

const question = (onBoard: string[] = []) =>
  ({ listed: [], onBoard: new Map(onBoard.map((id) => [id, []])) }) as unknown as Question;

// --- item 2: Peek footers ------------------------------------------------------------------

describe("every window's Peek says 'or hold Space' (F-0057-C)", () => {
  const hint = (c: Element) => {
    const foot = c.querySelector(".gs-peek-foot");
    expect(foot).not.toBeNull();
    const peek = foot!.querySelector(".gs-win-peek-hint")!;
    expect(peek.querySelector(".gs-peek-btn")).not.toBeNull();
    expect(peek.querySelector(".gs-peek-or")!.textContent).toBe("or hold Space");
    return foot!;
  };

  it("the revealed cards: Peek on the left, Close on the right", () => {
    const reveal: SnapshotReveal = {
      key: "reveal:1",
      title: "Goblin Ringleader revealed:",
      cards: [card({ id: "revealed:1:0", name: "Goblin Piker" })],
    };
    const c = render(
      <RevealTray
        reveal={reveal}
        geometry={geometry}
        atTop={false}
        artUrl={(a) => a}
        onClose={vi.fn()}
      />,
    ).container;
    const foot = hint(c);
    // Close is in the footer's right half, not beside Peek.
    expect(foot.querySelector(".gs-peek-foot-buttons .gs-reveal-close")!.textContent).toBe("Close");
    expect(c.querySelector(".gs-reveal-head .gs-peek-btn")).toBeNull();
  });

  it("a card's close-up and a stack card's", () => {
    const b = board({
      battlefield: [card({})],
      stack: [
        {
          id: "stack:1",
          description: "Lightning Bolt deals 3 damage",
          source: null,
          name: "Lightning Bolt",
          controller: 1,
          kind: "spell",
          targets: [],
          art: null,
        },
      ] as never,
    });
    const one = render(
      <Inspect
        card={card({})}
        name="Elvish Eulogist"
        costNow={null}
        artUrl={(a) => a}
        board={b}
        mySeat={1}
        onClose={vi.fn()}
      />,
    ).container;
    expect(hint(one).querySelector(".gs-peek-foot-buttons")!.textContent).toBe("Close");
    const two = render(
      <StackInspect board={b} id="stack:1" mySeat={1} artUrl={(a) => a} onClose={vi.fn()} />,
    ).container;
    expect(hint(two).querySelector(".gs-peek-foot-buttons")!.textContent).toBe("Close");
  });

  it("a graveyard opened: the hint at the foot, clear of the close", () => {
    const b = board({ graveyard: [card({ id: "card:9", name: "Llanowar Elves" })] });
    const c = render(
      <ZoneViewer
        board={b}
        seat={1}
        zone="graveyard"
        mySeat={1}
        artUrl={(a) => a}
        onZone={vi.fn()}
        onInspect={vi.fn()}
        onClose={vi.fn()}
      />,
    ).container;
    hint(c);
    expect(c.querySelector(".gs-ztray-head .gs-peek-btn")).toBeNull();
  });

  it("the status tray's list", () => {
    const c = render(
      <StatusTray
        player={{
          seat: 1,
          name: "Pat",
          life: 20,
          handCount: 7,
          libraryCount: 40,
          graveyardCount: 0,
          counters: [],
          designations: [],
          command: ["Chandra emblem"],
          ringTempted: 0,
          dungeonsCompleted: [],
          manaPool: {},
        }}
        side="viewer"
      />,
    ).container;
    fireEvent.click(c.querySelector(".gs-chip-zone")!);
    expect(hint(c).querySelector(".gs-peek-foot-buttons")!.textContent).toBe("Close");
  });
});

// --- item 3: a cost you chose to pay ------------------------------------------------------

describe("a chosen cost: the effect, 'Cancel' and the action (F-0057-D)", () => {
  const eulogist = decision({
    prompt: "Sacrifice Elvish Eulogist?",
    options: [{ actionId: "confirm:yes", label: "Pay the cost" }],
    about: {
      name: "Elvish Eulogist",
      kind: "ability",
      from: null,
      copy: null,
      copies: null,
      card: "card:1",
      act: "Sacrifice",
      effect: "You gain 1 life for each Elf card in your graveyard.",
    },
  });

  it("asks once, says what it does, and its buttons are Cancel and Sacrifice", () => {
    const onAnswer = vi.fn();
    const c = render(
      <ConfirmWindow
        decision={eulogist}
        board={board({ battlefield: [card({})] })}
        anchor={box(400, 500)}
        geometry={geometry}
        busy={false}
        artUrl={(a) => a}
        onAnswer={onAnswer}
        onYesToAll={vi.fn()}
        onSkipAll={vi.fn()}
      />,
    ).container;
    expect(c.querySelector(".gs-win-title")!.textContent).toBe("Sacrifice Elvish Eulogist?");
    // The question is not said twice: the line is the effect.
    expect(c.textContent!.split("Sacrifice Elvish Eulogist?").length - 1).toBe(1);
    expect(c.querySelector(".gs-cost-effect")!.textContent).toBe(
      "You gain 1 life for each Elf card in your graveyard.",
    );
    const buttons = [...c.querySelectorAll(".gs-win-actions > button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Cancel", "Sacrifice"]);
    fireEvent.click(c.querySelector(".gs-cost-act")!);
    expect(onAnswer).toHaveBeenCalledWith("confirm:yes");
  });

  it("a trigger's own 'you may pay' is still Skip and Pay", () => {
    const c = render(
      <ConfirmWindow
        decision={decision({
          prompt: "Pay {2}{R} for Skirk Drill Sergeant?",
          options: [
            { actionId: "confirm:yes", label: "Yes, pay {2}{R} for Skirk Drill Sergeant" },
            { actionId: "confirm:no", label: "No" },
          ],
          about: {
            name: "Skirk Drill Sergeant",
            kind: "trigger",
            from: null,
            copy: null,
            copies: null,
          },
        })}
        board={board()}
        anchor={box(400, 500)}
        geometry={geometry}
        busy={false}
        artUrl={(a) => a}
        onAnswer={vi.fn()}
        onYesToAll={vi.fn()}
        onSkipAll={vi.fn()}
      />,
    ).container;
    const buttons = [...c.querySelectorAll(".gs-win-actions > button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Skip", "Pay"]);
  });
});

// --- item 4: the To pay pill ---------------------------------------------------------------

describe("'Still to pay' on the stack card (F-0057-E)", () => {
  beforeEach(() => {
    // jsdom does no layout: give the board a size and a ResizeObserver.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1080);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("says Still to pay, under the top stack card", () => {
    const c = render(
      <Board
        battlefield={[]}
        hand={[]}
        viewerSeat={1}
        artUrl={(a: string) => a}
        stack={[
          { id: "stack:1", name: "Rhystic Study", source: null, targets: [], kind: "trigger" },
        ]}
        stackOwing={["2"]}
      />,
    ).container;
    const pill = c.querySelector(".bf-stack-owe");
    expect(pill).not.toBeNull();
    expect(pill!.querySelector(".bf-stack-owe-word")!.textContent).toBe("Still to pay");
    expect(pill!.getAttribute("aria-label")).toBe("Still to pay: 2");
  });
});

// --- item 5: play it, or throw it away ----------------------------------------------------

describe("a card's play is the main choice; discarding it is marked (F-0057-H)", () => {
  const cave = card({ id: "card:5", name: "Forgotten Cave", kind: "land", types: "Land" });
  const options: DecisionOption[] = [
    {
      actionId: "action:20:card:5",
      label:
        "Forgotten Cave · {R}, Discard Forgotten Cave · Cycling ({R}, Discard this card: Draw a card.)",
      objectId: "card:5",
      payable: true,
      cost: null,
      use: {
        kind: "cycling",
        title: "Cycle it instead",
        cost: "{R}",
        line: "Discard Forgotten Cave and draw a card. You won't have it as a land.",
      },
    },
    {
      actionId: "action:19:card:5",
      label: "Forgotten Cave · no cost · Play land",
      objectId: "card:5",
      payable: true,
      cost: null,
      use: { kind: "land", title: "Play it as your land", cost: null, line: "It comes in tapped." },
    },
  ];

  it("puts the play first, gold, and the cycling red, saying what is lost", () => {
    const onChoose = vi.fn();
    const c = render(
      <ActionPopup
        box={box(500, 900)}
        name="Forgotten Cave"
        card={cave}
        artUrl={(a) => a}
        options={options}
        notNow={[]}
        why={null}
        busy={false}
        onChoose={onChoose}
        onInspect={vi.fn()}
        onClose={vi.fn()}
      />,
    ).container;
    const rows = [...c.querySelectorAll<HTMLButtonElement>(".gs-ab-use")];
    expect(rows.map((r) => r.dataset["use"])).toEqual(["land", "cycling"]);
    expect(rows[0]!.classList.contains("gs-ab-play")).toBe(true);
    expect(rows[0]!.textContent).toContain("Play it as your land");
    expect(rows[0]!.textContent).toContain("It comes in tapped.");
    expect(rows[1]!.classList.contains("gs-ab-discard")).toBe(true);
    expect(rows[1]!.querySelector(".gs-ab-title")!.textContent).toBe("Cycle it instead: {R}");
    expect(rows[1]!.querySelector(".gs-ab-line")!.textContent).toBe(
      "Discard Forgotten Cave and draw a card. You won't have it as a land.",
    );
    // The play is the one focused first: Enter plays, never discards.
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.click(rows[1]!);
    expect(onChoose).toHaveBeenCalledWith("action:20:card:5");
  });

  it("leaves a card without such a choice as it was", () => {
    const c = render(
      <ActionPopup
        box={box(500, 900)}
        name="Shock"
        card={card({ name: "Shock" })}
        artUrl={(a) => a}
        options={[
          {
            actionId: "action:3:card:2",
            label: "Shock · {R} · Shock deals 2 damage to any target.",
            objectId: "card:2",
            payable: true,
            cost: "{R}",
          },
        ]}
        notNow={[]}
        why={null}
        busy={false}
        onChoose={vi.fn()}
        onInspect={vi.fn()}
        onClose={vi.fn()}
      />,
    ).container;
    expect(c.querySelector(".gs-ab-use")).toBeNull();
    expect(c.querySelector(".gs-ab")!.textContent).toContain("Shock deals 2 damage");
  });
});

// --- item 6: windows by the card asking ----------------------------------------------------

describe("windows sit by the card asking (F-0057-F)", () => {
  const stack = { x: 1500, y: 300, w: 140, h: 196, scale: 1, rotation: 0, z: 0 };
  const g2 = {
    ...geometry,
    play: { x: 0, y: 0, w: 1700, h: 1080 },
  };

  it("a hand card: above it, pointing down", () => {
    const hand = box(600, 900);
    const anchor = anchorByCard({
      card: hand,
      inHand: true,
      geometry: g2,
      stack,
      avoid: [],
      fallback: stack,
    });
    expect(anchor.side).toBe("above");
    const window = bubbleBox(anchor, g2);
    expect(window.y + window.h).toBeLessThanOrEqual(hand.y);
    expect(window.x).toBeLessThanOrEqual(hand.x + hand.w / 2);
    expect(window.x + window.w).toBeGreaterThanOrEqual(hand.x + hand.w / 2);
  });

  it("a battlefield card: beside it, on the side with room, never over the stack", () => {
    const left = box(200, 400);
    expect(
      anchorByCard({ card: left, inHand: false, geometry: g2, stack, avoid: [], fallback: stack })
        .side,
    ).toBe("right");
    // Close to the stack: no room on the right, so on its left.
    const near = box(1300, 400);
    const anchor = anchorByCard({
      card: near,
      inHand: false,
      geometry: g2,
      stack,
      avoid: [],
      fallback: stack,
    });
    expect(anchor.side).toBe("left");
    const window = bubbleBox(anchor, g2);
    expect(window.x + window.w).toBeLessThanOrEqual(near.x);
  });

  it("never over a card to click: then by the stack, as before", () => {
    const left = box(200, 400);
    const blocking = [box(330, 380, 400, 300), box(0, 380, 190, 300)];
    const anchor = anchorByCard({
      card: left,
      inHand: false,
      geometry: g2,
      stack,
      avoid: blocking,
      fallback: stack,
    });
    expect(anchor).toBe(stack);
  });

  it("the game names the card; a trigger or a spell stays by the stack", () => {
    const eulogist = card({ id: "card:1" });
    const b = board({
      battlefield: [eulogist],
      hand: [card({ id: "card:4", name: "Wren's Run Vanquisher" })],
    });
    const at = (id: string) =>
      id === "card:1" ? box(300, 400) : id === "card:4" ? box(700, 900) : null;
    const about = (over: Record<string, unknown>) =>
      decision({
        about: { name: "x", kind: "ability", from: null, copy: null, copies: null, ...over },
      });
    expect(askingCardAnchor(about({ card: "card:1" }), question(), b, g2, stack, at).side).toBe(
      "right",
    );
    // getAbilityToPlay: which way to cast the card in hand.
    expect(
      askingCardAnchor(about({ kind: "card", card: "card:4" }), question(), b, g2, stack, at).side,
    ).toBe("above");
    expect(
      askingCardAnchor(about({ kind: "trigger", card: "card:1" }), question(), b, g2, stack, at),
    ).toBe(stack);
    expect(askingCardAnchor(decision({}), question(), b, g2, stack, at)).toBe(stack);
  });

  it("the bubble points at the card from the side it takes", () => {
    const c = render(
      <Bubble
        anchor={{ ...box(200, 400), side: "right" }}
        geometry={g2}
        label="x"
        from="Elvish Eulogist"
        title="Sacrifice Elvish Eulogist?"
        actions={null}
      />,
    ).container;
    const bubble = c.querySelector<HTMLElement>(".gs-bubble")!;
    expect(bubble.dataset["side"]).toBe("right");
    expect(bubble.classList.contains("gs-bubble-right")).toBe(true);
    expect(parseFloat(bubble.style.left)).toBeGreaterThan(300);
  });
});

// --- item 1: the card being cast ----------------------------------------------------------

describe("the card being cast (F-0057-B)", () => {
  it("does not move aside when everything to click is in the hand", () => {
    const pick = decision({ kind: "chooseCardsForCost", options: [] });
    const hand = new Set(["card:7", "card:8"]);
    expect(docks(pick, question(["card:7", "card:8"]), "card:3", (id) => hand.has(id))).toBe(false);
    // Something on the table to click still moves it.
    expect(docks(pick, question(["card:7", "card:20"]), "card:3", (id) => hand.has(id))).toBe(true);
  });

  it("stays where it was between questions", () => {
    const spot = { id: "card:3", box: box(1200, 300), docked: true };
    const asked = decision({ decisionId: 9 });
    expect(heldSpot(spot, "card:3", asked, 9)).toBe(spot); // answered: waiting
    expect(heldSpot(spot, "card:3", null, null)).toBe(spot); // nothing asked
    expect(heldSpot(spot, "card:3", asked, null)).toBeNull(); // asked: it goes where asked
    expect(heldSpot(spot, "card:4", asked, 9)).toBeNull(); // another card
  });

  it("flies back from where it is, not from the middle", () => {
    const from = box(1200, 300, 150, 210);
    const c = render(
      <CastingFlight
        card={card({ id: "card:3", name: "Allosaurus Rider" })}
        geometry={layoutGeometry({ width: 1920, height: 1080 })}
        to={box(600, 900)}
        artUrl={(a) => a}
        onDone={vi.fn()}
        docked
        from={from}
      />,
    ).container;
    const flying = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(flying.style.left).toBe("1200px");
    expect(flying.style.top).toBe("300px");
  });
});
