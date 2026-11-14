// @vitest-environment jsdom

// Spec 0088 -- triggers from anywhere (F-0088-A), the gathered report window
// (F-0088-C's window), the library's top card (F-0088-D's pieces) and the
// sight corners for "targeted" (F-0088-E). The board as the game screen
// draws it, handed one board and then the next, and the pure pieces under it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Board,
  CASCADE_FROM,
  RISE_MS,
  SHOW_LIFT_AT,
  type BoardCard,
  type StackView,
} from "./Board";
import { boardFromSnapshot } from "./fromSnapshot";
import { geometry, type Box } from "./layout";
import { anchors, fateMs, MOVE_MS } from "./motion";
import { DISCARD_MS, SHOW_MS, SHOW_RISE_MS, SHOW_SCALE, besideTile } from "./graves";
import { ROWS, layoutOf, openReports } from "./reports";
import { RevealTray } from "./RevealTray";
import { SIGHT_ARM, SIGHT_OUT } from "./Sight";
import {
  TOP_HOLD_MS,
  TOP_RISE_MS,
  TOP_SHOW_MS,
  libraryTopBox,
  topBackFrames,
  topShowFrames,
} from "./LibraryTop";
import { EMPTY_MATCH, reduceMatch, type Snapshot, type SnapshotReveal } from "../match";

type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: { playState: string; cancelled: boolean };
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
  // Where things are on the screen (jsdom has no layout): an element's
  // data-x/-y/-w/-h, else a 24-pixel box at the board's corner.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const d = (this as HTMLElement).dataset ?? {};
    const x = Number(d["x"] ?? 0);
    const y = Number(d["y"] ?? 0);
    const w = Number(d["w"] ?? 24);
    const h = Number(d["h"] ?? 24);
    return {
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
      x,
      y,
      toJSON: () => ({}),
    };
  });
  vi.stubGlobal("CSSAnimation", class {});
  vi.stubGlobal("CSSTransition", class {});
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation = {
      onfinish: null as null | (() => void),
      oncancel: null as null | (() => void),
      playState: "running",
      cancelled: false,
      currentTime: 0,
      playbackRate: 1,
      cancel() {
        animation.cancelled = true;
        animation.playState = "idle";
      },
      finished: new Promise(() => {}),
      effect: {
        getComputedTiming: () => ({
          endTime: Number(options.duration ?? 0) + Number(options.delay ?? 0),
          iterations: 1,
        }),
        updateTiming() {},
      },
      updatePlaybackRate() {},
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
      otherHands: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...body,
    },
  });
  return state.board!;
}
const cardRow = (id: string, seat: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: "Artifact Creature — Golem",
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  known: true,
  ...extra,
});
const stackRow = (id: string, kind: string, source: string, name: string, controller = 1) => ({
  id,
  kind,
  source,
  controller,
  name,
  description: name,
  targets: [],
});
const g = geometry({ width: 1920, height: 1080 });

// --- F-0088-A: where a trigger comes from, as the page reads it --------------------------------------

