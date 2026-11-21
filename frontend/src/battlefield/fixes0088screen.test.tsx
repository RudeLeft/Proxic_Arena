// @vitest-environment jsdom

// Spec 0088 -- the parts that are the game screen's: a report window that
// stays through the turn line until it is closed (F-0088-B), older reports
// gathered as rows in the same window, cleared by closing it (F-0088-C), and
// a library's top card on its tile, glowing when it may be played, a cast
// rising from it (F-0088-D). The real game screen, its socket replaced,
// handed the boards the worker sends.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { libraryTopBox, TOP_SHOW_MS } from "./LibraryTop";
import { geometry } from "./layout";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  closed: [] as number[],
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
      reportsClosed: (upTo: number) => socket.closed.push(upTo),
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

type Recorded = { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions };
let animations: Recorded[] = [];
beforeEach(() => {
  animations = [];
  socket.closed = [];
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    const record: Recorded = {
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
    };
    animations.push(record);
    return {
      cancel() {},
      finish() {},
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
  matchId: "m-88",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

let revision = 0;
function send(state: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) => reduceMatch(previous, { type: "MATCH_SNAPSHOT", state })),
  );
}
function state(over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 7,
    phase: "END_OF_TURN",
    activeSeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 41 },
      { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 44 },
    ],
    battlefield: [],
    hand: [],
    otherHands: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    moves: [],
    ...over,
  };
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
const back = (n: number) => ({
  id: `action:${n}:0`,
  seat: 2,
  faceDown: true,
  known: false,
  to: "bottom",
});
const report = (n: number, said: string, source: string, extra: Record<string, unknown> = {}) => ({
  key: `action:${n}`,
  stamp: n,
  by: 2,
  source,
  said,
  cards: [back(n)],
  ...extra,
});
const opt = report(5, "Bob scried 1 and put it on the bottom.", "Opt");

describe("F-0088-B · a report from the end of a turn stays until it is closed", () => {
  it("Bob's Opt in Alice's end step: the window stays through the turn line, until she closes it", () => {
    const c = open();
    send(state({ action: opt }));
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Bob scried 1");
    // Bob's turn begins (the worker keeps sending it): still there.
    send(state({ turn: 8, phase: "UPKEEP", activeSeat: 2, action: opt }));
    send(state({ turn: 8, phase: "DRAW", activeSeat: 2, action: opt }));
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Bob scried 1");
    // Closed: gone, and the game is told up to which report.
    fireEvent.click(c.querySelector(".gs-reveal-close")!);
    expect(c.querySelector(".gs-reveal")).toBeNull();
    expect(socket.closed).toEqual([5]);
    // The server replays the last board it sent (a reload, a reconnect): still closed.
    send(state({ turn: 8, phase: "MAIN1", activeSeat: 2, action: opt }));
    expect(c.querySelector(".gs-reveal")).toBeNull();
    // A newer report opens the window again.
    send(state({ action: report(6, "Bob searched their library.", "Polluted Delta") }));
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Bob searched");
  });

  it("an older reveal does not come back when the report window is closed (they share the stamps)", () => {
    const c = open();
    const reveal = {
      key: "reveal:3",
      title: "Goblin Ringleader revealed:",
      stamp: 3,
      cards: [{ id: "reveal:3:0", seat: 2, name: "Goblin Piker", known: true, faceDown: false }],
    };
    send(state({ action: opt, reveal }));
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Bob scried 1");
    fireEvent.click(c.querySelector(".gs-reveal-close")!);
    expect(c.querySelector(".gs-reveal")).toBeNull();
    send(state({ action: opt, reveal }));
    expect(c.querySelector(".gs-reveal")).toBeNull();
  });

  it("closed on this page, a reload keeps it closed for this game (the stamp is kept)", () => {
    const c = open();
    send(state({ action: opt }));
    fireEvent.click(c.querySelector(".gs-reveal-close")!);
    expect(window.sessionStorage.getItem("proxic:reports-closed:m-88:1")).toBe("5");
  });
});

