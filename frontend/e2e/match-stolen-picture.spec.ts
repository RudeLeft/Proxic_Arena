// A stolen creature wears its owner's picture, and the graveyard shows
// pictures -- spec 0049.
//
// The host plays the Treason deck (Mountains and "gain control of target
// creature" spells, no creatures); the guest the Goblin deck (Mountains
// and one-drop creatures). The guest casts a creature, the host takes it.
// A creature's picture is in its OWNER's deck, and the Treason deck has no
// creature pictures at all: a stolen creature wearing one found it in the
// guest's deck. Before 0049 it was looked for in the thief's and came out
// bare, and the spent steal spell in the graveyard showed no picture.
//
// The decks are protocol/fixtures/treason-deck and goblin-deck. CI builds
// them; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/treason-deck.zip" protocol/fixtures/treason-deck
//   node scripts/make-ci-deck.mjs "Test Deck/goblin-deck.zip" protocol/fixtures/goblin-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import {
  answer,
  answerCardTray,
  boardCards,
  cardCount,
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const treasonPackage = join(process.cwd(), "..", "Test Deck", "treason-deck.zip");
const goblinPackage = join(process.cwd(), "..", "Test Deck", "goblin-deck.zip");

const STEAL = /^(Act of Treason|Threaten|Traitorous Blood|Kari Zev's Expertise|Hijack) ·/;
const CREATURE = /Raging Goblin|Goblin Guide|Monastery Swiftspear|Jackal Pup|Mogg Fanatic/;

test("a stolen creature wears its owner's picture, and the graveyard shows pictures", async ({
  browser,
}) => {
  test.skip(
    !existsSync(treasonPackage) || !existsSync(goblinPackage),
    "no stolen-creature deck packages built",
  );

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const treason = await sharedDeck(host, guest, treasonPackage);
    const goblins = await sharedDeck(host, guest, goblinPackage);
    await startAMatch(host, guest, treason, { settle: false, guestDeck: goblins });

    // The host's side of the board: the Treason deck has no creatures, so
    // a creature here is the guest's, taken.
    const stolen = boardCards(host, "viewer").filter({ hasText: CREATURE });
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest]);
    while (Date.now() < deadline && (await stolen.count()) === 0) {
      await watch.check();
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      if (await answerCardTray(live)) continue;
      const panel = matchPanel(live);
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));

      let pick = -1;
      if (/Keep or mulligan/.test(heading)) pick = find(/Keep/);
      else if (/Play first|go first|Play or draw/i.test(heading)) pick = 0;
      else if (/Put a card back/.test(heading)) pick = find(/^Mountain/);
      else {
        pick = find(/Play land/);
        if (pick < 0) pick = /Pay the mana|^\s*Pay \{/.test(heading) ? 0 : -1;
        if (pick < 0 && live === host) {
          const mine = boardCards(host, "viewer").filter({ hasText: "Mountain" });
          const untapped = await cardCount(mine.filter({ hasNotText: "tapped" }));
          const theirs = await cardCount(
            boardCards(host, "opponent").filter({ hasText: CREATURE }),
          );
          // Forge offers what cannot be paid for; count first.
          if (theirs > 0 && untapped >= 3) pick = find(STEAL);
          // The target: the host has no creatures, so any creature offered is the guest's.
          if (pick < 0) pick = find(CREATURE);
          if (pick < 0) pick = find(/^Pay the cost/);
        }
        if (pick < 0 && live === guest) {
          pick = labels.findIndex((label) => CREATURE.test(label) && / [·—] \{/.test(label));
        }
      }
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
      await live.waitForTimeout(40);
    }

    // The stolen creature, on the host's side, wears a picture -- from the
    // guest's deck, since the host's has none -- and the guest sees the same.
    await expect(stolen.first(), "the host took the guest's creature").toBeVisible({
      timeout: 60_000,
    });
    const picture = stolen.first().locator("img.bf-art");
    await expect(picture, "the stolen creature wears its owner's picture").toBeVisible({
      timeout: 30_000,
    });
    const src = await picture.getAttribute("src");
    expect(src).toBeTruthy();
    const name = (await stolen.first().getAttribute("aria-label")) ?? "";
    // In plain sight, not under the steal spell's own card: the first run's
    // screenshot showed the spell on top of the creature, which "visible"
    // does not notice.
    await expect
      .poll(
        () =>
          stolen.first().evaluate((card) => {
            const box = card.getBoundingClientRect();
            const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return top !== null && card.contains(top);
          }),
        { timeout: 60_000, message: "nothing covers the stolen creature" },
      )
      .toBe(true);
    // The spell's big card fades out over the board (pointer-events off,
    // so the check above passes through it); let it finish before the
    // picture is photographed.
    await host.waitForTimeout(6_000);
    await stolen.first().screenshot({ path: "test-results/seen/stolen-card.png" });
    await host.screenshot({ path: "test-results/seen/stolen-host.png", fullPage: true });
    const onTheirs = boardCards(guest, "opponent").filter({ hasText: CREATURE }).first();
    await expect(onTheirs.locator("img.bf-art"), "the guest sees it with a picture").toBeVisible({
      timeout: 30_000,
    });
    await guest.screenshot({ path: "test-results/seen/stolen-guest.png", fullPage: true });

    // The spent steal spell, in the host's graveyard, shows its picture.
    await expect
      .poll(
        async () =>
          (await matchPanel(host)
            .getByRole("button", { name: new RegExp(`^${testUser}'s graveyard, [1-9]`) })
            .count()) > 0,
        { timeout: 60_000 },
      )
      .toBe(true);
    await matchPanel(host)
      .getByRole("button", { name: new RegExp(`^${testUser}'s graveyard`) })
      .click();
    // Phase 9 W-18: your own pile is "Your graveyard".
    const viewer = host.getByRole("dialog", { name: "Your graveyard" });
    await viewer.locator("button.gs-viewer-card").first().click();
    await expect(
      host.locator("img.gs-inspect-art"),
      "a graveyard card looked at shows its picture",
    ).toBeVisible({ timeout: 30_000 });
    await expect(host.locator(".gs-inspect-noart")).toHaveCount(0);
    // Phase 9 W-19: the close-up opens on top of the tray, nothing over it.
    const art = (await host.locator("img.gs-inspect-art").boundingBox())!;
    expect(
      await host.evaluate(
        ([x, y]) => document.elementFromPoint(x!, y!)?.classList.contains("gs-inspect-art"),
        [art.x + art.width / 2, art.y + art.height / 2],
      ),
      "nothing covers the close-up",
    ).toBe(true);
    await host.screenshot({ path: "test-results/seen/stolen-graveyard.png", fullPage: true });
    console.log(`stolen: ${name}; picture ${src}`);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
