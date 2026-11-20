// @vitest-environment jsdom

// Spec 0087 -- cards you may still play from your piles (F-0087-A..E and
// Amendment 1; owner on the canvas gaps-marks-1113, A · glow and a fan beside
// the plate). The board as the game screen draws it, handed one board and
// then the next, and the pure pieces under it.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type StackView } from "./Board";
import { FAN_CLOSE_MS, FAN_RISE_MS, FAN_SINK_MS, fanWords } from "./FanCards";
import {
  FAN_H,
  FAN_PLACES,
  FAN_SIGN,
  Z_FAN,
  fanBoxes,
  fanCards,
  fanMore,
  fanPlaces,
  fanReach,
  fanWidth,
  pileGlows,
  type FanCard,
} from "./pileFan";
import { boardFromSnapshot } from "./fromSnapshot";
import { BAND_EDGE, geometry, layout, type Box } from "./layout";
import { syntheticBoard } from "./fixture";
import { hurry } from "./motion";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";

type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: { onfinish: null | (() => void); oncancel: null | (() => void); rates: number[] };
};
const calls: Call[] = [];
let still = false;
beforeEach(() => {
  calls.length = 0;
  still = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1080);
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
    const animation = {
      onfinish: null as null | (() => void),
      oncancel: null as null | (() => void),
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      rates: [] as number[],
      cancel() {},
      finished: new Promise(() => {}),
      effect: {
        getComputedTiming: () => ({
          endTime: Number(options.duration ?? 0) + Number(options.delay ?? 0),
          iterations: 1,
        }),
      },
      updatePlaybackRate(rate: number) {
        animation.rates.push(rate);
      },
    };
    calls.push({ element: this, frames, options, animation });
    return animation;
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
    this: Element,
  ) {
    return calls.filter((c) => this.contains(c.element)).map((c) => c.animation);
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A snapshot as the worker sends it, through the page's own parser. */
function snap(seat: number, body: Record<string, unknown>, revision = 1): Snapshot {
  const state = reduceMatch(EMPTY_MATCH, {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      seat,
      turn: 7,
      phase: "MAIN1",
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 2, libraryCount: 40 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 42 },
      ],
      battlefield: [],
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...body,
    },
  });
  return state.board!;
}
const pileRow = (id: string, seat: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "other",
  types: "Instant",
  tapped: false,
  faceDown: false,
  known: true,
  manaCost: "{R}",
  ...extra,
});
const ALICE_CASTS = { uses: [{ seat: 1, how: "cast" }] };

/** Light Up the Stage's two, Think Twice, the Giant on its adventure, a foretold card: Alice's turn. */
function stageBoard(seat: number) {
  const hidden =
    seat === 1 ? {} : { known: false, name: "Face-down", faceDown: true, kind: "unknown" };
  return snap(seat, {
    graveyard: [pileRow("card:10", 1, "Think Twice", ALICE_CASTS)],
    exile: [
      pileRow("card:11", 1, "Bonecrusher Giant", {
        ...ALICE_CASTS,
        kind: "creature",
        types: "Creature — Giant",
        power: 4,
        toughness: 3,
      }),
      pileRow("card:12", 1, "Lava Dart", ALICE_CASTS),
      pileRow("card:13", 1, "Mountain", {
        ...ALICE_CASTS,
        kind: "land",
        types: "Land — Mountain",
        manaCost: null,
      }),
      pileRow("card:14", 1, "Saw It Coming", {
        ...ALICE_CASTS,
        foretold: true,
        faceDown: true,
        ...hidden,
      }),
      pileRow("card:15", 1, "Shock"),
    ],
  });
}

function Tiles() {
  return (
    <>
      {["viewer", "opponent"].flatMap((side) =>
        ["graveyard", "exile"].map((zone) => (
          <div key={`${side}:${zone}`} className="gs-zone" data-zone-tile={`${side}:${zone}`}>
            <span className="gs-zone-n">0</span>
          </div>
        )),
      )}
    </>
  );
}

