// @vitest-environment jsdom

// Spec 0072 -- the other player's spells rise from where they are cast
// (F-0072-A, B, C, E). The real game screen, its socket replaced: the test
// hands it the server's messages itself, as the worker sends them (the
// round's `moves`, Bob's hand count; never which of his hidden cards).

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { MOVE_MS, anchors } from "./motion";
import { geometry as layoutGeometry } from "./layout";

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

type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  rate: number[];
};
const size = { width: 1920, height: 947 };
let animations: Recorded[] = [];
let reduce = false;
beforeEach(() => {
  animations = [];
  reduce = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduce : false,
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
  // Animations are recorded and never finish on their own; each can be
  // hurried (Phase 10 A-00) like a real one.
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    const record: Recorded = {
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
      rate: [],
    };
    animations.push(record);
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: {
        getComputedTiming: () => ({
          endTime: Number(record.options.duration ?? 0) + Number(record.options.delay ?? 0),
          iterations: record.options.iterations ?? 1,
        }),
      },
      updatePlaybackRate: (rate: number) => record.rate.push(rate),
    } as unknown as Animation;
  };
  // As in a browser: a card whose place just changed has a running CSS
  // transition (its transform), so it reads as "still moving".
  (Element.prototype as { getAnimations?: unknown }).getAnimations = function (this: Element) {
    return (this as HTMLElement).classList?.contains("bf-slot")
      ? [{ playState: "running", id: "", cancel() {} }]
      : [];
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
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

const bolt = {
  id: "card:50",
  seat: 2,
  name: "Lightning Bolt",
  kind: "instant",
  types: "Instant",
  known: true,
  manaCost: "{R}",
};
const think = {
  id: "card:60",
  seat: 2,
  name: "Think Twice",
  kind: "instant",
  types: "Instant",
  known: true,
  manaCost: "{1}{U}",
};
const elf = {
  id: "card:70",
  seat: 1,
  name: "Llanowar Elves",
  kind: "creature",
  types: "Creature — Elf Druid",
  known: true,
  manaCost: "{G}",
};

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(bobHand: number, over: Record<string, unknown> = {}) {
  revision += 1;
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 3,
      phase: "MAIN1",
      activeSeat: 2,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: bobHand, libraryCount: 50 },
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
    },
  });
}
const toStack = (card: string, zone: string, seat: number) => ({
  card,
  from: { zone, seat },
  to: { zone: "stack" },
  why: null,
});

function open() {
  return render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
}

const castCard = (c: ParentNode) => c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
const slotOf = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!.closest<HTMLElement>(".bf-slot")!;
const restOf = (el: HTMLElement) => {
  const s = el.style;
  return {
    x: parseFloat(s.left),
    y: parseFloat(s.top),
    w: parseFloat(s.width),
    h: parseFloat(s.height),
  };
};
const numbers = (text: string) =>
  (text.replace("translate3d", "translate").match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);

/** Where a table card is drawn by a transform (the Board's own slots and Glides): centre, width. */
function drawn(transform: string, origin: string, w: number, h: number) {
  const [tx, ty, , r, s] = numbers(transform) as [number, number, number, number, number];
  const [ox, oy] = numbers(origin) as [number, number];
  const a = (r * Math.PI) / 180;
  const vx = (w / 2 - ox) * s;
  const vy = (h / 2 - oy) * s;
  return {
    x: ox + tx + vx * Math.cos(a) - vy * Math.sin(a),
    y: oy + ty + vx * Math.sin(a) + vy * Math.cos(a),
    w: w * s,
  };
}
const slotDrawn = (slot: HTMLElement, transform = slot.style.transform) =>
  drawn(
    transform,
    slot.style.transformOrigin,
    parseFloat(slot.style.width),
    parseFloat(slot.style.height),
  );
