// Outcomes in a real game -- spec 0101 (F-0101-F), AGENTS TEST-012.
//
// 1. Combat (item 3): the host REALLY attacks with Typhoid Rats (printed
//    deathtouch) and the guest REALLY clicks Youthful Knight (printed first
//    strike) to block it. On both pages the gold squares are on as the
//    attack is declared -- deathtouch on the Rats, first strike on the
//    Knight, a creature the game offers as a blocker -- and gone once combat
//    is over.
// 2. Didn't happen (item 2), after step 3: the host activates Prodigal Pyromancer at the
//    guest's Knight; the guest REALLY casts Stifle on the ability. The
//    host's page plays the grey crumble on the ability (no spark at the
//    Knight) and the host gets the window "... countered Prodigal
//    Pyromancer's ability with Stifle."; the guest gets no window for it.
// 3. A shield counter (row 3): the guest REALLY casts Murder at the host's
//    Wingshield Agent: the silver shield on both pages, the Agent stays
//    (the destroy path: no number, as row 3 says).
//
// Dealt (spec 0098), so every moment comes on the first game. The deck is
// protocol/fixtures/outcomes-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/outcomes-deck.zip" protocol/fixtures/outcomes-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  cardCount,
  clearEverything,
  clickIf,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  matchPanel,
  passButton,
  PAYING,
  realClick,
  sharedDeck,
  startAMatch,
  TARGETING,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "outcomes-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";

type Seen = {
  squares: string[];
  crumbled: string[];
  sparks: string[];
  said: string[];
  silver: number;
};

/** On every frame from now: the combat squares on the table, crumbled stack entries, sparks, reports, silver shields. */
async function recorder(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __seen: Seen };
    w.__seen = { squares: [], crumbled: [], sparks: [], said: [], silver: 0 };
    const add = (list: string[], v: string) => {
      if (v && !list.includes(v)) list.push(v);
    };
    const tick = () => {
      const s = w.__seen;
      for (const m of document.querySelectorAll<HTMLElement>(
        '.bf-mark[data-mark="kw:deathtouch"], .bf-mark[data-mark="kw:first strike"]',
      )) {
        const slot = m.closest(".bf-slot");
        const name = (slot?.querySelector("[data-object-id]")?.textContent ?? "").trim();
        add(s.squares, `${name.slice(0, 16)}|${m.dataset["mark"] ?? ""}`);
      }
      for (const g of document.querySelectorAll<HTMLElement>(
        '[data-ghost-of^="stack:"][data-countered="true"]',
      ))
        add(s.crumbled, g.dataset["ghostOf"] ?? "");
      for (const k of document.querySelectorAll<HTMLElement>("[data-spark]"))
        add(s.sparks, k.dataset["spark"] ?? "");
      for (const r of document.querySelectorAll(".gs-reveal"))
        add(s.said, (r.textContent ?? "").replace(/\s+/g, " ").trim());
      s.silver = Math.max(
        s.silver,
        document.querySelectorAll('[data-fight="silvershield"]').length,
      );
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const seenOf = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);

// Real clicks: match-helpers' realClick, at a hitPoint. This spec had its
// own, at the middle of the box -- CI run 44823436164: the guest's first
// land in hand had Murder, its right-hand neighbour, over its middle; the
// mouse lifted Murder and the click cast it, with `murdered` never set, so
// nothing aimed it at the Agent and the game stood for 120 s.

const squaresNow = (page: Page) =>
  page
    .locator('.bf-mark[data-mark="kw:deathtouch"], .bf-mark[data-mark="kw:first strike"]')
    .count();

