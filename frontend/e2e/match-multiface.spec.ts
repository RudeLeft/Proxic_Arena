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
import {
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

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

    const mine = matchPanel(host).locator(
      '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
    );
    const front = mine.filter({ hasText: "Delver of Secrets" });
    const back = mine.filter({ hasText: "Insectile Aberration" });
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    let sawFront = false;
    let frontPicture: string | null = null;
    let sawLook = false;
    // What both screens say, for a failure that has to explain itself:
    // CI once spent the whole budget here with nothing on record.
    const screens = async () =>
      `host: ${(await matchPanel(host).innerText()).slice(0, 600)}
---
guest: ${(await matchPanel(guest).innerText()).slice(0, 600)}`;
    let quietSince = Date.now();
    let mulligans = 0;
    const deadline = Date.now() + 1_000_000;
    while (Date.now() < deadline) {
      if ((await back.count()) > 0) break;

      if (!sawFront && (await front.count()) > 0) {
        // The front, with its imported picture.
        await expect(front.first().locator("img.bf-art")).toBeVisible({ timeout: 30_000 });
        frontPicture = await front
          .first()
          .locator("img.bf-art")
          .getAttribute("src", { timeout: 5000 });
        sawFront = true;
      }

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        if (Date.now() - quietSince > 60_000) {
          throw new Error(`nobody was asked anything for a minute:
${await screens()}`);
        }
        await host.waitForTimeout(100);
        continue;
      }
      quietSince = Date.now();
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
        // card, and "keep only with it" then mulligans for ever. CI
        // hit exactly that (2026-10-20).
        const keep =
          live !== host ||
          mulligans >= 2 ||
          hand.some((name) => name.includes("Delver of Secrets"));
        if (!keep) mulligans += 1;
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Island/);
      } else if (live === host && find(/Reveal cards to other players/) >= 0) {
        // The look reached the player before the question did.
        await expect(panel.locator(".gs-notices")).toContainText("Looking at your library:");
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

    const said = (await back.count()) > 0 ? "" : await screens();
    expect(
      sawFront,
      `Delver never reached the battlefield
${said}`,
    ).toBe(true);
    expect(
      sawLook,
      `never asked to reveal the top card
${said}`,
    ).toBe(true);
    // The same card, turned over: the back face's name and numbers, and
    // the back face's OWN picture (PHASE_07 §7.59, P7-W: the package
    // carries it under "Insectile Aberration") -- never the front's.
    await expect(back.first()).toBeVisible({ timeout: 60_000 });
    await expect(back.first()).toContainText("3/2");
    const backArt = back.first().locator("img.bf-art");
    await expect(backArt, "the back face's own picture").toBeVisible({ timeout: 30_000 });
    expect(await backArt.getAttribute("src"), "not the front's picture").not.toBe(frontPicture);
    await expect(front).toHaveCount(0);
    await host.screenshot({ path: "test-results/seen/delver-back.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
