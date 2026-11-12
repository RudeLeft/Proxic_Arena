// @vitest-environment jsdom

// Spec 0076 -- counters and the Ring-bearer as picture badges (owner
// 2026-11-12, option A on the canvas counters-1112): one round badge per
// kind, picture + colour + number ("1" too), stacked up from the lower-left
// corner; four or more kinds fold past the third into "··· N"; the
// Ring-bearer is a gold ring in a gold-rimmed square, no word; the words
// stay in pointing and the close-up (F-0076-A..E). The real geometry at
// every card size is the e2e sweep's (battlefield.spec.ts, F-0076-D).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot, SnapshotCard } from "../match";
import { Board, type BoardCard } from "./Board";
import {
  BADGE_FLOOR,
  BADGE_FLOOR_MANA,
  BADGE_H,
  BADGE_ROOF,
  BADGE_ROOF_PILE,
  COUNTER_KIND,
  MARK_H,
  OTHER_COLOUR,
  STATE_BAND,
  ZZZ_BAND,
  placeBadges,
} from "./CardBadges";
import { Inspect } from "./GameScreen";

const size = { width: 1920, height: 1080 };
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let next = 1;
function permanent(over: Partial<BoardCard>): BoardCard {
  return {
    id: `card:${next++}`,
    seat: 1,
    name: "Grizzly Bears",
    kind: "creature",
    types: "Creature — Bear",
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
    art: null,
    ...over,
  };
}

function draw(battlefield: BoardCard[]) {
  return render(<Board battlefield={battlefield} hand={[]} viewerSeat={1} artUrl={(a) => a} />)
    .container;
}

const cardOf = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!;

