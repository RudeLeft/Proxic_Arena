// @vitest-environment jsdom

// Spec 0064 -- the game chat window: Chat and Play log tabs with unread
// counts (F-0064-A), the play log never ahead of the table (F-0064-B, the
// page's half; the worker's and server's halves are PlayLogTest,
// PlayLogKeptTest and the Lab's check-play-log / check-hidden-log), the
// floating window (F-0064-C) and the window of its own (F-0064-D).

import { act, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type LobbyState, type MatchView } from "../lobby";
import { mergePlayLog, reduceMatch, type MatchState, type PlayLogLine } from "../match";
import { CHAT_MIN, clearOf, firstPlace, overlaps, type Rect } from "./chatPlace";
import { POPUP_BLOCKED } from "./GameChat";

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
const lobbyNow = vi.hoisted(() => ({
  lobby: null as unknown as LobbyState,
  sent: [] as unknown[],
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({
    lobby: lobbyNow.lobby,
    setLobby: () => {},
    send: (m: unknown) => lobbyNow.sent.push(m),
  }),
}));

const { GameScreen } = await import("./GameScreen");

const RAIL: Rect = { x: 1600, y: 0, w: 320, h: 947 };
const HAND: Rect = { x: 500, y: 800, w: 900, h: 147 };

beforeEach(() => {
  lobbyNow.lobby = EMPTY_LOBBY;
  lobbyNow.sent = [];
  try {
    window.localStorage.clear();
  } catch {}
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
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 947 });
  // jsdom lays nothing out: the column and the hand are where a 1920 screen has them.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const at = (r: Rect) => new DOMRect(r.x, r.y, r.w, r.h);
    if (this.classList.contains("bf-rail")) return at(RAIL);
    if (this.getAttribute("data-zone") === "viewer:hand") return at(HAND);
    return new DOMRect(0, 0, 0, 0);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
// jsdom has no PointerEvent: a mouse event that carries a pointer id.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
}
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

const bolt = { name: "Lightning Bolt", known: true, id: "card:12", owner: 1, seat: 1 };
const bears = { name: "Grizzly Bears", known: true, id: "card:30", owner: 2, seat: 2 };

function line(
  n: number,
  rev: number,
  kind: string,
  parts: PlayLogLine["parts"],
  extra: Partial<PlayLogLine> = {},
): PlayLogLine {
  return { n, rev, turn: 5, active: 1, step: "Main 1", kind, parts, ...extra };
}

function board(rev: number, playLog: unknown[], stack: unknown[] = [], hand: unknown[] = []) {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "MATCH_SNAPSHOT",
        state: {
          stateRevision: rev,
          gameEpoch: 1,
          turn: 5,
          phase: "MAIN1",
          activeSeat: 1,
          seat: 1,
          players: [
            { seat: 1, name: "Alice", life: 20, handCount: hand.length, libraryCount: 50 },
            { seat: 2, name: "Bob", life: 20, handCount: 6, libraryCount: 50 },
          ],
          battlefield: [{ ...bears, kind: "creature", tapped: false, faceDown: false }],
          hand,
          graveyard: [],
          exile: [],
          stack,
          playLog,
        },
      }),
    ),
  );
}

const TURN = { n: 1, rev: 3, turn: 5, active: 1, step: "Beginning", kind: "turn", parts: [] };
const DRAW = line(2, 3, "draw", [{ player: 1 }, " drew ", bolt], {
  step: "Beginning",
  private: true,
});
const LAND = line(3, 3, "land", [{ player: 1 }, " played a land"]);
const CAST = line(4, 3, "spell", [
  { player: 1 },
  " cast ",
  bolt,
  " targeting ",
  { player: 2 },
  "'s ",
  bears,
]);

const inHand = { ...bolt, kind: "instant", types: "Instant", tapped: false, faceDown: false };

