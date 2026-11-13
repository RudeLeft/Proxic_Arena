// @vitest-environment jsdom

// Spec 0081 -- free spells rise from the hand; cards exiled from a hand or
// library are shown (F-0081-A, B, C, D). Two halves:
//
// - A free spell (Memnite, a cascade) is never in `casting` (only a payment
//   question puts it there): the real game screen, its socket replaced, is
//   handed the boards the worker sends -- straight onto the stack, with the
//   round's move "hand / exile -> stack" -- and must make spec 0072's rise.
// - A card exiled straight from a hand or a library: the game's moves become
//   tile moves (fromSnapshot), and the real Board plays 0074's lift and drop
//   (from a hand) or stream (from a library) into the exile pile.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState, type Snapshot } from "../match";
import { AT_ZONE_SCALE, MOVE_MS, anchors } from "./motion";
import { geometry as layoutGeometry } from "./layout";
import { Board, type BoardHandCard } from "./Board";
import { boardFromSnapshot, type TileMove } from "./fromSnapshot";
import { freeCast } from "./theirCast";
import { DISCARD_BEAT_MS, DISCARD_MS, MILL_BEAT_MS, MILL_MS } from "./graves";

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
  /** Ends it, as the browser would (its onfinish). */
  done: () => void;
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
  // A stack card that slides in asks for its CSS animation (none in jsdom).
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
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    const record: Recorded = {
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
      rate: [],
      done: () => {},
    };
    animations.push(record);
    const animation = {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      oncancel: null,
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
    record.done = () => (animation.onfinish as (() => void) | null)?.();
    return animation;
  };
  (Element.prototype as { getAnimations?: unknown }).getAnimations = function (this: Element) {
    return (this as HTMLElement).classList?.contains("bf-slot")
      ? [{ playState: "running", id: "", cancel() {} }]
      : [];
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

/** Memnite on the stack, as the worker sends it: public there, its picture and cost. */
const memniteOn = (seat: number) => ({
  id: "stack:1",
  source: "card:75",
  name: "Memnite",
  controller: seat,
  kind: "spell",
  art: "memnite-art",
  manaCost: "{0}",
  targets: [],
  description: "Memnite",
});
const bears = (seat: number) => ({
  id: "card:14",
  seat,
  name: "Grizzly Bears",
  kind: "creature",
  types: "Creature — Bear",
  known: true,
  faceDown: false,
  power: 2,
  toughness: 2,
  manaCost: "{1}{G}",
  art: "bears-art",
});
const bearsOn = (seat: number) => ({
  id: "stack:10",
  source: "card:14",
  name: "Grizzly Bears",
  controller: seat,
  kind: "spell",
  art: "bears-art",
  manaCost: "{1}{G}",
  targets: [],
  description: "Grizzly Bears",
});

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function state(bobHand: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
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
  };
}
function board(bobHand: number, over: Record<string, unknown> = {}) {
  send({ type: "MATCH_SNAPSHOT", state: state(bobHand, over) });
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
const slotDrawn = (slot: HTMLElement) =>
  drawn(
    slot.style.transform,
    slot.style.transformOrigin,
    parseFloat(slot.style.width),
    parseFloat(slot.style.height),
  );
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
const stackSlot = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`[data-object-id="${id}"]`)?.closest<HTMLElement>(".bf-slot") ??
  null;

