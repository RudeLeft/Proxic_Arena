// A card cast from your graveyard by clicking it, in a real game --
// spec 0087 Amendment 3 (owner 2026-11-15, option A: "no window, the
// glowing card is the cue"), AGENTS TEST-012.
//
// On your move, a card you may cast from a pile (Think Twice's flashback)
// stands in the fan beside your plate. It is the cue: no "Your move" window
// opens for it, it breathes like a playable hand card, and a real click on
// it casts it, exactly as a hand card. Until this amendment the window
// opened and a click on the fan card did nothing (the page never counted
// the fan's cards as cards it draws).
//
// The deck is protocol/fixtures/delver-deck (Islands, Think Twice and the
// cantrips that dig for it). CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/delver-deck.zip" protocol/fixtures/delver-deck
//
// PROXIC_E2E_CLIP=<file.webm> films the host's screen (1920x1080, normal
// speed) from just before the click until the card is in exile, with stills
// beside it (<file>-stills/).

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  answerCardTray,
  choices,
  clearEverything,
  discardIfAsked,
  isAsked,
  matchPanel,
  passButton,
  passCombat,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const delverPackage = join(process.cwd(), "..", "Test Deck", "delver-deck.zip");
const CLIP = process.env.PROXIC_E2E_CLIP ?? "";
const SCREEN = { width: 1920, height: 1080 };
const DIG = /^(Opt|Consider|Brainstorm|Impulse)\b/;

/** A visible "Your move" window (the bar's own heading is for a screen reader only). */
const yourMoveWindow = (page: Page) =>
  matchPanel(page)
    .locator(".gs-question-title:not(.pa-visually-hidden)")
    .filter({ hasText: /Your move/ });

test("a card you may cast from your graveyard: no window, and a click on it casts it", async ({
  browser,
}) => {
  test.skip(!existsSync(delverPackage), "no Delver deck package built");

  const host = await (await browser.newContext({ viewport: SCREEN })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport: SCREEN })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, delverPackage);
    await startAMatch(host, guest, deckName, { settle: false });

    const panel = matchPanel(host);
    // Think Twice in the fan beside the host's plate, from the graveyard.
    const fan = panel
      .locator('.bf-fan-card[data-fan-side="viewer"] button[data-zone="viewer:graveyard"]')
      .filter({ hasText: "Think Twice" });
    const castable = fan.and(panel.locator('[data-choosable="true"]:not([data-unpayable="true"])'));
    const onStack = panel.locator('[data-zone="stack"][aria-label^="Think Twice"]');
    const exiled = panel.locator('[data-zone-tile="viewer:exile"] .gs-zone-n');
    const asking = async (page: Page) =>
      (await isAsked(page)) || (await passButton(page).count()) > 0;
    const heading = async (page: Page) =>
      (await matchPanel(page).locator(".gs-question-title").allTextContents()).join(" ");

    let clicked: string | null = null;
    let castSeen = false;
    let sawDim = false;
    let mulligans = 0;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({ clicked, castSeen }));

    while (Date.now() < deadline) {
      await watch.check();
      if (clicked && (await onStack.count()) > 0) castSeen = true;
      // Flashback exiles it as it resolves: out of the fan, into Exile.
      if (castSeen && (await fan.count()) === 0 && (await exiled.innerText()) !== "0") break;

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      if (await discardIfAsked(live)) continue;
      if (await answerCardTray(live)) continue;
      if ((await matchPanel(live).locator("button.gs-act-combat").count()) > 0) {
        await passCombat(live);
        continue;
      }
      const asked = await heading(live);

      // THE MOMENT: the host's move, Think Twice castable from the fan.
      if (live === host && !clicked && /Your move/.test(asked)) {
        if ((await castable.count()) > 0) {
          if (CLIP) await film(host, CLIP);
          await host.waitForTimeout(1_200);
          // No window: the fan card is the cue (Amendment 3) ...
          await expect(yourMoveWindow(host), "no Your move window for a fan card").toHaveCount(0);
          // ... breathing like a playable hand card (0090's Breath layer).
          await expect(castable.first()).toHaveClass(/bf-breathes/);
          await expect(
            castable.first().locator("xpath=..").locator(".bf-breath"),
            "its breath",
          ).toHaveCount(1);
          await host.screenshot({ path: "test-results/seen/cast-from-pile-before.png" });
          clicked = await castable.first().getAttribute("data-object-id");
          // A real pointer click on the card, as a player would.
          await castable.first().click({ timeout: 10_000 });
          continue;
        }
        if (
          !sawDim &&
          (await fan.count()) > 0 &&
          (await fan.getAttribute("data-unpayable")) === "true"
        ) {
          // Not enough mana yet: dimmed, as a hand card is (§7.54), and still no window.
          await expect(yourMoveWindow(host)).toHaveCount(0);
          await expect(fan.first()).not.toHaveClass(/bf-breathes/);
          sawDim = true;
        }
      }

      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));
      let pick = -1;
      if (/Keep or mulligan/.test(asked)) {
        const hand = await matchPanel(live).locator('[data-zone="viewer:hand"]').allTextContents();
        const keep =
          live !== host || mulligans >= 2 || hand.some((name) => name.includes("Think Twice"));
        if (!keep) mulligans += 1;
        pick = find(keep ? /Keep/ : /Mulligan/);
      } else if (/Play or draw/.test(asked)) {
        pick = 0;
      } else if (/Put a card back/.test(asked)) {
        pick = find(/^Island/);
        // A second put-back after two mulligans may have no Island left
        // (CI a03a3db stalled 120 s): any card but Think Twice.
        if (pick < 0) pick = labels.findIndex((label) => !/^Think Twice/.test(label));
      } else if (/Pay the mana|^\s*Pay \{/.test(asked)) {
        pick = 0;
      } else if (/Your move/.test(asked)) {
        pick = find(/Play land/);
        // Dig for Think Twice until one is in the graveyard; then keep the mana.
        if (pick < 0 && live === host && (await fan.count()) === 0) {
          pick = find(/^Think Twice/);
          if (pick < 0) pick = find(DIG);
        }
      } else if (labels.length > 0 && (await passButton(live).count()) === 0) {
        pick = 0;
      }
      if (pick >= 0) await answer(options.nth(pick));
      else await answer(passButton(live));
      await live.waitForTimeout(40);
    }

    expect(clicked, "Think Twice was castable from the fan on the host's move").not.toBeNull();
    expect(castSeen, "the click cast it: Think Twice went on the stack").toBe(true);
    await expect(fan, "it left the fan").toHaveCount(0);
    await host.waitForTimeout(2_500);
    await host.screenshot({ path: "test-results/seen/cast-from-pile-after.png" });
    await stopFilming();
  } finally {
    await stopFilming().catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});

let filming: Page | null = null;

/** Film the page at 1920x1080 into [file], with a still every 200 ms beside it. */
async function film(page: Page, file: string): Promise<void> {
  const stills = file.replace(/\.webm$/, "") + "-stills";
  mkdirSync(stills, { recursive: true });
  const start = Date.now();
  let next = 0;
  await page.screencast.start({
    path: file,
    size: SCREEN,
    onFrame: ({ data }) => {
      const ms = Date.now() - start;
      if (ms < next) return;
      next = ms + 200;
      writeFileSync(join(stills, `${String(ms).padStart(6, "0")}ms.jpg`), data);
    },
  });
  filming = page;
}

async function stopFilming(): Promise<void> {
  const page = filming;
  filming = null;
  if (page) await page.screencast.stop();
}
