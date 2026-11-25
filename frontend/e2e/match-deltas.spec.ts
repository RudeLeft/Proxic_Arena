// P11-D4 (spec 0117, F-0117-F, F-0117-I) -- each page is sent only what
// changed, in a real game, on every kind of connection.
//
// The server sends each connection a MATCH_DELTA made from the board THAT
// connection was last sent; the page rebuilds the whole board (delta.ts,
// match.ts). The local and CI stacks run with PROXIC_TEST_DELTA_CHECK on, so
// every delta also carries the whole board: here every rebuilt board is
// compared with it on both seats (and watchDeltas, match-helpers.ts, fails
// the test on any DELTA_MISMATCH the page itself logs). The game plays lands,
// creatures, Giant Growth on a creature (a cast with a target) and an attack,
// and then:
//   - the host reloads; the guest's connection is cut and comes back on its
//     own; the host opens a second tab: each new connection's first board is
//     whole, and (the game standing still) the board the page had rebuilt
//     from deltas before;
//   - a new turn begins: the checkpoint, a whole board mid-connection;
//   - the guest's relay drops one delta: the page asks for the whole board
//     (MATCH_RESYNC), gets it on the same connection, and deltas resume; the
//     server's log says so ("asked for a full board").
// A page that does not ask (`?deltas=1`) is sent whole boards only.
// With the server's switch off (PROXIC_MATCH_DELTAS=false, F-0117-I) the game
// plays the same with whole boards only.

import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WholeBoards, firstDifference } from "../src/delta";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  clearEverything,
  deltaSwitches,
  deltasOf,
  serverLog,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";
import { attackWithAll, hostsMove, matchPanel, step } from "./speed-kit";

test.describe.configure({ timeout: 900_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");

type Board = Record<string, unknown>;
type Socket = {
  url: string;
  whole: WholeBoards;
  first: Board | null;
  deltas: number;
  boards: number;
  /** Deltas whose rebuilt board was compared with the server's `whole`, and how many differed. */
  compared: number;
  wrong: string[];
  /** Whole boards after the first whose turn was not the board before's: the checkpoint. */
  checkpoints: number;
  resyncsSent: number;
  /** Whole boards that came after this socket asked for one. */
  afterResync: number;
  /** Deltas after the answer to a resync. */
  deltasAfterResync: number;
  /**
   * The first board after the page asked: its type, how long after the ask,
   * and the oldest turn its play log names (the answer carries the WHOLE log,
   * as to a new connection; a turn's checkpoint carries only that round's).
   */
  answer: { type: string; ms: number; oldestTurn: number | null; turn: unknown } | null;
  askedAt: number;
};

/** Every match socket a page opens: its boards rebuilt (WholeBoards) and checked against `whole`. */
function sockets(page: Page) {
  const opened: Socket[] = [];
  let lastFrame = Date.now();
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/ws/matches/")) return;
    const s: Socket = {
      url: ws.url(),
      whole: new WholeBoards(),
      first: null,
      deltas: 0,
      boards: 0,
      compared: 0,
      wrong: [],
      checkpoints: 0,
      resyncsSent: 0,
      afterResync: 0,
      deltasAfterResync: 0,
      answer: null,
      askedAt: 0,
    };
    opened.push(s);
    ws.on("framesent", (event) => {
      if (String(event.payload).includes('"MATCH_RESYNC"')) {
        s.resyncsSent += 1;
        s.askedAt = Date.now();
      }
    });
    ws.on("framereceived", (event) => {
      const text = String(event.payload);
      lastFrame = Date.now();
      const head = text.slice(0, 80);
      if (!head.includes('"MATCH_SNAPSHOT"') && !head.includes('"MATCH_DELTA"')) return;
      const message = JSON.parse(text) as Board;
      const before = s.whole.last;
      const rebuilt = (JSON.parse(s.whole.take(text)) as { state: Board }).state;
      if (s.resyncsSent > 0 && !s.answer) {
        const turns = ((message["state"] as Board | undefined)?.["playLog"] as Board[] | undefined)
          ?.map((l) => l["turn"])
          .filter((t): t is number => typeof t === "number");
        s.answer = {
          type: String(message["type"]),
          ms: Date.now() - s.askedAt,
          oldestTurn: turns && turns.length ? Math.min(...turns) : null,
          turn: rebuilt["turn"],
        };
      }
      if (message["type"] === "MATCH_DELTA") {
        s.deltas += 1;
        if (s.afterResync > 0) s.deltasAfterResync += 1;
        if ("whole" in message) {
          s.compared += 1;
          const at = firstDifference(rebuilt, message["whole"]);
          if (at !== null) s.wrong.push(`${String(message["to"])} at ${at}`);
        }
      } else {
        s.boards += 1;
        if (!s.first) s.first = rebuilt;
        else if (before && before["turn"] !== rebuilt["turn"]) s.checkpoints += 1;
        if (s.resyncsSent > 0) s.afterResync += 1;
      }
    });
  });
  const sum = (key: "deltas" | "compared" | "checkpoints") =>
    opened.reduce((a, s) => a + s[key], 0);
  return { opened, quietFor: () => Date.now() - lastFrame, sum };
}

