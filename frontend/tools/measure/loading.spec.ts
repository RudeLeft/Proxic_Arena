// Phase 11's loading measure (P11-E1, rule P11-R6), from the 2026-11-19
// deep dive's scratch kit. Not part of the browser suite: run it through
// ci/measure.mjs (three runs per engine, compared), against the local stack
// on :8080:
//
//   node ci/measure.mjs loading                       Chromium and WebKit, every link
//   node ci/measure.mjs loading --engines firefox     where Firefox starts (CI's Linux)
//   node ci/measure.mjs loading --links local,slow4g  fewer links
//
// Every page -- sign-in, lobby, Hall, Deck Depot, Account, Admin and each of
// its tabs, Status; then a room, the game and spectate -- cold (a new
// browser profile), reloaded (its cache full), and visited in the app, first
// and again, over each fixed link (tools/measure/link.ts: local, slow 4G,
// live-like, poor), in whichever engine the project names. The same method
// in every engine: Playwright's own request events (`request.sizes()`, no
// Chrome DevTools), and the links made by a relay in front of the server, so
// a number in WebKit or Firefox means what it means in Chromium.
//
// Per load: usable (ms from the page's start, or from the click, to its
// heading and list on screen: the deep dive's definition, checked in the page
// every frame, `READY`), first paint,
// every picture done, requests, KB (bodies and headers), the code chunks,
// the slowest API call's server time, socket messages. One row per
// link x page x mode in loading-pages-<engine>.json and
// loading-game-<engine>.json.
//
// "room, game and spectate" plays with the shared test accounts (and the
// first of match-accounts.json as the spectator): never while a game spec
// runs. PROXIC_LOAD_GAME=0 leaves it out.

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  extraPlayers,
  importPackage,
  secondPassword,
  secondUser,
  signIn,
  signInAs,
  testUser,
} from "../../e2e/helpers";
import {
  chooseDeck,
  clearEverything,
  expectReady,
  inviteIn,
  markReady,
  openRoom,
  seatOf,
  sharedDeck,
  startAMatch,
} from "../../e2e/match-helpers";
import { LINKS, relay, type Relay } from "./link";
import { OUT, writeResult, type Row } from "./results";

const TARGET = new URL(process.env.PROXIC_E2E_URL ?? "http://127.0.0.1:8080");
const LINK_NAMES = (process.env.PROXIC_LOAD_LINKS ?? "local,slow4g,live,poor").split(",");
const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const screen = { viewport: { width: 1920, height: 1080 } };

interface Req {
  url: string;
  type: string;
  bytes: number;
  start: number;
  end?: number;
  server?: number;
}

/** Every request and socket message of [page], as Playwright sees it in any engine. */
function recorder(page: Page) {
  const reqs = new Map<object, Req>();
  // P11-E6: requests still open, and when the last one started or ended.
  let open = 0;
  let lastActivity = Date.now();
  const settled = () => {
    open = Math.max(0, open - 1);
    lastActivity = Date.now();
  };
  page.on("requestfailed", settled);
  page.on("request", (rq) => {
    open += 1;
    lastActivity = Date.now();
    reqs.set(rq, { url: rq.url(), type: rq.resourceType(), bytes: 0, start: Date.now() });
  });
  page.on("requestfinished", (rq) => {
    settled();
    const r = reqs.get(rq);
    if (!r) return;
    r.end = Date.now();
    const t = rq.timing();
    if (t.responseStart > 0 && t.requestStart >= 0) r.server = t.responseStart - t.requestStart;
    rq.sizes().then(
      (s) => (r.bytes = s.responseBodySize + s.responseHeadersSize),
      () => undefined,
    );
  });
  const frames: { bytes: number }[] = [];
  // P11-E2: when the lobby socket's list of players (the avatars' names until
  // E2) arrived, so the avatar probe is read only after it.
  let players: Promise<void> = Promise.resolve();
  let heardPlayers: () => void = () => undefined;
  const awaitPlayers = () => {
    players = new Promise<void>((ok) => (heardPlayers = ok));
  };
  awaitPlayers();
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      frames.push({
        bytes: typeof f.payload === "string" ? Buffer.byteLength(f.payload) : f.payload.length,
      });
      if (
        ws.url().includes("/ws/user") &&
        typeof f.payload === "string" &&
        f.payload.includes('"PLAYERS"')
      )
        heardPlayers();
    }),
  );
  return {
    reset() {
      reqs.clear();
      frames.length = 0;
    },
    take() {
      return { reqs: [...reqs.values()].filter((r) => !r.url.startsWith("data:")), frames };
    },
    /** Resolves once a new lobby connection has said who the players are (or after 10 s). */
    players: () =>
      Promise.race([players, new Promise<void>((ok) => setTimeout(ok, 10_000))]).then(() =>
        awaitPlayers(),
      ),
    /** For a page that keeps its connection (in the app): nothing new to wait for. */
    noNewSocket: () => heardPlayers(),
    /**
     * P11-E6: resolves once nothing has been asked or answered for [quietMs]
     * (every request ended), or after [maxMs]: a page that has fetched all it
     * fetches on its own (the code ahead among it).
     */
    async quiet(quietMs = 2_000, maxMs = 40_000): Promise<void> {
      const until = Date.now() + maxMs;
      while (Date.now() < until) {
        if (open === 0 && Date.now() - lastActivity >= quietMs) return;
        await new Promise((ok) => setTimeout(ok, 100));
      }
    },
  };
}
type Recorder = ReturnType<typeof recorder>;