describe("F-0088-A · a trigger from anywhere: where it rises from, read from the game", () => {
  const solemn = cardRow("card:30", 1, "Solemn Simulacrum");
  const murdered = (seat: number) =>
    snap(seat, {
      graveyard: [solemn],
      stack: [stackRow("stack:7", "trigger", "card:30", "Solemn Simulacrum")],
      moves: [
        {
          card: "card:30",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "destroyed",
        },
      ],
    });
  const before = (seat: number) => snap(seat, { battlefield: [solemn] });

  it("Solemn dies: its trigger is shown out of the graveyard tile, after its fall, both seats", () => {
    for (const seat of [1, 2]) {
      const t = boardFromSnapshot(murdered(seat), before(seat)).stack[0]!;
      expect(t.riseFrom).toBe("pile:1:graveyard");
      expect(t.showFrom?.zone).toBe("graveyard");
      expect(t.showFrom?.side).toBe(seat === 1 ? "viewer" : "opponent");
      expect(t.showFrom?.came).toBe("defeated");
      expect(t.showFrom?.face.name).toBe("Solemn Simulacrum");
    }
  });

  it("already lying there (it died earlier): no wait for a fall; exiled: from the exile tile", () => {
    const lying = snap(1, {
      graveyard: [solemn],
      stack: [stackRow("stack:7", "trigger", "card:30", "Solemn Simulacrum")],
    });
    expect(boardFromSnapshot(lying, lying).stack[0]!.showFrom?.came).toBeNull();
    const exiled = snap(1, {
      exile: [solemn],
      stack: [stackRow("stack:7", "trigger", "card:30", "Solemn Simulacrum")],
      moves: [
        { card: "card:30", from: { zone: "battlefield", seat: 1 }, to: { zone: "exile", seat: 1 } },
      ],
    });
    const t = boardFromSnapshot(exiled, before(1)).stack[0]!;
    expect(t.riseFrom).toBe("pile:1:exile");
    expect(t.showFrom?.came).toBe("exiled");
  });

  it("cascade: the trigger lifts off the spell being cast", () => {
    const s = snap(2, {
      stack: [
        stackRow("stack:6", "trigger", "card:43", "Bloodbraid Elf"),
        stackRow("stack:5", "spell", "card:43", "Bloodbraid Elf"),
      ],
    });
    const t = boardFromSnapshot(s, null).stack[0]!;
    expect(t.riseFrom).toBe("spell:card:43");
    expect(t.showFrom).toBeUndefined();
  });

  it("cycling, in the other player's view: the ability lifts off their fan, the trigger out of the tile", () => {
    const gem = cardRow("card:51", 1, "Gempalm Incinerator");
    const body = (seat: number) => ({
      seat,
      graveyard: [gem],
      stack: [
        stackRow("stack:9", "trigger", "card:51", "Gempalm Incinerator"),
        stackRow("stack:8", "ability", "card:51", "Gempalm Incinerator"),
      ],
      moves: [
        {
          card: "card:51",
          from: { zone: "hand", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "cycled",
        },
      ],
    });
    const cycled = snap(2, body(2));
    const [trigger, ability] = boardFromSnapshot(cycled, snap(2, {})).stack;
    expect(ability!.fromTheirHand).toBe(1);
    expect(ability!.showFrom).toBeUndefined();
    expect(trigger!.showFrom?.came).toBe("hand");
    // In Alice's own view the ability lifts off her hand card (spec 0084), not a back.
    const own = boardFromSnapshot(snap(1, body(1)), snap(1, { hand: [gem] })).stack[1]!;
    expect(own.fromTheirHand).toBeUndefined();
    expect(own.leftFrom).toBe("card:51");
  });

  it("a source the viewer never saw (no card anywhere on their board): nothing is guessed", () => {
    const s = snap(2, { stack: [stackRow("stack:4", "ability", "card:99", "Something")] });
    const t = boardFromSnapshot(s, null).stack[0]!;
    expect(t.riseFrom).toBeUndefined();
    expect(t.showFrom).toBeUndefined();
    expect(t.fromTheirHand).toBeUndefined();
  });
});

// --- F-0088-A: the board raises them ----------------------------------------------------------------

function Tiles() {
  return (
    <>
      {[1, 2].flatMap((seat) =>
        ["graveyard", "exile"].map((zone) => (
          <div
            key={`${seat}:${zone}`}
            className="gs-zone"
            data-zone-tile={`${seat === 1 ? "viewer" : "opponent"}:${zone}`}
            data-rise-from={`pile:${seat}:${zone}`}
            data-x={zone === "graveyard" ? 1660 : 1780}
            data-y={seat === 1 ? 900 : 120}
            data-w={110}
            data-h={52}
          >
            <span className="gs-zone-n">0</span>
          </div>
        )),
      )}
    </>
  );
}

function draw(
  stack: StackView[],
  extra: { hiddenStack?: string | null; battlefield?: BoardCard[] } = {},
) {
  return (
    <Board
      battlefield={extra.battlefield ?? []}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => `/art/${art}`}
      stack={stack}
      combat={null}
      rail={<Tiles />}
      hiddenStack={extra.hiddenStack ?? null}
    />
  );
}
const slotOf = (c: HTMLElement, id: string) =>
  c.querySelector(`[data-object-id="${id}"]`)!.closest<HTMLElement>(".bf-slot")!;
/** The stack card's own rise (its first frame moved to where it set off). */
const riseOf = (el: Element) =>
  calls.find((c) => c.element === el && c.options.duration === RISE_MS && c.frames.length === 7);
