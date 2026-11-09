// Spec 0047 -- watching a game; spec 0067 -- "Spectate", made whole.
//
// F-0047-A: a third account spectates a playing room: a live, read-only
//   game, the table, no hand, never a question.
// F-0067-G (was F-0047-C): every game can be spectated -- no "Let people
//   watch" -- but only once the board is up: a greyed "Starting…" while the
//   players load and choose their hands, then a LIVE badge and Spectate.
// F-0067-H (was F-0047-D): the players see how many are watching, and
//   pointing at it lists who.
// F-0067-E/F: the spectator reads the public play log, read-only, and can
//   switch sides; never a hand card.
// F-0067-C/D: a network hiccup is ridden out; at the end the spectator is
//   told who won (the slim card), the connection closes cleanly (no red
//   "no longer connected"), and a rematch is followed.
// F-0067-A/B: the life on a plate steps down at each hit (slow-motion
//   frames), and a life below zero shows on the shield and in the words.
// (F-0047-B / F-0067-E, no spectator frame or line names a hand card, is
// the Lab's: check-spectator.py and the cross-game check-hidden-hands.py.)

import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { extraPlayers, secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import {
  attackWithAll,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  expectReady,
  lifeSettled,
  markReady,
  matchPanel,
  passButton,
  passCombat,
  seatOf,
  settlePregame,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const goblins = join(process.cwd(), "..", "Test Deck", "goblin-deck.zip");
/** Where the pictures go: SPEC_SHOTS, or the test results. */
const SHOTS = process.env["SPEC_SHOTS"] ?? "test-results/seen/0067";
mkdirSync(SHOTS, { recursive: true });
const shot = (name: string) => join(SHOTS, name);

/** The game screen's turn number, as a page shows it. */
const turnOf = async (page: Page) =>
  Number(
    (await page
      .locator(".gs-turn-value")
      .first()
      .textContent()
      .catch(() => "0")) ?? 0,
  );

/** Both players pass whatever they are asked, for a while: the game goes on. */
async function playOn(host: Page, guest: Page, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const page of [host, guest]) {
      const list = matchPanel(page).locator(
        ".gs-question li button, .gs-win li button, button.gs-win-tile:not(:disabled), .gs-win button.gs-win-btn-main",
      );
      // Discarding down to seven at cleanup: pick a card, then Discard (spec 0061).
      if (await discardIfAsked(page)) continue;
      if ((await passButton(page).count()) > 0) await clickNow(passButton(page));
      else if ((await list.count()) > 0) await clickNow(list.first());
    }
    await host.waitForTimeout(250);
  }
}

/** The players' next game in the same room: Back to the room, Ready, Start. */
async function rematch(host: Page, guest: Page) {
  for (const page of [host, guest]) {
    await page.getByRole("button", { name: /^Back to the room/ }).click();
    await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
  }
  await markReady(host);
  await expectReady(seatOf(host, testUser));
  await expectReady(seatOf(guest, testUser));
  await markReady(guest);
  await expectReady(seatOf(guest, secondUser));
  await expectReady(seatOf(host, secondUser));
  const start = host.getByRole("button", { name: "Start match" });
  await expect(start).toBeEnabled();
  await start.click();
  await settlePregame(host, guest);
}

test.describe.configure({ mode: "serial" });