describe("F-0088-C · two fetch lands, then Consider: one window, older reports as rows", () => {
  const delta = report(
    1,
    "Bob searched their library and put Island onto the battlefield, then shuffled.",
    "Polluted Delta",
  );
  const strand = report(
    2,
    "Bob searched their library and put Swamp onto the battlefield, then shuffled.",
    "Flooded Strand",
  );
  const consider = report(
    3,
    "Bob surveilled 1 and put Lightning Bolt into their graveyard.",
    "Consider",
    {
      gathered: [delta, strand],
    },
  );

  it("one window: the two searches as rows at its top, the surveil in full", () => {
    const c = open();
    send(state({ action: consider }));
    expect(c.querySelectorAll(".gs-reveal")).toHaveLength(1);
    const rows = [...c.querySelectorAll<HTMLElement>(".gs-report-row")];
    expect(rows.map((r) => r.dataset["report"])).toEqual(["action:1", "action:2"]);
    expect(rows[0]!.textContent).toContain("Bob · Polluted Delta");
    expect(rows[1]!.textContent).toContain("Bob · Flooded Strand");
    expect(c.querySelector(".gs-report-full")!.textContent).toContain("Bob surveilled 1");
    // A row opens in full on a click.
    fireEvent.click(rows[0]!.querySelector("button")!);
    expect(c.querySelector(".gs-report-full")!.textContent).toContain("put Island onto");
  });

  it("closing clears the gathered set: the game is told the newest, and none comes back", () => {
    const c = open();
    send(state({ action: consider }));
    fireEvent.click(c.querySelector(".gs-reveal-close")!);
    expect(socket.closed).toEqual([3]);
    // The next report: alone (the worker drops the closed ones; a late board
    // still carrying them shows only what is new).
    send(
      state({
        action: report(4, "Bob looked at the top card.", "Opt", { gathered: [delta, strand] }),
      }),
    );
    expect(c.querySelectorAll(".gs-report-row")).toHaveLength(0);
    expect(c.querySelector(".gs-report-full")!.textContent).toContain("Bob looked at");
  });
});