function draw(
  fans: readonly FanCard[],
  extra: {
    piles?: ReadonlySet<string>;
    stack?: StackView[];
    seen?: (at: (id: string) => Box | null) => void;
  } = {},
) {
  return (
    <Board
      battlefield={[]}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => `/art/${art}`}
      stack={extra.stack ?? []}
      combat={null}
      fans={fans}
      pileCards={extra.piles ?? new Set(fans.map((c) => c.id))}
      rail={<Tiles />}
      overlay={(at) => {
        extra.seen?.(at);
        return null;
      }}
    />
  );
}

const fanEl = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-fan-card="${id}"]`);
const runsOf = (element: Element | null) => calls.filter((c) => c.element === element);
const g = geometry({ width: 1920, height: 1080 });

// --- the snapshot and the fan's model ------------------------------------------------------------

describe("F-0087 · the game's list, as the page reads it", () => {
  it("parses each pile card's uses, foretold and plotted, and drops what it cannot read", () => {
    const s = snap(1, {
      exile: [
        pileRow("card:1", 1, "Lava Dart", {
          uses: [
            { seat: 1, how: "cast" },
            { seat: "x", how: "cast" },
            { seat: 2, how: "fly" },
          ],
          foretold: true,
          plotted: "yes",
        }),
      ],
    });
    expect(s.exile[0]!.uses).toEqual([{ seat: 1, how: "cast" }]);
    expect(s.exile[0]!.foretold).toBe(true);
    expect(s.exile[0]!.plotted).toBeUndefined();
  });

  it("builds the fan from `uses` alone: never a card without them, never by name", () => {
    const fans = fanCards(stageBoard(1));
    expect(fans.map((c) => c.id)).toEqual(["card:10", "card:11", "card:12", "card:13", "card:14"]);
    // Shock has no uses: it stays in the pile, whatever it is.
    expect(fans.some((c) => c.name === "Shock")).toBe(false);
    expect(fans.every((c) => c.side === "viewer" && c.mine)).toBe(true);
    expect(fans[0]!.zone).toBe("graveyard");
    expect(fans[4]!.square).toBe("foretold");
  });

  it("the other player sees the same fan by Alice's plate, nothing of it theirs to use", () => {
    const fans = fanCards(stageBoard(2));
    expect(fans).toHaveLength(5);
    expect(fans.every((c) => c.side === "opponent" && !c.mine)).toBe(true);
    // The foretold card: a back, no name, no picture (whatever was sent).
    expect(fans[4]).toMatchObject({ known: false, faceDown: true, name: "", art: null });
  });

  it("is in the board data the game screen hands the board", () => {
    expect(boardFromSnapshot(stageBoard(1), null).fans.map((c) => c.id)).toHaveLength(5);
  });

  it("lights a tile only for a card someone may use now (not a suspended one)", () => {
    const s = snap(1, {
      exile: [pileRow("card:20", 1, "Ancestral Vision", { uses: [{ seat: 1, how: "suspended" }] })],
      graveyard: [pileRow("card:21", 1, "Think Twice", ALICE_CASTS)],
    });
    expect(pileGlows(fanCards(s), "viewer")).toEqual({ graveyard: true, exile: false });
    expect(pileGlows(fanCards(s), "opponent")).toEqual({ graveyard: false, exile: false });
  });
});

// --- F-0087-A, E: where the fan stands ---------------------------------------------------------

describe("F-0087-A · E · the fan beside the plate", () => {
  it("stands just left of the column, below your land line, the first card on the right", () => {
    const fans = fanCards(stageBoard(1));
    const boxes = fanBoxes(fans, g);
    const first = boxes.get("card:10")!;
    // Spec 0106 (Q4 B): whole cards 88 x 63 at 1080, tops at 990 (the hand's).
    expect(first.h).toBeCloseTo(88, 0);
    expect(Math.abs(first.w - 63)).toBeLessThanOrEqual(1);
    expect(first.y).toBeCloseTo(990, 0);
    expect(first.x + first.w).toBeCloseTo(g.rail.x - 10, 0);
    const second = boxes.get("card:11")!;
    // 4 px apart: never overlapping.
    expect(first.x - (second.x + second.w)).toBeCloseTo(4, 3);
    expect(Z_FAN).toBeLessThan(10000); // under the hand
  });

  it("for the other player's plate, the top-right corner, above their land line", () => {
    const box = fanBoxes(fanCards(stageBoard(2)), g).get("card:10")!;
    // Spec 0106: the same numbers, mirrored at the top edge (2 px in).
    expect(box.y).toBeCloseTo(2, 0);
    expect(box.h).toBeCloseTo(88, 0);
    expect(Math.abs(box.w - 63)).toBeLessThanOrEqual(1);
    expect(box.y + box.h).toBeLessThanOrEqual(BAND_EDGE * 1080 - 4 + 0.01);
    const second = fanBoxes(fanCards(stageBoard(2)), g).get("card:11")!;
    expect(box.x - (second.x + second.w)).toBeCloseTo(4, 3);
  });

  // Amendment 2 (owner, 2026-11-14) -- never over the land line, at every size swept.
  for (const size of [
    { width: 1920, height: 947 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3440, height: 1440 },
  ])
    it(`keeps off the land line on a full board, both sides, its sign inside it (${size.width}x${size.height})`, () => {
      const gg = geometry(size);
      const full = syntheticBoard(200, 30, 3);
      const laid = layout(full, size);
      const fans = [
        ...fanCards(stageBoard(1)),
        ...fanCards(stageBoard(2)).map((c) => ({ ...c, id: `${c.id}x` })),
      ];
      const boxes = fanBoxes(fans, gg);
      // The table's cards nearest each edge: the bottom of the lowest, the top of the highest.
      const ys = laid.slots.flatMap((slot) => [slot.box.y, slot.box.y + slot.box.h]);
      const lowest = Math.max(...laid.slots.map((slot) => slot.box.y + slot.box.h));
      const highest = Math.min(...laid.slots.map((slot) => slot.box.y));
      expect(ys.length).toBeGreaterThan(0);
      for (const card of fans) {
        const b = boxes.get(card.id)!;
        // Spec 0106: the sign is inside the card, so the card is the whole of it.
        if (card.side === "viewer") {
          expect(b.y).toBeGreaterThan(lowest);
          expect(b.y + b.h).toBeLessThanOrEqual(size.height);
        } else {
          expect(b.y + b.h).toBeLessThan(highest);
          expect(b.y).toBeGreaterThanOrEqual(0);
        }
        // It stops short of the column (the plates, the act button).
        expect(b.x + b.w).toBeLessThan(gg.rail.x);
      }
      // Seven places fit at every supported size (UI-006).
      expect(fanPlaces(gg)).toBe(FAN_PLACES);
    });

  it('never closes up: past seven places, six cards and a "+N" (spec 0106)', () => {
    const one = fanCards(stageBoard(1))[0]!;
    const many = (n: number): FanCard[] =>
      Array.from({ length: n }, (_, i) => ({ ...one, id: `card:${100 + i}`, at: i }));
    for (const n of [1, 3, 6, 7, 8, 12]) {
      const cards = many(n);
      const boxes = fanBoxes(cards, g);
      const more = fanMore(cards, g);
      const shown = n <= 7 ? n : 6;
      expect(boxes.size, `${n} cards`).toBe(shown);
      expect(more.length, `${n} cards`).toBe(n <= 7 ? 0 : 1);
      if (n > 7) {
        expect(more[0]!.count).toBe(n - 6);
        // The newest six are the ones shown (the oldest go behind the "+N").
        expect([...boxes.keys()].sort()).toEqual(
          cards
            .slice(n - 6)
            .map((c) => c.id)
            .sort(),
        );
      }
      // Every place 63 wide, 4 px apart, none over another: the "+N" too.
      const all = [...boxes.values(), ...more.map((m) => m.box)].sort((a, b) => b.x - a.x);
      for (let i = 1; i < all.length; i++) {
        expect(all[i - 1]!.x - (all[i]!.x + all[i]!.w)).toBeCloseTo(4, 3);
      }
      const left = Math.min(...all.map((b) => b.x));
      expect(g.rail.x - 10 - left).toBeLessThanOrEqual(0.3 * g.play.w + 1);
      expect(fanWidth(n, g)).toBeCloseTo(g.rail.x - 10 - left, 3);
    }
  });

  it("the hand closes up to keep clear of it, centred as ever (nothing covers the hand)", () => {
    const hand = Array.from({ length: 14 }, (_, i) => ({ id: `card:${200 + i}` }));
    const keep = fanReach({ viewer: 5, opponent: 0 }, g);
    const open = layout({ battlefield: [], hand, viewerSeat: 1 }, { width: 1920, height: 1080 });
    const kept = layout(
      { battlefield: [], hand, viewerSeat: 1, keepRight: keep },
      { width: 1920, height: 1080 },
    );
    const rightOf = (l: typeof open) =>
      Math.max(...hand.map((c) => l.boxes.get(c.id)!.x + l.boxes.get(c.id)!.w));
    // Without the fan the hand reaches under it; with it, it stops short.
    const fanLeft = Math.min(...[...fanBoxes(fanCards(stageBoard(1)), g).values()].map((b) => b.x));
    expect(rightOf(open)).toBeGreaterThan(fanLeft);
    expect(rightOf(kept)).toBeLessThan(fanLeft);
    const mid = (l: typeof open) => {
      const xs = hand.map((c) => l.boxes.get(c.id)!.x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    expect(mid(kept)).toBeCloseTo(mid(open), 0);
  });

  it("draws each card with its pile's corner sign, at its place, under the hand", () => {
    const c = render(draw(fanCards(stageBoard(1)))).container;
    const dart = fanEl(c, "card:12")!;
    expect(dart.querySelector('[data-sign="exile"]')).toBeTruthy();
    expect(fanEl(c, "card:10")!.querySelector('[data-sign="graveyard"]')).toBeTruthy();
    expect(dart.querySelector('[data-object-id="card:12"]')!.textContent).toContain("Lava Dart");
    const box = fanBoxes(fanCards(stageBoard(1)), g).get("card:12")!;
    expect(dart.style.transform).toBe(`translate3d(${box.x}px, ${box.y}px, 0)`);
    expect(Number(dart.style.zIndex)).toBeLessThan(10000);
  });

  it("its sign sits inside the card's top-right corner, under the whole-width name bar (spec 0106, Amendment 1)", () => {
    // jsdom applies no sheet: read the rule as written (battlefield.css).
    const css = readFileSync(resolve(__dirname, "battlefield.css"), "utf8");
    const rule = (selector: string) => {
      const at = css.indexOf(`\n${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf("}", at));
    };
    const k = (body: string, prop: string) => {
      const m = new RegExp(String.raw`\n\s*${prop}: calc\(var\(--card-h\) \* (-?[\d.]+)\)`).exec(
        body,
      );
      expect(m, prop).toBeTruthy();
      return Number(m![1]);
    };
    const sign = rule(".bf-fan-sign");
    const right = k(sign, "right");
    const top = k(sign, "top");
    const size = k(sign, "width");
    expect(right).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(size).toBe(FAN_SIGN);
    expect(k(sign, "height")).toBe(FAN_SIGN);
    // Amendment 1: under the name bar (its height), so the name has the bar's whole width;
    // and inside the card's height.
    const bar = k(rule(".bf-bar"), "height");
    expect(top).toBeGreaterThanOrEqual(bar);
    expect(top + size).toBeLessThanOrEqual(1);
    expect(css).not.toContain(".bf-fan-face .bf-bar-top {");
  });
});