type Watched = ReturnType<typeof sockets>;

/** The newest connection's first board: whole, and (the game still) the board the one before rebuilt. */
function sameAcrossConnections(name: string, watched: Watched, from: number) {
  const before = watched.opened[from - 1]!;
  const after = watched.opened[from]!;
  expect(after.first, `${name}: the new connection brought a board`).not.toBeNull();
  expect(after.first!["kept"], `${name}: a connection's first board is whole`).toBeUndefined();
  const last = before.whole.last!;
  expect(after.first!["stateRevision"], `${name}: the game stood still`).toBe(
    last["stateRevision"],
  );
  // The first board carries the whole play log; the rest is the board as rebuilt.
  const strip = (b: Board) => ({ ...b, playLog: undefined });
  expect(
    firstDifference(strip(after.first!), strip(last)),
    `${name}: the board the page rebuilt from deltas is the server's whole board`,
  ).toBeNull();
}

/**
 * Only this game's sockets: a page that loads /play while an earlier spec's
 * game is still live connects to that game first (run 2026-11-25:
 * match-history read that socket's one board as "the host's", and its
 * payments were never kept). Called once the game is running.
 */
function thisGame(watched: { opened: { url: string }[] }) {
  const game = watched.opened[watched.opened.length - 1]!.url.split("?")[0];
  const mine = watched.opened.filter((o) => o.url.split("?")[0] === game);
  watched.opened.splice(0, watched.opened.length, ...mine);
}