/** performance.now() when every <img> is complete, or null after 20 s. */
async function imagesDone(page: Page): Promise<number | null> {
  return page
    .waitForFunction(
      () => [...document.images].every((i) => i.complete) && Math.round(performance.now()),
      undefined,
      { timeout: 20_000, polling: 100 },
    )
    .then((h) => h.jsonValue() as Promise<number>)
    .catch(() => null);
}

const firstPaint = (page: Page) =>
  page
    .evaluate(() => {
      const p = performance.getEntriesByName("first-contentful-paint")[0];
      return p ? Math.round(p.startTime) : null;
    })
    .catch(() => null);

const kb = (xs: Req[]) => Math.round((xs.reduce((a, r) => a + r.bytes, 0) / 1024) * 10) / 10;

/**
 * P11-E2's avatar probe, put in every profile before the page's scripts.
 * Every round portrait (`img.pa-avatar`) is followed from the moment it is
 * drawn: a "swap" is one drawn with the default face whose picture then
 * becomes a player's own (the same element, or the element React draws in
 * its place in the same commit when a ring or status badge comes to wrap
 * it); its lateness is from first drawn to its own picture loaded. Only
 * portraits on screen when they load count (the Account picker's folded set
 * does not). `reset()` starts a new count, for a visit in the app. Per load:
 * `avatarSwaps`, `avatarsShown`, `avatarLateMs` (the latest), `avatarLastMs`
 * (from the start or the click), `avatarAfterUsableMs` and `avatarFetches`
 * (portrait pictures fetched, folded ones included).
 */
