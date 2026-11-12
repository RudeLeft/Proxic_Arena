// @vitest-environment jsdom

// Spec 0074 -- discards, mills, countered spells, and cards out of a
// graveyard or exile (F-0074-A, B, C, D, F). The real Board, handed one board
// and then the next, as the game screen hands them (the round's tile moves
// and countered spells from the game's moves; the other player's hand as
// backs only; the plate's tiles in the rail, as the game screen draws them).

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type BoardHandCard, type StackView } from "./Board";
import { anchors, AT_ZONE_SCALE, type AnchorId } from "./motion";
import { geometry } from "./layout";
import type { TileMove } from "./fromSnapshot";
import {
  COUNTER_GO_MS,
  COUNTER_MS,
  DISCARD_BEAT_MS,
  DISCARD_LIFT_MS,
  DISCARD_MS,
  MILL_BEAT_MS,
  MILL_MS,
  SHOW_HOLD_MS,
  SHOW_MS,
  SHOW_RISE_MS,
  SHOW_SCALE,
  STRIKE_MS,
  SWEPT_MS,
} from "./graves";

const size = { width: 1920, height: 1080 };
const g = geometry(size);
const where = anchors(g);
const RESOLVE_MS = 380;
type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  rate: number[];
  animation: Animation;
};
const calls: Call[] = [];
let still = false;
beforeEach(() => {
  calls.length = 0;
  still = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? still : false,
  }));
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const call = { element: this, frames, options, rate: [] as number[] } as Call;
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
      updatePlaybackRate: (rate: number) => call.rate.push(rate),
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

let entered = 0;
function card(id: string, seat: number, name: string, extra: Partial<BoardCard> = {}): BoardCard {
  const land = name === "Forest" || name === "Island" || name === "Swamp";
  return {
    id,
    seat,
    name,
    kind: land ? "land" : "creature",
    types: land ? `Basic Land — ${name}` : `Creature — ${name}`,
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
const backs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:2:${i}`, shown: null }));
const face = (name: string, kind = "creature") => ({
  name,
  kind,
  types: kind === "creature" ? `Creature — ${name}` : "Instant",
  power: kind === "creature" ? 2 : null,
  toughness: kind === "creature" ? 2 : null,
  art: null,
  crop: null,
  faceDown: false,
  known: true,
});
type Place = TileMove["from"]["zone"] | TileMove["to"]["zone"];
const move = (
  id: string,
  from: [Place, "viewer" | "opponent"],
  to: [Place, "viewer" | "opponent"],
  name: string,
  extra: Partial<TileMove> = {},
): TileMove => ({
  card: id,
  from: { zone: from[0] as TileMove["from"]["zone"], side: from[1] },
  to: { zone: to[0], side: to[1] },
  face: face(name),
  hidden: false,
  where: null,
  ...extra,
});

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

function draw(
  battlefield: BoardCard[],
  extra: {
    hand?: BoardHandCard[];
    opponentHand?: ReturnType<typeof backs>;
    stack?: StackView[];
    arrivals?: Map<string, AnchorId>;
    tileMoves?: TileMove[];
    countered?: Set<string>;
    graves?: Map<string, string>;
    tiles?: Record<string, number>;
  } = {},
) {
  return (
    <Board
      battlefield={battlefield}
      hand={extra.hand ?? []}
      opponentHand={extra.opponentHand ?? backs(3)}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={extra.arrivals ?? new Map()}
      departures={new Map()}
      returns={new Map()}
      graves={extra.graves ?? new Map()}
      tileMoves={extra.tileMoves ?? []}
      countered={extra.countered ?? new Set()}
      stack={extra.stack ?? []}
      combat={null}
      damage={null}
      rail={extra.tiles ? <Tiles n={extra.tiles} /> : undefined}
    />
  );
}

const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
const ghostsOf = (container: HTMLElement, id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-ghost-of="${id}"]`),
];
const runOf = (element: Element) => calls.filter((c) => c.element === element).at(-1);
const delayOf = (c: Call) => Number(c.options.delay ?? 0);