// --- F-0087-A: rising out of a tile, back into it ---------------------------------------------------

describe("F-0087-A · Light Up the Stage: rising out of Exile, leaving when the window ends", () => {
  const two = (uses: boolean) =>
    fanCards(
      snap(1, {
        exile: [
          pileRow("card:12", 1, "Lava Dart", uses ? ALICE_CASTS : {}),
          pileRow("card:13", 1, "Mountain", uses ? ALICE_CASTS : {}),
        ],
      }),
    );

  it("each card rises out of its tile into its place, the tile pulsing and the glow swelling", () => {
    const view = render(draw([], { piles: new Set() }));
    calls.length = 0;
    view.rerender(draw(two(true)));
    const c = view.container;
    const tile = c.querySelector('[data-zone-tile="viewer:exile"]')!;
    for (const id of ["card:12", "card:13"]) {
      const rise = runsOf(fanEl(c, id)).find((r) => r.options.duration === FAN_RISE_MS)!;
      expect(rise).toBeTruthy();
      // From the tile, small and faint, to the fan.
      expect(String(rise.frames[0]!.transform)).toContain("scale(");
      expect(rise.frames[0]!.opacity).toBe(0.3);
      const from = String(rise.frames[0]!.transform)
        .match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)!
        .slice(1)
        .map(Number);
      expect(from[0]!).toBeGreaterThan(g.rail.x - 20); // over the column, at the tile
      expect(rise.frames.at(-1)!.opacity).toBe(1);
      // New to the pile this board: it waits for the card to land there.
      expect(Number(rise.options.delay)).toBeGreaterThan(0);
      const face = fanEl(c, id)!.querySelector(".bf-fan-face")!;
      expect(runsOf(face).length).toBeGreaterThan(0);
    }
    // Its glow waits for the first card to rise (dark until then), then pulses as each does.
    const runs = runsOf(tile);
    const dark = runs.find((r) => r.frames[0]!.boxShadow === "none")!;
    expect(dark).toBeTruthy();
    const firstRise = Math.min(
      ...["card:12", "card:13"].map((id) =>
        Number(runsOf(fanEl(c, id)).find((r) => r.options.duration === FAN_RISE_MS)!.options.delay),
      ),
    );
    expect(dark.options.duration).toBe(firstRise);
    expect(runs.filter((r) => r.frames[0]!.boxShadow !== "none")).toHaveLength(2);
  });

  it("the tile stays lit until its last card has sunk back in", () => {
    const view = render(draw(two(true)));
    calls.length = 0;
    view.rerender(draw(two(false), { piles: new Set(["card:12", "card:13"]) }));
    const tile = view.container.querySelector('[data-zone-tile="viewer:exile"]')!;
    const lit = runsOf(tile)[0]!;
    expect(String(lit.frames[0]!.boxShadow)).toContain("#f2c46a");
    expect(lit.options.duration).toBe(FAN_SINK_MS);
  });

  it("they leave when the window ends: back into the tile, as they looked, fading there", () => {
    const view = render(draw(two(true)));
    calls.length = 0;
    view.rerender(draw(two(false), { piles: new Set(["card:12", "card:13"]) }));
    const c = view.container;
    expect(fanEl(c, "card:12")).toBeNull();
    const leaving = [...c.querySelectorAll<HTMLElement>(".bf-fan-leaving")];
    expect(leaving.map((l) => l.dataset["fanLeaving"]).sort()).toEqual(["card:12", "card:13"]);
    const sink = runsOf(leaving[0]!)[0]!;
    expect(sink.options.duration).toBe(FAN_SINK_MS);
    expect(sink.frames.at(-1)!.opacity).toBe(0);
    // Its look as it was, no longer a button for the card (the jump check follows the ghost).
    expect(leaving[0]!.querySelector("[data-object-id]")).toBeNull();
    expect(leaving[0]!.querySelector("[data-ghost-of]")).toBeTruthy();
    sink.animation.onfinish?.();
    expect(c.querySelectorAll(".bf-fan-leaving")).toHaveLength(1);
  });

  it("a card that left its pile (cast) does not sink: the cast takes it from the fan", () => {
    const view = render(draw(two(true)));
    view.rerender(draw(two(true).slice(1), { piles: new Set(["card:13"]) }));
    expect(view.container.querySelector(".bf-fan-leaving")).toBeNull();
  });

  it("plays once per board: a redraw for anything else replays nothing", () => {
    const fans = two(true);
    const view = render(draw([], { piles: new Set() }));
    view.rerender(draw(fans));
    calls.length = 0;
    const ability: StackView = {
      id: "stack:7",
      name: "Grizzly Bears",
      by: "Bob",
      seat: 2,
      kind: "ability",
      source: null,
      targets: [],
      card: null,
    };
    view.rerender(draw(fans, { stack: [ability] }));
    expect(calls.filter((r) => r.element.closest("[data-fan-card]"))).toHaveLength(0);
  });

  it("the fan closes the gap", () => {
    const three = fanCards(stageBoard(1)).slice(0, 3);
    const view = render(draw(three));
    calls.length = 0;
    view.rerender(draw([three[0]!, three[2]!], { piles: new Set(["card:10", "card:12"]) }));
    const close = runsOf(fanEl(view.container, "card:12")).find(
      (r) => r.options.duration === FAN_CLOSE_MS,
    )!;
    expect(close).toBeTruthy();
    const was = fanBoxes(three, g).get("card:12")!;
    expect(close.frames[0]!.transform).toBe(`translate3d(${was.x}px, ${was.y}px, 0)`);
  });
});

