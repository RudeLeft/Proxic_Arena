// The card being cast waits at its stack spot, in a real game -- spec 0110
// (F-0110-F), AGENTS TEST-012.
//
// Dealt (spec 0098): the host (Alice) holds Swamps, Victim of Night and
// Disfigure; the guest (Bob) Plains, Islands, Elite Vanguard and Gryff Vanguard. With
// one creature in its line, Gryff Vanguard stands in the middle of the
// table, where the old middle card (spec 0068) covered it at 1920x1080.
//
// 1. The host REALLY clicks Victim of Night in hand. Its big card is at the
//    stack column (its centre right of the table's centre, its box off the
//    table's middle) and Gryff Vanguard's box is not covered. The host REALLY
//    clicks Gryff Vanguard (realClick: a point inside the visible card), then
//    REALLY clicks two Swamps (Forge's Victim of Night is {B}{B}); the card stays where it is while it is paid.
//    On the guest's page, while it is paid, the card's back waits at the
//    same stack column, off the middle.
// 2. With Victim of Night on the stack (one entry), the host REALLY clicks
//    Disfigure: its big card waits at the next slot (the stack column's
//    right edge, lower than the entry under it), and on the guest's page the
//    back does too. Aimed at Elite Vanguard (a real click) and paid with a
//    real click on a Swamp.
// 3. Both settle into the stack and resolve: Elite Vanguard and Gryff
//    Vanguard go to the guest's graveyard.
//
// Every wait is on a state (the question there, the stack's count, the
// graveyard's count, the card's own animations over), never an animation's
// length. The deck is protocol/fixtures/cast-at-stack-deck. CI builds it;
// locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/cast-at-stack-deck.zip" protocol/fixtures/cast-at-stack-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  cardCount,
  clearEverything,
  clickNow,
  discardIfAsked,
  matchPanel,
  passButton,
  passCombat,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "cast-at-stack-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

/** A hand card the page lights (its text starts with its cost's digits: no ^ in [name]). */
const lit = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const onBoard = (page: Page, side: "viewer" | "opponent", name: RegExp) =>
  boardCards(page, side).filter({ hasText: name });
const choosableOn = (page: Page, side: "viewer" | "opponent", name: RegExp) =>
  onBoard(page, side, name).and(page.locator('[data-choosable="true"]'));
const stepOf = async (page: Page) =>
  (
    (await page
      .locator(".gs-steps")
      .getAttribute("data-step")
      .catch(() => "")) ?? ""
  ).trim();
const stackCount = (page: Page) => page.locator('button[data-zone="stack"]').count();
const priorityHere = async (page: Page) =>
  (await matchPanel(page)
    .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
    .count()) > 0;
/** Untapped Swamps: identical lands stack, so a pile counts its members (cardCount). */
const untappedSwamps = (page: Page) =>
  cardCount(
    boardCards(page, "viewer")
      .and(page.locator('[data-tapped="false"]'))
      .filter({ hasText: /^Swamp/ }),
  );
const graveCount = async (page: Page, side: "viewer" | "opponent") =>
  Number(
    (await page.locator(`[data-zone-tile="${side}:graveyard"] .gs-zone-n`).allTextContents())[0] ??
      0,
  );

/** The card being cast, risen and still: none of its own animations running. */
const risen = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
    return !!el && el.getAnimations().every((a) => a.playState !== "running" && !a.pending);
  });

type Rect = { x: number; y: number; w: number; h: number };
type Place = {
  /** The casting card's own box (its place, not the sway). */
  card: Rect;
  back: boolean;
  label: string;
  /** The play area's right edge (the rail's left) and the table's middle point. */
  playRight: number;
  middle: { x: number; y: number };
  /** The stack entries as drawn, top of the stack first. */
  stack: Rect[];
  /** Named cards' boxes on the board, and how much of each the casting card covers (0..1). */
  covered: Record<string, number>;
};

