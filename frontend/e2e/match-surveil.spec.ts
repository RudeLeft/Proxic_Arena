// Looking at the top of your library, in a real game, through the page —
// feature spec 0001, F-0001-H and D3 (Phase 8 Part 1).
//
// Surveil and scry show their cards as pictures inside the question, to
// the player looking and nobody else, and are answered by clicking:
//
//   one card    two buttons -- keep it / put it away (surveil: on top or
//               into the graveyard; scry: top or bottom)
//   several     click the ones to send away, then Done; then click the
//               rest in order, the first clicked going on top
//
// Neither has a Cancel: the rules give no way out of looking. While one
// player looks, the other's page shows no cards of theirs.
//
// Both players use the surveil test deck (protocol/fixtures/
// surveil-deck). CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/surveil-deck.zip" protocol/fixtures/surveil-deck

import { test, expect, type Locator } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, question, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "surveil-deck.zip");
const LOOKING = ".gs-question-looking";
const SPELLS = /^(Consider|Notion Rain|Preordain|Opt|Serum Visions)/;

/** A DOM click: fanned hand cards overlap, so a pointer click can land on a neighbour. */
const click = (l: Locator) =>
  l
    .first()
    .evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 5000 })
    .catch(() => undefined);

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

    /** Each look seen once: "<kind>-one", "-away", "-order". */
    const seen = new Set<string>();
    let sentAway = 0;
    const deadline = Date.now() + 600_000;
    const done = () =>
      ["arrangeForSurveil-one", "arrangeForSurveil-away", "arrangeForSurveil-order"].every((s) =>
        seen.has(s),
      ) &&
      [...seen].some((s) => s.startsWith("arrangeForScry") || s.startsWith("willPutCardOnTop"));

    while (!done() && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        const other = page === host ? guest : host;

        const looking = panel.locator(LOOKING);
        if ((await looking.count()) > 0) {
          const kind = (await looking.getAttribute("data-kind")) ?? "";
          const cards = looking.locator(".gs-looking .bf-card");
          const choosable = looking.locator('.gs-looking .bf-card[data-choosable="true"]');
          const buttons = looking.locator(".gs-options .gs-option");
          const { prompt } = await question(page);
          const step =
            (await buttons.count()) > 0
              ? "one"
              : /^Which goes on top of your library/.test(prompt)
                ? "order"
                : "away";

          // Shown, to this player alone, and no way out.
          expect(await cards.count(), "the cards are shown").toBeGreaterThan(0);
          await expect(other.locator(".gs-looking"), "the other player sees none").toHaveCount(0);
          await expect(panel.locator("button.gs-act-cancel"), "no Cancel").toHaveCount(0);

          // AGENTS TEST-011 — something to LOOK AT, once per look.
          if (!seen.has(`${kind}-${step}`)) {
            seen.add(`${kind}-${step}`);
            await page.screenshot({
              path: `test-results/seen/looking-${kind}-${step}.png`,
              fullPage: true,
            });
          }

          if (step === "one") {
            // Alternate: keep one, send the next away.
            await click(buttons.nth(sentAway++ % 2));
          } else if (step === "away") {
            // Send the last one away the first time; keep them all after,
            // so the order is asked.
            const finish = looking.getByRole("button", { name: "Done" });
            if (!seen.has(`${kind}-sent`) && (await choosable.count()) > 1) {
              seen.add(`${kind}-sent`);
              await click(choosable.last());
              // The card sent away stays in view, marked, while the rest are chosen.
              await expect(
                looking.locator(".gs-looking .bf-card").filter({ hasText: "CHOSEN" }),
                "the card sent away is marked",
              ).toHaveCount(1, { timeout: 15_000 });
              await page.screenshot({
                path: `test-results/seen/looking-${kind}-chosen.png`,
                fullPage: true,
              });
            } else {
              await click(finish);
            }
          } else {
            await click(choosable.last());
          }
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
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
