// Sacrificing in a real game, through the page — feature spec 0001,
// F-0001-H (Phase 8 Part 1).
//
// Innocent Blood: "Each player sacrifices a creature." Whoever is asked
// answers by clicking one of their OWN creatures on the board. The
// question says what is asking ("Innocent Blood: sacrifice a creature"),
// makes nothing else clickable, and cannot be backed out of: Forge's
// sacrifice has no "no", so there is no Cancel and no Pass. The creature
// clicked -- the LAST one offered, so no default could pass for it --
// leaves the battlefield.
//
// Both players use the sacrifice test deck (protocol/fixtures/
// sacrifice-deck): Swamps, Innocent Blood, and creatures with nothing to
// activate. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/sacrifice-deck.zip" protocol/fixtures/sacrifice-deck

//
// Spec 0112 (F-0112-E, AGENTS TEST-012) -- the second test: Barter in
// Blood, two creatures each, dealt (spec 0098). While the host chooses, the
// guest's waiting line reads "Choosing what to sacrifice · you choose next";
// the host REALLY clicks its two creatures; the guest's window opens with
// "{host} sacrificed {A} and {B}." and the two pictures; the guest REALLY
// clicks its two; meanwhile the host's line has no "you choose next"; both
// graveyards gain two. Waits on states (the question there, the line's
// words, the graveyard counts). The deck is protocol/fixtures/barter-deck;
// locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/barter-deck.zip" protocol/fixtures/barter-deck

import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  clearEverything,
  clickNow,
  passButton,
  passCombat,
  clickUnlessCombat,
  matchPanel,
  question,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
  discardIfAsked,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "sacrifice-deck.zip");
const SACRIFICE = '[data-kind="choosePermanentsToSacrifice"]';

/** A DOM click, and no wait when there is nothing to click (see clickNow). */
const click = clickNow;

/** A side's creatures on the battlefield: everything but its Swamps. */
const creatures = (page: Page, side: "viewer" | "opponent") =>
  boardCards(page, side).filter({ hasNotText: "Swamp" });

test("a sacrifice is answered by clicking your own creature, and cannot be cancelled", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no sacrifice deck package (CI builds it)");
  test.setTimeout(900_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);

    let sacrificed = 0;
    // Bounded by the clock, as every match loop here is.
    const deadline = Date.now() + 600_000;
    const watch = watchGame([host, guest], () => ({ sacrificed }));
    while (sacrificed < 2 && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        // Spec 0061: discarding to hand size is pick, then Discard.
        if (await discardIfAsked(page)) continue;

        if ((await page.locator(SACRIFICE).count()) > 0) {
          const { heading, prompt } = await question(page);
          expect(heading).toContain("Sacrifice");
          // What is asking is named: on the other player's spell, the
          // only way to know why your creature is going.
          expect(prompt).toContain("Innocent Blood: sacrifice a creature");
          // No backing out of a sacrifice (Forge's has no "no").
          await expect(panel.locator("button.gs-act-cancel"), "no Cancel").toHaveCount(0);
          await expect(panel.locator("button.gs-pass"), "no Pass").toHaveCount(0);
          // Exactly your own creatures are clickable: no land, nothing of theirs.
          const choosable = panel.locator('.bf-cards button[data-choosable="true"]');
          const sides = await choosable.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-controller")),
          );
          expect(sides.length, "something to sacrifice").toBeGreaterThan(0);
          expect(new Set(sides), "only your own permanents").toEqual(new Set(["viewer"]));
          expect(await choosable.filter({ hasText: "Swamp" }).count(), "no land").toBe(0);
          expect(sides.length, "every creature of yours").toBe(
            await creatures(page, "viewer").count(),
          );

          // AGENTS TEST-011 — something to LOOK AT.
          await page.screenshot({ path: "test-results/seen/sacrifice.png", fullPage: true });

          const last = choosable.last();
          const id = (await last.getAttribute("data-object-id"))!;
          await click(last);
          await expect(page.locator(SACRIFICE), "the question is answered").toHaveCount(0, {
            timeout: 30_000,
          });
          await expect(
            panel.locator(`.bf-cards button[data-object-id="${id}"]`),
            "the creature clicked is no longer on the battlefield",
          ).toHaveCount(0, { timeout: 30_000 });
          sacrificed += 1;
          continue;
        }

        // Nobody attacks: the act button declares no attack, or no block.
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
          // Any other question (paying mana, a discard): the first choice,
          // a board choice, or pass.
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const board = panel.locator(
            '.bf-cards button[data-choosable="true"], .gs-life.gs-choosable',
          );
          // Never a creature under "Declare attackers" arriving meanwhile.
          if ((await listed.count()) > 0) await click(listed);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await click(panel.locator("button.gs-pass, button.gs-act:not(.gs-act-discard)"));
          continue;
        }

        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const land = hand.filter({ hasText: "Swamp" });
        if ((await land.count()) > 0) {
          await click(land);
          continue;
        }
        // Innocent Blood once both players have a creature, so both are asked.
        const blood = hand.filter({ hasText: "Innocent Blood" });
        if (
          (await blood.count()) > 0 &&
          (await creatures(page, "viewer").count()) > 0 &&
          (await creatures(page, "opponent").count()) > 0
        ) {
          await click(blood);
          continue;
        }
        const creature = hand
          .filter({ hasNotText: "Innocent Blood" })
          .filter({ hasNotText: "Swamp" });
        if ((await creature.count()) > 0) {
          await click(creature);
          continue;
        }
        await click(
          panel.locator(
            "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
          ),
        );
      }
      await host.waitForTimeout(100);
    }
    expect(sacrificed, "sacrifices answered by clicking the board").toBeGreaterThanOrEqual(2);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});