const startOf = (call: Call) => {
  const [x, y, , s] = (
    String(call.frames[0]!.transform)
      .replace("translate3d", "")
      .match(/-?[\d.]+/g) ?? []
  ).map(Number);
  return { x: x!, y: y!, s: s! };
};

const solemnTrigger: StackView = {
  id: "stack:7",
  name: "Solemn Simulacrum",
  by: "Alice",
  seat: 1,
  kind: "trigger",
  source: null,
  leftFrom: "card:30",
  riseFrom: "pile:1:graveyard",
  showFrom: {
    card: "card:30",
    face: {
      name: "Solemn Simulacrum",
      kind: "creature",
      types: "Artifact Creature — Golem",
      power: 2,
      toughness: 2,
      art: null,
      crop: null,
      faceDown: false,
      known: true,
    },
    side: "viewer",
    zone: "graveyard",
    came: null,
  },
  targets: [],
  card: null,
};

describe("F-0088-A · the board: the tile glows, the card rises and is shown, the trigger lifts off it", () => {
  it("the shown card rises out of the Graveyard tile, held enlarged, and sinks back", () => {
    const view = render(draw([]));
    view.rerender(draw([solemnTrigger]));
    const ghost = view.container.querySelector<HTMLElement>('[data-ghost-of="show:card:30"]');
    expect(ghost).toBeTruthy();
    expect(ghost!.textContent).toContain("Solemn Simulacrum");
    const run = calls.find((c) => c.element === ghost && c.options.duration === SHOW_MS);
    expect(run).toBeTruthy();
    // The first and last frames are the tile; between, the show spot at 1.2 of a card.
    // Beside the column, level with the tile (the canvas's spot).
    const spot = besideTile(g.rail.x, g.height, anchors(g)["viewer:graveyard"].y);
    const held = run!.frames.find((f) => Number(f.offset) > 0.3 && Number(f.offset) < 0.6)!;
    const [hx, hy] = (
      String(held.transform)
        .replace("translate3d", "")
        .match(/-?[\d.]+/g) ?? []
    ).map(Number);
    // Drawn about its centre: the translate puts its unscaled top-left there.
    expect(hx! + g.cardW / 2).toBeCloseTo(spot.x, 0);
    expect(hy! + g.cardH / 2).toBeCloseTo(spot.y, 0);
    expect(String(held.transform)).toContain(`scale(${SHOW_SCALE}, ${SHOW_SCALE})`);
  });

  it("the tile glows while its card is shown", () => {
    const view = render(draw([]));
    view.rerender(draw([solemnTrigger]));
    const tile = view.container.querySelector('[data-rise-from="pile:1:graveyard"]')!;
    const glow = calls.find((c) => c.element === tile);
    expect(glow).toBeTruthy();
    expect(JSON.stringify(glow!.frames)).toContain("#f2c46a");
    expect(glow!.options.duration).toBeGreaterThan(SHOW_MS);
  });

  it("the trigger lifts off the shown card, while it is shown -- never sliding in at the stack spot", () => {
    const view = render(draw([]));
    view.rerender(draw([solemnTrigger]));
    const el = slotOf(view.container, "stack:7");
    expect(el.dataset["rising"]).toBe("true");
    const rise = riseOf(el)!;
    expect(rise).toBeTruthy();
    expect(rise.options.delay).toBe(SHOW_RISE_MS + SHOW_LIFT_AT);
    const from = startOf(rise);
    // Beside the column, level with the tile (the canvas's spot).
    const spot = besideTile(g.rail.x, g.height, anchors(g)["viewer:graveyard"].y);
    expect(from.x).toBeCloseTo(spot.x - (g.cardW * SHOW_SCALE) / 2, 0);
    expect(from.y).toBeCloseTo(spot.y - (g.cardH * SHOW_SCALE) / 2, 0);
    // From the shown card's size (1.2 of a table card).
    expect(from.s).toBeCloseTo(SHOW_SCALE, 2);
  });

  it("when its card falls there now, all of it waits for the fall to land", () => {
    const view = render(draw([]));
    const fell: StackView = {
      ...solemnTrigger,
      showFrom: { ...solemnTrigger.showFrom!, came: "defeated" },
    };
    view.rerender(draw([fell]));
    const land = fateMs("defeated") + MOVE_MS;
    const ghost = view.container.querySelector('[data-ghost-of="show:card:30"]')!;
    expect(calls.find((c) => c.element === ghost)!.options.delay).toBe(land);
    expect(riseOf(slotOf(view.container, "stack:7"))!.options.delay).toBe(
      land + SHOW_RISE_MS + SHOW_LIFT_AT,
    );
    // Out of a hand (Gempalm cycled): the drop's time.
    const cycled: StackView = {
      ...solemnTrigger,
      id: "stack:9",
      showFrom: { ...solemnTrigger.showFrom!, came: "hand" },
    };
    view.rerender(draw([cycled, fell]));
    expect(riseOf(slotOf(view.container, "stack:9"))!.options.delay).toBe(
      DISCARD_MS + SHOW_RISE_MS + SHOW_LIFT_AT,
    );
  });

  it("two triggers of one card: one card shown, both lift off it", () => {
    const view = render(draw([]));
    const second: StackView = { ...solemnTrigger, id: "stack:8" };
    view.rerender(draw([second, solemnTrigger]));
    expect(view.container.querySelectorAll('[data-ghost-of="show:card:30"]')).toHaveLength(1);
    expect(riseOf(slotOf(view.container, "stack:7"))).toBeTruthy();
    expect(riseOf(slotOf(view.container, "stack:8"))).toBeTruthy();
  });

  it("reduce motion: no rise, no show, no glow", () => {
    still = true;
    const view = render(draw([]));
    view.rerender(draw([solemnTrigger]));
    expect(view.container.querySelector('[data-ghost-of="show:card:30"]')).toBeNull();
    expect(calls.filter((c) => c.options.duration === SHOW_MS)).toHaveLength(0);
    expect(riseOf(slotOf(view.container, "stack:7"))).toBeUndefined();
  });

  it("cascade: it waits, unseen, while its spell flies in, then lifts off the landed spell", () => {
    const spell: StackView = {
      id: "stack:5",
      name: "Bloodbraid Elf",
      by: "Alice",
      seat: 1,
      kind: "spell",
      source: null,
      targets: [],
      card: "card:43",
    };
    const trigger: StackView = {
      id: "stack:6",
      name: "Bloodbraid Elf",
      by: "Alice",
      seat: 1,
      kind: "trigger",
      source: null,
      leftFrom: "card:43",
      riseFrom: "spell:card:43",
      targets: [],
      card: null,
    };
    const view = render(draw([]));
    view.rerender(draw([trigger, spell], { hiddenStack: "stack:5" }));
    const el = slotOf(view.container, "stack:6");
    // The spell's own card says it is a spell's source to rise from.
    expect(
      view.container.querySelector('[data-object-id="stack:5"]')!.getAttribute("data-rise-from"),
    ).toBe("spell:card:43");
    const waiting = calls.find((c) => c.element === el && c.options.id === "await-spell");
    expect(waiting).toBeTruthy();
    expect(waiting!.frames[0]!.opacity).toBe(0);
    expect(riseOf(el)).toBeUndefined();
    // The spell lands: the trigger lifts out of its middle, small (0.42 of a card).
    view.rerender(draw([trigger, spell], { hiddenStack: null }));
    expect(waiting!.animation.cancelled).toBe(true);
    const rise = riseOf(el)!;
    expect(rise).toBeTruthy();
    expect(startOf(rise).s).toBeCloseTo(CASCADE_FROM, 2);
    // The spell's card is a 24-pixel box at the board's corner here: its middle.
    expect(startOf(rise).x).toBeCloseTo(12 - (g.cardW * CASCADE_FROM) / 2, 0);
  });

  it("cycling in the other player's view: the ability lifts off the middle back of their fan", () => {
    const backs = Array.from({ length: 5 }, (_, i) => ({ id: `hidden-hand:2:${i}`, shown: null }));
    const ability: StackView = {
      id: "stack:8",
      name: "Gempalm Incinerator",
      by: "Bob",
      seat: 2,
      kind: "ability",
      source: null,
      leftFrom: "card:51",
      riseFrom: "pile:2:graveyard",
      fromTheirHand: 2,
      targets: [],
      card: null,
    };
    const fan = (n: number) => (
      <Board
        battlefield={[]}
        hand={[]}
        opponentHand={backs.slice(0, n)}
        opponentName="Bob"
        viewerSeat={1}
        artUrl={(art) => `/art/${art}`}
        stack={n === 5 ? [] : [ability]}
        combat={null}
        rail={<Tiles />}
      />
    );
    let middle: Box | null = null;
    const view = render(fan(5));
    const back = view.container.querySelector('[data-object-id="hidden-hand:2:2"]')!;
    const slot = back.closest<HTMLElement>(".bf-slot")!;
    const t =
      slot.style.transform
        .replace("translate3d", "")
        .match(/-?[\d.]+/g)
        ?.map(Number) ?? [];
    middle = { x: t[0]!, y: t[1]!, w: 0, h: 0, scale: 1, rotation: 0, z: 0 };
    view.rerender(fan(4));
    const rise = riseOf(slotOf(view.container, "stack:8"))!;
    expect(rise).toBeTruthy();
    const from = startOf(rise);
    // From where the middle back was drawn (not the Graveyard tile at the rail).
    expect(Math.abs(from.x - middle.x)).toBeLessThan(2);
    expect(from.x).toBeLessThan(g.rail.x - 200);
  });
});

