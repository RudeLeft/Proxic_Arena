// A long session -- PHASE_11 P11-E15.
//
// One player sits in the lobby for half an hour, then plays three games in a
// row (the other player beside them), as a long evening does. The page's
// JavaScript heap is read through Chrome's DevTools protocol after a full
// garbage collection (`HeapProfiler.collectGarbage`, then
// `Runtime.getHeapUsage`: exact, where `performance.memory` rounds to 10 MB),
// with the DOM's node and listener counts, at the start, every five minutes
// of the lobby and back in the lobby after each game. Every timer the page
// sets is listed (an init script wraps setInterval and the setTimeouts of a
// second or more): what is running at each reading, and which of them still
// did something while the tab was hidden -- fired, asked the server, or
// changed the page.
//
// A headless page is never hidden by the browser, so "hidden" here is the
// page told so (`document.hidden`, `visibilityState`, a `visibilitychange`
// event), as a real hidden tab's code sees it; the browser's own slowing of
// hidden tabs (P11-E13) is not in it. So this lists what OUR code does while
// hidden, which is what the item asks.
//
// It also counts the lobby connection's lists (P11-E10's question): every
// PLAYERS, ROOMS and STANDINGS the page read over the whole session, with
// their bytes, beside the game's own messages.
//
//   node ci/measure.mjs session [--out DIR] [--pw-output DIR]
//   PROXIC_MEASURE_LOBBY_MIN (30), PROXIC_MEASURE_GAMES (3), PROXIC_MEASURE_GAME_S (90)

import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "../../e2e/helpers";
import { clearEverything, sharedDeck, startAMatch } from "../../e2e/match-helpers";
import { drive, matchPanel, over } from "../../e2e/speed-kit";
import { writeResult, type Row } from "./results";
import { countBytes } from "./wire";

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const LOBBY_MIN = Number(process.env.PROXIC_MEASURE_LOBBY_MIN ?? 30);
const GAMES = Number(process.env.PROXIC_MEASURE_GAMES ?? 3);
const GAME_S = Number(process.env.PROXIC_MEASURE_GAME_S ?? 90);
/** How long each hidden stretch lasts. */
const HIDDEN_S = Number(process.env.PROXIC_MEASURE_HIDDEN_S ?? 120);

/** Wraps the page's timers and its visibility, before any of its code runs. */
const TIMERS = `(() => {
  const timers = new Map();
  let hidden = false;
  let mutationsHidden = 0;
  const where = () => {
    const lines = (new Error().stack || "").split("\\n").slice(3);
    const line = lines.find((l) => /\\/assets\\//.test(l)) || lines[0] || "?";
    const m = line.match(/assets\\/([^?:)]+)(?:\\?[^:)]*)?:(\\d+):(\\d+)/);
    return m ? m[1] + ":" + m[2] + ":" + m[3] : line.trim().slice(0, 120);
  };
  const wrap = (kind, set, clear, min) => {
    window[set === "i" ? "setInterval" : "setTimeout"] = ((orig) =>
      function (fn, delay, ...rest) {
        const ms = Number(delay) || 0;
        if (typeof fn !== "function" || ms < min) return orig.call(window, fn, delay, ...rest);
        const entry = { kind, delay: ms, from: where(), fired: 0, firedHidden: 0, at: Date.now() };
        const id = orig.call(window, function (...args) {
          entry.fired++;
          if (hidden) entry.firedHidden++;
          if (kind === "timeout") timers.delete(id);
          return fn.apply(this, args);
        }, delay, ...rest);
        timers.set(id, entry);
        return id;
      })(window[set === "i" ? "setInterval" : "setTimeout"]);
    window[clear] = ((orig) => function (id) {
      timers.delete(id);
      return orig.call(window, id);
    })(window[clear]);
  };
  wrap("interval", "i", "clearInterval", 0);
  wrap("timeout", "t", "clearTimeout", 1000);
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  new MutationObserver((records) => {
    if (hidden) mutationsHidden += records.length;
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  window.__session = {
    hide(on) {
      hidden = on;
      mutationsHidden = 0;
      for (const t of timers.values()) t.firedHidden = 0;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    timers: () => [...timers.values()],
    mutationsHidden: () => mutationsHidden,
  };
})();`;

