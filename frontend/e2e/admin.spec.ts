// The Admin page, through real clicks — PHASE_07 §7.67, §7.68,
// Amendment 9.
//
// §7.68 asks for two things in particular: a player cannot reach any
// admin route (proved against the API here as well as by the page),
// and the last-admin rule holds. The server suite proves both at the
// API; these prove a person sees and can use the page.
//
// RudeLeft is an administrator on the local and CI stacks; Pat is a
// player. Accounts this file creates are named per run and disabled
// again at the end, so a stack that keeps its data is not cluttered
// with live accounts.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import {
  clearEverything,
  csrfOf,
  matchPanel,
  openRoom,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

async function asAdmin(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  return page;
}

const accountRow = (page: Page, name: string) =>
  page.getByRole("region", { name: "Accounts" }).getByRole("listitem").filter({ hasText: name });

/** Spec 0010: each account's actions sit behind one Manage button. */
const manage = (row: ReturnType<typeof accountRow>) =>
  row.getByRole("button", { name: /^Manage/ }).click();

/** Spec 0010: one list at a time, in tabs. */
const openTab = (page: Page, name: string) =>
  page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();

test("a player sees no Admin, and the API refuses them whatever they try", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAs(page, secondUser, secondPassword);
  try {
    await page.goto("/play");
    const pages = page.getByRole("navigation", { name: "Pages" });
    await expect(pages.getByRole("link", { name: "Lobby" })).toBeVisible();
    await expect(pages.getByRole("link", { name: "Admin" })).toHaveCount(0);

    // Typing the address: the page says so, and shows nothing of it.
    await page.goto("/admin");
    await expect(page.getByText("This page is for administrators.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accounts" })).toHaveCount(0);

    // Hiding is the courtesy; this is the protection (§7.62).
    const csrf = await csrfOf(page);
    const headers = { "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    expect((await page.request.get("/api/admin/accounts")).status()).toBe(403);
    expect((await page.request.get("/api/admin/sign-ins")).status()).toBe(403);
    const create = await page.request.post("/api/admin/accounts", {
      headers,
      data: { username: "sneaky", password: "a long enough password", role: "ADMIN" },
    });
    expect(create.status()).toBe(403);
  } finally {
    await context.close();
  }
});