// --- F-0088-C: the report window gathers ------------------------------------------------------------

const report = (n: number, said: string, extra: Partial<SnapshotReveal> = {}): SnapshotReveal => ({
  key: `action:${n}`,
  title: said,
  said,
  stamp: n,
  by: 2,
  source: ["", "Polluted Delta", "Flooded Strand", "Consider"][n] ?? "Opt",
  cards: [
    {
      id: `action:${n}:0`,
      seat: 2,
      name: n === 3 ? "Lightning Bolt" : "Island",
      art: null,
      tapped: false,
      faceDown: false,
      known: true,
      kind: "other",
      types: "",
      power: null,
      toughness: null,
    } as never,
  ],
  ...extra,
});

describe("F-0088-C · reports gather in one window", () => {
  const window_ = {
    ...report(3, "Bob surveilled 1 and put Lightning Bolt into their graveyard."),
    gathered: [
      report(1, "Bob searched their library and put Island onto the battlefield, then shuffled."),
      report(2, "Bob searched their library and put Swamp onto the battlefield, then shuffled."),
    ],
  };

  it("openReports: only what is not closed, oldest first, the newest carrying the rest", () => {
    expect(openReports(window_, 0)!.gathered!.map((r) => r.key)).toEqual(["action:1", "action:2"]);
    const after = openReports(window_, 2)!;
    expect(after.key).toBe("action:3");
    expect(after.gathered).toBeUndefined();
    expect(openReports(window_, 3)).toBeNull();
    // An older worker's report with no stamp is closed by its key alone.
    expect(openReports({ ...report(1, "x"), stamp: 0 }, 9)?.key).toBe("action:1");
  });

  it("Amendment 1: at most three older reports as rows; older ones drop off", () => {
    const five = {
      ...report(5, "Bob surveilled 1."),
      gathered: [1, 2, 3, 4].map((n) => report(n, `report ${n}`)),
    };
    const open = openReports(five, 0)!;
    expect(open.key).toBe("action:5");
    expect(open.gathered!.map((r) => r.key)).toEqual(["action:2", "action:3", "action:4"]);
    const c = render(tray(open)).container;
    expect(c.querySelectorAll(".gs-report-row")).toHaveLength(ROWS);
    expect(c.querySelector('[data-report="action:1"]')).toBeNull();
  });

  it("Amendment 1: the rows never scroll (no height cap, nothing to scroll)", () => {
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "game.css"), "utf8");
    const rule = /\.gs-report-rows \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).not.toMatch(/max-height/);
    expect(rule).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    expect(ROWS).toBe(3);
  });

  it("layoutOf: the newest in full, the others its rows; a clicked row opens in full", () => {
    expect(layoutOf(window_, null).full.key).toBe("action:3");
    expect(layoutOf(window_, null).rows.map((r) => r.key)).toEqual(["action:1", "action:2"]);
    const opened = layoutOf(window_, "action:1");
    expect(opened.full.key).toBe("action:1");
    expect(opened.rows.map((r) => r.key)).toEqual(["action:2", "action:3"]);
  });

  const who = (seat: number | null) => ({ name: seat === 2 ? "Bob" : "You", face: <b /> });
  const tray = (r: SnapshotReveal) => (
    <RevealTray
      reveal={r}
      who={who(r.by ?? null)}
      whoOf={who}
      geometry={g}
      atTop={false}
      artUrl={(a) => a}
      onClose={() => {}}
    />
  );

  it("one window: the older reports as one-line rows at the top (WHO · CARD, the sentence), the newest in full", () => {
    const c = render(tray(window_)).container;
    expect(c.querySelectorAll(".gs-reveal")).toHaveLength(1);
    // At least the canvas's 600 wide at 1080, so the rows read across it.
    expect(c.querySelector<HTMLElement>(".gs-reveal")!.style.minWidth).toBe("600px");
    const rows = [...c.querySelectorAll<HTMLElement>(".gs-report-row")];
    expect(rows.map((r) => r.dataset["report"])).toEqual(["action:1", "action:2"]);
    expect(rows[0]!.textContent).toContain("Bob · Polluted Delta");
    // No row is a list item: a question's choices are list items' buttons (the scripted games).
    expect(c.querySelector(".gs-report-rows li, .gs-report-row[role='listitem']")).toBeNull();
    expect(rows[0]!.textContent).toContain("put Island onto the battlefield");
    const full = c.querySelector<HTMLElement>(".gs-report-full")!;
    expect(full.dataset["report"]).toBe("action:3");
    expect(full.textContent).toContain("Bob surveilled 1");
    // The rows sit above the full report.
    expect(
      c.querySelector(".gs-report-rows")!.compareDocumentPosition(full) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a click on a row opens it in full; a newer report shows in full again", () => {
    const view = render(tray(window_));
    fireEvent.click(view.container.querySelector('[data-report="action:1"] button')!);
    expect(view.container.querySelector<HTMLElement>(".gs-report-full")!.dataset["report"]).toBe(
      "action:1",
    );
    const next = {
      ...report(4, "Bob drew a card."),
      gathered: [...window_.gathered, { ...window_, gathered: undefined } as never],
    } as SnapshotReveal;
    view.rerender(tray(next));
    expect(view.container.querySelector<HTMLElement>(".gs-report-full")!.dataset["report"]).toBe(
      "action:4",
    );
  });

  it("a new report coming in: the old one folds into its row and the new one rises in (0.3 s)", () => {
    const one = report(1, "Bob searched their library and put Island onto the battlefield.");
    const view = render(tray(one));
    expect(calls).toHaveLength(0);
    view.rerender(tray({ ...report(2, "Bob searched again."), gathered: [one] }));
    const full = view.container.querySelector(".gs-report-full")!;
    const row = view.container.querySelector('[data-report="action:1"]')!;
    const came = calls.find((c) => c.element === full)!;
    expect(came.options.duration).toBe(300);
    expect(came.frames[0]!.opacity).toBe(0);
    expect(String(came.frames[0]!.transform)).toContain("translateY(20px)");
    expect(calls.find((c) => c.element === row)!.frames[0]!.opacity).toBe(0);
  });

  it("reduce motion: the rows simply show", () => {
    still = true;
    const one = report(1, "Bob searched.");
    const view = render(tray(one));
    view.rerender(tray({ ...report(2, "Bob searched again."), gathered: [one] }));
    expect(view.container.querySelectorAll(".gs-report-row")).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });
});

