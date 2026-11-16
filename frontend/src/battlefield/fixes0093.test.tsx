// @vitest-environment jsdom

// Spec 0093 -- lands that stay put when tapped, nearer the hand (owner
// 2026-11-16, canvas sections 2 C and 4 L-1). The real game screen, its
// socket replaced, handed the boards and questions the worker sends; the
// lands are clicked as a player clicks them (TEST-003: nothing is handed
// the board as props). F-0093-A..D; layout.test.ts "lands that stay put"
// has the geometry.

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { TAPPED_TILT } from "./layout";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as unknown[][],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (...args: unknown[]) => socket.answers.push(args),
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

const size = { width: 1920, height: 1080 };
beforeEach(() => {
  socket.answers = [];
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
  Element.prototype.animate = function () {
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      playState: "running",
    } as unknown as Animation;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
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

type Land = { id: string; seat: number; name: string; kind: string; types: string } & Record<
  string,
  unknown
>;
const land = (id: number, name: string, seat = 1): Land => ({
  id: `card:${id}`,
  seat,
  name,
  kind: "land",
  types: name === "Dismal Backwater" ? "Land" : `Basic Land — ${name}`,
  known: true,
  enteredAt: id,
});
/** The spec's row, in the order played: Swamp, Island, Swamp, Backwater, Plains, Swamp, Island. */
const ROW = ["Swamp", "Island", "Swamp", "Dismal Backwater", "Plains", "Swamp", "Island"].map(
  (name, i) => land(i + 1, name),
);
const SWAMPS = ROW.filter((c) => c.name === "Swamp").map((c) => c.id);

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(over: Record<string, unknown>) {
  revision += 1;
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 1,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: ROW,
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...over,
    },
  });
}
let asked = 0;
/** The worker's mana question: each land that can still pay, by its id. */
function askMana(ids: readonly string[]) {
  asked += 1;
  send({
    type: "DECISION_REQUEST",
    decisionId: asked,
    actedForSeat: 1,
    stateVersion: revision,
    kind: "applyManaToCost",
    options: ids.map((id) => ({
      actionId: id,
      label: ROW.find((c) => c.id === id)!.name,
      objectId: id,
    })),
    prompt: "Pay {B}{B}{B}",
  });
}
/** A pick question (spec 0070): [left] to pick from, [picked] so far, tapping. */
function askPick(left: readonly string[], picked: readonly string[]) {
  asked += 1;
  send({
    type: "DECISION_REQUEST",
    decisionId: asked,
    actedForSeat: 1,
    stateVersion: revision,
    kind: "CostTapType",
    options: left.map((id) => ({ actionId: `cost:${id}`, label: "a land", objectId: id })),
    prompt: "Tap an untapped land you control.",
    picking: {
      word: "TAP",
      tone: "tap",
      lean: true,
      picked: picked.map((id) => ({ objectId: id, actionId: `unpick:${id}`, label: "a land" })),
    },
  });
}

const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
/** Every land button on the table, by the id it answers for. */
const landButtons = (c: ParentNode) => [
  ...c.querySelectorAll<HTMLElement>('button[data-object-id][data-zone*=":land-"]'),
];
/** Where a button's card is drawn: its place's translate (x, y), and its turn. */
const at = (button: HTMLElement) => {
  const t = button.parentElement!.style.transform;
  const [x, y] = (t.match(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/) ?? []).slice(1).map(Number);
  const rotation = Number(t.match(/rotate\((-?[\d.]+)deg\)/)?.[1] ?? 0);
  return { x: x!, y: y!, rotation };
};
/** Each land on the table (its lead's id) -> where it is drawn. */
const places = (c: ParentNode) =>
  new Map(
    landButtons(c).map((b) => [
      b.dataset["objectId"]!,
      { ...at(b), tapped: b.dataset["tapped"] === "true" },
    ]),
  );
/** The land button drawn at this spot, if any. */
const buttonAt = (c: ParentNode, spot: { x: number; y: number }) =>
  landButtons(c).find((b) => {
    const p = at(b);
    return Math.abs(p.x - spot.x) < 0.01 && Math.abs(p.y - spot.y) < 0.01;
  });
