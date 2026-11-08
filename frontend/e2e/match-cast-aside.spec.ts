// The card being cast never covers what is to be clicked -- owner
// 2026-11-01, item 4 (canvas https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81).
//
// Paying for a spell, the big card floats in the middle -- which is where
// the creature row is, so a mana elf (or a land turned creature) to tap
// was hidden under it. Now it moves up and toward the stack, keeping its
// size, whenever something to click is under it.
//
// Checked at every payment step in a real game: each card that can be
// clicked to pay is the thing under the mouse at its own centre -- not the
// card being cast -- and once the card has moved aside it is still big.
//
// Uses the landing test deck (protocol/fixtures/landing-deck): Forests and
// creatures, with Llanowar Elves and Elvish Mystic to pay with.

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  passCombat,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
  discardIfAsked,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const ELVES = /^(Llanowar Elves|Elvish Mystic)/;
const BIG = /^(Craw Wurm|Kalonian Tusker|Leatherback Baloth|Centaur Courser|Giant Spider)/;

/** Every card that can be clicked to pay, and whether it is what the mouse would hit. */
async function reachable(page: Page) {
  return page.evaluate(() => {
    const cast = document.querySelector(".gs-cast:not(.gs-cast-leaving)");
    const r = cast?.getBoundingClientRect() ?? null;
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
      ),
    ].map((b) => {
      const box = b.getBoundingClientRect();
      // The visible left part (crowded rows show each card's left third).
      const x = box.x + Math.min(box.width / 2, 20);
      const y = box.y + box.height / 2;
      const under = document.elementFromPoint(x, y)?.closest("[data-object-id]");
      return {
        id: b.getAttribute("data-object-id"),
        name: (b.getAttribute("aria-label") ?? "").split(",")[0],
        hit: under?.getAttribute("data-object-id") === b.getAttribute("data-object-id"),
        // Any part of the card under the card being cast.
        covered:
          !!r &&
          box.x < r.x + r.width &&
          r.x < box.x + box.width &&
          box.y < r.y + r.height &&
          r.y < box.y + box.height,
      };
    });
    return { cast: r ? { h: r.height, y: r.y } : null, cards };
  });
}

test("paying for a spell, the card being cast never covers a card to tap", async ({ browser }) => {
  test.skip(!existsSync(pkg), "no landing deck package (CI builds it)");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    let checked = 0;
    let withElves = 0;
    let shot = false;
    const deadline = Date.now() + 780_000;
    const watch = watchGame([host, guest], () => ({ withElves }));
    while (withElves < 2 && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        // Spec 0061: discarding to hand size is pick, then Discard.
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if ((await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) > 0) {
          // Paying: once it has slid aside (0.38 s), every card to tap is
          // clear of it and reachable.
          await page.waitForTimeout(500);
          const seen = await reachable(page);
          if (seen.cards.length > 0 && seen.cast) {
            checked += 1;
            const blocked = seen.cards.filter((c) => c.covered || !c.hit);
            expect(blocked, "a card to tap is under the card being cast").toEqual([]);
            if (seen.cards.some((c) => ELVES.test(c.name ?? ""))) {
              withElves += 1;
              if (!shot) {
                await page.screenshot({ path: "test-results/seen/cast-aside-paying.png" });
                shot = true;
              }
            }
            // Tap an elf first, so the creature row is what is paid from.
            const elf = page
              .locator('.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])')
              .filter({ hasText: ELVES });
            const any = page.locator(
              '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
            );
            await clickNow((await elf.count()) > 0 ? elf : any);
            continue;
          }
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const board = page.locator('.bf-cards button[data-choosable="true"]');
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        // Elves first, then lands, then the big creatures paid with them.
        const order = [
          hand.filter({ hasText: ELVES }),
          hand.filter({ hasText: /^Forest/ }),
          hand.filter({ hasText: BIG }),
        ];
        let acted = false;
        for (const pick of order) {
          if ((await pick.count()) > 0) {
            await clickNow(pick);
            acted = true;
            break;
          }
        }
        if (!acted) {
          await clickNow(
            panel.locator(
              "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
            ),
          );
        }
      }
      await host.waitForTimeout(120);
    }
    expect(
      withElves,
      `paid with elves on the table (${checked} payment steps checked)`,
    ).toBeGreaterThanOrEqual(2);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
