// @vitest-environment jsdom

// Spec 0083 -- polish (F-0083-A..G; owner on the canvas gaps-polish-1113:
// 13 B one hit look, 14 C wash and medallion, 15 A the door swings open,
// 16 A the "-N" pill, 17 drop / report window, 18 B the squares and the
// stack lock, leftovers fixed). The real Board, handed one board and then
// the next, as the game screen hands them; fromSnapshot and the page's own
// parser, from the snapshots the worker sends.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, WASH_MS, type BoardCard, type StackView } from "./Board";
import { DayMedallion, MEDALLION_MS } from "./DayMedallion";
import { PoisonBadge, UNPOISON_GONE_AT, UNPOISON_PILL_MS } from "./PoisonBadge";
import { SHAKE_MS } from "./sizeTicks";
import { MERGE_MS, MERGE_PULL_MS, mergeFrames } from "./motion";
import { boardFromSnapshot, lockedHalves, roomDoors } from "./fromSnapshot";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";

const size = { width: 1920, height: 1080 };
type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
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
    options: KeyframeAnimationOptions | number,
  ) {
    const opts = typeof options === "number" ? { duration: options } : options;
    const call = { element: this, frames, options: opts } as Call;
    const animation = {
      onfinish: null as null | (() => void),
      oncancel: null,
      cancel() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      id: opts.id ?? "",
      effect: {
        getComputedTiming: () => ({
          endTime: Number(opts.duration ?? 0) + Number(opts.delay ?? 0),
          iterations: opts.iterations ?? 1,
        }),
      },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
    call.animation = animation;
    calls.push(call);
    return animation;
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function () {
    return [];
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
  return {
    id,
    seat,
    name,
    kind: "creature",
    types: `Creature — ${name}`,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: 4,
    toughness: 4,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}

type Extra = Partial<Parameters<typeof Board>[0]>;
function draw(battlefield: BoardCard[], extra: Extra = {}) {
  return (
    <Board
      battlefield={battlefield}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      arrivals={new Map()}
      departures={new Map()}
      returns={new Map()}
      graves={new Map()}
      tileMoves={[]}
      countered={new Set()}
      fizzled={new Set()}
      stack={[]}
      combat={null}
      damage={null}
      {...extra}
    />
  );
}

const marks = (c: HTMLElement, kind: string) => [
  ...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
];
const faceOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;

/** A snapshot as the worker sends it, through the page's own parser. */
function snap(seat: number, revision: number, body: Record<string, unknown>): Snapshot {
  const state = reduceMatch(EMPTY_MATCH, {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      seat,
      turn: 3,
      phase: "MAIN1",
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 40 },
        { seat: 2, name: "Bob", life: 20, handCount: 0, libraryCount: 40 },
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

const spell = (
  id: string,
  seat: number,
  name: string,
  extra: Partial<StackView> = {},
): StackView => ({
  id,
  name,
  kind: "spell",
  source: null,
  targets: [],
  seat,
  ...extra,
});

// --- F-0083-A · one hit look -------------------------------------------------------------

describe("F-0083-A · Lightning Bolt: a crack, never the old starburst; combat still slashes", () => {
  it("a spell's hit on a creature: the crack across the card, its red flash, its shake", () => {
    const angel = card("card:30", 2, "Serra Angel");
    const view = render(draw([angel]));
    calls.length = 0;
    view.rerender(
      draw([{ ...angel }], {
        damage: {
          key: "w1",
          hits: [{ source: "card:9", target: { object: "card:30" }, amount: 3 }],
        },
      }),
    );
    const c = view.container;
    expect(c.querySelector(".bf-burst")).toBeNull();
    const crack = marks(c, "crack").find((m) => m.dataset["of"] === "card:30")!;
    expect(crack).toBeTruthy();
    expect(crack.dataset["impact"]).toBe("card:30");
    expect(crack.querySelector("svg")!.getAttribute("preserveAspectRatio")).toBe("none");
    expect(marks(c, "hitflash").some((m) => m.dataset["of"] === "card:30")).toBe(true);
    // The number still rises.
    expect(c.querySelector('[data-damage-number="card:30"]')!.textContent).toBe("−3");
    // The card shakes (0077's small shake), added to whatever else it does.
    const shake = calls.find(
      (x) => x.element === faceOf(c, "card:30") && Number(x.options.duration) === SHAKE_MS,
    )!;
    expect(shake).toBeTruthy();
    expect(shake.options.composite).toBe("add");
  });

  it("the crack, the rising red −N and the card's number change land together, as the spark arrives", () => {
    const angel = card("card:30", 2, "Serra Angel");
    const bolt = spell("stack:6", 1, "Lightning Bolt", { targets: [{ object: "card:30" }] });
    const view = render(draw([angel], { stack: [bolt] }));
    calls.length = 0;
    view.rerender(
      draw([{ ...angel, damage: 3 }], {
        stack: [],
        damage: {
          key: "w5",
          hits: [{ source: "card:9", target: { object: "card:30" }, amount: 3 }],
        },
        sizeChanges: {
          key: "s5",
          changes: [
            {
              card: "card:30",
              from: { power: 4, toughness: 4, loyalty: null },
              to: { power: 4, toughness: 1, loyalty: null },
              look: "hit",
              float: null,
              badges: [],
              fromBadge: false,
            },
          ],
          last: new Map(),
        },
      }),
    );
    const c = view.container;
    const delayOn = (el: Element) =>
      Number(calls.filter((x) => x.element === el).at(-1)!.options.delay);
    // The board before still had the Bolt on the stack: everything waits for its spark.
    const crack = marks(c, "crack").find((m) => m.dataset["of"] === "card:30")!;
    expect(delayOn(crack)).toBe(380);
    const shake = calls.find(
      (x) => x.element === faceOf(c, "card:30") && Number(x.options.duration) === SHAKE_MS,
    )!;
    expect(Number(shake.options.delay)).toBe(380);
    // The red "−3" rises with it, on the board's clock (never a page timer).
    const number = c.querySelector<HTMLElement>('[data-damage-number="card:30"]')!;
    expect(number.dataset["fight"]).toBe("number");
    expect(number.classList.contains("bf-fight-number")).toBe(true);
    expect(number.textContent).toBe("−3");
    expect(delayOn(number)).toBe(380);
    // The card's own number pops to its new value at that same moment.
    const figure = faceOf(c, "card:30").querySelector(".bf-pt, [data-size]")!;
    const pop = calls.find(
      (x) =>
        figure.contains(x.element) && String(x.frames[1]?.transform ?? "").includes("scale(1.3)"),
    )!;
    expect(pop).toBeTruthy();
    expect(Number(pop.options.delay)).toBe(380);
  });

  it("a hit on a player told by the life changes is the shield's own (no second crack)", () => {
    const view = render(draw([]));
    view.rerender(
      draw([], {
        damage: { key: "w2", hits: [{ source: "card:9", target: { player: 2 }, amount: 3 }] },
        life: { key: "l2", changes: [{ player: 2, kind: "damage", amount: 3 }] },
      }),
    );
    const cracks = marks(view.container, "crack").filter((m) => m.dataset["of"] === "player:2");
    expect(cracks).toHaveLength(1);
    expect(cracks[0]!.dataset["impact"]).toBeUndefined();
  });

  it("combat is not cracked: claw slashes, as A-13", () => {
    const giant = card("card:31", 1, "Hill Giant", { attacking: true, power: 3, toughness: 3 });
    const angel = card("card:30", 2, "Serra Angel", { blocking: true });
    const view = render(draw([giant, angel]));
    view.rerender(
      draw([giant, angel], {
        damage: {
          key: "w3",
          combat: "regular",
          hits: [
            { source: "card:31", target: { object: "card:30" }, amount: 3 },
            { source: "card:30", target: { object: "card:31" }, amount: 4 },
          ],
          fights: [{ attacker: "card:31", defender: { player: 2 }, blockers: ["card:30"] }],
        },
      }),
    );
    expect(marks(view.container, "crack")).toHaveLength(0);
    expect(marks(view.container, "slash").length).toBeGreaterThan(0);
  });

  it("reduce motion: the number only", () => {
    still = true;
    const angel = card("card:30", 2, "Serra Angel");
    const view = render(draw([angel]));
    view.rerender(
      draw([angel], {
        damage: {
          key: "w4",
          hits: [{ source: "card:9", target: { object: "card:30" }, amount: 3 }],
        },
      }),
    );
    expect(marks(view.container, "crack")).toHaveLength(0);
    expect(view.container.querySelector('[data-damage-number="card:30"]')).toBeTruthy();
  });
});

// --- F-0083-B · day and night ------------------------------------------------------------------

describe("F-0083-B · day becomes night (and back): the wash and the medallion", () => {
  it("a change washes the table: blue dusk for night, gold dawn for day", () => {
    const view = render(draw([], { dayTime: "day" }));
    expect(view.container.querySelector("[data-wash]")).toBeNull();
    view.rerender(draw([], { dayTime: "night" }));
    expect(view.container.querySelector("[data-wash]")!.getAttribute("data-wash")).toBe("night");
    expect(view.container.querySelector(".bf-wash-dark")).toBeTruthy();
    view.rerender(draw([], { dayTime: "day" }));
    expect(view.container.querySelector("[data-wash]")!.getAttribute("data-wash")).toBe("day");
    expect(view.container.querySelector(".bf-wash-dark")).toBeNull();
    expect(WASH_MS).toBe(1250);
  });

  it("the first day a daybound card makes is not a change: no wash", () => {
    const view = render(draw([], { dayTime: null }));
    view.rerender(draw([], { dayTime: "day" }));
    expect(view.container.querySelector("[data-wash]")).toBeNull();
  });

  it("reduce motion: no wash", () => {
    still = true;
    const view = render(draw([], { dayTime: "day" }));
    view.rerender(draw([], { dayTime: "night" }));
    expect(view.container.querySelector("[data-wash]")).toBeNull();
  });

  it("the medallion turns over, swelling and glowing, and stays on the new face", () => {
    const view = render(<DayMedallion night={false} />);
    const medal = view.container.querySelector<HTMLElement>("[data-day-medallion]")!;
    expect(medal.dataset["dayMedallion"]).toBe("day");
    expect(calls.filter((x) => x.element === medal)).toHaveLength(0);
    view.rerender(<DayMedallion night />);
    expect(medal.dataset["dayMedallion"]).toBe("night");
    const turn = calls.find((x) => x.element === medal)!;
    expect(Number(turn.options.duration)).toBe(MEDALLION_MS);
    // Edge-on at the middle of the turn (0.25 s), swollen with a gold glow.
    const middle = turn.frames.find((f) => Math.abs(Number(f.offset) - 3 / 18) < 1e-9)!;
    expect(String(middle.transform)).toMatch(/scaleX\(0\.\d+\)/);
    expect(String(turn.frames[9]!.filter)).toMatch(/drop-shadow\(0 0 8/);
    // The moon shows from the moment it is edge-on.
    const moon = view.container.querySelector(".gs-medal-moon")!;
    expect(calls.some((x) => x.element === moon)).toBe(true);
  });
});

// --- F-0083-C · Room doors ------------------------------------------------------------------------

describe("F-0083-C · unlocking a Room's second door: only that half opens", () => {
  it("the worker's faces and locked doors become the card's halves (first door on top)", () => {
    const room = {
      id: "card:28",
      seat: 1,
      owner: 1,
      name: "Bottomless Pool",
      kind: "other",
      types: "Enchantment - Room",
      tapped: false,
      faceDown: false,
      known: true,
      face: "LeftSplit",
      faces: ["Bottomless Pool // Locker Room", "Bottomless Pool", "Locker Room"],
      locked: ["Locker Room"],
    };
    const board = snap(1, 1, { battlefield: [room] });
    const data = boardFromSnapshot(board, null);
    const drawn = data.battlefield.find((c) => c.id === "card:28")!;
    expect(drawn.doors).toEqual(["Bottomless Pool", "Locker Room"]);
    expect(drawn.lockedHalves).toEqual(["bottom"]);
    expect(lockedHalves({ ...room, locked: ["Bottomless Pool"] })).toEqual(["top"]);
    expect(roomDoors({ faces: ["Fire // Ice", "Fire", "Ice"], types: "Instant" })).toBeNull();
  });

  it("the locked half is a closed door with the gold keyhole; unlocking opens only it, no flip", () => {
    const room = card("card:28", 1, "Bottomless Pool", {
      kind: "other",
      types: "Enchantment — Room",
      power: null,
      toughness: null,
      doors: ["Bottomless Pool", "Locker Room"],
      lockedHalves: ["bottom"],
    });
    const view = render(draw([room]));
    const c = view.container;
    const half = (h: string) => c.querySelector<HTMLElement>(`.bf-room-${h}`)!;
    expect(half("top").dataset["doorState"]).toBe("open");
    expect(half("bottom").dataset["doorState"]).toBe("locked");
    expect(half("bottom").querySelector(".bf-room-door")).toBeTruthy();
    expect(half("bottom").querySelector("[data-locked-mark]")).toBeTruthy();
    expect(half("top").querySelector("[data-locked-mark]")).toBeNull();
    view.rerender(draw([{ ...room, name: "Bottomless Pool // Locker Room", lockedHalves: [] }]));
    expect(half("bottom").dataset["doorState"]).toBe("opening");
    expect(half("top").dataset["doorState"]).toBe("open");
    // A-09's whole-card flip is not used: no old face turning away.
    expect(c.querySelector('[data-flip="true"]')).toBeNull();
    // The door's swing ends: the half is open, the door gone.
    act(() => {
      half("bottom")
        .querySelector(".bf-room-door")!
        .dispatchEvent(
          Object.assign(new Event("animationend", { bubbles: true }), {
            animationName: "bf-room-swing",
          }),
        );
    });
    expect(half("bottom").dataset["doorState"]).toBe("open");
    expect(half("bottom").querySelector(".bf-room-door")).toBeNull();
  });

  it("any other card that changes its name still turns over (A-09)", () => {
    const kn = card("card:40", 1, "Kessig Naturalist");
    const view = render(draw([kn]));
    view.rerender(draw([{ ...kn, name: "Lord of the Ulvenwald" }]));
    expect(view.container.querySelector('[data-flip="true"]')).toBeTruthy();
  });

  it("reduce motion: the door is simply gone", () => {
    still = true;
    const room = card("card:28", 1, "Bottomless Pool", {
      kind: "other",
      types: "Enchantment — Room",
      doors: ["Bottomless Pool", "Locker Room"],
      lockedHalves: ["bottom"],
    });
    const view = render(draw([room]));
    view.rerender(draw([{ ...room, name: "Bottomless Pool // Locker Room", lockedHalves: [] }]));
    expect(view.container.querySelector<HTMLElement>(".bf-room-bottom")!.dataset["doorState"]).toBe(
      "open",
    );
  });
});

// --- F-0083-D · poison removed ------------------------------------------------------------------

describe('F-0083-D · Leeches: the dark pill rises "−N", the notches go dark, the badge shrinks away', () => {
  it("4 to 0: the pill, the notches stepping dark, the shrink after", () => {
    const view = render(<PoisonBadge count={4} pulses={2} />);
    calls.length = 0;
    view.rerender(<PoisonBadge count={0} pulses={2} />);
    const badge = view.container.querySelector<HTMLElement>(".gs-poison")!;
    expect(badge).toBeTruthy();
    expect(badge.dataset["unpoison"]).toBe("4");
    const pill = badge.querySelector<HTMLElement>(".gs-unpoison")!;
    expect(pill.textContent).toBe("−4");
    expect(pill.classList.contains("bf-fight-poison")).toBe(true);
    const rise = calls.find((x) => x.element === pill)!;
    expect(Number(rise.options.duration)).toBe(UNPOISON_PILL_MS);
    // Four notches, the highest first, each a point (90 ms) after the last.
    const notches = calls.filter((x) => x.element.hasAttribute("data-notch"));
    expect(notches.map((x) => Number(x.options.duration))).toEqual([90, 180, 270, 360]);
    const shrink = calls.find(
      (x) => x.element === badge && Number(x.options.delay) === UNPOISON_GONE_AT,
    )!;
    expect(String(shrink.frames.at(-1)!.transform)).toBe("scale(0)");
    act(() => {
      shrink.animation.onfinish?.call(
        shrink.animation,
        new Event("finish") as AnimationPlaybackEvent,
      );
    });
    expect(view.container.querySelector(".gs-poison")).toBeNull();
  });

  it("4 to 1: the badge stays, the pill goes when it has risen", () => {
    const view = render(<PoisonBadge count={4} pulses={2} />);
    view.rerender(<PoisonBadge count={1} pulses={2} />);
    const badge = view.container.querySelector<HTMLElement>(".gs-poison")!;
    expect(badge.dataset["unpoison"]).toBe("3");
    expect(
      calls.some((x) => x.element === badge && Number(x.options.delay) === UNPOISON_GONE_AT),
    ).toBe(false);
  });

  it("reduce motion: the count just shows (none: gone)", () => {
    still = true;
    const view = render(<PoisonBadge count={4} pulses={2} />);
    view.rerender(<PoisonBadge count={0} pulses={2} />);
    expect(view.container.querySelector(".gs-poison")).toBeNull();
  });
});

// --- F-0083-E · no grey notice; the sources pulse gold -------------------------------------------

describe("F-0083-E · two Leylines: no words, both pulse gold", () => {
  it("the worker's pulse reaches the board, once per key", () => {
    const board = snap(1, 1, { pulse: { key: "pulse:3", cards: ["card:11", "card:22"] } });
    expect(board.pulse).toEqual({ key: "pulse:3", cards: ["card:11", "card:22"] });
    expect(snap(1, 2, {}).pulse).toBeNull();
  });

  it("each named permanent glows gold once", () => {
    // Two different permanents (two Leylines side by side would be one pile).
    const a = card("card:11", 1, "Leyline of the Void", { kind: "other", types: "Enchantment" });
    const b = card("card:22", 1, "Leyline of Punishment", { kind: "other", types: "Enchantment" });
    const view = render(draw([a, b]));
    calls.length = 0;
    const pulse = { key: "pulse:3", cards: ["card:11", "card:22"] };
    view.rerender(draw([a, b], { pulse }));
    const glowed = (id: string) =>
      calls.filter(
        (x) =>
          x.element === faceOf(view.container, id) &&
          /drop-shadow/.test(String(x.frames[2]?.filter ?? "")),
      );
    expect(glowed("card:11")).toHaveLength(1);
    expect(glowed("card:22")).toHaveLength(1);
    calls.length = 0;
    view.rerender(draw([{ ...a }, { ...b }], { pulse }));
    expect(glowed("card:11")).toHaveLength(0);
  });
});

// --- F-0083-F · split second, can't be countered ------------------------------------------------

describe("F-0083-F · Sudden Shock locks the stack; Abrupt Decay wears the seal only", () => {
  it("the worker's flags reach the stack card", () => {
    const board = snap(1, 1, {
      stack: [
        {
          id: "stack:6",
          description: "",
          source: "card:52",
          name: "Sudden Shock",
          controller: 1,
          kind: "spell",
          targets: [],
          splitSecond: true,
        },
        {
          id: "stack:5",
          description: "",
          source: "card:51",
          name: "Abrupt Decay",
          controller: 1,
          kind: "spell",
          targets: [],
          cantBeCountered: true,
        },
      ],
    });
    const data = boardFromSnapshot(board, null);
    expect(data.stack.map((s) => [s.id, !!s.splitSecond, !!s.cantBeCountered])).toEqual([
      ["stack:6", true, false],
      ["stack:5", false, true],
    ]);
  });

  it("split second: the stopwatch square, the gold ring, the other player's hand dims; all lift as it goes", () => {
    const view = render(
      draw([], { stack: [spell("stack:6", 1, "Sudden Shock", { splitSecond: true })] }),
    );
    const c = view.container;
    expect(c.querySelector('[data-spell-mark="split-second"]')).toBeTruthy();
    expect(c.querySelector('[data-split-ring="stack:6"]')).toBeTruthy();
    // Alice cast it: Bob's hand (the opponent's, to this viewer) dims.
    expect(c.querySelector(".bf-board")!.getAttribute("data-split-second")).toBe("opponent");
    view.rerender(draw([], { stack: [] }));
    expect(c.querySelector(".bf-board")!.getAttribute("data-split-second")).toBeNull();
    expect(marks(c, "splitring").map((m) => m.dataset["of"])).toEqual(["stack:6"]);
  });

  it("Bob's split second: Alice's own hand dims", () => {
    const view = render(
      draw([], { stack: [spell("stack:6", 2, "Sudden Shock", { splitSecond: true })] }),
    );
    expect(view.container.querySelector(".bf-board")!.getAttribute("data-split-second")).toBe(
      "viewer",
    );
  });

  it("can't be countered: the seal only -- no ring, no hand dims", () => {
    const view = render(
      draw([], { stack: [spell("stack:5", 1, "Abrupt Decay", { cantBeCountered: true })] }),
    );
    const c = view.container;
    expect(c.querySelector('[data-spell-mark="cant-be-countered"]')).toBeTruthy();
    expect(c.querySelector("[data-split-ring]")).toBeNull();
    expect(c.querySelector(".bf-board")!.getAttribute("data-split-second")).toBeNull();
  });

  it("an ordinary spell wears no square", () => {
    const view = render(draw([], { stack: [spell("stack:4", 1, "Lightning Bolt")] }));
    expect(view.container.querySelector("[data-spell-mark]")).toBeNull();
  });
});

// --- F-0083-G · the jump check's leftovers --------------------------------------------------------

describe("F-0083-G · L1 merges fade, L2 an xN trigger card keeps its element", () => {
  it("L1: the old face and the mutating spell fade into the merge, never gone at full strength", () => {
    const host = { x: 400, y: 300, w: 110, h: 154, scale: 1, rotation: 0, z: 0 };
    const from = { ...host, x: 900, y: 120 };
    for (const part of ["partner", "old"] as const) {
      const frames = mergeFrames(part, from, host, 110, 154, { x: 0.5, y: 0.5 }, "110 220 150");
      const after = frames.filter((f) => Number(f.offset) * MERGE_MS > MERGE_PULL_MS + 1);
      expect(after.some((f) => Number(f.opacity) > 0 && Number(f.opacity) < 1)).toBe(true);
      expect(Number(frames.at(-1)!.opacity)).toBe(0);
    }
  });

  it("L2: the trigger leading an xN card resolves; the next takes over the same element", () => {
    const slasher = card("card:52", 1, "Storm-Charged Slasher");
    const trig = (id: string, extra: Partial<StackView> = {}) =>
      spell(id, 1, "Storm-Charged Slasher", { kind: "trigger", source: "card:52", ...extra });
    const view = render(draw([slasher], { stack: [trig("stack:10")] }));
    view.rerender(
      draw([slasher], {
        stack: [trig("stack:11", { count: 2, members: ["stack:11", "stack:10"] })],
      }),
    );
    const slot = () =>
      view.container
        .querySelector<HTMLElement>('.bf-stack-slot [data-zone="stack"]')!
        .closest(".bf-slot");
    const before = slot();
    // It draws both (the jump check follows each on it).
    expect(
      view.container.querySelector('[data-object-id="stack:11"]')!.getAttribute("data-members"),
    ).toBe("stack:11 stack:10");
    view.rerender(draw([slasher], { stack: [trig("stack:10")] }));
    expect(view.container.querySelector('[data-object-id="stack:10"]')).toBeTruthy();
    expect(slot()).toBe(before);
  });
});
