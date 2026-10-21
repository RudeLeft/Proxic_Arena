// Several matches at once, a crash, and a restart — PHASE_06 P6-AY,
// P6-AX, P6-AZ.
//
// These need to reach INTO the server container: a crash is a
// worker killed with SIGKILL, memory is the resident size of each
// worker process, and a restart is the container restarting. So
// they run only when told which container that is:
//
//   PROXIC_E2E_CONTAINER=proxic-arena-arena-server-1 npx playwright test match-concurrency
//
// Skipped otherwise, and SAID to be skipped. That is not the "gate
// that tests nothing" the CI deck exists to prevent: these are
// fault-injection and measurement runs, evidence gathered on
// demand, and the property suites around them run everywhere.
//
// Six players, three matches: RudeLeft/Pat and the four local test
// players in match-accounts.json.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  extraPlayers,
  secondPassword,
  secondUser,
  signIn,
  signInAs,
  testPassword,
  testUser,
} from "./helpers";
import {
  clearEverything,
  csrfOf,
  matchPanel,
  settlePregame,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

test.describe.configure({ mode: "serial", timeout: 1_800_000 });

const container = process.env.PROXIC_E2E_CONTAINER;

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const anyPackage = () =>
  existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

const pregame = /Play or draw|Keep or mulligan|Put a card back/;

/** A shell command inside the server container. */
function inContainer(script: string): string {
  return execFileSync("docker", ["exec", container!, "sh", "-c", script], {
    encoding: "utf-8",
  });
}

/**
 * The worker process for one match.
 *
 * Its command line does not name the match — it is the same jar
 * every time — but its stderr is redirected to
 * match-logs/<matchId>.log, so file descriptor 2 does.
 */
function workerPid(matchId: string): string | null {
  const out = inContainer(
    'for p in /proc/[0-9]*; do l=$(readlink "$p/fd/2" 2>/dev/null); ' +
      'case "$l" in *MATCH*) echo "${p#/proc/}";; esac; done'.replace("MATCH", matchId),
  ).trim();
  return out ? out.split(/\s+/)[0]! : null;
}

/** busybox prints "916", "578m" or "1.2g"; KiB either way. */
const kib = (rss: string) => {
  const n = Number.parseFloat(rss);
  return rss.endsWith("g") ? n * 1024 * 1024 : rss.endsWith("m") ? n * 1024 : n;
};

/** "1:07" or "1:02:07" — CPU time used so far, in seconds. */
const seconds = (time: string) => time.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);

/**
 * Every running worker: pid, resident memory, CPU time used.
 *
 * The container's ps is busybox: no %CPU column, so CPU is the
 * cumulative time each process has used — which is the better
 * measure for "what did starting a game cost" anyway.
 */
function workers(): { pid: string; rssKiB: number; cpuSeconds: number }[] {
  return inContainer("ps -o pid,rss,time,args")
    .split("\n")
    .filter((line) => line.includes("-jar") && line.includes("forge-worker"))
    .map((line) => line.trim().split(/\s+/))
    .map(([pid, rss, time]) => ({ pid: pid!, rssKiB: kib(rss!), cpuSeconds: seconds(time!) }));
}

async function currentMatch(page: Page) {
  const body = (await (await page.request.get("/api/matches/current")).json()) as {
    match: { matchId: string; status: string } | null;
  };
  return body.match;
}

type Pair = { host: Page; guest: Page; hostName: string; guestName: string; label: string };

async function player(browser: Browser, name: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (name === testUser) await signIn(page);
  else await signInAs(page, name, password);
  await clearEverything(page);
  return page;
}

/**
 * `count` pairs, signed in. Only as many as asked: the restart test
 * once built all three and closed one, and the other four sessions
 * stayed signed in for every spec that ran after it.
 */
async function pairs(browser: Browser, count = 3): Promise<Pair[]> {
  const [ash, bree, cole, dana] = extraPlayers;
  const seats: [string, string, string, string][] = [
    [testUser, testPassword, secondUser, secondPassword],
    [ash!.username, ash!.password, bree!.username, bree!.password],
    [cole!.username, cole!.password, dana!.username, dana!.password],
  ];
  const made: Pair[] = [];
  for (const [hostName, hostPassword, guestName, guestPassword] of seats.slice(0, count)) {
    made.push({
      host: await player(browser, hostName, hostPassword),
      guest: await player(browser, guestName, guestPassword),
      hostName,
      guestName,
      label: `${hostName}/${guestName}`,
    });
  }
  return made;
}

async function asked(pair: Pair): Promise<Page | null> {
  if (await matchPanel(pair.host).getByRole("heading", { name: pregame }).count()) return pair.host;
  if (await matchPanel(pair.guest).getByRole("heading", { name: pregame }).count())
    return pair.guest;
  return null;
}

/**
 * The extra players' decks go, and their shares with them.
 *
 * RudeLeft's deck shared with Pat is the state every other spec
 * starts from, so it stays. Anything else this file shared is
 * state no other spec expects: a deck from Ash still visible to Pat
 * once made sharing.spec's "nobody has shared a deck with you" fail.
 */
