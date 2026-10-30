// Many triggers at once, in the browser — PHASE_09 group 1 (W-04, W-05,
// W-06; owner 2026-10-30, "answer once for all the copies").
//
// The host builds a board of Goblins with Boggart Shenanigans out, then
// casts Pyroclasm: every Goblin dies at once, and Boggart Shenanigans
// triggers once for each. Copies of one trigger are not an order question;
// if a Goblin Arsonist died too, the order tray shows two cards, the
// Boggart copies as one. The first copy's target is asked in a bubble
// beside the stack with "Same target for all" ticked; the first yes offers
// "Yes to all N". After those clicks the page answers the rest itself, and
// the opponent loses a life for each copy.

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, clickNow, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "triggers-deck.zip");
const MAKERS =
  /^(Dragon Fodder|Krenko's Command|Hordeling Outburst|Goblin Rally|Goblin Instigator|Goblin Arsonist)/;
const WIPES = /^(Pyroclasm|Sweltering Suns)/;
const SEEN = "test-results/seen";

/** The host's Goblin creatures on the battlefield, piles counted. */
async function goblins(page: Page): Promise<number> {
  const piles = await page
    .locator('.bf-cards button[data-controller="viewer"][data-zone^="viewer:creature"]')
    .filter({ hasText: "Goblin" })
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset["pile"] ?? 1)));
  return piles.reduce((a, b) => a + b, 0);
}

async function life(page: Page, side: "opponent" | "viewer"): Promise<number> {
  return Number((await page.locator(`.gs-seat-${side} .gs-life-n`).first().textContent()) ?? NaN);
}

test("seven Goblins die: no order question for copies, one target, one yes to all", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no triggers deck package (CI builds it)");
  test.setTimeout(900_000);
  mkdirSync(SEEN, { recursive: true });
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);

    let cast = false;
    let copies = 0;
    let yesToAll = 0;
    let lifeBefore = NaN;
    const deadline = Date.now() + 780_000;
    // After "Yes to all", both players go on passing priority (each may
    // respond between the triggers) until every copy has hit, or the
    // opponent is dead; the page must not ask yes again.
    const settled = async () =>
      yesToAll > 0 &&
      ((await host.locator(".gs-over").count()) > 0 ||
        (await life(host, "opponent")) <= lifeBefore - Math.min(copies, lifeBefore));
    while (Date.now() < deadline && !(await settled())) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);

        // W-05: the order tray -- click its cards in order, then Done.
        const tray = page.getByRole("dialog", {
          name: "Choose the order your triggers resolve in",
        });
        if ((await tray.count()) > 0) {
          const tiles = tray.locator("button.gs-win-tile");
          const n = await tiles.count();
          await page.screenshot({ path: `${SEEN}/order-tray.png` });
          // Copies of Boggart Shenanigans are one card, "×N".
          const names = await tiles.evaluateAll((els) =>
            els.map((el) => el.getAttribute("aria-label")),
          );
          expect(
            names.filter((name) => name?.startsWith("Boggart Shenanigans")).length,
          ).toBeLessThanOrEqual(1);
          for (let i = 0; i < n - 1; i++) await clickNow(tiles.nth(i));
          await clickNow(tray.getByRole("button", { name: "Done" }));
          continue;
        }

        // W-06: the first copy's target, "Same target for all" ticked.
        const target = page.getByRole("dialog", { name: /: choose a target$/ });
        if ((await target.count()) > 0) {
          await page.screenshot({ path: `${SEEN}/copy-target.png` });
          const same = target.getByRole("checkbox", { name: /^Same target for all \d+$/ });
          await expect(same).toBeChecked();
          const words = await target.locator("label.gs-win-check").textContent();
          copies = Number(words?.match(/\d+/)?.[0] ?? 0);
          lifeBefore = await life(page, "opponent");
          await clickNow(target.locator("button.gs-win-chip").filter({ hasNotText: "(you)" }));
          continue;
        }

        // W-04: the yes -- "Yes to all N" when it is one of N copies.
        const all = page.getByRole("button", { name: /^Yes to all \d+$/ });
        if ((await all.count()) > 0) {
          if (yesToAll > 0) throw new Error("asked yes again after Yes to all");
          await page.screenshot({ path: `${SEEN}/yes-to-all.png` });
          yesToAll = Number((await all.textContent())?.match(/\d+/)?.[0] ?? 0);
          await clickNow(all);
          continue;
        }
        const yes = page.locator(".gs-bubble button.gs-win-btn-main");
        if ((await yes.count()) > 0) {
          // After a batch of copies, a plain "Yes" means the bubble missed them.
          if (copies > 1 || yesToAll > 0) {
            await page.screenshot({ path: `${SEEN}/plain-yes.png` });
            throw new Error(`a yes for one of ${copies} copies offered no "Yes to all"`);
          }
          await clickNow(yes);
          continue;
        }

        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";
        if (kind) {
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }

        // Priority: the host plays a Mountain, Boggart Shenanigans, Goblins,
        // then Pyroclasm; the guest only passes.
        const act = panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)");
        if ((await act.count()) > 0) {
          const hand = page.locator(
            '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
          );
          const playing = async (name: RegExp | string) => {
            const card = hand.filter({ hasText: name });
            if ((await card.count()) === 0) return false;
            await clickNow(card);
            const popup = page.locator(".gs-popup .gs-option");
            if ((await popup.count()) > 0) await clickNow(popup);
            return true;
          };
          if (page === guest) {
            if (!(await playing("Mountain"))) await clickNow(act);
            continue;
          }
          const boggart = await page
            .locator('.bf-cards button[data-controller="viewer"]:not([data-zone="viewer:hand"])')
            .filter({ hasText: "Boggart Shenanigans" })
            .count();
          if (await playing("Mountain")) continue;
          if (!boggart && (await playing("Boggart Shenanigans"))) continue;
          if (boggart && (await goblins(page)) >= 3 && !cast && (await playing(WIPES))) {
            cast = true;
            continue;
          }
          if (!cast && (await playing(MAKERS))) continue;
          await clickNow(act);
          continue;
        }
        // Anything else: its first choice, a board choice, or pass.
        const listed = panel.locator(".gs-question li button");
        const board = panel.locator('.bf-cards button[data-choosable="true"]');
        if ((await listed.count()) > 0) await clickNow(listed);
        else if ((await board.count()) > 0) await clickNow(board);
        else await clickNow(panel.locator("button.gs-pass, button.gs-act"));
      }
      await host.waitForTimeout(100);
    }
    expect(cast, "the host never cast Pyroclasm over its Goblins").toBe(true);
    expect(copies, "the first copy's target was asked with Same target for all").toBeGreaterThan(1);
    expect(yesToAll, "the first yes offered Yes to all").toBe(copies);
    // The page answered the rest: every copy hit the opponent (or killed them).
    expect(await settled(), "every copy dealt 1 after one Yes to all").toBe(true);
    await host.screenshot({ path: `${SEEN}/after-yes-to-all.png` });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
