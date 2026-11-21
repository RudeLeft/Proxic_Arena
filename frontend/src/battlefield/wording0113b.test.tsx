// @vitest-environment jsdom

// Spec 0113 (F-0113-D, the game screen's half): the board, the plates, the
// close-ups, the trays and every screen-reader line, in plain words. One
// exact-string assertion per row id (docs/features/wording/0113-wording-table.md);
// screen-reader text is read from aria-label, alt and visually hidden text
// of the rendered components.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState, type Snapshot, type SnapshotCard } from "../match";
import { abilityParts } from "./abilities";
import {
  Board,
  counterName,
  counterWords,
  makesWords,
  stackCaption,
  type BoardCard,
} from "./Board";
import { fanWords, FanMoreView } from "./FanCards";
import { captionOf, manyOf, type Stand } from "./fights";
import { ManaCost, ManaText } from "./ManaCost";
import { owingWords, pipWords } from "./manaBalls";
import { payWords } from "./payPicks";
import { DungeonMap, HOLDER_WORDS } from "./playerMarks";
import { PoisonBadge } from "./PoisonBadge";
import { extraWords } from "./SpellMarks";
import { poolWords, StatusTray } from "./StatusTray";
import { thisTurnWords, ThisTurnCounts } from "./thisTurn";
import { zoneNotes } from "./zoneTray";
import { manaTextParts, manaTextWords, pictureSymbol } from "../words";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: () => {},
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const {
  ActionPopup,
  ATTACK_ALL_WORDS,
  combatWords,
  GameScreen,
  handNumberWords,
  Inspect,
  libraryWords,
  markedWords,
  pileWords,
  plateWords,
  resolveWords,
  StackInspect,
  ZoneViewer,
} = await import("./GameScreen");

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1080);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
    return {
      finished: new Promise(() => {}),
      onfinish: null,
      oncancel: null,
      cancel() {},
      finish() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0 }) },
    };
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;

let next = 1;
function permanent(over: Partial<BoardCard>): BoardCard {
  return {
    id: `card:${next++}`,
    seat: 1,
    name: "Grizzly Bears",
    kind: "creature",
    types: "Creature — Bear",
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: 2,
    toughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    art: null,
    ...over,
  };
}

function snapCard(over: Partial<SnapshotCard>): SnapshotCard {
  return {
    id: "card:1",
    art: null,
    seat: 1,
    name: "Grizzly Bears",
    tapped: false,
    faceDown: false,
    known: true,
    kind: "creature",
    types: "Creature — Bear",
    power: 2,
    toughness: 2,
    manaCost: "{1}{G}",
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

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seat: 1,
    battlefield: [],
    hand: [],
    graveyard: [],
    exile: [],
    otherHands: [],
    stack: [],
    casting: [],
    players: [
      { seat: 1, name: "Alice" },
      { seat: 2, name: "Bob" },
    ],
    ...over,
  } as unknown as Snapshot;
}

const box = { x: 500, y: 600, w: 100, h: 140, scale: 1, rotation: 0, z: 0 };
const hidden = (c: Element) =>
  [...c.querySelectorAll(".pa-visually-hidden")].map((e) => e.textContent ?? "");
const aria = (c: Element, selector: string) =>
  c.querySelector(selector)!.getAttribute("aria-label");

// --- Screen-reader mana (List 2 2a) -------------------------------------------------------

