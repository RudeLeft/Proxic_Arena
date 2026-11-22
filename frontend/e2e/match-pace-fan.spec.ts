// The pile fan's "+N", in a real game -- spec 0106 (F-0106-I), AGENTS
// TEST-012.
//
// 1. The host casts Glimpse the Unthinkable at itself (real clicks: the hand
//    card, its own life as the target, the lands that pay). Its library is
//    dealt (spec 0098) so the ten cards it mills are nine or ten flashback
//    spells (Think Twice, Deep Analysis, Dream Twist), whoever went first:
//    more than the fan's seven places.
// 2. The host's fan shows six cards and a "+N" in the seventh place, N the
//    cards not shown; the host REALLY clicks the "+N" (a mouse click at its
//    centre, `realClick`) and the pile viewer opens on its graveyard.
// 3. Amendment 1 (owner 2026-11-19, "cast from the viewer"): on its move,
//    with no "Your move" window over the table, the host's castable cards
//    breathe in that viewer; it REALLY clicks one (one behind the "+N" when
//    there is one), the viewer closes, and the card goes on the stack.
//
// Pace is checked by the page tests (F-0106-A, B), not here: this waits on
// states (the "+N" there, the viewer open, the card on the stack), never on
// how long a movement took. The deck is protocol/fixtures/pace-fan-deck. CI
// builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/pace-fan-deck.zip" protocol/fixtures/pace-fan-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  clearEverything,
  clickIf,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  isAsked,
  matchPanel,
  passButton,
  passCombat,
  PAYING,
  realClick,
  sharedDeck,
  startAMatch,
  TARGETING,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "pace-fan-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

const LANDS = /^(Island|Swamp)/;
const inHand = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const fanCardsOf = (page: Page) => page.locator('[data-fan-side="viewer"][data-fan-card]');
const moreOf = (page: Page) => page.locator('[data-fan-more="viewer"]');

