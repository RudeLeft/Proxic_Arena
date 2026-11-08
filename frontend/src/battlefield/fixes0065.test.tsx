// @vitest-environment jsdom

// Spec 0065 -- no logo on the table or its loading screen; the mana vortex
// loops while waiting and bursts as the table appears, never holding it up
// (F-0065-A, F-0065-B).

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { useSettled } from "../useSettled";
import { BURST_MS, LoadingRing, useVortexHandover } from "./LoadingRing";

// The real game screen, with its socket replaced: the test hands it the
// server's messages itself.
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

let still = false;
beforeEach(() => {
  still = false;
  vi.stubGlobal("matchMedia", () => ({
    matches: still,
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
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
// jsdom has no canvas: the swirl draws nothing, the page around it is real.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
// ...and lays nothing out: the table is measured at the supported screen.
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 947,
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

function firstBoard() {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "MATCH_SNAPSHOT",
        state: {
          stateRevision: 1,
          gameEpoch: 1,
          turn: 1,
          phase: "MAIN1",
          activeSeat: 1,
          seat: 1,
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 53 },
            { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 53 },
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

const logos = (root: ParentNode) =>
  [...root.querySelectorAll("img")].filter(
    (img) => /logo/i.test(img.getAttribute("src") ?? "") || /Proxic/i.test(img.alt),
  );

describe("no logo on the table or the loading screen (F-0065-A)", () => {
  it("the loading screen: the five mana symbols and the words, no logo", () => {
    still = true; // the still version draws its symbols as pictures
    const c = render(<LoadingRing words="Setting up the table…" />).container;
    expect(logos(c)).toHaveLength(0);
    expect(c.querySelector(".gs-ring-logo")).toBeNull();
    const pips = [...c.querySelectorAll(".gs-vortex-pip img")];
    expect(pips.map((img) => /sym_(\w)\./.exec(img.getAttribute("src") ?? "")?.[1])).toEqual([
      "W",
      "U",
      "B",
      "R",
      "G",
    ]);
    expect(c.querySelector('[role="status"]')!.textContent).toBe("Setting up the table…");
  });

  it("the battlefield's top left: no logo, the screen reader's line still there", () => {
    vi.useFakeTimers();
    const c = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
    act(() => void vi.advanceTimersByTime(500));
    expect(c.querySelector(".gs-loading")).not.toBeNull(); // waiting, the vortex is up
    expect(logos(c)).toHaveLength(0);
    firstBoard();
    act(() => void vi.advanceTimersByTime(BURST_MS + 50));
    expect(c.querySelector(".gs-loading")).toBeNull();
    const corner = c.querySelector(".gs-corner")!;
    expect(corner.querySelector("img")).toBeNull();
    expect(corner.querySelector(".gs-logo")).toBeNull();
    expect(corner.querySelector(".gs-status")!.textContent).toBe("The game is running.");
    expect(logos(c)).toHaveLength(0);
  });
});

describe("the vortex loops, then bursts over the table (F-0065-B)", () => {
  it("the real game screen draws the table the moment it arrives, under the burst", () => {
    vi.useFakeTimers();
    const c = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
    act(() => void vi.advanceTimersByTime(399));
    expect(c.querySelector(".gs-loading")).toBeNull(); // not before 0.4 s
    act(() => void vi.advanceTimersByTime(10_000));
    const ring = c.querySelector(".gs-loading")!;
    expect(ring.getAttribute("data-vortex")).toBe("wait"); // still looping after 10 s
    expect(ring.querySelector("canvas.gs-vortex-canvas")).not.toBeNull();
    expect(c.querySelector('[data-testid="battlefield"]')).toBeNull();

    firstBoard();
    // The same render: the table is there, the burst on top of it.
    expect(c.querySelector('[data-testid="battlefield"]')).not.toBeNull();
    const burst = c.querySelector(".gs-loading")!;
    expect(burst).toBe(ring); // the same swirl, carried on into its ending
    expect(burst.getAttribute("data-vortex")).toBe("burst");
    expect(burst.classList.contains("gs-loading-ready")).toBe(true);
    expect(c.querySelector(".gs-corner .gs-status")!.textContent).toBe("The game is running.");
    act(() => void vi.advanceTimersByTime(BURST_MS - 1));
    expect(c.querySelector(".gs-loading")).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(c.querySelector(".gs-loading")).toBeNull();
  });

  it("a table that comes before 0.4 s never sees the loading screen", () => {
    vi.useFakeTimers();
    const c = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
    act(() => void vi.advanceTimersByTime(200));
    firstBoard();
    act(() => void vi.advanceTimersByTime(2000));
    expect(c.querySelector(".gs-loading")).toBeNull();
  });
});

/** The table and its loading screen, as the game screen joins them. */
function Table({ drawn }: { drawn: boolean }) {
  const due = useSettled(!drawn, 400);
  const vortex = useVortexHandover(drawn, due);
  return (
    <div>
      {drawn ? <div className="table">the table</div> : null}
      {vortex.show && (
        <LoadingRing words="Shuffling up and dealing…" ready={vortex.ready} onDone={vortex.done} />
      )}
    </div>
  );
}

describe("the handover (F-0065-B)", () => {
  it("the burst ends within 1.5 s, and never before the table is drawn", () => {
    expect(BURST_MS).toBeLessThanOrEqual(1500);
    vi.useFakeTimers();
    const view = render(<Table drawn={false} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(view.container.querySelector(".gs-loading")!.getAttribute("data-vortex")).toBe("wait");
    view.rerender(<Table drawn />);
    expect(view.container.querySelector(".table")).not.toBeNull();
    expect(view.container.querySelector(".gs-loading")!.getAttribute("data-vortex")).toBe("burst");
    act(() => void vi.advanceTimersByTime(BURST_MS));
    expect(view.container.querySelector(".gs-loading")).toBeNull();
    expect(view.container.querySelector(".table")).not.toBeNull();
  });

  it("the table going again mid-burst: back to waiting, no end on the old timer", () => {
    vi.useFakeTimers();
    const view = render(<Table drawn={false} />);
    act(() => void vi.advanceTimersByTime(500));
    view.rerender(<Table drawn />);
    act(() => void vi.advanceTimersByTime(BURST_MS / 2));
    view.rerender(<Table drawn={false} />);
    act(() => void vi.advanceTimersByTime(BURST_MS * 2));
    expect(view.container.querySelector(".gs-loading")!.getAttribute("data-vortex")).toBe("wait");
  });

  it("with reduced motion: the symbols stand still (no swirl), and the table fades in", () => {
    still = true;
    vi.useFakeTimers();
    const view = render(<Table drawn={false} />);
    act(() => void vi.advanceTimersByTime(500));
    const ring = view.container.querySelector(".gs-loading")!;
    expect(ring.classList.contains("gs-loading-still")).toBe(true);
    expect(ring.querySelector("canvas")).toBeNull();
    expect(ring.querySelectorAll(".gs-vortex-pip img")).toHaveLength(5);
    view.rerender(<Table drawn />);
    expect(view.container.querySelector(".table")).not.toBeNull();
    expect(ring.classList.contains("gs-loading-ready")).toBe(true); // fades (CSS)
    act(() => void vi.advanceTimersByTime(250));
    expect(view.container.querySelector(".gs-loading")).toBeNull();
  });
});
