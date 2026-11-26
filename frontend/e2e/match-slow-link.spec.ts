// P11-D6 (spec 0119, F-0119-B; owner 2026-11-26 "Build it now") -- a slow
// page never holds up the game, and a page that stops reading is closed and
// comes back.
//
// One real game between the two local accounts, both pages played by the
// redraw measure's bot (speed-kit `drive`: lands and passes, the most messages):
//   - the host's page is on a plain connection;
//   - the guest's page is on D6's poor link (slow-link.ts `POOR_LINK`: 1
//     Mbit/s and 300 ms each way on the compressed bytes, a 64 KB link
//     buffer), with one 3 s stall in it: it must never be cut off and must
//     end on the server's board exactly;
//   - a second tab of the guest's opens on a plain link (no compression, no
//     deltas: every board whole, the most bytes) and then reads nothing for
//     50 s, asking for the whole board once a second meanwhile (as the spike
//     did). Both pages must keep getting the game throughout (before the
//     per-connection queue, 7a802a7a, a connection whose socket filled froze
//     both: RUN 28.7 s). The server closes the stuck connection: when its
//     oldest message has waited 10 s (QueueLimits), or, if its socket's
//     buffers never filled, Ktor's ping timeout (45 s after it opened). How
//     much a socket holds before the server's writes wait is the machine's:
//     on this PC (Docker Desktop) 40 s of whole boards never filled it (RUN
//     2026-11-26), so the freeze and the cut are proven on a real socket with
//     a small buffer in server StuckSocketWireTest and FellBehindWireTest.
//     When the tab reads again it finds the connection gone, reconnects
//     (today's path) and ends on the server's board exactly.
// "The server's board" is what a NEW connection is sent (slow-link.ts
// `serverBoard`): the board the server holds for that seat.

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WholeBoards, firstDifference } from "../src/delta";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, serverLog, sharedDeck, startAMatch } from "./match-helpers";
import { POOR_LINK, serverBoard, slowLink, type LinkOptions } from "./slow-link";
import { drive } from "./speed-kit";

test.describe.configure({ timeout: 900_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");

type Board = Record<string, unknown>;
type Socket = { url: string; whole: WholeBoards; at: number[]; boards: number };

/** What the game itself says after an answer (the worker's pump), not the socket's own receipt. */
const GAME_SAYS =
  /"type":"(MATCH_SNAPSHOT|MATCH_DELTA|MATCH_STEP|MATCH_ASKING|DECISION_REQUEST|DECISION_CLEARED)"/;

/** The host's answers and the game's messages, by time: the freeze, measured without the bot's pace. */
type Answers = { answered: number[]; game: number[]; refused: number[] };

/** Every match socket a (not routed) page opens: when each message came, and its boards rebuilt. */
function sockets(page: Page, answers?: Answers) {
  const opened: Socket[] = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/ws/matches/")) return;
    const s: Socket = { url: ws.url(), whole: new WholeBoards(), at: [], boards: 0 };
    opened.push(s);
    ws.on("framesent", (event) => {
      if (String(event.payload).includes('"DECISION_RESPONSE"')) answers?.answered.push(Date.now());
    });
    ws.on("framereceived", (event) => {
      const text = String(event.payload);
      s.at.push(Date.now());
      if (GAME_SAYS.test(text.slice(0, 80))) answers?.game.push(Date.now());
      if (text.slice(0, 80).includes('"DECISION_REFUSED"')) answers?.refused.push(Date.now());
      const head = text.slice(0, 80);
      if (!head.includes('"MATCH_SNAPSHOT"') && !head.includes('"MATCH_DELTA"')) return;
      s.whole.take(text);
      s.boards += 1;
    });
  });
  return opened;
}

/** The longest time between two messages on [socket] within [from, to] (the edges count). */
function longestGap(socket: Socket, from: number, to: number): number {
  const times = [from, ...socket.at.filter((t) => t > from && t < to), to];
  let longest = 0;
  for (let i = 1; i < times.length; i += 1) longest = Math.max(longest, times[i]! - times[i - 1]!);
  return longest;
}

