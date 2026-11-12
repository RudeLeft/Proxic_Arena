// @vitest-environment jsdom

// Spec 0075 -- the remaining card-action words move into the report window
// (F-0075-A, B, C, D). The real game screen, its socket replaced (the test
// hands it the server's messages itself), for the report window and its
// pictures; the real Board, handed one board and then the next, for the word
// pills that are gone. Who is sent which window is the worker's
// (ActionReportsTest) and the Mechanics Lab's (scripts/check-card-actions.py).

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState, type SnapshotCard } from "../match";
import { Board, type BoardCard } from "./Board";
import { syntheticBoard } from "./fixture";
import { RollsOverlay, ROLL_LINGER_MS } from "./DiceWindows";
import { boardFromSnapshot } from "./fromSnapshot";
import { layout } from "./layout";
import { wentWords } from "./RevealTray";

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

const { GameScreen } = await import("./GameScreen");

const size = { width: 1920, height: 1080 };
const calls: { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
beforeEach(() => {
  calls.length = 0;
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
  Element.prototype.animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    calls.push({ element: this, frames, options: options ?? {} });
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      playState: "running",
    } as unknown as Animation;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
  document.body.innerHTML = "";
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => size.width,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => size.height,
});

const match = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

const card = (id: number, name: string, seat = 1, extra: Record<string, unknown> = {}) => ({
  id: `card:${id}`,
  seat,
  name,
  kind: "creature",
  types: "Creature — Bear",
  known: true,
  power: 2,
  toughness: 2,
  ...extra,
});

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(over: Record<string, unknown>) {
  revision += 1;
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 2,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 1, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: [],
      hand: [card(1, "Grizzly Bears")],
      graveyard: [],
      exile: [],
      stack: [],
      ...over,
    },
  });
}
function open() {
  return render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
}

