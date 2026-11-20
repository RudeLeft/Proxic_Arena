// @vitest-environment jsdom

// Spec 0099 (Q2a, Q2b, Q2c; F-0099-C, D, E) -- a creature leaving the table
// for a pile where it stands in the fan (spec 0099's Agent, sacrificed for
// Village Rites; Uro): its fan card is not drawn until the creature has landed
// on the tile, and rises only after; the tile's number waits for it too; a
// dying token (gone, never counted) does not change it. The real Board, handed
// one board and then the next, the plate's tiles in the rail.

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import { Board, type BoardCard, type StackView } from "./Board";
import { FAN_RISE_MS } from "./FanCards";
import { boardFromSnapshot } from "./fromSnapshot";
import { geometry } from "./layout";
import { anchors, type AnchorId } from "./motion";
import type { FanCard } from "./pileFan";
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

const fanOf = (c: BoardCard): FanCard => ({
  id: c.id,
  side: "viewer",
  zone: "graveyard",
  how: "ability",
  mine: true,
  name: c.name,
  kind: c.kind,
  types: c.types,
  power: c.power,
  toughness: c.toughness,
  manaCost: "{1}{B}",
  art: null,
  crop: null,
  faceDown: false,
  known: true,
  time: null,
  square: null,
  at: 0,
});

function draw(
  battlefield: BoardCard[],
  extra: {
    fans?: FanCard[];
    piles?: Set<string>;
    departures?: Map<string, AnchorId>;
    tiles: Record<string, number>;
    stack?: StackView[];
    countered?: Set<string>;
    fizzled?: Set<string>;
  },
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
      departures={extra.departures ?? new Map()}
      returns={new Map()}
      tileMoves={[]}
      countered={extra.countered ?? new Set()}
      fizzled={extra.fizzled ?? new Set()}
      stack={extra.stack ?? []}
      combat={null}
      damage={null}
      fans={extra.fans ?? []}
      pileCards={extra.piles ?? new Set()}
      rail={<Tiles n={extra.tiles} />}
    />
  );
}

const runsOf = (element: Element | null) => calls.filter((c) => c.element === element);
const runOf = (element: Element) => runsOf(element).at(-1);
const endOf = (c: Call) => Number(c.options.delay ?? 0) + Number(c.options.duration ?? 0);
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
/** The fan card's opacity at `t` ms: the last-made run in effect wins (WAAPI's order). */
function fanOpacityAt(el: Element, t: number): number {
  let out = 1;
  for (const run of runsOf(el)) {
    const delay = Number(run.options.delay ?? 0);
    const duration = Number(run.options.duration ?? 0);
    const held = t < delay && (run.options.fill === "backwards" || run.options.fill === "both");
    const active = t >= delay && t < delay + duration;
    if (!held && !active) continue;
    const frame = held || t === delay ? run.frames[0]! : run.frames.at(-1)!;
    if (frame.opacity !== undefined) out = Number(frame.opacity);
  }
  return out;
}

const AGENT = "card:107";
/** A creature with a use from its graveyard on the table, then in the graveyard, in the fan: Alice's page. (Never the real card's name: the Lab's check-agent-of-kotis.py proves the page names no card.) */
function agentDies() {
  const forest = card("card:1", 1, "Forest");
  const agent = card(AGENT, 1, "Grave Agent");
  const view = render(draw([forest, agent], { tiles: { "viewer:graveyard": 0 } }));
  calls.length = 0;
  view.rerender(
    draw([forest], {
      fans: [fanOf(agent)],
      piles: new Set([AGENT]),
      departures: new Map([[AGENT, "viewer:graveyard"]]),
      tiles: { "viewer:graveyard": 1 },
    }),
  );
  const c = view.container;
  const ghost = c.querySelector<HTMLElement>(`[data-ghost-of="${AGENT}"]`)!;
  const fan = c.querySelector<HTMLElement>(`[data-fan-card="${AGENT}"]`)!;
  return { c, ghost, fan };
}

