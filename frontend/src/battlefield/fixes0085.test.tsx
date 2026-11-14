// @vitest-environment jsdom

// Spec 0085 -- protection and gained-ability marks; what a card is holding
// (F-0085-A..E and Amendment 1; owner on the canvas gaps-marks-1113: 2 B
// rise then settle as a gold square, protection never folds first, 4 A a
// picture tab on the holder). The real Board, handed one board and then the
// next, as the game screen hands them; CardBadges as the board draws it; and
// fromSnapshot, from the snapshots the worker sends.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type StackView } from "./Board";
import { hurry } from "./motion";
import { SHOW_MS } from "./graves";
import {
  CardBadges,
  MARK_OUT_MS,
  STATE_BAND,
  BADGE_FLOOR,
  MARK_H,
  placeBadges,
} from "./CardBadges";
import { cardMarks, protectionColours, wardNumber } from "./marks";
import {
  FREED_WAIT_MS,
  HELD_FLY_MS,
  HELD_IN_MS,
  MARK_LAND_MS,
  RISER_MS,
  WHY_PULSE_MS,
  heldFlyFrames,
  riserFrames,
} from "./markMotion";
import { boardFromSnapshot, type TileMove } from "./fromSnapshot";
import { layout, TAB_W } from "./layout";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import { boardMoving, useReportWait } from "./reportWait";

const size = { width: 1920, height: 1080 };
type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  rate: number[];
  animation: Animation & { onfinish: null | (() => void) };
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
    const call = { element: this, frames, options, rate: [] as number[] } as unknown as Call;
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
    } as unknown as Call["animation"];
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

function draw(
  battlefield: BoardCard[],
  extra: {
    stack?: StackView[];
    fizzled?: Set<string>;
    tileMoves?: TileMove[];
    departures?: Map<string, `${"viewer" | "opponent"}:${"graveyard" | "exile"}`>;
  } = {},
) {
  return (
    <Board
      battlefield={battlefield}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => `/art/${art}`}
      arrivals={new Map()}
      departures={extra.departures ?? new Map()}
      returns={new Map()}
      graves={new Map()}
      tileMoves={extra.tileMoves ?? []}
      countered={new Set()}
      fizzled={extra.fizzled ?? new Set()}
      survive={null}
      stack={extra.stack ?? []}
      combat={null}
      damage={null}
      rail={<Tiles n={{ "viewer:exile": 0, "opponent:exile": 1, "opponent:graveyard": 0 }} />}
    />
  );
}

const slotOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
const runsOf = (element: Element) => calls.filter((c) => c.element === element);
const delayOf = (c: Call) => Number(c.options.delay ?? 0);
const fights = (c: HTMLElement, kind: string) => [
  ...c.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
];
const markOn = (c: HTMLElement, id: string, key: string) =>
  slotOf(c, id).querySelector<HTMLElement>(`.bf-mark[data-mark="${key}"]`);

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

const HEXED = { keywords: ["Hexproof", "Indestructible"], gained: ["Hexproof", "Indestructible"] };

// --- F-0085-A · Heroic Intervention -----------------------------------------------------------------

