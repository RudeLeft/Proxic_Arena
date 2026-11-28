// Spec 0097, item 2 (F-0097-B, TEST-012) -- a turn passed for a player who has
// nothing to play, in a real game.
//
// Both players hold the Karn deck (56 Plains, 4 Karn Liberated): once a
// Plains is down there is nothing else to play for turns, so the game passes
// the rest of that player's turn for them. The act button says so --
// "Passing" over "Nothing to play · N lands, ..." -- with no grey notice at
// the top right, and it is gone once the next turn begins.
//
// PASSING_CLIPS=<dir> records each seat's page (the act button's line, at
// 1920x1080).

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  choices,
  clearEverything,
  clickIf,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  isAsked,
  matchPanel,
  passButton,
  PAYING,
  realClick,
  sharedDeck,
  startAMatch,
  TARGETING,
  watchGame,
} from "./match-helpers";

const karnPackage = join(process.cwd(), "..", "Test Deck", "karn-deck.zip");
const CLIPS = process.env.PASSING_CLIPS;

test("a turn with nothing to play: the act button says Passing and why, no notice, gone next turn", async ({
  browser,
}) => {
  test.skip(!existsSync(karnPackage), "no Karn deck package built");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  if (CLIPS) mkdirSync(CLIPS, { recursive: true });
  const context = () =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: CLIPS, size: viewport } } : {}),
    });
  const host = await (await context()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const turnOf = async (page: Page) =>
    Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0);
  const passing = (page: Page) => matchPanel(page).locator("[data-passing]");

  try {
    const deckName = await sharedDeck(host, guest, karnPackage);
    await startAMatch(host, guest, deckName);
    const watch = watchGame([host, guest], () => "", { allowEnd: true });

    // Each player plays a Plains when asked and passes otherwise -- a real
    // click on the offered choice -- until one of them is passed for.
    let seen: { page: Page; turn: number; words: string } | null = null;
    const deadline = Date.now() + 600_000;
    while (!seen && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        if ((await passing(page).count()) > 0) {
          seen = {
            page,
            turn: await turnOf(page),
            words: (await passing(page).first().textContent()) ?? "",
          };
          break;
        }
      }
      if (seen) break;
      const live = (await isAsked(host)) ? host : (await isAsked(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(50);
        continue;
      }
      const panel = matchPanel(live);
      // The opening hand is its own window: keep it.
      const keepButton = panel.getByRole("button", { name: /^Keep\b/ });
      if ((await keepButton.count()) > 0) {
        await answer(keepButton.first());
        continue;
      }
      const options = await choices(live);
      const labels = await options.allTextContents();
      const land = labels.findIndex((label) => /Play land/.test(label));
      const keep = labels.findIndex((label) => /Keep/.test(label));
      const pass = panel.getByRole("button", { name: "Pass" });
      if (keep >= 0) await answer(options.nth(keep));
      else if (land >= 0) await answer(options.nth(land));
      else if ((await pass.count()) > 0) await answer(pass);
      else if (labels.length) await answer(options.nth(0));
      await live.waitForTimeout(40);
    }
    expect(seen, "a player's turn was passed for them").not.toBeNull();
    const { page, turn, words } = seen!;
    // F-0097-B: the act button says it ...
    expect(words).toContain("Passing");
    expect(words).toMatch(
      /Nothing to play\W+(No lands|One land|\w+ lands); (no land in hand|a land already played this turn|no land you can play)/,
    );
    await page.screenshot({ path: "test-results/seen/0097-passing.png" });
    // ... and nothing says it at the top right, on either page.
    for (const each of [host, guest]) {
      await expect(matchPanel(each).locator(".pa-note", { hasText: "Nothing" })).toHaveCount(0);
    }
    // The other player's button never says it.
    const other = page === host ? guest : host;
    await expect(passing(other)).toHaveCount(0);
    // Gone at the turn line: once the turn moves on, no "Passing".
    await expect.poll(() => turnOf(page), { timeout: 60_000 }).toBeGreaterThan(turn);
    await expect(passing(page)).toHaveCount(0);
    await page.waitForTimeout(1500);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});

