// @vitest-environment jsdom

// Spec 0097 (owner 2026-11-16) -- the pop-ups clean-up, on the page: no stuck
// notices (F-0097-A), the auto-passed turn on the act button (F-0097-B), a
// refused attack or name said where the player acted (F-0097-D), and no
// "Bob is casting a spell…" caption (F-0097-E). The real game screen, its
// socket replaced, handed the boards and questions the worker sends; the
// notice stack on its own for the pointer.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { NoticeStack } from "../NoticeStack";
import { type Notice } from "../notices";

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
  Element.prototype.animate = function () {
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
  matchId: "m-1",
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
function message(frame: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, frame)));
}
function state(over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 5,
    phase: "MAIN1",
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
    notices: [],
    ...over,
  };
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
const notes = (c: HTMLElement) => [...c.querySelectorAll(".pa-note")].map((n) => n.textContent);

// --- F-0097-A: no stuck notices ---------------------------------------------------------

describe("F-0097-A · a notice is never stuck", () => {
  const news = (close: () => void): Notice => ({
    key: "news-1",
    tone: "gold",
    label: "Invitation",
    title: "Pat declined",
    actions: [],
    close,
    fadeMs: 8000,
  });
  // Spec 0124: the game's grey notices are gone; a second piece of news
  // proves the same (the fade after a close under the pointer).
  const said = (close: () => void): Notice => ({
    key: "news-2",
    tone: "gold",
    label: "Invitation",
    title: "A later notice",
    actions: [],
    fadeMs: 8000,
    close,
  });

  function closeUnderThePointer(leftFirst: boolean) {
    let list: Notice[] = [];
    const view = () => (
      <div>
        <div id="board">board</div>
        <NoticeStack notices={list} place="table" />
      </div>
    );
    const r = render(view());
    const set = (next: Notice[]) => {
      list = next;
      r.rerender(view());
    };
    set([news(() => set([]))]);
    const board = r.container.querySelector("#board")!;
    const card = r.container.querySelector("[data-notice='news-1']")!;
    // The pointer goes onto the invitation...
    fireEvent.mouseOut(board, { relatedTarget: card });
    fireEvent.mouseOver(card, { relatedTarget: board });
    if (leftFirst) {
      fireEvent.mouseOut(card, { relatedTarget: board });
      fireEvent.mouseOver(board, { relatedTarget: card });
    }
    // ...and its × closes it under the pointer: no mouseleave ever comes.
    fireEvent.click(r.container.querySelector(".pa-note-close")!);
    set([said(() => set([]))]);
    act(() => {
      vi.advanceTimersByTime(8100);
    });
    return r.container.textContent ?? "";
  }

  it("an invitation closed under the pointer, then another notice: it fades", () => {
    expect(closeUnderThePointer(false)).not.toContain("A later notice");
  });

  it("the same when the pointer had left first", () => {
    expect(closeUnderThePointer(true)).not.toContain("A later notice");
  });

  it("pointing at a notice still holds it while it is there", () => {
    let list: Notice[] = [];
    const view = () => <NoticeStack notices={list} place="page" />;
    const r = render(view());
    list = [news(() => {})];
    r.rerender(view());
    let gone = false;
    list = [news(() => (gone = true))];
    r.rerender(view());
    fireEvent.mouseOver(r.container.querySelector("[data-notice='news-1']")!);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(gone).toBe(false);
    fireEvent.mouseLeave(r.container.querySelector(".pa-notes")!);
    act(() => {
      vi.advanceTimersByTime(8100);
    });
    expect(gone).toBe(true);
  });

  it("F-0124-E: the game's own words are never a grey notice on the game screen", () => {
    // Spec 0124 (owner Q4 "Remove both"): an older worker's line, before the
    // first turn and after it, is shown nowhere at the top right.
    const c = open();
    send(state({ turn: 0, notices: ["Every copy of Darkpact was taken out"], noticesTotal: 1 }));
    send(
      state({ notices: ["Every copy of Darkpact was taken out", "A new one"], noticesTotal: 2 }),
    );
    expect(notes(c)).toEqual([]);
    expect(c.textContent).not.toContain("Darkpact");
  });
});

// --- F-0097-B: the auto-passed turn on the act button ------------------------------------