describe("mana said in words", () => {
  it("the helpers page2 added to words.ts (manaTextParts, pictureSymbol)", () => {
    for (const text of [
      "{T}: Add {R}.",
      "{2}{G}, {T}: Draw a card.",
      "Still owing {1}{R}",
      "No mana",
    ]) {
      expect(
        manaTextParts(text)
          .map((p) => p.said)
          .join(""),
      ).toBe(manaTextWords(text));
    }
    expect(manaTextWords("{T}: Add {R}.")).toBe("Tap: add one red mana.");
    expect(["WU", "2W", "RP", "WUP", "R", "10"].map(pictureSymbol)).toEqual([
      "W/U",
      "2/W",
      "R/P",
      "W/U/P",
      "R",
      "10",
    ]);
  });

  it("W1-271: ManaText is read aloud in words, never the braces", () => {
    const c = render(
      <p>
        <ManaText text="{T}: Add {R}." />
      </p>,
    ).container;
    // What a screen reader reads: the line with each run of symbols an image
    // named in words; the letters are out of sight and out of the reading.
    const spoken = (el: Node): string =>
      el instanceof Element && el.getAttribute("role") === "img"
        ? (el.getAttribute("aria-label") ?? "")
        : el instanceof Element && el.getAttribute("aria-hidden") === "true"
          ? ""
          : el.nodeType === Node.TEXT_NODE
            ? (el.textContent ?? "")
            : [...el.childNodes].map(spoken).join("");
    expect(spoken(c)).toBe("Tap: Add one red mana.");
    expect(c.textContent).toBe("{T}: Add {R}.");
  });

  it("W1-272: a cost's label in words", () => {
    const c = render(<ManaCost cost="{1}{R}{R}" change="down" />).container;
    expect(aria(c, '[role="img"]')).toBe("Costs one generic and two red, less than printed");
  });

  it("W1-273 and W1-275: the Still to pay pill and its pips", () => {
    const pips = [
      { symbol: "1", paid: false, generic: true as const },
      { symbol: "1", paid: false, generic: true as const },
      { symbol: "R", paid: true },
      { symbol: "R", paid: false },
      { symbol: "G", paid: false },
    ];
    expect(owingWords(pips)).toBe("two generic, one red and one green");
    const c = render(
      <Board
        battlefield={[]}
        hand={[]}
        viewerSeat={1}
        artUrl={(a) => a}
        stackPay={pips}
        stackPayLive
      />,
    ).container;
    expect(aria(c, ".bf-stack-owe")).toBe("Still to pay: two generic, one red and one green");
    const alts = [...c.querySelectorAll(".bf-owe-pip")]
      .map((p) => p.getAttribute("alt"))
      .filter(Boolean);
    expect(alts).toEqual(["red, paid", "red", "green"]);
  });

  it("W1-274: the stack card's Still to pay", () => {
    const c = render(
      <Board
        battlefield={[]}
        hand={[]}
        viewerSeat={1}
        artUrl={(a) => a}
        stack={[{ id: "stack:1", name: "Shock", source: null, targets: [], kind: "spell" }]}
        stackOwing={["1", "R"]}
      />,
    ).container;
    expect(aria(c, ".bf-stack-owe")).toBe("Still to pay: one generic and one red");
  });

  it("W1-276: the casting card's pips", () => {
    expect(pipWords({ symbol: "1", paid: true, generic: true }, true)).toBe(
      "one generic mana, paid",
    );
    expect(pipWords({ symbol: "1", paid: false, generic: true }, true)).toBe("one generic mana");
    expect(pipWords({ symbol: "R", paid: true }, true)).toBe("red mana, paid");
    expect(pipWords({ symbol: "WU", paid: false }, true)).toBe("white or blue mana");
  });

  it("W1-277, W1-278, W1-279: what a land makes", () => {
    expect(makesWords(["G", "U"])).toBe("green or blue mana");
    const land = permanent({
      name: "Yavimaya Coast",
      kind: "land",
      types: "Land",
      power: null,
      toughness: null,
      makes: ["G", "U"],
    });
    const c = render(
      <Board battlefield={[land]} hand={[]} viewerSeat={1} artUrl={(a) => a} />,
    ).container;
    expect(c.querySelector(".bf-makes")!.getAttribute("title")).toBe("Makes green or blue mana");
    expect([...c.querySelectorAll("img.bf-makes-pip")].map((i) => i.getAttribute("alt"))).toEqual([
      "green",
      "blue",
    ]);
    expect(aria(c, `[data-object-id="${land.id}"]`)).toContain("makes green or blue mana");
  });

  it("W1-280: floating mana", () => {
    expect(poolWords({ R: 2, G: 1 })).toBe("two red and one green");
    const c = render(
      <StatusTray
        player={{
          seat: 1,
          name: "Alice",
          life: 20,
          handCount: 7,
          libraryCount: 40,
          graveyardCount: 0,
          counters: [],
          designations: [],
          command: [],
          ringTempted: 0,
          dungeonsCompleted: [],
          manaPool: { R: 2, G: 1 },
        }}
        side="viewer"
      />,
    ).container;
    expect(hidden(c)[0]).toBe("Alice: Floating mana: two red and one green");
  });
});

