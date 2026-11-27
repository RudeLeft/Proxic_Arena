// PROBE (spec 0120, by hand: PROXIC_FROZEN_PROBE=1, Windows Edge, headed):
// can a hidden or frozen game tab be cut off by the server (the queue's 10 s
// rule, the pings)? Owner decision 7 says it must not be. RUN 2026-11-27 on
// main 736fac6c: a tab hidden 10.5 min in a live game kept its connection;
// a frozen tab's sockets were failed by the browser at the freeze ("Page
// entered Back-Forward Cache.") and the server closed it ~30 s later.
// Durations: PROBE_HIDDEN_MS, PROBE_FROZEN_MS, PROBE_ALONE_MS.
//
// The game is set up by two Playwright pages (host, guest). The tab under
// test is a SECOND tab of the guest's seat, opened in a plain Edge
// (frozen-tab.ts: Playwright keeps its own pages visible), hidden behind a
// tab in front of it, then frozen. Meanwhile the guest's Playwright page
// plays for the guest, so the game's traffic flows to the hidden tab's
// socket; last, the Playwright guest page closes, so the frozen tab is the
// seat's only connection. The browser's own network events (CDP Network on
// the tab) say whether frames kept arriving while the page was frozen.

import { test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Devtools, PlainEdge } from "./frozen-tab";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch } from "./match-helpers";
import { drive, over } from "./speed-kit";

test.describe.configure({ timeout: 60 * 60_000 });
const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const HIDDEN_MS = Number(process.env["PROBE_HIDDEN_MS"] ?? 10 * 60_000);
const FROZEN_MS = Number(process.env["PROBE_FROZEN_MS"] ?? 6 * 60_000);
const ALONE_MS = Number(process.env["PROBE_ALONE_MS"] ?? 4 * 60_000);

const RECORDER = `(() => {
  const p = { ticks: [], msgs: [], vis: [], closes: [] };
  window.__probe = p;
  setInterval(() => p.ticks.push(Date.now()), 250);
  document.addEventListener("visibilitychange", () => p.vis.push(Date.now() + " " + document.visibilityState));
  document.addEventListener("freeze", () => p.vis.push(Date.now() + " freeze"));
  document.addEventListener("resume", () => p.vis.push(Date.now() + " resume"));
  const Real = window.WebSocket;
  window.WebSocket = class extends Real {
    constructor(url, protocols) {
      super(url, protocols);
      if (String(url).includes("/ws/matches/")) {
        this.addEventListener("message", () => p.msgs.push(Date.now()));
        this.addEventListener("close", (e) => p.closes.push(Date.now() + " " + e.code));
      }
    }
  };
})()`;

function gaps(xs: number[], from: number, to: number) {
  const inside = xs.filter((x) => x >= from && x <= to);
  let most = 0;
  let prev = from;
  for (const x of inside) {
    most = Math.max(most, x - prev);
    prev = x;
  }
  return { count: inside.length, longestGapMs: Math.max(most, to - prev) };
}