describe("F-0085-A · Heroic Intervention: hexproof and the hexagon rise and settle on all three", () => {
  it("the worker's gained keywords reach the board; indestructible stays 0080's hexagon", () => {
    const s = snap(2, 1, {
      battlefield: [row("card:1", 1, "Grizzly Bears", { ...HEXED, indestructible: true })],
    });
    const bears = boardFromSnapshot(s, null).battlefield[0]!;
    expect(bears.gained).toEqual(["Hexproof", "Indestructible"]);
    const marks = cardMarks(bears);
    expect(marks.map((m) => m.key)).toEqual(["kw:hexproof"]);
    expect(marks[0]!.folds).toBe(false);
  });

  it("two icons rise off each creature, all three together, and each settles in its square", () => {
    const ids = ["card:1", "card:2", "card:3"];
    const three = ids.map((id, i) =>
      card(id, 1, ["Grizzly Bears", "Llanowar Elves", "Savannah Lions"][i]!),
    );
    const view = render(draw(three));
    expect(fights(view.container, "riser")).toHaveLength(0);
    calls.length = 0;
    view.rerender(draw(three.map((c) => ({ ...c, ...HEXED, indestructible: true }))));
    const risers = fights(view.container, "riser");
    expect(risers).toHaveLength(6);
    for (const id of ids) {
      const mine = risers.filter((r) => r.dataset["of"] === id);
      expect(mine).toHaveLength(2);
      // A picture, never a word.
      for (const r of mine) {
        expect(r.textContent).toBe("");
        expect(r.querySelector("svg")).toBeTruthy();
      }
      // Each square waits unseen until its icon lands, then pops.
      for (const key of ["kw:hexproof", "indestructible"]) {
        const square = markOn(view.container, id, key)!;
        expect(square).toBeTruthy();
        const land = runsOf(square).at(-1)!;
        expect(Number(land.options.duration)).toBe(MARK_LAND_MS);
        expect(land.options.fill).toBe("backwards");
        expect(land.frames[0]!.opacity).toBe(0);
      }
    }
    const starts = risers.map((r) => delayOf(runsOf(r).at(-1)!));
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(200);
    for (const r of risers) expect(Number(runsOf(r).at(-1)!.options.duration)).toBe(RISER_MS);
  });

  it("at the turn's end each mark shrinks away, then is gone", () => {
    const bears = card("card:1", 1, "Grizzly Bears", { ...HEXED, indestructible: true });
    const view = render(draw([bears]));
    view.rerender(draw([{ ...bears, keywords: [], gained: [], indestructible: false }]));
    for (const key of ["kw:hexproof", "indestructible"]) {
      const square = markOn(view.container, "card:1", key)!;
      expect(square, key).toBeTruthy();
      expect(square.dataset["leaving"]).toBe("true");
      const out = runsOf(square).at(-1)!;
      expect(Number(out.options.duration)).toBe(MARK_OUT_MS);
      expect(String(out.frames.at(-1)!.transform)).toBe("scale(0)");
    }
    // Gone once it has shrunk away.
    for (const square of slotOf(view.container, "card:1").querySelectorAll<HTMLElement>(
      ".bf-mark[data-leaving]",
    ))
      runsOf(square).at(-1)!.animation.onfinish?.();
    view.rerender(draw([{ ...bears, keywords: [], gained: [], indestructible: false }]));
    expect(slotOf(view.container, "card:1").querySelector(".bf-mark")).toBeNull();
  });

  it("a click hurries the icons with everything else (A-00)", () => {
    const bears = card("card:1", 1, "Grizzly Bears");
    const view = render(draw([bears]));
    view.rerender(draw([{ ...bears, ...HEXED }]));
    hurry(view.container.querySelector(".bf-board")!);
    const riser = fights(view.container, "riser")[0]!;
    expect(runsOf(riser).at(-1)!.rate.length).toBeGreaterThan(0);
  });

  it("reduce motion: no icon moves; the squares are simply there", () => {
    still = true;
    const bears = card("card:1", 1, "Grizzly Bears");
    const view = render(draw([bears]));
    view.rerender(draw([{ ...bears, ...HEXED, indestructible: true }]));
    expect(fights(view.container, "riser")).toHaveLength(0);
    expect(markOn(view.container, "card:1", "kw:hexproof")).toBeTruthy();
    expect(markOn(view.container, "card:1", "indestructible")).toBeTruthy();
  });

  it("a card new to the table simply wears its marks; the same board again plays nothing", () => {
    const view = render(draw([]));
    const angel = card("card:7", 1, "Gladecover Scout", { keywords: ["Hexproof"] });
    view.rerender(draw([angel]));
    expect(fights(view.container, "riser")).toHaveLength(0);
    expect(markOn(view.container, "card:7", "kw:hexproof")).toBeTruthy();
    const bears = card("card:1", 1, "Grizzly Bears");
    view.rerender(draw([angel, bears]));
    view.rerender(draw([angel, { ...bears, ...HEXED }]));
    view.rerender(draw([angel, { ...bears, ...HEXED }]));
    expect(fights(view.container, "riser")).toHaveLength(1);
  });

  it("the riser rises, holds above the card, then lands exactly on its square", () => {
    const frames = riserFrames({ x: 100, y: 200 }, 50, { x: 60, y: 260 }, 20, 26, 15);
    const at = (f: Keyframe) => {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(
        String(f.transform),
      )!;
      const s = Number(m[3]) * 26;
      return { x: Number(m[1]) + 13, y: Number(m[2]) + 13, size: s };
    };
    expect(at(frames[0]!).y).toBeCloseTo(200, 0);
    const top = frames.filter((f) => Math.abs(at(f).y - 150) < 0.2);
    expect(top.length).toBeGreaterThanOrEqual(2); // risen, and held there
    const last = at(frames.at(-1)!);
    expect(last.x).toBeCloseTo(60, 0);
    expect(last.y).toBeCloseTo(260, 0);
    expect(last.size).toBeCloseTo(15, 0);
  });
});

