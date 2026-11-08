// Spec 0050 — one look for every notice (F-0050-C, D, F, G, J).
//
// Invitations, requests and their endings through two real players are in
// lobby.spec. These prove the stack itself: news fades after 8 s and waits
// while it is pointed at; more than three wait as "+N more"; and in a game
// the game's own messages sit top right of the table with clicks going
// through them, and a dropped connection is the blue card. The news here
// is the server's own message, said again by the test (routeWebSocket),
// so no other player is needed to decline anything.

import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { join } from "node:path";
import { noticeCard, secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch } from "./match-helpers";

/** The lobby socket, with a way to say things to the page as the server. */
async function lobbySocket(page: Page): Promise<() => WebSocketRoute | null> {
  let client: WebSocketRoute | null = null;
  await page.routeWebSocket("**/ws/user", (ws) => {
    client = ws;
    const server = ws.connectToServer();
    server.onMessage((message) => ws.send(message));
    ws.onMessage((message) => server.send(message));
  });
  return () => client;
}

function declined(name: string): string {
  return JSON.stringify({
    type: "INVITATION_ENDED",
    reason: "DECLINED",
    direction: "FROM_YOU",
    other: { userId: `id-${name}`, displayName: name },
  });
}

test("news fades after 8 s, waits while pointed at, and more than three wait as +N more", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const socket = await lobbySocket(page);
  await signIn(page);
  // By the link, not a reload: the socket the test holds stays the page's.
  await page.getByRole("link", { name: "Deck Depot" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
  await expect.poll(() => socket() !== null).toBe(true);
  const stack = page.getByRole("region", { name: "Notices" });

  // Four at once: the newest three, then "+1 more".
  for (const name of ["Ash", "Bea", "Cal", "Dee"]) socket()!.send(declined(name));
  await expect(stack.locator("[data-notice]")).toHaveCount(3);
  await expect(stack.locator("[data-notice]").first()).toContainText(
    "Dee declined your invitation",
  );
  await expect(stack.getByText("+1 more")).toBeVisible();
  await page.waitForTimeout(400); // past the slide-in
  await page.screenshot({ path: "test-results/seen/notices-stack.png" });

  // Closing the top one brings the waiting one up.
  await noticeCard(page, "Dee declined")
    .getByRole("button", { name: /^Close:/ })
    .click();
  await expect(noticeCard(page, "Ash declined")).toBeVisible();
  await expect(stack.getByText(/more$/)).toHaveCount(0);

  // Pointed at, nothing fades.
  await stack.hover();
  await page.waitForTimeout(9_000);
  await expect(stack.locator("[data-notice]")).toHaveCount(3);

  // Let go: gone within the 8 s (less what had already run).
  await page.mouse.move(10, 600);
  await expect(stack.locator("[data-notice]")).toHaveCount(0, { timeout: 10_000 });
});

test("in a game, the game's messages sit top right of the table and clicks go through them; a dropped connection is the blue card", async ({
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

  // The guest's game socket: its last snapshot, and a way to drop it.
  let client: WebSocketRoute | null = null;
  let last = "";
  let dropped = false;
  await guest.routeWebSocket("**/ws/matches/**", (ws) => {
    if (dropped) {
      void ws.close({ code: 1011 });
      return;
    }
    client = ws;
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.includes('"MATCH_SNAPSHOT"')) last = message;
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });

  try {
    const deck = await sharedDeck(
      host,
      guest,
      join(process.cwd(), "..", "Test Deck", "ci-deck.zip"),
    );
    await startAMatch(host, guest, deck);
    await expect.poll(() => last !== "").toBe(true);

    // What the game says, as it says it: on the snapshot's notices.
    // Spec 0061: with one more told in all, as the game counts them.
    const said = JSON.parse(last) as { state: { notices?: string[]; noticesTotal?: number } };
    said.state.notices = [...(said.state.notices ?? []), "RudeLeft flipped a coin: heads."];
    said.state.noticesTotal = (said.state.noticesTotal ?? 0) + 1;
    (client as WebSocketRoute | null)?.send(JSON.stringify(said));

    const message = noticeCard(guest, "RudeLeft flipped a coin: heads");
    await expect(message).toBeVisible();
    // Top right of the table: left of the right-hand column, near the top.
    const box = (await message.boundingBox())!;
    const rail = (await guest.locator(".bf-rail").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(rail.x);
    expect(box.y).toBeLessThan(120);
    // Clicks go through: what is under its middle is not the card.
    const under = await guest.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-notice]") !== null,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(under, "the message takes no clicks").toBe(false);
    await guest.waitForTimeout(400); // past the slide-in
    await guest.screenshot({ path: "test-results/seen/notices-game-message.png" });

    // A dropped connection: the blue card, gone once it is back.
    dropped = true;
    await (client as WebSocketRoute | null)?.close({ code: 1011 });
    const reconnecting = noticeCard(guest, "Reconnecting to the game");
    await expect(reconnecting).toBeVisible();
    await guest.screenshot({ path: "test-results/seen/notices-game-reconnecting.png" });
    dropped = false;
    await expect(reconnecting).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await clearEverything(host).catch(() => {});
    await clearEverything(guest).catch(() => {});
    await hostContext.close();
    await guestContext.close();
  }
});
