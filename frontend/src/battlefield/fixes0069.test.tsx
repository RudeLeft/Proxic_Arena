// @vitest-environment jsdom

// Spec 0069 -- arrows with effects. Here: the beam and its ripple on a card
// (F-0069-B), something on the stack as the target (F-0069-D), the pointer's
// beam while choosing targets (F-0069-E), the tab preview for an Aura or
// Equipment (F-0069-G) and the still pictures of "reduce motion" (F-0069-H).
// The attack blade and the block marks are Board.test.tsx (F-0069-A, -F, -G);
// the beam at a player is effects.test.ts (F-0069-C).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AimPointer, aimPath } from "./AimPointer";
import { Board, type StackView } from "./Board";
import { combatScript } from "./fixture";
import { geometry, inCombat, layout, TAPPED_ORIGIN } from "./layout";
import { pointOn, stackBadgeRects, stackSpotBoxes, STACK_READ_SCALE, TIP_GAP } from "./effects";
import { anchors, LIFE_R } from "./motion";

const size = { width: 1920, height: 1080 };
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  // jsdom has no PointerEvent: one that carries where the pointer is.
  vi.stubGlobal("PointerEvent", class extends MouseEvent {});
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
    return {
      finished: new Promise<void>(() => {}),
      onfinish: null,
      cancel() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0 }) },
    };
  };
});
afterEach(() => {
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const art = (a: string) => a;
const s8 = combatScript(8);
const shock = s8.stack[0]!; // Shock at White Knight (card:202), on top
const bolt = s8.stack[1]!;
function board(stack: StackView[], extra: Partial<Parameters<typeof Board>[0]> = {}) {
  return (
    <Board
      battlefield={s8.board.battlefield}
      hand={s8.board.hand}
      viewerSeat={s8.board.viewerSeat}
      artUrl={art}
      combat={s8.combat}
      stack={stack}
      {...extra}
    />
  );
}
const out = layout(
  s8.combat ? { ...s8.board, battlefield: inCombat(s8.board.battlefield, s8.combat) } : s8.board,
  size,
);
const g = out.geometry;
const pair = (v: string | null) => v!.split(",").map(Number) as [number, number];

describe("the beam and its ripple (F-0069-B, F-0069-C)", () => {
  it("at a card: the beam stops at its top edge, the ripple is on its picture, nothing runs over its name", () => {
    const c = render(board([shock, bolt])).container;
    const line = c.querySelector<SVGGElement>('[data-line="target"]')!;
    expect(line.getAttribute("data-to")).toBe("card:202");
    // A beam: glow, body and flowing light -- no arrowhead, no rune circle.
    expect(line.querySelectorAll(".bf-beam-aura, .bf-beam-body, .bf-beam-flow")).toHaveLength(3);
    expect(line.querySelectorAll("polygon, text")).toHaveLength(0);
    const knight = out.boxes.get("card:202")!;
    const top = Math.min(...[0, 1].map((fx) => pointOn(knight, TAPPED_ORIGIN, fx, 0).y));
    // Every one of its three paths is the same curve, ending a hair above the card.
    const ds = [...line.querySelectorAll(".bf-beam path")].map((p) => p.getAttribute("d")!);
    expect(new Set(ds).size).toBe(1);
    const [, ey] = pair(line.getAttribute("data-end"));
    expect(ey).toBeCloseTo(top - TIP_GAP * g.cardH, 0);
    const last = ds[0]!.trim().split(/[ ,]+/).slice(-2).map(Number);
    expect(last[1]).toBeCloseTo(ey, 0);
    expect(ds[0]!.match(/C/g)).toHaveLength(1);
    // The ripple: on the picture, between the name bar and the type line.
    const ripple = line.querySelector<SVGGElement>(".bf-ripple")!;
    const [rx, ry] = pair(ripple.dataset.ripple!);
    const r = Number(ripple.dataset.r);
    const at = pointOn(knight, TAPPED_ORIGIN, 0.5, 0.42);
    expect(rx).toBeCloseTo(at.x, 0);
    expect(ry).toBeCloseTo(at.y, 0);
    expect(r).toBeCloseTo(g.cardH * 0.1, 1);
    // Its resting ring is clear of the name bar (the card's top 14%) and
    // of the power and type line (its bottom 14%).
    expect(0.42 - r / knight.h).toBeGreaterThan(0.14);
    expect(0.42 + r / knight.h).toBeLessThan(0.86);
    expect(ripple.querySelectorAll(".bf-ripple-ring")).toHaveLength(3);
    expect(ripple.querySelectorAll(".bf-ripple-spark")).toHaveLength(8);
  });

  it("at a player: the beam lands on the rim of the life shield, the ripple round it, nothing inside it", () => {
    for (const seat of [1, 2]) {
      const spell: StackView = { ...shock, targets: [{ player: seat }] };
      const c = render(board([spell])).container;
      const line = c.querySelector<SVGGElement>('[data-line="target"]')!;
      const side = seat === s8.board.viewerSeat ? "viewer:life" : "opponent:life";
      const life = anchors(g)[side];
      const reach = LIFE_R * g.height + TIP_GAP * g.cardH;
      const [ex, ey] = pair(line.getAttribute("data-end"));
      expect(Math.hypot(ex - life.x, ey - life.y)).toBeCloseTo(reach, 0);
      const ripple = line.querySelector<SVGGElement>(".bf-ripple")!;
      const [rx, ry] = pair(ripple.dataset.ripple!);
      expect(rx).toBeCloseTo(life.x, 0);
      expect(ry).toBeCloseTo(life.y, 0);
      // The ring is outside the number: at least the shield's own radius.
      expect(Number(ripple.dataset.r)).toBeGreaterThanOrEqual(LIFE_R * g.height);
      // Everything drawn round it is a ring or a spark ON the ring: no fill, nothing at its centre.
      for (const ring of ripple.querySelectorAll("circle:not(.bf-ripple-spark)"))
        expect(ring.getAttribute("fill")).toBe("none");
      for (const spark of ripple.querySelectorAll(".bf-ripple-spark"))
        expect(Math.abs(Number(spark.getAttribute("cy")))).toBeCloseTo(Number(ripple.dataset.r), 1);
      // One arc.
      expect(line.querySelector(".bf-beam-body")!.getAttribute("d")!.match(/C/g)).toHaveLength(1);
      document.body.innerHTML = "";
    }
  });
});

describe("something on the stack as the target (F-0069-D)", () => {
  it("a counterspell: the ripple beside the targeted stack card's name, the beam from the counterspell's stud to it", () => {
    const counter: StackView = {
      ...shock,
      id: "stack:9",
      name: "Counterspell",
      targets: [{ object: bolt.id }],
    };
    const c = render(board([counter, bolt])).container;
    const line = c.querySelector<SVGGElement>('[data-line="target"]')!;
    expect(line.getAttribute("data-from")).toBe("stack:9");
    expect(line.getAttribute("data-to")).toBe(bolt.id);
    const spots = stackSpotBoxes(g, 2, STACK_READ_SCALE);
    const badge = stackBadgeRects(spots, g.cardH)[1]!;
    const ripple = line.querySelector<SVGGElement>(".bf-ripple")!;
    const [rx, ry] = pair(ripple.dataset.ripple!);
    const r = Number(ripple.dataset.r);
    // Left of the targeted card and its badges, level with its name bar:
    // never over either stack card.
    expect(ry).toBeCloseTo((badge.y0 + badge.y1) / 2, 0);
    expect(rx + r).toBeLessThan(badge.x0);
    expect(ry).toBeGreaterThan(spots[1]!.y);
    expect(ry).toBeLessThan(spots[0]!.y);
    // The beam: from the counterspell's stud (its left edge) to the ripple's rim.
    const [sx] = pair(line.getAttribute("data-start"));
    expect(sx).toBeCloseTo(spots[0]!.x - spots[0]!.h * 0.02, 0);
    const [ex, ey] = pair(line.getAttribute("data-end"));
    expect(Math.hypot(ex - rx, ey - ry)).toBeCloseTo(r + TIP_GAP * g.cardH, 0);
    expect(ex).toBeLessThan(spots[0]!.x);
  });
});

describe("choosing targets (F-0069-E, F-0069-G)", () => {
  const geo = geometry(size);
  const from = { x: 838, y: 365, w: 244, h: 350, scale: 2.5, rotation: 0, z: 0 };
  /** A board with a choosable card and a choosable life shield, where the test says they are. */
  function table(attach: string | null) {
    const view = render(
      <div className="bf-board">
        <button className="bf-card" data-object-id="card:7" data-choosable="true" />
        <button className="bf-card" data-object-id="card:8" />
        <button className="gs-life" data-object-id="player:2" data-choosable="true" />
        <AimPointer geometry={geo} from={from} attach={attach} />
      </div>,
    );
    const c = view.container;
    const rect = (x: number, y: number, w: number, h: number) =>
      ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y }) as DOMRect;
    const el = (q: string) => c.querySelector<HTMLElement>(q)!;
    vi.spyOn(el(".bf-board"), "getBoundingClientRect").mockReturnValue(rect(0, 0, 1920, 1080));
    vi.spyOn(el('[data-object-id="card:7"]'), "getBoundingClientRect").mockReturnValue(
      rect(300, 200, 100, 140),
    );
    vi.spyOn(el('[data-object-id="card:8"]'), "getBoundingClientRect").mockReturnValue(
      rect(500, 200, 100, 140),
    );
    vi.spyOn(el('[data-object-id="player:2"]'), "getBoundingClientRect").mockReturnValue(
      rect(1838, 40, 55, 65),
    );
    return { c, el, unmount: view.unmount };
  }
  const moveTo = (target: Element, x: number, y: number) =>
    fireEvent.pointerMove(target, { clientX: x, clientY: y });

  it("the beam follows the pointer from the card being cast; the ripple shows on what is pointed at", () => {
    const { c, el } = table(null);
    const beam = el(".bf-pointer-beam");
    const ripple = el(".bf-pointer-ripple");
    // Nothing until the pointer moves; the layer never takes a click.
    expect(beam.dataset.off).toBe("true");
    expect(ripple.dataset.off).toBe("true");
    expect(el(".bf-pointer").getAttribute("aria-hidden")).toBe("true");
    // Over the empty table: the beam from the card's edge to just short of the pointer.
    moveTo(el(".bf-board"), 200, 900);
    expect(beam.dataset.off).toBe("false");
    expect(ripple.dataset.off).toBe("true");
    const ds = [...beam.querySelectorAll("path")].map((p) => p.getAttribute("d")!);
    expect(ds).toHaveLength(3);
    expect(new Set(ds).size).toBe(1);
    const n = ds[0]!.match(/-?[\d.]+/g)!.map(Number);
    // It starts on the card's edge (its left side, toward the pointer)...
    expect(n[0]).toBeCloseTo(from.x, 0);
    // ...and ends within a twentieth of a card of the pointer.
    expect(Math.hypot(n[4]! - 200, n[5]! - 900)).toBeLessThan(geo.cardH * 0.05);
    // It follows: a new place, a new end.
    moveTo(el(".bf-board"), 1500, 150);
    const m = beam
      .querySelector("path")!
      .getAttribute("d")!
      .match(/-?[\d.]+/g)!
      .map(Number);
    expect(Math.hypot(m[4]! - 1500, m[5]! - 150)).toBeLessThan(geo.cardH * 0.05);
    expect(m[0]).toBeCloseTo(from.x + from.w, 0);
    // On a card that can be chosen: the ripple on its picture, the beam to its rim.
    moveTo(el('[data-object-id="card:7"]'), 310, 210);
    expect(ripple.dataset.off).toBe("false");
    expect(ripple.dataset.on).toBe("card:7");
    expect(ripple.getAttribute("transform")).toContain("translate(350.0 258.8) scale(1.000)");
    const k = beam
      .querySelector("path")!
      .getAttribute("d")!
      .match(/-?[\d.]+/g)!
      .map(Number);
    expect(Math.hypot(k[4]! - 350, k[5]! - 258.8)).toBeCloseTo(geo.cardH * 0.1, 0);
    // On a card that cannot: no ripple, the beam at the pointer.
    moveTo(el('[data-object-id="card:8"]'), 510, 210);
    expect(ripple.dataset.off).toBe("true");
    // On a player's life shield: the ripple round the whole shield.
    moveTo(el('[data-object-id="player:2"]'), 1850, 50);
    expect(ripple.dataset.on).toBe("player:2");
    const scale = Number(/scale\(([\d.]+)\)/.exec(ripple.getAttribute("transform")!)![1]);
    expect(scale * geo.cardH * 0.1).toBeGreaterThanOrEqual(65 / 2);
    expect(ripple.getAttribute("transform")).toContain("translate(1865.5 72.5)");
    // Inside the card being cast, over nothing: no stub of a beam.
    moveTo(el(".bf-board"), 960, 540);
    expect(beam.dataset.off).toBe("true");
    expect(c.querySelector("[data-testid='tab-preview']")).toBeNull();
  });

  it("the path is one gentle arc", () => {
    const d = aimPath({ x: 100, y: 500 }, { x: 700, y: 500 }, 140);
    expect(d).toBe("M100.0 500.0 Q400.0 430.0 700.0 500.0");
  });

  it("an Aura or Equipment: no line; the creature pointed at shows the tab the card will sit in", () => {
    const { c, el } = table("Bonesplitter");
    expect(c.querySelector(".bf-pointer")).toBeNull();
    expect(c.querySelectorAll("path")).toHaveLength(0);
    const tab = el("[data-testid='tab-preview']");
    expect(tab.textContent).toBe("Bonesplitter");
    expect(tab.dataset.off).toBe("true");
    moveTo(el('[data-object-id="card:7"]'), 310, 210);
    expect(tab.dataset.off).toBe("false");
    expect(tab.dataset.on).toBe("card:7");
    // On the creature's right edge, its height: where its tab will be.
    expect(tab.style.left).toBe("400px");
    expect(tab.style.top).toBe("200px");
    expect(tab.style.height).toBe("140px");
    // Not on a player, nor on a card that cannot be chosen.
    moveTo(el('[data-object-id="player:2"]'), 1850, 50);
    expect(tab.dataset.off).toBe("true");
    moveTo(el('[data-object-id="card:7"]'), 310, 210);
    moveTo(el('[data-object-id="card:8"]'), 510, 210);
    expect(tab.dataset.off).toBe("true");
  });

  it("no card to point from: nothing is drawn", () => {
    const c = render(<AimPointer geometry={geo} from={null} attach={null} />).container;
    expect(c.innerHTML).toBe("");
  });
});

