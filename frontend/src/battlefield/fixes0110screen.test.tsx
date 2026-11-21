// @vitest-environment jsdom

// Spec 0110 -- the card being cast waits at the stack's next slot, big, for
// the whole cast and for either seat. The real game screen, its socket
// replaced, handed the frames the worker sent each seat in a Lab game (Lab
// check-modes.py escalate, cut into fixes0110.round.json): Alice casts
// Collective Brutality (two modes, escalated), aims it at Bob's Grizzly
// Bears (alone in its line, so in the middle of the table, where the old
// middle card covered it) and at Bob, and pays with Swamps and a discard.
//
// F-0110-B: the card is at castingStackBox for the target and payment
//   questions and between them; the aim line starts from it; spec 0091's
//   step aside still fires for a card under it that is tapped (the Lab
//   board, with a line of creatures added so one stands under it).
//   The mode questions come while the board still has the card in the hand
//   (RUN: no `casting` entry until the modes are chosen), so no big card is
//   drawn for them, as before.
// F-0110-C: see-through at the new place (a stack entry pointed at under it
//   fades the card); a real click on the Bears answers the target question.
// F-0110-D: spec 0109's short target window (F-0109-A's case) is beside the
//   card, not over it.
// F-0110-G: Bob's view of Alice's cast (and a spectator's): the back, the
//   flip and the hold are at the same castingStackBox, never the middle; the
//   face is not drawn before the commit (spec 0044).

import { act, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { FLIP_MS, HOLD_MS } from "./CastingCard";
import { geometry as layoutGeometry, type Box } from "./layout";
import { BALLS_LONGEST_MS } from "./manaBalls";
import { castingStackBox } from "./stepAside";

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
const ROUND = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixes0110.round.json"), "utf8"),
) as { seat1: Rec[]; seat2: Rec[] };
const snaps = (seat: Rec[]) => seat.filter((f) => f["type"] === "MATCH_SNAPSHOT");
const asks = (seat: Rec[]) => seat.filter((f) => f["type"] === "DECISION_REQUEST");
const revOf = (f: Rec) => (f["state"] as Rec)["stateRevision"] as number;
/** Alice's frames: the board before (rev 77), then rev 80..85. */
const A = Object.fromEntries(snaps(ROUND.seat1).map((f) => [revOf(f), f]));
const B = Object.fromEntries(snaps(ROUND.seat2).map((f) => [revOf(f), f]));
const Q = Object.fromEntries(asks(ROUND.seat1).map((f) => [f["kind"] as string, f]));
const askOf = (kind: string, n = 0) => asks(ROUND.seat1).filter((f) => f["kind"] === kind)[n]!;

const size = { width: 1920, height: 947 };
const g = layoutGeometry(size);
const place = castingStackBox(g, 0);

let played: { el: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
let reduce = false;
beforeEach(() => {
  socket.answered = [];
  played = [];
  reduce = false;
  window.sessionStorage.clear();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
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
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options?: unknown) {
    played.push({ el: this, frames, options: options ?? {} });
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
  get: () => size.width,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => size.height,
});
// jsdom lays nothing out: a box is what its inline style says.
const styleBox = (el: Element) => {
  const s = (el as HTMLElement).style;
  return {
    x: parseFloat(s.left) || 0,
    y: parseFloat(s.top) || 0,
    w: parseFloat(s.width) || 0,
    h: parseFloat(s.height) || 0,
  };
};
Element.prototype.getBoundingClientRect = function (this: Element) {
  const { x, y, w, h } = styleBox(this);
  return {
    x,
    y,
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  };
};

const match = {
  matchId: "m-110",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

function frame(f: Rec) {
  act(() => socket.onState!((previous) => reduceMatch(previous, f)));
}
const open = (me = "u-1") =>
  render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
const castCard = (c: ParentNode) => c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
const near = (a: { x: number; y: number }, b: { x: number; y: number }, by = 0.5) =>
  Math.abs(a.x - b.x) <= by && Math.abs(a.y - b.y) <= by;
const atPlace = (el: Element | null, box: Box = place) => {
  expect(el).not.toBeNull();
  const b = styleBox(el!);
  expect(b.x).toBeCloseTo(box.x, 3);
  expect(b.y).toBeCloseTo(box.y, 3);
  expect(b.w).toBeCloseTo(box.w, 3);
  expect(b.h).toBeCloseTo(box.h, 3);
};
/** The board's Grizzly Bears: where its slot is drawn (the board moves slots by transform). */
const slotBox = (c: ParentNode, id: string) => {
  const slot = c
    .querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!
    .closest<HTMLElement>(".bf-slot")!;
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(slot.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: g.cardW, h: g.cardH };
};
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function pointerAt(target: EventTarget, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX, clientY }));
  });
}

