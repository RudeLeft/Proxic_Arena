// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";
import { applyChanges, combatScript, syntheticBoard } from "./fixture";
import { TAPPED_ORIGIN, layout } from "./layout";
import { centreOf } from "./effects";

/**
 * The drawn board — PHASE_07 §7.42 and §7.45, BATTLEFIELD_RENDERING.md §7
 * step 2: every object is a real button carrying its id and state, and
 * the board draws exactly what layout() decides. Geometry in a real
 * browser is the Playwright bridge's job (step 3); this is the structure.
 */
describe("Board", () => {
  const size = { width: 1920, height: 1080 };
  beforeEach(() => {
    // jsdom does no layout: give the board a size and a ResizeObserver.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const board = syntheticBoard(40, 30, 1);
  const draw = () =>
    render(
      <Board
        battlefield={board.battlefield}
        hand={board.hand}
        viewerSeat={board.viewerSeat}
        artUrl={(art) => art}
      />,
    ).container;

  it("draws one button per slot, per name tag and per hand card, each with its id", () => {
    const container = draw();
    const out = layout(board, size);
    const tags = out.slots.reduce((n, slot) => n + slot.attached.length, 0);
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(out.slots.length + tags + board.hand.length);
    const ids = buttons.map((b) => b.dataset.objectId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const slot of out.slots) {
      const lead = container.querySelector(`[data-object-id="${slot.ids[0]}"]`)!;
      expect(lead.getAttribute("data-zone")).toBe(slot.row);
      expect(lead.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("never nests a button in a button", () => {
    expect(draw().querySelector("button button")).toBeNull();
  });

  it("Auras and Equipment are tags on their host (AMENDMENT 4)", () => {
    const container = draw();
    const attached = board.battlefield.filter((c) => c.attachedTo !== null);
    expect(attached.length).toBeGreaterThan(0);
    for (const card of attached) {
      const tag = container.querySelector(`[data-object-id="${card.id}"]`)!;
      expect(tag.classList.contains("bf-tag")).toBe(true);
      expect(tag.getAttribute("data-attached-to")).toBe(card.attachedTo);
      // Same slot as the host.
      const host = container.querySelector(`[data-object-id="${card.attachedTo}"]`)!;
      expect(tag.closest(".bf-slot")).toBe(host.closest(".bf-slot"));
    }
  });

  it("power/toughness comes first in the bottom bar (AMENDMENT 4)", () => {
    const container = draw();
    const creature = container.querySelector('.bf-card[data-pt]:not([data-face="down"])')!;
    const bar = creature.querySelector(".bf-bar-bottom")!;
    expect(bar.firstElementChild!.className).toBe("bf-pt");
    expect(bar.firstElementChild!.textContent).toBe(creature.getAttribute("data-pt"));
  });

  it("an attacker says ATTACKING, a tapped card says TAPPED", () => {
    const container = draw();
    const attacker = container.querySelector('[data-attacking="true"]')!;
    expect(attacker.querySelector(".bf-state")!.textContent).toBe("ATTACKING");
    const tapped = container.querySelector('.bf-card[data-tapped="true"]:not([data-attacking])')!;
    expect(tapped.querySelector(".bf-state")!.textContent).toBe("TAPPED");
  });

  it("an opponent's face-down card shows no name", () => {
    const hidden = syntheticBoard(90, 30, 3);
    const container = render(
      <Board battlefield={hidden.battlefield} hand={[]} viewerSeat={1} artUrl={(art) => art} />,
    ).container;
    const down = [...container.querySelectorAll('[data-face="down"][data-controller="opponent"]')];
    expect(down.length).toBeGreaterThan(0);
    for (const card of down) {
      expect(card.getAttribute("aria-label")).toMatch(/^Face-down card/);
      // §7.18: the back says what is public -- "Face down" and its
      // power/toughness -- and nothing that could be a name.
      expect(card.querySelector(".bf-name")).toBeNull();
      expect((card.textContent ?? "").replace("Face down", "")).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it("the synthetic board is the same board every time for a seed", () => {
    expect(syntheticBoard(40, 30, 1)).toEqual(syntheticBoard(40, 30, 1));
    expect(syntheticBoard(40, 30, 2)).not.toEqual(syntheticBoard(40, 30, 1));
  });
});

/**
 * Movement — §7 step 4, PHASE 7 AMENDMENT 6. jsdom runs no animations,
 * so the Web Animations API is stubbed and the test checks what the board
 * ASKED for: a new card travels in from its zone, a card that left is
 * drawn as a ghost travelling to its zone, and a card that only moved is
 * left to its CSS transition.
 */
describe("Board movement", () => {
  const size = { width: 1920, height: 1080 };
  const calls: {
    element: Element;
    frames: Keyframe[];
    animation: { onfinish: (() => void) | null };
  }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
      this: Element,
      frames: Keyframe[],
    ) {
      const animation = { onfinish: null as (() => void) | null, cancel() {} };
      calls.push({ element: this, frames, animation });
      return animation;
    };
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const start = syntheticBoard(40, 30, 1);
  function at(n: number) {
    const step = applyChanges(start, n, 1);
    return (
      <Board
        battlefield={step.board.battlefield}
        hand={step.board.hand}
        viewerSeat={step.board.viewerSeat}
        artUrl={same}
        arrivals={step.arrivals}
        departures={step.departures}
      />
    );
  }
  const same = (art: string) => art;
  const stepWhere = (pattern: RegExp) => {
    for (let n = 1; n < 40; n++) if (pattern.test(applyChanges(start, n, 1).what)) return n;
    throw new Error(`no change matches ${pattern}`);
  };

  it("a missed update costs only the movement: the board ends the same (P7-K, §7.35)", () => {
    // Every slot as drawn once the movement is over: which object, where.
    const settled = (container: HTMLElement) => {
      act(() => {
        for (const c of calls) c.animation.onfinish?.();
      });
      return [...container.querySelectorAll(".bf-slot")]
        .map((slot) => {
          const id = slot.querySelector("[data-object-id]")?.getAttribute("data-object-id");
          return `${id} ${(slot as HTMLElement).style.cssText}`;
        })
        .sort();
    };
    const last = 12;
    const skipping = render(at(0));
    skipping.rerender(at(last)); // eleven updates never arrived
    const skipped = settled(skipping.container);
    skipping.unmount();
    calls.length = 0;

    const every = render(at(0));
    for (let n = 1; n <= last; n++) every.rerender(at(n));
    const all = settled(every.container);

    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped).toEqual(all);
  });

  it("the first board is drawn where it is, with nothing travelling", () => {
    render(at(0));
    expect(calls).toHaveLength(0);
  });

  it("a card that resolves travels in from the stack, faded at first", () => {
    const n = stepWhere(/resolves/);
    const view = render(at(n - 1));
    view.rerender(at(n));
    const [id] = [...applyChanges(start, n, 1).arrivals.keys()];
    const element = view.container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot");
    const call = calls.find((c) => c.element === element);
    expect(call, "the new card was not animated").toBeTruthy();
    expect(call!.frames[0]!.opacity).toBe(0.2);
    expect(String(call!.frames[0]!.transform)).toContain("scale(0.3)");
  });

  it("a card that dies leaves as a ghost to the graveyard, then is gone", () => {
    const n = stepWhere(/dies$/);
    const view = render(at(n - 1));
    view.rerender(at(n));
    const [id] = [...applyChanges(start, n, 1).departures.keys()];
    expect(view.container.querySelector(`[data-object-id="${id}"]`)).toBeNull();
    const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
    expect(ghost).toBeTruthy();
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.querySelector("button")).toBeNull();
    const call = calls.find((c) => c.element === ghost)!;
    expect(String(call.frames[1]!.transform)).toContain("scale(0.3)");
    act(() => call.animation.onfinish!());
    expect(view.container.querySelector(`[data-ghost-of="${id}"]`)).toBeNull();
  });

  it("a land played from the hand glides to the battlefield: as itself, or into its pile", () => {
    const n = stepWhere(/played from the hand/);
    const view = render(at(n - 1));
    const id = applyChanges(start, n - 1, 1).board.hand[0]!.id;
    const before = view.container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot");
    view.rerender(at(n));
    const own = view.container.querySelector(`[data-object-id="${id}"]`);
    if (own) {
      // Its own spot: the same element, left to its CSS transition.
      expect(own.closest(".bf-slot")).toBe(before);
      expect(calls.filter((c) => c.element === before)).toHaveLength(0);
    } else {
      // Joined a pile: a ghost travels into the pile's spot, unfaded.
      const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
      expect(ghost).toBeTruthy();
      const call = calls.find((c) => c.element === ghost)!;
      expect(call.frames[1]!.opacity).toBe(1);
      const joined = layout(applyChanges(start, n, 1).board, size).slots.find((slot) =>
        slot.ids.includes(id),
      )!;
      const pile = view.container.querySelector(`[data-object-id="${joined.ids[0]}"]`)!;
      expect(pile.getAttribute("data-pile")).toBe(String(joined.ids.length));
      expect(String(call.frames[1]!.transform)).toBe(
        (pile.closest(".bf-slot") as HTMLElement).style.transform,
      );
    }
  });

  it("with reduced motion asked for, nothing travels and nothing lingers", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const n = stepWhere(/dies$/);
    const view = render(at(n - 1));
    view.rerender(at(n));
    expect(calls).toHaveLength(0);
    expect(view.container.querySelector("[data-ghost-of]")).toBeNull();
  });
});

/**
 * Lines and combat effects — §7 step 5, PHASE 7 AMENDMENTS 4 and 7, on the
 * dev page's fixed combat script. What is drawn, and what was asked of the
 * (stubbed) Web Animations API; geometry in a real browser is the bridge's.
 */
describe("Board lines and effects", () => {
  const size = { width: 1920, height: 1080 };
  const calls: {
    element: Element;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
  }[] = [];
  let reduced = false;
  beforeEach(() => {
    calls.length = 0;
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
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      calls.push({ element: this, frames, options });
      return { onfinish: null, oncancel: null, cancel() {} };
    };
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const art = (a: string) => a;
  function scene(n: number) {
    const s = combatScript(n);
    return (
      <Board
        battlefield={s.board.battlefield}
        hand={s.board.hand}
        viewerSeat={s.board.viewerSeat}
        artUrl={art}
        arrivals={s.arrivals}
        departures={s.departures}
        combat={s.combat}
        stack={s.stack}
        pointedStack={s.pointedStack}
        attaching={s.attaching}
        damage={s.damage}
      />
    );
  }
  const lines = (c: Element, kind: string) =>
    [...c.querySelectorAll(`[data-line="${kind}"]`)].map(
      (g) => `${g.getAttribute("data-from")}>${g.getAttribute("data-to")}`,
    );

  it("fire lines from each attacker to what it attacks, shield lines from each blocker", () => {
    const c = render(scene(2)).container;
    expect(lines(c, "attack").sort()).toEqual(
      ["card:201>player:1", "card:202>player:1", "card:203>card:215"].sort(),
    );
    expect(lines(c, "block").sort()).toEqual(
      ["card:211>card:201", "card:212>card:201", "card:213>card:202"].sort(),
    );
    // The lines layer takes no clicks.
    expect(c.querySelector(".bf-lines")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("no lines once combat ends", () => {
    const c = render(scene(6)).container;
    expect(c.querySelectorAll("[data-line]")).toHaveLength(0);
  });

  it("the front stack object's target line; a pointed-at one's instead (spec 0028)", () => {
    const view = render(scene(8));
    expect(lines(view.container, "target")).toEqual(["stack:2>card:202"]);
    view.rerender(scene(9));
    expect(lines(view.container, "target")).toEqual(["stack:1>card:215"]);
  });

  it("draws every stack object, numbered in the order they resolve (F-0028-A)", () => {
    const view = render(scene(8));
    const cards = [...view.container.querySelectorAll<HTMLElement>('[data-zone="stack"]')];
    expect(cards.map((c) => `${c.dataset.objectId} ${c.dataset.order}`)).toEqual([
      "stack:2 1",
      "stack:1 2",
    ]);
    expect(cards[0]!.getAttribute("aria-label")).toContain("1st to resolve");
  });

  it("a gold chain while Equip's host is chosen, a tag once attached", () => {
    const view = render(scene(12));
    expect(lines(view.container, "attach")).toEqual(["card:216>card:214"]);
    view.rerender(scene(13));
    expect(lines(view.container, "attach")).toEqual([]);
    expect(
      view.container.querySelector('[data-object-id="card:216"]')!.getAttribute("data-attached-to"),
    ).toBe("card:214");
  });

  it("combat damage: attackers swoop, everything hit bursts and shows its number", () => {
    const view = render(scene(4));
    view.rerender(scene(5));
    const swoops = calls.filter((call) => call.options.id === "swoop");
    // Serra Angel and the Goblin token swoop; blockers do not.
    const swooping = swoops.map(
      (call) => call.element.querySelector("button")!.getAttribute("data-object-id")!,
    );
    expect(swooping.sort()).toEqual(["card:201", "card:203"]);
    for (const call of swoops) {
      expect(call.frames[1]!.offset).toBe(0.4);
      expect(call.frames[0]!.transform).toBe(call.frames[3]!.transform); // and back
    }
    const numbers = [...view.container.querySelectorAll("[data-damage-number]")].map(
      (n) => `${n.getAttribute("data-damage-number")} ${n.textContent}`,
    );
    expect(numbers.sort()).toEqual(
      ["card:201 −3", "card:211 −2", "card:212 −2", "card:215 −1"].sort(),
    );
    expect(view.container.querySelectorAll("[data-impact]")).toHaveLength(4);
    // Serra Angel is hit where it landed, but its number rises at home.
    const home = centreOf(
      layout(combatScript(5).board, size).boxes.get("card:201")!,
      TAPPED_ORIGIN,
    );
    const angelNumber = view.container.querySelector<HTMLElement>(
      '[data-damage-number="card:201"]',
    )!;
    const angelBurst = view.container.querySelector<HTMLElement>('[data-impact="card:201"]')!;
    expect(parseFloat(angelNumber.style.left)).toBeCloseTo(home.x, 3);
    expect(parseFloat(angelNumber.style.top)).toBeCloseTo(home.y, 3);
    expect(parseFloat(angelBurst.style.top)).toBeGreaterThan(home.y + 20);
    // A wave plays once: the same damage again draws nothing new.
    calls.length = 0;
    view.rerender(scene(5));
    expect(calls.filter((call) => call.options.id === "swoop")).toHaveLength(0);
  });

  // Spec 0003 -- owner report 2026-10-23: 300 attacking Goblin tokens drew
  // 300 cards and 300 fire lines fanned across the screen, and the page
  // stalled. Unblocked identical attackers of one thing are one pile, one
  // line, one swoop; a blocked one steps out with its own shield line.
  function horde(step: 4 | 5, blockedOne: boolean) {
    const s = combatScript(step);
    const base = s.board.battlefield.find((c) => c.id === "card:203")!;
    const goblins = Array.from({ length: 300 }, (_, i) => ({
      ...base,
      id: `card:${5000 + i}`,
      enteredAt: 5000,
      attacking: true,
      tapped: true,
    }));
    const guide = s.board.battlefield.find((c) => c.id === "card:211")!;
    const blocked = blockedOne ? [{ blocker: guide.id, attacker: "card:5000" }] : [];
    return (
      <Board
        battlefield={[...s.board.battlefield, ...goblins]}
        hand={s.board.hand}
        viewerSeat={s.board.viewerSeat}
        artUrl={art}
        arrivals={new Map()}
        departures={new Map()}
        combat={{
          attackers: goblins.map((g) => ({ id: g.id, target: { player: 1 } })),
          blocks: blocked,
        }}
        stack={[]}
        damage={
          step === 5
            ? {
                key: "horde",
                hits: goblins.map((g) => ({ source: g.id, target: { player: 1 }, amount: 1 })),
              }
            : null
        }
      />
    );
  }

  it("300 identical attackers are one pile, one fire line and one swoop (spec 0003)", () => {
    const view = render(horde(4, false));
    const fire = view.container.querySelectorAll('[data-line="attack"]');
    expect(fire).toHaveLength(1);
    expect(fire[0]!.getAttribute("data-count")).toBe("300");
    const piles = view.container.querySelectorAll('[data-pile="300"]');
    expect(piles).toHaveLength(1);
    view.rerender(horde(5, false));
    expect(calls.filter((call) => call.options.id === "swoop")).toHaveLength(1);
    // One number on the player hit, for all 300.
    expect(view.container.querySelector('[data-damage-number="player:1"]')!.textContent).toBe(
      "−300",
    );
  });

  it("a blocked attacker steps out of the pile with its own lines (spec 0003)", () => {
    const c = render(horde(4, true)).container;
    expect(c.querySelectorAll('[data-pile="299"]')).toHaveLength(1);
    expect(c.querySelector('[data-object-id="card:5000"]')!.getAttribute("data-pile")).toBeNull();
    expect(lines(c, "attack")).toHaveLength(2);
    expect(lines(c, "block")).toEqual(["card:211>card:5000"]);
  });

  it("a creature the same update killed waits for its impact before it leaves", () => {
    const view = render(scene(9));
    view.rerender(scene(10)); // Shock resolves: 2 damage, White Knight dies
    expect(view.container.querySelector('[data-damage-number="card:202"]')!.textContent).toBe("−2");
    const ghost = view.container.querySelector('[data-ghost-of="card:202"]')!;
    const call = calls.find((c) => c.element === ghost)!;
    expect(Number(call.options.delay)).toBeGreaterThan(100);
  });

  it("with reduced motion: no swoops, no bursts, the numbers still say what happened", () => {
    reduced = true;
    const view = render(scene(4));
    view.rerender(scene(5));
    expect(calls.filter((call) => call.options.id === "swoop")).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-impact]")).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-damage-number]")).toHaveLength(4);
  });
});