const tappedRow = (tapped: ReadonlySet<string>) =>
  ROW.map((c) => (tapped.has(c.id) ? { ...c, tapped: true } : c));

describe("F-0093-A · three Swamps tapped by clicking the same spot", () => {
  it("each click taps an untapped Swamp, and no untapped pile moves at all", () => {
    const c = open();
    board({});
    askMana(ROW.map((r) => r.id));
    const start = places(c);
    const spot = start.get(SWAMPS[0]!)!;
    const tapped = new Set<string>();
    for (let k = 0; k < 3; k++) {
      // The same spot: it holds an untapped, choosable Swamp.
      const button = buttonAt(c, spot)!;
      expect(button, `click ${k + 1}: something at the spot`).toBeTruthy();
      expect(button.dataset["choosable"]).toBe("true");
      expect(button.dataset["tapped"]).toBe("false");
      fireEvent.click(button);
      const answered = socket.answers.at(-1)![1] as string;
      expect(SWAMPS).toContain(answered);
      expect(tapped.has(answered)).toBe(false);
      tapped.add(answered);
      send({ type: "DECISION_ACCEPTED", decisionId: asked });
      // The game taps it and asks again for the rest.
      board({ battlefield: tappedRow(tapped) });
      askMana(ROW.filter((r) => !tapped.has(r.id)).map((r) => r.id));
      // Every untapped land is exactly where it was.
      const now = places(c);
      for (const [id, p] of now) {
        if (p.tapped) continue;
        expect({ x: p.x, y: p.y }, `${id} after click ${k + 1}`).toEqual({
          x: start.get(id)?.x ?? p.x,
          y: start.get(id)?.y ?? p.y,
        });
      }
      // The tapped Swamps lean, further left than every untapped land.
      const leaning = [...now.values()].filter((p) => p.tapped);
      expect(leaning.length).toBe(1);
      expect(leaning[0]!.rotation).toBe(TAPPED_TILT);
      for (const p of now.values()) if (!p.tapped) expect(leaning[0]!.x).toBeLessThan(p.x);
    }
    expect(tapped).toEqual(new Set(SWAMPS));
    // The Swamps' spot is held empty now (the Island beside it did not slide in).
    expect(buttonAt(c, spot)).toBeUndefined();
  });
});

describe("F-0093-B · the tapped group at the far left; the row tidies up at the untap step", () => {
  it("re-packs once, into arrival order, when that side's turn begins -- not before, not again", () => {
    const c = open();
    board({});
    const start = places(c);
    const tapped = new Set([ROW[0]!.id, ROW[3]!.id]);
    board({ battlefield: tappedRow(tapped) });
    const mid = places(c);
    // The Plains kept its place though the Backwater beside it left.
    expect(mid.get(ROW[4]!.id)).toEqual(start.get(ROW[4]!.id));
    for (const id of tapped)
      for (const [other, p] of mid)
        if (!p.tapped && other !== id) expect(mid.get(id)!.x).toBeLessThan(p.x);
    // The other player's turn: nothing of this row moves.
    board({ battlefield: tappedRow(tapped), turn: 6, activeSeat: 2 });
    expect(places(c)).toEqual(mid);
    // The Backwater is destroyed: its place stays held (the Plains stays put).
    const without = ROW.filter((r) => r.id !== ROW[3]!.id);
    board({
      battlefield: tappedRow(tapped).filter((r) => r.id !== ROW[3]!.id),
      turn: 6,
      activeSeat: 2,
    });
    expect(places(c).get(ROW[4]!.id)).toEqual(start.get(ROW[4]!.id));
    // Their untap step drawn (no tidy-up while it is the UNTAP step itself)...
    board({ battlefield: without, turn: 7, activeSeat: 1, phase: "UNTAP" });
    expect(places(c).get(ROW[4]!.id)).toEqual(start.get(ROW[4]!.id));
    // ...then upkeep: the row re-packs into arrival order, once -- the Plains
    // closes the Backwater's gap, every other land as it began.
    board({ battlefield: without, turn: 7, activeSeat: 1, phase: "UPKEEP" });
    const tidied = places(c);
    expect(tidied.get(ROW[4]!.id)!.x).toBeGreaterThan(start.get(ROW[4]!.id)!.x);
    for (const id of [ROW[0]!.id, ROW[1]!.id]) expect(tidied.get(id)).toEqual(start.get(id));
    // Once: tapping again this turn keeps every other place.
    board({
      battlefield: tappedRow(new Set([ROW[1]!.id])).filter((r) => r.id !== ROW[3]!.id),
      turn: 7,
      activeSeat: 1,
      phase: "MAIN1",
    });
    // (By spot: the Island pile's lead is the second Island now.)
    const spots = new Set([...tidied.values()].map((p) => `${p.x},${p.y}`));
    for (const p of places(c).values()) if (!p.tapped) expect(spots).toContain(`${p.x},${p.y}`);
  });
});

