// @vitest-environment jsdom

// Spec 0086 -- player counts, the crown and the initiative, dungeons,
// emblems, turns starting and mana coming in (F-0086-A..F and Amendment 1;
// owner on the canvas gaps-players-1113: 7 B badges in the tray, 8 the
// recommended set, 10 C + B, 11 A a ball per mana). The tray, the face
// marks, the flights layer and the turn's light as the game screen draws
// them, handed one board and then the next.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type StackView } from "./Board";
import { combatScript } from "./fixture";
import { BALL_LAG_MS } from "./manaBalls";
import {
  COUNT_PILL_MS,
  CountBadge,
  DungeonMap,
  EmblemTile,
  FaceMarks,
  MAP_LIFT_MS,
  MAP_STEP_AT,
  countKind,
  countStepMs,
  mapLayout,
  steppedCount,
} from "./playerMarks";
import {
  BALLS_ONE_BY_ONE,
  EMBLEM_AFTER_MS,
  EMBLEM_FLY_MS,
  HOLDER_FLY_MS,
  PlayerFlights,
  poolIn,
  poolOut,
} from "./flights";
import { heldPool, releaseAllPools } from "./poolHeld";
import { StatusTray } from "./StatusTray";
import { Rolling, TurnSweep, turnBecameYours, turnBeganFor, usePlateLight } from "./turnStart";
import { ReportMarkPicture } from "./RevealTray";
import { boardFromSnapshot } from "./fromSnapshot";
import { layout } from "./layout";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "../match";
import { useRef } from "react";

type Call = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: {
    onfinish: null | (() => void);
    oncancel: null | (() => void);
    playState: string;
    currentTime: number;
    rates: number[];
  };
};
const calls: Call[] = [];
let still = false;
const size = { width: 1920, height: 1080 };
beforeEach(() => {
  calls.length = 0;
  still = false;
  releaseAllPools();
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
    const animation = {
      onfinish: null as null | (() => void),
      oncancel: null as null | (() => void),
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      rates: [] as number[],
      cancel() {},
      finished: new Promise(() => {}),
      effect: {
        getComputedTiming: () => ({
          endTime: Number(options.duration ?? 0) + Number(options.delay ?? 0),
          iterations: 1,
        }),
      },
      updatePlaybackRate(rate: number) {
        animation.rates.push(rate);
      },
    };
    calls.push({ element: this, frames, options, animation });
    return animation;
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
    this: Element,
  ) {
    return calls.filter((c) => this.contains(c.element)).map((c) => c.animation);
  };
  // Where things are on the screen: every element gets a box (jsdom has none).
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const at = Number((this as HTMLElement).dataset?.["x"] ?? 100);
    return {
      left: at,
      top: at,
      width: 24,
      height: 24,
      right: at + 24,
      bottom: at + 24,
      x: at,
      y: at,
      toJSON: () => ({}),
    };
  });
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  releaseAllPools();
});

const finish = (c: Call) => act(() => c.animation.onfinish?.());

type Player = Snapshot["players"][number];
function player(over: Partial<Player> = {}): Player {
  return {
    seat: 1,
    name: "Alice",
    life: 20,
    handCount: 3,
    libraryCount: 38,
    graveyardCount: 3,
    counters: [],
    designations: [],
    command: [],
    ringTempted: 0,
    dungeonsCompleted: [],
    manaPool: {},
    ...over,
  };
}
function snap(
  over: Partial<Snapshot> = {},
  alice: Partial<Player> = {},
  bob: Partial<Player> = {},
): Snapshot {
  return {
    stateRevision: 1,
    gameEpoch: 1,
    dayTime: null,
    turn: 7,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    seat: 1,
    players: [player(alice), player({ seat: 2, name: "Bob", ...bob })],
    notices: [],
    battlefield: [],
    hand: [],
    otherHands: [],
    casting: [],
    graveyard: [],
    exile: [],
    stack: [],
    combat: null,
    damage: null,
    ...over,
  };
}

// --- 7 B: badges ---------------------------------------------------------------------------------

