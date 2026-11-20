// @vitest-environment jsdom

// Spec 0103 -- the parts that are the game screen's: the replay (F-0103-C:
// R and a click on the window's medallion play the report's move again at
// half speed, the live table unchanged; after one more board neither does
// anything; R in a text field does nothing), the known library top (item 4,
// F-0103-D2 (5): shown only while the owner points at their Library tile;
// nothing of it on the other player's page), the plates' "this turn" counts
// (item 5) and the "Bigger text" switch (F-0103-F). The real game screen,
// its socket replaced, handed the boards the worker sends. (Harness as
// fixes0102screen's.)

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { endLifeSteps } from "./lifeTicks";
import { REPLAY_MAX_MS, REPLAY_RATE } from "./replay";
import { BIGGER_TEXT_KEY } from "./biggerText";
import { READ_MS, READ_START_MS } from "./RevealTray";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const { GameScreen, THEIR_SPELL_HOLD_MS } = await import("./GameScreen");

/** A recorded animation: where, its frames, and the speed it was set to. */
type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  anim: { playbackRate: number; playState: string };
};
let animations: Recorded[] = [];
beforeEach(() => {
  animations = [];
  endLifeSteps();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
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
    const opts = (typeof options === "number" ? { duration: options } : options) as {
      duration?: number;
    };
    const anim = {
      cancel() {},
      finish() {},
      onfinish: null,
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: {
        getComputedTiming: () => ({ endTime: Number(opts?.duration ?? 0), iterations: 1 }),
      },
      updatePlaybackRate(rate: number) {
        anim.playbackRate = rate;
      },
    };
    animations.push({ element: this, frames, options: opts, anim });
    return anim as unknown as Animation;
  };
  // Each element's own running animations, and those under it.
  (Element.prototype as { getAnimations?: unknown }).getAnimations = function (this: Element) {
    return animations
      .filter((a) => this.contains(a.element) && a.anim.playState === "running")
      .map((a) => a.anim);
  };
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
  matchId: "m-103",
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
function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
function state(over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 8,
    phase: "MAIN1",
    activeSeat: 2,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 1, libraryCount: 40, graveyardCount: 0 },
      { seat: 2, name: "Bob", life: 20, handCount: 3, libraryCount: 40, graveyardCount: 0 },
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
const card = (id: string, seat: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: "Creature",
  power: 4,
  toughness: 4,
  tapped: false,
  faceDown: false,
  known: true,
  ...over,
});

// --- F-0103-C: the replay ---------------------------------------------------------------------

// Bob's Unsummon returns Alice's Serra Angel to her hand; her window says so.
const angel = card("card:31", 1, "Serra Angel");
const unsummon = {
  id: "stack:3",
  kind: "spell",
  source: "card:50",
  card: "card:50",
  controller: 2,
  name: "Unsummon",
  description: "Return target creature to its owner's hand.",
  targets: [{ object: "card:31" }],
};
const report = {
  key: "action:1",
  stamp: 1,
  by: 2,
  source: "Unsummon",
  said: "Bob returned your Serra Angel to your hand.",
  cards: [{ ...angel, id: "action:1:0", to: "hand" }],
};
/** The table before, Bob's Unsummon on the stack, then the report's board. */
function unsummoned() {
  send(state({ battlefield: [angel] }));
  send(state({ battlefield: [angel], stack: [unsummon] }));
  send(
    state({
      hand: [angel],
      action: report,
      moves: [
        {
          card: "card:31",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "hand", seat: 1 },
        },
      ],
    }),
  );
  // The other player's spell is held a moment on the table (0102's carry), its paced flight with it.
  wait(THEIR_SPELL_HOLD_MS + 120);
}
const layer = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-replay");
const medallion = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-reveal-replay");
/** The animations started on the replay's layer, and on the live table. */
const onLayer = (c: HTMLElement) => animations.filter((a) => layer(c)?.contains(a.element));
const live = (c: HTMLElement) =>
  c.querySelector<HTMLElement>(".bf-board:not(.gs-replay .bf-board)")!;

