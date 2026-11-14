// @vitest-environment jsdom

// Spec 0084 -- spent not killed, library shuffles, coming alive, fights
// (F-0084-A..F; owner on the canvas gaps-moves-1113: 1 A fold and go, 5 A
// the existing riffle, 6 B power flows in, 9 A the combat fight). The real
// Board, handed one board and then the next, as the game screen hands them;
// fromSnapshot and the page's own parser, from the snapshots the worker
// sends.

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, RISE_MS, type BoardCard, type StackView } from "./Board";
import { COIN_MS, RIFFLE_MS, SPENT_BEAT_MS, SPENT_FLAT, fateMs } from "./motion";
import { ALIVE_MOTE_COUNT, ALIVE_MOTES_MS, ALIVE_PULSE_MS } from "./alive";
import { boardFromSnapshot, type Moments } from "./fromSnapshot";
import { PEEL_MS } from "./piles";
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
      finish() {},
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
const treasure = (id: string) =>
  card(id, 1, "Treasure", {
    kind: "artifact",
    types: "Token Artifact — Treasure",
    token: true,
    power: null,
    toughness: null,
  });

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
const moments = (m: Partial<Moments>): Moments => ({
  key: `m${++entered}`,
  spent: new Set(),
  shuffles: [],
  crewed: new Map(),
  ...m,
});

