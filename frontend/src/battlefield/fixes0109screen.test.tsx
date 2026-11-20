// @vitest-environment jsdom

// Spec 0109 -- the parts that are the game screen's, on the real game screen
// (its socket replaced, handed the boards and questions the worker sends;
// TEST-003; harness as fixes0103screen's).
//
// F-0109-A (item 5): Victim of Night's target question with its `casting`
// entry gets the short window (the title, one "Choose ..." line, no card
// sentence); the same question with no `casting` entry (an ability) keeps
// the sentence; a trigger's window keeps it; Izzet Charm keeps its mode line.
//
// F-0109-F (item 13): pointing at the report window leaves the table
// undimmed; a click on a picture dims it to that card; a second click, a
// click on the table, or Close undims; another picture moves the dim; Enter
// and Space do the same as a click; a gathered window of three reports left
// alone for five seconds never dims the table (no read-through).

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { endLifeSteps } from "./lifeTicks";

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

beforeEach(() => {
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
  Element.prototype.animate = function () {
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      oncancel: null,
      playState: "finished",
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
  matchId: "m-109",
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
    turn: 9,
    phase: "MAIN1",
    activeSeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 14, handCount: 2, libraryCount: 39, graveyardCount: 0 },
      { seat: 2, name: "Bob", life: 14, handCount: 3, libraryCount: 38, graveyardCount: 0 },
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
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  known: true,
  ...over,
});
function ask(question: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "DECISION_REQUEST",
        decisionId: 21,
        actedForSeat: 1,
        authorisedSeat: 1,
        kind: "chooseTargetsFor",
        stateVersion: revision,
        ...question,
      }),
    ),
  );
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
/** The question window's words, each paragraph. */
const lines = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>(".gs-bubble .gs-win-prompt")].map((p) => p.textContent);
const title = (c: HTMLElement) => c.querySelector(".gs-bubble .gs-question-title")?.textContent;

// --- F-0109-A: the short window beside your own spell's big card --------------------------------

const vanguard = card("card:60", 2, "Gryff Vanguard", { types: "Creature — Griffin Knight" });
const geist = card("card:61", 1, "Chapel Geist", { types: "Creature — Spirit" });
const victim = card("card:70", 1, "Victim of Night", {
  kind: "instant",
  types: "Instant",
  manaCost: "{1}{B}{B}",
});
const targets = [
  { actionId: "target:card:60", label: "Gryff Vanguard", objectId: "card:60" },
  { actionId: "target:card:61", label: "Chapel Geist", objectId: "card:61" },
  { actionId: "target:cancel", label: "Cancel", objectId: null },
];
const arrange = (over: Record<string, unknown> = {}) => ({
  targets: { chosen: [], enough: false, more: 1, cancel: "target:cancel", ...over },
});
const VICTIM_SAID =
  "Victim of Night: Destroy target non-Vampire, non-Werewolf, non-Zombie creature.";

