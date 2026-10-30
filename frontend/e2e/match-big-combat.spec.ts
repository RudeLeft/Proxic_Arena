// Big combats, in the browser — specs 0036 and 0037 (owner 2026-10-29).
//
// Both players flood the board with identical 1/1 Goblin tokens (the swarm
// deck). They stack (0036). The host attacks with everything; the guest
// clicks its own Goblin stack, then the attacking stack, and blocks many
// at once from the "Block how many?" chooser (0037, F-0037-F). Each
// blocker then rides on the attacker it blocks: no block lines.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, clickNow, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "swarm-deck.zip");
const SPELLS =
  /^(Goblin Rally|Hordeling Outburst|Beetleback Chief|Dragon Fodder|Krenko's Command|Goblin Instigator)/;

/** A stack of untapped Goblins on one side, as `viewer` sees it: its size. */
async function goblinStack(page: Page, side: "viewer" | "opponent"): Promise<number> {
  const piles = await page
    .locator(
      `.bf-cards button[data-controller="${side}"][data-tapped="false"][data-pile]:not([data-rides])`,
    )
    .filter({ hasText: "Goblin" })
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset["pile"] ?? 1)));
  return Math.max(0, ...piles);
}

test("a stack blocks a stack: two clicks and the chooser, and blockers ride", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no swarm deck package (CI builds it)");
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

    let attacked = false;
    let blocked: number | null = null;
    const deadline = Date.now() + 780_000;
    while (blocked === null && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";

        if (kind === "declareAttackers") {
          // The host attacks once, with everything, when both swarms are up.
          const ready =
            page === host &&
            !attacked &&
            (await goblinStack(host, "viewer")) >= 4 &&
            (await goblinStack(host, "opponent")) >= 3;
          if (ready && (await panel.locator("button.gs-act-all").count()) > 0) {
            await clickNow(panel.locator("button.gs-act-all"));
            await page.waitForTimeout(400);
            attacked = true;
          }
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }

        if (kind === "declareBlockers" && page === guest && attacked) {
          // F-0037-F: click our Goblin stack, then theirs.
          const mine = page
            .locator('.bf-cards button[data-controller="viewer"][data-pile][data-choosable="true"]')
            .filter({ hasText: "Goblin" });
          await expect(mine.first()).toBeVisible();
          await clickNow(mine);
          const theirs = page
            .locator(
              '.bf-cards button[data-controller="opponent"][data-attacking="true"][data-pile][data-choosable="true"]',
            )
            .filter({ hasText: "Goblin" });
          await expect(theirs.first(), "the attackers to block are offered").toBeVisible({
            timeout: 15_000,
          });
          await clickNow(theirs);
          const chooser = page.getByRole("dialog", { name: "Block how many" });
          await expect(chooser).toBeVisible();
          const n = Number(await chooser.locator(".gs-block-many-n").textContent());
          expect(n, "the chooser starts at as many as possible").toBeGreaterThanOrEqual(2);
          await page.screenshot({ path: "test-results/seen/block-many-chooser.png" });
          await clickNow(chooser.getByRole("button", { name: /^Block \d+$/ }));
          // Every block lands, each blocker riding on its attacker.
          await expect
            .poll(
              async () =>
                (
                  await page
                    .locator(".bf-cards button[data-rides]")
                    .evaluateAll((els) =>
                      els.map((el) => Number((el as HTMLElement).dataset["pile"] ?? 1)),
                    )
                ).reduce((a, b) => a + b, 0),
              { timeout: 60_000, message: `all ${n} blocks ride on their attackers` },
            )
            .toBe(n);
          // No shield lines for riders.
          await expect(page.locator('[data-line="block"]')).toHaveCount(0);
          await page.screenshot({ path: "test-results/seen/block-many-riders.png" });
          blocked = n;
          break;
        }

        if (kind) {
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }

        // Priority: a Mountain, else a Goblin-making spell, else pass.
        const act = panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)");
        if ((await act.count()) > 0) {
          const hand = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
          const land = hand.filter({ hasText: "Mountain" });
          const spell = hand
            .filter({ hasText: SPELLS })
            .and(page.locator(':not([data-unpayable="true"])'));
          if ((await land.count()) > 0) await clickNow(land);
          else if ((await spell.count()) > 0) {
            await clickNow(spell);
            const popup = page.locator(".gs-popup .gs-option");
            if ((await popup.count()) > 0) await clickNow(popup);
          } else await clickNow(act);
          continue;
        }
        // Anything else: its first choice, a board choice, or pass.
        const listed = panel.locator(".gs-question li button, .gs-win li button");
        const board = panel.locator('.bf-cards button[data-choosable="true"]');
        if ((await listed.count()) > 0) await clickNow(listed);
        else if ((await board.count()) > 0) await clickNow(board);
        else await clickNow(panel.locator("button.gs-pass, button.gs-act"));
      }
      await host.waitForTimeout(100);
    }
    expect(attacked, "the host never had a swarm to attack with").toBe(true);
    expect(blocked, "the guest never blocked a stack with a stack").not.toBeNull();
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