describe("F-0081-A · a free spell rises from where it was cast", () => {
  it("Bob's Memnite (no payment step): a back rises from the middle of his fan, then turns and flies to the stack", () => {
    const c = open();
    board(6);
    const middle = slotDrawn(slotOf(c, "hidden-hand:2:2"));
    animations = [];
    // The worker's very next board: Memnite is on the stack already, never
    // in `casting`; the move says it came from his hand.
    board(5, { stack: [memniteOn(2)], moves: [toStack("card:75", "hand", 2)] });
    const card = castCard(c)!;
    expect(card, "it rises as a cast spell, not faded in at the stack").not.toBeNull();
    expect(card.dataset["objectId"]).toBe("card:75");
    // A back (which of his cards it was is never known), with who is casting.
    expect(card.querySelector(".gs-cast-back")).not.toBeNull();
    expect(card.textContent).toContain("Bob is casting a spell");
    expect(card.textContent).not.toContain("Memnite");
    // Spec 0072's Glide: 450 ms, from exactly where the middle back was.
    const [rise] = glidesOf(card);
    expect(rise!.options.duration).toBe(MOVE_MS);
    expectNear(castDrawn(card, rise!.frames[0]!), middle);
    // Its stack card waits for it (not a second Memnite fading in there).
    expect(stackSlot(c, "stack:1")!.style.opacity).toBe("0");
    // His fan closes on the gap; no back leaves for a pile; no hidden id used.
    expect(c.querySelector('[data-object-id="hidden-hand:2:5"]')).toBeNull();
    expect(c.querySelector('[data-ghost-of^="hidden-hand"]')).toBeNull();
    expect(card.outerHTML).not.toContain("hidden-hand");
    // Landed in the middle: cast, as a paid spell is -- it turns face up and flies to the stack.
    act(() => rise!.done());
    expect(castCard(c)).toBeNull();
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(leaving).not.toBeNull();
    expect(leaving.dataset["card"]).toBe("card:75");
    expect(leaving.querySelector(".gs-cast-turn")).not.toBeNull();
    // Still hidden on the stack while it flies there.
    expect(stackSlot(c, "stack:1")!.style.opacity).toBe("0");
  });

  it("a cascade's free cast from his exile rises from the exile pile, face up the whole way", () => {
    const c = open();
    board(5, { exile: [bears(2)] });
    animations = [];
    board(5, { exile: [], stack: [bearsOn(2)], moves: [toStack("card:14", "exile", 2)] });
    const card = castCard(c)!;
    expect(card).not.toBeNull();
    expect(card.querySelector(".gs-cast-back")).toBeNull();
    expect(card.getAttribute("aria-label")).toBe("Being cast: Grizzly Bears");
    const g = layoutGeometry(size);
    const pile = anchors(g)["opponent:exile"];
    const [rise] = glidesOf(card);
    expectNear(castDrawn(card, rise!.frames[0]!), { ...pile, w: g.cardW * 0.3 });
    act(() => rise!.done());
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
    expect(leaving).not.toBeNull();
    expect(leaving.querySelector(".gs-cast-turn")).toBeNull();
  });

  it("your own cascade's free cast rises from your exile pile (nothing was clicked)", () => {
    const c = open();
    board(5, { exile: [bears(1)] });
    animations = [];
    board(5, { exile: [], stack: [bearsOn(1)], moves: [toStack("card:14", "exile", 1)] });
    const card = castCard(c)!;
    expect(card).not.toBeNull();
    const g = layoutGeometry(size);
    const pile = anchors(g)["viewer:exile"];
    expectNear(castDrawn(card, glidesOf(card)[0]!.frames[0]!), { ...pile, w: g.cardW * 0.3 });
  });

  it("your own free spell from your hand looks as it does today (no rise from the hand's middle)", () => {
    const c = open();
    board(5);
    board(5, {
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      stack: [memniteOn(1)],
      moves: [toStack("card:75", "hand", 1)],
    });
    expect(castCard(c)).toBeNull();
  });

  it("a spectator sees Bob's free spell rise from his fan too", () => {
    const c = open();
    const spectate = (bobHand: number, over: Record<string, unknown> = {}) =>
      board(bobHand, { spectator: true, viewFrom: 1, seat: 0, ...over });
    spectate(6);
    const middle = slotDrawn(slotOf(c, "hidden-hand:2:2"));
    animations = [];
    spectate(5, { stack: [memniteOn(2)], moves: [toStack("card:75", "hand", 2)] });
    const card = castCard(c)!;
    expect(card).not.toBeNull();
    expect(card.querySelector(".gs-cast-back")).not.toBeNull();
    expectNear(castDrawn(card, glidesOf(card)[0]!.frames[0]!), middle);
  });

  it("a paid spell, already seen being cast, is not risen a second time", () => {
    const c = open();
    board(6);
    board(5, {
      casting: [{ id: "card:75", seat: 2, name: "Memnite", kind: "artifact", known: true }],
      moves: [toStack("card:75", "hand", 2)],
    });
    animations = [];
    board(5, { stack: [memniteOn(2)], moves: [] });
    expect(castCard(c)).toBeNull();
    const first = state(5, {
      casting: [{ id: "card:75", seat: 2, name: "Memnite" }],
    }) as unknown as Snapshot;
    const then = state(5, {
      stack: [memniteOn(2)],
      moves: [toStack("card:75", "hand", 2)],
    }) as unknown as Snapshot;
    expect(freeCast(then, first)).toBeNull();
  });

  it("reduce motion: no rise; it simply appears on the stack", () => {
    reduce = true;
    const c = open();
    board(6);
    board(5, { stack: [memniteOn(2)], moves: [toStack("card:75", "hand", 2)] });
    expect(castCard(c)).toBeNull();
    expect(stackSlot(c, "stack:1")!.style.opacity).not.toBe("0");
  });

  it("a click hurries the rise (A-00)", () => {
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
    board(5, { stack: [memniteOn(2)], moves: [toStack("card:75", "hand", 2)] });
    const [rise] = glidesOf(castCard(c)!);
    act(() => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(rise!.rate).toEqual([MOVE_MS / 100]);
  });
});

// --- Exiled from a hand or library: the Board, as the game screen hands it ---

const g2 = layoutGeometry(size);
const where = anchors(g2);
const RESOLVE_MS = 380;
const backs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:2:${i}`, shown: null }));
const face = (name: string, faceDown = false) => ({
  name: faceDown ? "" : name,
  kind: faceDown ? "unknown" : "instant",
  types: faceDown ? "" : "Instant",
  power: null,
  toughness: null,
  art: null,
  crop: null,
  faceDown,
  known: !faceDown,
});
const exiled = (
  id: string,
  from: "hand" | "library",
  side: "viewer" | "opponent",
  name: string,
  faceDown = false,
): TileMove => ({
  card: id,
  from: { zone: from, side },
  to: { zone: "exile", side },
  face: face(name, faceDown),
  hidden: false,
  where: null,
});
function Tiles({ n }: { n: Record<string, number> }) {
  return (
    <>
      {Object.entries(n).map(([tile, count]) => (
        <div key={tile} className="gs-zone" data-zone-tile={tile}>
          <span className="gs-zone-n">{count}</span>
        </div>
      ))}
    </>
  );
}
const handCard = (id: string, name: string): BoardHandCard => ({
  id,
  name,
  kind: "instant",
  types: "Instant",
  power: null,
  toughness: null,
  art: null,
});
function draw(extra: {
  hand?: BoardHandCard[];
  opponentHand?: ReturnType<typeof backs>;
  tileMoves?: TileMove[];
  tiles?: Record<string, number>;
  stack?: Parameters<typeof Board>[0]["stack"];
}) {
  return (
    <Board
      battlefield={[]}
      hand={extra.hand ?? []}
      opponentHand={extra.opponentHand ?? backs(3)}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={new Map()}
      departures={new Map()}
      returns={new Map()}
      graves={new Map()}
      tileMoves={extra.tileMoves ?? []}
      countered={new Set()}
      stack={extra.stack ?? []}
      combat={null}
      damage={null}
      rail={extra.tiles ? <Tiles n={extra.tiles} /> : undefined}
    />
  );
}
const ghostsOf = (container: HTMLElement, id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-ghost-of="${id}"]`),
];
const runOf = (element: Element) => animations.filter((c) => c.element === element).at(-1);
function centre(transform: string, origin: string) {
  const m =
    /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\) rotate\(([-\d.e]+)deg\) scale\(([-\d.e]+)(?:, ([-\d.e]+))?\)/.exec(
      transform,
    )!;
  const [ox, oy] = origin.split(" ").map((v) => Number(v.replace("px", "")));
  const tx = Number(m[1]);
  const ty = Number(m[2]);
  const a = (Number(m[3]) * Math.PI) / 180;
  const sx = Number(m[4]);
  const sy = m[5] !== undefined ? Number(m[5]) : sx;
  const vx = (g2.cardW / 2 - ox!) * sx;
  const vy = (g2.cardH / 2 - oy!) * sy;
  return {
    x: ox! + tx + vx * Math.cos(a) - vy * Math.sin(a),
    y: oy! + ty + vx * Math.sin(a) + vy * Math.cos(a),
    s: sy,
  };
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }, px = 2) =>
  Math.hypot(a.x - b.x, a.y - b.y) < px;
