// @vitest-environment jsdom

// Spec 0089 -- token waves (F-0089-E), the umbra's shield (F-0089-D), the
// opening's deal and mulligan on the table (F-0089-B: the other player's
// backs, the libraries' counts), stack names that fit (F-0089-F), and the
// pure pieces under them. The real Board, handed one board and then the
// next, as the game screen hands them. (Harness as fixes0073's.)

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type BoardHandCard, type StackView } from "./Board";
import { type AnchorId } from "./motion";
import {
  TOKEN_AFTER_MS,
  TOKEN_BEAT_ABILITY_MS,
  TOKEN_MS,
  WAVE_MS,
  WAVE_NUMBER_AT,
  WAVE_STEP_MS,
  sparks,
  tokenFrames,
  tokenStart,
  waveSpread,
  waves,
} from "./piles";
import { boardFromSnapshot, openingOf, type Opening, type Survive } from "./fromSnapshot";
import {
  GHOST_AT,
  SHIELD_LEAD_MS,
  UNFOLD_MS,
  umbraGhostBox,
  umbraMarks,
  umbraTimes,
} from "./umbra";
import {
  DEAL_BEAT_MS,
  DEAL_MS,
  REDEAL_AT,
  RIFFLE_AT,
  dealAt,
  dealFrames,
  sweepAt,
  sweptAt,
  turnDownFrames,
} from "./opening";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import type { CombatWave } from "./fights";

const size = { width: 1920, height: 1080 };
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
  // A click hurries what is moving on the board (A-00): the board's
  // animations, as a browser lists them.
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
  const land = name === "Forest" || name === "Mountain" || name === "Plains";
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
    power: land ? null : 1,
    toughness: land ? null : 1,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}
const token = (id: string, name: string, extra: Partial<BoardCard> = {}) =>
  card(id, 1, name, { token: true, types: `Token Creature — ${name}`, ...extra });
const backs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:2:${i}`, shown: null }));

function draw(
  battlefield: BoardCard[],
  extra: {
    hand?: BoardHandCard[];
    opponentHand?: ReturnType<typeof backs>;
    stack?: StackView[];
    arrivals?: Map<string, AnchorId>;
    departures?: Map<string, AnchorId>;
    combat?: Parameters<typeof Board>[0]["combat"];
    damage?: CombatWave | null;
    survive?: Survive | null;
    opening?: Opening | null;
    veilHand?: boolean;
    openingDelay?: number;
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
      departures={extra.departures ?? new Map()}
      returns={new Map()}
      stack={extra.stack ?? []}
      combat={extra.combat ?? null}
      damage={extra.damage ?? null}
      survive={extra.survive ?? null}
      opening={extra.opening ?? null}
      veilHand={extra.veilHand ?? false}
      openingDelay={extra.openingDelay ?? 0}
    />
  );
}

const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
const ghostsOf = (container: HTMLElement, id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-ghost-of="${id}"]`),
];
const runOf = (element: Element) => calls.filter((c) => c.element === element).at(-1);

/** A snapshot as the worker sends it, through the page's own parser. */
function snap(seat: number, body: Record<string, unknown>, revision = 1): Snapshot {
  return reduceMatch(EMPTY_MATCH, {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      seat,
      turn: 0,
      phase: "",
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 7, libraryCount: 53 },
        { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 53 },
      ],
      battlefield: [],
      hand: [],
      otherHands: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...body,
    },
  }).board!;
}

// --- F-0089-E: tokens many at once come in waves of 8 --------------------------------------------

