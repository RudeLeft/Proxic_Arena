// @vitest-environment jsdom

// Spec 0068 -- the casting card stays in the middle of the screen and goes
// see-through over what it covers; the obsidian pointer (F-0068-A..D).
// The real game screen, its socket replaced: the test hands it the
// server's messages itself.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { FLIP_MS, HOLD_MS, castingBox } from "./CastingCard";
import { stackSpotBoxes } from "./effects";
import { bubbleBox } from "./GameWindow";
import type { Question } from "./interaction";
import { geometry as layoutGeometry, type Box } from "./layout";
import type { Snapshot } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as unknown[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (...args: unknown[]) => socket.answers.push(args),
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

const { GameScreen, castingWindowAnchor } = await import("./GameScreen");

// jsdom lays nothing out: the window's size is the test's, and a box is
// what its inline style says (enough for the cast card and the cards).
let size = { width: 1920, height: 947 };
const resized: (() => void)[] = [];
let animations: { element: Element; frames: Keyframe[]; options: unknown }[] = [];
beforeEach(() => {
  size = { width: 1920, height: 947 };
  resized.length = 0;
  animations = [];
  socket.answers = [];
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Animations are recorded and never finish on their own.
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    animations.push({ element: this, frames, options });
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
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
const styleBox = (el: Element) => {
  const s = (el as HTMLElement).style;
  const x = parseFloat(s.left) || 0;
  const y = parseFloat(s.top) || 0;
  const w = parseFloat(s.width) || 0;
  const h = parseFloat(s.height) || 0;
  return { x, y, w, h };
};
Element.prototype.getBoundingClientRect = function (this: Element) {
  const { x, y, w, h } = styleBox(this);
  return {
    x,
    y,
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  };
};

const match: MatchView = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

const elf = {
  id: "card:10",
  seat: 1,
  name: "Llanowar Elves",
  kind: "creature",
  types: "Creature — Elf Druid",
  known: true,
  power: 1,
  toughness: 1,
};
const goblin = {
  id: "card:20",
  seat: 2,
  name: "Goblin Guide",
  kind: "creature",
  types: "Creature — Goblin Scout",
  known: true,
  power: 2,
  toughness: 2,
};
const wurm = {
  id: "card:3",
  seat: 1,
  name: "Craw Wurm",
  kind: "creature",
  types: "Creature — Wurm",
  known: true,
  manaCost: "{4}{G}{G}",
};

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
      turn: 3,
      phase: "MAIN1",
      activeSeat: 1,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: [elf, goblin],
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...over,
    },
  });
}
let asked = 0;
function ask(kind: string, objectId: string, extra: Record<string, unknown> = {}) {
  asked += 1;
  send({
    type: "DECISION_REQUEST",
    decisionId: asked,
    actedForSeat: 1,
    stateVersion: revision,
    kind,
    options: [{ actionId: `a${asked}`, label: "Choose it", objectId }],
    prompt: "Choose",
    ...extra,
  });
}

/** jsdom has no PointerEvent: a mouse event of that name, as the page reads it. */
function pointAt(target: Element, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX, clientY }));
  });
}

