// Combat damage among two or more blockers, in one tray -- owner
// 2026-11-01, item 5 (canvas https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81).
//
// The game asks the attacker's player one point at a time ("Assign damage
// 1 of 6 from Craw Wurm."). Now one tray shows the attacker's blockers as
// pictures, each with what it needs to die, filled in the usual way; Done
// answers every one of the game's questions from that split.
//
// A real game: the host attacks with everything, the guest blocks one big
// attacker with two creatures; the host sees the tray filled in (damage
// left 0), presses Done, and is never asked a point at a time.
//
// Uses the landing test deck (protocol/fixtures/landing-deck).

import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  attackWithAll,
  clearEverything,
  clickNow,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const CREATURES =
  /^(Birds of Paradise|Grizzly Bears|Llanowar Elves|Elvish Mystic|Centaur Courser|Giant Spider|Craw Wurm|Kalonian Tusker|Leatherback Baloth)/;

test("two blockers: the damage is one tray, filled in, one click", async ({ browser }) => {
  test.skip(!existsSync(pkg), "no landing deck package (CI builds it)");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    let trays = 0;
    let onePointAsked = 0;
    const deadline = Date.now() + 780_000;
    while (trays < 1 && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;

        // The damage tray.
        const tray = panel.locator('.gs-win.gs-tray[data-kind="assignCombatDamage"]');
        if ((await tray.count()) > 0) {
          const blockers = tray.locator(".gs-win-damage-one[data-object-id^='card:']");
          expect(
            await blockers.count(),
            "two or more blockers, as pictures",
          ).toBeGreaterThanOrEqual(2);
          await expect(tray.locator(".gs-win-left")).toHaveText("Damage left: 0");
          await expect(tray.locator(".gs-win-tile-caption").first()).toContainText("needs");
          if (trays === 0) await page.screenshot({ path: "test-results/seen/damage-tray.png" });
          await clickNow(tray.getByRole("button", { name: "Done" }));
          trays += 1;
          // Every one of the game's point-at-a-time questions answered from it.
          await expect
            .poll(async () => panel.locator('[data-kind="assignCombatDamage"]').count(), {
              timeout: 20_000,
            })
            .toBe(0);
          continue;
        }
        if ((await panel.locator('[data-kind="assignCombatDamage"]').count()) > 0)
          onePointAsked += 1;
        if (await answerCardTray(page)) continue;

        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";
        if (kind === "declareAttackers") {
          // The host attacks with everything once the board is up.
          const mine = await page
            .locator('.bf-cards button[data-controller="viewer"][data-zone*="creature"]')
            .count();
          if (page === host && mine >= 3) await attackWithAll(page);
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }
        if (kind === "declareBlockers") {
          // Two of the guest's creatures on one big attacker.
          const attacker = page
            .locator('.bf-cards button[data-controller="opponent"][data-attacking="true"]')
            .filter({
              hasText: /Craw Wurm|Kalonian Tusker|Leatherback Baloth|Centaur Courser|Giant Spider/,
            })
            .first();
          for (let i = 0; i < 2 && (await attacker.count()) > 0; i++) {
            const mine = page.locator(
              '.bf-cards button[data-controller="viewer"][data-choosable="true"]:not([data-rides])',
            );
            if ((await mine.count()) === 0) break;
            await clickNow(mine.first());
            await page.waitForTimeout(300);
            // W-14: selected, then pointed at the attacker.
            await clickNow(attacker);
            await page.waitForTimeout(900);
          }
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }

        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        if (!priority) {
          const mana = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await mana.count()) > 0) await clickNow(mana);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const pick = [hand.filter({ hasText: /^Forest/ }), hand.filter({ hasText: CREATURES })];
        let acted = false;
        for (const p of pick) {
          if ((await p.count()) > 0) {
            await clickNow(p);
            acted = true;
            break;
          }
        }
        if (!acted) {
          await clickNow(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
        }
      }
      await host.waitForTimeout(120);
    }
    expect(trays, "a double block reached the damage tray").toBeGreaterThanOrEqual(1);
    expect(onePointAsked, "never asked one point at a time").toBe(0);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
