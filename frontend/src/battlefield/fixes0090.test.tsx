// @vitest-environment jsdom

// Spec 0090 -- speed checks for Phase 10's animations: the bench's scenes
// (F-0090-A, their shapes; the timings are e2e/bench-scenes.spec.ts), the
// cheaper glow (F-0090-B: a soft layer beside the card whose opacity alone
// animates, following the card's own movements), calmer flyers (F-0090-C:
// in step above 12, paused while the tab is hidden). The real Board.

import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardCard, type BoardHandCard, type StackView } from "./Board";
import { BUDGETS, SCENES } from "./benchBudgets";
import { REPORTS, STORM_COPIES, benchScene } from "./benchScenes";
import { FLY_SYNC_AT, bobInStep, followCards, pauseFlyers } from "./breathMotion";
import type { PayMark } from "./payPicks";

const size = { width: 1920, height: 1080 };
let still = false;
beforeEach(() => {
  still = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? still : false,
  }));
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let entered = 0;
function card(id: string, seat: number, name: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    seat,
    name,
    kind: "creature",
    types: `Creature — ${name}`,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: 2,
    toughness: 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: null,
    ...extra,
  };
}
const flyer = (id: string, seat: number, name: string) =>
  card(id, seat, name, { keywords: ["Flying"] });
const flyers = (n: number, from = 100) =>
  Array.from({ length: n }, (_, i) => flyer(`card:${from + i}`, 1 + (i % 2), `Faerie ${i}`));

function draw(
  battlefield: BoardCard[],
  extra: Partial<Parameters<typeof Board>[0]> & { hand?: BoardHandCard[] } = {},
) {
  return (
    <Board
      battlefield={battlefield}
      hand={extra.hand ?? []}
      opponentHand={[]}
      opponentName="Bob"
      viewerSeat={1}
      artUrl={(art) => art}
      {...extra}
    />
  );
}
const cardOf = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`.bf-card[data-object-id="${id}"]`)!;
const breathOf = (c: ParentNode, id: string) => {
  const next = cardOf(c, id).nextElementSibling as HTMLElement | null;
  return next?.classList.contains("bf-breath") ? next : null;
};

// --- F-0090-A: the bench's scenes ------------------------------------------------------------------

describe("F-0090-A · the speed test's Phase 10 moments", () => {
  it("every scene is there, with a budget, and records over its whole moment", () => {
    expect([...SCENES]).toEqual([
      "wipe",
      "tokens",
      "combat",
      "flyers",
      "wash",
      "army",
      "storm",
      "reports",
      "flyer-tab",
    ]);
    for (const name of SCENES) {
      const scene = benchScene(name)!;
      expect(scene.name).toBe(name);
      expect(BUDGETS[name].p95).toBeGreaterThan(0);
      const lastStep = Math.max(0, ...scene.steps.map((s) => s.at));
      expect(scene.ms).toBeGreaterThan(lastStep + 500);
    }
    expect(benchScene("nothing")).toBeNull();
  });

  it("the wipe: 31 creatures, every one to its graveyard at once", () => {
    const s = benchScene("wipe")!;
    const creatures = s.start.battlefield.filter((c) => c.kind === "creature");
    expect(creatures).toHaveLength(31);
    // None piles with another of its side: 31 drawn.
    for (const seat of [1, 2]) {
      const mine = creatures.filter((c) => c.seat === seat);
      expect(new Set(mine.map((c) => c.name)).size).toBe(mine.length);
    }
    const after = s.steps[0]!.board;
    expect(after.battlefield.some((c) => c.kind === "creature")).toBe(false);
    expect([...after.departures!.values()].sort()).toEqual(
      [
        ...Array<string>(16).fill("viewer:graveyard"),
        ...Array<string>(15).fill("opponent:graveyard"),
      ].sort(),
    );
  });

  it("the token wave: 64 tokens in one update, after their maker's ability", () => {
    const s = benchScene("tokens")!;
    expect(s.start.stack).toHaveLength(1);
    const made = s.steps[0]!.board.battlefield.filter((c) => c.token);
    expect(made).toHaveLength(64);
  });

  it("the combat: ten creatures, a first-strike wave, then the regular one", () => {
    const s = benchScene("combat")!;
    const fighting = s.start.battlefield.filter((c) => c.attacking || c.blocking);
    expect(fighting).toHaveLength(10);
    expect(s.steps.map((step) => step.board.damage?.combat)).toEqual(["first-strike", "regular"]);
    expect(s.steps[0]!.board.damage!.fights).toHaveLength(3);
  });

  it("the flyers: 20 that fly, more than the in-step threshold", () => {
    const s = benchScene("flyers")!;
    const fly = s.start.battlefield.filter((c) => c.keywords.includes("Flying"));
    expect(fly).toHaveLength(20);
    expect(fly.length).toBeGreaterThan(FLY_SYNC_AT);
  });

  it("the wash, the army, the storm and the reports", () => {
    expect(benchScene("wash")!.start.dayTime).toBe("day");
    expect(benchScene("wash")!.steps[0]!.board.dayTime).toBe("night");
    const army = benchScene("army")!;
    const yours = army.start.battlefield.filter((c) => c.seat === 1 && c.kind === "creature");
    expect([...army.steps[0]!.board.choosable!].sort()).toEqual(yours.map((c) => c.id).sort());
    // The storm through the page's own parser: one copy card counting up to xN.
    const storm = benchScene("storm")!;
    const counts = storm.steps.map((step) => step.board.copying?.[0]?.count ?? 1);
    expect(Math.max(...counts)).toBe(STORM_COPIES);
    expect(storm.steps.some((step) => step.board.stack?.[0]?.count === STORM_COPIES)).toBe(true);
    // The reports: each new one gathers the older ones, at most three rows.
    const reports = benchScene("reports")!;
    expect(reports.steps).toHaveLength(REPORTS);
    expect(reports.steps.map((step) => step.board.reports?.gathered?.length ?? 0)).toEqual([
      0, 1, 2, 3, 3,
    ]);
  });
});

