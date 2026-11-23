// P11-D3 -- history sent once, in a real game, on every kind of connection.
//
// The server sends a board's history lists (payments, rolls, notices) to a
// page once: each board carries only the entries the page lacks, and `kept`
// says how many of its own to keep (protocol/README.md, `kept`). A page that
// missed an entry must never show a wrong or missing history, so this plays
// a real game with spells paid for, and then:
//   - the host reloads (a new connection),
//   - the guest's connection is cut and comes back on its own,
//   - a spectator arrives mid-game, and later reloads,
//   - the host opens a second tab.
// On each, the new connection's first board must carry every list whole (no
// `kept`), and -- the game standing still meanwhile -- its lists must equal
// the ones the page had rebuilt from the trimmed boards before. So the
// rebuilt history is the server's whole history, on every page, and the
// trimming really ran (boards with `kept` were seen, HID-004).
// The worker's lists and their hiding are unchanged (Lab traces; the hidden
// checks): what is sent is always a run of the seat's own whole list.

import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WholeBoards } from "../src/delta";
import { HISTORY_KEYS } from "../src/history";
import { extraPlayers, secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch, watchGame } from "./match-helpers";
import { step } from "./speed-kit";

test.describe.configure({ timeout: 900_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");

type Board = Record<string, unknown>;

/** Every match socket a page opens, its boards rebuilt as the page does. */
function sockets(page: Page) {
  const opened: { whole: WholeBoards; first: Board | null; frames: number }[] = [];
  let lastFrame = Date.now();
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/matches/")) return;
    const s = { whole: new WholeBoards(), first: null as Board | null, frames: 0 };
    opened.push(s);
    socket.on("framereceived", (event) => {
      const text = String(event.payload);
      lastFrame = Date.now();
      // P11-D4: a delta is a board too (rebuilt by WholeBoards); a connection's
      // first board is always a whole MATCH_SNAPSHOT.
      if (!/"MATCH_(SNAPSHOT|DELTA)"/.test(text)) return;
      s.frames += 1;
      if (!s.first) s.first = (JSON.parse(text) as { state: Board }).state ?? null;
      s.whole.take(text);
    });
  });
  return { opened, quietFor: () => Date.now() - lastFrame };
}

type Watched = ReturnType<typeof sockets>;

/** The lists a board carries, absent as empty. */
const lists = (board: Board | null) =>
  Object.fromEntries(
    HISTORY_KEYS.map((key) => [key, Array.isArray(board?.[key]) ? board[key] : []]),
  );

/**
 * The newest connection's first board against what the one before it had
 * rebuilt: whole (no `kept`), and, at the same revision, the same lists.
 */
function sameAcrossConnections(name: string, watched: Watched, from: number) {
  const before = watched.opened[from - 1]!;
  const after = watched.opened[from]!;
  expect(after.first, `${name}: the new connection brought a board`).not.toBeNull();
  expect(after.first!["kept"], `${name}: a connection's first board is whole`).toBeUndefined();
  expect(after.first!["stateRevision"], `${name}: the game stood still`).toBe(
    before.whole.last?.["stateRevision"],
  );
  expect(lists(after.first), `${name}: the rebuilt history is the server's`).toEqual(
    lists(before.whole.last),
  );
}

