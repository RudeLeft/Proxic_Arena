// Spec 0047 -- watching a game, if the players allow it.
//
// F-0047-A: a third account sees Watch on a playing room and opens a live,
//   read-only game: the table, no hand, never a question.
// F-0047-C: with "Let people watch" off, no Watch button, and the server
//   refuses a spectator.
// F-0047-D: the players see how many are watching.
// (F-0047-B, no spectator frame names a hand card, is the Lab's:
// check-spectator.py and the cross-game check-hidden-hands.py.)

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { extraPlayers, secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  clearEverything,
  clickNow,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");

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
      // Discarding down to seven at cleanup: a card in hand.
      const discard = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
      if ((await passButton(page).count()) > 0) await clickNow(passButton(page));
      else if ((await list.count()) > 0) await clickNow(list.first());
      else if ((await discard.count()) > 0) await clickNow(discard.first());
    }
    await host.waitForTimeout(250);
  }
}

test.describe.configure({ mode: "serial" });

test("a third player watches a game, read-only, and the players see it", async ({ browser }) => {
  test.skip(!existsSync(pkg) || extraPlayers.length === 0, "no deck package or no third account");
  test.setTimeout(600_000);
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
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);

    // F-0047-A: Watch, from the lobby.
    await viewer.goto("/play");
    const watch = viewer.getByRole("link", { name: "Watch" });
    await expect(watch).toBeVisible({ timeout: 30_000 });
    await watch.click();
    await expect(viewer).toHaveURL(/\/watch\//);
    await expect(viewer.locator(".gs-watching")).toHaveText("You are watching", {
      timeout: 30_000,
    });
    await expect(viewer.locator(".gs-seat")).toHaveCount(2);

    // F-0047-D: the players see one person watching.
    for (const page of [host, guest]) {
      await expect(page.locator(".gs-watching")).toHaveText("1 watching", { timeout: 30_000 });
    }

    // The game goes on; the spectator's table follows it, and they are
    // never shown a hand or asked anything.
    const before = await turnOf(viewer);
    const end = Date.now() + 120_000;
    let asked = 0;
    while (Date.now() < end && (await turnOf(viewer)) < before + 2) {
      await playOn(host, guest, 3_000);
      asked += await viewer.locator(".gs-win, .gs-question, button.gs-act").count();
      expect(await viewer.locator('[data-zone="viewer:hand"]').count()).toBe(0);
    }
    expect(await turnOf(viewer), "the spectator's table followed the game").toBeGreaterThanOrEqual(
      before + 2,
    );
    expect(asked, "a spectator is never asked anything").toBe(0);
    await viewer.screenshot({ path: "test-results/seen/0047-watching.png" });
    await host.screenshot({ path: "test-results/seen/0047-host-sees-watching.png" });

    // Leaving: the players are told nobody is watching now.
    await viewer.getByRole("button", { name: "Stop watching" }).click();
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

test("with watching off there is no Watch button, and the server refuses", async ({ browser }) => {
  test.skip(!existsSync(pkg) || extraPlayers.length === 0, "no deck package or no third account");
  test.setTimeout(600_000);
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
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, { watchable: false });

    await viewer.goto("/play");
    await expect(viewer.getByText("Players said no watching")).toBeVisible({ timeout: 30_000 });
    await expect(viewer.getByRole("link", { name: "Watch" })).toHaveCount(0);

    // Asked directly, by the room's id: refused.
    const current = (await (await host.request.get("/api/matches/current")).json()) as {
      match: { roomId: string };
    };
    const refused = await viewer.request.get(`/api/matches/watch/${current.match.roomId}`);
    expect(refused.status()).toBe(404);
    await viewer.goto(`/watch/${current.match.roomId}`);
    await expect(viewer).toHaveURL(/\/play$/, { timeout: 30_000 });
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