// --- The board ---------------------------------------------------------------------------

describe("the board's words", () => {
  it("W1-099: the state tags are words, not code-like capitals", () => {
    const c = render(
      <Board
        battlefield={[
          permanent({ id: "card:900", attacking: true }),
          permanent({ id: "card:901", name: "Hill Giant", tapped: true }),
        ]}
        hand={[]}
        viewerSeat={1}
        artUrl={(a) => a}
      />,
    ).container;
    const tags = [...c.querySelectorAll(".bf-state")].map((t) => t.textContent);
    expect(tags).toContain("Attacking");
    expect(tags).toContain("Tapped");
  });

  it("W1-100: the line under the stack", () => {
    const theirs = { by: "Pat", kind: "trigger", name: "Soul Warden", seat: 2 };
    expect(stackCaption([theirs, theirs, theirs], 1, 3, 2)).toBe(
      "Next: Pat's trigger. Three on the stack, one not shown.",
    );
  });

  it("W1-101 and W1-293: a stack card's aria, its copies and place in words", () => {
    const c = render(
      <Board
        battlefield={[]}
        hand={[]}
        viewerSeat={1}
        artUrl={(a) => a}
        stack={[
          {
            id: "stack:2",
            name: "Boggart Shenanigans' trigger",
            source: null,
            targets: [],
            kind: "trigger",
            count: 7,
          },
          { id: "stack:1", name: "Shock", source: null, targets: [], kind: "spell" },
        ]}
      />,
    ).container;
    expect(aria(c, '[data-object-id="stack:2"]')).toBe(
      "seven copies of Boggart Shenanigans' trigger, on the stack, first to resolve",
    );
    expect(aria(c, '[data-object-id="stack:1"]')).toBe("Shock, on the stack, second to resolve");
  });

  it("W1-102, W1-294, W1-355: a card's aria (count in words, came in this turn, your opponent's)", () => {
    const bears = permanent({
      id: "card:910",
      seat: 2,
      sick: true,
      damage: 2,
    });
    const c = render(
      <Board battlefield={[bears]} hand={[]} viewerSeat={1} artUrl={(a) => a} />,
    ).container;
    const label = aria(c, '[data-object-id="card:910"]')!;
    expect(label).toContain("came in this turn: can attack next turn");
    expect(label).toContain("2 damage");
    expect(label).toContain("your opponent's");
    expect(label).not.toContain("summoning sick");
  });

  it("W1-294: identical cards in one pile are 'two of them'", () => {
    const one = permanent({
      id: "card:920",
      name: "Island",
      kind: "land",
      types: "Land",
      power: null,
      toughness: null,
    });
    const two = { ...one, id: "card:921" };
    const c = render(
      <Board battlefield={[one, two]} hand={[]} viewerSeat={1} artUrl={(a) => a} />,
    ).container;
    expect(aria(c, '[data-object-id="card:920"]')).toContain("Island, two of them");
  });

  it("W1-282, W1-283: counters as players say them, counted in words", () => {
    expect(counterName("FIRST_STRIKE")).toBe("first strike");
    expect(counterName("LORE")).toBe("lore");
    expect(counterWords({ counters: [{ name: "P1P1", count: 1 }] })).toEqual(["a +1/+1 counter"]);
    expect(counterWords({ counters: [{ name: "LORE", count: 3 }] })).toEqual([
      "three lore counters",
    ]);
  });

  it("W1-286: regeneration shields counted, not '×2'", () => {
    const c = render(
      <Board
        battlefield={[permanent({ id: "card:930", shields: 2 })]}
        hand={[]}
        viewerSeat={1}
        artUrl={(a) => a}
      />,
    ).container;
    expect(c.querySelector(".bf-badges")!.getAttribute("title")).toBe(
      "Two regeneration shields: the next time it would be destroyed, it taps instead",
    );
  });

  it("W1-295, W1-354: a hidden card in the other player's hand", () => {
    const backs = Array.from({ length: 7 }, (_, i) => ({ id: `hidden-hand:2:${i}`, shown: null }));
    const named = render(
      <Board
        battlefield={[]}
        hand={[]}
        opponentHand={backs}
        opponentName="Bob"
        viewerSeat={1}
        artUrl={(a) => a}
      />,
    ).container;
    expect(aria(named, '[data-object-id="hidden-hand:2:2"]')).toBe(
      "Card three of seven in Bob's hand",
    );
    const unnamed = render(
      <Board battlefield={[]} hand={[]} opponentHand={backs} viewerSeat={1} artUrl={(a) => a} />,
    ).container;
    expect(aria(unnamed, '[data-object-id="hidden-hand:2:0"]')).toBe(
      "Card one of seven in your opponent's hand",
    );
  });

  it("W1-103: a card picked to pay", () => {
    expect(payWords({ word: "Tap", tone: "tap", lean: true, actionId: "unpick:card:1" })).toBe(
      "picked to tap. Click again to take it back.",
    );
  });

  it("W1-104 and W1-107: the extra costs", () => {
    expect(extraWords(["kicked"], 3)).toEqual(["Kicked three times"]);
    expect(extraWords(["kicked"], 2)).toEqual(["Kicked twice"]);
  });

  it("W1-105: the +N fan card", () => {
    const c = render(
      <FanMoreView more={{ side: "viewer", count: 3, zone: "graveyard", box }} who="you" />,
    ).container;
    expect(aria(c, "button")).toBe("Three more cards you may play: open the pile");
  });

  it("W1-284: a suspended card's time counters", () => {
    const card = { known: true, name: "Rift Bolt", zone: "exile", how: "suspended", time: 3 };
    expect(fanWords(card as never, "your")).toContain("suspended, with three time counters");
  });
});

