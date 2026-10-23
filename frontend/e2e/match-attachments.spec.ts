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

    // PHASE_07: the board draws an Aura or Equipment as a name tag on its
    // host, in the host's slot (AMENDMENT 4); a tag's label says whose it is.
    type Side = "viewer" | "opponent";
    const cardsOf = (page: Page, who: Side) =>
      page.locator(`.bf-cards button.bf-card[data-controller="${who}"]:not([data-zone$=":hand"])`);
    const card = (page: Page, who: Side, name: string) =>
      cardsOf(page, who).filter({ hasText: name });
    // A creature carrying an attachment: its slot holds both. (A `has`
    // locator is searched INSIDE the slot, so it starts at the button.)
    const carrying = (page: Page, who: Side, creature: string, tag: RegExp) =>
      page
        .locator(".bf-cards .bf-slot")
        .filter({
          has: page.locator(`button.bf-card[data-controller="${who}"]`, { hasText: creature }),
        })
        .filter({ has: page.getByRole("button", { name: tag }) });
    const everything = async () =>
      (await carrying(host, "viewer", "Raging Goblin", /^Bonesplitter, attached/).count()) > 0 &&
      (await carrying(host, "viewer", "Raging Goblin", /^Rabbit Battery, attached/).count()) > 0 &&
      (await carrying(
        host,
        "opponent",
        "Grizzly Bears",
        /^Pacifism, attached to .*, yours/,
      ).count()) > 0;
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
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
      // Nobody fights, so the board stays readable. Combat is the act
      // button (owner 2026-10-22), which with nothing chosen declares no
      // attack or no block -- checked FIRST: a combat question shows no
      // wording until its list is opened, so the branches below took the
      // guest's "Grizzly Bears" attack option for the Pacifism target and
      // attacked every turn until the host died (turn 50, 2026-10-22).
      const combat = panel.locator("button.gs-act-combat");
      if ((await combat.count()) > 0) {
        await combat
          .first()
          .click({ timeout: 10_000 })
          .catch(() => undefined);
        answered += 1;
        await live.waitForTimeout(40);
        continue;
      }
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const prompt = (await panel.locator(".decision-prompt").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Choose a creature to (attack|block) with/.test(prompt)) {
        pick = -1; // nobody fights: the board stays readable
      } else if (/Your move/.test(heading) && live === host) {
        const mine = cardsOf(host, "viewer");
        const free = mine.filter({ hasNotText: "tapped" });
        const mountains = await cardCount(free.filter({ hasText: "Mountain" }));
        const plains = await cardCount(free.filter({ hasText: "Plains" }));
        const lands = mountains + plains + (await cardCount(free.filter({ hasText: "Forest" })));
        const goblins = await cardCount(mine.filter({ hasText: "Raging Goblin" }));
        // In play, on its own or as a tag on a creature -- not in hand.
        const has = async (name: string) =>
          (await card(host, "viewer", name).count()) > 0 ||
          (await host
            .getByRole("button", { name: new RegExp(`^${name}, attached .*, yours`) })
            .count()) > 0;
        const equipped =
          (await carrying(host, "viewer", "Raging Goblin", /^Bonesplitter, attached/).count()) > 0;
        const reconfigured =
          (await carrying(host, "viewer", "Raging Goblin", /^Rabbit Battery, attached/).count()) >
          0;
        const bears = (await card(host, "opponent", "Grizzly Bears").count()) > 0;
        const pacified =
          (await host.getByRole("button", { name: /^Pacifism, attached/ }).count()) > 0;
        const allMountains = await cardCount(mine.filter({ hasText: "Mountain" }));
        const allPlains = await cardCount(mine.filter({ hasText: "Plains" }));

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
        const free = cardsOf(guest, "viewer").filter({ hasNotText: "tapped" });
        const forests = await cardCount(free.filter({ hasText: "Forest" }));
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
        await answer(options.nth(pick));
      } else {
        await answer(panel.getByRole("button", { name: "Pass" }));
      }
      answered += 1;
      await live.waitForTimeout(40);
    }

    // As the host sees it: its equipment and its reconfigured Rabbit
    // Battery on its Goblin, its Pacifism on the guest's Bears.
    await expect(
      carrying(host, "viewer", "Raging Goblin", /^Bonesplitter, attached/).first(),
      `after ${answered} decisions`,
    ).toBeVisible();
    await expect(
      carrying(host, "viewer", "Raging Goblin", /^Rabbit Battery, attached/).first(),
    ).toBeVisible();
    await expect(
      carrying(host, "opponent", "Grizzly Bears", /^Pacifism, attached to .*, yours/).first(),
    ).toBeVisible();
    // As the guest sees it: the same Pacifism, on its own creature,
    // named as the host's.
    await expect(
      carrying(guest, "viewer", "Grizzly Bears", /^Pacifism, attached to .*, opponent's/).first(),
    ).toBeVisible({ timeout: 30_000 });
    // And a reconfigured Rabbit Battery is not a creature any more:
    // nowhere drawn as a card of its own -- only as a tag.
    await expect(card(host, "viewer", "Rabbit Battery")).toHaveCount(0);
    await host.screenshot({ path: "test-results/seen/attachments-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/attachments-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
