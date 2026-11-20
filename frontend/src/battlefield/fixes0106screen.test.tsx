// @vitest-environment jsdom

// Spec 0106 -- the pace and the pile fan, on the real game screen (its socket
// replaced, handed the boards the worker sends; TEST-003).
//
// F-0106-B: the style sheets' pace. The game screen's root carries
// `--pa-pace`, set from motion.ts's PACE (so the two cannot drift); a
// movement in the sheets is its canvas time times that, and a looping glow
// is not. jsdom does not apply the style sheets (vitest leaves CSS out), so
// the sheets' declarations are read as text and evaluated at the root's
// pace; a card's glide, a Web Animation, is measured on the real screen.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as (string | null)[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_decisionId: number, actionId: string | null) => socket.answers.push(actionId),
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      reportsClosed: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");
const { STACK_IN_MS } = await import("./Board");
const { MOVE_MS, PACE, SETTLE_MS, paced } = await import("./motion");
const { FAN_MORE_MS, FAN_RISE_MS } = await import("./FanCards");
const { MILL_BEAT_MS, MILL_MS } = await import("./graves");

type Recorded = { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions };
let animations: Recorded[] = [];
let clock = 0;
beforeEach(() => {
  animations = [];
  socket.answers = [];
  clock = 1000;
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("CSSAnimation", class {});
  vi.stubGlobal("CSSTransition", class {});
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
    options?: number | KeyframeAnimationOptions,
  ) {
    const animation = {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null as null | (() => void),
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }), updateTiming() {} },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
    animations.push({
      element: this,
      frames,
      options: typeof options === "number" ? { duration: options } : (options ?? {}),
    });
    return animation;
  };
  (Element.prototype as { getAnimations?: unknown }).getAnimations = () => [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 1080,
});

const match = {
  matchId: "m-106",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

let revision = 0;
function send(state: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) => reduceMatch(previous, { type: "MATCH_SNAPSHOT", state })),
  );
}
function state(seat: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 5,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    seat,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 41 },
      { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 44 },
    ],
    battlefield: [],
    hand: [],
    otherHands: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    moves: [],
    ...over,
  };
}
const open = (me: string) =>
  render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