// --- F-0088-D: the top of the library (the pure pieces) ---------------------------------------------

describe("F-0088-D · the top card's place and its rise and show", () => {
  it("stands on the right end of the Library tile at the canvas's size (70 high at 1080)", () => {
    for (const side of ["viewer", "opponent"] as const) {
      const box = libraryTopBox(g, side);
      const tile = anchors(g)[`${side}:library`];
      expect(box.h).toBeCloseTo(69.6, 1);
      expect(box.w).toBeCloseTo(50.4, 1);
      // Centred 33 in from the tile's right end (the tile is 194 x 52 of the rail's 900).
      const right = tile.x + (194 / 2) * (1080 / 900);
      expect(right - (box.x + box.w / 2)).toBeCloseTo(33.6, 1);
      // 24 below the tile's top: it stands a little above the tile.
      const top = tile.y - 26 * (1080 / 900);
      expect(box.y + box.h / 2 - top).toBeCloseTo(24, 1);
      // Clear of the count on the tile's left.
      expect(box.x).toBeGreaterThan(tile.x);
    }
  });

  it("rise and show: from the tile, turning face up, to the show spot big, held, home", () => {
    const frames = topShowFrames({ dx: -80, dy: 10 }, { dx: -120, dy: -200 }, 2.4);
    expect(frames[0]!.transform).toContain("translate(-80px, 10px)");
    expect(frames[0]!.opacity).toBe(0.5);
    const shown = frames.find((f) => f.offset === TOP_RISE_MS / TOP_SHOW_MS)!;
    expect(shown.transform).toBe("translate(-120px, -200px) scale(2.4, 2.4)");
    const held = frames.find((f) => f.offset === (TOP_RISE_MS + TOP_HOLD_MS) / TOP_SHOW_MS)!;
    expect(held.transform).toBe(shown.transform);
    expect(frames[frames.length - 1]!.transform).toBe("translate(0px, 0px) scale(1, 1)");
    expect(TOP_SHOW_MS).toBe(1300);
    // The back covers it for the first 40% of the rise, then is gone.
    const back = topBackFrames();
    expect(back[1]!.opacity).toBe(1);
    expect(back[2]!.opacity).toBe(0);
    expect(Number(back[2]!.offset)).toBeCloseTo((TOP_RISE_MS * 0.4) / TOP_SHOW_MS, 2);
  });
});

