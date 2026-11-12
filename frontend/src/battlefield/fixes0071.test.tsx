// @vitest-environment jsdom

// Spec 0071 -- a report sits above your hand, not on it (F-0071-A); a card
// you saw in the other player's hand slides fully into view when pointed at
// (F-0071-B); a card picked in a window that picks several one at a time
// (Escape, Delve, a search's "up to two") stays there, dimmed, with its
// corner sign, and a click takes it back (F-0071-C); the other player's page
// shows none of it (F-0071-D). The real game screen, its socket replaced:
// the test hands it the server's messages itself. The worker side is
// CostPicksTest and scripts/check-pay-picks.py (escape, delve).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { REPORT_HAND_GAP } from "./RevealTray";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as unknown[][],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (...args: unknown[]) => socket.answers.push(args),
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

const size = { width: 1920, height: 1080 };
let reduced = false;
let animations: { element: Element; frames: Keyframe[] }[] = [];
beforeEach(() => {
  reduced = false;
  animations = [];
  socket.answers = [];
  size.width = 1920;
  size.height = 1080;
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.animate = function (this: Element, frames: Keyframe[]) {
    animations.push({ element: this, frames });
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      playState: "running",
    } as unknown as Animation;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
  document.body.innerHTML = "";
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => size.width,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => size.height,
});

const match: MatchView = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

const card = (id: number, name: string, seat = 1, extra: Record<string, unknown> = {}) => ({
  id: `card:${id}`,
  seat,
  name,
  kind: "creature",
  types: "Creature — Bear",
  known: true,
  power: 2,
  toughness: 2,
  ...extra,
});
const HAND = [card(1, "Grizzly Bears"), card(2, "Grizzly Bears"), card(3, "Grizzly Bears")];
const GRAVE = [60, 61, 62, 63, 64, 65].map((id) =>
  card(id, id % 2 ? "Island" : "Forest", 1, { kind: "land", types: "Basic Land" }),
);

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(over: Record<string, unknown>, seat = 1) {
  revision += 1;
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 1,
      seat,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 50, graveyardCount: 6 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: [],
      hand: HAND,
      graveyard: GRAVE,
      exile: [],
      stack: [],
      ...over,
    },
  });
}
const DURESS = {
  key: "r-1",
  title: "Alice looked at your hand:",
  by: 1,
  source: "Duress",
  said: "Alice looked at your hand and chose nothing.",
  cards: HAND,
};

let asked = 0;
/** A window pick: [left] still offered, [picked] so far, signed [tone]. */
function askWindow(left: string[], picked: string[], tone = "exile", extra = {}) {
  asked += 1;
  send({
    type: "DECISION_REQUEST",
    decisionId: asked,
    actedForSeat: 1,
    stateVersion: revision,
    kind: "chooseEntitiesForEffect",
    mandatory: false,
    options: left.map((id) => ({ actionId: id, label: "Island", objectId: id })),
    prompt: `Exile 5 other cards from your graveyard (up to ${5 - picked.length} more, or pass)`,
    picking: {
      word: tone === "exile" ? "EXILE" : "TO HAND",
      tone,
      picked: picked.map((id) => ({ objectId: id, actionId: `unpick:${id}`, label: "Forest" })),
    },
    ...extra,
  });
}

const slotOf = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!.parentElement!;
/** The y of a slot's translate3d. */
const yOf = (el: HTMLElement) => {
  const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform);
  return m ? Number(m[2]) : NaN;
};

function open(me = "u-1") {
  return render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
}

