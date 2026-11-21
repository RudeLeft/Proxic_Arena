// @vitest-environment jsdom

// Spec 0038 — each player's status tray (F-0038-A).

import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../match";
import { HELD_WORDS, RING_WORDS, StatusTray, shortName } from "./StatusTray";

type Player = Snapshot["players"][number];

function player(over: Partial<Player> = {}): Player {
  return {
    seat: 1,
    name: "RudeLeft",
    life: 20,
    handCount: 7,
    libraryCount: 40,
    graveyardCount: 0,
    counters: [],
    designations: [],
    command: [],
    ringTempted: 0,
    dungeonsCompleted: [],
    manaPool: {},
    ...over,
  };
}

describe("the status tray (spec 0038)", () => {
  it("holds its space but shows nothing when there is nothing", () => {
    const c = render(<StatusTray player={player()} side="viewer" />).container;
    const tray = c.querySelector(".gs-status")!;
    expect(tray.classList.contains("gs-status-on")).toBe(false);
    expect(tray.textContent).toBe("");
  });

  it("shows floating mana as the real symbols with their counts, in WUBRG order", () => {
    // Five Mountains and an Island.
    const c = render(
      <StatusTray player={player({ manaPool: { R: 5, U: 1 } })} side="viewer" />,
    ).container;
    const mana = [...c.querySelectorAll(".gs-mana")];
    expect(mana.map((m) => m.textContent)).toEqual(["1", "5"]);
    expect(mana.map((m) => m.querySelector("img")!.getAttribute("alt"))).toEqual(["blue", "red"]);
    expect(mana[1]!.querySelector("img")!.getAttribute("src")).toMatch(/sym_R/);
  });

  it("counters are picture badges, the Ring's count a badge, other pieces chips, listed on a click", () => {
    const tray = (over: Partial<Player>) =>
      render(<StatusTray player={player(over)} side="opponent" />).container;
    // Spec 0086 (7 B): a round badge with its number, not a word chip.
    const counted = tray({ counters: [{ name: "ENERGY", count: 3 }], designations: ["Monarch"] });
    const energy = counted.querySelector('[data-count-kind="energy"]')!;
    expect(energy.textContent).toBe("3");
    expect(energy.getAttribute("aria-label")).toBe("RudeLeft: three energy");
    expect(counted.querySelector(".gs-chip")).toBeNull();
    // Spec 0077 (F-0077-E): poison is the badge by the life shield, never in the tray.
    const poisoned = tray({ counters: [{ name: "POISON", count: 3 }] });
    expect(poisoned.textContent).not.toMatch(/poison/i);
    expect(poisoned.querySelector(".gs-count")).toBeNull();
    // Spec 0086 (8): the monarch is on the face picture, not in the tray.
    expect(counted.querySelector(".gs-chip-marker, [data-holder]")).toBeNull();
    // Amendment 1: the Ring's count is a badge.
    const tempted = tray({ ringTempted: 2 });
    expect(tempted.querySelector('[data-count-kind="ring"]')!.textContent).toBe("2");
    const zoned = tray({ command: ["Chandra emblem", "The Ring"] });
    const zones = [...zoned.querySelectorAll<HTMLButtonElement>(".gs-chip-zone")];
    expect(zones.map((z) => z.textContent)).toEqual(["Chandra emblem"]);
    fireEvent.click(zones[0]!);
    const list = zoned.querySelector(".gs-status-list")!;
    expect(list.textContent).toContain("Chandra emblem");
    expect(list.textContent).toContain("The Ring");
    fireEvent.click(zones[0]!);
    // Read aloud in the plates' old words, whatever fits on screen.
    const all = tray({
      counters: [{ name: "ENERGY", count: 3 }],
      designations: ["Monarch"],
      ringTempted: 2,
      command: ["Chandra emblem", "The Ring"],
    });
    expect(all.querySelector(".pa-visually-hidden")!.textContent).toBe(
      "RudeLeft: three energy, the monarch. Command zone: Chandra emblem, The Ring; the Ring has tempted them twice",
    );
  });

  it("lists a marker Forge names in lower case with a capital, though the tray shows none", () => {
    const c = render(
      <StatusTray player={player({ designations: ["monarch"] })} side="opponent" />,
    ).container;
    // Spec 0086 (8): the crown is on the face; the tray holds nothing for it.
    expect(c.querySelector(".gs-chip-marker")).toBeNull();
    expect(c.querySelector(".pa-visually-hidden")!.textContent).toContain("monarch");
  });

  it("measures: the owner's screenshot's three chips fit, or the last goes behind +N", () => {
    // 2 energy, 1 poison, monarch: cut off at the tray's edge (2026-10-29).
    const c = render(
      <StatusTray
        player={player({
          counters: [
            { name: "ENERGY", count: 2 },
            { name: "POISON", count: 1 },
          ],
          designations: ["monarch"],
          command: ["Chandra, Torch of Defiance emblem"],
        })}
        side="opponent"
      />,
    ).container;
    expect(c.querySelector(".gs-chip-more")!.textContent).toMatch(/^[+]\d$/);
  });

  it("puts what does not fit behind +N, which lists everything once", () => {
    const c = render(
      <StatusTray
        player={player({
          manaPool: { W: 1, U: 1, B: 1, R: 1 },
          counters: [
            { name: "ENERGY", count: 4 },
            { name: "EXPERIENCE", count: 2 },
          ],
        })}
        side="viewer"
      />,
    ).container;
    const more = c.querySelector<HTMLButtonElement>(".gs-chip-more")!;
    const shown = c.querySelectorAll(".gs-mana, .gs-count, .gs-chip:not(.gs-chip-more)").length;
    expect(more.textContent).toBe(`+${6 - shown}`);
    fireEvent.click(more);
    const list = c.querySelector(".gs-status-list")!;
    // Mana as the real symbols, not letters; counters on one line.
    expect([...list.querySelectorAll(".gs-mana img")].map((i) => i.getAttribute("alt"))).toEqual([
      "white",
      "blue",
      "black",
      "red",
    ]);
    expect(list.textContent).not.toMatch(/\d [WUBR] mana/);
    expect(list.textContent).toContain("four energy · two experience counters");
    fireEvent.click(more);
  });
});

