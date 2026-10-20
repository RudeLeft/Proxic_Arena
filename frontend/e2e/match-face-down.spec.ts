// A face-down creature on the board — PHASE_06 §6.44, P6-I.
//
// The worker-level check (scripts/check-face-down.py) reads every frame
// the opponent is sent while a morph is face down. This proves what
// each PLAYER sees: the controller its own card, named and marked face
// down; the opponent a "Face-down" creature with no name and no picture.
//
// The deck is protocol/fixtures/morph-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/morph-deck.zip" protocol/fixtures/morph-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const morphPackage = join(process.cwd(), "..", "Test Deck", "morph-deck.zip");
const MORPHS = ["Willbender", "Echo Tracer", "Fathom Seer", "Stratus Dancer"];

test("a face-down creature is named for its controller and hidden from the opponent", async ({
  browser,
}) => {
  test.skip(!existsSync(morphPackage), "no morph deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, morphPackage);
    await startAMatch(host, guest, deckName);

    const faceDownMine = matchPanel(host)
      .locator(".board-side.mine .card-chip")
      .filter({ hasText: "face down" });
    const asking = async (page: Page) =>
      (await matchPanel(page).getByRole("listitem").getByRole("button").count()) > 0 ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    const deadline = Date.now() + 1_000_000;
    let answered = 0;
    while (Date.now() < deadline && (await faceDownMine.count()) === 0) {
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".decision h3").allTextContents()).join(" ");
      const options = panel.getByRole("listitem").getByRole("button");
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Your move/.test(heading)) {
        pick = find(/Play land/);
        if (pick < 0 && live === host) {
          const islands = await matchPanel(host)
            .locator(".board-side.mine .card-chip")
            .filter({ hasText: "Island" })
            .filter({ hasNotText: "tapped" })
            .count();
          if (islands >= 3) pick = find(/cast this card face down/);
        }
      } else if (find(/still owing/) >= 0) {
        pick = find(/still owing/);
      } else if (
        labels.length &&
        (await panel.getByRole("button", { name: "Pass" }).count()) === 0
      ) {
        pick = 0;
      }
      if (pick >= 0) {
        await options.nth(pick).click();
      } else {
        await panel.getByRole("button", { name: "Pass" }).click();
      }
      answered += 1;
      await live.waitForTimeout(40);
    }

    // The controller: its own card, by name, marked face down.
    await expect(faceDownMine.first(), `after ${answered} decisions`).toBeVisible();
    const name = (await faceDownMine.first().locator(".card-name").textContent())?.trim() ?? "";
    expect(MORPHS, `the controller's face-down card is named ${name}`).toContain(name);

    // The opponent: a Face-down creature, nothing that names it, no
    // picture, and not the controller's word for it either.
    const theirs = matchPanel(guest).locator(".board-side.theirs");
    const hidden = theirs.locator(".card-chip").filter({ hasText: "Face-down" });
    await expect(hidden.first()).toBeVisible({ timeout: 30_000 });
    await expect(hidden.first().locator(".card-art")).toHaveCount(0);
    await expect(hidden.first()).not.toContainText("face down");
    for (const morph of MORPHS) {
      await expect(theirs, `the opponent's board names ${morph}`).not.toContainText(morph);
    }
    await host.screenshot({ path: "test-results/seen/face-down-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/face-down-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
