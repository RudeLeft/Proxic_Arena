// Login, session and protection — PHASE_03 §3.140–§3.146.
//
// Against the real stack. The account must exist first:
//
//   echo "<password>" | docker compose exec -T arena-server \
//     /app/bin/arena-admin create RudeLeft --admin --password-stdin
//
// Credentials come from the environment so this file carries none.

import { test, expect } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs, testPassword, testUser } from "./helpers";

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
  // Carrying nothing (owner 2026-10-24): no address to bounce back to.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signing in always lands in the lobby, whatever was asked for", async ({ page }) => {
  // Owner 2026-10-24: the Lobby first, every time -- also for an old
  // link that still names a page, or somewhere else entirely.
  await page.goto("/login?from=%2Fdecks");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/play$/);

  await page.goto("/login?from=https%3A%2F%2Fevil.example%2F");
  await expect(page).toHaveURL(/\/play$/);
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

test("a stranger is sent the sign-in screen and nothing else", async ({ page }) => {
  // Owner 2026-10-24. Every address refuses alike -- real or not -- so
  // nothing can be mapped from outside; the health checks answer only
  // inside the server's container; "who am I" says nothing.
  for (const path of [
    "/api/version",
    "/api/system/status",
    "/api/decks",
    "/api/admin/server",
    "/api/no-such-thing",
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(401);
  }
  for (const path of ["/api/health/ready", "/api/health/live", "/.vite/manifest.json"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(204);
  expect(await me.text()).toBe("");

  // Of the built files, only the sign-in screen's: the page names its
  // own script, and that loads; another page's script does not.
  await page.goto("/login");
  const own = await page.locator("script[type=module]").first().getAttribute("src");
  expect((await page.request.get(own!)).status()).toBe(200);
  const other =
    (await page.request.get(own!).then((r) => r.text())).match(/assets\/[\w-]+\.js/g) ?? [];
  const elsewhere = other.find((file) => `/${file}` !== own);
  expect(elsewhere, "the sign-in script names the other pages' files").toBeTruthy();
  expect((await page.request.get(`/${elsewhere}`)).status()).toBe(404);

  // Signed in, the same addresses answer.
  await signIn(page);
  expect((await page.request.get("/api/version")).status()).toBe(200);
  expect((await page.request.get(`/${elsewhere}`)).status()).toBe(200);
});

test("the avatars fold away, open on request, and a pick saves and folds them again (owner 2026-10-28)", async ({
  page,
}) => {
  await signInAs(page, secondUser, secondPassword);
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Avatar" });
  const choices = section.getByRole("group", { name: "Choose your avatar" });
  await expect(choices).toBeHidden();
  const open = section.getByRole("button", { name: /Choose an avatar \(132\)/ });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await expect(choices).toBeVisible();
  await expect(choices.getByRole("button")).toHaveCount(132);
  await choices.getByRole("button", { name: "Avatar 132", exact: true }).click();
  await expect(section.getByRole("status")).toContainText("Avatar saved.");
  await expect(choices).toBeHidden();
  await page.reload();
  await section.getByRole("button", { name: /Choose an avatar/ }).click();
  await expect(choices.getByRole("button", { name: "Avatar 132", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
