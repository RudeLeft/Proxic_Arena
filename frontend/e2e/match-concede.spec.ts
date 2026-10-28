// Concede and Abandon, in the browser — PHASE_07 §7.55, P7-T.
//
// Concede is FORGE's concession: a real loss, and Forge names the
// winner. Abandon stays, for a stuck or broken game, and has no winner.
// Both ask first. scripts/check-concede.py proves the worker half
// against Forge (on your move, while the other player is asked, mid-cast,
// refused in the mulligan); this proves what both players are shown.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch, whoseTurn } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

async function twoPlayers(browser: import("@playwright/test").Browser) {
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  return { host, guest };
}

async function close(host: Page, guest: Page) {
  await clearEverything(host).catch(() => undefined);
  await host.context().close();
  await guest.context().close();
}

test("conceding is a real loss: Forge names the other player the winner, and both are told", async ({
  browser,
}) => {
  test.skip(!pkg, "no deck package available");
  const { host, guest } = await twoPlayers(browser);
  try {
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName);
    // The game proper: someone holds priority (before then, Forge's
    // own client refuses a concession too -- check-concede.py).
    await whoseTurn(host, guest);

    const menu = matchPanel(host);

    // Chat opens from its tab on the left edge; there is no chat icon by
    // the gear (owner 2026-10-28). The guest says something, and the
    // host's tab pulses until the host opens the chat.
    await expect(menu.getByRole("button", { name: /^Chat/ })).toHaveCount(0);
    const guestChat = guest.getByRole("complementary", { name: "Game chat" });
    await guestChat.getByRole("button", { name: "Open the game chat" }).click();
    // Spec 0013 — the game's own chat, not the lobby's.
    await guestChat.getByLabel("Message the game").fill("good game");
    await guestChat.getByRole("button", { name: "Send" }).click();
    const flashing = menu.getByRole("button", { name: "Open the game chat, new messages" });
    await expect(flashing).toBeVisible({ timeout: 15_000 });
    await expect(flashing).toHaveClass(/gs-chat-tab-unread/);
    await host.screenshot({ path: "test-results/seen/chat-flashing.png", fullPage: true });
    await flashing.click();
    const chat = host.getByRole("complementary", { name: "Game chat" });
    await expect(chat).toContainText("good game");
    const box = await chat.boundingBox();
    expect(box?.x ?? 99, "the chat should open on the left").toBeLessThan(10);
    // Spec 0016 (6) — no Close button: the tab closes it.
    await expect(chat.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
    await chat.getByRole("button", { name: "Close the game chat" }).click();
    await expect(chat.getByRole("button", { name: "Open the game chat" })).toBeVisible();

    // The gear holds Stops, Concede and Abandon match.
    await menu.getByRole("button", { name: "Game menu" }).click();
    await host.screenshot({ path: "test-results/seen/game-menu.png", fullPage: true });
    await menu.getByRole("button", { name: "Concede" }).click();
    // It asks first, and keeping playing changes nothing.
    await expect(menu.getByText("Concede this game? Your opponent wins it")).toBeVisible();
    await menu.getByRole("button", { name: "Keep playing" }).click();
    await expect(menu.getByText("Concede this game?")).toHaveCount(0);

    await menu.getByRole("button", { name: "Game menu" }).click();
    await menu.getByRole("button", { name: "Concede" }).click();
    await menu.getByRole("button", { name: "Yes, concede" }).click();

    // FORGE's result, worded as a concession, for each of them.
    await expect(
      matchPanel(host).getByText(/^You conceded on turn [0-9]+\. Your opponent won\.$/),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      matchPanel(guest).getByText(/^Your opponent conceded on turn [0-9]+\. You won\.$/),
    ).toBeVisible({
      timeout: 60_000,
    });
    await host.screenshot({ path: "test-results/seen/conceded-host.png", fullPage: true });
    await guest.screenshot({ path: "test-results/seen/conceded-guest.png", fullPage: true });
  } finally {
    await close(host, guest);
  }
});

test("abandoning still ends the match with no winner, after asking", async ({ browser }) => {
  test.skip(!pkg, "no deck package available");
  const { host, guest } = await twoPlayers(browser);
  try {
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName);
    await whoseTurn(host, guest);

    const menu = matchPanel(guest);
    await menu.getByRole("button", { name: "Game menu" }).click();
    await menu.getByRole("button", { name: "Abandon match" }).click();
    await expect(menu.getByText(/Nobody wins it, and it cannot be resumed/)).toBeVisible();
    await menu.getByRole("button", { name: "Yes, abandon the match" }).click();

    for (const page of [host, guest]) {
      await expect(
        page.getByText("The match was abandoned. Nobody won it, and the room is open again."),
      ).toBeVisible({
        timeout: 60_000,
      });
    }
  } finally {
    await close(host, guest);
  }
});
