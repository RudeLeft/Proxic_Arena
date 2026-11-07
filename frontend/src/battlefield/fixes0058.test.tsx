// @vitest-environment jsdom

// Spec 0058 -- the owner's fixes of 7 November: costs, the blue ring, the
// act button, the pips, mutate (F-0058-B, D, E, F, G, H).

import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Decision, Snapshot, SnapshotCard } from "../match";
import { CastingCard, costPips, keepPaying } from "./CastingCard";
import {
  Inspect,
  NothingNote,
  PLACING_QUIET_MS,
  STEADY_MS,
  placingTriggers,
  useSteadyAct,
} from "./GameScreen";
import type { Box, Geometry } from "./layout";
import { OrderTray } from "./TriggerWindows";

const geometry = {
  play: { x: 0, y: 0, w: 1600, h: 1000 },
  inset: 12,
  height: 1080,
  cardW: 100,
  cardH: 140,
} as unknown as Geometry;

const box: Box = { x: 300, y: 400, w: 100, h: 140, scale: 1, rotation: 0, z: 0 };

function card(over: Partial<SnapshotCard>): SnapshotCard {
  return {
    id: "card:1",
    art: null,
    seat: 1,
    name: "Goblin Piker",
    tapped: false,
    faceDown: false,
    known: true,
    kind: "creature",
    types: "Creature — Goblin Warrior",
    power: 2,
    toughness: 1,
    manaCost: "{1}{R}",
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
    ...over,
  };
}

function board(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seat: 1,
    battlefield: [],
    hand: [],
    graveyard: [],
    exile: [],
    otherHands: [],
    stack: [],
    casting: [],
    players: [{ seat: 1, name: "Pat" }],
    ...over,
  } as unknown as Snapshot;
}

function decision(over: Record<string, unknown>): Decision {
  return {
    decisionId: 7,
    kind: "orderSimultaneousAbilities",
    prompt: "",
    mandatory: true,
    options: [],
    about: null,
    arrange: null,
    ...over,
  } as unknown as Decision;
}

afterEach(() => vi.useRealTimers());
// jsdom has no canvas: the embers behind the card being cast draw nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// --- item 2 ------------------------------------------------------------------------------

describe("a cheaper card shows its real cost, and why, with no ring (F-0058-B)", () => {
  it("the close-up draws the cost now and says why", () => {
    const piker = card({ costNow: "{R}", costWhy: "Costs {1} less: Goblin Warchief" });
    const c = render(
      <Inspect
        card={piker}
        name="Goblin Piker"
        costNow={piker.costNow ?? null}
        artUrl={(a) => a}
        board={board({ hand: [piker] })}
        mySeat={1}
        onClose={vi.fn()}
      />,
    ).container;
    const cost = c.querySelector(".gs-inspect-name .bf-cost")!;
    expect(cost.getAttribute("aria-label")).toBe("Costs {R}, less than printed");
    expect(c.querySelector(".bf-cost-down")).toBeNull();
    expect(c.querySelector(".gs-inspect-costwhy")!.textContent).toContain(
      "Costs {1} less: Goblin Warchief",
    );
  });

  it("the card being cast draws the reduced cost before anything is paid", () => {
    const c = render(
      <CastingCard
        card={card({})}
        geometry={geometry}
        from={null}
        owing={null}
        cost={["R"]}
        artUrl={(a) => a}
      />,
    ).container;
    expect(c.querySelectorAll(".gs-cast-pip")).toHaveLength(1);
    expect(c.querySelector(".gs-cast-pip-generic")).toBeNull();
  });
});

// --- item 4 ------------------------------------------------------------------------------

describe("the blue ring explains itself (F-0058-D)", () => {
  it("a note by the card, which goes when it has faded", () => {
    const done = vi.fn();
    const c = render(<NothingNote box={box} onDone={done} />).container;
    const note = c.querySelector(".gs-nothing-note")!;
    expect(note.textContent).toBe("Nothing to do with this card right now");
    expect(note.getAttribute("role")).toBe("status");
    // Above the card's middle.
    expect((note as HTMLElement).style.left).toBe("350px");
    expect((note as HTMLElement).style.top).toBe("392px");
    fireEvent.animationEnd(note);
    expect(done).toHaveBeenCalledOnce();
  });
});

// --- item 5 ------------------------------------------------------------------------------

