// Priority stops, in the browser — PHASE_07 §7.53, AMENDMENT 13, P7-R.
//
// With the Arena-style defaults the game passes for a player wherever they
// do not stop: nobody is asked in an upkeep, a draw step or an end step
// with nothing on the stack, and turns flow to the main phases.
// scripts/check-stops.py proves the worker half against Forge (a response
// is never skipped; nothing to respond with is passed for); this proves
// what the players meet, and the two controls a player has.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, setStops, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

// The server's defaults (StopSettings.DEFAULT).
const OWN = ["MAIN1", "COMBAT_DECLARE_BLOCKERS", "MAIN2"];
const OPPONENT = ["COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS"];

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

test("with the default stops, turns flow to the main phases and nobody is asked at an empty step", async ({
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
    await setStops(host, OWN, OPPONENT);
    await setStops(guest, OWN, OPPONENT);
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName);

    const askedAt: string[] = [];
    let skipped: { page: Page; turn: number } | null = null;
    let askedAfterSkip = 0;
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
          const question = matchPanel(page).locator(".gs-question li button, .gs-combat li button");
          if ((await question.count()) > 0) {
            await question
              .first()
              .click({ timeout: 5_000 })
              .catch(() => undefined);
            acted = true;
          } else if (
            (await matchPanel(page).locator(".gs-question, .gs-combat").count()) > 0 &&
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
        const turn = await turnOf(page);
        if (!label.startsWith("Pass: Resolve")) askedAt.push(step);
        if (
          skipped &&
          skipped.page === page &&
          turn === skipped.turn &&
          !label.startsWith("Pass: Resolve")
        ) {
          askedAfterSkip += 1;
        }
        // Your own land drop, by clicking it (AMENDMENT 12).
        const land = page
          .locator('[data-zone="viewer:hand"][data-choosable="true"]')
          .filter({ hasText: "Mountain" });
        // The mouse away first: a hovered hand card is drawn enlarged, over
        // its neighbours, and the click then waited for ever on a Mountain
        // the enlarged card covered. Every click is bounded.
        await page.mouse.move(0, 0);
        // Spec 0034: Main 1's pass says "To attacks" or "Nothing can
        // attack"; either way it is a pass with nothing on the stack.
        if (!skipped && turn >= 3 && step === "Main 1" && /^Pass: (Next|End turn)/.test(label)) {
          // Once, the first Main 1 asked from turn 3 -- before the land: a
          // Main 1 with only a land to play is asked once, and after the
          // land nothing more is asked there (CI never saw the moment).
          skipped = { page, turn };
          await matchPanel(page)
            .getByRole("button", { name: "Skip to end of turn" })
            .click({ timeout: 5_000 })
            .catch(() => undefined);
        } else if ((await land.count()) > 0) {
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
    const quiet = askedAt.filter((step) => ["Upkeep", "Draw", "End", "Cleanup"].includes(step));
    expect(quiet, `asked at empty steps: ${askedAt.join(", ")}`).toEqual([]);
    expect(skipped, "nobody reached Main 1 on turn 3 to skip from").not.toBeNull();
    expect(askedAfterSkip, "asked again in the turn they skipped").toBe(0);

    // The stops panel: a change is saved for the account.
    const menu = matchPanel(host);
    await menu.getByRole("button", { name: "Game menu" }).click();
    await menu.getByRole("button", { name: /^Stop options/ }).click();
    const panel = host.getByRole("dialog", { name: "Stop options" });
    await expect(panel).toBeVisible();
    await host.screenshot({ path: "test-results/seen/stops-panel.png", fullPage: true });
    await panel.getByRole("checkbox", { name: "End step, their turn" }).check();
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel).toHaveCount(0);
    const saved = (await (await host.request.get("/api/matches/stops")).json()) as {
      opponent: string[];
    };
    expect(saved.opponent).toContain("END_OF_TURN");
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
