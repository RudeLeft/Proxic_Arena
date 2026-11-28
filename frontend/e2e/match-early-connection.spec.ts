// Spec 0122 (P11-E12; F-0122-D, F-0122-E, F-0122-F, TEST-012) -- the game's
// connection starts early, beside "who am I", in a real game on the local
// stack.
//
// One game of the green deck between the two local accounts, both pages
// played by the redraw measure's bot (speed-kit `drive`), and a third account
// watching.
//
// 1. Into the game by the early connection (F-0122-E, F-0122-D):
//    - the host reloads /game: the page's first game connection is
//      `/ws/matches/current`, the page says it took it (the `pa-game-early`
//      mark, HID-004: the run shows the path was used), and the table draws;
//      play goes on over it, with deltas (P11-R4's browser gate watches
//      every page: no DELTA_MISMATCH, no MATCH_RESYNC);
//    - the guest opens the game in a second tab: the same, and closing that
//      tab is no drop (the first tab still holds the seat);
//    - the spectator reloads /watch/<room>: `/ws/matches/watch/<room>`, the
//      mark, the public table.
// 2. No false pause on a slow cold load (F-0122-F): the guest opens the game
//    in a NEW profile over the relay's slow-4G, then its poor link, with the
//    page's code held 8 s and 12 s (`holdCode`: past the server's 5 s pong
//    wait, so only the browser answers its pings meanwhile); once that early
//    connection has its hello the guest's old page closes, so the early one
//    is the seat's only connection while the code comes. The host plays on
//    and is never sent MATCH_PAUSED. Then the guest leaves a cold page before
//    its table draws: the host is told MATCH_PAUSED within a second (today's
//    drop), and the guest comes back.
// 3. The game ends while the page loads (F-0122-E): the guest's page is held
//    with the game's answer from just before the end while the game is
//    abandoned; its early connection is closed 4003 "no game", the page opens
//    its own at once (no reconnect wait), and ends on the game's end or the
//    lobby with no error notice.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { extraPlayers, secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, csrfOf, sharedDeck, startAMatch, watchDeltas } from "./match-helpers";
import { drive } from "./speed-kit";
import { LINKS, relay, type Relay } from "../tools/measure/link";

test.describe.configure({ timeout: 600_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const TARGET = new URL(process.env.PROXIC_E2E_URL ?? "http://127.0.0.1:8080");
const viewport = { width: 1920, height: 1080 };

type Sock = { url: string; made: number; heard: number | null; closed: number | null };

/** Every game connection [page] makes: its address, when made, first heard and closed. */
function gameSockets(page: Page): Sock[] {
  const all: Sock[] = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/ws/matches/")) return;
    const s: Sock = {
      url: new URL(ws.url()).pathname,
      made: Date.now(),
      heard: null,
      closed: null,
    };
    all.push(s);
    ws.on("framereceived", () => (s.heard ??= Date.now()));
    ws.on("close", () => (s.closed = Date.now()));
  });
  return all;
}

/** When [page] was told the game paused, every time. */
function pausesHeard(page: Page): number[] {
  const at: number[] = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/ws/matches/")) return;
    ws.on("framereceived", (event) => {
      if (String(event.payload).slice(0, 80).includes('"MATCH_PAUSED"')) at.push(Date.now());
    });
  });
  return at;
}

/** The page says its game came by the early connection (early.ts EARLY_GAME_MARK). */
const tookEarly = (page: Page) =>
  page.evaluate(() => performance.getEntriesByName("pa-game-early").length).catch(() => -1);

const table = (page: Page) => page.locator(".gs-life-n").first();

/** No connection trouble said on [page]. */
async function noTrouble(page: Page) {
  await expect(page.getByText("You're no longer connected to the game")).toHaveCount(0);
  await expect(page.getByText("Reconnecting to the game…")).toHaveCount(0);
}

/**
 * The page's code (every script but the entry, which holds early.ts) held
 * [ms] before it is let through: the code arriving seconds after the early
 * connection opened, past the server's 5 s pong wait, whatever the link.
 */
async function holdCode(page: Page, entry: string, ms: number) {
  await page.route("**/assets/*.js", async (route) => {
    if (!route.request().url().endsWith(entry)) await new Promise((ok) => setTimeout(ok, ms));
    await route.continue().catch(() => undefined);
  });
}

async function overLink(name: string): Promise<{ base: string; relay: Relay }> {
  const r = await relay(LINKS[name]!, { host: TARGET.hostname, port: Number(TARGET.port || 80) });
  return { base: `http://${TARGET.hostname}:${r.port}`, relay: r };
}

/** A new profile of [from]'s session (nothing cached) at [base]. */
async function coldProfile(browser: Browser, from: Page, base: string) {
  const ctx = await browser.newContext({
    viewport,
    baseURL: base,
    storageState: await from.context().storageState(),
  });
  return ctx;
}