describe("F-0097-B · your turn passing for you: the act button says why", () => {
  const passing = { turn: 5, why: "2 lands, no land in hand" };

  it("Passing / Nothing to play: 2 lands, no land in hand; nothing top right", () => {
    const c = open();
    send(state({ passing }));
    const act = c.querySelector<HTMLElement>("[data-passing]")!;
    expect(act).not.toBeNull();
    expect(act.textContent).toContain("Passing");
    expect(act.textContent).toContain("Nothing to play: 2 lands, no land in hand");
    expect(notes(c)).toEqual([]);
    expect(c.textContent).not.toContain("Nothing you can play");
  });

  it("gone at the turn line: a step into Bob's turn takes it away before any board", () => {
    const c = open();
    send(state({ passing }));
    expect(c.querySelector("[data-passing]")).not.toBeNull();
    message({
      type: "MATCH_STEP",
      state: { turn: 6, phase: "UPKEEP", activeSeat: 2, gameEpoch: 1 },
    });
    expect(c.querySelector("[data-passing]")).toBeNull();
  });

  it("an attack you can still make is the button's (the question wins)", () => {
    const c = open();
    const bears = {
      id: "card:31",
      seat: 1,
      owner: 1,
      name: "Grizzly Bears",
      kind: "creature",
      types: "Creature — Bear",
      tapped: false,
      faceDown: false,
      known: true,
      power: 2,
      toughness: 2,
    };
    send(state({ passing, phase: "COMBAT_DECLARE_ATTACKERS", battlefield: [bears] }));
    message({
      type: "DECISION_REQUEST",
      decisionId: 40,
      actedForSeat: 1,
      authorisedSeat: 1,
      kind: "declareAttackers",
      stateVersion: revision,
      options: [{ actionId: "attacker:card:31", label: "Grizzly Bears", objectId: "card:31" }],
    });
    expect(c.querySelector("[data-passing]")).toBeNull();
    expect(c.querySelector(".gs-act-combat")).not.toBeNull();
  });

  it("another seat's board never says it (a spectator, or not your turn)", () => {
    const c = open();
    send(state({ passing, activeSeat: 2 }));
    expect(c.querySelector("[data-passing]")).toBeNull();
  });
});

// --- F-0097-D: a refusal where the player acted -------------------------------------------

describe("F-0097-D · a refused attack or name is said where you acted", () => {
  const bears = {
    id: "card:31",
    seat: 1,
    owner: 1,
    name: "Grizzly Bears",
    kind: "creature",
    types: "Creature — Bear",
    tapped: false,
    faceDown: false,
    known: true,
    power: 2,
    toughness: 2,
  };
  const ruled =
    "That attack breaks a rule: a creature must attack, or one can't attack alone. Change your attackers.";

  it("the attack the rules refused: under the combat button, no grey notice", () => {
    const c = open();
    send(
      state({ phase: "COMBAT_DECLARE_ATTACKERS", battlefield: [{ ...bears, attacking: true }] }),
    );
    message({
      type: "DECISION_REQUEST",
      decisionId: 41,
      actedForSeat: 1,
      authorisedSeat: 1,
      kind: "declareAttackers",
      stateVersion: revision,
      options: [{ actionId: "unattack:card:31", label: "Stop attacking with Grizzly Bears" }],
      refused: ruled,
    });
    const note = c.querySelector(".gs-combat .gs-combat-notice");
    expect(note?.textContent).toBe(ruled);
    expect(notes(c)).toEqual([]);
  });

  it("asked again without a refusal: no note", () => {
    const c = open();
    send(state({ phase: "COMBAT_DECLARE_ATTACKERS", battlefield: [bears] }));
    message({
      type: "DECISION_REQUEST",
      decisionId: 42,
      actedForSeat: 1,
      authorisedSeat: 1,
      kind: "declareAttackers",
      stateVersion: revision,
      options: [{ actionId: "attacker:card:31", label: "Grizzly Bears", objectId: "card:31" }],
    });
    expect(c.querySelector(".gs-combat-notice")).toBeNull();
  });

  it("a name the card won't take: in red, in the naming window asking again", () => {
    const c = open();
    send(state({ stack: [] }));
    message({
      type: "DECISION_REQUEST",
      decisionId: 43,
      actedForSeat: 1,
      authorisedSeat: 1,
      kind: "chooseCardName",
      stateVersion: revision,
      mandatory: true,
      searchable: true,
      optionCount: 30000,
      options: [],
      about: { name: "Pithing Needle", kind: "card" },
      arrange: { name: { title: "Name a card", objects: [] } },
      refused: "Forest can't be named here. Try another card.",
    });
    const refused = c.querySelector<HTMLElement>(".gs-name-refused");
    expect(refused?.textContent).toBe("Forest can't be named here. Try another card.");
    expect(refused?.getAttribute("role")).toBe("alert");
    expect(notes(c)).toEqual([]);
  });
});

// --- F-0097-E: no casting caption ---------------------------------------------------------

describe("F-0097-E · Bob's rising back has no caption", () => {
  it("a back, named for a screen reader, with no words under it", () => {
    const c = open();
    send(state({ otherHands: [] }));
    send(
      state({
        activeSeat: 2,
        casting: [
          {
            id: "card:75",
            seat: 2,
            owner: 2,
            name: "",
            kind: "other",
            types: "",
            tapped: false,
            faceDown: true,
            known: false,
          },
        ],
      }),
    );
    const cast = c.querySelector<HTMLElement>(".gs-cast");
    expect(cast).not.toBeNull();
    expect(cast!.querySelector(".gs-cast-back")).not.toBeNull();
    expect(cast!.textContent).not.toContain("is casting a spell");
    expect(c.querySelector(".gs-cast-caption")).toBeNull();
  });
});
