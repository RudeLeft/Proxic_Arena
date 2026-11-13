// @vitest-environment jsdom

// Spec 0082 -- copies versus cast copies (owner: C · copy versus
// cast-a-copy, following Magic's own rule), F-0082-A..E. The real game
// screen, its socket replaced, is handed the boards the worker sends:
//
// - a copy put straight onto the stack (storm, Fork, a Strionic Resonator's
//   copy of a trigger) is on its way in `copying` -- never in `casting` --
//   while it is asked "new target?" (`aiming`) and while the game holds it;
//   on the stack it carries its batch (`group`) and the id it had on its way
//   (`copyingId`);
// - a prepared creature names its prepared spell (`prepared`), which waits
//   face up in exile, a copy of the creature (`copy`, `copyOf`); cast, it is
//   a copy on the stack and ends "nowhere".

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState, type Snapshot } from "../match";
import { BESIDE, copyKey, preparedMarkBox } from "./copies";
import { boardFromSnapshot, exilePile } from "./fromSnapshot";
import { geometry as layoutGeometry } from "./layout";
import { castOrigin } from "./theirCast";

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

type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  rate: number[];
  done: () => void;
};
const size = { width: 1920, height: 947 };
let animations: Recorded[] = [];
let reduce = false;
beforeEach(() => {
  animations = [];
  reduce = false;
  // The other player's spell is held on screen a moment (GameScreen's
  // HOLD_MS) before the next board is drawn; peels land on timers.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduce : false,
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
      rate: [],
      done: () => {},
    };
    animations.push(record);
    const animation = {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: {
        getComputedTiming: () => ({
          endTime: Number(record.options.duration ?? 0) + Number(record.options.delay ?? 0),
          iterations: record.options.iterations ?? 1,
        }),
      },
      updatePlaybackRate: (rate: number) => record.rate.push(rate),
    } as unknown as Animation;
    record.done = () => (animation.onfinish as (() => void) | null)?.();
    return animation;
  };
  (Element.prototype as { getAnimations?: unknown }).getAnimations = function (this: Element) {
    return animations
      .filter((a) => this.contains(a.element))
      .map((a) => ({
        playState: "running",
        currentTime: 0,
        playbackRate: 1,
        cancel() {},
        effect: {
          getComputedTiming: () => ({
            endTime: Number(a.options.duration ?? 0),
            iterations: a.options.iterations ?? 1,
          }),
        },
        updatePlaybackRate: (rate: number) => a.rate.push(rate),
      }));
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

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
/** Time passes (a held board lets the next be drawn; peels land). */
function wait(ms = 1600) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
function state(seat: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 5,
    phase: "MAIN1",
    activeSeat: 1,
    seat,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 4, libraryCount: 41 },
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
function open(me = "u-1") {
  return render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
}

// --- the storm, as the worker sends it (Lab trace copies-storm-split) --------------------

const BOB = { player: 2 };
const BEARS = { object: "card:79" };
const GROUP = "copies:250";
const trigger = {
  id: "stack:11",
  source: "card:44",
  name: "Grapeshot",
  controller: 1,
  kind: "trigger",
  targets: [],
  description: "Storm: copy Grapeshot for each spell cast before it this turn.",
};
const grape = {
  id: "stack:10",
  source: "card:44",
  name: "Grapeshot",
  controller: 1,
  kind: "spell",
  targets: [BOB],
  manaCost: "{1}{R}",
  description: "Grapeshot deals 1 damage to Bob.",
};
/** Copy k (0..3): card:124..121, made in that order, on the stack as stack:12..15. */
const copyCard = (k: number) => `card:${124 - k}`;
const coming = (k: number, target: unknown, aiming = false) => ({
  id: `copying:${265 - 5 * k}`,
  source: copyCard(k),
  name: "Grapeshot",
  owner: 1,
  controller: 1,
  kind: "spell",
  manaCost: "{1}{R}",
  description: "Grapeshot",
  copy: true,
  copyOf: "stack:10",
  group: GROUP,
  targets: aiming ? [] : [target],
  ...(aiming ? { aiming: true } : {}),
});
const landed = (k: number, target: unknown) => ({
  id: `stack:${12 + k}`,
  source: copyCard(k),
  name: "Grapeshot",
  controller: 1,
  kind: "spell",
  manaCost: "{1}{R}",
  description: "Grapeshot",
  copy: true,
  copyOf: "stack:10",
  group: GROUP,
  copyingId: `copying:${265 - 5 * k}`,
  targets: [target],
});
/** The boards a seat is sent while the storm copies are made, one per "new target?". */
function stormBoards(seat: number, aims: unknown[]) {
  const out: Record<string, unknown>[] = [state(seat, { stack: [trigger, grape] })];
  for (let k = 0; k < 4; k++)
    out.push(
      state(seat, {
        stack: [trigger, grape],
        copying: [...aims.slice(0, k).map((t, j) => coming(j, t)), coming(k, aims[k], true)],
      }),
    );
  out.push(state(seat, { stack: [...aims.map((t, k) => landed(k, t)), grape] }));
  out.push(
    state(seat, {
      stack: [...aims.slice(1).map((t, k) => landed(k + 1, t)), grape],
      moves: [{ card: copyCard(0), from: { zone: "stack", seat: 1 }, to: { zone: "nowhere" } }],
    }),
  );
  return out;
}

const numbers = (text: string) =>
  (text.replace("translate3d", "translate").match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
const slotOf = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`[data-object-id="${id}"]`)?.closest<HTMLElement>(".bf-slot") ??
  null;
const waitingSlots = (c: ParentNode) => [
  ...c.querySelectorAll<HTMLElement>('.bf-stack-slot[data-waiting="true"]'),
];
/** A stack slot's top left and scale, from its own transform. */
const placed = (slot: HTMLElement) => {
  const [x, y, , s] = numbers(slot.style.transform) as [number, number, number, number];
  return { x, y, s };
};
const runsOn = (el: Element) => animations.filter((a) => a.element === el);
const castCard = (c: ParentNode) => c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
const isGlow = (a: Recorded) => String(a.frames[1]?.filter ?? "").includes("drop-shadow");

// --- F-0082-A · storm --------------------------------------------------------------------

describe("F-0082-A · Grapeshot storm 4: copies peel off and wait beside it, ×N counts up, one card to the end", () => {
  it("the game's boards: copies on their way are one card counting up, then the same card on the stack", () => {
    const boards = stormBoards(1, [BOB, BOB, BOB, BOB]).map(
      (s) => reduceMatch({ ...EMPTY_STATE }, { type: "MATCH_SNAPSHOT", state: s }).board!,
    );
    let previous: Snapshot | null = null;
    const counts: number[] = [];
    const keys = new Set<string>();
    for (const b of boards) {
      const data = boardFromSnapshot(b, previous);
      previous = b;
      // Nothing is ever "being cast".
      expect(b.casting).toEqual([]);
      for (const w of data.copying) {
        counts.push(w.count ?? 1);
        keys.add(w.key!);
        expect(w.waiting).toBe(true);
        expect(w.copyOf).toBe("stack:10");
      }
      for (const s of data.stack) if (s.copy) keys.add(s.key!);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
    // The one being aimed joins the card before it; on the stack the same key.
    expect([...keys].filter((k) => !k.endsWith("|aiming"))).toEqual([
      `${GROUP}|${JSON.stringify([BOB])}`,
    ]);
    const onStack = boardFromSnapshot(boards[5]!, boards[4]!).stack[0]!;
    expect(onStack.things).toEqual([copyCard(0), copyCard(1), copyCard(2), copyCard(3)]);
  });

  it("Alice's seat: nothing goes to the middle; the card peels off Grapeshot, waits beside it, counts 1 -> 4, lands, ticks down -- one element", () => {
    const c = open();
    const boards = stormBoards(1, [BOB, BOB, BOB, BOB]);
    send({ type: "MATCH_SNAPSHOT", state: boards[0] });
    const original = placed(slotOf(c, "stack:10")!);
    animations = [];
    send({ type: "MATCH_SNAPSHOT", state: boards[1] });
    expect(castCard(c), "no loose Grapeshot in the middle").toBeNull();
    const [first] = waitingSlots(c);
    expect(first).toBeTruthy();
    // Beside the original: to its left, a little smaller.
    const at = placed(first!);
    expect(at.s).toBeCloseTo(original.s * BESIDE.scale, 3);
    expect(at.x).toBeLessThan(original.x);
    // It peels off the original's stack card (0079's peel), the gold mark on it.
    const peel = runsOn(first!).find((a) => String(a.frames[0]?.transform).includes("translate"))!;
    const [px, py] = numbers(String(peel.frames[0]!.transform));
    expect(px).toBeCloseTo(original.x, 0);
    expect(py).toBeCloseTo(original.y, 0);
    expect(first!.querySelector(".bf-mark-copy")).toBeTruthy();
    // The maker (the storm trigger) pulses gold.
    expect(runsOn(slotOf(c, "stack:11")!.querySelector(".bf-stack-card")!).some(isGlow)).toBe(true);
    // Each "new target?" adds one: the same element, a see-through copy peeling on.
    for (let k = 2; k <= 4; k++) {
      animations = [];
      send({ type: "MATCH_SNAPSHOT", state: boards[k] });
      const [same] = waitingSlots(c);
      expect(same).toBe(first);
      expect(same!.querySelector<HTMLElement>("[data-count]")!.dataset.count).toBe(String(k));
      expect(c.querySelector(`[data-ghost-of="${copyCard(k - 1)}"]`)).toBeTruthy();
      expect(castCard(c)).toBeNull();
    }
    // All four land: the same element glides to its place on the stack (its box changes).
    wait(1000);
    animations = [];
    send({ type: "MATCH_SNAPSHOT", state: boards[5] });
    expect(waitingSlots(c)).toEqual([]);
    const now = slotOf(c, "stack:12")!;
    expect(now).toBe(first);
    expect(now.querySelector<HTMLElement>("[data-count]")!.dataset.count).toBe("4");
    expect(now.querySelector<HTMLElement>("[data-members]")!.dataset.members).toBe(
      [0, 1, 2, 3].map(copyCard).join(" "),
    );
    expect(runsOn(now).filter((a) => String(a.frames[0]?.transform).includes("translate"))).toEqual(
      [],
    );
    // The first resolves: x3, still the same element; the resolved one in gold motes.
    send({ type: "MATCH_SNAPSHOT", state: boards[6] });
    const after = slotOf(c, "stack:13")!;
    expect(after).toBe(first);
    expect(after.querySelector<HTMLElement>("[data-count]")!.dataset.count).toBe("3");
    expect(c.querySelector<HTMLElement>('[data-ghost-of="stack:12"]')!.dataset.copyEnd).toBe(
      "true",
    );
  });

  it("Bob's seat: nothing leaves Alice's hand (no back, no cast card); he sees the card count up", () => {
    const c = open("u-2");
    const boards = stormBoards(2, [BOB, BOB, BOB, BOB]);
    send({ type: "MATCH_SNAPSHOT", state: boards[0] });
    animations = [];
    for (let k = 1; k <= 4; k++) {
      send({ type: "MATCH_SNAPSHOT", state: boards[k] });
      wait();
      expect(castCard(c)).toBeNull();
      expect(c.querySelector('[data-ghost-of^="hidden-hand"]')).toBeNull();
      expect(c.querySelector(".gs-cast-back")).toBeNull();
      const count = waitingSlots(c)[0]!.querySelector<HTMLElement>('[data-zone="stack"]')!;
      expect(count.dataset.count ?? "1").toBe(String(k));
    }
  });

  it("split targets: the copy picked at the Bears peels off the Bob card to a card of its own, under it", () => {
    const c = open();
    const boards = stormBoards(1, [BOB, BOB, BEARS, BEARS]);
    const bears = {
      id: "card:79",
      seat: 2,
      name: "Grizzly Bears",
      kind: "creature",
      types: "Creature — Bear",
      known: true,
      power: 2,
      toughness: 2,
    };
    for (const b of boards) (b as { battlefield: unknown[] }).battlefield = [bears];
    for (let k = 0; k <= 3; k++) send({ type: "MATCH_SNAPSHOT", state: boards[k] });
    // Question 3 is open: it joined the Bob card (x3, its target being picked).
    expect(waitingSlots(c).length).toBe(1);
    const bob = waitingSlots(c)[0]!;
    const bobAt = placed(bob);
    animations = [];
    send({ type: "MATCH_SNAPSHOT", state: boards[4] });
    const [first, second] = waitingSlots(c);
    expect(first).toBe(bob);
    expect(first!.querySelector<HTMLElement>("[data-count]")!.dataset.count).toBe("2");
    expect(second).toBeTruthy();
    // Under the first, beside the same original.
    expect(placed(second!).y).toBeGreaterThan(bobAt.y);
    // It peels off the Bob card, where it was.
    const peel = runsOn(second!).find((a) => String(a.frames[0]?.transform).includes("translate"))!;
    const [px, py] = numbers(String(peel.frames[0]!.transform));
    expect(px).toBeCloseTo(bobAt.x, 0);
    expect(py).toBeCloseTo(bobAt.y, 0);
    // Landed: two cards on the stack, two copies each.
    send({ type: "MATCH_SNAPSHOT", state: boards[5] });
    const copies = [...c.querySelectorAll<HTMLElement>('[data-zone="stack"][data-copy="true"]')];
    expect(copies.map((el) => el.dataset.count)).toEqual(["2", "2"]);
    expect(copies[0]!.closest(".bf-slot")).toBe(bob);
  });

  it("the copy's lasting key: its batch and what it aims at (never its first member's id)", () => {
    const entry = landed(0, BOB) as unknown as Parameters<typeof copyKey>[0];
    expect(copyKey(entry)).toBe(`${GROUP}|${JSON.stringify([BOB])}`);
    expect(copyKey({ ...entry, id: "stack:13" })).toBe(copyKey(entry));
    expect(copyKey({ ...entry, group: undefined })).toBeNull();
  });
});

// --- F-0082-B · prepare ------------------------------------------------------------------

const firstYear = (over: Record<string, unknown> = {}) => ({
  id: "card:1",
  seat: 1,
  name: "Studious First-Year",
  kind: "creature",
  types: "Creature — Bear Wizard",
  known: true,
  power: 1,
  toughness: 1,
  ...over,
});
const growth = (over: Record<string, unknown> = {}) => ({
  id: "card:121",
  seat: 1,
  owner: 1,
  name: "Rampant Growth",
  kind: "other",
  types: "Sorcery",
  known: true,
  manaCost: "{1}{G}",
  token: true,
  copy: true,
  copyOf: "card:1",
  ...over,
});
const growthOn = {
  id: "stack:13",
  source: "card:121",
  name: "Rampant Growth",
  controller: 1,
  kind: "spell",
  manaCost: "{1}{G}",
  targets: [],
  copy: true,
  description: "Rampant Growth",
};
const firstYearOn = {
  id: "stack:2",
  source: "card:1",
  name: "Studious First-Year",
  controller: 1,
  kind: "spell",
  manaCost: "{G}",
  targets: [],
  description: "Studious First-Year",
};

describe("F-0082-B · Studious First-Year enters prepared; its Rampant Growth is cast out of the mark", () => {
  for (const seat of [1, 2]) {
    it(`seat ${seat}: the mark settles on the creature, nothing in exile; cast, it rises out of the mark; done, motes`, () => {
      const c = open(seat === 1 ? "u-1" : "u-2");
      send({ type: "MATCH_SNAPSHOT", state: state(seat, { stack: [firstYearOn] }) });
      wait();
      animations = [];
      send({
        type: "MATCH_SNAPSHOT",
        state: state(seat, {
          battlefield: [firstYear({ prepared: "card:121" })],
          exile: [growth()],
          moves: [
            {
              card: "card:1",
              from: { zone: "stack", seat: 1 },
              to: { zone: "battlefield", seat: 1 },
            },
          ],
        }),
      });
      wait(100);
      const creature = c.querySelector<HTMLElement>('[data-object-id="card:1"]')!;
      const mark = creature.querySelector<HTMLElement>('[data-mark-of="card:121"]')!;
      expect(mark, "the prepared square, on the creature").toBeTruthy();
      expect(mark.classList.contains("bf-mark-prepared")).toBe(true);
      // It pulses gold and the square grows in after it has arrived.
      expect(
        runsOn(creature).some(isGlow) ||
          runsOn(creature.closest(".bf-slot")!).some(isGlow) ||
          animations.some((a) => isGlow(a) && creature.closest(".bf-slot")!.contains(a.element)),
      ).toBe(true);
      expect(runsOn(mark).length).toBe(1);
      // Nothing goes to the exile pile: her exile says 0.
      const tile = c.querySelector<HTMLElement>(
        `[data-zone-tile="${seat === 1 ? "viewer" : "opponent"}:exile"] .gs-zone-n`,
      )!;
      expect(tile.textContent).toBe("0");
      // Cast: it rises out of the mark (face up), and the mark goes.
      animations = [];
      send({
        type: "MATCH_SNAPSHOT",
        state: state(seat, {
          battlefield: [firstYear({ prepared: "card:121" })],
          exile: [],
          casting: [growth()],
          moves: [{ card: "card:121", from: { zone: "exile", seat: 1 }, to: { zone: "stack" } }],
        }),
      });
      const cast = castCard(c)!;
      expect(cast, "it goes to the middle to be paid").not.toBeNull();
      expect(cast.querySelector(".gs-cast-back")).toBeNull();
      // It wears the gold copy mark while it is paid (and flies to the stack).
      expect(cast.querySelector(".gs-cast-copy-mark")).toBeTruthy();
      expect(c.querySelector('[data-mark-of="card:121"]')).toBeNull();
      const g = layoutGeometry(size);
      const slot = creature.closest<HTMLElement>(".bf-slot")!;
      const [cx, cy, , , cs] = numbers(slot.style.transform);
      const box = {
        x: cx!,
        y: cy!,
        w: g.cardW * (cs ?? 1),
        h: g.cardH * (cs ?? 1),
        scale: cs ?? 1,
        rotation: 0,
        z: 0,
      };
      const from = preparedMarkBox(box, g.cardW, g.cardH);
      const rise = runsOn(cast).find((a) => String(a.frames[0]?.transform).includes("("))!;
      expect(rise).toBeTruthy();
      const rest = cast.style;
      const [rx, ry, , rs] = numbers(String(rise.frames[0]!.transform));
      const centre = {
        x: parseFloat(rest.left) + parseFloat(rest.width) / 2 + rx!,
        y: parseFloat(rest.top) + parseFloat(rest.height) / 2 + ry!,
      };
      expect(centre.x).toBeCloseTo(from.x + from.w / 2, 0);
      expect(centre.y).toBeCloseTo(from.y + from.h / 2, 0);
      expect((rs ?? 1) * parseFloat(rest.width)).toBeLessThan(g.cardW * 0.5);
      // On the stack it wears the copy mark; done, it breaks into gold motes,
      // no graveyard glide, the graveyard count unchanged.
      act(() => rise.done());
      send({
        type: "MATCH_SNAPSHOT",
        state: state(seat, { battlefield: [firstYear()], stack: [growthOn] }),
      });
      wait();
      expect(slotOf(c, "stack:13")!.querySelector(".bf-mark-copy")).toBeTruthy();
      send({
        type: "MATCH_SNAPSHOT",
        state: state(seat, {
          battlefield: [firstYear()],
          moves: [{ card: "card:121", from: { zone: "stack", seat: 1 }, to: { zone: "nowhere" } }],
        }),
      });
      expect(c.querySelector<HTMLElement>('[data-ghost-of="stack:13"]')!.dataset.copyEnd).toBe(
        "true",
      );
      const grave = c.querySelector<HTMLElement>(
        `[data-zone-tile="${seat === 1 ? "viewer" : "opponent"}:graveyard"] .gs-zone-n`,
      )!;
      expect(grave.textContent).toBe("0");
    });
  }

  it("the link is the game's, by id: the exile pile leaves out only the spell its creature names", () => {
    const b = reduceMatch(
      { ...EMPTY_STATE },
      {
        type: "MATCH_SNAPSHOT",
        state: state(1, {
          battlefield: [firstYear({ prepared: "card:121" })],
          exile: [growth(), growth({ id: "card:122", copy: undefined, copyOf: undefined })],
        }),
      },
    ).board!;
    expect(exilePile(b).map((x) => x.id)).toEqual(["card:122"]);
    const casting = { ...b, casting: [b.exile[0]!] };
    expect(castOrigin(b.exile[0]!, casting, b)).toMatchObject({ zone: "prepared", on: "card:1" });
    // Another card of the same name, not linked: from its pile.
    const other = { ...b.exile[1]!, copy: true, copyOf: "card:9" };
    expect(castOrigin(other, { ...b, casting: [other] }, b).zone).not.toBe("prepared");
  });
});

// --- F-0082-C · Fork unchanged -------------------------------------------------------------

describe("F-0082-C · Fork: a copy straight onto the stack still peels off the Bolt (0079)", () => {
  it("a copy that never waited (no new target asked) peels off the Bolt to the front", () => {
    const c = open();
    const bolt = {
      id: "stack:2",
      source: "card:77",
      name: "Lightning Bolt",
      controller: 2,
      kind: "spell",
      targets: [{ player: 1 }],
      description: "Lightning Bolt",
    };
    send({ type: "MATCH_SNAPSHOT", state: state(1, { stack: [bolt] }) });
    wait();
    const boltAt = placed(slotOf(c, "stack:2")!);
    animations = [];
    send({
      type: "MATCH_SNAPSHOT",
      state: state(1, {
        stack: [
          {
            ...bolt,
            id: "stack:4",
            source: "card:90",
            controller: 1,
            copy: true,
            copyOf: "stack:2",
            group: "copies:40",
            copyingId: "copying:40",
            targets: [{ player: 2 }],
          },
          bolt,
        ],
      }),
    });
    const copy = slotOf(c, "stack:4")!;
    expect(copy.querySelector(".bf-mark-copy")).toBeTruthy();
    const peel = runsOn(copy).find((a) => String(a.frames[0]?.transform).includes("translate"))!;
    const [px, py] = numbers(String(peel.frames[0]!.transform));
    // From the Bolt's stack card (0079: where it is drawn now, behind the copy).
    const boltNow = placed(slotOf(c, "stack:2")!);
    expect(boltNow.y).toBeLessThan(boltAt.y);
    expect(px).toBeCloseTo(boltNow.x, 0);
    expect(py).toBeCloseTo(boltNow.y, 0);
  });
});

// --- F-0082-D · an ability copy ------------------------------------------------------------

describe("F-0082-D · Strionic Resonator copies Flametongue Kavu's trigger", () => {
  it("the copy peels off the trigger with the copy mark and waits beside it; the Resonator pulses; it lands as the same card", () => {
    const c = open();
    const kavu = {
      id: "card:60",
      seat: 1,
      name: "Flametongue Kavu",
      kind: "creature",
      types: "Creature — Kavu",
      known: true,
      power: 4,
      toughness: 2,
    };
    const reso = {
      id: "card:35",
      seat: 1,
      name: "Strionic Resonator",
      kind: "artifact",
      types: "Artifact",
      known: true,
      tapped: true,
    };
    const trig = {
      id: "stack:18",
      source: "card:60",
      name: "Flametongue Kavu",
      controller: 1,
      kind: "trigger",
      targets: [{ object: "card:98" }],
      description: "Flametongue Kavu deals 4 damage to Serra Angel.",
    };
    const ability = {
      id: "stack:21",
      source: "card:35",
      name: "Strionic Resonator",
      controller: 1,
      kind: "ability",
      targets: [{ object: "stack:18" }],
      description: "Copy target triggered ability you control.",
    };
    const copy = {
      ...trig,
      id: "copying:281",
      copy: true,
      copyOf: "stack:18",
      group: "copies:281",
      targets: [],
      aiming: true,
    };
    send({
      type: "MATCH_SNAPSHOT",
      state: state(1, { battlefield: [kavu, reso], stack: [ability, trig] }),
    });
    animations = [];
    send({
      type: "MATCH_SNAPSHOT",
      state: state(1, { battlefield: [kavu, reso], stack: [ability, trig], copying: [copy] }),
    });
    const [waiting] = waitingSlots(c);
    expect(waiting).toBeTruthy();
    expect(waiting!.querySelector(".bf-mark-copy")).toBeTruthy();
    expect(placed(waiting!).x).toBeLessThan(placed(slotOf(c, "stack:18")!).x);
    // The cause pulses: the Resonator's ability and the Resonator itself.
    const resoSlot = c.querySelector('[data-object-id="card:35"]')!.closest(".bf-slot")!;
    expect(animations.some((a) => isGlow(a) && resoSlot.contains(a.element))).toBe(true);
    // Lands: the same element, now the stack entry.
    send({
      type: "MATCH_SNAPSHOT",
      state: state(1, {
        battlefield: [kavu, reso],
        stack: [
          {
            ...trig,
            id: "stack:22",
            copy: true,
            copyOf: "stack:18",
            group: "copies:281",
            copyingId: "copying:281",
            targets: [{ object: "card:65" }],
          },
          trig,
        ],
      }),
    });
    expect(slotOf(c, "stack:22")).toBe(waiting);
  });
});

// --- F-0082-E · hurry, reduce motion -------------------------------------------------------

describe("F-0082-E · a click hurries it; reduce motion shows the marks and counts", () => {
  it("a click hurries the peel (A-00)", () => {
    const c = open();
    const boards = stormBoards(1, [BOB, BOB, BOB, BOB]);
    send({ type: "MATCH_SNAPSHOT", state: boards[0] });
    send({ type: "MATCH_SNAPSHOT", state: boards[1] });
    animations = [];
    send({ type: "MATCH_SNAPSHOT", state: boards[2] });
    const ghost = c.querySelector(`[data-ghost-of="${copyCard(1)}"]`)!;
    act(() => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(animations.filter((a) => ghost.contains(a.element)).some((a) => a.rate.length > 0)).toBe(
      true,
    );
  });

  it("reduce motion: no peel or pulse; the card, its copy mark and its count are there", () => {
    reduce = true;
    const c = open();
    const boards = stormBoards(1, [BOB, BOB, BOB, BOB]);
    send({ type: "MATCH_SNAPSHOT", state: boards[0] });
    animations = [];
    send({ type: "MATCH_SNAPSHOT", state: boards[1] });
    send({ type: "MATCH_SNAPSHOT", state: boards[2] });
    const [w] = waitingSlots(c);
    expect(w!.querySelector(".bf-mark-copy")).toBeTruthy();
    expect(w!.querySelector<HTMLElement>("[data-count]")!.dataset.count).toBe("2");
    expect(animations.filter((a) => w!.contains(a.element))).toEqual([]);
    expect(c.querySelector(`[data-ghost-of="${copyCard(1)}"]`)).toBeNull();
  });
});

const EMPTY_STATE = (await import("../match")).EMPTY_MATCH;
