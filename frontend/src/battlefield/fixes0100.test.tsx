// @vitest-environment jsdom

// Spec 0100 (owner 2026-11-17, deep dive 3) -- spells: what they chose and
// what they aim at. The real Board, handed the boards the page makes from the
// worker's snapshots (match.ts's parser, then fromSnapshot):
//
//  F-0100-C  X medallion on the stack card; the modes as the card's text (the
//            chosen lit, the rest struck through); a number at each ripple
//            (divided damage only); a doubled beam (kicked), a grey beam to
//            the caster's graveyard (evoked), a fan of beams with corners on
//            all (overloaded).
//  F-0100-E  the other player's beams blue-violet, yours gold; a target that
//            changes swings the same beam element and ends on the new target;
//            pointing at a stack card lifts its source and targets and dims
//            nothing (no card's opacity or filter changes).
//  item 5    a target in a graveyard: the beam to the tile and the card
//            peeking out of it, with the corners (the game screen's half is
//            fixes0100screen.test.tsx).

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import { Board, peekBox, type PiledCard, type StackView } from "./Board";
import { boardFromSnapshot } from "./fromSnapshot";
import { geometry } from "./layout";
import { anchors } from "./motion";

const size = { width: 1920, height: 1080 };
type Clock = { element: Element; options: KeyframeAnimationOptions; animation: Animation };
let clocks: Clock[] = [];
let still = false;
beforeEach(() => {
  clocks = [];
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
  vi.stubGlobal("PointerEvent", class extends MouseEvent {});
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    _frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation = {
      onfinish: null as null | (() => void),
      oncancel: null,
      cancel() {},
      finish() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      finished: new Promise<void>(() => {}),
      effect: {
        getComputedTiming: () => ({ endTime: Number(options?.duration ?? 0), iterations: 1 }),
      },
      updatePlaybackRate() {},
    } as unknown as Animation;
    clocks.push({ element: this, options, animation });
    return animation;
  };
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
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
      otherHands: [],
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
  power: 3,
  toughness: 3,
  tapped: false,
  faceDown: false,
  known: true,
  ...extra,
});
const spell = (
  id: string,
  name: string,
  controller: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  kind: "spell",
  source: `card:9${id.slice(6)}`,
  controller,
  name,
  description: name,
  targets: [],
  ...extra,
});

const OGRE = row("card:11", 1, "Ogre Warrior");
const ANGEL = row("card:12", 1, "Serra Angel");
const BEARS = row("card:13", 1, "Grizzly Bears");
const GOBLIN = row("card:21", 2, "Goblin Guide");
const SKITE = row("card:22", 2, "Spellskite", { types: "Artifact Creature — Horror" });
const KAVU = row("card:23", 2, "Flametongue Kavu");
const TABLE = [OGRE, ANGEL, BEARS, GOBLIN, SKITE, KAVU];

/** Alice's (seat 1's) board from this snapshot body. */
function boardOf(body: Record<string, unknown>, seat = 1) {
  const s = snap(seat, { battlefield: TABLE, ...body });
  return { snapshot: s, data: boardFromSnapshot(s, s) };
}
function draw(
  data: ReturnType<typeof boardFromSnapshot>,
  seat = 1,
  piled?: ReadonlyMap<string, PiledCard>,
) {
  return (
    <Board
      battlefield={data.battlefield}
      hand={[]}
      opponentHand={[]}
      opponentName={seat === 1 ? "Bob" : "Alice"}
      viewerSeat={seat}
      artUrl={(art) => `/art/${art}`}
      stack={data.stack}
      combat={null}
      {...(piled ? { piled, pileCards: new Set(piled.keys()) } : {})}
    />
  );
}
const slotOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!.closest<HTMLElement>(".bf-slot")!;
const beams = (c: HTMLElement) => [...c.querySelectorAll<SVGGElement>('[data-line="target"]')];

// --- F-0100-C ------------------------------------------------------------------------------------

