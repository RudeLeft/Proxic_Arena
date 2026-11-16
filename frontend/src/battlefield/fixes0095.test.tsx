// @vitest-environment jsdom

// Spec 0095 -- snappy frames: less page work per game update. The browser
// test (e2e/match-speed.spec.ts) times a real game; these pin each cause's
// fix where it lives: nothing redraws on a frame where nothing it shows has
// changed, and nothing is measured on a board where nothing will use it.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { endLifeSteps, startLifeSteps, useLifeLanded, useShownPlate } from "./lifeTicks";
import { PlayerFlights, flyingFrom } from "./flights";
import { followStarted } from "./breathMotion";
import { LibraryTop } from "./LibraryTop";
import { sameProps } from "./sameProps";
import { CardFace } from "./Board";
import { CardBadges } from "./CardBadges";
import { SizeFigure } from "./SizeFigure";
import { ManaCost } from "./ManaCost";
import { StatusTray } from "./StatusTray";
import { FaceMarks } from "./playerMarks";
import { PoisonBadge } from "./PoisonBadge";
import type { Snapshot, SnapshotCard, SnapshotPlayer } from "../match";

// A frame clock of the test's own: frame() runs what was asked for this frame.
let queue: FrameRequestCallback[] = [];
function frame() {
  const now = queue;
  queue = [];
  act(() => now.forEach((f) => f(0)));
}
beforeEach(() => {
  queue = [];
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => queue.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  endLifeSteps();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("1 · game end: the screen waits for the last hit without redrawing every frame", () => {
  it("redraws once, the frame the hit lands", () => {
    let t = 0;
    let draws = 0;
    function Screen() {
      draws++;
      const landed = useLifeLanded(true);
      return <span data-landed={String(landed)} />;
    }
    const view = render(<Screen />);
    act(() => startLifeSteps(() => t, [{ seat: 2, at: 500, amount: -3 }]));
    const before = draws;
    for (let i = 0; i < 20; i++) {
      t += 16;
      frame();
    }
    expect(draws, "no redraw while the hit is still to land").toBe(before);
    t = 520;
    frame();
    expect(draws).toBe(before + 1);
    expect(view.container.querySelector("span")!.dataset["landed"]).toBe("true");
  });

  it("not watched (no game end): the clocks never redraw it", () => {
    let draws = 0;
    function Screen() {
      draws++;
      useLifeLanded(false);
      return null;
    }
    render(<Screen />);
    const before = draws;
    act(() => startLifeSteps(() => 0, [{ seat: 2, at: 500, amount: -3 }]));
    act(() => endLifeSteps());
    expect(draws).toBe(before);
  });
});

describe("3 · a plate redraws when its number changes, not every frame", () => {
  it("two points a second apart: a redraw for each, none between", () => {
    let t = 0;
    let draws = 0;
    function Plate() {
      draws++;
      const shown = useShownPlate(2, 18);
      return <span data-life={shown.life} data-hits={shown.hits} />;
    }
    const view = render(<Plate />);
    act(() =>
      startLifeSteps(
        () => t,
        [
          { seat: 2, at: 1000, amount: -1 },
          { seat: 2, at: 2000, amount: -1 },
        ],
      ),
    );
    const life = () => view.container.querySelector("span")!.dataset["life"];
    expect(life()).toBe("20");
    const start = draws;
    for (let i = 0; i < 30; i++) {
      t += 16;
      frame();
    }
    expect(draws, "no redraw before the first point").toBe(start);
    t = 1010;
    frame();
    expect(life()).toBe("19");
    expect(draws).toBe(start + 1);
    for (let i = 0; i < 30; i++) {
      t += 16;
      frame();
    }
    expect(draws).toBe(start + 1);
    t = 2010;
    frame();
    expect(life()).toBe("18");
    expect(view.container.querySelector("span")!.dataset["hits"]).toBe("2");
  });

  it("another seat's clock does not redraw this plate", () => {
    let draws = 0;
    function Plate() {
      draws++;
      useShownPlate(1, 20);
      return null;
    }
    render(<Plate />);
    const before = draws;
    act(() => startLifeSteps(() => 0, [{ seat: 2, at: 500, amount: -3 }]));
    act(() => endLifeSteps());
    expect(draws).toBe(before);
  });
});

// --- 2 · flights -----------------------------------------------------------------------------------

function player(over: Partial<SnapshotPlayer> = {}): SnapshotPlayer {
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
function snap(over: Partial<Snapshot> = {}, alice: Partial<SnapshotPlayer> = {}): Snapshot {
  return {
    stateRevision: 1,
    gameEpoch: 1,
    dayTime: null,
    turn: 7,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    seat: 1,
    players: [player(alice), player({ seat: 2, name: "Bob" })],
    notices: [],
    battlefield: [{ id: "card:1" }, { id: "card:2" }] as unknown as SnapshotCard[],
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

describe("2 · flights: nothing is measured on a board where nothing flies", () => {
  it("flyingFrom: nothing for an ordinary board; mana from a card names that card", () => {
    expect(flyingFrom(snap(), snap({ turn: 8 }))).toBeNull();
    const mana = snap(
      {},
      { manaPool: { G: 1 }, manaFrom: [{ colour: "G", n: 1, from: "card:2" }] },
    );
    expect([...(flyingFrom(snap(), mana) ?? [])]).toEqual(["card:2"]);
    expect(flyingFrom(snap(), snap({}, { designations: ["monarch"] }))).not.toBeNull();
  });

  it("the layer reads no card's box for a board where nothing flies", () => {
    for (const id of ["card:1", "card:2"]) {
      const el = document.createElement("button");
      el.className = "bf-card";
      el.dataset["objectId"] = id;
      document.body.appendChild(el);
    }
    const boxes = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const view = render(<PlayerFlights board={snap()} />);
    view.rerender(<PlayerFlights board={snap({ turn: 8 })} />);
    view.rerender(<PlayerFlights board={snap({ turn: 9 })} />);
    expect(boxes).not.toHaveBeenCalled();
    // A card makes mana: the board before it is read, that card only.
    view.rerender(
      <PlayerFlights
        board={snap(
          { turn: 9 },
          { manaPool: { G: 1 }, manaFrom: [{ colour: "G", n: 1, from: "card:2" }] },
        )}
      />,
    );
    const read = boxes.mock.contexts.map((el) => (el as HTMLElement).dataset["objectId"]);
    expect(read).toContain("card:2");
    expect(read).not.toContain("card:1");
    document.body.innerHTML = "";
  });
});

describe("4 · the glow follower looks only at cards that started moving", () => {
  it("a new layer once; then nothing until its card animates", () => {
    const asked: Element[] = [];
    (Element.prototype as unknown as { animate: unknown }).animate = () => ({});
    (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
      this: Element,
    ) {
      asked.push(this);
      return [];
    };
    const root = document.createElement("div");
    const host = document.createElement("button");
    host.className = "bf-card";
    const breath = document.createElement("span");
    breath.className = "bf-breath";
    root.append(host, breath);
    document.body.appendChild(root);
    followStarted(root); // the page's animate replaced: one full look, as before 0095
    asked.length = 0;
    followStarted(root);
    followStarted(root);
    expect(asked, "nothing started: no card asked").toEqual([]);
    host.animate([{ opacity: 1 }], 100);
    followStarted(root);
    expect(asked).toEqual([host]);
    asked.length = 0;
    followStarted(root);
    expect(asked).toEqual([]);
    // A layer new since the last look: its card is looked at once.
    const host2 = document.createElement("button");
    const breath2 = document.createElement("span");
    breath2.className = "bf-breath";
    root.append(host2, breath2);
    followStarted(root);
    expect(asked).toEqual([host2]);
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
    delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
    document.body.innerHTML = "";
  });
});

describe("5 · the waiting plate's glow is two still shadows whose opacity breathes", () => {
  const css = readFileSync(join(__dirname, "game.css"), "utf8");
  it("no box-shadow keyframes; two layers on the plate's border box", () => {
    expect(css).not.toMatch(/@keyframes gs-deciding \{/);
    expect(css).toMatch(
      /@keyframes gs-deciding-strong \{\s*0%,\s*100% \{\s*opacity: 1;\s*\}\s*50% \{\s*opacity: 0;/,
    );
    expect(css).toMatch(
      /@keyframes gs-deciding-soft \{\s*0%,\s*100% \{\s*opacity: 0;\s*\}\s*50% \{\s*opacity: 1;/,
    );
    // The rule of that selector alone (not the one it shares with ::before).
    const block = (sel: string) => {
      const at = css.lastIndexOf(`\n${sel} {`);
      return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
    };
    expect(block(".gs-seat-deciding::before")).toMatch(/animation-name: gs-deciding-strong/);
    expect(block(".gs-seat-deciding::before")).toMatch(/0 0 22px rgb\(217 178 106 \/ 45%\)/);
    expect(block(".gs-seat-deciding::after")).toMatch(/animation-name: gs-deciding-soft/);
    expect(block(".gs-seat-deciding::after")).toMatch(/0 0 8px rgb\(217 178 106 \/ 15%\)/);
    expect(css).toMatch(/\.gs-seat-deciding::after \{[\s\S]*?inset: -2px -1px -1px;/);
    // The step ladder's gem: a still shadow; only its transform moves.
    expect(css).toMatch(/\.gs-gem \{[^}]*box-shadow: 0 0 10px[^}]*transition: transform/);
  });
});

describe("6 · the library's top card is measured only when it changes", () => {
  it("the same card on a new board: no box read", () => {
    const card = { id: "card:9", name: "Forest", art: null, crop: null } as unknown as SnapshotCard;
    // On a board, as the plate draws it (the box is the board's).
    const top = (c: SnapshotCard, quiet: boolean) => (
      <div className="bf-board">
        <LibraryTop
          card={c}
          owner="your"
          choosable={false}
          busy={false}
          quiet={quiet}
          onPick={() => {}}
        />
      </div>
    );
    const view = render(top(card, true));
    const boxes = vi.spyOn(Element.prototype, "getBoundingClientRect");
    view.rerender(top({ ...card }, false));
    expect(boxes).not.toHaveBeenCalled();
  });
});

describe("7 · the board's parts redraw only when what they show changed", () => {
  it("props compared by their contents; callbacks and elements by identity", () => {
    const f = () => {};
    expect(sameProps({ a: 1, b: { c: [1, 2] }, f }, { a: 1, b: { c: [1, 2] }, f })).toBe(true);
    expect(sameProps({ b: { c: [1, 2] } }, { b: { c: [1, 3] } })).toBe(false);
    expect(sameProps({ f }, { f: () => {} })).toBe(false);
    expect(sameProps({ m: new Map() }, { m: new Map() })).toBe(false);
    expect(sameProps({ e: <b /> }, { e: <b /> })).toBe(false);
  });

  it("CardFace, CardBadges, SizeFigure, ManaCost, StatusTray, FaceMarks, PoisonBadge are memoised", () => {
    const MEMO = Symbol.for("react.memo");
    for (const part of [
      CardFace,
      CardBadges,
      SizeFigure,
      ManaCost,
      StatusTray,
      FaceMarks,
      PoisonBadge,
    ])
      expect((part as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
  });
});