describe("F-0089-E · many tokens at once: waves of 8, each with its +8", () => {
  it("up to 8 come one by one as before; more come in waves of 8, 330 ms apart", () => {
    expect([0, 1, 7].map((i) => tokenStart(i, 8, 120))).toEqual([0, 120, 840]);
    expect([0, 1, 7, 8, 9, 16, 19].map((i) => tokenStart(i, 20, 120))).toEqual([
      0,
      WAVE_STEP_MS,
      7 * WAVE_STEP_MS,
      WAVE_MS,
      WAVE_MS + WAVE_STEP_MS,
      2 * WAVE_MS,
      2 * WAVE_MS + 3 * WAVE_STEP_MS,
    ]);
    expect(waves(8)).toEqual([]);
    expect(waves(20)).toEqual([8, 8, 4]);
    expect(waves(16)).toEqual([8, 8]);
    // One spark a wave (each token's own up to 8).
    expect([0, 1, 7].every((i) => sparks(i, 8))).toBe(true);
    expect([0, 1, 8, 9, 16].map((i) => sparks(i, 20))).toEqual([true, false, true, false, true]);
  });

  it("a wave's tokens bow apart mid-flight and land exactly; up to 8 fly straight", () => {
    expect(waveSpread(3, 8, 135)).toEqual({ x: 0, y: 0 });
    const s = waveSpread(3, 20, 135);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(30);
    expect(s.y).toBeLessThan(0); // above the line
    const half = waveSpread(3, 20, 67.5);
    expect(half.x).toBeCloseTo(s.x / 2, 5);
    const box = { x: 100, y: 100, w: 70, h: 98, scale: 1, rotation: 0, z: 1 };
    const to = { ...box, x: 600, y: 400 };
    const plain = tokenFrames(box, to, 70, 98, { x: 0, y: 0 });
    const bowed = tokenFrames(box, to, 70, 98, { x: 0, y: 0 }, s);
    expect(bowed[0]!.transform).toBe(plain[0]!.transform);
    expect(bowed.at(-1)!.transform).toBe(plain.at(-1)!.transform);
    const mid = Math.floor(plain.length * 0.7);
    expect(bowed[mid]!.transform).not.toBe(plain[mid]!.transform);
  });

  const mountain = card("card:1", 1, "Mountain");
  const krenko = card("card:40", 1, "Krenko, Mob Boss");
  const ability: StackView = {
    id: "stack:7",
    name: "Krenko, Mob Boss",
    kind: "ability",
    source: krenko.id,
    targets: [],
    seat: 1,
  };
  const goblins = (n: number, from = 50) =>
    Array.from({ length: n }, (_, i) => token(`card:${from + i}`, "Goblin"));

  it("Krenko makes 12 Goblins: two waves (8, then 4), a bigger spark each, a +8 and a +4", () => {
    const made = goblins(12);
    const view = render(draw([mountain, krenko], { stack: [ability] }));
    calls.length = 0;
    view.rerender(draw([mountain, krenko, ...made]));
    const delayOf = (id: string) => {
      const el =
        ghostsOf(view.container, id)[0] ??
        (view.container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as Element);
      return Number(runOf(el)!.options.delay);
    };
    const delays = made.map((g) => delayOf(g.id));
    expect(delays).toEqual(made.map((_, i) => TOKEN_AFTER_MS + tokenStart(i, 12, 120)));
    expect(delays[8]! - delays[7]!).toBe(WAVE_MS - 7 * WAVE_STEP_MS);
    // One spark a wave, bigger than one token's.
    const sparkEls = [...view.container.querySelectorAll<HTMLElement>("[data-spark]")];
    expect(sparkEls.map((s) => s.dataset.spark)).toEqual([made[0]!.id, made[8]!.id]);
    const big = calls.find((c) => c.element === sparkEls[0])!;
    expect(String(big.frames.at(-1)!.transform)).toContain("scale(2.55)");
    // A rising +8, then +4, each as its wave's first lands.
    const numbers = [...view.container.querySelectorAll<HTMLElement>('[data-fight="number"]')];
    expect(numbers.map((n) => n.textContent)).toEqual(["+8", "+4"]);
    const numberDelays = numbers.map((n) => Number(runOf(n)!.options.delay));
    expect(numberDelays).toEqual([
      delays[0]! + TOKEN_MS + WAVE_NUMBER_AT,
      delays[8]! + TOKEN_MS + WAVE_NUMBER_AT,
    ]);
  });

  it("up to 8 at once: one by one as spec 0073 has it, no +N", () => {
    const made = goblins(3);
    const view = render(draw([mountain, krenko], { stack: [ability] }));
    calls.length = 0;
    view.rerender(draw([mountain, krenko, ...made]));
    const delays = made.map((g) => {
      const el =
        ghostsOf(view.container, g.id)[0] ??
        (view.container
          .querySelector(`[data-object-id="${g.id}"]`)!
          .closest(".bf-slot") as Element);
      return Number(runOf(el)!.options.delay);
    });
    expect(delays).toEqual([0, 1, 2].map((i) => TOKEN_AFTER_MS + i * TOKEN_BEAT_ABILITY_MS));
    expect(view.container.querySelectorAll("[data-spark]").length).toBe(3);
    expect(view.container.querySelectorAll('[data-fight="number"]').length).toBe(0);
  });

  it("reduce motion: they simply are there", () => {
    still = true;
    const view = render(draw([mountain, krenko], { stack: [ability] }));
    calls.length = 0;
    view.rerender(draw([mountain, krenko, ...goblins(12)]));
    expect(view.container.querySelectorAll("[data-spark]").length).toBe(0);
    expect(view.container.querySelectorAll('[data-fight="number"]').length).toBe(0);
  });
});