describe("the act button stays steady while triggers go on the stack (F-0058-E)", () => {
  const words = (node: unknown) => render(<>{node}</>).container.textContent;

  it("a trigger question is a placing one; others are not", () => {
    expect(placingTriggers(decision({}))).toBe(true);
    expect(
      placingTriggers(decision({ kind: "chooseTargetsFor", about: { kind: "trigger" } })),
    ).toBe(true);
    expect(placingTriggers(decision({ kind: "chooseTargetsFor", about: { kind: "spell" } }))).toBe(
      false,
    );
    expect(placingTriggers(decision({ kind: "chooseSpellAbilityToPlay" }))).toBe(false);
    expect(placingTriggers(null)).toBe(false);
  });

  it("holds the last button for a moment when nothing is asked, then moves on", () => {
    vi.useFakeTimers();
    const pass = <button type="button">Next · To combat</button>;
    const waiting = <div>Bob’s move</div>;
    const hook = renderHook(
      ({ node, quiet }: { node: unknown; quiet: boolean }) =>
        useSteadyAct(node as never, quiet, null),
      { initialProps: { node: pass, quiet: false } },
    );
    expect(words(hook.result.current)).toBe("Next · To combat");
    hook.rerender({ node: waiting, quiet: true });
    expect(words(hook.result.current)).toBe("Next · To combat");
    act(() => {
      vi.advanceTimersByTime(STEADY_MS + 10);
    });
    expect(words(hook.result.current)).toBe("Bob’s move");
  });

  it("says 'Putting triggers on the stack' through the triggers, then changes once", () => {
    vi.useFakeTimers();
    const target = <button type="button">Cancel · Boggart Shenanigans</button>;
    const moment = <div>One moment</div>;
    const resolves = <button type="button">Resolves in 5</button>;
    const seen: string[] = [];
    const hook = renderHook(
      ({ node, quiet, placing }: { node: unknown; quiet: boolean; placing: never }) =>
        useSteadyAct(node as never, quiet, placing),
      { initialProps: { node: target, quiet: false, placing: "answering" as never } },
    );
    const look = () => {
      const now = words(hook.result.current) ?? "";
      if (seen[seen.length - 1] !== now) seen.push(now);
    };
    look();
    // Three triggers: each a question the page answers, then a gap.
    for (let i = 0; i < 3; i++) {
      hook.rerender({ node: moment, quiet: true, placing: null as never });
      look();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      look();
      hook.rerender({ node: target, quiet: false, placing: "answering" as never });
      look();
    }
    hook.rerender({ node: moment, quiet: true, placing: null as never });
    look();
    hook.rerender({ node: resolves, quiet: false, placing: null as never });
    look();
    expect(seen).toEqual(["One momentPutting triggers on the stack", "Resolves in 5"]);
  });

  it("after a trigger question you answer, the gap says the same, for a while", () => {
    vi.useFakeTimers();
    const target = <button type="button">Cancel · Boggart Shenanigans</button>;
    const hook = renderHook(
      ({ quiet, placing }: { quiet: boolean; placing: never }) =>
        useSteadyAct(quiet ? <div>One moment</div> : target, quiet, placing),
      { initialProps: { quiet: false, placing: "asking" as never } },
    );
    expect(words(hook.result.current)).toBe("Cancel · Boggart Shenanigans");
    hook.rerender({ quiet: true, placing: null as never });
    expect(words(hook.result.current)).toBe("One momentPutting triggers on the stack");
    act(() => {
      vi.advanceTimersByTime(PLACING_QUIET_MS + 10);
    });
    expect(words(hook.result.current)).toBe("One moment");
  });
});

// --- items 6 and 7 -------------------------------------------------------------------------

describe("paying {2}: two pips, lit one by one, never flashing back (F-0058-F)", () => {
  it("Nekrataal paid Forest first: {2}{B}{B} -> {1}{B}{B} -> {B}{B} -> {B}", () => {
    let paying = keepPaying(null, "card:9", ["2", "B", "B"]);
    const lit = () =>
      costPips(paying!.cost, paying!.owing).map((p) => (p.paid ? "*" : p.generic ? "o" : "b"));
    expect(paying!.cost).toEqual(["2", "B", "B"]);
    expect(lit()).toEqual(["o", "o", "b", "b"]);
    paying = keepPaying(paying, "card:9", ["1", "B", "B"]);
    expect(lit()).toEqual(["*", "o", "b", "b"]);
    // Between questions nothing is owed on screen: the last owing stays.
    paying = keepPaying(paying, "card:9", null);
    expect(lit()).toEqual(["*", "o", "b", "b"]);
    paying = keepPaying(paying, "card:9", ["B", "B"]);
    expect(lit()).toEqual(["*", "*", "b", "b"]);
    paying = keepPaying(paying, "card:9", ["B"]);
    expect(lit()).toEqual(["*", "*", "*", "b"]);
    // The cost drawn is still the cost being paid, not what is left.
    expect(paying!.cost).toEqual(["2", "B", "B"]);
    // Another card starts again.
    expect(keepPaying(paying, "card:10", null)).toBeNull();
  });
});

