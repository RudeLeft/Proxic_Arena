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
//              asked the guest's questions, under "Playing for seat 2"
//   withheld   the guest's page is asked nothing
//   sight      the host's page shows the guest's hand, labelled as
//              the guest's -- and did not before
//
// The deck is protocol/fixtures/mindslaver-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/mindslaver-deck.zip" protocol/fixtures/mindslaver-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

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

    const controlling = matchPanel(host).getByRole("heading", { name: /Playing for seat 2/ });
    const theirHand = matchPanel(host).locator(".board-other-hand");
    const asking = async (page: Page) =>
      (await matchPanel(page).getByRole("listitem").getByRole("button").count()) > 0 ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    let sawHandBefore = false;
    let used = false;
    const deadline = Date.now() + 1_000_000;
    while (Date.now() < deadline) {
      if ((await controlling.count()) > 0) break;
      if (!used && (await theirHand.count()) > 0) sawHandBefore = true;

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".decision h3").textContent()) ?? "";
      const options = panel.getByRole("listitem").getByRole("button");
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Keep or mulligan/.test(heading)) {
        const hand = await panel.locator(".board-hand .card-chip").allTextContents();
        const keep = live !== host || hand.some((name) => name.includes("Mindslaver"));
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Mountain/);
      } else if (live === host) {
        const mine = panel.locator(".board-side.mine .card-chip");
        const out = (await mine.filter({ hasText: "Mindslaver" }).count()) > 0;
        const untapped = await mine
          .filter({ hasText: "Mountain" })
          .filter({ hasNotText: "tapped" })
          .count();
        const lands = await mine.filter({ hasText: "Mountain" }).count();
        // Forge offers what cannot be paid for; count first.
        if (out && untapped >= 4) pick = find(/You control target player/);
        if (pick >= 0) used = true;
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && !out && lands >= 6 && untapped >= 6) pick = find(/^Mindslaver — \{6\}/);
        if (pick < 0) pick = find(/still owing/);
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
        await options.nth(pick).click();
      } else {
        await panel.getByRole("button", { name: "Pass" }).click();
      }
      await live.waitForTimeout(40);
    }

    // Routed to the controller, withheld from the controlled.
    await expect(controlling, "the host was never asked a question for seat 2").toBeVisible({
      timeout: 60_000,
    });
    await expect(matchPanel(guest).locator(".decision")).toHaveCount(0);
    // Seen by the controller, as the guest's, and not before.
    expect(sawHandBefore, "the host saw the guest's hand before controlling them").toBe(false);
    await expect(theirHand).toBeVisible();
    await expect(theirHand).toContainText(`${secondUser}’s hand — you can see it`);
    await host.screenshot({ path: "test-results/seen/mindslaver-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/mindslaver-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