describe("F-0103-C · replay: R or the medallion, at half speed, only while the table is unchanged", () => {
  it("R plays the board pair again on a layer over the table, every animation at half speed; the live table is untouched", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    unsummoned();
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Bob returned your Serra Angel");
    // Offered: the medallion is a button (its replay sign), the foot names R.
    expect(medallion(c)!.dataset.replayOffered).toBe("true");
    expect(c.querySelector(".gs-reveal-foot")!.textContent).toContain("R to replay");
    const liveBefore = live(c).querySelector('[data-object-id="card:31"]')!.outerHTML;
    const liveAnimsBefore = animations.filter((a) => !layer(c)?.contains(a.element)).length;
    fireEvent.keyDown(document.body, { key: "r" });
    // First the board before the report (the Angel on the table)...
    expect(layer(c)).toBeTruthy();
    expect(layer(c)!.dataset.replayStage).toBe("0");
    expect(layer(c)!.getAttribute("inert")).toBe("");
    expect(layer(c)!.querySelector('[data-object-id="card:31"]')).toBeTruthy();
    wait(0);
    // ...then the report's own: the Angel's journey home, on the layer.
    expect(layer(c)!.dataset.replayStage).toBe("1");
    const played = onLayer(c);
    expect(played.length).toBeGreaterThan(0);
    // Half speed: every one of them (its frames run twice as long).
    wait(40);
    for (const a of onLayer(c)) expect(a.anim.playbackRate).toBe(REPLAY_RATE);
    // The ring fills while it plays; the window stays open.
    expect(medallion(c)!.classList.contains("gs-reveal-replaying")).toBe(true);
    expect(c.querySelector(".gs-reveal")).toBeTruthy();
    // It ends when nothing on the layer moves any more: the live table again.
    for (const a of onLayer(c)) a.anim.playState = "finished";
    wait(700);
    expect(layer(c)).toBeNull();
    expect(live(c).querySelector('[data-object-id="card:31"]')!.outerHTML).toBe(liveBefore);
    // Nothing on the live table was played again.
    const liveAfter = animations.filter((a) => !a.element.closest(".gs-replay")).length;
    expect(liveAfter).toBe(liveAnimsBefore);
    // Still offered (the table is still the report's): a click on the medallion.
    expect(medallion(c)!.dataset.replayOffered).toBe("true");
    fireEvent.click(medallion(c)!);
    expect(layer(c)).toBeTruthy();
    wait(0);
    expect(layer(c)!.dataset.replayStage).toBe("1");
    // A replay whose clock never ends still ends.
    wait(REPLAY_MAX_MS + 100);
    expect(layer(c)).toBeNull();
  });

  it("one more board: no replay sign, a click does nothing, R does nothing", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    unsummoned();
    expect(medallion(c)).toBeTruthy();
    // Bob passes: the table is no longer the report's.
    send(state({ hand: [angel], action: report, phase: "MAIN2" }));
    wait(100);
    expect(c.querySelector(".gs-reveal")).toBeTruthy();
    expect(medallion(c)).toBeNull();
    expect(c.querySelector(".gs-reveal-foot")!.textContent).not.toContain("R to replay");
    fireEvent.click(c.querySelector(".gs-reveal-face")!);
    fireEvent.keyDown(document.body, { key: "R" });
    wait(50);
    expect(layer(c)).toBeNull();
  });

  it("R typed into a text field (the chat box) does nothing", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    unsummoned();
    const box = document.createElement("textarea");
    document.body.appendChild(box);
    box.focus();
    fireEvent.keyDown(box, { key: "r" });
    expect(layer(c)).toBeNull();
    box.remove();
  });

  it("a board arriving mid-replay ends it at once", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    unsummoned();
    fireEvent.keyDown(document.body, { key: "r" });
    wait(0);
    expect(layer(c)).toBeTruthy();
    send(state({ hand: [angel], action: report, phase: "MAIN2" }));
    expect(layer(c)).toBeNull();
  });
});

// --- F-0103-A and F-0103-B: the window points at the table; the read-through -------------------