// --- F-0088-E: targeted wears the sight corners -------------------------------------------------------

describe("F-0088-E · targeted: four still corners; pickable: the breath", () => {
  let entered = 0;
  const bear = (id: string, name = "Grizzly Bears"): BoardCard => ({
    id,
    seat: 1,
    name,
    kind: "creature",
    types: "Creature — Bear",
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
  });
  const bears = [bear("card:81"), bear("card:82", "Hill Giant")];
  const ids = bears.map((c) => c.id);
  const murder: StackView = {
    id: "stack:3",
    name: "Murder",
    by: "Bob",
    seat: 2,
    kind: "spell",
    source: null,
    targets: [{ object: ids[0]! }],
    card: "card:900",
  };
  const board = (choosable?: ReadonlySet<string>) => (
    <Board
      battlefield={bears}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => `/art/${art}`}
      stack={[murder]}
      combat={null}
      {...(choosable ? { choosable } : {})}
    />
  );

  it("Murder's target wears the corners; the other creature none", () => {
    const c = render(board()).container;
    const target = c.querySelector(`[data-object-id="${ids[0]}"]`)!.closest(".bf-slot")!;
    const other = c.querySelector(`[data-object-id="${ids[1]}"]`)!.closest(".bf-slot")!;
    expect(target.querySelector('[data-sight="true"]')).toBeTruthy();
    expect(target.querySelectorAll(".bf-sight svg")).toHaveLength(4);
    expect(other.querySelector('[data-sight="true"]')).toBeNull();
  });

  it("while Alice picks a target for her Bolt: corners on the Bears, the breath on what she may pick", () => {
    const c = render(board(new Set(ids))).container;
    const target = c.querySelector<HTMLElement>(`[data-object-id="${ids[0]}"]`)!;
    const other = c.querySelector<HTMLElement>(`[data-object-id="${ids[1]}"]`)!;
    // Both may be picked: both breathe.
    expect(target.className).toContain("bf-choosable");
    expect(other.className).toContain("bf-choosable");
    // Only the one Murder aims at wears the sight.
    expect(target.closest(".bf-slot")!.querySelector('[data-sight="true"]')).toBeTruthy();
    expect(other.closest(".bf-slot")!.querySelector('[data-sight="true"]')).toBeNull();
    expect(target.getAttribute("aria-label")).toContain("targeted");
  });

  it("the corners are still (no animation, with or without reduce motion), drawn just outside the card", () => {
    const c = render(board()).container;
    const sight = c.querySelector<HTMLElement>('[data-sight="true"]')!;
    expect(calls.some((a) => sight.contains(a.element))).toBe(false);
    // The canvas's numbers on its 135-high card: 15 out, 24-long arms.
    expect(SIGHT_OUT).toBeCloseTo(15 / 135, 5);
    expect(SIGHT_ARM).toBeCloseTo(24 / 135, 5);
    still = true;
    const quiet = render(board()).container;
    expect(quiet.querySelector('[data-sight="true"]')).toBeTruthy();
  });
});