describe("F-0099-C · D · the fan card waits for the creature to land, unseen", () => {
  it("the fan card rises only after the leaving creature has reached the tile", () => {
    const { ghost, fan } = agentDies();
    expect(ghost).toBeTruthy();
    expect(fan).toBeTruthy();
    const lands = Math.max(...runsOf(ghost).map(endOf));
    const rise = runsOf(fan).find((r) => r.options.duration === FAN_RISE_MS)!;
    expect(rise).toBeTruthy();
    expect(Number(rise.options.delay)).toBeGreaterThanOrEqual(lands);
  });

  it("nothing of it is drawn on the tile while it waits (no faint copy), then it rises", () => {
    const { ghost, fan } = agentDies();
    const lands = Math.max(...runsOf(ghost).map(endOf));
    const rise = runsOf(fan).find((r) => r.options.duration === FAN_RISE_MS)!;
    const starts = Number(rise.options.delay);
    for (const t of [0, 250, 600, lands - 1]) expect(fanOpacityAt(fan, t)).toBeLessThan(0.15);
    expect(fanOpacityAt(fan, starts)).toBeGreaterThan(0);
    expect(fanOpacityAt(fan, starts + FAN_RISE_MS + 1)).toBe(1);
  });
});

describe("F-0099-E · the Graveyard number waits for the card", () => {
  it("reads 0 until the Agent lands, then 1", () => {
    const { c, ghost } = agentDies();
    const lands = Math.max(...runsOf(ghost).map(endOf));
    expect(tileAt(c, "viewer:graveyard", 0)).toEqual(["0"]);
    expect(tileAt(c, "viewer:graveyard", lands - 50)).toEqual(["0"]);
    expect(tileAt(c, "viewer:graveyard", lands + 1)).toEqual(["1"]);
  });

  it("a dying token does not change it (gone, never counted), even beside a creature that does", () => {
    // Pestilence: a Zombie token and Grizzly Bears die together. The Bears
    // count (0 then 1 as they land); the token never does (never -1, never 2).
    const forest = card("card:1", 1, "Forest");
    const bears = card("card:8", 1, "Grizzly Bears");
    const token = card("card:300", 1, "Zombie", { token: true });
    const view = render(draw([forest, bears, token], { tiles: { "viewer:graveyard": 0 } }));
    calls.length = 0;
    view.rerender(
      draw([forest], {
        piles: new Set([bears.id]),
        departures: new Map([
          [bears.id, "viewer:graveyard"],
          [token.id, "viewer:graveyard"],
        ]),
        tiles: { "viewer:graveyard": 1 },
      }),
    );
    const c = view.container;
    const lands = Math.max(...runsOf(c.querySelector(`[data-ghost-of="${bears.id}"]`)).map(endOf));
    expect(tileAt(c, "viewer:graveyard", 0)).toEqual(["0"]);
    expect(tileAt(c, "viewer:graveyard", lands - 50)).toEqual(["0"]);
    expect(tileAt(c, "viewer:graveyard", lands + 1)).toEqual(["1"]);
    expect(tileAt(c, "viewer:graveyard", 5000)).toEqual(["1"]);
  });

  it("a token dying alone leaves the number alone", () => {
    const forest = card("card:1", 1, "Forest");
    const token = card("card:300", 1, "Zombie", { token: true });
    const view = render(draw([forest, token], { tiles: { "viewer:graveyard": 0 } }));
    calls.length = 0;
    view.rerender(
      draw([forest], {
        departures: new Map([[token.id, "viewer:graveyard"]]),
        tiles: { "viewer:graveyard": 0 },
      }),
    );
    for (const t of [0, 500, 1500])
      expect(tileAt(view.container, "viewer:graveyard", t)).toEqual(["0"]);
  });
});

// --- Amendment 1 (Q3): a spell's own number waits for the spell card --------

const g = geometry(size);
const where = anchors(g);
/** Where a transform (translate3d, rotate, scale(s) or scale(sx, sy)) puts a card's centre. */
function centre(transform: string, origin: string) {
  const m =
    /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\) rotate\(([-\d.e]+)deg\) scale\(([-\d.e]+)(?:, ([-\d.e]+))?\)/.exec(
      transform,
    )!;
  const [ox, oy] = origin.split(" ").map((v) => Number(v.replace("px", "")));
  const a = (Number(m[3]) * Math.PI) / 180;
  const sx = Number(m[4]);
  const sy = m[5] !== undefined ? Number(m[5]) : sx;
  const vx = (g.cardW / 2 - ox!) * sx;
  const vy = (g.cardH / 2 - oy!) * sy;
  return {
    x: ox! + Number(m[1]) + vx * Math.cos(a) - vy * Math.sin(a),
    y: oy! + Number(m[2]) + vx * Math.sin(a) + vy * Math.cos(a),
  };
}
/** Where a ghost's last frame (of its longest-running moving run) puts it. */
function endCentre(ghost: HTMLElement) {
  const run = runsOf(ghost)
    .filter((r) => r.frames.some((f) => typeof f.transform === "string"))
    .sort((a, b) => endOf(b) - endOf(a))[0]!;
  const last = [...run.frames].reverse().find((f) => typeof f.transform === "string")!;
  return centre(String(last.transform), ghost.style.transformOrigin);
}

