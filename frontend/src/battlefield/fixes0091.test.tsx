// @vitest-environment jsdom

// Spec 0091 -- the casting card steps aside while a card under it is spent,
// sacrificed or tapped to pay, then comes back (F-0091-A..D). Spec 0110: it
// waits at the stack's next slot now (castingStackBox), so what it covers is
// the right-hand end of the rows: each board puts a dozen other permanents
// first, so the cards that act are drawn there. The real game
// screen, its socket replaced: the test hands it the server's messages, so
// the board, its layout and the casting card are the game's own.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import {
  ASIDE_MS,
  BACK_AFTER_MS,
  STILL_HOLD_MS,
  castingStackBox,
  castCoverBox,
  covers,
} from "./stepAside";
import { geometry as layoutGeometry } from "./layout";
import { FLY_MS } from "./CastingCard";

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

const { GameScreen } = await import("./GameScreen");

const size = { width: 1920, height: 1080 };
interface Run {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  anim: { onfinish: null | (() => void); updatePlaybackRate: ReturnType<typeof vi.fn> };
}
let animations: Run[] = [];
let reduce = false;
let clock = 1000;
beforeEach(() => {
  animations = [];
  reduce = false;
  clock = 1000;
  socket.answers = [];
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
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
  // Animations are recorded and never finish on their own.
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    const anim = {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null as null | (() => void),
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      updatePlaybackRate: vi.fn(),
      effect: {
        getComputedTiming: () => ({
          endTime:
            Number((options as KeyframeAnimationOptions).duration ?? 0) +
            Number((options as KeyframeAnimationOptions).delay ?? 0),
          iterations: 1,
        }),
      },
    };
    animations.push({ element: this, frames, options: options as KeyframeAnimationOptions, anim });
    return anim as unknown as Animation;
  };
  // A click's hurry (A-00) asks the board for its running animations.
  Element.prototype.getAnimations = function (this: Element) {
    return animations
      .filter((a) => this.contains(a.element))
      .map((a) => a.anim) as unknown as Animation[];
  };
});
afterEach(() => {
  vi.restoreAllMocks();
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
const styleBox = (el: Element) => {
  const s = (el as HTMLElement).style;
  return {
    x: parseFloat(s.left) || 0,
    y: parseFloat(s.top) || 0,
    w: parseFloat(s.width) || 0,
    h: parseFloat(s.height) || 0,
  };
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

const permanent = (
  id: string,
  seat: number,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  seat,
  name,
  kind: "creature",
  types: "Creature",
  known: true,
  power: 2,
  toughness: 2,
  tapped: false,
  ...extra,
});
const treasure = (id: string, seat = 1) =>
  permanent(id, seat, "Treasure", {
    kind: "artifact",
    types: "Token Artifact — Treasure",
    token: true,
    power: null,
    toughness: null,
  });
const giant = (seat = 1) => ({
  id: "card:3",
  seat,
  name: "Hill Giant",
  kind: "creature",
  types: "Creature — Giant",
  known: true,
  manaCost: "{3}{R}",
});

let revision = 0;
let viewer = 1;
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
      seat: viewer,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: [],
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
    actedForSeat: viewer,
    stateVersion: revision,
    kind,
    options: [{ actionId: `a${asked}`, label: "Choose it", objectId }],
    prompt: "Choose",
    ...extra,
  });
}
const spentMove = (card: string, seat = 1) => ({
  card,
  from: { zone: "battlefield", seat },
  to: { zone: "graveyard", seat },
  why: "sacrificed",
  spent: true,
});
let step = 0;
const pay = (from: string, colour = "C", seat = 1) => {
  step += 1;
  return {
    n: step,
    seat,
    payment: 1,
    for: "card:3",
    kind: "cast",
    cost: "{3}{R}",
    owing: null,
    mana: [{ colour, shard: null, from }],
  };
};

const castCard = (c: ParentNode) => c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
/** The casting card's step-aside animations, oldest first. */
const steps = (c: ParentNode) =>
  animations.filter(
    (a) => a.element === castCard(c) && a.frames.length === 4 && "offset" in a.frames[1]!,
  );
const shift = (frame: Keyframe) => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(String(frame.transform));
  return m ? { dx: Number(m[1]), dy: Number(m[2]) } : null;
};
const ghost = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`[data-ghost-of="${id}"]`);
const ghostDelay = (c: ParentNode, id: string) => {
  const g = ghost(c, id);
  const run = animations.filter((a) => a.element === g && a.options.id !== "unseen-landing").at(-1);
  return Number(run?.options.delay ?? NaN);
};

