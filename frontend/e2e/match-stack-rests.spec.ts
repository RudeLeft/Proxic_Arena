// The stack always shows, in a real game -- spec 0105 (F-0105-I), AGENTS
// TEST-012.
//
// 1. The host REALLY casts Raging Goblin (a real click on the hand card,
//    clamped with hitPoint) and pays, the guest holding nothing it could
//    cast: nobody can answer it. Both pages show its stack card with the
//    resting ring, and the act line "Resolving · nobody can answer"; then
//    the Goblin is on the battlefield. From each page's own record
//    (`window.__proxicStackRests`, performance.now() stamps the page writes
//    when the resting card is first drawn, when it lands and when a board no
//    longer has it) it stayed on the stack the whole rest, 5.9 s, from the
//    board that said so, and at least 2.5 s after it landed on EACH page
//    (spec 0105 Amendment 1, owner 2026-11-19: the guest's card lands about
//    3.0 s after the rest board -- its mana balls, then the flip, hold and
//    flight -- inside the 3400 ms allowance since Amendment 2, owner
//    2026-11-20, after a slow runner's 3150.7 ms arrival) -- "at least",
//    which slow CI frames cannot break. Each page's time after landing is
//    logged.
// 2. The guest casts Shock at the host, who holds Lightning Bolt with a
//    Mountain up: the host is asked (no ring), passes, and it resolves with
//    no rest on either page.
//
// Waits on states (a ring there, the record written, the card on the
// battlefield), never on an animation frame. Dealt (spec 0098). The deck is
// protocol/fixtures/interaction-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/interaction-deck.zip" protocol/fixtures/interaction-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  clearEverything,
  clickNow,
  discardIfAsked,
  isAsked,
  lifeSettled,
  matchPanel,
  passButton,
  passCombat,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "interaction-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

type Seen = {
  name: string;
  ms: number;
  seen: number;
  landed: number;
  ring: number;
  left: number | null;
};
const record = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __proxicStackRests?: Seen[] }).__proxicStackRests ?? [],
  );
const ring = (page: Page) => page.locator("[data-rest-ring]");
const inHand = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const lifeOf = async (page: Page, side: "viewer" | "opponent") => {
  await lifeSettled(page);
  return Number((await page.locator(`.gs-seat-${side} .gs-life`).first().textContent()) ?? "0");
};