const AVATAR_PROBE = `(() => {
  // The default face is the one SVG; every player's own picture is a .webp.
  const own = (src) => /\\.webp(\\?|$)/.test(src || "");
  const state = { from: 0, swaps: 0, shown: 0, late: 0, last: 0 };
  const info = new WeakMap();
  const settle = (img) => {
    const i = info.get(img);
    if (!i || i.done || !own(img.currentSrc || img.src)) return;
    if (!(img.complete && img.naturalWidth > 0)) return;
    i.done = true;
    if (i.at < state.from || img.getClientRects().length === 0) return;
    const t = performance.now();
    state.shown += 1;
    state.late = Math.max(state.late, t - i.at);
    state.last = Math.max(state.last, t);
  };
  // [was]: the same portrait's earlier element, when React drew it again.
  const track = (img, was) => {
    if (info.has(img)) return;
    const def = !own(img.getAttribute("src"));
    if (was && was.def && !def && was.at >= state.from) state.swaps += 1;
    info.set(img, { at: was ? was.at : performance.now(), def: was ? was.def && def : def, done: false });
    img.addEventListener("load", () => settle(img));
    settle(img);
  };
  // A portrait is the <img>, or the ring/badge wrapper around it.
  const portrait = (node) =>
    node.nodeType !== 1 ? null
    : node.matches("img.pa-avatar") ? node
    : node.matches(".pa-avatar-wrap") ? node.querySelector("img.pa-avatar") : null;
  new MutationObserver((list) => {
    // React re-mounts a portrait when a ring or a status badge comes to wrap
    // it (the lobby's lists arriving): the default face removed and a new
    // element added in the same place, in one commit. That is a swap too.
    const gone = new Map();
    for (const m of list) {
      if (m.type !== "childList") continue;
      m.removedNodes.forEach((n) => {
        const img = portrait(n);
        const i = img && info.get(img);
        if (!i) return;
        if (!gone.has(m.target)) gone.set(m.target, []);
        gone.get(m.target).push(i);
      });
    }
    for (const m of list) {
      if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const img = portrait(n);
          if (img) track(img, gone.get(m.target)?.shift());
          n.querySelectorAll("img.pa-avatar").forEach((x) => track(x));
        });
        continue;
      }
      const img = m.target;
      if (!img.matches || !img.matches("img.pa-avatar")) continue;
      const i = info.get(img);
      if (!i) { track(img); continue; }
      if (i.def && own(img.getAttribute("src"))) {
        if (i.at >= state.from) state.swaps += 1;
        i.def = false;
        i.done = false;
      }
      settle(img);
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  window.__avatars = {
    state,
    reset() { Object.assign(state, { from: performance.now(), swaps: 0, shown: 0, late: 0, last: 0 }); },
  };
})();`;

/**
 * The avatar numbers of a load that started at [start] (performance.now) and
 * was usable [usable] ms later, read once the lobby connection has said who
 * the players are (the swap, if any, has happened by then) and the pictures
 * have had a moment to land.
 */
async function avatars(
  page: Page,
  rec: Recorder,
  start: number,
  usable: number,
): Promise<Record<string, number | null>> {
  await rec.players();
  await page.waitForTimeout(500);
  // Then every portrait on screen loaded (a slow link's pictures land late).
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLImageElement>("img.pa-avatar")]
          .filter((img) => img.getClientRects().length > 0)
          .every((img) => img.complete),
      undefined,
      { timeout: 10_000, polling: 100 },
    )
    .catch(() => undefined);
  const s = await page
    .evaluate(() => {
      const probe = (
        window as unknown as {
          __avatars?: { state: { swaps: number; shown: number; late: number; last: number } };
        }
      ).__avatars;
      if (!probe) return null;
      // Every portrait's address, folded or not: what fetching one of them looks like.
      const pictures = [...document.querySelectorAll<HTMLImageElement>("img.pa-avatar")].map(
        (img) => new URL(img.src, location.href).pathname,
      );
      return { ...probe.state, pictures };
    })
    .catch(() => null);
  if (!s) return {};
  const pictures = new Set(s.pictures.filter((path) => path.endsWith(".webp")));
  const last = s.shown ? s.last - start : null;
  return {
    // Players' own pictures fetched in this load (the Account picker's set among them).
    avatarFetches: rec
      .take()
      .reqs.filter((r) => r.type === "image" && pictures.has(new URL(r.url).pathname)).length,
    avatarSwaps: s.swaps,
    avatarsShown: s.shown,
    avatarLateMs: s.shown ? Math.round(s.late) : null,
    avatarLastMs: last === null ? null : Math.round(last),
    avatarAfterUsableMs: last === null ? null : Math.round(last - usable),
  };
}