/** Where the board drew a card: its slot's place (the board moves slots by transform). */
const slotBox = (c: ParentNode, id: string) => {
  const slot = c
    .querySelector<HTMLElement>(`[data-object-id="${id}"]`)!
    .closest<HTMLElement>(".bf-slot")!;
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(slot.style.transform)!;
  return {
    x: Number(m[1]),
    y: Number(m[2]),
    w: parseFloat(slot.style.width),
    h: parseFloat(slot.style.height),
    scale: 1,
    rotation: 0,
    z: 0,
  };
};

function open() {
  return render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
}

// Spec 0110 -- where the casting card waits (nothing on the stack yet): the
// stack's next slot. Twelve permanents of a kind first put the cards that
// act at the right-hand end of their line, under it (checked, so a layout
// change cannot make these tests pass for the wrong reason).
const g = layoutGeometry(size);
const place = castingStackBox(g, 0);
const cover = castCoverBox(place);
const others = (seat: number, kind: "creature" | "artifact") =>
  Array.from({ length: 12 }, (_, i) =>
    kind === "creature"
      ? permanent(`card:${100 + i}`, seat, `Bystander ${i}`)
      : permanent(`card:${200 + i}`, seat, `Trinket ${i}`, {
          kind: "artifact",
          types: "Artifact",
          power: null,
          toughness: null,
        }),
  );

beforeEach(() => {
  viewer = 1;
  step = 0;
});

describe("F-0091-A · three Treasures under the casting card pay for Hill Giant", () => {
  const three = () => [treasure("card:61"), treasure("card:62"), treasure("card:63")];
  const trinkets = others(1, "artifact");

  it("your seat: the card and its pips step up and aside, the Treasure folds in view, then back once", () => {
    const c = open();
    board({ casting: [giant()], battlefield: [...trinkets, ...three()] });
    ask("applyManaToCost", "card:61", { owing: "{3}{R}" });
    const card = castCard(c)!;
    // The Treasures are under it.
    const pile = slotBox(c, "card:61");
    expect(covers(cover, pile)).toBe(true);
    expect(steps(c)).toHaveLength(0);
    // The first Treasure is spent for {C}.
    board({
      casting: [giant()],
      battlefield: [...trinkets, ...three().slice(1)],
      moves: [spentMove("card:61")],
      payments: [pay("card:61")],
    });
    const [first] = steps(c);
    expect(first).toBeDefined();
    expect(first!.options.composite).toBe("add");
    // From its place, up (your cards are below it) and a little aside, then back.
    expect(shift(first!.frames[0]!)).toEqual({ dx: 0, dy: 0 });
    const away = shift(first!.frames[1]!)!;
    expect(away.dy).toBeLessThan(0);
    expect(Math.abs(away.dx)).toBeGreaterThan(0);
    expect(shift(first!.frames[3]!)).toEqual({ dx: 0, dy: 0 });
    // Just far enough: its line clears the top of the Treasures, and no further.
    const top = pile.y;
    expect(cover.y + cover.h + away.dy).toBeLessThanOrEqual(top);
    expect(cover.y + cover.h + away.dy).toBeGreaterThan(top - 40);
    // It slides out in ASIDE_MS, and back in ASIDE_MS.
    const total = Number(first!.options.duration);
    expect(Number(first!.frames[1]!.offset) * total).toBeCloseTo(ASIDE_MS);
    expect((1 - Number(first!.frames[2]!.offset)) * total).toBeCloseTo(ASIDE_MS);
    expect(card.dataset["stepAside"]).toBe("aside");
    // The Treasure waits for it, then folds and goes in view.
    expect(ghost(c, "card:61")!.dataset["fate"]).toBe("spent");
    expect(ghostDelay(c, "card:61")).toBeGreaterThanOrEqual(ASIDE_MS);
    // The card's own place never changes: still the stack's next slot, under the movement.
    expect(styleBox(card)).toMatchObject({ x: place.x, y: place.y });
    // Held until the fold is done, then 0.25 s later back.
    const backAt = Number(first!.frames[2]!.offset) * total;
    expect(backAt).toBeGreaterThanOrEqual(ASIDE_MS + 320 + 450 + BACK_AFTER_MS);
    // A second Treasure while it is still aside: it carries on from there, one return.
    clock += 500;
    board({
      casting: [giant()],
      battlefield: [...trinkets, ...three().slice(2)],
      moves: [spentMove("card:62")],
      payments: [pay("card:61"), pay("card:62")].map((p, i) => ({ ...p, n: i + 1 })),
    });
    const second = steps(c).at(-1)!;
    expect(second).not.toBe(first);
    expect(shift(second.frames[0]!)).toEqual(away);
    // Finished: back at its place, no longer aside.
    act(() => second.anim.onfinish?.());
    expect(castCard(c)!.dataset["stepAside"]).toBeUndefined();
  });

  it("the other player's seat: the face-down back steps down and aside, clear of the hand", () => {
    const c = open();
    // Spec 0110 -- their creature line's right-hand end is what the back
    // covers at the stack spot (their other permanents are above it): three
    // Servos there are sacrificed for its cost.
    const servo = (id: string) =>
      permanent(id, 2, "Servo", {
        types: "Token Artifact Creature — Servo",
        token: true,
        power: 1,
        toughness: 1,
      });
    const theirs = [...others(2, "creature"), servo("card:61"), servo("card:62"), servo("card:63")];
    const back = { ...giant(2), faceDown: true, known: false, name: "Face-down" };
    board({ casting: [back], battlefield: theirs });
    const card = castCard(c)!;
    expect(card.querySelector(".gs-cast-back")).not.toBeNull();
    const pile = slotBox(c, "card:61");
    expect(covers(cover, pile)).toBe(true);
    board({
      casting: [back],
      battlefield: theirs.filter((p) => p.id !== "card:61"),
      moves: [spentMove("card:61", 2)],
      payments: [{ ...pay("card:61", "C", 2), cost: null }],
    });
    const [run] = steps(c);
    expect(run).toBeDefined();
    const away = shift(run!.frames[1]!)!;
    expect(away.dy).toBeGreaterThan(0);
    expect(cover.y + away.dy).toBeGreaterThanOrEqual(pile.y + pile.h - 1);
    expect(cover.y + cover.h + away.dy).toBeLessThanOrEqual(g.handTop);
    expect(ghostDelay(c, "card:61")).toBeGreaterThanOrEqual(ASIDE_MS);
  });
});