// Phase 9 W-21 (Amendment 18) -- short names, a list that says what things do,
// beside the tray, closed by Esc and a click away, one at a time, and Peek.
describe("the status tray's list (W-21)", () => {
  const LILIANA = "Emblem — Liliana, Defiant Necromancer";
  const busy = (over: Partial<Player> = {}) =>
    player({
      seat: 2,
      name: "Pat",
      manaPool: { U: 1, R: 2 },
      counters: [{ name: "POISON", count: 3 }],
      designations: ["monarch", "initiative"],
      ringTempted: 2,
      command: ["The Ring", "Undercity (room: Secret Entrance)", LILIANA],
      commandWords: [
        { name: "The Ring" },
        {
          name: "Undercity",
          rooms: [
            {
              name: "Secret Entrance",
              says: "Search your library for a basic land card.",
              next: ["Forge", "Lost Well"],
              here: true,
            },
            {
              name: "Forge",
              says: "Put two +1/+1 counters on target creature.",
              next: [],
              here: false,
            },
            { name: "Lost Well", says: "Scry 2.", next: [], here: false },
          ],
        },
        {
          name: LILIANA,
          says: "Whenever a creature dies, return it to the battlefield under your control at the beginning of the next end step.",
        },
      ],
      ...over,
    });

  it("short names in the row, and never a lone +N", () => {
    expect(shortName(LILIANA)).toBe("Liliana emblem");
    expect(shortName("Undercity (room: Lost Well)")).toBe("Undercity · Lost Well");
    expect(shortName("The Ring")).toBe("The Ring");
    // Spec 0086 (8): an emblem is a tile, named in full when pointed at.
    const c = render(
      <StatusTray player={player({ command: [LILIANA] })} side="viewer" />,
    ).container;
    expect(c.querySelector(".gs-emblem")!.getAttribute("aria-label")).toBe(
      "Liliana, Defiant Necromancer's emblem",
    );
    expect(c.querySelector(".gs-chip-more")).toBeNull();
    // Nothing fits beside "+N": the first thing still shows (cut short).
    const many = render(
      <StatusTray
        player={player({
          seat: 3,
          // Too long to fit even alone, and something else after it.
          command: ["A Command Zone Piece With A Very Very Long Name Indeed", "Another Piece"],
        })}
        side="viewer"
      />,
    ).container;
    expect(many.querySelector(".gs-chip-more")).not.toBeNull();
    expect(many.querySelectorAll(".gs-chip:not(.gs-chip-more)").length).toBeGreaterThan(0);
  });

  it("the Ring shows once, as its badge with its count", () => {
    const c = render(
      <StatusTray player={player({ command: ["The Ring"], ringTempted: 2 })} side="viewer" />,
    ).container;
    expect(c.querySelectorAll(".gs-chip")).toHaveLength(0);
    const ring = c.querySelectorAll('[data-count-kind="ring"]');
    expect(ring).toHaveLength(1);
    expect(ring[0]!.textContent).toBe("2");
    expect(ring[0]!.getAttribute("aria-label")).toBe("The Ring has tempted RudeLeft twice");
  });

  it("says names and what they do: held rules, the Ring's four with two lit, the room and where next, the emblem's words", () => {
    const c = render(<StatusTray player={busy()} side="viewer" />).container;
    fireEvent.click(c.querySelector(".gs-map")!);
    const list = c.querySelector(".gs-status-list")!;
    expect(list.getAttribute("aria-label")).toBe("Pat: in play for you");
    expect(list.textContent).toContain(HELD_WORDS["monarch"]);
    expect(list.textContent).toContain(HELD_WORDS["initiative"]);
    const ring = [...list.querySelectorAll(".gs-status-ring li")];
    expect(ring).toHaveLength(4);
    expect(ring.map((li) => li.className)).toEqual([
      "gs-status-lit",
      "gs-status-lit",
      "gs-status-off",
      "gs-status-off",
    ]);
    expect(ring[0]!.textContent).toContain(RING_WORDS[0]);
    expect(list.textContent).toContain("Undercity: in Secret Entrance");
    expect(list.textContent).toContain(
      "Next: Forge (Put two +1/+1 counters on target creature) or Lost Well (Scry 2)",
    );
    expect(list.textContent).toContain("Liliana, Defiant Necromancer's emblem");
    expect(list.textContent).toContain("Whenever a creature dies");
    // Each thing once: the command zone is not said twice.
    expect(list.textContent!.split("Liliana, Defiant Necromancer").length - 1).toBe(1);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
  });

  it("Esc, a click away and the chip again close it; opening one player's closes the other's", () => {
    const c = render(
      <div>
        <StatusTray player={busy()} side="viewer" />
        <StatusTray player={busy({ seat: 1, name: "RudeLeft" })} side="opponent" />
        <p className="elsewhere">the table</p>
      </div>,
    ).container;
    const mine = c.querySelector<HTMLButtonElement>(".gs-status-viewer .gs-map")!;
    const theirs = c.querySelector<HTMLButtonElement>(".gs-status-opponent .gs-map")!;
    const lists = () =>
      [...c.querySelectorAll(".gs-status-list")].map((l) => l.getAttribute("aria-label"));

    fireEvent.click(mine);
    expect(lists()).toEqual(["Pat: in play for you"]);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(lists()).toEqual([]);

    fireEvent.click(mine);
    act(() => {
      fireEvent.pointerDown(c.querySelector(".elsewhere")!);
    });
    expect(lists()).toEqual([]);

    fireEvent.click(mine);
    act(() => {
      fireEvent.pointerDown(theirs);
    });
    fireEvent.click(theirs);
    expect(lists()).toEqual(["RudeLeft: in play for them"]);
    fireEvent.click(theirs);
    expect(lists()).toEqual([]);
  });

  it("fades while Space or Peek is held, and comes back", () => {
    const c = render(<StatusTray player={busy()} side="viewer" />).container;
    fireEvent.click(c.querySelector(".gs-map")!);
    const list = () => c.querySelector(".gs-status-list")!;
    expect(list().classList.contains("gs-win-peek")).toBe(false);
    act(() => {
      fireEvent.keyDown(window, { code: "Space", key: " " });
    });
    expect(list().classList.contains("gs-win-peek")).toBe(true);
    act(() => {
      fireEvent.keyUp(window, { code: "Space", key: " " });
    });
    expect(list().classList.contains("gs-win-peek")).toBe(false);
    const peek = list().querySelector<HTMLButtonElement>(".gs-peek-btn")!;
    act(() => {
      fireEvent.pointerDown(peek, { pointerId: 1 });
    });
    expect(list().classList.contains("gs-win-peek")).toBe(true);
    act(() => {
      fireEvent.pointerUp(peek, { pointerId: 1 });
    });
    expect(list().classList.contains("gs-win-peek")).toBe(false);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
  });
});
