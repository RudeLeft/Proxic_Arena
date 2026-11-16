// @vitest-environment jsdom

// Spec 0094 (owner 2026-11-16, A) -- pointing at a hand card shows the whole
// printed card, 2.6x, lifted clear of the fan, as a reading card that can't
// be clicked (F-0094-A); the hand card's marks show on it (F-0094-C). The
// real game screen, its socket replaced: the test hands it the server's
// messages itself. The real mouse along a real hand, and the cast rising
// from the reading card (F-0094-B), are e2e/match-reading-card.spec.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { geometry } from "./layout";
import { HAND_READ, HAND_RISE } from "./motion";
import { DISCARD_KIND } from "./discard";

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
let reduced = false;
beforeEach(() => {
  reduced = false;
  socket.answers = [];
  size.width = 1920;
  size.height = 1080;
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
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
  document.body.innerHTML = "";
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

/** A picture's content hash, as the server sends it. */
const sha = (id: number) => "a".repeat(63) + String(id);
const card = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id: `card:${id}`,
  seat: 1,
  name,
  kind: "creature",
  types: "Creature — Bear",
  known: true,
  power: 2,
  toughness: 2,
  manaCost: "{1}{G}",
  art: sha(id),
  ...extra,
});
const HAND = [1, 2, 3, 4, 5, 6, 7].map((id) => card(id, `Bear ${id}`));

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(over: Record<string, unknown> = {}) {
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
        { seat: 1, name: "Alice", life: 20, handCount: 7, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: [],
      hand: HAND,
      graveyard: [],
      exile: [],
      stack: [],
      ...over,
    },
  });
}
let asked = 0;
function ask(kind: string, ids: string[], extra: Record<string, unknown> = {}) {
  asked += 1;
  send({
    type: "DECISION_REQUEST",
    decisionId: asked,
    actedForSeat: 1,
    authorisedSeat: 1,
    stateVersion: revision,
    kind,
    mandatory: kind === DISCARD_KIND,
    options: ids.map((id) => ({ actionId: `${id}/play`, label: "Cast it", objectId: id })),
    ...extra,
  });
}

const handButton = (c: ParentNode, id: string) =>
  c.querySelector<HTMLButtonElement>(`button[data-object-id="${id}"]`)!;
const slotOf = (c: ParentNode, id: string) => handButton(c, id).parentElement!;
/** The x and y of an element's translate3d. */
const at = (el: HTMLElement) => {
  const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: NaN, y: NaN };
};
const reading = (c: ParentNode) => c.querySelector<HTMLElement>("[data-reading]");

function open() {
  return render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
}