test("a third player spectates: Starting…, Spectate, the log, Switch sides, a hiccup, the result, a rematch", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg) || extraPlayers.length === 0, "no deck package or no third account");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const viewerContext = await browser.newContext({ viewport });
  const viewer = await viewerContext.newPage();
  const watcher = extraPlayers[0]!;
  await signInAs(viewer, watcher.username, watcher.password);
  await clearEverything(viewer);
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await viewer.goto("/play");
    // F-0067-G: no "Let people watch" when opening a room.
    await expect(host.getByRole("checkbox", { name: /watch/i })).toHaveCount(0);
    await startAMatch(host, guest, deck, { settle: false });

    // F-0067-G: while they load and choose their hands, "Starting…", greyed.
    const room = viewer.locator("article.pa-room-card", { hasText: testUser });
    const starting = room.getByRole("button", { name: "Starting…" });
    await expect(starting).toBeVisible({ timeout: 120_000 });
    await expect(starting).toBeDisabled();
    await expect(room.getByRole("link", { name: /Spectate/ })).toHaveCount(0);
    await room.screenshot({ path: shot("01-lobby-starting.png") });

    await settlePregame(host, guest);
    const spectate = room.getByRole("link", { name: /Spectate/ });
    await expect(spectate).toBeVisible({ timeout: 60_000 });
    await expect(room.locator(".pa-live")).toHaveText("LIVE");
    await room.screenshot({ path: shot("02-lobby-spectate.png") });
    await spectate.click();
    await expect(viewer).toHaveURL(/\/watch\//);

    // The chip says what is watched; the old "You are watching" pill is gone.
    const chip = viewer.getByTestId("spectating-chip");
    await expect(chip).toContainText("Spectating", { timeout: 60_000 });
    await expect(chip).toContainText(" vs ");
    await expect(viewer.locator(".gs-watching")).toHaveCount(0);
    await expect(viewer.locator(".gs-seat")).toHaveCount(2);

    // F-0067-H: the players see one person watching, and pointing lists who.
    for (const page of [host, guest]) {
      await expect(page.locator(".gs-watching")).toContainText("1 watching", { timeout: 30_000 });
    }
    const pill = host.locator(".gs-watching");
    await pill.hover();
    const names = host.getByTestId("watching-list");
    await expect(names).toBeVisible();
    await expect(names).toContainText("Watching");
    await expect(names.locator("li")).toHaveCount(1);
    await expect(names.locator("li")).not.toHaveText("");
    const label = (await pill.getAttribute("aria-label")) ?? "";
    expect(label).toMatch(/^1 watching: .+/);
    // Beside the column, over the table's edge: the ladder is not covered.
    const list = (await names.boundingBox())!;
    const ladder = (await host.locator(".gs-ladder-head").boundingBox())!;
    expect(list.x + list.width, "the list stays left of the turn ladder").toBeLessThanOrEqual(
      ladder.x,
    );
    await host.screenshot({ path: shot("03-players-see-who-is-watching.png") });
    // The same list with five names (more accounts than the test has: the
    // four extra lines are added to the real list, to look at the size).
    await names.evaluate((el) => {
      const ul = el.querySelector("ul")!;
      for (const name of ["Bob the Builder", "Carol", "Dave", "Eleanor Rigby"]) {
        const li = document.createElement("li");
        li.textContent = name;
        ul.appendChild(li);
      }
    });
    await host.screenshot({ path: shot("03b-watching-list-five-names.png") });

    // The game goes on; the spectator's table follows it, and they are
    // never shown a hand or asked anything.
    const before = await turnOf(viewer);
    const end = Date.now() + 180_000;
    let asked = 0;
    const game = watchGame([host, guest]);
    while (Date.now() < end && (await turnOf(viewer)) < before + 2) {
      await game.check();
      await playOn(host, guest, 3_000);
      asked += await viewer.locator(".gs-win, .gs-question, button.gs-act").count();
      expect(await viewer.locator('[data-zone="viewer:hand"]').count()).toBe(0);
    }
    expect(await turnOf(viewer), "the spectator's table followed the game").toBeGreaterThanOrEqual(
      before + 2,
    );
    expect(asked, "a spectator is never asked anything").toBe(0);
    await viewer.screenshot({ path: shot("04-spectator-chip.png") });

    // F-0067-E: the public play log, read-only: no chat, no box to type in.
    await viewer.getByRole("button", { name: "Open the play log" }).click();
    const log = viewer.getByRole("complementary", { name: "Play log" });
    await expect(log.getByRole("log")).toContainText(/drew/, { timeout: 30_000 });
    await expect(log.getByRole("textbox")).toHaveCount(0);
    await expect(log.getByRole("tab", { name: /^Chat/ })).toHaveCount(0);
    await viewer.waitForTimeout(600); // the drawer slides in
    await viewer.screenshot({ path: shot("05-spectator-play-log.png") });
    await viewer.getByRole("button", { name: "Close the play log" }).click();

    // F-0067-F: Switch sides turns the table round, plates and all.
    const bottom = async () =>
      viewer.locator(".gs-seat-viewer").getAttribute("data-seat", { timeout: 5_000 });
    const was = await bottom();
    await viewer.screenshot({ path: shot("06-switch-sides-before.png") });
    await viewer.getByRole("button", { name: "Switch sides" }).click();
    await viewer.waitForTimeout(150);
    await viewer.screenshot({ path: shot("07a-switch-sides-fading.png") });
    await viewer.waitForTimeout(350);
    await viewer.screenshot({ path: shot("07b-switch-sides-turned-plates-gliding.png") });
    await expect.poll(bottom).not.toBe(was);
    await viewer.waitForTimeout(900);
    await viewer.screenshot({ path: shot("08-switch-sides-after.png") });
    expect(await viewer.locator('[data-zone="viewer:hand"]').count(), "still no hand").toBe(0);

    // F-0067-D: a hiccup is ridden out -- never "game over".
    await viewerContext.setOffline(true);
    await playOn(host, guest, 4_000);
    await viewerContext.setOffline(false);
    await playOn(host, guest, 6_000);
    await expect(viewer.getByTestId("spectator-over")).toHaveCount(0);
    await expect(viewer.getByTestId("spectating-chip")).toBeVisible({ timeout: 60_000 });
    expect(viewer.url()).toMatch(/\/watch\//);

    // F-0067-C: the host concedes; the spectator is told who won and why.
    const menu = matchPanel(host);
    await menu.getByRole("button", { name: "Game menu" }).click();
    await menu.getByRole("button", { name: "Concede" }).click();
    await menu.getByRole("button", { name: "Yes, concede" }).click();
    const over = viewer.getByTestId("spectator-over");
    await expect(over).toBeVisible({ timeout: 60_000 });
    await expect(over.getByRole("heading")).toHaveText(/won$/);
    await expect(over).toContainText("conceded");
    await expect(over.getByRole("button", { name: "Back to the lobby" })).toBeVisible();
    await viewer.screenshot({ path: shot("09-spectator-game-over.png") });
    // F-0067-D: closed cleanly -- no red "no longer connected", still.
    await viewer.waitForTimeout(6_000);
    await expect(viewer.getByText("You're no longer connected to the game")).toHaveCount(0);
    await expect(viewer.getByText("Reconnecting to the game")).toHaveCount(0);

    // F-0067-D: the players' next game in the room: the spectator follows.
    await rematch(host, guest);
    await expect(viewer.getByTestId("spectator-over")).toHaveCount(0, { timeout: 60_000 });
    await expect(viewer.getByTestId("spectating-chip")).toBeVisible({ timeout: 60_000 });
    await expect(viewer.locator(".gs-turn-value")).toBeVisible();
    // The one loading screen's burst, then the new game's table.
    await expect(viewer.locator(".gs-loading")).toHaveCount(0, { timeout: 30_000 });
    await viewer.screenshot({ path: shot("10-spectator-followed-rematch.png") });

    // Leaving: the players are told nobody is watching now.
    await viewer.getByRole("button", { name: "Stop spectating" }).click();
    await expect(viewer).toHaveURL(/\/play$/);
    await expect(host.locator(".gs-watching")).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    // Closed, or a page left signed in follows the player into the next
    // test's game and answers for them there (CI 2026-11-03: a paused
    // response window passed by the previous test's page).
    await host.context().close();
    await guest.context().close();
    await viewer.context().close();
    await clearEverything(viewer).catch(() => undefined);
  }
});

