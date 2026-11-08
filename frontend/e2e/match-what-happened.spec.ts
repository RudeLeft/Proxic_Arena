// Spec 0045 -- seeing what happened, in a real game.
//
// F-0045-A: Soul Warden out, then Ajani's Pridemate: pointing at
//   Pridemate's +1/+1 counter names the lifegain that caused it.
// F-0045-C: Goblin Ringleader's revealed cards show face up to the OTHER
//   player, each marked where it went (hand or bottom), with who did it
//   (PHASE_09 Amendment 12: "<name> revealed the top 4 cards of their
//   library"). The player who cast it chose the bottom order and is shown
//   no tray for it (Amendment 13, item 7).
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
  answerCardTray,
  clearEverything,
  clickNow,
  discardIfAsked,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
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
  let sawWords = false;
  let closeUp = false;
  // Right-clicks tried on the trigger now on the stack: a few, then the game goes on.
  let tries = 0;
  let revealed = false;
  let sawTray = false;
  const landTurn = new Map<Page, string>();
  try {
    await startAMatch(host, guest, deck);
    const end = Date.now() + 720_000;
    const watch = watchGame([host, guest], () => ({ counter, revealed, closeUp }));
    while (Date.now() < end && !(counter && revealed && closeUp)) {
      await watch.check();
      for (const page of [host, guest]) {
        const other = page === host ? guest : host;
        // F-0045-D: Pridemate's trigger, held while the other player may
        // respond, close up -- on the side of whoever it belongs to.
        // The trigger, not the creature spell (its card reads "Trigger").
        const trigger = page
          .locator('[data-zone="stack"]', { hasText: "Ajani's Pridemate" })
          .filter({ hasText: "Trigger" });
        if ((await trigger.count()) === 0) tries = 0;
        if (!closeUp && (await trigger.count()) > 0 && tries < 6) {
          tries += 1;
          await trigger
            .first()
            .click({ button: "right", timeout: 3_000 })
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
        // Phase 9 W-20: on a readable stack (nothing to choose on the table),
        // the trigger shows its own words on its card.
        if (
          !sawWords &&
          (await trigger.count()) > 0 &&
          (await page.locator(".bf-asking").count()) === 0
        ) {
          const said = await trigger
            .first()
            .locator(".bf-stack-words")
            .allTextContents()
            .catch(() => [] as string[]);
          if (said.length > 0) {
            expect(said[0]).toMatch(/^Trigger\s*Whenever you gain life/);
            await page.screenshot({ path: "test-results/seen/w20-trigger-words.png" });
            sawWords = true;
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
        // F-0045-C: the other player sees Ringleader's cards, each marked
        // where it went once the effect is done (the bottom order is asked
        // first, so the game goes on in between).
        if (!revealed && (await page.locator(".gs-reveal").count()) > 0) {
          const to = await page
            .locator(".gs-reveal [data-revealed-id]")
            .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-to")))
            .catch(() => [] as (string | null)[]);
          if (!sawTray) {
            await expect(page.locator(".gs-reveal")).toContainText("Goblin Ringleader");
            sawTray = true;
          }
          if (to.length > 0 && to.every((t) => t === "hand" || t === "bottom")) {
            // Amendment 12 -- who did it, in this reader's words; Amendment
            // 13 -- the caster, who chose, has no tray for it.
            await expect(page.locator(".gs-reveal")).toContainText(
              /\S+ revealed the top 4 cards of their library/,
            );
            await expect(
              other.locator(".gs-reveal").filter({ hasText: "Goblin Ringleader" }),
              "the player who cast it is not shown what they chose",
            ).toHaveCount(0);
            await page.screenshot({ path: "test-results/seen/0045-reveal.png" });
            revealed = true;
            // Close at once, the opponent's picture after: the game does not
            // wait for this page (the caster's turn is passed for them when
            // nothing is left to play), and at the next turn the worker stops
            // sending the reveal -- the tray goes by itself. Before, the two
            // screenshots took long enough on CI for that to happen mid-click,
            // and a click with no timeout then waited the whole 15 minutes
            // for a Close button that was never coming back.
            const close = page.locator(".gs-reveal-close");
            const closed = await close
              .click({ timeout: 10_000 })
              .then(() => true)
              .catch(() => false);
            if (!closed) {
              // Only acceptable if the tray really went: a new turn began.
              await expect(
                page.locator(".gs-reveal"),
                "the reveal tray went with the turn",
              ).toHaveCount(0);
              test.info().annotations.push({
                type: "note",
                description: "the reveal tray went with the next turn before Close was clicked",
              });
            }
            await expect(page.locator(".gs-reveal")).toHaveCount(0);
            await other.screenshot({ path: "test-results/seen/0045-reveal-opponent.png" });
          }
        }

        // Spec 0061: discarding down to seven is pick, then Discard.
        if (await discardIfAsked(page)) continue;
        const k = await kind(page);
        // A window without a kind (the order tray: Ringleader's "the rest on
        // the bottom in any order") is a question too.
        const open = (await matchPanel(page).locator(".gs-win").count()) > 0;
        if (!k && !open) continue;
        if (k === "chooseSpellAbilityToPlay") {
          // Not passing while the trigger waits to be looked at -- for a
          // few tries; a missed one is looked at on the next Pridemate.
          if (!closeUp && tries < 6 && (await trigger.count()) > 0) continue;
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
              : mates === 0 || (!closeUp && mates < 4)
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
          // PHASE_09 group 3: Goblin Ringleader's other cards go to the
          // bottom through the order tray.
          if (await answerCardTray(page)) continue;
          const list = matchPanel(page).locator(
            ".gs-question li button, .gs-win li button, button.gs-win-tile:not(:disabled)",
          );
          const card = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
          const done = matchPanel(page).locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await list.count()) > 0) await clickNow(list.first());
          else if ((await card.count()) > 0) await clickNow(card.first());
          else if ((await done.count()) > 0) await clickNow(done.first());
          else await clickNow(passButton(page));
        }
        await page.waitForTimeout(120);
      }
    }
    expect(counter, "Pridemate got its counter with Soul Warden out").toBe(true);
    expect(revealed, "Goblin Ringleader revealed").toBe(true);
    expect(closeUp, "Pridemate's trigger was looked at close up on the stack").toBe(true);
    expect(sawWords, "Pridemate's trigger showed its own words on the stack").toBe(true);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    // Closed, or a page left signed in follows the player into the next
    // test's game and answers for them there (CI 2026-11-03: a paused
    // response window passed by the previous test's page).
    await host.context().close();
    await guest.context().close();
  }
});