// Spec 0124 (F-0124-G, TEST-012) -- in a real game, with real clicks:
//
// 1. The ante window (owner Q3): every Contract from Below is taken out of
//    both decks before the game; once the first turn begins each player has
//    the report window for their own deck, under the game's shield, "Your
//    deck · Contract from Below", and nothing at the top right.
// 2. Bob's move (owner Q2): during the host's passing turn the guest REALLY
//    casts Lightning Bolt at the host (a click on the hand card, then on the
//    host's life, then a Mountain). While it is chosen, paid and waiting the
//    host's button says "<guest>'s move", never "Passing"; once it has
//    resolved, "Passing" is back.
// 3. Every step (owner Q1): the host's turn passes (only five- and six-mana
//    cards in hand); its Scroll Thief attacks and its hit draws a card. The
//    reason the button shows after the hit, that turn, is not the one from
//    before it (an Island drawn: "no land you can play" at the combat steps,
//    then the host is asked at Main 2).
//
// Dealt (spec 0098). The deck is protocol/fixtures/passing-deck. CI builds
// it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/passing-deck.zip" protocol/fixtures/passing-deck

const passingPackage = join(process.cwd(), "..", "Test Deck", "passing-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";

test("spec 0124: the ante window, Bob's move over Passing, and Passing re-checked after a mid-turn draw", async ({
  browser,
}) => {
  test.skip(!existsSync(passingPackage), "no passing deck package (CI builds it)");
  test.setTimeout(1_200_000);
  const viewport = { width: 1920, height: 1080 };
  const context = (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, name), size: viewport } } : {}),
    });
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  // The host's button, the stack and its life, in ONE look inside the page:
  // a Playwright locator's match and its read are separate steps, and React
  // reuses the button's element as "Passing" turns into "Pat's move" (a run
  // once read a [data-passing] match whose words were already the next
  // line's). Never waits, so a button changing under the loop cannot stall it.
  type Look = { passing: string | null; waiting: string; onStack: boolean; life: number };
  const look = (page: Page): Promise<Look> =>
    page.evaluate(() => {
      const passing = document.querySelector("[data-passing]");
      const life = document.querySelector(".gs-seat-viewer .gs-life");
      return {
        passing: passing ? (passing.textContent ?? "") : null,
        waiting: [...document.querySelectorAll(".gs-waiting")]
          .map((e) => e.textContent ?? "")
          .join(" | "),
        onStack: document.querySelector('button[data-zone="stack"]') !== null,
        life: Number(life?.textContent ?? "20"),
      };
    });
  // Any "Passing" element whose own words were not "Passing" (one look each).
  const odd: string[] = [];
  const turnOf = async (page: Page) =>
    Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0);
  const inHand = (page: Page, name: RegExp) =>
    page
      .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
      .filter({ hasText: name });

  try {
    const deck = await sharedDeck(host, guest, passingPackage);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Island",
            "Island",
            "Island",
            "Scroll Thief",
            "Air Elemental",
            "Air Elemental",
            "Mahamoti Djinn",
          ],
          // Five- and six-mana cards until the fourth draw; then Islands.
          top: [
            "Mahamoti Djinn",
            "Mahamoti Djinn",
            "Air Elemental",
            "Island",
            "Island",
            "Island",
            "Island",
          ],
        },
        guest: {
          hand: [
            "Mountain",
            "Mountain",
            "Mountain",
            "Mountain",
            "Lightning Bolt",
            "Lightning Bolt",
            "Mountain",
          ],
          top: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"],
        },
      },
    });

    const ante: Record<string, { by: string; medallion: boolean; notes: number } | null> = {
      host: null,
      guest: null,
    };
    let bolt: "none" | "cast" | "seen" | "done" = "none";
    let duringBolt: { passing: string | null; waiting: string } | null = null;
    let afterBolt: string | null = null;
    // Looks at the host's page while the Bolt was on its stack: how many showed "Passing".
    const stackLooks = { looks: 0, passing: 0 };
    let attackTurn: number | null = null;
    let before: string | null = null;
    let after: string | null = null;
    let lastPassing: string | null = null;
    const done = () => after !== null && bolt === "done" && ante.host && ante.guest;
    const watch = watchGame([host, guest], () => ({ ante, bolt, duringBolt, attackTurn, before }));
    const deadline = Date.now() + 1_000_000;

    let said = 0;
    while (!done() && Date.now() < deadline) {
      await watch.check();
      if (Date.now() - said > 30_000) {
        said = Date.now();
        const acts = async (page: Page) =>
          (await matchPanel(page).locator(".gs-act, .gs-waiting").allTextContents()).join(" | ");
        console.log(
          `turn ${await turnOf(host)}: host [${await acts(host)}] guest [${await acts(guest)}] ` +
            JSON.stringify({ bolt, attackTurn, before, lastPassing }),
        );
      }
      // The host's button, as it is now.
      const now = await look(host);
      const words = now.passing;
      if (words !== null && !words.includes("Passing")) odd.push(words);
      const turn = await turnOf(host);
      if (words) {
        if (attackTurn === null) lastPassing = words;
        else if (turn === attackTurn && words !== before && after === null) {
          after = words;
          await host.screenshot({ path: join(SHOTS, "0124-host-after-the-draw.png") });
        }
      }
      // 2. While the Bolt is chosen, paid and waiting: the guest's move on the
      // host's page, never "Passing"; once it has resolved, "Passing" again.
      if (bolt === "cast" || bolt === "seen") {
        if (now.onStack) {
          stackLooks.looks += 1;
          if (now.passing !== null) stackLooks.passing += 1;
        }
        if (bolt === "cast" && /’s move/.test(now.waiting)) {
          duringBolt = { passing: now.passing, waiting: now.waiting };
          bolt = "seen";
          await host.screenshot({ path: join(SHOTS, "0124-host-bobs-move.png") });
        }
        // Resolved: the host's life is down and nothing is on the stack.
        if (bolt === "seen" && now.life < 20 && !now.onStack && now.passing !== null) {
          afterBolt = now.passing;
          bolt = "done";
          await host.screenshot({ path: join(SHOTS, "0124-host-passing-again.png") });
        }
      }
      for (const [who, page] of [
        ["host", host],
        ["guest", guest],
      ] as const) {
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        // 1. The ante window, once, then closed.
        const report = page.locator(".gs-reveal");
        if ((await report.count()) > 0) {
          if (!ante[who] && (await report.filter({ hasText: "Contract from Below" }).count()) > 0) {
            ante[who] = {
              by: (await report.locator(".gs-reveal-by").allTextContents())[0] ?? "",
              medallion: (await report.locator("[data-medallion='game']").count()) > 0,
              notes: await panel.locator(".pa-note").count(),
            };
            await page.screenshot({ path: join(SHOTS, `0124-${who}-ante-window.png`) });
          }
          const close = page.locator(".gs-reveal .gs-reveal-close");
          if ((await close.count()) > 0) {
            await clickNow(close);
            continue;
          }
        }
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          // The host attacks with its Scroll Thief, once, the first turn it can:
          // a real click on the Thief, then on the guest's life.
          const thief = page
            .locator('.bf-cards button[data-controller="viewer"][data-choosable="true"]')
            .filter({ hasText: /^Scroll Thief/ });
          if (who === "host" && attackTurn === null && (await thief.count()) > 0) {
            await realClick(page, thief);
            const life = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
            await expect(life).toBeVisible({ timeout: 5_000 });
            await realClick(page, life);
            attackTurn = await turnOf(page);
            before = lastPassing;
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }
        // Casting the Bolt: the host's life, then a Mountain.
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          const theirLife = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          const aimShown = (await targeting.count()) > 0;
          if (aimShown && (await theirLife.count()) > 0) {
            await realClick(page, theirLife);
            continue;
          }
          const tap = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-win li button, .gs-question li button");
          if ((await tap.count()) > 0) await clickIf(tap, PAYING);
          else if ((await listed.count()) > 0)
            await clickUnlessCombat(listed, aimShown ? undefined : TARGETING);
          continue;
        }
        if (!(await isAsked(page))) continue;
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
          else if ((await main.count()) > 0) await clickUnlessCombat(main);
          else await clickNow(passButton(page));
          continue;
        }
        let pick = null;
        if (who === "guest") {
          // Bolt the host once, during the host's passing turn.
          if (bolt === "none" && words && (await inHand(page, /^Lightning Bolt/).count()) > 0)
            pick = inHand(page, /^Lightning Bolt/);
          else if ((await inHand(page, /^Mountain/).count()) > 0) pick = inHand(page, /^Mountain/);
        } else {
          // A hand card offered and payable (the page's own marks): the Thief once it can be paid.
          if ((await inHand(page, /^Island/).count()) > 0) pick = inHand(page, /^Island/);
          else if ((await inHand(page, /Scroll Thief/).count()) > 0)
            pick = inHand(page, /Scroll Thief/);
        }
        if (pick && (await pick.count()) > 0) {
          const what = (await pick.allTextContents())[0] ?? "";
          if ((await realClick(page, pick)) && /Lightning Bolt/.test(what)) bolt = "cast";
        } else await clickNow(passButton(page));
      }
    }

    console.log(
      JSON.stringify({
        ante,
        bolt,
        duringBolt,
        stackLooks,
        afterBolt,
        attackTurn,
        before,
        after,
        odd,
      }),
    );
    // 1. The ante window, each player for their own deck.
    for (const who of ["host", "guest"] as const) {
      expect(ante[who], `${who}: the ante report window`).not.toBeNull();
      expect(ante[who]!.by).toBe("Your deck · Contract from Below");
      expect(ante[who]!.medallion, `${who}: the game's shield`).toBe(true);
      expect(ante[who]!.notes, `${who}: nothing at the top right`).toBe(0);
    }
    // 2. The guest's move over Passing, then Passing again.
    expect(duringBolt, "the host's button while the Bolt was cast").not.toBeNull();
    expect(duringBolt!.passing, "never Passing while the guest acts").toBeNull();
    expect(
      stackLooks.looks,
      "the host's page was looked at with the Bolt on the stack",
    ).toBeGreaterThan(0);
    expect(stackLooks.passing, "never Passing with the Bolt on the stack").toBe(0);
    expect(afterBolt, "Passing back once the stack was empty").toMatch(/Nothing to play/);
    // 3. Re-checked after the Thief's draw: a reason that is true now.
    expect(attackTurn, "the host attacked with Scroll Thief").not.toBeNull();
    expect(before, "the host's turn was passing before the attack").toMatch(/Nothing to play/);
    // The reason as it is after the draw: a land now in hand ("no land you can
    // play" at the combat steps, then asked at Main 2), or one more land.
    expect(after, "a fresh reason after the draw").toMatch(/Nothing to play: /);
    expect(after, "not the reason from before the draw").not.toBe(before);
    // The "Passing" element never carried other words (one look in the page each time).
    expect(odd, "a Passing element that did not say Passing").toEqual([]);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});