describe("the report window tells what the other player did (F-0075-A, B, C, D)", () => {
  it("Bob's Unsummon on your Bears: his medallion, the sentence, the Bears going to your hand", () => {
    const c = open();
    board({
      action: {
        key: "action:7",
        stamp: 7,
        by: 2,
        source: "Unsummon",
        said: "Bob returned your Grizzly Bears to your hand.",
        cards: [{ ...card(0, "Grizzly Bears"), id: "action:7:0", to: "hand" }],
      },
    });
    const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(tray.querySelector(".gs-reveal-by")!.textContent).toBe("Bob · Unsummon");
    expect(tray.querySelector(".gs-reveal-said")!.textContent).toBe(
      "Bob returned your Grizzly Bears to your hand.",
    );
    const shown = tray.querySelector<HTMLElement>('[data-revealed-id="action:7:0"]')!;
    expect(shown.dataset.to).toBe("hand");
    expect(shown.querySelector(".gs-reveal-to")!.textContent).toBe("→ hand");
  });

  it("Bob's colour choice: the colour is a picture, its mana symbol, beside Voice of All", () => {
    const c = open();
    board({
      action: {
        key: "action:8",
        stamp: 8,
        by: 2,
        source: "Voice of All",
        said: "Bob chose white.",
        cards: [{ ...card(0, "Voice of All", 2), id: "action:8:0", to: "battlefield" }],
        marks: [{ kind: "color", color: "white" }],
      },
    });
    const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(tray.querySelector(".gs-reveal-said")!.textContent).toBe("Bob chose white.");
    const mark = tray.querySelector<HTMLElement>('[data-mark="color"]')!;
    expect(mark).not.toBeNull();
    const picture = mark.querySelector<HTMLElement>(".gs-reveal-mark-white")!;
    expect(picture.getAttribute("aria-label")).toBe("White, the colour chosen");
    expect(picture.querySelector("img")!.getAttribute("src")).toMatch(/sym_W/);
    expect(mark.querySelector(".gs-reveal-name")!.textContent).toBe("White");
    // The card is still a card, and the colour comes after it.
    const items = [...tray.querySelectorAll(".gs-reveal-cards > li")];
    expect(items.map((li) => (li as HTMLElement).dataset.mark ?? "card")).toEqual([
      "card",
      "color",
    ]);
  });

  it("Bob's coin flip: a coin picture, lost; won is the bright coin", () => {
    const c = open();
    board({
      action: {
        key: "action:9",
        stamp: 9,
        by: 2,
        source: "Stitch in Time",
        said: "Bob flipped a coin and lost.",
        cards: [],
        marks: [{ kind: "coin", won: false }],
      },
    });
    let coin = c.querySelector<HTMLElement>('[data-mark="coin"]')!;
    expect(coin.querySelector(".gs-reveal-mark-lost")!.getAttribute("aria-label")).toBe(
      "A coin flip, lost",
    );
    expect(coin.querySelector(".gs-reveal-to")!.textContent).toBe("Lost");
    board({
      action: {
        key: "action:10",
        stamp: 10,
        by: 2,
        source: "Stitch in Time",
        said: "Bob flipped a coin and won.",
        cards: [],
        marks: [{ kind: "coin", won: true }],
      },
    });
    coin = c.querySelector<HTMLElement>('[data-mark="coin"]')!;
    expect(coin.querySelector(".gs-reveal-mark-won")).not.toBeNull();
    expect(coin.querySelector(".gs-reveal-to")!.textContent).toBe("Won");
  });

  it("your own coin flip: your medallion, 'You flipped a coin and won.', the coin (owner 2026-11-12)", () => {
    const c = open();
    board({
      action: {
        key: "action:13",
        stamp: 13,
        by: 1,
        source: "Stitch in Time",
        said: "You flipped a coin and won.",
        cards: [{ ...card(0, "Stitch in Time", 1), id: "action:13:0" }],
        marks: [{ kind: "coin", won: true }],
      },
    });
    const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(tray.querySelector(".gs-reveal-by")!.textContent).toBe("You · Stitch in Time");
    expect(tray.querySelector(".gs-reveal-said")!.textContent).toBe("You flipped a coin and won.");
    expect(tray.querySelector('[data-mark="coin"] .gs-reveal-mark-won')).not.toBeNull();
  });

  it("a mark the page does not know is left out, never drawn as something else", () => {
    const c = open();
    board({
      action: {
        key: "action:11",
        stamp: 11,
        by: 2,
        source: "Voice of All",
        said: "Bob chose white and blue.",
        cards: [],
        marks: [{ kind: "color", color: "white and blue" }, { kind: "sparkle" }],
      },
    });
    expect(c.querySelector(".gs-reveal")).not.toBeNull();
    expect(c.querySelectorAll("[data-mark]")).toHaveLength(0);
  });

  it("Duress on an empty hand: the look is a window with no cards", () => {
    const c = open();
    board({
      action: {
        key: "action:12",
        stamp: 12,
        by: 2,
        source: "Duress",
        said: "Bob looked at your hand. It has no cards.",
        cards: [],
      },
    });
    const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(tray.querySelector(".gs-reveal-said")!.textContent).toBe(
      "Bob looked at your hand. It has no cards.",
    );
    expect(tray.querySelectorAll(".gs-reveal-cards > li")).toHaveLength(0);
  });

  it("a card shuffled into a library says so under its picture", () => {
    expect(wentWords("shuffled")).toBe("→ shuffled into library");
  });
});

