// @vitest-environment jsdom

// Spec 0123 (P11-A2, owner 2026-11-27: "As it leaves"; P11-A3: "Close it").
//
// A2 -- a card drawn from a library lifts off its owner's Library tile and
// glides to the hand; the tile's number drops by one as each card leaves;
// a draw a resolving spell made waits for the spell (RESOLVE_MS), the cards
// a beat apart (DRAW_BEAT_MS). Yours turns face up on the way; the other
// player's is a back the whole way (its new back, by place, never an id).
// A3 -- a Graveyard or Exile tile's "you can play this" glow never comes on
// before the card has landed there (its number's landing tick).
//
// The real Board, handed one board and then the next; the plate's tiles in
// the rail, as the game screen draws them. The opponent's case goes through
// boardFromSnapshot, so the arrivals are the game's moves, not handed in.

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import {
  Board,
  type BoardCard,
  type BoardHandCard,
  type OpponentHandCard,
  type StackView,
} from "./Board";
import { boardFromSnapshot } from "./fromSnapshot";
import { geometry } from "./layout";
import { anchors, paced, type AnchorId } from "./motion";
import { DRAW_BEAT_MS } from "./opening";
import type { FanCard } from "./pileFan";

const RESOLVE_MS = paced(380);
const size = { width: 1920, height: 1080 };
type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: Animation;
};
const calls: Call[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const call = { element: this, frames, options } as Call;
    const animation = {
      onfinish: null,
      oncancel: null,
      cancel() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      id: options.id ?? "",
      effect: {
        getComputedTiming: () => ({
          endTime: Number(options.duration ?? 0) + Number(options.delay ?? 0),
          iterations: options.iterations ?? 1,
        }),
      },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
    call.animation = animation;
    calls.push(call);
    return animation;
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
    this: Element,
  ) {
    return this.classList.contains("bf-board")
      ? calls.filter((c) => this.contains(c.element)).map((c) => c.animation)
      : [];
  };
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const g = geometry(size);
const where = anchors(g);

let entered = 0;
function card(id: string, seat: number, name: string, extra: Partial<BoardCard> = {}): BoardCard {
  const land = name === "Forest";
  return {
    id,
    seat,
    name,
    kind: land ? "land" : "creature",
    types: land ? "Basic Land — Forest" : `Creature — ${name}`,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: land ? null : 2,
    toughness: land ? null : 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
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
const backs = (n: number, seat = 2): OpponentHandCard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:${seat}:${i}`, shown: null }));

/** The plate's tiles, with their numbers, as the game screen draws them. */
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

function draw(extra: {
  battlefield?: BoardCard[];
  hand?: BoardHandCard[];
  opponentHand?: OpponentHandCard[];
  arrivals?: ReadonlyMap<string, AnchorId>;
  departures?: Map<string, AnchorId>;
  stack?: StackView[];
  fans?: FanCard[];
  piles?: Set<string>;
  tiles: Record<string, number>;
}) {
  return (
    <Board
      battlefield={extra.battlefield ?? []}
      hand={extra.hand ?? []}
      opponentHand={extra.opponentHand ?? backs(3)}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={extra.arrivals ?? new Map()}
      departures={extra.departures ?? new Map()}
      returns={new Map()}
      tileMoves={[]}
      countered={new Set()}
      fizzled={new Set()}
      stack={extra.stack ?? []}
      combat={null}
      damage={null}
      fans={extra.fans ?? []}
      pileCards={extra.piles ?? new Set()}
      rail={<Tiles n={extra.tiles} />}
    />
  );
}

const runsOf = (element: Element | null) => calls.filter((c) => c.element === element);
const runOf = (element: Element) => runsOf(element).at(-1);
/** What a tile shows at `t` ms: each number with its animation saying it is seen. */
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
/** The first moment (5 ms steps) a tile shows `n`. */
function firstShows(container: HTMLElement, tile: string, n: string): number {
  for (let t = 0; t < 6000; t += 5) if (tileAt(container, tile, t).join() === n) return t;
  return Infinity;
}
const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;

/** Where a transform (translate3d, rotate, scale(s) or scale(sx, sy)) puts a card's centre. */
function centre(transform: string, origin: string) {
  const m =
    /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\) rotate\(([-\d.e]+)deg\) scale\(([-\d.e]+)(?:, ([-\d.e]+))?\)/.exec(
      transform,
    )!;
  const [ox, oy] = origin.split(" ").map((v) => Number(v.replace("px", "")));
  const a = (Number(m[3]) * Math.PI) / 180;
  const sx = Number(m[4]);
  const sy = m[5] !== undefined ? Number(m[5]) : sx;
  const vx = (g.cardW / 2 - ox!) * sx;
  const vy = (g.cardH / 2 - oy!) * sy;
  return {
    x: ox! + Number(m[1]) + vx * Math.cos(a) - vy * Math.sin(a),
    y: oy! + Number(m[2]) + vx * Math.sin(a) + vy * Math.cos(a),
  };
}
/** The moving run (a Glide) of an element, and where its first frame puts it. */
function glideOf(el: HTMLElement) {
  const run = runsOf(el).find((r) => r.frames.some((f) => typeof f.transform === "string"))!;
  return { run, from: centre(String(run.frames[0]!.transform), el.style.transformOrigin) };
}
const away = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const LIB = "viewer:library";
const RITES: StackView = {
  id: "stack:22",
  name: "Grave Rites",
  kind: "spell",
  source: null,
  targets: [],
  seat: 1,
  card: "card:100",
};

/** Alice's page: Grave Rites (draw two) resolves; the two cards come from her library. */
function ritesDraws() {
  const keep = handCard("card:5", "Shock");
  const view = render(draw({ hand: [keep], stack: [RITES], tiles: { [LIB]: 49 } }));
  calls.length = 0;
  view.rerender(
    draw({
      hand: [keep, handCard("card:30", "Island"), handCard("card:31", "Opt")],
      arrivals: new Map([
        ["card:30", LIB],
        ["card:31", LIB],
      ]),
      piles: new Set(["card:100"]),
      tiles: { [LIB]: 47 },
    }),
  );
  return view.container;
}

describe("F-0123-A · the Library number drops as each card leaves the tile", () => {
  it("a spell's draw two: 49 while it resolves, 48 as the first lifts, 47 a beat later", () => {
    const c = ritesDraws();
    for (const t of [0, 100, RESOLVE_MS - 10]) expect(tileAt(c, LIB, t)).toEqual(["49"]);
    expect(tileAt(c, LIB, RESOLVE_MS + 5)).toEqual(["48"]);
    expect(tileAt(c, LIB, RESOLVE_MS + DRAW_BEAT_MS - 10)).toEqual(["48"]);
    expect(tileAt(c, LIB, RESOLVE_MS + DRAW_BEAT_MS + 5)).toEqual(["47"]);
    expect(tileAt(c, LIB, 5000)).toEqual(["47"]);
  });

  it("each card lifts off exactly when its number ticks (cause, then effect)", () => {
    const c = ritesDraws();
    const lifts = ["card:30", "card:31"].map((id) =>
      Number(glideOf(slotOf(c, id)).run.options.delay),
    );
    expect(lifts).toEqual([RESOLVE_MS, RESOLVE_MS + DRAW_BEAT_MS]);
    expect(firstShows(c, LIB, "48")).toBeGreaterThanOrEqual(lifts[0]!);
    expect(firstShows(c, LIB, "48")).toBeLessThanOrEqual(lifts[0]! + 5);
    expect(firstShows(c, LIB, "47")).toBeGreaterThanOrEqual(lifts[1]!);
  });

  it("mill two then draw (one board): 68, 67, 66 as the mill leaves, then 65 as the draw lifts", () => {
    const scour: StackView = { ...RITES, name: "Grave Scour" };
    const view = render(draw({ stack: [scour], tiles: { [LIB]: 68, "viewer:graveyard": 0 } }));
    calls.length = 0;
    const milled = ["card:40", "card:41"].map((id) => ({
      card: id,
      from: { zone: "library" as const, side: "viewer" as const },
      to: { zone: "graveyard" as const, side: "viewer" as const },
      face: {
        name: "Island",
        kind: "land",
        types: "Basic Land — Island",
        power: null,
        toughness: null,
        art: null,
        crop: null,
        faceDown: false,
        known: true,
      },
      hidden: false,
      where: null,
    }));
    view.rerender(
      <Board
        battlefield={[]}
        hand={[handCard("card:30", "Opt")]}
        opponentHand={backs(3)}
        opponentName="Bob"
        viewerSeat={1}
        artUrl={(art) => art}
        arrivals={new Map([["card:30", LIB]])}
        departures={new Map()}
        returns={new Map()}
        tileMoves={milled}
        countered={new Set()}
        fizzled={new Set()}
        stack={[]}
        combat={null}
        damage={null}
        fans={[]}
        pileCards={new Set(["card:40", "card:41", "card:100"])}
        rail={<Tiles n={{ [LIB]: 65, "viewer:graveyard": 3 }} />}
      />,
    );
    const c = view.container;
    const seen: string[] = [];
    for (let t = 0; t < 4000; t += 5) {
      const s = tileAt(c, LIB, t);
      expect(s).toHaveLength(1);
      if (seen.at(-1) !== s[0]) seen.push(s[0]!);
    }
    expect(seen).toEqual(["68", "67", "66", "65"]);
    const lift = Number(glideOf(slotOf(c, "card:30")).run.options.delay);
    expect(firstShows(c, LIB, "65")).toBeGreaterThanOrEqual(lift);
    expect(firstShows(c, LIB, "66")).toBeLessThan(lift);
  });

  it("a turn's draw (nothing resolving): it lifts at once and the number goes with it", () => {
    const view = render(draw({ hand: [], tiles: { [LIB]: 40 } }));
    calls.length = 0;
    view.rerender(
      draw({
        hand: [handCard("card:30", "Island")],
        arrivals: new Map([["card:30", LIB]]),
        tiles: { [LIB]: 39 },
      }),
    );
    expect(Number(glideOf(slotOf(view.container, "card:30")).run.options.delay)).toBe(0);
    expect(tileAt(view.container, LIB, 0)).toEqual(["39"]);
  });
});

describe("F-0123-B · your drawn card comes off your Library tile, face up on the way", () => {
  it("its first frame is on the Library tile, not the stack; it lands in the hand", () => {
    const c = ritesDraws();
    const el = slotOf(c, "card:30");
    const { from } = glideOf(el);
    expect(away(from, where[LIB])).toBeLessThan(2);
    expect(away(from, where.stack)).toBeGreaterThan(100);
  });

  it("a card back flies the same path and turns away as the face turns in", () => {
    const c = ritesDraws();
    const back = c.querySelector<HTMLElement>('[data-ghost-of="card:30"]');
    expect(back).toBeTruthy();
    const run = glideOf(back!).run;
    expect(Number(run.options.delay)).toBe(RESOLVE_MS);
    expect(away(glideOf(back!).from, where[LIB])).toBeLessThan(2);
    // The back is seen first, the face last; never both at the end.
    expect(Number(run.frames[0]!.opacity)).toBe(1);
    expect(Number(run.frames.at(-1)!.opacity)).toBe(0);
    const face = glideOf(slotOf(c, "card:30")).run;
    expect(Number(face.frames[0]!.opacity)).toBe(0);
    expect(Number(face.frames.at(-1)!.opacity)).toBe(1);
    // Unseen while it waits on the tile (no copy there before it lifts).
    expect(face.options.fill).toBe("backwards");
    expect(run.options.fill).toBe("forwards");
  });
});

// --- the other player's draw: through boardFromSnapshot -----------------

const snap = (revision: number, state: Record<string, unknown>): Snapshot =>
  reduceMatch(EMPTY_MATCH, {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 4,
      phase: "DRAW",
      activeSeat: 2,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 3, libraryCount: 50 },
      ],
      battlefield: [],
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...state,
    },
  }).board!;
const players = (bobHand: number, bobLibrary: number, aliceHand = 0, aliceLibrary = 50) => [
  { seat: 1, name: "Alice", life: 20, handCount: aliceHand, libraryCount: aliceLibrary },
  { seat: 2, name: "Bob", life: 20, handCount: bobHand, libraryCount: bobLibrary },
];
const bobDraws = (n: number) =>
  Array.from({ length: n }, () => ({
    from: { zone: "library", seat: 2 },
    to: { zone: "hand", seat: 2 },
  }));

describe("F-0123-C · the other player's draw: a back off their Library tile, never a face", () => {
  it("the game's unnamed draws go to their hand's new backs, the last ones", () => {
    const before = snap(1, { players: players(3, 50) });
    const after = snap(2, { players: players(5, 48), moves: bobDraws(2) });
    const arrivals = boardFromSnapshot(after, before).arrivals;
    expect(arrivals.get("hidden-hand:2:3")).toBe("opponent:library");
    expect(arrivals.get("hidden-hand:2:4")).toBe("opponent:library");
    for (const i of [0, 1, 2]) expect(arrivals.has(`hidden-hand:2:${i}`)).toBe(false);
  });

  it("your own named draw: from your library; the opening deal is 0089's (none here)", () => {
    const alice = { id: "card:30", seat: 1, name: "Island", faceDown: false, known: true };
    const move = {
      card: "card:30",
      from: { zone: "library", seat: 1 },
      to: { zone: "hand", seat: 1 },
    };
    const before = snap(1, { players: players(3, 50, 0, 50) });
    const after = snap(2, { players: players(3, 50, 1, 49), hand: [alice], moves: [move] });
    expect(boardFromSnapshot(after, before).arrivals.get("card:30")).toBe("viewer:library");
    const opening0 = snap(1, { turn: 0, players: players(0, 57, 0, 57) });
    const opening1 = snap(2, {
      turn: 0,
      players: players(7, 50, 1, 56),
      hand: [alice],
      moves: [move, ...bobDraws(7)],
    });
    const dealt = boardFromSnapshot(opening1, opening0).arrivals;
    expect(dealt.has("card:30")).toBe(false);
    expect([...dealt.keys()].some((k) => k.startsWith("hidden-hand:"))).toBe(false);
  });

  it("on Alice's page Bob's new back lifts off his Library tile, a back the whole way; his number drops then", () => {
    const before = snap(1, { players: players(3, 50) });
    const after = snap(2, { players: players(4, 49), moves: bobDraws(1) });
    const data = boardFromSnapshot(after, before);
    const tiles = (n: number) => ({ "opponent:library": n });
    const view = render(draw({ opponentHand: backs(3), tiles: tiles(50) }));
    calls.length = 0;
    view.rerender(draw({ opponentHand: backs(4), arrivals: data.arrivals, tiles: tiles(49) }));
    const c = view.container;
    const el = slotOf(c, "hidden-hand:2:3");
    const { run, from } = glideOf(el);
    expect(away(from, where["opponent:library"])).toBeLessThan(2);
    expect(Number(run.frames[0]!.opacity)).toBe(0);
    expect(Number(run.frames[1]!.opacity)).toBe(1);
    // Never a face: no turning, no ghost carrying a picture.
    expect(run.frames.every((f) => !/scale\([^,)]+,/.test(String(f.transform)))).toBe(true);
    expect(c.querySelector('[data-ghost-of="hidden-hand:2:3"]')).toBeNull();
    // A second board, one second later: nothing is drawn for it again.
    expect(tileAt(c, "opponent:library", 0)).toEqual(["49"]);
  });

  it("a held-back board with a draw while it resolves: the back waits for the spell", () => {
    const bobs: StackView = { ...RITES, seat: 2 };
    const tiles = (n: number) => ({ "opponent:library": n });
    const view = render(draw({ opponentHand: backs(3), stack: [bobs], tiles: tiles(50) }));
    calls.length = 0;
    view.rerender(
      draw({
        opponentHand: backs(5),
        arrivals: new Map<string, AnchorId>([
          ["hidden-hand:2:3", "opponent:library"],
          ["hidden-hand:2:4", "opponent:library"],
        ]),
        tiles: tiles(48),
      }),
    );
    const c = view.container;
    const lifts = ["hidden-hand:2:3", "hidden-hand:2:4"].map((id) =>
      Number(glideOf(slotOf(c, id)).run.options.delay),
    );
    expect(lifts).toEqual([RESOLVE_MS, RESOLVE_MS + DRAW_BEAT_MS]);
    expect(tileAt(c, "opponent:library", RESOLVE_MS - 10)).toEqual(["50"]);
    expect(tileAt(c, "opponent:library", RESOLVE_MS + 5)).toEqual(["49"]);
    expect(tileAt(c, "opponent:library", RESOLVE_MS + DRAW_BEAT_MS + 5)).toEqual(["48"]);
  });
});

// --- A3: the pile glow never comes on before the card lands ----------------

const fanOf = (c: BoardCard, zone: "graveyard" | "exile"): FanCard => ({
  id: c.id,
  side: "viewer",
  zone,
  how: "ability",
  mine: true,
  name: c.name,
  kind: c.kind,
  types: c.types,
  power: c.power,
  toughness: c.toughness,
  manaCost: "{1}{B}",
  art: null,
  crop: null,
  faceDown: false,
  known: true,
  time: null,
  square: null,
  at: 0,
});
/** How long the tile is held dark (its glow off), from this board's animations. */
function darkFor(container: HTMLElement, tile: string): number {
  const plate = container.querySelector(`[data-zone-tile="${tile}"]`)!;
  const dark = runsOf(plate).find(
    (r) => r.frames.length === 2 && r.frames.every((f) => f.boxShadow === "none"),
  );
  return dark ? Number(dark.options.duration) : 0;
}

describe("F-0123-D (A3) · a pile's glow waits for the card's landing tick", () => {
  it("a creature that dies with a use from the graveyard: dark until its number has ticked", () => {
    const forest = card("card:1", 1, "Forest");
    const agent = card("card:107", 1, "Grave Agent");
    const tiles = (n: number) => ({ "viewer:graveyard": n });
    const view = render(draw({ battlefield: [forest, agent], tiles: tiles(0) }));
    calls.length = 0;
    view.rerender(
      draw({
        battlefield: [forest],
        fans: [fanOf(agent, "graveyard")],
        piles: new Set([agent.id]),
        departures: new Map([[agent.id, "viewer:graveyard"]]),
        tiles: tiles(1),
      }),
    );
    const lands = firstShows(view.container, "viewer:graveyard", "1");
    expect(lands).toBeGreaterThan(500);
    expect(lands).toBeLessThan(Infinity);
    expect(darkFor(view.container, "viewer:graveyard")).toBeGreaterThanOrEqual(lands);
  });

  it("a spell going to exile with a use from there (an adventure): dark until it has landed", () => {
    const giant = card("card:100", 1, "Grave Giant");
    const tiles = (n: number) => ({ "viewer:graveyard": 0, "viewer:exile": n });
    const view = render(draw({ stack: [RITES], tiles: tiles(0) }));
    calls.length = 0;
    view.rerender(
      draw({
        fans: [fanOf(giant, "exile")],
        piles: new Set([giant.id]),
        departures: new Map([[giant.id, "viewer:exile"]]),
        tiles: tiles(1),
      }),
    );
    const lands = firstShows(view.container, "viewer:exile", "1");
    expect(lands).toBeGreaterThan(RESOLVE_MS);
    expect(lands).toBeLessThan(Infinity);
    expect(darkFor(view.container, "viewer:exile")).toBeGreaterThanOrEqual(lands);
  });
});
