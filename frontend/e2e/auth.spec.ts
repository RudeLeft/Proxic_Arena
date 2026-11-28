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
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  // Spec 0114 (W2-014): "Signed out of two sessions.", the count in words.
  await expect(page.getByText(/Signed out of [a-z0-9]+ sessions?\./)).toBeVisible();

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
  // Spec 0114 (W2-016): the button no longer shows the count; the 132 are counted below.
  const open = section.getByRole("button", { name: "Choose an avatar", exact: true });
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

// --- P11-E5: the start-up chain, started together ----------------------------
//
// With a session hint (the readable CSRF cookie), a signed-in page's code,
// its data and the lobby connection start beside "who am I" (src/early.ts).
// The owner's two rules for it: a stranger still gets the sign-in files and
// nothing else (2026-10-24), and no page is drawn before "who am I" answers.

/** Every request and socket a page makes, from before its first byte. */
function watched(page: import("@playwright/test").Page) {
  const requests: {
    url: string;
    status: number | null;
    /** The answer's Content-Length: a refusal's sentence, or a file. */
    body: number;
    headers: number;
    cache: string | null;
  }[] = [];
  const sockets: string[] = [];
  // Recorded as asked, and filled in when the answer's headers land: an
  // answer nobody reads (a primed one dropped) never "finishes".
  const entries = new Map<import("@playwright/test").Request, (typeof requests)[number]>();
  page.on("request", (request) => {
    const entry = {
      url: new URL(request.url()).pathname,
      status: null,
      body: 0,
      headers: 0,
      cache: null,
    };
    entries.set(request, entry);
    requests.push(entry);
  });
  page.on("response", (response) => {
    void response
      .headersArray()
      .then((headers) => {
        const entry = entries.get(response.request());
        if (!entry) return;
        const header = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name)?.value ?? null;
        entry.status = response.status();
        entry.cache = header("cache-control");
        entry.body = Number(header("content-length") ?? 0);
        entry.headers = headers.reduce((sum, h) => sum + h.name.length + h.value.length + 4, 0);
      })
      .catch(() => undefined);
  });
  page.on("websocket", (socket) => sockets.push(new URL(socket.url()).pathname));
  return { requests, sockets };
}

/** The build's list of each signed-in page's files (vite.config.ts `earlyFiles`). */
async function earlyFiles(page: import("@playwright/test").Page): Promise<string[]> {
  const text = await page.locator("#pa-early").textContent();
  expect(text, "the page carries the signed-in pages' file list").toBeTruthy();
  const built = JSON.parse(text!) as { files: string[] };
  return built.files.map((file) => `/${file}`);
}

test("P11-E5: a stranger asks for the sign-in files and who am I, and nothing else", async ({
  page,
}) => {
  const seen = watched(page);
  for (const path of ["/play", "/hall", "/admin", "/game"]) {
    await page.goto(path);
    await expect(page.getByLabel("Username")).toBeVisible();
  }
  await page.waitForTimeout(500);
  const signedIn = await earlyFiles(page);
  const api = seen.requests.filter((r) => r.url.startsWith("/api/")).map((r) => r.url);
  expect(new Set(api), "only who am I").toEqual(new Set(["/api/auth/me"]));
  expect(seen.sockets, "no lobby connection").toEqual([]);
  const asked = seen.requests.filter((r) => signedIn.includes(r.url));
  expect(asked, "no signed-in file").toEqual([]);
});

test("P11-E5: a session that ended elsewhere: each early start is refused, costs nothing, and signing in still draws the page", async ({
  page,
  context,
  baseURL,
}) => {
  // The CSRF cookie outlives a session ended from elsewhere: the hint is wrong.
  await context.addCookies([{ name: "proxicarena_csrf", value: "stale", url: baseURL! }]);
  const seen = watched(page);
  await page.goto("/play");
  await expect(page.getByLabel("Username")).toBeVisible();
  await page.waitForTimeout(1_000);
  const signedIn = await earlyFiles(page);
  // Every early start and data request answered before any is read: a
  // response's status is written when its headers arrive, and at 4x CPU one
  // could still be on its way after the second waited above ("/api/decks",
  // expected 401, received null: local ci-speed --alone, P11-B3 2026-11-28).
  const asked = () =>
    seen.requests.filter(
      (r) => signedIn.includes(r.url) || (r.url.startsWith("/api/") && r.url !== "/api/auth/me"),
    );
  await expect
    .poll(
      () =>
        asked()
          .filter((r) => r.status === null)
          .map((r) => r.url),
      {
        message: "every early start and data request answered",
      },
    )
    .toEqual([]);

  const early = seen.requests.filter((r) => signedIn.includes(r.url));
  expect(early.length, "the hint started the shell's and the lobby's files").toBeGreaterThan(3);
  for (const r of early) {
    expect(r.status, r.url).toBe(404);
    expect(r.cache, r.url).toBe("no-store");
  }
  const data = seen.requests.filter((r) => r.url.startsWith("/api/") && r.url !== "/api/auth/me");
  expect(data.map((r) => r.url).sort()).toEqual(
    ["/api/decks", "/api/matches/current", "/api/rooms/current"].sort(),
  );
  for (const r of data) expect(r.status, r.url).toBe(401);
  expect(seen.sockets).toEqual(["/ws/user"]);
  const refused = [...early, ...data];
  const body = refused.reduce((sum, r) => sum + r.body, 0);
  const headers = refused.reduce((sum, r) => sum + r.headers, 0);
  console.log(
    `[P11-E5] stale hint: ${refused.length} refusals, ${body} bytes of body, ${headers} of headers`,
  );
  // Each a refusal's sentence, never a file or a list.
  for (const r of refused) expect(r.body, r.url).toBeLessThan(200);

  // A refused early fetch is never remembered by the page: signing in draws
  // the lobby with its own styles and its connection.
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
  await expect(page.locator(".pa-header")).toHaveCSS("display", "flex");
  await expect(page.locator("#players-heading")).toBeVisible();
});

test("P11-E5: the page waits for who am I before drawing, while its code, data and connection start beside it", async ({
  page,
}) => {
  await signIn(page);
  for (const [path, check] of [
    ["/play", "#players-heading"],
    ["/hall", "text=Leaderboard"],
  ] as const) {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/auth/me", async (route) => {
      await held;
      await route.continue();
    });
    const seen = watched(page);
    await page.goto(path);
    await page.waitForTimeout(1_500);
    // Who am I is still out: nothing of any page is drawn, signed in or not.
    await expect(page.locator(".pa-header")).toHaveCount(0);
    await expect(page.getByLabel("Username")).toHaveCount(0);
    expect(await page.locator("#root").innerText()).toBe("Checking your session…");
    // ...but the page's data and the lobby connection are already asked for.
    expect(seen.sockets, path).toEqual(["/ws/user"]);
    const api = seen.requests.map((r) => r.url).filter((u) => u.startsWith("/api/"));
    expect(api, path).toContain(path === "/play" ? "/api/rooms/current" : "/api/hall");
    release();
    await expect(page.locator(check).first()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
    // One lobby connection: the early one, taken by the shell.
    expect(seen.sockets, path).toEqual(["/ws/user"]);
    await page.unroute("**/api/auth/me");
  }
});
