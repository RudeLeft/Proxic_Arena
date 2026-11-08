// @vitest-environment jsdom

// Spec 0062 -- a spark of mana for every payment (F-0062-A, B, C): each
// mana's ball in its colour to the symbol it paid, the last included; the
// other player's view (to the back, no symbols); a click hurries the balls;
// reduced motion lights the symbols with no ball.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SnapshotCard, SnapshotPayment } from "../match";
import { CastingCard, costPips } from "./CastingCard";
import type { Box, Geometry } from "./layout";
import {
  BALL_MS,
  MANA_BALL,
  ManaBalls,
  assignBalls,
  latestPayment,
  newLedger,
  owingWords,
  paymentFor,
  pending,
  type BallLedger,
} from "./manaBalls";
import { Board } from "./Board";

const geometry = {
  play: { x: 0, y: 0, w: 1600, h: 1000 },
  inset: 12,
  width: 1685,
  height: 1080,
  cardW: 100,
  cardH: 140,
} as unknown as Geometry;

const nekrataal: SnapshotCard = {
  id: "card:40",
  art: null,
  seat: 1,
  name: "Nekrataal",
  tapped: false,
  faceDown: false,
  known: true,
  kind: "creature",
  types: "Creature — Human Assassin",
  manaCost: "{2}{B}{B}",
} as unknown as SnapshotCard;

/** Nekrataal paid Forest, Swamp, Swamp, Swamp, as the game reports it (Lab nekrataal). */
function nek(steps: number, hidden = false): SnapshotPayment[] {
  const all: [string, string, string][] = [
    ["G", "1", "card:5"],
    ["B", "B", "card:6"],
    ["B", "B", "card:7"],
    ["B", "1", "card:8"],
  ];
  const owing = ["{1}{B}{B}", "{1}{B}", "{1}", ""];
  return all.slice(0, steps).map(([colour, shard, from], i) => ({
    n: 10 + i,
    seat: 1,
    payment: 3,
    for: "card:40",
    kind: "cast",
    cost: hidden ? null : "{2}{B}{B}",
    owing: hidden ? null : owing[i]!,
    mana: [{ colour, shard: hidden ? null : shard, from }],
  }));
}

