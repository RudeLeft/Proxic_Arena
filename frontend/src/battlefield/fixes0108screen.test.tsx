// @vitest-environment jsdom

// Spec 0108, items 8/9 -- a flyer floats as one piece, on the real game
// screen (its socket replaced, handed the boards the worker sends; TEST-003).
//
// F-0108-A: Bob's Mist Raven carrying Sharpened Pitchfork (one tab, then
// three), alone in its row and in a crowded one: the card, its glow, its
// tabs (and their glows) and its gold corners are inside one bobbing
// wrapper (`.bf-flight`); the table's shadow is outside it; nothing inside
// bobs on its own; a click on a tab and on the card each answer what they
// did. jsdom applies no style sheet, so the sheets are read as text for
// which element carries the bob.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as (string | null)[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_decisionId: number, actionId: string | null) => socket.answers.push(actionId),
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

beforeEach(() => {
  socket.answers = [];
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
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
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }), updateTiming() {} },
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
  get: () => 1080,
});

const match = {
  matchId: "m-108",
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
const creature = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat: 2,
  owner: 2,
  name,
  kind: "creature",
  types: "Creature — Bird",
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  known: true,
  ...extra,
});
const RAVEN = "card:40";
const raven = creature(RAVEN, "Mist Raven", { keywords: ["Flying"] });
const tab = (id: string, name: string) => ({
  id,
  seat: 2,
  owner: 2,
  name,
  kind: "other",
  types: "Artifact — Equipment",
  tapped: false,
  faceDown: false,
  known: true,
  attachedTo: RAVEN,
});
const PITCHFORK = "card:41";
const ONE_TAB = [tab(PITCHFORK, "Sharpened Pitchfork")];
const THREE_TABS = [...ONE_TAB, tab("card:42", "Bonesplitter"), tab("card:43", "Short Sword")];
// Seventy others: past the rows the table can hold side by side, so they overlap.
const BEARS = Array.from({ length: 70 }, (_, i) =>
  creature(`card:${60 + i}`, `Bear ${i + 1}`, { types: "Creature — Bear" }),
);
function state(battlefield: unknown[], over: Record<string, unknown> = {}) {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 7,
    phase: "MAIN1",
    activeSeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 41 },
      { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 44 },
    ],
    battlefield,
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
/** Alice is asked to choose a target: the Raven and its Pitchfork can be chosen. */
function askTarget() {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "DECISION_REQUEST",
        decisionId: 11,
        actedForSeat: 1,
        authorisedSeat: 1,
        kind: "chooseTargetsFor",
        stateVersion: revision,
        prompt: "Disenchant: Destroy target artifact or creature.",
        options: [
          { actionId: "target:card:40", label: "Mist Raven", objectId: RAVEN },
          { actionId: "target:card:41", label: "Sharpened Pitchfork", objectId: PITCHFORK },
        ],
      }),
    ),
  );
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
const cardOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`button.bf-card[data-object-id="${id}"]`)!;

function onePiece(c: HTMLElement, tabs: number, crowded: boolean) {
  const card = cardOf(c, RAVEN);
  const slot = card.closest<HTMLElement>(".bf-slot")!;
  const flight = card.parentElement!;
  // The card sits in its wrapper, the wrapper in the slot.
  expect(flight.classList.contains("bf-flight")).toBe(true);
  expect(flight.parentElement).toBe(slot);
  expect(flight.classList.contains("bf-fly")).toBe(true);
  expect(flight.classList.contains("bf-fly-bob")).toBe(crowded);
  // Its tabs ride in the wrapper ...
  const tags = slot.querySelector<HTMLElement>(".bf-tags")!;
  expect(tags.parentElement).toBe(flight);
  expect(tags.querySelectorAll("button.bf-tag")).toHaveLength(tabs);
  // ... and the table's shadow stays on the table, outside it.
  const shadow = slot.querySelector<HTMLElement>(".bf-fly-shadow")!;
  expect(shadow.parentElement).toBe(slot);
  expect(flight.contains(shadow)).toBe(false);
  // One clock: the wrapper's (the shadow keeps it in step with the same delay).
  expect(shadow.style.animationDelay).toBe(flight.style.animationDelay);
  expect(card.style.animationDelay).toBe("");
  return { card, slot, flight };
}

describe("F-0108-A · a flyer, its glow, tabs and marks float as one piece", () => {
  it("one tab, alone in its row: the card and the tab in one bobbing wrapper, the shadow outside", () => {
    const c = open();
    send(state([raven, ...ONE_TAB]));
    onePiece(c, 1, false);
  });

  it("three tabs, in a crowded row (lift only): the same", () => {
    const c = open();
    send(state([raven, ...THREE_TABS, ...BEARS]));
    onePiece(c, 3, true);
  });

  it("choosable and aimed at: its glow, the tab's glow and the gold corners ride in the wrapper too", () => {
    const c = open();
    const aimed = {
      stack: [
        {
          id: "stack:3",
          source: "card:90",
          name: "Pacifism",
          owner: 1,
          controller: 1,
          manaCost: "{1}{W}",
          kind: "spell",
          description: "Pacifism",
          targets: [{ object: RAVEN }],
        },
      ],
    };
    send(state([raven, ...ONE_TAB], aimed));
    askTarget();
    const { card, slot, flight } = onePiece(c, 1, false);
    const breaths = [...slot.querySelectorAll<HTMLElement>(".bf-breath")];
    expect(breaths.length).toBeGreaterThanOrEqual(2); // the card's and the tab's
    for (const breath of breaths) {
      expect(flight.contains(breath)).toBe(true);
      expect(breath.classList.contains("bf-fly")).toBe(false);
    }
    // The card's glow right after the card (it follows the card's own movements).
    expect(card.nextElementSibling?.classList.contains("bf-breath")).toBe(true);
    const corners = slot.querySelector(".bf-sight");
    expect(corners).not.toBeNull();
    expect(flight.contains(corners)).toBe(true);
    // Hit areas unchanged: a click on the tab chooses the tab, on the card the card.
    fireEvent.click(
      slot.querySelector<HTMLElement>(`button.bf-tag[data-object-id="${PITCHFORK}"]`)!,
    );
    expect(socket.answers).toEqual(["target:card:41"]);
    askTarget();
    fireEvent.click(cardOf(c, RAVEN));
    expect(socket.answers).toEqual(["target:card:41", "target:card:40"]);
  });

  it("a creature that does not fly is drawn in its slot as before, with no wrapper", () => {
    const c = open();
    send(state([creature("card:50", "Grizzly Bears", { types: "Creature — Bear" })]));
    const card = cardOf(c, "card:50");
    expect(card.parentElement!.classList.contains("bf-slot")).toBe(true);
    expect(c.querySelector(".bf-flight")).toBeNull();
  });

  it("the sheets: only the wrapper and the shadow bob; the card and its glow do not on their own", () => {
    const sheets = ["battlefield.css", "game.css"]
      .map((f) => readFileSync(resolve(__dirname, f), "utf8"))
      .join("\n");
    const animating = [...sheets.matchAll(/([^{}]+)\{[^{}]*animation(?:-name)?:\s*bf-fly/g)].map(
      (m) => m[1]!.trim(),
    );
    expect(animating.length).toBeGreaterThan(0);
    for (const selector of animating) {
      expect(selector).not.toMatch(/\.bf-card\.bf-fly|\.bf-breath\.bf-fly|\.bf-tag/);
      expect(selector).toMatch(/\.bf-flight\.bf-fly|\.bf-fly-shadow/);
    }
  });
});
