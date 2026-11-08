// Spec 0044 -- the card being cast: out of the way of the table while a
// question needs it, face down to the opponent until it is committed, and
// shown for an optional cost asked while it is still in the hand.
//
// F-0044-A: a target question docks the card beside the stack, and a REAL
//   mouse click on the creature in the middle of the table reaches it.
// F-0044-B: the opponent sees the card's back ("… is casting a spell") and
//   never its name while it is paid for; once it is cast the back turns
//   over to the face.
// F-0044-C: Archon's Glory's Bargain question shows the card being cast.

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  boardCards,
  answerCardTray,
  clearEverything,
  clickNow,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
  discardIfAsked,
} from "./match-helpers";

const castingPackage = join(process.cwd(), "..", "Test Deck", "casting-deck.zip");

const kind = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector(".gs-win, .gs-question, .gs-your-move, .gs-combat")
        ?.getAttribute("data-kind") ?? null,
  );

/** The card being cast as drawn now (not one flying away). */
const castCard = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
    return el
      ? {
          docked: el.dataset.docked === "true",
          label: el.getAttribute("aria-label") ?? "",
          back: !!el.querySelector(".gs-cast-back"),
          text: el.textContent ?? "",
        }
      : null;
  });

const playable = (page: Page, name: string) =>
  page.locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])', {
    hasText: name,
  });

test("the card being cast docks, hides from the opponent, then turns over", async ({ browser }) => {
  test.skip(!existsSync(castingPackage), "no casting deck package built");
  test.setTimeout(600_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, castingPackage);

  let docked = false;
  let optional = false;
  const landTurn = new Map<Page, string>();
  try {
    await startAMatch(host, guest, deck);
    const end = Date.now() + 420_000;
    const watch = watchGame([host, guest], () => ({ docked, optional }));
    while (Date.now() < end && !(docked && optional)) {
      await watch.check();
      for (const page of [host, guest]) {
        const other = page === host ? guest : host;
        // Spec 0061: discarding to hand size is pick, then Discard.
        if (await discardIfAsked(page)) continue;
        const k = await kind(page);
        if (!k) continue;
        if (k === "chooseSpellAbilityToPlay") {
          const turn = (await page.locator(".gs-ladder, .gs-turn").first().textContent()) ?? "";
          const land = playable(page, "Plains");
          if ((await land.count()) > 0 && landTurn.get(page) !== turn) {
            landTurn.set(page, turn);
            await clickNow(land.first());
            await page.waitForTimeout(500);
            continue;
          }
          const slivers =
            (await boardCards(page, "viewer").filter({ hasText: "Sliver" }).count()) +
            (await boardCards(page, "opponent").filter({ hasText: "Sliver" }).count());
          if (
            !docked &&
            slivers > 0 &&
            (await playable(page, "Swords to Plowshares").count()) > 0
          ) {
            await clickNow(playable(page, "Swords to Plowshares").first());
            await expect.poll(() => kind(page), { timeout: 15_000 }).toBe("chooseTargetsFor");
            // F-0044-A: beside the stack.
            await expect.poll(async () => (await castCard(page))?.docked).toBe(true);
            // F-0044-B: the opponent sees its back and who, never its name.
            const seen = await castCard(other);
            expect(seen?.back).toBe(true);
            expect(seen?.label).toMatch(/is casting a spell/);
            expect(seen?.text).not.toContain("Swords");
            // F-0044-A: a real mouse click on a creature reaches it.
            const target = page
              .locator('.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])', {
                hasText: "Sliver",
              })
              .first();
            const box = (await target.boundingBox())!;
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            const id = await target.getAttribute("data-object-id");
            const under = await page.evaluate(
              ([px, py]) =>
                document
                  .elementFromPoint(px!, py!)
                  ?.closest("[data-object-id]")
                  ?.getAttribute("data-object-id") ?? null,
              [x, y],
            );
            expect(under).toBe(id);
            // Once cast, the opponent's back turns over to the face.
            const turned = other.waitForSelector(
              ".gs-cast-leaving .gs-cast-turn .gs-cast-plain, .gs-cast-leaving .gs-cast-turn .gs-cast-picture",
              {
                state: "attached",
                timeout: 60_000,
              },
            );
            await page.mouse.click(x, y);
            for (let i = 0; i < 6 && (await kind(page)) !== "chooseSpellAbilityToPlay"; i++) {
              if ((await kind(page)) === "applyManaToCost") {
                await clickNow(
                  page.locator('.bf-cards button[data-choosable="true"]', { hasText: "Plains" }),
                );
              }
              await page.waitForTimeout(300);
            }
            await turned;
            docked = true;
            continue;
          }
          if (!optional && (await playable(page, "Archon's Glory").count()) > 0) {
            await clickNow(playable(page, "Archon's Glory").first());
            await expect.poll(() => kind(page), { timeout: 15_000 }).toBe("chooseOptionalCosts");
            // F-0044-C: the card is in the middle for its optional cost.
            await expect
              .poll(async () => (await castCard(page))?.label)
              .toBe("Being cast: Archon's Glory");
            await page.keyboard.press("Escape");
            await page.waitForTimeout(800);
            optional = true;
            continue;
          }
          const sliver = playable(page, "Sliver");
          if ((await sliver.count()) > 0) {
            await clickNow(sliver.first());
            await page.waitForTimeout(500);
            continue;
          }
          await clickNow(passButton(page));
        } else if (k === "applyManaToCost") {
          const plains = page.locator('.bf-cards button[data-choosable="true"]', {
            hasText: "Plains",
          });
          if ((await plains.count()) > 0) await clickNow(plains.first());
          else await clickNow(passButton(page));
        } else {
          if (await answerCardTray(page)) continue;
          const list = matchPanel(page).locator(".gs-question li button, .gs-win li button");
          if ((await list.count()) > 0) await clickNow(list.first());
          else await clickNow(passButton(page));
        }
        await page.waitForTimeout(150);
      }
    }
    expect(docked, "Swords to Plowshares was cast at a creature").toBe(true);
    expect(optional, "Archon's Glory asked its Bargain").toBe(true);
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
