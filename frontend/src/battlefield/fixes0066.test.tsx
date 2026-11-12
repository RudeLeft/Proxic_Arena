// @vitest-environment jsdom

// Spec 0066 -- arrows arrive with their card (F-0066-A); start at the stud,
// under the stack's words (F-0066-B, also Board.test.tsx); "Still to pay"
// keeps its size until it goes (F-0066-E); no "Died" on the table (F-0066-F,
// the worker's ThrownAwayTest and Lab check-moves). The arcs' geometry is
// effects.test.ts (F-0066-C); the swords Board.test.tsx (F-0066-D).

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, RISE_MS, STACK_IN_MS, type StackView } from "./Board";
import { castOnItsWay, spellOf } from "./GameScreen";
import { combatScript } from "./fixture";
import { inCombat, layout } from "./layout";
import { SOURCE_AT, STACK_READ_SCALE, STACK_SCALE, stackSpotBoxes, TIP_GAP } from "./effects";
import { boardFromSnapshot } from "./fromSnapshot";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import type { PayPip } from "./manaBalls";

const size = { width: 1920, height: 1080 };
const calls: {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
}[] = [];
let reduced = false;
beforeEach(() => {
  calls.length = 0;
  reduced = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    calls.push({ element: this, frames, options, finish });
    return {
      finished,
      onfinish: null,
      cancel() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0 }) },
    };
  };
});
afterEach(() => {
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const art = (a: string) => a;
const s8 = combatScript(8);
function board(stack: StackView[], extra: Partial<Parameters<typeof Board>[0]> = {}) {
  return (
    <Board
      battlefield={s8.board.battlefield}
      hand={s8.board.hand}
      viewerSeat={s8.board.viewerSeat}
      artUrl={art}
      combat={s8.combat}
      stack={stack}
      {...extra}
    />
  );
}
const lines = (c: Element, kind: string) =>
  [...c.querySelectorAll(`[data-line="${kind}"]`)].map(
    (g) => `${g.getAttribute("data-from")}>${g.getAttribute("data-to")}`,
  );
const shock = s8.stack[0]!; // Shock at White Knight (card:202), on top
const bolt = s8.stack[1]!;

describe("arrows wait for their card (F-0066-A)", () => {
  it("your cast: no arrow while the card flies, then it draws from the card", () => {
    vi.useFakeTimers();
    const view = render(board([bolt]));
    view.rerender(board([shock, bolt], { hiddenStack: shock.id, quietStack: new Set([shock.id]) }));
    expect(lines(view.container, "target")).toEqual([]);
    expect(view.container.querySelectorAll("[data-stud]")).toHaveLength(0);
    // Landed: the card shows (it does not slide in again), fading in from
    // the flight (160 ms); then its arrow draws.
    view.rerender(board([shock, bolt], { hiddenStack: null, quietStack: new Set([shock.id]) }));
    expect(lines(view.container, "target")).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(lines(view.container, "target")).toEqual([`${shock.id}>card:202`]);
    expect(view.container.querySelectorAll("[data-stud]")).toHaveLength(1);
  });

  it("the other player's cast is hidden on the stack while it turns over, is held and flies too", () => {
    const reveal = { card: { id: "card:77" }, hidden: false };
    // Its reveal flight (spec 0066: no longer left out).
    expect(castOnItsWay(reveal, null, null, null)).toBe("card:77");
    // The first frame after the cast, before the flight exists: hidden then too.
    expect(castOnItsWay(null, null, "card:77", null)).toBe("card:77");
    // A cancelled hidden cast flies back face down: no stack card waits for it.
    expect(castOnItsWay({ card: { id: "card:77" }, hidden: true }, null, null, null)).toBe(null);
    expect(castOnItsWay(null, null, null, null)).toBe(null);
    // The spell is the stack object from that card -- not the trigger of the
    // permanent it became (same source): that one rises from the table.
    expect(spellOf({ source: "card:77", kind: "spell" }, "card:77")).toBe(true);
    expect(spellOf({ source: "card:77" }, "card:77")).toBe(true);
    expect(spellOf({ source: "card:77", kind: "trigger" }, "card:77")).toBe(false);
    // Its card lingering face down while its mana balls fly: hidden too.
    expect(castOnItsWay(null, "card:77", null, "card:77")).toBe("card:77");
    // Still being cast (the same card): nothing yet on its way.
    expect(castOnItsWay(null, null, "card:77", "card:77")).toBe(null);
  });

  it("a trigger rises out of its card to the stack; its arrow waits until it has arrived", async () => {
    vi.useFakeTimers();
    const trigger: StackView = {
      id: "stack:9",
      name: "Serra Angel",
      by: "Bree",
      seat: 2,
      kind: "trigger",
      source: "card:201",
      targets: [{ object: "card:215" }],
    };
    const view = render(board([bolt]));
    calls.length = 0;
    view.rerender(board([trigger, bolt]));
    const c = view.container;
    // No arrow (nor thread back to the Angel) from a card still on its way.
    expect(lines(c, "target")).toEqual([]);
    expect(lines(c, "source")).toEqual([]);
    const slot = c.querySelector('[data-object-id="stack:9"]')!.closest<HTMLElement>(".bf-slot")!;
    expect(slot.dataset.rising).toBe("true");
    expect(slot.style.animation).toBe("none"); // not the pop-in
    const rise = calls.find((call) => call.element === slot)!;
    expect(rise.options.duration).toBe(RISE_MS);
    expect(rise.frames[0]!.opacity).toBe(0);
    // It starts on the Angel, the size of a card on the table.
    const out = layout(
      s8.combat
        ? { ...s8.board, battlefield: inCombat(s8.board.battlefield, s8.combat) }
        : s8.board,
      size,
    );
    const angel = out.boxes.get("card:201")!;
    expect(String(rise.frames[0]!.transform)).toContain(
      `translate3d(${angel.x}px, ${angel.y}px, 0)`,
    );
    // Waiting while it rises (however long that takes: a click hurries it,
    // slow motion stretches it) -- until its rise has finished.
    act(() => {
      vi.advanceTimersByTime(RISE_MS * 4);
    });
    expect(lines(c, "target")).toEqual([]);
    await act(async () => {
      rise.finish();
      await Promise.resolve();
    });
    expect(lines(c, "target")).toEqual(["stack:9>card:215"]);
    expect(lines(c, "source")).toEqual(["card:201>stack:9"]);
  });

  it("a stack card with no card to rise from slides in; its arrow waits for that", () => {
    vi.useFakeTimers();
    const view = render(board([bolt]));
    view.rerender(board([shock, bolt]));
    expect(lines(view.container, "target")).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(STACK_IN_MS + 20);
    });
    expect(lines(view.container, "target")).toEqual([`${shock.id}>card:202`]);
  });

  it("with reduced motion nothing rises, and the arrow is not held back", () => {
    vi.useFakeTimers();
    reduced = true;
    const view = render(board([bolt]));
    view.rerender(board([shock, bolt]));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(lines(view.container, "target")).toEqual([`${shock.id}>card:202`]);
    expect(view.container.querySelectorAll("[data-rising]")).toHaveLength(0);
  });
});