// --- F-0085-B · Mother of Runes -------------------------------------------------------------------

describe("F-0085-B · Mother of Runes: a red protection square, and it pulses when the Bolt does nothing", () => {
  it("protection takes its colour (or colours); ward carries its cost", () => {
    expect(protectionColours("Protection from red")).toEqual(["R"]);
    expect(protectionColours("Protection from white and from blue")).toEqual(["W", "U"]);
    expect(protectionColours("Protection from creatures")).toEqual([]);
    expect(wardNumber("Ward {2}")).toBe(2);
    expect(wardNumber("Ward—Pay 3 life.")).toBeNull();
    const view = render(
      <CardBadges
        card={card("card:1", 1, "Grizzly Bears", {
          keywords: ["Protection from red", "Ward {2}", "Shroud"],
          gained: ["Protection from red"],
        })}
        pile={false}
        room={{ pile: false, mana: false, state: false, zzz: false, zone: false }}
      />,
    );
    const red = view.container.querySelector<HTMLElement>('[data-mark="kw:protection from red"]')!;
    expect(red.querySelector('path[fill="#d0452a"]')).toBeTruthy();
    expect(view.container.querySelector('[data-mark="kw:ward {2}"] text')?.textContent).toBe("2");
    expect(view.container.querySelector('[data-mark="kw:shroud"]')).toBeTruthy();
  });

  it("the Bolt aimed at the Bears does nothing: their protection square swells once", () => {
    const bears = card("card:2", 1, "Grizzly Bears", {
      keywords: ["Protection from red"],
      gained: ["Protection from red"],
    });
    const bolt: StackView = {
      id: "stack:9",
      name: "Lightning Bolt",
      source: null,
      targets: [{ object: "card:2" }],
      seat: 2,
      card: "card:9",
      kind: "spell",
    };
    const view = render(draw([bears], { stack: [bolt] }));
    calls.length = 0;
    view.rerender(draw([bears], { stack: [], fizzled: new Set(["card:9"]) }));
    const square = markOn(view.container, "card:2", "kw:protection from red")!;
    const pulse = runsOf(square).find(
      (c) =>
        Number(c.options.duration) === WHY_PULSE_MS &&
        c.frames.some((f) => String(f.transform) === "scale(1.350)"),
    );
    expect(pulse).toBeTruthy();
  });
});

// --- F-0085-C · Run Amok ---------------------------------------------------------------------------

