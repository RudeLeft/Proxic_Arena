// Spec 0120 (F-0120-F, F-0120-J, TEST-012) -- the game pauses while a
// player's connection is down, in a real game on the local stack.
//
// One game of the green deck between the two local accounts, both pages
// played by the redraw measure's bot (speed-kit `drive`), and a third account
// watching. The guest's match socket goes through the test's relay
// (slow-link.ts): `stall()` reads nothing and answers no ping, as a line that
// died silently does (a browser's own offline switch does not reach a page's
// open WebSocket: spec 0119).
//
//  1. A silent drop: the server's 2 s pings go unanswered and it closes the
//     guest's connection when one has had no pong for 5 s: the host is told
//     MATCH_PAUSED 5-7 s after the line died (measured), and 1.5 s later shows the look: the dim,
//     "Connection dropped / <guest> · game paused · 0:0N", the plate's
//     "Dropped", the window. While paused no move is made by anybody: the
//     host's bot tries (real clicks), and a raw answer sent on the host's
//     socket is refused with PAUSED. The spectator sees the words and the
//     sign only. The host clicks the act button (it nudges; nothing goes)
//     and OK on the window (it closes; the dim stays).
//  2. The guest's line comes back: the page reconnects with `resume`, catches
//     up, says CAUGHT_UP; the host sees "<guest> is back / Catching up ·
//     paused", then, 2 s steady later, MATCH_RESUMED and "The game goes on"
//     for 1 s; a real click on it only ends the look. Play goes on; both
//     pages end on the server's board exactly.
//  3. A clean close (the guest's tab closed): MATCH_PAUSED within a second;
//     the guest opens the game again and play goes on.
// Screenshots (MATCH_PAUSE_SHOTS=<folder>, by hand): each look at 1920x1080.

import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { firstDifference } from "../src/delta";
import { extraPlayers, secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch } from "./match-helpers";
import { serverBoard, slowLink, type Link, type LinkOptions } from "./slow-link";
import { drive } from "./speed-kit";

