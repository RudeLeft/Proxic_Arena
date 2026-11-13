// @vitest-environment jsdom

// Spec 0079 -- creature copies, copied spells, and spells that fizzle
// (F-0079-A..E; owner on the canvas copies-1112: Q1 A, Q2 A, Q3 B, Q4 A, and
// the HELD SPOT). The real Board, handed one board and then the next, as the
// game screen hands them: a copy's `copy` / `copyOf` from the game, a stack
// copy's `copyOf` entry, and the spells that fizzled (from the round's
// moves, "fizzled").

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type StackView } from "./Board";
import { RevealTray } from "./RevealTray";
import { anchors, FLIP_MS, MOVE_MS } from "./motion";
import { geometry } from "./layout";
import {
  COPY_FLIP_AT,
  COPY_GHOST_MS,
  COPY_GHOST_OPACITY,
  COPY_MARK_AT,
  FIZZLE_GREY_AT,
  FIZZLE_MS,
  NO_HELD,
  PEEL_IN_MS,
  PEEL_IN_OPACITY,
  nextHeld,
} from "./copies";
import { EMPTY_MATCH, reduceMatch, type Snapshot, type SnapshotReveal } from "../match";
import { boardFromSnapshot } from "./fromSnapshot";

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
const spell = (
  id: string,
  name: string,
  seat: number,
  cardId: string,
  extra: Partial<StackView> = {},
): StackView => ({
  id,
  name,
  kind: "spell",
  source: null,
  targets: [],
  seat,
  card: cardId,
  ...extra,
});

function draw(
  battlefield: BoardCard[],
  extra: {
    stack?: StackView[];
    fizzled?: Set<string>;
    returns?: Map<
      string,
      { zone: "hand" | "library"; side: "viewer" | "opponent"; where: null; hidden: boolean }
    >;
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
      returns={extra.returns ?? new Map()}
      graves={new Map()}
      tileMoves={[]}
      countered={new Set()}
      fizzled={extra.fizzled ?? new Set()}
      stack={extra.stack ?? []}
      combat={null}
      damage={null}
    />
  );
}