/** Where the casting card (or its flight) is drawn by one of its frames: centre, width. */
function castDrawn(el: HTMLElement, frame: Keyframe) {
  const rest = restOf(el);
  const [x, y, , s] = numbers(String(frame.transform)) as [number, number, number, number];
  return { x: rest.x + rest.w / 2 + x, y: rest.y + rest.h / 2 + y, w: rest.w * s };
}
const glidesOf = (el: Element) =>
  animations.filter((a) => a.element === el && String(a.frames[0]?.transform).includes("("));
const expectNear = (
  a: { x: number; y: number; w: number },
  b: { x: number; y: number; w: number },
) => {
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.y).toBeCloseTo(b.y, 1);
  expect(a.w).toBeCloseTo(b.w, 1);
};

describe("Bob casts from his hand: it rises from the middle of his fan (F-0072-A)", () => {
  it("a back leaves the middle back's place, glides to the middle; the fan closes on the gap", () => {
    const c = open();
    board(6);
    // His fan of six, as drawn: the middle one (index 2) and the last.
    const middle = slotDrawn(slotOf(c, "hidden-hand:2:2"));
    const third = slotDrawn(slotOf(c, "hidden-hand:2:3"));
    const last = slotDrawn(slotOf(c, "hidden-hand:2:5"));
    // As in a browser: each back is still drawn where it was when the new
    // board starts its CSS transition (what placedNow reads).
    const wasDrawn = new Map(
      [...c.querySelectorAll<HTMLElement>(".bf-slot")].map((el) => [el, el.style.transform]),
    );
    vi.stubGlobal("getComputedStyle", (el: HTMLElement) => ({
      transform: wasDrawn.get(el) ?? el.style.transform,
    }));
    vi.stubGlobal(
      "DOMMatrixReadOnly",
      class {
        a: number;
        b: number;
        e: number;
        f: number;
        constructor(text: string) {
          const [x, y, , r, s] = numbers(text) as [number, number, number, number, number];
          const t = (r * Math.PI) / 180;
          [this.a, this.b, this.e, this.f] = [s * Math.cos(t), s * Math.sin(t), x, y];
        }
      },
    );
    animations = [];
    board(5, { casting: [bolt], moves: [toStack(bolt.id, "hand", 2)] });
    const card = castCard(c)!;
    expect(card).not.toBeNull();
    // Its back, and who is casting; no fade in on the spot.
    expect(card.querySelector(".gs-cast-back")).not.toBeNull();
    expect(card.textContent).toContain("Bob is casting a spell");
    expect(card.classList.contains("gs-cast-glide")).toBe(true);
    // The A-00 Glide: 450 ms, linear over sampled frames (the easing in them).
    const [rise] = glidesOf(card);
    expect(rise).toBeDefined();
    expect(rise!.options.duration).toBe(MOVE_MS);
    expect(rise!.options.easing).toBe("linear");
    expect(rise!.frames).toHaveLength(21);
    // Starts exactly where the middle back was drawn, ends in the middle, solid all the way.
    expectNear(castDrawn(card, rise!.frames[0]!), middle);
    expectNear(castDrawn(card, rise!.frames[20]!), {
      ...restOf(card),
      x: restOf(card).x + restOf(card).w / 2,
      y: restOf(card).y + restOf(card).h / 2,
    });
    expect(rise!.frames.every((f) => f.opacity === undefined)).toBe(true);
    // Mid-way it bows up the screen (towards the top of the table, where he sits).
    const mid = castDrawn(card, rise!.frames[10]!);
    const straight = (middle.x + castDrawn(card, rise!.frames[20]!).x) / 2;
    expect(Math.abs(mid.x - straight)).toBeGreaterThan(0.5);
    // The fan closes: five backs; the one now at index 2 sets off from where
    // index 3 was, the last from where the sixth was (no back vanishes at
    // the end, none doubles in the middle).
    expect(c.querySelector('[data-object-id="hidden-hand:2:5"]')).toBeNull();
    // ... and no ghost of a back leaves for his graveyard: it IS the cast card.
    expect(c.querySelector('[data-ghost-of^="hidden-hand"]')).toBeNull();
    const two = slotOf(c, "hidden-hand:2:2");
    const four = slotOf(c, "hidden-hand:2:4");
    expectNear(slotDrawn(two, String(glidesOf(two)[0]!.frames[0]!.transform)), third);
    expectNear(slotDrawn(four, String(glidesOf(four)[0]!.frames[0]!.transform)), last);
    // No hidden id is used: the cast card carries only its own, public, id.
    expect(card.outerHTML).not.toContain("hidden-hand");
    expect(card.dataset["objectId"]).toBe(bolt.id);
  });

  it("a spectator sees the same: Bob's from his fan, Alice's (no fan drawn) from her hand's place", () => {
    const c = open();
    const spectate = (bobHand: number, over: Record<string, unknown> = {}) =>
      board(bobHand, { spectator: true, viewFrom: 1, seat: 0, ...over });
    spectate(6);
    const middle = slotDrawn(slotOf(c, "hidden-hand:2:2"));
    animations = [];
    spectate(5, { casting: [bolt], moves: [toStack(bolt.id, "hand", 2)] });
    const card = castCard(c)!;
    expect(card.querySelector(".gs-cast-back")).not.toBeNull();
    expectNear(castDrawn(card, glidesOf(card)[0]!.frames[0]!), middle);
    // Bob's spell resolved; then Alice casts.
    spectate(5, { graveyard: [bolt] });
    animations = [];
    spectate(5, {
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      graveyard: [bolt],
      casting: [elf],
      moves: [toStack(elf.id, "hand", 1)],
    });
    const hers = castCard(c)!;
    expect(hers.dataset["objectId"]).toBe(elf.id);
    expect(hers.querySelector(".gs-cast-back")).not.toBeNull();
    const g = layoutGeometry(size);
    const hand = anchors(g)["viewer:hand"];
    expectNear(castDrawn(hers, glidesOf(hers)[0]!.frames[0]!), { ...hand, w: g.cardW });
  });
});