async function row(
  key: string,
  usable: number,
  fcp: number | null,
  images: number | null,
  rec: Recorder,
  extra: Record<string, number | null> = {},
): Promise<Row> {
  // sizes() resolves after requestfinished: give the last ones a moment.
  await new Promise((ok) => setTimeout(ok, 300));
  const { reqs, frames } = rec.take();
  const api = reqs.filter((r) => r.url.includes("/api/") && !r.url.includes("/api/pictures/"));
  const slowest = [...reqs]
    .filter((r) => r.end)
    .sort((a, b) => b.end! - b.start - (a.end! - a.start))
    .slice(0, 3)
    .map((r) => `${new URL(r.url).pathname.slice(0, 48)} ${r.end! - r.start} ms`)
    .join("; ");
  return {
    key,
    usable: Math.round(usable),
    fcp,
    images,
    requests: reqs.length,
    kb: kb(reqs),
    jsKb: kb(reqs.filter((r) => r.type === "script")),
    cssKb: kb(reqs.filter((r) => r.type === "stylesheet")),
    imageKb: kb(reqs.filter((r) => r.type === "image")),
    chunks: reqs.filter((r) => r.type === "script").length,
    apiCalls: api.length,
    apiServerMsMax: Math.round(Math.max(0, ...api.map((r) => r.server ?? 0))),
    socketMessages: frames.length,
    socketKb: Math.round((frames.reduce((a, f) => a + f.bytes, 0) / 1024) * 10) / 10,
    // P11-E2: avatar pictures fetched in this load (the Account picker's set).
    ...extra,
    slowest,
  };
}

/**
 * Each page's "usable", checked in the page on every animation frame (put in
 * every profile before the page's scripts): its heading and list on screen,
 * the deep dive's definition. Not Playwright's `expect`, which retries 0, 20,
 * 50, 100 then every 500 ms, so a slow page's time would land on its steps.
 */
const READY = `window.__ready = (() => {
  const q = (s) => document.querySelector(s);
  const seen = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const text = (s, re) => [...document.querySelectorAll(s)].some((e) => re.test(e.textContent || "") && seen(e));
  const anyText = (re) => {
    const walk = document.createTreeWalker(document.body || document, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode())
      if (re.test(n.nodeValue || "") && seen(n.parentElement)) return true;
    return false;
  };
  const adminData = () =>
    q("[role=tabpanel]")?.getAttribute("aria-busy") !== "true" &&
    (q('[role=tab] .pa-admin-tab-count')?.textContent || "0") !== "0";
  return {
    signin: () => seen(q('input[autocomplete="username"]')),
    lobby: () =>
      seen(q("#players-heading")) &&
      / online/.test(q("#players-heading").closest("section")?.textContent || "") &&
      text('[role="status"]', /Connected/),
    hall: () => text("h2", /^Leaderboard$/),
    decks: () => {
      if (!seen(q("#library-heading"))) return false;
      const h = [...document.querySelectorAll("h3")].find((e) => e.textContent.trim() === "My decks");
      return seen(h?.closest("section")?.querySelector("li"));
    },
    account: () => seen(q("#avatar-head")),
    // P11-E7: the accounts themselves, not "Loading accounts…" (an li too,
    // which the check took for the list until 2026-11-25), and the open
    // tab's data in: the tab counts (0 until a read lands) and the panel not
    // busy (aria-busy while the open tab's own list is being read).
    admin: () =>
      seen(q("#accounts-heading")) && seen(q("li.pa-admin-account")) && adminData(),
    status: () => anyText(/Ready/),
    tab: () => (q("[role=tabpanel]")?.textContent || "").trim().length > 20 && adminData(),
    room: (name) => seen(q("article.pa-room-mine")) && q("article.pa-room-mine").textContent.includes(name),
    game: () => seen(q(".gs-life-n")) && !!q('.bf-cards [data-zone="viewer:hand"]'),
    spectate: () => seen(q(".gs-life-n")),
    // P11-E6: the game's own page drawn (its code in): GamePage's screen, the
    // loading ring's ground, before the first board.
    gameScreen: () => seen(q("section.gs-screen")),
    // P11-E6: the table drawn from its first board (the life totals). Right
    // after Start match the hands are not dealt yet: the opening hand comes
    // with the first pregame answer, so the game row's hand check waits on a
    // player, not on the page.
    table: () => seen(q(".gs-life-n")),
  };
})();`;

/**
 * performance.now() at the first frame where `__ready[check](arg)` holds (a
 * function, not a string: the page's CSP refuses eval).
 */