function tileAt(container: HTMLElement, tile: string, t: number): string[] {
  const host = container.querySelector(`[data-zone-tile="${tile}"]`)!;
  return [...host.querySelectorAll<HTMLElement>(".gs-zone-n")]
    .filter((n) => {
      const run = runOf(n);
      if (!run) return n.style.opacity !== "0";
      const total = Number(run.options.duration);
      if (t >= total) return n.style.opacity !== "0";
      let opacity = 1;
      for (const f of run.frames) if (Number(f.offset) * total <= t) opacity = Number(f.opacity);
      return opacity > 0;
    })
    .map((n) => n.textContent ?? "");
}
const forceOfWill = {
  id: "stack:4",
  name: "Force of Will",
  kind: "spell",
  source: null,
  targets: [],
  seat: 2,
  card: "card:26",
};

describe("the game's moves: a hand or library to exile is a tile move (fromSnapshot)", () => {
  it("Force of Will's pitched card and cascade's exiled cards carry the face the exile shows", () => {
    const before = state(6) as unknown as Snapshot;
    const pitched = { ...bears(2), id: "card:48", name: "Force of Will", kind: "instant" };
    const now = state(5, {
      exile: [pitched, { ...bears(1), id: "card:38" }],
      moves: [
        { card: "card:48", from: { zone: "hand", seat: 2 }, to: { zone: "exile", seat: 2 } },
        { card: "card:38", from: { zone: "library", seat: 1 }, to: { zone: "exile", seat: 1 } },
      ],
    }) as unknown as Snapshot;
    const data = boardFromSnapshot(now, before);
    expect(data.tileMoves.map((m) => [m.card, m.from, m.to, m.face.name])).toEqual([
      [
        "card:48",
        { zone: "hand", side: "opponent" },
        { zone: "exile", side: "opponent" },
        "Force of Will",
      ],
      [
        "card:38",
        { zone: "library", side: "viewer" },
        { zone: "exile", side: "viewer" },
        "Grizzly Bears",
      ],
    ]);
  });
});