/** Where the casting card is, read in one evaluation, with what it covers. */
const placeOf = (page: Page, names: string[]) =>
  page.evaluate((names): Place | null => {
    const el = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const card = { x: r.x, y: r.y, w: r.width, h: r.height };
    const rail = document.querySelector<HTMLElement>(".gs-rail")?.getBoundingClientRect();
    const playRight = rail ? rail.left : window.innerWidth;
    const share = (b: DOMRect) => {
      const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      return w > 0 && h > 0 ? (w * h) / (b.width * b.height) : 0;
    };
    const covered: Record<string, number> = {};
    for (const button of document.querySelectorAll<HTMLElement>(
      '.bf-cards button[data-object-id][data-controller]:not([data-zone$=":hand"])',
    )) {
      const text = button.textContent ?? "";
      const name = names.find((n) => text.startsWith(n));
      if (name) covered[name] = Math.max(covered[name] ?? 0, share(button.getBoundingClientRect()));
    }
    const stack = [...document.querySelectorAll<HTMLElement>('button[data-zone="stack"]')]
      .sort((a, b) => Number(a.dataset.order ?? 0) - Number(b.dataset.order ?? 0))
      .map((b) => {
        const s = b.getBoundingClientRect();
        return { x: s.x, y: s.y, w: s.width, h: s.height };
      });
    return {
      card,
      back: !!el.querySelector(".gs-cast-back"),
      label: el.getAttribute("aria-label") ?? "",
      playRight,
      middle: { x: playRight / 2, y: window.innerHeight / 2 },
      stack,
      covered,
    };
  }, names);

/** The card at its place, once it has risen there (polled: a state, not a wait). */
async function settledPlace(page: Page, names: string[], timeout = 15_000): Promise<Place> {
  await expect
    .poll(() => risen(page), { timeout, message: "the cast card's rise ended" })
    .toBe(true);
  const place = await placeOf(page, names);
  expect(place, "a casting card is drawn").not.toBeNull();
  return place!;
}

const NAMES = ["Gryff Vanguard", "Elite Vanguard"];

/** At the stack column: right of the table's middle, off it, inside the play area. */
function atStackColumn(place: Place, what: string) {
  const { card, middle, playRight } = place;
  expect(card.x + card.w / 2, `${what}: its centre is right of the table's centre`).toBeGreaterThan(
    middle.x,
  );
  expect(card.x, `${what}: its box is off the table's middle`).toBeGreaterThan(middle.x);
  expect(card.x + card.w, `${what}: inside the play area, never on the rail`).toBeLessThanOrEqual(
    playRight + 0.5,
  );
}

function contexts(browser: import("@playwright/test").Browser) {
  const viewport = { width: 1920, height: 1080 };
  return (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS
        ? { recordVideo: { dir: join(CLIPS, `cast-at-stack-${name}`), size: viewport } }
        : {}),
    });
}

