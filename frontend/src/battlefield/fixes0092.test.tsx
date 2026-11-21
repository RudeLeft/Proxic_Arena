// @vitest-environment jsdom

// Spec 0092 -- no priority dot on the plates (F-0092-A: the real game
// screen from real snapshots, priority passing), and summoning-sick z's
// that never stack (F-0092-C: the real Board, 8 sick creatures with their
// own offsets; in step above ZZ_SYNC_AT; still in a hidden tab; the box
// above the state word). F-0092-B (no window for a mana colour) is the
// worker's (ManaValuesTest), the Lab's (check-card-actions.py) and the
// browser's (match-mana-colours.spec.ts).

import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { Board, type BoardCard } from "./Board";
import { ZZ_GAP_MS, ZZ_LOOP_MS, ZZ_SYNC_AT } from "./breathMotion";
import { STATE_BAND, ZZZ_BAND } from "./CardBadges";

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
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
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
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
    return {
      finished: new Promise(() => {}),
      onfinish: null,
      oncancel: null,
      cancel() {},
      finish() {},
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0 }) },
    };
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 1080,
});

// --- F-0092-A: no dot -------------------------------------------------------------------------

const match: MatchView = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1" },
    { seatNumber: 2, userId: "u-2" },
  ],
  outcome: null,
} as unknown as MatchView;

let rev = 1;
function snapshot(prioritySeat: number, spectator = false) {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "MATCH_SNAPSHOT",
        state: {
          stateRevision: rev++,
          gameEpoch: 1,
          turn: 3,
          phase: "MAIN1",
          activeSeat: 1,
          prioritySeat,
          seat: spectator ? 0 : 1,
          ...(spectator ? { spectator: true, viewFrom: 1 } : {}),
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: 4, libraryCount: 40, graveyardCount: 0 },
            { seat: 2, name: "Bob", life: 20, handCount: 3, libraryCount: 40, graveyardCount: 0 },
          ],
          battlefield: [],
          hand: [],
          graveyard: [],
          exile: [],
          stack: [],
        },
      }),
    ),
  );
}

/** Each plate's head: what sits in the name's column, and the hidden summary. */
function plates() {
  return [...document.querySelectorAll<HTMLElement>(".gs-seat")].map((plate) => ({
    seat: plate.dataset.seat,
    who: plate.querySelector(".gs-seat-who")!.innerHTML,
    summary: plate.querySelector(":scope > .pa-visually-hidden")!.textContent ?? "",
    dot: plate.querySelector(".gs-priority-dot, .gs-seat-marks") !== null,
  }));
}

describe("F-0092-A · no priority dot on either plate", () => {
  for (const spectator of [false, true]) {
    it(`priority passing changes nothing under the name (${spectator ? "watching" : "playing"})`, () => {
      render(
        <GameScreen
          match={match}
          me={spectator ? "u-9" : "u-1"}
          watching={spectator}
          onLeave={() => {}}
        />,
      );
      snapshot(1, spectator);
      const alice = plates();
      expect(alice).toHaveLength(2);
      snapshot(2, spectator);
      const bob = plates();
      for (const plate of [...alice, ...bob]) expect(plate.dot).toBe(false);
      // The name's column is the same markup whoever has priority: nothing
      // appears or goes under the name, so it cannot move.
      expect(bob.map((p) => p.who)).toEqual(alice.map((p) => p.who));
      // A screen reader is told who has it.
      const said = (list: typeof alice, seat: string) => list.find((p) => p.seat === seat)!.summary;
      expect(said(alice, "1")).toContain("can act");
      expect(said(alice, "2")).not.toContain("can act");
      expect(said(bob, "2")).toContain("can act");
      expect(said(bob, "1")).not.toContain("can act");
    });
  }
});

// --- F-0092-C: the z's -----------------------------------------------------------------------

let entered = 0;
function sickOne(id: string, seat: number, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    seat,
    name: `Bear ${id}`,
    kind: "creature",
    types: "Creature — Bear",
    tapped: false,
    attacking: false,
    blocking: false,
    sick: true,
    faceDown: false,
    known: true,
    power: 2,
    toughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}
/** Ids whose own offsets differ (hoverOffset hashes the id). */
const sickOnes = (n: number, from = 200) =>
  Array.from({ length: n }, (_, i) => sickOne(`card:${from + i * 7}`, 1 + (i % 2)));

function drawBoard(battlefield: BoardCard[]) {
  return (
    <Board
      battlefield={battlefield}
      hand={[]}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
    />
  );
}
/** Each sick card's three z delays, in ms (negative: started that long ago). */
function zDelays(root: ParentNode): number[][] {
  return [...root.querySelectorAll(".bf-zz")].map((box) =>
    [...box.querySelectorAll<HTMLElement>("i")].map((z) => parseFloat(z.style.animationDelay)),
  );
}
const phase = (ms: number) => (((-ms % ZZ_LOOP_MS) + ZZ_LOOP_MS) % ZZ_LOOP_MS) / ZZ_LOOP_MS;

