// Spec 0097, item 2 (F-0097-B, TEST-012) -- a turn passed for a player who has
// nothing to play, in a real game.
//
// Both players hold the Karn deck (56 Plains, 4 Karn Liberated): once a
// Plains is down there is nothing else to play for turns, so the game passes
// the rest of that player's turn for them. The act button says so --
// "Passing" over "Nothing to play · N lands, ..." -- with no grey notice at
// the top right, and it is gone once the next turn begins.
//
// PASSING_CLIPS=<dir> records each seat's page (the act button's line, at
// 1920x1080).

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const karnPackage = join(process.cwd(), "..", "Test Deck", "karn-deck.zip");
const CLIPS = process.env.PASSING_CLIPS;

test("a turn with nothing to play: the act button says Passing and why, no notice, gone next turn", async ({
  browser,
}) => {
  test.skip(!existsSync(karnPackage), "no Karn deck package built");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  if (CLIPS) mkdirSync(CLIPS, { recursive: true });
  const context = () =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: CLIPS, size: viewport } } : {}),
    });
  const host = await (await context()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const turnOf = async (page: Page) =>
    Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0);
  const passing = (page: Page) => matchPanel(page).locator("[data-passing]");

  try {
    const deckName = await sharedDeck(host, guest, karnPackage);
    await startAMatch(host, guest, deckName);
    const watch = watchGame([host, guest], () => "", { allowEnd: true });

    // Each player plays a Plains when asked and passes otherwise -- a real
    // click on the offered choice -- until one of them is passed for.
    let seen: { page: Page; turn: number; words: string } | null = null;
    const deadline = Date.now() + 600_000;
    while (!seen && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        if ((await passing(page).count()) > 0) {
          seen = {
            page,
            turn: await turnOf(page),
            words: (await passing(page).first().textContent()) ?? "",
          };
          break;
        }
      }
      if (seen) break;
      const live = (await isAsked(host)) ? host : (await isAsked(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(50);
        continue;
      }
      const panel = matchPanel(live);
      // The opening hand is its own window: keep it.
      const keepButton = panel.getByRole("button", { name: /^Keep \d/ });
      if ((await keepButton.count()) > 0) {
        await answer(keepButton.first());
        continue;
      }
      const options = await choices(live);
      const labels = await options.allTextContents();
      const land = labels.findIndex((label) => /Play land/.test(label));
      const keep = labels.findIndex((label) => /Keep/.test(label));
      const pass = panel.getByRole("button", { name: "Pass" });
      if (keep >= 0) await answer(options.nth(keep));
      else if (land >= 0) await answer(options.nth(land));
      else if ((await pass.count()) > 0) await answer(pass);
      else if (labels.length) await answer(options.nth(0));
      await live.waitForTimeout(40);
    }
    expect(seen, "a player's turn was passed for them").not.toBeNull();
    const { page, turn, words } = seen!;
    // F-0097-B: the act button says it ...
    expect(words).toContain("Passing");
    expect(words).toMatch(
      /Nothing to play · (No lands|1 land|\d+ lands), (no land in hand|you've already played a land this turn|no land you can play)/,
    );
    await page.screenshot({ path: "test-results/seen/0097-passing.png" });
    // ... and nothing says it at the top right, on either page.
    for (const each of [host, guest]) {
      await expect(matchPanel(each).locator(".pa-note", { hasText: "Nothing" })).toHaveCount(0);
    }
    // The other player's button never says it.
    const other = page === host ? guest : host;
    await expect(passing(other)).toHaveCount(0);
    // Gone at the turn line: once the turn moves on, no "Passing".
    await expect.poll(() => turnOf(page), { timeout: 60_000 }).toBeGreaterThan(turn);
    await expect(passing(page)).toHaveCount(0);
    await page.waitForTimeout(1500);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
