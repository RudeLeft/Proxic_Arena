// Phase 9 W-16 -- what a card can do, cost first, and why not.
//
// A real game. (1) On your own move, the question the game sends is given
// one ability it does not offer now, for a card you control, as the
// worker sends Elspeth's -7 ("Needs 7 loyalty"; seen in a real game, and
// in scripts/check-*): the card's panel shows it greyed, cost first, with
// why. (2) A card in hand that can't be played now, clicked, says why not
// in the same panel, and stays until closed: on your own turn a second
// land ("You've already played a land this turn." -- every game reaches
// it), or any such card on the other player's turn.

import { expect, test, type WebSocketRoute } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  clearEverything,
  clickNow,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "loyalty-deck.zip");
const ROW = {
  label: "Plains · -7: Create five 3/3 white Angel tokens.",
  why: "Needs 7 loyalty (it has 4).",
};

test("a card's abilities: the unusable ones greyed, cost first, with why; and why not", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no Loyalty deck package built");
  test.setTimeout(600_000);
  const viewport = { width: 1920, height: 1080 };
  const hc = await browser.newContext({ viewport });
  const gc = await browser.newContext({ viewport });
  const host = await hc.newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await gc.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  // The host's game socket: every battlefield card of the host's is given
  // one ability not offered now, on each question with options.
  // Set from the socket handler, which TypeScript cannot see.
  let mine = [] as string[];
  await host.routeWebSocket("**/ws/matches/**", (ws: WebSocketRoute) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message !== "string") return ws.send(message);
      const frame = JSON.parse(message) as Record<string, unknown>;
      if (frame["type"] === "MATCH_SNAPSHOT") {
        const state = frame["state"] as {
          seat: number;
          battlefield: { id: string; seat: number }[];
        };
        mine = state.battlefield.filter((c) => c.seat === state.seat).map((c) => c.id);
      }
      if (mine.length > 0 && "options" in frame && "decisionId" in frame) {
        frame["notNow"] = Object.fromEntries(mine.map((id) => [id, [ROW]]));
        return ws.send(JSON.stringify(frame));
      }
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });

  let greyed = false;
  let whyNot = false;
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    const end = Date.now() + 420_000;
    const watch = watchGame([host, guest], () => ({ greyed, whyNot }));
    while (Date.now() < end && !(greyed && whyNot)) {
      await watch.check();
      for (const page of [host, guest]) {
        const panel = matchPanel(page);
        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        const myTurn = (await page.locator(".gs-whose-mine").count()) > 0;
        const onTable = page.locator(
          '.bf-cards button[data-controller="viewer"]:not([data-zone="viewer:hand"])',
        );
        if (page === host && priority && myTurn && (await onTable.count()) > 0 && !greyed) {
          await onTable.first().evaluate((e) => (e as HTMLElement).click());
          await page.waitForTimeout(500);
          const no = page.locator(".gs-popup .gs-ab-no");
          await expect(no).toBeVisible({ timeout: 5_000 });
          await expect(no.locator(".gs-ab-down")).toHaveText("−7");
          await expect(no).toContainText("Needs 7 loyalty (it has 4).");
          // Greyed: not a choice anybody can click.
          await expect(no.locator("button")).toHaveCount(0);
          // The whole menu on screen, even for a card in the far-left column.
          const menu = await page.locator(".gs-popup").boundingBox();
          expect(menu!.x, "the menu's left edge is on screen").toBeGreaterThanOrEqual(0);
          expect(menu!.x + menu!.width, "its right edge too").toBeLessThanOrEqual(
            page.viewportSize()!.width,
          );
          await page.screenshot({ path: "test-results/seen/ability-menu-greyed.png" });
          await page.keyboard.press("Escape");
          greyed = true;
        }
        if (priority && !whyNot) {
          const notNow = page.locator('[data-zone="viewer:hand"]:not([data-choosable="true"])');
          const land = (myTurn ? notNow.filter({ hasText: /^Plains/ }) : notNow).first();
          if ((await land.count()) > 0) {
            await land.evaluate((e) => (e as HTMLElement).click());
            const why = page.locator(".gs-popup .gs-popup-why");
            await expect(why).toContainText("Not now.", { timeout: 5_000 });
            await page.screenshot({ path: "test-results/seen/ability-menu-why.png" });
            // It stays until closed.
            await page.waitForTimeout(4_000);
            await expect(why).toBeVisible();
            await page
              .locator(".gs-popup")
              .getByRole("button", { name: "Close", exact: true })
              .click();
            await expect(why).toHaveCount(0);
            whyNot = true;
          }
        }
        if (priority) {
          const hand = page.locator(
            '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
          );
          const plains = hand.filter({ hasText: /^Plains/ });
          if (myTurn && (await plains.count()) > 0) await clickNow(plains);
          else
            await clickNow(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
        } else {
          const combat = panel.locator("button.gs-act-combat");
          if ((await combat.count()) > 0) await clickNow(combat);
          else await clickNow(passButton(page));
        }
      }
      await host.waitForTimeout(120);
    }
    expect(greyed, "an ability not offered now was shown greyed with why").toBe(true);
    expect(whyNot, "a card in hand said why not").toBe(true);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await hc.close();
    await gc.close();
  }
});