// --- F-0087-B: cast from the fan ---------------------------------------------------------------

describe("F-0087-B · cast straight from the fan", () => {
  // The click itself (a fan card's options, its breath, the cast it sends) is
  // proven on the real game screen from a real board: fixes0087screen.test.tsx,
  // Amendment 3 (TEST-003: no clickable state handed to the board by hand).

  it("the board says where it stands, and still says so on the board after it was cast", () => {
    let at: ((id: string) => Box | null) | null = null;
    const fans = fanCards(stageBoard(1));
    const view = render(draw(fans, { seen: (a) => (at = a) }));
    const box = fanBoxes(fans, g).get("card:11")!;
    expect(at!("card:11")).toEqual(box);
    // Cast: gone from the fan and the pile, the casting card rises from where it stood.
    view.rerender(
      draw(
        fans.filter((f) => f.id !== "card:11"),
        { piles: new Set(["card:10", "card:12", "card:13", "card:14"]), seen: (a) => (at = a) },
      ),
    );
    expect(at!("card:11")).toEqual(box);
  });

  it("an ability from the graveyard wears its own small mark; a cast does not", () => {
    const s = snap(1, {
      graveyard: [
        pileRow("card:30", 1, "Dregscape Zombie", {
          uses: [{ seat: 1, how: "ability" }],
          kind: "creature",
        }),
        pileRow("card:31", 1, "Think Twice", ALICE_CASTS),
      ],
    });
    const c = render(draw(fanCards(s))).container;
    expect(fanEl(c, "card:30")!.querySelector('[data-square="ability"]')).toBeTruthy();
    expect(fanEl(c, "card:31")!.querySelector("[data-square]")).toBeNull();
    expect(fanWords(fanCards(s)[0]!, "your")).toBe(
      "Dregscape Zombie, in your graveyard, you may use its ability from there",
    );
  });

  it("an ability or trigger of a fan card lifts off it; of any other pile card, off its tile", () => {
    const stackOf = (source: string, kind: "trigger" | "ability") => ({
      id: "stack:5",
      kind,
      source,
      controller: 1,
      name: "Ancestral Vision",
      description: "At the beginning of your upkeep, remove a time counter",
      targets: [],
    });
    const s = (source: string, kind: "trigger" | "ability") =>
      snap(1, {
        exile: [
          pileRow("card:20", 1, "Ancestral Vision", { uses: [{ seat: 1, how: "suspended" }] }),
          pileRow("card:22", 1, "Distortion Strike"),
        ],
        stack: [stackOf(source, kind)],
      });
    expect(boardFromSnapshot(s("card:20", "trigger"), null).stack[0]!.riseFrom).toBe("card:20");
    expect(boardFromSnapshot(s("card:22", "trigger"), null).stack[0]!.riseFrom).toBe(
      "pile:1:exile",
    );
    expect(boardFromSnapshot(s("card:22", "ability"), null).stack[0]!.riseFrom).toBe(
      "pile:1:exile",
    );
  });

  it("so its stack card rises (never slides in at the stack spot)", () => {
    const fans = fanCards(
      snap(1, {
        exile: [
          pileRow("card:20", 1, "Ancestral Vision", {
            uses: [{ seat: 1, how: "suspended" }],
            counters: [{ name: "TIME", count: 3 }],
          }),
        ],
      }),
    );
    const trigger: StackView = {
      id: "stack:9",
      name: "Ancestral Vision",
      by: "Alice",
      seat: 1,
      kind: "trigger",
      source: null,
      leftFrom: "card:20",
      riseFrom: "card:20",
      targets: [],
      card: null,
    };
    const view = render(draw(fans));
    view.rerender(draw(fans, { stack: [trigger] }));
    const slot = view.container
      .querySelector('[data-object-id="stack:9"]')!
      .closest<HTMLElement>(".bf-slot")!;
    expect(slot.dataset["rising"]).toBe("true");
  });
});

