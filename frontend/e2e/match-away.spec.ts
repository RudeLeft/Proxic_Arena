// Phase 9 W-26 (Amendment 20, owner 2026-11-05) -- the other player has
// been gone the away time: a game window beside their plate, their plate
// says "Away" from the moment they drop, Peek fades it, Keep waiting puts
// it away. A real game on the real server; only the away time is said
// again shorter (MATCH_HELLO's awayMinutes, 1), so the test waits one
// minute and not ten. Ending the game is spec 0054's own test.
// Spec 0120 (D8): "away" is now the game connection's drop, and the server
// says when the window opens (MATCH_PAUSED's awayAt): that is said shorter
// too (one minute after the drop). Until then the pause shows (answer 2:
// its window, replaced by this one in the same place) and the plate says
// "Dropped" for the first minute (answer 4).

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
      if (typeof m === "string" && m.includes('"MATCH_PAUSED"')) {
        const paused = JSON.parse(m) as { since: number; awayAt: number };
        ws.send(JSON.stringify({ ...paused, awayAt: paused.since + 60_000 }));
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

    // The host goes: their plate says so at once ("Dropped" for the first
    // minute, spec 0120), the away window comes later, in the pause window's place.
    await hostContext.close();
    await expect(theirPlate.locator(".gs-seat-away")).toHaveText("Dropped", {
      timeout: 10_000,
    });
    await expect(panel.getByRole("alertdialog")).toHaveAccessibleName(/'s connection dropped$/);
    // Found by its role, its words read (PROTO-006, spec 0113).
    const away = panel.getByRole("alertdialog");
    await expect(away).toBeVisible({ timeout: 150_000 });
    // Spec 0120: the pause window first, replaced by this one at the away time.
    await expect(away).toHaveAccessibleName(/has been gone one minute$/, { timeout: 150_000 });
    await expect(away).toContainText("Ending the game counts as");
    await expect(away.getByRole("button", { name: "Keep waiting" })).toBeVisible();
    await expect(away.getByRole("button", { name: "End the game. You win." })).toBeVisible();

    // Beside their plate, pointing at it: left of the column, level with it.
    const box = (await away.boundingBox())!;
    const plate = (await theirPlate.boundingBox())!;
    const rail = (await panel.locator(".bf-rail").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(rail.x + 1);
    expect(box.x + box.width).toBeGreaterThan(rail.x - 60);
    expect(box.y).toBeLessThan(plate.y + plate.height);
    expect(box.y + box.height).toBeGreaterThan(plate.y);
    await guest.screenshot({ path: "test-results/seen/w26-away.png" });

    // Spec 0120 (Q5, F-0120-I) -- "Peek · or hold Space" on one line: at
    // 1920x1080 and as 125% and 150% Windows scaling leave the page (CSS px).
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 },
    ]) {
      await guest.setViewportSize(size);
      await guest.waitForTimeout(300);
      const hint = (await away.locator(".gs-win-peek-hint").boundingBox())!;
      const peekButton = (await away.locator(".gs-peek-btn").boundingBox())!;
      console.log(
        `[away] ${size.width}x${size.height}: the window ${Math.round((await away.boundingBox())!.width)} px, ` +
          `the Peek hint ${Math.round(hint.height)} px high (the button ${Math.round(peekButton.height)})`,
      );
      expect(hint.height, `one line at ${size.width}x${size.height}`).toBeLessThan(
        peekButton.height + 4,
      );
    }
    await guest.setViewportSize({ width: 1920, height: 1080 });

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
