// @vitest-environment jsdom

// Spec 0039 — the page's own log, and the report form's plain words.
import { beforeEach, describe, expect, it } from "vitest";
import { browserOf, pageOf } from "./ReportDialog";
import {
  KEEP_MS,
  MAX_LINES,
  clearLog,
  describeTarget,
  logLine,
  recentLines,
  recentLog,
  summarise,
} from "./reportLog";

describe("the page's log", () => {
  beforeEach(() => clearLog());

  it("keeps the last 15 minutes and drops the older lines", () => {
    logLine("click", "old", 1_000);
    logLine("click", "recent", 1_000 + KEEP_MS - 1);
    logLine("click", "now", 1_000 + KEEP_MS + 1);
    expect(recentLines().map((l) => l.text)).toEqual(["recent", "now"]);
  });

  it("keeps at most MAX_LINES lines", () => {
    for (let i = 0; i < MAX_LINES + 50; i++) logLine("frame", `line ${i}`, 5_000);
    expect(recentLines()).toHaveLength(MAX_LINES);
    expect(recentLines()[0]!.text).toBe("line 50");
  });

  it("cuts a long line and sends one JSON object a line", () => {
    logLine("frame", "x".repeat(1000), 7);
    expect(recentLines()[0]!.text.length).toBeLessThanOrEqual(401);
    const sent = recentLog().trim().split("\n");
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toMatchObject({ t: 7, kind: "frame" });
    clearLog();
    expect(recentLog()).toBe("");
  });

  it("names what was clicked by its card, its label or its text", () => {
    const card = document.createElement("div");
    card.setAttribute("data-object-id", "card-12");
    card.setAttribute("aria-label", "Llanowar Elves");
    const art = document.createElement("img");
    card.appendChild(art);
    expect(describeTarget(art)).toBe("card-12 Llanowar Elves");
    const button = document.createElement("button");
    button.textContent = "  Pass   priority ";
    expect(describeTarget(button)).toBe("Pass priority");
    expect(describeTarget(null)).toBeNull();
  });

  it("summarises a game message by its facts, never its whole board", () => {
    const line = summarise("in", {
      type: "DECISION_REQUEST",
      decisionId: "d7",
      kind: "CHOOSE_BLOCKERS",
      options: [1, 2, 3],
      prompt: "Declare blockers",
      state: {
        turn: 4,
        phase: "COMBAT_DECLARE_BLOCKERS",
        activeSeat: 1,
        stack: [{ name: "Shock" }],
      },
      secret: { hand: ["hidden"] },
    });
    expect(line).toBe(
      '← DECISION_REQUEST decisionId=d7 kind=CHOOSE_BLOCKERS 3 options "Declare blockers" ' +
        "turn 4 COMBAT_DECLARE_BLOCKERS active 1 stack: Shock",
    );
    expect(summarise("out", { type: "DECISION_RESPONSE", detail: { a: 1 } })).toBe(
      "→ DECISION_RESPONSE",
    );
  });
});

describe("the report form's plain words", () => {
  it("names the page", () => {
    expect(pageOf("/decks/5", false)).toBe("Deck Depot");
    expect(pageOf("/play", false)).toBe("Lobby and rooms");
    expect(pageOf("/decks", true)).toBe("In a game");
    expect(pageOf("/nowhere", false)).toBe("Somewhere else");
  });

  it("names the browser, Edge before Chrome", () => {
    const edge =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(browserOf(edge)).toBe("Edge 130 on Windows");
    expect(browserOf(chrome)).toBe("Chrome 130 on Windows");
    expect(browserOf(iphone)).toBe("Safari 17 on iOS");
    expect(browserOf("curl/8")).toBe("A browser");
  });
});