describe("flashback from his graveyard rises face up (F-0072-B)", () => {
  it("from the graveyard pile, face up the whole way; committed, it goes to the stack with no turn", () => {
    const c = open();
    board(5, { graveyard: [think] });
    animations = [];
    board(5, { graveyard: [], casting: [think], moves: [toStack(think.id, "graveyard", 2)] });
    const card = castCard(c)!;
    expect(card.querySelector(".gs-cast-back")).toBeNull();
    expect(card.getAttribute("aria-label")).toBe("Being cast: Think Twice");
    expect(card.textContent).not.toContain("is casting a spell");
    const g = layoutGeometry(size);
    const pile = anchors(g)["opponent:graveyard"];
    const rise = glidesOf(card)[0]!;
    expectNear(castDrawn(card, rise.frames[0]!), { ...pile, w: g.cardW * 0.3 });
    expect(rise.options.duration).toBe(MOVE_MS);
    // Paid: on the stack. It does not turn over (it was never face down).
    board(5, {
      stack: [
        { id: "stack:1", source: think.id, name: "Think Twice", controller: 2, kind: "spell" },
      ],
      moves: [],
    });
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(leaving).not.toBeNull();
    expect(leaving.querySelector(".gs-cast-turn")).toBeNull();
    expect(leaving.querySelector(".gs-cast-back")).toBeNull();
  });
});