test("only what changed: taps, a targeted cast, combat, reload, a cut, a second tab, a checkpoint and a forced resync", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no deck package");
  const switches = deltaSwitches();
  const on = switches?.players ?? true;
  const viewport = { width: 1920, height: 1080 };
  const hostContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await (await browser.newContext({ viewport })).newPage();
  const hostSockets = sockets(host);
  const guestSockets = sockets(guest);
  // The guest's connection, to cut it as a dropped link would, and to drop
  // one delta on its way to the page (as only a bug could lose one).
  let cut: (() => void) | null = null;
  let dropNext = false;
  let droppedTo: unknown = null;
  await guest.routeWebSocket("**/ws/matches/**", (ws: WebSocketRoute) => {
    const server = ws.connectToServer();
    server.onMessage((m) => {
      if (dropNext && typeof m === "string" && m.slice(0, 80).includes('"MATCH_DELTA"')) {
        dropNext = false;
        droppedTo = (JSON.parse(m) as Board)["to"];
        return;
      }
      ws.send(m);
    });
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
  const game = watchGame([host, guest]);
  const done = new Set<string>();

  /** Both players play on: lands, creatures, Giant Growth on a creature, an attack. */
  const playOn = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await game.check();
      const kind = await matchPanel(host)
        .locator(".gs-combat")
        .getAttribute("data-kind", { timeout: 200 })
        .catch(() => null);
      if (kind === "declareAttackers" && !done.has("combat") && (await attackWithAll(host))) {
        await matchPanel(host).locator("button.gs-act-combat:not([disabled])").click();
        done.add("combat");
        continue;
      }
      const growth = host.locator('[data-zone="viewer:hand"][data-choosable="true"]', {
        hasText: /^Giant Growth/,
      });
      if (
        !done.has("cast") &&
        (await hostsMove(host)) &&
        (await growth.count()) > 0 &&
        (await host.locator('.bf-cards [data-zone^="viewer:"][data-pt]').count()) > 0
      ) {
        await growth.first().click();
        done.add("cast");
      }
      for (const p of [host, guest]) await step(p, true);
      await host.waitForTimeout(150);
    }
  };
  /** Nothing new on any socket for 7 s: the game waits on a player, so a new connection gets the last board. */
  const still = async () =>
    expect
      .poll(() => Math.min(hostSockets.quietFor(), guestSockets.quietFor()) > 7_000, {
        timeout: 120_000,
        intervals: [250],
      })
      .toBe(true);
  const reopened = async (watched: Watched, count: number) =>
    expect
      .poll(() => watched.opened.length >= count && watched.opened[count - 1]!.first !== null, {
        timeout: 60_000,
      })
      .toBe(true);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: ["Forest", "Forest", "Grizzly Bears", "Giant Growth", "Forest", "Llanowar Elves"],
          top: ["Forest", "Centaur Courser", "Forest", "Giant Growth", "Forest", "Forest"],
        },
      },
    });
    thisGame(hostSockets);
    thisGame(guestSockets);
    // Play until the cast with a target and the attack are done, and both seats had deltas.
    const deadline = Date.now() + 360_000;
    while (
      Date.now() < deadline &&
      !(done.has("cast") && done.has("combat") && hostSockets.sum("deltas") > 20)
    )
      await playOn(3_000);
    if (on) {
      expect(done.has("cast"), "Giant Growth was cast on a creature").toBe(true);
      expect(done.has("combat"), "the host attacked").toBe(true);
      expect(hostSockets.sum("deltas"), "the host was sent deltas").toBeGreaterThan(0);
      expect(guestSockets.sum("deltas"), "the guest was sent deltas").toBeGreaterThan(0);
      expect(hostSockets.sum("checkpoints"), "a new turn's board came whole").toBeGreaterThan(0);
    }

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

    // A second tab of the host's.
    await playOn(15_000);
    await still();
    const second = await hostContext.newPage();
    const secondSockets = sockets(second);
    await second.goto(host.url());
    await reopened(secondSockets, 1);
    expect(secondSockets.opened[0]!.first!["kept"], "a second tab's first board is whole").toBe(
      undefined,
    );
    expect(secondSockets.opened[0]!.first!["stateRevision"]).toBe(
      hostSockets.opened[1]!.whole.last?.["stateRevision"],
    );
    // A page that does not ask for deltas (no `?deltas=1`) is sent whole boards.
    await second.evaluate((url) => {
      const types: string[] = [];
      const ws = new WebSocket(url.replace(/\?deltas=1$/, ""));
      ws.onmessage = (e) =>
        types.push(String((JSON.parse(String(e.data)) as { type?: unknown }).type));
      (window as unknown as { __plain: string[] }).__plain = types;
    }, secondSockets.opened[0]!.url);
    await playOn(15_000);
    const plainTypes = await second.evaluate(
      () => (window as unknown as { __plain: string[] }).__plain,
    );
    expect(
      plainTypes.filter((t) => t === "MATCH_SNAPSHOT").length,
      "a page that does not ask is sent boards",
    ).toBeGreaterThan(1);
    expect(plainTypes, "and never a delta").not.toContain("MATCH_DELTA");
    await second.close();

    // The forced resync: one delta lost on the guest's way.
    if (on) {
      const guest2 = guestSockets.opened[guestSockets.opened.length - 1]!;
      deltasOf(guest).allowResync = true;
      const sockets0 = guestSockets.opened.length;
      const tryUntil = Date.now() + 240_000;
      while (Date.now() < tryUntil && guest2.resyncsSent === 0) {
        dropNext = true;
        await playOn(4_000);
        // A dropped delta followed only by the next turn's whole board asks nothing: drop again.
      }
      expect(droppedTo, "a delta was dropped on the guest's way").not.toBeNull();
      expect(guest2.resyncsSent, "the guest's page asked for the whole board, once").toBe(1);
      await expect
        .poll(() => guest2.afterResync, { timeout: 30_000, message: "the whole board came back" })
        .toBeGreaterThan(0);
      expect(guestSockets.opened.length, "on the same connection: no reconnect").toBe(sockets0);
      // The answer, not a checkpoint that happened by: whole, at once, with the whole play log.
      const answer = guest2.answer!;
      expect(answer.type, "the first board after asking is a whole board").toBe("MATCH_SNAPSHOT");
      expect(answer.ms, "and it came at once").toBeLessThan(2_000);
      expect(
        answer.oldestTurn !== null && answer.oldestTurn < Number(answer.turn),
        `and it carries the whole play log, as a new connection's board does (${JSON.stringify(answer)})`,
      ).toBe(true);
      const end = Date.now() + 120_000;
      while (Date.now() < end && guest2.deltasAfterResync === 0) await playOn(3_000);
      expect(guest2.deltasAfterResync, "deltas resumed after the whole board").toBeGreaterThan(0);
      const log = serverLog();
      if (log !== null)
        expect(log, "the server's log says the page asked").toMatch(
          /asked for a full board \(had /,
        );
    }

    // Every delta's rebuilt board was the server's whole board, on every connection.
    const all = [...hostSockets.opened, ...guestSockets.opened, ...secondSockets.opened];
    const wrong = all.flatMap((s) => s.wrong);
    expect(wrong, "every board rebuilt from a delta equals the server's whole board").toEqual([]);
    if (on) {
      expect(
        all.reduce((a, s) => a + s.compared, 0),
        "deltas were compared (PROXIC_TEST_DELTA_CHECK)",
      ).toBeGreaterThan(0);
    } else {
      expect(
        all.reduce((a, s) => a + s.deltas, 0),
        "deltas off: whole boards only",
      ).toBe(0);
    }
    console.log(
      `[match-deltas] host ${hostSockets.sum("deltas")} deltas, guest ${guestSockets.sum("deltas")}, ` +
        `compared ${all.reduce((a, s) => a + s.compared, 0)}, checkpoints ${hostSockets.sum("checkpoints")}, ` +
        `switches ${JSON.stringify(switches)}`,
    );
  } finally {
    await host.context().close();
    await guest.context().close();
  }
});