// --- F-0090-B: the glow, a soft layer ---------------------------------------------------------------

describe("F-0090-B · the glow is a soft layer whose opacity alone animates", () => {
  const css = readFileSync(join(process.cwd(), "src", "battlefield", "game.css"), "utf8");
  const keyframes = (name: string) =>
    new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? null;

  it("its keyframes change opacity and nothing else; no breath animates a shadow", () => {
    for (const name of ["gs-breathe-dim", "gs-breathe-bright"]) {
      const body = keyframes(name)!;
      expect(body).not.toBeNull();
      const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
      expect(new Set(props)).toEqual(new Set(["opacity"]));
    }
    // The old shadow keyframes are gone, and nothing animates with them.
    expect(css).not.toMatch(/@keyframes gs-breathe \{/);
    expect(css).not.toMatch(/animation[^;]*gs-breathe[ ,;]/);
  });

  it("the two halves are the two looks the shadow had, at its ends and middle", () => {
    // The rule that names each half's keyframes holds its shadow.
    const rule = (name: string) =>
      css.split("}").find((block) => block.includes(`animation-name: ${name};`)) ?? "";
    const dim = rule("gs-breathe-dim");
    const bright = rule("gs-breathe-bright");
    expect(dim).toContain("0 0 0 1.5px rgb(233 194 122 / 85%)");
    expect(dim).toContain("0 0 6px 1px rgb(255 205 110 / 35%)");
    expect(bright).toContain("0 0 0 1.5px #ffd98a");
    expect(bright).toContain("0 0 18px 5px rgb(255 205 110 / 75%)");
    // The card keeps the still part: its drop shadow.
    expect(css).toMatch(
      /\.gs-ztray-card\.gs-nameable \{\s*box-shadow: 0 4px 10px rgb\(0 0 0 \/ 45%\);/,
    );
  });

  it("a card you can pick has its glow layer right after it; picked, marked or paying, none", () => {
    const bears = card("card:1", 1, "Grizzly Bears");
    const lions = card("card:2", 1, "Savannah Lions");
    const giant = card("card:3", 1, "Hill Giant");
    const pay: PayMark = {
      word: "tap",
      tone: "tap",
      lean: true,
      actionId: "unpick:card:3",
    };
    const view = render(
      draw([bears, lions, giant], {
        choosable: new Set(["card:1", "card:2", "card:3"]),
        marked: ["card:2"],
        payPicks: new Map([["card:3", pay]]),
      }),
    );
    const c = view.container;
    expect(cardOf(c, "card:1").classList.contains("bf-breathes")).toBe(true);
    expect(breathOf(c, "card:1")).not.toBeNull();
    expect(breathOf(c, "card:1")!.getAttribute("aria-hidden")).toBe("true");
    for (const id of ["card:2", "card:3"]) {
      expect(breathOf(c, id)).toBeNull();
      expect(cardOf(c, id).classList.contains("bf-breathes")).toBe(false);
    }
    // Not choosable: no layer.
    view.rerender(draw([bears, lions, giant]));
    expect(c.querySelectorAll(".bf-breath")).toHaveLength(0);
  });

  it("a flyer marked to attack kept breathing and hovering before 0090: it still does", () => {
    const angel = flyer("card:5", 1, "Serra Angel");
    const c = render(
      draw([angel], { choosable: new Set(["card:5"]), marked: ["card:5"] }),
    ).container;
    const breath = breathOf(c, "card:5")!;
    expect(breath).not.toBeNull();
    // It hovers with its card: spec 0108, in the card's own bobbing wrapper
    // (one clock), and breathes from the same offset as the card's one
    // animation list had.
    const flight = cardOf(c, "card:5").closest<HTMLElement>(".bf-flight")!;
    expect(flight.classList.contains("bf-fly")).toBe(true);
    expect(breath.parentElement).toBe(flight);
    expect(breath.classList.contains("bf-fly")).toBe(false);
    expect(breath.style.getPropertyValue("--breath-delay")).toBe(flight.style.animationDelay);
  });

  it("in your hand, on the stack, and a tab: each its layer, a tab's in the tab's place", () => {
    const hand: BoardHandCard[] = [
      {
        id: "card:20",
        name: "Shock",
        kind: "other",
        types: "Instant",
        power: null,
        toughness: null,
        art: null,
        manaCost: "{R}",
      },
    ];
    const bears = card("card:1", 1, "Grizzly Bears");
    const sword = card("card:9", 1, "Bonesplitter", {
      kind: "other",
      types: "Artifact — Equipment",
      attachedTo: "card:1",
      power: null,
      toughness: null,
    });
    const stack: StackView[] = [
      { id: "stack:4", name: "Lightning Bolt", kind: "spell", source: null, targets: [], seat: 2 },
    ];
    const c = render(
      draw([bears, sword], { hand, stack, choosable: new Set(["card:20", "stack:4", "card:9"]) }),
    ).container;
    expect(breathOf(c, "card:20")).not.toBeNull();
    expect(breathOf(c, "stack:4")).not.toBeNull();
    const tab = c.querySelector<HTMLElement>('.bf-tag[data-object-id="card:9"]')!;
    const tabBreath = tab.nextElementSibling as HTMLElement;
    expect(tabBreath.className).toBe("bf-breath bf-breath-tag");
    expect(tabBreath.style.left).toBe(tab.style.left);
    expect(tabBreath.style.zIndex).toBe(tab.style.zIndex);
  });

  it("the layer plays its card's own movements (a flip, a lunge) from the same moment", () => {
    const host = document.createElement("button");
    const breath = document.createElement("span");
    breath.className = "bf-breath";
    const root = document.createElement("div");
    root.append(host, breath);
    const cancelled: string[] = [];
    let listener: (() => void) | null = null;
    const flip = {
      startTime: 1234,
      currentTime: 10,
      playbackRate: 2,
      playState: "running",
      effect: {
        getKeyframes: () => [
          {
            offset: 0,
            computedOffset: 0,
            easing: "linear",
            transform: "rotateY(0deg)",
            boxShadow: "x",
          },
          {
            offset: 1,
            computedOffset: 1,
            easing: "linear",
            transform: "rotateY(90deg)",
            opacity: "0",
          },
        ],
        getTiming: () => ({ duration: 760, delay: 0, fill: "both" }),
      },
      addEventListener: (_: string, fn: () => void) => (listener = fn),
    };
    // A CSS animation (a hover) is CSS's to play: left alone.
    const hover = { ...flip, animationName: "bf-fly" };
    host.getAnimations = () => [flip, hover] as unknown as Animation[];
    const made: { frames: Keyframe[]; timing: unknown; mirror: Record<string, unknown> }[] = [];
    breath.animate = (frames: Keyframe[], timing: unknown) => {
      const mirror: Record<string, unknown> = {
        startTime: null,
        currentTime: null,
        updatePlaybackRate: (r: number) => (mirror.rate = r),
        pause: () => {},
        cancel: () => cancelled.push("mirror"),
      };
      made.push({ frames, timing, mirror });
      return mirror as unknown as Animation;
    };
    followCards(root);
    followCards(root); // once only
    expect(made).toHaveLength(1);
    expect(made[0]!.frames).toEqual([
      { offset: 0, easing: "linear", transform: "rotateY(0deg)" },
      { offset: 1, easing: "linear", transform: "rotateY(90deg)", opacity: "0" },
    ]);
    expect(made[0]!.timing).toEqual({ duration: 760, delay: 0, fill: "both" });
    expect(made[0]!.mirror.startTime).toBe(1234);
    expect(made[0]!.mirror.rate).toBe(2);
    listener!();
    expect(cancelled).toEqual(["mirror"]);
  });

  it("the Board plays them on the layer after it draws (production calls it)", () => {
    (Element.prototype as unknown as { animate: unknown }).animate = () => ({});
    const seen: Element[] = [];
    (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
      this: Element,
    ) {
      if (!this.classList.contains("bf-card")) return [];
      seen.push(this);
      return [];
    };
    const c = render(
      draw([card("card:1", 1, "Grizzly Bears")], { choosable: new Set(["card:1"]) }),
    ).container;
    expect(seen).toContain(cardOf(c, "card:1"));
  });

  it("reduce motion: no layer shows (the card's still ring, as before)", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.bf-breath,[\s\S]*?display: none;/,
    );
    // The layer's still shadow is only for motion; reduce motion keeps the old ring.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.bf-card\.bf-choosable\.bf-breathes,/,
    );
  });
});