describe("F-0085-C · Run Amok: trample rises and settles over the ATTACKING word, and goes at the turn's end", () => {
  it("rises off the attacker; its square sits clear of the ATTACKING word", () => {
    const bears = card("card:1", 1, "Grizzly Bears", { attacking: true, tapped: true });
    const view = render(draw([bears]));
    view.rerender(
      draw([{ ...bears, power: 5, toughness: 5, keywords: ["Trample"], gained: ["Trample"] }]),
    );
    const risers = fights(view.container, "riser");
    expect(risers).toHaveLength(1);
    expect(markOn(view.container, "card:1", "kw:trample")).toBeTruthy();
    // 0076's placement: one square, stepping over the state word.
    const placed = placeBadges([MARK_H], {
      pile: false,
      mana: false,
      state: true,
      zzz: false,
      zone: false,
    })!;
    const [a, b] = STATE_BAND;
    expect(placed[0]!.y + MARK_H <= a || placed[0]!.y >= b).toBe(true);
    // The turn's end: it shrinks away.
    view.rerender(draw([{ ...bears, attacking: false, tapped: false }]));
    expect(markOn(view.container, "card:1", "kw:trample")?.dataset["leaving"]).toBe("true");
  });

  it("printed keywords are not marked; gained ones are, in Amendment 1's list too", () => {
    const printed = cardMarks({ keywords: ["Trample", "Flying", "Haste"] });
    expect(printed).toEqual([]);
    const given = cardMarks({
      keywords: ["Double Strike", "Reach", "Menace", "Deathtouch", "Vigilance", "Lifelink"],
      gained: ["Double Strike", "Reach", "Menace", "Deathtouch", "Vigilance", "Lifelink"],
      unblockable: true,
    });
    expect(given.map((m) => m.icon)).toEqual([
      "doublestrike",
      "deathtouch",
      "menace",
      "lifelink",
      "vigilance",
      "reach",
      "unblockable",
    ]);
    expect(given.every((m) => m.folds)).toBe(true);
  });
});

// --- F-0085-D · a crowded small attacking card ------------------------------------------------------

describe("F-0085-D · a crowded small attacking card: protection stays, keywords fold first", () => {
  const room = { pile: false, mana: false, state: true, zzz: false, zone: false };
  it("a counter, red protection, hexproof, the hexagon and trample: trample folds, protection stays", () => {
    const view = render(
      <CardBadges
        card={card("card:1", 1, "Grizzly Bears", {
          counters: [{ name: "P1P1", count: 2 }],
          keywords: ["Protection from red", "Hexproof", "Trample", "Indestructible"],
          gained: ["Protection from red", "Hexproof", "Trample", "Indestructible"],
          indestructible: true,
        })}
        pile={false}
        room={room}
      />,
    );
    const c = view.container;
    expect(c.querySelector('[data-mark="kw:protection from red"]')).toBeTruthy();
    expect(c.querySelector('[data-mark="kw:hexproof"]')).toBeTruthy();
    expect(c.querySelector('[data-mark="indestructible"]')).toBeTruthy();
    // No room for a counter, three squares and the "··· N": trample folds
    // first, then the counter (0076's fold) -- never a protection square.
    expect(c.querySelector('[data-mark="kw:trample"]')).toBeNull();
    expect(c.querySelector('[data-counter="P1P1"]')).toBeNull();
    expect(c.querySelector('[data-counter="more"] .bf-badge-n')?.textContent).toBe("2");
    // Pointing still says what folded.
    expect(c.querySelector(".bf-badges")!.getAttribute("title")).toContain("Trample (gained)");
  });

  it("a counter, two protections, trample and haste: the keywords fold, the counter stays", () => {
    const view = render(
      <CardBadges
        card={card("card:1", 1, "Grizzly Bears", {
          counters: [{ name: "P1P1", count: 1 }],
          keywords: ["Hexproof", "Protection from red", "Trample", "Haste"],
          gained: ["Trample", "Haste"],
        })}
        pile={false}
        room={room}
      />,
    );
    const c = view.container;
    expect(c.querySelector('[data-counter="P1P1"]')).toBeTruthy();
    expect(c.querySelector('[data-mark="kw:hexproof"]')).toBeTruthy();
    expect(c.querySelector('[data-mark="kw:protection from red"]')).toBeTruthy();
    expect(c.querySelector(".bf-mark[data-folds]")).toBeNull();
    expect(c.querySelector('[data-counter="more"] .bf-badge-n')?.textContent).toBe("2");
  });

  it("two kinds of counter, two protections and trample: trample folds before any counter", () => {
    const view = render(
      <CardBadges
        card={card("card:1", 1, "Grizzly Bears", {
          counters: [
            { name: "P1P1", count: 1 },
            { name: "STUN", count: 1 },
          ],
          keywords: ["Hexproof", "Protection from red", "Trample"],
          gained: ["Trample"],
        })}
        pile={false}
        room={room}
      />,
    );
    const c = view.container;
    expect(c.querySelector('[data-counter="P1P1"]')).toBeTruthy();
    expect(c.querySelector('[data-mark="kw:trample"]')).toBeNull();
    expect(c.querySelector('[data-mark="kw:hexproof"]')).toBeTruthy();
    expect(c.querySelector('[data-mark="kw:protection from red"]')).toBeTruthy();
  });

  it("many gained keywords and every protection: never a protection square folded before them", () => {
    const view = render(
      <CardBadges
        card={card("card:1", 1, "Grizzly Bears", {
          keywords: ["Hexproof", "Protection from black", "Ward {1}"],
          gained: ["Flying", "Trample", "Haste", "Lifelink", "Menace", "Reach"],
        })}
        pile={false}
        room={room}
      />,
    );
    const c = view.container;
    for (const key of ["kw:hexproof", "kw:protection from black", "kw:ward {1}"])
      expect(c.querySelector(`[data-mark="${key}"]`), key).toBeTruthy();
    const shown = c.querySelectorAll(".bf-mark[data-folds]").length;
    expect(Number(c.querySelector('[data-counter="more"] .bf-badge-n')?.textContent)).toBe(
      6 - shown,
    );
  });

  it("with room for all, nothing folds", () => {
    const view = render(
      <CardBadges
        card={card("card:1", 1, "Grizzly Bears", {
          keywords: ["Hexproof"],
          gained: ["Trample"],
        })}
        pile={false}
        room={{ ...room, state: false }}
      />,
    );
    expect(view.container.querySelector('[data-counter="more"]')).toBeNull();
    expect(view.container.querySelectorAll(".bf-mark")).toHaveLength(2);
    expect(placeBadges([MARK_H, MARK_H], { ...room, state: false })![0]!.y).toBe(BADGE_FLOOR);
  });
});