// --- F-0087-C: foretold, face down to the other player ----------------------------------------------

describe("F-0087-C · foretell: a face-down back with no name in the other player's view", () => {
  it("Bob sees a back with the eye, never its name", () => {
    const c = render(draw(fanCards(stageBoard(2)))).container;
    const saw = fanEl(c, "card:14")!;
    expect(saw.querySelector('[data-face="down"]')).toBeTruthy();
    expect(saw.querySelector('[data-square="foretold"]')).toBeTruthy();
    expect(c.textContent).not.toContain("Saw It Coming");
    expect(saw.querySelector("button")!.getAttribute("aria-label")).toContain("A face-down card");
  });

  it("Alice sees her own foretold card by name, with the eye", () => {
    const c = render(draw(fanCards(stageBoard(1)))).container;
    const saw = fanEl(c, "card:14")!;
    expect(saw.querySelector('[data-square="foretold"]')).toBeTruthy();
    expect(saw.textContent).toContain("Saw It Coming");
    // Face up to her, as the canvas draws it (it lies face down in exile).
    expect(saw.querySelector('[data-face="up"]')).toBeTruthy();
  });

  it("a plotted card wears the clock-hand", () => {
    const s = snap(1, {
      exile: [pileRow("card:40", 1, "Slickshot Show-Off", { ...ALICE_CASTS, plotted: true })],
    });
    const c = render(draw(fanCards(s))).container;
    expect(fanEl(c, "card:40")!.querySelector('[data-square="plotted"]')).toBeTruthy();
  });
});

