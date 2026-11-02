// A second game downloads no picture again -- spec 0052, F-0052-B and F-0052-C.
//
// Two games in a row, the same two players in the same browsers, the same
// deck. The first game downloads each picture (the table copy, the
// close-up fetched ahead, the art crop) from its one address,
// /api/pictures/{sha}. The second finds every one in the browser's own
// cache: the browser's network log shows no picture request reaching the
// server. Before spec 0052 each game had its own addresses
// (/api/matches/{id}/assets/{sha}), so the second game downloaded them all
// again. And no page asks for a per-match or per-deck address any more.
//
// The deck is protocol/fixtures/crop-deck (a picture and an art crop). CI
// builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/crop-deck.zip" protocol/fixtures/crop-deck --crops

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  boardCards,
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const cropDeck = join(process.cwd(), "..", "Test Deck", "crop-deck.zip");

/** Picture requests the browser sent to the server (not answered from its own cache). */
async function pictureTraffic(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const fromServer: string[] = [];
  const oldAddresses: string[] = [];
  cdp.on("Network.responseReceived", (event) => {
    const url = event.response.url;
    if (/\/api\/(matches|decks)\/[^/]+\/assets\//.test(url)) oldAddresses.push(url);
    const cached =
      event.response.fromDiskCache === true ||
      event.response.fromPrefetchCache === true ||
      event.response.fromServiceWorker === true;
    if (url.includes("/api/pictures/") && !cached) fromServer.push(url);
  });
  return { fromServer, oldAddresses };
}

async function playUntilAMountain(host: Page, guest: Page) {
  const mine = boardCards(host, "viewer").filter({ hasText: "Mountain" });
  const theirs = boardCards(guest, "viewer").filter({ hasText: "Mountain" });
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline && ((await mine.count()) === 0 || (await theirs.count()) === 0)) {
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
  await expect(mine.first().locator("img.bf-crop")).toBeVisible({ timeout: 60_000 });
  await expect(theirs.first().locator("img.bf-crop")).toBeVisible({ timeout: 60_000 });
  // Let the close-ups fetched ahead finish.
  await host.waitForTimeout(3_000);
}

test("a second game against the same deck downloads no picture again", async ({ browser }) => {
  test.skip(!existsSync(cropDeck), "no art-crop deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, cropDeck);

    const first = await pictureTraffic(host);
    await startAMatch(host, guest, deckName, { settle: false });
    await playUntilAMountain(host, guest);
    const firstGame = [...first.fromServer];
    expect(firstGame.length, "the first game downloads the pictures").toBeGreaterThan(0);
    expect(
      firstGame.some((url) => url.endsWith("?size=full")),
      "including a close-up fetched ahead",
    ).toBe(true);

    await clearEverything(host);
    first.fromServer.length = 0;
    await startAMatch(host, guest, deckName, { settle: false });
    await playUntilAMountain(host, guest);
    expect(first.fromServer, "the second game finds every picture in the browser's cache").toEqual(
      [],
    );
    expect(first.oldAddresses, "no page uses a per-match or per-deck address").toEqual([]);
    await host.screenshot({ path: "test-results/seen/picture-reuse-second-game.png" });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
