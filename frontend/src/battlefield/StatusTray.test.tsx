// @vitest-environment jsdom

// Spec 0038 — each player's status tray (F-0038-A).

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../match";
import { StatusTray } from "./GameScreen";

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
    expect(mana.map((m) => m.querySelector("img")!.getAttribute("alt"))).toEqual(["U", "R"]);
    expect(mana[1]!.querySelector("img")!.getAttribute("src")).toMatch(/sym_R/);
  });

  it("counters plain, markers gold, the command zone purple and listed on a click", () => {
    const tray = (over: Partial<Player>) =>
      render(<StatusTray player={player(over)} side="opponent" />).container;
    const counted = tray({ counters: [{ name: "POISON", count: 3 }], designations: ["Monarch"] });
    expect(counted.querySelector(".gs-chip:not(.gs-chip-marker)")!.textContent).toBe("3 poison");
    expect(counted.querySelector(".gs-chip-marker")!.textContent).toBe("Monarch");
    const tempted = tray({ ringTempted: 2 });
    expect(tempted.querySelector(".gs-chip-marker")!.textContent).toBe("Ring ×2");
    const zoned = tray({ command: ["Chandra emblem", "The Ring"] });
    const zone = zoned.querySelector<HTMLButtonElement>(".gs-chip-zone")!;
    expect(zone.textContent).toBe("2 in command zone");
    fireEvent.click(zone);
    const list = zoned.querySelector(".gs-status-list")!;
    expect(list.textContent).toContain("Chandra emblem");
    expect(list.textContent).toContain("The Ring");
    // Read aloud in the plates' old words, whatever fits on screen.
    const all = tray({
      counters: [{ name: "POISON", count: 3 }],
      designations: ["Monarch"],
      ringTempted: 2,
      command: ["Chandra emblem", "The Ring"],
    });
    expect(all.querySelector(".pa-visually-hidden")!.textContent).toBe(
      "RudeLeft: 3 poison  · monarch. command zone: Chandra emblem, The Ring · the Ring has tempted 2×",
    );
  });

  it("capitalises a marker Forge names in lower case", () => {
    const c = render(
      <StatusTray player={player({ designations: ["monarch"] })} side="opponent" />,
    ).container;
    expect(c.querySelector(".gs-chip-marker")!.textContent).toBe("Monarch");
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

  it("puts what does not fit behind +N, which lists everything", () => {
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
    const shown = c.querySelectorAll(".gs-mana, .gs-chip:not(.gs-chip-more)").length;
    expect(more.textContent).toBe(`+${6 - shown}`);
    fireEvent.click(more);
    expect(c.querySelectorAll(".gs-status-list li")).toHaveLength(6);
  });
});
