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
} from "../../e2e/helpers";
import {
  clearEverything,
  inviteIn,
  openRoom,
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
  page.on("request", (rq) => {
    reqs.set(rq, { url: rq.url(), type: rq.resourceType(), bytes: 0, start: Date.now() });
  });
  page.on("requestfinished", (rq) => {
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
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) =>
      frames.push({
        bytes: typeof f.payload === "string" ? Buffer.byteLength(f.payload) : f.payload.length,
      }),
    ),
  );
  return {
    reset() {
      reqs.clear();
      frames.length = 0;
    },
    take() {
      return { reqs: [...reqs.values()].filter((r) => !r.url.startsWith("data:")), frames };
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

async function row(
  key: string,
  usable: number,
  fcp: number | null,
  images: number | null,
  rec: Recorder,
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
    admin: () => seen(q("#accounts-heading")) && seen(q("[role=tabpanel] li, [role=tabpanel] tr")),
    status: () => anyText(/Ready/),
    tab: () => (q("[role=tabpanel]")?.textContent || "").trim().length > 20,
    room: (name) => seen(q("article.pa-room-mine")) && q("article.pa-room-mine").textContent.includes(name),
    game: () => seen(q(".gs-life-n")) && !!q('.bf-cards [data-zone="viewer:hand"]'),
    spectate: () => seen(q(".gs-life-n")),
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
  return ctx;
}

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
            const t0 = await now(page);
            await page
              .getByRole("navigation", { name: "Pages" })
              .getByRole("link", { name: def.nav!, exact: true })
              .click();
            const t1 = await usableAt(page, def.check);
            const images = await imagesDone(page);
            rows.push(
              await row(
                `${name} ${which} in-app ${round}`,
                t1 - t0,
                null,
                images === null ? null : Math.round(images - t0),
                rec,
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
