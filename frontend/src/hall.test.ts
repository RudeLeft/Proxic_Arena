// Spec 0018 — the Hall of Champions page's words.

import { describe, expect, it } from "vitest";
import { heldFor, latestText, monthName, timeLeft, winPercent } from "./hall";

const names: Record<string, string> = { p: "Pat", a: "Ash" };
const name = (id: string) => names[id] ?? "A player";

describe("the Hall's words", () => {
  it("names the month, and how long the season has left", () => {
    expect(monthName("2026-11")).toBe("November");
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(timeLeft("2026-12-01T00:00:00Z", now)).toBe("12 days");
    expect(timeLeft("2026-11-19T13:00:00Z", now)).toBe("1 day");
    expect(timeLeft("2026-11-18T17:00:00Z", now)).toBe("5 hours");
    expect(heldFor("2026-11-14T12:00:00Z", now)).toBe("Held 4 days");
    expect(heldFor("2026-11-18T09:00:00Z", now)).toBe("Held since today");
  });

  it("counts draws as games in the win share", () => {
    expect(winPercent({ wins: 3, losses: 1, draws: 1 })).toBe(60);
    expect(winPercent({ wins: 0, losses: 0, draws: 0 })).toBe(0);
  });

  it("says each kind of latest result", () => {
    const base = { at: "", turn: 9, change: 16, beltTaken: false };
    expect(latestText({ ...base, kind: "win", players: ["p", "a"] }, name)).toBe(
      "Pat beat Ash on turn 9 · +16",
    );
    expect(latestText({ ...base, kind: "win", players: ["a", "p"], beltTaken: true }, name)).toBe(
      "Ash beat Pat on turn 9 · +16 and took the Belt",
    );
    expect(latestText({ ...base, kind: "draw", players: ["p", "a"], change: null }, name)).toBe(
      "Pat and Ash drew on turn 9",
    );
    expect(latestText({ ...base, kind: "belt", players: ["a", "p"], turn: null }, name)).toBe(
      "Ash took over the Belt: Pat hadn't played for 14 days",
    );
  });
});
