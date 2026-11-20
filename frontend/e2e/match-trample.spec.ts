// Trample, in a real game -- spec 0107 (F-0107-L), AGENTS TEST-012.
//
// The host attacks with a Garruk's Companion (3/2, trample); the guest
// REALLY declares a block with a 1/1 Elf (a click on the Elf, then on the
// attacker). The host's page shows "Change split" under the Companion.
//
// 1. First combat: the host REALLY clicks "Change split"; the damage window
//    opens filled in (1 on the Elf, 2 to the guest); the host REALLY clicks
//    − on the guest and + on the Elf until all three are on the Elf, then
//    Done, then the act button. The guest's page gets the report window
//    ("... none trampled over."), and the guest's life is unchanged.
// 2. Next combat, blocked again: the host just clicks the act button. No
//    damage window opens, the guest's life falls by the excess (two, read
//    once the fight's clock has ended: lifeSettled), and no new report.
//
// Every wait is on a state (the button there, the window open, the life
// settled, the report present). The deck is protocol/fixtures/trample-deck.
// CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/trample-deck.zip" protocol/fixtures/trample-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import {
  boardCards,
  clearEverything,
  clickNow,
  discardIfAsked,
  isAsked,
  lifeSettled,
  matchPanel,
  passButton,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "trample-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

const inHand = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const lifeOf = async (page: Page, side: "viewer" | "opponent") => {
  await lifeSettled(page);
  return Number(await page.locator(`.gs-seat-${side} .gs-life`).first().getAttribute("data-life"));
};
const kindOf = async (page: Page) =>
  (await matchPanel(page)
    .locator(".gs-combat")
    .getAttribute("data-kind", { timeout: 200 })
    .catch(() => null)) ?? "";
const reportText = async (page: Page) =>
  ((await page.locator(".gs-reveal").allTextContents()).join(" ") || "").replace(/\s+/g, " ");

/**
 * Stills only (PROXIC_TRAMPLE_SLOW=0.25): the table's animations at that
 * rate on both pages while the fight is filmed, so the stills catch the
 * carry-on at the shield (AGENTS TEST-013.3: slowed for the part inspected).
 * Never set by CI; every assertion here is on states, not on time.
 */
const SLOW = Number(process.env.PROXIC_TRAMPLE_SLOW ?? 1);
async function animationRate(pages: Page[], rate: number) {
  if (SLOW === 1) return;
  for (const page of pages) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
  }
}

/** A few stills of both pages while the fight plays (the carry-on to the shield). */
async function burst(host: Page, guest: Page, name: string) {
  for (let i = 0; i < (SLOW === 1 ? 12 : 24); i++) {
    await host.screenshot({ path: join(SHOTS, `${name}-host-${String(i).padStart(2, "0")}.png`) });
    await guest.screenshot({
      path: join(SHOTS, `${name}-guest-${String(i).padStart(2, "0")}.png`),
    });
  }
}

