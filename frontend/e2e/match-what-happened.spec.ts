// Spec 0045 -- seeing what happened, in a real game.
//
// F-0045-A: Soul Warden out, then Ajani's Pridemate: pointing at
//   Pridemate's +1/+1 counter names the lifegain that caused it.
// F-0045-C: Goblin Ringleader's revealed cards show face up to BOTH
//   players, each marked where it went (hand or bottom).
// F-0045-D: right-clicking Pridemate's trigger on the stack opens it close
//   up: what it does, why it triggered, whose it is.
// (F-0045-B, the empty library, is unit-tested and played in the Lab:
// a 60-card deck does not run out inside a test.)

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  boardCards,
  clearEverything,
  clickNow,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "what-happened-deck.zip");

const kind = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector(".gs-win, .gs-question, .gs-your-move, .gs-combat")
        ?.getAttribute("data-kind") ?? null,
  );

const playable = (page: Page, name: string) =>
  page.locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])', {
    hasText: name,
  });

test("counters, triggers and reveals say what happened", async ({ browser }) => {
  test.skip(!existsSync(pkg), "no what-happened deck package built");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, pkg);

  let counter = false;
  let closeUp = false;
  let revealed = false;
  let sawTray = false;
  const landTurn = new Map<Page, string>();
  try {
    await startAMatch(host, guest, deck);
    const end = Date.now() + 720_000;
    while (Date.now() < end && !(counter && revealed)) {
      for (const page of [host, guest]) {
        const other = page === host ? guest : host;
        // F-0045-D: Pridemate's trigger, held while the other player may
        // respond, close up -- on the side of whoever it belongs to.
        // The trigger, not the creature spell (its card reads "Trigger").
        const trigger = page
          .locator('[data-zone="stack"]', { hasText: "Ajani's Pridemate" })
          .filter({ hasText: "Trigger" });
        if (!closeUp && (await trigger.count()) > 0) {
          await trigger
            .first()
            .click({ button: "right" })
            .catch(() => undefined);
          const dialog = page.getByRole("dialog", { name: /Ajani's Pridemate, on the stack/ });
          if (await dialog.isVisible().catch(() => false)) {
            // Read at once: the trigger resolves, and its close-up goes, as
            // soon as nobody holds it.
            const words = ((await dialog.textContent().catch(() => null)) ?? "").replace(
              /\s+/g,
              " ",
            );
            if (words) {
              await page.screenshot({ path: "test-results/seen/0045-stack-close-up.png" });
              expect(words).toContain("Whenever you gain life");
              expect(words).toMatch(/Why ?\S+ gained 1 life \(Soul Warden\)/);
              // Whose: "Yours" on its controller's side, their name on the other.
              expect(words).toMatch(/Whose ?(Yours|Pat|RudeLeft)/);
              expect(words).toMatch(/Does ?Whenever/);
              closeUp = true;
            }
            await page.keyboard.press("Escape");
          }
        }
        // F-0045-A: the counter, and where it came from.
        const mate = boardCards(page, "viewer").filter({ hasText: "Ajani's Pridemate" });
        if (!counter && (await mate.locator(".bf-counters").count()) > 0) {
          const chip = mate.locator(".bf-counters").first();
          await expect(chip).toHaveText("+1/+1");
          await expect(chip).toHaveAttribute(
            "title",
            /Ajani's Pridemate's trigger: .* gained 1 life \(Soul Warden\)/,
          );
          await chip.hover();
          await page.screenshot({ path: "test-results/seen/0045-counter.png" });
          counter = true;
        }
        // F-0045-C: both players see Ringleader's cards, each marked where it
        // went once the effect is done (the bottom order is asked first, so
        // the game goes on in between).
        if (!revealed && (await page.locator(".gs-reveal").count()) > 0) {
          const marked = async (seat: Page) =>
            seat
              .locator(".gs-reveal [data-revealed-id]")
              .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-to")))
              .catch(() => [] as (string | null)[]);
          const both = [await marked(page), await marked(other)];
          if (!sawTray) {
            await expect(page.locator(".gs-reveal")).toContainText("Goblin Ringleader revealed:");
            await expect(other.locator(".gs-reveal")).toContainText("Goblin Ringleader revealed:");
            sawTray = true;
          }
          if (
            both.every((to) => to.length > 0 && to.every((t) => t === "hand" || t === "bottom"))
          ) {
            await page.screenshot({ path: "test-results/seen/0045-reveal.png" });
            await other.screenshot({ path: "test-results/seen/0045-reveal-opponent.png" });
            revealed = true;
            await page.locator(".gs-reveal-close").click();
            await expect(page.locator(".gs-reveal")).toHaveCount(0);
          }
        }

        const k = await kind(page);
        if (!k) continue;
        if (k === "chooseSpellAbilityToPlay") {
          // Never pass while the trigger waits to be looked at.
          if (!closeUp && (await trigger.count()) > 0) continue;
          const turn = (await page.locator(".gs-ladder, .gs-turn").first().textContent()) ?? "";
          const land = page.locator('[data-zone="viewer:hand"][data-choosable="true"]', {
            hasText: /^(Plains|Mountain)/,
          });
          if ((await land.count()) > 0 && landTurn.get(page) !== turn) {
            landTurn.set(page, turn);
            // Plains first, until there are two of them.
            const plains = await boardCards(page, "viewer").filter({ hasText: "Plains" }).count();
            const pick = land.filter({ hasText: plains < 2 ? "Plains" : "Mountain" });
            await clickNow((await pick.count()) > 0 ? pick.first() : land.first());
            await page.waitForTimeout(400);
            continue;
          }
          const warden = await boardCards(page, "viewer")
            .filter({ hasText: "Soul Warden" })
            .count();
          const mates = await boardCards(page, "viewer")
            .filter({ hasText: "Ajani's Pridemate" })
            .count();
          // Goblin Ringleader whenever it can be cast (it waits for four
          // lands); then Soul Warden, then Pridemate.
          const ringleader = !revealed && (await playable(page, "Goblin Ringleader").count()) > 0;
          const next = ringleader
            ? "Goblin Ringleader"
            : warden === 0
              ? "Soul Warden"
              : mates === 0
                ? "Ajani's Pridemate"
                : null;
          if (next && (await playable(page, next).count()) > 0) {
            await clickNow(playable(page, next).first());
            await page.waitForTimeout(600);
            continue;
          }
          await clickNow(passButton(page));
        } else if (k === "applyManaToCost") {
          const land = page.locator('.bf-cards button[data-choosable="true"]', {
            hasText: /Plains|Mountain/,
          });
          if ((await land.count()) > 0) await clickNow(land.first());
          else await clickNow(passButton(page));
        } else {
          // Whatever else is asked (discarding down to seven, ...): the
          // first choice offered, as a list, a tile or a card in hand.
          const list = matchPanel(page).locator(
            ".gs-question li button, .gs-win li button, button.gs-win-tile:not(:disabled)",
          );
          const card = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
          if ((await list.count()) > 0) await clickNow(list.first());
          else if ((await card.count()) > 0) await clickNow(card.first());
          else await clickNow(passButton(page));
        }
        await page.waitForTimeout(120);
      }
    }
    expect(counter, "Pridemate got its counter with Soul Warden out").toBe(true);
    expect(revealed, "Goblin Ringleader revealed").toBe(true);
    expect(closeUp, "Pridemate's trigger was looked at close up on the stack").toBe(true);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
  }
});