describe("energy and the other counts are badges with rising numbers (F-0086-A)", () => {
  it("Aether Hub's +1, Harnessed Lightning's +3 then -3: the number steps, a pill rises in the badge's colours", () => {
    const badge = (count: number) => (
      <CountBadge
        kind="energy"
        count={count}
        label="x"
        side="viewer"
        expanded={false}
        onClick={() => {}}
      />
    );
    const view = render(badge(1));
    const el = () => view.container.querySelector<HTMLElement>('[data-count-kind="energy"]')!;
    expect(el().textContent).toBe("1");
    expect(view.container.querySelector(".gs-count-pill")).toBeNull();
    calls.length = 0;
    view.rerender(badge(4));
    // The first point at once, then one every 90 ms (0077's pace).
    expect(el().dataset["shown"]).toBe("2");
    const pill = view.container.querySelector<HTMLElement>(".gs-count-pill")!;
    expect(pill.textContent).toBe("+3");
    expect(pill.querySelector("svg")).not.toBeNull();
    const rise = calls.find((c) => c.element === pill)!;
    expect(rise.options.duration).toBe(COUNT_PILL_MS);
    // The badge's swell is its clock: at its end the number is the board's.
    const clock = calls.find((c) => c.element === el())!;
    finish(clock);
    expect(el().dataset["shown"]).toBe("4");
    finish(rise);
    expect(view.container.querySelector(".gs-count-pill")).toBeNull();
    view.rerender(badge(1));
    expect(view.container.querySelector(".gs-count-pill")!.textContent).toBe("−3");
  });

  it("Aether Hub's first energy: the badge grows in with +1", () => {
    const tray = (over: Partial<Player>) => <StatusTray player={player(over)} side="viewer" />;
    const view = render(tray({}));
    view.rerender(tray({ counters: [{ name: "ENERGY", count: 1 }] }));
    const badge = view.container.querySelector('[data-count-kind="energy"]')!;
    expect(badge.querySelector(".gs-count-pill")!.textContent).toBe("+1");
    // On the first board seen it is simply there.
    const first = render(tray({ counters: [{ name: "ENERGY", count: 3 }] })).container;
    expect(first.querySelector('[data-count-kind="energy"] .gs-count-pill')).toBeNull();
  });

  it("steps point by point, never longer than 0.9 s", () => {
    expect(countStepMs(3)).toBe(90);
    expect(countStepMs(20)).toBe(45);
    expect(steppedCount(1, 4, 0)).toBe(2);
    expect(steppedCount(1, 4, 95)).toBe(3);
    expect(steppedCount(1, 4, 500)).toBe(4);
    expect(steppedCount(4, 1, 0)).toBe(3);
  });

  it("two kinds at once: Servant of the Conduit with Ezuri gives energy and experience, both badges; poison stays by the shield", () => {
    const c = render(
      <StatusTray
        player={player({
          counters: [
            { name: "ENERGY", count: 4 },
            { name: "EXPERIENCE", count: 2 },
            { name: "POISON", count: 2 },
          ],
        })}
        side="viewer"
      />,
    ).container;
    expect(
      [...c.querySelectorAll<HTMLElement>(".gs-count")].map((b) => b.dataset["countKind"]),
    ).toEqual(["energy", "experience"]);
    expect(c.querySelector('[data-count-kind="poison"]')).toBeNull();
    expect(countKind("TICKETS")).toBe("ticket");
    expect(countKind("RAD")).toBe("rad");
  });

  it("reduce motion: the number just changes, nothing rises", () => {
    still = true;
    const badge = (count: number) => (
      <CountBadge
        kind="energy"
        count={count}
        label="x"
        side="viewer"
        expanded={false}
        onClick={() => {}}
      />
    );
    const view = render(badge(1));
    view.rerender(badge(4));
    expect(view.container.querySelector<HTMLElement>(".gs-count")!.dataset["shown"]).toBe("4");
    expect(view.container.querySelector(".gs-count-pill")).toBeNull();
  });

  it("a click hurries the pill (A-00)", () => {
    const badge = (count: number) => (
      <CountBadge
        kind="energy"
        count={count}
        label="x"
        side="viewer"
        expanded={false}
        onClick={() => {}}
      />
    );
    const view = render(badge(1));
    view.rerender(badge(4));
    const rise = calls.find((c) => c.element.classList.contains("gs-count-pill"))!;
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(rise.animation.rates.length).toBeGreaterThan(0);
  });

  it("Amendment 1: the city's blessing grows in with a gold pulse; the Ring's count ticks +1", () => {
    const tray = (over: Partial<Player>) => <StatusTray player={player(over)} side="viewer" />;
    const view = render(tray({}));
    calls.length = 0;
    view.rerender(tray({ designations: ["city's blessing"], ringTempted: 1 }));
    const blessing = view.container.querySelector<HTMLElement>('[data-count-kind="blessing"]')!;
    const grow = calls.find((c) => c.element === blessing)!;
    expect(String(grow.frames[1]!.filter)).toContain("#f2c95c");
    view.rerender(tray({ designations: ["city's blessing"], ringTempted: 2 }));
    const ring = view.container.querySelector<HTMLElement>('[data-count-kind="ring"]')!;
    expect(ring.querySelector(".gs-count-pill")!.textContent).toBe("+1");
  });
});

// --- 8: the crown and the initiative -----------------------------------------------------------