describe("F-0110-B · Alice's Collective Brutality, from a Lab game: at the stack spot for the whole cast", () => {
  it("modes (no casting entry yet: no big card), targets, payment: at castingStackBox each time; the aim line starts there", () => {
    const c = open();
    frame(A[77]!);
    // The mode questions: the board still has the card in her hand.
    frame(Q["chooseModeForAbility"]!);
    expect(castCard(c)).toBeNull();
    // Modes chosen: the card is being cast, the first target asked.
    frame(A[80]!);
    frame(askOf("chooseTargetsFor", 0));
    const card = castCard(c)!;
    expect(card.getAttribute("aria-label")).toBe("Being cast: Collective Brutality");
    atPlace(card);
    // Never over the middle of the table, where Bob's Bears stand.
    const bears = slotBox(c, "card:70");
    expect(bears.x + bears.w / 2).toBeCloseTo(g.play.w / 2, -1);
    expect(overlaps(styleBox(card), bears)).toBe(false);
    // The aim line: from the card at its place, to the pointer on the table.
    const svg = c.querySelector('[data-testid="aim-pointer"]');
    expect(svg).not.toBeNull();
    pointerAt(window, 300, 300);
    const d = c.querySelector(".bf-pointer-beam path")!.getAttribute("d")!;
    const [sx, sy] = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d)!.slice(1).map(Number) as [number, number];
    // It leaves the card's own edge (its left or top, toward the pointer).
    expect(sx).toBeGreaterThanOrEqual(place.x - 0.5);
    expect(sx).toBeLessThanOrEqual(place.x + place.w + 0.5);
    expect(sy).toBeGreaterThanOrEqual(place.y - 0.5);
    expect(sy).toBeLessThanOrEqual(place.y + place.h + 0.5);
    expect(
      near({ x: sx, y: sy }, { x: place.x, y: sy }) ||
        near({ x: sx, y: sy }, { x: sx, y: place.y }),
    ).toBe(true);
    // The second target (Bob), between questions, then each payment.
    frame(A[81]!);
    frame(askOf("chooseTargetsFor", 1));
    atPlace(castCard(c));
    frame(A[82]!);
    frame(askOf("applyManaToCost", 0));
    atPlace(castCard(c));
    frame(A[83]!);
    frame(askOf("applyManaToCost", 1));
    atPlace(castCard(c));
    frame(A[84]!);
    frame(Q["CostDiscard"]!);
    atPlace(castCard(c));
    // Cast: it settles into its stack slot from its place, a short straight move.
    frame(A[85]!);
    // Its last mana's ball is drawn but never lands here (no animation
    // finishes in jsdom): it waits BALLS_LONGEST_MS at most (spec 0062), then goes.
    act(() => void vi.advanceTimersByTime(BALLS_LONGEST_MS + 500));
    // Then it waits DECIDE_MS (spec 0042, owner 2026-11-01 item 2) and sets off.
    act(() => void vi.advanceTimersByTime(300));
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving");
    atPlace(leaving);
    const settle = played.filter(
      (p) => p.el === leaving && p.frames.some((f) => String(f.transform).includes("translate")),
    );
    expect(settle).toHaveLength(1);
    expect(settle[0]!.frames).toHaveLength(2);
    expect(String(settle[0]!.frames[0]!.transform)).toContain("translate(0px, 0px)");
  });

  it("spec 0091's step aside still fires for a card under it that is tapped", () => {
    const c = open();
    // The Lab board, with a line of Alice's creatures added so the last one
    // (an Elf with a mana ability) stands under the card at the stack spot.
    const crowd = Array.from({ length: 16 }, (_, i) => ({
      id: `card:${500 + i}`,
      seat: 1,
      owner: 1,
      name: i === 15 ? "Llanowar Elves" : `Bystander ${i}`,
      kind: "creature",
      types: "Creature",
      power: 1,
      toughness: 1,
      tapped: false,
      faceDown: false,
      known: true,
    }));
    const withCrowd = (f: Rec, tapElf = false, pay: Rec | null = null): Rec => {
      const s = f["state"] as Rec;
      return {
        ...f,
        state: {
          ...s,
          battlefield: [
            ...(s["battlefield"] as Rec[]),
            ...crowd.map((p) => (tapElf && p.id === "card:515" ? { ...p, tapped: true } : p)),
          ],
          payments: [...((s["payments"] as Rec[]) ?? []), ...(pay ? [pay] : [])],
        },
      };
    };
    frame(withCrowd(A[77]!));
    frame(withCrowd(A[82]!));
    frame(askOf("applyManaToCost", 0));
    const elf = slotBox(c, "card:515");
    const card = castCard(c)!;
    expect(overlaps(styleBox(card), elf)).toBe(true);
    const before = played.length;
    // The Elf tapped for the {1}: its ball flies, the card steps aside.
    const s82 = A[82]!["state"] as Rec;
    frame(
      withCrowd({ ...A[82]!, state: { ...s82, stateRevision: 90 } }, true, {
        n: 9,
        seat: 1,
        payment: 2,
        for: "card:36",
        kind: "cast",
        cost: "{1}{B}",
        owing: "{B}",
        mana: [{ colour: "G", from: "card:515" }],
      }),
    );
    const step = played
      .slice(before)
      .find((p) => p.el === castCard(c) && p.frames.length === 4 && "offset" in p.frames[1]!);
    expect(step).toBeDefined();
    expect(castCard(c)!.dataset["stepAside"]).toBe("aside");
    // Up and off the Elf (it is below its middle), never into the rail.
    const away = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
      String(step!.frames[1]!.transform),
    )!;
    expect(Number(away[2])).toBeLessThan(0);
    expect(place.x + place.w + Number(away[1])).toBeLessThanOrEqual(g.play.w);
  });
});