// --- F-0089-D: the umbra becomes a shield ---------------------------------------------------------

describe("F-0089-D · an umbra destroyed instead: its tab unfolds into a shield that shatters", () => {
  it("the shield is whole before the blow; a blow sooner than that waits for it", () => {
    expect(umbraTimes(2000)).toEqual({ start: 2000 - SHIELD_LEAD_MS, blow: 2000 });
    expect(umbraTimes(600)).toEqual({ start: 0, blow: 600 });
    expect(umbraTimes(380).blow).toBe(UNFOLD_MS + 50);
  });

  it("its marks: the tab held then swung out, the shield unfolding and gone, 18 pieces", () => {
    const host = { x: 400, y: 600, w: 97, h: 136, scale: 1, rotation: 0, z: 1 };
    const tab = { x: 497, y: 602, w: 16, h: 132, scale: 1, rotation: 0, z: 2 };
    const marks = umbraMarks("u", "card:9", host, tab, 100, 750, -1);
    const tabMark = marks.find((m) => m.kind === "umbratab")!;
    expect(tabMark.ghostOf).toBe("card:9");
    expect(tabMark.delay).toBe(0);
    expect(tabMark.frames[0]).toMatchObject({ opacity: 1, transform: "translateX(0px) scaleX(1)" });
    // Held where it was until the shield starts, then gone by its end.
    expect(tabMark.frames[1]).toMatchObject({ offset: 100 / tabMark.duration, opacity: 1 });
    expect(tabMark.frames.at(-1)!.opacity).toBe(0);
    const shield = marks.find((m) => m.kind === "umbrashield")!;
    expect(shield.delay).toBe(100);
    expect(shield.ghostOf).toBe("card:9");
    expect(shield.frames[0]!.opacity).toBe(0);
    expect(String(shield.frames[0]!.transform)).toContain("scaleX(0.060)");
    const whole = shield.frames.find((f) => Number(f.offset) >= (750 - 100) / shield.duration)!;
    expect(String(whole.transform)).toContain("scaleX(1.000)");
    expect(shield.frames.at(-1)!.opacity).toBe(0);
    expect(shield.style["--crack-at"]).toBe(`${750 + 80}ms`);
    const shards = marks.filter((m) => m.kind === "shard");
    expect(shards.length).toBe(18);
    expect(shards.every((m) => m.delay === 750 + 250)).toBe(true);
    // The ghost to the graveyard leaves from the middle, at 0.55 of the creature.
    const ghost = umbraGhostBox(host, 97, 136);
    expect(ghost.w).toBeCloseTo(97 * 0.55, 5);
    expect(ghost.x + ghost.w / 2).toBeCloseTo(400 + 97 / 2, 5);
  });

  it("the game's survivor is read: the Aura destroyed instead, for its creature", () => {
    const now = snap(
      2,
      {
        turn: 8,
        survived: [{ card: "card:5", how: "umbra", by: "card:45" }],
        battlefield: [
          {
            id: "card:5",
            seat: 1,
            owner: 1,
            name: "Grizzly Bears",
            kind: "creature",
            types: "Creature — Bear",
            power: 2,
            toughness: 2,
            tapped: false,
            faceDown: false,
            known: true,
          },
        ],
      },
      2,
    );
    const data = boardFromSnapshot(now, snap(2, { turn: 8 }));
    expect(data.survive?.survived.get("card:5")).toBe("umbra");
    expect(data.survive?.umbras?.get("card:45")).toBe("card:5");
  });

  const bears = card("card:5", 1, "Grizzly Bears");
  const umbra = card("card:45", 1, "Hyena Umbra", {
    kind: "other",
    types: "Enchantment — Aura",
    power: null,
    toughness: null,
    attachedTo: "card:5",
  });
  const survive = (): Survive => ({
    key: "1:9",
    flickers: new Map(),
    survived: new Map([["card:5", "umbra"]]),
    umbras: new Map([["card:45", "card:5"]]),
    phased: new Map(),
  });

  it("on the table: the tab swings out, the shield, its pieces, then the umbra to the graveyard; no dome", () => {
    const view = render(draw([bears, umbra]));
    calls.length = 0;
    view.rerender(
      draw([bears], {
        survive: survive(),
        departures: new Map([["card:45", "viewer:graveyard"]]),
      }),
    );
    const of = (kind: string) => [
      ...view.container.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
    ];
    expect(of("umbratab").map((m) => m.dataset.ghostOf)).toEqual(["card:45"]);
    expect(of("umbratab")[0]!.textContent).toContain("Hyena Umbra");
    expect(of("umbrashield").length).toBe(1);
    expect(of("shard").length).toBe(18);
    // Not the other survivors' looks (0080's dome or shield mark).
    expect(of("dome").length).toBe(0);
    expect(of("shieldbreak").length).toBe(0);
    const ghost = view.container.querySelector<HTMLElement>('.bf-ghost[data-ghost-of="card:45"]')!;
    const run = runOf(ghost)!;
    const { blow } = umbraTimes(0);
    expect(Number(run.options.delay)).toBe(blow + GHOST_AT);
    // Not Shattered on the way: the shield did that.
    expect(ghost.dataset.fate).toBeUndefined();
  });

  it("without the game's word it leaves as before (Shattered from its tab), and no shield", () => {
    const view = render(draw([bears, umbra]));
    calls.length = 0;
    view.rerender(draw([bears], { departures: new Map([["card:45", "viewer:graveyard"]]) }));
    expect(view.container.querySelectorAll('[data-fight="umbrashield"]').length).toBe(0);
    const ghost = view.container.querySelector<HTMLElement>('.bf-ghost[data-ghost-of="card:45"]')!;
    expect(ghost.dataset.fate).toBe("defeated");
    expect(Number(runOf(ghost)!.options.delay)).toBe(0);
  });

  it("reduce motion: no tab, shield or pieces", () => {
    still = true;
    const view = render(draw([bears, umbra]));
    view.rerender(draw([bears], { survive: survive() }));
    expect(view.container.querySelectorAll('[data-fight^="umbra"]').length).toBe(0);
  });
});