describe("spec 0076 -- counters and the Ring-bearer as pictures", () => {
  it("F-0076-A: +1/+1 x2 and stun are two picture badges, 2 and 1, no word pill", () => {
    const bears = permanent({
      power: 4,
      toughness: 4,
      counters: [
        { name: "STUN", count: 1 },
        { name: "P1P1", count: 2 },
      ],
    });
    const c = draw([bears]);
    const card = cardOf(c, bears.id);
    const badges = [...card.querySelectorAll<HTMLElement>(".bf-badges .bf-badge")];
    // +1/+1 first (it changes power/toughness), then the rest.
    expect(badges.map((b) => b.dataset.counter)).toEqual(["P1P1", "STUN"]);
    expect(badges.map((b) => b.querySelector(".bf-badge-n")!.textContent)).toEqual(["2", "1"]);
    // Each a picture and its colour: green up-arrow, yellow star.
    expect(badges[0]!.style.getPropertyValue("--k")).toBe(COUNTER_KIND.P1P1!.colour);
    expect(badges[0]!.querySelector("svg path")!.getAttribute("d")).toBe(
      "M4 13.5 L10 6.5 L16 13.5",
    );
    expect(badges[1]!.style.getPropertyValue("--k")).toBe(COUNTER_KIND.STUN!.colour);
    expect(badges[1]!.querySelector("svg path")!.getAttribute("d")).toMatch(/^M10 1\.5 L11\.9/);
    // No word pill, no counter word anywhere on the card's face.
    expect(card.querySelector(".bf-counters")).toBeNull();
    expect(card.textContent).not.toMatch(/\+1\/\+1|Stun/);
    // The card's name for a screen reader still says them.
    expect(card.getAttribute("aria-label")).toContain("2 +1/+1 counters");
    expect(card.getAttribute("aria-label")).toContain("1 Stun counter");
  });

  it("F-0076-A: a kind not drawn yet is grey with its first letters", () => {
    const lions = permanent({ counters: [{ name: "Vigilance", count: 1 }] });
    const badge = cardOf(draw([lions]), lions.id).querySelector<HTMLElement>(".bf-badge")!;
    expect(badge.style.getPropertyValue("--k")).toBe(OTHER_COLOUR);
    expect(badge.querySelector("svg text")!.textContent).toBe("Vi");
    expect(badge.querySelector(".bf-badge-n")!.textContent).toBe("1");
  });

  it("F-0076-B: four or more kinds -- three badges, then '··· N'; pointing lists all", () => {
    const angel = permanent({
      name: "Serra Angel",
      counters: [
        { name: "SHIELD", count: 1 },
        { name: "STUN", count: 3 },
        { name: "OIL", count: 2 },
        { name: "CHARGE", count: 4 },
        { name: "TIME", count: 1 },
      ],
    });
    const card = cardOf(draw([angel]), angel.id);
    const badges = [...card.querySelectorAll<HTMLElement>(".bf-badge")];
    expect(badges.map((b) => b.dataset.counter)).toEqual(["CHARGE", "STUN", "OIL", "more"]);
    const more = badges[3]!;
    expect(more.classList.contains("bf-badge-more")).toBe(true);
    expect(more.querySelector(".bf-badge-n")!.textContent).toBe("2");
    expect(more.querySelectorAll("svg circle")).toHaveLength(3);
    const title = card.querySelector(".bf-badges")!.getAttribute("title")!.split("\n");
    expect(title).toEqual([
      "4 Charge counters",
      "3 Stun counters",
      "2 Oil counters",
      "1 Shield counter",
      "1 Time counter",
    ]);
    // Three kinds exactly: no fold.
    const three = permanent({
      counters: [
        { name: "SHIELD", count: 1 },
        { name: "STUN", count: 3 },
        { name: "OIL", count: 2 },
      ],
    });
    expect(cardOf(draw([three]), three.id).querySelector(".bf-badge-more")).toBeNull();
  });

  it("F-0076-C: the Ring-bearer is a gold ring in a gold-rimmed square, no word", () => {
    const frodo = permanent({ name: "Frodo, Sauron's Bane", ringBearer: true });
    const card = cardOf(draw([frodo]), frodo.id);
    const ring = card.querySelector(".bf-badges .bf-mark.bf-mark-ring")!;
    expect(ring).not.toBeNull();
    expect(ring.querySelectorAll("svg ellipse")).toHaveLength(2);
    expect(ring.textContent).toBe("");
    expect(card.querySelector(".bf-ring")).toBeNull();
    expect(card.textContent).not.toContain("Ring-bearer");
    expect(card.querySelector(".bf-badges")!.getAttribute("title")).toBe("Ring-bearer");
    expect(card.getAttribute("aria-label")).toContain("Ring-bearer");
  });

  it("F-0076-D: badges never sit under or over the state word, zZz, x N, mana or name", () => {
    const soldier = () =>
      permanent({
        name: "Soldier",
        token: true,
        types: "Token Creature — Soldier",
        counters: [{ name: "P1P1", count: 1 }],
      });
    const pile = [soldier(), soldier(), soldier()];
    const saga = permanent({
      name: "Urza's Saga",
      kind: "land",
      types: "Enchantment Land — Urza's Saga",
      power: null,
      toughness: null,
      makes: ["C"],
      counters: [{ name: "LORE", count: 2 }],
    });
    const c = draw([...pile, saga]);
    const lead = c.querySelector<HTMLElement>('button[data-pile="3"]')!;
    expect(lead.querySelector(".bf-pile")!.textContent).toBe("×3");
    expect(lead.querySelector(".bf-badge-n")!.textContent).toBe("1");
    // Per card: the pile's badge says "on each".
    expect(lead.querySelector(".bf-badges")!.getAttribute("title")).toBe("1 +1/+1 counter on each");
    const land = cardOf(c, saga.id);
    expect(land.querySelector(".bf-makes")).not.toBeNull();
    // Loyalty stays the planeswalker's number, never a badge.
    const walker = permanent({
      name: "Ajani Goldmane",
      kind: "other",
      types: "Legendary Planeswalker — Ajani",
      power: null,
      toughness: null,
      counters: [{ name: "LOYALTY", count: 4 }],
    });
    const w = cardOf(draw([walker]), walker.id);
    expect(w.querySelector(".bf-badges")).toBeNull();
    expect(w.getAttribute("data-pt")).toBe("4");

    // The bands the badges keep clear of are the marks' own boxes, read
    // from battlefield.css (fractions of the card's height; a 1px border is
    // 0.0104 of the smallest card, 96px).
    const css = readFileSync(join(process.cwd(), "src", "battlefield", "battlefield.css"), "utf-8");
    // Every rule that names the selector alone, in order (".bf-pile" has three).
    const rule = (sel: string) => {
      const all = [
        ...css.matchAll(new RegExp(`\\n${sel.replace(/\./g, "\\.")} \\{([^}]*)\\}`, "g")),
      ];
      expect(all.length, sel).toBeGreaterThan(0);
      return all.map((m) => m[1]!).join("\n");
    };
    const frac = (body: string, prop: string) =>
      Number(
        new RegExp(`\\n\\s*${prop}: calc\\(var\\(--card-h\\) \\* ([0-9.]+)\\)`).exec(body)![1],
      );
    const px = 1 / 96;
    const tag = 0.07 * 1.44 + 2 * px; // .bf-state: font 0.07, padding 0.22em, borders
    expect(rule(".bf-state")).toMatch(/top: 50%/);
    expect(STATE_BAND[0]).toBeLessThanOrEqual(0.5 - tag / 2);
    expect(STATE_BAND[1]).toBeGreaterThanOrEqual(0.5 + tag / 2);
    const zz = rule(".bf-zz");
    expect(ZZZ_BAND[0]).toBeLessThanOrEqual(1 - frac(zz, "top") - frac(zz, "height"));
    expect(ZZZ_BAND[1]).toBeGreaterThanOrEqual(1 - frac(zz, "top"));
    const bar = frac(rule(".bf-bar"), "height");
    expect(BADGE_FLOOR).toBeGreaterThan(bar);
    expect(BADGE_ROOF).toBeLessThanOrEqual(1 - bar);
    expect(BADGE_ROOF_PILE).toBeLessThanOrEqual(1 - frac(rule(".bf-pile"), "top") - tag);
    expect(BADGE_FLOOR_MANA).toBeGreaterThanOrEqual(0.18 + 0.13 + 2 * 0.02 + 2 * px);
    expect(frac(rule(".bf-badge"), "height")).toBe(BADGE_H);
    expect(rule(".bf-badge-n")).toMatch(/calc\(var\(--card-h\) \* 0\.098\)/);
    expect(frac(rule(".bf-mark"), "width")).toBe(MARK_H);

    // Where each badge stands, read back from the page: no badge in a band
    // a mark on that card has, none above the roof, none over another.
    const stands = (card: HTMLElement) =>
      [...card.querySelectorAll<HTMLElement>(".bf-badge-col")].flatMap((col, column) => {
        let top = 0;
        return [...col.querySelectorAll<HTMLElement>(".bf-badge-at")].map((at) => {
          const below = Number(/\* (-?[0-9.]+)\)/.exec(at.style.marginBottom)![1]);
          const h = at.querySelector(".bf-mark") ? MARK_H : BADGE_H;
          const y = top + below;
          top = y + h;
          return { column, y, top: y + h, below };
        });
      });
    const clear = (
      card: HTMLElement,
      bands: (readonly [number, number])[],
      floor: number,
      roof: number,
    ) => {
      const at = stands(card);
      expect(at.length).toBeGreaterThan(0);
      for (const b of at) {
        expect(b.below).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(floor - 1e-6);
        expect(b.top).toBeLessThanOrEqual(roof + 1e-6);
        for (const [lo, hi] of bands) expect(b.y >= hi - 1e-6 || b.top <= lo + 1e-6).toBe(true);
      }
      expect(Math.max(...at.map((b) => b.column))).toBeLessThan(2);
      return at;
    };
    // The coordinator's case: an attacking card with four kinds -- every
    // badge whole, the ATTACKING word clear, a second column to the right.
    const corpse = permanent({
      name: "Walking Corpse",
      seat: 2,
      attacking: true,
      tapped: true,
      counters: [
        { name: "P1P1", count: 1 },
        { name: "CHARGE", count: 3 },
        { name: "SHIELD", count: 1 },
        { name: "OIL", count: 12 },
      ],
    });
    const attacking = cardOf(draw([corpse]), corpse.id);
    expect(attacking.querySelector(".bf-state")!.textContent).toBe("ATTACKING");
    const placed = clear(attacking, [STATE_BAND], BADGE_FLOOR, BADGE_ROOF);
    expect(placed).toHaveLength(4);
    expect(placed.map((b) => b.column)).toEqual([0, 0, 1, 1]);
    // Tapped, came in this turn, a Ring-bearer too: over the zZz as well.
    const sick = permanent({
      tapped: true,
      sick: true,
      ringBearer: true,
      counters: [
        { name: "STUN", count: 2 },
        { name: "P1P1", count: 1 },
      ],
    });
    const s = cardOf(draw([sick]), sick.id);
    expect(s.querySelector(".bf-zz")).not.toBeNull();
    expect(clear(s, [STATE_BAND, ZZZ_BAND], BADGE_FLOOR, BADGE_ROOF)).toHaveLength(3);
    // A pile: below its x N; a land: above its mana symbols.
    clear(lead, [], BADGE_FLOOR, BADGE_ROOF_PILE);
    clear(land, [], BADGE_FLOOR_MANA, BADGE_ROOF);
    // No room for everything (a tapped pile that came in this turn, with
    // four kinds): fewer shown, the rest in "··· N", still nothing covered.
    const crowd = () =>
      permanent({
        name: "Soldier",
        token: true,
        tapped: true,
        sick: true,
        counters: [
          { name: "P1P1", count: 1 },
          { name: "CHARGE", count: 3 },
          { name: "SHIELD", count: 1 },
          { name: "OIL", count: 2 },
        ],
      });
    const tight = draw([crowd(), crowd()]).querySelector<HTMLElement>('button[data-pile="2"]')!;
    clear(tight, [STATE_BAND, ZZZ_BAND], BADGE_FLOOR, BADGE_ROOF_PILE);
    expect(tight.querySelector(".bf-badge-more .bf-badge-n")!.textContent).toBe("3");
    expect(
      placeBadges([BADGE_H, BADGE_H, BADGE_H], {
        pile: true,
        mana: false,
        state: true,
        zzz: true,
        zone: false,
      }),
    ).toBeNull();
  });

  it("F-0076-E: pointing and the close-up keep spec 0045's words", () => {
    const from = [
      {
        counter: "P1P1",
        added: 1,
        from: "Ajani's Pridemate's trigger: Pat gained 1 life (Soul Warden)",
      },
    ];
    const mate = permanent({
      name: "Ajani's Pridemate",
      counters: [{ name: "P1P1", count: 2 }],
      counterFrom: from,
    });
    const words =
      "2 +1/+1 counters, the last from Ajani's Pridemate's trigger: Pat gained 1 life (Soul Warden)";
    const card = cardOf(draw([mate]), mate.id);
    expect(card.querySelector(".bf-badges")!.getAttribute("title")).toBe(words);

    const snap = {
      ...mate,
      manaCost: "{1}{W}",
      damage: 0,
      ringBearer: false,
      sector: null,
      sprocket: null,
      enteredAt: null,
      token: false,
    } as unknown as SnapshotCard;
    const closeUp = render(
      <Inspect
        card={snap}
        name="Ajani's Pridemate"
        costNow={null}
        artUrl={(a) => a}
        board={
          {
            seat: 1,
            battlefield: [snap],
            hand: [],
            graveyard: [],
            exile: [],
            otherHands: [],
            stack: [],
            casting: [],
            players: [{ seat: 1, name: "Pat" }],
          } as unknown as Snapshot
        }
        mySeat={1}
        onClose={vi.fn()}
      />,
    ).container;
    expect([...closeUp.querySelectorAll(".gs-inspect-counter")].map((p) => p.textContent)).toEqual([
      words,
    ]);
  });
});