describe("F-0110-C · see-through at the stack spot; a click on the creature the old card covered", () => {
  it("a stack entry pointed at under the card fades it; the Bears, under the old middle card, answer the target", () => {
    const c = open();
    // An entry already on the stack (Bob's Bears' spell as an example from the
    // same game is not on it: the Lab board's stack is empty, so one is added).
    const s80 = A[80]!["state"] as Rec;
    frame(A[77]!);
    frame({
      ...A[80]!,
      state: {
        ...s80,
        stack: [{ id: "stack:9", source: "card:999", name: "Shock", controller: 2, kind: "spell" }],
      },
    });
    frame(askOf("chooseTargetsFor", 0));
    const card = castCard(c)!;
    atPlace(card, castingStackBox(g, 1));
    const entry = c.querySelector<HTMLElement>('button[data-zone="stack"]')!;
    expect(entry).not.toBeNull();
    expect(card.dataset["seeThrough"]).toBeUndefined();
    const box = castingStackBox(g, 1);
    pointerAt(entry, box.x + box.w / 2, box.y + box.h / 2);
    expect(card.dataset["seeThrough"]).toBe("true");
    // Off it, on the empty table: solid again.
    pointerAt(c.querySelector('[data-testid="battlefield"]')!, 300, 300);
    expect(card.dataset["seeThrough"]).toBeUndefined();
    // The Bears: a click answers the target question (the button itself, the
    // real screen's own handler: nothing handed to the board).
    const bears = c.querySelector<HTMLButtonElement>('button[data-object-id="card:70"]')!;
    expect(bears.dataset["choosable"]).toBe("true");
    fireEvent.click(bears);
    expect(socket.answered).toContain("target:card:70");
  });
});

