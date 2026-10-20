// Attachments on the board — PHASE_06 P6-AK.
//
// The worker-level check (scripts/check-attachments.py) proves the
// protocol: equipment moves, Auras sit across the table, a stolen
// creature keeps its Aura, a reconfigured creature becomes Equipment.
// This proves what a PLAYER sees: each attachment drawn with the
// card it modifies, on whichever side of the table that card is --
// including an Aura one player controls on the other's creature,
// which the board once drew nowhere at all.
//
// The deck is protocol/fixtures/attachment-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/attachment-deck.zip" protocol/fixtures/attachment-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const attachmentPackage = join(process.cwd(), "..", "Test Deck", "attachment-deck.zip");

test("attachments are drawn with what they modify, on either side of the table", async ({
  browser,
}) => {
  test.skip(!existsSync(attachmentPackage), "no attachment deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, attachmentPackage);
    await startAMatch(host, guest, deckName);

    const mineSide = (page: Page) => matchPanel(page).locator(".board-side.mine");
    const theirSide = (page: Page) => matchPanel(page).locator(".board-side.theirs");
    // A creature chip carrying an attachment, by the two names.
    const carrying = (side: ReturnType<typeof mineSide>, creature: string, attached: RegExp) =>
      side
        .locator(".card-chip")
        .filter({ hasText: creature })
        .filter({
          has: host.locator(".card-attached", { hasText: attached }),
        });
    const everything = async () =>
      (await carrying(mineSide(host), "Raging Goblin", /Bonesplitter/).count()) > 0 &&
      (await carrying(mineSide(host), "Raging Goblin", /Rabbit Battery/).count()) > 0 &&
      (await carrying(theirSide(host), "Grizzly Bears", /Pacifism \(yours\)/).count()) > 0;
    const asking = async (page: Page) =>
      (await matchPanel(page).getByRole("listitem").getByRole("button").count()) > 0 ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    let intent: "pacifism" | "goblin" | null = null;
    const deadline = Date.now() + 1_000_000;
    let answered = 0;
    while (Date.now() < deadline && !(await everything())) {
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".decision h3").allTextContents()).join(" ");
      const prompt = (await panel.locator(".decision-prompt").allTextContents()).join(" ");
      const options = panel.getByRole("listitem").getByRole("button");
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Choose a creature to (attack|block) with/.test(prompt)) {
        pick = -1; // nobody fights: the board stays readable
      } else if (/Your move/.test(heading) && live === host) {
        const mine = mineSide(host).locator(".card-chip");
        const free = mine.filter({ hasNotText: "tapped" });
        const mountains = await free.filter({ hasText: "Mountain" }).count();
        const plains = await free.filter({ hasText: "Plains" }).count();
        const lands = mountains + plains + (await free.filter({ hasText: "Forest" }).count());
        const goblins = await mine.filter({ hasText: "Raging Goblin" }).count();
        const has = async (name: string) => (await mine.filter({ hasText: name }).count()) > 0;
        const equipped =
          (await carrying(mineSide(host), "Raging Goblin", /Bonesplitter/).count()) > 0;
        const reconfigured =
          (await carrying(mineSide(host), "Raging Goblin", /Rabbit Battery/).count()) > 0;
        const bears =
          (await theirSide(host).locator(".card-chip", { hasText: "Grizzly Bears" }).count()) > 0;
        const pacified =
          (await theirSide(host).locator(".card-attached", { hasText: "Pacifism" }).count()) > 0;
        const allMountains = await mine.filter({ hasText: "Mountain" }).count();
        const allPlains = await mine.filter({ hasText: "Plains" }).count();

        pick = find(
          allPlains < allMountains / 2 ? /^Plains — .*Play land/ : /^Mountain — .*Play land/,
        );
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && goblins > 0 && (await has("Bonesplitter")) && !equipped && lands >= 1) {
          pick = find(/^Bonesplitter — .*Equip/);
          if (pick >= 0) intent = "goblin";
        }
        if (
          pick < 0 &&
          goblins > 0 &&
          (await has("Rabbit Battery")) &&
          !reconfigured &&
          mountains >= 1
        ) {
          pick = find(/^Rabbit Battery — .*Reconfigure/);
          if (pick >= 0) intent = "goblin";
        }
        if (pick < 0 && bears && !pacified && plains >= 1 && lands >= 2) {
          pick = find(/^Pacifism — \{/);
          if (pick >= 0) intent = "pacifism";
        }
        if (pick < 0 && goblins < 2 && mountains >= 1) pick = find(/^Raging Goblin — \{R\}/);
        if (pick < 0 && !(await has("Rabbit Battery")) && mountains >= 1)
          pick = find(/^Rabbit Battery — \{R\}/);
        if (pick < 0 && !(await has("Bonesplitter")) && lands >= 1)
          pick = find(/^Bonesplitter — \{1\}/);
      } else if (/Your move/.test(heading)) {
        // The guest: lands, and Grizzly Bears to be pacified.
        const free = mineSide(guest).locator(".card-chip").filter({ hasNotText: "tapped" });
        const forests = await free.filter({ hasText: "Forest" }).count();
        pick = find(/^Forest — .*Play land/);
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && forests >= 2) pick = find(/^Grizzly Bears — \{/);
      } else if (find(/still owing/) >= 0) {
        pick = find(/still owing/);
      } else if (intent === "pacifism" && find(/^Grizzly Bears/) >= 0) {
        pick = find(/^Grizzly Bears/);
      } else if (intent === "goblin" && find(/^Raging Goblin/) >= 0) {
        pick = find(/^Raging Goblin/);
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

    // As the host sees it: its equipment and its reconfigured Rabbit
    // Battery on its Goblin, its Pacifism on the guest's Bears.
    await expect(
      carrying(mineSide(host), "Raging Goblin", /Bonesplitter/).first(),
      `after ${answered} decisions`,
    ).toBeVisible();
    await expect(carrying(mineSide(host), "Raging Goblin", /Rabbit Battery/).first()).toBeVisible();
    await expect(
      carrying(theirSide(host), "Grizzly Bears", /Pacifism \(yours\)/).first(),
    ).toBeVisible();
    // As the guest sees it: the same Pacifism, on its own creature,
    // named as the host's.
    await expect(
      mineSide(guest)
        .locator(".card-chip")
        .filter({ hasText: "Grizzly Bears" })
        .locator(".card-attached", { hasText: /Pacifism \(.+'s\)/ })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    // And a reconfigured Rabbit Battery is not a creature any more:
    // nowhere drawn as a card of its own.
    await expect(
      mineSide(host)
        .locator(".board-row")
        .filter({ hasText: "Creatures" })
        .locator(".card-chip > .card-name", {
          hasText: /^Rabbit Battery$/,
        }),
    ).toHaveCount(0);
    await host.screenshot({ path: "test-results/seen/attachments-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/attachments-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