// --- Fights ------------------------------------------------------------------------------

describe("the fight captions", () => {
  const goblin: Stand = { box, item: "a", name: "Goblin Token", seat: 2, count: 3 };
  it("W1-303: Damage: Bob's three Goblin tokens hit you", () => {
    expect(captionOf(goblin, [], { player: 1 }, 1, "Bob", false)).toBe(
      "Damage: Bob's three Goblin tokens hit you",
    );
  });
  it("W1-304: number words for any small count, the name made plural", () => {
    expect(manyOf("Goblin Token", 2)).toBe("two Goblin tokens");
    expect(manyOf("Hill Giant", 2)).toBe("two copies of Hill Giant");
    expect(manyOf("Hill Giant", 4)).toBe("four copies of Hill Giant");
  });
});

// --- Close-ups, the ability menu, trays --------------------------------------------------

describe("close-ups and trays", () => {
  it("W1-097 and W1-098: ability lines without dashes or ' · '", () => {
    expect(
      abilityParts(
        "Forgotten Cave — {R}, Discard Forgotten Cave — Cycling ({R}, Discard this card: Draw a card.)",
        "Forgotten Cave",
      ).text,
    ).toBe("Cycling: discard this card to draw a card.");
    expect(abilityParts("Card — {1} — Draw a card — Then discard a card.", "Card").text).toBe(
      "Draw a card. Then discard a card.",
    );
  });

  it("W1-106: the P/T line with damage", () => {
    const bears = snapCard({ id: "card:5", power: 3, toughness: 3, damage: 2 });
    const c = render(
      <Inspect
        card={bears}
        name="Grizzly Bears"
        costNow={null}
        artUrl={(a) => a}
        board={snap({ battlefield: [bears] })}
        mySeat={1}
        onClose={vi.fn()}
      />,
    ).container;
    expect(c.querySelector(".gs-inspect-pt")!.textContent).toBe("3/3, with 2 damage");
  });

  it("W1-107, W1-108, W1-109: the stack close-up's facts", () => {
    const entry = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      name: "Boggart Shenanigans' trigger",
      description: "Boggart Shenanigans deals 1 damage to any target",
      controller: 1,
      art: null,
      source: null,
      targets: [],
      kind: "trigger",
      seat: 1,
      ...over,
    });
    const b = snap({
      stack: [
        entry("stack:4"),
        entry("stack:3"),
        entry("stack:2"),
        entry("stack:1", {
          name: "Everflowing Chalice",
          kind: "spell",
          extra: ["kicked"],
          kicks: 3,
        }),
      ],
    } as never);
    const facts = (id: string) => {
      const c = render(
        <StackInspect board={b} id={id} mySeat={1} artUrl={(a) => a} onClose={vi.fn()} />,
      ).container;
      const dts = [...c.querySelectorAll("dt")].map((d) => d.textContent ?? "");
      const dds = [...c.querySelectorAll("dd")].map((d) => d.textContent ?? "");
      const out: Record<string, string | undefined> = {};
      dts.forEach((d, i) => (out[d] = dds[i]));
      return out;
    };
    expect(facts("stack:3")["Order"]).toBe("Resolves second");
    expect(facts("stack:4")["Copies"]).toBe("Three copies, resolving one after another");
    expect(facts("stack:1")["Cast"]).toBe("Kicked three times");
  });

  it("W1-110, W1-111, W1-288: the zone tray's title and count", () => {
    const pile = [1, 2, 3].map((n) => snapCard({ id: `card:6${n}`, seat: 2, name: `Card ${n}` }));
    const open = (b: Snapshot, zone: "graveyard" | "hand") =>
      render(
        <ZoneViewer
          board={b}
          seat={2}
          zone={zone}
          mySeat={1}
          artUrl={(a) => a}
          onZone={vi.fn()}
          onInspect={vi.fn()}
          onClose={vi.fn()}
        />,
      ).container;
    const named = open(snap({ graveyard: pile }), "graveyard");
    expect(named.querySelector(".gs-ztray-count")!.textContent).toBe("Three cards, newest first");
    const hand = open(snap({ otherHands: pile }), "hand");
    expect(hand.querySelector(".gs-viewer-title")!.textContent).toBe(
      "Bob's hand: the cards you can see",
    );
    const unnamed = open(
      snap({ graveyard: pile, players: [{ seat: 1, name: "Alice" }] } as never),
      "graveyard",
    );
    expect(unnamed.querySelector(".gs-viewer-title")!.textContent).toBe("Their graveyard");
    // W1-302's twin in this tray: copies said in words, not "×3".
    const islands = [1, 2, 3].map((n) =>
      snapCard({ id: `card:7${n}`, seat: 2, name: "Island", types: "Basic Land — Island" }),
    );
    const grouped = open(snap({ graveyard: islands }), "graveyard");
    expect(grouped.querySelector(".gs-ztray-card")!.getAttribute("aria-label")).toMatch(
      /^Island, three copies, /,
    );
  });

  it("W1-112: counter notes in the tray use the players' name, in words", () => {
    const card = snapCard({
      counters: [
        { name: "P1P1", count: 1 },
        { name: "TIME", count: 3 },
      ],
    });
    expect(zoneNotes(card, "exile")).toEqual(["A +1/+1 counter", "Three time counters"]);
  });

  it("W1-300: an option with no label is 'This choice'", () => {
    const c = render(
      <ActionPopup
        box={box}
        name="Shock"
        card={snapCard({ name: "Shock" })}
        artUrl={(a) => a}
        options={[
          { actionId: "action:9", label: null, objectId: "card:1", payable: false } as never,
          {
            actionId: "action:3",
            label: "Shock · {R} · Shock deals 2 damage to any target.",
            objectId: "card:1",
            payable: true,
          } as never,
        ]}
        notNow={[]}
        why={null}
        busy={false}
        onChoose={vi.fn()}
        onInspect={vi.fn()}
        onClose={vi.fn()}
      />,
    ).container;
    const labels = [...c.querySelectorAll("button.gs-option")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toContain("This choice, not enough mana right now");
    expect(labels.join(" ")).not.toContain("action:9");
    expect(labels.join(" ")).not.toMatch(/[{}]/);
  });
});

