// Priority stops, in the browser — spec 0035 (was PHASE_07 §7.53,
// AMENDMENT 13).
//
// One rule for every player, nothing to set: the game passes for a player
// wherever nothing can matter -- nobody is asked in an upkeep, a draw step
// or a cleanup with nothing on the stack -- and turns flow to the main
// phases. scripts/check-stops.py proves the worker half against Forge (each
// moment the rule keeps, a response never skipped, nothing to respond with
// passed for); this proves what the players meet: no stop options, and no
// "Skip to end of turn".

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

const turnOf = async (page: Page) =>
  Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0);
// The step the game is in -- not the highlight, which walks through the
// steps passed (owner 2026-10-22) and so can still read "Cleanup" while the
// game asks in the next turn's Main 1 (CI, 2026-10-22).
const stepOf = async (page: Page) =>
  (
    (
      await page
        .locator(".gs-steps")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-step")))
    )[0] ?? ""
  ).trim();

test("with the one stops rule, turns flow to the main phases and nobody is asked at an empty step", async ({
  browser,
}) => {
  test.skip(!pkg, "no deck package available");
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  try {
    // F-0035-J: there are no stops to read or save.
    expect((await host.request.get("/api/matches/stops")).ok()).toBe(false);
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName);

    const askedAt: string[] = [];
    let skipSeen = 0;
    const deadline = Date.now() + 600_000;
    let lastAction = Date.now();
    while (Date.now() < deadline && (await turnOf(host)) < 6) {
      // A game nobody can act in is a finding, not a long wait.
      if (Date.now() - lastAction > 90_000) {
        await host.screenshot({ path: "test-results/seen/stops-stalled-host.png", fullPage: true });
        await guest.screenshot({
          path: "test-results/seen/stops-stalled-guest.png",
          fullPage: true,
        });
        throw new Error(
          `nobody could act for 90 s, turn ${await turnOf(host)}, ${await stepOf(host)}`,
        );
      }
      let acted = false;
      for (const page of [host, guest]) {
        const act = matchPanel(page).locator(
          "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)",
        );
        if ((await act.count()) === 0) {
          // A question that is not a priority pass (attackers, a target):
          // always asked, answered with its first choice or a pass.
          const question = matchPanel(page).locator(
            ".gs-question li button, .gs-win li button, .gs-combat li button",
          );
          if ((await question.count()) > 0) {
            await question
              .first()
              .click({ timeout: 5_000 })
              .catch(() => undefined);
            acted = true;
          } else if (
            (await matchPanel(page).locator(".gs-question, .gs-win, .gs-combat").count()) > 0 &&
            (await matchPanel(page).locator('.bf-cards button[data-choosable="true"]').count()) > 0
          ) {
            // A question answered on the board -- discarding down to seven
            // at cleanup is one: click a highlighted card, as a player does.
            await page.mouse.move(0, 0);
            await matchPanel(page)
              .locator('.bf-cards button[data-choosable="true"]')
              .first()
              .click({ timeout: 5_000 })
              .catch(() => undefined);
            acted = true;
          } else if ((await matchPanel(page).locator("button.gs-pass").count()) > 0) {
            await matchPanel(page)
              .locator("button.gs-pass")
              .click({ timeout: 5_000 })
              .catch(() => undefined);
            acted = true;
          }
          continue;
        }
        // Read without waiting: the button can go between two calls, and
        // getAttribute would then wait for it for the rest of the test.
        const label =
          (await act.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))))[0] ?? "";
        if (!label) continue;
        const step = await stepOf(page);
        if (!label.startsWith("Pass: Resolve")) askedAt.push(step);
        skipSeen += await matchPanel(page).getByText("Skip to end of turn").count();
        // Your own land drop, by clicking it (AMENDMENT 12).
        const land = page
          .locator('[data-zone="viewer:hand"][data-choosable="true"]')
          .filter({ hasText: "Mountain" });
        // The mouse away first: a hovered hand card is drawn enlarged, over
        // its neighbours, and the click then waited for ever on a Mountain
        // the enlarged card covered. Every click is bounded.
        await page.mouse.move(0, 0);
        if ((await land.count()) > 0) {
          await land
            .first()
            .click({ timeout: 5_000 })
            .catch(() => undefined);
        } else {
          await act.click({ timeout: 5_000 }).catch(() => undefined);
        }
        acted = true;
        await page.waitForTimeout(150);
      }
      if (acted) lastAction = Date.now();
      else await host.waitForTimeout(150);
    }

    expect(await turnOf(host), "the game did not flow to turn 6").toBeGreaterThanOrEqual(6);
    const quiet = askedAt.filter((step) => ["Upkeep", "Draw", "Cleanup"].includes(step));
    expect(quiet, `asked at empty steps: ${askedAt.join(", ")}`).toEqual([]);
    expect(skipSeen, "Skip to end of turn is gone (spec 0035)").toBe(0);

    // F-0035-J: the game menu offers Concede and Abandon, no stop options.
    const menu = matchPanel(host);
    await menu.getByRole("button", { name: "Game menu" }).click();
    const items = menu.getByRole("group", { name: "Game menu" }).locator(".gs-dock-item-name");
    await expect(items).toHaveText(["Concede", "Abandon match"]);
    await host.screenshot({ path: "test-results/seen/stops-menu.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
