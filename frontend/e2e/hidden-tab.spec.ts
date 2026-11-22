// A hidden tab keeps its lobby connection -- PHASE_11 P11-E13.
//
// A browser slows a hidden tab's timers (Chromium: at most once a minute
// after 5 minutes hidden; Firefox and Safari by budgets of their own) or
// freezes the tab outright (Edge's sleeping tabs, Chrome's savers, Safari),
// while its connection stays open. The lobby's liveness check ran on such a
// timer and read "nothing heard for 45 s" as a lost connection, so a tab
// hidden for long dropped and reopened its connection about once a minute.
// The owner's rule (2026-11-19): a hidden or frozen tab counts as connected
// while its connection is open.
//
// A headless browser never hides or throttles a tab by itself, so the first
// test makes the page's own clock do what a hidden tab's does: Playwright's
// clock jumps a minute at a time and fires each due timer once (`fastForward`),
// as a slowed tab's are, then ten minutes in one jump, as a frozen tab wakes.
// The second holds the page's own thread for 40 s, past the server's ping
// timeout, as a frozen tab's is (a real freeze can't be had headless:
// Chromium's lifecycle "frozen" state does nothing to a visible page, and a
// headless page is always visible), and asks the other player's screen
// whether the held player stayed online. Both run in every engine (CI's
// engines job, PROXIC_E2E_ENGINES). Each brand's own savers are F2's hand
// check.

import { expect, test, type BrowserContext, type Page, type WebSocket } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";

/** Every lobby connection a page of [context] opens, and what happened to it. */
function watchLobbySockets(context: BrowserContext) {
  const opened: WebSocket[] = [];
  const said: string[] = [];
  context.on("page", (page) =>
    page.on("websocket", (ws) => {
      if (!ws.url().endsWith("/ws/user")) return;
      opened.push(ws);
      said.push(`open ${opened.length}`);
      ws.on("close", () => said.push(`closed ${opened.indexOf(ws) + 1}`));
    }),
  );
  return { opened, said };
}

const connected = (page: Page) => page.getByRole("status").filter({ hasText: "Connected" });

/** The server's PONG to the PING the page's next beat sends. */
const pong = (ws: WebSocket) =>
  ws.waitForEvent("framereceived", {
    predicate: (frame) => String(frame.payload).includes('"PONG"'),
    timeout: 10_000,
  });

test("a tab whose timers run a minute late for ten minutes, then wakes from a freeze, keeps its one lobby connection", async ({
  browser,
}) => {
  test.setTimeout(3 * 60_000);
  const context = await browser.newContext();
  const sockets = watchLobbySockets(context);
  // Before the page loads, so every timer the page sets is the test's.
  await context.clock.install();
  const page = await context.newPage();
  try {
    await signIn(page);
    await expect(connected(page)).toBeVisible();
    await expect.poll(() => sockets.opened.length).toBe(1);
    const ws = sockets.opened[0]!;

    // Ten minutes of a slowed tab: a minute passes between beats, each beat
    // fires once and says PING, and the server answers at once.
    for (let minute = 1; minute <= 10; minute++) {
      const answered = pong(ws);
      await page.clock.fastForward(60_000);
      await answered.catch(() => {
        throw new Error(`minute ${minute}: no PONG; the lobby sockets: ${sockets.said.join(", ")}`);
      });
    }
    // Then ten minutes frozen: the first beat on waking is ten minutes late.
    const woke = pong(ws);
    await page.clock.fastForward(10 * 60_000);
    await woke;
    // And the page's beats on time again, judged as before.
    for (let beat = 0; beat < 3; beat++) {
      const answered = pong(ws);
      await page.clock.fastForward(20_000);
      await answered;
    }

    expect(sockets.said, "the one connection, never closed").toEqual(["open 1"]);
    expect(ws.isClosed()).toBe(false);
    await expect(connected(page)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a page that runs no script for 40 s stays connected, and online to the other player", async ({
  browser,
}) => {
  test.setTimeout(3 * 60_000);
  const watcherContext = await browser.newContext();
  const watcher = await watcherContext.newPage();
  const frozenContext = await browser.newContext();
  const sockets = watchLobbySockets(frozenContext);
  const frozen = await frozenContext.newPage();
  try {
    await signIn(watcher);
    await signInAs(frozen, secondUser, secondPassword);
    await expect(connected(watcher)).toBeVisible();
    await expect(connected(frozen)).toBeVisible();
    const row = watcher
      .getByRole("region", { name: "Players" })
      .getByRole("listitem")
      .filter({ hasText: secondUser });
    const badge = (state: RegExp) =>
      row.getByRole("img", { name: new RegExp(`^${secondUser}, ${state.source}`, "i") });
    await expect(badge(/online/)).toBeVisible();

    // The page's own thread held for 40 s: no timer, no message, no script
    // of the page runs, as in a frozen tab, while the browser's network side
    // carries on. The server pings every 15 s and gives up after 30 s with
    // no pong (Limits.WS_PING_SECONDS, WS_TIMEOUT_SECONDS): the browser
    // answers those itself. Meanwhile the other player still sees them online.
    const held = frozen.evaluate(() => {
      const end = Date.now() + 40_000;
      while (Date.now() < end) {
        /* frozen */
      }
    });
    await watcher.waitForTimeout(36_000);
    await expect(badge(/online/)).toBeVisible({ timeout: 2_000 });
    await held;
    expect(sockets.said, "the held page's connection, still open").toEqual(["open 1"]);

    // Awake: its first beat is late, so it asks again rather than judging.
    await expect(connected(frozen)).toBeVisible();
    await frozen.waitForTimeout(6_000);
    expect(sockets.said, "awake, the same connection").toEqual(["open 1"]);
    await expect(badge(/online/)).toBeVisible();
  } finally {
    await watcherContext.close();
    await frozenContext.close();
  }
});