// --- Amendment 1 · lost abilities --------------------------------------------------------------------

describe("Amendment 1 · Humility or Turn to Frog: a grey square; its printed marks drop and come back", () => {
  it("the grey square rises; the printed protection square goes while it lasts", () => {
    const walker = card("card:4", 1, "Kor Firewalker", { keywords: ["Protection from red"] });
    const view = render(draw([walker]));
    expect(markOn(view.container, "card:4", "kw:protection from red")).toBeTruthy();
    view.rerender(draw([{ ...walker, keywords: [], lostAbilities: true }]));
    const lost = markOn(view.container, "card:4", "lost")!;
    expect(lost.classList.contains("bf-mark-lost")).toBe(true);
    const riser = fights(view.container, "riser")[0]!;
    expect(riser.classList.contains("bf-fight-riser-lost")).toBe(true);
    expect(markOn(view.container, "card:4", "kw:protection from red")?.dataset["leaving"]).toBe(
      "true",
    );
    // It ends: the protection comes back, rising again.
    view.rerender(draw([walker]));
    expect(markOn(view.container, "card:4", "lost")?.dataset["leaving"]).toBe("true");
    expect(
      markOn(view.container, "card:4", "kw:protection from red")?.dataset["leaving"],
    ).toBeUndefined();
  });
});

// --- F-0085-E · what a card holds --------------------------------------------------------------------