async function usableAt(p: Page, check: string, arg = "", timeout = 60_000): Promise<number> {
  const h = await p.waitForFunction(
    ([name, a]) => {
      const ready = (window as unknown as { __ready?: Record<string, (x: string) => boolean> })
        .__ready;
      return !!ready?.[name]?.(a) && performance.now();
    },
    [check, arg] as const,
    { timeout, polling: "raf" },
  );
  return (await h.jsonValue()) as number;
}

type PageDef = { name: string; path: string; nav?: string; check: string };
const PAGES: PageDef[] = [
  { name: "lobby", path: "/play", nav: "Lobby", check: "lobby" },
  { name: "Hall", path: "/hall", nav: "Hall of Champions", check: "hall" },
  { name: "Deck Depot", path: "/decks", nav: "Deck Depot", check: "decks" },
  { name: "Account", path: "/account", nav: "Account", check: "account" },
  { name: "Admin", path: "/admin", nav: "Admin", check: "admin" },
  { name: "Status", path: "/status", check: "status" },
];
const ADMIN_TABS: [string, string][] = [
  ["rooms", "Rooms"],
  ["games", "Games"],
  ["reports", "Reports"],
  ["sign-ins", "Sign-ins"],
  ["computers", "Computers"],
  ["email", "Email account"],
  ["records", "Belt and records"],
  ["server", "Server"],
];
/** The base address of [link]: the server itself, or a relay in front of it. */
async function over(name: string): Promise<{ base: string; relay: Relay | null }> {
  const link = LINKS[name];
  if (link === undefined) throw new Error(`no link "${name}" (local, slow4g, live, poor)`);
  if (link === null) return { base: TARGET.origin, relay: null };
  const r = await relay(link, { host: TARGET.hostname, port: Number(TARGET.port || 80) });
  return { base: `http://${TARGET.hostname}:${r.port}`, relay: r };
}

/** A new browser profile at [base], signed in from [state]. */
async function fresh(browser: Browser, base: string, state?: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    ...screen,
    baseURL: base,
    ...(state ? { storageState: state } : {}),
  });
  await ctx.addInitScript(READY);
  await ctx.addInitScript(AVATAR_PROBE);
  await ctx.addInitScript(PRESS_AND_LONG_TASKS);
  return ctx;
}

/**
 * P11-E6: when the player last pressed (performance.now, the moment a click
 * starts, not when Playwright's `click()` returns), and the page's long tasks
 * (Chromium only: WebKit and Firefox have no "longtask" entries).
 */
const PRESS_AND_LONG_TASKS = `(() => {
  window.__pressed = null;
  addEventListener("pointerdown", () => { window.__pressed = performance.now(); }, true);
  window.__long = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
  } catch { /* not in this engine */ }
})();`;