test("a creature nobody can answer rests on the stack with its ring on both pages, then lands; an answerable spell asks, with no ring", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no interaction deck package (CI builds it)");
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

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        // Raging Goblin on the host's first turn, with the only Mountain:
        // nothing left to answer its own spell with. Lightning Bolt is its
        // first draw (kept for step 2).
        host: {
          hand: [
            "Mountain",
            "Raging Goblin",
            "Mountain",
            "Mountain",
            "Gray Ogre",
            "Hill Giant",
            "Mountain",
          ],
          top: ["Lightning Bolt", "Mountain", "Mountain", "Mountain", "Mountain"],
        },
        // No instant until its second draw (Shock), so it can never answer the Goblin.
        guest: {
          hand: [
            "Mountain",
            "Mountain",
            "Mountain",
            "Gray Ogre",
            "Hill Giant",
            "Goblin Piker",
            "Bladetusk Boar",
          ],
          top: ["Mountain", "Shock", "Mountain", "Mountain", "Mountain"],
        },
      },
    });

    let goblinCast = false;
    let goblinDown = false;
    const rings: Record<string, { act: string; ms: string | null } | null> = {
      host: null,
      guest: null,
    };
    let shockCast = false;
    let asked: { rings: number; guestRings: number } | null = null;
    let shockDone = false;
    let hostLifeBefore: number | null = null;
    const done = () => goblinDown && shockDone;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({
      goblinCast,
      goblinDown,
      rings,
      shockCast,
      asked,
    }));

    while (!done() && Date.now() < deadline) {
      await watch.check();
      // Step 1 -- each page's ring, once, while the Goblin rests.
      if (goblinCast && !goblinDown) {
        for (const [who, page] of [
          ["host", host],
          ["guest", guest],
        ] as const) {
          if (rings[who] || (await ring(page).count()) === 0) continue;
          rings[who] = {
            act: (await matchPanel(page).locator(".gs-waiting-sub").allTextContents()).join(" "),
            ms: await ring(page).first().getAttribute("data-rest-ms"),
          };
          await page.screenshot({ path: join(SHOTS, `stack-rests-${who}-ring.png`) });
        }
        if (
          (await boardCards(host, "viewer")
            .filter({ hasText: /^Raging Goblin/ })
            .count()) > 0 &&
          (await boardCards(guest, "opponent")
            .filter({ hasText: /^Raging Goblin/ })
            .count()) > 0
        ) {
          goblinDown = true;
          await guest.screenshot({ path: join(SHOTS, "stack-rests-guest-landed.png") });
        }
      }
      if (shockCast && !shockDone && hostLifeBefore !== null) {
        if ((await lifeOf(host, "viewer")) < hostLifeBefore) {
          shockDone = true;
          continue;
        }
      }
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        const other = page.locator(".gs-reveal .gs-reveal-close");
        if ((await other.count()) > 0) {
          await clickNow(other);
          continue;
        }
        if (await answerCardTray(page)) continue;
        if ((await panel.locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        // Casting: the guest's Shock aims at the host's life; paying taps a Mountain.
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          const theirLife = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          if ((await targeting.count()) > 0 && (await theirLife.count()) > 0) {
            await realClick(page, theirLife);
            continue;
          }
          const tap = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-win li button, .gs-question li button");
          if ((await tap.count()) > 0) await clickNow(tap);
          else if ((await listed.count()) > 0) await clickNow(listed);
          else await clickNow(panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"));
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
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else await clickNow(passButton(page));
          continue;
        }
        const onStack = page.locator('button[data-zone="stack"]');
        // Step 2 -- the host asked with the guest's Shock on the stack: no ring anywhere.
        if (isHost && shockCast && (await onStack.filter({ hasText: /Shock/ }).count()) > 0) {
          if (!asked) {
            asked = { rings: await ring(host).count(), guestRings: await ring(guest).count() };
            hostLifeBefore = await lifeOf(host, "viewer");
            await host.screenshot({ path: join(SHOTS, "stack-rests-host-asked.png") });
          }
          await clickNow(passButton(page));
          continue;
        }
        let pick: Locator | null = null;
        if ((await onStack.count()) === 0) {
          const land = inHand(page, /^Mountain/);
          if (isHost && !goblinCast && (await inHand(page, /^Raging Goblin/).count()) > 0) {
            // The land first, then the Goblin with it.
            const mountains = await boardCards(page, "viewer")
              .filter({ hasText: /^Mountain/ })
              .count();
            pick = mountains > 0 ? inHand(page, /^Raging Goblin/) : land;
          } else if (
            !isHost &&
            goblinDown &&
            !shockCast &&
            (await inHand(page, /^Shock/).count()) > 0
          ) {
            pick = inHand(page, /^Shock/);
          } else if ((await land.count()) > 0) pick = land;
        }
        if (pick && (await pick.count()) > 0) {
          const what = (await pick.first().textContent()) ?? "";
          if (await realClick(page, pick)) {
            if (/Raging Goblin/.test(what)) goblinCast = true;
            if (/Shock/.test(what)) shockCast = true;
          }
        } else await clickNow(passButton(page));
      }
    }

    const hostSeen = await record(host);
    const guestSeen = await record(guest);
    const goblin = (seen: Seen[]) => seen.find((r) => r.name === "Raging Goblin");
    const afterLanding = (r: Seen | undefined) => (r && r.left !== null ? r.left - r.landed : null);
    const wholeRest = (r: Seen | undefined) => (r && r.left !== null ? r.left - r.seen : null);
    console.log(`step 1 (the rings): ${JSON.stringify(rings)}`);
    console.log(`host record: ${JSON.stringify(hostSeen)}`);
    console.log(`guest record: ${JSON.stringify(guestSeen)}`);
    console.log(`step 2 (the Shock): ${JSON.stringify({ shockCast, asked, shockDone })}`);
    console.log(
      `on the stack after landing (ms): host ${afterLanding(goblin(hostSeen))}, guest ${afterLanding(goblin(guestSeen))}; ` +
        `arrival (ms): host ${goblin(hostSeen) ? goblin(hostSeen)!.landed - goblin(hostSeen)!.seen : null}, ` +
        `guest ${goblin(guestSeen) ? goblin(guestSeen)!.landed - goblin(guestSeen)!.seen : null}`,
    );
    expect(goblinCast, "the host really clicked Raging Goblin").toBe(true);
    expect(rings.host, "the host's page showed the ring").not.toBeNull();
    expect(rings.guest, "the guest's page showed the ring").not.toBeNull();
    expect(rings.guest!.act, "the guest's act line").toContain("Resolving · nobody can answer");
    expect(rings.host!.act, "the host's act line").toContain("Resolving · nobody can answer");
    expect(goblinDown, "the Goblin landed on the battlefield").toBe(true);
    expect(goblin(guestSeen), "the guest's page recorded the resting card").toBeTruthy();
    expect(goblin(hostSeen), "the host's page recorded the resting card").toBeTruthy();
    expect(goblin(guestSeen)!.ms).toBe(5900);
    // F-0105-I: the least any seat sees is the owner's 2.5 s (Amendment 1).
    expect(
      afterLanding(goblin(guestSeen)),
      "on the guest's page it stayed at least 2.5 s after landing",
    ).toBeGreaterThanOrEqual(2500);
    expect(afterLanding(goblin(hostSeen)), "on the host's page too").toBeGreaterThanOrEqual(2500);
    // The page never ran ahead of the game: on each page the stack card
    // stayed until the resolution's board, the whole rest after the board
    // that said so (less 100 ms for when each board was drawn).
    expect(
      wholeRest(goblin(guestSeen)),
      "the guest's card stayed the whole rest",
    ).toBeGreaterThanOrEqual(5500);
    expect(
      wholeRest(goblin(hostSeen)),
      "the host's card stayed the whole rest",
    ).toBeGreaterThanOrEqual(5500);
    // Its ring ran from landing to the rest's end.
    for (const r of [goblin(hostSeen)!, goblin(guestSeen)!])
      expect(Math.round(r.ring)).toBe(Math.round(Math.max(0, r.ms - (r.landed - r.seen))));
    expect(shockCast, "the guest cast Shock").toBe(true);
    expect(asked, "the host was asked about the Shock").not.toBeNull();
    expect(asked!.rings, "asked: no ring on the host's page").toBe(0);
    expect(asked!.guestRings, "nor on the guest's").toBe(0);
    expect(shockDone, "the Shock resolved").toBe(true);
    expect(
      [...hostSeen, ...guestSeen].some((r) => r.name === "Shock"),
      "the Shock never rested",
    ).toBe(false);
  } finally {
    // A match left running hijacks the next test on the shard (CI, 0104).
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
