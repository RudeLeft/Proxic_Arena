// Pages keep their data -- PHASE_11 P11-E7 (Admin at once) and P11-E8.
//
// A page now keeps the last answer it read for the tab and draws it at once
// on the next visit, reading again behind. Each test holds the page's reads
// back at the server's door (`page.route`), so what is on screen while they
// are held can only be what was kept:
// - a revisit draws the kept Deck Depot, Hall and Admin lists at once, and an
//   Admin tab click its list read ahead;
// - two people in one tab: after signing out, the next person is never
//   shown the first person's kept lists (they wait for their own);
// - the Admin page sends no request at all while its browser tab is hidden.

import { expect, test, type Page, type Route } from "@playwright/test";
import { secondPassword, secondUser, signIn } from "./helpers";

/** Hold back every GET whose address [matches] until `release`. */
async function holdReads(page: Page, matches: RegExp) {
  const held: Route[] = [];
  let holding = true;
  await page.route(matches, async (route) => {
    if (!holding || route.request().method() !== "GET") return route.continue();
    held.push(route);
  });
  return {
    held,
    release: async () => {
      holding = false;
      for (const route of held.splice(0)) await route.continue();
      await page.unroute(matches);
    },
  };
}

const header = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name, exact: true });

const myDecks = (page: Page) =>
  page
    .getByRole("heading", { name: "My decks", exact: true })
    .locator("xpath=ancestor::section[1]")
    .getByRole("listitem");

const accountRows = (page: Page) =>
  page.getByRole("region", { name: "Accounts" }).locator("li.pa-admin-account");

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("a revisit draws the kept lists at once; signing out forgets them, so the next person in the tab waits for their own", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    // RudeLeft's own lists, read once.
    const rudesDecks = (
      (await (await page.request.get("/api/decks")).json()) as {
        mine: { displayName: string }[];
      }
    ).mine.map((d) => d.displayName);
    await header(page, "Deck Depot").click();
    await expect(page.getByRole("heading", { name: "Deck library" })).toBeVisible();
    if (rudesDecks.length > 0) await expect(myDecks(page).first()).toBeVisible();
    await header(page, "Hall of Champions").click();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await header(page, "Admin").click();
    await expect(accountRows(page).first()).toBeVisible();
    await header(page, "Lobby").click();

    // Revisits with every read held: what shows is what was kept.
    const reads = await holdReads(page, /\/api\/(decks|hall|admin\/)/);
    await header(page, "Deck Depot").click();
    if (rudesDecks.length > 0)
      await expect(myDecks(page).filter({ hasText: rudesDecks[0]! }).first()).toBeVisible();
    await header(page, "Hall of Champions").click();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await header(page, "Admin").click();
    await expect(accountRows(page).filter({ hasText: secondUser }).first()).toBeVisible();
    // A tab click: its list was read ahead, so it is drawn, not busy.
    await page.getByRole("tab", { name: /^Games/ }).click();
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
    // Each page did ask again (held here), so a fresh answer follows the kept one.
    await expect
      .poll(() => reads.held.map((r) => new URL(r.request().url()).pathname))
      .toEqual(
        expect.arrayContaining([
          "/api/decks",
          "/api/hall",
          "/api/admin/accounts",
          "/api/admin/matches",
        ]),
      );
    await reads.release();

    // Sign out; Pat signs in, in the same tab, with Pat's own reads held
    // from the start (the lobby reads the deck list too), so nothing of
    // Pat's can be kept yet: whatever a page draws now could only be
    // RudeLeft's.
    await signOut(page);
    const patReads = await holdReads(page, /\/api\/(decks|hall)/);
    // On the sign-in page the sign-out led to: no reload, so the tab's
    // memory is the same (a reload would forget everything by itself).
    await page.getByLabel("Username").fill(secondUser);
    await page.getByLabel("Password", { exact: true }).fill(secondPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await header(page, "Deck Depot").click();
    await expect(page.getByRole("heading", { name: "Deck library" })).toBeVisible();
    await page.waitForTimeout(500);
    const library = page
      .getByRole("heading", { name: "Deck library" })
      .locator("xpath=ancestor::section[1]");
    await expect(library.getByRole("listitem")).toHaveCount(0);
    for (const name of rudesDecks)
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await header(page, "Hall of Champions").click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toHaveCount(0);
    await expect(page.getByText("Loading…")).toBeVisible();
    await patReads.release();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    // And Pat, a player, asks no administrator's list by any address.
    const adminAsked: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/admin/")) adminAsked.push(r.url());
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(adminAsked).toEqual([]);
  } finally {
    await context.close();
  }
});

test("Admin asks nothing while its browser tab is hidden, and reads again on coming back", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  // A headless page is never hidden: the test hides it (the page reads
  // document.hidden and listens for visibilitychange), and its clock jumps.
  await context.addInitScript(() => {
    const w = window as unknown as { __hidden: boolean };
    w.__hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => w.__hidden });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (w.__hidden ? "hidden" : "visible"),
    });
  });
  await context.clock.install();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.goto("/admin");
    await expect(accountRows(page).first()).toBeVisible();
    // The other tabs' lists are read ahead once the page is drawn: let them land.
    await page.waitForTimeout(1_000);
    const asked: string[] = [];
    page.on("request", (r) => asked.push(new URL(r.url()).pathname));
    await page.evaluate(() => {
      (window as unknown as { __hidden: boolean }).__hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Ten minutes hidden, a minute at a time: today it re-read 8 lists every 30 s.
    for (let minute = 0; minute < 10; minute++) await page.clock.fastForward("01:00");
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
    await page.evaluate(() => {
      (window as unknown as { __hidden: boolean }).__hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => asked).toEqual(expect.arrayContaining(["/api/admin/accounts"]));
    expect(asked.some((path) => path === "/api/admin/overview")).toBe(true);
  } finally {
    await context.close();
  }
});
