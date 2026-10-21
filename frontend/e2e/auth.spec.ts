// Login, session and protection — PHASE_03 §3.140–§3.146.
//
// Against the real stack. The account must exist first:
//
//   echo "<password>" | docker compose exec -T arena-server \
//     /app/bin/arena-admin create RudeLeft --admin --password-stdin
//
// Credentials come from the environment so this file carries none.

import { test, expect } from "@playwright/test";
import { signIn, testPassword, testUser } from "./helpers";

const username = testUser;
const password = testPassword;

test("the address everyone types leads in, and every page says who you are", async ({ page }) => {
  // §3.69, PHASE_07 §7.62. The defect this exists for: the home page had
  // five green indicators and NOTHING about authentication, so a person
  // arriving had no visible way in. Now "/" is the way in: Sign in when
  // signed out, the Lobby when signed in, and the shared header names
  // the pages and the way out on every signed-in page.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await signIn(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/play$/);
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages.getByRole("link", { name: "Deck Depot" })).toBeVisible();
  await expect(pages.getByRole("link", { name: "Lobby" })).toBeVisible();
  await pages.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  // Identity and role (§3.69), on the Account page.
  await expect(page.getByText("Administrator")).toBeVisible();

  // ...and out again, from the header, back to Sign in.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("an anonymous visitor to a protected page is sent to login", async ({ page }) => {
  // §3.67, and PHASE 3 AMENDMENT 1: the deck API needs a session,
  // so without this redirect the page would show a wall of 401s
  // instead of a way to sign in.
  await page.goto("/decks");
  await expect(page).toHaveURL(/\/login\?from=%2Fdecks/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signing in returns to the page that was asked for", async ({ page }) => {
  // §3.67 — the intended destination survives the detour.
  await page.goto("/decks");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/decks$/);
  await expect(page.getByText("Proxic Deck Builder")).toBeVisible();
});

test("a wrong password says so without revealing whether the user exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("definitely not the password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // The notice above the form (PHASE_07 §7.63), an alert.
  const error = page.getByRole("alert");
  await expect(error).toBeVisible();
  // §3.44 — the message must not distinguish an unknown user from
  // a wrong password, and the page must not invent wording the
  // server never sent.
  await expect(error).not.toContainText(/no such user|unknown user|does not exist|disabled/i);

  // The username survives a failed attempt; the password does not.
  await expect(page.getByLabel("Username")).toHaveValue(username);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("an unknown user gets the same message as a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("definitely-not-a-user");
  await page.getByLabel("Password", { exact: true }).fill("whatever");
  await page.getByRole("button", { name: "Sign in" }).click();
  const unknown = await page.getByRole("alert").textContent();

  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("definitely not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const wrong = await page.getByRole("alert").textContent();

  expect(unknown).toBe(wrong);
});

test("the session cookie is not readable from JavaScript", async ({ page }) => {
  // §3.24 — HttpOnly, proven from the page's own point of view
  // rather than by reading a response header.
  await signIn(page);
  await expect(page).toHaveURL(/\/play$|\/decks$/);

  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain("proxicarena_session");
  // The CSRF cookie IS readable, deliberately: the page must echo
  // it in a header, which is the half an attacker cannot do.
  expect(visible).toContain("proxicarena_csrf");
});

test("a signed-in user stays signed in across a reload", async ({ page }) => {
  // §3.72 — state comes from the server on startup, so a refresh
  // must not sign anyone out.
  await signIn(page);
  await page.goto("/decks");
  await expect(page.getByText("Proxic Deck Builder")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Proxic Deck Builder")).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
});

test("visiting login while signed in goes to the app", async ({ page }) => {
  // §3.66.
  await signIn(page);
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login/);
});

test("signing out ends the session and protects the page again", async ({ page }) => {
  await signIn(page);
  await page.goto("/account");
  // exact: the account page now also has "Sign out everywhere".
  //
  // Wait for the REQUEST, not just the click. `click()` returns
  // when the click is dispatched, not when the POST it triggers
  // has finished -- so the navigation below could win the race,
  // reach /decks with a still-valid cookie, and fail an assertion
  // about a sign-out that simply had not happened yet.
  //
  // Diagnosed from a kept trace after this flaked once in three
  // full runs. The other two sign-out tests assert a UI change
  // instead of navigating, and those poll, so they were never
  // exposed to it.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/logout") && r.status() < 500),
    page.getByRole("button", { name: "Sign out", exact: true }).click(),
  ]);

  await page.goto("/decks");
  await expect(page).toHaveURL(/\/login/);
});

test("sign out everywhere ends sessions in other browsers too", async ({ browser, page }) => {
  // §3.34, P3-I. Two independent contexts are two independent
  // cookie jars, which is the only honest way to prove this from a
  // browser: a one-context test cannot tell "ended every session"
  // from "ended mine".
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage);
  await otherPage.goto("/decks");
  await expect(otherPage.getByText("Proxic Deck Builder")).toBeVisible();

  await signIn(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out all" }).click();
  await expect(page.getByText(/Signed out of \d+ session/)).toBeVisible();

  // The OTHER browser is now signed out, which it finds out on its
  // next request rather than being told.
  await otherPage.goto("/decks");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  await page.goto("/decks");
  await expect(page).toHaveURL(/\/login/);
});

test("the account page shows who you are", async ({ page }) => {
  await signIn(page);
  await page.goto("/account");
  await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
  // The role in words (PHASE_07 §7.66), not the server's enum.
  await expect(page.getByText("Administrator", { exact: true })).toBeVisible();
});

test("health stays public while decks do not", async ({ page }) => {
  // §3.83, §3.84 — a monitor must not need credentials, and owner
  // decision D2 keeps the LAN port useful for exactly that.
  expect((await page.request.get("/api/health/ready")).status()).toBe(200);
  expect((await page.request.get("/api/version")).status()).toBe(200);
  expect((await page.request.get("/api/decks")).status()).toBe(401);
});