describe("F-0109-A · the short window only while your own spell's big card shows", () => {
  it("Victim of Night, its casting entry on the board: the title and one short line, no card sentence", () => {
    const c = open();
    send(state({ battlefield: [vanguard, geist], casting: [victim] }));
    ask({
      prompt: VICTIM_SAID,
      about: { name: "Victim of Night", kind: "spell", from: "hand" },
      arrange: arrange(),
      options: targets,
    });
    expect(c.querySelector(".gs-cast")).toBeTruthy();
    expect(title(c)).toBe("Choose a target");
    expect(lines(c)).toEqual(["Choose a creature that isn't a Vampire, Werewolf or Zombie."]);
    expect(c.querySelector(".gs-bubble .decision-prompt")).toBeNull();
    // "Up to" with one chosen: the title says how many more (targetsTitle, unchanged
    // by this spec; its digits are spec 0113's wording), the chosen line stays.
    ask({
      prompt: VICTIM_SAID,
      about: { name: "Victim of Night", kind: "spell", from: "hand" },
      arrange: arrange({ chosen: ["card:60"], enough: true, more: 1 }),
      options: targets,
    });
    expect(title(c)).toBe("Choose up to 1 more target");
    expect(lines(c)).toEqual([
      "1 chosen: Gryff Vanguard",
      "Choose a creature that isn't a Vampire, Werewolf or Zombie.",
    ]);
    expect(c.querySelector(".gs-bubble .gs-targets-done")).toBeTruthy();
  });

  it("the same question with no casting entry (an ability) keeps the card's sentence and the hint", () => {
    const c = open();
    send(state({ battlefield: [vanguard, geist] }));
    ask({
      prompt: VICTIM_SAID,
      about: { name: "Victim of Night", kind: "ability" },
      arrange: arrange(),
      options: targets,
    });
    expect(lines(c)).toEqual([
      "Destroy a non-Vampire, non-Werewolf, non-Zombie creature.",
      "Click a creature that isn't a Vampire, Werewolf or Zombie.",
    ]);
  });

  it("your spell's question with no casting entry on the board (or the other seat's) keeps the sentence", () => {
    const c = open();
    // Bob's spell is the one being cast: not the asked player's own big card.
    send(state({ battlefield: [vanguard, geist], casting: [{ ...victim, seat: 2, owner: 2 }] }));
    ask({
      prompt: VICTIM_SAID,
      about: { name: "Victim of Night", kind: "spell", from: "hand" },
      arrange: arrange(),
      options: targets,
    });
    expect(lines(c)).toEqual([
      "Destroy a non-Vampire, non-Werewolf, non-Zombie creature.",
      "Click a creature that isn't a Vampire, Werewolf or Zombie.",
    ]);
    // None at all.
    send(state({ battlefield: [vanguard, geist] }));
    ask({
      prompt: VICTIM_SAID,
      about: { name: "Victim of Night", kind: "spell", from: "hand" },
      arrange: arrange(),
      options: targets,
    });
    expect(lines(c)[0]).toBe("Destroy a non-Vampire, non-Werewolf, non-Zombie creature.");
  });

  it("a trigger's window keeps its sentence (Boggart Shenanigans)", () => {
    const c = open();
    const boggart = card("card:80", 1, "Boggart Shenanigans", {
      kind: "other",
      types: "Tribal Enchantment — Goblin",
    });
    send(state({ battlefield: [vanguard, geist, boggart] }));
    ask({
      prompt:
        "Boggart Shenanigans: Boggart Shenanigans may deal 1 damage to target player or planeswalker.",
      about: { name: "Boggart Shenanigans", kind: "trigger" },
      arrange: arrange(),
      options: [
        { actionId: "target:player:2", label: "Bob", objectId: "player:2" },
        { actionId: "target:cancel", label: "Cancel", objectId: null },
      ],
    });
    expect(lines(c)).toEqual([
      "Boggart Shenanigans may deal 1 damage to a player or planeswalker.",
      "Click a player or planeswalker.",
    ]);
  });

  it("Izzet Charm, a mode being targeted: keeps the mode's line beside its big card", () => {
    const c = open();
    const charm = card("card:71", 1, "Izzet Charm", { kind: "instant", types: "Instant" });
    send(state({ battlefield: [vanguard, geist], casting: [charm] }));
    ask({
      prompt: "Izzet Charm: Izzet Charm deals 2 damage to target creature.",
      about: { name: "Izzet Charm", kind: "spell", from: "hand" },
      arrange: arrange({ mode: true }),
      options: targets,
    });
    expect(c.querySelector(".gs-cast")).toBeTruthy();
    expect(lines(c)).toEqual(["Izzet Charm deals 2 damage to a creature.", "Click a creature."]);
  });
});

// --- F-0109-F: the report dim only on a click ------------------------------------------------------

// Bob brought Abattoir Ghoul and Diregraf Captain back from his graveyard;
// Alice's window says so, each picture linked to the card on the table.
const ghoul = card("card:100", 2, "Abattoir Ghoul", { types: "Creature — Zombie Knight" });
const captain = card("card:101", 2, "Diregraf Captain", { types: "Creature — Zombie Soldier" });
const bears = card("card:20", 1, "Grizzly Bears", { types: "Creature — Bear" });
const returned = {
  key: "action:1",
  stamp: 1,
  by: 2,
  source: "Necromantic Summons",
  said: "Bob returned Abattoir Ghoul and Diregraf Captain from his graveyard to the battlefield.",
  cards: [
    { ...ghoul, id: "action:1:0", to: "battlefield", table: "card:100" },
    { ...captain, id: "action:1:1", to: "battlefield", table: "card:101" },
  ],
};
const reported = () =>
  send(state({ activeSeat: 2, battlefield: [ghoul, captain, bears], action: returned }));
const screenOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-screen")!;
const dimmed = (c: HTMLElement) => screenOf(c).classList.contains("gs-report-pointing");
/** What is kept bright now: the card ids' slots and the tiles. */
const litNow = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>(".gs-lit")].map(
    (el) =>
      el.dataset.zoneTile ?? el.querySelector<HTMLElement>("[data-object-id]")?.dataset.objectId,
  );
const pic = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`li.gs-reveal-card[data-revealed-id="${id}"]`)!;
const GHOUL = "action:1:0";
const CAPTAIN = "action:1:1";

