// Beginning the game with a card on the battlefield — PHASE_06 §6.68,
// acceptance P6-AC (the Leyline-style half).
//
// "If Leyline of the Void is in your opening hand, you may begin the
// game with it on the battlefield." A PREGAME question, asked after
// mulligans and before the first turn, and the card is not cast: no
// mana, no stack. The page must offer it, let the player choose (or
// decline), and then show the card where Forge put it.
//
// The deck is protocol/fixtures/leyline-deck: 40 Swamps and five
// different Leylines, four of each. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/leyline-deck.zip" protocol/fixtures/leyline-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const leylinePackage = join(process.cwd(), "..", "Test Deck", "leyline-deck.zip");

test("a Leyline in the opening hand can begin the game on the battlefield, uncast", async ({
  browser,
}) => {
  test.skip(!existsSync(leylinePackage), "no Leyline deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, leylinePackage);
    await startAMatch(host, guest, deckName, { settle: false });

    const opening = /Begin with it on the battlefield/;
    const other = /Keep or mulligan|Play or draw|Put a card back/;
    const began: { page: Page; name: string }[] = [];
    let offered = 0;

    // The pregame, answered by hand. Each player with a Leyline is
    // asked once per pick: take the first one offered, then Pass.
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      if (
        (await matchPanel(host)
          .getByText(/The game is running/)
          .count()) > 0
      )
        break;

      let handled = false;
      for (const page of [host, guest]) {
        const panel = matchPanel(page);
        if ((await panel.getByRole("heading", { name: opening }).count()) > 0) {
          const options = panel.getByRole("listitem").getByRole("button");
          await expect(options.first()).toBeVisible();
          const labels = await options.allTextContents();
          const picked = began.filter((entry) => entry.page === page).length;

          if (picked === 0) {
            offered += 1;
            // Forge's own effects, from this player's opening hand.
            expect(labels.length).toBeGreaterThan(0);
            expect(labels.every((label) => /^Leyline of /.test(label))).toBe(true);
            expect(
              labels.every((label) => /begin the game with it on the battlefield/i.test(label)),
            ).toBe(true);
            // A "may": declining is an answer, so Pass is offered.
            await expect(panel.getByRole("button", { name: "Pass" })).toBeVisible();
            // And the page says it is not a spell.
            await expect(panel.getByText(/not cast, nothing paid/)).toBeVisible();
            await page.screenshot({ path: "test-results/seen/leyline-offer.png", fullPage: true });

            began.push({ page, name: labels[0]!.split(" — ")[0]! });
            await options.first().click();
          } else {
            // One is enough: "no more" is the other answer to test.
            await panel.getByRole("button", { name: "Pass" }).click();
          }
          handled = true;
          break;
        }
        const generic = panel.getByRole("heading", { name: other });
        const choice = panel.getByRole("listitem").getByRole("button");
        if ((await generic.count()) > 0 && (await choice.count()) > 0) {
          await choice.first().click();
          handled = true;
          break;
        }
      }
      if (!handled) await host.waitForTimeout(100);
      else await host.waitForTimeout(150);
    }

    await expect(matchPanel(host).getByText(/The game is running/)).toBeVisible({
      timeout: 60_000,
    });
    expect(offered, "no player was offered a Leyline from the opening hand").toBeGreaterThan(0);

    // Where Forge put it: on that player's own battlefield, before
    // turn one, and no longer in their hand.
    for (const { page, name } of began) {
      const battlefield = matchPanel(page).locator(".board-side.mine");
      await expect(battlefield.locator(".card-chip", { hasText: name }).first()).toBeVisible({
        timeout: 30_000,
      });
    }
    await began[0]!.page.screenshot({
      path: "test-results/seen/leyline-began.png",
      fullPage: true,
    });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