// --- F-0090-C: calmer flyers ------------------------------------------------------------------------

describe("F-0090-C · flyers in step above 12, still while the tab is hidden", () => {
  const delays = (c: ParentNode) =>
    [...c.querySelectorAll<HTMLElement>(".bf-flight.bf-fly")].map((el) => el.style.animationDelay);

  it("up to 12: each its own point in the bob; 13: all on one clock, and they stay so", () => {
    const view = render(draw(flyers(FLY_SYNC_AT)));
    const own = delays(view.container);
    expect(own).toHaveLength(FLY_SYNC_AT);
    expect(new Set(own).size).toBeGreaterThan(1);
    view.rerender(draw(flyers(FLY_SYNC_AT + 1)));
    expect(new Set(delays(view.container))).toEqual(new Set(["0ms"]));
    // The shadows go in step with them.
    const shadows = [...view.container.querySelectorAll<HTMLElement>(".bf-fly-shadow")];
    expect(new Set(shadows.map((s) => s.style.animationDelay))).toEqual(new Set(["0ms"]));
    // Fewer again: still in step (going out of step would jump them).
    view.rerender(draw(flyers(5)));
    expect(new Set(delays(view.container))).toEqual(new Set(["0ms"]));
    // None left, then a few: each its own again.
    view.rerender(draw([]));
    view.rerender(draw(flyers(4)));
    expect(new Set(delays(view.container)).size).toBeGreaterThan(1);
  });

  function fakeFlying(names: string[]) {
    return names.map((animationName) => {
      const a = {
        animationName,
        startTime: 777 as number | null,
        playState: "running",
        pause() {
          a.playState = "paused";
          a.startTime = null;
        },
        play() {
          a.playState = "running";
          a.startTime = 999;
        },
      };
      return a;
    });
  }

  it("in step: every hover's clock starts at the page's zero; a glow is left alone", () => {
    const list = fakeFlying(["bf-fly", "bf-fly-bob", "bf-fly-shadow", "gs-breathe-dim"]);
    const root = { getAnimations: () => list } as unknown as Element;
    bobInStep(root);
    expect(list.map((a) => a.startTime)).toEqual([0, 0, 0, 777]);
  });

  it("the tab hidden: no flyer bobs; shown again, they go on", () => {
    const list = fakeFlying(["bf-fly", "bf-fly-shadow", "gs-breathe-bright"]);
    const root = { getAnimations: () => list } as unknown as Element;
    pauseFlyers(root, true);
    expect(list.map((a) => a.playState)).toEqual(["paused", "paused", "running"]);
    pauseFlyers(root, false);
    expect(list.map((a) => a.playState)).toEqual(["running", "running", "running"]);
  });

  it("the Board does both: in step after drawing, and on the tab's visibility (production calls it)", () => {
    const list = fakeFlying(["bf-fly", "bf-fly", "bf-fly-shadow"]);
    (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (
      this: Element,
    ) {
      return this.classList.contains("bf-board") ? list : [];
    };
    render(draw(flyers(FLY_SYNC_AT + 3)));
    expect(list.map((a) => a.startTime)).toEqual([0, 0, 0]);
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(list.every((a) => a.playState === "paused")).toBe(true);
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(list.every((a) => a.playState === "running")).toBe(true);
    // Shown again, back in step.
    expect(list.map((a) => a.startTime)).toEqual([0, 0, 0]);
  });
});
