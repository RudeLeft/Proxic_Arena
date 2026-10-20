// An alternate win, in the browser — PHASE_06 §6.149, P6-AP.
//
// The worker-level check (scripts/check-alternate-win.py) proves the
// protocol: Forge declares the win and says why. This proves what a
// PLAYER sees: the result line names the winner and Forge's reason,
// with both players still on 20 life -- so nothing about the board
// could have told Arena who won.
//
// The deck is protocol/fixtures/maniac-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/maniac-deck.zip" protocol/fixtures/maniac-deck

import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const maniacPackage = join(process.cwd(), "..", "Test Deck", "maniac-deck.zip");
const MANIAC = "Laboratory Maniac";
// The RESULT line, and only that: the pregame question says "You won
// the die roll", and a bare "You won" here once ended the loop before
// anybody had answered anything.
const OVER =
  /You won on turn|You won\.|opponent won|was a draw|ended without a result|stopped before it finished/;

// What each spell costs in Islands, so nothing unaffordable is
// clicked: Forge offers spells it cannot pay for, and an unpaid cast
// rolls back to the same question.
const MILLS: [RegExp, number][] = [
  [/^Hedron Crab — \{U\}/, 1],
  [/^Traumatize — \{3\}\{U\}\{U\}/, 5],
  [/^Tome Scour — \{U\}/, 1],
  [/^Thought Scour — \{U\}/, 1],
];

/**
 * P6-BC — imported deck storage, fingerprinted: every row of the four
 * tables an import writes, and every artwork file. Only with the
 * container (PROXIC_E2E_CONTAINER, as match-concurrency uses), and
 * null without it; the server test `a finished match stops its worker
 * and leaves nothing behind` holds the rows to the same rule in CI.
 */
const container = process.env.PROXIC_E2E_CONTAINER;
function deckStorage(): string | null {
  if (!container) return null;
  const sh = (name: string, script: string) =>
    execFileSync("docker", ["exec", name, "sh", "-c", script], { encoding: "utf-8" }).trim();
  const rows = sh(
    container.replace("arena-server", "postgres"),
    'psql -U "$POSTGRES_USER" -d proxic -Atc "SELECT md5(string_agg(t, \'|\' ORDER BY t)) FROM (' +
      "SELECT 'd'||row(d.*)::text t FROM imported_deck d UNION ALL " +
      "SELECT 'e'||row(e.*)::text FROM deck_entry e UNION ALL " +
      "SELECT 's'||row(s.*)::text FROM deck_share s UNION ALL " +
      "SELECT 'a'||row(a.*)::text FROM art_asset a) x\"",
  );
  const art = sh(container, "cd /data/art && find . -type f | sort | xargs sha256sum | sha256sum");
  return `${rows} ${art}`;
}

test("Laboratory Maniac wins the game, and both players are told why", async ({ browser }) => {
  test.skip(!existsSync(maniacPackage), "no Maniac deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, maniacPackage);
    const decksBefore = deckStorage();
    await startAMatch(host, guest, deckName, { settle: false });

    const asking = async (page: Page) =>
      (await matchPanel(page).getByRole("listitem").getByRole("button").count()) > 0 ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    const deadline = Date.now() + 1_000_000;
    let answered = 0;
    while (Date.now() < deadline) {
      if ((await matchPanel(host).getByText(OVER).count()) > 0) break;

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      const panel = matchPanel(live);
      const heading = (await panel.locator(".decision h3").allTextContents()).join(" ");
      const prompt = (await panel.locator(".decision-prompt").allTextContents()).join(" ");
      const options = panel.getByRole("listitem").getByRole("button");
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Keep or mulligan/.test(heading)) {
        // The host keeps only a hand with the Maniac in it.
        const hand = await panel.locator(".board-hand .card-chip").allTextContents();
        const keep = live !== host || hand.some((name) => name.includes(MANIAC));
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Put a card back/.test(heading)) {
        pick = find(/^Island/);
      } else if (/Choose a creature to attack/.test(prompt)) {
        // Nobody attacks: life must not move.
        pick = -1;
      } else if (live === host) {
        const mine = panel.locator(".board-side.mine .card-chip");
        const maniacOut = (await mine.filter({ hasText: MANIAC }).count()) > 0;
        const untapped = await mine
          .filter({ hasText: "Island" })
          .filter({ hasNotText: "tapped" })
          .count();
        // Every mill targets the host itself.
        pick = find(new RegExp(`^${testUser}`));
        if (pick < 0) pick = find(/still owing/);
        if (pick < 0 && maniacOut) {
          for (const [cast, cost] of MILLS) {
            if (pick < 0 && untapped >= cost) pick = find(cast);
          }
        }
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && !maniacOut && untapped >= 3) pick = find(/^Laboratory Maniac — \{2\}\{U\}/);
      } else {
        // The guest plays lands and nothing else.
        pick = find(/Play land/);
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
        await options.nth(pick).click();
      } else {
        await panel.getByRole("button", { name: "Pass" }).click();
      }
      answered += 1;
      await live.waitForTimeout(40);
    }

    // The result, as each player sees it: Forge's winner, and Forge's
    // reason, word for word.
    const why = "The winner has won due to effect of 'Laboratory Maniac'.";
    await expect(
      matchPanel(host).getByText(/You won on turn \d+\./),
      `after ${answered} decisions`,
    ).toBeVisible({ timeout: 120_000 });
    await expect(matchPanel(host).getByText(why)).toBeVisible();
    await expect(matchPanel(guest).getByText(/Your opponent won on turn \d+\./)).toBeVisible({
      timeout: 30_000,
    });
    await expect(matchPanel(guest).getByText(why)).toBeVisible();
    // Life never moved, so it could not have decided anything; the
    // host's library is empty, which is the Maniac's condition.
    for (const page of [host, guest]) {
      await expect(
        matchPanel(page).locator(".board-totals").filter({ hasText: "20 life" }),
      ).toHaveCount(2);
    }
    await expect(
      matchPanel(host)
        .locator(".board-side.mine .board-totals")
        .filter({ hasText: /\s0 in library/ }),
    ).toHaveCount(1);
    // P6-BC — a whole real game later, the deck storage it was played
    // from is unchanged, rows and artwork alike.
    expect(deckStorage(), "a match changed imported deck storage").toBe(decksBefore);
    if (decksBefore) console.log(`deck storage unchanged across the match: ${decksBefore}`);
    await host.screenshot({ path: "test-results/seen/alternate-win-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/alternate-win-guest.png", fullPage: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