test("into the game by the early connection: reload, a second tab, spectate; no false pause on a slow cold load; the end while loading", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no deck package");
  const hostContext = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const viewerContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  let guest = await guestContext.newPage();
  const viewer = await viewerContext.newPage();
  const extra: { close(): Promise<void> }[] = [];
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const watcher = extraPlayers[0]!;
    await signInAs(viewer, watcher.username, watcher.password);
    await clearEverything(viewer);
    watchDeltas(viewer, "spectator");
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    await drive([host, guest], 6_000);
    const roomId = (
      (await (await host.request.get("/api/rooms/current")).json()) as { room: { roomId: string } }
    ).room.roomId;
    const matchId = (
      (await (await host.request.get("/api/matches/current")).json()) as {
        match: { matchId: string };
      }
    ).match.matchId;

    // 1a. The host reloads. Every MATCH_PAUSED the host's page is told from
    // here on is kept (its connection after the reload included).
    const hostSockets = gameSockets(host);
    const hostPauses = pausesHeard(host);
    await host.reload();
    await expect(table(host)).toBeVisible({ timeout: 30_000 });
    expect(hostSockets[0]?.url, "the reload's first game connection").toBe("/ws/matches/current");
    expect(await tookEarly(host), "the page took the early connection").toBe(1);
    expect(hostSockets, "no second game connection").toHaveLength(1);
    const deltasBefore = watchDeltas(host).deltas;
    await drive([host, guest], 6_000);
    expect(watchDeltas(host).deltas, "play went on over it, as deltas").toBeGreaterThan(
      deltasBefore,
    );
    await noTrouble(host);

    // 1b. A second tab of the guest's, then closed: no drop.
    const tab = await guestContext.newPage();
    const tabSockets = gameSockets(tab);
    await tab.goto("/game");
    await expect(table(tab)).toBeVisible({ timeout: 30_000 });
    expect(tabSockets[0]?.url).toBe("/ws/matches/current");
    expect(await tookEarly(tab)).toBe(1);
    await drive([host, guest], 3_000);
    const tabClosed = Date.now();
    await tab.close();
    await drive([host, guest], 3_000);
    expect(
      hostPauses.filter((t) => t >= tabClosed),
      "a second tab closed is no drop",
    ).toEqual([]);

    // 1c. The spectator reloads.
    await viewer.goto(`/watch/${roomId}`);
    await expect(table(viewer)).toBeVisible({ timeout: 30_000 });
    const viewerSockets = gameSockets(viewer);
    await viewer.reload();
    await expect(table(viewer)).toBeVisible({ timeout: 30_000 });
    expect(viewerSockets[0]?.url).toBe(`/ws/matches/watch/${roomId}`);
    expect(await tookEarly(viewer)).toBe(1);
    await expect(viewer.getByTestId("spectating-chip")).toBeVisible();
    await noTrouble(viewer);

    // 2. A slow cold load, the early connection the seat's only one while the code comes.
    const entry = /<script type="module"[^>]* src="([^"]+)"/.exec(
      await (await host.request.get("/")).text(),
    )![1]!;
    for (const [name, held] of [
      ["slow4g", 8_000],
      ["poor", 12_000],
    ] as const) {
      const { base, relay: r } = await overLink(name);
      extra.push(r);
      const ctx = await coldProfile(browser, guest, base);
      extra.push(ctx);
      const cold = await ctx.newPage();
      const coldSockets = gameSockets(cold);
      await holdCode(cold, entry, held);
      const loading = cold.goto("/game", { timeout: 120_000 });
      await expect
        .poll(() => coldSockets[0]?.heard ?? null, { timeout: 30_000, message: "the early hello" })
        .not.toBeNull();
      expect(coldSockets[0]!.url).toBe("/ws/matches/current");
      const alone = Date.now();
      await guest.close();
      const codeIn = await Promise.race([
        (async () => {
          await loading;
          await expect(table(cold)).toBeVisible({ timeout: 120_000 });
          return Date.now() - alone;
        })(),
        drive([host], 120_000).then(() => -1),
      ]);
      // Play on a while after the table too.
      await drive([host], 4_000);
      console.log(
        `[early] ${name} cold: the table ${codeIn} ms after the early connection was the seat's only one; ` +
          `first board on the page at ${coldSockets[0]!.heard! - coldSockets[0]!.made} ms after it was made`,
      );
      expect(codeIn, "the table drew").toBeGreaterThan(0);
      expect(codeIn, "the code came after the server's pong wait").toBeGreaterThan(5_000);
      expect(
        hostPauses.filter((t) => t >= alone),
        `${name}: the host was never told the game paused`,
      ).toEqual([]);
      expect(await tookEarly(cold)).toBe(1);
      expect(coldSockets).toHaveLength(1);
      guest = cold;
    }
    // The guest leaves a cold page before its table draws: today's drop.
    {
      const { base, relay: r } = await overLink("poor");
      extra.push(r);
      const ctx = await coldProfile(browser, guest, base);
      extra.push(ctx);
      const cold = await ctx.newPage();
      const coldSockets = gameSockets(cold);
      await holdCode(cold, entry, 60_000);
      void cold.goto("/game", { timeout: 120_000 }).catch(() => undefined);
      await expect.poll(() => coldSockets[0]?.heard ?? null, { timeout: 30_000 }).not.toBeNull();
      const alone = Date.now();
      await guest.close();
      await host.waitForTimeout(3_000);
      expect(await table(cold).isVisible(), "left before its table drew").toBe(false);
      expect(
        hostPauses.filter((t) => t >= alone),
        "no drop while the early connection held the seat",
      ).toEqual([]);
      const leftAt = Date.now();
      await cold.close();
      await expect
        .poll(() => hostPauses.find((t) => t >= leftAt) ?? null, { timeout: 5_000 })
        .not.toBeNull();
      const pausedIn = hostPauses.find((t) => t >= leftAt)! - leftAt;
      console.log(
        `[early] left before the table: MATCH_PAUSED reached the host ${pausedIn} ms later`,
      );
      expect(pausedIn).toBeLessThan(1_500);
      // Back, on a plain link.
      guest = await guestContext.newPage();
      await guest.goto("/game");
      await expect(table(guest)).toBeVisible({ timeout: 30_000 });
      await drive([host, guest], 3_000);
    }

    // 3. The game ends while the guest's page loads.
    {
      const stale = (await (await guest.request.get("/api/matches/current")).json()) as unknown;
      const page = await guestContext.newPage();
      const sockets = gameSockets(page);
      let release: () => void = () => undefined;
      const released = new Promise<void>((ok) => (release = ok));
      let earlyClosed: number | null = null;
      let routed = false;
      // The page's first read only (primed beside "who am I"): from just before the end.
      await page.route(
        "**/api/matches/current",
        async (route) => {
          await released;
          await route.fulfill({ json: stale });
        },
        { times: 1 },
      );
      await page.routeWebSocket("**/ws/matches/current*", async (ws) => {
        routed = true;
        await released;
        const server = ws.connectToServer();
        server.onMessage((m) => ws.send(m));
        ws.onMessage((m) => server.send(m));
        server.onClose((code, reason) => {
          // Passed on once the game screen has surely taken it (its code is
          // cached here and the held answer went at the release): the 4003
          // reaches a connection already handed over, as on a slow link.
          setTimeout(() => {
            earlyClosed = Date.now();
            void ws.close({
              ...(code === undefined ? {} : { code }),
              ...(reason === undefined ? {} : { reason }),
            });
          }, 1_500);
        });
      });
      await guest.close();
      void page.goto("/game").catch(() => undefined);
      await expect.poll(() => routed, { timeout: 30_000 }).toBe(true);
      const abandoned = await host.request.post(`/api/matches/${matchId}/abandon`, {
        headers: { "X-CSRF-Token": await csrfOf(host) },
      });
      expect(abandoned.ok()).toBe(true);
      release();
      await expect.poll(() => earlyClosed, { timeout: 15_000, message: "4003" }).not.toBeNull();
      await expect
        .poll(() => sockets.filter((x) => x.url !== "/ws/matches/current").length, {
          timeout: 15_000,
        })
        .toBeGreaterThan(0);
      const own = sockets.find((x) => x.url !== "/ws/matches/current")!;
      expect(own.url).toBe(`/ws/matches/${matchId}`);
      const fallbackMs = own.made - earlyClosed!;
      console.log(
        `[early] ended while loading: the page's own connection ${fallbackMs} ms after the 4003`,
      );
      // At once, not after a reconnect's wait (MATCH_RECONNECT_DELAYS starts at 500 ms).
      expect(fallbackMs).toBeLessThan(450);
      await expect
        .poll(
          async () =>
            new URL(page.url()).pathname === "/play" ||
            (await page.getByText(/Back to the room|Back to the lobby/).count()) > 0,
          { timeout: 30_000, message: "the game's end, or the lobby" },
        )
        .toBe(true);
      await noTrouble(page);
      extra.push(page);
    }
  } finally {
    await Promise.race([
      clearEverything(host).catch(() => undefined),
      new Promise((r) => setTimeout(r, 30_000)),
    ]);
    for (const x of extra.reverse()) await x.close().catch(() => undefined);
    await hostContext.close();
    await guestContext.close();
    await viewerContext.close();
  }
});