/**
 * The longest the game took to say anything after one of the host's answers
 * in [from, to]: the spike's "the host's answer -> its next message" (median
 * 1 ms, p95 3-8 ms; 28.7 s during the freeze). The bot's own pace is not in it.
 */
function slowestReply(answers: Answers, from: number, to: number): number {
  let slowest = 0;
  for (const t of answers.answered.filter((a) => a > from && a < to)) {
    const next = answers.game.find((g) => g >= t) ?? to;
    // A refused answer (a stale click) moves nothing: the game has nothing to say.
    if (answers.refused.some((r) => r >= t && r <= next)) continue;
    slowest = Math.max(slowest, next - t);
  }
  return slowest;
}

const quietFor = (all: Socket[][]) =>
  Date.now() - Math.max(0, ...all.flat().map((s) => s.at[s.at.length - 1] ?? 0));

/** A page's last board equals the server's for its seat (the play log aside: a new connection's carries all of it). */
function sameAsServer(name: string, page: Board | null, server: Board) {
  expect.soft(page, `${name}: the page has a board`).not.toBeNull();
  if (!page) return;
  expect
    .soft(page["stateRevision"], `${name}: the same revision as the server`)
    .toBe(server["stateRevision"]);
  const strip = (b: Board) => ({ ...b, playLog: undefined });
  expect
    .soft(
      firstDifference(strip(page), strip(server)),
      `${name}: the page's board is the server's, exactly`,
    )
    .toBeNull();
}

/** Lines of the server's log written after [from] characters (null without the container). */
const logSince = (from: number) => serverLog()?.slice(from) ?? null;