describe("a report sits above your resting hand (F-0071-A)", () => {
  for (const [w, h] of [
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    it(`at ${w}x${h}: its bottom edge is above the hand's top`, () => {
      size.width = w;
      size.height = h;
      const c = open();
      board({ reveal: DURESS });
      const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
      expect(tray).not.toBeNull();
      expect(tray.className).not.toContain("gs-reveal-top");
      const bottom = parseFloat(tray.style.bottom);
      // The highest resting hand card (the middle of the fan).
      const handTop = Math.min(...HAND.map((x) => yOf(slotOf(c, x.id))));
      expect(Number.isFinite(handTop)).toBe(true);
      // The board's own size changed with the window (TEST-007).
      expect(handTop).toBeGreaterThan(h * 0.85);
      expect(h - bottom).toBeLessThanOrEqual(handTop - REPORT_HAND_GAP + 0.5);
      expect(h - bottom).toBeGreaterThan(handTop - REPORT_HAND_GAP - 8);
    });
  }

  it("while a question's window holds the bottom it waits at the top", () => {
    const c = open();
    board({ reveal: DURESS });
    askWindow(["card:61", "card:62"], []);
    const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(tray.className).toContain("gs-reveal-top");
    // The top's own place, not the hand's: no bottom set over it.
    expect(tray.style.bottom).toBe("");
  });
});

describe("a card you saw in their hand slides into view when pointed at (F-0071-B)", () => {
  const theirs = card(50, "Lightning Bolt", 2, {
    kind: "instant",
    types: "Instant",
    owner: 2,
    seen: true,
  });
  it("whole card in view while pointed at, back after; the eye stays with it", () => {
    const c = open();
    board({ otherHands: [theirs] });
    const slot = slotOf(c, "card:50");
    const rest = slot.style.transform;
    expect(yOf(slot)).toBeLessThan(0); // its top is off the screen
    fireEvent.pointerEnter(slot.querySelector("button")!);
    expect(yOf(slot)).toBe(0);
    expect(slot.style.transform).toContain("rotate(0deg)");
    expect(slot.querySelector("button")!.dataset["zoomed"]).toBe("true");
    expect(slot.querySelector('[data-sign="seen"]')).not.toBeNull();
    fireEvent.pointerLeave(slot.querySelector("button")!);
    expect(slot.style.transform).toBe(rest);
  });

  it("their hidden cards do not move", () => {
    const c = open();
    board({ otherHands: [theirs] });
    const backs = [
      ...c.querySelectorAll<HTMLElement>('button[data-zone="opponent:hand"][data-face="down"]'),
    ];
    expect(backs.length).toBeGreaterThan(0);
    for (const back of backs) {
      const before = back.parentElement!.style.transform;
      fireEvent.pointerEnter(back);
      expect(back.parentElement!.style.transform).toBe(before);
      expect(back.dataset["zoomed"]).toBeUndefined();
    }
  });

  it("Reduce motion: it appears in place, nothing slides", () => {
    reduced = true;
    const c = open();
    board({ otherHands: [theirs] });
    const slot = slotOf(c, "card:50");
    animations = [];
    fireEvent.pointerEnter(slot.querySelector("button")!);
    expect(yOf(slot)).toBe(0);
    expect(animations.filter((a) => a.element === slot)).toHaveLength(0);
    // The slots' glide is a CSS transition, off under reduced motion.
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "battlefield.css"), "utf-8");
    const still = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
    expect(still).toMatch(/\.bf-slot\s*\{\s*transition: none;/);
  });
});