/** Every animation the page makes runs at this rate (the fights, their marks, the plates' clock). */
const SLOW = 0.2;

test("life steps down at each hit, and a life below zero shows on the shield and in the words", async ({
  browser,
}) => {
  test.skip(
    !existsSync(goblins) || extraPlayers.length === 0,
    "no goblin deck or no third account",
  );
  test.setTimeout(1_500_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const viewer = await (await browser.newContext({ viewport })).newPage();
  const watcher = extraPlayers[0]!;
  await signInAs(viewer, watcher.username, watcher.password);
  await clearEverything(viewer);
  // The spectator's page plays every animation slowly while asked to: the
  // fights and the plate's steps share one clock, so they stay together.
  await viewer.addInitScript((rate) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with apply(this)
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<typeof animate>) {
      const made = animate.apply(this, args);
      if ((window as unknown as { __slow?: boolean }).__slow) made.playbackRate = rate;
      return made;
    };
  }, SLOW);
  try {
    const deck = await sharedDeck(host, guest, goblins);
    await startAMatch(host, guest, deck);
    await viewer.goto("/play");
    const spectate = viewer.locator("article.pa-room-card").getByRole("link", { name: /Spectate/ });
    await expect(spectate).toBeVisible({ timeout: 60_000 });
    await spectate.click();
    await expect(viewer.getByTestId("spectating-chip")).toBeVisible({ timeout: 60_000 });
    await viewer.evaluate(() => {
      (window as unknown as { __slow?: boolean }).__slow = true;
    });

    // The guest's plate, as the spectator sees it (the host's side is at the bottom).
    const guestLife = viewer.locator(".gs-seat-opponent .gs-life-n");
    const frames: { run: number; at: number; life: string; file: string }[] = [];
    let filmed = 0;
    let runs = 0;
    let hits = 0;
    const deadline = Date.now() + 1_350_000;
    const watch = watchGame([host, guest], () => ({ filmed, hits }), { allowEnd: true });
    while (Date.now() < deadline) {
      if ((await viewer.getByTestId("spectator-over").count()) > 0) break;
      await watch.check();

      // A fight playing on the spectator's page with several blows at the
      // guest: film it, frame by frame, numbered.
      const fighting = await viewer.evaluate(() =>
        document.getAnimations().some((a) => a.id === "fight-clock" && a.playState === "running"),
      );
      if (fighting && filmed < 2) {
        const start = Date.now();
        const seen = new Set<string>();
        let n = 0;
        runs += 1;
        while (
          Date.now() - start < 40_000 &&
          (await viewer.evaluate(() =>
            document
              .getAnimations()
              .some((a) => a.id === "fight-clock" && a.playState === "running"),
          ))
        ) {
          const life = (await guestLife.textContent()) ?? "";
          seen.add(life);
          const file = shot(
            `life-fight-${String(runs).padStart(2, "0")}-frame-${String(++n).padStart(3, "0")}-life-${life}.png`,
          );
          await viewer.screenshot({ path: file });
          frames.push({ run: runs, at: Date.now() - start, life, file });
          await viewer.waitForTimeout(200);
        }
        hits = Math.max(hits, seen.size - 1);
        filmed += seen.size > 2 ? 1 : 0;
        continue;
      }

      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";
        if (kind === "declareAttackers") {
          // The host attacks with everything it can, every turn.
          if (page === host) await attackWithAll(page).catch(() => false);
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }
        if (kind === "declareBlockers") {
          // The guest never blocks: every attacker reaches the guest's plate.
          await passCombat(page);
          continue;
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const mana = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await mana.count()) > 0) await clickUnlessCombat(mana);
          else await clickNow(passButton(page));
          continue;
        }
        // The host plays a Mountain, then its goblins; the guest only lands.
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const picks =
          page === host
            ? [hand.filter({ hasText: /^Mountain/ }), hand.filter({ hasNotText: /^Mountain/ })]
            : [hand.filter({ hasText: /^Mountain/ })];
        let acted = false;
        for (const pick of picks) {
          if ((await pick.count()) > 0) {
            await clickNow(pick);
            acted = true;
            break;
          }
        }
        if (!acted) {
          await clickNow(
            panel.locator(
              "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
            ),
          );
        }
      }
      await host.waitForTimeout(120);
    }
    // F-0067-A: a fight was filmed in which the plate stepped at least twice.
    expect(
      filmed,
      `slow-motion frames: ${JSON.stringify(frames.map((f) => f.life))}`,
    ).toBeGreaterThan(0);
    expect(hits, "the plate stepped once per blow").toBeGreaterThanOrEqual(2);
    // The steps only ever go down while blows land (no lifelink here).
    const lives = frames.map((f) => Number(f.life));
    for (let i = 1; i < lives.length; i++) {
      if (frames[i]!.run === frames[i - 1]!.run) {
        expect(lives[i]!).toBeLessThanOrEqual(lives[i - 1]!);
      }
    }

    // F-0067-B, F-0067-C: the game ended on the guest's life; the spectator's
    // card says where it fell to, and so does the shield.
    const over = viewer.getByTestId("spectator-over");
    await expect(over).toBeVisible({ timeout: 120_000 });
    await viewer.evaluate(() => {
      (window as unknown as { __slow?: boolean }).__slow = false;
    });
    await expect(over).toContainText(/life fell to -?[0-9]+/);
    // The last blows may still be landing (slowly) under the card. A key
    // hurries whatever moves (Phase 10 A-00), and the plate settles on the
    // board's number at once (F-0067-A: a hurry settles).
    await viewer.keyboard.press("Shift");
    await lifeSettled(viewer);
    await viewer.waitForTimeout(2_000);
    const final = Number((await guestLife.textContent()) ?? "1");
    expect(final).toBeLessThanOrEqual(0);
    await expect(over).toContainText(`life fell to ${final}`);
    if (String(final).length >= 3) {
      await expect(viewer.locator(".gs-seat-opponent .gs-life")).toHaveClass(/gs-life-long/);
    }
    await viewer.screenshot({ path: shot("11-spectator-game-over-life.png") });
    await host.screenshot({ path: shot("12-host-result-life.png") });
    await viewer
      .locator(".gs-seat-opponent .gs-life")
      .screenshot({ path: shot("13-shield-final-life.png") });
    // F-0067-B, item 8 A: three characters shrink to fit. A game rarely ends
    // that low, so the real shield is copied and given "-12" and the class
    // the plate gives a three-character life (lifeIsLong), to look at.
    await viewer.evaluate(() => {
      const real = document.querySelector(".gs-seat-opponent .gs-life")!;
      const copy = real.cloneNode(true) as HTMLElement;
      copy.querySelector(".gs-life-n")!.textContent = "-12";
      copy.classList.add("gs-life-long", "gs-life-preview");
      real.parentElement!.appendChild(copy);
    });
    await viewer
      .locator(".gs-life-preview")
      .screenshot({ path: shot("14-shield-three-characters.png") });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
    await viewer.context().close();
    await clearEverything(viewer).catch(() => undefined);
  }
});