test("a slow link and a page that stops reading hold up nobody", async ({ browser }) => {
  test.skip(!existsSync(pkg), "no deck package");
  const viewport = { width: 1920, height: 1080 };
  const hostContext = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const hostAnswers: Answers = { answered: [], game: [], refused: [] };
  const hostSockets = sockets(host, hostAnswers);
  // The link is plain until the game runs, then poor (the links read their
  // options as they go): the pregame helper re-clicks a question the poor
  // link has not yet taken away, and waits on it for ever.
  const guestLink: LinkOptions = {};
  const guestLinks = await slowLink(guest, guestLink);
  // A routed socket that never connects to the server raises no page`
  // `websocket` events: the links record what they hand the page.
  const guestSockets: Socket[] = guestLinks;
  const logStart = serverLog()?.length ?? 0;
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    Object.assign(guestLink, POOR_LINK);

    // The poor link, with a 3 s stall in it.
    await drive([host, guest], 35_000);
    const link = guestLinks[guestLinks.length - 1]!;
    link.stall();
    await drive([host, guest], 3_000);
    link.resume();
    await drive([host, guest], 7_000);

    // The second tab, which then stops reading.
    const tab = await guestContext.newPage();
    const tabLinks = await slowLink(tab, { plain: true });
    const tabSockets: Socket[] = tabLinks;
    await tab.goto(guest.url());
    await expect.poll(() => tabSockets[0]?.boards ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
    const stuck = tabLinks[0]!;
    const stuckAt = Date.now();
    stuck.stall(true);
    await drive([host, guest], 50_000);
    const stallEnd = Date.now();

    const hostLive = hostSockets[hostSockets.length - 1]!;
    const guestLive = guestSockets[guestSockets.length - 1]!;
    const gaps = {
      host: longestGap(hostLive, stuckAt, stallEnd),
      guest: longestGap(guestLive, stuckAt, stallEnd),
    };
    const moved = hostLive.at.filter((t) => t > stuckAt && t < stallEnd).length;
    const reply = slowestReply(hostAnswers, stuckAt, stallEnd);
    const answered = hostAnswers.answered.filter((t) => t > stuckAt && t < stallEnd).length;
    const log = logSince(logStart);
    const behind = log
      ? [
          ...log.matchAll(
            /connection (\S+) fell behind \((\d+) waiting, the oldest for (\d+) ms\)/g,
          ),
        ]
      : [];
    console.log(
      `[slow-link] while the tab read nothing (50 s): longest gap host ${gaps.host} ms, guest ${gaps.guest} ms; ` +
        `the host answered ${answered} times, the slowest reply ${reply} ms; ` +
        `host messages ${moved}; stuck link read ${stuck.wireBytes} bytes, ` +
        `server gone ${stuck.writeFailedAt ? stuck.writeFailedAt - stuckAt : "?"} ms after the stall; ` +
        `fell behind: ${behind.map((m) => `${m[1]} (${m[2]} waiting, ${m[3]} ms)`).join(", ") || (log === null ? "(no log)" : "none")}`,
    );
    // THE FREEZE: before the queue, the game said nothing to anyone for ~28 s.
    // The gaps above include the bot's own pace (a question waits on a page),
    // so the check is the game's reply to each of the host's answers.
    expect.soft(answered, "the host answered meanwhile").toBeGreaterThan(5);
    expect.soft(reply, "the game answered the host at once, every time").toBeLessThan(3_000);
    expect.soft(moved, "and the game moved meanwhile").toBeGreaterThan(20);
    if (log !== null) {
      // The tab's at most (the poor link is checked below: one connection all game).
      expect.soft(behind.length, "no connection but the tab's fell behind").toBeLessThanOrEqual(1);
    }

    // The tab reads again: what it held, then the news the connection is gone; it reconnects.
    stuck.resume();
    await expect
      .poll(() => (tabSockets.length >= 2 ? tabSockets[tabSockets.length - 1]!.boards : 0), {
        timeout: 60_000,
        message: "the tab reconnected and was sent the board",
      })
      .toBeGreaterThan(0);
    // Closed by the server: 4002 "behind" when that close could be written, 1011
    // from Ktor's ping timeout, or no close frame at all (the session ended).
    expect.soft([null, 4002, 1011], `closed ${stuck.closeCode}`).toContain(stuck.closeCode);
    console.log(
      `[slow-link] the stuck tab's connection closed: ${stuck.closeCode ?? "no close frame"}`,
    );
    await drive([host, guest], 8_000);

    // The game stands still (nobody answers): every page ends on the server's board.
    await expect
      .poll(() => quietFor([hostSockets, guestSockets, tabSockets]) > 7_000, {
        timeout: 120_000,
        intervals: [250],
      })
      .toBe(true);
    const hostServer = await serverBoard(hostContext, hostLive.url);
    const guestServer = await serverBoard(guestContext, guestLive.url);
    sameAsServer("host", hostLive.whole.last, hostServer);
    sameAsServer(
      "guest, on the poor link",
      guestSockets[guestSockets.length - 1]!.whole.last,
      guestServer,
    );
    sameAsServer(
      "guest's tab, reconnected",
      tabSockets[tabSockets.length - 1]!.whole.last,
      guestServer,
    );
    expect
      .soft(guestSockets.length, "the poor link was never cut off: one connection all game")
      .toBe(1);
    expect.soft(guestLinks.length).toBe(1);
    console.log(
      `[slow-link] poor link: ${link.wireBytes} bytes on the wire (compressed ${link.compressed}), ` +
        `${link.toPage} messages, longest held in the link ${link.longestHeldMs} ms`,
    );
    await tab.close();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
  // Each connection's queue, as the server logged it when the connection closed.
  if (serverLog() !== null) {
    await expect
      .poll(() => (logSince(logStart)?.match(/ queue: most waiting/g) ?? []).length, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(4);
    const queues = [...(logSince(logStart) ?? "").matchAll(/connection (\S+) queue: (.*)$/gm)].map(
      (m) => `${m[1]}: ${m[2]}`,
    );
    console.log(`[slow-link] queues: ${queues.join(" | ")}`);
  }
});