/** Long-task milliseconds in [from, to] (performance.now), or null where the engine has none. */
const longTaskMs = (p: Page, from: number, to: number) =>
  p
    .evaluate(
      ([a, b]) => {
        const supported = (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask");
        if (!supported) return null;
        const all = (window as unknown as { __long: [number, number][] }).__long;
        return Math.round(all.filter(([s]) => s >= a && s <= b).reduce((sum, [, d]) => sum + d, 0));
      },
      [from, to] as const,
    )
    .catch(() => null);

const now = (p: Page) => p.evaluate(() => performance.now());

test("every page: cold, reload, in the app, over each link", async ({ browser, browserName }) => {
  test.setTimeout(3 * 3_600_000);
  mkdirSync(OUT, { recursive: true });
  const state = join(OUT, `state-${browserName}.json`);
  {
    const ctx = await fresh(browser, TARGET.origin);
    const page = await ctx.newPage();
    await signIn(page);
    // The Deck Depot is "usable" with its list drawn: a fresh stack (CI)
    // has no deck yet, so the green deck is brought in once.
    const decks = (await (await page.request.get("/api/decks")).json()) as { mine: unknown[] };
    if (decks.mine.length === 0 && existsSync(pkg)) await importPackage(page, pkg);
    await ctx.storageState({ path: state });
    await ctx.close();
  }
  const rows: Row[] = [];
  for (const name of LINK_NAMES) {
    const { base, relay: r } = await over(name);
    try {
      // Signed out: the sign-in page, cold and reloaded, then signing in.
      {
        const ctx = await fresh(browser, base);
        const page = await ctx.newPage();
        const rec = recorder(page);
        await page.goto("/login");
        let usable = await usableAt(page, "signin");
        rows.push(
          await row(
            `${name} sign-in cold`,
            usable,
            await firstPaint(page),
            await imagesDone(page),
            rec,
          ),
        );
        rec.reset();
        await page.reload();
        usable = await usableAt(page, "signin");
        rows.push(
          await row(
            `${name} sign-in reload`,
            usable,
            await firstPaint(page),
            await imagesDone(page),
            rec,
          ),
        );
        rec.reset();
        const t0 = Date.now();
        await signIn(page);
        await usableAt(page, "lobby");
        rows.push(await row(`${name} sign-in click`, Date.now() - t0, null, null, rec));
        await ctx.close();
      }
      // Each page by its address, cold, then reloaded.
      for (const def of PAGES) {
        const ctx = await fresh(browser, base, state);
        const page = await ctx.newPage();
        const rec = recorder(page);
        await page.goto(def.path);
        let usable = await usableAt(page, def.check);
        rows.push(
          await row(
            `${name} ${def.name} cold`,
            usable,
            await firstPaint(page),
            await imagesDone(page),
            rec,
            await avatars(page, rec, 0, usable),
          ),
        );
        await page.waitForTimeout(500);
        rec.reset();
        await page.reload();
        usable = await usableAt(page, def.check);
        rows.push(
          await row(
            `${name} ${def.name} reload`,
            usable,
            await firstPaint(page),
            await imagesDone(page),
            rec,
            await avatars(page, rec, 0, usable),
          ),
        );
        await ctx.close();
      }
      // In the app: one profile, each page from the header twice (first: its
      // code not yet loaded; again: everything seen), then each Admin tab.
      {
        const ctx = await fresh(browser, base, state);
        const page = await ctx.newPage();
        const rec = recorder(page);
        await page.goto("/play");
        await usableAt(page, "lobby");
        await page.waitForTimeout(1_000);
        const order = ["Hall", "Deck Depot", "Account", "Admin", "lobby"];
        for (const round of ["first", "again"])
          for (const which of order) {
            const def = PAGES.find((p) => p.name === which)!;
            await page.waitForTimeout(300);
            rec.reset();
            const t0 = await page.evaluate(() => {
              (window as unknown as { __avatars?: { reset(): void } }).__avatars?.reset();
              return performance.now();
            });
            await page
              .getByRole("navigation", { name: "Pages" })
              .getByRole("link", { name: def.nav!, exact: true })
              .click();
            const t1 = await usableAt(page, def.check);
            const images = await imagesDone(page);
            rec.noNewSocket();
            rows.push(
              await row(
                `${name} ${which} in-app ${round}`,
                t1 - t0,
                null,
                images === null ? null : Math.round(images - t0),
                rec,
                await avatars(page, rec, t0, t1 - t0),
              ),
            );
          }
        await page
          .getByRole("navigation", { name: "Pages" })
          .getByRole("link", { name: "Admin", exact: true })
          .click();
        await usableAt(page, "admin");
        for (const [tab, label] of ADMIN_TABS) {
          await page.waitForTimeout(300);
          rec.reset();
          const t0 = await now(page);
          await page.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
          const t1 = await usableAt(page, "tab");
          await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
          rows.push(await row(`${name} Admin:${tab} tab-click`, t1 - t0, null, null, rec));
        }
        await ctx.close();
      }
      // Each Admin tab by its address, cold.
      for (const [tab] of ADMIN_TABS) {
        const ctx = await fresh(browser, base, state);
        const page = await ctx.newPage();
        const rec = recorder(page);
        await page.goto(`/admin?tab=${tab}`);
        const usable = await usableAt(page, "tab");
        rows.push(
          await row(
            `${name} Admin:${tab} cold`,
            usable,
            await firstPaint(page),
            await imagesDone(page),
            rec,
          ),
        );
        await ctx.close();
      }
    } finally {
      await r?.close();
    }
    for (const x of rows.filter((x) => x.key.startsWith(`${name} `)))
      console.log(
        `[loading ${browserName}] ${x.key}: usable ${x.usable} ms, ${x.requests} requests, ${x.kb} KB`,
      );
  }
  writeResult(`loading-pages-${browserName}`, "loading", browserName, rows, { links: LINK_NAMES });
});

test("room, game and spectate: cold and reload, over each link", async ({
  browser,
  browserName,
}) => {
  test.skip(process.env.PROXIC_LOAD_GAME === "0", "PROXIC_LOAD_GAME=0");
  test.skip(!existsSync(pkg), "no green deck package");
  test.setTimeout(90 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const mk = () => fresh(browser, TARGET.origin);
  const [hc, gc, vc] = [await mk(), await mk(), await mk()];
  const [host, guest, viewer] = [await hc.newPage(), await gc.newPage(), await vc.newPage()];
  const rows: Row[] = [];
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const watcher = extraPlayers[0]!;
    await signInAs(viewer, watcher.username, watcher.password);
    const hostState = join(OUT, `state-host-${browserName}.json`);
    const viewerState = join(OUT, `state-viewer-${browserName}.json`);
    await hc.storageState({ path: hostState });
    await vc.storageState({ path: viewerState });
    const deck = await sharedDeck(host, guest, pkg);

    /** [path] in a new profile over each link: cold, then reloaded. */
    const measured = async (
      label: string,
      state: string,
      path: string,
      check: string,
      arg = "",
    ) => {
      for (const name of LINK_NAMES) {
        const { base, relay: r } = await over(name);
        const ctx = await fresh(browser, base, state);
        try {
          const page = await ctx.newPage();
          const rec = recorder(page);
          await page.goto(path);
          let usable = await usableAt(page, check, arg);
          rows.push(
            await row(
              `${name} ${label} cold`,
              usable,
              await firstPaint(page),
              await imagesDone(page),
              rec,
              await avatars(page, rec, 0, usable),
            ),
          );
          await page.waitForTimeout(1_000);
          rec.reset();
          await page.reload();
          usable = await usableAt(page, check, arg);
          rows.push(
            await row(
              `${name} ${label} reload`,
              usable,
              await firstPaint(page),
              await imagesDone(page),
              rec,
              await avatars(page, rec, 0, usable),
            ),
          );
        } finally {
          await ctx.close();
          await r?.close();
        }
      }
    };

    await host.goto("/play");
    await guest.goto("/play");
    await openRoom(host);
    await inviteIn(host, guest, secondUser);
    await measured("room", hostState, "/play", "room", secondUser);
    await clearEverything(host);
    await clearEverything(guest);
    await startAMatch(host, guest, deck);
    const roomId = (
      (await (await host.request.get("/api/rooms/current")).json()) as { room: { roomId: string } }
    ).room.roomId;
    await measured("game", hostState, "/game", "game");
    await measured("spectate", viewerState, `/watch/${roomId}`, "spectate");
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    for (const c of [hc, gc, vc]) await c.close();
  }
  for (const x of rows)
    console.log(
      `[loading ${browserName}] ${x.key}: usable ${x.usable} ms, ${x.requests} requests, ${x.kb} KB`,
    );
  writeResult(`loading-game-${browserName}`, "loading", browserName, rows, { links: LINK_NAMES });
});

/**
 * P11-E6 -- from "Start match" to the game table. The host's room is made
 * and both seats readied on the setup pages; then the host's own new profile
 * opens the lobby over the link and either sits in the room until its page
 * has fetched all it fetches on its own ("sat": the game's code ahead, once
 * P11-E6 is built) or presses Start match as soon as the room is drawn ("at
 * once": nothing ahead). Rows:
 * - `<link> room sat`: what sitting in the room fetched after the room was
 *   usable (the bytes a player who never starts pays), and its long tasks;
 * - `<link> start sat` / `<link> start at-once`: usable = the press to the
 *   table drawn from its first board (the life totals; the hands come with the
 *   first pregame answer, a player's, not the page's); `screenMs` the
 *   press to the game's own page drawn (its code in); `boardMs` the press to
 *   the first board on the match socket (the server's and the worker's part,
 *   which no code on the page can shorten); `afterBoardMs` the board to the
 *   table.
 */
test("start match: from the room to the game table, over each link", async ({
  browser,
  browserName,
}) => {
  test.skip(process.env.PROXIC_LOAD_GAME === "0", "PROXIC_LOAD_GAME=0");
  test.skip(!existsSync(pkg), "no green deck package");
  test.setTimeout(90 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const mk = () => fresh(browser, TARGET.origin);
  const [hc, gc] = [await mk(), await mk()];
  const [host, guest] = [await hc.newPage(), await gc.newPage()];
  const rows: Row[] = [];
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const hostState = join(OUT, `state-start-${browserName}.json`);
    await hc.storageState({ path: hostState });
    const deck = await sharedDeck(host, guest, pkg);

    for (const name of LINK_NAMES)
      for (const mode of ["sat", "at-once"] as const) {
        await host.goto("/play");
        await guest.goto("/play");
        await openRoom(host);
        await inviteIn(host, guest, secondUser);
        // As startAMatch readies them: each Ready only once that page has
        // seen the seats already ready (a stale room revision is refused).
        await chooseDeck(host, deck);
        await markReady(host);
        await chooseDeck(guest, deck, testUser);
        await expectReady(seatOf(guest, testUser));
        await markReady(guest);
        await expectReady(seatOf(host, secondUser));
        // The setup page goes, so the measured profile is the host's only page.
        await host.goto("about:blank");
        const { base, relay: r } = await over(name);
        const ctx = await fresh(browser, base, hostState);
        try {
          const page = await ctx.newPage();
          const rec = recorder(page);
          let boardAt: number | null = null;
          page.on("websocket", (ws) => {
            if (!ws.url().includes("/ws/matches/")) return;
            ws.on("framereceived", (f) => {
              if (
                boardAt === null &&
                typeof f.payload === "string" &&
                f.payload.includes('"MATCH_SNAPSHOT"')
              )
                boardAt = Date.now();
            });
          });
          await page.goto("/play");
          const roomUsable = await usableAt(page, "room", secondUser);
          const start = page.getByRole("button", { name: "Start match" });
          await expect(start).toBeEnabled();
          if (mode === "sat") {
            rec.reset();
            const from = await now(page);
            await rec.quiet();
            const to = await now(page);
            rows.push(
              await row(`${name} room sat`, Math.round(to - from), null, null, rec, {
                roomUsable: Math.round(roomUsable),
                longTaskMs: await longTaskMs(page, from, to),
              }),
            );
          }
          rec.reset();
          await start.click();
          const pressed = await page.evaluate(
            () => (window as unknown as { __pressed: number | null }).__pressed,
          );
          expect(pressed, "the press was seen").not.toBeNull();
          const screenAt = await usableAt(page, "gameScreen");
          const tableAt = await usableAt(page, "table");
          const origin = await page.evaluate(() => performance.timeOrigin);
          const board = boardAt === null ? null : (boardAt as number) - origin;
          rows.push(
            await row(`${name} start ${mode}`, tableAt - pressed!, null, null, rec, {
              screenMs: Math.round(screenAt - pressed!),
              boardMs: board === null ? null : Math.round(board - pressed!),
              afterBoardMs: board === null ? null : Math.round(tableAt - board),
            }),
          );
        } finally {
          await ctx.close();
          await r?.close();
          await clearEverything(host);
          await clearEverything(guest);
        }
      }
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    for (const c of [hc, gc]) await c.close();
  }
  for (const x of rows)
    console.log(
      `[loading ${browserName}] ${x.key}: usable ${x.usable} ms, ${x.requests} requests, ${x.kb} KB` +
        (x.key.includes(" start ") ? `, screen ${x.screenMs}, board ${x.boardMs}` : ""),
    );
  writeResult(`loading-start-${browserName}`, "loading", browserName, rows, { links: LINK_NAMES });
});