test("the card being cast waits big at its stack spot through target and payment, on both pages; the middle stays clear", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no cast-at-stack deck package (CI builds it)");
  mkdirSync(SHOTS, { recursive: true });
  const context = contexts(browser);
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    const of = (name: string, n: number) => Array.from({ length: n }, () => name);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: ["Swamp", "Swamp", "Victim of Night", "Swamp", "Disfigure", "Swamp", "Swamp"],
          top: of("Swamp", 10),
        },
        guest: {
          // Gryff Vanguard is blue ({4}{U}); Elite Vanguard white.
          hand: [
            "Plains",
            "Elite Vanguard",
            "Island",
            "Island",
            "Gryff Vanguard",
            "Island",
            "Island",
          ],
          // The deck has twelve Islands: four in hand, four more on top.
          top: [...of("Island", 4), ...of("Plains", 6)],
        },
      },
    });

    const st = {
      victimClicked: false,
      first: null as null | { host: Place; guest: Place | null; paid: Place[] },
      gryffAimed: false,
      disfigureClicked: false,
      second: null as null | { host: Place; guest: Place | null },
      eliteAimed: false,
      resolved: false,
      swampsClicked: 0,
    };
    const done = () => st.resolved;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => st);

    /** The guest's view of the host's cast: the back at its place, once risen. */
    const guestSees = async (): Promise<Place | null> => {
      const ok = await expect
        .poll(async () => (await placeOf(guest, NAMES))?.back === true && (await risen(guest)), {
          timeout: 10_000,
        })
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      return ok ? placeOf(guest, NAMES) : null;
    };

    while (!done() && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // --- the targets: measured once each, then a real click.
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        if (isHost && (await targeting.count()) > 0) {
          const from = (await targeting.allTextContents()).join(" ");
          if (/Victim of Night/.test(from) && !st.gryffAimed) {
            if (!st.first && (await onBoard(host, "opponent", /^Gryff Vanguard/).count()) > 0) {
              const place = await settledPlace(host, NAMES);
              const seen = await guestSees();
              await host.screenshot({ path: join(SHOTS, "0110-1-victim-target-host.png") });
              await guest.screenshot({ path: join(SHOTS, "0110-1-victim-target-guest.png") });
              st.first = { host: place, guest: seen, paid: [] };
            }
            const pick = choosableOn(host, "opponent", /^Gryff Vanguard/);
            if ((await pick.count()) > 0) {
              if (await realClick(host, pick.first())) st.gryffAimed = true;
              continue;
            }
          }
          if (/Disfigure/.test(from) && !st.eliteAimed) {
            if (!st.second) {
              const place = await settledPlace(host, NAMES);
              const seen = await guestSees();
              await host.screenshot({ path: join(SHOTS, "0110-2-disfigure-next-slot-host.png") });
              await guest.screenshot({ path: join(SHOTS, "0110-2-disfigure-next-slot-guest.png") });
              st.second = { host: place, guest: seen };
            }
            const pick = choosableOn(host, "opponent", /^Elite Vanguard/);
            if ((await pick.count()) > 0) {
              if (await realClick(host, pick.first())) st.eliteAimed = true;
              continue;
            }
          }
          const cancel = panel.locator("button.gs-act-cancel");
          if ((await cancel.count()) > 0) {
            console.log(`0110: backed out of an unplanned target question: ${from.slice(0, 80)}`);
            await clickNow(cancel);
            if (!st.gryffAimed) st.victimClicked = false;
            else if (!st.eliteAimed) st.disfigureClicked = false;
            continue;
          }
        }

        // --- paying: a real click on a Swamp the page lights.
        if (isHost && (await panel.locator('[data-kind="applyManaToCost"]').count()) > 0) {
          const swamp = host.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
            { hasText: /^Swamp/ },
          );
          if ((await swamp.count()) > 0) {
            if (st.first && !st.second && st.gryffAimed) {
              const now = await placeOf(host, NAMES);
              if (now) st.first.paid.push(now);
              if (st.first.paid.length === 2) {
                await host.screenshot({ path: join(SHOTS, "0110-1-victim-paying-host.png") });
                await guest.screenshot({ path: join(SHOTS, "0110-1-victim-paying-guest.png") });
              }
            }
            if (await realClick(host, swamp.first())) st.swampsClicked += 1;
            continue;
          }
        }
        // The guest pays for its creatures with its lands.
        if (!isHost && (await panel.locator('[data-kind="applyManaToCost"]').count()) > 0) {
          const plains = guest.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
          );
          if ((await plains.count()) > 0) {
            await realClick(guest, plains.first());
            continue;
          }
        }

        // --- the end: both resolved, both creatures in the guest's graveyard.
        if (isHost && st.eliteAimed && !st.resolved) {
          if (
            (await stackCount(host)) === 0 &&
            (await onBoard(host, "opponent", /^Gryff Vanguard/).count()) === 0 &&
            (await onBoard(host, "opponent", /^Elite Vanguard/).count()) === 0 &&
            (await graveCount(host, "opponent")) >= 2
          ) {
            st.resolved = true;
            await host.screenshot({ path: join(SHOTS, "0110-3-resolved-host.png") });
            await guest.screenshot({ path: join(SHOTS, "0110-3-resolved-guest.png") });
            break;
          }
        }

        // --- the second cast: Disfigure with Victim of Night on the stack.
        if (
          isHost &&
          st.gryffAimed &&
          !st.disfigureClicked &&
          (await stackCount(host)) === 1 &&
          (await priorityHere(host)) &&
          (await lit(host, /Disfigure/).count()) > 0
        ) {
          if (await realClick(host, lit(host, /Disfigure/))) st.disfigureClicked = true;
          continue;
        }

        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if (!(await priorityHere(page))) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else if ((await passButton(page).count()) > 0) await clickNow(passButton(page));
          continue;
        }

        const main = /Main/.test(await stepOf(page));
        const empty = (await stackCount(page)) === 0;
        let pick = null as null | ReturnType<typeof lit>;
        if (main && empty && isHost) {
          const land = lit(page, /Swamp/);
          if ((await land.count()) > 0) pick = land;
          else if (
            !st.victimClicked &&
            (await onBoard(page, "opponent", /^Gryff Vanguard/).count()) > 0 &&
            (await onBoard(page, "opponent", /^Elite Vanguard/).count()) > 0 &&
            (await untappedSwamps(page)) >= 4 &&
            (await lit(page, /Victim of Night/).count()) > 0
          ) {
            if (await realClick(page, lit(page, /Victim of Night/))) st.victimClicked = true;
            continue;
          }
        }
        if (main && empty && !isHost) {
          const land = lit(page, /Plains|Island/);
          if ((await land.count()) > 0) pick = land;
          else if ((await lit(page, /Elite Vanguard/).count()) > 0)
            pick = lit(page, /Elite Vanguard/);
          else if ((await lit(page, /Gryff Vanguard/).count()) > 0)
            pick = lit(page, /Gryff Vanguard/);
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick.first());
        else await clickNow(passButton(page));
      }
    }

    console.log(`0110 game: ${JSON.stringify(st)}`);
    // 1. Victim of Night at the stack column, Gryff Vanguard uncovered.
    expect(st.first, "Victim of Night asked for its target").not.toBeNull();
    const first = st.first!;
    expect(first.host.label).toBe("Being cast: Victim of Night");
    atStackColumn(first.host, "Victim of Night (host)");
    expect(
      first.host.covered["Gryff Vanguard"] ?? -1,
      "Gryff Vanguard is drawn",
    ).toBeGreaterThanOrEqual(0);
    expect(first.host.covered["Gryff Vanguard"], "Gryff Vanguard is not covered").toBe(0);
    expect(first.host.stack, "nothing on the stack yet").toHaveLength(0);
    // Paid where it waits: it never moved for the Swamps.
    expect(first.paid.length, "the payment was read").toBeGreaterThan(0);
    for (const p of first.paid) {
      expect(Math.abs(p.card.x - first.host.card.x), "still there while paid (x)").toBeLessThan(
        1.5,
      );
      expect(Math.abs(p.card.y - first.host.card.y), "still there while paid (y)").toBeLessThan(
        1.5,
      );
    }
    // The guest's view: the back, at the same column, off the middle.
    expect(first.guest, "the guest saw the host's card being cast").not.toBeNull();
    expect(first.guest!.back, "the guest sees its back").toBe(true);
    atStackColumn(first.guest!, "Victim of Night (guest's view)");
    expect(
      Math.abs(first.guest!.card.x - first.host.card.x),
      "the same spot on both pages",
    ).toBeLessThan(1.5);
    // 2. Disfigure at the next slot, over the one entry.
    expect(st.second, "Disfigure was cast with Victim of Night on the stack").not.toBeNull();
    const second = st.second!;
    expect(second.host.label).toBe("Being cast: Disfigure");
    atStackColumn(second.host, "Disfigure (host)");
    expect(second.host.stack, "one entry on the stack under it").toHaveLength(1);
    const entry = second.host.stack[0]!;
    expect(
      Math.abs(second.host.card.x + second.host.card.w - (entry.x + entry.w)),
      "its right edge on the stack column's",
    ).toBeLessThan(2);
    expect(
      second.host.card.y + second.host.card.h / 2,
      "the next slot: lower than the entry it waits over",
    ).toBeGreaterThan(entry.y + entry.h / 2);
    expect(second.host.card.y, "a slot lower than the first cast's").toBeGreaterThan(
      first.host.card.y,
    );
    expect(second.guest, "the guest saw the second cast").not.toBeNull();
    atStackColumn(second.guest!, "Disfigure (guest's view)");
    // 3. Resolved.
    // Victim of Night is {B}{B} in Forge (the spec's "three Swamps" read
    // {1}{B}{B}): two Swamps for it, one for Disfigure.
    expect(st.swampsClicked, "two Swamps and one more really clicked").toBeGreaterThanOrEqual(3);
    expect(st.resolved, "both resolved: Gryff and Elite Vanguard in the graveyard").toBe(true);
  } finally {
    await host.screenshot({ path: join(SHOTS, "0110-last-host.png") }).catch(() => undefined);
    await guest.screenshot({ path: join(SHOTS, "0110-last-guest.png") }).catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
