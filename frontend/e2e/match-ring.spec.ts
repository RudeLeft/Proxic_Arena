// The Ring and a dungeon on the board — PHASE_06 §6.96-6.97, P6-AO.
//
// The worker-level check (scripts/check-tracked-state.py) proves the
// protocol carries them. This proves a PLAYER can see them: the
// Ring-bearer marked on its card for both players, how many times the
// Ring has tempted its player, the Ring and the Undercity -- with the
// room the venture marker is in -- in the command zone.
//
// The deck is protocol/fixtures/ring-deck; both players play it the
// same way. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/ring-deck.zip" protocol/fixtures/ring-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  cardCount,
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const ringPackage = join(process.cwd(), "..", "Test Deck", "ring-deck.zip");

// What each spell costs, so nothing unaffordable is clicked: Forge
// offers spells it cannot pay for, and an unpaid cast rolls back to
// the same question. In the order they are worth casting.
const COSTS: Record<string, { B: number; W: number; total: number }> = {
  "Call of the Ring": { B: 1, W: 0, total: 2 },
  "White Plume Adventurer": { B: 0, W: 1, total: 3 },
  "Walking Corpse": { B: 1, W: 0, total: 2 },
  "Child of Night": { B: 1, W: 0, total: 2 },
  "Savannah Lions": { B: 0, W: 1, total: 1 },
  "Elite Vanguard": { B: 0, W: 1, total: 1 },
};

test("the Ring-bearer, the Ring and the dungeon room show on the board", async ({ browser }) => {
  test.skip(!existsSync(ringPackage), "no ring deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, ringPackage);
    await startAMatch(host, guest, deckName);

    const totals = (page: Page) => matchPanel(page).locator(".gs-seat");
    const bearers = (page: Page) =>
      matchPanel(page).locator(".bf-cards button.bf-card").filter({ hasText: "Ring-bearer" });
    const seen = async (pattern: RegExp) =>
      (await totals(host).filter({ hasText: pattern }).count()) > 0 ||
      (await totals(guest).filter({ hasText: pattern }).count()) > 0;
    const everything = async () =>
      (await seen(/the Ring has tempted/)) &&
      (await seen(/Undercity \(room: /)) &&
      (await bearers(host).count()) > 0 &&
      (await bearers(guest).count()) > 0;
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    const deadline = Date.now() + 1_000_000;
    while (Date.now() < deadline && !(await everything())) {
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const prompt = (await panel.locator(".decision-prompt").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (
        /Choose a creature to (attack|block)/.test(prompt) ||
        /Declare (attackers|blockers)/.test(heading)
      ) {
        // No combat: the initiative stays where it was taken.
        pick = -1;
      } else if (/Your move/.test(heading)) {
        const mine = panel.locator(
          '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
        );
        const untapped = mine.filter({ hasNotText: "tapped" });
        const swamps = await cardCount(untapped.filter({ hasText: "Swamp" }));
        const plains = await cardCount(untapped.filter({ hasText: "Plains" }));
        const swampsOut = await cardCount(mine.filter({ hasText: "Swamp" }));
        const plainsOut = await cardCount(mine.filter({ hasText: "Plains" }));
        pick = find(
          new RegExp(`^${swampsOut <= plainsOut ? "Swamp" : "Plains"} — no cost — Play land`),
        );
        if (pick < 0) pick = find(/Play land/);
        for (const [name, cost] of Object.entries(COSTS)) {
          if (pick >= 0) break;
          if (
            (name === "Call of the Ring" || name === "White Plume Adventurer") &&
            (await mine.filter({ hasText: name }).count()) > 0
          )
            continue;
          const affordable = swamps >= cost.B && plains >= cost.W && swamps + plains >= cost.total;
          if (affordable) pick = find(new RegExp(`^${name} — \\{`));
        }
      } else if (labels.length) {
        // The Ring-bearer, paying 2 life, a dungeon room, a scry,
        // mana and targets: Forge's first.
        pick = 0;
      }
      if (pick >= 0) {
        await options.nth(pick).click();
      } else {
        await panel.getByRole("button", { name: "Pass" }).click();
      }
      await live.waitForTimeout(40);
    }

    expect(await seen(/the Ring has tempted/), "the Ring never tempted anyone").toBe(true);
    expect(await seen(/command zone: .*The Ring/), "the Ring is not in the command zone").toBe(
      true,
    );
    expect(await seen(/Undercity \(room: /), "no dungeon room was shown").toBe(true);
    // Public: both players see the same Ring-bearers.
    expect(await bearers(host).count()).toBeGreaterThan(0);
    expect(await bearers(guest).count()).toBe(await bearers(host).count());
    await host.screenshot({ path: "test-results/seen/ring-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/ring-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
