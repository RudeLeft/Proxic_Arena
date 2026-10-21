// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";
import { syntheticBoard } from "./fixture";
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
