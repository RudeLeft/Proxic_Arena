// Each printing of a card wears its own picture -- spec 0053, F-0053-B.
//
// The deck is sixty Mountains in four printings (Duel Decks: Elves vs.
// Goblins 59, 60, 61, 62, fifteen of each), and its package carries the
// name's picture plus a picture of its own for each other printing, each a
// different colour. Before spec 0053 every Mountain wore the name's picture;
// now each wears its printing's, so an opening hand of seven shows more than
// one picture (all seven of one printing: about 1 in 10,000). A Mountain
// played shows the opponent the same picture its owner sees.
//
// The deck is protocol/fixtures/printings-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/printings-deck.zip" protocol/fixtures/printings-deck --printings

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  boardCards,
  choices,
  clearEverything,
  handCards,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

test.describe.configure({ timeout: 600_000 });

const printingsDeck = join(process.cwd(), "..", "Test Deck", "printings-deck.zip");

test("each printing of a card wears its own picture", async ({ browser }) => {
  test.skip(!existsSync(printingsDeck), "no printings deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, printingsDeck);
    await startAMatch(host, guest, deckName, { settle: false });

    // Keep, go first, play a land, until the host has a Mountain in play.
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline && (await boardCards(host, "viewer").count()) === 0) {
      const live = (await isAsked(host)) ? host : (await isAsked(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const options = await choices(live);
      const labels = await options.allTextContents();
      const heading = (await matchPanel(live).locator(".gs-question-title").allTextContents()).join(
        " ",
      );
      let pick = labels.findIndex((label) =>
        (/Keep or mulligan/.test(heading) ? /Keep/ : /Play land/).test(label),
      );
      if (pick < 0 && /Play first|go first/i.test(heading + labels.join(" "))) pick = 0;
      if (pick >= 0) await answer(options.nth(pick));
      else await answer(matchPanel(live).getByRole("button", { name: "Pass" }));
      await live.waitForTimeout(40);
    }

    // The host's hand: every Mountain has a picture, and not all the same one.
    const pictures = handCards(host).locator("img.bf-art");
    await expect(pictures.first(), "hand cards wear pictures").toBeVisible({ timeout: 60_000 });
    const sources = await pictures.evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).getAttribute("src") ?? ""),
    );
    expect(sources.length, "a hand of Mountains, each with a picture").toBeGreaterThanOrEqual(5);
    expect(sources.every(Boolean)).toBe(true);
    expect(
      new Set(sources).size,
      "four printings in the deck: the hand shows more than one picture",
    ).toBeGreaterThan(1);

    // The Mountain played: the same picture on both screens.
    const mine = boardCards(host, "viewer").filter({ hasText: "Mountain" }).first();
    const picture = mine.locator("img.bf-art");
    await expect(picture).toBeVisible({ timeout: 30_000 });
    const src = await picture.getAttribute("src");
    const theirs = boardCards(guest, "opponent").filter({ hasText: "Mountain" }).first();
    await expect(theirs.locator("img.bf-art")).toHaveAttribute("src", src!, { timeout: 30_000 });
    await host.screenshot({ path: "test-results/seen/printing-pictures-host.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