async function removeDecks(page: Page) {
  const headers = { "X-CSRF-Token": await csrfOf(page) };
  const library = (await (await page.request.get("/api/decks")).json()) as {
    mine: { deckId: string }[];
  };
  for (const deck of library.mine) {
    await page.request.delete(`/api/decks/${deck.deckId}`, { headers });
  }
}

async function cleanUp(all: Pair[]) {
  for (const pair of all) {
    await clearEverything(pair.host).catch(() => undefined);
    if (pair.hostName !== testUser) await removeDecks(pair.host).catch(() => undefined);
    await pair.host
      .context()
      .close()
      .catch(() => undefined);
    await pair.guest
      .context()
      .close()
      .catch(() => undefined);
  }
}

test.beforeEach(() => {
  test.skip(!container, "PROXIC_E2E_CONTAINER not set — fault injection needs the container");
  test.skip(!anyPackage(), "no deck package available");
});

test("three matches at once stay separate, and one crashing leaves the others playing", async ({
  browser,
}) => {
  const all = await pairs(browser);
  try {
    // --- three decks, three rooms -------------------------------
    const decks: string[] = [];
    for (const pair of all)
      decks.push(await sharedDeck(pair.host, pair.guest, anyPackage()!, pair.guestName));

    // --- P6-AY: launched together, measured ---------------------
    //
    // Startup is the time from Start to the first question of the
    // game: by then Forge has booted, built both decks, constructed
    // the game and dealt.
    const started = Date.now();
    await Promise.all(
      all.map((pair, i) =>
        startAMatch(pair.host, pair.guest, decks[i]!, {
          settle: false,
          hostName: pair.hostName,
          guestName: pair.guestName,
        }),
      ),
    );
    const startup: Record<string, number> = {};
    await Promise.all(
      all.map(async (pair) => {
        await expect
          .poll(() => asked(pair).then((page) => page !== null), { timeout: 600_000 })
          .toBe(true);
        startup[pair.label] = Date.now() - started;
      }),
    );

    // State isolation: three matches, three different ids, and every
    // player's own match is their pair's.
    const ids = await Promise.all(all.map((pair) => currentMatch(pair.host)));
    const guestIds = await Promise.all(all.map((pair) => currentMatch(pair.guest)));
    expect(new Set(ids.map((m) => m!.matchId)).size, "three separate matches").toBe(3);
    ids.forEach((m, i) => expect(guestIds[i]!.matchId, "a pair shares one match").toBe(m!.matchId));

    // Decision routing: in every match exactly one player is asked.
    for (const pair of all) {
      const hostAsked = await matchPanel(pair.host).getByRole("heading", { name: pregame }).count();
      const guestAsked = await matchPanel(pair.guest)
        .getByRole("heading", { name: pregame })
        .count();
      expect(hostAsked + guestAsked, `${pair.label}: exactly one player is asked`).toBe(1);
    }

    // Memory and CPU, from the processes themselves.
    const running = workers();
    const serverRss = kib(inContainer("ps -o pid,rss | awk '$1 == 1 { print $2 }'").trim());
    expect(running.length, "one worker per match").toBe(3);
    const pids = ids.map((m) => workerPid(m!.matchId));
    pids.forEach((pid, i) => expect(pid, `${all[i]!.label} has its own worker`).not.toBeNull());
    expect(new Set(pids).size, "no two matches share a worker").toBe(3);

    // --- asset isolation ----------------------------------------
    //
    // Play the first match far enough for artwork to be on screen,
    // then ask for that image through ANOTHER match's route. It is
    // a real asset id that exists in the art store; the second
    // player was never shown it in their own match.
    await settlePregame(all[0]!.host, all[0]!.guest);
    const art = matchPanel(all[0]!.host).locator("img.card-art");
    let leakChecked = false;
    if ((await art.count()) > 0) {
      const src = (await art.first().getAttribute("src"))!;
      const assetId = src.slice(src.lastIndexOf("/") + 1);
      const otherMatch = ids[1]!.matchId;
      const viaOther = await all[1]!.host.request.get(
        `/api/matches/${otherMatch}/assets/${assetId}`,
      );
      expect(viaOther.status(), "another match's route does not serve this match's art").toBe(404);
      const direct = await all[1]!.host.request.get(src);
      expect(direct.status(), "a non-participant cannot use this match's route").toBe(404);
      leakChecked = true;
    }

    // --- P6-AX: crash one, the others go on ---------------------
    //
    // SIGKILL, so the worker gets no chance to say anything. What
    // the server sees is a pipe that closed.
    inContainer(`kill -9 ${pids[0]}`);
    await expect(
      matchPanel(all[0]!.host).getByText(/stopped before it finished/),
      "the crashed match tells its players it stopped",
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      matchPanel(all[0]!.guest).getByText(/stopped before it finished/),
      "and the other player is told too",
    ).toBeVisible({ timeout: 60_000 });
    expect(["LAUNCHING", "RUNNING"]).not.toContain((await currentMatch(all[0]!.host))?.status);
    // AGENTS TEST-011 — what a player whose game crashed actually sees.
    await all[0]!.host.screenshot({ path: "test-results/seen/crashed.png", fullPage: true });

    // The other two are still alive AND still answerable: their
    // pregame is played through to RUNNING after the crash.
    for (const pair of all.slice(1)) {
      await settlePregame(pair.host, pair.guest);
      await expect(
        matchPanel(pair.host).getByText(/The game is running/),
        `${pair.label} survives`,
      ).toBeVisible({
        timeout: 120_000,
      });
    }
    expect(workers().length, "the crashed worker is gone, the others are not").toBe(2);
    await all[1]!.host.screenshot({ path: "test-results/seen/survivor.png", fullPage: true });

    // Every card in hand has its picture. Both packages this runs
    // with carry art for every card, so a blank tile is a lookup
    // that failed — which is how a two-faced card went unnoticed
    // until somebody looked at this screenshot.
    for (const pair of all.slice(1)) {
      const hand = matchPanel(pair.host).locator(".board-hand li.card-chip");
      const count = await hand.count();
      expect(count, `${pair.label}: a hand was dealt`).toBeGreaterThan(0);
      const blank = await hand
        .filter({ hasNot: pair.host.locator("img.card-art") })
        .allTextContents();
      expect(blank, `${pair.label}: cards in hand with no artwork`).toEqual([]);
    }

    // --- shutdown ------------------------------------------------
    for (const pair of all.slice(1)) await clearEverything(pair.host);
    await expect.poll(() => workers().length, { timeout: 60_000 }).toBe(0);

    // The numbers, left on disk rather than only in a log.
    const evidence = {
      when: new Date().toISOString(),
      startupMs: startup,
      workers: running.map((w) => ({
        pid: w.pid,
        rssMiB: Math.round(w.rssKiB / 1024),
        cpuSeconds: w.cpuSeconds,
      })),
      serverRssMiB: Math.round(serverRss / 1024),
      totalWorkerRssMiB: Math.round(running.reduce((sum, w) => sum + w.rssKiB, 0) / 1024),
      assetIsolationChecked: leakChecked,
    };
    mkdirSync("test-results/seen", { recursive: true });
    writeFileSync("test-results/seen/concurrency.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await cleanUp(all);
  }
});

test("a server restart during a match follows the documented policy", async ({ browser }) => {
  // P6-AZ. The documented policy (MatchRecovery, §6.157): a match
  // that was LAUNCHING or RUNNING when the server went down is
  // FAILED_RUNTIME with SERVER_RESTARTED, its room is given back,
  // and no worker survives — a JVM orphaned by a restart is a
  // match nobody can reach.
  const [pair] = await pairs(browser, 1);
  const all = [pair!];
  try {
    const deck = await sharedDeck(pair!.host, pair!.guest, anyPackage()!, pair!.guestName);
    await startAMatch(pair!.host, pair!.guest, deck, {
      hostName: pair!.hostName,
      guestName: pair!.guestName,
    });
    const before = await currentMatch(pair!.host);
    expect(before?.status).toBe("RUNNING");

    execFileSync("docker", ["restart", container!], { encoding: "utf-8" });
    await expect
      .poll(
        async () => {
          try {
            return (await pair!.host.request.get("/api/health/ready")).status();
          } catch {
            return 0;
          }
        },
        { timeout: 180_000 },
      )
      .toBe(200);

    // Sessions are stored, so the same browser is still signed in.
    expect(
      (await currentMatch(pair!.host))?.matchId ?? null,
      "the match is no longer current",
    ).toBeNull();
    const after = (await (
      await pair!.host.request.get(`/api/matches/${before!.matchId}`)
    ).json()) as {
      match: { status: string };
    };
    expect(after.match.status, "failed, not ended: nobody won").toBe("FAILED_RUNTIME");
    // The reason is not in the player-facing view, so read the row.
    // A SELECT, through the database container's own client.
    const reason = execFileSync(
      "docker",
      [
        "exec",
        container!.replace("arena-server", "postgres"),
        "psql",
        "-U",
        "proxic",
        "-d",
        "proxic",
        "-tAc",
        `SELECT failure_code FROM match WHERE match_id = '${before!.matchId}'`,
      ],
      { encoding: "utf-8" },
    ).trim();
    expect(reason).toBe("SERVER_RESTARTED");
    const room = (await (await pair!.host.request.get("/api/rooms/current")).json()) as {
      room: { status: string } | null;
    };
    expect(room.room?.status, "the room is given back").toBe("OPEN");
    expect(workers().length, "no worker outlives the restart").toBe(0);

    // And what the player sees on coming back: the lobby, not a
    // match that waits for ever.
    await pair!.host.goto("/play");
    await expect(pair!.host.getByRole("button", { name: "Start match" })).toBeVisible({
      timeout: 30_000,
    });
    await pair!.host.screenshot({ path: "test-results/seen/after-restart.png", fullPage: true });
  } finally {
    await cleanUp(all);
  }
});