describe("no word pills for these card actions (F-0075-A, B)", () => {
  const snap = (moves: unknown[]) =>
    ({
      stateRevision: 2,
      seat: 1,
      gameEpoch: 1,
      turn: 3,
      phase: "MAIN1",
      activeSeat: 2,
      prioritySeat: 1,
      players: [],
      notices: [],
      battlefield: [] as SnapshotCard[],
      hand: [],
      otherHands: [],
      casting: [],
      graveyard: [],
      exile: [],
      stack: [],
      combat: null,
      moves,
    }) as never;

  it("Bob cycles Forgotten Cave: no Cycled tag rides with it", () => {
    const data = boardFromSnapshot(
      snap([
        {
          card: "card:64",
          from: { zone: "hand", seat: 2 },
          to: { zone: "graveyard", seat: 2 },
          why: "cycled",
          said: "Cycled",
        },
      ]),
      null,
    );
    expect([...data.graves]).toEqual([]);
  });

  it("a bounce still flies (the return is kept), only its words are gone", () => {
    const data = boardFromSnapshot(
      snap([
        {
          card: "card:7",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "hand", seat: 1 },
        },
      ]),
      null,
    );
    expect(data.returns.get("card:7")).toMatchObject({ zone: "hand", side: "viewer" });
  });

  const start = syntheticBoard(24, 30, 2);
  const viewer = start.viewerSeat;
  const alone = (seat: number) => {
    const out = layout(start, size);
    const slot = out.slots.find((s) => {
      const c = start.battlefield.find((x) => x.id === s.ids[0]);
      return s.ids.length === 1 && c?.kind === "creature" && c.seat === seat && !s.attached.length;
    });
    return start.battlefield.find((x) => x.id === slot!.ids[0])!;
  };
  const mine = alone(viewer);
  const theirs = alone(viewer === 1 ? 2 : 1);
  const draw = (
    battlefield: readonly BoardCard[],
    hand = start.hand,
    returns = new Map(),
    opponentHand = [{ id: `hidden-hand:${theirs.seat}:0`, shown: null }],
  ) => (
    <Board
      battlefield={battlefield}
      hand={hand}
      opponentHand={opponentHand}
      opponentName="Bob"
      viewerSeat={viewer}
      artUrl={(art) => art}
      arrivals={new Map()}
      departures={new Map()}
      returns={returns}
      stack={[]}
    />
  );

  it("Bob's Unsummon on your creature: it glides to your hand, no 'Back to your hand'", () => {
    const view = render(draw(start.battlefield));
    calls.length = 0;
    view.rerender(
      draw(
        start.battlefield.filter((x) => x.id !== mine.id),
        [...start.hand, { ...mine, art: mine.art }],
        new Map([[mine.id, { zone: "hand", side: "viewer", where: null, hidden: false }]]),
      ),
    );
    const slot = view.container
      .querySelector(`[data-zone="viewer:hand"][data-object-id="${mine.id}"]`)!
      .closest(".bf-slot")!;
    expect(calls.filter((x) => x.element === slot)).toHaveLength(1); // the flight is unchanged
    expect(view.container.querySelectorAll("[data-return-tag]")).toHaveLength(0);
    expect(view.container.textContent).not.toContain("Back to");
  });

  it("your Griptide on Bob's creature: on top of his library, no 'On top of Bob's library'", () => {
    const view = render(draw(start.battlefield));
    view.rerender(
      draw(
        start.battlefield.filter((x) => x.id !== theirs.id),
        start.hand,
        new Map([[theirs.id, { zone: "library", side: "opponent", where: "top", hidden: true }]]),
      ),
    );
    expect(view.container.querySelector(`[data-ghost-of="${theirs.id}"]`)).not.toBeNull();
    expect(view.container.querySelectorAll("[data-return-tag]")).toHaveLength(0);
    expect(view.container.textContent).not.toContain("On top of");
  });

  it("Chaos Warp: shuffled in, the riffle still plays, with no words", () => {
    const view = render(draw(start.battlefield));
    view.rerender(
      draw(
        start.battlefield.filter((x) => x.id !== mine.id),
        start.hand,
        new Map([[mine.id, { zone: "library", side: "viewer", where: "shuffled", hidden: true }]]),
      ),
    );
    expect(view.container.querySelectorAll("[data-riffle]")).toHaveLength(6);
    expect(view.container.querySelectorAll("[data-return-tag]")).toHaveLength(0);
    expect(view.container.textContent).not.toContain("Shuffled into");
  });
});

describe("a die roll is told by its die alone (F-0075-C)", () => {
  // Bob's Goblin Tutor rolled and resolved in one go: by the board that
  // carries the roll it is in his graveyard, not drawn, and no grey "Bob
  // rolled 3" line says it any more -- the die tumbles at the stack's spot.
  const roll = {
    n: 1,
    seat: 2,
    source: "card:97",
    name: "Goblin Tutor",
    sides: 6,
    results: [3],
  };
  const spot = { x: 1500, y: 400, w: 120, h: 168 };
  const draw = (now: number, withSpot: boolean) =>
    render(
      <RollsOverlay
        rolls={[roll]}
        stack={[]}
        since={0}
        arrived={new Map([[1, 1000]])}
        now={now}
        at={() => null}
        spot={withSpot ? spot : null}
      />,
    ).container;

  it("tumbles at the stack's spot, says who rolled what, then lingers and goes", () => {
    const c = draw(1200, true);
    const die = c.querySelector<HTMLElement>("[data-roll]")!;
    expect(die).not.toBeNull();
    expect(die.textContent).toContain("Goblin Tutor rolled 3");
    expect(parseFloat(die.style.left)).toBeCloseTo(spot.x - 60 * 0.55);
    // Never on the stack with its card: it tosses in and fades by itself
    // (born "fading" it would be invisible from the start).
    expect(die.classList.contains("gs-roll-brief")).toBe(true);
    expect(die.classList.contains("gs-roll-fading")).toBe(false);
    expect(draw(1000 + ROLL_LINGER_MS + 700, true).querySelector("[data-roll]")).toBeNull();
  });

  it("with no spot given (an older page), nothing is invented", () => {
    expect(draw(1200, false).querySelector("[data-roll]")).toBeNull();
  });
});
