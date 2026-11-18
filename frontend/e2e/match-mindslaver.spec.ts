// One player controls another, in the browser — PHASE_06 §6.37,
// §6.38, P6-U.
//
// Mindslaver: "You control target player during that player's next
// turn. (You see all cards that player could see and make all
// decisions for the player.)" The worker-level check
// (scripts/check-mindslaver.py) proves the gate refuses the
// controlled player. This proves the whole chain to the pages:
//
//   routed     during the guest's controlled turn, the HOST's page is
//              asked the guest's questions, under "Playing for <guest>"
//              (spec 0102, item 2: the player's name, never a seat)
//   withheld   the guest's page is asked nothing
//   sight      the host's page shows the guest's hand, labelled as
//              the guest's -- and did not before
//   told       spec 0102, item 2: the guest's page gets the window "<host>
//              is playing your turn." and a gold chain round its plate (the
//              host's page shows the chain round the guest's plate, and no
//              window); the host really clicks a land for the guest, and it
//              lands on the guest's side on both pages
//
// The deck is protocol/fixtures/mindslaver-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/mindslaver-deck.zip" protocol/fixtures/mindslaver-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  cardCount,
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const slaverPackage = join(process.cwd(), "..", "Test Deck", "mindslaver-deck.zip");

test("under Mindslaver the controller answers for the other player and sees their hand", async ({
  browser,
}) => {
  test.skip(!existsSync(slaverPackage), "no Mindslaver deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, slaverPackage);
    await startAMatch(host, guest, deckName, { settle: false });

    const controlling = matchPanel(host).getByRole("heading", {
      name: new RegExp(`Playing for ${secondUser}`),
    });
    // Spec 0031: the opponent's hand is fanned along the top of the board;
    // a card shown to you is face up, and clicking it opens the hand.
    const theirHand = matchPanel(host)
      .locator('[data-zone="opponent:hand"][data-face="up"]')
      .first();
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    let sawHandBefore = false;
    let used = false;
    let mulligans = 0;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({ sawHandBefore, used }));
    while (Date.now() < deadline) {
      if ((await controlling.count()) > 0) break;
      await watch.check();
      if (!used && (await theirHand.count()) > 0) sawHandBefore = true;

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Keep or mulligan/.test(heading)) {
        const hand = await panel.locator('[data-zone="viewer:hand"]').allTextContents();
        // At most two mulligans, then keep and draw into it: each
        // mulligan shrinks the hand, an EMPTY hand can never hold the
        // card, and "keep only with it" then mulligans for ever.
        const keep =
          live !== host || mulligans >= 2 || hand.some((name) => name.includes("Mindslaver"));
        if (!keep) mulligans += 1;
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Mountain/);
      } else if (live === host) {
        const mine = panel.locator(
          '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
        );
        const out = (await mine.filter({ hasText: "Mindslaver" }).count()) > 0;
        const untapped = await cardCount(
          mine.filter({ hasText: "Mountain" }).filter({ hasNotText: "tapped" }),
        );
        const lands = await cardCount(mine.filter({ hasText: "Mountain" }));
        // Forge offers what cannot be paid for; count first.
        if (out && untapped >= 4) pick = find(/You control target player/);
        if (pick >= 0) used = true;
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && !out && lands >= 6 && untapped >= 6) pick = find(/^Mindslaver · \{6\}/);
        if (pick < 0) pick = /Pay the mana|^\s*Pay \{/.test(heading) ? 0 : -1;
        if (pick < 0) pick = find(new RegExp(`^${secondUser}`)); // the target
        if (pick < 0) pick = find(/^Pay the cost/); // sacrificing it
      } else {
        pick = find(/Play land/);
      }
      if (
        pick < 0 &&
        (await panel.getByRole("button", { name: "Pass" }).count()) === 0 &&
        labels.length
      ) {
        pick = 0;
      }
      if (pick >= 0) {
        await answer(options.nth(pick));
      } else {
        await answer(panel.getByRole("button", { name: "Pass" }));
      }
      await live.waitForTimeout(40);
    }

    // Routed to the controller, withheld from the controlled.
    await expect(controlling, "the host was never asked a question for seat 2").toBeVisible({
      timeout: 60_000,
    });
    await expect(matchPanel(guest).locator(".gs-question, .gs-win, .gs-combat")).toHaveCount(0);
    // Seen by the controller, as the guest's, and not before.
    expect(sawHandBefore, "the host saw the guest's hand before controlling them").toBe(false);
    await expect(theirHand).toBeVisible();
    await theirHand.click();
    await expect(
      host.getByRole("dialog", { name: `${secondUser}'s hand, as far as you may see it` }),
    ).toBeVisible();
    await host.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    // Spec 0102, item 2 -- never a seat number in a heading.
    await expect(matchPanel(host).getByText(/Playing for seat/)).toHaveCount(0);
    // The controlled player's page: the window, and the chain round its plate.
    const told = matchPanel(guest)
      .locator(".gs-reveal")
      .filter({ hasText: "is playing your turn." });
    await expect(told).toBeVisible({ timeout: 30_000 });
    await expect(told).toContainText("Mindslaver");
    await expect(matchPanel(guest).locator(".gs-seat-viewer .gs-control")).toBeVisible();
    await expect(matchPanel(host).locator(".gs-seat-opponent .gs-control")).toBeVisible();
    await expect(
      matchPanel(host).locator(".gs-reveal").filter({ hasText: "is playing your turn." }),
    ).toHaveCount(0);
    // The host really clicks a land for the guest (Forge's "Play land" for
    // the guest, in the host's window headed "Playing for <guest>").
    const theirLands = (page: Page, side: "viewer" | "opponent") =>
      cardCount(
        matchPanel(page)
          .locator(`.bf-cards button[data-controller="${side}"][data-object-id]`)
          .filter({ hasText: "Mountain" }),
      );
    const before = await theirLands(host, "opponent");
    let played = false;
    const until = Date.now() + 120_000;
    // While the guest's turn is played by the host (the chain on its plate).
    const chained = matchPanel(guest).locator(".gs-seat-viewer .gs-control");
    while (!played && Date.now() < until && (await chained.count()) > 0) {
      // Played: the land is on the guest's side (a click on a list the game
      // had already moved past is refused, and is clicked again).
      if ((await theirLands(host, "opponent")) > before) {
        played = true;
        break;
      }
      const options = await choices(host);
      const labels = await options.allTextContents();
      const land = labels.findIndex((label) => /Play land/.test(label));
      if (land >= 0) {
        if (await answer(options.nth(land))) await host.waitForTimeout(1_500);
      } else if ((await matchPanel(host).getByRole("button", { name: "Pass" }).count()) > 0) {
        await answer(matchPanel(host).getByRole("button", { name: "Pass" }));
      } else {
        await host.waitForTimeout(100);
      }
    }
    expect(played, "the host was never offered a land to play for the guest").toBe(true);
    await expect.poll(() => theirLands(host, "opponent"), { timeout: 30_000 }).toBe(before + 1);
    await expect.poll(() => theirLands(guest, "viewer"), { timeout: 30_000 }).toBe(before + 1);
    await host.screenshot({ path: "test-results/seen/mindslaver-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/mindslaver-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
