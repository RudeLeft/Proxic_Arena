// Phase 9 W-15 -- the start of the game, with the opening hand laid out.
//
// A real game from the Leyline deck: whoever is asked to play or draw
// answers in the window; the host mulligans once and puts a card back by
// clicking it (one click, then Keep); a Leyline offered is ticked on its
// card and begins the game on the battlefield. The other player is told,
// in the right-hand column, how many times the host mulliganed.

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { boardCards, clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "leyline-deck.zip");

test("the opening hand: play or draw, a mulligan put back by clicking, a Leyline ticked", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no Leyline deck package built");
  test.setTimeout(600_000);
  const viewport = { width: 1920, height: 1080 };
  const hc = await browser.newContext({ viewport });
  const gc = await browser.newContext({ viewport });
  const host = await hc.newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await gc.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  let ticked: { page: Page; name: string } | null = null;
  let putBack = false;
  let toldMulligan = false;
  try {
    // A Leyline in an opening hand is a matter of the shuffle: a few games.
    for (let game = 0; game < 4 && !(ticked && putBack); game++) {
      const deck = await sharedDeck(host, guest, pkg);
      await startAMatch(host, guest, deck, { settle: false });
      let mulliganed = false;
      const end = Date.now() + 120_000;
      while (Date.now() < end) {
        if (
          (await matchPanel(host)
            .getByText(/The game is running/)
            .count()) > 0
        )
          break;
        let acted = false;
        for (const page of [host, guest]) {
          const window = page.locator(".gs-opening");
          if ((await window.count()) === 0) continue;
          const title = (await page.locator(".gs-opening-title").textContent()) ?? "";
          const line = (await page.locator(".gs-opening-line").textContent()) ?? "";
          const buttons = page.locator(".gs-opening-button");
          if (/^Put 1 card back/.test(title)) {
            await page.locator(".gs-opening-card:not(:disabled)").first().click();
            await expect(page.locator(".gs-opening-back")).toHaveCount(1);
            await buttons.first().click();
            putBack = true;
            if (page === host) {
              // The game counts the mulligan once the card is back; the
              // other player is told, in the column or, while choosing their
              // own hand, over it.
              await expect
                .poll(
                  async () =>
                    (await guest.locator(".gs-waiting, .gs-opening-line").allTextContents()).join(
                      " ",
                    ),
                  { timeout: 20_000 },
                )
                .toMatch(/mulliganed once/i);
              toldMulligan = true;
            }
          } else if (/Tick the cards/.test(line) && !ticked) {
            const card = page.locator(".gs-opening-card:not(:disabled)").first();
            const name = ((await card.getAttribute("aria-label")) ?? "").split(",")[0]!;
            await card.click();
            await expect(buttons.first()).toHaveText(/Begin with 1 in play/);
            ticked = { page, name };
            await buttons.first().click();
          } else if (
            page === host &&
            /Your opening hand/.test(title) &&
            !mulliganed &&
            !/Tick/.test(line)
          ) {
            mulliganed = true;
            await page.locator(".gs-opening-button", { hasText: "Mulligan" }).click();
          } else {
            await buttons.first().click();
          }
          acted = true;
          await page.waitForTimeout(300);
          break;
        }
        if (!acted) await host.waitForTimeout(150);
      }
      if (!(ticked && putBack)) await clearEverything(host);
    }

    expect(putBack, "a card was put back by clicking it").toBe(true);
    expect(toldMulligan, "the other player was told of the mulligan").toBe(true);
    expect(ticked, "a Leyline was offered in four games").not.toBeNull();
    // Where the game put it: on that player's battlefield, uncast.
    await expect(
      boardCards(ticked!.page, "viewer").filter({ hasText: ticked!.name }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await ticked!.page.screenshot({ path: "test-results/seen/opening-hand-leyline.png" });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await hc.close();
    await gc.close();
  }
});