test("probe: a really hidden, then frozen, game tab and the server", async ({ browser }) => {
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
  const log = (s: string) => console.log(`[probe ${new Date().toISOString()}] ${s}`);
  const edge = await PlainEdge.start();
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    await drive([host, guest], 6_000);

    // The tab under test: the guest's seat, in the plain Edge.
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
    await tab.send("Page.enable");
    await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });
    await tab.send("Page.navigate", { url: guest.url() });
    for (let i = 0; i < 120; i++) {
      await guest.waitForTimeout(500);
      if (await tab.evaluate<boolean>("!!document.querySelector('.gs-screen[data-drawn]')")) break;
    }
    log(
      `tab drawn: ${await tab.evaluate<boolean>("!!document.querySelector('.gs-screen[data-drawn]')")}`,
    );
    const front = await edge.newTab("about:blank");
    await edge.activate(front.id);
    await guest.waitForTimeout(1_500);
    log(`tab visibility behind another: ${await tab.evaluate<string>("document.visibilityState")}`);

    const frames = (from: number, to: number) => {
      const xs = tab.events
        .filter((e) => e.method === "Network.webSocketFrameReceived" && e.at >= from && e.at <= to)
        .map((e) => e.at);
      return gaps(xs, from, to);
    };
    const sockets = () =>
      tab.events
        .filter((e) =>
          [
            "Network.webSocketCreated",
            "Network.webSocketClosed",
            "Network.webSocketFrameError",
          ].includes(e.method),
        )
        .map(
          (e) =>
            `${new Date(e.at).toISOString()} ${e.method.replace("Network.webSocket", "")} ${String(e.params["url"] ?? e.params["requestId"])}${typeof e.params["errorMessage"] === "string" ? ` "${e.params["errorMessage"]}"` : ""}`,
        );

    let ended: number | null = null;
    const t0 = Date.now();
    // PROBE_HIDDEN_PLAY=1: the guest's other tab plays too (the game moves
    // on and may end); otherwise only the host plays, and the game waits on
    // the guest's seat, live, beating, for the whole time.
    const hiddenPlayers = process.env["PROBE_HIDDEN_PLAY"] ? [host, guest] : [host];
    while (Date.now() - t0 < HIDDEN_MS) {
      await drive(hiddenPlayers, 20_000);
      const alive = await tab
        .evaluate<string>("document.visibilityState + ' ' + window.__probe.msgs.length")
        .catch((e: Error) => `no answer: ${e.message}; edge exited: ${String(edge.exited)}`);
      log(`hidden ${Math.round((Date.now() - t0) / 1000)} s: ${alive}`);
      if (ended === null && (await over(host))) ended = Date.now();
    }
    const t1 = Date.now();
    const r1 = await tab.evaluate<{
      ticks: number[];
      msgs: number[];
      vis: string[];
      closes: string[];
    }>("JSON.parse(JSON.stringify(window.__probe))");
    log(
      `HIDDEN ${Math.round((t1 - t0) / 1000)} s: page timer ${JSON.stringify(gaps(r1.ticks, t0, t1))}, ` +
        `page messages ${JSON.stringify(gaps(r1.msgs, t0, t1))}, network frames ${JSON.stringify(frames(t0, t1))}; ` +
        `closes ${JSON.stringify(r1.closes)}`,
    );

    await tab.send("Page.setWebLifecycleState", { state: "frozen" });
    const t2 = Date.now();
    while (Date.now() - t2 < FROZEN_MS) {
      await drive([host, guest], 20_000);
      if (ended === null && (await over(host))) ended = Date.now();
    }
    await guest.close();
    const t3 = Date.now();
    while (Date.now() - t3 < ALONE_MS) await drive([host], 20_000);
    const t4 = Date.now();
    await tab.send("Page.setWebLifecycleState", { state: "active" });
    await edge.activate(blank!.id);
    await host.waitForTimeout(10_000);
    const r2 = await tab.evaluate<{
      ticks: number[];
      msgs: number[];
      vis: string[];
      closes: string[];
    }>("JSON.parse(JSON.stringify(window.__probe))");
    log(
      `FROZEN with the seat's other tab playing ${Math.round((t3 - t2) / 1000)} s: page timer ` +
        `${JSON.stringify(gaps(r2.ticks, t2 + 500, t3))}, page messages ${JSON.stringify(gaps(r2.msgs, t2 + 500, t3))}, ` +
        `network frames ${JSON.stringify(frames(t2, t3))}`,
    );
    log(
      `FROZEN alone ${Math.round((t4 - t3) / 1000)} s: page timer ${JSON.stringify(gaps(r2.ticks, t3, t4))}, ` +
        `network frames ${JSON.stringify(frames(t3, t4))}`,
    );
    log(
      `after waking 10 s: page messages ${r2.msgs.filter((m) => m > t4).length}, closes ${JSON.stringify(r2.closes)}`,
    );
    log(`page events: ${r2.vis.join(" | ")}`);
    log(`the tab's sockets: ${sockets().join(" | ")}`);
    log(
      `still drawn: ${await tab.evaluate<string>("document.querySelector('.gs-screen')?.getAttribute('data-drawn') ?? 'none'")}`,
    );
    log(`game over: ${ended ? `at ${Math.round((ended - t0) / 1000)} s` : "no"}`);
    log(
      `times: hidden ${new Date(t0).toISOString()}, frozen ${new Date(t2).toISOString()}, alone ${new Date(t3).toISOString()}, woke ${new Date(t4).toISOString()}`,
    );
    tab.close();
  } finally {
    edge.stop();
    await hostContext.close();
    await guestContext.close();
  }
});