/** The z's CSS, read from battlefield.css: box, sizes, path. */
function zCss() {
  const css = readFileSync(join(__dirname, "battlefield.css"), "utf8");
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf("}", at));
  };
  const h = (text: string, prop: string) => {
    const m = new RegExp(`(?:^|\\s)${prop}:\\s*calc\\(var\\(--card-h\\) \\* (-?[\\d.]+)\\)`).exec(
      text,
    );
    expect(m, prop).not.toBeNull();
    return parseFloat(m![1] ?? "NaN");
  };
  const box = rule(".bf-zz");
  const letter = rule(".bf-zz i");
  const keyframes = css.slice(css.indexOf("@keyframes bf-zz"));
  const end =
    /100% \{[^}]*translate: calc\(var\(--card-h\) \* ([\d.]+)\) calc\(var\(--card-h\) \* (-[\d.]+)\)/.exec(
      keyframes,
    );
  expect(end).not.toBeNull();
  return {
    top: h(box, "top"),
    height: h(box, "height"),
    size: h(letter, "font-size"),
    linear: /animation: bf-zz 2\.8s linear infinite/.test(letter),
    dx: parseFloat(end![1] ?? "NaN"),
    dy: parseFloat(end![2] ?? "NaN"),
  };
}

describe("F-0092-C · the z's never meet", () => {
  it("8 sick creatures, each its own point in the loop: its three z's a third of a loop apart", () => {
    const view = render(drawBoard(sickOnes(8)));
    const all = zDelays(view.container);
    expect(all).toHaveLength(8);
    // Each card out of step with the next (their own offsets)...
    expect(new Set(all.map((z) => z[0])).size).toBeGreaterThan(4);
    for (const z of all) {
      expect(z).toHaveLength(3);
      // ...and its own three always a third apart: the gaps between their
      // places on the loop are 1/3, 1/3, 1/3 (so none ever meets another).
      const [p0, p1, p2] = z.map(phase).sort((a, b) => a - b) as [number, number, number];
      const gaps = [p1 - p0, p2 - p1, 1 - p2 + p0];
      for (const gap of gaps) expect(gap).toBeCloseTo(ZZ_GAP_MS / ZZ_LOOP_MS, 2);
    }
    expect(ZZ_GAP_MS * 3).toBeGreaterThanOrEqual(ZZ_LOOP_MS - 1);
  });

  it("a third of the path is wider than the widest z, the path is straight and even, the box clears the state word", () => {
    const z = zCss();
    expect(z.linear).toBe(true);
    // A z is about half its size wide (Barlow Condensed's is 0.42): the one
    // behind always ends before the one ahead begins.
    expect(z.dx / 3).toBeGreaterThan(z.size * 0.5);
    // The letters' rise stays inside the box.
    expect(z.size + -z.dy).toBeLessThanOrEqual(z.height + 1e-9);
    // The box, as heights off the card's bottom, is ZZZ_BAND, and clear of STATE_BAND.
    const low = 1 - (z.top + z.height);
    const high = 1 - z.top;
    expect(low).toBeCloseTo(ZZZ_BAND[0], 3);
    expect(high).toBeCloseTo(ZZZ_BAND[1], 3);
    expect(low >= STATE_BAND[1] || high <= STATE_BAND[0]).toBe(true);
  });

  it(`above ${ZZ_SYNC_AT} sick creatures: in step, each z still a third apart`, () => {
    const view = render(drawBoard(sickOnes(ZZ_SYNC_AT + 2)));
    for (const z of zDelays(view.container)) expect(z).toEqual([-0, -ZZ_GAP_MS, -2 * ZZ_GAP_MS]);
    expect(view.container.querySelector('.bf-zz[data-in-step="true"]')).not.toBeNull();
    view.rerender(drawBoard(sickOnes(4)));
    // Fewer again: still in step (going out of step would jump them).
    for (const z of zDelays(view.container)) expect(z[0]).toBe(-0);
  });

  it("the tab hidden: the z's stop; shown again, they go on (the Board does it)", () => {
    const list = ["bf-zz", "bf-zz", "bf-zz", "gs-breathe-dim"].map((animationName) => {
      const a = {
        animationName,
        startTime: 777 as number | null,
        playState: "running",
        pause() {
          a.playState = "paused";
        },
        play() {
          a.playState = "running";
        },
      };
      return a;
    });
    (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
      this: Element,
    ) {
      return this.classList.contains("bf-board") ? list : [];
    };
    render(drawBoard(sickOnes(ZZ_SYNC_AT + 1)));
    // In step: on the page's clock from its zero.
    expect(list.map((a) => a.startTime)).toEqual([0, 0, 0, 777]);
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(list.map((a) => a.playState)).toEqual(["paused", "paused", "paused", "running"]);
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(list.every((a) => a.playState === "running")).toBe(true);
  });
});
