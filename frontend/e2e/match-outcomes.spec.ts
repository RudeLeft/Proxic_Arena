// Outcomes in a real game -- spec 0101 (F-0101-F), AGENTS TEST-012. A second
// game below is spec 0125's (F-0125-E): menace and prevent-the-next-N.
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

// ---------------------------------------------------------------------------
// Spec 0125 (Phase 11 P11-A6) in a real game: F-0125-E, AGENTS TEST-011.
//
// 1. Menace (item 1): the host REALLY attacks with Boggart Brute (menace);
//    the guest REALLY clicks Grizzly Bears, then the Brute (a lone block),
//    then Done blocking. The game refuses: on BOTH pages the Brute's menace
//    square pulses (0101's combat pulse, WHY_PULSE_MS) as the guest's note
//    says why, and the Bears stay in front of the Brute. The guest takes the
//    Bears back (a real click) and is done; the Brute's 3 reaches her.
// 2. Prevention (item 2): the host Bolts the guest; the guest REALLY casts
//    Healing Salve, "prevent the next 3", on herself. On both pages the pale
//    badge with 3 shows on the guest's plate, at the life shield's lower
//    right, inside the plate and clear of the poison badge's place, the
//    status tray and the tiles (measured, UI-006); then it ticks and goes.
// 3. Part of a hit: the host's Lava Axe (5) into a second Salve: the badge
//    ticks, the red -2, and no pale shield over the guest's life shield.
//
// Stills of both pages at each moment go to PROXIC_SHOTS (default
// test-results/seen). Dealt (spec 0098). The deck is
// protocol/fixtures/menace-prevention-deck; CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/menace-prevention-deck.zip" protocol/fixtures/menace-prevention-deck

const pkgA6 = join(process.cwd(), "..", "Test Deck", "menace-prevention-deck.zip");
const LANDS = /^(Mountain|Forest|Plains)/;

type SeenA6 = {
  /** Each running animation's duration seen on a menace square, once each. */
  menace: number[];
  /** The guest's plate badge: the highest count, and each `data-used` seen. */
  badge: number;
  used: string[];
  /** Pale shields seen over the guest's life shield, per phase. */
  wards: number;
  /** The red numbers seen rising at the guest's life ("−2"). */
  reds: string[];
};