describe("F-0109-F · the report window dims the table only on a click", () => {
  it("pointing at the top part and the pictures does nothing", () => {
    const c = open();
    reported();
    const head = c.querySelector<HTMLElement>(".gs-reveal-head")!;
    for (const el of [
      c.querySelector<HTMLElement>(".gs-reveal")!,
      head,
      pic(c, GHOUL),
      pic(c, CAPTAIN),
    ]) {
      fireEvent.mouseEnter(el);
      expect(dimmed(c)).toBe(false);
      fireEvent.mouseLeave(el);
      expect(dimmed(c)).toBe(false);
    }
    // A click on the top part does nothing either.
    fireEvent.click(head);
    expect(dimmed(c)).toBe(false);
    expect(litNow(c)).toEqual([]);
  });

  it("a click on a picture dims the table to that card; again, the table comes back; another moves it", () => {
    const c = open();
    reported();
    fireEvent.click(pic(c, CAPTAIN));
    expect(dimmed(c)).toBe(true);
    expect(litNow(c)).toEqual(["card:101"]);
    expect(pic(c, CAPTAIN).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pic(c, CAPTAIN));
    expect(dimmed(c)).toBe(false);
    expect(litNow(c)).toEqual([]);
    fireEvent.click(pic(c, GHOUL));
    expect(litNow(c)).toEqual(["card:100"]);
    fireEvent.click(pic(c, CAPTAIN));
    expect(dimmed(c)).toBe(true);
    expect(litNow(c)).toEqual(["card:101"]);
    // A new board under the dim (Bob taps the Captain, its slot redrawn):
    // still dimmed to the Captain.
    send(
      state({
        activeSeat: 2,
        phase: "MAIN2",
        battlefield: [ghoul, { ...captain, tapped: true }, bears],
        action: returned,
      }),
    );
    expect(dimmed(c)).toBe(true);
    expect(litNow(c)).toEqual(["card:101"]);
  });

  it("a click on the table outside the window brings it back; so does Close", () => {
    const c = open();
    reported();
    fireEvent.click(pic(c, GHOUL));
    expect(dimmed(c)).toBe(true);
    // The empty table.
    fireEvent.click(c.querySelector<HTMLElement>(".bf-board")!);
    expect(dimmed(c)).toBe(false);
    expect(litNow(c)).toEqual([]);
    // A click inside the window (its words) keeps it.
    fireEvent.click(pic(c, GHOUL));
    fireEvent.click(c.querySelector<HTMLElement>(".gs-reveal-said")!);
    expect(dimmed(c)).toBe(true);
    fireEvent.click(c.querySelector<HTMLElement>(".gs-reveal-close")!);
    wait(1000);
    expect(c.querySelector(".gs-reveal")).toBeNull();
    expect(dimmed(c)).toBe(false);
    expect(litNow(c)).toEqual([]);
  });

  it("Enter or Space on a focused picture does the same as a click", () => {
    const c = open();
    reported();
    const captainPic = pic(c, CAPTAIN);
    expect(captainPic.tabIndex).toBe(0);
    captainPic.focus();
    fireEvent.keyDown(captainPic, { key: "Enter" });
    expect(litNow(c)).toEqual(["card:101"]);
    fireEvent.keyDown(captainPic, { key: " ", code: "Space" });
    expect(dimmed(c)).toBe(false);
    // Space on the picture is the picture's: the window is not peeked away.
    expect(c.querySelector(".gs-reveal")!.classList.contains("gs-win-peek")).toBe(false);
  });

  it("a gathered window of three reports, left alone for five seconds, never dims the table", () => {
    const c = open();
    const fetchReport = (n: number, source: string, cardOf: Record<string, unknown>) => ({
      key: `action:${n}`,
      stamp: n,
      by: 2,
      source,
      said: `Bob searched his library and put ${String(cardOf["name"])} onto the battlefield.`,
      cards: [{ ...cardOf, id: `action:${n}:0`, to: "battlefield", table: cardOf["id"] }],
    });
    const island = card("card:110", 2, "Island", { kind: "land", types: "Basic Land — Island" });
    const swamp = card("card:111", 2, "Swamp", { kind: "land", types: "Basic Land — Swamp" });
    send(
      state({
        activeSeat: 2,
        battlefield: [island, swamp, ghoul, captain, bears],
        action: {
          ...returned,
          key: "action:3",
          stamp: 3,
          gathered: [
            fetchReport(1, "Flooded Strand", island),
            fetchReport(2, "Polluted Delta", swamp),
          ],
        },
      }),
    );
    expect(c.querySelector(".gs-reveal")!.getAttribute("data-gathered")).toBe("2");
    let ever = false;
    for (let t = 0; t < 5000; t += 100) {
      wait(100);
      ever ||= dimmed(c) || litNow(c).length > 0;
    }
    expect(ever).toBe(false);
  });
});
