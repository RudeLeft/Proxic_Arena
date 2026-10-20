// A two-faced card turns over, in the browser — PHASE_06 §6.79,
// §6.81, P6-BF and P6-AJ.
//
// Delver of Secrets // Insectile Aberration. The worker-level check
// (scripts/check-multiface.py) proves the protocol: one object id,
// Forge's other face, the back's characteristics, and the look at the
// top card reaching the player. This proves what a player SEES:
//
//   the front    Delver of Secrets, 1/1, with its imported picture
//   the look     asked "Reveal cards to other players?", the page has
//                already said which card is on top
//   the back     the same card now reads Insectile Aberration, 3/2,
//                and does NOT wear the front's picture -- a package
//                carries front images only (§6.81: "where available"),
//                and a transformed card shown as its front is a lie
//
// The deck is protocol/fixtures/delver-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/delver-deck.zip" protocol/fixtures/delver-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const delverPackage = join(process.cwd(), "..", "Test Deck", "delver-deck.zip");

test("a two-faced card turns over: same card, Forge's other face, no borrowed picture", async ({
  browser,
}) => {
  test.skip(!existsSync(delverPackage), "no Delver deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, delverPackage);
    await startAMatch(host, guest, deckName, { settle: false });

    const mine = matchPanel(host).locator(".board-side.mine .card-chip");
    const front = mine.filter({ hasText: "Delver of Secrets" });
    const back = mine.filter({ hasText: "Insectile Aberration" });
    const asking = async (page: Page) =>
      (await matchPanel(page).getByRole("listitem").getByRole("button").count()) > 0 ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    let sawFront = false;
    let sawLook = false;
    const deadline = Date.now() + 1_000_000;
    while (Date.now() < deadline) {
      if ((await back.count()) > 0) break;

      if (!sawFront && (await front.count()) > 0) {
        // The front, with its imported picture.
        await expect(front.first().locator("img.card-art")).toBeVisible({ timeout: 30_000 });
        sawFront = true;
      }

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
        const keep = live !== host || hand.some((name) => name.includes("Delver of Secrets"));
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Island/);
      } else if (live === host && find(/Reveal cards to other players/) >= 0) {
        // The look reached the player before the question did.
        await expect(panel.locator(".board-notices")).toContainText("Looking at your library:");
        if (!sawLook) {
          await host.screenshot({ path: "test-results/seen/delver-look.png", fullPage: true });
          sawLook = true;
        }
        pick = find(/^Yes/);
      } else if (live === host) {
        pick = find(/Play land/);
        if (pick < 0 && (await front.count()) === 0) pick = find(/^Delver of Secrets — \{U\}/);
        if (pick < 0) pick = find(/still owing/);
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

    expect(sawFront, "Delver never reached the battlefield").toBe(true);
    expect(sawLook, "never asked to reveal the top card").toBe(true);
    // The same card, turned over: the back face's name and numbers,
    // and no picture borrowed from the front.
    await expect(back.first()).toBeVisible({ timeout: 60_000 });
    await expect(back.first()).toContainText("3/2");
    await expect(back.first().locator("img.card-art")).toHaveCount(0);
    await expect(front).toHaveCount(0);
    await host.screenshot({ path: "test-results/seen/delver-back.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