describe("F-0085-E · Banishing Light and Fiend Hunter: a picture tab, and the card comes back out of exile", () => {
  const light = (holding: BoardCard["holding"]) =>
    card("card:10", 1, "Banishing Light", {
      kind: "other",
      types: "Enchantment",
      power: null,
      toughness: null,
      holding,
    });
  const angelHeld = {
    id: "card:20",
    name: "Serra Angel",
    known: true,
    art: "aa",
    crop: "cc",
    seat: 2,
  };

  it("the worker's link reaches the board, as each seat may know the card", () => {
    const exile = [
      row("card:20", 2, "Serra Angel", { art: "a".repeat(64) }),
      row("card:21", 1, "Face-down", { known: false, faceDown: true }),
    ];
    const rows = [
      row("card:10", 1, "Banishing Light", { kind: "other", holds: ["card:20"] }),
      row("card:11", 1, "Mosswort Bridge", { kind: "land", holds: ["card:21"] }),
    ];
    const board = boardFromSnapshot(snap(2, 1, { battlefield: rows, exile }), null).battlefield;
    expect(board[0]!.holding).toEqual([
      { id: "card:20", name: "Serra Angel", known: true, art: "a".repeat(64), crop: null, seat: 2 },
    ]);
    // The other player's face-down card: a back, no name, no picture.
    expect(board[1]!.holding).toEqual([
      { id: "card:21", name: "", known: false, art: null, crop: null, seat: 1 },
    ]);
  });

  it("the tab sits on the holder's edge after any Aura tabs; the neighbour makes room", () => {
    const elves = card("card:30", 1, "Oblivion Ring", {
      kind: "other",
      types: "Enchantment",
      power: null,
      toughness: null,
    });
    // The holder first in its line (it came in first), the other card after it.
    const first = { ...light([]), enteredAt: 0 };
    const gap = (holding: BoardCard["holding"]) => {
      const out = layout(
        { battlefield: [{ ...first, holding }, elves], hand: [], viewerSeat: 1 },
        size,
      );
      return {
        gap: out.boxes.get("card:30")!.x - out.boxes.get("card:10")!.x,
        tab: TAB_W * out.geometry.cardH * out.boxes.get("card:30")!.scale,
      };
    };
    const a = gap([]);
    const b = gap([angelHeld]);
    expect(b.gap - a.gap).toBeCloseTo(b.tab, 1);
    const view = render(draw([light([angelHeld]), elves]));
    const tab = view.container.querySelector<HTMLElement>(
      '.bf-tag-held[data-held-card="card:20"]',
    )!;
    expect(tab.dataset["heldBy"]).toBe("card:10");
    expect(tab.textContent).toBe("Serra Angel");
    expect(tab.querySelector("img")!.getAttribute("src")).toBe("/art/cc");
  });

  it("a face-down card held from the other player: a back, no name", () => {
    const view = render(
      draw([light([{ id: "card:21", name: "", known: false, art: null, crop: null, seat: 2 }])]),
    );
    const tab = view.container.querySelector<HTMLElement>(".bf-tag-held")!;
    expect(tab.textContent).toBe("");
    expect(tab.querySelector(".bf-tag-pic-back")).toBeTruthy();
    expect(tab.querySelector("img")).toBeNull();
  });

  it("the tab shows once the card has gone into exile, with a glow", () => {
    const view = render(draw([light([])]));
    calls.length = 0;
    view.rerender(draw([light([angelHeld])]));
    const tab = view.container.querySelector<HTMLElement>(".bf-tag-held")!;
    const grow = runsOf(tab).at(-1)!;
    expect(Number(grow.options.duration)).toBe(HELD_IN_MS);
    expect(delayOf(grow)).toBeGreaterThan(0);
    expect(grow.options.fill).toBe("backwards");
    expect(grow.frames[0]!.opacity).toBe(0);
  });

  it("Disenchant: the tab flies to Bob's exile pile, which glows, and the Angel rises out after it", () => {
    const view = render(draw([light([angelHeld])]));
    calls.length = 0;
    const angel = card("card:20", 2, "Serra Angel", { power: 4, toughness: 4 });
    view.rerender(
      draw([angel], {
        departures: new Map([["card:10", "viewer:graveyard"]]),
        tileMoves: [
          {
            card: "card:20",
            from: { zone: "exile", side: "opponent" },
            to: { zone: "battlefield", side: "opponent" },
            face: {
              name: "Serra Angel",
              kind: "creature",
              types: "Creature — Angel",
              power: 4,
              toughness: 4,
              art: null,
              crop: null,
              faceDown: false,
              known: true,
            },
            hidden: false,
            where: null,
          },
        ],
      }),
    );
    const flight = fights(view.container, "heldtab").find((m) => m.dataset["of"] === "card:20")!;
    expect(flight).toBeTruthy();
    expect(flight.textContent).toBe("Serra Angel");
    const run = runsOf(flight).at(-1)!;
    expect(Number(run.options.duration)).toBeGreaterThanOrEqual(HELD_FLY_MS);
    // Its last frame is half size and gone: it flew into the pile, not sank.
    expect(String(run.frames.at(-1)!.transform)).toMatch(/scale\(0\.500\)/);
    expect(run.frames.at(-1)!.opacity).toBe(0);
    // The Angel rises out of the pile once the tab is there, glowing gold.
    const slot = slotOf(view.container, "card:20");
    const rise = runsOf(slot).find((c) => Number(c.options.duration) === SHOW_MS)!;
    expect(delayOf(rise)).toBe(FREED_WAIT_MS);
    const glow = runsOf(slot.querySelector(".bf-card")!).find((c) =>
      String(c.frames[0]!.filter).includes("241, 195, 106"),
    );
    expect(glow && delayOf(glow)).toBe(FREED_WAIT_MS);
    const tile = view.container.querySelector('[data-zone-tile="opponent:exile"]')!;
    expect(runsOf(tile).some((c) => String(c.frames[2]!.boxShadow).includes("#f2c46a"))).toBe(true);
  });

  it("Chrome Mox shattered: the imprinted card sinks with its tab and never rises", () => {
    const mox = card("card:12", 1, "Chrome Mox", {
      kind: "other",
      types: "Artifact",
      power: null,
      toughness: null,
      holding: [{ ...angelHeld, id: "card:22", name: "Grizzly Bears", seat: 1 }],
    });
    const view = render(draw([mox]));
    calls.length = 0;
    view.rerender(draw([], { departures: new Map([["card:12", "viewer:graveyard"]]) }));
    const flight = fights(view.container, "heldtab")[0]!;
    expect(String(runsOf(flight).at(-1)!.frames.at(-1)!.transform)).toMatch(/scale\(0\.300\)/);
    const sink = heldFlyFrames(100, 0, 10, true, 0);
    expect(sink.duration).toBe(HELD_FLY_MS);
  });
});