function screen() {
  const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
  board(3, [TURN, DRAW, LAND, CAST], [], [inHand]);
  const chat = () => view.getByRole("complementary", { name: "Game chat" });
  return { view, chat, c: view.container };
}

const open = (chat: HTMLElement) =>
  fireEvent.click(within(chat).getByRole("button", { name: /^Open the game chat/ }));
const tab = (chat: HTMLElement, name: RegExp) => within(chat).getByRole("tab", { name });
const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the play log on the page", () => {
  it("keeps every line once, a reconnect's whole history included, even with an older board", () => {
    const a = line(1, 5, "draw", ["a"]);
    const b = line(2, 6, "land", ["b"]);
    let state = reduceMatch({} as MatchState, {
      type: "MATCH_SNAPSHOT",
      state: { stateRevision: 6, seat: 1, players: [], playLog: [a, b] },
    });
    // The stored board, older than the one on screen, with the whole log.
    state = reduceMatch(state, {
      type: "MATCH_SNAPSHOT",
      state: { stateRevision: 5, seat: 1, players: [], playLog: [a, b, line(3, 6, "x", ["c"])] },
    });
    expect(state.playLog!.map((l) => l.n)).toEqual([1, 2, 3]);
    const many: PlayLogLine[] = Array.from({ length: 2100 }, (_, i) => line(i + 1, 1, "x", []));
    expect(mergePlayLog([], many)).toHaveLength(2000);
  });

  it("shows two tabs; the log reads in turns, with the steps, names you can point at, and life", () => {
    const { chat, c } = screen();
    open(chat());
    expect(tab(chat(), /^Chat/).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tab(chat(), /^Play log/));
    const log = within(chat()).getByRole("log", { name: "Play log" });
    expect(text(log.querySelector(".gs-log-head")!)).toBe("Turn 5 · Aliceyour turn");
    const rows = [...log.querySelectorAll(".gs-log-ent")].map(text);
    expect(rows).toEqual([
      "Alice drew Lightning Bolt (only you were told)",
      "Alice played a land",
      "Alice cast Lightning Bolt targeting Bob's Grizzly Bears",
    ]);
    expect(log.querySelector(".gs-log-step")!.textContent).toBe("Main 1");
    expect(log.querySelectorAll(".gs-log-private")).toHaveLength(1);
    // Pointing at a name shows the card; clicking one on the board opens its close-up.
    const name = within(log).getAllByRole("button", { name: "Grizzly Bears: show the card" })[0]!;
    fireEvent.pointerEnter(name);
    expect(c.querySelector(".gs-log-peek")).not.toBeNull();
    fireEvent.click(name);
    expect(document.querySelector(".gs-inspect")).not.toBeNull();
  });

  it("filters to spells and combat", () => {
    const { chat } = screen();
    open(chat());
    fireEvent.click(tab(chat(), /^Play log/));
    fireEvent.click(within(chat()).getByRole("button", { name: "Spells and combat" }));
    const rows = [...chat().querySelectorAll(".gs-log-ent")].map(text);
    expect(rows).toEqual(["Alice cast Lightning Bolt targeting Bob's Grizzly Bears"]);
    fireEvent.click(within(chat()).getByRole("button", { name: "Everything" }));
    expect(chat().querySelectorAll(".gs-log-ent")).toHaveLength(3);
  });

  it("counts unread: plays in grey while you read the chat, chat in gold while you read the log", () => {
    const { chat, view } = screen();
    open(chat());
    expect(chat().querySelector(".gs-cw-cnt")).toBeNull();
    board(4, [line(5, 4, "damage", [bolt, " dealt 3 damage to ", bears])]);
    board(5, [line(6, 5, "death", [bears, " died"])]);
    const plays = tab(chat(), /^Play log/);
    expect(plays.getAttribute("aria-label")).toBe("Play log, 2 new");
    expect(plays.querySelector(".gs-cw-cnt-grey")!.textContent).toBe("2");
    fireEvent.click(plays);
    expect(tab(chat(), /^Play log/).querySelector(".gs-cw-cnt")).toBeNull();
    // Bob says something while the log is showing.
    lobbyNow.lobby = {
      ...EMPTY_LOBBY,
      gameChat: [
        {
          id: "c1",
          fromUserId: "u-2",
          displayName: "Bob",
          text: "ouch, my bears",
          sentAt: "2026-11-08T12:00:00Z",
        },
      ],
    };
    view.rerender(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const talk = tab(chat(), /^Chat/);
    expect(talk.getAttribute("aria-label")).toBe("Chat, 1 new");
    const gold = talk.querySelector(".gs-cw-cnt")!;
    expect(gold.classList.contains("gs-cw-cnt-grey")).toBe(false);
  });

  it("never shows a line before the table shows its board (HID-005)", () => {
    vi.useFakeTimers();
    const { chat } = screen();
    open(chat());
    fireEvent.click(tab(chat(), /^Play log/));
    // Bob casts: that board is HELD on screen a moment so it can be seen...
    const shock = {
      id: "stack:9",
      description: "Shock",
      name: "Shock",
      controller: 2,
      kind: "spell",
      targets: [],
    };
    board(6, [line(5, 6, "spell", [{ player: 2 }, " cast Shock"])], [shock]);
    // ...and the next board, in which it resolved, arrives at once.
    board(7, [line(6, 7, "damage", ["Shock dealt 2 damage to Alice"])]);
    const rows = () => [...chat().querySelectorAll(".gs-log-ent")].map(text);
    expect(rows()).toContain("Bob cast Shock");
    expect(rows()).not.toContain("Shock dealt 2 damage to Alice");
    act(() => void vi.advanceTimersByTime(1600));
    expect(rows()).toContain("Shock dealt 2 damage to Alice");
  });

  it("scrolls with the game, and offers Jump to latest when you scrolled up", () => {
    const { chat } = screen();
    open(chat());
    fireEvent.click(tab(chat(), /^Play log/));
    const log = within(chat()).getByRole("log", { name: "Play log" });
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 300 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    const jump = within(chat()).getByRole("button", { name: "Jump to latest" });
    fireEvent.click(jump);
    expect(log.scrollTop).toBe(1000);
    expect(within(chat()).queryByRole("button", { name: "Jump to latest" })).toBeNull();
  });
});