describe("F-0093-C · the row grows left from a 7-card hand's edge, and stays there", () => {
  it("land 1 just left of x 542 at 1920x1080, each later land further left; a hand of any size moves none; the opponent's mirrors it", () => {
    const c = open();
    const theirs = [ROW[0]!, ROW[1]!, ROW[3]!].map((r, i) => ({ ...land(20 + i, r.name, 2) }));
    board({ battlefield: [...[ROW[0]!, ROW[1]!, ROW[3]!], ...theirs] });
    const p = places(c);
    const first = p.get(ROW[0]!.id)!;
    // The card's box ends a lean's room and a gap short of 542 (97.5 px wide).
    expect(first.x + 97.5).toBeGreaterThan(520);
    expect(first.x + 97.5).toBeLessThan(542);
    const mine = [ROW[0]!, ROW[1]!, ROW[3]!];
    expect(p.get(mine[1]!.id)!.x).toBeLessThan(first.x);
    expect(p.get(mine[2]!.id)!.x).toBeLessThan(p.get(mine[1]!.id)!.x);
    // The opponent's: the same x, at the top.
    theirs.forEach((t, i) => {
      expect(p.get(t.id)!.x).toBeCloseTo(p.get(mine[i]!.id)!.x, 6);
      expect(p.get(t.id)!.y).toBeLessThan(540);
    });
    // Drawing cards: no land moves.
    const hand = Array.from({ length: 9 }, (_, i) => ({
      id: `card:${60 + i}`,
      seat: 1,
      name: "Grizzly Bears",
      kind: "creature",
      types: "Creature — Bear",
      known: true,
    }));
    for (const n of [1, 4, 7, 9]) {
      board({ battlefield: [...[ROW[0]!, ROW[1]!, ROW[3]!], ...theirs], hand: hand.slice(0, n) });
      expect(places(c)).toEqual(p);
    }
  });
});

describe("F-0093-D · picking a land to pay (0070) moves only that land", () => {
  it("picked, it leans at the row's far left; clicked again it is taken back, to its own place", () => {
    const c = open();
    board({});
    const all = ROW.map((r) => r.id);
    askPick(all, []);
    const start = places(c);
    const plains = ROW[4]!.id;
    fireEvent.click(landButtons(c).find((b) => b.dataset["objectId"] === plains)!);
    expect(socket.answers.at(-1)).toEqual([asked, `cost:${plains}`]);
    askPick(
      all.filter((id) => id !== plains),
      [plains],
    );
    const picked = places(c);
    for (const [id, p] of picked)
      if (id !== plains) expect(p, `${id} while the Plains is picked`).toEqual(start.get(id));
    expect(picked.get(plains)!.rotation).toBe(TAPPED_TILT);
    for (const [id, p] of picked)
      if (id !== plains) expect(picked.get(plains)!.x).toBeLessThan(p.x);
    // A click on it in the tapped group takes it back.
    fireEvent.click(landButtons(c).find((b) => b.dataset["objectId"] === plains)!);
    expect(socket.answers.at(-1)).toEqual([asked, `unpick:${plains}`]);
    askPick(all, []);
    expect(places(c)).toEqual(start);
  });
});