// --- Spec 0112: Barter in Blood -------------------------------------------

const barterPkg = join(process.cwd(), "..", "Test Deck", "barter-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;
const SAC_WORDS = "Choosing what to sacrifice";
// A no-break space before the dot (the server's AskingWords).
const NEXT_WORDS = `${SAC_WORDS}\u00a0· you choose next`;

/** A creature of this page's own on the battlefield the page lights. */
const litCreature = (page: Page) =>
  matchPanel(page).locator(
    '.bf-cards button.bf-card[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
  );
/** A hand card the page lights. */
const litInHand = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });

/** The waiting line, the sacrifice window's first line and both graveyards, read together. */
const seenOn = (page: Page) =>
  page.evaluate(() => {
    const text = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? null;
    // The number shown: a count still held back for a card on its way is not it.
    const n = (side: string) =>
      document.querySelector(`[data-zone-tile="${side}:graveyard"] .gs-zone-was`)
        ? -1
        : Number(text(`[data-zone-tile="${side}:graveyard"] .gs-zone-n`) ?? "0") || 0;
    const earlier = document.querySelector(".gs-win .gs-earlier");
    return {
      asked: !!document.querySelector('[data-kind="choosePermanentsToSacrifice"]'),
      word: text(".gs-waiting .gs-waiting-name"),
      sub: text(".gs-waiting .gs-waiting-sub"),
      earlierSaid: earlier?.querySelector(".gs-earlier-said")?.textContent ?? null,
      earlierBy: earlier?.querySelector(".gs-reveal-by")?.textContent ?? null,
      earlierFace: !!earlier?.querySelector(".gs-reveal-face"),
      earlierPics: earlier
        ? [...earlier.querySelectorAll(".gs-earlier-card")].map((li) => ({
            id: (li as HTMLElement).dataset.earlierId ?? "",
            name: li.querySelector(".gs-reveal-name")?.textContent ?? "",
            picture: !!li.querySelector("img, .gs-win-bigcard"),
          }))
        : [],
      // The window's first line comes before its heading.
      earlierFirst: earlier
        ? !!(
            earlier.compareDocumentPosition(
              earlier.closest(".gs-win")!.querySelector(".gs-win-head")!,
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          )
        : false,
      graves: { viewer: n("viewer"), opponent: n("opponent") },
    };
  });
type Seen = Awaited<ReturnType<typeof seenOn>>;

function barterContexts(browser: Browser) {
  const viewport = { width: 1920, height: 1080 };
  return (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, `barter-${name}`), size: viewport } } : {}),
    });
}