describe("F-0100-C · what the caster chose, on the spell", () => {
  it("Fireball X=6: the X medallion on the stack card's corner", () => {
    const { data } = boardOf({
      stack: [
        spell("stack:4", "Fireball", 2, { x: 6, manaCost: "{X}{R}", targets: [{ player: 1 }] }),
      ],
    });
    expect(data.stack[0]!.x).toBe(6);
    const c = render(draw(data)).container;
    const slot = c.querySelector<HTMLElement>(".bf-stack-slot")!;
    const med = slot.querySelector<HTMLElement>(".bf-xmed")!;
    expect(med).toBeTruthy();
    expect(med.dataset.x).toBe("6");
    expect(med.textContent).toBe("X=6");
    expect(med.getAttribute("aria-label")).toBe("X is 6");
  });

  it("Hydroid Krasis X=4 (no target) gets the same medallion; a spell with no X none", () => {
    const krasis = boardOf({ stack: [spell("stack:4", "Hydroid Krasis", 2, { x: 4 })] });
    expect(render(draw(krasis.data)).container.querySelector('.bf-xmed[data-x="4"]')).toBeTruthy();
    const bolt = boardOf({ stack: [spell("stack:4", "Lightning Bolt", 2)] });
    expect(render(draw(bolt.data)).container.querySelector(".bf-xmed")).toBeNull();
  });

  it("Cryptic Command: all four modes as printed, two lit, two struck through", () => {
    const modes = [
      { text: "Counter target spell.", chosen: false },
      { text: "Return target permanent to its owner's hand.", chosen: true },
      { text: "Tap all creatures your opponents control.", chosen: false },
      { text: "Draw a card.", chosen: true },
    ];
    const { data } = boardOf({
      stack: [spell("stack:4", "Cryptic Command", 2, { modes, targets: [{ object: ANGEL.id }] })],
    });
    const c = render(draw(data)).container;
    const lines = [...c.querySelectorAll<HTMLElement>(".bf-stack-slot .bf-mode")];
    expect(lines.map((l) => l.textContent)).toEqual(modes.map((m) => m.text));
    expect(lines.map((l) => l.dataset.mode)).toEqual([
      "not-chosen",
      "chosen",
      "not-chosen",
      "chosen",
    ]);
    expect(lines.filter((l) => l.classList.contains("bf-mode-off"))).toHaveLength(2);
  });

  it("Collective Brutality escalated: all three lit", () => {
    const modes = ["Discard", "-2/-2", "Drain"].map((text) => ({ text, chosen: true }));
    const { data } = boardOf({
      stack: [spell("stack:4", "Collective Brutality", 2, { modes, extra: ["escalated"] })],
    });
    expect(data.stack[0]!.extra).toEqual(["escalated"]);
    const c = render(draw(data)).container;
    expect(c.querySelectorAll(".bf-mode-on")).toHaveLength(3);
    expect(c.querySelectorAll(".bf-mode-off")).toHaveLength(0);
  });

  it("Arc Lightning 2 / 1: a gold 2 at the Ogre's ripple, a gold 1 at Alice's shield", () => {
    const { data } = boardOf({
      stack: [
        spell("stack:4", "Arc Lightning", 2, {
          targets: [
            { object: OGRE.id, amount: 2 },
            { player: 1, amount: 1 },
          ],
        }),
      ],
    });
    expect(data.stack[0]!.shares).toEqual({ [OGRE.id]: 2, "player:1": 1 });
    const c = render(draw(data)).container;
    const byTo = new Map(beams(c).map((b) => [b.dataset.to, b]));
    expect(byTo.get(OGRE.id)!.querySelector("[data-share]")!.getAttribute("data-share")).toBe("2");
    expect(byTo.get("player:1")!.querySelector("[data-share]")!.getAttribute("data-share")).toBe(
      "1",
    );
  });

  it("Fireball split between two creatures (Decided 2): its medallion, no number on any beam", () => {
    const { data } = boardOf({
      stack: [
        spell("stack:4", "Fireball", 2, {
          x: 8,
          targets: [{ object: OGRE.id }, { object: ANGEL.id }],
        }),
      ],
    });
    const c = render(draw(data)).container;
    expect(beams(c)).toHaveLength(2);
    expect(c.querySelector("[data-share]")).toBeNull();
    expect(c.querySelector('.bf-xmed[data-x="8"]')).toBeTruthy();
  });

  it("kicked Burst Lightning: the beam to the Angel is doubled (two strands)", () => {
    const { data } = boardOf({
      stack: [
        spell("stack:4", "Burst Lightning", 2, {
          extra: ["kicked"],
          targets: [{ object: ANGEL.id }],
        }),
      ],
    });
    const c = render(draw(data)).container;
    const [beam] = beams(c);
    expect(beam!.querySelector('[data-doubled="true"]')).toBeTruthy();
    expect(beam!.querySelectorAll(".bf-beam-body")).toHaveLength(2);
  });

  it("overloaded Cyclonic Rift (no targets): a beam fanned to each card it hits, corners on all", () => {
    const hits = [OGRE.id, ANGEL.id, BEARS.id];
    const { data } = boardOf({
      stack: [spell("stack:4", "Cyclonic Rift", 2, { extra: ["overloaded"], hits })],
    });
    const c = render(draw(data)).container;
    expect(
      beams(c)
        .map((b) => b.dataset.to)
        .sort(),
    ).toEqual([...hits].sort());
    for (const id of hits) expect(slotOf(c, id).querySelector('[data-sight="true"]')).toBeTruthy();
    expect(slotOf(c, GOBLIN.id).querySelector('[data-sight="true"]')).toBeNull();
  });

  it("an overload of twenty: at most six beams drawn, corners on every one", () => {
    const many = Array.from({ length: 20 }, (_, i) => row(`card:${100 + i}`, 1, `Bear ${i}`));
    const s = snap(1, {
      battlefield: many,
      stack: [
        spell("stack:4", "Cyclonic Rift", 2, {
          extra: ["overloaded"],
          hits: many.map((m) => m.id),
        }),
      ],
    });
    const data = boardFromSnapshot(s, s);
    const c = render(draw(data)).container;
    expect(beams(c).length).toBeLessThanOrEqual(6);
    expect(c.querySelectorAll('.bf-slot [data-sight="true"]').length).toBeGreaterThanOrEqual(6);
  });

  it("evoked Mulldrifter: a grey beam from the stack card to Bob's own graveyard tile", () => {
    const { data } = boardOf({
      stack: [spell("stack:4", "Mulldrifter", 2, { extra: ["evoked"] })],
    });
    const c = render(draw(data)).container;
    const [beam] = beams(c);
    expect(beam!.dataset.to).toBe("pile:2:graveyard");
    expect(beam!.querySelector('[data-tone="grey"]')).toBeTruthy();
    const end = beam!.dataset.end!.split(",").map(Number);
    const tile = anchors(geometry(size))["opponent:graveyard"];
    expect(Math.hypot(end[0]! - tile.x, end[1]! - tile.y)).toBeLessThan(60);
  });
});