describe("F-0088-D · the top of the library on its tile", () => {
  const top = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    seat: 1,
    owner: 1,
    name,
    kind: "other",
    types: "Instant",
    tapped: false,
    faceDown: false,
    known: true,
    manaCost: "{R}",
    ...extra,
  });
  const ALICE = { uses: [{ seat: 1, how: "cast" }] };

  it("Courser: the public top card stands on Alice's Library tile, a land glowing (she may play it)", () => {
    const c = open();
    send(
      state({ phase: "MAIN1", libraryTop: [top("card:70", "Lightning Bolt", { public: true })] }),
    );
    const lib = c.querySelector('[data-zone-tile="viewer:library"]')!.parentElement!;
    const card = lib.querySelector<HTMLElement>('[data-library-top="card:70"]')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("Lightning Bolt");
    expect(card.classList.contains("gs-libtop-playable")).toBe(false);
    // The count still shows, beside it.
    expect(lib.querySelector('[data-zone-tile="viewer:library"] .gs-zone-n')!.textContent).toBe(
      "41",
    );
    send(
      state({
        phase: "MAIN1",
        libraryTop: [
          top("card:71", "Forest", {
            kind: "land",
            types: "Basic Land — Forest",
            public: true,
            ...ALICE,
          }),
        ],
      }),
    );
    const land = lib.querySelector<HTMLElement>('[data-library-top="card:71"]')!;
    expect(land.classList.contains("gs-libtop-playable")).toBe(true);
    expect(land.getAttribute("aria-label")).toContain("may be played from there");
    // The one before fades where it stood.
    expect(lib.querySelector('[data-ghost-of="card:70"]')).toBeTruthy();
  });

  it("nothing on the tile without the card (the other player's Citadel: you are sent nothing)", () => {
    const c = open();
    send(state({ phase: "MAIN1" }));
    expect(c.querySelector("[data-library-top]")).toBeNull();
  });

  it("a click on it is a click on that card (its options), as on a hand card", () => {
    const c = open();
    send(state({ phase: "MAIN1", libraryTop: [top("card:72", "Lightning Bolt", ALICE)] }));
    act(() =>
      socket.onState!((previous) =>
        reduceMatch(previous, {
          type: "DECISION_REQUEST",
          decisionId: 9,
          actedForSeat: 1,
          authorisedSeat: 1,
          kind: "chooseSpellAbilityToPlay",
          stateVersion: revision,
          options: [{ actionId: "card:72/a1", label: "Lightning Bolt", objectId: "card:72" }],
        }),
      ),
    );
    const card = c.querySelector<HTMLElement>('[data-library-top="card:72"]')!;
    expect(card.dataset["choosable"]).toBe("true");
  });

  it("a new top card rises and is shown, then settles (when the page has a place for it)", () => {
    const c = open();
    send(state({ phase: "MAIN1", libraryTop: [top("card:73", "Opt", { public: true })] }));
    animations = [];
    // jsdom has no layout: give the board, the tile and the card their places.
    const rects = new Map<string, DOMRect>([
      ["bf-board", { x: 0, y: 0, left: 0, top: 0, width: 1920, height: 947 } as DOMRect],
      ["bf-rail", { x: 1672, y: 0, left: 1672, top: 0, width: 248, height: 947 } as DOMRect],
      ["gs-zone", { x: 1690, y: 820, left: 1690, top: 820, width: 204, height: 55 } as DOMRect],
      ["gs-libtop", { x: 1845, y: 812, left: 1845, top: 812, width: 44, height: 61 } as DOMRect],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      for (const [cls, r] of rects)
        if (this.classList.contains(cls)) return { ...r, toJSON: () => ({}) };
      return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    send(state({ phase: "MAIN1", libraryTop: [top("card:74", "Shock", { public: true })] }));
    const card = c.querySelector('[data-library-top="card:74"]')!;
    const rise = animations.find((a) => a.element === card && a.options.duration === TOP_SHOW_MS)!;
    expect(rise).toBeTruthy();
    // From the tile's middle (left of and below the card's own centre) ...
    const [tx, ty] = (String(rise.frames[0]!.transform).match(/-?[\d.]+/g) ?? []).map(Number);
    expect(tx).toBeCloseTo(1690 + 102 - (1845 + 22), 0);
    expect(ty).toBeCloseTo(820 + 27.5 - (812 + 30.5), 0);
    // ... up to the show spot beside the plate, big, held, then home on the tile.
    const shown = rise.frames[2]!;
    const [sx, sy, k] = (String(shown.transform).match(/-?[\d.]+/g) ?? []).map(Number);
    // Just left of the column (82 of 1080), level with the tile (30 above its middle).
    expect(1845 + 22 + sx!).toBeCloseTo(1672 - (82 * 947) / 1080, 0);
    expect(812 + 30.5 + sy!).toBeCloseTo(820 + 27.5 - (30 * 947) / 1080, 0);
    expect(k).toBeGreaterThan(2);
    expect(rise.frames[rise.frames.length - 1]!.transform).toBe("translate(0px, 0px) scale(1, 1)");
    // Its back covers it while it turns face up.
    const turn = animations.find((a) => a.element === card.querySelector(".gs-libtop-back"));
    expect(turn).toBeTruthy();
  });

  it("the other player's cast from their public top (Future Sight) rises from their tile, face up", () => {
    const c = open();
    const theirs = top("card:76", "Lightning Bolt", {
      seat: 2,
      owner: 2,
      public: true,
      uses: [{ seat: 2, how: "cast" }],
    });
    send(state({ phase: "MAIN1", activeSeat: 2, libraryTop: [theirs] }));
    animations = [];
    send(
      state({
        phase: "MAIN1",
        activeSeat: 2,
        casting: [theirs],
        moves: [
          { card: "card:76", from: { zone: "library", seat: 2 }, to: { zone: "stack", seat: 2 } },
        ],
      }),
    );
    const cast = c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)")!;
    expect(cast.getAttribute("aria-label")).toBe("Being cast: Lightning Bolt");
    const rise = animations.find(
      (a) => a.element === cast && String(a.frames[0]?.transform).includes("translate"),
    )!;
    expect(rise).toBeTruthy();
    const [dx, dy] = (String(rise.frames[0]!.transform).match(/-?[\d.]+/g) ?? []).map(Number);
    // From its place (spec 0110: the stack's next slot), moved by (dx, dy).
    const at = {
      x: parseFloat(cast.style.left) + parseFloat(cast.style.width) / 2 + dx!,
      y: parseFloat(cast.style.top) + parseFloat(cast.style.height) / 2 + dy!,
    };
    const box = libraryTopBox(geometry({ width: 1920, height: 947 }), "opponent");
    expect(Math.abs(at.x - (box.x + box.w / 2))).toBeLessThan(box.w);
    expect(Math.abs(at.y - (box.y + box.h / 2))).toBeLessThan(box.h);
  });

  it("your cast from the top rises from the small card on the tile, not the middle of the table", () => {
    const c = open();
    const bolt = top("card:75", "Lightning Bolt", ALICE);
    send(state({ phase: "MAIN1", libraryTop: [bolt] }));
    animations = [];
    send(
      state({
        phase: "MAIN1",
        casting: [bolt],
        moves: [
          { card: "card:75", from: { zone: "library", seat: 1 }, to: { zone: "stack", seat: 1 } },
        ],
      }),
    );
    const cast = c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)")!;
    const rise = animations.find(
      (a) => a.element === cast && String(a.frames[0]?.transform).includes("translate"),
    )!;
    expect(rise).toBeTruthy();
    const [dx, dy] = (String(rise.frames[0]!.transform).match(/-?[\d.]+/g) ?? []).map(Number);
    // From its place (spec 0110: the stack's next slot), moved by (dx, dy).
    const at = {
      x: parseFloat(cast.style.left) + parseFloat(cast.style.width) / 2 + dx!,
      y: parseFloat(cast.style.top) + parseFloat(cast.style.height) / 2 + dy!,
    };
    const g = geometry({ width: 1920, height: 947 });
    const box = libraryTopBox(g, "viewer");
    // It set off from the tile's small card (in the column, by Alice's plate).
    expect(Math.abs(at.x - (box.x + box.w / 2))).toBeLessThan(box.w);
    expect(Math.abs(at.y - (box.y + box.h / 2))).toBeLessThan(box.h);
  });
});