// --- The plate's marks, the tray and this turn --------------------------------------------

function trayPlayer(over: Record<string, unknown>) {
  return {
    seat: 1,
    name: "Alice",
    life: 20,
    handCount: 7,
    libraryCount: 40,
    graveyardCount: 0,
    counters: [],
    designations: [],
    command: [],
    ringTempted: 0,
    dungeonsCompleted: [],
    manaPool: {},
    ...over,
  } as never;
}

describe("the status tray and the plate's marks", () => {
  it("W1-118: the monarch's rule in a sentence", () => {
    expect(HOLDER_WORDS["monarch"]).toBe(
      "The monarch draws a card at the end of their turn. Dealing combat damage to them takes it.",
    );
  });

  it("W1-119: a counter with no picture of its own", () => {
    const c = render(
      <StatusTray
        player={trayPlayer({ counters: [{ name: "ACORN_STASH", count: 2 }] })}
        side="viewer"
      />,
    ).container;
    expect(hidden(c)[0]).toBe("Alice: two acorn stash counters");
  });

  it("W1-120, W1-122, W1-359: the Ring and the monarch, said", () => {
    const c = render(
      <StatusTray
        player={trayPlayer({ designations: ["Monarch"], ringTempted: 3, command: ["The Ring"] })}
        side="opponent"
      />,
    ).container;
    expect(aria(c, '[data-count-kind="ring"]')).toBe("The Ring has tempted Alice three times");
    expect(hidden(c)[0]).toBe(
      "Alice: the monarch. Command zone: The Ring; the Ring has tempted them three times",
    );
  });

  it("W1-121, W1-123: the list's title and the Ring card", () => {
    const c = render(
      <StatusTray player={trayPlayer({ ringTempted: 3, command: ["The Ring"] })} side="viewer" />,
    ).container;
    fireEvent.click(c.querySelector('[data-count-kind="ring"]')!);
    const list = c.querySelector(".gs-status-list")!;
    expect(list.getAttribute("aria-label")).toBe("Alice: in play for you");
    expect(list.querySelector(".gs-status-from")!.textContent).toBe("Alice: in play for you");
    expect(list.querySelector(".gs-status-thing")!.textContent).toMatch(
      /^The Ring: tempted three times/,
    );
  });

  it("W1-281: the +N button", () => {
    const c = render(
      <StatusTray
        player={trayPlayer({
          manaPool: { W: 1, U: 1, B: 1, R: 1 },
          counters: [
            { name: "ENERGY", count: 4 },
            { name: "EXPERIENCE", count: 2 },
          ],
        })}
        side="viewer"
      />,
    ).container;
    const more = c.querySelector(".gs-chip-more")!;
    const n = Number(more.textContent!.slice(1));
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];
    expect(more.getAttribute("aria-label")).toBe(`${words[n]} more. Show everything`);
  });

  it("W1-124: a dungeon's map says the room after a colon", () => {
    const c = render(
      <DungeonMap
        id="d:1"
        name="Lost Mine of Phandelver"
        rooms={[{ name: "Cave Entrance", here: true, next: [] } as never]}
        side="viewer"
        expanded={false}
        onClick={vi.fn()}
        fresh={false}
      />,
    ).container;
    expect(c.querySelector("button")!.getAttribute("title")).toBe(
      "Lost Mine of Phandelver: in Cave Entrance",
    );
  });

  it("W1-285: poison counters in words", () => {
    const c = render(<PoisonBadge count={3} pulses={0} />).container;
    expect(c.innerHTML).toContain("three poison counters");
    expect(c.innerHTML).not.toContain("3 poison counters");
  });

  it("W1-117, W1-305: this turn, said and titled", () => {
    const counts = { spells: 2, lifeGained: 3, leftBattlefield: false };
    expect(thisTurnWords(counts, "Bob", false)).toBe(
      "Bob this turn: two spells cast, 3 life gained, and none of their permanents left the battlefield.",
    );
    const c = render(
      <ThisTurnCounts counts={counts} name="Bob" mine={false} side="opponent" />,
    ).container;
    const group = c.querySelector(".gs-thisturn")!;
    expect(group.getAttribute("aria-label")).toBe(thisTurnWords(counts, "Bob", false));
    fireEvent.mouseEnter(group);
    expect(c.querySelector(".gs-thisturn-by")!.textContent).toBe("Bob, this turn");
  });
});