/** Where a transform (translate3d, rotate, scale(s) or scale(sx, sy)) puts a card's centre. */
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
  const vx = (g.cardW / 2 - ox!) * sx;
  const vy = (g.cardH / 2 - oy!) * sy;
  return {
    x: ox! + tx + vx * Math.cos(a) - vy * Math.sin(a),
    y: oy! + ty + vx * Math.sin(a) + vy * Math.cos(a),
    s: sy,
  };
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }, px = 2) =>
  Math.hypot(a.x - b.x, a.y - b.y) < px;
/** The frame at `ms` of a run (the last frame at or before it). */
function frameAt(run: Call, ms: number): Keyframe {
  const total = Number(run.options.duration);
  let out = run.frames[0]!;
  for (const f of run.frames) if (Number(f.offset) * total <= ms + 1e-6) out = f;
  return out;
}

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

const mindRot = (seat: number): StackView => ({
  id: "stack:3",
  name: "Mind Rot",
  kind: "spell",
  source: null,
  targets: [{ player: seat === 1 ? 2 : 1 }],
  seat,
  card: "card:3",
});

describe("F-0074-A · discarded: lifted out of the hand, dropped face up into the graveyard", () => {
  it("Mind Rot on Bob: two backs leave the middle of his fan, turn face up, drop into his graveyard", () => {
    const tiles = { "opponent:graveyard": 2 };
    const view = render(draw([], { opponentHand: backs(6), stack: [mindRot(1)], tiles }));
    // Six backs: the two in the middle (2 and 3) are where they leave from.
    const from = [2, 3].map((i) => slotOf(view.container, `hidden-hand:2:${i}`).style.transform);
    calls.length = 0;
    view.rerender(
      draw([], {
        opponentHand: backs(4),
        tiles,
        tileMoves: [
          move("card:71", ["hand", "opponent"], ["graveyard", "opponent"], "Lightning Bolt"),
          move("card:72", ["hand", "opponent"], ["graveyard", "opponent"], "Hill Giant"),
        ],
      }),
    );
    const pile = where["opponent:graveyard"];
    ["card:71", "card:72"].forEach((id, i) => {
      const ghosts = ghostsOf(view.container, id);
      const back = ghosts.find((x) => x.dataset.turn === "back")!;
      const up = ghosts.find((x) => x.dataset.turn !== "back")!;
      expect(back.querySelector(".bf-opp-back")).toBeTruthy(); // a back: nothing named yet
      expect(up.textContent).toContain(i === 0 ? "Lightning Bolt" : "Hill Giant");
      const b = runOf(back)!;
      const f = runOf(up)!;
      expect(
        near(
          centre(String(b.frames[0]!.transform), back.style.transformOrigin),
          centre(from[i]!, back.style.transformOrigin),
          0.01,
        ),
      ).toBe(true);
      // After Mind Rot has glowed; the second just behind the first.
      expect(delayOf(f)).toBe(RESOLVE_MS + i * DISCARD_BEAT_MS);
      expect(Number(f.options.duration)).toBe(DISCARD_MS);
      // One picture at a time: the back until it is edge-on, then the face.
      expect(b.frames[0]!.opacity).toBe(1);
      expect(f.frames[0]!.opacity).toBe(0);
      expect(Number(frameAt(f, DISCARD_MS * 0.6).opacity)).toBe(1);
      expect(Number(frameAt(b, DISCARD_MS * 0.6).opacity)).toBe(0);
      // It lifts down toward the table first, then drops into his graveyard tile.
      const start = centre(String(f.frames[0]!.transform), up.style.transformOrigin);
      const lifted = centre(
        String(frameAt(f, DISCARD_LIFT_MS).transform),
        up.style.transformOrigin,
      );
      expect(lifted.y).toBeGreaterThan(start.y + 2);
      const last = centre(String(f.frames.at(-1)!.transform), up.style.transformOrigin);
      expect(near(last, pile)).toBe(true);
      expect(last.s).toBeCloseTo(AT_ZONE_SCALE, 3);
      expect(Number(f.frames.at(-1)!.opacity)).toBe(0); // into the tile
    });
    // The fan closes on the gap: the backs after it take the places after them.
    const fourth = runOf(slotOf(view.container, "hidden-hand:2:2"))!;
    expect(fourth).toBeTruthy();
    // No back slides off to his graveyard as a back (today's last-back slide).
    expect(ghostsOf(view.container, "hidden-hand:2:4")).toHaveLength(0);
    expect(ghostsOf(view.container, "hidden-hand:2:5")).toHaveLength(0);
    // Spec 0074, Amendment 1: no word pill -- the report window explains it.
    expect(view.container.querySelector("[data-grave-tag]")).toBeNull();
    // The tile ticks as each lands: 0, 1, 2.
    expect(tileAt(view.container, "opponent:graveyard", 0)).toEqual(["0"]);
    expect(tileAt(view.container, "opponent:graveyard", RESOLVE_MS + DISCARD_MS)).toEqual(["1"]);
    expect(
      tileAt(view.container, "opponent:graveyard", RESOLVE_MS + DISCARD_BEAT_MS + DISCARD_MS),
    ).toEqual(["2"]);
    // No hidden card has an id on the page: his fan is backs by place only.
    for (const el of view.container.querySelectorAll<HTMLElement>("[data-object-id]"))
      expect(el.dataset.objectId).not.toMatch(/^card:7[12]$/);
  });

  it("your discard: as today -- to your graveyard with its tag -- except that it lifts first", () => {
    const shock = handCard("card:41", "Shock");
    const bears = handCard("card:42", "Grizzly Bears");
    const view = render(draw([], { hand: [shock, bears], stack: [mindRot(2)] }));
    const was = slotOf(view.container, bears.id);
    const wasAt = centre(was.style.transform, was.style.transformOrigin);
    calls.length = 0;
    view.rerender(
      draw([], {
        hand: [shock],
        tileMoves: [move(bears.id, ["hand", "viewer"], ["graveyard", "viewer"], "Grizzly Bears")],
        // A cycled card is a discard too: its "Cycled" tag rides with the lift.
        graves: new Map([[bears.id, "Cycled"]]),
      }),
    );
    const [ghost] = ghostsOf(view.container, bears.id);
    const run = runOf(ghost!)!;
    expect(delayOf(run)).toBe(RESOLVE_MS);
    expect(
      near(centre(String(run.frames[0]!.transform), ghost!.style.transformOrigin), wasAt, 0.01),
    ).toBe(true);
    // The lift: up out of the hand, a little larger, before it travels.
    const lifted = centre(
      String(frameAt(run, DISCARD_LIFT_MS).transform),
      ghost!.style.transformOrigin,
    );
    expect(lifted.y).toBeLessThan(wasAt.y - 5);
    expect(Math.abs(lifted.x - wasAt.x)).toBeLessThan(1);
    expect(lifted.s).toBeCloseTo(wasAt.s * 1.05, 3);
    const last = centre(String(run.frames.at(-1)!.transform), ghost!.style.transformOrigin);
    expect(near(last, where["viewer:graveyard"])).toBe(true);
    expect(view.container.querySelector(`[data-grave-tag="${bears.id}"]`)?.textContent).toBe(
      "Cycled",
    );
  });
});

