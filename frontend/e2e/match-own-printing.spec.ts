// A printing Forge does not have, kept as the player picked it — spec
// 0024, F-0024-D.
//
// The deck is sixty Mountains in "ZZZ 1", a printing no Forge has. The
// server-level tests prove import keeps it and the room's check passes;
// this proves what the players get: the deck is accepted, the game
// starts, and a Mountain on the battlefield wears the deck's own
// picture -- for its owner and for the opponent.
//
// The deck is protocol/fixtures/own-printing-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/own-printing-deck.zip" protocol/fixtures/own-printing-deck

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
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
} from "./match-helpers";

test.describe.configure({ timeout: 600_000 });

const ownPrinting = join(process.cwd(), "..", "Test Deck", "own-printing-deck.zip");

test("a printing Forge does not have plays, wearing the deck's own picture", async ({
  browser,
}) => {
  test.skip(!existsSync(ownPrinting), "no own-printing deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    // Refused at import before spec 0024; the room's check refused it too.
    const deckName = await sharedDeck(host, guest, ownPrinting);
    await startAMatch(host, guest, deckName, { settle: false });

    const lands = (viewer: "viewer" | "opponent", page = host) =>
      matchPanel(page).locator(
        `.bf-cards button[data-controller="${viewer}"][data-object-id]:not([data-zone$=":hand"])`,
      );
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline && (await lands("viewer").count()) === 0) {
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
      if (pick >= 0) {
        await answer(options.nth(pick));
      } else {
        await answer(matchPanel(live).getByRole("button", { name: "Pass" }));
      }
      await live.waitForTimeout(40);
    }

    // The host's Mountain, with the deck's picture...
    const mine = lands("viewer").filter({ hasText: "Mountain" }).first();
    await expect(mine, "the host played a Mountain").toBeVisible({ timeout: 60_000 });
    const picture = mine.locator("img.bf-art");
    await expect(picture, "the deck's own picture").toBeVisible({ timeout: 30_000 });
    const src = await picture.getAttribute("src");
    expect(src, "a picture served for this match").toBeTruthy();

    // ...and the same picture on the opponent's screen.
    const theirs = lands("opponent", guest).filter({ hasText: "Mountain" }).first();
    await expect(theirs, "the guest sees the host's Mountain").toBeVisible({ timeout: 30_000 });
    await expect(theirs.locator("img.bf-art")).toHaveAttribute("src", src!, { timeout: 30_000 });
    await host.screenshot({ path: "test-results/seen/own-printing-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/own-printing-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