describe("F-0110-D · spec 0109's short target window, beside the card at its new place", () => {
  it("Victim of Night at Gryff Vanguard (F-0109-A's case): one short line, the window not over the card", () => {
    const c = open();
    const a80 = A[80]!["state"] as Rec;
    const victim = {
      id: "card:36",
      seat: 1,
      owner: 1,
      name: "Victim of Night",
      kind: "instant",
      types: "Instant",
      manaCost: "{1}{B}{B}",
      tapped: false,
      faceDown: false,
      known: true,
    };
    frame({ ...A[80]!, state: { ...a80, casting: [victim] } });
    frame({
      ...askOf("chooseTargetsFor", 0),
      prompt: "Victim of Night: Destroy target non-Vampire, non-Werewolf, non-Zombie creature.",
      about: { name: "Victim of Night", kind: "spell", from: "hand" },
      arrange: { targets: { chosen: [], enough: false, more: 1, cancel: "target:cancel" } },
    });
    const lines = [...c.querySelectorAll<HTMLElement>(".gs-bubble .gs-win-prompt")].map(
      (p) => p.textContent,
    );
    expect(lines).toEqual(["Choose a creature that isn't a Vampire, Werewolf or Zombie."]);
    const bubble = c.querySelector<HTMLElement>(".gs-bubble")!;
    const b = styleBox(bubble);
    const card = styleBox(castCard(c)!);
    expect(bubble.dataset["side"]).toBe("left");
    expect(b.x + b.w).toBeLessThanOrEqual(card.x);
  });
});

describe("F-0110-G · Bob's view of Alice's cast, and a spectator's: the same stack spot", () => {
  const bobFrames = (spectator: boolean) =>
    [77, 80, 81, 82, 83, 84].map((rev) => {
      const f = B[rev]!;
      const s = f["state"] as Rec;
      return spectator
        ? { ...f, state: { ...s, spectator: true, viewFrom: 2, seat: 0, hand: [] } }
        : f;
    });
  for (const spectator of [false, true]) {
    it(`${spectator ? "a spectator" : "Bob"}: the back waits at castingStackBox, flips and is held there, never the middle`, () => {
      const c = open(spectator ? "u-3" : "u-2");
      const frames = bobFrames(spectator);
      frame(frames[0]!);
      played = [];
      frame(frames[1]!);
      const back = castCard(c)!;
      expect(back.querySelector(".gs-cast-back")).not.toBeNull();
      // The face is not drawn while it is paid for (spec 0044).
      expect(back.textContent).not.toContain("Collective Brutality");
      expect(back.querySelector(".gs-cast-picture, .gs-cast-plain")).toBeNull();
      atPlace(back);
      // It rose to it (spec 0072's Glide), ending there.
      const rise = played.find((p) => p.el === back);
      expect(rise).toBeDefined();
      const end = /translate\((-?[\d.e-]+)px,\s*(-?[\d.e-]+)px\)/.exec(
        String(rise!.frames.at(-1)!.transform),
      )!;
      expect(Number(end[1])).toBeCloseTo(0, 3);
      expect(Number(end[2])).toBeCloseTo(0, 3);
      for (const f of frames.slice(2)) {
        frame(f);
        atPlace(castCard(c));
        expect(castCard(c)!.querySelector(".gs-cast-picture, .gs-cast-plain")).toBeNull();
      }
      // Committed (on the stack): it turns over AT the stack spot and is held there.
      const s85 = B[85]!["state"] as Rec;
      frame(
        spectator
          ? { ...B[85]!, state: { ...s85, spectator: true, viewFrom: 2, seat: 0, hand: [] } }
          : B[85]!,
      );
      // Its balls fly to the back and never land here (jsdom): BALLS_LONGEST_MS at most.
      act(() => void vi.advanceTimersByTime(BALLS_LONGEST_MS + 500));
      const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving")!;
      expect(leaving.querySelector(".gs-cast-turn")).not.toBeNull();
      atPlace(leaving);
      const moves = () =>
        played.filter(
          (p) =>
            p.el === leaving && p.frames.some((f) => String(f.transform).includes("translate")),
        );
      act(() => void vi.advanceTimersByTime(FLIP_MS + HOLD_MS - 10));
      expect(moves()).toHaveLength(0);
      act(() => void vi.advanceTimersByTime(20));
      expect(moves()).toHaveLength(1);
      atPlace(leaving);
    });
  }
});