// --- item 5 (the Board's half) ---------------------------------------------------------------------

describe("item 5 · a target in a graveyard: the beam to the tile, the card peeking out", () => {
  const wurm: PiledCard = {
    id: "card:28",
    seat: 1,
    zone: "graveyard",
    name: "Craw Wurm",
    art: "wurm",
    faceDown: false,
    look: "creature",
  };
  const reanimate = (seat: number) =>
    boardOf(
      {
        graveyard: [row("card:28", 1, "Craw Wurm")],
        stack: [spell("stack:4", "Reanimate", 2, { targets: [{ object: "card:28" }] })],
      },
      seat,
    );

  for (const seat of [1, 2])
    it(`seat ${seat}: the beam ends on the peek card at its tile; the card wears the corners`, () => {
      const { data } = reanimate(seat);
      const c = render(draw(data, seat, new Map([[wurm.id, wurm]]))).container;
      const [beam] = beams(c);
      expect(beam!.dataset.to).toBe("card:28");
      const peek = c.querySelector<HTMLElement>('[data-peek-of="card:28"]')!;
      expect(peek).toBeTruthy();
      expect(peek.querySelector('[data-sight="true"]')).toBeTruthy();
      const g = geometry(size);
      const tile = anchors(g)[`${seat === 1 ? "viewer" : "opponent"}:graveyard`];
      const box = peekBox(tile, g);
      const end = beam!.dataset.end!.split(",").map(Number);
      expect(Math.abs(end[0]! - (box.x + box.w / 2))).toBeLessThan(2);
      expect(end[1]!).toBeLessThan(box.y);
      // 0.8 of a table card, its name readable (the canvas's PEEK, owner 2026-11-18).
      expect(parseFloat(peek.style.height)).toBeCloseTo(g.cardH * 0.8, 0);
      // On the table, not under the rail: wholly left of it, at the tile's height.
      expect(box.x + box.w).toBeLessThanOrEqual(g.rail.x);
      expect(box.y).toBeLessThan(tile.y);
      expect(box.y + box.h).toBeGreaterThan(tile.y);
      // It rises out of the tile (never pops in): its first frame is at the tile.
      const rise = clocks.find((k) => k.element === peek);
      expect(rise).toBeTruthy();
    });

  it("a face-down exiled card: the beam ends on the tile, no peek card", () => {
    const { data } = boardOf({
      exile: [row("card:28", 1, "Face-down", { faceDown: true, known: false })],
      stack: [spell("stack:4", "Some Spell", 2, { targets: [{ object: "card:28" }] })],
    });
    const hidden = { ...wurm, zone: "exile" as const, faceDown: true };
    const c = render(draw(data, 1, new Map([[hidden.id, hidden]]))).container;
    expect(beams(c)).toHaveLength(1);
    expect(c.querySelector("[data-peek-of]")).toBeNull();
  });
});