describe("the crown and the initiative on the face, flying face to face (F-0086-B)", () => {
  it("the monarch wears the crown on the face, the initiative its corner; each glows while its trigger waits", () => {
    const c = render(
      <FaceMarks
        seat={1}
        designations={["monarch", "initiative"]}
        stack={[
          {
            id: "stack:3",
            description: "",
            source: "card:90",
            name: "The Monarch",
            controller: 1,
            kind: "trigger",
            targets: [],
            art: null,
            manaCost: null,
            from: "monarch",
          },
        ]}
      />,
    ).container;
    const crown = c.querySelector<HTMLElement>('[data-holder="monarch"]')!;
    expect(crown.dataset["riseFrom"]).toBe("monarch:1");
    expect(crown.classList.contains("gs-holder-glow")).toBe(true);
    const init = c.querySelector<HTMLElement>('[data-holder="initiative"]')!;
    expect(init.dataset["riseFrom"]).toBe("initiative:1");
    expect(init.classList.contains("gs-holder-glow")).toBe(false);
  });

  function faces(b: Snapshot) {
    return (
      <div>
        {b.players.map((p) => (
          <span key={p.seat} className="gs-life-face" data-x={p.seat === 1 ? 600 : 20}>
            <FaceMarks seat={p.seat} designations={p.designations} stack={b.stack} />
          </span>
        ))}
        <PlayerFlights board={b} />
      </div>
    );
  }

  it("combat damage takes the crown: it lifts off Bob's face and flies to Alice's, landing with a pulse", () => {
    const before = snap({}, {}, { designations: ["monarch"] });
    const view = render(faces(before));
    calls.length = 0;
    view.rerender(faces(snap({ stateRevision: 2 }, { designations: ["monarch"] })));
    const copy = document.querySelector<HTMLElement>(".gs-flights .gs-flight-copy")!;
    expect(copy).not.toBeNull();
    const flight = calls.find((c) => c.element === copy)!;
    expect(flight.options.duration).toBe(HOLDER_FLY_MS);
    // It grows a little on the way (up to x1.7) and glows gold.
    expect(flight.frames.some((f) => /scale\(1\.[5-7]/.test(String(f.transform)))).toBe(true);
    expect(String(flight.frames[8]!.filter)).toContain("#f2c46a");
    // Alice's crown waits hidden until it lands, then pulses.
    const crown = view.container.querySelector('[data-holder="monarch"][data-seat="1"]')!;
    const held = calls.filter((c) => c.element === crown);
    expect(held[0]!.frames).toEqual([{ opacity: 0 }, { opacity: 0 }]);
    expect(held[0]!.options.duration).toBe(HOLDER_FLY_MS);
    expect(held[1]!.options.delay).toBe(HOLDER_FLY_MS);
    // A click hurries the flight and the landing (A-00).
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(flight.animation.rates.length).toBeGreaterThan(0);
    expect(held[1]!.animation.rates.length).toBeGreaterThan(0);
  });

  it("the initiative flies the same way; held for the first time it grows in", () => {
    const view = render(faces(snap()));
    calls.length = 0;
    view.rerender(faces(snap({ stateRevision: 2 }, {}, { designations: ["initiative"] })));
    const token = view.container.querySelector('[data-holder="initiative"][data-seat="2"]')!;
    expect(calls.find((c) => c.element === token)!.frames[0]!.transform).toBe("scale(0)");
    expect(document.querySelector(".gs-flights .gs-flight-copy")).toBeNull();
    calls.length = 0;
    view.rerender(faces(snap({ stateRevision: 3 }, { designations: ["initiative"] })));
    expect(document.querySelector(".gs-flights .gs-flight-copy")).not.toBeNull();
  });

  it("reduce motion: nothing flies; the crown is simply on the new face", () => {
    still = true;
    const view = render(faces(snap({}, {}, { designations: ["monarch"] })));
    view.rerender(faces(snap({ stateRevision: 2 }, { designations: ["monarch"] })));
    expect(document.querySelector(".gs-flights .gs-flight-copy")).toBeNull();
    expect(view.container.querySelector('[data-holder="monarch"]')!.getAttribute("data-seat")).toBe(
      "1",
    );
  });
});

// --- 8: the dungeon ----------------------------------------------------------------------------

const UNDERCITY = [
  { name: "Secret Entrance", says: "Search.", next: ["Forge", "Lost Well"], here: false },
  { name: "Forge", says: "Counters.", next: ["Trap!"], here: false },
  { name: "Lost Well", says: "Scry 2.", next: ["Trap!"], here: false },
  { name: "Trap!", says: "5 damage.", next: [], here: false },
];
const at = (here: string) => UNDERCITY.map((r) => ({ ...r, here: r.name === here }));

describe("the dungeon is a map card whose marker steps (F-0086-C)", () => {
  it("lays the rooms out by level from the game's own paths", () => {
    const plan = mapLayout(at("Secret Entrance"));
    const x = plan.rooms.map((r) => Math.round(r.x));
    expect(x[0]).toBeLessThan(x[1]!);
    expect(x[1]).toBe(x[2]);
    expect(x[3]).toBeGreaterThan(x[1]!);
    expect(plan.rooms[1]!.y).not.toBe(plan.rooms[2]!.y);
    expect(plan.paths).toHaveLength(4);
  });

  it("ventures: the map lifts, the gold marker steps to the next room, and it settles", () => {
    const map = (here: string) => (
      <DungeonMap
        id="card:77"
        name="Undercity"
        rooms={at(here)}
        side="viewer"
        expanded={false}
        onClick={() => {}}
        fresh={false}
      />
    );
    const view = render(map("Secret Entrance"));
    const el = view.container.querySelector<HTMLElement>(".gs-map")!;
    expect(el.dataset["riseFrom"]).toBe("card:77");
    calls.length = 0;
    view.rerender(map("Lost Well"));
    expect(el.dataset["room"]).toBe("Lost Well");
    const lift = calls.find((c) => c.element === el && c.options.duration === MAP_LIFT_MS)!;
    expect(String(lift.frames[1]!.transform)).toContain("scale(2.6)");
    expect(lift.frames[3]!.transform).toBe("none");
    const marker = calls.find((c) => c.element.classList.contains("gs-map-marker"))!;
    expect(marker.options.delay).toBe(MAP_STEP_AT);
    const plan = mapLayout(at("Lost Well"));
    expect(marker.frames[0]!.left).toBe(`${(plan.rooms[0]!.x / 66) * 100}%`);
    expect(marker.frames[2]!.left).toBe(`${(plan.rooms[2]!.x / 66) * 100}%`);
  });

  it("completing it: the map card shrinks away from the tray; the other player's report shows its map", () => {
    const tray = (command: string[], words: Player["commandWords"]) => (
      <StatusTray
        player={player({ command, commandWords: words, commandIds: ["card:77"] })}
        side="viewer"
      />
    );
    const view = render(
      tray(["Undercity (room: Trap!)"], [{ name: "Undercity", rooms: at("Trap!") }]),
    );
    view.rerender(tray([], []));
    expect(view.container.querySelector("[data-leaving] .gs-map")).not.toBeNull();
    const shrink = calls.find((c) => c.element.hasAttribute("data-leaving"))!;
    finish(shrink);
    expect(view.container.querySelector("[data-leaving]")).toBeNull();
    const pic = render(
      <ReportMarkPicture mark={{ kind: "dungeon", dungeon: "Undercity" }} />,
    ).container;
    expect(pic.querySelector(".gs-reveal-mark-dungeon")!.getAttribute("aria-label")).toBe(
      "Undercity, completed",
    );
  });
});

// --- 8: emblems --------------------------------------------------------------------------------

describe("an emblem grows out of its ability and flies to its tile (F-0086-D)", () => {
  it("is a square tile with its planeswalker's picture, its words when pointed at", () => {
    const c = render(
      <EmblemTile
        id="card:70"
        name="Sorin, Lord of Innistrad's emblem"
        emblem={{
          id: "card:70",
          seat: 1,
          from: "card:5",
          name: "Sorin, Lord of Innistrad",
          crop: "crop1",
          art: "art1",
        }}
        says="Creatures you control get +1/+0."
        artUrl={(a) => `/p/${a}`}
        expanded={false}
        onClick={() => {}}
        fresh={false}
      />,
    ).container;
    const tile = c.querySelector<HTMLElement>(".gs-emblem")!;
    expect(tile.querySelector("img")!.getAttribute("src")).toBe("/p/crop1");
    expect(tile.title).toContain("Creatures you control get +1/+0.");
    expect(tile.dataset["riseFrom"]).toBe("card:70");
  });

  it("leaves Sorin's ability on the stack and flies into the tray", () => {
    const ability = {
      id: "stack:4",
      description: "",
      source: "card:5",
      name: "Sorin, Lord of Innistrad",
      controller: 1,
      kind: "ability",
      targets: [],
      art: null,
      manaCost: null,
    };
    const scene = (b: Snapshot) => (
      <div>
        {b.stack.map((s) => (
          <button key={s.id} data-object-id={s.id} data-x={700} />
        ))}
        <StatusTray
          player={b.players[0]!}
          side="viewer"
          emblems={b.emblems ?? []}
          artUrl={(a) => a}
        />
        <PlayerFlights board={b} />
      </div>
    );
    const view = render(scene(snap({ stack: [ability] })));
    calls.length = 0;
    view.rerender(
      scene(
        snap(
          {
            stateRevision: 2,
            emblems: [{ id: "card:70", seat: 1, from: "card:5", name: "Sorin, Lord of Innistrad" }],
          },
          { command: ["Emblem — Sorin, Lord of Innistrad"], commandIds: ["card:70"] },
        ),
      ),
    );
    const copy = document.querySelector<HTMLElement>(".gs-flights .gs-flight-copy")!;
    const flight = calls.find((c) => c.element === copy)!;
    expect(flight.options.duration).toBe(EMBLEM_FLY_MS);
    // Once the ability has resolved (its card's glow), growing out of it.
    expect(flight.options.delay).toBe(EMBLEM_AFTER_MS);
    // From the stack card (x 700) to the tile (x 100).
    expect(String(flight.frames[0]!.transform)).toContain("translate(700px");
    const tile = view.container.querySelector('[data-emblem="card:70"]')!;
    expect(
      calls.find(
        (c) => c.element === tile && c.options.duration === EMBLEM_AFTER_MS + EMBLEM_FLY_MS,
      )!.frames[0],
    ).toEqual({
      opacity: 0,
    });
  });
});

// --- 10: turn start ----------------------------------------------------------------------------

function Plate({ board, seat }: { board: Snapshot; seat: number }) {
  const run = useRef<HTMLSpanElement>(null);
  const shield = useRef<HTMLButtonElement>(null);
  usePlateLight(board, seat, run, shield);
  return (
    <div className="gs-seat" data-seat={seat}>
      <span ref={run} className="gs-seat-run" />
      <button ref={shield} className="gs-life" />
    </div>
  );
}

describe("a turn starts: the plate lights, the sweep only toward you (F-0086-E)", () => {
  it("every turn the new active player's plate lights: a light along its top edge, the shield glows", () => {
    const plates = (b: Snapshot) => (
      <>
        <Plate board={b} seat={1} />
        <Plate board={b} seat={2} />
      </>
    );
    const view = render(plates(snap({ turn: 7, activeSeat: 2 })));
    calls.length = 0;
    view.rerender(plates(snap({ turn: 8, activeSeat: 1, stateRevision: 2 })));
    const run1 = view.container.querySelector('[data-seat="1"] .gs-seat-run')!;
    const run2 = view.container.querySelector('[data-seat="2"] .gs-seat-run')!;
    expect(calls.filter((c) => c.element === run1)).toHaveLength(1);
    expect(calls.filter((c) => c.element === run2)).toHaveLength(0);
    const shield = view.container.querySelector('[data-seat="1"] .gs-life')!;
    expect(String(calls.find((c) => c.element === shield)!.frames[1]!.filter)).toContain("12px");
    // Time Warp: turn 9 is Alice's again -- her plate lights again.
    calls.length = 0;
    view.rerender(plates(snap({ turn: 9, activeSeat: 1, stateRevision: 3 })));
    expect(calls.filter((c) => c.element === run1)).toHaveLength(1);
  });

  it("the sweep only when the turn becomes yours: not on theirs, not on your extra turn, never to a spectator", () => {
    const was = snap({ turn: 7, activeSeat: 2 });
    expect(turnBecameYours(was, snap({ turn: 8, activeSeat: 1 }))).toBe(true);
    expect(
      turnBecameYours(snap({ turn: 8, activeSeat: 1 }), snap({ turn: 9, activeSeat: 2 })),
    ).toBe(false);
    expect(
      turnBecameYours(snap({ turn: 8, activeSeat: 1 }), snap({ turn: 9, activeSeat: 1 })),
    ).toBe(false);
    expect(turnBecameYours(was, snap({ turn: 8, activeSeat: 1, spectator: true }))).toBe(false);
    expect(
      turnBeganFor(snap({ turn: 8, activeSeat: 1 }), snap({ turn: 9, activeSeat: 1 }), 1),
    ).toBe(true);
    const geometry = layout({ battlefield: [], hand: [], viewerSeat: 1 }, size).geometry;
    const view = render(<TurnSweep board={was} geometry={geometry} />);
    view.rerender(
      <TurnSweep board={snap({ turn: 8, activeSeat: 1, stateRevision: 2 })} geometry={geometry} />,
    );
    expect(view.container.querySelector(".gs-turn-sweep")).not.toBeNull();
    const sweep = calls.find((c) => c.element.classList.contains("gs-turn-sweep"))!;
    finish(sweep);
    expect(view.container.querySelector(".gs-turn-sweep")).toBeNull();
    view.rerender(
      <TurnSweep board={snap({ turn: 9, activeSeat: 2, stateRevision: 3 })} geometry={geometry} />,
    );
    expect(view.container.querySelector(".gs-turn-sweep")).toBeNull();
  });

  it("the turn number and the words roll over; with reduce motion they just change", () => {
    const view = render(<Rolling value="7" />);
    view.rerender(<Rolling value="8" />);
    expect(view.container.querySelector(".gs-roll-old")!.textContent).toBe("7");
    expect(view.container.querySelector(".gs-roll-new")!.textContent).toBe("8");
    const roll = calls.find((c) => c.element.classList.contains("gs-roll-new"))!;
    expect(roll.frames[0]!.transform).toBe("translateY(100%)");
    finish(roll);
    expect(view.container.querySelector(".gs-roll-old")).toBeNull();
    still = true;
    view.rerender(<Rolling value="9" />);
    expect(view.container.querySelector(".gs-roll-old")).toBeNull();
    expect(view.container.textContent).toBe("9");
  });
});

// --- 11: mana in -------------------------------------------------------------------------------

describe("mana flies into the pool, a ball per mana (F-0086-F)", () => {
  const scene = (b: Snapshot) => (
    <div>
      {b.battlefield.map((c) => (
        <button key={c.id} className="bf-card" data-object-id={c.id} data-x={500} />
      ))}
      {b.stack.map((s) => (
        <button key={s.id} data-object-id={s.id} data-x={700} />
      ))}
      <StatusTray player={b.players[0]!} side="viewer" />
      <PlayerFlights board={b} />
    </div>
  );
  const swamp = {
    id: "card:1",
    seat: 1,
    name: "Swamp",
    kind: "land",
    tapped: true,
  } as unknown as Snapshot["battlefield"][number];

  it("works out what came in, from where, and what went out: spent or lost", () => {
    expect(
      poolIn(
        player({ manaPool: { B: 1 }, manaFrom: [{ colour: "B", from: "card:1", n: 1 }] }),
        player({
          manaPool: { B: 4 },
          manaFrom: [
            { colour: "B", from: "card:1", n: 1 },
            { colour: "B", from: "card:9", n: 3 },
          ],
        }),
      ),
    ).toEqual([{ colour: "B", from: "card:9", n: 3 }]);
    expect(
      poolOut(player({ manaPool: { B: 3 } }), player({ manaPool: {} }), { B: 3 }, false),
    ).toEqual([{ colour: "B", spent: 3, lost: 0 }]);
    expect(poolOut(player({ manaPool: { B: 1 } }), player({ manaPool: {} }), {}, true)).toEqual([
      { colour: "B", spent: 0, lost: 1 },
    ]);
    // Gone in the same step with no payment told yet: spent, never "lost".
    expect(poolOut(player({ manaPool: { B: 1 } }), player({ manaPool: {} }), {}, false)).toEqual([
      { colour: "B", spent: 1, lost: 0 },
    ]);
  });

  it("the Swamp's black: a ball from the Swamp; the chip's count waits for it, then steps up with +1", () => {
    const view = render(scene(snap({ battlefield: [swamp] })));
    calls.length = 0;
    view.rerender(
      scene(
        snap(
          { stateRevision: 2, battlefield: [swamp] },
          { manaPool: { B: 1 }, manaFrom: [{ colour: "B", from: "card:1", n: 1 }] },
        ),
      ),
    );
    const chip = view.container.querySelector<HTMLElement>('[data-pool="1:B"]')!;
    expect(chip.dataset["shown"]).toBe("0");
    expect(chip.style.visibility).toBe("hidden");
    const balls = calls.filter(
      (c) => c.element.classList.contains("gs-flight") && !c.element.textContent,
    );
    const head = balls.find(
      (c) => String(c.frames[1]!.transform).length > 0 && c.options.delay === 0,
    )!;
    expect(String(head.frames[0]!.transform)).toMatch(/translate\(50\d/);
    expect(heldPool("1:B")).toBe(1);
    finish(head);
    expect(heldPool("1:B")).toBe(0);
    expect(chip.dataset["shown"]).toBe("1");
    expect(document.querySelector(".gs-flights .gs-count-pill")!.textContent).toBe("+1");
  });

  it("Dark Ritual's three: three balls from the spell on the stack, the count stepping 1, 2, 3, with +3", () => {
    const ritual = {
      id: "stack:8",
      description: "",
      source: "card:9",
      name: "Dark Ritual",
      controller: 1,
      kind: "spell",
      targets: [],
      art: null,
      manaCost: "{B}",
    };
    const view = render(scene(snap({ stack: [ritual] })));
    calls.length = 0;
    view.rerender(
      scene(
        snap(
          { stateRevision: 2 },
          { manaPool: { B: 3 }, manaFrom: [{ colour: "B", from: "card:9", n: 3 }] },
        ),
      ),
    );
    const heads = calls.filter(
      (c) => c.element.classList.contains("gs-flight") && c.frames.length > 4,
    );
    const fromRitual = heads.filter((c) => String(c.frames[0]!.transform).includes("translate(7"));
    expect(fromRitual.length).toBeGreaterThanOrEqual(3);
    const chip = () => view.container.querySelector<HTMLElement>('[data-pool="1:B"]')!;
    expect(chip().dataset["shown"]).toBe("0");
    const delays = [...new Set(fromRitual.map((c) => c.options.delay))];
    expect(delays.slice(0, 3)).toEqual([0, BALL_LAG_MS, 2 * BALL_LAG_MS]);
    const first = fromRitual.filter((c) => c.options.delay === 0)[0]!;
    finish(first);
    expect(chip().dataset["shown"]).toBe("1");
    expect(document.querySelector(".gs-flights .gs-count-pill")!.textContent).toBe("+3");
  });

  it(`past ${BALLS_ONE_BY_ONE} from one source (Cabal Coffers for 12): one larger ball with ×12`, () => {
    const coffers = { ...swamp, id: "card:3", name: "Cabal Coffers" };
    const view = render(scene(snap({ battlefield: [coffers] })));
    calls.length = 0;
    view.rerender(
      scene(
        snap(
          { stateRevision: 2, battlefield: [coffers] },
          { manaPool: { B: 12 }, manaFrom: [{ colour: "B", from: "card:3", n: 12 }] },
        ),
      ),
    );
    const big = document.querySelector<HTMLElement>(".gs-flights .gs-flight-big")!;
    expect(big.textContent).toBe("×12");
    finish(calls.find((c) => c.element === big)!);
    expect(view.container.querySelector<HTMLElement>('[data-pool="1:B"]')!.dataset["shown"]).toBe(
      "12",
    );
  });

  it("spending keeps 0062's balls, with a rising −N; lost at the end of the step, a grey −N and the balls fade", () => {
    const pooled = snap({}, { manaPool: { B: 3 } });
    const view = render(scene(pooled));
    calls.length = 0;
    view.rerender(
      scene(
        snap({
          stateRevision: 2,
          payments: [
            {
              n: 5,
              seat: 1,
              payment: 1,
              for: "card:12",
              kind: "cast",
              cost: "{1}{B}{B}",
              owing: null,
              mana: [0, 1, 2].map(() => ({ colour: "B", shard: "B", from: "pool" })),
            },
          ],
        }),
      ),
    );
    const spent = document.querySelector<HTMLElement>(".gs-flights .gs-count-pill")!;
    expect(spent.textContent).toBe("−3");
    expect(spent.style.borderColor).not.toBe("rgb(183, 189, 198)");
    document.querySelectorAll(".gs-flights > *").forEach((e) => e.remove());
    const kept = render(scene(snap({}, { manaPool: { B: 1 } })));
    kept.rerender(scene(snap({ stateRevision: 2, phase: "COMBAT_BEGIN" })));
    const lost = [...document.querySelectorAll<HTMLElement>(".gs-flights .gs-count-pill")].pop()!;
    expect(lost.textContent).toBe("−1");
    expect(lost.style.borderColor).toBe("rgb(183, 189, 198)");
  });

  it("reduce motion: no ball; the count is the board's at once", () => {
    still = true;
    const view = render(scene(snap({ battlefield: [swamp] })));
    view.rerender(
      scene(
        snap(
          { stateRevision: 2, battlefield: [swamp] },
          { manaPool: { B: 1 }, manaFrom: [{ colour: "B", from: "card:1", n: 1 }] },
        ),
      ),
    );
    expect(document.querySelector(".gs-flights .gs-flight")).toBeNull();
    expect(view.container.querySelector<HTMLElement>('[data-pool="1:B"]')!.dataset["shown"]).toBe(
      "1",
    );
  });
});

// --- energy's sparks; the Ring --------------------------------------------------------------------

describe("energy paid sends sparks; the Ring flies between bearers", () => {
  it("Harnessed Lightning pays 3 energy: three sparks from the badge to the spell", () => {
    const hl = {
      id: "stack:6",
      description: "",
      source: "card:31",
      name: "Harnessed Lightning",
      controller: 1,
      kind: "spell",
      targets: [],
      art: null,
      manaCost: "{1}{R}",
    };
    const scene = (b: Snapshot) => (
      <div>
        {b.stack.map((s) => (
          <button key={s.id} data-object-id={s.id} data-x={700} />
        ))}
        <StatusTray player={b.players[0]!} side="viewer" />
        <PlayerFlights board={b} />
      </div>
    );
    const view = render(scene(snap({ stack: [hl] }, { counters: [{ name: "ENERGY", count: 4 }] })));
    calls.length = 0;
    view.rerender(scene(snap({ stateRevision: 2 }, { counters: [{ name: "ENERGY", count: 1 }] })));
    const sparks = calls.filter(
      (c) =>
        c.element.classList.contains("gs-flight") &&
        /e8c547|232, 197, 71/i.test(c.element.getAttribute("style") ?? ""),
    );
    expect(sparks.length).toBe(3);
    expect(String(sparks[0]!.frames[sparks[0]!.frames.length - 1]!.transform)).toContain(
      "translate(7",
    );
  });

  it("Amendment 1: the gold ring flies from the old Ring-bearer to the new", () => {
    const bearer = (id: string) =>
      ({
        id,
        seat: 1,
        name: "Bears",
        kind: "creature",
        ringBearer: true,
      }) as unknown as Snapshot["battlefield"][number];
    const scene = (b: Snapshot) => (
      <div>
        {b.battlefield.map((c) => (
          <button
            key={c.id}
            className="bf-card"
            data-object-id={c.id}
            data-x={c.id === "card:1" ? 300 : 900}
          >
            <span className="bf-mark bf-mark-ring" data-x={c.id === "card:1" ? 300 : 900} />
          </button>
        ))}
        <PlayerFlights board={b} />
      </div>
    );
    const view = render(scene(snap({ battlefield: [bearer("card:1")] })));
    calls.length = 0;
    view.rerender(scene(snap({ stateRevision: 2, battlefield: [bearer("card:2")] })));
    const copy = document.querySelector<HTMLElement>(".gs-flights .gs-flight-copy")!;
    const flight = calls.find((c) => c.element === copy)!;
    expect(String(flight.frames[0]!.transform)).toContain("translate(300px");
    expect(String(flight.frames[flight.frames.length - 1]!.transform)).toContain("translate(900px");
  });
});

// --- Amendment 1: triggers rise from their pictures --------------------------------------------

describe("Amendment 1: a trigger rises from its picture in the rail", () => {
  it("the worker's `from` and a command card's id say where (fromSnapshot)", () => {
    const state = snap({
      stack: [
        {
          id: "stack:2",
          description: "",
          source: "card:90",
          name: "The Monarch",
          controller: 1,
          kind: "trigger",
          targets: [],
          art: null,
          manaCost: null,
          from: "monarch",
        },
        {
          id: "stack:3",
          description: "",
          source: "card:77",
          name: "Undercity",
          controller: 2,
          kind: "trigger",
          targets: [],
          art: null,
          manaCost: null,
        },
      ],
    });
    const view = boardFromSnapshot(state, null);
    expect(view.stack.map((s) => s.riseFrom)).toEqual(["monarch:1", "card:77"]);
  });

  it("the Board raises it from the crown, not the stack spot", () => {
    const s8 = combatScript(8);
    const trigger: StackView = {
      id: "stack:9",
      name: "The Monarch",
      by: "Alice",
      seat: 1,
      kind: "trigger",
      source: null,
      riseFrom: "monarch:1",
      targets: [],
    };
    const crown = document.createElement("span");
    crown.dataset["riseFrom"] = "monarch:1";
    document.body.appendChild(crown);
    const board = (stack: StackView[]) => (
      <Board
        battlefield={s8.board.battlefield}
        hand={s8.board.hand}
        viewerSeat={s8.board.viewerSeat}
        artUrl={(a) => a}
        stack={stack}
      />
    );
    const view = render(board([]));
    view.rerender(board([trigger]));
    const slot = view.container
      .querySelector('[data-object-id="stack:9"]')!
      .closest<HTMLElement>(".bf-slot")!;
    expect(slot.dataset["rising"]).toBe("true");
    crown.remove();
  });

  it("also when its picture comes with the same board (the initiative taken and its venture at once)", () => {
    const s8 = combatScript(8);
    const trigger: StackView = {
      id: "stack:9",
      name: "The Initiative",
      by: "Bob",
      seat: 2,
      kind: "trigger",
      source: null,
      riseFrom: "initiative:2",
      targets: [],
    };
    const board = (stack: StackView[], rail: boolean) => (
      <Board
        battlefield={s8.board.battlefield}
        hand={s8.board.hand}
        viewerSeat={s8.board.viewerSeat}
        artUrl={(a) => a}
        stack={stack}
        rail={rail ? <span data-rise-from="initiative:2" data-x={40} /> : undefined}
      />
    );
    const view = render(board([], false));
    calls.length = 0;
    view.rerender(board([trigger], true));
    const slot = view.container
      .querySelector('[data-object-id="stack:9"]')!
      .closest<HTMLElement>(".bf-slot")!;
    expect(slot.style.animation).toBe("none");
    const rise = calls.find((c) => c.element === slot)!;
    expect(rise.frames[0]!.opacity).toBe(0);
  });
});

// --- a trigger caused by combat damage waits for the hit -------------------------------------

describe("a trigger the hit caused rises only once the hit has landed", () => {
  const bear = (id: string): BoardCard => ({
    id,
    seat: 1,
    name: "Grizzly Bears",
    kind: "creature",
    types: "Creature — Bear",
    tapped: true,
    attacking: true,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: 2,
    toughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: 1,
    art: null,
  });
  const draw = (
    stack: StackView[],
    damage: NonNullable<Parameters<typeof Board>[0]["damage"]> | null,
    rail: boolean,
  ) => (
    <Board
      battlefield={[bear("card:1"), { ...bear("card:2"), enteredAt: 2 }]}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(a) => a}
      stack={stack}
      combat={null}
      damage={damage}
      {...(rail ? { rail: <span data-rise-from="monarch:2" data-x={40} /> } : {})}
    />
  );
  const monarch: StackView = {
    id: "stack:9",
    name: "The Monarch",
    by: "Bob",
    seat: 2,
    kind: "trigger",
    source: null,
    riseFrom: "monarch:2",
    targets: [],
  };
  const wave = {
    key: "w9",
    combat: "regular" as const,
    hits: [
      { source: "card:1", target: { player: 2 }, amount: 2 },
      { source: "card:2", target: { player: 2 }, amount: 2 },
    ],
    fights: ["card:1", "card:2"].map((attacker) => ({
      attacker,
      defender: { player: 2 },
      blockers: [],
    })),
  };

  it("the Bears lunge, Bob's -4 lands, then the monarch's trigger rises from his crown", () => {
    const view = render(draw([], null, true));
    calls.length = 0;
    view.rerender(draw([monarch], wave, true));
    const clock = calls.find((c) => c.options.id === "fight-clock")!;
    expect(clock).toBeDefined();
    const slot = view.container
      .querySelector('[data-object-id="stack:9"]')!
      .closest<HTMLElement>(".bf-slot")!;
    const rise = calls.find((c) => c.element === slot)!;
    // Not before the fights' clock has played out; hidden until then.
    expect(rise.options.delay).toBe(clock.options.duration);
    expect(Number(rise.options.delay)).toBeGreaterThan(0);
    expect(rise.options.fill).toBe("backwards");
    expect(rise.frames[0]!.opacity).toBe(0);
  });

  it("Amendment 3: the line under the stack waits for its card -- held for the fights, then rising", () => {
    vi.useFakeTimers();
    const view = render(draw([], null, true));
    view.rerender(draw([monarch], wave, true));
    const caption = () => view.container.querySelector(".bf-stack-caption")?.textContent ?? null;
    // Held for the Bears' blows: no words for a card not there yet.
    expect(caption()).toBeNull();
    const clock = calls.find((c) => c.options.id === "fight-clock")!;
    act(() => {
      vi.advanceTimersByTime(Number(clock.options.duration) - 10);
    });
    expect(caption()).toBeNull();
    // It lands (its rise's end; here the fall-back timer): the words come with it.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(caption()).toBe("Next: Bob's trigger");
  });

  it("Amendment 3: a card already there keeps its words while a new one arrives on top", () => {
    vi.useFakeTimers();
    const bolt: StackView = {
      id: "stack:3",
      name: "Lightning Bolt",
      by: "Alice",
      seat: 1,
      kind: "spell",
      source: null,
      targets: [],
    };
    const view = render(draw([bolt], null, true));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const caption = () => view.container.querySelector(".bf-stack-caption")?.textContent ?? null;
    expect(caption()).toBe("Next: your Lightning Bolt");
    view.rerender(draw([monarch, bolt], null, true));
    // The trigger still rising: the line tells only what has landed.
    expect(caption()).toBe("Next: your Lightning Bolt");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(caption()).toBe("Next: Bob's trigger · 2 on the stack");
  });

  it("with no fights playing it rises at once", () => {
    const view = render(draw([], null, true));
    calls.length = 0;
    view.rerender(draw([monarch], null, true));
    const slot = view.container
      .querySelector('[data-object-id="stack:9"]')!
      .closest<HTMLElement>(".bf-slot")!;
    expect(calls.find((c) => c.element === slot)!.options.delay).toBe(0);
  });
});

// --- the snapshot ------------------------------------------------------------------------------

describe("the new fields are read from the snapshot", () => {
  it("manaFrom, commandIds, emblems, a stack entry's from, a dungeon report mark", () => {
    const m = reduceMatch(EMPTY_MATCH, {
      type: "MATCH_SNAPSHOT",
      state: {
        stateRevision: 3,
        seat: 1,
        players: [
          {
            seat: 1,
            name: "Alice",
            manaPool: { B: 4 },
            manaFrom: [
              { colour: "B", from: "card:1", n: 1 },
              { colour: "B", from: "card:9", n: 3 },
              { colour: "B", n: 0 },
            ],
            command: ["Emblem — Sorin, Lord of Innistrad"],
            commandIds: ["card:70"],
          },
        ],
        emblems: [
          { id: "card:70", seat: 1, from: "card:5", name: "Sorin, Lord of Innistrad", known: true },
        ],
        stack: [
          {
            id: "stack:1",
            source: "card:90",
            name: "The Monarch",
            controller: 1,
            kind: "trigger",
            from: "monarch",
          },
        ],
        action: {
          key: "action:1",
          by: 1,
          source: "Tomb of Annihilation",
          said: "Alice completed Tomb of Annihilation.",
          cards: [],
          marks: [{ kind: "dungeon", dungeon: "Tomb of Annihilation" }],
        },
      },
    });
    const s = m.board!;
    expect(s.players[0]!.manaFrom).toEqual([
      { colour: "B", from: "card:1", n: 1 },
      { colour: "B", from: "card:9", n: 3 },
    ]);
    expect(s.players[0]!.commandIds).toEqual(["card:70"]);
    expect(s.emblems?.[0]?.from).toBe("card:5");
    expect(s.stack[0]!.from).toBe("monarch");
    expect(s.action?.marks).toEqual([{ kind: "dungeon", dungeon: "Tomb of Annihilation" }]);
  });
});