// --- F-0089-B: the opening, on the table ---------------------------------------------------------

describe("F-0089-B · the opening on the table: counts, the other player's backs, the riffle", () => {
  const move = (from: string, to: string, seat: number, extra: Record<string, unknown> = {}) => ({
    from: { zone: from, seat },
    to: { zone: to, seat },
    ...extra,
  });
  const hand7 = Array.from({ length: 7 }, (_, i) => ({
    id: `card:${10 + i}`,
    seat: 1,
    owner: 1,
    name: "Island",
    kind: "land",
    types: "Basic Land — Island",
    tapped: false,
    faceDown: false,
    known: true,
  }));

  it("reads the update's deal, mulligan and put-back, in each viewer's words; nothing after the first turn", () => {
    const sweep = [
      ...Array.from({ length: 7 }, () => move("hand", "library", 1, { where: "shuffled" })),
      ...hand7.map((c) => move("library", "hand", 1, { card: c.id })),
    ];
    const own = openingOf(snap(1, { hand: hand7, moves: sweep }, 2), snap(1, {}, 1))!;
    expect(own.sides.get("viewer")).toEqual({
      out: 7,
      where: "shuffled",
      dealt: 7,
      ids: hand7.map((c) => c.id),
    });
    const theirs = openingOf(
      snap(2, { moves: sweep.map((m) => ({ ...m, card: undefined })) }, 2),
      snap(2, {}, 1),
    )!;
    expect(theirs.sides.get("opponent")).toEqual({ out: 7, where: "shuffled", dealt: 7, ids: [] });
    const back = openingOf(
      snap(2, { moves: [move("hand", "library", 1, { where: "bottom" })] }, 3),
      snap(2, {}, 2),
    )!;
    expect(back.sides.get("opponent")).toMatchObject({ out: 1, where: "bottom", dealt: 0 });
    expect(openingOf(snap(2, { turn: 1, moves: sweep }, 4), snap(2, {}, 3))).toBeNull();
    expect(openingOf(snap(2, { moves: sweep }, 4), null)).toBeNull();
  });

  const mull = (): Opening => ({
    key: "1:5",
    sides: new Map([["opponent", { out: 7, where: "shuffled", dealt: 7, ids: [] }]]),
  });

  it("Bob sees Alice's 7 backs sweep into her library, a riffle once they are in, and 7 dealt again", () => {
    const view = render(draw([], { opponentHand: backs(7) }));
    calls.length = 0;
    view.rerender(draw([], { opponentHand: backs(7), opening: mull() }));
    const swept = [
      ...view.container.querySelectorAll<HTMLElement>("[data-ghost-of^='hidden-hand:']"),
    ];
    expect(swept.length).toBe(7);
    expect(swept.map((g) => Number(runOf(g)!.options.delay))).toEqual(
      Array.from({ length: 7 }, (_, j) => sweepAt(j)),
    );
    // Each a back: no card in it.
    expect(swept.every((g) => !g.querySelector("img.bf-art, img.bf-crop"))).toBe(true);
    // The fan's own backs fly in from her library, unseen until each goes.
    const fan = Array.from({ length: 7 }, (_, i) => slotOf(view.container, `hidden-hand:2:${i}`));
    const runs = fan.map((el) => runOf(el)!);
    expect(runs.map((r) => Number(r.options.delay))).toEqual(
      Array.from({ length: 7 }, (_, i) => dealAt(i, true)),
    );
    expect(
      runs.every((r) => r.frames[0]!.opacity === 0 && Number(r.options.duration) === DEAL_MS),
    ).toBe(true);
    // Her library: +7 as the seven are in, −7 as they are dealt.
    const said = [...view.container.querySelectorAll<HTMLElement>('[data-fight="number"]')];
    expect(said.map((n) => n.textContent)).toEqual(["+7", "−7"]);
    expect(Number(runOf(said[0]!)!.options.delay)).toBe(sweptAt(6));
    expect(REDEAL_AT).toBeGreaterThan(sweptAt(6) + 0);
  });

  it("a put-back: one back leaves the middle of her fan for her library, +1; nothing dealt", () => {
    const view = render(draw([], { opponentHand: backs(7) }));
    calls.length = 0;
    view.rerender(
      draw([], {
        opponentHand: backs(6),
        opening: {
          key: "1:6",
          sides: new Map([["opponent", { out: 1, where: "bottom", dealt: 0, ids: [] }]]),
        },
      }),
    );
    const out = [
      ...view.container.querySelectorAll<HTMLElement>("[data-ghost-of^='hidden-hand:2:3']"),
    ];
    expect(out.length).toBe(1);
    const said = [...view.container.querySelectorAll<HTMLElement>('[data-fight="number"]')];
    expect(said.map((n) => n.textContent)).toEqual(["+1"]);
  });

  it("the loading screen still up: everything waits for it", () => {
    const view = render(draw([], { opponentHand: backs(7) }));
    calls.length = 0;
    view.rerender(draw([], { opponentHand: backs(7), opening: mull(), openingDelay: 1200 }));
    const swept = [
      ...view.container.querySelectorAll<HTMLElement>("[data-ghost-of^='hidden-hand:']"),
    ];
    expect(Number(runOf(swept[0]!)!.options.delay)).toBe(1200 + sweepAt(0));
  });

  it("your hand in the opening-hand window: the table's hand is not drawn (veiled)", () => {
    const view = render(draw([], { veilHand: true }));
    expect(view.container.querySelector(".bf-board")!.classList.contains("bf-veil-hand")).toBe(
      true,
    );
    view.rerender(draw([]));
    expect(view.container.querySelector(".bf-board")!.classList.contains("bf-veil-hand")).toBe(
      false,
    );
  });

  it("the window's deal and sweep, frame by frame: from the tile, turning face up as it lands", () => {
    const f = dealFrames(300, 200, 0.3);
    expect(f.card[0]!.transform).toBe("translate(300.0px, 200.0px) scale(0.300, 0.300)");
    expect(f.card.at(-1)!.transform).toBe("translate(0.0px, 0.0px) scale(1.000, 1.000)");
    expect(f.back[0]!.opacity).toBe(1);
    expect(f.back.at(-1)!.opacity).toBe(0);
    const away = dealFrames(300, 200, 0.3, true, false);
    expect(away.card[0]!.transform).toBe("translate(0.0px, 0.0px) scale(1.000, 1.000)");
    expect(away.back.every((x) => x.opacity === 1)).toBe(true);
    const down = turnDownFrames();
    expect(down.back[0]!.opacity).toBe(0);
    expect(down.back.at(-1)!.opacity).toBe(1);
    expect(dealAt(3, false)).toBe(3 * DEAL_BEAT_MS);
    expect(dealAt(0, true)).toBe(REDEAL_AT);
    expect(RIFFLE_AT).toBeGreaterThan(sweptAt(6));
  });
});