describe("F-0074-B · milled: a stream off the library, face up, into the graveyard", () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `card:${100 + i}`);
  const mills = (ids: string[]) =>
    ids.map((id) => move(id, ["library", "opponent"], ["graveyard", "opponent"], "Mountain"));

  it("Glimpse the Unthinkable (10): one after another, the tile numbers ticking", () => {
    const tiles = { "opponent:library": 40, "opponent:graveyard": 3 };
    const glimpse = { ...mindRot(1), name: "Glimpse the Unthinkable" };
    const view = render(draw([], { stack: [glimpse], tiles }));
    calls.length = 0;
    const ids = names(10);
    view.rerender(
      draw([], {
        tiles: { "opponent:library": 30, "opponent:graveyard": 13 },
        tileMoves: mills(ids),
      }),
    );
    ids.forEach((id, i) => {
      const ghosts = ghostsOf(view.container, id);
      const back = ghosts.find((x) => x.dataset.turn === "back")!;
      const up = ghosts.find((x) => x.dataset.turn !== "back")!;
      const f = runOf(up)!;
      expect(delayOf(f)).toBe(RESOLVE_MS + i * MILL_BEAT_MS);
      expect(Number(f.options.duration)).toBe(MILL_MS);
      // Off the library as a back, face up beside the plate, into the graveyard.
      const b = runOf(back)!;
      expect(
        near(
          centre(String(b.frames[0]!.transform), back.style.transformOrigin),
          where["opponent:library"],
        ),
      ).toBe(true);
      expect(b.frames[0]!.opacity).toBe(1);
      expect(f.frames[0]!.opacity).toBe(0);
      const out = centre(String(frameAt(f, 300).transform), up.style.transformOrigin);
      expect(out.x).toBeLessThan(g.rail.x);
      expect(Number(frameAt(f, 300).opacity)).toBe(1);
      expect(
        near(
          centre(String(f.frames.at(-1)!.transform), up.style.transformOrigin),
          where["opponent:graveyard"],
        ),
      ).toBe(true);
      expect(up.dataset.bundle).toBeUndefined();
    });
    // Library 40 -> 30 as each slides off; graveyard 3 -> 13 as each lands.
    expect(tileAt(view.container, "opponent:library", 0)).toEqual(["40"]);
    expect(tileAt(view.container, "opponent:library", RESOLVE_MS)).toEqual(["39"]);
    expect(tileAt(view.container, "opponent:library", RESOLVE_MS + 9 * MILL_BEAT_MS)).toEqual([
      "30",
    ]);
    expect(tileAt(view.container, "opponent:graveyard", RESOLVE_MS + MILL_MS - 1)).toEqual(["3"]);
    expect(tileAt(view.container, "opponent:graveyard", RESOLVE_MS + MILL_MS)).toEqual(["4"]);
    expect(
      tileAt(view.container, "opponent:graveyard", RESOLVE_MS + 9 * MILL_BEAT_MS + MILL_MS),
    ).toEqual(["13"]);
  });

  it("more than 10: the first 10 one by one, then the rest together as one ×N bundle", () => {
    const tiles = { "opponent:library": 40, "opponent:graveyard": 0 };
    const view = render(draw([], { tiles }));
    calls.length = 0;
    const ids = names(13);
    view.rerender(
      draw([], {
        tiles: { "opponent:library": 27, "opponent:graveyard": 13 },
        tileMoves: mills(ids),
      }),
    );
    const rest = ids
      .slice(10)
      .map((id) => ghostsOf(view.container, id).find((x) => x.dataset.turn !== "back")!);
    const runs = rest.map((x) => runOf(x)!);
    // Together, on one path, a beat after the tenth.
    for (const run of runs) {
      expect(delayOf(run)).toBe(10 * MILL_BEAT_MS);
      expect(run.frames.map((f) => f.transform)).toEqual(runs[0]!.frames.map((f) => f.transform));
    }
    // The top of the bundle says how many.
    expect(rest.map((x) => x.dataset.bundle)).toEqual([undefined, undefined, "3"]);
    expect(rest[2]!.querySelector(".bf-pile")?.textContent).toBe("×3");
    expect(tileAt(view.container, "opponent:graveyard", 10 * MILL_BEAT_MS + MILL_MS - 1)).toEqual([
      "10",
    ]);
    expect(tileAt(view.container, "opponent:graveyard", 10 * MILL_BEAT_MS + MILL_MS)).toEqual([
      "13",
    ]);
  });
});