// CI run 46026863141: the run hung here until the machine's 25-minute limit
// (no step had its own limit). Every wait below has one, the test as a whole
// six minutes, and the game is always ended (finally) so a paused game never
// waits for the next spec's players.
test.describe.configure({ timeout: 360_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const SHOTS = process.env["MATCH_PAUSE_SHOTS"] ?? null;

type Board = Record<string, unknown>;

/** The host's match socket, passed through, every message the server sent it timed; and a way to speak on it. */
async function tapped(page: Page) {
  const tap = {
    heard: [] as { at: number; type: string; m: Record<string, unknown> }[],
    route: null as WebSocketRoute | null,
    server: null as ReturnType<WebSocketRoute["connectToServer"]> | null,
    say(text: string) {
      tap.server?.send(text);
    },
    first(type: string, after = 0) {
      return tap.heard.find((h) => h.type === type && h.at >= after) ?? null;
    },
    lastQuestion() {
      return [...tap.heard].reverse().find((h) => h.type === "DECISION_REQUEST")?.m ?? null;
    },
  };
  await page.routeWebSocket("**/ws/matches/**", (ws) => {
    const server = ws.connectToServer();
    tap.route = ws;
    tap.server = server;
    server.onMessage((m) => {
      const text = typeof m === "string" ? m : m.toString();
      const type = /"type":"([A-Z_]+)"/.exec(text.slice(0, 120))?.[1] ?? "";
      if (type && type !== "MATCH_DELTA" && type !== "MATCH_SNAPSHOT")
        tap.heard.push({ at: Date.now(), type, m: JSON.parse(text) as Record<string, unknown> });
      else tap.heard.push({ at: Date.now(), type, m: {} });
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });
  return tap;
}

/** The board the page draws now ("epoch.revision"), or null. */
const drawn = (page: Page) =>
  page
    .locator(".gs-screen")
    .getAttribute("data-drawn", { timeout: 2_000 })
    .catch(() => null);
const revisionOf = (board: Board | null) =>
  board ? `${String(board["gameEpoch"])}.${String(board["stateRevision"])}` : null;

/** Wait until it is [seat]'s turn on [link]'s boards. */
async function turnOf(pages: Page[], link: () => Link, seat: number) {
  await expect
    .poll(
      async () => {
        const b = link().whole.last;
        if (b && b["activeSeat"] === seat && String(b["phase"]).startsWith("MAIN")) return true;
        await drive(pages, 300);
        return false;
      },
      { timeout: 240_000, intervals: [100] },
    )
    .toBe(true);
}

/** The guest's page draws the newest board it was sent, and that is the server's. */
async function exact(name: string, page: Page, link: Link) {
  await expect
    .poll(async () => (await drawn(page)) === revisionOf(link.whole.last), {
      timeout: 15_000,
      message: `${name}: the page draws the newest board it was sent`,
    })
    .toBe(true);
  const server = await serverBoard(page.context(), link.url);
  const mine = link.whole.last!;
  const strip = (b: Board) => ({ ...b, playLog: undefined });
  expect
    .soft(mine["stateRevision"], `${name}: the server's revision`)
    .toBe(server["stateRevision"]);
  expect
    .soft(firstDifference(strip(mine), strip(server)), `${name}: the server's board`)
    .toBeNull();
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name) });
}

test("a dropped connection pauses the game for everyone; the player comes back, catches up, and play goes on", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no deck package");
  const viewport = { width: 1920, height: 1080 };
  const hostContext = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const viewerContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const viewer = await viewerContext.newPage();
  const hostTap = await tapped(host);
  const line: LinkOptions = {};
  const links = await slowLink(guest, line);
  const link = () => links[links.length - 1]!;
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const watcher = extraPlayers[0]!;
    await signInAs(viewer, watcher.username, watcher.password);
    await clearEverything(viewer);
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    await drive([host, guest], 8_000);
    await viewer.goto("/play", { timeout: 60_000 });
    await viewer
      .locator("article.pa-room-card")
      .getByRole("link", { name: /Spectate/ })
      .click({ timeout: 60_000 });
    await expect(viewer.getByTestId("spectating-chip")).toBeVisible({ timeout: 60_000 });
    const guestSeat = () => Number(link().whole.last?.["seat"] ?? 2);
    const guestName = String(
      (link().whole.last?.["players"] as { seat: number; name: string }[] | undefined)?.find(
        (p) => p.seat === guestSeat(),
      )?.name ?? secondUser,
    );

    // 1. A silent drop on the host's turn.
    await turnOf([host, guest], link, 3 - guestSeat());
    const stalledAt = Date.now();
    // The line dies: this connection hears nothing, and so does any the page opens meanwhile.
    line.down = true;
    const stalledLink = link();
    stalledLink.stall();
    await drive([host], 1_500);
    await expect
      .poll(() => hostTap.first("MATCH_PAUSED", stalledAt) !== null, {
        timeout: 15_000,
        message: "the host is told the game is paused",
      })
      .toBe(true);
    const pausedIn = hostTap.first("MATCH_PAUSED", stalledAt)!.at - stalledAt;
    console.log(
      `[pause] silent drop: MATCH_PAUSED reached the host ${pausedIn} ms after the line died`,
    );
    // At least 5 s of real silence (owner Q7 B), at most a ping's 2 s more (and a slow runner's moment).
    expect(pausedIn).toBeGreaterThan(4_500);
    expect(pausedIn).toBeLessThan(8_000);
    const paused = host.locator('[data-paused="dropped"]');
    await expect(paused).toBeVisible({ timeout: 3_000 });
    await expect(paused).toContainText("Connection dropped");
    await expect(paused).toContainText(new RegExp(`${guestName} · game paused · 0:0\\d`));
    await expect(host.locator(".gs-pause-dim")).toBeVisible();
    await expect(host.locator(".gs-seat-opponent .gs-seat-away")).toHaveText("Dropped");
    const window = host.getByRole("alertdialog", { name: `${guestName}'s connection dropped` });
    await expect(window).toContainText(`The game is paused until ${guestName} is back.`);
    // The window's footer: "Peek · or hold Space" on one line (F-0120-I).
    const hint = window.locator(".gs-win-peek-hint");
    const hintBox = (await hint.boundingBox())!;
    const peekBox = (await window.locator(".gs-peek-btn").boundingBox())!;
    expect(hintBox.height, "Peek and 'or hold Space' on one line").toBeLessThan(peekBox.height + 4);
    await shot(host, "0120-pause-host.png");
    // The spectator: the words and the sign, no dim, no window.
    await expect(viewer.locator('[data-paused="dropped"]')).toBeVisible({ timeout: 5_000 });
    await expect(viewer.locator(".gs-pause-dim")).toHaveCount(0);
    await expect(viewer.getByRole("alertdialog")).toHaveCount(0);
    await expect(viewer.locator(".gs-seat-away", { hasText: "Dropped" })).toBeVisible();
    await shot(viewer, "0120-pause-spectator.png");

    // No move by anybody: the host's bot tries for 6 s; the board stands.
    const before = hostTap.heard.filter(
      (h) => h.type === "MATCH_DELTA" || h.type === "MATCH_SNAPSHOT",
    ).length;
    await drive([host], 6_000);
    // A real click on the act button: it nudges, nothing is sent.
    await paused.click({ timeout: 10_000 });
    await expect(host.locator(".gs-paused-nudge")).toBeVisible();
    const boardsMeanwhile =
      hostTap.heard.filter((h) => h.type === "MATCH_DELTA" || h.type === "MATCH_SNAPSHOT").length -
      before;
    expect(boardsMeanwhile, "no board while paused: nobody moved").toBe(0);
    // An answer sent anyway (as a page that ignored the pause would): refused, PAUSED.
    const q = hostTap.lastQuestion();
    if (q) {
      const sentAt = Date.now();
      hostTap.say(
        JSON.stringify({ type: "DECISION_RESPONSE", decisionId: q["decisionId"], actionId: null }),
      );
      await expect
        .poll(() => hostTap.first("DECISION_REFUSED", sentAt)?.m["reason"] ?? null)
        .toBe("PAUSED");
    }
    // OK closes the window; the dim and the act button stay.
    await window.getByRole("button", { name: "OK" }).click({ timeout: 10_000 });
    await expect(window).toHaveCount(0);
    await expect(host.locator(".gs-pause-dim")).toBeVisible();
    await expect(paused).toBeVisible();

    // 2. The line comes back: reconnect with resume, catch up, 2 s steady, the game goes on.
    const backAt = Date.now();
    const linksBefore = links.length;
    line.down = false;
    stalledLink.resume();
    await expect.poll(() => links.length, { timeout: 20_000 }).toBeGreaterThan(linksBefore);
    expect.soft(link().url).toContain("resume=");
    await expect(host.locator('[data-paused="back"]')).toBeVisible({ timeout: 20_000 });
    await expect(host.locator('[data-paused="back"]')).toContainText(`${guestName} is back`);
    await expect(host.locator(".gs-seat-opponent .gs-seat-away")).toHaveText("Catching up");
    // OK was for the whole drop: the window does not come back with "back" (answer 2).
    await expect(host.getByRole("alertdialog")).toHaveCount(0);
    await shot(host, "0120-back-catching-up.png");
    await expect
      .poll(() => hostTap.first("MATCH_RESUMED", backAt) !== null, { timeout: 15_000 })
      .toBe(true);
    const goesOn = host.locator('[data-paused="goes-on"]');
    await expect(goesOn).toBeVisible({ timeout: 2_000 });
    await shot(host, "0120-back-goes-on.png");
    await goesOn.click({ timeout: 10_000 });
    await expect(goesOn).toHaveCount(0);
    await expect(host.locator(".gs-pause-dim")).toHaveCount(0);
    console.log(
      `[pause] back: MATCH_RESUMED ${hostTap.first("MATCH_RESUMED", backAt)!.at - backAt} ms after the line came back`,
    );
    const revBefore = link().whole.last?.["stateRevision"];
    await drive([host, guest], 8_000);
    expect(link().whole.last?.["stateRevision"], "play went on").not.toBe(revBefore);
    await exact("after the pause", guest, link());

    // 3. A clean close: the guest's tab closes, then opens the game again.
    const url = guest.url();
    const closedAt = Date.now();
    // As a browser closing the tab: a close frame, then the page is gone.
    link().goAway();
    await guest.close();
    await expect
      .poll(() => hostTap.first("MATCH_PAUSED", closedAt) !== null, { timeout: 5_000 })
      .toBe(true);
    const cleanIn = hostTap.first("MATCH_PAUSED", closedAt)!.at - closedAt;
    console.log(
      `[pause] clean close: MATCH_PAUSED reached the host ${cleanIn} ms after the tab closed`,
    );
    expect(cleanIn).toBeLessThan(1_000);
    const again = await guestContext.newPage();
    const links2 = await slowLink(again, {});
    const reopenedAt = Date.now();
    await again.goto(url, { timeout: 60_000 });
    await expect
      .poll(() => hostTap.first("MATCH_RESUMED", reopenedAt) !== null, { timeout: 30_000 })
      .toBe(true);
    await drive([host, again], 5_000);
    await exact("after a clean close", again, links2[links2.length - 1]!);
  } finally {
    // End the game whatever happened: a game left paused (its players gone)
    // would hold the next spec's players in it.
    await Promise.race([
      clearEverything(host).catch(() => undefined),
      new Promise((r) => setTimeout(r, 30_000)),
    ]);
    await hostContext.close();
    await guestContext.close();
    await viewerContext.close();
  }
});
