// No report window for a mana colour, no priority dot -- spec 0092
// (owner 2026-11-16, items 1 and 5), F-0092-A and F-0092-B.
//
// A real game, both players with the mana colours test deck: every land is
// a two-colour land (gain lands and guildgates, all with {B}), so every
// spell is paid by a real click on one, and Forge announces the colour to
// the other player
// ("Bob picked {B}."). Since spec 0075 each of those opened a report
// window for the other seat; now none does, for anyone, and no grey line
// says it either. Both plates, all game long: no priority dot.
//
// Uses protocol/fixtures/mana-colours-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/mana-colours-deck.zip" protocol/fixtures/mana-colours-deck

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  matchPanel,
  passButton,
  passCombat,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "mana-colours-deck.zip");
const SPELLS =
  /^(Typhoid Rats|Vampire Lacerator|Child of Night|Walking Corpse|Highborn Ghoul|Carrion Feeder|Diregraf Ghoul)/;
const LANDS =
  /^(Dismal Backwater|Jungle Hollow|Bloodfell Caves|Scoured Barrens|Dimir Guildgate|Golgari Guildgate|Rakdos Guildgate|Orzhov Guildgate)/;

/** Every report window and notice the page ever shows, and every priority dot, from now on. */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __seen0092?: { windows: string[]; dots: number } };
    const seen = { windows: [] as string[], dots: 0 };
    w.__seen0092 = seen;
    const look = () => {
      for (const el of document.querySelectorAll(
        ".gs-reveal, .gs-notice, .gs-notices li, [role='status']",
      )) {
        const text = `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
        if (text && !seen.windows.includes(text)) seen.windows.push(text.slice(0, 200));
      }
      seen.dots += document.querySelectorAll(".gs-priority-dot").length;
    };
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    look();
  });
}
const seenOn = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __seen0092: { windows: string[]; dots: number } }).__seen0092 ?? {
        windows: [],
        dots: -1,
      },
  );

/** The spells this page's player has on the table. */
const spellsOut = (page: Page) =>
  page
    .locator('.bf-cards button[data-zone^="viewer:"]:not([data-zone="viewer:hand"])')
    .filter({ hasText: SPELLS })
    .count();

test("a colour tapped for is no window for anyone; no priority dot on either plate", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no mana colours deck package (CI builds it)");
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
    await record(host);
    await record(guest);
    // Each seat's two-colour land taps that paid for a spell, by a real click.
    const taps = new Map<Page, number>([
      [host, 0],
      [guest, 0],
    ]);
    const cast = async () => ({ host: await spellsOut(host), guest: await spellsOut(guest) });
    const game = watchGame([host, guest], async () => ({
      ...(await cast()),
      taps: [taps.get(host), taps.get(guest)],
    }));
    const deadline = Date.now() + 780_000;
    for (;;) {
      const now = await cast();
      if ((now.host >= 2 && now.guest >= 2) || Date.now() > deadline) break;
      await game.check();
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          // Paying: a two-colour land to tap (the real click), or the colour asked.
          const mana = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await mana.count()) > 0) {
            const land = LANDS.test(await mana.first().innerText());
            await clickUnlessCombat(mana);
            if (land) taps.set(page, taps.get(page)! + 1);
          } else if ((await listed.count()) > 0) await clickNow(listed);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const land = hand.filter({ hasText: LANDS });
        if ((await land.count()) > 0) {
          await clickNow(land);
          continue;
        }
        const spells = hand.filter({ hasText: SPELLS });
        if ((await spells.count()) > 0) {
          await clickNow(spells);
          continue;
        }
        await clickNow(
          panel.locator(
            "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
          ),
        );
      }
    }
    const done = await cast();
    expect(done.host, "the host cast two spells").toBeGreaterThanOrEqual(2);
    expect(done.guest, "the guest cast two spells").toBeGreaterThanOrEqual(2);
    // Each player really tapped gain lands to pay: the other heard a colour each time.
    expect(taps.get(host)!, "the host tapped two-colour lands").toBeGreaterThanOrEqual(2);
    expect(taps.get(guest)!, "the guest tapped two-colour lands").toBeGreaterThanOrEqual(2);

    for (const [name, page] of [
      ["host", host],
      ["guest", guest],
    ] as const) {
      const seen = await seenOn(page);
      console.log(`${name} saw: ${JSON.stringify(seen.windows).slice(0, 800)}`);
      // F-0092-B: no window, notice or line for a mana colour.
      expect(
        seen.windows.filter((t) => /\bpicked\b|\{[WUBRGC]\}\./.test(t)),
        `${name} was shown a mana colour`,
      ).toEqual([]);
      expect(
        await page
          .locator(".gs-reveal")
          .filter({ hasText: /picked/ })
          .count(),
      ).toBe(0);
      // F-0092-A: no priority dot on either plate, at any moment of the game.
      expect(seen.dots, `${name} saw a priority dot`).toBe(0);
      await expect(page.locator(".gs-seat")).toHaveCount(2);
      await expect(page.locator(".gs-priority-dot")).toHaveCount(0);
      // The screen reader is told who has it instead (one plate or none, never both).
      const summaries = await page.locator(".gs-seat > .pa-visually-hidden").allTextContents();
      expect(summaries.filter((s) => s.includes("has priority")).length).toBeLessThanOrEqual(1);
    }
    await host.screenshot({ path: "test-results/0092/host-end.png" });
    await guest.screenshot({ path: "test-results/0092/guest-end.png" });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