describe("F-0081-B · exiled from a hand: lifted out, dropped into the exile pile", () => {
  it("Bob pitches a card to Force of Will: a back leaves the middle of his fan, turns face up, drops into his exile", () => {
    const tiles = { "opponent:exile": 0 };
    const view = render(draw({ opponentHand: backs(6), stack: [forceOfWill], tiles }));
    const from = slotOf(view.container, "hidden-hand:2:2").style.transform;
    animations = [];
    view.rerender(
      draw({
        opponentHand: backs(5),
        stack: [forceOfWill],
        tiles: { "opponent:exile": 1 },
        tileMoves: [exiled("card:48", "hand", "opponent", "Force of Will")],
      }),
    );
    const ghosts = ghostsOf(view.container, "card:48");
    const back = ghosts.find((x) => x.dataset.turn === "back")!;
    const up = ghosts.find((x) => x.dataset.turn !== "back")!;
    expect(back, "it leaves his fan as a back").toBeTruthy();
    expect(up.textContent).toContain("Force of Will");
    const b = runOf(back)!;
    const f = runOf(up)!;
    expect(
      near(
        centre(String(b.frames[0]!.transform), back.style.transformOrigin),
        centre(from, back.style.transformOrigin),
        0.01,
      ),
    ).toBe(true);
    expect(Number(f.options.duration)).toBe(DISCARD_MS);
    // One picture at a time: the back, then the face once it has turned.
    expect(b.frames[0]!.opacity).toBe(1);
    expect(f.frames[0]!.opacity).toBe(0);
    // Into his exile pile, not his graveyard.
    const last = centre(String(f.frames.at(-1)!.transform), up.style.transformOrigin);
    expect(near(last, where["opponent:exile"])).toBe(true);
    expect(near(last, where["opponent:graveyard"])).toBe(false);
    expect(last.s).toBeCloseTo(AT_ZONE_SCALE, 3);
    // The exile number ticks as it lands.
    expect(tileAt(view.container, "opponent:exile", 0)).toEqual(["0"]);
    expect(tileAt(view.container, "opponent:exile", Number(f.options.delay) + DISCARD_MS)).toEqual([
      "1",
    ]);
    // No ghost of a back leaves for a pile; no id on any of his hidden backs.
    expect(ghostsOf(view.container, "hidden-hand:2:5")).toHaveLength(0);
    for (const el of view.container.querySelectorAll<HTMLElement>("[data-object-id]"))
      expect(el.dataset.objectId).not.toBe("card:48");
  });

  it("exiled face down from his hand: a back the whole way, never shown", () => {
    const view = render(draw({ opponentHand: backs(4) }));
    animations = [];
    view.rerender(
      draw({
        opponentHand: backs(3),
        tileMoves: [exiled("card:90", "hand", "opponent", "Secret", true)],
      }),
    );
    const ghosts = ghostsOf(view.container, "card:90");
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.dataset.turn).toBe("back");
    const run = runOf(ghosts[0]!)!;
    expect(run.frames.every((f) => Number(f.opacity ?? 1) > 0 || f === run.frames.at(-1))).toBe(
      true,
    );
    expect(view.container.textContent).not.toContain("Secret");
    const last = centre(String(run.frames.at(-1)!.transform), ghosts[0]!.style.transformOrigin);
    expect(near(last, where["opponent:exile"])).toBe(true);
  });

  it("your own card pitched: it lifts out of your hand and drops into your exile", () => {
    const fow = handCard("card:26", "Force of Will");
    const pitched = handCard("card:48", "Force of Will");
    const view = render(draw({ hand: [fow, pitched] }));
    const was = slotOf(view.container, pitched.id);
    const wasAt = centre(was.style.transform, was.style.transformOrigin);
    animations = [];
    view.rerender(
      draw({ hand: [fow], tileMoves: [exiled(pitched.id, "hand", "viewer", "Force of Will")] }),
    );
    const [ghost] = ghostsOf(view.container, pitched.id);
    const run = runOf(ghost!)!;
    expect(Number(run.options.duration)).toBe(DISCARD_MS);
    expect(
      near(centre(String(run.frames[0]!.transform), ghost!.style.transformOrigin), wasAt, 0.01),
    ).toBe(true);
    const last = centre(String(run.frames.at(-1)!.transform), ghost!.style.transformOrigin);
    expect(near(last, where["viewer:exile"])).toBe(true);
  });
});

