// Player state on the board — PHASE_06 §6.96, P6-AO.
//
// The worker-level check (scripts/check-player-state.py) proves the
// protocol carries Forge's player and global state. This proves a
// PLAYER can see it: poison, energy and the monarch, on the totals
// line of the player they belong to.
//
// The deck is protocol/fixtures/state-deck; both players play it the
// same way. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/state-deck.zip" protocol/fixtures/state-deck

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
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const statePackage = join(process.cwd(), "..", "Test Deck", "state-deck.zip");

// What each spell costs, so nothing unaffordable is clicked: Forge
// offers spells it cannot pay for, and an unpaid cast rolls back to
// the same question.
const COSTS: Record<string, { G: number; W: number; total: number }> = {
  "Glistener Elf": { G: 1, W: 0, total: 1 },
  "Blight Mamba": { G: 1, W: 0, total: 2 },
  "Servant of the Conduit": { G: 1, W: 0, total: 2 },
  "Palace Jailer": { G: 0, W: 2, total: 4 },
  "Palace Sentinels": { G: 0, W: 1, total: 4 },
};
const INFECT = ["Glistener Elf", "Blight Mamba"];

test("poison, energy and the monarch show on the board as Forge's state", async ({ browser }) => {
  test.skip(!existsSync(statePackage), "no state deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, statePackage);
    await startAMatch(host, guest, deckName);

    // Spec 0038: counters and markers are in the status trays.
    const totals = (page: Page) => matchPanel(page).locator(".gs-seat, .gs-status");
    const seen = async (pattern: RegExp) =>
      (await totals(host).filter({ hasText: pattern }).count()) > 0 ||
      (await totals(guest).filter({ hasText: pattern }).count()) > 0;
    const everything = async () =>
      (await seen(/\d+ poison/)) && (await seen(/\d+ energy/)) && (await seen(/· monarch/));
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
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));
      const poisoned = await seen(/\d+ poison/);

      let pick = -1;
      if (
        /Choose a creature to attack/.test(
          (await panel.locator(".decision-prompt").allTextContents()).join(" "),
        )
      ) {
        // Infect attacks until someone has been poisoned once.
        if (!poisoned)
          pick = labels.findIndex((label) => INFECT.some((name) => label.startsWith(name)));
      } else if (/Your move/.test(heading)) {
        const lands = panel
          .locator(
            '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
          )
          .filter({ hasNotText: "tapped" });
        const forests = await cardCount(lands.filter({ hasText: "Forest" }));
        const plains = await cardCount(lands.filter({ hasText: "Plains" }));
        const hubs = await cardCount(lands.filter({ hasText: "Aether Hub" }));
        pick = find(/^Aether Hub — no cost — Play land/);
        if (pick < 0) pick = find(/Play land/);
        for (const [name, cost] of Object.entries(COSTS)) {
          if (pick >= 0) break;
          const affordable =
            forests >= cost.G && plains >= cost.W && forests + plains + hubs >= cost.total;
          if (affordable) pick = find(new RegExp(`^${name} — \\{`));
        }
      } else {
        // Mana, targets, confirmations: Forge's first. Mandatory
        // questions with nothing else to go on take it too.
        if (find(/still owing/) >= 0 || find(/^Pay the cost/) >= 0 || labels.length) pick = 0;
      }
      if (pick >= 0) {
        await answer(options.nth(pick));
      } else {
        await answer(panel.getByRole("button", { name: "Pass" }));
      }
      await live.waitForTimeout(40);
    }

    expect(await seen(/\d+ poison/), "nobody was ever poisoned").toBe(true);
    expect(await seen(/\d+ energy/), "nobody ever had energy").toBe(true);
    expect(await seen(/· monarch/), "nobody ever became the monarch").toBe(true);
    // Forge's internal effect pieces are not "the command zone": a
    // regeneration shield and the monarch's own bookkeeping object
    // once showed there.
    for (const page of [host, guest]) {
      await expect(
        totals(page).filter({ hasText: /command zone: .*(Regeneration|The Monarch)/ }),
      ).toHaveCount(0);
    }
    await host.screenshot({ path: "test-results/seen/player-state-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/player-state-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