// Bob cracked Flooded Strand (an Island), then Polluted Delta (a Swamp), then
// cast Consider and surveilled Lightning Bolt into his graveyard. Alice's
// window holds all three; the Bolt's report also put a card back on top of
// his library, hidden from her (no link: its pile tile instead).
const island = card("card:100", 2, "Island", { kind: "land", types: "Basic Land — Island" });
const swamp = card("card:101", 2, "Swamp", { kind: "land", types: "Basic Land — Swamp" });
const bolt = card("card:102", 2, "Lightning Bolt", { kind: "instant", types: "Instant" });
const fetchReport = (n: number, source: string, c: Record<string, unknown>, table: string) => ({
  key: `action:${n}`,
  stamp: n,
  by: 2,
  source,
  said: `Bob searched his library and put ${String(c["name"])} onto the battlefield.`,
  cards: [{ ...c, id: `action:${n}:0`, to: "battlefield", table }],
});
const gatheredWindow = {
  key: "action:3",
  stamp: 3,
  by: 2,
  source: "Consider",
  said: "Bob surveilled Lightning Bolt into his graveyard.",
  cards: [
    { ...bolt, id: "action:3:0", to: "graveyard", table: "card:102" },
    { id: "action:3:1", seat: 2, known: false, faceDown: true, to: "top" },
  ],
  gathered: [
    fetchReport(1, "Flooded Strand", island, "card:100"),
    fetchReport(2, "Polluted Delta", swamp, "card:101"),
  ],
};
const threeReports = () =>
  send(
    state({
      battlefield: [island, swamp, card("card:20", 1, "Grizzly Bears")],
      graveyard: [bolt],
      action: gatheredWindow,
    }),
  );
const screenOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-screen")!;
const slotOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`.bf-cards [data-object-id="${id}"]`)!.closest(".bf-slot")!;
const tileOf = (c: HTMLElement, tile: string) =>
  c.querySelector<HTMLElement>(`[data-zone-tile="${tile}"]`)!;
/** What is kept bright now: the card ids' slots and the tiles. */
const litNow = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>(".gs-lit")].map(
    (el) =>
      el.dataset.zoneTile ?? el.querySelector<HTMLElement>("[data-object-id]")?.dataset.objectId,
  );

describe("F-0103-A · pointing at a report row dims everything but that card (or its pile tile)", () => {
  it("row 1 lights Bob's Island; the Bolt picture lights his Graveyard tile; leaving restores the table", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    threeReports();
    // Pointing cancels the read-through (it has not started yet anyway).
    fireEvent.mouseEnter(c.querySelector(".gs-reveal")!);
    fireEvent.mouseEnter(c.querySelector('.gs-report-row[data-report="action:1"]')!);
    expect(screenOf(c).classList.contains("gs-report-pointing")).toBe(true);
    expect(litNow(c)).toEqual(["card:100"]);
    expect(slotOf(c, "card:100").classList.contains("gs-lit")).toBe(true);
    expect(slotOf(c, "card:101").classList.contains("gs-lit")).toBe(false);
    expect(slotOf(c, "card:20").classList.contains("gs-lit")).toBe(false);
    fireEvent.mouseLeave(c.querySelector('.gs-report-row[data-report="action:1"]')!);
    // The Bolt's picture in the full report: in his graveyard, so its tile.
    const pic = c.querySelector('li.gs-reveal-card[data-revealed-id="action:3:0"]')!;
    fireEvent.mouseEnter(pic);
    expect(litNow(c)).toEqual(["opponent:graveyard"]);
    fireEvent.mouseLeave(pic);
    // The hidden card he put back: no link; his Library tile instead.
    fireEvent.mouseEnter(c.querySelector('li.gs-reveal-card[data-revealed-id="action:3:1"]')!);
    expect(litNow(c)).toEqual(["opponent:library"]);
    expect(tileOf(c, "opponent:graveyard").classList.contains("gs-lit")).toBe(false);
    fireEvent.mouseLeave(c.querySelector('li.gs-reveal-card[data-revealed-id="action:3:1"]')!);
    expect(screenOf(c).classList.contains("gs-report-pointing")).toBe(false);
    expect(litNow(c)).toEqual([]);
  });

  it("the dim is the split-second dim, on the card slots and tiles not kept bright", () => {
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "game.css"), "utf-8");
    expect(css).toMatch(
      /\.gs-report-pointing \.bf-cards > \.bf-slot:not\(\.gs-lit\),\s*\.gs-report-pointing \[data-zone-tile\]:not\(\.gs-lit\) \{\s*filter: brightness\(0\.45\) saturate\(0\.4\);/,
    );
  });

  it("a card drawn in a pile (two Islands) lights its pile", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    const second = card("card:103", 2, "Island", { kind: "land", types: "Basic Land — Island" });
    send(
      state({
        battlefield: [island, second],
        action: fetchReport(1, "Flooded Strand", second, "card:103"),
      }),
    );
    expect(c.querySelector('[data-members-ids~="card:103"]')).toBeTruthy();
    fireEvent.mouseEnter(c.querySelector(".gs-reveal-head")!);
    expect(c.querySelector('.gs-lit [data-members-ids~="card:103"]')).toBeTruthy();
    expect(c.querySelectorAll(".gs-lit")).toHaveLength(1);
  });

  it("a link to a card the board does not show lights nothing on the table", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(
      state({
        battlefield: [card("card:20", 1, "Grizzly Bears")],
        action: { ...fetchReport(1, "Flooded Strand", island, "card:999"), cards: [] },
      }),
    );
    fireEvent.mouseEnter(c.querySelector(".gs-reveal-head")!);
    expect(screenOf(c).classList.contains("gs-report-pointing")).toBe(false);
  });
});

