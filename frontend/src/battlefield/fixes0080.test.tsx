// @vitest-environment jsdom

// Spec 0080 -- flicker, phasing, and survivors (F-0080-A..F; owner on the
// canvas survive-1112: Q1 A blink via exile, Q2 A ghost in place with the
// report window, Q3 B shield mark, Q4b F1 hex dome with the mark at rest, Q5
// A a shield absorbs it with a grey "0"). The real Board, handed one board
// and then the next, as the game screen hands them; and fromSnapshot, from
// the snapshots the worker sends.

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, PHASE_IN_MS, type BoardCard, type StackView } from "./Board";
import { BANISH_MS, MOVE_MS, hurry } from "./motion";
import { SHOW_MS } from "./graves";
import { BADGE_FLOOR, BADGE_ROOF, MARK_H, placeBadges } from "./CardBadges";
import { boardFromSnapshot, type Survive } from "./fromSnapshot";
import { planFights, type CombatWave, type Stand } from "./fights";
import { DOME_MS, WARD_MS } from "./survive";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import type { Box } from "./layout";

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
      onfinish: null as null | (() => void),
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
    power: 2,
    toughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}

function draw(
  battlefield: BoardCard[],
  extra: {
    stack?: StackView[];
    survive?: Survive | null;
    damage?: Parameters<typeof Board>[0]["damage"];
    fizzled?: Set<string>;
  } = {},
) {
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
      fizzled={extra.fizzled ?? new Set()}
      survive={extra.survive ?? null}
      stack={extra.stack ?? []}
      combat={null}
      damage={extra.damage ?? null}
    />
  );
}

