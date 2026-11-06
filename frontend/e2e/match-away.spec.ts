// Phase 9 W-26 (Amendment 20, owner 2026-11-05) -- the other player has
// been gone the away time: a game window beside their plate, their plate
// says "Away" from the moment they drop, Peek fades it, Keep waiting puts
// it away. A real game on the real server; only the away time is said
// again shorter (MATCH_HELLO's awayMinutes, 1), so the test waits one
// minute and not ten. Ending the game is spec 0054's own test.

import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

const faded = (page: Page) =>
  matchPanel(page)
    .locator(".gs-away-win")
    .evaluate((el) => el.classList.contains("gs-win-peek"));

test("an away player: Away on their plate, then a window beside it with Keep waiting, End the game and Peek", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  await guest.routeWebSocket("**/ws/matches/**", (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => {
      if (typeof m === "string" && m.includes('"MATCH_HELLO"')) {
        ws.send(JSON.stringify({ ...(JSON.parse(m) as object), awayMinutes: 1 }));
        return;
      }
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });

  try {
    const deck = await sharedDeck(
      host,
      guest,
      join(process.cwd(), "..", "Test Deck", "ci-deck.zip"),
    );
    await startAMatch(host, guest, deck);
    const panel = matchPanel(guest);
    const theirPlate = panel.locator(".gs-seat-opponent");
    await expect(theirPlate.locator(".gs-seat-away")).toHaveCount(0);

    // The host goes: their plate says so at once, the window comes later.
    await hostContext.close();
    await expect(theirPlate.locator(".gs-seat-away")).toHaveText(/^Away · \d+ min$/, {
      timeout: 60_000,
    });
    const away = panel.getByRole("alertdialog", { name: /has been gone 1 minute$/ });
    await expect(away).toBeVisible({ timeout: 150_000 });
    await expect(away).toContainText("Ending the game counts as");
    await expect(away.getByRole("button", { name: "Keep waiting" })).toBeVisible();
    await expect(away.getByRole("button", { name: "End the game · you win" })).toBeVisible();

    // Beside their plate, pointing at it: left of the column, level with it.
    const box = (await away.boundingBox())!;
    const plate = (await theirPlate.boundingBox())!;
    const rail = (await panel.locator(".bf-rail").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(rail.x + 1);
    expect(box.x + box.width).toBeGreaterThan(rail.x - 60);
    expect(box.y).toBeLessThan(plate.y + plate.height);
    expect(box.y + box.height).toBeGreaterThan(plate.y);
    await guest.screenshot({ path: "test-results/seen/w26-away.png" });

    // Peek fades it, Space too.
    const peek = away.getByRole("button", { name: /^Peek/ });
    await peek.hover();
    await guest.mouse.down();
    await expect.poll(() => faded(guest)).toBe(true);
    await guest.mouse.up();
    await expect.poll(() => faded(guest)).toBe(false);
    await guest.keyboard.down("Space");
    await expect.poll(() => faded(guest)).toBe(true);
    await guest.keyboard.up("Space");

    // Keep waiting puts it away; the plate still says Away.
    await away.getByRole("button", { name: "Keep waiting" }).click();
    await expect(away).toHaveCount(0);
    await expect(theirPlate.locator(".gs-seat-away")).toBeVisible();
  } finally {
    await guestContext.close();
  }
});