describe("the cost being paid, not the printed one (F-0058-G)", () => {
  it("Boneyard Lurker with mutate draws {2}{B/G}{B/G}, hybrid pictures, lit as paid", () => {
    const lurker = card({ name: "Boneyard Lurker", manaCost: "{2}{B}{G}" });
    const c = render(
      <CastingCard
        card={lurker}
        geometry={geometry}
        from={null}
        owing={["1", "BG"]}
        cost={["2", "BG", "BG"]}
        artUrl={(a) => a}
      />,
    ).container;
    const pips = [...c.querySelectorAll(".gs-cast-pip")];
    expect(pips).toHaveLength(4);
    expect(pips.slice(0, 2).every((p) => p.classList.contains("gs-cast-pip-generic"))).toBe(true);
    // One generic and one hybrid paid (owing {1}{B/G}).
    expect(pips.map((p) => p.classList.contains("gs-cast-pip-paid"))).toEqual([
      true,
      false,
      true,
      false,
    ]);
    const hybrid = pips[2] as HTMLImageElement;
    expect(hybrid.tagName).toBe("IMG");
    expect(hybrid.getAttribute("src")).toContain("sym_BG");
  });

  it("has pictures for colourless hybrid and hybrid Phyrexian", () => {
    const c = render(
      <CastingCard
        card={card({})}
        geometry={geometry}
        from={null}
        owing={null}
        cost={["CW", "BGP"]}
        artUrl={(a) => a}
      />,
    ).container;
    const srcs = [...c.querySelectorAll("img.gs-cast-pip")].map((i) => i.getAttribute("src"));
    expect(srcs).toHaveLength(2);
    expect(srcs[0]).toContain("sym_CW");
    expect(srcs[1]).toContain("sym_BGP");
  });
});

// --- item 8 ------------------------------------------------------------------------------

describe("a mutated creature makes sense (F-0058-H)", () => {
  const pile = card({
    id: "card:5",
    name: "Boneyard Lurker",
    types: "Creature — Nightmare Beast",
    merged: [
      { id: "card:20", name: "Boneyard Lurker", art: null },
      { id: "card:21", name: "Gemrazer", art: "a".repeat(64) },
      { id: "card:5", name: "Pouncing Shoreshark", art: null },
    ],
  });

  it("the order window names each trigger's own card, with its words", () => {
    const options = [
      {
        actionId: "trigger:0:card:5",
        label:
          "Boneyard Lurker · {0} · Whenever this creature mutates, return target permanent card from your graveyard to your hand.",
        objectId: "card:5",
        payable: true,
      },
      {
        actionId: "trigger:1:card:5",
        label:
          "Boneyard Lurker · {0} · Whenever this creature mutates, destroy target artifact or enchantment an opponent controls.",
        objectId: "card:5",
        payable: true,
      },
    ];
    const d = decision({
      options,
      arrange: {
        sources: {
          "trigger:0:card:5": {
            card: "card:20",
            name: "Boneyard Lurker",
            place: "top",
            says: "Return a permanent card from your graveyard to your hand.",
          },
          "trigger:1:card:5": {
            card: "card:21",
            name: "Gemrazer",
            place: "underneath",
            says: "Destroy an artifact or enchantment an opponent controls.",
          },
        },
      },
    });
    const c = render(
      <OrderTray
        decision={d}
        board={board({ battlefield: [pile] })}
        geometry={geometry}
        busy={false}
        artUrl={(a) => `/art/${a}`}
        onDone={vi.fn()}
      />,
    ).container;
    const tiles = [...c.querySelectorAll(".gs-win-tile")];
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Boneyard Lurker (top), number 1",
      "Gemrazer (underneath), number 2",
    ]);
    const says = tiles.map((t) => t.querySelector(".gs-win-tile-says")!.textContent);
    expect(says[0]).toBe(
      "Boneyard Lurker (top) Return a permanent card from your graveyard to your hand.",
    );
    expect(says[1]).toBe(
      "Gemrazer (underneath) Destroy an artifact or enchantment an opponent controls.",
    );
    // Gemrazer wears its own picture, not the top card's.
    expect(tiles[1]!.querySelector("img")!.getAttribute("src")).toContain("a".repeat(64));
  });

  it("the close-up lists the cards in the creature", () => {
    const c = render(
      <Inspect
        card={pile}
        name="Boneyard Lurker"
        costNow={null}
        artUrl={(a) => a}
        board={board({ battlefield: [pile] })}
        mySeat={1}
        onClose={vi.fn()}
      />,
    ).container;
    expect(c.querySelector(".gs-inspect-merged")!.textContent).toBe(
      "Cards in this creature: Boneyard Lurker (top), Gemrazer, Pouncing Shoreshark",
    );
    expect(c.querySelector(".gs-inspect-merged-note")!.textContent).toBe(
      "A mutated creature has every ability of its cards.",
    );
  });
});
