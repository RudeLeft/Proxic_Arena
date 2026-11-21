// @vitest-environment jsdom

// Spec 0112 -- Barter in Blood: the waiting line says what is being chosen
// and that you choose next; your window opens with what the first player
// sacrificed. The real game screen, its socket replaced, handed the frames
// the worker sent each seat in Lab games (check-sacrifice.py barter and
// barter-none-first, cut into fixes0112.round.json), the questions shaped as
// the server sends them (no authorisedSeat, no nextSeats):
//
//   barter      Alice (seat 1, the active player) casts Barter in Blood with
//               two Walking Corpses; Bob has two Grizzly Bears. Alice picks
//               card:60 then card:55 (questions 115, 116); Bob is asked
//               (117, 118) with `earlier` naming her two.
//   noneFirst   Alice has no creature: only Bob is asked (120, 121), and his
//               questions carry no `earlier`.
//
// F-0112-D: the waiting line from a real board and the server's `doing`;
// the sacrifice window with `earlier` shows the medallion, "WHO · CARD", the
// sentence and the pictures above the question, and the board still answers
// it (a real click on Bob's creature); without `earlier`, the window as today.

import { act, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answered: [] as (string | null)[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_id: number, actionId: string | null) => socket.answered.push(actionId),
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
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixes0112.round.json"), "utf8"),
) as { barter: Game; noneFirst: Game };
const snap = (frames: Rec[], rev: number) =>
  frames.find(
    (f) => f["type"] === "MATCH_SNAPSHOT" && (f["state"] as Rec)["stateRevision"] === rev,
  )!;
const question = (frames: Rec[], id: number) =>
  frames.find((f) => f["type"] === "DECISION_REQUEST" && f["decisionId"] === id)!;

// Alice's two Walking Corpses, in the order she picked them; Bob's Grizzly Bears.
const ALICE_PICKS = ["card:60", "card:55"];
const BOB_BEARS = ["card:75", "card:63"];
// The server's words (AskingWords), a no-break space before the dot.
const NEXT = "Choosing what to sacrifice\u00a0· you choose next";

beforeEach(() => {
  socket.answered = [];
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
  Element.prototype.animate = function () {
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
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 947,
});

const match = {
  matchId: "m-112",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

/** A frame arrives, and its moments play out. */
function frame(f: Rec) {
  act(() => socket.onState!((previous) => reduceMatch(previous, f)));
  act(() => void vi.advanceTimersByTime(4000));
}
const open = (me: string) =>
  render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
const waiting = (c: ParentNode) => ({
  word: c.querySelector(".gs-waiting .gs-waiting-name")?.textContent ?? null,
  sub: c.querySelector(".gs-waiting .gs-waiting-sub")?.textContent ?? null,
});
const sacrificeWindow = (c: ParentNode) =>
  c.querySelector<HTMLElement>('.gs-win[data-kind="choosePermanentsToSacrifice"]');

describe("F-0112-D · the waiting line, from a real board and the server's word", () => {
  it("Bob waiting while Alice chooses: what she is choosing, and that he is next", () => {
    const B = ROUND.barter.seat2;
    const c = open("u-2");
    frame(snap(B, 139));
    frame({ type: "MATCH_ASKING", seat: 1, doing: NEXT });
    expect(waiting(c)).toEqual({ word: "Alice’s move", sub: NEXT });
    // The plain words for a reader who is not next (Alice's line while Bob chooses).
    frame({ type: "MATCH_ASKING", seat: 1, doing: "Choosing what to sacrifice" });
    expect(waiting(c)).toEqual({ word: "Alice’s move", sub: "Choosing what to sacrifice" });
    // The catch-all word keeps its "for their {card}" (Barter in Blood is on top).
    frame({ type: "MATCH_ASKING", seat: 1, doing: "Choosing" });
    expect(waiting(c).sub).toBe("Making a choice for their Barter in Blood");
  });
});

describe("F-0112-D · Bob's window opens with what Alice sacrificed", () => {
  it("medallion, WHO · CARD, the sentence and both pictures, above his question; the board answers it", () => {
    const B = ROUND.barter.seat2;
    const c = open("u-2");
    frame(snap(B, 141));
    frame(question(B, 117));
    const win = sacrificeWindow(c)!;
    expect(win).not.toBeNull();
    const earlier = win.querySelector<HTMLElement>(".gs-earlier")!;
    expect(earlier).not.toBeNull();
    // The first line: before the question's own heading.
    const head = win.querySelector(".gs-win-head")!;
    expect(earlier.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(earlier.querySelector(".gs-reveal-face")).not.toBeNull();
    expect(earlier.querySelector(".gs-reveal-by")!.textContent).toBe("Alice · Barter in Blood");
    expect(earlier.querySelector(".gs-earlier-said")!.textContent).toBe(
      "Alice sacrificed Walking Corpse and Walking Corpse.",
    );
    const pics = [...earlier.querySelectorAll<HTMLElement>(".gs-earlier-card")];
    expect(pics.map((p) => p.dataset.earlierId)).toEqual(ALICE_PICKS);
    // Each picture is the board's own card (in Alice's graveyard on Bob's board).
    expect(pics.every((p) => p.querySelector(".gs-win-bigcard"))).toBe(true);
    // The question as today: its heading, and the table is the answer.
    expect(win.querySelector(".gs-question-title")!.textContent).toBe("Sacrifice");
    const choosable = [
      ...c.querySelectorAll<HTMLElement>('.bf-cards button.bf-card[data-choosable="true"]'),
    ].map((b) => b.dataset.objectId);
    // Only Bob's own creatures (his two Bears are one pile: its top one is lit).
    expect(choosable.length).toBeGreaterThan(0);
    expect(choosable.every((id) => BOB_BEARS.includes(id!))).toBe(true);
    // A real click on one of Bob's own creatures answers it.
    act(
      () =>
        void fireEvent.click(
          c.querySelector<HTMLElement>(
            `.bf-cards button.bf-card[data-object-id="${choosable[0]}"]`,
          )!,
        ),
    );
    expect(socket.answered).toEqual([choosable[0]]);
  });

  it("his second pick keeps the line", () => {
    const B = ROUND.barter.seat2;
    const c = open("u-2");
    frame(snap(B, 142));
    frame(question(B, 118));
    expect(sacrificeWindow(c)!.querySelector(".gs-earlier-said")!.textContent).toBe(
      "Alice sacrificed Walking Corpse and Walking Corpse.",
    );
  });

  it("Alice, asked first, has no first line", () => {
    const A = ROUND.barter.seat1;
    const c = open("u-1");
    frame(snap(A, 139));
    frame(question(A, 115));
    const win = sacrificeWindow(c)!;
    expect(win).not.toBeNull();
    expect(win.querySelector(".gs-earlier")).toBeNull();
  });

  it("Alice had no creature: Bob's window as today, no first line", () => {
    const B = ROUND.noneFirst.seat2;
    const c = open("u-2");
    frame(snap(B, 142));
    frame(question(B, 120));
    const win = sacrificeWindow(c)!;
    expect(win).not.toBeNull();
    expect(win.querySelector(".gs-earlier")).toBeNull();
    expect(win.querySelector(".gs-question-title")!.textContent).toBe("Sacrifice");
  });
});