// Spec 0124, owner answer 2026-11-28 ("Ordinary button", Option B) -- in a
// real game, with real clicks: the host has Islands and Air Elemental in
// hand. Earlier turns pass for it ("Passing", the Elemental not yet payable).
// Once it can pay for the Elemental (the page's own mark: not unpayable) it
// presses Pass / End turn instead (a real click), at Main 1 and Main 2. For the rest of that turn the
// button never says "Passing"; the End step is the ordinary button.

test("spec 0124: passing up a playable card keeps Passing away for the rest of the turn", async ({
  browser,
}) => {
  test.skip(!existsSync(passingPackage), "no passing deck package (CI builds it)");
  test.setTimeout(1_200_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  // One look inside the page (see the test above: the act button's element is reused).
  const look = (page: Page) =>
    page.evaluate(() => {
      const passing = document.querySelector("[data-passing]");
      return {
        passing: passing ? (passing.textContent ?? "") : null,
        step: document.querySelector(".gs-steps")?.getAttribute("data-step") ?? "",
        act: [...document.querySelectorAll(".gs-act, .gs-waiting, .gs-pass")]
          .map((e) => e.textContent ?? "")
          .join(" | "),
      };
    });
  const turnOf = async (page: Page) =>
    Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0);
  const inHand = (page: Page, name: RegExp) =>
    page
      .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
      .filter({ hasText: name });

  try {
    const deck = await sharedDeck(host, guest, passingPackage);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: ["Island", "Island", "Island", "Island", "Island", "Island", "Air Elemental"],
          top: ["Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island"],
        },
        guest: {
          hand: [
            "Mountain",
            "Mountain",
            "Mountain",
            "Mountain",
            "Mountain",
            "Mountain",
            "Mountain",
          ],
          top: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"],
        },
      },
    });

    let passingEarlier: string | null = null;
    let declinedTurn: number | null = null;
    let declines = 0;
    let shot = false;
    const after: { step: string; passing: string }[] = [];
    let endLook: { passing: string | null; step: string; act: string } | null = null;
    let finished = false;
    const watch = watchGame([host, guest], () => ({
      passingEarlier,
      declinedTurn,
      declines,
      after,
    }));
    const deadline = Date.now() + 1_000_000;

    while (!finished && Date.now() < deadline) {
      await watch.check();
      const now = await look(host);
      const turn = await turnOf(host);
      if (declinedTurn === null && now.passing) passingEarlier = now.passing;
      if (declinedTurn !== null) {
        if (turn === declinedTurn && now.passing)
          after.push({ step: now.step, passing: now.passing });
        if (turn > declinedTurn) finished = true;
      }
      for (const page of [host, guest]) {
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        // The ante windows (Contract from Below in the deck): closed.
        const close = page.locator(".gs-reveal .gs-reveal-close");
        if ((await close.count()) > 0) {
          await clickNow(close);
          continue;
        }
        const combat = panel.locator("button.gs-act-combat:not([disabled])");
        if ((await combat.count()) > 0) {
          await clickNow(combat);
          continue;
        }
        if (!(await isAsked(page))) continue;
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
          else if ((await main.count()) > 0) await clickUnlessCombat(main);
          else await clickNow(passButton(page));
          continue;
        }
        const land = inHand(page, page === host ? /^Island/ : /^Mountain/);
        if ((await land.count()) > 0) {
          await realClick(page, land);
          continue;
        }
        if (page === host && (await inHand(host, /^Air Elemental/).count()) > 0) {
          // Air Elemental could be cast: passed up, by a real click on the button.
          if (declinedTurn === null) declinedTurn = await turnOf(host);
          declines += 1;
          const step = (await look(host)).step;
          await realClick(host, passButton(host).first());
          if (step === "Main 2" && !shot) {
            // The End step that follows: the ordinary button, as in 1.76.0.
            shot = true;
            await host.waitForTimeout(150);
            endLook = await look(host);
            await host.screenshot({ path: join(SHOTS, "0124-host-declined-end-step.png") });
          }
          continue;
        }
        await clickNow(passButton(page));
      }
    }

    console.log(JSON.stringify({ passingEarlier, declinedTurn, declines, after, endLook }));
    // The rule is on: an earlier turn passed for the host.
    expect(passingEarlier, "an earlier turn was passed for the host").toMatch(/Nothing to play/);
    expect(declinedTurn, "the host passed up Air Elemental it could pay for").not.toBeNull();
    expect(declines, "passed up at Main 1 and at Main 2").toBeGreaterThanOrEqual(1);
    expect(endLook, "the host's button after its Main 2 pass").not.toBeNull();
    expect(endLook!.passing, "the End step: the ordinary button").toBeNull();
    // Never "Passing" again that turn.
    expect(after, "no Passing for the rest of the turn").toEqual([]);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
