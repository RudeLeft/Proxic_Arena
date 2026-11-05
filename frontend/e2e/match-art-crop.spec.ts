// A card shows its art crop in its art window -- spec 0051, F-0051-F.
//
// The deck is sixty Mountains whose package carries a picture (a solid
// colour) and an art crop (a yellow-and-blue checkered JPEG). A Mountain on
// the battlefield shows the crop, filling its art window, for its owner and
// for the opponent, and it does not zoom into the picture. (The close-up
// keeps the whole picture: it is drawn from `art`, never `crop`.) A deck
// without crops keeps the zoom
// (match-own-printing.spec.ts finds `img.bf-art`).
//
// The deck is protocol/fixtures/crop-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/crop-deck.zip" protocol/fixtures/crop-deck --crops

import { test, expect, type Locator } from "@playwright/test";
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
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 600_000 });

const cropDeck = join(process.cwd(), "..", "Test Deck", "crop-deck.zip");

/** Colours sampled across a card's art window (a 3 x 3 grid), as drawn. */
async function windowColours(card: Locator): Promise<number[][]> {
  return card.locator(".bf-window").evaluate(async (window) => {
    const img = window.querySelector<HTMLImageElement>("img");
    if (!img) return [];
    await img.decode().catch(() => undefined);
    const canvas = document.createElement("canvas");
    canvas.width = window.clientWidth;
    canvas.height = window.clientHeight;
    const g = canvas.getContext("2d")!;
    // object-fit: cover, centred -- as the board draws it.
    const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    g.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const out: number[][] = [];
    for (const fx of [0.3, 0.5, 0.7]) {
      for (const fy of [0.3, 0.5, 0.7]) {
        out.push(Array.from(g.getImageData(canvas.width * fx, canvas.height * fy, 1, 1).data));
      }
    }
    return out;
  });
}

test("a card shows its art crop in its art window, to both players", async ({ browser }) => {
  test.skip(!existsSync(cropDeck), "no art-crop deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, cropDeck);
    await startAMatch(host, guest, deckName, { settle: false });

    const lands = (viewer: "viewer" | "opponent", page = host) => boardCards(page, viewer);
    const deadline = Date.now() + 300_000;
    const watch = watchGame([host, guest]);
    while (Date.now() < deadline && (await lands("viewer").count()) === 0) {
      await watch.check();
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

    const mine = lands("viewer").filter({ hasText: "Mountain" }).first();
    await expect(mine, "the host played a Mountain").toBeVisible({ timeout: 60_000 });
    const crop = mine.locator("img.bf-crop");
    await expect(crop, "the art window shows the crop").toBeVisible({ timeout: 30_000 });
    await expect(mine.locator("img.bf-art"), "and does not zoom into the picture").toHaveCount(0);
    const cropSrc = await crop.getAttribute("src");
    // The checkered crop, not the solid grey picture: both of its colours.
    const colours = await windowColours(mine);
    const yellow = colours.some(([r = 0, g = 0, b = 0]) => r > 180 && g > 150 && b < 110);
    const blue = colours.some(([r = 0, , b = 0]) => b > 150 && r < 110);
    expect(
      yellow && blue,
      `the window shows the crop's yellow and blue: ${JSON.stringify(colours)}`,
    ).toBe(true);

    const theirs = lands("opponent", guest).filter({ hasText: "Mountain" }).first();
    await expect(theirs.locator("img.bf-crop"), "the guest sees the crop").toHaveAttribute(
      "src",
      cropSrc!,
      { timeout: 30_000 },
    );

    await host.waitForTimeout(3_000);
    await mine.screenshot({ path: "test-results/seen/art-crop-card.png" });
    await host.screenshot({ path: "test-results/seen/art-crop-host.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
