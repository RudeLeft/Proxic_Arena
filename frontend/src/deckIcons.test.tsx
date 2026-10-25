// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeckIconPicker } from "./DeckIconPicker";
import { ICON_SHEETS, iconOf, iconWords, suggestedIcon } from "./deckIcons";

/** Spec 0012 — deck icons. */

describe("the suggestion from a deck's colours (F-0012-B)", () => {
  it("one colour", () => {
    expect(["W", "U", "B", "R", "G"].map(suggestedIcon)).toEqual([
      "sun",
      "water",
      "skull",
      "fire",
      "tree",
    ]);
  });

  it("each of the ten pairs", () => {
    const pairs: Record<string, string> = {
      WU: "wings-and-shield",
      UB: "eye",
      BR: "demon",
      RG: "vine-axe",
      WG: "antlers",
      WB: "scales",
      UR: "storm",
      BG: "mushroom-skull",
      WR: "sun-sword",
      UG: "leaf-wave",
    };
    for (const [colors, icon] of Object.entries(pairs)) expect(suggestedIcon(colors)).toBe(icon);
  });

  it("three or more, colourless, and not yet known", () => {
    expect(suggestedIcon("WUB")).toBe("five-gems");
    expect(suggestedIcon("WUBRG")).toBe("five-gems");
    expect(suggestedIcon("")).toBe("diamond");
    expect(suggestedIcon(null)).toBe("diamond");
  });

  it("every icon the suggestion can name is in a sheet", () => {
    const all = new Set(ICON_SHEETS.flatMap((s) => s.icons));
    for (const colors of [
      "W",
      "U",
      "B",
      "R",
      "G",
      "WU",
      "UB",
      "BR",
      "RG",
      "WG",
      "WB",
      "UR",
      "BG",
      "WR",
      "UG",
      "WUB",
      "",
    ]) {
      expect(all.has(suggestedIcon(colors))).toBe(true);
    }
  });
});

describe("a deck's icon", () => {
  it("is its owner's choice, else the suggestion", () => {
    expect(iconOf({ icon: "goblin", colors: "R" })).toBe("goblin");
    expect(iconOf({ icon: null, colors: "R" })).toBe("fire");
    // A name the app does not ship falls back rather than showing nothing.
    expect(iconOf({ icon: "no-such-icon", colors: "R" })).toBe("fire");
  });

  it("ten sheets of ten, 100 different icons, every one shipped", () => {
    expect(ICON_SHEETS).toHaveLength(10);
    const all = ICON_SHEETS.flatMap((s) => s.icons);
    expect(new Set(all).size).toBe(100);
    for (const name of all) expect(iconOf({ icon: name, colors: null })).toBe(name);
  });

  it("has words for a screen reader", () => {
    expect(iconWords("storm-orb")).toBe("Storm orb");
  });
});

describe("DeckIconPicker", () => {
  it("opens on the sheet of the current icon, marks the suggestion, and uses the pick", () => {
    const onUse = vi.fn();
    render(
      <DeckIconPicker
        title="Choose an icon"
        current="fire"
        suggested="fire"
        busy={false}
        problem={null}
        onUse={onUse}
        onCancel={() => {}}
        cancelLabel="Later"
      />,
    );
    expect(screen.getByRole("tab", { name: "Colours" }).getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Fire (suggested)" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Families" }));
    fireEvent.click(screen.getByRole("button", { name: "Goblin" }));
    expect(screen.getByRole("button", { name: "Goblin" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use this icon" }));
    expect(onUse).toHaveBeenCalledWith("goblin");
    expect(screen.getByRole("button", { name: "Later" })).toBeTruthy();
  });
});