describe("F-0103-B · numbered, oldest first; the read-through lights each once, in order, and stops", () => {
  it("1, 2, 3; then Island, Swamp, the Graveyard tile in turn, a second each; then the table as it was, once", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    threeReports();
    expect([...c.querySelectorAll(".gs-report-n")].map((b) => b.textContent)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(litNow(c)).toEqual([]);
    wait(READ_START_MS);
    expect(litNow(c)).toEqual(["card:100"]);
    expect(
      c
        .querySelector('.gs-report-row[data-report="action:1"]')!
        .classList.contains("gs-report-lit"),
    ).toBe(true);
    wait(READ_MS);
    expect(litNow(c)).toEqual(["card:101"]);
    wait(READ_MS);
    expect(litNow(c).sort()).toEqual(["opponent:graveyard", "opponent:library"]);
    expect(c.querySelector(".gs-reveal-head")!.classList.contains("gs-report-lit")).toBe(true);
    wait(READ_MS);
    expect(litNow(c)).toEqual([]);
    expect(screenOf(c).classList.contains("gs-report-pointing")).toBe(false);
    // Once: a later board with the same window does not read it again.
    send(
      state({
        battlefield: [island, swamp, card("card:20", 1, "Grizzly Bears")],
        graveyard: [bolt],
        action: gatheredWindow,
        phase: "MAIN2",
      }),
    );
    wait(READ_START_MS + READ_MS);
    expect(litNow(c)).toEqual([]);
  });

  it("a click on the window cancels it", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    threeReports();
    wait(READ_START_MS);
    expect(litNow(c)).toEqual(["card:100"]);
    fireEvent.pointerDown(c.querySelector(".gs-reveal")!);
    expect(litNow(c)).toEqual([]);
    wait(READ_MS * 3);
    expect(litNow(c)).toEqual([]);
  });

  it("a single report has no number and no read-through", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(
      state({
        battlefield: [island],
        action: fetchReport(1, "Flooded Strand", island, "card:100"),
      }),
    );
    expect(c.querySelectorAll(".gs-report-n")).toHaveLength(0);
    wait(READ_START_MS + READ_MS);
    expect(litNow(c)).toEqual([]);
  });
});

// --- item 4: the cards you know on top of your library --------------------------------------

const known = [
  card("known:1:0", 1, "Lightning Bolt", { kind: "instant", types: "Instant" }),
  card("known:1:1", 1, "Forest", { kind: "land", types: "Basic Land — Forest" }),
];

describe("item 4 · the known library top: shown while you point at your Library, numbered; nothing for the other player", () => {
  it("Alice's page: nothing at rest; pointing at her Library slides out Bolt (1) and Forest (2); leaving hides them", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({ activeSeat: 1, knownTop: known }));
    expect(c.querySelector(".gs-known")).toBeNull();
    const tile = c.querySelector<HTMLElement>('[data-zone-tile="viewer:library"]')!;
    fireEvent.mouseEnter(tile);
    const cards = [...c.querySelectorAll<HTMLElement>(".gs-known-card")];
    expect(cards.map((k) => k.getAttribute("aria-label"))).toEqual([
      "1: Lightning Bolt, your next draw",
      "2: Forest",
    ]);
    expect(cards.map((k) => k.querySelector(".gs-known-n")!.textContent)).toEqual(["1", "2"]);
    fireEvent.mouseLeave(tile);
    expect(c.querySelector(".gs-known")).toBeNull();
    // The other player's Library tile shows nothing of hers.
    fireEvent.mouseEnter(c.querySelector('[data-zone-tile="opponent:library"]')!);
    expect(c.querySelector(".gs-known")).toBeNull();
  });

  it("Bob's page (never sent it): Alice's tile is the same as a library with nothing known, pointing or not", () => {
    const tileOf = (sent: Record<string, unknown>) => {
      const view = render(<GameScreen match={match} me="u-2" onLeave={() => {}} />);
      send(state({ seat: 2, ...sent }));
      const tile = view.container.querySelector<HTMLElement>(
        '[data-zone-tile="opponent:library"]',
      )!;
      const at = tile.outerHTML;
      fireEvent.mouseEnter(tile);
      const pointing = view.container.querySelector(".gs-known");
      view.unmount();
      return { at, pointing };
    };
    const bob = tileOf({});
    expect(bob.pointing).toBeNull();
    expect(bob.at).not.toContain("Lightning Bolt");
  });
});

