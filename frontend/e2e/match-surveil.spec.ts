// Looking at the top of your library, in a real game, through the page —
// feature spec 0001, F-0001-H and D3 (Phase 8 Part 1).
//
// Surveil and scry show their cards as pictures, to the player looking
// and nobody else. PHASE_09 W-08 (owner 2026-11-01): the tray from the
// bottom with two rows, "Top of library" and "Bottom of library" (surveil:
// "Graveyard"); every card starts on top, a click moves it across, two or
// more on top are numbered in draw order ("Sooner" moves one up), Done.
// One window: the game's second question ("which goes on top?") is
// answered from the rows, never asked again.
//
// Neither has a Cancel: the rules give no way out of looking. While one
// player looks, the other's page shows no cards of theirs.
//
// Both players use the surveil test deck (protocol/fixtures/
// surveil-deck). CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/surveil-deck.zip" protocol/fixtures/surveil-deck

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  clearEverything,
  clickNow,
  matchPanel,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "surveil-deck.zip");
const ROWS = ".gs-win.gs-tray:has(.gs-win-rows)";
/** The second half the rows answer: if it is ever shown, it was asked twice. */
const ORDER_AGAIN = '.gs-win.gs-tray[data-kind^="arrangeFor"]:not(:has(.gs-win-rows))';
const SPELLS = /^(Consider|Notion Rain|Preordain|Opt|Serum Visions)/;

/** A DOM click, and no wait when there is nothing to click (see clickNow). */
const click = clickNow;

test("surveil and scry show their cards to the player looking, and are answered by clicking", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no surveil deck package (CI builds it)");
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

    /** Each look seen once: "<kind>-one", "-away" (one sent away), "-order" (all kept, reordered). */
    const seen = new Set<string>();
    let sentAway = 0;
    let askedAgain = 0;
    const deadline = Date.now() + 600_000;
    const done = () =>
      ["arrangeForSurveil-one", "arrangeForSurveil-away", "arrangeForSurveil-order"].every((s) =>
        seen.has(s),
      ) &&
      [...seen].some((s) => s.startsWith("arrangeForScry") || s.startsWith("willPutCardOnTop"));

    const watch = watchGame([host, guest]);
    while (!done() && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        const other = page === host ? guest : host;

        if ((await panel.locator(ORDER_AGAIN).count()) > 0) askedAgain++;
        const rows = panel.locator(ROWS);
        if ((await rows.count()) > 0) {
          const kind = (await rows.getAttribute("data-kind")) ?? "";
          const cards = rows.locator("button.gs-win-tile");
          const top = rows.locator('.gs-win-row[aria-label="Top of library"] button.gs-win-tile');
          const count = await cards.count();
          const step = count === 1 ? "one" : !seen.has(`${kind}-away`) ? "away" : "order";

          // Shown, to this player alone, and no way out.
          expect(count, "the cards are shown").toBeGreaterThan(0);
          await expect(other.locator(".gs-win-rows"), "the other player sees none").toHaveCount(0);
          await expect(panel.locator("button.gs-act-cancel"), "no Cancel").toHaveCount(0);

          if (step === "one") {
            // Alternate: keep one, send the next away.
            if (sentAway++ % 2 === 1) await click(cards.first());
          } else if (step === "away") {
            // The last one across: it shows in the other row.
            await click(top.last());
            await expect(
              rows.locator('.gs-win-row:not([aria-label="Top of library"]) button.gs-win-tile'),
              "the card moved to the other row",
            ).toHaveCount(1, { timeout: 15_000 });
          } else if ((await top.count()) > 1) {
            // All kept: numbered in draw order; Sooner swaps the first two.
            await expect(top.locator(".gs-win-tile-num"), "numbered in draw order").toHaveCount(
              await top.count(),
            );
            const second = (await top.nth(1).getAttribute("data-object-id")) ?? "";
            await click(rows.getByRole("button", { name: /Sooner/ }).first());
            await expect(top.first(), "Sooner moved it up").toHaveAttribute(
              "data-object-id",
              second,
            );
          }
          // AGENTS TEST-011 -- something to LOOK AT, once per look.
          if (!seen.has(`${kind}-${step}`)) {
            seen.add(`${kind}-${step}`);
            await page.screenshot({
              path: `test-results/seen/looking-${kind}-${step}.png`,
              fullPage: true,
            });
          }
          await click(rows.getByRole("button", { name: "Done" }));
          continue;
        }

        // Any other question: the first choice, a board choice, or pass.
        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await click(combat);
          continue;
        }
        if (!priority) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
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
        const land = hand.filter({ hasText: /^(Island|Swamp)/ });
        if ((await land.count()) > 0) {
          await click(land);
          continue;
        }
        const spell = hand.filter({ hasText: SPELLS });
        if ((await spell.count()) > 0) {
          await click(spell);
          const popup = page.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await click(popup);
          continue;
        }
        await click(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
      }
      await host.waitForTimeout(100);
    }
    expect([...seen].sort(), "every look was seen and answered").toEqual(
      expect.arrayContaining([
        "arrangeForSurveil-away",
        "arrangeForSurveil-one",
        "arrangeForSurveil-order",
      ]),
    );
    expect(done(), `scry seen too: ${[...seen].join(", ")}`).toBe(true);
    expect(askedAgain, "the rows answered the order: never asked again").toBe(0);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