test("printed combat squares in combat; a Stifled ping crumbles with a window to its controller; a shield counter's silver shield", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no outcomes deck package (CI builds it)");
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        // The host: the Rats first, the Pyromancer, then the Agent.
        host: {
          hand: [
            "Swamp",
            "Typhoid Rats",
            "Mountain",
            "Mountain",
            "Prodigal Pyromancer",
            "Island",
            "Wingshield Agent",
          ],
          top: ["Island", "Swamp", "Mountain", "Island", "Swamp", "Mountain", "Island", "Swamp"],
        },
        // The guest: the Knight, then Stifle kept for the ping, then Murder.
        guest: {
          hand: ["Plains", "Plains", "Youthful Knight", "Island", "Swamp", "Stifle", "Murder"],
          top: ["Swamp", "Island", "Swamp", "Plains", "Island", "Swamp", "Plains", "Island"],
        },
      },
    });
    await recorder(host);
    await recorder(guest);
    // What the game told each page about survivors (for the report if step 3 fails).
    const told: string[] = [];
    for (const [who, page] of [
      ["host", host],
      ["guest", guest],
    ] as const)
      page.on("websocket", (ws) =>
        ws.on("framereceived", (f) => {
          const text = typeof f.payload === "string" ? f.payload : "";
          const m = /"survived":\[[^\]]*\]/.exec(text);
          if (m) told.push(`${who} ${m[0]}`);
        }),
      );

    let attacked = false;
    let blocked = false;
    let atAttack: { host: Seen; guest: Seen } | null = null;
    let afterCombat: { host: number; guest: number } | null = null;
    let pinged = false;
    let knightId = "";
    let stifled = false;
    let stifleTold: { host: Seen; guest: Seen } | null = null;
    let murdered = false;
    let shielded: { host: Seen; guest: Seen; agent: number } | null = null;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({
      attacked,
      blocked,
      atAttack: !!atAttack,
      afterCombat,
      pinged,
      stifled,
      stifleTold: !!stifleTold,
      murdered,
      shielded: !!shielded,
    }));

    while (!(atAttack && afterCombat && stifleTold && shielded) && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // Once combat is over: no combat square left on either page.
        if (atAttack && !afterCombat && blocked) {
          const step =
            (await host
              .locator(".gs-steps")
              .getAttribute("data-step")
              .catch(() => "")) ?? "";
          if (/main ?2|end|cleanup/i.test(step)) {
            await expect
              .poll(() => squaresNow(host), { timeout: 5_000 })
              .toBe(0)
              .catch(() => undefined);
            await expect
              .poll(() => squaresNow(guest), { timeout: 5_000 })
              .toBe(0)
              .catch(() => undefined);
            afterCombat = { host: await squaresNow(host), guest: await squaresNow(guest) };
          }
        }

        // The window to the ping's controller (step 2).
        if (stifled && !stifleTold) {
          const h = await seenOf(host);
          if (h.said.some((s) => s.includes("Prodigal Pyromancer's ability with Stifle"))) {
            await host.waitForTimeout(800);
            await host.screenshot({ path: join(SHOTS, "outcomes-stifle-window.png") });
            stifleTold = { host: await seenOf(host), guest: await seenOf(guest) };
          }
        }
        // The silver shield (step 3), on both pages, the Agent still there.
        if (murdered && !shielded) {
          const h = await seenOf(host);
          const g = await seenOf(guest);
          const agentsLeft = await cardCount(
            boardCards(host, "viewer").filter({ hasText: /^Wingshield Agent/ }),
          );
          if (agentsLeft === 0) {
            // The Agent is gone: say what was seen and told, and stop.
            shielded = { host: h, guest: g, agent: 0 };
            console.log(`step 3 told: ${JSON.stringify(told)}`);
            break;
          }
          if (h.silver > 0 && g.silver > 0) {
            await page.waitForTimeout(1_500);
            shielded = {
              host: h,
              guest: g,
              agent: await cardCount(
                boardCards(host, "viewer").filter({ hasText: /^Wingshield Agent/ }),
              ),
            };
          }
        }
        if ((await page.locator(".gs-reveal-close").count()) > 0) {
          await clickNow(page.locator(".gs-reveal-close"));
          continue;
        }
        if (await answerCardTray(page)) continue;
        // The host's Pyromancer started again by a stray click after its one
        // ping (its "Deal 1 damage" aim): cancelled, as a player would.
        const cancelPing = page
          .locator("button.gs-act-cancel")
          .filter({ hasText: /Prodigal Pyromancer/ })
          // its ability, not the card being cast from the hand
          .filter({ hasNotText: /hand/i });
        if (isHost && (!pinged || stifled) && (await cancelPing.count()) > 0) {
          await clickNow(cancelPing);
          continue;
        }

        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";
        if (kind === "declareAttackers") {
          const rats = boardCards(page, "viewer").filter({ hasText: /^Typhoid Rats/ });
          const knights = await cardCount(
            boardCards(page, "opponent").filter({ hasText: /^Youthful Knight/ }),
          );
          if (isHost && !attacked && knights > 0 && (await rats.count()) > 0) {
            // A real click on the Rats, then on the guest's life: the attack.
            await realClick(page, rats);
            const life = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
            await expect(life).toBeVisible({ timeout: 5_000 });
            await realClick(page, life);
            attacked = true;
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }
        if (kind === "declareBlockers") {
          if (!isHost && attacked && !blocked) {
            // As the attack is declared: the squares on both pages.
            await page.waitForTimeout(700);
            await host.screenshot({ path: join(SHOTS, "outcomes-combat-host.png") });
            await guest.screenshot({ path: join(SHOTS, "outcomes-combat-guest.png") });
            atAttack = { host: await seenOf(host), guest: await seenOf(guest) };
            // A real click on the Knight, then on the attacking Rats: the block.
            const knight = page
              .locator('.bf-cards button[data-controller="viewer"][data-choosable="true"]')
              .filter({ hasText: /^Youthful Knight/ });
            const rats = page
              .locator('.bf-cards button[data-controller="opponent"][data-attacking="true"]')
              .filter({ hasText: /^Typhoid Rats/ });
            if ((await knight.count()) > 0 && (await rats.count()) > 0) {
              await realClick(page, knight);
              await page.waitForTimeout(200);
              await realClick(page, rats);
              blocked = true;
            }
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }

        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const label =
          (await cast.count()) > 0
            ? await cast.evaluateAll((els) => els[0]?.getAttribute("aria-label") ?? "")
            : "";
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          const aiming = (await targeting.count()) > 0;
          // Murder on its way, however it was started: aimed at the Agent.
          if (!isHost && /Murder/.test(label)) murdered = true;
          // The targets first (a target is a board card too): the host's
          // ping at the Knight, the guest's Murder at the Agent.
          const theirs = (name: RegExp) =>
            page
              .locator('.bf-cards button[data-choosable="true"][data-controller="opponent"]')
              .filter({ hasText: name });
          if (isHost && pinged && !stifled && (await theirs(/^Youthful Knight/).count()) > 0) {
            await realClick(page, theirs(/^Youthful Knight/));
            continue;
          }
          if (!isHost && murdered && !shielded && (await theirs(/^Wingshield Agent/).count()) > 0) {
            await realClick(page, theirs(/^Wingshield Agent/));
            continue;
          }
          // Anything else this seat started by a stray board click (the
          // Pyromancer again after its one ping): cancelled, as a player would.
          const cancel = panel.locator("button.gs-act-cancel");
          if (isHost && stifled && /Prodigal/.test(label) && (await cancel.count()) > 0) {
            await clickNow(cancel);
            continue;
          }
          if (!aiming) {
            // Paying: tap what the game lets this seat tap (its own), else answer.
            const tap = page
              .locator(
                '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"])',
              )
              .filter({ hasText: /Swamp|Mountain|Island|Plains/ });
            const listedNow = panel.locator(".gs-win li button, .gs-question li button");
            if ((await tap.count()) > 0) await clickIf(tap, PAYING);
            else if ((await listedNow.count()) > 0) await clickUnlessCombat(listedNow, TARGETING);
            else
              await clickUnlessCombat(
                panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"),
                TARGETING,
              );
            continue;
          }
          const onStack = page.locator('button[data-zone="stack"][data-choosable="true"]');
          if (!isHost && /Stifle/.test(label) && (await onStack.count()) > 0) {
            await realClick(page, onStack);
            continue;
          }
          const listed = panel.locator(".gs-win li button, .gs-question li button");
          const done = panel.locator("button.gs-targets-done");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
          else if ((await done.count()) > 0) await clickUnlessCombat(done);
          else
            await clickUnlessCombat(panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"));
          continue;
        }

        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const board = page
            .locator('.bf-cards button[data-choosable="true"]')
            .filter({ hasNotText: /^Prodigal Pyromancer/ });
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
          else if ((await main.count()) > 0) await clickUnlessCombat(main);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }

        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const inHand = (name: RegExp) => hand.filter({ hasText: name });
        const mine = boardCards(page, "viewer");
        const theirs = boardCards(page, "opponent");
        const stack = page.locator('button[data-zone="stack"]');
        // Step 2 -- the guest Stifles the host's ping, a real click on Stifle.
        if (
          !isHost &&
          pinged &&
          !stifled &&
          (await stack.filter({ hasText: /Prodigal/ }).count()) > 0 &&
          (await stack.count()) === 1
        ) {
          if ((await inHand(/^Stifle/).count()) > 0) {
            await realClick(page, inHand(/^Stifle/));
            stifled = true;
            continue;
          }
        }
        let pick: Locator | null = null;
        if ((await stack.count()) === 0) {
          if ((await inHand(/^(Swamp|Mountain|Island|Plains)/).count()) > 0)
            pick = inHand(/^(Swamp|Mountain|Island|Plains)/);
          else if (isHost) {
            const pyro = mine.filter({ hasText: /^Prodigal Pyromancer/ });
            const ready = page
              .locator('.bf-cards button[data-controller="viewer"][data-choosable="true"]')
              .filter({ hasText: /^Prodigal Pyromancer/ });
            const knights = await cardCount(theirs.filter({ hasText: /^Youthful Knight/ }));
            const guestIslands = await cardCount(
              page
                .locator('.bf-cards button[data-controller="opponent"][data-tapped="false"]')
                .filter({ hasText: /^Island/ }),
            );
            if ((await cardCount(mine.filter({ hasText: /^Typhoid Rats/ }))) === 0 && !attacked)
              pick = inHand(/^Typhoid Rats/);
            else if ((await cardCount(pyro)) === 0) pick = inHand(/^Prodigal Pyromancer/);
            else if (
              !!stifleTold &&
              (await cardCount(mine.filter({ hasText: /^Wingshield Agent/ }))) === 0
            )
              // Step 3: the Agent comes down for the guest's Murder.
              pick = inHand(/^Wingshield Agent/);
            else if (
              afterCombat &&
              !pinged &&
              knights > 0 &&
              guestIslands > 0 &&
              (await ready.count()) > 0
            ) {
              pick = ready;
              pinged = true;
              knightId =
                (await theirs
                  .filter({ hasText: /^Youthful Knight/ })
                  .first()
                  .getAttribute("data-object-id")
                  .catch(() => "")) ?? "";
            }
          } else {
            const knights = await cardCount(mine.filter({ hasText: /^Youthful Knight/ }));
            const agents = await cardCount(theirs.filter({ hasText: /^Wingshield Agent/ }));
            const swamps = await cardCount(
              page
                .locator('.bf-cards button[data-controller="viewer"][data-tapped="false"]')
                .filter({ hasText: /^Swamp/ }),
            );
            // Only while the Agent still has its shield counter.
            const shieldedAgent = await page.locator('.bf-badge[data-counter="SHIELD"]').count();
            if (knights === 0 && !blocked) pick = inHand(/^Youthful Knight/);
            else if (stifleTold && !murdered && agents > 0 && shieldedAgent > 0 && swamps >= 2) {
              pick = inHand(/^Murder/);
              if ((await pick.count()) > 0) murdered = true;
              else pick = null;
            }
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick);
        else await clickNow(passButton(page));
      }
    }

    console.log(
      `step 1 (combat squares): ${JSON.stringify(atAttack)} after: ${JSON.stringify(afterCombat)}`,
    );
    console.log(`step 2 (Stifle): ${JSON.stringify(stifleTold)}`);
    console.log(
      `step 3 (shield counter): ${JSON.stringify(shielded)} told ${JSON.stringify(told)}`,
    );
    expect(
      atAttack,
      "the host attacked with the Rats and the guest was asked to block",
    ).not.toBeNull();
    for (const [who, seen] of Object.entries(atAttack!)) {
      expect(
        seen.squares.some((s) => s.startsWith("Typhoid Rats") && s.endsWith("kw:deathtouch")),
        `${who}: printed deathtouch on the attacking Rats`,
      ).toBe(true);
      expect(
        seen.squares.some((s) => s.startsWith("Youthful Knight") && s.endsWith("kw:first strike")),
        `${who}: printed first strike on the Knight, offered as a blocker`,
      ).toBe(true);
    }
    expect(blocked, "the guest really clicked the Knight to block").toBe(true);
    expect(afterCombat, "combat ended").toEqual({ host: 0, guest: 0 });

    expect(stifleTold, "the host was told its ability was countered").not.toBeNull();
    expect(
      stifleTold!.host.crumbled.length,
      "the ping crumbled on the host's page",
    ).toBeGreaterThan(0);
    expect(knightId, "the ping aimed at the guest's Knight").not.toBe("");
    expect(stifleTold!.host.sparks, "no spark at the Knight: it did not happen").not.toContain(
      knightId,
    );
    expect(
      stifleTold!.guest.said.filter((s) => s.includes("countered")),
      "the guest, who did it, is told nothing",
    ).toEqual([]);

    expect(shielded, "the guest's Murder met the Agent's shield counter").not.toBeNull();
    expect(shielded!.host.silver, "the silver shield on the host's page").toBeGreaterThan(0);
    expect(shielded!.guest.silver, "the silver shield on the guest's page").toBeGreaterThan(0);
    expect(shielded!.agent, "the Agent stays").toBe(1);
    // The Agent resolved normally after Stifle: never told as countered
    // (a counterspell's own move off the stack once restarted the report).
    for (const [who, seen] of [
      ["host", shielded!.host],
      ["guest", shielded!.guest],
    ] as const)
      expect(
        seen.said.filter((s) => /countered your Wingshield Agent/.test(s)),
        `${who}: no "countered your Wingshield Agent" window`,
      ).toEqual([]);
  } finally {
    await host.context().close();
    await guest.context().close();
  }
});