// --- The act button, the plates and the turn ladder ---------------------------------------

describe("the act button's words", () => {
  it("W1-040 and W1-292: your own spell's countdown", () => {
    expect(resolveWords("Lightning Bolt", 3)).toEqual({
      word: "Resolves in 3",
      sub: "Your Lightning Bolt. Click to resolve it now.",
      aria: "Pass: Resolve Lightning Bolt now, or in three seconds.",
    });
  });

  it("W1-042: some selected, not yet pointed", () => {
    expect(markedWords(2, "declareAttackers")).toEqual({
      word: "Two selected",
      sub: "Click what they attack, or press Esc to unselect them",
      aria: "Two selected. Click what they attack, or press Escape to unselect them.",
    });
  });

  it("W1-043, W1-044: attacking and blocking with some", () => {
    const b = snap({
      battlefield: [
        snapCard({ id: "card:1", attacking: true, power: 3 }),
        snapCard({ id: "card:2", attacking: true, power: 2 }),
      ],
    });
    expect(combatWords("declareAttackers", b, 1)).toEqual({
      word: "Attack with two",
      sub: "5 power. Select more, or click one to take it back.",
    });
    const blocks = snap({
      battlefield: [
        snapCard({ id: "card:1", blocking: true }),
        snapCard({ id: "card:2", blocking: true }),
      ],
    });
    expect(combatWords("declareBlockers", blocks, 1).word).toBe("Block with two");
  });

  it("W1-045: the all-attack button", () => {
    expect(ATTACK_ALL_WORDS).toBe("Attack with everything");
  });

  it("W1-308: the order numbers on hand cards", () => {
    expect(handNumberWords(1)).toBe("First in the order");
    expect(handNumberWords(2)).toBe("Second in the order");
  });

  it("W1-113, W1-114: the library warning", () => {
    expect(libraryWords(0, null)).toBe("Empty: you lose if you have to draw");
    expect(libraryWords(0, "Bob")).toBe("Empty: Bob loses if they have to draw");
    expect(libraryWords(3, null)).toBe(
      "Three cards left. Drawing from an empty library loses the game.",
    );
  });

  it("W1-287, W1-307: piles and the plate's line", () => {
    expect(pileWords(1)).toBe("one card");
    expect(pileWords(0)).toBe("empty");
    expect(pileWords(7)).toBe("seven cards");
    expect(plateWords({ name: "Alice", who: "you", active: true, priority: true })).toBe(
      "Alice, you. It's your turn and you can act.",
    );
    expect(plateWords({ name: "Bob", who: "opponent", active: false, priority: false })).toBe(
      "Bob, your opponent.",
    );
  });
});

