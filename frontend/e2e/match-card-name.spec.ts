// Naming a card, in a real match, through the page — PHASE_06 P6-AG.
//
// Owner decision 2026-10-20: search, then pick. Forge allows tens of
// thousands of names, so the question arrives SEARCHABLE: the page
// shows a box, sends what the player types, and offers only names
// the server sent back. The answer is one of those, and the game
// moves on.
//
// Two cards, two lists, and the difference is the check:
//
//   Pithing Needle       "Choose a card name"        any card
//   Phyrexian Revoker    "Choose a nonland card name"  Forge removes
//                                                     lands itself
//
// So the same search, "mountain", must offer Mountain first for the
// Needle (an exact match outranks "Mountain Goat") and must NOT
// offer it at all for the Revoker. Both lists are FORGE's; the page
// only displays them.
//
// The deck is protocol/fixtures/card-name-deck: 52 Mountains, four
// of each card. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/card-name-deck.zip" protocol/fixtures/card-name-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  choices,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const namingPackage = join(process.cwd(), "..", "Test Deck", "card-name-deck.zip");

test("naming a card is a search over Forge's names, and the pick is one of them", async ({
  browser,
}) => {
  test.skip(!existsSync(namingPackage), "no card-name deck package built");

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, namingPackage);
    await startAMatch(host, guest, deckName);

    const seen = { any: false, nonland: false };
    const naming = /Name a card/;

    /** The question on `page`, checked, looked at, and answered. */
    const answerNaming = async (page: Page, panel: Locator) => {
      const prompt = (await panel.locator(".decision-prompt").allTextContents()).join(" ");
      const nonland = /nonland/i.test(prompt);

      // Searchable: a box, and no list of thirty thousand buttons.
      const box = panel.getByRole("searchbox", { name: "Card name" });
      await expect(box).toBeVisible();
      await expect(panel.getByRole("list", { name: "Matching names" })).toHaveCount(0);
      // Mandatory: Forge's chooser has no cancel, so no Pass.
      await expect(panel.getByRole("button", { name: "Pass" })).toHaveCount(0);

      await box.fill("mountain");
      const results = panel.getByRole("list", { name: "Matching names" }).getByRole("button");
      await expect(results.first()).toBeVisible({ timeout: 30_000 });
      const names = await results.allTextContents();

      if (nonland) {
        // Forge's predicate removed every land before the search.
        expect(names, "a land offered for a nonland name").not.toContain("Mountain");
        expect(names.every((name) => /mountain/i.test(name))).toBe(true);
        seen.nonland = true;
      } else {
        // The exact name outranks every name merely containing it.
        expect(names[0]).toBe("Mountain");
        seen.any = true;
      }

      // AGENTS TEST-011 — something to LOOK AT.
      await page.screenshot({
        path: `test-results/seen/name-a-card-${nonland ? "nonland" : "any"}.png`,
        fullPage: true,
      });

      // The pick is one of the server's results, and the game moves.
      await results.first().click({ timeout: 15_000 });
      await expect(panel.getByRole("heading", { name: naming })).toHaveCount(0, {
        timeout: 60_000,
      });
    };

    // Bounded by the clock, as every match loop here is (see
    // match-loyalty.spec.ts for why not by a counter).
    const deadline = Date.now() + 600_000;
    let answered = 0;
    while (Date.now() < deadline && !(seen.any && seen.nonland)) {
      const asked = (await matchPanel(host).getByRole("heading", { name: naming }).count())
        ? host
        : (await matchPanel(guest).getByRole("heading", { name: naming }).count())
          ? guest
          : null;
      if (asked) {
        await answerNaming(asked, matchPanel(asked));
        continue;
      }

      const over = await matchPanel(host)
        .getByText(
          /The game is over|was a draw|ended without a result|You won on turn|You won\.|opponent won|won on turn|stopped before it finished/,
        )
        .count();
      if (over > 0) break;

      const asking = async (page: Page) =>
        (await isAsked(page)) ||
        (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }

      // Cast the naming cards whenever they are on offer, lands
      // otherwise, and nothing else: the game exists to ask the
      // question. Mana is paid from the first source offered.
      const options = await choices(live);
      const labels = await options.allTextContents();
      // Nobody attacks or blocks. Forge labels a Revoker in combat
      // "Phyrexian Revoker — 2/1", which the cast pattern below also
      // matches: CI once sent Revokers in until somebody died, before
      // a Pithing Needle had been drawn, and the "any name" question
      // never came. A game with no combat runs to the libraries.
      const prompt = (await matchPanel(live).locator(".decision-prompt").allTextContents()).join(
        " ",
      );
      if (/Choose a creature to (attack|block) with/.test(prompt)) {
        // Bounded, every click in this loop: an element that goes between
        // finding and clicking otherwise waits out the whole test (CI,
        // 2026-10-21 -- 15 minutes, no word of which one).
        await matchPanel(live)
          .getByRole("button", { name: "Pass" })
          .click({ timeout: 10_000 })
          .catch(() => undefined);
        answered += 1;
        await live.waitForTimeout(40);
        continue;
      }
      const namer = labels.findIndex((label) =>
        /^(Pithing Needle|Phyrexian Revoker) —/.test(label),
      );
      const land = labels.findIndex((label) => label.includes("Play land"));
      const paying = labels.findIndex((label) => /still owing/.test(label));
      const pick = paying >= 0 ? paying : namer >= 0 ? namer : land;
      if (pick >= 0) {
        await options
          .nth(pick)
          .click({ timeout: 10_000 })
          .catch(() => undefined);
      } else {
        const pass = matchPanel(live).getByRole("button", { name: "Pass" });
        if ((await pass.count()) === 0) {
          await options
            .first()
            .click({ timeout: 10_000 })
            .catch(() => undefined);
        } else {
          await pass.click({ timeout: 10_000 }).catch(() => undefined);
        }
      }
      answered += 1;
      await live.waitForTimeout(40);
    }

    expect(seen, `after ${answered} decisions`).toEqual({ any: true, nonland: true });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