const advance = (ms: number) => {
  clock += ms;
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const forest = {
  id: "card:40",
  seat: 1,
  owner: 1,
  name: "Forest",
  kind: "land",
  types: "Basic Land — Forest",
  tapped: false,
  faceDown: false,
  known: true,
  power: null,
  toughness: null,
  manaCost: null,
  art: null,
};

// --- the style sheets, as text ---------------------------------------------------------------

const sheet = (name: string) => readFileSync(resolve(__dirname, name), "utf8");
/** The declaration `prop: ...;` in the first rule whose selector is exactly `selector` that has one. */
function declared(css: string, selector: string, prop: string): string {
  let at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  while (at >= 0) {
    const body = css.slice(at, css.indexOf("}", at));
    const m = new RegExp(`\\s${prop}:\\s*([^;]+);`).exec(body);
    if (m) return m[1]!.replace(/\s+/g, " ").trim();
    at = css.indexOf(`\n${selector} {`, at + 1);
  }
  throw new Error(`${selector} has no ${prop}`);
}
/** The first time in a declaration, in ms, at a root pace of `pace` (calc(T * var(--pa-pace, 1))). */
function firstMs(value: string, pace: number): number {
  const paced = /calc\((\d*\.?\d+)(ms|s) \* var\(--pa-pace, 1\)\)/.exec(value);
  const bare = /(?<![\w.(-])(\d*\.?\d+)(ms|s)\b/.exec(value);
  const m = paced ?? bare!;
  const ms = Number(m[1]) * (m[2] === "s" ? 1000 : 1);
  return paced ? ms * pace : ms;
}

describe("F-0106-B · the style sheets read the table's pace from the game screen", () => {
  it("the game screen's root carries --pa-pace, from PACE", () => {
    const c = open("u-1");
    send(state(1, { battlefield: [] }));
    const root = c.querySelector<HTMLElement>(".gs-screen")!;
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue("--pa-pace")).toBe(String(PACE));
    expect(Number(root.style.getPropertyValue("--pa-pace"))).toBe(1.25);
  });

  it("a movement in the sheets is 1.25x its canvas time; a looping glow is not", () => {
    const c = open("u-1");
    send(state(1, { battlefield: [] }));
    const pace = Number(
      c.querySelector<HTMLElement>(".gs-screen")!.style.getPropertyValue("--pa-pace"),
    );
    const bf = sheet("battlefield.css");
    // A stack card with no card to rise from slides in (spec 0066): 260 ms on the canvas.
    const slide = declared(bf, ".bf-stack-slot", "animation");
    expect(slide).toContain("calc(260ms * var(--pa-pace, 1))");
    expect(firstMs(slide, pace)).toBe(325);
    // ...the same length as the page's own clock for it (Board's STACK_IN_MS).
    expect(firstMs(slide, pace)).toBe(STACK_IN_MS);
    // The cast card's glide to the stack (game.css .gs-cast): 0.38 s on the canvas.
    const cast = declared(sheet("game.css"), ".gs-cast", "transition");
    expect(firstMs(cast, pace)).toBeCloseTo(380 * 1.25, 6);
    // A flyer's endless bob is a loop: not paced.
    const bob = declared(bf, ".bf-flight.bf-fly", "animation");
    expect(bob).not.toContain("--pa-pace");
    expect(firstMs(bob, pace)).toBe(5000);
  });

  it("the settle the page hands the sheet is the canvas's, paced by the sheet (so reduce motion reaches it)", () => {
    const c = open("u-1");
    send(state(1, { battlefield: [] }));
    const cards = c.querySelector<HTMLElement>(".bf-cards")!;
    const base = parseFloat(cards.style.getPropertyValue("--move-ms"));
    expect(base).toBe(250);
    expect(paced(base)).toBe(SETTLE_MS);
    expect(sheet("battlefield.css")).toContain(
      "transform calc(var(--move-ms, 320ms) * var(--pa-pace, 1)) var(--move-easing, ease)",
    );
  });

  it("with reduce motion the sheets are not paced (what still plays is no movement to slow)", () => {
    const css = sheet("game.css");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.gs-screen \{\s*--pa-pace: 1 !important;/,
    );
  });

  it("a card's glide on the real screen is the paced MOVE_MS (450 ms on the canvas)", () => {
    const c = open("u-1");
    send(state(1, { hand: [forest] }));
    advance(2000);
    animations = [];
    send(
      state(1, {
        battlefield: [forest],
        moves: [
          {
            card: forest.id,
            from: { zone: "hand", seat: 1 },
            to: { zone: "battlefield", seat: 1 },
          },
        ],
      }),
    );
    const glides = animations.filter(
      (a) =>
        a.element.querySelector(`[data-object-id="${forest.id}"]`) !== null &&
        Number(a.options.duration) === MOVE_MS,
    );
    expect(glides.length).toBeGreaterThan(0);
    expect(MOVE_MS).toBe(paced(450));
    expect(MOVE_MS).toBe(563);
    expect(c.querySelector(`[data-object-id="${forest.id}"]`)).toBeTruthy();
  });
});

// --- F-0106-F: the fan's "+N" opens the pile viewer -------------------------------------------

/** A card in Alice's pile that the game says she may cast from there. */
const pileCard = (id: string, name: string, at: number, extra: Record<string, unknown> = {}) => ({
  id,
  seat: 1,
  owner: 1,
  name,
  kind: "other",
  types: "Instant",
  tapped: false,
  faceDown: false,
  known: true,
  power: null,
  toughness: null,
  manaCost: "{1}{U}",
  art: null,
  enteredAt: at,
  uses: [{ seat: 1, how: "cast" }],
  ...extra,
});

const yourMove = (seat: number, decisionId: number, options: Record<string, unknown>[]) =>
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "DECISION_REQUEST",
        decisionId,
        actedForSeat: seat,
        authorisedSeat: seat,
        kind: "chooseSpellAbilityToPlay",
        stateVersion: revision,
        options,
      }),
    ),
  );
