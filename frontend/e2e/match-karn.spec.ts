// Karn Liberated restarts the game, in the browser — PHASE_06
// §6.69-§6.72, P6-AD.
//
// The worker-level check (scripts/check-karn.py) proves the protocol:
// a new epoch, the old ids dead. This proves what a PLAYER sees: the
// match carries on in the same page, the board is a new game -- turn
// one, twenty life -- the turn line says "Game 2", and both players
// are told in words that the game restarted.
//
// The deck is protocol/fixtures/karn-deck: 56 Plains, 4 Karn. CI
// builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/karn-deck.zip" protocol/fixtures/karn-deck

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
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const karnPackage = join(process.cwd(), "..", "Test Deck", "karn-deck.zip");

test("Karn's ultimate restarts the game, and both players see game 2 begin", async ({
  browser,
}) => {
  test.skip(!existsSync(karnPackage), "no Karn deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, karnPackage);
    await startAMatch(host, guest, deckName, { settle: false });

    const restarted = /Game 2 ·/;
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    // Bounded by the clock: the host needs seven lands, then three
    // of its own turns with Karn out.
    let mulligans = 0;
    const deadline = Date.now() + 1_000_000;
    let answered = 0;
    while (Date.now() < deadline) {
      if ((await matchPanel(host).getByText(restarted).count()) > 0) break;

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
        // The host keeps only a hand with Karn in it.
        const hand = await panel.locator('[data-zone="viewer:hand"]').allTextContents();
        // At most two mulligans, then keep and draw into it: each
        // mulligan shrinks the hand, an EMPTY hand can never hold the
        // card, and "keep only with it" then mulligans for ever. CI
        // hit exactly that (2026-10-20).
        const keep =
          live !== host || mulligans >= 2 || hand.some((name) => name.includes("Karn Liberated"));
        if (!keep) mulligans += 1;
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Plains/);
      } else if (live === host) {
        const mine = panel.locator(
          '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
        );
        const karnOut = (await mine.filter({ hasText: "Karn" }).count()) > 0;
        // Forge offers a spell whether or not it can be paid for, and
        // an unpaid cast rolls back to the same question -- clicking
        // Karn at six lands would loop for ever. So count first.
        const lands = await cardCount(mine.filter({ hasText: "Plains" }));
        pick = find(/-14: Restart the game/);
        if (pick < 0) pick = find(/\+4: Target player/);
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && !karnOut && lands >= 7) pick = find(/^Karn Liberated — \{7\}/);
        if (pick < 0) pick = find(/still owing/);
        if (pick < 0) pick = find(new RegExp(`^${secondUser}`)); // +4's target: the opponent
      } else {
        // The guest plays lands and nothing else; when Karn's +4 makes
        // it exile a card from hand, any card will do.
        pick = find(/Play land/);
        if (pick < 0 && /Choose one/.test(heading)) pick = 0;
      }
      // Mandatory questions with no rule above take Forge's first.
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
      answered += 1;
      await live.waitForTimeout(40);
    }

    // Game 2, as each player sees it.
    for (const page of [host, guest]) {
      const panel = matchPanel(page);
      await expect(panel.getByText(restarted), `after ${answered} decisions`).toBeVisible({
        timeout: 120_000,
      });
      await expect(
        panel.getByText("The game restarted. This is game 2 of the match."),
      ).toBeVisible();
      // A new game: the same page and the same match, and twenty life
      // each again.
      await expect(panel.locator(".gs-seat").filter({ hasText: "20 life" })).toHaveCount(2);
    }
    await host.screenshot({ path: "test-results/seen/karn-restart.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
