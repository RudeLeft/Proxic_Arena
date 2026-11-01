// The card trays, in a real game, through the page -- PHASE_09 group 3
// (W-07..W-10, owner 2026-11-01, canvas
// https://claude.ai/artifact/YYJjyLHDPYwmv5cRyxCDSR).
//
//   order   Ponder, Impulse's rest, Brainstorm: the cards as pictures,
//           clicked in the order they go (a gold number each), Done.
//           Ponder's "Shuffle instead" and Done answer its shuffle
//           question too; Impulse's rest has "Any order". Brainstorm's
//           two are numbered in the hand as they are clicked, and their
//           order is never asked again.
//   rows    Preordain, Opt: two rows (match-surveil.spec.ts tests them
//           fully); here only that they are the tray.
//   hidden  Demonic Tutor, Impulse, Evolving Wilds, Thoughtseize: one
//           picture per card, named without the game's numbers, the
//           tray naming the card asking -- never another card its words
//           contain (2026-11-01: "Sensei's Divining Top" on a search).
//   split   Fact or Fiction's split: a card clicked moves to pile 2, Done.
//   piles   The caster's choice: the two piles as pictures, Take this pile.
//
// Both players use the card trays test deck (protocol/fixtures/
// card-trays-deck). CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/card-trays-deck.zip" protocol/fixtures/card-trays-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, clickNow, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "card-trays-deck.zip");
const SPELLS =
  /^(Ponder|Brainstorm|Impulse|Preordain|Demonic Tutor|Fact or Fiction|Thoughtseize|Opt)/;
const TRAY = ".gs-win.gs-tray";
const click = clickNow;

/** The name of the spell or ability on top of the stack, as the page labels it. */
async function stackTop(page: Page): Promise<string> {
  return page
    .locator('[data-zone="stack"]')
    .evaluateAll((els) => (els[0]?.getAttribute("aria-label") ?? "").split(",")[0]!.trim());
}