test("history sent once: reload, a cut connection, a spectator and a second tab see it whole", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg) || extraPlayers.length === 0, "no deck package or no third account");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const hostContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await (await browser.newContext({ viewport })).newPage();
  const viewerContext = await browser.newContext({ viewport });
  const viewer = await viewerContext.newPage();
  const hostSockets = sockets(host);
  const guestSockets = sockets(guest);
  const viewerSockets = sockets(viewer);
  // The guest's connection, to cut it as a dropped link would (the page then
  // reconnects on its own, after half a second).
  let cut: (() => void) | null = null;
  await guest.routeWebSocket("**/ws/matches/**", (ws: WebSocketRoute) => {
    const server = ws.connectToServer();
    server.onMessage((m) => ws.send(m));
    ws.onMessage((m) => server.send(m));
    cut = () => {
      void server.close();
      void ws.close({ code: 1011, reason: "cut by the test" });
    };
  });
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  await signInAs(viewer, extraPlayers[0]!.username, extraPlayers[0]!.password);
  await clearEverything(viewer);

  const game = watchGame([host, guest]);
  /** Both players play on (lands and creatures, paid for), for a while. */
  const playOn = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await game.check();
      for (const p of [host, guest]) await step(p, true);
      await host.waitForTimeout(150);
    }
  };
  /**
   * Nothing new on any socket for 7 s (longer than a spell's rest on the
   * stack, spec 0105): the game is waiting on a player, so a new connection
   * is sent the board the old one had last.
   */
  const still = async () => {
    await expect
      .poll(
        () =>
          Math.min(hostSockets.quietFor(), guestSockets.quietFor(), viewerSockets.quietFor()) >
          7_000,
        { timeout: 90_000, intervals: [250] },
      )
      .toBe(true);
  };
  const reopened = async (watched: Watched, count: number) =>
    expect
      .poll(() => watched.opened.length >= count && watched.opened[count - 1]!.first !== null, {
        timeout: 60_000,
      })
      .toBe(true);
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    // Play until the host's page has been sent payments it keeps.
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline && (hostSockets.opened[0]?.whole.trimmed["payments"] ?? 0) < 5) {
      await playOn(3_000);
    }
    expect(
      hostSockets.opened[0]!.whole.trimmed["payments"] ?? 0,
      "the host was sent boards that keep its payments",
    ).toBeGreaterThanOrEqual(5);

    // A spectator arrives mid-game: the public view's first board is whole.
    const room = (await (await host.request.get("/api/rooms/current")).json()) as {
      room?: { roomId?: string } | null;
    };
    await viewer.goto(`/watch/${room.room!.roomId!}`);
    await reopened(viewerSockets, 1);
    expect(viewerSockets.opened[0]!.first!["kept"], "a spectator's first board is whole").toBe(
      undefined,
    );
    await playOn(20_000);
    expect(
      Object.values(viewerSockets.opened[0]!.whole.trimmed).reduce((a, b) => a + b, 0),
      "the spectator was sent trimmed boards too",
    ).toBeGreaterThan(0);

    // The host reloads.
    await still();
    await host.reload();
    await reopened(hostSockets, 2);
    sameAcrossConnections("host, reloaded", hostSockets, 1);

    // The guest's connection is cut; the page comes back on its own.
    await still();
    expect(cut, "the guest's socket is routed").not.toBeNull();
    cut!();
    await reopened(guestSockets, 2);
    sameAcrossConnections("guest, reconnected", guestSockets, 1);

    // The spectator reloads.
    await still();
    await viewer.reload();
    await reopened(viewerSockets, 2);
    sameAcrossConnections("spectator, reloaded", viewerSockets, 1);

    // The game goes on over the new connections, trimmed again...
    await playOn(25_000);
    expect(
      Object.values(hostSockets.opened[1]!.whole.trimmed).reduce((a, b) => a + b, 0),
      "the host's new connection is trimmed too",
    ).toBeGreaterThan(0);

    // ...and a second tab of the host's gets the whole lists the first rebuilt.
    await still();
    const second = await hostContext.newPage();
    const secondSockets = sockets(second);
    await second.goto(host.url());
    await reopened(secondSockets, 1);
    const tab = secondSockets.opened[0]!;
    expect(tab.first!["kept"], "a second tab's first board is whole").toBeUndefined();
    expect(tab.first!["stateRevision"]).toBe(hostSockets.opened[1]!.whole.last?.["stateRevision"]);
    expect(lists(tab.first), "the host's rebuilt history is the server's").toEqual(
      lists(hostSockets.opened[1]!.whole.last),
    );
    await second.close();
  } finally {
    await host.context().close();
    await guest.context().close();
    await viewer.context().close();
  }
});