// --- The real game screen: plates, ladder, the control chain, the spectator's side -------

const match: MatchView = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1" },
    { seatNumber: 2, userId: "u-2" },
  ],
  outcome: null,
} as unknown as MatchView;

let rev = 1;
function send(state: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "MATCH_SNAPSHOT",
        state: {
          stateRevision: rev++,
          gameEpoch: 1,
          turn: 3,
          phase: "MAIN1",
          activeSeat: 2,
          prioritySeat: 2,
          seat: 1,
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: 7, libraryCount: 1, graveyardCount: 0 },
            {
              seat: 2,
              name: "Bob",
              life: 20,
              handCount: 7,
              libraryCount: 40,
              graveyardCount: 0,
              counters: [{ name: "POISON", count: 3 }],
            },
          ],
          battlefield: [],
          hand: [],
          graveyard: [],
          exile: [],
          stack: [],
          ...state,
        },
      }),
    ),
  );
}

describe("the game screen's own words", () => {
  it("W1-307, W1-287, W1-351, W1-116: plates, piles and the ladder", () => {
    render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send({ gameEpoch: 2 });
    const bob = document.querySelector<HTMLElement>('.gs-seat[data-seat="2"]')!;
    expect(bob.querySelector(":scope > .pa-visually-hidden")!.textContent).toBe(
      "Bob, your opponent. It's their turn and they can act. 20 life, three poison counters, seven cards in hand, 40 cards in library, no cards in graveyard and no cards in exile.",
    );
    const alice = document.querySelector<HTMLElement>('.gs-seat[data-seat="1"]')!;
    expect(
      alice.querySelector('[data-zone-tile="viewer:library"]')!.getAttribute("aria-label"),
    ).toBe(
      "Alice's library, one card. One card left. Drawing from an empty library loses the game.",
    );
    expect(
      alice.querySelector('[data-zone-tile="viewer:graveyard"]')!.getAttribute("aria-label"),
    ).toMatch(/^Alice's graveyard, empty/);
    expect(document.querySelector(".gs-whose")!.textContent).toBe("Your opponent’s turn");
    expect(document.querySelector(".gs-game")!.textContent).toBe(" (Game 2)");
  });

  it("W1-352: another player playing this turn, a sentence", () => {
    render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send({
      players: [
        {
          seat: 1,
          name: "Alice",
          life: 20,
          handCount: 7,
          libraryCount: 40,
          graveyardCount: 0,
          controlledBy: 3,
        },
        { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 40, graveyardCount: 0 },
      ],
    });
    const chain = document.querySelector(".gs-control .pa-visually-hidden")!;
    expect(chain.textContent).toBe("Another player is playing this turn.");
  });

  it("W1-291: who is watching, in words", () => {
    render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send({});
    act(() =>
      socket.onState!((previous) =>
        reduceMatch(previous, { type: "WATCHING", count: 2, names: ["Ann", "Cal"] }),
      ),
    );
    const pill = document.querySelector(".gs-watching")!;
    expect(pill.textContent).toBe("Two watching");
    expect(pill.getAttribute("aria-label")).toBe("Two watching: Ann and Cal");
  });

  it("W1-353, W1-289: a spectator's side and turn with no name to give", () => {
    render(<GameScreen match={match} me="u-9" watching onLeave={() => {}} />);
    send({ spectator: true, seat: 3, viewFrom: 3, activeSeat: 4 });
    expect(document.querySelector(".gs-switch-sides")!.textContent).toBe(
      "From this sideSwitch sides",
    );
    expect(document.querySelector(".gs-whose")!.textContent).toBe("Their turn");
  });
});