describe("F-0091-B · Village Rites' covered Bears; Llanowar Elves under it tapping", () => {
  const rites = {
    id: "card:4",
    seat: 1,
    name: "Village Rites",
    kind: "instant",
    types: "Instant",
    known: true,
    manaCost: "{B}",
  };
  it("the Bears sacrificed as Village Rites goes on the stack: it is held, steps aside, comes back, then flies", () => {
    const c = open();
    const bears = permanent("card:20", 1, "Grizzly Bears");
    const elves = permanent("card:21", 1, "Llanowar Elves");
    const crowd = others(1, "creature");
    board({ casting: [rites], battlefield: [...crowd, elves, bears] });
    expect(covers(cover, slotBox(c, bears.id))).toBe(true);
    ask("CostSacrifice", bears.id);
    // As the game does it (the Lab's rites game): the sacrifice comes with
    // the spell on the stack, no longer being cast.
    board({
      battlefield: [...crowd, elves],
      moves: [spentMove(bears.id)],
      stack: [
        { id: "stack:1", source: rites.id, name: "Village Rites", controller: 1, kind: "spell" },
      ],
    });
    // Still drawn at its place, stepping aside; not yet flying.
    expect(castCard(c)).not.toBeNull();
    expect(c.querySelector(".gs-cast-leaving")).toBeNull();
    expect(steps(c)).toHaveLength(1);
    expect(shift(steps(c)[0]!.frames[1]!)!.dy).toBeLessThan(0);
    expect(ghostDelay(c, bears.id)).toBeGreaterThanOrEqual(ASIDE_MS);
    // Back at its place: then it settles into the stack, from there.
    act(() => steps(c)[0]!.anim.onfinish?.());
    expect(castCard(c)).toBeNull();
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(leaving).not.toBeNull();
    expect(styleBox(leaving)).toMatchObject({ x: place.x, y: place.y });
  });

  it("Amendment 1: its spell resolves while it is held aside -- it flies from there to the stack spot, never shown twice", async () => {
    const c = open();
    const bears = permanent("card:20", 1, "Grizzly Bears");
    const elves = permanent("card:21", 1, "Llanowar Elves");
    const crowd = others(1, "creature");
    board({ casting: [rites], battlefield: [...crowd, elves, bears] });
    board({
      battlefield: [...crowd, elves],
      moves: [spentMove(bears.id)],
      stack: [
        { id: "stack:1", source: rites.id, name: "Village Rites", controller: 1, kind: "spell" },
      ],
    });
    const away = shift(steps(c)[0]!.frames[1]!)!;
    // Still aside (past its slide out) when the spell resolves.
    clock += 600;
    board({ battlefield: [...crowd, elves], graveyard: [{ ...rites }] });
    // No longer held: one card, flying -- not a second one waiting at its place.
    expect(castCard(c)).toBeNull();
    const flight = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(flight).not.toBeNull();
    expect(flight.dataset["fromAside"]).toBe("true");
    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
    const fly = animations.filter((a) => a.element === flight).at(-1)!;
    // From where it was held, straight to the stack spot (a landing, not a fade on the spot).
    const start = shift(fly.frames[0]!)!;
    expect(start.dx).toBeCloseTo(away.dx, 0);
    expect(start.dy).toBeCloseTo(away.dy, 0);
    // Spec 0110: into the stack slot beside it, a straight settle (no arc).
    expect(fly.frames.length).toBe(2);
    expect(fly.frames.at(-1)!.opacity).toBe(0.35);
    // The stack card that leaves waits, unseen, until the flight has landed.
    const stackGhost = ghost(c, "stack:1")!;
    expect(stackGhost).not.toBeNull();
    const unseen = animations.find(
      (a) =>
        a.element === stackGhost &&
        a.options.id === "unseen-landing" &&
        a.frames.every((f) => f.opacity === 0),
    );
    expect(unseen).toBeDefined();
    expect(Number(unseen!.options.duration)).toBeGreaterThanOrEqual(FLY_MS);
    // ...and only then plays its leaving.
    expect(ghostDelay(c, "stack:1")).toBeGreaterThanOrEqual(FLY_MS);
  });

  it("the Elves tapped for {G}: it steps aside for the tap and its ball, then back", () => {
    const c = open();
    const elves = permanent("card:21", 1, "Llanowar Elves");
    const bears = permanent("card:20", 1, "Grizzly Bears");
    const craw = { ...giant(), name: "Craw Wurm", manaCost: "{4}{G}{G}" };
    const crowd = others(1, "creature");
    board({ casting: [craw], battlefield: [...crowd, bears, elves] });
    ask("applyManaToCost", elves.id, { owing: "{4}{G}{G}" });
    board({
      casting: [craw],
      battlefield: [...crowd, bears, { ...elves, tapped: true }],
      payments: [{ ...pay(elves.id, "G"), cost: "{4}{G}{G}" }],
    });
    expect(covers(cover, slotBox(c, elves.id))).toBe(true);
    expect(steps(c)).toHaveLength(1);
    const run = steps(c)[0]!;
    const total = Number(run.options.duration);
    // Its ball waits for the card to move, and flies to where its pip is then.
    const ball = animations.find((a) => (a.element as HTMLElement).className === "gs-ball");
    expect(ball).toBeDefined();
    expect(Number(ball!.options.delay)).toBeGreaterThanOrEqual(ASIDE_MS);
    const away = shift(run.frames[1]!)!;
    const size = parseFloat((ball!.element as HTMLElement).style.width);
    // It aims at the card (jsdom lays out no pips), moved by the step.
    const end = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
      String(ball!.frames.at(-1)!.transform),
    )!;
    expect(Number(end[1]) + size / 2).toBeCloseTo(place.x + place.w / 2 + away.dx, 1);
    expect(Number(end[2]) + size / 2).toBeCloseTo(place.y + place.h / 2 + away.dy, 1);
    // Held for the ball's flight and pop.
    expect(Number(run.frames[2]!.offset) * total).toBeGreaterThanOrEqual(ASIDE_MS + 620 + 260);
  });
});