describe("F-0081-C · exiled from a library: a stream off the library into exile", () => {
  it("cascade (two cards) and Karn: each slides off the library, turns face up, into the exile pile", () => {
    const tiles = { "viewer:library": 50, "viewer:exile": 0 };
    const view = render(draw({ tiles }));
    animations = [];
    view.rerender(
      draw({
        tiles: { "viewer:library": 48, "viewer:exile": 2 },
        tileMoves: [
          exiled("card:38", "library", "viewer", "Bloodbraid Elf"),
          exiled("card:14", "library", "viewer", "Grizzly Bears"),
        ],
      }),
    );
    ["card:38", "card:14"].forEach((id, i) => {
      const ghosts = ghostsOf(view.container, id);
      const back = ghosts.find((x) => x.dataset.turn === "back")!;
      const up = ghosts.find((x) => x.dataset.turn !== "back")!;
      const b = runOf(back)!;
      const f = runOf(up)!;
      expect(Number(f.options.delay)).toBe(i * MILL_BEAT_MS);
      expect(Number(f.options.duration)).toBe(MILL_MS);
      expect(
        near(
          centre(String(b.frames[0]!.transform), back.style.transformOrigin),
          where["viewer:library"],
        ),
      ).toBe(true);
      expect(
        near(
          centre(String(f.frames.at(-1)!.transform), up.style.transformOrigin),
          where["viewer:exile"],
        ),
      ).toBe(true);
    });
    expect(tileAt(view.container, "viewer:library", MILL_BEAT_MS)).toEqual(["48"]);
    expect(tileAt(view.container, "viewer:exile", MILL_MS - 1)).toEqual(["0"]);
    expect(tileAt(view.container, "viewer:exile", MILL_BEAT_MS + MILL_MS)).toEqual(["2"]);
  });

  it("exiled face down from a library: one back the whole way", () => {
    const view = render(draw({}));
    animations = [];
    view.rerender(draw({ tileMoves: [exiled("card:91", "library", "opponent", "Hidden", true)] }));
    const ghosts = ghostsOf(view.container, "card:91");
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.dataset.turn).toBe("back");
    const run = runOf(ghosts[0]!)!;
    // Seen all the way out (never edge-on, never turned).
    expect(run.frames.filter((f) => Number(f.offset) < 0.4).every((f) => f.opacity === 1)).toBe(
      true,
    );
    const [, sx, sy] = /scale\(([\d.]+), ([\d.]+)\)/.exec(String(run.frames[5]!.transform))!;
    expect(Number(sx)).toBeCloseTo(Number(sy), 6);
  });
});

describe("F-0081-D · hurry and reduce motion", () => {
  it("reduce motion: nothing moves to exile, only the numbers change", () => {
    reduce = true;
    const view = render(draw({ opponentHand: backs(4) }));
    animations = [];
    view.rerender(
      draw({
        opponentHand: backs(3),
        tileMoves: [exiled("card:48", "hand", "opponent", "Force of Will")],
      }),
    );
    expect(ghostsOf(view.container, "card:48")).toHaveLength(0);
  });

  it("several exiled from his hand go one after another", () => {
    const view = render(draw({ opponentHand: backs(6) }));
    animations = [];
    view.rerender(
      draw({
        opponentHand: backs(4),
        tileMoves: [
          exiled("card:61", "hand", "opponent", "Karn Liberated"),
          exiled("card:67", "hand", "opponent", "Karn Liberated"),
        ],
      }),
    );
    const delays = ["card:61", "card:67"].map((id) =>
      Number(
        runOf(ghostsOf(view.container, id).find((x) => x.dataset.turn !== "back")!)!.options.delay,
      ),
    );
    expect(delays[1]! - delays[0]!).toBe(DISCARD_BEAT_MS);
  });
});

void RESOLVE_MS;