describe("the reading card along a 7-card hand (F-0094-A)", () => {
  for (const [w, h] of [
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    it(`at ${w}x${h}: the whole card, 2.6x, clear above the fan; the card only rises`, () => {
      size.width = w;
      size.height = h;
      const g = geometry({ width: w, height: h });
      const c = open();
      board();
      const restY = new Map(HAND.map((x) => [x.id, at(slotOf(c, x.id)).y]));
      const fanTop = Math.min(...restY.values());
      for (const x of HAND) {
        fireEvent.pointerEnter(handButton(c, x.id));
        const read = reading(c)!;
        expect(read, x.id).not.toBeNull();
        expect(read.dataset["reading"]).toBe(x.id);
        expect(read.getAttribute("aria-hidden")).toBe("true");
        // The whole scan, not the table face's art window.
        const scan = read.querySelector<HTMLImageElement>("img.bf-read-scan")!;
        expect(scan.getAttribute("src")).toContain(sha(Number(x.id.slice(5))));
        expect(read.querySelector(".bf-window")).toBeNull();
        expect(parseFloat(read.style.width)).toBeCloseTo(g.cardW * HAND_READ, 3);
        expect(parseFloat(read.style.height)).toBeCloseTo(g.cardH * HAND_READ, 3);
        // The hand card rose only HAND_RISE of its height...
        const risen = at(slotOf(c, x.id)).y;
        expect(restY.get(x.id)! - risen).toBeCloseTo(HAND_RISE * g.cardH, 3);
        // ...and the reading card is above it and the whole fan.
        const bottom = at(read).y + parseFloat(read.style.height);
        expect(bottom).toBeLessThan(Math.min(fanTop, risen));
        expect(at(read).y).toBeGreaterThanOrEqual(0);
        fireEvent.pointerLeave(handButton(c, x.id));
        expect(reading(c)).toBeNull();
        expect(at(slotOf(c, x.id)).y).toBe(restY.get(x.id));
      }
    });
  }

  it("can't be clicked or pointed at; the hand card keeps its label", () => {
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "battlefield.css"), "utf-8");
    expect(css).toMatch(/\.bf-read \{[^}]*pointer-events: none;/);
    const c = open();
    board();
    fireEvent.pointerEnter(handButton(c, "card:3"));
    expect(reading(c)!.querySelector("button, [tabindex]")).toBeNull();
    expect(handButton(c, "card:3").getAttribute("aria-label")).toContain("Bear 3, in your hand");
  });

  it("keyboard focus shows it too", () => {
    const c = open();
    board();
    fireEvent.focus(handButton(c, "card:5"));
    expect(reading(c)!.dataset["reading"]).toBe("card:5");
    fireEvent.blur(handButton(c, "card:5"));
    expect(reading(c)).toBeNull();
  });

  it("goes when its card leaves the hand, and does not come back by itself", () => {
    const c = open();
    board();
    fireEvent.pointerEnter(handButton(c, "card:4"));
    expect(reading(c)).not.toBeNull();
    board({ hand: HAND.filter((x) => x.id !== "card:4") });
    expect(reading(c)).toBeNull();
    board();
    expect(reading(c)).toBeNull();
  });

  it("Reduce motion: it appears without a settle", () => {
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "battlefield.css"), "utf-8");
    // The settle is only for those who did not ask for less motion.
    const settle = css.indexOf("animation: bf-read-in");
    expect(settle).toBeGreaterThan(0);
    const before = css.slice(0, settle);
    expect(before.lastIndexOf("@media (prefers-reduced-motion: no-preference)")).toBeGreaterThan(
      before.lastIndexOf("}\n\n"),
    );
  });
});

describe("the hand card's marks show on the reading card (F-0094-C)", () => {
  it("cost now (0058): the lower cost, over the printed one", () => {
    const c = open();
    board({ hand: HAND.map((x) => (x.id === "card:2" ? { ...x, costNow: "{G}" } : x)) });
    fireEvent.pointerEnter(handButton(c, "card:2"));
    const cost = reading(c)!.querySelector<HTMLElement>(".bf-read-cost")!;
    expect(cost).not.toBeNull();
    expect(cost.dataset["readCost"]).toBe("down");
    fireEvent.pointerLeave(handButton(c, "card:2"));
    // A card at its printed cost: the scan says it, no chip.
    fireEvent.pointerEnter(handButton(c, "card:1"));
    expect(reading(c)!.querySelector(".bf-read-cost")).toBeNull();
  });

  it("playable: it glows as the hand card does; not playable, no glow", () => {
    const c = open();
    board();
    ask("chooseSpellAbilityToPlay", ["card:1"]);
    fireEvent.pointerEnter(handButton(c, "card:1"));
    expect(reading(c)!.className).toContain("bf-choosable");
    expect(reading(c)!.querySelector(".bf-breath")).not.toBeNull();
    fireEvent.pointerLeave(handButton(c, "card:1"));
    fireEvent.pointerEnter(handButton(c, "card:6"));
    expect(reading(c)!.className).not.toContain("bf-choosable");
    expect(reading(c)!.querySelector(".bf-breath")).toBeNull();
  });

  it("discard pick (0061): the red outline", () => {
    const c = open();
    board();
    ask(DISCARD_KIND, ["card:7"], { prompt: "Discard a card" });
    fireEvent.pointerEnter(handButton(c, "card:7"));
    expect(reading(c)!.className).not.toContain("bf-picked");
    fireEvent.click(handButton(c, "card:7"));
    expect(handButton(c, "card:7").dataset["picked"]).toBe("true");
    expect(reading(c)!.className).toContain("bf-picked");
  });

  it("seen: the eye", () => {
    const c = open();
    board({ hand: HAND.map((x) => (x.id === "card:3" ? { ...x, seen: true } : x)) });
    fireEvent.pointerEnter(handButton(c, "card:3"));
    expect(reading(c)!.querySelector('[data-sign="seen"]')).not.toBeNull();
    fireEvent.pointerLeave(handButton(c, "card:3"));
    fireEvent.pointerEnter(handButton(c, "card:4"));
    expect(reading(c)!.querySelector('[data-sign="seen"]')).toBeNull();
  });
});