describe("reduce motion: still pictures (F-0069-H)", () => {
  it("the blade has no drifting embers, the ripple no growing rings or sparks; the looks are still drawn", () => {
    reduced = true;
    const s = combatScript(2);
    const c = render(
      <Board
        battlefield={s.board.battlefield}
        hand={s.board.hand}
        viewerSeat={s.board.viewerSeat}
        artUrl={art}
        combat={s.combat}
        stack={[shock]}
      />,
    ).container;
    // The blade at the planeswalker: its shape, no moving parts.
    const blade = c.querySelector('[data-line="attack"]')!;
    expect(blade.querySelector(".bf-blade-body")).not.toBeNull();
    expect(blade.querySelectorAll("animateMotion, .bf-blade-ember")).toHaveLength(0);
    // The beam and the ripple's ring: there, still.
    const beam = c.querySelector('[data-line="target"]')!;
    expect(beam.querySelector(".bf-beam-body")).not.toBeNull();
    expect(beam.querySelectorAll(".bf-ripple circle")).toHaveLength(1);
    expect(beam.querySelectorAll(".bf-ripple-ring, .bf-ripple-spark, animateMotion")).toHaveLength(
      0,
    );
    // The block marks: drawn (their CSS stops the swing and hides the burst).
    expect(c.querySelectorAll("[data-swords] .bf-swords-shield").length).toBe(3);
    // The pointer while choosing: a still ring.
    const aim = render(
      <div className="bf-board">
        <AimPointer
          geometry={g}
          from={{ x: 0, y: 0, w: 10, h: 10, scale: 1, rotation: 0, z: 0 }}
          attach={null}
        />
      </div>,
    ).container;
    expect(aim.querySelectorAll(".bf-ripple-ring, .bf-ripple-spark")).toHaveLength(0);
    expect(aim.querySelectorAll(".bf-ripple circle")).toHaveLength(1);
  });

  it("the stylesheet stops every arrow animation when motion is reduced", () => {
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "battlefield.css"), "utf-8");
    const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
    for (const name of [
      ".bf-blade",
      ".bf-beam",
      ".bf-blade-haze",
      ".bf-blade-glow",
      ".bf-beam-flow",
      ".bf-swords-mark",
      ".bf-swords-halo",
      ".bf-swords-swing-r",
      ".bf-swords-swing-l",
      ".bf-swords-burst",
      ".bf-swords-glint",
      ".bf-tab-preview",
    ])
      expect(blocks, name).toMatch(new RegExp(`\\${name}[,\\s]`));
  });
});