const asked = () =>
  screen
    .queryAllByRole("heading", { name: /Your move/ })
    .filter((h) => !h.classList.contains("pa-visually-hidden"))[0] ?? null;
const cast = (id: string) => ({
  actionId: `${id}/flashback`,
  label: "Think Twice — Flashback {2}{U}",
  objectId: id,
  payable: true,
});

describe("F-0106-F · the fan's +N opens the pile viewer, on the real game screen", () => {
  // Nine cards Alice may cast: seven in her graveyard (the oldest three
  // behind the "+N"), two in her exile.
  const graveyard = Array.from({ length: 7 }, (_, i) =>
    pileCard(`card:${60 + i}`, `Think Twice ${i + 1}`, i + 1),
  );
  const exile = [pileCard("card:70", "Lava Dart", 8), pileCard("card:71", "Bonecrusher Giant", 9)];

  it("Alice's +3 stands in the last place; a click opens her graveyard", () => {
    const c = open("u-1");
    send(state(1, { graveyard, exile }));
    advance(4000);
    const fan = [...c.querySelectorAll<HTMLElement>('[data-fan-side="viewer"][data-fan-card]')];
    expect(fan).toHaveLength(6);
    // The three oldest are behind the "+N", not drawn.
    for (const id of ["card:60", "card:61", "card:62"])
      expect(c.querySelector(`[data-fan-card="${id}"]`)).toBeNull();
    const more = c.querySelector<HTMLElement>('[data-fan-more="viewer"]')!;
    expect(more).toBeTruthy();
    expect(more.dataset["fanCount"]).toBe("3");
    const button = more.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-label")).toBe("3 more cards you may play: open the pile");
    expect(button.textContent).toBe("+3");
    expect(c.querySelector(".gs-viewer")).toBeNull();
    act(() => button.click());
    const viewer = c.querySelector<HTMLElement>(".gs-viewer")!;
    expect(viewer).toBeTruthy();
    expect(viewer.getAttribute("aria-label")).toBe("Your graveyard");
    expect(viewer.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain(
      "Your graveyard",
    );
    // The hidden cards are there to see.
    expect(viewer.textContent).toContain("Think Twice 1");
  });

  it("the +N pops in only after the fan's new cards have risen, never ahead of them", () => {
    const c = open("u-1");
    send(state(1, {}));
    advance(4000);
    animations = [];
    send(state(1, { graveyard, exile }));
    const more = c.querySelector<HTMLElement>('[data-fan-more="viewer"]')!;
    const pop = animations.filter((a) => a.element === more);
    expect(pop).toHaveLength(1);
    expect(pop[0]!.options.duration).toBe(FAN_MORE_MS);
    expect(pop[0]!.options.fill).toBe("backwards");
    const rises = animations.filter(
      (a) =>
        (a.element as HTMLElement).dataset?.["fanCard"] !== undefined &&
        a.options.duration === FAN_RISE_MS,
    );
    expect(rises.length).toBe(6);
    const lastRise = Math.max(...rises.map((a) => Number(a.options.delay ?? 0) + FAN_RISE_MS));
    expect(Number(pop[0]!.options.delay)).toBeGreaterThanOrEqual(lastRise);
    // A board later, with the "+N" still there: no second pop.
    advance(4000);
    animations = [];
    send(state(1, { graveyard, exile, turn: 6 }));
    expect(animations.filter((a) => a.element === more)).toHaveLength(0);
  });

  it("Enter on the +N opens it too (it is a button)", () => {
    const c = open("u-1");
    send(state(1, { graveyard, exile }));
    advance(4000);
    const button = c.querySelector<HTMLButtonElement>('[data-fan-more="viewer"] button')!;
    // A button's Enter is its click (the browser's own); jsdom does not
    // synthesize it, so assert it is a real, focusable button with no
    // handler on keys of its own to break that.
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    button.focus();
    expect(document.activeElement).toBe(button);
    act(() => button.click());
    expect(c.querySelector(".gs-viewer")).toBeTruthy();
  });

  it("Amendment 1: a card behind the +N opens no window; it breathes in the viewer, and a click there plays it", () => {
    const c = open("u-1");
    send(state(1, { graveyard, exile }));
    advance(4000);
    // The oldest graveyard cards are behind the "+N": no window for them.
    yourMove(1, 31, [cast("card:66"), cast("card:60"), { ...cast("card:61"), payable: false }]);
    expect(asked()).toBeNull();
    act(() => c.querySelector<HTMLButtonElement>('[data-fan-more="viewer"] button')!.click());
    const viewer = c.querySelector<HTMLElement>(".gs-viewer")!;
    const hidden = viewer.querySelector<HTMLElement>('[data-object-id="card:60"]')!;
    expect(hidden.classList.contains("gs-castable")).toBe(true);
    expect(hidden.dataset["choosable"]).toBe("true");
    expect(hidden.getAttribute("aria-label")).toContain("you may play it now");
    // One it cannot pay for now does not breathe (as on the table).
    const dim = viewer.querySelector<HTMLElement>('[data-object-id="card:61"]')!;
    expect(dim.classList.contains("gs-castable")).toBe(false);
    // One with no play now does not either.
    const none = viewer.querySelector<HTMLElement>('[data-object-id="card:62"]')!;
    expect(none.classList.contains("gs-castable")).toBe(false);
    fireEvent.click(hidden);
    expect(socket.answers).toEqual(["card:60/flashback"]);
    expect(c.querySelector(".gs-viewer")).toBeNull();
  });

  it("Amendment 1: the other player's pile has nothing castable for you, unless a card lets you", () => {
    // Alice's Lava Dart in her exile, that Bob may cast (a Gonti-like effect).
    const theirs = pileCard("card:95", "Lava Dart", 20, { uses: [{ seat: 2, how: "cast" }] });
    const plain = pileCard("card:96", "Think Twice", 21);
    const many = Array.from({ length: 7 }, (_, i) =>
      pileCard(`card:${70 + i}`, `Spell ${i + 1}`, 30 + i),
    );
    const c = open("u-2");
    send(state(2, { exile: [theirs, plain], graveyard: many }));
    advance(4000);
    yourMove(2, 41, [cast("card:95")]);
    expect(asked()).toBeNull();
    act(() => c.querySelector<HTMLButtonElement>('[data-fan-more="opponent"] button')!.click());
    const tab = (name: string) =>
      [...c.querySelectorAll<HTMLButtonElement>('.gs-viewer [role="tab"]')].find((t) =>
        t.textContent!.startsWith(name),
      )!;
    act(() => tab("Alice's exile").click());
    const viewer = c.querySelector<HTMLElement>(".gs-viewer")!;
    expect(viewer.getAttribute("aria-label")).toBe("Alice's exile");
    const lets = viewer.querySelector<HTMLElement>('[data-object-id="card:95"]')!;
    expect(lets.classList.contains("gs-castable")).toBe(true);
    const hers = viewer.querySelector<HTMLElement>('[data-object-id="card:96"]')!;
    expect(hers.classList.contains("gs-castable")).toBe(false);
    // Her graveyard: nothing of it Bob's to play.
    act(() => tab("Alice's graveyard").click());
    expect(c.querySelectorAll(".gs-viewer .gs-castable")).toHaveLength(0);
  });

  it("Amendment 1: a fan card shows its whole name and no mana cost", () => {
    const c = open("u-1");
    send(state(1, { graveyard: graveyard.slice(0, 3) }));
    advance(4000);
    const card = c.querySelector<HTMLElement>('[data-fan-card="card:60"]')!;
    expect(card.querySelector(".bf-cost-first")).toBeNull();
    expect(card.querySelector(".bf-bar-top")!.textContent).toBe("Think Twice 1");
    const name = card.querySelector<HTMLElement>(".bf-name")!;
    // Fitted (smaller until it fits), as a stack card's name.
    expect(name.dataset["fit"]).toBe("true");
  });

  it("Amendment 1: a step passed through re-sends the board drawn; its mill is not played again", () => {
    open("u-1");
    send(state(1, {}));
    advance(4000);
    const milled = graveyard.slice(0, 7);
    animations = [];
    send(
      state(1, {
        graveyard: milled,
        moves: milled.map((card) => ({
          card: card.id,
          from: { zone: "library", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
        })),
      }),
    );
    const counted = () =>
      animations.filter((a) => a.element.classList.contains("gs-zone-n")).length;
    expect(counted()).toBeGreaterThan(0);
    advance(400);
    animations = [];
    // PriorityStops: the game passes a step nobody is asked at (MATCH_STEP),
    // the same board again with the step moved on.
    act(() =>
      socket.onState!((previous) =>
        reduceMatch(previous, {
          type: "MATCH_STEP",
          state: { gameEpoch: 1, turn: 5, phase: "MAIN1", activeSeat: 1, prioritySeat: 2 },
        }),
      ),
    );
    expect(counted()).toBe(0);
    // ...and no milled card flies again (a mill ghost carries the card's id).
    const ghosts = animations.filter((a) =>
      milled.some((card) => (a.element as HTMLElement).dataset?.["ghostOf"] === card.id),
    );
    expect(ghosts).toHaveLength(0);
  });

  it("Amendment 1: the fan waits for what an earlier board is still bringing to the graveyard", () => {
    open("u-1");
    send(state(1, {}));
    advance(4000);
    // Board 1: seven cards milled from the library, none usable yet.
    const milled = graveyard.slice(0, 7).map((card) => ({ ...card, uses: [] }));
    animations = [];
    send(
      state(1, {
        graveyard: milled,
        moves: milled.map((card) => ({
          card: card.id,
          from: { zone: "library", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
        })),
      }),
    );
    // Board 2, a moment later: the same cards, now usable -- the fan's cards.
    advance(100);
    animations = [];
    send(state(1, { graveyard: graveyard.slice(0, 7) }));
    const rises = animations.filter(
      (a) =>
        (a.element as HTMLElement).dataset?.["fanCard"] !== undefined &&
        a.options.duration === FAN_RISE_MS,
    );
    expect(rises.length).toBe(7);
    // The last milled card lands 6 beats after the first, a whole mill later.
    const last = 6 * MILL_BEAT_MS + MILL_MS;
    for (const r of rises) expect(Number(r.options.delay)).toBeGreaterThanOrEqual(last);
  });

  it("Bob's view: Alice's +N opens her exile, her foretold cards as backs (HID-005)", () => {
    // Bob sees Alice's foretold cards as the worker sends them to him: no name.
    const back = { known: false, faceDown: true, name: "Face-down", kind: "unknown", types: "" };
    const foretold = Array.from({ length: 7 }, (_, i) =>
      pileCard(`card:${80 + i}`, "Face-down", i + 1, { ...back, foretold: true }),
    );
    const grave = [pileCard("card:90", "Think Twice", 10), pileCard("card:91", "Lava Dart", 11)];
    const c = open("u-2");
    send(state(2, { graveyard: grave, exile: foretold }));
    advance(4000);
    const more = c.querySelector<HTMLElement>('[data-fan-more="opponent"]')!;
    expect(more).toBeTruthy();
    expect(more.dataset["fanCount"]).toBe("3");
    expect(more.dataset["fanZone"]).toBe("exile");
    const button = more.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-label")).toBe("3 more cards Alice may play: open the pile");
    act(() => button.click());
    const viewer = c.querySelector<HTMLElement>(".gs-viewer")!;
    expect(viewer.getAttribute("aria-label")).toBe("Alice's exile");
    const cards = [...viewer.querySelectorAll<HTMLElement>(".gs-ztray-card")];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.textContent).toContain("Face down");
    expect(viewer.querySelector("img")).toBeNull();
  });
});
