// @vitest-environment jsdom

// Spec 0107 -- trample. The real game screen, its socket replaced, handed the
// boards and the question the worker sent seat 1 in two Lab games
// (check-combat-choices.py trample-auto and trample-deathtouch, cut into
// fixes0107.round.json): a Colossal Dreadmaw blocked by a Grizzly Bears, and
// a Typhoid Rats with Rancor blocked by a Wall of Wood.
//
// F-0107-J: "Change split" stands under its attacker, only while the
// attacker's player is asked, and its click answers with its option; the
// damage question that follows opens the window filled in 2 / 4.
// F-0107-G: the blow on the shield lands at the carry-on's moment, after the
// blocker's. F-0107-H: the trample square pops then (and deathtouch's too).
// F-0107-I: no visible caption: the words are a visually hidden live line.

import { act, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

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
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixes0107.round.json"), "utf8"),
) as {
  auto: { stopBoard: Rec; stop: Rec; beforeDamage: Rec; damageBoard: Rec };
  deathtouch: { beforeDamage: Rec; damageBoard: Rec };
};

/** Every animation started, with the element it runs on. */
let played: { el: Element; frames: unknown; delay: number }[] = [];

beforeEach(() => {
  socket.answered = [];
  played = [];
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
  Element.prototype.animate = function (this: Element, frames: unknown, options?: unknown) {
    const delay =
      typeof options === "object" && options !== null
        ? Number((options as { delay?: number }).delay ?? 0)
        : 0;
    played.push({ el: this, frames, delay });
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
  matchId: "m-107",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

function send(state: Rec) {
  act(() =>
    socket.onState!((previous) => reduceMatch(previous, { type: "MATCH_SNAPSHOT", state })),
  );
}
function frame(f: Rec) {
  act(() => socket.onState!((previous) => reduceMatch(previous, f)));
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;

/** The latest start of the animations on elements matching [selector]. */
const delays = (c: HTMLElement, selector: string) => {
  const els = new Set(c.querySelectorAll(selector));
  return played.filter((p) => els.has(p.el)).map((p) => p.delay);
};

describe("F-0107-J · Change split, under the attacker, while its player is asked", () => {
  it("stands under the Dreadmaw, on its own (not a card action), and a click answers with it", () => {
    const c = open();
    send(ROUND.auto.stopBoard);
    expect(c.querySelector(".bf-split")).toBeNull();
    frame(ROUND.auto.stop);
    const buttons = [...c.querySelectorAll<HTMLButtonElement>(".bf-split")];
    expect(buttons).toHaveLength(1);
    const button = buttons[0]!;
    expect(button.dataset["split"]).toBe("card:7");
    expect(button.textContent).toBe("Change split");
    // Placed on the table (where exactly is the stills' and the e2e's to see).
    expect(parseFloat(button.style.top)).toBeGreaterThan(0);
    expect(parseFloat(button.style.left)).toBeGreaterThan(0);
    // Not offered as the Dreadmaw's own action, nor listed anywhere else.
    const words = [...c.querySelectorAll("button")].filter(
      (b) => b.textContent?.includes("Change split") && b !== button,
    );
    expect(words).toHaveLength(0);
    fireEvent.click(button);
    expect(socket.answered).toEqual(["split:card:7"]);
  });

  it("the damage question that follows opens the window filled in: 2 on the Bears, 4 to the player", () => {
    const c = open();
    send(ROUND.auto.stopBoard);
    frame(ROUND.auto.stop);
    fireEvent.click(c.querySelector<HTMLButtonElement>(".bf-split")!);
    frame({ type: "DECISION_ACCEPTED", decisionId: ROUND.auto.stop["decisionId"] });
    const fight = { ...((ROUND.auto.stop["options"] as Rec[]).at(-1)!["fight"] as Rec) };
    delete fight["usual"];
    frame({
      type: "DECISION_REQUEST",
      decisionId: 9001,
      actedForSeat: 1,
      authorisedSeat: 1,
      kind: "assignCombatDamage",
      stateVersion: ROUND.auto.stopBoard["stateRevision"],
      mandatory: true,
      prompt: "Assign damage 1 of 6 from Colossal Dreadmaw.",
      options: [
        {
          actionId: "damage:card:64",
          label: "Grizzly Bears (2/2) · 0 damage so far",
          objectId: "card:64",
        },
      ],
      arrange: { damage: fight },
    });
    const tray = c.querySelector('.gs-win.gs-tray[data-kind="assignCombatDamage"]')!;
    expect(tray).not.toBeNull();
    expect(tray.querySelector(".gs-win-left")!.textContent).toBe("Damage left: 0");
    const values = [...tray.querySelectorAll(".gs-win-stepper b")].map((b) => b.textContent);
    expect(values).toEqual(["2", "4"]);
    // While the window is open the button is gone (the question it belonged to is over).
    expect(c.querySelector(".bf-split")).toBeNull();
  });
});

describe("F-0107-G, H, I · the carry-on, the pop, no caption (a real round)", () => {
  it("the shield's blow lands after the blocker's; the trample square pops with it; the caption is hidden", () => {
    const c = open();
    send(ROUND.auto.beforeDamage);
    played = [];
    send(ROUND.auto.damageBoard);
    const onBears = delays(c, '[data-fight="slash"][data-of="card:64"]');
    const onShield = delays(c, '[data-fight="slash"][data-of="player:2"]');
    expect(onBears.length).toBeGreaterThan(0);
    expect(onShield).toHaveLength(1);
    expect(onShield[0]!).toBeGreaterThan(Math.max(...onBears));
    // The number on the shield at the same moment.
    expect(delays(c, '[data-fight="number"][data-of="player:2"]')).toEqual(onShield);
    // F-0107-H: the trample square pops on the shield hit, not on the blocker's.
    const pops = delays(c, '.bf-mark[data-mark="kw:trample"]');
    expect(pops).toEqual(onShield);
    // F-0107-I: the fight's words are there for a screen reader, never over the table.
    const caption = c.querySelector<HTMLElement>('[data-fight="caption"]')!;
    expect(caption.textContent).toContain("Colossal Dreadmaw");
    expect(caption.classList.contains("pa-visually-hidden")).toBe(true);
    expect(caption.getAttribute("aria-live")).toBe("polite");
  });

  it("deathtouch and trample: the shield's blow after the deathtouch hit, both squares pop", () => {
    const c = open();
    send(ROUND.deathtouch.beforeDamage);
    played = [];
    send(ROUND.deathtouch.damageBoard);
    const onBears = delays(c, '[data-fight="slash"][data-of="card:86"]');
    const onShield = delays(c, '[data-fight="slash"][data-of="player:2"]');
    expect(onShield).toHaveLength(1);
    expect(onShield[0]!).toBeGreaterThan(Math.max(...onBears));
    expect(delays(c, '.bf-mark[data-mark="kw:trample"]')).toEqual(onShield);
    expect(delays(c, '.bf-mark[data-mark="kw:deathtouch"]').length).toBeGreaterThan(0);
  });
});