// --- item 5: "this turn" on the plates ---------------------------------------------------------

describe('item 5 · "this turn" counts on both plates, the list in words on pointing', () => {
  it("Alice's Opt, Bolt and Salve, +3 life, her Elves gone; Bob nothing", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(
      state({
        activeSeat: 1,
        players: [
          {
            seat: 1,
            name: "Alice",
            life: 23,
            handCount: 1,
            libraryCount: 36,
            graveyardCount: 4,
            thisTurn: { spells: 3, lifeGained: 3, leftBattlefield: true },
          },
          {
            seat: 2,
            name: "Bob",
            life: 20,
            handCount: 4,
            libraryCount: 40,
            graveyardCount: 2,
            thisTurn: { spells: 0, lifeGained: 0, leftBattlefield: false },
          },
        ],
      }),
    );
    const mine = c.querySelector<HTMLElement>(".gs-seat-viewer .gs-thisturn")!;
    const theirs = c.querySelector<HTMLElement>(".gs-seat-opponent .gs-thisturn")!;
    expect([mine.dataset.spells, mine.dataset.lifeGained, mine.dataset.left]).toEqual([
      "3",
      "3",
      "true",
    ]);
    expect(mine.textContent).toBe("3+3✓");
    expect(theirs.querySelectorAll(".gs-thisturn-zero")).toHaveLength(3);
    expect(c.querySelector(".gs-thisturn-list")).toBeNull();
    fireEvent.mouseEnter(mine);
    const list = c.querySelector<HTMLElement>(".gs-thisturn-list")!;
    expect(list.textContent).toContain("Spells cast3");
    expect(list.textContent).toContain("Life gained+3");
    expect(list.textContent).toContain("A permanent of yours left the tableYes");
    expect(list.textContent).not.toMatch(/mana/i);
    fireEvent.mouseLeave(mine);
    expect(c.querySelector(".gs-thisturn-list")).toBeNull();
  });
});

// --- F-0103-F: Bigger text ----------------------------------------------------------------------

describe("F-0103-F · Bigger text: the gear menu's switch, kept in this browser", () => {
  const screen = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-screen")!;
  const flip = (c: HTMLElement) => {
    fireEvent.click(c.querySelector('[aria-label="Game menu"]')!);
    const sw = c.querySelector<HTMLElement>('[role="switch"]')!;
    expect(sw.textContent).toContain("Bigger text");
    fireEvent.click(sw);
    return sw;
  };

  it("off by default; on: the screen's class and proxic.biggerText; a new game screen keeps it", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send(state());
    const c = view.container;
    expect(screen(c).classList.contains("gs-bigger")).toBe(false);
    const sw = flip(c);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen(c).classList.contains("gs-bigger")).toBe(true);
    expect(window.localStorage.getItem(BIGGER_TEXT_KEY)).toBe("on");
    view.unmount();
    const again = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send(state());
    expect(screen(again.container).classList.contains("gs-bigger")).toBe(true);
    flip(again.container);
    expect(screen(again.container).classList.contains("gs-bigger")).toBe(false);
    expect(window.localStorage.getItem(BIGGER_TEXT_KEY)).toBe("off");
  });

  it("works when the browser refuses storage (a private window)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    send(state());
    expect(screen(view.container).classList.contains("gs-bigger")).toBe(false);
    flip(view.container);
    expect(screen(view.container).classList.contains("gs-bigger")).toBe(true);
  });
});