describe("F-0074-C · countered: struck by the beam, grey ash, to the graveyard", () => {
  const bears = card("card:2", 1, "Grizzly Bears");
  const growth: StackView = {
    id: "stack:5",
    name: "Giant Growth",
    kind: "spell",
    source: null,
    targets: [{ object: bears.id }],
    seat: 1,
    card: "card:22",
  };
  const counterspell: StackView = {
    id: "stack:8",
    name: "Counterspell",
    kind: "spell",
    source: null,
    targets: [{ object: growth.id }],
    seat: 2,
    card: "card:91",
  };

  it("Counterspell on Giant Growth: the beam strikes, it crumbles to ash, no spark to the Bears", () => {
    const view = render(draw([bears], { stack: [counterspell, growth] }));
    calls.length = 0;
    view.rerender(
      draw([bears], {
        countered: new Set([growth.card!]),
      }),
    );
    // The countering spell's beam strikes: it flares, a pulse runs down it, the ripple bursts.
    const strike = view.container.querySelector<HTMLElement>(`[data-strike="${growth.card}"]`)!;
    expect(strike).toBeTruthy();
    const beam = runOf(strike.querySelector("path")!)!;
    expect(Math.max(...beam.frames.map((f) => parseFloat(String(f.strokeWidth))))).toBeGreaterThan(
      parseFloat(String(beam.frames[0]!.strokeWidth)) * 2,
    );
    expect(runOf(strike.querySelector(".bf-strike-pulse")!)).toBeTruthy();
    expect(runOf(strike.querySelector(".bf-strike-ring")!)).toBeTruthy();
    // Giant Growth: no resolve glow, no spark to the Bears.
    expect(view.container.querySelector(`[data-spark="${bears.id}"]`)).toBeNull();
    const ghost = ghostsOf(view.container, growth.id)[0]!;
    expect(ghost.dataset.countered).toBe("true");
    expect(ghost.querySelectorAll(".bf-mote-ash").length).toBeGreaterThan(0);
    const run = runOf(ghost)!;
    expect(Number(run.options.duration)).toBe(COUNTER_MS);
    // Where it is until the strike, grey ash after it, then into Alice's graveyard.
    expect(String(frameAt(run, STRIKE_MS - 30).transform)).toBe(String(run.frames[0]!.transform));
    expect(String(frameAt(run, STRIKE_MS + 400).filter)).toMatch(/grayscale\(1\)/);
    const last = centre(String(run.frames.at(-1)!.transform), ghost.style.transformOrigin);
    expect(near(last, where["viewer:graveyard"])).toBe(true);
    // It sets off only once the countering spell has resolved; no word pill (Amendment 1).
    expect(String(frameAt(run, COUNTER_GO_MS - 1).transform)).toBe(
      String(frameAt(run, COUNTER_GO_MS - 100).transform),
    );
    expect(view.container.querySelector("[data-grave-tag]")).toBeNull();
    // The Counterspell itself resolved as always: it glows, then goes.
    const cs = ghostsOf(view.container, counterspell.id)[0]!;
    expect(cs.dataset.countered).toBeUndefined();
  });

  it("countered with no beam (no visible source): it crumbles the same way", () => {
    const view = render(draw([bears], { stack: [growth] }));
    calls.length = 0;
    view.rerender(draw([bears], { countered: new Set([growth.card!]) }));
    expect(view.container.querySelector("[data-strike]")).toBeNull();
    const ghost = ghostsOf(view.container, growth.id)[0]!;
    expect(ghost.dataset.countered).toBe("true");
    expect(Number(runOf(ghost)!.options.duration)).toBe(COUNTER_MS);
    expect(view.container.querySelector(`[data-spark="${bears.id}"]`)).toBeNull();
  });
});

