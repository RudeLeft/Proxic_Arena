// Spec 0120 (F-0120-G, Amendment 2: decision 7) -- a tab that is only hidden
// never pauses the game; a tab the browser freezes keeps its connection (the
// browser answers the pings), so it is not a drop either, and when it wakes it
// reconnects, catches up and draws the server's board. Only if the browser
// lets the connection go does the game pause, as for any drop.
//
// By hand only (PROXIC_FROZEN_PROBE=1, Windows Edge, headed): Playwright keeps
// its own pages visible, so the guest's tab under test is opened in a plain
// Edge driven over raw DevTools (frozen-tab.ts) and is the guest seat's ONLY
// game connection (the Playwright guest page that set the game up is
// closed). The host's page is Playwright's, its socket passed through so the
// test hears MATCH_PAUSED / MATCH_RESUMED as they arrive.
//
// FROZEN_HIDDEN_MS: how long the tab stays hidden first (default 90 s; the
// 10-minute run is the probe's, probe-frozen.spec.ts).

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Devtools, PlainEdge } from "./frozen-tab";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch } from "./match-helpers";
import { serverBoard } from "./slow-link";
import { drive } from "./speed-kit";

test.describe.configure({ timeout: 30 * 60_000 });
const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const HIDDEN_MS = Number(process.env["FROZEN_HIDDEN_MS"] ?? 90_000);
const FROZEN_MS = Number(process.env["FROZEN_MS"] ?? 90_000);

/** Every message type the server sent [page]'s match socket, timed. */
async function heard(page: Page) {
  const got: { at: number; type: string }[] = [];
  let url = "";
  await page.routeWebSocket("**/ws/matches/**", (ws) => {
    url = ws.url();
    const server = ws.connectToServer();
    server.onMessage((m) => {
      const text = typeof m === "string" ? m : m.toString();
      got.push({ at: Date.now(), type: /"type":"([A-Z_]+)"/.exec(text.slice(0, 120))?.[1] ?? "" });
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });
  return {
    got,
    url: () => url,
    first: (type: string, after: number) =>
      got.find((g) => g.type === type && g.at >= after) ?? null,
  };
}

test("F-0120-G: a hidden tab never pauses the game; a frozen tab comes back cleanly, pausing the game once the browser lets go", async ({
  browser,
}) => {
  test.skip(
    !process.env["PROXIC_FROZEN_PROBE"],
    "by hand only: PROXIC_FROZEN_PROBE=1, Windows Edge",
  );
  test.skip(!existsSync(pkg), "no deck package");
  const viewport = { width: 1920, height: 1080 };
  const hostContext = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const hostHeard = await heard(host);
  const log = (s: string) => console.log(`[frozen ${new Date().toISOString()}] ${s}`);
  const edge = await PlainEdge.start();
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    await drive([host, guest], 6_000);

    // The tab under test: the guest's seat in the plain Edge, then the seat's only connection.
    const [blank] = await edge.pages();
    const tab = new Devtools(blank!.webSocketDebuggerUrl);
    await tab.ready;
    await tab.send("Network.enable");
    for (const c of await guestContext.cookies("http://127.0.0.1:8080"))
      await tab.send("Network.setCookie", {
        name: c.name,
        value: c.value,
        url: "http://127.0.0.1:8080/",
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      });
    await tab.send("Page.navigate", { url: guest.url() });
    const drawnThere = () =>
      tab.evaluate<string | null>(
        "document.querySelector('.gs-screen')?.getAttribute('data-drawn') ?? null",
      );
    await expect.poll(drawnThere, { timeout: 60_000 }).not.toBeNull();
    // From here the Edge tab is the seat's only connection (the setup's own
    // page loads may have paused and resumed the game before: not counted).
    const start = Date.now();
    await guest.close();
    await host.waitForTimeout(3_000);
    expect(
      hostHeard.first("MATCH_PAUSED", 0),
      "the seat kept a connection: never paused",
    ).toBeNull();

    // 1. Hidden: behind another tab. The game goes on (the host plays), nothing pauses.
    const front = await edge.newTab("about:blank");
    await edge.activate(front.id);
    await expect.poll(() => tab.evaluate<string>("document.visibilityState")).toBe("hidden");
    while (Date.now() - start < HIDDEN_MS) await drive([host], 10_000);
    log(`hidden ${Math.round((Date.now() - start) / 1000)} s`);
    expect(hostHeard.first("MATCH_PAUSED", start), "a hidden tab never pauses the game").toBeNull();

    // 2. Frozen for FROZEN_MS. Edge fails the page's sockets at the freeze,
    // but closes the connection itself only later (RUN 2026-11-27: after 15,
    // 44 and 89 s, a normal close at the server, and once not within 3 min):
    // until then its pings are answered and the server sees the seat
    // connected. So the game pauses when Edge lets go, not at the freeze.
    await tab.send("Network.enable");
    const frozenAt = Date.now();
    await tab.send("Page.setWebLifecycleState", { state: "frozen" });
    while (Date.now() - frozenAt < FROZEN_MS) await drive([host], 10_000);
    const pausedMsg = hostHeard.first("MATCH_PAUSED", frozenAt);
    log(
      `frozen ${Math.round((Date.now() - frozenAt) / 1000)} s: ` +
        (pausedMsg
          ? `the game paused ${pausedMsg.at - frozenAt} ms after the freeze`
          : "never paused (Edge kept the connection open)"),
    );
    if (pausedMsg) await expect(host.locator('[data-paused="dropped"]')).toBeVisible();

    // 3. Woken and shown: the page reconnects with its board (resume), catches
    // up, and, if the game had paused, it goes on; the tab draws the server's board.
    const wokeAt = Date.now();
    await tab.send("Page.setWebLifecycleState", { state: "active" });
    await edge.activate(blank!.id);
    await expect
      .poll(
        () =>
          tab.events.some(
            (e) =>
              e.method === "Network.webSocketCreated" &&
              e.at >= wokeAt &&
              String(e.params["url"]).includes("/ws/matches/") &&
              String(e.params["url"]).includes("resume="),
          ),
        { timeout: 30_000, message: "the woken page reconnected, naming its board" },
      )
      .toBe(true);
    if (pausedMsg) {
      await expect
        .poll(() => hostHeard.first("MATCH_RESUMED", wokeAt) !== null, { timeout: 30_000 })
        .toBe(true);
      log(
        `woken: MATCH_RESUMED ${hostHeard.first("MATCH_RESUMED", wokeAt)!.at - wokeAt} ms after waking`,
      );
      await expect(host.locator('[data-paused="dropped"]')).toHaveCount(0);
    }
    await drive([host], 4_000);
    const server = await serverBoard(guestContext, hostHeard.url());
    await expect
      .poll(drawnThere, { timeout: 15_000, message: "the woken tab draws the server's board" })
      .toBe(`${String(server["gameEpoch"])}.${String(server["stateRevision"])}`);
    tab.close();
  } finally {
    edge.stop();
    await hostContext.close();
    await guestContext.close();
  }
});