describe("F-0091-C · it stays at its place when nothing under it acts", () => {
  it("a target, between questions, a card spent away from it, a tapped card away from it", () => {
    const c = open();
    const elves = permanent("card:21", 1, "Llanowar Elves");
    const goblin = permanent("card:30", 2, "Goblin Guide");
    board({ casting: [giant()], battlefield: [elves, goblin] });
    ask("chooseTargets", goblin.id);
    send({ type: "DECISION_CLEARED", decisionId: asked });
    board({ casting: [giant()], battlefield: [elves, goblin], players: undefined });
    expect(steps(c)).toHaveLength(0);
    // Paying with things nowhere near it (a far-left land line): no step.
    const lands = Array.from({ length: 9 }, (_, i) =>
      permanent(`card:${40 + i}`, 1, `Mountain ${i}`, {
        kind: "land",
        types: "Basic Land — Mountain",
        power: null,
        toughness: null,
      }),
    );
    board({ casting: [giant()], battlefield: [elves, goblin, ...lands] });
    expect(covers(cover, slotBox(c, "card:40"))).toBe(false);
    board({
      casting: [giant()],
      battlefield: [elves, goblin, { ...lands[0]!, tapped: true }, ...lands.slice(1)],
      payments: [{ ...pay("card:40", "R"), cost: "{3}{R}" }],
    });
    expect(steps(c)).toHaveLength(0);
    expect(castCard(c)!.dataset["stepAside"]).toBeUndefined();
  });
});

