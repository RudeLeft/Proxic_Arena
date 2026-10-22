// @vitest-environment jsdom

// Mana costs as symbols (owner 2026-10-21).

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaCost, costChange, manaSymbols, manaValue, withSymbols } from "./ManaCost";

describe("mana costs", () => {
  it("reads Forge's notation into the symbols' names", () => {
    expect(manaSymbols("{1}{R}")).toEqual(["1", "R"]);
    expect(manaSymbols("{X}{W}{W}")).toEqual(["X", "W", "W"]);
    expect(manaSymbols("{W/U}{2/G}{R/P}{C}")).toEqual(["WU", "2G", "RP", "C"]);
    expect(manaSymbols(null)).toEqual([]);
  });

  it("counts mana value as the rules do: X nothing, {2/W} two", () => {
    expect(manaValue("{1}{R}")).toBe(2);
    expect(manaValue("{X}{R}")).toBe(1);
    expect(manaValue("{2/W}{W/U}")).toBe(3);
    expect(manaValue("{10}")).toBe(10);
  });

  it("says whether the cost now is less or more than printed", () => {
    expect(costChange("{R}", "{1}{R}")).toBe("down");
    expect(costChange("{2}{R}", "{1}{R}")).toBe("up");
    expect(costChange("{1}{R}", "{1}{R}")).toBeNull();
    expect(costChange(null, "{1}{R}")).toBeNull();
  });

  it("draws the symbol pictures, and says the cost in words", () => {
    const { container, getByRole } = render(<ManaCost cost="{R}" change="down" />);
    expect(container.querySelectorAll("img.bf-pip")).toHaveLength(1);
    expect(getByRole("img").getAttribute("aria-label")).toBe("Costs {R}, less than printed");
    expect(container.querySelector(".bf-cost-down")).not.toBeNull();
  });
});

describe("card text with costs in it", () => {
  it("draws each cost in the text as symbols and keeps the words", () => {
    const { container } = render(<p>{withSymbols("Spectacle {R}, Kicker {1}{G}")}</p>);
    expect(container.textContent).toContain("Spectacle");
    expect(container.querySelectorAll(".bf-cost")).toHaveLength(2);
    expect(container.querySelectorAll("img.bf-pip")).toHaveLength(3);
  });
});