// --- the report window waits for the board ----------------------------------------------------------

describe("the report window comes up once the board has shown what happened (the canvas's order)", () => {
  function Probe({ k, root }: { k: string | null; root: () => Element | null }) {
    const shown = useReportWait(k, root);
    return <span data-shown={shown ?? ""} />;
  }
  it("at once when nothing moves; after the board's animations while they run; a click hurries both", () => {
    const board = document.createElement("div");
    const running = {
      playState: "running",
      currentTime: 0,
      effect: { getComputedTiming: () => ({ endTime: 900, iterations: 1 }) },
    };
    let moving = true;
    (board as unknown as { getAnimations: () => unknown[] }).getAnimations = () =>
      moving ? [running] : [];
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    expect(boardMoving(board)).toBe(true);
    const view = render(<Probe k="r1" root={() => board} />);
    const shown = () => view.container.querySelector("span")!.dataset["shown"];
    expect(shown()).toBe("");
    // Something that starts after the report never holds it back.
    const later = { ...running };
    (board as unknown as { getAnimations: () => unknown[] }).getAnimations = () =>
      moving ? [running, later] : [later];
    act(() => frames.shift()!(0));
    expect(shown()).toBe("");
    running.playState = "finished";
    act(() => frames.shift()!(0));
    expect(shown()).toBe("r1");
    // Nothing moving: the next report at once.
    moving = false;
    later.playState = "finished";
    view.rerender(<Probe k="r2" root={() => board} />);
    expect(shown()).toBe("r2");
    running.playState = "running";
    // An endless glow never holds it back.
    moving = true;
    running.effect.getComputedTiming = () => ({ endTime: 900, iterations: Infinity });
    expect(boardMoving(board)).toBe(false);
  });
});
