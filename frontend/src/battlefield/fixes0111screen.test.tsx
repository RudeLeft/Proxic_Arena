// @vitest-environment jsdom

// Spec 0111 -- soulbond pairs: the same gold chain-link square on both cards
// of a pair, pointing at one lights its partner, and the close-up says
// "Paired with Elder Cathar". The real game screen, its socket replaced,
// handed the frames the worker sent each seat in Lab games (check-soulbond.py
// two-pairs, partner-dies and face-down, cut into fixes0111.round.json):
//
//   two-pairs     Tandem Lookout pairs with Elder Cathar (rev 141 -> 142);
//                 later Chapel Geist enters and Wolfir Silverheart pairs
//                 with it (rev 227 -> 228; Chapel Geist is 6/7).
//   partner-dies  Bob's Lightning Bolt kills Elder Cathar (rev 135 -> 136).
//   face-down     Tandem Lookout pairs with Alice's face-down Willbender.
//
// F-0111-C: both cards of a pair show the link mark, with its words; pointing
//   at one lights the other (the related-card light, bf-lifted; nothing
//   dims); two pairs light their own partners only; the close-up line; Bob's
//   page the same for Alice's pairs; a face-down partner is named only as the
//   reader may know it (HID-005).
// F-0111-D: the mark leaves both cards when `pairedWith` goes: it shrinks
//   away (spec 0085's ending mark), the card stays the same card.

import { act, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: () => {},
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      reportsClosed: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

type Rec = Record<string, unknown>;
type Game = { seat1: Rec[]; seat2: Rec[] };
const ROUND = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixes0111.round.json"), "utf8"),
) as { twoPairs: Game; partnerDies: Game; faceDown: Game };
const revOf = (f: Rec) => (f["state"] as Rec)["stateRevision"] as number;
const byRev = (frames: Rec[]) => Object.fromEntries(frames.map((f) => [revOf(f), f]));

// The ids the worker gave (the Lab games).
const LOOKOUT = "card:26";
const CATHAR = "card:56";
const WOLFIR = "card:7";
const GEIST = "card:3";