test("an administrator invites someone, who makes their own account; then resets and disables it", async ({
  browser,
}) => {
  const admin = await asAdmin(browser);
  const username = `e2e${Date.now() % 1_000_000_000}`;
  const first = "a first password for the test";
  const second = "a second password for the test";
  const player = await browser.newContext();
  const playerPage = await player.newPage();
  try {
    await expect(admin.getByRole("link", { name: "Admin" })).toBeVisible();

    // Spec 0014 — by invitation. No email account on this stack, so the
    // dialog hands over the link to send by hand.
    await admin.getByRole("button", { name: "+ Invite" }).click();
    const form = admin.getByRole("region", { name: "Invite someone" });
    await form.getByLabel("Their email address").fill(`${username}@example.com`);
    await form.getByRole("button", { name: /Make the link|Send invitation/ }).click();
    const link = await admin.getByRole("textbox", { name: "The link to send" }).inputValue();
    expect(link).toMatch(/\/join#.{40,}$/);
    await admin.getByRole("button", { name: "Done" }).click();
    await expect(
      admin.getByRole("region", { name: "Invitations" }).getByText(`${username}@example.com`),
    ).toBeVisible();

    // The person: the link, their own username and password, then the lobby.
    await playerPage.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(playerPage.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(playerPage.getByLabel("Username")).toHaveValue(username);
    await playerPage.getByLabel("Display name").fill(`Test ${username}`);
    await playerPage.getByLabel("Password", { exact: true }).fill(first);
    await playerPage.getByLabel("Password again").fill(first);
    await playerPage.getByRole("button", { name: "Create account" }).click();
    await expect(playerPage).toHaveURL(/\/play$/);

    // Used once: the same link is dead now.
    const again = await browser.newContext();
    const stranger = await again.newPage();
    await stranger.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(
      stranger.getByRole("heading", { name: "This invitation is no longer valid" }),
    ).toBeVisible();
    await again.close();

    await admin.reload();
    await expect(accountRow(admin, username)).toContainText("Active");

    // Amendment 9: typed by the administrator; every session ends.
    const row = accountRow(admin, username);
    await manage(row);
    await row.getByRole("menuitem", { name: /Set a new password/ }).click();
    await row.getByPlaceholder(/New password for/).fill(second);
    await row.getByRole("button", { name: "Set password" }).click();
    await expect(
      admin.getByRole("status").filter({ hasText: "every session of theirs has ended" }),
    ).toBeVisible();
    expect((await playerPage.request.get("/api/rooms/current")).status()).toBe(401);
    await signInAs(playerPage, username, second);

    // Disable: refused at sign-in from then on. A disabled account
    // folds under "Disabled · N" (spec 0010).
    await manage(row);
    await row.getByRole("menuitem", { name: /^Disable/ }).click();
    await admin.getByRole("button", { name: /^Disabled · / }).click();
    await expect(row).toContainText("Disabled");
    expect((await playerPage.request.get("/api/rooms/current")).status()).toBe(401);
  } finally {
    await player.close();
    await admin.context().close();
  }
});

test("the last administrator is not offered Disable or Make player", async ({ browser }) => {
  const admin = await asAdmin(browser);
  try {
    const accounts = (await (await admin.request.get("/api/admin/accounts")).json()) as {
      accounts: { username: string; role: string; status: string }[];
    };
    const activeAdmins = accounts.accounts.filter(
      (a) => a.role === "ADMIN" && a.status === "ACTIVE",
    );
    test.skip(activeAdmins.length !== 1, "this stack has more than one administrator");

    const row = accountRow(admin, testUser);
    await manage(row);
    await expect(
      row.getByRole("menuitem", { name: "Cannot remove the last administrator" }),
    ).toBeDisabled();
    await expect(row.getByRole("menuitem", { name: /^Disable/ })).toHaveCount(0);
    await expect(row.getByRole("menuitem", { name: /a player$/ })).toHaveCount(0);
  } finally {
    await admin.context().close();
  }
});

test("the server's health is a pill beside the Server tab's title", async ({ browser }) => {
  // Spec 0020 F-0020-C: not above every tab any more; a problem would put a
  // red dot on the Server tab instead.
  const admin = await asAdmin(browser);
  try {
    await expect(admin.getByText(/^Healthy ·/)).toHaveCount(0);
    await expect(admin.getByRole("img", { name: "Server problem" })).toHaveCount(0);
    await openTab(admin, "Server");
    const head = admin.getByRole("region", { name: "Server" }).locator(".pa-admin-panel-head");
    await expect(head.getByText(/^Healthy · v/)).toBeVisible();
  } finally {
    await admin.context().close();
  }
});

/**
 * Each column title against the first row under it: where the title's
 * words start and where the cell's content starts (its button or pill
 * when it has one, else its words). Returns the columns more than 2px
 * apart, and any title that wrapped onto a second line.
 */
async function misaligned(page: Page, head: string, row: string): Promise<string[]> {
  return page.evaluate(
    ([h, r]) => {
      const headEl = document.querySelector(h);
      const rowEl = document.querySelector(r);
      if (!headEl || !rowEl) return [];
      // A display:contents wrapper's children are the grid's cells.
      const cells = (el: Element): Element[] =>
        [...el.children].flatMap((c) =>
          getComputedStyle(c).display === "contents" ? cells(c) : [c],
        );
      const boxed = (el: Element) =>
        parseFloat(getComputedStyle(el).borderLeftWidth) > 0 ||
        el.matches("button, a, .pa-small-button");
      const start = (el: Element): number => {
        if (boxed(el)) return el.getBoundingClientRect().left;
        const box = [...el.querySelectorAll("*")].find(
          (d) => boxed(d) && d.getBoundingClientRect().width > 0,
        );
        const range = document.createRange();
        range.selectNodeContents(el);
        const lefts = [...range.getClientRects()].filter((x) => x.width > 0).map((x) => x.left);
        if (box) lefts.push(box.getBoundingClientRect().left);
        return lefts.length ? Math.min(...lefts) : NaN;
      };
      const titles = cells(headEl);
      const data = cells(rowEl);
      const lineHeight = parseFloat(getComputedStyle(titles[0]).lineHeight) || 20;
      return titles.flatMap((title, i) => {
        const name = (title.textContent ?? "").trim();
        const out: string[] = [];
        if (title.getBoundingClientRect().height > lineHeight * 1.5) out.push(`${name} wraps`);
        const cell = data[i];
        if (!cell || !cell.textContent?.trim()) return out;
        const gap = Math.round(start(cell) - start(title));
        if (Math.abs(gap) > 2) out.push(`${name} ${gap}px`);
        return out;
      });
    },
    [head, row],
  );
}

test("every Admin column title sits over its data", async ({ browser }) => {
  // Owner 2026-10-27: titles drifted from their data (Manage and
  // Download record sat right of theirs; "Last attempt" wrapped). A list
  // with no rows on this stack is skipped.
  const admin = await asAdmin(browser);
  try {
    const lists: [string, string, string][] = [
      ["Accounts", ".pa-admin-table-head", ".pa-admin-account-line"],
      [
        "Accounts",
        ".pa-admin-list-head.pa-admin-invite",
        ".pa-admin-invite:not(.pa-admin-list-head)",
      ],
      ["Rooms", ".pa-admin-list-head.pa-admin-room", ".pa-admin-room:not(.pa-admin-list-head)"],
      ["Games", ".pa-admin-list-head.pa-admin-record", ".pa-admin-record:not(.pa-admin-list-head)"],
      [
        "Sign-ins",
        ".pa-admin-list-head.pa-admin-signin-line",
        ".pa-admin-signin-line:not(.pa-admin-list-head)",
      ],
    ];
    for (const [tab, head, row] of lists) {
      await openTab(admin, tab);
      // An empty list shows no titles (Rooms, when nobody has one open).
      const shown = await admin
        .locator(row)
        .first()
        .waitFor({ timeout: 5_000 })
        .then(
          () => true,
          () => false,
        );
      if (!shown) continue;
      expect(await misaligned(admin, head, row), `${tab} ${head}`).toEqual([]);
    }
  } finally {
    await admin.context().close();
  }
});

test("sign-in activity shows a failed attempt on a name that does not exist", async ({
  browser,
}) => {
  const stranger = await browser.newContext();
  const name = `nobody${Date.now() % 1_000_000}`;
  await stranger.request.post("/api/auth/login", {
    data: { username: name, password: "not a real password" },
  });
  await stranger.close();

  const admin = await asAdmin(browser);
  try {
    await openTab(admin, "Sign-ins");
    const line = admin
      .getByRole("region", { name: "Sign-in activity" })
      .getByRole("listitem")
      .filter({ hasText: name });
    await expect(line).toContainText("Failed");
    await expect(line).toContainText("No such account");
    // The password tried is never anywhere on the page.
    await expect(admin.getByText("not a real password")).toHaveCount(0);
  } finally {
    await admin.context().close();
  }
});

test("force close asks first, and the player in the room is told", async ({ browser }) => {
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await signInAs(player, secondUser, secondPassword);
  await clearEverything(player);
  const admin = await asAdmin(browser);
  try {
    await player.goto("/play");
    await openRoom(player, "Admin Closes This");

    await admin.reload();
    await openTab(admin, "Rooms");
    const rooms = admin.getByRole("region", { name: "Rooms" });

    // Spec 0020 F-0020-B: every status fits its box, the longest included.
    const state = rooms
      .getByRole("listitem")
      .filter({ hasText: "Admin Closes This" })
      .locator(".pa-room-state");
    await expect(state).toHaveText("Waiting for a player");
    const spills = await state.evaluate((box) => {
      const statuses = [
        "Waiting for a player",
        "Choosing decks",
        "Ready to start",
        "Starting…",
        "In a game",
      ];
      const original = box.textContent;
      const out = statuses.filter((text) => {
        box.textContent = text;
        return box.scrollWidth > box.clientWidth;
      });
      box.textContent = original;
      return out;
    });
    expect(spills).toEqual([]);

    await rooms.getByRole("button", { name: "Force close Admin Closes This" }).click();
    await expect(rooms.getByRole("alert")).toContainText("Close Admin Closes This?");
    await rooms.getByRole("button", { name: "Keep" }).click();
    await rooms.getByRole("button", { name: "Force close Admin Closes This" }).click();
    await rooms.getByRole("button", { name: "Close it" }).click();
    await expect(
      admin.getByRole("status").filter({ hasText: "an administrator closed it" }),
    ).toBeVisible();

    await expect(player.getByText("An administrator closed this room.")).toBeVisible();
    await expect(player.getByRole("button", { name: "Open a room" })).toBeVisible();
  } finally {
    await clearEverything(player);
    await playerContext.close();
    await admin.context().close();
  }
});

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");

test("force closing a room mid-game ends the match with no winner, for both players", async ({
  browser,
}) => {
  // The riskiest path: the worker is stopped, the match recorded
  // TERMINATED (§6.153: nobody wins), the room given back and then
  // closed, and both players told -- in that order.
  test.setTimeout(900_000);
  const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;
  test.skip(!pkg, "no deck package available");

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const admin = await asAdmin(browser);

  try {
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName);
    const matchId = (
      (await (await host.request.get("/api/matches/current")).json()) as {
        match: { matchId: string };
      }
    ).match.matchId;

    await admin.reload();
    await openTab(admin, "Rooms");
    const rooms = admin.getByRole("region", { name: "Rooms" });
    const row = rooms.getByRole("listitem").filter({ hasText: "In a game" });
    await row.getByRole("button", { name: /^Force close/ }).click();
    await expect(row.getByRole("alert")).toContainText("The match ends with no winner.");
    await row.getByRole("button", { name: "Close it" }).click();
    await expect(
      admin.getByRole("status").filter({ hasText: "the match ended with no winner" }),
    ).toBeVisible();

    for (const page of [host, guest]) {
      await expect(page.getByText("An administrator closed this room.")).toBeVisible();
      await expect(matchPanel(page)).toHaveCount(0);
      const current = (await (await page.request.get("/api/matches/current")).json()) as {
        match: unknown;
      };
      expect(current.match).toBeNull();
    }
    // Recorded as ended, and with no winner.
    const ended = (await (await host.request.get(`/api/matches/${matchId}`)).json()) as {
      match?: { status: string; outcome?: { winningSeat?: number } | null };
    };
    if (ended.match) {
      expect(ended.match.status).toBe("TERMINATED");
      expect(ended.match.outcome?.winningSeat ?? null).toBeNull();
    }
  } finally {
    await clearEverything(host);
    await clearEverything(guest);
    await hostContext.close();
    await guestContext.close();
    await admin.context().close();
  }
});

test("the Email account tab saves the account, never shows the password, and a test says why it failed", async ({
  browser,
}) => {
  // Spec 0014 amendment 1. An address nothing listens on, so the test
  // email fails at once, in words.
  const admin = await asAdmin(browser);
  const secret = `e2e-app-password-${Date.now()}`;
  try {
    await admin.goto("/admin?tab=email");
    const tab = admin.getByRole("region", { name: "Email account" });
    await tab.getByLabel("Email server").fill("127.0.0.1");
    await tab.getByLabel("Port").fill("1");
    await tab.getByLabel("Username").fill("me@example.com");
    await tab.getByLabel("Password").fill(secret);
    await tab.getByLabel("From").fill("Proxic Arena <me@example.com>");
    await tab.getByRole("button", { name: "Save" }).click();
    await expect(tab.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await expect(tab.getByLabel("Password")).toHaveValue("");
    await expect(tab.getByLabel("Password")).toHaveAttribute("placeholder", /A password is saved/);
    expect(await admin.content()).not.toContain(secret);

    await tab.getByLabel("Send a test email to").fill("me@example.com");
    await tab.getByRole("button", { name: "Send test" }).click();
    await expect(
      tab.getByRole("alert").filter({ hasText: "Couldn't reach the email server" }),
    ).toBeVisible({
      timeout: 30_000,
    });

    await tab.getByRole("button", { name: "Remove these settings" }).click();
    await expect(tab).toContainText("Not set up");
  } finally {
    await admin.context().close();
  }
});