// --- F-0089-F: stack names that fit ---------------------------------------------------------------

describe("F-0089-F · a stack card's name shrinks to fit its bar (FitName's rule)", () => {
  it("the stack card's name fits; a table card's name does not take the rule", () => {
    const sizes = new Map<string, number>();
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      // A long name is 30% too wide at its own size.
      const px = parseFloat(this.style.fontSize || "10");
      sizes.set(this.textContent ?? "", px);
      return this.dataset.fit ? 130 * (px / 10) : 50;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset?.fit ? 100 : size.width;
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ fontSize: "10px" }) as CSSStyleDeclaration,
    );
    const view = render(
      draw([card("card:1", 1, "Mountain")], {
        stack: [
          {
            id: "stack:3",
            name: "Kozilek's Return",
            kind: "spell",
            source: "card:30",
            targets: [],
            seat: 1,
            card: "card:30",
          },
        ],
      }),
    );
    const name = view.container.querySelector<HTMLElement>(
      '.bf-stack-card .bf-name[data-fit="true"]',
    )!;
    expect(name.textContent).toBe("Kozilek's Return");
    // 5% steps from 100% until it fits (clientWidth 100 of a 130 name): 0.75.
    expect(name.style.fontSize).toBe("7.5px");
    // A table card's name keeps its size (no fitting there).
    const table = view.container.querySelector<HTMLElement>('[data-object-id="card:1"] .bf-name')!;
    expect(table.dataset.fit).toBeUndefined();
  });
});