test("past seven places the fan shows six and a +N; a real click opens the pile, and a fan card is really cast", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no pace-fan deck package (CI builds it)");
  const viewport = { width: 1920, height: 1080 };
  const context = (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, name), size: viewport } } : {}),
    });
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    // The host's flashback spells: the mill takes them (after one or two draws).
    const flashback = [
      "Think Twice",
      "Deep Analysis",
      "Dream Twist",
      "Think Twice",
      "Deep Analysis",
      "Dream Twist",
      "Think Twice",
      "Deep Analysis",
      "Dream Twist",
      "Think Twice",
      "Deep Analysis",
      "Dream Twist",
    ];
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Island",
            "Swamp",
            "Glimpse the Unthinkable",
            "Island",
            "Swamp",
            "Island",
            "Swamp",
          ],
          top: ["Island", "Island", ...flashback, "Island", "Swamp", "Island"],
        },
        // Lands only, so it never answers anything.
        guest: {
          hand: ["Island", "Island", "Island", "Swamp", "Swamp", "Swamp", "Island"],
          top: ["Island", "Swamp", "Island", "Swamp", "Island", "Swamp", "Island", "Swamp"],
        },
      },
    });

    let glimpseCast = false;
    let fanned: { shown: number; more: number } | null = null;
    let opened: string | null = null;
    let castName: string | null = null;
    let glowed = 0;
    let castBehind = false;
    let windowed = false;
    let onStack = false;
    const done = () => onStack;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({ glimpseCast, fanned, opened, castName }));

    while (!done() && Date.now() < deadline) {
      await watch.check();
      // Step 2 -- the fan past its places, once Glimpse has milled.
      if (glimpseCast && !fanned && (await moreOf(host).count()) > 0) {
        // Its pop waits for the fan's cards to rise (spec 0106): the still is
        // taken once nothing in either fan is moving.
        for (const page of [host, guest])
          await page
            .waitForFunction(
              () =>
                [...document.querySelectorAll("[data-fan-card], [data-fan-more]")].every(
                  (el) => el.getAnimations().length === 0,
                ),
              undefined,
              { timeout: 15_000 },
            )
            .catch(() => undefined);
        const more = Number(await moreOf(host).first().getAttribute("data-fan-count"));
        fanned = { shown: await fanCardsOf(host).count(), more };
        await host.screenshot({ path: join(SHOTS, "pace-fan-host-fan.png") });
        await guest.screenshot({ path: join(SHOTS, "pace-fan-guest-fan.png") });
      }
      // Step 3 -- the cast card on the stack.
      if (castName && !onStack) {
        const there = host.locator('button[data-zone="stack"]').filter({ hasText: castName });
        if ((await there.count()) > 0) {
          onStack = true;
          await host.screenshot({ path: join(SHOTS, "pace-fan-host-cast.png") });
          break;
        }
      }
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        const other = page.locator(".gs-reveal .gs-reveal-close");
        if ((await other.count()) > 0) {
          await clickNow(other);
          continue;
        }
        if (await answerCardTray(page)) continue;
        if ((await panel.locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        // Casting: a target (the host's own life: Glimpse, Deep Analysis,
        // Dream Twist all aim at a player); paying taps a land.
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          const myLife = panel.locator(".gs-seat-viewer .gs-life.gs-choosable");
          // A target question shown here and not aimed (its myLife not lit yet)
          // may still be answered below, as before; one that opened since is
          // the next pass's to aim.
          const aimShown = (await targeting.count()) > 0;
          const unaimed = aimShown ? undefined : TARGETING;
          if (aimShown && (await myLife.count()) > 0) {
            await realClick(page, myLife);
            continue;
          }
          const tap = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"]):not([data-zone$=":graveyard"])',
          );
          const listed = panel.locator(".gs-win li button, .gs-question li button");
          if ((await tap.count()) > 0) await clickIf(tap, PAYING);
          else if ((await listed.count()) > 0) await clickUnlessCombat(listed, unaimed);
          else
            await clickUnlessCombat(
              panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"),
              unaimed,
            );
          continue;
        }
        if (!(await isAsked(page))) continue;
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
          else if ((await main.count()) > 0) await clickUnlessCombat(main);
          else await clickNow(passButton(page));
          continue;
        }
        let pick: Locator | null = null;
        if ((await page.locator('button[data-zone="stack"]').count()) === 0) {
          const land = inHand(page, LANDS);
          const lands = await boardCards(page, "viewer").filter({ hasText: LANDS }).count();
          // Amendment 1 (owner 2026-11-19): the fan's cards the host may cast
          // now, shown or behind the "+N" -- never a "Your move" window for them.
          const castable = page.locator(
            '[data-fan-side="viewer"] button[data-choosable="true"]:not([data-unpayable="true"])',
          );
          if (isHost && !glimpseCast && (await inHand(page, /^Glimpse/).count()) > 0)
            pick = (await land.count()) > 0 && lands < 2 ? land : inHand(page, /^Glimpse/);
          else if (isHost && fanned && !castName && (await castable.count()) > 0) {
            if ((await page.locator(".gs-win").count()) > 0) windowed = true;
            await page.screenshot({ path: join(SHOTS, "pace-fan-host-move.png") });
            // The host REALLY clicks its "+N": the pile viewer, its castable
            // cards breathing; it REALLY clicks one (one behind the "+N" if
            // it can), and the viewer gets out of the way for the cast.
            if (await realClick(page, moreOf(page).locator("button"))) {
              const viewer = page.locator(".gs-viewer");
              await viewer.waitFor({ timeout: 10_000 });
              opened = await viewer.getAttribute("aria-label");
              const shown = await fanCardsOf(page).evaluateAll((els) =>
                els.map((el) => (el as HTMLElement).dataset["fanCard"] ?? ""),
              );
              const glowing = viewer.locator(".gs-castable");
              await glowing.first().waitFor({ timeout: 10_000 });
              glowed = await glowing.count();
              await page.screenshot({ path: join(SHOTS, "pace-fan-host-viewer.png") });
              const ids = await glowing.evaluateAll((els) =>
                els.map((el) => (el as HTMLElement).dataset["objectId"] ?? ""),
              );
              const hidden = ids.find((id) => !shown.includes(id));
              castBehind = hidden !== undefined;
              const card = viewer.locator(`.gs-castable[data-object-id="${hidden ?? ids[0]}"]`);
              const label = (await card.getAttribute("aria-label")) ?? "";
              if (await realClick(page, card)) {
                castName = /^(Think Twice|Deep Analysis|Dream Twist)/.exec(label)?.[1] ?? null;
                await viewer.waitFor({ state: "detached", timeout: 10_000 });
              }
            }
            continue;
          } else if ((await land.count()) > 0) pick = land;
        }
        if (pick && (await pick.count()) > 0) {
          const what = (await pick.first().textContent()) ?? "";
          if (await realClick(page, pick.first())) {
            if (/Glimpse/.test(what)) glimpseCast = true;
          }
        } else await clickNow(passButton(page));
      }
    }

    expect(glimpseCast, "the host cast Glimpse the Unthinkable").toBe(true);
    expect(fanned, 'the host\'s fan went past its places, with a "+N"').not.toBeNull();
    // Six cards and the "+N" in the seventh place: 9 or 10 milled, so +3 or +4.
    expect(fanned!.shown).toBe(6);
    expect(fanned!.more).toBeGreaterThanOrEqual(2);
    expect(opened, "the real click on +N opened the pile viewer on the graveyard").toBe(
      "Your graveyard",
    );
    // Amendment 1: no "Your move" window for the fan's cards; in the viewer
    // the castable ones breathe, and a real click there casts one.
    expect(windowed, 'a "Your move" window over the table for the fan\'s cards').toBe(false);
    expect(glowed, "castable cards breathing in the viewer").toBeGreaterThan(0);
    expect(castName, "the host really clicked a castable card in the viewer").not.toBeNull();
    expect(onStack, `${castName} went on the stack from the viewer`).toBe(true);
    console.log(
      `fan: ${fanned!.shown} shown, +${fanned!.more}; ${glowed} breathing in the viewer; ` +
        `cast ${castName} from it${castBehind ? " (one behind the +N)" : ""}`,
    );
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