describe("each mana to the symbol it paid, in its colour (F-0062-A)", () => {
  it("Nekrataal: green to a generic, black to each {B}, the last black to the other generic", () => {
    const group = paymentFor(nek(4), "card:40")!;
    const pips = assignBalls(costPips(["2", "B", "B"], null), group.mana);
    expect(pips.map((p) => [p.symbol, p.paid, p.colour, p.ball])).toEqual([
      ["1", true, "G", "10:0"],
      ["1", true, "B", "13:0"],
      ["B", true, "B", "11:0"],
      ["B", true, "B", "12:0"],
    ]);
    expect(owingWords(pips)).toBe("");
  });

  it("the last pip is lit from the game's word alone -- the question after it never comes", () => {
    // Spec 0058 lit it only from the next question's "still owing" (one {1}
    // owed after the third Swamp), so the fourth stayed unlit.
    const c = render(
      <CastingCard
        card={nekrataal}
        geometry={geometry}
        from={null}
        owing={["1"]}
        cost={["2", "B", "B"]}
        paid={paymentFor(nek(4), "card:40")!.mana}
        artUrl={(a) => a}
      />,
    ).container;
    const pips = [...c.querySelectorAll<HTMLElement>(".gs-cast-pip")];
    expect(pips.map((p) => p.classList.contains("gs-cast-pip-paid"))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(pips.map((p) => p.dataset.paidBy)).toEqual(["G", "B", "B", "B"]);
    expect(pips[1]!.dataset.ball).toBe("13:0");
    // Lit in the colour of the mana: green's body, and black's pale ring.
    expect(pips[0]!.style.boxShadow).toContain(MANA_BALL.G!.body);
    expect(pips[2]!.style.boxShadow).toContain(MANA_BALL.B!.glow);
  });

  it("Sol Ring's two grey mana: one step, two balls, two generic pips", () => {
    const payments: SnapshotPayment[] = [
      {
        n: 4,
        seat: 1,
        payment: 2,
        for: "card:9",
        kind: "cast",
        cost: "{2}",
        owing: "",
        mana: [
          { colour: "C", shard: "1", from: "card:2" },
          { colour: "C", shard: "1", from: "card:2" },
        ],
      },
    ];
    const pips = assignBalls(costPips(["2"], null), paymentFor(payments, "card:9")!.mana);
    expect(pips.map((p) => [p.colour, p.ball])).toEqual([
      ["C", "4:0"],
      ["C", "4:1"],
    ]);
  });

  it("an older cast of the same card is not this one", () => {
    expect(paymentFor(nek(2), "card:40", 11)).toBeNull();
    expect(paymentFor(nek(3), "card:40", 11)!.mana).toHaveLength(1);
  });
});

describe("abilities, mana already made, Phyrexian life (F-0062-B)", () => {
  it("Still to pay keeps every symbol and lights each", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1080);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const payments: SnapshotPayment[] = [
      {
        n: 7,
        seat: 2,
        payment: 5,
        for: "card:3",
        kind: "ability",
        cost: "{1}{G}",
        owing: "{1}",
        mana: [{ colour: "G", shard: "G", from: "card:11" }],
      },
    ];
    const ability = latestPayment(payments)!;
    const pips = assignBalls(costPips(["1", "G"], ["1"]), ability.mana);
    expect(pips.map((p) => [p.symbol, p.paid, p.colour ?? null])).toEqual([
      ["1", false, null],
      ["G", true, "G"],
    ]);
    const c = render(
      <Board battlefield={[]} hand={[]} viewerSeat={1} artUrl={(a) => a} stackPay={pips} />,
    ).container;
    const pill = c.querySelector(".bf-stack-owe")!;
    expect(pill.getAttribute("aria-label")).toBe("Still to pay: 1");
    expect(pill.querySelectorAll(".bf-owe-pip")).toHaveLength(2);
    expect(pill.querySelector('[data-ball="7:0"]')!.classList.contains("bf-owe-pip-paid")).toBe(
      true,
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("2 life for {B/P} and mana already made pay their symbols", () => {
    const mana = [
      { n: 1, k: 0, colour: "B", shard: "B/P", from: "life", seat: 1 },
      { n: 2, k: 0, colour: "C", shard: "1", from: "pool", seat: 1 },
    ];
    const pips = assignBalls(costPips(["1", "B/P", "B/P"], null), mana);
    expect(pips.map((p) => [p.symbol, p.paid, p.colour ?? null])).toEqual([
      ["1", true, "C"],
      ["B/P", true, "B"],
      ["B/P", false, null],
    ]);
  });
});

// --- the balls themselves ------------------------------------------------------------------

interface Fake {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
  rate: number;
}

describe("the balls fly, are hurried, and are not drawn with reduced motion (F-0062-A, C)", () => {
  const made: Fake[] = [];
  let reduce = false;
  beforeEach(() => {
    made.length = 0;
    reduce = false;
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      let done: () => void = () => {};
      const finished = new Promise<void>((resolve) => (done = resolve));
      const fake: Fake = { element: this, frames, options, finish: () => done(), rate: 1 };
      made.push(fake);
      const total = Number(options?.duration ?? 0) + Number(options?.delay ?? 0);
      return {
        finished,
        cancel() {},
        playState: "running",
        currentTime: 0,
        playbackRate: 1,
        effect: { getComputedTiming: () => ({ endTime: total, iterations: 1 }) },
        updatePlaybackRate(r: number) {
          fake.rate = r;
        },
      };
    };
    (HTMLElement.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
      this: Element,
    ) {
      return made
        .filter((m) => this.contains(m.element))
        .map((m) => ({
          playState: "running",
          currentTime: 0,
          playbackRate: m.rate,
          effect: {
            getComputedTiming: () => ({
              endTime: Number(m.options?.duration ?? 0) + Number(m.options?.delay ?? 0),
              iterations: 1,
            }),
          },
          updatePlaybackRate(r: number) {
            m.rate = r;
          },
        }));
    };
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    delete (HTMLElement.prototype as unknown as { getAnimations?: unknown }).getAnimations;
    vi.unstubAllGlobals();
    document.querySelectorAll(".gs-balls").forEach((el) => el.remove());
  });

  const at = (id: string): Box | null =>
    id.startsWith("card:")
      ? { x: 100 + Number(id.slice(5)) * 10, y: 800, w: 100, h: 140, scale: 1, rotation: 0, z: 0 }
      : null;

  function scene(payments: SnapshotPayment[], ledger: BallLedger, hidden = false) {
    return (
      <>
        <CastingCard
          card={nekrataal}
          geometry={geometry}
          from={null}
          owing={null}
          cost={["2", "B", "B"]}
          paid={hidden ? null : (paymentFor(payments, "card:40")?.mana ?? null)}
          artUrl={(a) => a}
          hiddenBy={hidden ? "Alice" : null}
        />
        <ManaBalls
          payments={payments}
          at={at}
          geometry={geometry}
          ledger={ledger}
          onLanded={() => {}}
        />
      </>
    );
  }
  const balls = () =>
    made.filter((m) => m.element.classList.contains("gs-ball") && m.frames.length > 20);

  it("steps already there when the board opens never fly; a new one does, in its colour", async () => {
    const ledger = newLedger();
    const view = render(scene(nek(3), ledger));
    expect(balls()).toHaveLength(0);
    expect(ledger.first).toBe(12);
    view.rerender(scene(nek(4), ledger));
    // The last mana: one ball, a black one, to the fourth pip (the second generic).
    expect(balls()).toHaveLength(1);
    const ball = balls()[0]!;
    expect((ball.element as HTMLElement).style.background).toContain(MANA_BALL.B!.body);
    expect(ball.options.duration).toBe(BALL_MS);
    const pip = document.querySelector('[data-ball="13:0"]')!;
    expect(pip.classList.contains("gs-cast-pip-generic")).toBe(true);
    // Until it lands the pip is held unlit; then it pops.
    expect(made.some((m) => m.element === pip && m.frames[0]?.opacity === 0.5)).toBe(true);
    expect(pending(ledger, 13)).toBe(true);
    await act(async () => {
      ball.finish();
      await Promise.resolve();
      await Promise.resolve();
    });
    const pop = made.find((m) => m.element === pip && m.frames.length === 3);
    expect(pop?.frames[1]?.transform).toBe("scale(1.38)");
    // Landed (the cast card may go) only once the symbol has popped.
    expect(pending(ledger, 13)).toBe(true);
    await act(async () => {
      pop!.finish();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pending(ledger, 13)).toBe(false);
  });

  it("the other player's view: the ball flies to the face-down card's back", () => {
    const ledger = newLedger();
    const view = render(scene([], ledger, true));
    view.rerender(scene(nek(1, true), ledger, true));
    const c = document.querySelector(".gs-cast")!;
    expect(c.querySelectorAll(".gs-cast-pip")).toHaveLength(0);
    expect(c.getAttribute("data-ball-for")).toBe("card:40");
    expect(balls()).toHaveLength(1);
    expect((balls()[0]!.element as HTMLElement).style.background).toContain(MANA_BALL.G!.body);
  });

  it("a click hurries the balls to their end", () => {
    const ledger = newLedger();
    const view = render(scene([], ledger));
    view.rerender(scene(nek(1), ledger));
    expect(balls()[0]!.rate).toBe(1);
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(balls()[0]!.rate).toBeGreaterThan(5);
  });

  it("with reduced motion: no ball, the symbol just lights", () => {
    reduce = true;
    const ledger = newLedger();
    const view = render(scene([], ledger));
    view.rerender(scene(nek(1), ledger));
    expect(balls()).toHaveLength(0);
    expect(pending(ledger, 10)).toBe(false);
    const pip = document.querySelector('[data-ball="10:0"]')!;
    expect(pip.classList.contains("gs-cast-pip-paid")).toBe(true);
  });
});