// --- F-0087-D: suspend ---------------------------------------------------------------------

describe("F-0087-D · suspend: dimmed, a time badge ticking down with a rising −1", () => {
  const vision = (n: number) =>
    fanCards(
      snap(1, {
        exile: [
          pileRow("card:20", 1, "Ancestral Vision", {
            uses: [{ seat: 1, how: "suspended" }],
            counters: [{ name: "TIME", count: n }],
            manaCost: null,
          }),
        ],
      }),
    );

  it("stands dimmed, not castable, with its round time badge", () => {
    const c = render(draw(vision(4))).container;
    const card = fanEl(c, "card:20")!;
    expect(card.classList.contains("bf-fan-suspended")).toBe(true);
    expect(card.querySelector<HTMLElement>(".bf-fan-time")!.dataset["time"]).toBe("4");
    expect(vision(4)[0]!.mine).toBe(false);
  });

  it("at its upkeep the badge pops to 3, the 4 held until then, and a −1 rises", () => {
    const view = render(draw(vision(4)));
    calls.length = 0;
    view.rerender(draw(vision(3)));
    const c = view.container;
    const badge = fanEl(c, "card:20")!.querySelector<HTMLElement>(".bf-fan-time")!;
    expect(badge.dataset["time"]).toBe("3");
    expect(runsOf(badge).some((r) => String(r.frames[1]!.transform).includes("1.45"))).toBe(true);
    expect(badge.querySelector<HTMLElement>("[data-time-was]")!.textContent).toBe("4");
    const float = c.querySelector<HTMLElement>('[data-fan-float="card:20"]')!;
    expect(float.textContent).toBe("−1");
    expect(float.classList.contains("bf-fan-float-down")).toBe(true);
    expect(runsOf(float).length).toBe(1);
  });

  it("at the last counter the badge says 0, with its −1 (the game sends no counter at 0)", () => {
    const zero = fanCards(
      snap(1, {
        exile: [
          pileRow("card:20", 1, "Ancestral Vision", {
            uses: [{ seat: 1, how: "suspended" }],
            counters: [],
            manaCost: null,
          }),
        ],
      }),
    );
    const view = render(draw(vision(1)));
    view.rerender(draw(zero));
    const c = view.container;
    expect(fanEl(c, "card:20")!.querySelector<HTMLElement>(".bf-fan-time")!.dataset["time"]).toBe(
      "0",
    );
    expect(c.querySelector('[data-fan-float="card:20"]')!.textContent).toBe("−1");
  });

  it("no tick when the number did not change", () => {
    const view = render(draw(vision(4)));
    calls.length = 0;
    view.rerender(draw(vision(4).map((f) => ({ ...f }))));
    expect(view.container.querySelector("[data-fan-float]")).toBeNull();
  });
});