const marks = (c: HTMLElement, kind: string) => [
  ...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
];
const ghost = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-ghost-of="${id}"]`)!;
const faceOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
const callOn = (el: Element) => calls.filter((x) => x.element === el).at(-1)!;

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

// --- F-0084-A, B · spent, not killed -------------------------------------------------------

describe("F-0084-A · three Treasures pay for a spell: fold and go, coin sparks, no wipe", () => {
  const three = () => [treasure("card:61"), treasure("card:62"), treasure("card:63")];

  it("each spent Treasure folds flat and goes, one after another; never the defeated look", () => {
    const view = render(draw(three()));
    calls.length = 0;
    view.rerender(
      draw([], { moments: moments({ spent: new Set(["card:61", "card:62", "card:63"]) }) }),
    );
    const c = view.container;
    const delays: number[] = [];
    for (const id of ["card:61", "card:62", "card:63"]) {
      const g = ghost(c, id);
      expect(g.dataset["fate"]).toBe("spent");
      expect(g.querySelector(".bf-fate-cracks")).toBeNull();
      expect(g.querySelector(".bf-fate-flash")).toBeNull();
      const run = callOn(g);
      // It folds flat: the last frames are squashed to SPENT_FLAT of its height.
      expect(String(run.frames.at(-1)!.transform)).toContain(`scaleY(${SPENT_FLAT})`);
      // Whole as it starts to fold (after peeling off its pile).
      expect(run.frames.some((f) => String(f.transform).includes("scaleY(1)"))).toBe(true);
      // No red, no shake: dimmed and grey.
      expect(String(run.frames.at(-1)!.filter)).toContain("grayscale(0.55)");
      expect(run.frames.at(-1)!.opacity).toBe(0);
      delays.push(Number(run.options.delay));
    }
    // Several spent at once go one per mana, never as a wipe.
    const sorted = [...delays].sort((a, b) => a - b);
    expect(sorted[1]! - sorted[0]!).toBe(SPENT_BEAT_MS);
    expect(sorted[2]! - sorted[1]!).toBe(SPENT_BEAT_MS);
    expect(c.querySelector(".bf-sweep")).toBeNull();
    expect(fateMs("spent")).toBe(320);
  });

  it("a Treasure gives a coin spark as it goes; nothing else does", () => {
    const clue = card("card:70", 1, "Clue", {
      kind: "artifact",
      types: "Token Artifact — Clue",
      power: null,
      toughness: null,
    });
    const view = render(draw([...three(), clue]));
    calls.length = 0;
    view.rerender(
      draw([], {
        moments: moments({ spent: new Set(["card:61", "card:62", "card:63", "card:70"]) }),
      }),
    );
    const coins = marks(view.container, "coin");
    expect(coins.map((m) => m.dataset["of"]).sort()).toEqual(["card:61", "card:62", "card:63"]);
    for (const coin of coins) {
      const run = callOn(coin);
      expect(run.options.duration).toBe(COIN_MS);
      // It starts as its own Treasure starts to fold (once it has peeled off its pile).
      const g = ghost(view.container, coin.dataset["of"]!);
      expect(Number(run.options.delay)).toBe(
        Number(callOn(g).options.delay) + (g.dataset["peel"] ? PEEL_MS : 0),
      );
    }
  });

  it("killed is still killed: a creature destroyed in the same update gets the defeated look", () => {
    const angel = card("card:30", 2, "Serra Angel");
    const view = render(draw([...three(), angel]));
    calls.length = 0;
    view.rerender(
      draw([], { moments: moments({ spent: new Set(["card:61", "card:62", "card:63"]) }) }),
    );
    const g = ghost(view.container, "card:30");
    expect(g.dataset["fate"]).toBe("defeated");
    expect(g.querySelector(".bf-fate-cracks")).toBeTruthy();
    // One killed and three spent is no board wipe.
    expect(view.container.querySelector(".bf-sweep")).toBeNull();
  });

  it("three killed is still a wipe; the same three sacrificed but not spent (an edict) are killed", () => {
    const bears = ["card:81", "card:82", "card:83"].map((id) => card(id, 2, "Grizzly Bears"));
    const view = render(draw(bears));
    view.rerender(draw([], { moments: null }));
    expect(view.container.querySelector(".bf-sweep")).toBeTruthy();
    for (const b of bears) expect(ghost(view.container, b.id).dataset["fate"]).toBe("defeated");
  });
});

describe("F-0084-C · the ability lifts off the card sacrificed to pay for it", () => {
  it("its card gone from the table, the ability rises from where the card was", () => {
    const clue = card("card:70", 1, "Clue", {
      kind: "artifact",
      types: "Token Artifact — Clue",
      power: null,
      toughness: null,
    });
    const ability: StackView = {
      id: "stack:5",
      name: "Clue",
      seat: 1,
      kind: "ability",
      // As fromSnapshot hands it: no source line (its card is gone), but where it lifts from.
      source: null,
      leftFrom: "card:70",
      targets: [],
    };
    const view = render(draw([clue]));
    calls.length = 0;
    view.rerender(
      draw([], { stack: [ability], moments: moments({ spent: new Set(["card:70"]) }) }),
    );
    const slot = faceOf(view.container, "stack:5").closest<HTMLElement>(".bf-slot")!;
    expect(slot.dataset["rising"]).toBe("true");
    const rise = callOn(slot);
    expect(rise.options.duration).toBe(RISE_MS);
    expect(rise.frames[0]!.opacity).toBe(0);
    // It starts at the Clue's place on the table, not at the stack spot.
    const x = /translate3d\(([-\d.]+)px/.exec(String(rise.frames[0]!.transform))![1];
    const y = /translate3d\(\s*[-\d.]+px,\s*([-\d.]+)px/.exec(
      String(rise.frames[0]!.transform),
    )![1];
    const end = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(
      String(rise.frames.at(-1)!.transform),
    )!;
    expect(Number(x)).not.toBe(Number(end[1]));
    expect(Number(y)).not.toBe(Number(end[2]));
  });
});

// --- F-0084-D · library shuffles -------------------------------------------------------------

describe("F-0084-B, D · a library shuffled: the riffle on that player's library, both seats", () => {
  it("your library: six backs riffle out of it and back, fanning up", () => {
    const bears = card("card:30", 2, "Grizzly Bears");
    const view = render(draw([bears]));
    calls.length = 0;
    view.rerender(draw([bears], { moments: moments({ shuffles: ["viewer"] }) }));
    const riffles = [
      ...view.container.querySelectorAll<HTMLElement>('[data-riffle="library:viewer"]'),
    ];
    expect(riffles).toHaveLength(6);
    const run = callOn(riffles[5]!);
    expect(run.options.duration).toBe(RIFFLE_MS);
    expect(String(run.frames[1]!.transform)).toMatch(/translate\(-?[\d.]+px, -[\d.]+px\)/);
  });

  it("theirs, at the top of the screen: it fans downward so it stays on screen", () => {
    const bears = card("card:30", 2, "Grizzly Bears");
    const view = render(draw([bears]));
    calls.length = 0;
    view.rerender(draw([bears], { moments: moments({ shuffles: ["opponent"] }) }));
    const riffles = [
      ...view.container.querySelectorAll<HTMLElement>('[data-riffle="library:opponent"]'),
    ];
    expect(riffles).toHaveLength(6);
    expect(String(callOn(riffles[3]!).frames[1]!.transform)).toMatch(
      /translate\(-?[\d.]+px, [\d.]+px\)/,
    );
  });

  it("a card fetched out of it: the riffle waits until it has landed", () => {
    const forest = card("card:40", 1, "Forest", {
      kind: "land",
      types: "Basic Land — Forest",
      power: null,
      toughness: null,
      tapped: true,
    });
    const view = render(draw([]));
    calls.length = 0;
    view.rerender(
      draw([forest], {
        arrivals: new Map([["card:40", "viewer:library"]]),
        moments: moments({ shuffles: ["viewer"] }),
      }),
    );
    const first = view.container.querySelector<HTMLElement>('[data-riffle="library:viewer"]')!;
    expect(Number(callOn(first).options.delay)).toBe(850);
  });

  it("a card shuffled in already riffles it: one riffle, not two", () => {
    const bears = card("card:30", 1, "Grizzly Bears");
    const view = render(draw([bears]));
    view.rerender(
      draw([], {
        returns: new Map([
          ["card:30", { zone: "library", side: "viewer", where: "shuffled", hidden: true }],
        ]),
        moments: moments({ shuffles: ["viewer"] }),
      }),
    );
    expect(view.container.querySelectorAll("[data-riffle]")).toHaveLength(6);
  });
});

// --- F-0084-E · coming alive ------------------------------------------------------------------

describe("F-0084-E · a vehicle crewed: motes from the crew, a gold ring, rising P/T; grey back", () => {
  const elves = card("card:20", 1, "Llanowar Elves", { power: 1, toughness: 1 });
  const copter = card("card:21", 1, "Smuggler's Copter", {
    kind: "artifact",
    types: "Artifact — Vehicle",
    power: null,
    toughness: null,
  });
  const alive = {
    ...copter,
    kind: "creature",
    types: "Artifact Creature — Vehicle",
    power: 3,
    toughness: 3,
  };

  it("crewed: gold motes from the Elves, the ring, the breath, then the slide and a green 3/3", () => {
    const view = render(draw([elves, copter]));
    calls.length = 0;
    view.rerender(
      draw([{ ...elves, tapped: true }, alive], {
        moments: moments({ crewed: new Map([["card:21", ["card:20"]]]) }),
      }),
    );
    const c = view.container;
    const motes = marks(c, "mote").filter((m) => m.dataset["of"] === "card:21");
    expect(motes).toHaveLength(ALIVE_MOTE_COUNT);
    const ring = marks(c, "alivering").find((m) => m.dataset["of"] === "card:21")!;
    expect(ring.classList.contains("bf-fight-grey")).toBe(false);
    expect(Number(callOn(ring).options.delay)).toBe(ALIVE_MOTES_MS);
    // Each mark is unseen while it waits for its moment (held at its first frame).
    for (const m of [...motes, ring, ...marks(c, "ptfloat")])
      expect(callOn(m).frames[0]!.opacity).toBe(0);
    const pt = marks(c, "ptfloat").find((m) => m.dataset["of"] === "card:21")!;
    expect(pt.textContent).toBe("3/3");
    expect(pt.classList.contains("bf-fight-grey")).toBe(false);
    // Its slide to the creature line waits for the motes and the breath.
    const slot = faceOf(c, "card:21").closest(".bf-slot")!;
    const slide = calls.filter((x) => x.element === slot).at(-1)!;
    expect(Number(slide.options.delay)).toBe(ALIVE_MOTES_MS + ALIVE_PULSE_MS);
    // The number lands as a green rise after the slide, not before.
    expect(Number(callOn(pt).options.delay)).toBeGreaterThan(ALIVE_MOTES_MS + ALIVE_PULSE_MS);
    // The card breathes (added to its own transform).
    const breath = calls.find(
      (x) =>
        x.element === faceOf(c, "card:21") &&
        String(x.frames[1]?.transform).includes("scale(1.08)"),
    )!;
    expect(breath.options.composite).toBe("add");
  });

  it("its own ability (Mutavault): motes from where the ability was on the stack", () => {
    const vault = card("card:50", 1, "Mutavault", {
      kind: "land",
      types: "Land",
      power: null,
      toughness: null,
    });
    const ability: StackView = {
      id: "stack:8",
      name: "Mutavault",
      seat: 1,
      kind: "ability",
      source: "card:50",
      targets: [],
    };
    const view = render(draw([vault], { stack: [ability] }));
    calls.length = 0;
    view.rerender(
      draw([{ ...vault, kind: "creature", types: "Land Creature", power: 2, toughness: 2 }], {
        stack: [],
      }),
    );
    expect(marks(view.container, "mote").filter((m) => m.dataset["of"] === "card:50")).toHaveLength(
      ALIVE_MOTE_COUNT,
    );
    expect(marks(view.container, "ptfloat")[0]!.textContent).toBe("2/2");
  });

  it("the turn's end: a grey ring closes in, a grey 3/3 rises off, then it slides back", () => {
    const view = render(draw([elves, alive]));
    calls.length = 0;
    view.rerender(draw([elves, copter]));
    const c = view.container;
    const ring = marks(c, "alivering")[0]!;
    expect(ring.classList.contains("bf-fight-grey")).toBe(true);
    const pt = marks(c, "ptfloat")[0]!;
    expect(pt.textContent).toBe("3/3");
    expect(pt.classList.contains("bf-fight-grey")).toBe(true);
    const slot = faceOf(c, "card:21").closest(".bf-slot")!;
    expect(Number(callOn(slot).options.delay)).toBe(300);
    expect(marks(c, "mote")).toHaveLength(0);
  });

  it("reduce motion: no motes, no ring, no rising number -- it is simply there", () => {
    still = true;
    const view = render(draw([elves, copter]));
    view.rerender(
      draw([elves, alive], { moments: moments({ crewed: new Map([["card:21", ["card:20"]]]) }) }),
    );
    expect(marks(view.container, "mote")).toHaveLength(0);
    expect(marks(view.container, "alivering")).toHaveLength(0);
    expect(faceOf(view.container, "card:21").textContent).toContain("3/3");
  });
});

// --- F-0084-F · fights ---------------------------------------------------------------------

describe("F-0084-F · fight and bite spells: the combat fight", () => {
  const baloth = card("card:31", 1, "Ravenous Baloth");
  const bears = card("card:32", 2, "Grizzly Bears", { power: 2, toughness: 2 });

  it("Prey Upon: they meet edge to edge and both slash; no crack, no caption", () => {
    const view = render(draw([baloth, bears]));
    calls.length = 0;
    view.rerender(
      draw([{ ...baloth, damage: 2 }], {
        damage: {
          key: "f1",
          fight: true,
          hits: [
            { source: "card:31", target: { object: "card:32" }, amount: 4 },
            { source: "card:32", target: { object: "card:31" }, amount: 2 },
          ],
          fights: [{ attacker: "card:31", defender: { object: "card:32" }, blockers: ["card:32"] }],
        },
      }),
    );
    const c = view.container;
    expect(marks(c, "crack")).toHaveLength(0);
    expect(marks(c, "caption")).toHaveLength(0);
    const slashed = new Set(marks(c, "slash").map((m) => m.dataset["of"]));
    expect(slashed).toEqual(new Set(["card:31", "card:32"]));
    expect(marks(c, "dim")).toHaveLength(1);
    // The Baloth lunges (its card moves inside its place).
    const lunge = calls.find((x) => x.element === faceOf(c, "card:31") && x.options.id === "fight");
    expect(lunge).toBeTruthy();
    // The fight waits for the spell's spark (380 ms).
    expect(Number(lunge!.options.delay)).toBeGreaterThanOrEqual(380);
  });

  it("the spell goes to its graveyard before its fight, never held on the stack through it", () => {
    const prey: StackView = {
      id: "stack:4",
      name: "Prey Upon",
      seat: 1,
      kind: "spell",
      source: null,
      card: "card:90",
      targets: [{ object: "card:31" }, { object: "card:32" }],
    };
    const view = render(draw([baloth, bears], { stack: [prey] }));
    calls.length = 0;
    view.rerender(
      draw([{ ...baloth, damage: 2 }], {
        stack: [],
        damage: {
          key: "f4",
          fight: true,
          hits: [
            { source: "card:31", target: { object: "card:32" }, amount: 4 },
            { source: "card:32", target: { object: "card:31" }, amount: 2 },
          ],
          fights: [{ attacker: "card:31", defender: { object: "card:32" }, blockers: ["card:32"] }],
        },
      }),
    );
    const spellGhost = ghost(view.container, "stack:4");
    // It glows as it resolves (RESOLVE_MS), then goes: never after the fight.
    expect(Number(callOn(spellGhost).options.delay)).toBeLessThanOrEqual(380);
    // The Bears, killed in the fight, still wait for it.
    expect(Number(callOn(ghost(view.container, "card:32")).options.delay)).toBeGreaterThan(1000);
  });

  it("Ram Through: only the biter strikes", () => {
    const angel = card("card:33", 2, "Serra Angel");
    const view = render(draw([baloth, angel]));
    calls.length = 0;
    view.rerender(
      draw([baloth, { ...angel, damage: 4 }], {
        damage: {
          key: "f2",
          fight: true,
          hits: [{ source: "card:31", target: { object: "card:33" }, amount: 4 }],
          fights: [{ attacker: "card:31", defender: { object: "card:33" }, blockers: [] }],
        },
      }),
    );
    const slashed = new Set(marks(view.container, "slash").map((m) => m.dataset["of"]));
    expect(slashed).toEqual(new Set(["card:33"]));
    expect(marks(view.container, "crack")).toHaveLength(0);
  });

  it("a hit's power/toughness changes as its slashes land, not at the fight's end", () => {
    const view = render(draw([baloth, bears]));
    calls.length = 0;
    view.rerender(
      draw([{ ...baloth, damage: 2 }], {
        damage: {
          key: "f3",
          fight: true,
          hits: [
            { source: "card:31", target: { object: "card:32" }, amount: 4 },
            { source: "card:32", target: { object: "card:31" }, amount: 2 },
          ],
          fights: [{ attacker: "card:31", defender: { object: "card:32" }, blockers: ["card:32"] }],
        },
        sizeChanges: {
          key: "s3",
          changes: [
            {
              card: "card:31",
              from: { power: 4, toughness: 4, loyalty: null },
              to: { power: 4, toughness: 2, loyalty: null },
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
    const slash = marks(c, "slash").filter((m) => m.dataset["of"] === "card:31")[0]!;
    const blow = Number(callOn(slash).options.delay);
    const figure = faceOf(c, "card:31").querySelector(".bf-pt, [data-size]")!;
    const pop = calls.find(
      (x) =>
        figure.contains(x.element) && String(x.frames[1]?.transform ?? "").includes("scale(1.3)"),
    )!;
    expect(pop).toBeTruthy();
    expect(Math.abs(Number(pop.options.delay) - blow)).toBeLessThanOrEqual(60);
  });
});

// --- the page's parsers --------------------------------------------------------------------

describe("Spec 0084 · what the worker sends, read by the page", () => {
  it("moves `spent`, `shuffles`, `crewed` and a `fight` wave", () => {
    const board = snap(1, 9, {
      battlefield: [],
      moves: [
        {
          card: "card:61",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "sacrificed",
          spent: true,
        },
        {
          card: "card:30",
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "graveyard", seat: 2 },
          why: "sacrificed",
        },
      ],
      shuffles: [1, 2, "x"],
      crewed: [{ card: "card:21", by: ["card:20", 7] }],
      damage: {
        key: "d1",
        fight: true,
        hits: [{ source: "card:31", target: { object: "card:32" }, amount: 4 }],
        fights: [{ attacker: "card:31", defender: { object: "card:32" }, blockers: [] }],
      },
    });
    const data = boardFromSnapshot(board, null);
    expect([...data.moments!.spent]).toEqual(["card:61"]);
    expect(data.moments!.shuffles).toEqual(["viewer", "opponent"]);
    expect(data.moments!.crewed.get("card:21")).toEqual(["card:20"]);
    expect(board.damage!.fight).toBe(true);
    expect(board.damage!.combat).toBeUndefined();
    expect(board.damage!.fights).toEqual([
      { attacker: "card:31", defender: { object: "card:32" }, blockers: [] },
    ]);
  });

  it("an ability whose card left the table: no source line, but where it lifts off", () => {
    const board = snap(1, 46, {
      stack: [
        {
          id: "stack:6",
          source: "card:122",
          name: "Clue Token",
          controller: 1,
          kind: "ability",
          targets: [],
        },
      ],
    });
    const entry = boardFromSnapshot(board, null).stack[0]!;
    expect(entry.source).toBeNull();
    expect(entry.leftFrom).toBe("card:122");
  });

  it("nothing of it: no moments", () => {
    expect(boardFromSnapshot(snap(1, 3, {}), null).moments).toBeNull();
  });
});
