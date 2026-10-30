// The response window, in the browser — spec 0005 (owner 2026-10-23),
// Phase 8 Amendment 4, spec 0035 (owner 2026-10-29: 5 s, a click resolves).
//
// Your own spell on top of the stack, with something left to respond with:
// the act button counts down "Resolves in 5" and, if you let it run out,
// your page passes and the spell resolves. Clicking the countdown resolves
// it at once. scripts/check-stops.py proves the worker half (only your own
// spell, only when you could respond).

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, clickNow, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "interaction-deck.zip");
const BURN = /^(Shock|Lightning Bolt|Lightning Strike)/;
const click = clickNow;

const opponentLife = async (page: Page) =>
  Number((await page.locator(".gs-seat-opponent .gs-life").first().textContent()) ?? "0");

test("your own spell counts down from 5 and resolves; a click on the countdown resolves it now", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no interaction deck package (CI builds it)");
  test.setTimeout(900_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, pkg);
  await startAMatch(host, guest, deck);

  // Spec 0004's Hold button is gone (F-0005-D).
  await expect(matchPanel(host).locator("button.gs-hold")).toHaveCount(0);

  let ranOut = false;
  let clicked = false;
  // The opponent may still pass after us before the spell resolves, so the
  // life total is checked as the game goes on.
  let ranOutFrom: number | null = null;
  let clickedFrom: number | null = null;
  const deadline = Date.now() + 780_000;
  while (!(ranOut && clicked) && Date.now() < deadline) {
    const life = await opponentLife(host);
    if (ranOutFrom !== null && life < ranOutFrom) [ranOut, ranOutFrom] = [true, null];
    if (clickedFrom !== null && life < clickedFrom) [clicked, clickedFrom] = [true, null];
    for (const page of [host, guest]) {
      await page.mouse.move(0, 0);
      const panel = matchPanel(page);
      const windowButton = panel.locator("button.gs-act-window");

      if (page === host && (await windowButton.count()) > 0) {
        if (!ranOut && ranOutFrom === null) {
          // F-0005-B: let it run out -- no click at all.
          ranOutFrom = await opponentLife(page);
          // F-0035-H: it starts from 5, and is still counting past 2 s.
          await expect(windowButton).toContainText(/Resolves in [45]/);
          await expect(windowButton).toContainText("click to resolve now");
          await host.screenshot({ path: "test-results/seen/window-counting.png" });
          await page.waitForTimeout(2_500);
          await expect(windowButton, "still counting after 2.5 s").toHaveCount(1);
          await expect(windowButton, "the countdown ends by itself").toHaveCount(0, {
            timeout: 6_000,
          });
        } else if (ranOut && !clicked && clickedFrom === null) {
          // F-0035-H: a click on the countdown resolves it now -- an ordinary Pass.
          clickedFrom = await opponentLife(page);
          const before = Date.now();
          await click(windowButton);
          await expect(windowButton, "a click resolves at once").toHaveCount(0, {
            timeout: 3_000,
          });
          expect(Date.now() - before, "well before the countdown ran out").toBeLessThan(3_500);
        } else {
          // An earlier window's spell is still on its way: let this one run out.
          await expect(windowButton).toHaveCount(0, { timeout: 8_000 });
        }
        continue;
      }

      const priority =
        (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) > 0;
      const hand = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
      if (!priority) {
        // Targets go to the opponent; anything else: first choice or pass.
        const face = page.locator(".gs-seat-opponent .gs-life.gs-choosable");
        const listed = panel.locator(
          ".gs-question li button, .gs-win li button, .gs-combat li button",
        );
        const board = panel.locator('.bf-cards button[data-choosable="true"]');
        if ((await face.count()) > 0) await click(face);
        else if ((await listed.count()) > 0) await click(listed);
        else if ((await board.count()) > 0) await click(board);
        else await click(panel.locator("button.gs-pass, button.gs-act"));
        continue;
      }
      const land = hand.filter({ hasText: "Mountain" });
      if ((await land.count()) > 0) {
        await click(land);
        continue;
      }
      if (page === host) {
        // Cast burn while holding another: with a spare Mountain there is
        // something to respond with, and the worker makes it a window (with
        // none, it is passed for, and the loop tries again on a later turn).
        const burn = hand
          .filter({ hasText: BURN })
          .and(page.locator(':not([data-unpayable="true"])'));
        if ((await burn.count()) >= 2) {
          await click(burn);
          const popup = page.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await click(popup);
          continue;
        }
      }
      await click(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
    }
  }
  expect(ranOut, "a response window ran out and the spell resolved").toBe(true);
  expect(clicked, "a clicked response window resolved the spell").toBe(true);
  await clearEverything(host).catch(() => undefined);
  await clearEverything(guest).catch(() => undefined);
});