type Timer = { kind: string; delay: number; from: string; fired: number; firedHidden: number };

async function heap(cdp: CDPSession) {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
  const dom = await cdp.send("Memory.getDOMCounters");
  return {
    heapKb: Math.round(usedSize / 1024),
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    documents: dom.documents,
  };
}

const timersOf = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __session: { timers: () => Timer[] } }).__session.timers(),
  );

/** One timer list as one line per timer, the same timers grouped. */
function listed(timers: Timer[]) {
  const by = new Map<string, { n: number; fired: number; firedHidden: number }>();
  for (const t of timers) {
    const k = `${t.kind} ${t.delay} ms @ ${t.from}`;
    const e = by.get(k) ?? { n: 0, fired: 0, firedHidden: 0 };
    e.n++;
    e.fired += t.fired;
    e.firedHidden += t.firedHidden;
    by.set(k, e);
  }
  return [...by.entries()].map(
    ([k, e]) => `${e.n}x ${k} (fired ${e.fired}, hidden ${e.firedHidden})`,
  );
}

test.skip(({ browserName }) => browserName !== "chromium", "Chrome's DevTools protocol only");
test.beforeEach(() => test.skip(!existsSync(pkg), "no green deck package"));

test("session: half an hour in the lobby, then three games, heap and timers", async ({
  browser,
}) => {
  test.setTimeout((LOBBY_MIN + GAMES * 6 + 15) * 60_000);
  const contexts = [
    await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
    await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
  ];
  await contexts[0]!.addInitScript(TIMERS);
  const [host, guest] = [await contexts[0]!.newPage(), await contexts[1]!.newPage()];
  const wire = countBytes(host);
  const requests: { t: number; url: string }[] = [];
  host.on("request", (r) => requests.push({ t: Date.now(), url: r.url() }));
  const rows: Row[] = [];
  const timerLists: Record<string, string[]> = {};
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const deck = await sharedDeck(host, guest, pkg);
    await host.goto("/play");
    await guest.goto("/play");
    await expect(host.getByRole("region", { name: "Players" })).toBeVisible();
    const cdp = await contexts[0]!.newCDPSession(host);
    const start = Date.now();
    const read = async (key: string) => {
      await host.waitForTimeout(3000);
      const row: Row = {
        key,
        minute: Math.round((Date.now() - start) / 600) / 100,
        ...(await heap(cdp)),
      };
      const timers = await timersOf(host);
      row["intervals"] = timers.filter((t) => t.kind === "interval").length;
      row["timeouts"] = timers.filter((t) => t.kind === "timeout").length;
      rows.push(row);
      timerLists[key] = listed(timers);
      console.log(`[session] ${JSON.stringify(row)}`);
    };

    /** The page told it is hidden for [seconds]: what still ran. */
    const hiddenFor = async (key: string, seconds: number, meanwhile?: () => Promise<void>) => {
      const from = Date.now();
      await host.evaluate(() =>
        (window as unknown as { __session: { hide: (on: boolean) => void } }).__session.hide(true),
      );
      if (meanwhile) await meanwhile();
      const left = from + seconds * 1000 - Date.now();
      if (left > 0) await host.waitForTimeout(left);
      const timers = await timersOf(host);
      const mutations = await host.evaluate(() =>
        (
          window as unknown as { __session: { mutationsHidden: () => number } }
        ).__session.mutationsHidden(),
      );
      // What was asked while hidden: before the page is told it is shown
      // (which, rightly, may ask at once).
      const until = Date.now();
      const asked = requests.filter(
        (r) => r.t >= from && r.t <= until && !/\/assets\//.test(r.url),
      );
      await host.evaluate(() =>
        (window as unknown as { __session: { hide: (on: boolean) => void } }).__session.hide(false),
      );
      const firing = timers.filter((t) => t.firedHidden > 0);
      rows.push({
        key: `hidden ${key}`,
        seconds,
        timersFiring: firing.length,
        timerCallsHidden: firing.reduce((s, t) => s + t.firedHidden, 0),
        requestsHidden: asked.length,
        domChangesHidden: mutations,
      });
      timerLists[`hidden ${key}`] = [
        ...listed(firing),
        ...[...new Set(asked.map((r) => new URL(r.url).pathname))].map((p) => `asked ${p}`),
      ];
      console.log(`[session] ${JSON.stringify(rows[rows.length - 1])}`);
    };

    // 1. The lobby, half an hour: the other player says something every two minutes.
    await read("lobby 0 min");
    const chat = guest.getByLabel("Message the lobby");
    for (let minute = 1; minute <= LOBBY_MIN; minute++) {
      if (minute % 2 === 0 && (await chat.count()) > 0) {
        await chat.fill(`still here, minute ${minute}`);
        await chat.press("Enter");
      }
      await host.waitForTimeout(60_000);
      if (minute % 5 === 0 || minute === LOBBY_MIN) await read(`lobby ${minute} min`);
    }
    await hiddenFor("lobby, before the games", HIDDEN_S);

    // 2. Three games in a row: each played for a while, conceded, and both back in the room.
    for (let game = 1; game <= GAMES; game++) {
      // Back in the room after a game: the next one starts from a new room,
      // as startAMatch expects (the room left over the API, not the page).
      if (game > 1) {
        await clearEverything(host);
        await clearEverything(guest);
      }
      await startAMatch(host, guest, deck);
      await drive([host, guest], (GAME_S * 1000) / 2);
      if (game === 1) await read("in game 1");
      // The host's tab hidden for a while mid-game, the other player still playing.
      if (game === 1) await hiddenFor("in a game", 30, () => drive([guest], 25_000));
      await drive([host, guest], (GAME_S * 1000) / 2);
      if (!(await over(host))) {
        const menu = matchPanel(host);
        await menu.getByRole("button", { name: "Game menu" }).click();
        await menu.getByRole("button", { name: "Concede" }).click();
        await menu.getByRole("button", { name: "Yes, concede" }).click();
      }
      for (const page of [host, guest]) {
        const banner = page.locator(".gs-over");
        await expect(banner).toBeVisible({ timeout: 60_000 });
        await banner.getByRole("button", { name: "Look at the board" }).click();
        await page.getByRole("button", { name: /^Back to the room/ }).click();
        await expect(page).toHaveURL(/\/play$/);
      }
      await read(`after game ${game}`);
    }
    await hiddenFor("lobby, after the games", HIDDEN_S);
    await read("end");
    // The other pages with a clock of their own: Status (and, signed in as an
    // administrator, Admin), each hidden a minute.
    for (const [name, path] of [
      ["Status", "/status"],
      ["Admin", "/admin"],
      ["Hall", "/hall"],
    ] as const) {
      await host.goto(path);
      await host.waitForTimeout(5000);
      await hiddenFor(`${name} page`, 60);
    }

    // P11-E10's counts: the lobby connection's messages over the session, by type.
    const userIn = wire.frames.filter((f) => f.socket === "user" && f.dir === "in");
    const matchIn = wire.frames.filter((f) => f.socket === "match" && f.dir === "in");
    const byType = new Map<string, { n: number; bytes: number }>();
    for (const f of userIn) {
      const e = byType.get(f.type) ?? { n: 0, bytes: 0 };
      e.n++;
      e.bytes += f.bytes;
      byType.set(f.type, e);
    }
    for (const [type, e] of [...byType.entries()].sort((a, b) => b[1].bytes - a[1].bytes))
      rows.push({ key: `lobby socket ${type}`, messages: e.n, bytes: e.bytes });
    rows.push({
      key: "lobby socket, all",
      messages: userIn.length,
      bytes: userIn.reduce((s, f) => s + f.bytes, 0),
    });
    rows.push({
      key: "match sockets, all",
      messages: matchIn.length,
      bytes: matchIn.reduce((s, f) => s + f.bytes, 0),
    });
    writeResult("session", "session", "chromium", rows, {
      timers: timerLists,
      lobbyMinutes: LOBBY_MIN,
      games: GAMES,
    });
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    for (const c of contexts) await c.close();
  }
});