/** Really click one of this page's lit creatures; then wait until that card is no longer offered. */
async function sacrificeOne(page: Page): Promise<{ id: string; name: string } | null> {
  const card = litCreature(page).first();
  const id = (await card.getAttribute("data-object-id").catch(() => null)) ?? "";
  const name = ((await card.textContent().catch(() => "")) ?? "").trim();
  if (!id || !(await realClick(page, card))) return null;
  await expect
    .poll(
      () =>
        litCreature(page)
          .and(page.locator(`[data-object-id="${id}"]`))
          .count(),
      {
        timeout: 30_000,
      },
    )
    .toBe(0);
  return { id, name };
}

test("Barter in Blood: the waiting player is told they choose next, then what was sacrificed first", async ({
  browser,
}) => {
  test.skip(!existsSync(barterPkg), "no barter deck package (CI builds it)");
  test.setTimeout(1_200_000);
  mkdirSync(SHOTS, { recursive: true });
  const context = barterContexts(browser);
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, barterPkg);
    const swamps = (n: number) => Array.from({ length: n }, () => "Swamp");
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Swamp",
            "Typhoid Rats",
            "Swamp",
            "Walking Corpse",
            "Swamp",
            "Barter in Blood",
            "Swamp",
          ],
          top: swamps(6),
        },
        guest: {
          hand: ["Swamp", "Typhoid Rats", "Swamp", "Walking Corpse", "Swamp", "Swamp", "Swamp"],
          top: swamps(6),
        },
      },
    });

    const st = {
      barterClicked: false,
      hostPicks: [] as { id: string; name: string }[],
      guestPicks: [] as { id: string; name: string }[],
      /** The guest's page while the host's window was open. */
      guestWhileHost: null as Seen | null,
      /** The guest's window when it opened, and the host's page meanwhile. */
      guestAsked: null as Seen | null,
      hostWhileGuest: null as Seen | null,
      landsClicked: 0,
    };
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({ ...st, guestWhileHost: undefined }));
    const creaturesOf = async (page: Page, side: "viewer" | "opponent") =>
      boardCards(page, side)
        .filter({ hasText: /Typhoid Rats|Walking Corpse/ })
        .count();

    while (st.guestPicks.length < 2 && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // --- the sacrifice windows: Barter in Blood, the host first.
        if ((await page.locator(SACRIFICE).count()) > 0) {
          if (isHost) {
            if (!st.guestWhileHost) {
              // The guest's line while the host chooses (polled: the asking word arrives on its own).
              await expect
                .poll(async () => (await seenOn(guest)).sub, { timeout: 15_000 })
                .toBe(NEXT_WORDS);
              st.guestWhileHost = await seenOn(guest);
              await host.screenshot({ path: join(SHOTS, "0112-1-host-chooses-host.png") });
              await guest.screenshot({ path: join(SHOTS, "0112-1-host-chooses-guest.png") });
            }
            const one = await sacrificeOne(host);
            if (one) st.hostPicks.push(one);
            continue;
          }
          if (!st.guestAsked) {
            st.guestAsked = await seenOn(guest);
            await expect
              .poll(async () => (await seenOn(host)).sub, { timeout: 15_000 })
              .toBe(SAC_WORDS);
            st.hostWhileGuest = await seenOn(host);
            await guest.screenshot({ path: join(SHOTS, "0112-2-guest-window-guest.png") });
            await host.screenshot({ path: join(SHOTS, "0112-2-guest-window-host.png") });
          }
          const one = await sacrificeOne(guest);
          if (one) st.guestPicks.push(one);
          if (st.guestPicks.length === 1)
            await guest.screenshot({ path: join(SHOTS, "0112-3-guest-second-pick-guest.png") });
          continue;
        }

        // --- paying: a real click on a land the page lights.
        if ((await panel.locator('[data-kind="applyManaToCost"]').count()) > 0) {
          const land = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
          );
          if ((await land.count()) > 0) {
            if (await realClick(page, land.first())) st.landsClicked += 1;
            continue;
          }
        }

        if (await answerCardTray(page)) continue;
        // Nobody attacks.
        if ((await panel.locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else if ((await passButton(page).count()) > 0) await clickNow(passButton(page));
          continue;
        }

        const step =
          (await page
            .locator(".gs-steps")
            .getAttribute("data-step")
            .catch(() => "")) ?? "";
        const empty = (await page.locator('button[data-zone="stack"]').count()) === 0;
        if (/Main/.test(step) && empty) {
          const land = litInHand(page, /^Swamp/);
          if ((await land.count()) > 0 && (await realClick(page, land.first()))) continue;
          const mine = await creaturesOf(page, "viewer");
          if (mine < 2) {
            const creature = litInHand(page, /Typhoid Rats|Walking Corpse/);
            if ((await creature.count()) > 0 && (await realClick(page, creature.first()))) continue;
          }
          if (
            isHost &&
            !st.barterClicked &&
            mine >= 2 &&
            (await creaturesOf(page, "opponent")) >= 2 &&
            (await litInHand(page, /Barter in Blood/).count()) > 0
          ) {
            if (await realClick(page, litInHand(page, /Barter in Blood/).first()))
              st.barterClicked = true;
            continue;
          }
        }
        await clickNow(passButton(page));
      }
    }

    // Both graveyards gained two (the host's also holds Barter in Blood), on both pages.
    await expect
      .poll(async () => [(await seenOn(host)).graves, (await seenOn(guest)).graves], {
        timeout: 30_000,
      })
      .toEqual([
        { viewer: 3, opponent: 2 },
        { viewer: 2, opponent: 3 },
      ]);
    await host.screenshot({ path: join(SHOTS, "0112-4-after-host.png") });
    await guest.screenshot({ path: join(SHOTS, "0112-4-after-guest.png") });
    console.log(`0112 game: ${JSON.stringify(st)}`);

    expect(st.barterClicked, "the host really cast Barter in Blood").toBe(true);
    expect(st.hostPicks, "the host really clicked two creatures").toHaveLength(2);
    expect(st.guestPicks, "the guest really clicked two creatures").toHaveLength(2);
    // 1. The guest, waiting: whose move, what they are choosing, and that the guest is next.
    const hostName = (st.guestWhileHost!.word ?? "").replace(/’s move$/, "");
    expect(st.guestWhileHost!.word).toMatch(/’s move$/);
    expect(st.guestWhileHost!.sub).toBe(NEXT_WORDS);
    // 2. The guest's window: the host's medallion, WHO · CARD, the sentence,
    //    the two pictures (the cards the host clicked, in that order), first.
    const named = st.hostPicks.map((p) => p.name.match(/Typhoid Rats|Walking Corpse/)![0]);
    expect(st.guestAsked!.earlierSaid).toBe(`${hostName} sacrificed ${named[0]} and ${named[1]}.`);
    expect(st.guestAsked!.earlierBy).toBe(`${hostName} · Barter in Blood`);
    expect(st.guestAsked!.earlierFace).toBe(true);
    expect(st.guestAsked!.earlierFirst).toBe(true);
    expect(st.guestAsked!.earlierPics.map((p) => p.id)).toEqual(st.hostPicks.map((p) => p.id));
    expect(st.guestAsked!.earlierPics.every((p) => p.picture)).toBe(true);
    // 3. The host, waiting on the guest: nobody chooses after the guest.
    expect(st.hostWhileGuest!.sub).toBe(SAC_WORDS);
  } finally {
    await host.screenshot({ path: join(SHOTS, "0112-last-host.png") }).catch(() => undefined);
    await guest.screenshot({ path: join(SHOTS, "0112-last-guest.png") }).catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