const size = { width: 1920, height: 947 };
let played: { el: Element; frames: Keyframe[] }[] = [];
beforeEach(() => {
  played = [];
  window.sessionStorage.clear();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("CSSAnimation", class {});
  vi.stubGlobal("CSSTransition", class {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.animate = function (this: Element, frames: Keyframe[]) {
    played.push({ el: this, frames });
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }) },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
  };
  (Element.prototype as { getAnimations?: unknown }).getAnimations = () => [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
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

const match = {
  matchId: "m-111",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

/** A board arrives, and its moments play out (a resolving trigger holds the board a beat). */
function frame(f: Rec) {
  act(() => socket.onState!((previous) => reduceMatch(previous, f)));
  act(() => void vi.advanceTimersByTime(4000));
}
const open = (me = "u-1") =>
  render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
const cardButton = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`button.bf-card[data-object-id="${id}"]`)!;
/** The link mark on a card, not one shrinking away. */
const link = (c: ParentNode, id: string) =>
  cardButton(c, id).querySelector<HTMLElement>('[data-mark="paired"]:not([data-leaving="true"])');
const linkWords = (c: ParentNode, id: string) =>
  cardButton(c, id).querySelector<HTMLElement>(".bf-badges")?.title ?? "";
const lit = (c: ParentNode, id: string) => cardButton(c, id).getAttribute("data-lifted") === "true";
function closeUpOf(c: ParentNode, id: string): string[] {
  act(() => void fireEvent.contextMenu(cardButton(c, id)));
  const facts = document.querySelector(".gs-inspect .gs-inspect-facts");
  const rows = facts
    ? [...facts.querySelectorAll("dt")].map(
        (dt) => `${dt.textContent} ${dt.nextElementSibling?.textContent}`,
      )
    : [];
  act(() => void fireEvent.keyDown(document.querySelector(".gs-inspect")!, { key: "Escape" }));
  return rows;
}

describe("F-0111-C · the link mark on both cards, the partner lit, the close-up line", () => {
  it.each([
    ["Alice", "u-1", "seat1"],
    ["Bob", "u-2", "seat2"],
  ] as const)("%s's page: one pair, then two, each lighting its own partner", (_who, me, seat) => {
    const A = byRev(ROUND.twoPairs[seat]);
    const c = open(me);
    frame(A[141]!);
    // Before the pair: no mark anywhere.
    expect(c.querySelectorAll('[data-mark="paired"]')).toHaveLength(0);
    frame(A[142]!);
    // Both cards of the pair, and only they.
    expect(link(c, LOOKOUT)).not.toBeNull();
    expect(link(c, CATHAR)).not.toBeNull();
    expect(link(c, LOOKOUT)!.classList.contains("bf-mark-pair")).toBe(true);
    expect(c.querySelectorAll('[data-mark="paired"]')).toHaveLength(2);
    // Its words: the mark's tooltip, and the card's own words for a screen reader.
    expect(linkWords(c, LOOKOUT)).toContain("Paired with Elder Cathar");
    expect(linkWords(c, CATHAR)).toContain("Paired with Tandem Lookout");
    expect(cardButton(c, LOOKOUT).getAttribute("aria-label")).toContain("paired with Elder Cathar");

    // Two pairs: Wolfir Silverheart pairs with Chapel Geist (6/7).
    frame(A[227]!);
    expect(link(c, WOLFIR)).toBeNull();
    frame(A[228]!);
    expect(c.querySelectorAll('[data-mark="paired"]')).toHaveLength(4);
    expect(linkWords(c, GEIST)).toContain("Paired with Wolfir Silverheart");

    // Pointing at Tandem Lookout lights Elder Cathar, and nothing else; both marks glow.
    const none = [LOOKOUT, CATHAR, WOLFIR, GEIST].map((id) => lit(c, id));
    expect(none).toEqual([false, false, false, false]);
    act(() => void fireEvent.pointerEnter(cardButton(c, LOOKOUT)));
    expect([LOOKOUT, CATHAR, WOLFIR, GEIST].map((id) => lit(c, id))).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(cardButton(c, LOOKOUT).getAttribute("data-pair-pointed")).toBe("true");
    // Nothing dims.
    expect(c.querySelectorAll(".bf-dim-all, [data-dimmed='true']")).toHaveLength(0);
    act(() => void fireEvent.pointerLeave(cardButton(c, LOOKOUT)));
    expect(lit(c, CATHAR)).toBe(false);
    // Pointing at Chapel Geist lights Wolfir Silverheart only.
    act(() => void fireEvent.pointerEnter(cardButton(c, GEIST)));
    expect([LOOKOUT, CATHAR, WOLFIR, GEIST].map((id) => lit(c, id))).toEqual([
      false,
      false,
      true,
      false,
    ]);
    act(() => void fireEvent.pointerLeave(cardButton(c, GEIST)));
    // Pointing at Elder Cathar lights Tandem Lookout (either card of a pair).
    act(() => void fireEvent.pointerEnter(cardButton(c, CATHAR)));
    expect(lit(c, LOOKOUT)).toBe(true);
    act(() => void fireEvent.pointerLeave(cardButton(c, CATHAR)));

    // The close-up: one line, "Paired with Elder Cathar".
    expect(closeUpOf(c, LOOKOUT)).toContain("Paired with Elder Cathar");
    expect(closeUpOf(c, GEIST)).toContain("Paired with Wolfir Silverheart");
  });

  it("a face-down partner: Bob is told only 'a face-down creature'; Alice, what it is (HID-003, HID-005)", () => {
    const FD = "card:3";
    const LK = "card:19";
    const bob = byRev(ROUND.faceDown.seat2);
    let c = open("u-2");
    frame(bob[141]!);
    frame(bob[142]!);
    expect(link(c, FD)).not.toBeNull();
    expect(link(c, LK)).not.toBeNull();
    expect(linkWords(c, LK)).toContain("Paired with a face-down creature");
    expect(closeUpOf(c, LK)).toContain("Paired with a face-down creature");
    expect(document.body.innerHTML).not.toContain("Willbender");
    act(() => void fireEvent.pointerEnter(cardButton(c, LK)));
    expect(lit(c, FD)).toBe(true);
    document.body.innerHTML = "";

    const alice = byRev(ROUND.faceDown.seat1);
    c = open("u-1");
    frame(alice[141]!);
    frame(alice[142]!);
    expect(linkWords(c, LK)).toContain("Paired with Willbender");
    expect(closeUpOf(c, LK)).toContain("Paired with Willbender");
  });
});

describe("F-0111-D · the pair ends: the mark leaves both cards, shrinking away", () => {
  it.each([
    ["Alice", "u-1", "seat1"],
    ["Bob", "u-2", "seat2"],
  ] as const)(
    "%s's page: Elder Cathar dies; Tandem Lookout's mark shrinks away",
    (_who, me, seat) => {
      const CATHAR_PD = "card:53";
      const P = byRev(ROUND.partnerDies[seat]);
      const c = open(me);
      frame(P[135]!);
      expect(link(c, LOOKOUT)).not.toBeNull();
      expect(link(c, CATHAR_PD)).not.toBeNull();
      const button = cardButton(c, LOOKOUT);
      played = [];
      frame(P[136]!);
      // The same card (never redrawn from nothing), with no live link mark.
      expect(cardButton(c, LOOKOUT)).toBe(button);
      expect(link(c, LOOKOUT)).toBeNull();
      // Its mark shrinks away (spec 0085's ending mark), on its card's clock.
      const leaving = cardButton(c, LOOKOUT).querySelector(
        '[data-mark="paired"][data-leaving="true"]',
      );
      expect(leaving).not.toBeNull();
      expect(played.some((p) => p.el === leaving || p.el.contains(leaving))).toBe(true);
      // Its words and its close-up no longer say it.
      expect(linkWords(c, LOOKOUT)).not.toContain("Paired with");
      expect(cardButton(c, LOOKOUT).getAttribute("aria-label")).not.toContain("paired with");
      expect(closeUpOf(c, LOOKOUT).join(" ")).not.toContain("Paired with");
      // Pointing at it lights nothing.
      act(() => void fireEvent.pointerEnter(cardButton(c, LOOKOUT)));
      expect(c.querySelectorAll('button.bf-card[data-lifted="true"]')).toHaveLength(0);
    },
  );
});