const castCard = (c: ParentNode) => c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
const centreOf = (el: Element) => {
  const b = styleBox(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};
const cardOnBoard = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!;

function open() {
  const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
  return view.container;
}

describe("the casting card is in the middle of the screen (F-0068-A)", () => {
  it("for paying, a target and an optional cost, and after a resize", () => {
    const c = open();
    board({ casting: [wurm] });
    // Paying with the Elf (under the middle of the table).
    ask("applyManaToCost", elf.id, { owing: "{4}{G}{G}" });
    expect(centreOf(castCard(c)!)).toEqual({ x: 960, y: 947 / 2 });
    // A target on the other side of the table.
    ask("chooseTargets", goblin.id);
    expect(centreOf(castCard(c)!)).toEqual({ x: 960, y: 947 / 2 });
    expect(castCard(c)!.dataset["docked"]).toBeUndefined();
    // Between questions: still the middle.
    send({ type: "DECISION_CLEARED", decisionId: asked });
    expect(centreOf(castCard(c)!)).toEqual({ x: 960, y: 947 / 2 });
    // A bigger window: the new middle.
    size = { width: 2560, height: 1440 };
    act(() => resized.forEach((callback) => callback()));
    expect(centreOf(castCard(c)!)).toEqual({ x: 1280, y: 720 });
  });

  it("for an optional cost asked while it is still in the hand", () => {
    const c = open();
    board({ hand: [wurm] });
    ask("chooseOptionalCosts", wurm.id, { about: { name: "Craw Wurm" } });
    expect(castCard(c)).not.toBeNull();
    expect(centreOf(castCard(c)!)).toEqual({ x: 960, y: 947 / 2 });
  });
});

describe("see-through over what it covers (F-0068-B)", () => {
  it("pointing at the Elf under it fades the card, the click reaches the Elf; off it, solid", () => {
    const c = open();
    board({ casting: [wurm] });
    ask("applyManaToCost", elf.id, { owing: "{4}{G}{G}" });
    const card = castCard(c)!;
    const elfButton = cardOnBoard(c, elf.id);
    expect(elfButton.dataset["choosable"]).toBe("true");
    expect(card.dataset["seeThrough"]).toBeUndefined();
    // The pointer in the middle of the card, on the Elf under it.
    pointAt(elfButton, 960, 470);
    expect(card.dataset["seeThrough"]).toBe("true");
    expect(card.classList.contains("gs-cast-see")).toBe(true);
    // Clicks were never the card's: the Elf is answered.
    act(() => elfButton.click());
    expect(JSON.stringify(socket.answers)).toContain(`a${asked}`);
    // Moved off (on the table, nothing to click): solid again, never moved.
    pointAt(c.querySelector('[data-testid="battlefield"]')!, 960, 470);
    expect(card.dataset["seeThrough"]).toBeUndefined();
    expect(centreOf(card)).toEqual({ x: 960, y: 947 / 2 });
  });

  it("a choosable card outside the card does not fade it; the keyboard's focus on one under it does", () => {
    const c = open();
    board({ casting: [wurm] });
    ask("chooseTargets", goblin.id);
    const card = castCard(c)!;
    const goblinButton = cardOnBoard(c, goblin.id);
    // Pointer on the goblin, but outside the card's box: no fade.
    pointAt(goblinButton, 5, 5);
    expect(card.dataset["seeThrough"]).toBeUndefined();
    // Focus: the goblin's box laid over the card's (jsdom has no layout).
    Object.assign(goblinButton.style, {
      left: "940px",
      top: "450px",
      width: "60px",
      height: "80px",
    });
    act(() => goblinButton.focus());
    expect(card.dataset["seeThrough"]).toBe("true");
    act(() => goblinButton.blur());
    expect(card.dataset["seeThrough"]).toBeUndefined();
  });
});

describe("the question's window beside the centred card (F-0068-B)", () => {
  const g = layoutGeometry({ width: 1920, height: 1080 });
  const middle = castingBox(g);
  const stack = stackSpotBoxes(g, 1)[0]!;
  const empty = { hand: [] } as unknown as Snapshot;
  const asking = (ids: string[]) =>
    ({ onBoard: new Map(ids.map((id) => [id, []])), listed: [] }) as unknown as Question;
  const covers = (a: { x: number; y: number; w: number; h: number }, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("sits on its left when nothing to click is there", () => {
    const anchor = castingWindowAnchor(middle, "card:3", asking([]), empty, g, stack, () => null);
    expect(anchor.side ?? "left").toBe("left");
  });

  it("goes to its right when its left would hide the creature to target", () => {
    const left = bubbleBox({ ...middle, side: "left" }, g);
    const sliver: Box = { ...middle, x: left.x + left.w - 60, y: left.y + 30, w: 98, h: 137 };
    const anchor = castingWindowAnchor(
      middle,
      "card:3",
      asking(["card:9"]),
      empty,
      g,
      stack,
      (id) => (id === "card:9" ? sliver : null),
    );
    expect(anchor.side).toBe("right");
    expect(covers(bubbleBox(anchor, g), sliver)).toBe(false);
    // The card itself has not moved.
    expect({ x: anchor.x, y: anchor.y }).toEqual({ x: middle.x, y: middle.y });
  });
});

describe("the other player's reveal is held in the middle (F-0068-C)", () => {
  it("turns over in the middle, is held there, then flies to the stack from there", () => {
    vi.useFakeTimers();
    const c = open();
    const bolt = {
      id: "card:50",
      seat: 2,
      name: "Lightning Bolt",
      kind: "instant",
      types: "Instant",
      known: true,
      manaCost: "{R}",
    };
    board({ casting: [{ ...bolt, faceDown: true, known: false, name: "Face-down" }] });
    const back = castCard(c)!;
    expect(back.querySelector(".gs-cast-back")).not.toBeNull();
    expect(centreOf(back)).toEqual({ x: 960, y: 947 / 2 });
    // Cast: on the stack. (Bob's hand did not grow: not cancelled.)
    board({
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      stack: [
        { id: "stack:1", source: bolt.id, name: "Lightning Bolt", controller: 2, kind: "spell" },
      ],
    });
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(leaving).not.toBeNull();
    expect(leaving.querySelector(".gs-cast-turn")).not.toBeNull();
    expect(centreOf(leaving)).toEqual({ x: 960, y: 947 / 2 });
    const moves = () =>
      animations.filter(
        (a) =>
          a.element === leaving && a.frames.some((f) => String(f.transform).includes("translate")),
      );
    act(() => void vi.advanceTimersByTime(FLIP_MS + HOLD_MS - 10));
    expect(moves()).toHaveLength(0); // held, still in the middle
    act(() => void vi.advanceTimersByTime(20));
    expect(moves()).toHaveLength(1); // then off to the stack, from the middle
    expect(centreOf(leaving)).toEqual({ x: 960, y: 947 / 2 });
  });
});

describe("the obsidian pointer on the game screen (F-0068-D)", () => {
  it("on the table, cards and buttons, disabled ones too; text boxes keep the text cursor", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(join(__dirname, "game.css"), "utf8");
    document.head.append(style);
    try {
      const c = render(
        <div>
          <section className="gs-screen">
            <div className="bf-table" />
            <button type="button">Pass</button>
            <button type="button" disabled>
              Attack
            </button>
            <input type="text" aria-label="Say" />
            <textarea aria-label="Chat" />
          </section>
          <main className="lobby">
            <button type="button">Join</button>
          </main>
        </div>,
      ).container;
      const cursor = (el: Element) => getComputedStyle(el).cursor;
      const screen = c.querySelector(".gs-screen")!;
      for (const el of [screen, ...screen.querySelectorAll("div, button")]) {
        expect(cursor(el)).toContain("data:image/svg+xml");
        // The tip (2, 2) is the click point; no picture, the normal arrow.
        expect(cursor(el)).toMatch(/"\)\s+2 2,\s+auto$/);
      }
      // The canvas's D: an obsidian fill, a gold edge, the arrow's outline.
      const svg = decodeURIComponent(cursor(screen).split(",")[1]!.split('")')[0]!);
      expect(svg).toContain('d="M2 2 L2 24 L8 18.6 L12.2 28.2 L16.4 26.4 L12.3 17.2 L20 17.2 Z"');
      expect(svg).toContain('fill="url(#o)" stroke="url(#e)"');
      expect(svg).toContain('stop-color="#151a20"');
      expect(svg).toContain('stop-color="#e0a44a"');
      expect(cursor(screen.querySelector("input")!)).toBe("text");
      expect(cursor(screen.querySelector("textarea")!)).toBe("text");
      // The lobby and other pages keep theirs.
      expect(cursor(c.querySelector(".lobby button")!)).not.toContain("data:image");
    } finally {
      style.remove();
    }
  });
});