test("the card trays: order, rows, a hidden zone, the split and the piles, answered by clicking", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no card trays deck package (CI builds it)");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const seen = new Set<string>();
  const shot = async (page: Page, key: string) => {
    if (seen.has(`shot-${key}`)) return;
    seen.add(`shot-${key}`);
    // The cast card's flight to the stack (spec 0044) is over in a moment:
    // the tray is shown settled, and a cast card that stays is a fault.
    await expect(page.locator(".gs-cast"), "no cast card left beside the stack").toHaveCount(0, {
      timeout: 3_000,
    });
    await page.screenshot({ path: `test-results/seen/trays-${key}.png` });
  };
  /** Questions the trays should have answered: never shown. */
  const askedAgain: string[] = [];
  const lastCast = new Map<Page, string>();

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    const required = ["order", "rows", "hidden", "split", "piles"];
    const deadline = Date.now() + 780_000;

    while (!required.every((k) => seen.has(k)) && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        // The old scry box is gone for good.
        await expect(panel.locator(".gs-question-looking")).toHaveCount(0);
        if ((await page.locator(".gs-hand-num").count()) > 0) {
          seen.add("brainstorm");
          await shot(page, "brainstorm-hand");
        }

        const tray = panel.locator(TRAY).first();
        if ((await tray.count()) > 0) {
          const kind = (await tray.getAttribute("data-kind")) ?? "";
          const title = ((await tray.locator(".gs-win-title").allTextContents())[0] ?? "").trim();
          const tiles = tray.locator("button.gs-win-tile");

          if ((await tray.locator(".gs-win-rows").count()) > 0) {
            seen.add("rows");
            await shot(page, "rows");
            await click(tray.getByRole("button", { name: "Done" }));
            continue;
          }
          if (kind === "chooseCardsPile") {
            await expect(tray.locator(".gs-win-pile"), "two piles").toHaveCount(2);
            seen.add("piles");
            await shot(page, "piles");
            await click(tray.getByRole("button", { name: "Take this pile" }).last());
            continue;
          }
          if (title === "Split these into two piles") {
            const one = tray.locator('.gs-win-pile[aria-label="Pile 1"] button.gs-win-tile');
            const n = await one.count();
            await click(one.first());
            await expect(
              tray.locator('.gs-win-pile[aria-label="Pile 2"] button.gs-win-tile'),
              "the card moved to pile 2",
            ).toHaveCount(1);
            await expect(one).toHaveCount(n - 1);
            seen.add("split");
            await shot(page, "split");
            await click(tray.getByRole("button", { name: "Done" }));
            continue;
          }
          if (kind === "orderMoveToZoneList" || kind.startsWith("arrangeFor")) {
            const shuffle = tray.getByRole("button", { name: "Shuffle instead" });
            const anyOrder = tray.getByRole("button", { name: "Any order" });
            // Brainstorm's is the order with neither (Ponder has Shuffle
            // instead, Impulse's rest Any order): its cards were numbered
            // in the hand, so it is never asked. A Ponder cast before it
            // resolves after it, with lastCast still Brainstorm.
            if (
              lastCast.get(page) === "Brainstorm" &&
              seen.has("brainstorm") &&
              (await shuffle.count()) === 0 &&
              (await anyOrder.count()) === 0
            ) {
              askedAgain.push("Brainstorm's order, after its cards were numbered in the hand");
            }
            if ((await shuffle.count()) > 0 && seen.has("order") && !seen.has("shuffle")) {
              seen.add("shuffle");
              await click(shuffle);
              continue;
            }
            if ((await anyOrder.count()) > 0 && !seen.has("bottom")) {
              seen.add("bottom");
              await shot(page, "bottom");
              await click(anyOrder);
              continue;
            }
            // Clicked in reverse: each gets the next number; the last numbers itself.
            const count = await tiles.count();
            for (let i = count - 1; i >= 1; i--) await click(tiles.nth(i));
            await expect(tray.locator(".gs-win-tile-num"), "every card numbered").toHaveCount(
              count,
            );
            seen.add("order");
            await shot(page, "order");
            await click(tray.getByRole("button", { name: "Done" }));
            continue;
          }
          // A hidden zone: named without the game's numbers, the card asking named.
          const labels = await tiles.evaluateAll((els) =>
            els.map((e) => e.getAttribute("aria-label") ?? ""),
          );
          expect(
            labels.filter((l) => /\(\d+\)/.test(l)),
            "no internal numbers",
          ).toEqual([]);
          const asking = await stackTop(page);
          if (asking) {
            await expect(tray.locator(".gs-win-from"), "the card asking is named").toContainText(
              asking,
            );
          }
          seen.add("hidden");
          seen.add(`hidden-${kind}`);
          await shot(page, `hidden-${asking.replace(/[^a-z]+/gi, "_") || kind}`);
          const pick = tray.locator("button.gs-win-tile:not(:disabled)");
          if ((await pick.count()) > 0) await click(pick.first());
          else await click(tray.locator("button.gs-win-btn-quiet"));
          continue;
        }

        // Ponder's shuffle question: Done and Shuffle instead answered it.
        const bubble = panel.locator(".gs-win");
        if ((await bubble.count()) > 0) {
          const words = ((await bubble.first().textContent()) ?? "").toLowerCase();
          if (words.includes("shuffle the library")) askedAgain.push("Ponder's shuffle");
        }

        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await click(combat);
          continue;
        }
        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        if (!priority) {
          const listed = panel.locator(
            ".gs-question li button, .gs-win li button, .gs-win button.gs-win-btn-main",
          );
          // Thoughtseize: the opponent, not yourself, when both are offered.
          const them = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          const board = page.locator(
            '[data-zone="viewer:hand"][data-choosable="true"], .bf-cards button[data-choosable="true"], .gs-life.gs-choosable',
          );
          if ((await listed.count()) > 0) await click(listed);
          else if ((await them.count()) > 0) await click(them);
          else if ((await board.count()) > 0) await click(board);
          else await click(panel.locator("button.gs-pass, button.gs-act"));
          continue;
        }

        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const land = hand.filter({ hasText: /^(Island|Swamp|Evolving Wilds)/ });
        if ((await land.count()) > 0) {
          await click(land);
          continue;
        }
        const wilds = page
          .locator('.bf-cards button[data-choosable="true"]')
          .filter({ hasText: /^Evolving Wilds/ });
        if ((await wilds.count()) > 0 && !seen.has("hidden-chooseSingleEntityForEffect")) {
          await click(wilds);
          const popup = page.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await click(popup);
          continue;
        }
        const spell = hand.filter({ hasText: SPELLS });
        if ((await spell.count()) > 0) {
          const name = ((await spell.first().textContent()) ?? "").match(SPELLS)?.[1] ?? "";
          lastCast.set(page, name);
          await click(spell);
          const popup = page.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await click(popup);
          continue;
        }
        await click(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
      }
      await host.waitForTimeout(100);
    }
    expect(
      [...seen].filter((k) => required.includes(k)).sort(),
      "every tray seen and answered",
    ).toEqual([...required].sort());
    expect(askedAgain, "what a tray answered is never asked again").toEqual([]);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