describe("spec 0110 · what it covers follows the stack under it", () => {
  it("nine entries on the stack: the card waits low on the column, so Bob's line's end is no longer under it", () => {
    const c = open();
    const nine = Array.from({ length: 9 }, (_, i) => ({
      id: `stack:${i + 1}`,
      source: `card:${900 + i}`,
      name: `Spell ${i}`,
      // Alice's own (Bob's would hold the next board while they land).
      controller: 1,
      kind: "spell",
    }));
    const theirs = [...others(2, "creature"), permanent("card:61", 2, "Goblin Guide")];
    board({ casting: [giant()], battlefield: theirs, stack: nine });
    const low = castingStackBox(g, 9);
    expect(styleBox(castCard(c)!)).toMatchObject({ x: low.x, y: low.y });
    // At the empty stack's slot the Goblin Guide would be under it; at this one it is not.
    const guideBox = slotBox(c, "card:61");
    expect(covers(cover, guideBox)).toBe(true);
    expect(covers(castCoverBox(low), guideBox)).toBe(false);
    // Bob's Goblin Guide is sacrificed (his own effect): it goes at once, no wait for a step.
    board({
      casting: [giant()],
      battlefield: theirs.filter((p) => p.id !== "card:61"),
      stack: nine,
      moves: [spentMove("card:61", 2)],
    });
    const gone = ghost(c, "card:61");
    expect(gone).not.toBeNull();
    const runs = animations.filter((r) => r.element === gone && r.options.id !== "unseen-landing");
    expect(runs.length).toBeGreaterThan(0);
    expect(Number(runs.at(-1)!.options.delay ?? 0)).toBeLessThan(ASIDE_MS);
    expect(steps(c)).toHaveLength(0);
  });
});

describe("F-0091-D · reduce motion, and a click", () => {
  it("reduce motion: no slide; see-through over the acting card for that moment", () => {
    reduce = true;
    const c = open();
    board({
      casting: [giant()],
      battlefield: [...others(1, "artifact"), treasure("card:61"), treasure("card:62")],
    });
    board({
      casting: [giant()],
      battlefield: [...others(1, "artifact"), treasure("card:62")],
      moves: [spentMove("card:61")],
      payments: [pay("card:61")],
    });
    const run = steps(c)[0]!;
    expect(run).toBeDefined();
    expect(run.frames.some((f) => "transform" in f)).toBe(false);
    expect(run.frames[1]!.opacity).toBe(0.14);
    expect(Number(run.options.duration)).toBeGreaterThanOrEqual(STILL_HOLD_MS);
    expect(castCard(c)!.dataset["stepAside"]).toBe("see-through");
  });

  it("a click hurries the step aside (A-00)", () => {
    const c = open();
    board({
      casting: [giant()],
      battlefield: [...others(1, "artifact"), treasure("card:61"), treasure("card:62")],
    });
    board({
      casting: [giant()],
      battlefield: [...others(1, "artifact"), treasure("card:62")],
      moves: [spentMove("card:61")],
      payments: [pay("card:61")],
    });
    const run = steps(c)[0]!;
    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(run.anim.updatePlaybackRate).toHaveBeenCalled();
  });
});