// --- F-0100-E ------------------------------------------------------------------------------------

describe("F-0100-E · whose beam, a beam that swings, pointing lifts", () => {
  it("Bob's Murder is blue-violet with blue-violet corners; Alice's Bolt is gold with a glint", () => {
    const { data } = boardOf({
      stack: [
        spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: GOBLIN.id }] }),
        spell("stack:4", "Murder", 2, { targets: [{ object: BEARS.id }] }),
      ],
    });
    const c = render(draw(data)).container;
    // The front (Alice's Bolt) shows: gold, a glint, gold corners on the Goblin.
    expect(beams(c)[0]!.querySelector('[data-tone="mine"]')).toBeTruthy();
    expect(beams(c)[0]!.querySelector('[data-glint="true"]')).toBeTruthy();
    expect(
      slotOf(c, GOBLIN.id).querySelector("[data-sight-tone]")!.getAttribute("data-sight-tone"),
    ).toBe("mine");
    // Point at Bob's Murder: blue-violet, motes, blue-violet corners on the Bears.
    const murder = c.querySelector<HTMLElement>('[data-object-id="stack:4"]')!;
    fireEvent.pointerEnter(murder);
    const [beam] = beams(c);
    expect(beam!.dataset.from).toBe("stack:4");
    expect(beam!.querySelector('[data-tone="theirs"]')).toBeTruthy();
    expect(beam!.querySelector('[data-motes="true"]')).toBeTruthy();
    expect(beam!.querySelector(".bf-beam-body")!.getAttribute("stroke")).toBe("#8f9cff");
    expect(
      slotOf(c, BEARS.id).querySelector("[data-sight-tone]")!.getAttribute("data-sight-tone"),
    ).toBe("theirs");
  });

  it("with motion turned down: no glint and no motes", () => {
    still = true;
    const { data } = boardOf({
      stack: [spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: GOBLIN.id }] })],
    });
    const c = render(draw(data)).container;
    expect(c.querySelector("[data-glint]")).toBeNull();
  });

  it("Spellskite takes the Bolt: one beam element swings to Spellskite, the corners ride it, then land", () => {
    const bolt = (target: string) =>
      boardOf({
        stack: [spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: target }] })],
      });
    const view = render(draw(bolt(GOBLIN.id).data));
    const before = beams(view.container);
    expect(before).toHaveLength(1);
    expect(before[0]!.dataset.to).toBe(GOBLIN.id);
    view.rerender(draw(bolt(SKITE.id).data));
    const after = beams(view.container);
    expect(after).toHaveLength(1);
    // The same element, not a leave-and-redraw.
    expect(after[0]).toBe(before[0]);
    expect(after[0]!.dataset.to).toBe(SKITE.id);
    const swing = after[0]!.querySelector<SVGGElement>("[data-swing]")!;
    expect(swing).toBeTruthy();
    // The corners ride the beam's end: none on Spellskite until it lands.
    expect(after[0]!.querySelector(".bf-swing-sight")).toBeTruthy();
    expect(slotOf(view.container, SKITE.id).querySelector('[data-sight="true"]')).toBeNull();
    expect(view.container.querySelector("[data-line-leaving]")).toBeNull();
    // Its clock is a Web Animation of SWING_MS (a click hurries it); it lands.
    const clock = clocks.find((k) => k.element === swing)!;
    expect(Number(clock.options.duration)).toBe(400);
    act(() => (clock.animation.onfinish as unknown as () => void)());
    expect(slotOf(view.container, SKITE.id).querySelector('[data-sight="true"]')).toBeTruthy();
    expect(beams(view.container)[0]).toBe(before[0]);
    expect(beams(view.container)[0]!.querySelector("[data-swing]")).toBeNull();
  });

  it("the Bolt under Spellskite's ability (its beam not shown): when the ability resolves, it swings from the Goblin", () => {
    const ability = {
      id: "stack:6",
      kind: "ability",
      source: SKITE.id,
      controller: 2,
      name: "Spellskite",
      description: "Change a target of target spell or ability to Spellskite.",
      targets: [{ object: "stack:5" }],
    };
    const under = boardOf({
      stack: [ability, spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: GOBLIN.id }] })],
    });
    const view = render(draw(under.data));
    // Only the ability's beam shows (to the Bolt).
    expect(beams(view.container).map((b) => b.dataset.from)).toEqual(["stack:6"]);
    const after = boardOf({
      stack: [spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: SKITE.id }] })],
    });
    view.rerender(draw(after.data));
    const [bolt] = beams(view.container);
    expect(bolt!.dataset.to).toBe(SKITE.id);
    expect(bolt!.querySelector("[data-swing]")).toBeTruthy();
  });

  it("the Bolt's new target arrives while the ability is still in front: it swings once the Bolt's beam shows", () => {
    // The real game (F-0100-G): a board with the Bolt already aiming at
    // Spellskite while Spellskite's ability is still in front of it, then the
    // ability gone. The Bolt's beam was never drawn at Spellskite before.
    const ability = {
      id: "stack:6",
      kind: "ability",
      source: SKITE.id,
      controller: 2,
      name: "Spellskite",
      description: "Change a target of target spell or ability to Spellskite.",
      targets: [{ object: "stack:5" }],
    };
    const bolt = (target: string) =>
      spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: target }] });
    const view = render(draw(boardOf({ stack: [bolt(GOBLIN.id)] }).data));
    view.rerender(draw(boardOf({ stack: [ability, bolt(GOBLIN.id)] }).data));
    view.rerender(draw(boardOf({ stack: [ability, bolt(SKITE.id)] }).data));
    // The Bolt's beam is not drawn while the ability is in front.
    expect(beams(view.container).some((b) => b.dataset.from === "stack:5")).toBe(false);
    view.rerender(draw(boardOf({ stack: [bolt(SKITE.id)] }).data));
    const [line] = beams(view.container);
    expect(line!.dataset.to).toBe(SKITE.id);
    expect(line!.querySelector("[data-swing]")).toBeTruthy();
  });

  it("with motion turned down: no swing; the beam simply points at the new target", () => {
    still = true;
    const bolt = (target: string) =>
      boardOf({
        stack: [spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: target }] })],
      });
    const view = render(draw(bolt(GOBLIN.id).data));
    view.rerender(draw(bolt(SKITE.id).data));
    expect(view.container.querySelector("[data-swing]")).toBeNull();
    expect(beams(view.container)[0]!.dataset.to).toBe(SKITE.id);
  });

  it("pointing at the Kavu's trigger lifts the Kavu (source) and the Angel (target); nothing dims", () => {
    const { data } = boardOf({
      stack: [
        spell("stack:5", "Lightning Bolt", 1, { targets: [{ object: KAVU.id }] }),
        {
          id: "stack:4",
          kind: "trigger",
          source: KAVU.id,
          controller: 2,
          name: "Flametongue Kavu",
          description: "Flametongue Kavu deals 4 damage to target creature.",
          targets: [{ object: ANGEL.id }],
        },
      ],
    });
    const c = render(draw(data)).container;
    const look = () =>
      [...c.querySelectorAll<HTMLElement>(".bf-slot, .bf-card")].map((el) => [
        el.style.opacity,
        el.style.filter,
        el.className.includes("faded"),
        el.className.includes("bf-dim") && !el.className.includes("bf-dim-"),
      ]);
    const was = look();
    expect(c.querySelector("[data-lifted]")).toBeNull();
    fireEvent.pointerEnter(c.querySelector<HTMLElement>('[data-object-id="stack:4"]')!);
    const lifted = [...c.querySelectorAll<HTMLElement>('[data-lifted="true"]')].map(
      (el) => el.dataset.objectId,
    );
    expect(lifted.sort()).toEqual([ANGEL.id, KAVU.id].sort());
    expect(c.querySelector(`[data-object-id="${ANGEL.id}"]`)!.className).toContain("bf-lifted");
    // Nothing dims: no card's opacity or filter changed, no stack card faded.
    expect(look()).toEqual(was);
    expect(c.querySelector(".bf-stack-faded")).toBeNull();
    // Point at the Bolt: the lift moves to its target, the Kavu.
    fireEvent.pointerEnter(c.querySelector<HTMLElement>('[data-object-id="stack:5"]')!);
    expect(
      [...c.querySelectorAll<HTMLElement>('[data-lifted="true"]')].map((el) => el.dataset.objectId),
    ).toEqual([KAVU.id]);
  });

  it("a spell cast from a hand has no source on the table: only its targets lift", () => {
    const { data } = boardOf({
      stack: [spell("stack:5", "Lightning Bolt", 2, { targets: [{ object: OGRE.id }] })],
    });
    const c = render(draw(data)).container;
    fireEvent.pointerEnter(c.querySelector<HTMLElement>('[data-object-id="stack:5"]')!);
    expect(
      [...c.querySelectorAll<HTMLElement>('[data-lifted="true"]')].map((el) => el.dataset.objectId),
    ).toEqual([OGRE.id]);
  });
});

// The parser: an older worker sends none of the new fields, and the page draws today's look.
describe("an older worker: no new fields, today's look", () => {
  it("no medallion, no modes, single gold beams", () => {
    const { data } = boardOf({
      stack: [spell("stack:4", "Lightning Bolt", 2, { targets: [{ object: OGRE.id }] })],
    });
    const s: StackView = data.stack[0]!;
    expect(s.x).toBeUndefined();
    expect(s.modes).toBeUndefined();
    expect(s.extra).toBeUndefined();
    expect(s.shares).toBeUndefined();
    const c = render(draw(data)).container;
    expect(c.querySelector(".bf-xmed, .bf-modes, [data-share], [data-doubled]")).toBeNull();
  });
});