describe("the thread back to an ability's source (spec 0066)", () => {
  it("a faint dotted thread into the stack card's side under its badges, never at the stud", () => {
    const s9 = combatScript(9);
    const c = render(
      <Board
        battlefield={s9.board.battlefield}
        hand={s9.board.hand}
        viewerSeat={s9.board.viewerSeat}
        artUrl={art}
        combat={s9.combat}
        stack={s9.stack}
      />,
    ).container;
    const thread = c.querySelector<SVGGElement>('[data-line="source"]')!;
    expect(thread.querySelector(".bf-line-thread")).not.toBeNull();
    expect(thread.querySelector("polygon")).toBeNull(); // no arrowhead
    const g = layout(s9.board, size).geometry;
    const [front] = stackSpotBoxes(g, s9.stack.length, STACK_READ_SCALE);
    const [x, y] = thread.getAttribute("data-end")!.split(",").map(Number) as [number, number];
    expect(x).toBeCloseTo(front!.x - TIP_GAP * g.cardH, 0);
    expect(y).toBeCloseTo(front!.y + front!.h * SOURCE_AT, 0);
  });
});

describe('"Still to pay" keeps its size until it goes (F-0066-E)', () => {
  const pips: PayPip[] = [
    { symbol: "1", paid: false },
    { symbol: "G", paid: true, colour: "G", ball: "7:0" },
  ];
  const scaleOf = (c: Element, id: string) =>
    c.querySelector(`[data-object-id="${id}"]`)!.closest<HTMLElement>(".bf-slot")!.style.transform;

  it("the stack stays at its asking size while the pill is held after the question", () => {
    const ability: StackView = { ...shock, id: "stack:5", kind: "ability", targets: [] };
    // Asked (paying): the asking size.
    const view = render(board([ability], { asking: true, stackPay: pips, stackPayLive: true }));
    expect(scaleOf(view.container, "stack:5")).toContain(`scale(${STACK_SCALE})`);
    // The question is over, the pill held for its last ball: still that size.
    view.rerender(board([ability], { asking: false, stackPay: pips, stackPayLive: false }));
    expect(scaleOf(view.container, "stack:5")).toContain(`scale(${STACK_SCALE})`);
    expect(view.container.querySelectorAll(".bf-stack-owe")).toHaveLength(1);
    // The pill gone: the stack is readable again.
    view.rerender(board([ability], { asking: false, stackPay: null }));
    expect(scaleOf(view.container, "stack:5")).toContain(`scale(${STACK_READ_SCALE})`);
    expect(view.container.querySelectorAll(".bf-stack-owe")).toHaveLength(0);
  });

  it("never alone in an empty stack slot once the question is over", () => {
    const view = render(board([], { stackPay: pips, stackPayLive: true }));
    expect(view.container.querySelectorAll(".bf-stack-paying .bf-stack-owe")).toHaveLength(1);
    view.rerender(board([], { stackPay: pips, stackPayLive: false }));
    expect(view.container.querySelectorAll(".bf-stack-owe")).toHaveLength(0);
  });
});