test("trample: Change split keeps it all on the blocker and the defender is told; next time the split is made, the excess tramples over", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no trample deck package (CI builds it)");
  mkdirSync(SHOTS, { recursive: true });
  // 1920x1080, or a browser window's 1920x947 (PROXIC_TRAMPLE_H=947): the
  // carry-on's stop beside the life shield is checked at both (spec 0107).
  const viewport = { width: 1920, height: Number(process.env.PROXIC_TRAMPLE_H ?? 1080) };
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

  try {
    const deck = await sharedDeck(host, guest, pkg);
    const forests = (n: number) => Array.from({ length: n }, () => "Forest");
    await startAMatch(host, guest, deck, {
      deal: {
        host: { hand: [...forests(3), "Garruk's Companion", ...forests(3)], top: forests(10) },
        guest: {
          hand: ["Forest", "Llanowar Elves", "Elvish Mystic", ...forests(4)],
          top: forests(10),
        },
      },
    });

    // combats: 0 none yet; each entry what that combat did.
    const combats: {
      split: boolean;
      trayFilled?: string[];
      lifeBefore: number;
      lifeAfter?: number;
      told?: string;
      tray?: boolean;
    }[] = [];
    let cast = false;
    let attacking = false;
    let blocked = false;
    let atStop = false;
    const deadline = Date.now() + 1_000_000;
    const done = () => combats.length >= 2 && combats[1]!.lifeAfter !== undefined;
    const watch = watchGame([host, guest], () => ({ cast, combats }));

    while (!done() && Date.now() < deadline) {
      await watch.check();
      // A combat's damage is over: read the guest's life (and its report).
      const now = combats[combats.length - 1];
      if (now && now.lifeAfter === undefined && blocked && !atStop) {
        const step = ((await host.locator(".gs-steps").getAttribute("data-step")) ?? "").trim();
        // Past combat: Main 2 (or the next turn, when the rest was passed for it).
        if (step !== "" && !/combat/i.test(step)) {
          now.lifeAfter = await lifeOf(guest, "viewer");
          if (now.split) {
            // The defender's window, a state to wait for.
            await expect
              .poll(() => reportText(guest), { timeout: 20_000 })
              .toContain("trampled over");
            now.told = await reportText(guest);
            await guest.screenshot({ path: join(SHOTS, "trample-guest-report.png") });
            await host.screenshot({ path: join(SHOTS, "trample-host-after-kept.png") });
          } else {
            now.told = await reportText(guest);
            await guest.screenshot({ path: join(SHOTS, "trample-guest-after-auto.png") });
          }
          blocked = false;
          attacking = false;
        }
      }
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        await page.mouse.move(0, 0);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        // Report windows close once read (the guest's is read above, first).
        const close = page.locator(".gs-reveal .gs-reveal-close");
        if ((await close.count()) > 0) {
          if (!isHost && combats.some((c) => c.split && !c.told)) continue;
          await clickNow(close);
          continue;
        }
        const kind = await kindOf(page);
        if (kind === "declareAttackers") {
          const companion = boardCards(page, "viewer").filter({ hasText: /^Garruk's Companion/ });
          const elves = boardCards(page, "opponent").filter({
            hasText: /^(Llanowar Elves|Elvish Mystic)/,
          });
          const ready = page
            .locator('.bf-cards button[data-controller="viewer"][data-choosable="true"]')
            .filter({ hasText: /^Garruk's Companion/ });
          if (
            isHost &&
            !attacking &&
            combats.length < 2 &&
            (await ready.count()) > 0 &&
            (await elves.count()) > 0
          ) {
            // A real click on the Companion, then on the guest's life: the attack.
            await realClick(page, companion);
            const life = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
            await expect(life).toBeVisible({ timeout: 5_000 });
            await realClick(page, life);
            attacking = true;
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }
        if (kind === "declareBlockers") {
          if (!isHost && attacking && !blocked) {
            // A real click on an Elf, then on the attacking Companion: the block.
            const elf = page
              .locator('.bf-cards button[data-controller="viewer"][data-choosable="true"]')
              .filter({ hasText: /^(Llanowar Elves|Elvish Mystic)/ });
            const attacker = page
              .locator('.bf-cards button[data-controller="opponent"][data-attacking="true"]')
              .filter({ hasText: /^Garruk's Companion/ });
            if ((await elf.count()) > 0 && (await attacker.count()) > 0) {
              await realClick(page, elf);
              await page.waitForTimeout(200);
              await realClick(page, attacker);
              await expect(page.locator(".bf-cards button[data-blocking]")).not.toHaveCount(0, {
                timeout: 10_000,
              });
              blocked = true;
              combats.push({
                split: combats.length === 0,
                lifeBefore: await lifeOf(page, "viewer"),
              });
            }
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }
        // The damage window (opened by "Change split").
        const tray = panel.locator('.gs-win.gs-tray[data-kind="assignCombatDamage"]');
        if ((await tray.count()) > 0) {
          const current = combats[combats.length - 1];
          if (!current?.split) {
            if (current) current.tray = true;
            await clickNow(tray.locator(".gs-win-btn-main:not(:disabled)"));
            continue;
          }
          const values = async () => tray.locator(".gs-win-stepper b").allTextContents();
          current.trayFilled = await values();
          await host.screenshot({ path: join(SHOTS, "trample-host-window.png") });
          const blocker = tray.locator(".gs-win-damage-one[data-object-id^='card:']").first();
          const player = tray.locator('.gs-win-damage-one[data-object-id="player"]');
          // − on the guest until nothing goes to them, + on the Elf until nothing is left.
          for (
            let i = 0;
            i < 10 && (await player.locator(".gs-win-stepper b").textContent()) !== "0";
            i++
          )
            await realClick(page, player.getByRole("button", { name: "One less" }));
          for (let i = 0; i < 10; i++) {
            const more = blocker.getByRole("button", { name: "One more" });
            if (await more.isDisabled()) break;
            await realClick(page, more);
          }
          await expect(tray.locator(".gs-win-left")).toHaveText("Damage left: 0");
          await host.screenshot({ path: join(SHOTS, "trample-host-window-changed.png") });
          await realClick(page, tray.getByRole("button", { name: "Done" }));
          await expect(tray).toHaveCount(0, { timeout: 20_000 });
          continue;
        }
        if (!(await isAsked(page))) continue;
        // The trample stop: "Change split" under the Companion, the host's page only.
        const split = page.locator(".bf-split");
        if (isHost && blocked && (await split.count()) > 0) {
          atStop = true;
          const current = combats[combats.length - 1]!;
          expect(await guest.locator(".bf-split").count(), "never on the defender's page").toBe(0);
          if (current.split && current.trayFilled === undefined) {
            await page.screenshot({ path: join(SHOTS, "trample-host-change-split.png") });
            expect(await realClick(page, split), "Change split can be really clicked").toBe(true);
            await expect(
              panel.locator('.gs-win.gs-tray[data-kind="assignCombatDamage"]'),
            ).toHaveCount(1, {
              timeout: 20_000,
            });
            continue;
          }
          if (!current.split)
            await page.screenshot({ path: join(SHOTS, "trample-host-change-split-2.png") });
          // To damage: the act button.
          await animationRate([host, guest], SLOW);
          await realClick(page, passButton(page));
          atStop = false;
          // The fight plays: stills of both pages.
          await burst(host, guest, current.split ? "trample-kept" : "trample-carry");
          await animationRate([host, guest], 1);
          continue;
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          // Paying for the Companion: the lands the game lets this seat tap.
          const tap = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await tap.filter({ hasText: /^Forest/ }).count()) > 0)
            await clickNow(tap.filter({ hasText: /^Forest/ }));
          else if ((await main.count()) > 0) await clickNow(main);
          else await clickNow(passButton(page));
          continue;
        }
        let pick: Locator | null = null;
        if ((await page.locator('button[data-zone="stack"]').count()) === 0) {
          const step = ((await page.locator(".gs-steps").getAttribute("data-step")) ?? "").trim();
          if (/main/i.test(step)) {
            if ((await inHand(page, /^Forest/).count()) > 0) pick = inHand(page, /^Forest/);
            else if (isHost && !cast && (await inHand(page, /^Garruk's Companion/).count()) > 0)
              pick = inHand(page, /^Garruk's Companion/);
            else if (!isHost && (await inHand(page, /^(Llanowar Elves|Elvish Mystic)/).count()) > 0)
              pick = inHand(page, /^(Llanowar Elves|Elvish Mystic)/);
          }
        }
        if (pick && (await pick.count()) > 0) {
          const what = (await pick.first().textContent()) ?? "";
          if ((await realClick(page, pick.first())) && /Companion/.test(what)) cast = true;
        } else await clickNow(passButton(page));
      }
    }

    console.log(`trample combats: ${JSON.stringify(combats)}`);
    expect(combats.length, "two blocked combats").toBe(2);
    const [kept, made] = combats as [(typeof combats)[number], (typeof combats)[number]];
    // 1. Change split: filled in 1 and 2, all three moved onto the Elf.
    expect(kept.trayFilled, "the window opened filled in: lethal, the rest to the guest").toEqual([
      "1",
      "2",
    ]);
    expect(kept.lifeAfter, "all on the Elf: the guest's life is unchanged").toBe(kept.lifeBefore);
    expect(kept.told).toContain(`${testUser} put all three on your`);
    expect(kept.told).toContain("none trampled over.");
    // 2. The split made for the host: no window, two trampled over, no report.
    expect(made.tray, "no damage window when the split is not changed").toBeUndefined();
    expect(made.lifeAfter, "the excess trampled over").toBe(made.lifeBefore - 2);
    expect(made.told ?? "", "no report when the usual split was used").not.toContain(
      "trampled over",
    );
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