describe("F-0074-D · out of a graveyard or exile: risen, shown, then where it goes", () => {
  const raise: StackView = {
    id: "stack:6",
    name: "Raise Dead",
    kind: "spell",
    source: null,
    targets: [],
    seat: 2,
    card: "card:84",
  };

  it("Raise Dead to Bob's hand: shown, then face down near his fan; his new back takes over", () => {
    const view = render(draw([], { opponentHand: backs(4), stack: [raise] }));
    calls.length = 0;
    view.rerender(
      draw([], {
        opponentHand: backs(5),
        tileMoves: [
          move("card:70", ["graveyard", "opponent"], ["hand", "opponent"], "Grizzly Bears", {
            hidden: true,
          }),
        ],
      }),
    );
    const ghost = ghostsOf(view.container, "card:70").find((x) => x.dataset.turn !== "back")!;
    expect(ghost.textContent).toContain("Grizzly Bears");
    const run = runOf(ghost)!;
    expect(delayOf(run)).toBe(RESOLVE_MS);
    expect(Number(run.options.duration)).toBe(SHOW_MS);
    const o = ghost.style.transformOrigin;
    expect(near(centre(String(run.frames[0]!.transform), o), where["opponent:graveyard"])).toBe(
      true,
    );
    // Shown: enlarged, still, for a moment, beside the plate.
    const a = centre(String(frameAt(run, SHOW_RISE_MS).transform), o);
    const b = centre(String(frameAt(run, SHOW_RISE_MS + SHOW_HOLD_MS).transform), o);
    expect(near(a, b, 0.5)).toBe(true);
    expect(a.s).toBeCloseTo(SHOW_SCALE, 3);
    expect(a.x).toBeLessThan(g.rail.x);
    // His newest back flies the same path, unseen until the card turns face down.
    const newBack = slotOf(view.container, "hidden-hand:2:4");
    const backRun = runOf(newBack)!;
    expect(delayOf(backRun)).toBe(RESOLVE_MS);
    expect(backRun.frames[0]!.opacity).toBe(0);
    expect(String(backRun.frames.at(-1)!.transform)).toBe(newBack.style.transform);
    for (let i = 0; i < run.frames.length; i++) {
      // One picture at a time, but for a sliver while edge-on (under a fifth of its width).
      if (Number(run.frames[i]!.opacity) * Number(backRun.frames[i]!.opacity) > 0) {
        const m = /scale\(([-\d.e]+), ([-\d.e]+)\)/.exec(String(run.frames[i]!.transform))!;
        expect(Number(m[1]) / Number(m[2])).toBeLessThan(0.2);
      }
    }
    // No id for the card in his hand: the card is never named there.
    expect(view.container.querySelector('[data-object-id="card:70"]')).toBeNull();
    // Amendment 1: no word pill -- the report window says it.
    expect(view.container.querySelector("[data-return-tag]")).toBeNull();
  });

  it("Unearth: from your graveyard onto the table, landing as that card", () => {
    const forest = card("card:1", 1, "Forest");
    const bears = card("card:8", 1, "Grizzly Bears");
    const tiles = { "viewer:graveyard": 2 };
    const view = render(draw([forest], { tiles }));
    calls.length = 0;
    view.rerender(
      draw([forest, bears], {
        tiles: { "viewer:graveyard": 1 },
        arrivals: new Map([[bears.id, "viewer:graveyard"]]),
        tileMoves: [
          move(bears.id, ["graveyard", "viewer"], ["battlefield", "viewer"], "Grizzly Bears"),
        ],
      }),
    );
    const slot = slotOf(view.container, bears.id);
    const run = runOf(slot)!;
    expect(Number(run.options.duration)).toBe(SHOW_MS);
    const o = slot.style.transformOrigin;
    expect(near(centre(String(run.frames[0]!.transform), o), where["viewer:graveyard"])).toBe(true);
    expect(centre(String(frameAt(run, SHOW_RISE_MS).transform), o).s).toBeCloseTo(SHOW_SCALE, 3);
    expect(String(run.frames.at(-1)!.transform)).toBe(slot.style.transform);
    // The graveyard's number drops as it rises out.
    expect(tileAt(view.container, "viewer:graveyard", 0)).toEqual(["1"]);
  });

  it("Unearth landing in the graveyard the Bears rose from: the number never runs ahead", () => {
    const forest = card("card:1", 1, "Forest");
    const bears = card("card:8", 1, "Grizzly Bears");
    const unearth: StackView = {
      id: "stack:9",
      name: "Unearth",
      kind: "spell",
      source: null,
      targets: [],
      seat: 1,
      card: "card:41",
    };
    const view = render(draw([forest], { stack: [unearth], tiles: { "viewer:graveyard": 1 } }));
    calls.length = 0;
    view.rerender(
      draw([forest, bears], {
        // The Bears out, Unearth in: the game's count is 1 again.
        tiles: { "viewer:graveyard": 1 },
        arrivals: new Map([[bears.id, "viewer:graveyard"]]),
        tileMoves: [
          move(bears.id, ["graveyard", "viewer"], ["battlefield", "viewer"], "Grizzly Bears"),
        ],
      }),
    );
    expect(tileAt(view.container, "viewer:graveyard", 0)).toEqual(["1"]);
    expect(tileAt(view.container, "viewer:graveyard", RESOLVE_MS)).toEqual(["0"]);
    expect(tileAt(view.container, "viewer:graveyard", RESOLVE_MS + 450)).toEqual(["1"]);
  });
  it("Bojuka Bog: his whole graveyard swept to exile as one", () => {
    const ids = ["card:97", "card:96", "card:85", "card:80", "card:87", "card:74"];
    const tiles = { "opponent:graveyard": 6, "opponent:exile": 0 };
    const view = render(draw([], { tiles }));
    calls.length = 0;
    view.rerender(
      draw([], {
        tiles: { "opponent:graveyard": 0, "opponent:exile": 6 },
        tileMoves: ids.map((id) =>
          move(id, ["graveyard", "opponent"], ["exile", "opponent"], "Hill Giant"),
        ),
      }),
    );
    const runs = ids.map((id) => runOf(ghostsOf(view.container, id)[0]!)!);
    // All at once, the same length, from his graveyard into his exile.
    for (const run of runs) {
      expect(delayOf(run)).toBe(0);
      expect(Number(run.options.duration)).toBe(SWEPT_MS);
    }
    const held = ids.map((id, i) =>
      centre(
        String(frameAt(runs[i]!, 600).transform),
        ghostsOf(view.container, id)[0]!.style.transformOrigin,
      ),
    );
    // Held as one fanned pile: side by side, in order.
    for (let i = 1; i < held.length; i++) expect(held[i]!.x).toBeGreaterThan(held[i - 1]!.x);
    expect(held.at(-1)!.x - held[0]!.x).toBeLessThan(g.cardW);
    const ghost = ghostsOf(view.container, ids[0]!)[0]!;
    expect(
      near(
        centre(String(runs[0]!.frames.at(-1)!.transform), ghost.style.transformOrigin),
        where["opponent:exile"],
      ),
    ).toBe(true);
    expect(ghost.querySelector(".bf-motes")).toBeTruthy();
    expect(tileAt(view.container, "opponent:graveyard", 0)).toEqual(["0"]);
    expect(tileAt(view.container, "opponent:exile", SWEPT_MS - 1)).toEqual(["0"]);
    expect(tileAt(view.container, "opponent:exile", SWEPT_MS)).toEqual(["6"]);
  });
});