// --- A-00: a click hurries it; reduce motion skips it --------------------------------------------

describe("A-00 · a click hurries every part; reduce motion skips it", () => {
  it("a click hurries the rise", () => {
    const view = render(draw([], { piles: new Set() }));
    calls.length = 0;
    view.rerender(draw(fanCards(stageBoard(1))));
    hurry(view.container);
    const rise = runsOf(fanEl(view.container, "card:11")).find(
      (r) => r.options.duration === FAN_RISE_MS,
    )!;
    expect(rise.animation.rates.length).toBe(1);
  });

  it("reduce motion: nothing moves; the fan, its signs and the badge simply show", () => {
    still = true;
    const view = render(draw([], { piles: new Set() }));
    calls.length = 0;
    view.rerender(draw(fanCards(stageBoard(1))));
    const c = view.container;
    expect(c.querySelectorAll("[data-fan-card]")).toHaveLength(5);
    expect(calls.filter((r) => r.element.closest("[data-fan-card]"))).toHaveLength(0);
  });
});

// --- sizes ------------------------------------------------------------------------------------

describe("F-0087-E · its size is the canvas's at every height", () => {
  it("FAN_H at every height: 88 px at 1080, 176 at 2160 (spec 0106)", () => {
    const big = geometry({ width: 3840, height: 2160 });
    const box = fanBoxes(fanCards(stageBoard(1)), big).get("card:10")!;
    expect(box.h).toBeCloseTo(FAN_H * 2160, 3);
    expect(box.h).toBeCloseTo(176, 0);
    expect(box.x + box.w).toBeCloseTo(big.rail.x - 20, 0);
  });
});
