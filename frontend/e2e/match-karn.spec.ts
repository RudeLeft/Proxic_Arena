// Karn Liberated restarts the game, in the browser — PHASE_06
// §6.69-§6.72, P6-AD.
//
// The worker-level check (scripts/check-karn.py) proves the protocol:
// a new epoch, the old ids dead. This proves what a PLAYER sees: the
// match carries on in the same page, the board is a new game -- turn
// one, twenty life -- the turn line says "Game 2", and (spec 0097, item 4)
// the player who did not restart it is told so in a report window ("Bob
// restarted the game. This is game 2."); no grey notice for anyone.
//
// Spec 0102, item 1 (round 2 Q6 B): on the guest's page the window comes
// first and holds game 1's table -- no card moves before the guest really
// clicks Close; then the cards sweep into the libraries (ghosts gliding to
// the Library tiles) and game 2's deal plays (the opening-hand window). The
// host, who restarted it, gets no window.
//
// The deck is protocol/fixtures/karn-deck: 56 Plains, 4 Karn. CI
// builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/karn-deck.zip" protocol/fixtures/karn-deck

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
  watchGame,
  discardIfAsked,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const karnPackage = join(process.cwd(), "..", "Test Deck", "karn-deck.zip");

/**
 * Spec 0102, item 1 -- on the guest's page: game 1's table held under the
 * window (a card on it does not move, nothing sweeps), the 4 s bar draining;
 * the guest really clicks Close; then every card sweeps to a Library tile and
 * game 2's deal plays. The host (who restarted it) has no window.
 */
async function theWindowHolds(guest: Page, host: Page) {
  const panel = matchPanel(guest);
  const sweeping = panel.locator('[data-ghost-of][data-return="library"]');
  // One of the host's lands (Karn himself is gone: his −14 took his last loyalty).
  const land = panel
    .locator('.bf-cards button[data-controller="opponent"][data-object-id^="card:"]')
    .filter({ hasText: "Plains" })
    .first();
  await expect(panel.locator(".gs-reveal-drain")).toHaveCount(1);
  await expect(land).toBeVisible();
  const at = await land.boundingBox();
  await guest.waitForTimeout(600);
  expect(await sweeping.count(), "a card swept before the window was closed").toBe(0);
  // (In place: the restarting ability's own resolve pulse may breathe on it.)
  const now = await land.boundingBox();
  const centre = (b: typeof at) => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null);
  expect(now, "game 1's table went under the window").not.toBeNull();
  expect(
    Math.hypot(centre(now)!.x - centre(at)!.x, centre(now)!.y - centre(at)!.y),
    "game 1's table moved under the window",
  ).toBeLessThan(8);
  expect(await told(host)).toBe(false);
  await panel.locator(".gs-reveal .gs-reveal-close").click();
  await expect
    .poll(async () => (await sweeping.count()) + ((await land.count()) === 0 ? 1 : 0), {
      timeout: 5_000,
      intervals: [30],
    })
    .toBeGreaterThan(0);
  // Game 2's deal (0089): the "−7" rising off the libraries, then the seven in hand.
  // (The mulligan window waits for the host, who is asked first.)
  await expect
    .poll(() => panel.locator('[data-fight="number"]', { hasText: "−7" }).count(), {
      timeout: 20_000,
      intervals: [30],
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() => cardCount(panel.locator('[data-zone="viewer:hand"]')), { timeout: 20_000 })
    .toBe(7);
  await guest.screenshot({ path: "test-results/seen/karn-guest-deal.png", fullPage: true });
}

async function told(page: Page) {
  return (
    (await matchPanel(page)
      .locator(".gs-reveal")
      .filter({ hasText: "restarted the game. This is game 2." })
      .count()) > 0
  );
}

test("Karn's ultimate restarts the game, and both players see game 2 begin", async ({
  browser,
}) => {
  test.skip(!existsSync(karnPackage), "no Karn deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, karnPackage);
    await startAMatch(host, guest, deckName, { settle: false });

    // Spec 0030: the ladder's turn line reads "Turn 1 · Game 2".
    const restarted = /· Game 2\b/;
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    // Bounded by the clock: the host needs seven lands, then three
    // of its own turns with Karn out.
    let mulligans = 0;
    const deadline = Date.now() + 1_000_000;
    let answered = 0;
    const watch = watchGame([host, guest], () => "", { allowEnd: true });
    let held = false;
    while (Date.now() < deadline) {
      if ((await matchPanel(host).getByText(restarted).count()) > 0) break;
      // Spec 0102 -- the window holds the guest's table: look, then close it.
      if (!held && (await told(guest))) {
        held = true;
        await theWindowHolds(guest, host);
        continue;
      }
      await watch.check();

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Keep or mulligan/.test(heading)) {
        // The host keeps only a hand with Karn in it.
        const hand = await panel.locator('[data-zone="viewer:hand"]').allTextContents();
        // At most two mulligans, then keep and draw into it: each
        // mulligan shrinks the hand, an EMPTY hand can never hold the
        // card, and "keep only with it" then mulligans for ever. CI
        // hit exactly that (2026-10-20).
        const keep =
          live !== host || mulligans >= 2 || hand.some((name) => name.includes("Karn Liberated"));
        if (!keep) mulligans += 1;
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Plains/);
      } else if (live === host) {
        const mine = panel.locator(
          '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
        );
        const karnOut = (await mine.filter({ hasText: "Karn" }).count()) > 0;
        // Forge offers a spell whether or not it can be paid for, and
        // an unpaid cast rolls back to the same question -- clicking
        // Karn at six lands would loop for ever. So count first.
        const lands = await cardCount(mine.filter({ hasText: "Plains" }));
        pick = find(/-14: Restart the game/);
        if (pick < 0) pick = find(/\+4: Target player/);
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && !karnOut && lands >= 7) pick = find(/^Karn Liberated · \{7\}/);
        if (pick < 0) pick = /Pay the mana|^\s*Pay \{/.test(heading) ? 0 : -1;
        if (pick < 0) pick = find(new RegExp(`^${secondUser}`)); // +4's target: the opponent
      } else {
        // The guest plays lands and nothing else; when Karn's +4 makes
        // it exile a card from hand, any card will do.
        pick = find(/Play land/);
        if (pick < 0 && /Choose one/.test(heading)) pick = 0;
      }
      // Mandatory questions with no rule above take Forge's first.
      if (
        pick < 0 &&
        (await panel.getByRole("button", { name: "Pass" }).count()) === 0 &&
        labels.length
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

    // Game 2, as each player sees it.
    for (const page of [host, guest]) {
      const panel = matchPanel(page);
      // Spec 0061: discarding to hand size is pick, then Discard.
      if (await discardIfAsked(page)) continue;
      await expect(panel.getByText(restarted), `after ${answered} decisions`).toBeVisible({
        timeout: 120_000,
      });
      // Spec 0097: no grey line any more.
      await expect(panel.getByText("The game restarted. This is game 2 of the match.")).toHaveCount(
        0,
      );
      // A new game: the same page and the same match, and twenty life
      // each again.
      await expect(panel.locator(".gs-seat").filter({ hasText: "20 life" })).toHaveCount(2);
    }
    // Spec 0097, item 4 (F-0097-C): the report window, to the other player only.
    // Spec 0102: the guest closed it (above); the host never had one.
    expect(held, "the guest's page never showed the restart window").toBe(true);
    expect(await told(host)).toBe(false);
    await host.screenshot({ path: "test-results/seen/karn-restart.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
