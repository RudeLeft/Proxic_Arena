// @vitest-environment jsdom

// Spec 0106, item 2 (owner 2026-11-19, Q4 B) -- the pile fan: whole 88 x 63
// cards, 4 px apart, up to seven places; past that, the newest six and a
// "+N" in the last place (F-0106-D's "+N" half; the geometry is
// fixes0087.test.tsx's, rewritten for 0106).

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FanMoreView } from "./FanCards";
import {
  FAN_PLACES,
  fanBoxes,
  fanMore,
  fanPlaces,
  fanReach,
  fanSplit,
  fanWidth,
  type FanCard,
} from "./pileFan";
import { geometry } from "./layout";

const g = geometry({ width: 1920, height: 1080 });

function card(id: string, at: number, extra: Partial<FanCard> = {}): FanCard {
  return {
    id,
    side: "viewer",
    zone: "graveyard",
    how: "cast",
    mine: true,
    name: "Think Twice",
    kind: "other",
    types: "Instant",
    power: null,
    toughness: null,
    manaCost: "{1}{U}",
    art: null,
    crop: null,
    faceDown: false,
    known: true,
    time: null,
    square: null,
    at,
    ...extra,
  };
}

describe("F-0106-D · past seven places: the newest six and a +N", () => {
  it("8 cards: 6 and +2; 12 cards: 6 and +6; 7 cards: all shown", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => card(`card:${i}`, i));
    expect(fanMore(many(7), g)).toEqual([]);
    expect(fanBoxes(many(7), g).size).toBe(7);
    const eight = fanMore(many(8), g);
    expect(eight).toHaveLength(1);
    expect(eight[0]!.count).toBe(2);
    expect(fanBoxes(many(8), g).size).toBe(6);
    expect(fanMore(many(12), g)[0]!.count).toBe(6);
  });

  it("the +N stands in the seventh place, 4 px left of the sixth card, the same size", () => {
    const cards = Array.from({ length: 9 }, (_, i) => card(`card:${i}`, i));
    const boxes = [...fanBoxes(cards, g).values()];
    const more = fanMore(cards, g)[0]!.box;
    const leftmost = boxes.reduce((a, b) => (b.x < a.x ? b : a));
    expect(leftmost.x - (more.x + more.w)).toBeCloseTo(4, 3);
    expect(more.w).toBeCloseTo(leftmost.w, 6);
    expect(more.h).toBeCloseTo(88, 0);
    expect(more.y).toBeCloseTo(990, 0);
  });

  it("shows the newest (by when each arrived), in the fan's order", () => {
    // Fan order: the graveyard's first, then the exile's; arrival times mixed.
    const cards = [
      card("g1", 1),
      card("g2", 9),
      card("g3", 2),
      card("g4", 8),
      card("e1", 7, { zone: "exile" }),
      card("e2", 3, { zone: "exile" }),
      card("e3", 6, { zone: "exile" }),
      card("e4", 5, { zone: "exile" }),
    ];
    const { shown, hidden } = fanSplit(cards);
    expect(shown.map((c) => c.id)).toEqual(["g2", "g4", "e1", "e3", "e4", "e2"].sort(byFan(cards)));
    expect(hidden.map((c) => c.id)).toEqual(["g1", "g3"]);
    // The +N opens the pile of the newest card it stands for (g3, at 2: the graveyard).
    expect(fanMore(cards, g)[0]!.zone).toBe("graveyard");
    // When that is in the exile, the exile.
    const other = cards.map((c) => (c.id === "e2" ? { ...c, at: 0 } : c));
    const swapped = other.map((c) => (c.id === "g3" ? { ...c, at: 4 } : c));
    expect(fanSplit(swapped).hidden.map((c) => c.id)).toEqual(["g1", "e2"]);
    expect(fanMore(swapped, g)[0]!.zone).toBe("graveyard");
    const exileNewest = swapped.map((c) => (c.id === "e2" ? { ...c, at: 1.5 } : c));
    expect(fanMore(exileNewest, g)[0]!.zone).toBe("exile");
  });

  it("each side is split on its own", () => {
    const cards = [
      ...Array.from({ length: 8 }, (_, i) => card(`v${i}`, i)),
      ...Array.from({ length: 3 }, (_, i) => card(`o${i}`, i, { side: "opponent", mine: false })),
    ];
    const more = fanMore(cards, g);
    expect(more.map((m) => [m.side, m.count])).toEqual([["viewer", 2]]);
    expect([...fanBoxes(cards, g).keys()].filter((id) => id.startsWith("o"))).toHaveLength(3);
  });

  it("the hand keeps clear of seven places at most", () => {
    expect(fanWidth(12, g)).toBeCloseTo(fanWidth(7, g), 6);
    expect(fanReach({ viewer: 12, opponent: 0 }, g).viewer).toBeCloseTo(
      fanReach({ viewer: 7, opponent: 0 }, g).viewer,
      6,
    );
    // 7 x 63 + 6 x 4 = 465 px at 1080 (research B).
    expect(fanWidth(7, g)).toBeCloseTo(7 * fanBoxes([card("a", 0)], g).get("a")!.w + 6 * 4, 3);
  });

  it("a screen too narrow for seven: fewer places, never an overlap (UI-006 best effort)", () => {
    const narrow = geometry({ width: 1000, height: 1080 });
    const places = fanPlaces(narrow);
    expect(places).toBeLessThan(FAN_PLACES);
    const cards = Array.from({ length: 9 }, (_, i) => card(`card:${i}`, i));
    const all = [...fanBoxes(cards, narrow).values(), ...fanMore(cards, narrow).map((m) => m.box)];
    expect(all).toHaveLength(places);
    const xs = all.map((b) => [b.x, b.x + b.w] as const).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < xs.length; i++) expect(xs[i]![0]).toBeGreaterThanOrEqual(xs[i - 1]![1]);
  });
});

describe("F-0106-D · the +N card", () => {
  it("a card back with the count, a button that opens the pile", () => {
    const cards = Array.from({ length: 9 }, (_, i) => card(`card:${i}`, i));
    const more = fanMore(cards, g)[0]!;
    const onOpen = vi.fn();
    const c = render(<FanMoreView more={more} who="you" onOpen={onOpen} />).container;
    const button = c.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("3 more cards you may play: open the pile");
    expect(button.querySelector(".bf-card-back")).toBeTruthy();
    expect(button.textContent).toBe("+3");
    const wrap = c.querySelector<HTMLElement>("[data-fan-more]")!;
    expect(wrap.style.transform).toBe(`translate3d(${more.box.x}px, ${more.box.y}px, 0)`);
    button.click();
    expect(onOpen).toHaveBeenCalledWith(more);
  });
});

/** Sort ids by their place in the fan's own order. */
function byFan(cards: readonly FanCard[]) {
  const at = new Map(cards.map((c, i) => [c.id, i]));
  return (a: string, b: string) => at.get(a)! - at.get(b)!;
}
