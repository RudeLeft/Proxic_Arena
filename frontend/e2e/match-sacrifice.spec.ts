// Sacrificing in a real game, through the page — feature spec 0001,
// F-0001-H (Phase 8 Part 1).
//
// Innocent Blood: "Each player sacrifices a creature." Whoever is asked
// answers by clicking one of their OWN creatures on the board. The
// question says what is asking ("Innocent Blood: sacrifice a creature"),
// makes nothing else clickable, and cannot be backed out of: Forge's
// sacrifice has no "no", so there is no Cancel and no Pass. The creature
// clicked -- the LAST one offered, so no default could pass for it --
// leaves the battlefield.
//
// Both players use the sacrifice test deck (protocol/fixtures/
// sacrifice-deck): Swamps, Innocent Blood, and creatures with nothing to
// activate. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/sacrifice-deck.zip" protocol/fixtures/sacrifice-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  boardCards,
  clearEverything,
  matchPanel,
  question,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "sacrifice-deck.zip");
const SACRIFICE = '.gs-question[data-kind="choosePermanentsToSacrifice"]';

/** A DOM click: fanned hand cards overlap, so a pointer click can land on a neighbour. */
const click = (l: Locator) =>
  l
    .first()
    .evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 5000 })
    .catch(() => undefined);

/** A side's creatures on the battlefield: everything but its Swamps. */
const creatures = (page: Page, side: "viewer" | "opponent") =>
  boardCards(page, side).filter({ hasNotText: "Swamp" });

test("a sacrifice is answered by clicking your own creature, and cannot be cancelled", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no sacrifice deck package (CI builds it)");
  test.setTimeout(900_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);

    let sacrificed = 0;
    // Bounded by the clock, as every match loop here is.
    const deadline = Date.now() + 600_000;
    while (sacrificed < 2 && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);

        if ((await page.locator(SACRIFICE).count()) > 0) {
          const { heading, prompt } = await question(page);
          expect(heading).toContain("Sacrifice");
          // What is asking is named: on the other player's spell, the
          // only way to know why your creature is going.
          expect(prompt).toContain("Innocent Blood: sacrifice a creature");
          // No backing out of a sacrifice (Forge's has no "no").
          await expect(panel.locator("button.gs-act-cancel"), "no Cancel").toHaveCount(0);
          await expect(panel.locator("button.gs-pass"), "no Pass").toHaveCount(0);
          // Exactly your own creatures are clickable: no land, nothing of theirs.
          const choosable = panel.locator('.bf-cards button[data-choosable="true"]');
          const sides = await choosable.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-controller")),
          );
          expect(sides.length, "something to sacrifice").toBeGreaterThan(0);
          expect(new Set(sides), "only your own permanents").toEqual(new Set(["viewer"]));
          expect(await choosable.filter({ hasText: "Swamp" }).count(), "no land").toBe(0);
          expect(sides.length, "every creature of yours").toBe(
            await creatures(page, "viewer").count(),
          );

          // AGENTS TEST-011 — something to LOOK AT.
          await page.screenshot({ path: "test-results/seen/sacrifice.png", fullPage: true });

          const last = choosable.last();
          const id = (await last.getAttribute("data-object-id"))!;
          await click(last);
          await expect(page.locator(SACRIFICE), "the question is answered").toHaveCount(0, {
            timeout: 30_000,
          });
          await expect(
            panel.locator(`.bf-cards button[data-object-id="${id}"]`),
            "the creature clicked is no longer on the battlefield",
          ).toHaveCount(0, { timeout: 30_000 });
          sacrificed += 1;
          continue;
        }

        // Nobody attacks: the act button declares no attack, or no block.
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await click(combat);
          continue;
        }

        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        if (!priority) {
          // Any other question (paying mana, a discard): the first choice,
          // a board choice, or pass.
          const listed = panel.locator(".gs-question li button");
          const board = panel.locator(
            '.bf-cards button[data-choosable="true"], .gs-life.gs-choosable',
          );
          if ((await listed.count()) > 0) await click(listed);
          else if ((await board.count()) > 0) await click(board);
          else await click(panel.locator("button.gs-pass, button.gs-act"));
          continue;
        }

        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const land = hand.filter({ hasText: "Swamp" });
        if ((await land.count()) > 0) {
          await click(land);
          continue;
        }
        // Innocent Blood once both players have a creature, so both are asked.
        const blood = hand.filter({ hasText: "Innocent Blood" });
        if (
          (await blood.count()) > 0 &&
          (await creatures(page, "viewer").count()) > 0 &&
          (await creatures(page, "opponent").count()) > 0
        ) {
          await click(blood);
          continue;
        }
        const creature = hand
          .filter({ hasNotText: "Innocent Blood" })
          .filter({ hasNotText: "Swamp" });
        if ((await creature.count()) > 0) {
          await click(creature);
          continue;
        }
        await click(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
      }
      await host.waitForTimeout(100);
    }
    expect(sacrificed, "sacrifices answered by clicking the board").toBeGreaterThanOrEqual(2);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