const survive = (key: string, s: Partial<Survive>): Survive => ({
  key,
  flickers: new Map(),
  survived: new Map(),
  phased: new Map(),
  ...s,
});
const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
const faceOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
const ghostsOf = (container: HTMLElement, id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-ghost-of="${id}"]`),
];
const runsOf = (element: Element) => calls.filter((c) => c.element === element);
const delayOf = (c: Call) => Number(c.options.delay ?? 0);
const marks = (c: HTMLElement, kind: string) => [
  ...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
];
const markCall = (el: Element) => calls.filter((c) => c.element === el).at(-1)!;

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
const row = (id: string, seat: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: `Creature — ${name}`,
  tapped: false,
  faceDown: false,
  known: true,
  power: 2,
  toughness: 2,
  damage: 0,
  ...extra,
});

// --- F-0080-A · flicker ---------------------------------------------------------------------

describe("F-0080-A · Ephemerate: Banished to its exile, then risen and shown back to its place", () => {
  it("the game's one flicker move becomes a flicker, never a departure or an arrival", () => {
    const angel = row("card:30", 2, "Serra Angel", { tapped: true });
    const before = snap(1, 1, { battlefield: [angel] });
    const after = snap(1, 2, {
      battlefield: [{ ...angel, tapped: false, sick: true }],
      moves: [
        {
          card: "card:30",
          from: { zone: "battlefield", seat: 2 },
          to: { zone: "battlefield", seat: 2 },
          via: { zone: "exile", seat: 2 },
          why: "flickered",
        },
      ],
    });
    const data = boardFromSnapshot(after, before);
    expect(data.survive?.flickers.get("card:30")).toBe("opponent");
    expect(data.departures.has("card:30")).toBe(false);
    expect(data.arrivals.has("card:30")).toBe(false);
    // The exile tile is not left wrong: nothing is said to be in exile.
    expect(data.tileMoves).toHaveLength(0);
  });

  it("its old look is Banished to Bob's exile; the card itself rises out of it, after", () => {
    const angel = card("card:30", 2, "Serra Angel", { tapped: true, power: 5, toughness: 5 });
    const view = render(draw([angel]));
    calls.length = 0;
    const back = { ...angel, tapped: false, sick: true };
    view.rerender(
      draw([back], { survive: survive("1:2", { flickers: new Map([["card:30", "opponent"]]) }) }),
    );
    const ghost = ghostsOf(view.container, "flicker:card:30")[0]!;
    expect(ghost).toBeTruthy();
    expect(ghost.dataset["motes"] ?? ghost.querySelector(".bf-mote")).toBeTruthy();
    const out = runsOf(ghost).at(-1)!;
    expect(Number(out.options.duration)).toBe(BANISH_MS + MOVE_MS);
    expect(String(out.frames.at(-1)!.filter)).toMatch(/drop-shadow/);
    const slot = slotOf(view.container, "card:30");
    const rise = runsOf(slot).find((c) => Number(c.options.duration) === SHOW_MS)!;
    expect(rise).toBeTruthy();
    expect(delayOf(rise)).toBe(BANISH_MS + MOVE_MS);
    // Unseen in its place while its ghost goes.
    const away = runsOf(slot).find((c) => c.options.id === "flicker-away")!;
    expect(Number(away.options.duration)).toBe(BANISH_MS + MOVE_MS);
    expect(away.frames.every((f) => Number(f.opacity) === 0)).toBe(true);
  });

  it("played once: pointing at a card (the same board again) never flickers it twice", () => {
    const angel = card("card:30", 2, "Serra Angel");
    const s = survive("1:2", { flickers: new Map([["card:30", "opponent"]]) });
    const view = render(draw([angel]));
    view.rerender(draw([angel], { survive: s }));
    expect(ghostsOf(view.container, "flicker:card:30")).toHaveLength(1);
    calls.length = 0;
    view.rerender(draw([{ ...angel }], { survive: s }));
    expect(calls.some((c) => c.options.id === "flicker-away")).toBe(false);
  });
});

// --- F-0080-B · phasing --------------------------------------------------------------------------

describe("F-0080-B · Teferi's Protection: ghosts in place with the mark, unclickable, solid again", () => {
  it("a phased-out permanent stays on the board, never drawn as exiled", () => {
    const bears = row("card:12", 2, "Grizzly Bears");
    const before = snap(1, 1, { battlefield: [bears] });
    const after = snap(1, 2, {
      battlefield: [{ ...bears, phasedOut: true }],
      phased: [{ card: "card:12", out: true }],
    });
    const data = boardFromSnapshot(after, before);
    expect(data.battlefield.map((c) => [c.id, c.phasedOut])).toEqual([["card:12", true]]);
    expect(data.departures.has("card:12")).toBe(false);
    expect(data.survive?.phased.get("card:12")).toBe(true);
  });

  it("drawn see-through with the square phased mark, out of reach; solid again as it phases in", () => {
    const bears = card("card:12", 2, "Grizzly Bears");
    const view = render(draw([bears]));
    view.rerender(
      draw([{ ...bears, phasedOut: true }], {
        survive: survive("1:2", { phased: new Map([["card:12", true]]) }),
      }),
    );
    const face = faceOf(view.container, "card:12");
    expect(face.dataset["phased"]).toBe("true");
    expect(face.getAttribute("aria-disabled")).toBe("true");
    expect(face.tabIndex).toBe(-1);
    expect(face.querySelector(".bf-mark-phased")).toBeTruthy();
    // No Banish, no flight to exile, no wipe flash.
    expect(view.container.querySelector("[data-ghost-of]")).toBeNull();
    calls.length = 0;
    view.rerender(
      draw([bears], { survive: survive("1:3", { phased: new Map([["card:12", false]]) }) }),
    );
    const solid = faceOf(view.container, "card:12");
    expect(solid.dataset["phased"]).toBeUndefined();
    expect(solid.querySelector(".bf-mark-phased")).toBeNull();
    const back = runsOf(solid).find((c) => Number(c.options.duration) === PHASE_IN_MS)!;
    expect(Number(back.frames[0]!.opacity)).toBeCloseTo(0.34);
    expect(Number(back.frames.at(-1)!.opacity)).toBe(1);
  });
});

// --- F-0080-C · regeneration ---------------------------------------------------------------

describe("F-0080-C · River Boa against Murder: the shield mark, broken instead of the card", () => {
  it("a shield waiting shows the green shield square; used, it bursts in green with sparks", () => {
    const boa = card("card:40", 2, "River Boa", { power: 2, toughness: 1 });
    const view = render(draw([{ ...boa, shields: 1 }]));
    expect(slotOf(view.container, "card:40").querySelector(".bf-mark-shield")).toBeTruthy();
    view.rerender(
      draw([{ ...boa, tapped: true }], {
        survive: survive("1:4", { survived: new Map([["card:40", "regenerated"]]) }),
      }),
    );
    expect(slotOf(view.container, "card:40").querySelector(".bf-mark-shield")).toBeNull();
    const burst = marks(view.container, "shieldbreak");
    expect(burst).toHaveLength(1);
    expect(burst[0]!.dataset["of"]).toBe("card:40");
    expect(burst[0]!.querySelector("svg")).toBeTruthy();
    const sparks = marks(view.container, "spark").filter((m) => m.dataset["of"] === "card:40");
    expect(sparks.length).toBeGreaterThan(0);
    expect(sparks.every((s) => s.classList.contains("bf-fight-green"))).toBe(true);
    // The card stays: no Shatter, no ghost to the graveyard.
    expect(view.container.querySelector("[data-ghost-of]")).toBeNull();
  });
});

// --- F-0080-D · indestructible ------------------------------------------------------------

const stand = (box: Box, item: string, name: string, seat: number): Stand => ({
  box,
  item,
  name,
  seat,
  count: 1,
});

describe("F-0080-D · Darksteel Myr: the hexagon at rest; a hex dome at the blow, the card stays", () => {
  it("wears the gold hexagon at all times", () => {
    const myr = card("card:50", 1, "Darksteel Myr", {
      power: 0,
      toughness: 1,
      indestructible: true,
      keywords: ["Indestructible"],
    });
    const view = render(draw([myr]));
    expect(slotOf(view.container, "card:50").querySelector(".bf-mark-hex")).toBeTruthy();
  });

  it("Wrath of God: the dome flickers up round it after the wipe's flash; it stays", () => {
    const myr = card("card:50", 1, "Darksteel Myr", { indestructible: true });
    const others = ["card:61", "card:62", "card:63"].map((id) => card(id, 2, "Grizzly Bears"));
    const view = render(draw([myr, ...others]));
    view.rerender(
      draw([myr], {
        survive: survive("1:5", { survived: new Map([["card:50", "indestructible"]]) }),
      }),
    );
    const dome = marks(view.container, "dome");
    expect(dome).toHaveLength(1);
    expect(dome[0]!.querySelector("pattern")).toBeTruthy();
    const run = markCall(dome[0]!);
    expect(Number(run.options.duration)).toBe(DOME_MS);
    // The wipe's flash first (three or more leaving), then the dome.
    expect(delayOf(run)).toBeGreaterThan(0);
    const gold = marks(view.container, "spark").filter((m) => m.dataset["of"] === "card:50");
    expect(gold.length).toBeGreaterThan(0);
    expect(gold.every((s) => s.classList.contains("bf-fight-gold"))).toBe(true);
    expect(ghostsOf(view.container, "card:50")).toHaveLength(0);
  });

  it("a lethal block: the dome plays with the blow, the number in gold, once", () => {
    const myr = card("card:50", 1, "Darksteel Myr", {
      indestructible: true,
      blocking: true,
      power: 0,
      toughness: 1,
    });
    const giant = card("card:70", 2, "Hill Giant", { attacking: true, power: 3, toughness: 3 });
    const view = render(draw([myr, giant]));
    view.rerender(
      draw([{ ...myr, damage: 3 }, giant], {
        survive: survive("1:6", { survived: new Map([["card:50", "indestructible"]]) }),
        damage: {
          key: "damage:6",
          combat: "regular",
          hits: [{ source: "card:70", target: { object: "card:50" }, amount: 3 }],
          fights: [{ attacker: "card:70", defender: { player: 1 }, blockers: ["card:50"] }],
        },
      }),
    );
    const dome = marks(view.container, "dome");
    expect(dome).toHaveLength(1);
    const number = marks(view.container, "number").find((m) => m.dataset["of"] === "card:50")!;
    expect(number.textContent).toBe("−3");
    expect(number.classList.contains("bf-fight-gold")).toBe(true);
    // Knocked, but never flashing red as if hurt: the blow bounces off.
    const myrRun = runsOf(faceOf(view.container, "card:50")).find((c) => c.options.id === "fight")!;
    expect(myrRun).toBeTruthy();
    expect(myrRun.frames.every((f) => /sepia\(0\)/.test(String(f.filter)))).toBe(true);
    // The blow and the dome together.
    expect(Math.abs(delayOf(markCall(dome[0]!)) + 80 - delayOf(markCall(number)))).toBeLessThan(2);
  });

  it("the dome is not the prevention shield: gold hex grid round the card, not pale and in front", () => {
    const box: Box = { x: 400, y: 500, w: 100, h: 140, scale: 1, rotation: 0, z: 1 };
    const view = render(draw([card("card:50", 1, "Darksteel Myr", { indestructible: true })]));
    view.rerender(
      draw([card("card:50", 1, "Darksteel Myr", { indestructible: true })], {
        survive: survive("1:7", { survived: new Map([["card:50", "indestructible"]]) }),
      }),
    );
    const dome = marks(view.container, "dome")[0]!;
    expect(dome.className).toBe("bf-fight-dome");
    expect(dome.className).not.toMatch(/ward/);
    void box;
  });
});

// --- F-0080-E · prevented damage ------------------------------------------------------------

describe("F-0080-E · Holy Day: the hits land on a pale shield and a grey 0 rises", () => {
  const bearsBox: Box = { x: 600, y: 600, w: 100, h: 140, scale: 1, rotation: 0, z: 1 };

  it("the fight still plays, and a prevented strike carries what it would have dealt", () => {
    const wave: CombatWave = {
      key: "damage:9",
      combat: "regular",
      hits: [{ source: "card:20", target: { player: 2 }, amount: 0, prevented: 2 }],
      fights: [{ attacker: "card:20", defender: { player: 2 }, blockers: [] }],
    };
    const plan = planFights({
      wave,
      at: (id) => (id === "card:20" ? stand(bearsBox, "card:20", "Grizzly Bears", 1) : null),
      life: () => ({ x: 1750, y: 120 }),
      lifeR: 27,
      viewerSeat: 1,
      opponentName: "Bob",
    })!;
    expect(plan).toBeTruthy();
    expect(plan.fights[0]!.strikes[0]).toMatchObject({ amount: 0, prevented: 2 });
  });

  it("on the board: the pale shield and a grey 0 at Bob's life; no slash, no red, no hurt", () => {
    const bears = card("card:20", 1, "Grizzly Bears", { attacking: true });
    const view = render(draw([bears]));
    view.rerender(
      draw([bears], {
        damage: {
          key: "damage:9",
          combat: "regular",
          hits: [{ source: "card:20", target: { player: 2 }, amount: 0, prevented: 2 }],
          fights: [{ attacker: "card:20", defender: { player: 2 }, blockers: [] }],
        },
      }),
    );
    const ward = marks(view.container, "ward");
    expect(ward).toHaveLength(1);
    expect(ward[0]!.dataset["of"]).toBe("player:2");
    expect(Number(markCall(ward[0]!).options.duration)).toBe(WARD_MS);
    const zero = marks(view.container, "number").find((m) => m.dataset["of"] === "player:2")!;
    expect(zero.textContent).toBe("0");
    expect(zero.classList.contains("bf-fight-grey")).toBe(true);
    // Never over the life total (it would read as "life 0"): off to the shield's left.
    const centre = parseFloat(ward[0]!.style.left) + parseFloat(ward[0]!.style.width) / 2;
    expect(parseFloat(zero.style.left)).toBeLessThan(centre - 40);
    expect(marks(view.container, "slash")).toHaveLength(0);
    expect(marks(view.container, "plate")).toHaveLength(0);
    expect(marks(view.container, "edge")).toHaveLength(0);
  });

  it("protection from red against Pyroclasm: the same shield on the creature, its 2 never lands", () => {
    const walker = card("card:33", 1, "Kor Firewalker", { keywords: ["Protection from red"] });
    const bears = card("card:34", 1, "Grizzly Bears");
    const view = render(draw([walker, bears]));
    view.rerender(
      draw([walker, { ...bears, damage: 2 }], {
        damage: {
          key: "damage:10",
          hits: [
            { source: "card:80", target: { object: "card:33" }, amount: 0, prevented: 2 },
            { source: "card:80", target: { object: "card:34" }, amount: 2 },
          ],
        },
      }),
    );
    const ward = marks(view.container, "ward");
    expect(ward.map((w) => w.dataset["of"])).toEqual(["card:33"]);
    expect(
      marks(view.container, "number").find((m) => m.dataset["of"] === "card:33")?.textContent,
    ).toBe("0");
  });

  it("protection from red against Lightning Bolt: the fizzled Bolt's beam meets the same shield", () => {
    const bears = card("card:34", 1, "Grizzly Bears", { keywords: ["Protection from red"] });
    const bolt: StackView = {
      id: "stack:5",
      name: "Lightning Bolt",
      kind: "spell",
      source: null,
      card: "card:81",
      seat: 2,
      targets: [{ object: "card:34" }],
    };
    const view = render(draw([bears], { stack: [bolt] }));
    view.rerender(draw([bears], { stack: [], fizzled: new Set(["card:81"]) }));
    const ward = marks(view.container, "ward");
    expect(ward).toHaveLength(1);
    // Nothing was dealt: no number at all.
    expect(marks(view.container, "number")).toHaveLength(0);
  });
});

// --- F-0080-F · hurry, reduce motion, and room on the card -----------------------------------

describe("F-0080-F · a click hurries it; reduce motion keeps the marks; marks never cover the card's words", () => {
  it("a click hurries the dome with everything else on the board", () => {
    const myr = card("card:50", 1, "Darksteel Myr", { indestructible: true });
    const view = render(draw([myr]));
    view.rerender(
      draw([myr], {
        survive: survive("1:8", { survived: new Map([["card:50", "indestructible"]]) }),
      }),
    );
    const dome = marks(view.container, "dome")[0]!;
    hurry(view.container.querySelector(".bf-board")!);
    expect(markCall(dome).rate.length).toBeGreaterThan(0);
  });

  it("reduce motion: no flicker flight, no dome, no shield burst -- the marks still show", () => {
    still = true;
    const myr = card("card:50", 1, "Darksteel Myr", { indestructible: true });
    const boa = card("card:40", 2, "River Boa", { shields: 1 });
    const view = render(draw([myr, boa]));
    view.rerender(
      draw([myr, { ...boa, phasedOut: true }], {
        survive: survive("1:9", {
          survived: new Map([["card:50", "indestructible"]]),
          flickers: new Map([["card:50", "viewer"]]),
        }),
      }),
    );
    expect(marks(view.container, "dome")).toHaveLength(0);
    expect(view.container.querySelector("[data-ghost-of]")).toBeNull();
    expect(slotOf(view.container, "card:50").querySelector(".bf-mark-hex")).toBeTruthy();
    expect(slotOf(view.container, "card:40").querySelector(".bf-mark-phased")).toBeTruthy();
    expect(slotOf(view.container, "card:40").querySelector(".bf-mark-shield")).toBeTruthy();
  });

  it("every square fits between the bottom bar and the name bar, clear of the state word", () => {
    const room = { pile: false, mana: false, state: true, zzz: false, zone: false };
    // Tapped, folded counters ("··· N"), phased out, a shield and indestructible.
    const placed = placeBadges([0.15, MARK_H, MARK_H, MARK_H], room);
    expect(placed).not.toBeNull();
    for (const [i, at] of placed!.entries()) {
      const h = i < 1 ? 0.15 : MARK_H;
      expect(at.y).toBeGreaterThanOrEqual(BADGE_FLOOR);
      expect(at.y + h).toBeLessThanOrEqual(BADGE_ROOF + 1e-9);
      expect(at.y >= 0.565 || at.y + h <= 0.435).toBe(true);
    }
  });

  it("a card with all three squares draws them all, none over its bars", () => {
    const myr = card("card:50", 1, "Darksteel Myr", {
      indestructible: true,
      shields: 2,
      phasedOut: true,
    });
    const view = render(draw([myr]));
    const badges = slotOf(view.container, "card:50").querySelector<HTMLElement>(".bf-badges")!;
    expect(badges.dataset["badges"]).toBe("3");
    expect(badges.title).toMatch(/Regeneration shield ×2/);
    expect(badges.title).toMatch(/Indestructible/);
    expect(badges.title).toMatch(/Phased out/);
  });
});