const RITES = "card:100";
/** A sorcery on the stack, Alice's (never a real card's name). */
const rites = (extra: Partial<StackView> = {}): StackView => ({
  id: "stack:22",
  name: "Grave Rites",
  kind: "spell",
  source: null,
  targets: [],
  seat: 1,
  card: RITES,
  ...extra,
});
const ghostOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-ghost-of="${id}"]`)!;
const landsOf = (el: HTMLElement) => Math.max(...runsOf(el).map(endOf));
const nOf = (c: HTMLElement, tile: string) =>
  c.querySelector<HTMLElement>(`[data-zone-tile="${tile}"] .gs-zone-n:not(.gs-zone-was)`)!;

/** One board with the spell on the stack, the next with it gone to `to` (and in that pile). */
function resolves(to?: AnchorId, extra: { countered?: boolean; fizzled?: boolean } = {}) {
  const forest = card("card:1", 1, "Forest");
  const tiles0 = { "viewer:graveyard": 0, "viewer:exile": 0 };
  const view = render(draw([forest], { tiles: tiles0, stack: [rites()] }));
  calls.length = 0;
  const pile = to ?? "viewer:graveyard";
  view.rerender(
    draw([forest], {
      piles: new Set([RITES]),
      departures: new Map<string, AnchorId>(to ? [[RITES, to]] : []),
      tiles: { ...tiles0, [pile]: 1 },
      ...(extra.countered ? { countered: new Set([RITES]) } : {}),
      ...(extra.fizzled ? { fizzled: new Set([RITES]) } : {}),
    }),
  );
  return view.container;
}

describe("F-0099-H · a spell resolving alone: its graveyard number waits for it", () => {
  it("reads 0 until the spell's ghost has landed on the tile, then 1", () => {
    const c = resolves();
    const lands = landsOf(ghostOf(c, "stack:22"));
    expect(lands).toBeGreaterThan(500);
    for (const t of [0, 400, lands - 50]) expect(tileAt(c, "viewer:graveyard", t)).toEqual(["0"]);
    expect(tileAt(c, "viewer:graveyard", lands + 1)).toEqual(["1"]);
  });
});

describe("F-0099-I · two boards: the creature's change carries into the spell's board", () => {
  it("reads 0, then 1 as the creature lands, then 2 as the spell lands -- never early", () => {
    const forest = card("card:1", 1, "Forest");
    const agent = card(AGENT, 1, "Grave Agent");
    const tiles = (n: number) => ({ "viewer:graveyard": n });
    const view = render(draw([forest, agent], { tiles: tiles(0), stack: [rites()] }));
    calls.length = 0;
    // Board 57: the creature sacrificed (to the graveyard), the spell still on the stack.
    view.rerender(
      draw([forest], {
        stack: [rites()],
        piles: new Set([AGENT]),
        departures: new Map([[AGENT, "viewer:graveyard"]]),
        tiles: tiles(1),
      }),
    );
    const c = view.container;
    const agentLands = landsOf(ghostOf(c, AGENT));
    const first = runOf(nOf(c, "viewer:graveyard"))!;
    // Board 58 arrives 300 ms in, the creature still on its way.
    const elapsed = 300;
    (first.animation as unknown as { currentTime: number }).currentTime = elapsed;
    calls.length = 0;
    view.rerender(
      draw([forest], {
        piles: new Set([AGENT, RITES]),
        departures: new Map([[AGENT, "viewer:graveyard"]]),
        tiles: tiles(2),
      }),
    );
    const spellLands = landsOf(ghostOf(c, "stack:22"));
    const creature = agentLands - elapsed; // on board 58's clock
    expect(creature).toBeLessThan(spellLands);
    for (const t of [0, 200, creature - 20])
      expect(tileAt(c, "viewer:graveyard", t)).toEqual(["0"]);
    for (const t of [creature + 1, spellLands - 20])
      expect(tileAt(c, "viewer:graveyard", t)).toEqual(["1"]);
    expect(tileAt(c, "viewer:graveyard", spellLands + 1)).toEqual(["2"]);
  });

  it("a board whose numbers disagree (a reconnect) simply counts from the new number", () => {
    const forest = card("card:1", 1, "Forest");
    const agent = card(AGENT, 1, "Grave Agent");
    const view = render(
      draw([forest, agent], { tiles: { "viewer:graveyard": 0 }, stack: [rites()] }),
    );
    view.rerender(
      draw([forest], {
        stack: [rites()],
        piles: new Set([AGENT]),
        departures: new Map([[AGENT, "viewer:graveyard"]]),
        tiles: { "viewer:graveyard": 1 },
      }),
    );
    calls.length = 0;
    // The next board says 5 (cards that came with no animation): 4, then 5 as the spell lands.
    view.rerender(
      draw([forest], {
        piles: new Set([AGENT, RITES]),
        tiles: { "viewer:graveyard": 5 },
      }),
    );
    const c = view.container;
    const spellLands = landsOf(ghostOf(c, "stack:22"));
    expect(tileAt(c, "viewer:graveyard", 0)).toEqual(["4"]);
    expect(tileAt(c, "viewer:graveyard", spellLands + 1)).toEqual(["5"]);
  });
});

describe("F-0099-J · a spell exiled on resolution flies to the Exile tile", () => {
  it("its ghost ends on the Exile tile; the Exile number waits for it; the Graveyard's never moves", () => {
    const c = resolves("viewer:exile");
    const ghost = ghostOf(c, "stack:22");
    const end = endCentre(ghost);
    const exile = where["viewer:exile"];
    const grave = where["viewer:graveyard"];
    expect(Math.hypot(end.x - exile.x, end.y - exile.y)).toBeLessThan(2);
    expect(Math.hypot(end.x - grave.x, end.y - grave.y)).toBeGreaterThan(50);
    const lands = landsOf(ghost);
    for (const t of [0, lands - 50]) expect(tileAt(c, "viewer:exile", t)).toEqual(["0"]);
    expect(tileAt(c, "viewer:exile", lands + 1)).toEqual(["1"]);
    for (const t of [0, lands + 1, 5000]) expect(tileAt(c, "viewer:graveyard", t)).toEqual(["0"]);
  });

  it("the game's move from the stack names that pile (flashback: exile, not the graveyard)", () => {
    const snap = (revision: number, state: Record<string, unknown>): Snapshot =>
      reduceMatch(EMPTY_MATCH, {
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
    const spell = {
      id: "card:8",
      seat: 1,
      name: "Grave Thought",
      tapped: false,
      faceDown: false,
      known: true,
    };
    const before = snap(1, {
      stack: [
        { id: "stack:5", kind: "spell", name: "Grave Thought", source: "card:8", controller: 1 },
      ],
    });
    const after = snap(2, {
      exile: [spell],
      moves: [{ card: "card:8", from: { zone: "stack" }, to: { zone: "exile", seat: 1 } }],
    });
    expect(boardFromSnapshot(after, before).departures.get("card:8")).toBe("viewer:exile");
    // By the move alone (a board before it that never drew the spell on the stack).
    expect(boardFromSnapshot(after, snap(0, {})).departures.get("card:8")).toBe("viewer:exile");
    // The other player's page: its board with the spell on the stack is held
    // (HOLD_MS) and the board drawn next is a later round's, with no move.
    const later = snap(3, { exile: [spell], moves: [] });
    expect(boardFromSnapshot(later, before).departures.get("card:8")).toBe("viewer:exile");
  });
});

describe("F-0099-K · countered and did-nothing spells: counted once, as they land, where they go", () => {
  for (const kind of ["countered", "fizzled"] as const)
    it(`${kind}: the number reads 0 until it lands, then exactly 1 (never 2, never -1)`, () => {
      const c = resolves(undefined, { [kind]: true });
      const lands = landsOf(ghostOf(c, "stack:22"));
      for (const t of [0, 300, lands - 50]) expect(tileAt(c, "viewer:graveyard", t)).toEqual(["0"]);
      for (const t of [lands + 1, 5000]) expect(tileAt(c, "viewer:graveyard", t)).toEqual(["1"]);
    });

  it("a countered spell sent to exile flies there, and that number waits", () => {
    const c = resolves("viewer:exile", { countered: true });
    const ghost = ghostOf(c, "stack:22");
    const end = endCentre(ghost);
    const exile = where["viewer:exile"];
    expect(Math.hypot(end.x - exile.x, end.y - exile.y)).toBeLessThan(2);
    const lands = landsOf(ghost);
    expect(tileAt(c, "viewer:exile", lands - 50)).toEqual(["0"]);
    expect(tileAt(c, "viewer:exile", lands + 1)).toEqual(["1"]);
    expect(tileAt(c, "viewer:graveyard", lands + 1)).toEqual(["0"]);
  });
});