/** On every frame: what the menace squares, the guest's prevention badge and life shield show. */
async function recorderA6(page: Page, guestSide: "viewer" | "opponent") {
  await page.evaluate((side) => {
    const w = window as unknown as { __a6: SeenA6; __running: WeakSet<Animation> };
    w.__a6 = { menace: [], badge: 0, used: [], wards: 0, reds: [] };
    w.__running = new WeakSet();
    const tick = () => {
      const s = w.__a6;
      for (const m of document.querySelectorAll<HTMLElement>('.bf-mark[data-mark="kw:menace"]'))
        for (const a of m.getAnimations()) {
          if (w.__running.has(a)) continue;
          w.__running.add(a);
          s.menace.push(Math.round(Number(a.effect?.getTiming().duration ?? 0)));
        }
      const badge = document.querySelector<HTMLElement>(`.gs-seat-${side} .gs-prevent`);
      if (badge) {
        s.badge = Math.max(s.badge, Number(badge.dataset["prevent"] ?? 0));
        const used = badge.dataset["used"];
        if (used && !s.used.includes(used)) s.used.push(used);
      }
      s.wards = Math.max(s.wards, document.querySelectorAll('[data-fight="ward"]').length);
      for (const r of document.querySelectorAll<HTMLElement>(
        '.bf-fight-life, [data-fight="life"]',
      )) {
        const t = (r.textContent ?? "").trim();
        if (t && !s.reds.includes(t)) s.reds.push(t);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, guestSide);
}
const seenA6 = (page: Page) => page.evaluate(() => (window as unknown as { __a6: SeenA6 }).__a6);

type Box = { x: number; y: number; w: number; h: number };
/** The badge's box and what it must fit beside, on the guest's plate of this page. */
async function fit(page: Page, side: "viewer" | "opponent") {
  return page.evaluate((s) => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const plate = document.querySelector<HTMLElement>(`.gs-seat-${s}`)!;
    const p = plate.getBoundingClientRect();
    // The plate's padding box, where game.css places the poison badge (130, 40, 40 x 40).
    const inner = {
      x: p.left + plate.clientLeft,
      y: p.top + plate.clientTop,
      w: plate.clientWidth,
      h: plate.clientHeight,
    };
    return {
      badge: box(plate.querySelector(".gs-prevent")),
      plate: inner,
      poison: { x: inner.x + 130, y: inner.y + 40, w: 40, h: 40 },
      shield: box(plate.querySelector(".gs-life")),
      number: box(plate.querySelector(".gs-life-n")),
      tiles: box(plate.querySelector(".gs-zones")),
      tray: box(document.querySelector(`.gs-status-${s}`)),
    };
  }, side);
}
const overlap = (a: Box | null, b: Box | null) =>
  !a || !b
    ? 0
    : Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

test("menace pops at a refused lone block on both pages; a player's prevent-the-next-3 badge on the life shield, ticking, and a part of a hit", async ({
  browser,
}) => {
  test.skip(!existsSync(pkgA6), "no menace-prevention deck package (CI builds it)");
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkgA6);
    await startAMatch(host, guest, deck, {
      deal: {
        // The host: the Brute by its third land, the Bolt, then the Axe at five.
        host: {
          hand: [
            "Mountain",
            "Mountain",
            "Boggart Brute",
            "Mountain",
            "Lightning Bolt",
            "Mountain",
            "Lava Axe",
          ],
          top: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"],
        },
        // The guest: the Bears, then two Salves and Plains to cast them.
        guest: {
          hand: [
            "Forest",
            "Forest",
            "Grizzly Bears",
            "Plains",
            "Healing Salve",
            "Plains",
            "Healing Salve",
          ],
          top: ["Plains", "Forest", "Plains", "Forest", "Plains", "Forest"],
        },
      },
    });
    await recorderA6(host, "opponent");
    await recorderA6(guest, "viewer");

    let attacked = false;
    let blocked = false;
    let refused: { host: SeenA6; guest: SeenA6; bearsFront: boolean } | null = null;
    let tookBack = false;
    let afterCombat = false;
    let bolted = false;
    let salves = 0;
    let shown: {
      host: Awaited<ReturnType<typeof fit>>;
      guest: Awaited<ReturnType<typeof fit>>;
    } | null = null;
    let ticked: { host: SeenA6; guest: SeenA6 } | null = null;
    let axed = false;
    let partial: { host: SeenA6; guest: SeenA6 } | null = null;
    let wardsBeforeAxe = { host: 0, guest: 0 };
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({
      attacked,
      blocked,
      refused: !!refused,
      tookBack,
      afterCombat,
      bolted,
      salves,
      shown: !!shown,
      ticked: !!ticked,
      axed,
      partial: !!partial,
    }));
    const life = (page: Page, side: "viewer" | "opponent") =>
      page.locator(`.gs-seat-${side} .gs-life-n`).first().textContent();

    while (!partial && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // The badge on both pages (step 2): stills and its box, once.
        if (salves >= 1 && !shown) {
          const h = host.locator(".gs-seat-opponent .gs-prevent:not([data-used])");
          const g = guest.locator(".gs-seat-viewer .gs-prevent:not([data-used])");
          if ((await h.count()) > 0 && (await g.count()) > 0) {
            await host.waitForTimeout(600);
            await host.screenshot({ path: join(SHOTS, "a6-prevent-host.png") });
            await guest.screenshot({ path: join(SHOTS, "a6-prevent-guest.png") });
            await host
              .locator(".gs-seat-opponent")
              .screenshot({ path: join(SHOTS, "a6-prevent-plate-host.png") });
            await guest
              .locator(".gs-seat-viewer")
              .screenshot({ path: join(SHOTS, "a6-prevent-plate-guest.png") });
            shown = { host: await fit(host, "opponent"), guest: await fit(guest, "viewer") };
            // In a browser window (about 1920 x 947) too.
            await host.setViewportSize({ width: 1920, height: 947 });
            await host.waitForTimeout(300);
            console.log(`at 1920x947 (host): ${JSON.stringify(await fit(host, "opponent"))}`);
            await host.screenshot({ path: join(SHOTS, "a6-prevent-host-947.png") });
            await host.setViewportSize(viewport);
          }
        }
        // The tick (the Bolt resolved into it), on both pages.
        if (shown && !ticked && !axed) {
          const h = host.locator(".gs-seat-opponent .gs-prevent[data-used]");
          const g = guest.locator(".gs-seat-viewer .gs-prevent[data-used]");
          if ((await h.count()) > 0 || (await g.count()) > 0) {
            await host.waitForTimeout(480);
            await host.screenshot({ path: join(SHOTS, "a6-prevent-tick-host.png") });
            await guest.screenshot({ path: join(SHOTS, "a6-prevent-tick-guest.png") });
            await host.waitForTimeout(1_500);
            ticked = { host: await seenA6(host), guest: await seenA6(guest) };
            wardsBeforeAxe = { host: ticked.host.wards, guest: ticked.guest.wards };
            // From here, pale shields count afresh: the partial hit must add none.
            for (const p of [host, guest])
              await p.evaluate(() => {
                (window as unknown as { __a6: SeenA6 }).__a6.wards = 0;
              });
          }
        }
        // Step 3: the Axe's tick, on both pages, the badge gone after.
        if (axed && salves >= 2 && !partial) {
          const used = await seenA6(guest);
          if (used.used.length >= 2) {
            await guest.screenshot({ path: join(SHOTS, "a6-partial-guest.png") });
            await host.screenshot({ path: join(SHOTS, "a6-partial-host.png") });
            await host.waitForTimeout(2_000);
            partial = { host: await seenA6(host), guest: await seenA6(guest) };
            break;
          }
        }
        if ((await page.locator(".gs-reveal-close").count()) > 0) {
          await clickNow(page.locator(".gs-reveal-close"));
          continue;
        }
        if (await answerCardTray(page)) continue;

        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";
        if (kind === "declareAttackers") {
          const brute = boardCards(page, "viewer").filter({ hasText: /^Boggart Brute/ });
          const bears = await cardCount(
            page
              .locator('.bf-cards button[data-controller="opponent"][data-tapped="false"]')
              .filter({ hasText: /^Grizzly Bears/ }),
          );
          if (isHost && !attacked && bears > 0 && (await brute.count()) > 0) {
            await realClick(page, brute);
            const them = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
            await expect(them).toBeVisible({ timeout: 5_000 });
            await realClick(page, them);
            attacked = true;
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }
        if (kind === "declareBlockers") {
          const mineBears = page
            .locator('.bf-cards button[data-controller="viewer"]')
            .filter({ hasText: /^Grizzly Bears/ });
          const brute = page
            .locator('.bf-cards button[data-controller="opponent"][data-attacking="true"]')
            .filter({ hasText: /^Boggart Brute/ });
          if (!isHost && attacked && !blocked) {
            // A real click on the Bears, then on the Brute: a lone block.
            if ((await mineBears.count()) > 0 && (await brute.count()) > 0) {
              await realClick(page, mineBears.and(page.locator('[data-choosable="true"]')));
              await page.waitForTimeout(200);
              await realClick(page, brute);
              await expect(mineBears.first()).toHaveAttribute("data-blocking", "true", {
                timeout: 5_000,
              });
              blocked = true;
              // Done blocking: refused, for menace.
              await realClick(page, panel.locator("button.gs-act-combat:not([disabled])"));
              const note = panel.locator(".gs-combat-notice", { hasText: /has menace/ });
              await expect(note).toBeVisible({ timeout: 10_000 });
              await page.waitForTimeout(180);
              await host.screenshot({ path: join(SHOTS, "a6-menace-host.png") });
              await guest.screenshot({ path: join(SHOTS, "a6-menace-guest.png") });
              await page.waitForTimeout(800);
              refused = {
                host: await seenA6(host),
                guest: await seenA6(guest),
                bearsFront:
                  (await mineBears
                    .first()
                    .getAttribute("data-blocking")
                    .catch(() => "")) === "true",
              };
              continue;
            }
          }
          if (!isHost && refused && !tookBack) {
            // She takes the Bears back (a real click on them), then is done.
            await realClick(page, mineBears.first());
            await expect(mineBears.first())
              .not.toHaveAttribute("data-blocking", "true", { timeout: 5_000 })
              .catch(() => undefined);
            tookBack = true;
          }
          await clickNow(panel.locator("button.gs-act-combat:not([disabled])"));
          continue;
        }

        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const modes = panel.locator('.gs-win[data-kind="chooseModeForAbility"]');
        if ((await modes.count()) > 0) {
          // Healing Salve's "prevent the next 3".
          const prevent = modes.locator("button").filter({ hasText: /revent/ });
          if ((await prevent.count()) > 0) await clickNow(prevent);
          const done = modes.locator("button.gs-modes-done:not(:disabled)");
          if ((await done.count()) > 0) await clickNow(done);
          continue;
        }
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          const aiming = (await targeting.count()) > 0;
          if (aiming) {
            // The host's burn at the guest; the guest's Salve at herself.
            const at = page.locator(
              `.gs-seat-${isHost ? "opponent" : "viewer"} .gs-life[data-choosable="true"]`,
            );
            if ((await at.count()) > 0) {
              await realClick(page, at);
              continue;
            }
            const listed = panel.locator(".gs-win li button, .gs-question li button");
            const done = panel.locator("button.gs-targets-done");
            if ((await done.count()) > 0) await clickUnlessCombat(done);
            else if ((await listed.count()) > 0) await clickUnlessCombat(listed);
            continue;
          }
          const tap = page
            .locator(
              '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"])',
            )
            .filter({ hasText: LANDS });
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

        if (refused && !afterCombat) {
          const step =
            (await host
              .locator(".gs-steps")
              .getAttribute("data-step")
              .catch(() => "")) ?? "";
          if (/main ?2|end|cleanup/i.test(step)) afterCombat = true;
        }

        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const inHand = (name: RegExp) => hand.filter({ hasText: name });
        const stack = page.locator('button[data-zone="stack"]');
        const mine = boardCards(page, "viewer");
        let pick: Locator | null = null;
        const stackN = await stack.count();
        if (!isHost && stackN === 1 && salves < 2) {
          // The guest answers the host's burn with a Salve on herself.
          const burn = (await stack.filter({ hasText: /Lightning Bolt|Lava Axe/ }).count()) > 0;
          const want = salves === 0 ? bolted : axed;
          if (burn && want && (await inHand(/^Healing Salve/).count()) > 0) {
            pick = inHand(/^Healing Salve/);
            salves += 1;
          }
        }
        if (!pick && stackN === 0) {
          if ((await inHand(LANDS).count()) > 0) pick = inHand(LANDS);
          else if (isHost) {
            const untapped = await cardCount(
              page
                .locator('.bf-cards button[data-controller="viewer"][data-tapped="false"]')
                .filter({ hasText: /^Mountain/ }),
            );
            const guestPlains = await cardCount(
              page
                .locator('.bf-cards button[data-controller="opponent"][data-tapped="false"]')
                .filter({ hasText: /^Plains/ }),
            );
            if ((await cardCount(mine.filter({ hasText: /^Boggart Brute/ }))) === 0 && !attacked)
              pick = inHand(/^Boggart Brute/);
            else if (afterCombat && !bolted && guestPlains > 0 && untapped >= 1) {
              pick = inHand(/^Lightning Bolt/);
              if ((await pick.count()) > 0) bolted = true;
              else pick = null;
            } else if (ticked && !axed && guestPlains > 0 && untapped >= 5) {
              pick = inHand(/^Lava Axe/);
              if ((await pick.count()) > 0) axed = true;
              else pick = null;
            }
          } else if ((await cardCount(mine.filter({ hasText: /^Grizzly Bears/ }))) === 0) {
            pick = inHand(/^Grizzly Bears/);
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick);
        else await clickNow(passButton(page));
      }
    }

    console.log(`step 1 (menace): ${JSON.stringify(refused)}`);
    console.log(`step 2 (badge): ${JSON.stringify(shown)} ticked ${JSON.stringify(ticked)}`);
    console.log(
      `step 3 (part of a hit): ${JSON.stringify(partial)} wards before ${JSON.stringify(wardsBeforeAxe)}`,
    );
    console.log(
      `life now: host sees guest ${await life(host, "opponent")}, guest ${await life(guest, "viewer")}`,
    );

    // 1 -- the pop at the refusal, on both pages, with the lone block standing.
    expect(refused, "the guest's lone block of the Brute was refused").not.toBeNull();
    for (const [who, seen] of Object.entries({ host: refused!.host, guest: refused!.guest }))
      expect(seen.menace, `${who}: the menace square pulsed at the refusal (500 ms)`).toContain(
        500,
      );
    expect(refused!.bearsFront, "the Bears stay in front of the Brute at the refusal").toBe(true);
    expect(tookBack, "the guest took the Bears back with a real click").toBe(true);

    // 2 -- the badge: on both pages, its box inside the plate and clear of the rest.
    expect(shown, "the guest's Salve put the badge on her plate, on both pages").not.toBeNull();
    for (const [who, f] of Object.entries(shown!)) {
      const b = f.badge!;
      expect(b, `${who}: the badge is drawn`).not.toBeNull();
      expect(b.x, `${who}: inside the plate's left`).toBeGreaterThanOrEqual(f.plate.x);
      expect(b.x + b.w, `${who}: inside the plate's right edge`).toBeLessThanOrEqual(
        f.plate.x + f.plate.w,
      );
      expect(b.y, `${who}: inside the plate's top`).toBeGreaterThanOrEqual(f.plate.y);
      expect(b.y + b.h, `${who}: inside the plate's bottom`).toBeLessThanOrEqual(
        f.plate.y + f.plate.h,
      );
      expect(overlap(b, f.poison), `${who}: clear of the poison badge's place`).toBe(0);
      expect(overlap(b, f.tray), `${who}: clear of the status tray`).toBe(0);
      expect(overlap(b, f.tiles), `${who}: clear of the tiles`).toBe(0);
      expect(overlap(b, f.shield), `${who}: touching the life shield`).toBeGreaterThan(0);
    }
    expect(ticked, "the Bolt's 3 ticked the badge").not.toBeNull();
    for (const [who, seen] of Object.entries(ticked!)) {
      expect(seen.used, `${who}: 3 -> 0`).toContain("3-0");
      expect(seen.badge, `${who}: the badge said 3`).toBe(3);
    }
    for (const [who, n] of Object.entries(wardsBeforeAxe))
      expect(
        n,
        `${who}: the pale shield over the guest's life shield for the Bolt`,
      ).toBeGreaterThan(0);

    // 3 -- part of a hit: the tick, the red -2, no pale shield.
    expect(partial, "the Axe's 5 met the second Salve").not.toBeNull();
    for (const [who, seen] of Object.entries(partial!)) {
      expect(seen.used.length, `${who}: the badge ticked again`).toBeGreaterThanOrEqual(2);
      expect(seen.wards, `${who}: no pale shield for the part stopped`).toBe(0);
    }
  } finally {
    await host.context().close();
    await guest.context().close();
  }
});