describe("the floating window (F-0064-C)", () => {
  it("floats clear of the hand and the column, drags, resizes, and is remembered", () => {
    const { chat, view } = screen();
    open(chat());
    fireEvent.click(within(chat()).getByRole("button", { name: "Float the chat on the table" }));
    const win = () => within(chat()).getByTestId("game-chat-window");
    const at = () => {
      const s = win().style;
      return {
        x: parseFloat(s.left),
        y: parseFloat(s.top),
        w: parseFloat(s.width),
        h: parseFloat(s.height),
      };
    };
    expect(win().classList.contains("gs-cw-floating")).toBe(true);
    expect(overlaps(at(), RAIL) || overlaps(at(), HAND)).toBe(false);
    // Dragged by its top bar onto the column, it slides just clear on release.
    const head = win().querySelector(".gs-cw-head")!;
    const start = at();
    fireEvent.pointerDown(head, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    expect(chat().querySelectorAll(".gs-cw-zone")).toHaveLength(2); // what it keeps clear of, lit
    fireEvent.pointerMove(head, { pointerId: 1, clientX: 1500, clientY: 150 });
    expect(at().x).toBe(start.x + 1400);
    fireEvent.pointerUp(head, { pointerId: 1, clientX: 1500, clientY: 150 });
    const dropped = at();
    expect(overlaps(dropped, RAIL)).toBe(false);
    expect(overlaps(dropped, HAND)).toBe(false);
    expect(dropped.x + dropped.w).toBeLessThanOrEqual(RAIL.x);
    // Resized from its corner, never below the smallest.
    const corner = win().querySelector(".gs-cw-resize")!;
    fireEvent.pointerDown(corner, { pointerId: 2, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(corner, { pointerId: 2, clientX: -2000, clientY: -2000 });
    fireEvent.pointerUp(corner, { pointerId: 2, clientX: -2000, clientY: -2000 });
    expect(at().w).toBe(CHAT_MIN.w);
    expect(at().h).toBe(CHAT_MIN.h);
    const kept = at();
    // Remembered: a new game page opens it there, floating.
    view.unmount();
    const again = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    board(3, [TURN]);
    const aside = again.getByRole("complementary", { name: "Game chat" });
    open(aside);
    const style = within(aside).getByTestId("game-chat-window").style;
    expect({ x: parseFloat(style.left), y: parseFloat(style.top) }).toEqual({
      x: kept.x,
      y: kept.y,
    });
    // ...and the dock button puts it back on the edge.
    fireEvent.click(within(aside).getByRole("button", { name: "Dock the chat on the edge" }));
    expect(within(aside).getByTestId("game-chat-window").classList.contains("gs-cw-docked")).toBe(
      true,
    );
  });

  it("keeps clear by the least move, and gets shorter only when it must", () => {
    const screenBox: Rect = { x: 0, y: 0, w: 1920, h: 947 };
    expect(clearOf({ x: 1500, y: 100, w: 380, h: 500 }, [RAIL, HAND], screenBox).x).toBe(
      1600 - 380 - 8,
    );
    const tall = clearOf({ x: 600, y: 100, w: 380, h: 800 }, [RAIL, HAND], screenBox);
    expect(overlaps(tall, HAND) || overlaps(tall, RAIL)).toBe(false);
    const first = firstPlace(screenBox, [RAIL, HAND]);
    expect(overlaps(first, HAND) || overlaps(first, RAIL)).toBe(false);
    expect(first.h).toBeGreaterThanOrEqual(CHAT_MIN.h);
  });
});

describe("the window of its own (F-0064-D)", () => {
  it("says so plainly when the browser blocks it", () => {
    vi.stubGlobal("open", () => null);
    const { chat } = screen();
    open(chat());
    fireEvent.click(
      within(chat()).getByRole("button", { name: "Open the chat in its own window" }),
    );
    expect(within(chat()).getByRole("alert").textContent).toBe(POPUP_BLOCKED);
  });

  it("draws the same window, chat and log, into its own browser window, and comes back when it closes", () => {
    vi.useFakeTimers();
    // A second window of the same origin: a frame's, which jsdom can give.
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    const popup = {
      document: doc,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    vi.stubGlobal("open", () => popup);
    const { chat } = screen();
    open(chat());
    fireEvent.click(
      within(chat()).getByRole("button", { name: "Open the chat in its own window" }),
    );
    expect(doc.title).toBe("Game chat · Proxic Arena");
    const tabs = [...doc.querySelectorAll('[role="tab"]')];
    expect(tabs.map(text)).toEqual(["Chat", "Play log"]);
    expect(doc.querySelector('input[placeholder="Type a message..."]')).not.toBeNull();
    fireEvent.click(tabs[1]!);
    expect([...doc.querySelectorAll(".gs-log-ent")].map(text)).toContain(
      "Alice cast Lightning Bolt targeting Bob's Grizzly Bears",
    );
    // In step with the game: the next board's line reaches it too.
    board(4, [line(5, 4, "death", [bears, " died"])]);
    expect([...doc.querySelectorAll(".gs-log-ent")].map(text)).toContain("Grizzly Bears died");
    // The table keeps a tab that brings it back.
    expect(
      within(chat()).getByRole("button", {
        name: "The game chat is in its own window: bring it back",
      }),
    ).not.toBeNull();
    popup.closed = true;
    act(() => void vi.advanceTimersByTime(600));
    expect(within(chat()).getByTestId("game-chat-window").classList.contains("gs-cw-docked")).toBe(
      true,
    );
  });
});