describe("picks stay in the window, signed, and can be taken back (F-0071-C)", () => {
  const tile = (c: ParentNode, id: string) =>
    c.querySelector<HTMLElement>(`.gs-win-tile[data-tile-of="${id}"]`);

  it("Escape: the picked card stays, dimmed, with the exile star, where it was", () => {
    const c = open();
    board({});
    askWindow(["card:60", "card:61", "card:62", "card:63", "card:64", "card:65"], []);
    expect(c.querySelectorAll(".gs-win-tile-picked")).toHaveLength(0);
    askWindow(["card:61", "card:62", "card:63", "card:64", "card:65"], ["card:60"]);
    const picked = c.querySelector<HTMLElement>(".gs-win-tile-picked")!;
    expect(picked).not.toBeNull();
    expect(picked.dataset["tileOf"]).toBe("card:60");
    expect(picked.dataset["picked"]).toBe("exile");
    expect(picked.querySelector<HTMLElement>(".bf-pay-sign")!.dataset["sign"]).toBe("exile");
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.getAttribute("aria-label")).toContain("click again to take it back");
    // No word on it: the sign says it.
    expect(picked.textContent).not.toMatch(/EXILE/);
    // Where it was: first, before the cards still offered.
    const order = [...c.querySelectorAll<HTMLElement>(".gs-win-tile")].map(
      (t) => t.dataset["tileOf"],
    );
    expect(order[0]).toBe("card:60");
    expect(c.querySelectorAll(".gs-win-tile")).toHaveLength(6);
  });

  it("a second click takes it back; the game offers it again and the count follows", () => {
    const c = open();
    board({});
    askWindow(["card:60", "card:63", "card:64", "card:65"], ["card:61", "card:62"]);
    expect(c.querySelectorAll(".gs-win-tile-picked")).toHaveLength(2);
    expect(c.textContent).toContain("up to 3 more");
    fireEvent.click(tile(c, "card:61")!);
    expect(socket.answers.at(-1)).toEqual([asked, "unpick:card:61"]);
    askWindow(["card:60", "card:61", "card:63", "card:64", "card:65"], ["card:62"]);
    expect(c.querySelectorAll(".gs-win-tile-picked")).toHaveLength(1);
    expect(c.textContent).toContain("up to 4 more");
    // Offered again: a click picks it.
    const again = [...c.querySelectorAll<HTMLElement>(".gs-win-tile:not(.gs-win-tile-picked)")];
    expect(again).toHaveLength(5);
    fireEvent.click(again[1]!);
    expect(socket.answers.at(-1)).toEqual([asked, "card:61"]);
  });

  it("a search's tray (a hidden zone): picks stay too, with their sign, and Done", () => {
    const c = open();
    const lib = [70, 71, 72].map((id) =>
      card(id, "Forest", 1, { kind: "land", types: "Basic Land — Forest" }),
    );
    board({});
    askWindow(["card:71", "card:72"], ["card:70"], "hand", {
      looking: lib,
      arrange: { zone: "library" },
    });
    const picked = c.querySelector<HTMLElement>(".gs-win-tile-picked")!;
    expect(picked.dataset["tileOf"]).toBe("card:70");
    expect(picked.querySelector<HTMLElement>(".bf-pay-sign")!.dataset["sign"]).toBe("hand");
    expect(picked.textContent).toContain("Forest");
    expect(c.querySelectorAll(".gs-win-tile")).toHaveLength(3);
    expect([...c.querySelectorAll("button")].some((b) => b.textContent === "Done")).toBe(true);
    fireEvent.click(picked);
    expect(socket.answers.at(-1)).toEqual([asked, "unpick:card:70"]);
  });

  it("a window without picks is as it was: only the cards offered", () => {
    const c = open();
    board({});
    asked += 1;
    send({
      type: "DECISION_REQUEST",
      decisionId: asked,
      actedForSeat: 1,
      stateVersion: revision,
      kind: "chooseEntitiesForEffect",
      options: ["card:61", "card:62"].map((id) => ({
        actionId: id,
        label: "Island",
        objectId: id,
      })),
      prompt: "Choose",
    });
    expect(c.querySelectorAll(".gs-win-tile")).toHaveLength(2);
    expect(c.querySelectorAll(".gs-win-tile-picked, .bf-pay-sign")).toHaveLength(0);
  });
});

describe("the other player sees nothing of the picking (F-0071-D)", () => {
  it("Bob's page while Alice picks: no window, no sign, her graveyard as it is", () => {
    const c = open("u-2");
    board({ hand: [], graveyard: GRAVE.map((g) => ({ ...g })) }, 2);
    expect(c.querySelectorAll(".gs-win-tile-picked, .bf-pay-sign, [data-picked]")).toHaveLength(0);
  });
});