describe("F-0074-F · hurry and reduce motion", () => {
  const mills = Array.from({ length: 4 }, (_, i) =>
    move(`card:${200 + i}`, ["library", "viewer"], ["graveyard", "viewer"], "Swamp"),
  );

  it("a click hurries all of it: the stream, the tiles' numbers", () => {
    const view = render(draw([], { tiles: { "viewer:library": 30, "viewer:graveyard": 0 } }));
    calls.length = 0;
    view.rerender(
      draw([], { tiles: { "viewer:library": 26, "viewer:graveyard": 4 }, tileMoves: mills }),
    );
    const moving = calls.filter(
      (c) => c.element.closest(".bf-ghost") || c.element.closest("[data-zone-tile]"),
    );
    expect(moving.length).toBeGreaterThan(8);
    fireEvent.pointerDown(document.body);
    for (const c of moving) expect(c.rate.length).toBe(1);
  });

  it("reduce motion: nothing moves -- no ghosts, no beam, the numbers simply change", () => {
    still = true;
    const view = render(draw([], { tiles: { "viewer:library": 30, "viewer:graveyard": 0 } }));
    calls.length = 0;
    view.rerender(
      draw([], { tiles: { "viewer:library": 26, "viewer:graveyard": 4 }, tileMoves: mills }),
    );
    expect(view.container.querySelectorAll(".bf-ghost")).toHaveLength(0);
    expect(view.container.querySelectorAll(".gs-zone-was")).toHaveLength(0);
    expect(tileAt(view.container, "viewer:graveyard", 0)).toEqual(["4"]);
  });
});