describe("crossed swords fade when combat ends (P10-R1)", () => {
  it("each mark goes over 160 ms, outside the marks' count", () => {
    vi.useFakeTimers();
    const s2 = combatScript(2);
    const props = {
      battlefield: s2.board.battlefield,
      hand: s2.board.hand,
      viewerSeat: s2.board.viewerSeat,
      artUrl: art,
    };
    const view = render(<Board {...props} combat={s2.combat} />);
    expect(view.container.querySelectorAll("[data-swords]")).toHaveLength(3);
    view.rerender(<Board {...props} combat={null} />);
    expect(view.container.querySelectorAll("[data-swords]")).toHaveLength(0);
    expect(view.container.querySelectorAll(".bf-line-out[data-swords-leaving]")).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(170);
    });
    expect(view.container.querySelectorAll("[data-swords-leaving]")).toHaveLength(0);
    // Pointing at nothing does not leave a mark behind either.
    fireEvent.pointerLeave(view.container);
  });
});

describe("no Died, Destroyed or Sacrificed on the table (F-0066-F)", () => {
  function snapshot(revision: number, state: Record<string, unknown>): Snapshot {
    return reduceMatch(EMPTY_MATCH, {
      type: "MATCH_SNAPSHOT",
      state: {
        stateRevision: revision,
        gameEpoch: 1,
        turn: 4,
        phase: "MAIN1",
        activeSeat: 1,
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
  }
  const bears = {
    id: "card:50",
    seat: 2,
    name: "Grizzly Bears",
    tapped: false,
    faceDown: false,
    known: true,
  };

  it("a creature that died carries no tag (the game sends its why only); nor, spec 0075, a cycled card", () => {
    const before = snapshot(1, { battlefield: [bears] });
    const after = snapshot(2, {
      graveyard: [bears],
      moves: [
        {
          card: "card:50",
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "graveyard", seat: 2 },
          why: "destroyed",
        },
        {
          card: "card:60",
          from: { zone: "hand", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "cycled",
          said: "Cycled",
        },
      ],
    });
    const data = boardFromSnapshot(after, before);
    expect(data.departures.get("card:50")).toBe("opponent:graveyard"); // the shatter plays
    // Spec 0075: nor a cycled card -- the report window explains it.
    expect([...data.graves]).toEqual([]);
  });
});