const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
const ghostsOf = (container: HTMLElement, id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-ghost-of="${id}"]`),
];
const runOf = (element: Element) => calls.filter((c) => c.element === element).at(-1);
const runsOf = (element: Element) => calls.filter((c) => c.element === element);
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
/** The centre of a drawn element, from its own (non-animated) transform. */
function restCentre(el: HTMLElement) {
  return centre(el.style.transform, el.style.transformOrigin || "0px 0px");
}
/** The frame at `ms` of a run (the last frame at or before it). */
function frameAt(run: Call, ms: number): Keyframe {
  const total = Number(run.options.duration);
  let out = run.frames[0]!;
  for (const f of run.frames) if (Number(f.offset) * total <= ms + 1e-6) out = f;
  return out;
}

// --- F-0079-A · Clone, and a token copy ---------------------------------------------

describe("F-0079-A · a creature copy: the ghost lifts off the original; a token copy sparks from it", () => {
  const angel = card("card:52", 2, "Serra Angel", { power: 4, toughness: 4 });
  const clone = spell("stack:3", "Clone", 1, "card:61");

  it("Clone of Bob's Serra Angel: glides as Clone, the Angel's ghost lands on it, it flips, the mark grows", () => {
    const view = render(draw([angel], { stack: [clone] }));
    calls.length = 0;
    const copied = card("card:61", 1, "Serra Angel", {
      power: 4,
      toughness: 4,
      sick: true,
      copy: true,
      copyOf: angel.id,
    });
    view.rerender(draw([angel, copied], { stack: [] }));
    // Clone as it was on the stack, gliding to its place, then flipping away.
    const own = ghostsOf(view.container, "card:61")[0]!;
    expect(own).toBeTruthy();
    const glide = runOf(own)!;
    const flipAt = delayOf(glide) + COPY_FLIP_AT;
    const turn = calls.find((c) => own.contains(c.element) && c.element !== own)!;
    expect(delayOf(turn)).toBe(flipAt);
    expect(Number(turn.options.duration)).toBe(FLIP_MS);
    // The see-through Angel lifts off Bob's Angel and lands on the Clone.
    const ghost = ghostsOf(view.container, "copy:card:61")[0]!;
    const run = runOf(ghost)!;
    expect(Number(run.options.duration)).toBe(COPY_GHOST_MS);
    expect(Number(run.frames[0]!.opacity)).toBeCloseTo(COPY_GHOST_OPACITY);
    const from = centre(String(run.frames[0]!.transform), ghost.style.transformOrigin);
    const angelSlot = slotOf(view.container, angel.id);
    expect(near(from, restCentre(angelSlot), 3)).toBe(true);
    const landed = centre(
      String(frameAt(run, COPY_FLIP_AT).transform),
      ghost.style.transformOrigin,
    );
    expect(near(landed, restCentre(slotOf(view.container, "card:61")), 3)).toBe(true);
    // The Clone's own card turns round (A-09) at the same moment, unseen till then.
    const face = slotOf(view.container, "card:61").querySelector(":scope > .bf-card")!;
    expect(runsOf(face).some((c) => delayOf(c) === flipAt && c.options.fill === "backwards")).toBe(
      true,
    );
    // The gold copy mark is on it, and grows in once the flip has settled.
    const mark = slotOf(view.container, "card:61").querySelector(".bf-mark-copy")!;
    expect(mark).toBeTruthy();
    expect(delayOf(runOf(mark)!)).toBe(flipAt + (COPY_MARK_AT - COPY_FLIP_AT));
    // Bob's Angel glows while its ghost lifts off; it is not a copy.
    const glow = runOf(angelSlot.querySelector(":scope > .bf-card")!)!;
    expect(String(glow.frames[2]!.filter)).toMatch(/drop-shadow/);
    expect(angelSlot.querySelector(".bf-mark-copy")).toBeNull();
  });

  it("Cackling Counterpart: the token sparks out of the Angel it copies and glides aside", () => {
    const mine = card("card:30", 1, "Serra Angel", { power: 4, toughness: 4 });
    const view = render(
      draw([mine], { stack: [spell("stack:4", "Cackling Counterpart", 1, "card:70")] }),
    );
    calls.length = 0;
    const token = card("card:90", 1, "Serra Angel", {
      power: 4,
      toughness: 4,
      token: true,
      sick: true,
      copy: true,
      copyOf: mine.id,
    });
    view.rerender(draw([mine, token], { stack: [] }));
    const angelAt = restCentre(slotOf(view.container, mine.id));
    const spark = view.container.querySelector<HTMLElement>(`[data-spark="card:90"]`)!;
    expect(
      near({ x: parseFloat(spark.style.left), y: parseFloat(spark.style.top) }, angelAt, 3),
    ).toBe(true);
    // It grows out of the Angel (not the stack) and glides to its own place.
    const slot = slotOf(view.container, "card:90");
    const grow = runOf(slot)!;
    const start = centre(String(grow.frames[0]!.transform), slot.style.transformOrigin);
    expect(near(start, angelAt, 3)).toBe(true);
    expect(slot.querySelector(".bf-mark-copy")).toBeTruthy();
  });
});

// --- F-0079-B · Fork ----------------------------------------------------------------

describe("F-0079-B · a copied spell peels off the original; done, it breaks into motes", () => {
  const bolt = spell("stack:7", "Lightning Bolt", 2, "card:52", { targets: [{ player: 1 }] });
  const copy = spell("stack:9", "Lightning Bolt", 1, "card:121", {
    targets: [{ player: 2 }],
    copy: true,
    copyOf: bolt.id,
  });

  it("Fork's copy lifts off Bob's Bolt see-through, settles in front, the mark on it", () => {
    const view = render(draw([], { stack: [bolt] }));
    calls.length = 0;
    view.rerender(draw([], { stack: [copy, bolt] }));
    const slot = view.container.querySelector<HTMLElement>(
      `[data-object-id="${copy.id}"]`,
    )!.parentElement!;
    const run = runOf(slot)!;
    expect(Number(run.options.duration)).toBe(PEEL_IN_MS);
    expect(Number(run.frames[0]!.opacity)).toBeCloseTo(PEEL_IN_OPACITY);
    expect(Number(run.frames.at(-1)!.opacity)).toBeCloseTo(1);
    // From the Bolt's card (now second), to its own place in front.
    const boltSlot = view.container.querySelector<HTMLElement>(
      `[data-object-id="${bolt.id}"]`,
    )!.parentElement!;
    const [, bx, by, bs] = /translate3d\(([-\d.]+)px, ([-\d.]+)px, 0(?:px)?\) scale\(([-\d.]+)\)/
      .exec(boltSlot.style.transform)!
      .map(Number);
    const boltAt = { x: bx! + (g.cardW * bs!) / 2, y: by! + (g.cardH * bs!) / 2 };
    expect(near(centre(String(run.frames[0]!.transform), "0px 0px"), boltAt, 2)).toBe(true);
    const [, sx, sy, ss] = /translate3d\(([-\d.]+)px, ([-\d.]+)px, 0(?:px)?\) scale\(([-\d.]+)\)/
      .exec(slot.style.transform)!
      .map(Number);
    const ownAt = { x: sx! + (g.cardW * ss!) / 2, y: sy! + (g.cardH * ss!) / 2 };
    expect(near(centre(String(run.frames.at(-1)!.transform), "0px 0px"), ownAt, 2)).toBe(true);
    expect(near(boltAt, ownAt, 10)).toBe(false);
    expect(slot.style.animation).toBe("none");
    expect(slot.querySelector(".bf-copy-on-stack")).toBeTruthy();
    expect(slot.querySelector("button")!.getAttribute("aria-label")).toMatch(
      /^a copy of Lightning Bolt/,
    );
  });

  it("the copy resolves: it glows, then breaks into gold motes where it is -- no graveyard", () => {
    const view = render(draw([], { stack: [copy, bolt] }));
    calls.length = 0;
    view.rerender(draw([], { stack: [bolt] }));
    const ghost = ghostsOf(view.container, copy.id)[0]!;
    expect(ghost.dataset.copyEnd).toBe("true");
    expect(ghost.querySelectorAll(".bf-mote-gold").length).toBeGreaterThan(0);
    const run = runOf(ghost)!;
    const first = centre(String(run.frames[0]!.transform), ghost.style.transformOrigin);
    const last = centre(String(run.frames.at(-1)!.transform), ghost.style.transformOrigin);
    expect(near(first, last, 2)).toBe(true);
    expect(near(last, where["viewer:graveyard"], 40)).toBe(false);
    expect(Number(run.frames.at(-1)!.opacity)).toBeCloseTo(0);
    expect(ghost.style.getPropertyValue("--fx-delay")).toBe(`${RESOLVE_MS}ms`);
  });
});

// --- F-0079-C · storm ---------------------------------------------------------------

describe("F-0079-C · storm: one copy card xN, ticking", () => {
  const grape = spell("stack:7", "Grapeshot", 1, "card:36", { targets: [{ player: 2 }] });
  const copies = [9, 10, 11, 12].map((n) =>
    spell(`stack:${n}`, "Grapeshot", 1, `card:${130 - n}`, {
      targets: [{ player: 2 }],
      copy: true,
      copyOf: grape.id,
    }),
  );
  const group = (list: StackView[]): StackView => ({
    ...list[0]!,
    ...(list.length > 1 ? { count: list.length, members: list.map((s) => s.id) } : {}),
  });

  it("the game's four copies are one card x4 (fromSnapshot), aimed at the same thing", () => {
    const snap = (rev: number, stack: unknown[]): Snapshot =>
      reduceMatch(EMPTY_MATCH, {
        type: "MATCH_SNAPSHOT",
        state: {
          stateRevision: rev,
          gameEpoch: 1,
          turn: 3,
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
          stack,
        },
      }).board!;
    const entry = (id: string, source: string, copy: boolean, target: unknown) => ({
      id,
      description: "Grapeshot deals 1 damage to Bob.",
      source,
      name: "Grapeshot",
      controller: 1,
      kind: "spell",
      targets: [target],
      ...(copy ? { copy: true, copyOf: "stack:7" } : {}),
    });
    const four = [9, 10, 11, 12].map((n) =>
      entry(`stack:${n}`, `card:${130 - n}`, true, { player: 2 }),
    );
    const data = boardFromSnapshot(
      snap(2, [...four, entry("stack:7", "card:36", false, { player: 2 })]),
      null,
    );
    expect(data.stack.map((s) => [s.id, s.count ?? 1, s.copy ?? false])).toEqual([
      ["stack:9", 4, true],
      ["stack:7", 1, false],
    ]);
    expect(data.stack[0]!.members).toEqual(["stack:9", "stack:10", "stack:11", "stack:12"]);
    // Aimed at different things: separate cards.
    const apart = boardFromSnapshot(
      snap(3, [
        entry("stack:9", "card:121", true, { player: 2 }),
        entry("stack:10", "card:120", true, { player: 1 }),
      ]),
      null,
    );
    expect(apart.stack.length).toBe(2);
  });

  it("x4 peels in from the Grapeshot one after another and counts up; each resolving one breaks off", () => {
    const view = render(draw([], { stack: [grape] }));
    calls.length = 0;
    view.rerender(draw([], { stack: [group(copies), grape] }));
    // One copy card on the stack (and the original), the number says 4.
    expect(view.container.querySelectorAll('[data-zone="stack"][data-copy="true"]').length).toBe(1);
    const lead = view.container.querySelector<HTMLElement>(
      '[data-zone="stack"][data-copy="true"]',
    )!;
    expect(lead.dataset.count).toBe("4");
    // The other three peel onto it, 150 ms apart, each its own see-through card.
    const peels = [
      ...view.container.querySelectorAll<HTMLElement>('[data-ghost-of^="peel:stack:9:"]'),
    ];
    expect(peels.length).toBe(3);
    expect(peels.map((p) => delayOf(runOf(p)!))).toEqual([150, 300, 450]);
    // The number ticks: held copies of the earlier numbers (x2, x3) while they land.
    const held = [...lead.parentElement!.querySelectorAll<HTMLElement>(".bf-stack-many-was")].map(
      (h) => h.dataset.manyWas,
    );
    expect(held).toEqual(["2", "3"]);
    // The first resolves: x3, the same card (no slide-in), the resolved one in gold motes.
    calls.length = 0;
    view.rerender(draw([], { stack: [group(copies.slice(1)), grape] }));
    const next = view.container.querySelector<HTMLElement>(
      '[data-zone="stack"][data-copy="true"]',
    )!;
    expect(next.dataset.count).toBe("3");
    expect(next.parentElement!.style.animation).toBe("none");
    expect(runOf(next.parentElement!)).toBeUndefined();
    expect(ghostsOf(view.container, "stack:9")[0]!.dataset.copyEnd).toBe("true");
  });
});

// --- F-0079-D · the fizzle and the held spot ----------------------------------------

describe("F-0079-D · Bolt at the Bears, Unsummoned: the held spot, nothing found, smoke", () => {
  const merfolk = card("card:10", 2, "Merfolk of the Pearl Trident", { power: 1, toughness: 1 });
  const bears = card("card:11", 2, "Grizzly Bears");
  const wizard = card("card:12", 2, "Fugitive Wizard", { power: 1, toughness: 1 });
  const aimed = spell("stack:5", "Lightning Bolt", 1, "card:29", {
    targets: [{ object: bears.id }],
  });
  // Once the Bears are in Bob's hand the game no longer names them as the target.
  const blind = { ...aimed, targets: [] };
  const back = new Map([
    [bears.id, { zone: "hand" as const, side: "opponent" as const, where: null, hidden: true }],
  ]);

  it("the Bears go back to Bob's hand: their place is held, and the Wizard does not slide in", () => {
    const view = render(draw([merfolk, bears, wizard], { stack: [aimed] }));
    const wasBears = restCentre(slotOf(view.container, bears.id));
    const wasWizard = slotOf(view.container, wizard.id).style.transform;
    calls.length = 0;
    view.rerender(draw([merfolk, wizard], { stack: [blind], returns: back }));
    const held = view.container.querySelector<HTMLElement>(`[data-held="${bears.id}"]`)!;
    expect(held).toBeTruthy();
    expect(held.textContent).toBe("Grizzly Bears");
    expect(near(restCentre(held.closest(".bf-slot") as HTMLElement), wasBears, 1)).toBe(true);
    // The neighbour stays put: same place, no glide.
    const wizardSlot = slotOf(view.container, wizard.id);
    expect(wizardSlot.style.transform).toBe(wasWizard);
    expect(runOf(wizardSlot)).toBeUndefined();
    // Nothing to click there.
    expect(held.closest(".bf-slot")!.querySelector("button")).toBeNull();
  });

  it("the Bolt fizzles: its beam reaches the held spot, finds nothing, smoke -- then the gap closes", () => {
    const view = render(draw([merfolk, bears, wizard], { stack: [aimed] }));
    view.rerender(draw([merfolk, wizard], { stack: [blind], returns: back }));
    const wasWizard = slotOf(view.container, wizard.id).style.transform;
    calls.length = 0;
    view.rerender(draw([merfolk, wizard], { stack: [], fizzled: new Set(["card:29"]) }));
    // The beam and the ring that finds nothing, at the held spot.
    const fizzle = view.container.querySelector<SVGElement>('[data-fizzle-of="card:29"]')!;
    expect(fizzle).toBeTruthy();
    const ring = fizzle.querySelector("circle")!;
    const heldSlot = view.container
      .querySelector<HTMLElement>(`[data-held="${bears.id}"]`)!
      .closest(".bf-slot") as HTMLElement;
    const spot = restCentre(heldSlot);
    expect(Math.abs(Number(ring.getAttribute("cx")) - spot.x)).toBeLessThan(2);
    // The Bolt: no resolve spark; grey, see-through, smoke, then to Alice's graveyard.
    expect(view.container.querySelector('[data-spark="card:11"]')).toBeNull();
    const ghost = ghostsOf(view.container, aimed.id)[0]!;
    expect(ghost.dataset.fizzled).toBe("true");
    expect(ghost.querySelectorAll(".bf-mote-smoke").length).toBeGreaterThan(0);
    const run = runOf(ghost)!;
    expect(Number(run.options.duration)).toBe(FIZZLE_MS);
    expect(String(frameAt(run, FIZZLE_GREY_AT + 700).filter)).toMatch(/grayscale/);
    const last = centre(String(run.frames.at(-1)!.transform), ghost.style.transformOrigin);
    expect(near(last, where["viewer:graveyard"], 3)).toBe(true);
    // Still held while the fizzle plays: the Wizard waits.
    expect(slotOf(view.container, wizard.id).style.transform).toBe(wasWizard);
    // The outline breaks up; when it has, the spot goes and the Wizard glides over.
    const outline = heldSlot.querySelector<HTMLElement>(".bf-held")!;
    const breaks = runOf(outline)!;
    calls.length = 0;
    (breaks.animation as unknown as { onfinish: () => void }).onfinish();
    view.rerender(draw([merfolk, wizard], { stack: [], fizzled: new Set(["card:29"]) }));
    expect(view.container.querySelector(`[data-held="${bears.id}"]`)).toBeNull();
    const moved = slotOf(view.container, wizard.id);
    expect(moved.style.transform).not.toBe(wasWizard);
    expect(Number(runOf(moved)!.options.duration)).toBe(MOVE_MS);
  });

  it("both players' report window says it did nothing, and where the Bears are now", () => {
    const report = (said: string, where: string): SnapshotReveal => ({
      key: "action:2",
      title: "",
      said,
      by: 1,
      source: "Lightning Bolt",
      cards: [
        { ...face("action:2:0", "Lightning Bolt"), to: "graveyard" },
        { ...face("action:2:1", "Grizzly Bears"), toSaid: where },
      ],
    });
    for (const [said, at] of [
      ["Your Lightning Bolt did nothing: its target was gone.", "in Bob's hand"],
      ["Alice's Lightning Bolt did nothing: its target was gone.", "in your hand"],
    ] as const) {
      const c = render(
        <RevealTray
          reveal={report(said, at)}
          geometry={g}
          atTop={false}
          artUrl={(a) => a}
          onClose={vi.fn()}
        />,
      ).container;
      expect(c.querySelector(".gs-reveal")!.getAttribute("aria-label")).toBe(said);
      expect([...c.querySelectorAll(".gs-reveal-to")].map((e) => e.textContent)).toEqual([
        "→ graveyard",
        at,
      ]);
    }
  });
});

function face(id: string, name: string) {
  return {
    id,
    seat: 1,
    name,
    tapped: false,
    faceDown: false,
    known: true,
    kind: "creature",
    types: "",
    power: null,
    toughness: null,
    manaCost: null,
    damage: 0,
    sick: false,
    attacking: false,
    blocking: false,
    counters: [],
    keywords: [],
    attachedTo: null,
    ringBearer: false,
    sector: null,
    sprocket: null,
    enteredAt: null,
    token: false,
    art: null,
  };
}

// --- F-0079-E · hurry, reduce motion, hidden information -----------------------------

describe("F-0079-E · a click hurries it; reduce motion; nothing hidden is shown", () => {
  const angel = card("card:52", 2, "Serra Angel", { power: 4, toughness: 4 });

  it("a click hurries every copy and fizzle animation to a tenth of a second", () => {
    const view = render(draw([angel], { stack: [spell("stack:3", "Clone", 1, "card:61")] }));
    calls.length = 0;
    view.rerender(
      draw([angel, card("card:61", 1, "Serra Angel", { copy: true, copyOf: angel.id })], {
        stack: [],
      }),
    );
    const ghost = ghostsOf(view.container, "copy:card:61")[0]!;
    fireEvent.pointerDown(document.body);
    expect(runOf(ghost)!.rate.length).toBeGreaterThan(0);
  });

  it("reduce motion: no glide or flip, the copy mark and the held outline still show", () => {
    still = true;
    const view = render(draw([angel], { stack: [spell("stack:3", "Clone", 1, "card:61")] }));
    calls.length = 0;
    view.rerender(
      draw([card("card:61", 1, "Serra Angel", { copy: true, copyOf: angel.id })], {
        stack: [
          spell("stack:8", "Lightning Bolt", 2, "card:77", { targets: [{ object: angel.id }] }),
        ],
      }),
    );
    expect(ghostsOf(view.container, "copy:card:61")).toEqual([]);
    expect(calls.filter((c) => c.element.closest?.(".bf-slot"))).toEqual([]);
    expect(slotOf(view.container, "card:61").querySelector(".bf-mark-copy")).toBeTruthy();
    // Bob's Angel left while Bob's own Bolt still aims at it: held.
    expect(view.container.querySelector(`[data-held="${angel.id}"]`)).toBeTruthy();
  });

  it("a face-down card's held spot names nothing; a copy of a card out of sight is still marked", () => {
    const down = card("card:40", 2, "Face-down", {
      faceDown: true,
      known: false,
      name: "Face-down",
    });
    const view = render(
      draw([down], {
        stack: [spell("stack:2", "Shock", 1, "card:5", { targets: [{ object: down.id }] })],
      }),
    );
    view.rerender(draw([], { stack: [spell("stack:2", "Shock", 1, "card:5")] }));
    const held = view.container.querySelector<HTMLElement>(`[data-held="${down.id}"]`)!;
    expect(held).toBeTruthy();
    expect(held.textContent).toBe("");
    // The memory itself: a spot is held only for a card that was on the table.
    const memory = nextHeld(
      NO_HELD,
      [],
      [spell("stack:2", "Shock", 1, "card:5", { targets: [{ object: "card:99" }] })],
      0,
      new Set(),
      0,
    );
    expect(memory.held.size).toBe(0);
    const copy = card("card:61", 1, "Serra Angel", { copy: true });
    const v2 = render(draw([copy]));
    expect(slotOf(v2.container, copy.id).querySelector(".bf-mark-copy")).toBeTruthy();
  });
});
