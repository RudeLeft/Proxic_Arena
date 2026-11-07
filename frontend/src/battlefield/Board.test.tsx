// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Board,
  returnTag,
  stackCaption,
  type BoardCard,
  type Merge,
  type Return,
  type StackView,
} from "./Board";
import { applyChanges, combatScript, syntheticBoard } from "./fixture";
import { TAPPED_ORIGIN, inCombat, layout } from "./layout";
import { placement, RETURN_MS, type AnchorId } from "./motion";

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

  it("a hand card that can't be paid for is dimmed, does not glow, and stays clickable (§7.54)", () => {
    const [cheap, dear] = board.hand;
    const picked: string[] = [];
    const container = render(
      <Board
        battlefield={board.battlefield}
        hand={board.hand}
        viewerSeat={board.viewerSeat}
        artUrl={(art) => art}
        choosable={new Set([cheap!.id, dear!.id])}
        unpayable={new Set([dear!.id])}
        onPick={(id) => picked.push(id)}
      />,
    ).container;
    const cardOf = (id: string) =>
      container.querySelector<HTMLButtonElement>(
        `[data-zone="viewer:hand"][data-object-id="${id}"]`,
      )!;
    // The affordable one glows and carries no mark.
    expect(cardOf(cheap!.id).classList.contains("bf-choosable")).toBe(true);
    expect(cardOf(cheap!.id).hasAttribute("data-unpayable")).toBe(false);
    // The unaffordable one: dimmed, no glow, said, still choosable.
    const card = cardOf(dear!.id);
    expect(card.classList.contains("bf-unpayable")).toBe(true);
    expect(card.classList.contains("bf-choosable")).toBe(false);
    expect(card.getAttribute("data-unpayable")).toBe("true");
    expect(card.getAttribute("data-choosable")).toBe("true");
    expect(card.getAttribute("aria-label")).toContain("not enough mana right now");
    // The e2e filter "what I can afford" now leaves it out.
    expect(
      [
        ...container.querySelectorAll(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        ),
      ].map((b) => (b as HTMLElement).dataset.objectId),
    ).toEqual([cheap!.id]);
    card.click();
    expect(picked).toEqual([dear!.id]);
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

  // Phase 10 A-04, A-05, A-07 (owner 2026-11-06, Amendment 5).
  function without(n: number, ids: string[], departures: Map<string, AnchorId>) {
    const step = applyChanges(start, n, 1);
    return (
      <Board
        battlefield={step.board.battlefield.filter((card) => !ids.includes(card.id))}
        hand={step.board.hand}
        viewerSeat={step.board.viewerSeat}
        artUrl={same}
        arrivals={new Map()}
        departures={departures}
      />
    );
  }
  const tableIds = (n: number) =>
    applyChanges(start, n, 1)
      .board.battlefield.filter((card) => card.kind === "creature")
      .map((card) => card.id);

  it("a destroyed creature shatters (flash, cracks, darkened), then glides to the graveyard", () => {
    const n = stepWhere(/dies$/);
    const view = render(at(n - 1));
    view.rerender(at(n));
    const [id] = [...applyChanges(start, n, 1).departures.keys()];
    const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
    expect(ghost.getAttribute("data-fate")).toBe("defeated");
    expect(ghost.querySelector(".bf-fate-flash")).toBeTruthy();
    expect(ghost.querySelectorAll(".bf-fate-cracks path")).toHaveLength(5);
    const call = calls.find((c) => c.element === ghost)!;
    expect(String(call.frames[0]!.filter)).toContain("brightness(1)");
    expect(String(call.frames.at(-1)!.filter)).toContain("brightness(0.55)");
    expect(String(call.frames.at(-1)!.transform)).toContain("scale(0.3)");
    // A shake before anything else: the card moves sideways and back.
    expect(call.frames[1]!.transform).not.toBe(call.frames[0]!.transform);
  });

  it("an exiled creature is banished (light, motes), not shattered", () => {
    const n = stepWhere(/dies$/) - 1;
    const view = render(at(n));
    const [id] = tableIds(n);
    view.rerender(without(n, [id!], new Map([[id!, "opponent:exile"]])));
    const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
    expect(ghost.getAttribute("data-fate")).toBe("exiled");
    expect(ghost.querySelector(".bf-fate-cracks")).toBeNull();
    expect(ghost.querySelectorAll(".bf-mote")).toHaveLength(14);
    const call = calls.find((c) => c.element === ghost)!;
    expect(String(call.frames.at(-1)!.filter)).toContain("drop-shadow(0px 0px 14px");
  });

  it("three or more leaving at once is a board wipe: the table flashes, then they all go", () => {
    const n = stepWhere(/dies$/) - 1;
    const view = render(at(n));
    const ids = tableIds(n).slice(0, 3);
    expect(ids).toHaveLength(3);
    view.rerender(without(n, ids, new Map()));
    expect(view.container.querySelector(".bf-sweep")).toBeTruthy();
    for (const id of ids) {
      const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
      expect(ghost.getAttribute("data-fate")).toBe("defeated");
      expect((ghost as HTMLElement).style.getPropertyValue("--fx-delay")).toBe("220ms");
    }
  });

  it("a creature that changes sides is pulled across: a gold line, a wider arc, a pulse", () => {
    const n = stepWhere(/dies$/) - 1;
    const step = applyChanges(start, n, 1);
    const view = render(at(n));
    const stolen = step.board.battlefield.find(
      (card) => card.kind === "creature" && card.seat !== step.board.viewerSeat,
    )!;
    calls.length = 0;
    view.rerender(
      <Board
        battlefield={step.board.battlefield.map((card) =>
          card.id === stolen.id ? { ...card, seat: step.board.viewerSeat } : card,
        )}
        hand={step.board.hand}
        viewerSeat={step.board.viewerSeat}
        artUrl={same}
        arrivals={new Map()}
        departures={new Map()}
      />,
    );
    const slot = view.container
      .querySelector(`[data-object-id="${stolen.id}"]`)!
      .closest(".bf-slot")!;
    expect(slot.classList.contains("bf-pulled")).toBe(true);
    expect(view.container.querySelectorAll(".bf-tethers path")).toHaveLength(1);
    const pull = calls.find((c) => c.element === slot)!;
    expect(String(pull.frames.at(-1)!.transform)).toBe((slot as HTMLElement).style.transform);
    // It leans into the turn mid-flight.
    const middle = String(pull.frames[10]!.transform);
    expect(middle).not.toContain("rotate(0deg)");
  });

  // Phase 10 A-17 (owner 2026-11-06, Amendment 9): Chained on, side tabs.
  function board(cards: BoardCard[], n: number) {
    const step = applyChanges(start, n, 1);
    return (
      <Board
        battlefield={cards}
        hand={step.board.hand}
        viewerSeat={step.board.viewerSeat}
        artUrl={same}
        arrivals={new Map()}
        departures={new Map()}
      />
    );
  }
  function equipScene() {
    const n = stepWhere(/dies$/) - 1;
    const cards = applyChanges(start, n, 1).board.battlefield;
    const mine = cards.filter(
      (card) =>
        card.kind === "creature" && card.seat === applyChanges(start, n, 1).board.viewerSeat,
    );
    const gear: BoardCard = {
      ...mine[0]!,
      id: "card:9001",
      name: "Bonesplitter",
      kind: "other",
      types: "Artifact — Equipment",
      power: null,
      toughness: null,
      attachedTo: null,
      tapped: false,
    };
    return { n, cards, a: mine[0]!, b: mine[1]!, gear };
  }

  it("equipping: the card is chained into a tab on the creature's side, which then shows", () => {
    const { n, cards, a, gear } = equipScene();
    const view = render(board([...cards, gear], n));
    view.rerender(board([...cards, { ...gear, attachedTo: a.id }], n));
    const ghost = view.container.querySelector(`[data-ghost-of="${gear.id}"]`)!;
    expect(ghost.getAttribute("data-chained")).toBe("true");
    expect(view.container.querySelectorAll(".bf-tethers path")).toHaveLength(1);
    const tab = view.container.querySelector(`.bf-tag[data-object-id="${gear.id}"]`)!;
    expect(tab.classList.contains("bf-tab-arrive")).toBe(true);
    expect(tab.closest(".bf-slot")!.classList.contains("bf-clink")).toBe(true);
    const call = calls.find((c) => c.element === ghost)!;
    expect(String(call.frames.at(-1)!.transform)).toContain("scale(0.2");
  });

  it("re-equipping: the tab is chained from one creature to the other", () => {
    const { n, cards, a, b, gear } = equipScene();
    const view = render(board([...cards, { ...gear, attachedTo: a.id }], n));
    view.rerender(board([...cards, { ...gear, attachedTo: b.id }], n));
    const ghost = view.container.querySelector(`[data-ghost-of="${gear.id}"]`)!;
    expect(ghost.getAttribute("data-chained")).toBe("true");
    const tab = view.container.querySelector(`.bf-tag[data-object-id="${gear.id}"]`)!;
    expect(tab.getAttribute("data-attached-to")).toBe(b.id);
    expect(tab.classList.contains("bf-tab-arrive")).toBe(true);
  });

  it("an Aura leaving with its creature shatters from its tab; Equipment left behind comes off the tab", () => {
    const { n, cards, a, gear } = equipScene();
    const aura: BoardCard = {
      ...gear,
      id: "card:9002",
      name: "Pacifism",
      types: "Enchantment — Aura",
    };
    const view = render(
      board([...cards, { ...gear, attachedTo: a.id }, { ...aura, attachedTo: a.id }], n),
    );
    calls.length = 0;
    view.rerender(board([...cards.filter((c) => c.id !== a.id), gear], n));
    const auraGhost = view.container.querySelector(`[data-ghost-of="${aura.id}"]`)!;
    expect(auraGhost.getAttribute("data-fate")).toBe("defeated");
    const gearSlot = view.container
      .querySelector(`[data-object-id="${gear.id}"]`)!
      .closest(".bf-slot")!;
    const call = calls.find((c) => c.element === gearSlot)!;
    expect(String(call.frames[0]!.transform)).toContain("scale(0.2");
  });

  it("a card that transforms lifts, flips and settles: its old face turns away, the new one round", () => {
    const { n, cards, a } = equipScene();
    const view = render(board(cards, n));
    calls.length = 0;
    view.rerender(
      board(
        cards.map((c) => (c.id === a.id ? { ...c, name: "Insectile Aberration" } : c)),
        n,
      ),
    );
    const ghost = view.container.querySelector(`[data-ghost-of="${a.id}"]`)!;
    expect(ghost.getAttribute("data-flip")).toBe("true");
    expect(ghost.textContent).toContain(a.name);
    const slot = view.container.querySelector(`[data-object-id="${a.id}"]`)!.closest(".bf-slot")!;
    const inner = slot.querySelector(":scope > .bf-card")!;
    const turnRound = calls.find((c) => c.element === inner)!;
    expect(String(turnRound.frames[0]!.transform)).toContain("rotateY(-90deg)");
    expect(String(turnRound.frames.at(-1)!.transform)).toContain("rotateY(0deg)");
    const turnAway = calls.find((c) => c.element === ghost.querySelector(":scope > .bf-card"))!;
    expect(String(turnAway.frames.at(-1)!.transform)).toContain("rotateY(90deg)");
  });

  // Phase 10 A-10 (owner 2026-11-06, Amendment 13): B · Fusion burst.
  function merging(
    cards: BoardCard[],
    n: number,
    extra: { merges?: Map<string, Merge>; stack?: StackView[]; departures?: Map<string, AnchorId> },
  ) {
    const step = applyChanges(start, n, 1);
    return (
      <Board
        battlefield={cards}
        hand={step.board.hand}
        viewerSeat={step.board.viewerSeat}
        artUrl={same}
        arrivals={new Map()}
        departures={extra.departures ?? new Map()}
        merges={extra.merges ?? new Map()}
        stack={extra.stack ?? []}
      />
    );
  }
  const slotOf = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;

  it("a meld: both pulled together and slam, a burst, and ONE card rises -- no flip, no glide to exile", () => {
    const { n, cards, a, b } = equipScene();
    const view = render(merging(cards, n, {}));
    const partnerWas = slotOf(view.container, b.id).style.transform;
    calls.length = 0;
    const after = cards
      .filter((c) => c.id !== b.id)
      .map((c) => (c.id === a.id ? { ...c, name: "Chittering Host", power: 5, toughness: 6 } : c));
    view.rerender(
      merging(after, n, {
        merges: new Map([[a.id, { kind: "meld", partners: [b.id] }]]),
        // What the game's record also says: the partner went to exile.
        departures: new Map([[b.id, "viewer:exile"]]),
      }),
    );
    // The merged card itself: unseen until the slam, landing exactly in its place.
    const host = slotOf(view.container, a.id);
    const rise = calls.filter((c) => c.element === host);
    expect(rise).toHaveLength(1);
    expect(rise[0]!.frames[0]!.opacity).toBe(0);
    expect(rise[0]!.frames.at(-1)!.opacity).toBe(1);
    expect(String(rise[0]!.frames.at(-1)!.transform)).toBe(host.style.transform);
    expect(host.style.zIndex).toBe("4601"); // above the dimmed table while it runs
    // Not also flipped (A-09): no flip ghost, nothing turned on its card.
    expect(view.container.querySelector("[data-flip]")).toBeNull();
    expect(calls.some((c) => c.element === host.querySelector(":scope > .bf-card"))).toBe(false);
    // Its old face, pulled in and gone at the slam.
    const old = view.container.querySelector(`[data-ghost-of="merge:${a.id}"]`)!;
    expect(old.getAttribute("data-merge")).toBe("old");
    expect(old.textContent).toContain(a.name);
    // The partner: pulled from its place, not exiled (no Banished, no Glide to exile).
    const partner = view.container.querySelector(`[data-ghost-of="${b.id}"]`)!;
    expect(partner.getAttribute("data-merge")).toBe("partner");
    expect(partner.getAttribute("data-fate")).toBeNull();
    expect(view.container.querySelectorAll(`[data-ghost-of="${b.id}"]`)).toHaveLength(1);
    const pulled = calls.find((c) => c.element === partner)!;
    expect(String(pulled.frames[0]!.transform)).toBe(partnerWas);
    expect(pulled.frames.at(-1)!.opacity).toBe(0);
    // The burst, in the meld's colour: the dim, the flash, the ring, 30 sparks.
    const burst = view.container.querySelector('.bf-merge[data-merge="meld"]') as HTMLElement;
    expect(burst.style.getPropertyValue("--merge-colour")).toBe("185 147 232");
    expect(burst.querySelector(".bf-merge-dim")).toBeTruthy();
    expect(burst.querySelector(".bf-merge-flash")).toBeTruthy();
    expect(burst.querySelector(".bf-merge-ring")).toBeTruthy();
    expect(burst.querySelectorAll(".bf-merge-spark")).toHaveLength(30);
    expect(view.container.querySelector(".bf-sweep")).toBeNull();
    // Once it has run: one card, nothing more.
    act(() => {
      for (const c of calls) c.animation.onfinish?.();
    });
    expect(host.style.zIndex).toBe(host.dataset.z);
    expect(view.container.querySelector("[data-merge]:not(.bf-merge)")).toBeNull();
    act(() => {
      // jsdom has no AnimationEvent: the name is put on a plain event.
      const end = new Event("animationend", { bubbles: true });
      Object.defineProperty(end, "animationName", { value: "bf-merge-flash" });
      burst.querySelector(".bf-merge-flash")!.dispatchEvent(end);
    });
    expect(view.container.querySelector(".bf-merge")).toBeNull();
  });

  it("a mutate: the spell is pulled from the stack into the creature, not resolved to a graveyard", () => {
    const { n, cards, a } = equipScene();
    const spell: StackView = {
      id: "stack:33",
      name: "Gemrazer",
      kind: "spell",
      source: null,
      card: "card:9100",
      seat: applyChanges(start, n, 1).board.viewerSeat,
      targets: [{ object: a.id }],
    };
    const view = render(merging(cards, n, { stack: [spell] }));
    calls.length = 0;
    view.rerender(
      merging(
        cards.map((c) => (c.id === a.id ? { ...c, name: "Gemrazer", power: 4, toughness: 4 } : c)),
        n,
        { merges: new Map([[a.id, { kind: "mutate", partners: ["card:9100"] }]]) },
      ),
    );
    const ghosts = view.container.querySelectorAll('[data-ghost-of="stack:33"]');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.getAttribute("data-merge")).toBe("partner");
    expect(view.container.querySelector(".bf-spark")).toBeNull(); // no resolving spark
    expect(view.container.querySelector("[data-flip]")).toBeNull();
    const pulled = calls.find((c) => c.element === ghosts[0])!;
    expect(String(pulled.frames.at(-1)!.transform)).not.toContain("scale(0.3)"); // not to a pile
    const burst = view.container.querySelector('.bf-merge[data-merge="mutate"]') as HTMLElement;
    expect(burst.style.getPropertyValue("--merge-colour")).toBe("110 220 150");
  });

  it("mutating underneath keeps the name: still the burst, and no flip", () => {
    const { n, cards, a } = equipScene();
    const spell: StackView = {
      id: "stack:34",
      name: "Gemrazer",
      kind: "spell",
      source: null,
      card: "card:9101",
      targets: [{ object: a.id }],
    };
    const view = render(merging(cards, n, { stack: [spell] }));
    calls.length = 0;
    view.rerender(
      merging(cards, n, { merges: new Map([[a.id, { kind: "mutate", partners: ["card:9101"] }]]) }),
    );
    const host = slotOf(view.container, a.id);
    expect(calls.filter((c) => c.element === host)).toHaveLength(1);
    expect(view.container.querySelector(`[data-ghost-of="merge:${a.id}"]`)).toBeTruthy();
    expect(view.container.querySelector(".bf-merge")).toBeTruthy();
  });

  it("a merge plays once: the same board drawn again (pointing at a card) does not merge again", () => {
    const { n, cards, a, b } = equipScene();
    const view = render(merging(cards, n, {}));
    const merges = new Map<string, Merge>([[a.id, { kind: "meld", partners: [b.id] }]]);
    const after = cards.filter((c) => c.id !== b.id);
    view.rerender(merging(after, n, { merges }));
    calls.length = 0;
    act(() => {
      slotOf(view.container, a.id)
        .querySelector("button")!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    view.rerender(merging(after, n, { merges }));
    expect(calls.filter((c) => c.element === slotOf(view.container, a.id))).toHaveLength(0);
    expect(view.container.querySelectorAll(".bf-merge")).toHaveLength(1);
  });

  it("one creature dying is not a wipe: no flash", () => {
    const n = stepWhere(/dies$/);
    const view = render(at(n - 1));
    view.rerender(at(n));
    expect(view.container.querySelector(".bf-sweep")).toBeNull();
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
    expect(String(call.frames.at(-1)!.transform)).toContain("scale(0.3)");
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
      // Its own spot: the same element, which Glides there (Phase 10
      // A-00), landing exactly where the layout puts it.
      expect(own.closest(".bf-slot")).toBe(before);
      const glides = calls.filter((c) => c.element === before);
      expect(glides).toHaveLength(1);
      expect(String(glides[0]!.frames.at(-1)!.transform)).toBe(
        (before as HTMLElement).style.transform,
      );
    } else {
      // Joined a pile: a ghost travels into the pile's spot, unfaded.
      const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
      expect(ghost).toBeTruthy();
      const call = calls.find((c) => c.element === ghost)!;
      expect(call.frames.at(-1)!.opacity).toBe(1);
      const joined = layout(applyChanges(start, n, 1).board, size).slots.find((slot) =>
        slot.ids.includes(id),
      )!;
      const pile = view.container.querySelector(`[data-object-id="${joined.ids[0]}"]`)!;
      expect(pile.getAttribute("data-pile")).toBe(String(joined.ids.length));
      expect(String(call.frames.at(-1)!.transform)).toBe(
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
  type Played = {
    onfinish: (() => void) | null;
    playState: string;
  };
  const calls: {
    element: Element;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
    animation: Played;
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
      const end = Number(options.delay ?? 0) + Number(options.duration ?? 0);
      const animation = {
        onfinish: null,
        oncancel: null,
        cancel() {},
        id: options.id ?? "",
        playState: "running",
        currentTime: 0,
        playbackRate: 1,
        effect: { getComputedTiming: () => ({ endTime: end }) },
      };
      calls.push({ element: this, frames, options, animation });
      return animation;
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

  it("fire lines from unblocked attackers, on pointing; blockers stand facing what they block (A-12)", () => {
    const c = render(scene(2)).container;
    // Spec 0059 item 9: no attack line at rest; the Goblin token's badge.
    expect(lines(c, "attack")).toEqual([]);
    const token = c.querySelector('[data-object-id="card:203"]')!;
    fireEvent.pointerEnter(token);
    // Serra Angel and White Knight are blocked: they hit their blockers,
    // not the player, so only the Goblin token's line is drawn.
    expect(lines(c, "attack")).toEqual(["card:203>card:215"]);
    fireEvent.pointerLeave(token);
    expect(lines(c, "attack")).toEqual([]);
    // Each blocker stands facing its attacker: no shield lines.
    expect(lines(c, "block")).toEqual([]);
    const blocks = (id: string) =>
      c.querySelector(`[data-object-id="${id}"]`)!.getAttribute("data-blocks");
    expect([blocks("card:211"), blocks("card:212"), blocks("card:213")]).toEqual([
      "card:201",
      "card:201",
      "card:202",
    ]);
    const guide = c.querySelector('[data-object-id="card:211"]')!;
    expect(guide.textContent).toContain("BLOCKING");
    expect(guide.getAttribute("data-blocking")).toBe("true");
    expect(guide.classList.contains("bf-blocking")).toBe(true);
    expect(guide.getAttribute("aria-label")).toContain("blocking Serra Angel");
    // The lines layer takes no clicks.
    expect(c.querySelector(".bf-lines")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("F-0059-A: each unblocked attacker wears a badge of what it attacks; its line shows on pointing, focus or a tap", () => {
    const s = combatScript(1);
    const faces = new Map([
      [1, "/face-1.webp"],
      [2, "/face-2.webp"],
    ]);
    const c = render(
      <Board
        battlefield={s.board.battlefield}
        hand={s.board.hand}
        viewerSeat={s.board.viewerSeat}
        artUrl={art}
        combat={s.combat}
        stack={s.stack}
        playerFaces={faces}
      />,
    ).container;
    const you = s.board.viewerSeat;
    const badge = (id: string) =>
      c
        .querySelector(`[data-object-id="${id}"]`)!
        .closest(".bf-slot")!
        .querySelector<HTMLElement>("[data-attack-badge]");
    const nameOf = (id: string) =>
      c
        .querySelector(`[data-object-id="${id}"]`)!
        .closest(".bf-slot")!
        .querySelector(".bf-aim-name");
    // Serra Angel and White Knight attack you: your picture, as on your plate.
    for (const id of ["card:201", "card:202"]) {
      expect(badge(id)!.dataset.attackBadge).toBe(`player:${you}`);
      expect(badge(id)!.querySelector("img")!.getAttribute("src")).toBe(faces.get(you));
    }
    // The Goblin token attacks The Wandering Emperor: a planeswalker's mark.
    expect(badge("card:203")!.dataset.attackBadge).toBe("card:215");
    expect(badge("card:203")!.querySelector(".bf-aim-card")).not.toBeNull();
    expect(badge("card:203")!.querySelector("img")).toBeNull();
    // The words say it too; nothing that is not attacking has a badge.
    const token = c.querySelector('[data-object-id="card:203"]')!;
    expect(token.getAttribute("aria-label")).toContain("attacking The Wandering Emperor");
    expect(c.querySelectorAll("[data-attack-badge]")).toHaveLength(3);
    // At rest: no attack line, no name.
    expect(lines(c, "attack")).toEqual([]);
    expect(nameOf("card:203")).toBeNull();
    // Pointing: its line, and the planeswalker's name by the badge -- and
    // nothing on the table moves for it (P10-R1).
    calls.length = 0;
    fireEvent.pointerEnter(token);
    expect(lines(c, "attack")).toEqual(["card:203>card:215"]);
    expect(calls).toHaveLength(0);
    expect(nameOf("card:203")!.textContent).toBe("The Wandering Emperor");
    expect(token.getAttribute("data-aimed")).toBe("true");
    fireEvent.pointerLeave(token);
    expect(lines(c, "attack")).toEqual([]);
    // The keyboard: focus shows it, leaving hides it.
    const angel = c.querySelector('[data-object-id="card:201"]')!;
    fireEvent.focus(angel);
    expect(lines(c, "attack")).toEqual([`card:201>player:${you}`]);
    expect(nameOf("card:201")!.textContent).toBe("You");
    fireEvent.blur(angel);
    expect(lines(c, "attack")).toEqual([]);
    // A touch screen has no pointing: a tap shows it, a second tap hides it.
    // (jsdom has no PointerEvent: one that carries its pointerType.)
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerType: string;
        constructor(type: string, init?: PointerEventInit) {
          super(type, init);
          this.pointerType = init?.pointerType ?? "mouse";
        }
      },
    );
    fireEvent.pointerDown(token, { pointerType: "touch" });
    fireEvent.pointerLeave(token, { pointerType: "touch" });
    expect(lines(c, "attack")).toEqual(["card:203>card:215"]);
    fireEvent.pointerDown(token, { pointerType: "touch" });
    expect(lines(c, "attack")).toEqual([]);
  });

  it("F-0059-A: without the players' pictures, a badge shows the default face; the other player's name on pointing", () => {
    const s = combatScript(1);
    // Seen from the attacker's side: the badge is the defender's.
    const attacker = s.board.battlefield.find((c) => c.id === "card:201")!.seat;
    const c = render(
      <Board
        battlefield={s.board.battlefield}
        hand={[]}
        viewerSeat={attacker}
        opponentName="Pat"
        artUrl={art}
        combat={s.combat}
        stack={s.stack}
      />,
    ).container;
    const angel = c.querySelector('[data-object-id="card:201"]')!;
    const badge = angel.closest(".bf-slot")!.querySelector("[data-attack-badge]")!;
    expect(badge.querySelector("img")!.getAttribute("src")).toBeTruthy();
    fireEvent.pointerEnter(angel);
    expect(angel.closest(".bf-slot")!.querySelector(".bf-aim-name")!.textContent).toBe("Pat");
    expect(angel.getAttribute("aria-label")).toContain("attacking Pat");
  });

  it("A-11: attackers step forward over 600 ms, each a beat after the one before", () => {
    const view = render(scene(0));
    calls.length = 0;
    view.rerender(scene(1));
    const out = layout(combatScript(1).board, size);
    const steps = ["card:201", "card:202", "card:203"].map((id) => {
      const call = calls.find(
        (c) => c.element.querySelector(`:scope > button[data-object-id="${id}"]`) !== null,
      )!;
      return call;
    });
    expect(steps.map((c) => c.options.duration)).toEqual([600, 600, 600]);
    expect(steps.map((c) => c.options.delay).sort((p, q) => Number(p) - Number(q))).toEqual([
      0, 120, 240,
    ]);
    // Each ends exactly where the layout puts it: the front line.
    for (const [i, id] of ["card:201", "card:202", "card:203"].entries()) {
      const last = steps[i]!.frames[steps[i]!.frames.length - 1]!;
      const box = out.boxes.get(id)!;
      expect(String(last.transform)).toContain(`rotate(${box.rotation}deg)`);
      expect(out.rowOf.get(id)).toBe("opponent:creature-1");
    }
  });

  it("A-12: blockers glide up to face their attacker over 650 ms, a beat apart", () => {
    const view = render(scene(1));
    calls.length = 0;
    view.rerender(scene(2));
    const moved = ["card:211", "card:212", "card:213"].map(
      (id) =>
        calls.find(
          (c) => c.element.querySelector(`:scope > button[data-object-id="${id}"]`) !== null,
        )!,
    );
    expect(moved.map((c) => c.options.duration)).toEqual([650, 650, 650]);
    expect(moved.map((c) => c.options.delay).sort((p, q) => Number(p) - Number(q))).toEqual([
      0, 160, 320,
    ]);
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

  const rest = "translate(0px, 0px) rotate(0deg) scale(1)";
  const fightsOf = () => calls.filter((call) => call.options.id === "fight");
  const fightOn = (id: string) =>
    fightsOf().find((c) => c.element.getAttribute("data-object-id") === id);
  /** The first moment a fighter's frames leave its rest. */
  const movesAt = (frames: Keyframe[]) =>
    Number(frames.find((f) => f.transform !== rest)?.offset ?? 1);

  it("A-13: combat damage plays one fight at a time, first and last frames exact", () => {
    const view = render(scene(4));
    calls.length = 0;
    view.rerender(scene(5));
    // Serra Angel against its two blockers, then the Goblin token at the
    // Emperor. White Knight dealt nothing (first strike was its step).
    const angel = fightOn("card:201")!;
    const token = fightOn("card:203")!;
    const emperor = fightOn("card:215")!;
    expect(fightOn("card:202")).toBeUndefined();
    for (const call of [angel, token, emperor]) {
      expect(call.frames[0]!.transform).toBe(rest);
      expect(call.frames[call.frames.length - 1]!.transform).toBe(rest);
      expect(call.frames[0]!.offset).toBe(0);
      expect(call.frames[call.frames.length - 1]!.offset).toBe(1);
      // One clock for all of it, so a click hurries every part together.
      expect(call.options.duration).toBe(angel.options.duration);
      expect(call.options.easing).toBe("linear");
    }
    // In order: the blocked fight first, then the unblocked attacker.
    expect(movesAt(angel.frames)).toBeLessThan(movesAt(token.frames));
    // The fighters are raised above the dimming while it plays.
    const raised = fightsOf().filter((c) => c.element.classList.contains("bf-slot"));
    expect(raised.length).toBe(3);
    // The dead fight, then shatter after the beat: their ghosts.
    for (const id of ["card:211", "card:212"]) {
      const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
      expect(ghost.getAttribute("data-fought")).toBe("true");
      expect(ghost.getAttribute("data-fate")).toBe("defeated");
      const leaving = calls.find((c) => c.element === ghost)!;
      expect(Number(leaving.options.delay)).toBeGreaterThan(1500);
      const fighting = calls.find(
        (c) => c.element.parentElement === ghost && c.options.id === "fight",
      )!;
      expect(fighting.frames[0]!.transform).toBe(rest);
    }
    const marks = (kind: string) => [
      ...view.container.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
    ];
    expect(marks("caption").map((m) => m.textContent)).toEqual([
      "Damage · the Serra Angel against your Goblin Guide and Llanowar Elves",
      "Damage · Your opponent's Goblin Token hit The Wandering Emperor",
    ]);
    expect(
      marks("number")
        .map((m) => `${m.dataset.of} ${m.textContent}`)
        .sort(),
    ).toEqual(["card:201 −3", "card:211 −2", "card:212 −2", "card:215 −1"]);
    // Three slash marks across each card struck.
    expect(marks("slash")).toHaveLength(12);
    expect(marks("dim")).toHaveLength(1);
    expect(marks("edge")).toHaveLength(0);
    // A wave plays once: the same damage again draws nothing new.
    calls.length = 0;
    view.rerender(scene(5));
    expect(fightsOf()).toHaveLength(0);
  });

  it("A-13: first strike is its own wave; its dead shatter after their fight", () => {
    const view = render(scene(2));
    calls.length = 0;
    view.rerender(scene(3));
    const knight = fightOn("card:202")!;
    expect(knight.frames[0]!.transform).toBe(rest);
    const caption = view.container.querySelector('[data-fight="caption"]')!;
    expect(caption.textContent).toBe("First strike · the White Knight against your Grizzly Bears");
    const ghost = view.container.querySelector('[data-ghost-of="card:213"]')!;
    expect(ghost.getAttribute("data-fought")).toBe("true");
  });

  /**
   * The damage board as the game sends it when the attacker dies: Serra
   * Angel and both blockers dead, Forge's combat already over (no
   * attackers left), the rest laid out at home -- the RESULT.
   */
  function deadly() {
    const s = combatScript(5);
    const battlefield = s.board.battlefield.filter((c) => c.id !== "card:201");
    const departures = new Map(s.departures);
    departures.set("card:201", "opponent:graveyard");
    return (
      <Board
        battlefield={battlefield}
        hand={s.board.hand}
        viewerSeat={s.board.viewerSeat}
        artUrl={art}
        departures={departures}
        combat={null}
        stack={[]}
        damage={s.damage}
      />
    );
  }
  /** Where a card stood in combat (step 4, as the board laid it out then). */
  const combatSpot = (id: string) => {
    const s = combatScript(4);
    const box = layout(
      { ...s.board, battlefield: inCombat(s.board.battlefield, s.combat!) },
      size,
    ).boxes.get(id)!;
    return placement(
      box,
      layout(s.board, size).geometry.cardW,
      layout(s.board, size).geometry.cardH,
      TAPPED_ORIGIN,
    ).transform;
  };

  it("A-13: from the damage board's first frame, everyone stands where they fought -- the dead too", () => {
    const view = render(scene(4));
    calls.length = 0;
    view.rerender(deadly());
    // The dead: drawn at once, at their combat spots, until they shatter.
    for (const id of ["card:201", "card:211", "card:212"]) {
      const ghost = view.container.querySelector<HTMLElement>(`[data-ghost-of="${id}"]`)!;
      expect(ghost.style.transform).toBe(combatSpot(id));
      expect(ghost.getAttribute("data-fought")).toBe("true");
    }
    // The living: drawn where they stood in combat, not at home (the token
    // in front, Walking Corpse a line back) -- by the drawing itself, not
    // an animation's first frame.
    for (const id of ["card:203", "card:214", "card:215"]) {
      const slot = view.container
        .querySelector(`[data-object-id="${id}"]`)!
        .closest<HTMLElement>(".bf-slot")!;
      expect(slot.style.transform).toBe(combatSpot(id));
    }
    // Nothing glides home yet, and the fights start at once.
    expect(
      calls.filter((c) => c.element.matches(".bf-slot:not(.bf-ghost)") && c.options.id !== "fight"),
    ).toEqual([]);
    const dim = calls.find((c) => c.element.classList.contains("bf-fight-dim"))!;
    expect(Number(dim.options.delay)).toBe(0);
    expect(Number(fightOn("card:203")!.options.delay)).toBe(0);
    // A board arriving while they fight keeps them there too.
    calls.length = 0;
    view.rerender(deadly());
    expect(
      calls.filter((c) => c.element.matches(".bf-slot:not(.bf-ghost)") && c.options.id !== "fight"),
    ).toEqual([]);
  });

  it("A-13: when the fights end (or a click hurries them), the survivors go home", () => {
    const view = render(scene(4));
    view.rerender(deadly());
    const clock = calls.find((c) => c.options.id === "fight-clock")!.animation;
    calls.length = 0;
    act(() => {
      clock.playState = "finished";
      clock.onfinish?.();
    });
    const corpse = view.container
      .querySelector('[data-object-id="card:214"]')!
      .closest<HTMLElement>(".bf-slot")!;
    const home = layout(
      {
        ...combatScript(5).board,
        battlefield: combatScript(5).board.battlefield.filter((c) => c.id !== "card:201"),
      },
      size,
    );
    expect(corpse.style.transform).toBe(
      placement(
        home.boxes.get("card:214")!,
        home.geometry.cardW,
        home.geometry.cardH,
        TAPPED_ORIGIN,
      ).transform,
    );
    // A Glide home, from where it fought, at once.
    const glide = calls.find((c) => c.element === corpse)!;
    expect(Number(glide.options.delay ?? 0)).toBe(0);
    expect(glide.frames[0]!.transform).toBe(combatSpot("card:214"));
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
                combat: "regular",
                fights: goblins.map((g) => ({
                  attacker: g.id,
                  defender: { player: 1 },
                  blockers: [],
                })),
              }
            : null
        }
      />
    );
  }

  it("300 identical attackers are 20 piles of 15, a badge, a fire line on pointing and a fight each (specs 0003, 0036, 0059)", () => {
    const view = render(horde(4, false));
    // Spec 0059 item 9: a badge each, no lines at rest.
    expect(view.container.querySelectorAll('[data-attack-badge="player:1"]')).toHaveLength(20);
    expect(view.container.querySelectorAll('[data-line="attack"]')).toHaveLength(0);
    const piles = view.container.querySelectorAll('[data-pile="15"]');
    expect(piles).toHaveLength(20);
    // Pointing at one pile: its one line, standing for its 15.
    fireEvent.pointerEnter(piles[3]!);
    const fire = view.container.querySelectorAll('[data-line="attack"]');
    expect(fire).toHaveLength(1);
    expect(fire[0]!.getAttribute("data-count")).toBe("15");
    expect(fire[0]!.getAttribute("data-from")).toBe(piles[3]!.getAttribute("data-object-id"));
    fireEvent.pointerLeave(piles[3]!);
    calls.length = 0;
    view.rerender(horde(5, false));
    // One fight per pile, each lunging at your plate: a slash across it,
    // the screen's red edge, and its 15.
    const lunges = fightsOf().filter((c) => c.element.classList.contains("bf-card"));
    expect(lunges).toHaveLength(20);
    const marks = (kind: string) => [
      ...view.container.querySelectorAll<HTMLElement>(`[data-fight="${kind}"]`),
    ];
    expect(marks("caption")).toHaveLength(20);
    expect(marks("caption")[0]!.textContent).toBe(
      "Damage · Your opponent's 15 Goblin Token hit you",
    );
    expect(marks("edge")).toHaveLength(20);
    expect(marks("number").map((m) => `${m.dataset.of} ${m.textContent}`)).toEqual(
      Array.from({ length: 20 }, () => "player:1 −15"),
    );
    // Twenty fights speed up together (to 0.3 of their time at most): one clock.
    expect(Number(lunges[0]!.options.duration)).toBeLessThan(20 * 1500 * 0.31 + 250);
    expect(new Set(lunges.map((c) => c.options.duration)).size).toBe(1);
    // Each lunges toward your plate and back.
    expect(lunges[0]!.frames.some((f) => f.transform !== rest)).toBe(true);
  });

  it("a blocked attacker steps out of the pile and its blocker faces it (specs 0003, 0037, A-12)", () => {
    const c = render(horde(4, true)).container;
    expect(c.querySelectorAll('[data-pile="15"]')).toHaveLength(19);
    expect(c.querySelectorAll('[data-pile="14"]')).toHaveLength(1);
    expect(c.querySelector('[data-object-id="card:5000"]')!.getAttribute("data-pile")).toBeNull();
    expect(c.querySelector('[data-object-id="card:211"]')!.getAttribute("data-blocks")).toBe(
      "card:5000",
    );
    // The 299 unblocked: a badge per pile; the blocked one none; no shield
    // line, and (spec 0059) no attack line until one is pointed at.
    expect(c.querySelectorAll("[data-attack-badge]")).toHaveLength(20);
    expect(lines(c, "attack")).toEqual([]);
    const blocked = c.querySelector('[data-object-id="card:5000"]')!;
    expect(blocked.getAttribute("data-aims")).toBeNull();
    expect(blocked.closest(".bf-slot")!.querySelector("[data-attack-badge]")).toBeNull();
    fireEvent.pointerEnter(blocked);
    expect(lines(c, "attack")).toEqual([]);
    expect(lines(c, "block")).toEqual([]);
  });

  it("a creature a spell killed waits for its burst before it leaves", () => {
    const view = render(scene(9));
    view.rerender(scene(10)); // Shock resolves: 2 damage, White Knight dies
    expect(view.container.querySelector('[data-damage-number="card:202"]')!.textContent).toBe("−2");
    const ghost = view.container.querySelector('[data-ghost-of="card:202"]')!;
    const call = calls.find((c) => c.element === ghost)!;
    expect(Number(call.options.delay)).toBeGreaterThan(100);
  });

  it("with reduced motion: no fights, no bursts, the numbers still say what happened", () => {
    reduced = true;
    const view = render(scene(4));
    view.rerender(scene(5));
    expect(fightsOf()).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-fight]")).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-impact]")).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-damage-number]")).toHaveLength(4);
  });
});

// Amendment 13 (item 12) -- one line under the stack, one style.
describe("the line under the stack", () => {
  it("names who resolves next and how many wait", () => {
    const theirs = { by: "Pat", kind: "trigger", name: "Soul Warden", seat: 2 };
    expect(stackCaption([theirs], 1, 1, 4)).toBe("Next: Pat's trigger");
    expect(stackCaption([theirs, theirs], 1, 2, 4)).toBe("Next: Pat's trigger · 2 on the stack");
    expect(stackCaption([{ by: "RudeLeft", kind: "spell", name: "Shock", seat: 1 }], 1, 1, 4)).toBe(
      "Next: your Shock",
    );
  });
});

/**
 * Phase 10 A-14 (owner 2026-11-06, Amendment 17): D · Lift and glide -- back
 * to a hand, onto or into a library, shuffled in; the tag at the destination.
 */
describe("Board: back to a hand or a library (A-14)", () => {
  const size = { width: 1920, height: 1080 };
  const calls: {
    element: Element;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
    animation: { onfinish: (() => void) | null };
  }[] = [];
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
    vi.stubGlobal("matchMedia", () => ({ matches: still }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const animation = { onfinish: null as (() => void) | null, cancel() {} };
      calls.push({ element: this, frames, options, animation });
      return animation;
    };
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const start = syntheticBoard(24, 30, 2);
  const viewer = start.viewerSeat;
  // A creature alone in its slot, on each side (a pile member has no element of its own).
  const alone = (seat: number, not: string[] = []) => {
    const out = layout(start, size);
    const slot = out.slots.find((s) => {
      const c = start.battlefield.find((card) => card.id === s.ids[0]);
      return (
        s.ids.length === 1 &&
        c?.kind === "creature" &&
        c.seat === seat &&
        s.attached.length === 0 &&
        !not.includes(c.id)
      );
    });
    return start.battlefield.find((card) => card.id === slot!.ids[0])!;
  };
  const mine = alone(viewer);
  const theirs = alone(viewer === 1 ? 2 : 1);
  const backs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `hidden-hand:${theirs.seat}:${i}`, shown: null }));
  function draw(
    battlefield: BoardCard[],
    extra: {
      hand?: typeof start.hand;
      opponentHand?: ReturnType<typeof backs>;
      returns?: Map<string, Return>;
      stack?: StackView[];
    } = {},
  ) {
    return (
      <Board
        battlefield={battlefield}
        hand={extra.hand ?? start.hand}
        opponentHand={extra.opponentHand ?? backs(3)}
        opponentName="Bob"
        viewerSeat={viewer}
        artUrl={(art) => art}
        arrivals={new Map()}
        departures={new Map()}
        returns={extra.returns ?? new Map()}
        stack={extra.stack ?? []}
      />
    );
  }
  const without = (...ids: string[]) => start.battlefield.filter((card) => !ids.includes(card.id));
  const slotOf = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-object-id="${id}"]`)!.closest(".bf-slot") as HTMLElement;
  const tags = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-return-tag]")].map((t) => t.textContent);

  it("back to your hand: the same card lifts and glides into its place there -- no pop", () => {
    const view = render(draw(start.battlefield));
    const was = slotOf(view.container, mine.id);
    const from = was.style.transform;
    calls.length = 0;
    const hand = [
      ...start.hand,
      {
        id: mine.id,
        name: mine.name,
        kind: mine.kind,
        types: mine.types,
        power: mine.power,
        toughness: mine.toughness,
        art: mine.art,
      },
    ];
    view.rerender(
      draw(without(mine.id), {
        hand,
        returns: new Map([[mine.id, { zone: "hand", side: "viewer", where: null, hidden: false }]]),
      }),
    );
    const card = view.container.querySelector(
      `[data-zone="viewer:hand"][data-object-id="${mine.id}"]`,
    )!;
    const slot = card.closest(".bf-slot") as HTMLElement;
    expect(slot).toBe(was); // one element all the way: nothing appears or vanishes
    expect(view.container.querySelector(`[data-ghost-of="${mine.id}"]`)).toBeNull();
    const lift = calls.filter((c) => c.element === slot);
    expect(lift).toHaveLength(1);
    expect(lift[0]!.options.duration).toBe(RETURN_MS);
    expect(String(lift[0]!.frames[0]!.transform)).toBe(from);
    expect(String(lift[0]!.frames.at(-1)!.transform)).toBe(slot.style.transform);
    expect(lift[0]!.frames.every((f) => f.opacity === 1)).toBe(true);
    expect(tags(view.container)).toEqual(["Back to your hand"]);
    const tag = view.container.querySelector("[data-return-tag]")!;
    const tagRun = calls.find((c) => c.element === tag)!;
    expect(tagRun.options.delay).toBe(RETURN_MS); // once it has landed
  });

  it("back to the other player's hand: it turns face down on the way, becoming their new card back", () => {
    const view = render(draw(start.battlefield));
    const from = slotOf(view.container, theirs.id).style.transform;
    calls.length = 0;
    view.rerender(
      draw(without(theirs.id), {
        opponentHand: backs(4),
        returns: new Map([
          [theirs.id, { zone: "hand", side: "opponent", where: null, hidden: true }],
        ]),
      }),
    );
    const ghost = view.container.querySelector(`[data-ghost-of="${theirs.id}"]`)!;
    expect(ghost.getAttribute("data-return")).toBe("hand");
    expect(ghost.getAttribute("data-fate")).toBeNull(); // not defeated, not exiled
    expect(ghost.querySelector(".bf-return-back")).toBeNull(); // its new back takes over
    const out = calls.find((c) => c.element === ghost)!;
    const back = slotOf(view.container, `hidden-hand:${theirs.seat}:3`);
    const into = calls.filter((c) => c.element === back);
    // Never the old faint glide in from the stack for that back: only this.
    expect(into).toHaveLength(1);
    // The same path from where it was to the new back's place; one fades as the other appears.
    expect(String(out.frames[0]!.transform)).toBe(from);
    expect(String(into[0]!.frames[0]!.transform)).toBe(from);
    expect(String(into[0]!.frames.at(-1)!.transform)).toBe(back.style.transform);
    expect(String(out.frames.at(-1)!.transform)).toBe(back.style.transform);
    expect(out.frames.at(-1)!.opacity).toBe(0);
    expect(into[0]!.frames[0]!.opacity).toBe(0);
    expect(into[0]!.frames.at(-1)!.opacity).toBe(1);
    expect(into[0]!.options.duration).toBe(RETURN_MS);
    expect(tags(view.container)).toEqual(["Back to Bob's hand"]);
  });

  it("on top of a library: face down on the way, sinking into the pile, the tag beside it", () => {
    const view = render(draw(start.battlefield));
    calls.length = 0;
    view.rerender(
      draw(without(theirs.id), {
        returns: new Map([
          [theirs.id, { zone: "library", side: "opponent", where: "top", hidden: true }],
        ]),
      }),
    );
    const ghost = view.container.querySelector(`[data-ghost-of="${theirs.id}"]`)!;
    expect(ghost.getAttribute("data-return")).toBe("library");
    const run = calls.find((c) => c.element === ghost)!;
    expect(run.options.duration).toBe(RETURN_MS);
    expect(String(run.frames.at(-1)!.transform)).toContain("scale(0.3)");
    expect(run.frames.at(-1)!.opacity).toBe(0);
    const back = ghost.querySelector(".bf-return-back")!;
    const turn = calls.find((c) => c.element === back)!;
    expect(turn.frames[0]!.opacity).toBe(0);
    expect(turn.frames.at(-1)!.opacity).toBe(1);
    expect(tags(view.container)).toEqual(["On top of Bob's library"]);
    expect(view.container.querySelector("[data-riffle]")).toBeNull();
  });

  it("shuffled in: the library riffles, then the tag; several to one place, one tag", () => {
    const other = alone(viewer, [mine.id]);
    const view = render(draw(start.battlefield));
    calls.length = 0;
    view.rerender(
      draw(without(mine.id, other.id), {
        returns: new Map([
          [mine.id, { zone: "library", side: "viewer", where: "shuffled", hidden: true }],
          [other.id, { zone: "library", side: "viewer", where: "shuffled", hidden: true }],
        ]),
      }),
    );
    expect(view.container.querySelectorAll('[data-return="library"]')).toHaveLength(2);
    const riffles = [...view.container.querySelectorAll("[data-riffle]")];
    expect(riffles).toHaveLength(6);
    const delays = riffles.map((r) => calls.find((c) => c.element === r)!.options.delay!);
    expect(delays[0]).toBe(RETURN_MS);
    expect(delays[5]! - delays[0]!).toBe(250);
    // Unseen until each starts: not held at rest on the pile while the card flies.
    for (const r of riffles) {
      expect(calls.find((c) => c.element === r)!.options.fill).toBe("forwards");
      expect((r as HTMLElement).style.opacity).toBe("0");
    }
    expect(tags(view.container)).toEqual(["Shuffled into your library"]);
    const tag = view.container.querySelector("[data-return-tag]")!;
    expect(calls.find((c) => c.element === tag)!.options.delay).toBe(RETURN_MS + 700 + 250);
  });

  it("out of a pile: each card going back leaves as its own ghost from the pile", () => {
    // Two identical creatures, one pile (spec 0003); both go to the bottom.
    const plain: BoardCard = {
      ...theirs,
      id: "card:9399",
      name: "Grizzly Bears",
      attacking: false,
      blocking: false,
      tapped: false,
      faceDown: false,
      known: true,
      attachedTo: null,
    };
    const twin: BoardCard = { ...plain, id: "card:9400" };
    const third: BoardCard = { ...plain, id: "card:9401" };
    const piled = [...start.battlefield, plain, twin, third];
    const pile = layout({ ...start, battlefield: piled }, size).slots.find((s) =>
      s.ids.includes(twin.id),
    )!;
    expect(pile.ids.length).toBeGreaterThan(2); // really a pile
    const members = pile.ids.filter((id) => id !== pile.ids[0]);
    const view = render(draw(piled));
    calls.length = 0;
    view.rerender(
      draw(
        piled.filter((c) => !members.includes(c.id)),
        {
          returns: new Map(
            members.map((id) => [
              id,
              { zone: "library", side: "opponent", where: "bottom", hidden: true },
            ]),
          ),
        },
      ),
    );
    for (const id of members) {
      const ghost = view.container.querySelector(`[data-ghost-of="${id}"]`)!;
      expect(ghost, `no ghost for ${id}`).toBeTruthy();
      expect(ghost.getAttribute("data-return")).toBe("library");
    }
    expect(tags(view.container)).toEqual(["On the bottom of Bob's library"]);
  });

  it("the bottom of a library, and a spell sent back from the stack (no spark, no graveyard)", () => {
    const spell: StackView = {
      id: "stack:12",
      name: "Grizzly Bears",
      kind: "spell",
      source: null,
      card: "card:9300",
      seat: theirs.seat,
      targets: [{ object: mine.id }],
    };
    const view = render(draw(start.battlefield, { stack: [spell] }));
    calls.length = 0;
    view.rerender(
      draw(start.battlefield, {
        returns: new Map([
          ["card:9300", { zone: "library", side: "opponent", where: "bottom", hidden: true }],
        ]),
      }),
    );
    const ghost = view.container.querySelector('[data-ghost-of="stack:12"]')!;
    expect(ghost.getAttribute("data-return")).toBe("library");
    expect(ghost.querySelector(".bf-return-back")).toBeTruthy();
    expect(view.container.querySelector(".bf-spark")).toBeNull();
    const run = calls.find((c) => c.element === ghost)!;
    expect(run.options.delay).toBe(0); // it did not resolve: no glow first
    expect(run.options.duration).toBe(RETURN_MS);
    expect(tags(view.container)).toEqual(["On the bottom of Bob's library"]);
  });

  it("the tag's words, for both seats", () => {
    const r = (zone: "hand" | "library", side: "viewer" | "opponent", where: Return["where"]) =>
      returnTag({ zone, side, where, hidden: true }, "Bob");
    expect(r("hand", "viewer", null)).toBe("Back to your hand");
    expect(r("hand", "opponent", null)).toBe("Back to Bob's hand");
    expect(r("library", "opponent", "top")).toBe("On top of Bob's library");
    expect(r("library", "viewer", "top")).toBe("On top of your library");
    expect(r("library", "opponent", "bottom")).toBe("On the bottom of Bob's library");
    expect(r("library", "opponent", "shuffled")).toBe("Shuffled into Bob's library");
    expect(r("library", "viewer", null)).toBe("Into your library");
  });

  it("with reduced motion asked for: no lift, no tag, no riffle", () => {
    still = true;
    const view = render(draw(start.battlefield));
    view.rerender(
      draw(without(theirs.id), {
        returns: new Map([
          [theirs.id, { zone: "library", side: "opponent", where: "shuffled", hidden: true }],
        ]),
      }),
    );
    expect(calls).toHaveLength(0);
    expect(
      view.container.querySelector("[data-return-tag], [data-riffle], [data-ghost-of]"),
    ).toBeNull();
  });
});
