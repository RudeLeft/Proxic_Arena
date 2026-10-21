// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";
import { applyChanges, syntheticBoard } from "./fixture";
import { layout } from "./layout";

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
      expect(card.textContent).not.toMatch(/[A-Za-z]{3,}/);
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