describe("cancelled, it goes back where it came from (F-0072-C)", () => {
  it("into his hand: the Glide back to his fan's new back, which makes the same Glide fading in", () => {
    const c = open();
    board(6);
    board(5, { casting: [bolt], moves: [toStack(bolt.id, "hand", 2)] });
    animations = [];
    // He cancelled: the card is back in his hand (no move from the stack).
    board(6);
    const going = c.querySelector<HTMLElement>('.gs-cast-leaving[data-going="back"]')!;
    expect(going).not.toBeNull();
    expect(going.querySelector(".gs-cast-back")).not.toBeNull();
    const back = slotOf(c, "hidden-hand:2:5");
    const [flight] = glidesOf(going);
    const [arrive] = glidesOf(back);
    expect(flight!.options.duration).toBe(MOVE_MS);
    expect(arrive!.options.duration).toBe(MOVE_MS);
    // Both on one path, frame by frame: the card fading out, the back in.
    for (const k of [0, 5, 10, 15, 20]) {
      expectNear(
        castDrawn(going, flight!.frames[k]!),
        slotDrawn(back, String(arrive!.frames[k]!.transform)),
      );
      expect(Number(flight!.frames[k]!.opacity) + Number(arrive!.frames[k]!.opacity)).toBeCloseTo(
        1,
        5,
      );
    }
    // The hand-over is late, near the fan (an upright back to his upside-down
    // one): solid until three quarters of the way.
    expect(Number(flight!.frames[15]!.opacity)).toBe(1);
    expect(Number(arrive!.frames[15]!.opacity)).toBe(0);
    // From the middle, at full size; landing exactly on the new back.
    expectNear(castDrawn(going, flight!.frames[0]!), {
      x: restOf(going).x + restOf(going).w / 2,
      y: restOf(going).y + restOf(going).h / 2,
      w: restOf(going).w,
    });
    expectNear(castDrawn(going, flight!.frames[20]!), slotDrawn(back));
    expect(going.outerHTML).not.toContain("hidden-hand");
  });

  it("into his graveyard: back to the pile, face up", () => {
    const c = open();
    board(5, { graveyard: [think] });
    board(5, { graveyard: [], casting: [think], moves: [toStack(think.id, "graveyard", 2)] });
    animations = [];
    board(5, { graveyard: [think] });
    const going = c.querySelector<HTMLElement>('.gs-cast-leaving[data-going="back"]')!;
    expect(going).not.toBeNull();
    expect(going.querySelector(".gs-cast-back")).toBeNull();
    const g = layoutGeometry(size);
    const pile = anchors(g)["opponent:graveyard"];
    const [flight] = glidesOf(going);
    expectNear(castDrawn(going, flight!.frames[20]!), { ...pile, w: g.cardW * 0.3 });
    expect(Number(flight!.frames[20]!.opacity)).toBeLessThan(0.5);
  });

  it("a spell that resolved back into his graveyard is not taken for a cancel", () => {
    const c = open();
    board(6);
    board(5, { casting: [bolt], moves: [toStack(bolt.id, "hand", 2)] });
    board(5, {
      graveyard: [bolt],
      moves: [{ card: bolt.id, from: { zone: "stack" }, to: { zone: "graveyard", seat: 2 } }],
    });
    expect(c.querySelector('.gs-cast-leaving[data-going="back"]')).toBeNull();
  });
});

describe("reduce motion, and a click hurries it (F-0072-E)", () => {
  it("reduce motion: no glide, it appears in the middle as today; cancelled, it is simply back", () => {
    reduce = true;
    const c = open();
    board(6);
    animations = [];
    board(5, { casting: [bolt], moves: [toStack(bolt.id, "hand", 2)] });
    const card = castCard(c)!;
    expect(card).not.toBeNull();
    expect(glidesOf(card)).toHaveLength(0);
    expect(card.classList.contains("gs-cast-glide")).toBe(false);
    board(6);
    expect(c.querySelector('.gs-cast-leaving[data-going="back"]')).toBeNull();
  });

  it("a click while it glides makes it finish in a tenth of a second", () => {
    (Element.prototype as { getAnimations?: unknown }).getAnimations = function (this: Element) {
      return animations
        .filter((a) => this.contains(a.element))
        .map((a) => ({
          playState: "running",
          currentTime: 0,
          playbackRate: 1,
          effect: {
            getComputedTiming: () => ({
              endTime: Number(a.options.duration ?? 0),
              iterations: a.options.iterations ?? 1,
            }),
          },
          updatePlaybackRate: (rate: number) => a.rate.push(rate),
        }));
    };
    const c = open();
    board(6);
    animations = [];
    board(5, { casting: [bolt], moves: [toStack(bolt.id, "hand", 2)] });
    const [rise] = glidesOf(castCard(c)!);
    act(() => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(rise!.rate).toEqual([MOVE_MS / 100]);
  });
});
