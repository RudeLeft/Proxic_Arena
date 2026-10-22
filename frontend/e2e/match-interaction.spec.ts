// Clicking on the board in a real game — PHASE_07 P7-G, P7-H.
//
//   P7-G  a click on your own creature when nothing is asked about it
//         selects it, and does not attack (§7.25, §7.26)
//   P7-H  a spell that needs a target: the candidates are shown, and
//         cancelling at the target question casts nothing (§7.31)
//
// The host plays; the guest only passes. Both use the interaction test
// deck (protocol/fixtures/interaction-deck): Mountains, burn that needs a
// target, and creatures with nothing to activate.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "interaction-deck.zip");
const BURN = /^(Shock|Lightning Bolt|Lightning Strike)/;

/** A DOM click: fanned hand cards overlap, so a pointer click can land on a neighbour. */
const click = (l: Locator) =>
  l
    .first()
    .evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 5000 })
    .catch(() => undefined);

const opponentLife = async (page: Page) =>
  Number((await page.locator(".gs-seat-opponent .gs-life").first().textContent()) ?? "0");

test("a click with nothing asked selects and does not attack; a cancelled target casts nothing", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no interaction deck package (CI builds it)");
  test.setTimeout(600_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, pkg);
  await startAMatch(host, guest, deck);

  let selected = false;
  let cancelled = false;
  const deadline = Date.now() + 480_000;
  while (!(selected && cancelled) && Date.now() < deadline) {
    for (const page of [host, guest]) {
      await page.mouse.move(0, 0);
      const panel = matchPanel(page);
      const priority = (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) > 0;
      const hand = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');

      if (page === host && priority && !selected) {
        // P7-G: a creature of ours that nothing is asked about.
        const idle = panel
          .locator(
            '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"]):not([data-choosable="true"])',
          )
          .filter({ hasNotText: "Mountain" });
        if ((await idle.count()) > 0) {
          const id = (await idle.first().getAttribute("data-object-id"))!;
          await click(idle);
          const card = panel.locator(`.bf-cards button[data-object-id="${id}"]`);
          await expect(card, "the click selects it").toHaveAttribute("data-selected", "true");
          await expect(card, "and it does not attack").not.toContainText(/attacking/i);
          await expect(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"), "and the question is still open").toHaveCount(1);
          selected = true;
          continue;
        }
      }

      if (page === host && priority && selected && !cancelled) {
        // P7-H: a burn spell we can pay for, started and then cancelled.
        const burn = hand
          .filter({ hasText: BURN })
          .and(page.locator(':not([data-unpayable="true"])'));
        if ((await burn.count()) > 0) {
          const name = ((await burn.first().textContent()) ?? "").match(BURN)![0];
          const inHand = await page
            .locator('[data-zone="viewer:hand"]')
            .filter({ hasText: name })
            .count();
          const life = await opponentLife(page);
          await click(burn);
          const popup = page.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await click(popup);
          // The candidates are shown: the opponent can be chosen.
          await expect(
            page.locator(".gs-seat-opponent .gs-life.gs-choosable"),
            "the opponent is a target",
          ).toHaveCount(1, { timeout: 15_000 });
          // Owner 2026-10-22: backing out is the act button, "Cancel".
          await expect(panel.locator("button.gs-act-cancel")).toContainText("Cancel");
          await click(panel.locator("button.gs-act-cancel"));
          // The target question is gone. (Priority may come back, or -- when
          // that spell was the only thing to do -- pass on, as it should.)
          await expect(
            page.locator(".gs-seat-opponent .gs-life.gs-choosable"),
            "the target question ended",
          ).toHaveCount(0, { timeout: 15_000 });
          await expect(
            page.locator('[data-zone="viewer:hand"]').filter({ hasText: name }),
            "the spell is still in hand",
          ).toHaveCount(inHand);
          await expect(
            page.locator('[data-zone="stack"]'),
            "nothing was cast: no card on the stack",
          ).toHaveCount(0);
          expect(await opponentLife(page), "nobody took damage").toBe(life);
          cancelled = true;
          break;
        }
      }

      if (!priority) {
        // Any other question: the first choice, a board choice, or pass.
        const listed = panel.locator(".gs-question li button, .gs-combat li button");
        const board = panel.locator(
          '.bf-cards button[data-choosable="true"], .gs-life.gs-choosable',
        );
        if ((await listed.count()) > 0) await click(listed);
        else if ((await board.count()) > 0) await click(board);
        else await click(panel.locator("button.gs-pass, button.gs-act"));
        continue;
      }
      const land = hand.filter({ hasText: "Mountain" });
      if ((await land.count()) > 0) {
        await click(land);
        continue;
      }
      if (page === host && !selected) {
        const creature = hand
          .filter({ hasNotText: BURN })
          .filter({ hasNotText: "Mountain" })
          .and(page.locator(':not([data-unpayable="true"])'));
        if ((await creature.count()) > 0) {
          await click(creature);
          continue;
        }
      }
      await click(panel.locator(".gs-act"));
    }
    await host.waitForTimeout(100);
  }
  expect(selected, "a creature was clicked with nothing asked").toBe(true);
  expect(cancelled, "a targeted spell was started and cancelled").toBe(true);

  await clearEverything(host);
  await host.context().close();
  await guest.context().close();
});
