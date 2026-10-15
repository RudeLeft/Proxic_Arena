// Browser end-to-end — PHASE_01 §1.78–§1.80, P1-C, P1-L.
//
// These assert against the real deployment. Everything here was
// previously verified by me looking at a screenshot, which is
// evidence for one person on one afternoon; this is evidence anyone
// can re-run.

import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * §1.79 — console errors and unhandled rejections must FAIL the
 * test, not be noticed by someone scrolling past them.
 *
 * Returns a function that asserts nothing went wrong, so each test
 * decides when to check.
 */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  return () => expect(problems, "browser reported errors").toEqual([]);
}

/** The status row for a named indicator. */
function indicator(page: Page, name: string) {
  return page.locator(".row").filter({ hasText: name });
}

test("the page loads and React is served by Ktor", async ({ page }) => {
  const assertClean = watchConsole(page);
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  // Served from Ktor's static route in production, not from Vite.
  expect(response?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { name: "PROXIC ARENA" })).toBeVisible();
  assertClean();
});

test("every status indicator reflects a real backend check", async ({ page }) => {
  const assertClean = watchConsole(page);
  await page.goto("/");

  await expect(indicator(page, "Application Server")).toContainText("Ready");
  await expect(indicator(page, "Database")).toContainText("Ready");
  await expect(indicator(page, "WebSocket")).toContainText("Ready");
  await expect(indicator(page, "Pixi Renderer")).toContainText("Ready");

  // §1.78 says the Forge runtime status must reflect the ACTUAL
  // state, which is not the same as "Ready". So the UI is compared
  // against what the API reports, rather than against a list of
  // acceptable words — an earlier version of this test accepted
  // "Ready" OR "Not configured", which would have passed whatever
  // the page said and proved nothing.
  const ready = (await (await page.request.get("/api/health/ready")).json()) as {
    checks: Record<string, string>;
  };
  const expected: Record<string, RegExp> = {
    ok: /Ready/,
    unconfigured: /Not configured/,
    missing: /Not configured/,
    unreachable: /Unavailable/,
    incompatible: /Unavailable/,
    "resources-missing": /Not configured/,
  };
  const forgeState = ready.checks["forgeWorker"] ?? "unconfigured";
  await expect(indicator(page, "Forge Runtime")).toContainText(
    expected[forgeState] ?? /Not configured/,
  );

  assertClean();
});

test("the version is displayed and matches the API", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sub")).toContainText("protocol v");

  // Cross-checked against the API rather than trusted: a hardcoded
  // version in the UI would pass a text assertion and still be a lie.
  const api = (await (await page.request.get("/api/version")).json()) as {
    proxicVersion: string;
    forgeCommit: string;
  };
  await expect(page.locator(".sub")).toContainText(api.proxicVersion);
  // Selected by CONTENT, not position: `.hint` also matches the
  // renderer counter, and `.first()` quietly asserted against the
  // wrong element.
  await expect(page.locator(".hint").filter({ hasText: "Forge" })).toContainText(
    api.forgeCommit.slice(0, 10),
  );
});

test("P1-L: Pixi initialises, and navigating away and back leaves no duplicate", async ({
  page,
}) => {
  const assertClean = watchConsole(page);
  await page.goto("/");

  const canvas = page.locator(".canvas-host canvas");
  await expect(canvas).toHaveCount(1);
  // A canvas that exists but was never sized is not an initialised
  // renderer.
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);

  // Away and back. The leak §1.18 guards against survives exactly
  // this and is invisible in a screenshot.
  await page.goto("/play");
  await page.goBack();
  await expect(canvas).toHaveCount(1);
  await expect(page.locator(".hint").filter({ hasText: "live renderers" })).toContainText(
    "live renderers: 1",
  );

  assertClean();
});

test("P1-E: a client-side route serves the app, and /api stays API", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "PROXIC ARENA" })).toBeVisible();

  const api = await page.request.get("/api/does-not-exist");
  expect(api.status()).toBe(404);
  // The SPA fallback must not hand JSON clients an HTML page.
  expect(api.headers()["content-type"]).toContain("application/json");
});

/**
 * The server and the client halves of §1.27 must agree.
 *
 * Ktor serves index.html for every unmatched path, so the server
 * cannot tell an unknown React route from a known one. If React then
 * rendered the foundation page for it, a typo'd URL would look like
 * a working page -- served with a 200, which is the server being
 * right and the app being wrong.
 */
test("an unknown route is served by Ktor and answered honestly by React", async ({ page }) => {
  const response = await page.goto("/no/such/page");
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Not found")).toBeVisible();
  await expect(page.getByText(/Foundation Build/)).toBeHidden();
});

/**
 * §1.80 — WebSocket disconnect.
 *
 * The UI must distinguish a dropped connection from a healthy one.
 * Closing the socket from the page is the closest thing to a real
 * drop that a browser test can cause.
 */
test("§1.80: a dropped WebSocket is reported, not left showing Ready", async ({ page }) => {
  await page.goto("/");
  await expect(indicator(page, "WebSocket")).toContainText("Ready");

  await page.evaluate(() => {
    // Patched at construction time by the app; reach the live socket
    // through the only handle a page has: force a close by opening
    // our own connection to the same endpoint and closing it is NOT
    // the same thing, so instead we stop the server-side keepalive
    // by closing every socket the page holds.
    const sockets = (window as unknown as { __proxicSockets?: WebSocket[] }).__proxicSockets;
    sockets?.forEach((socket) => socket.close());
  });

  // If the app exposes no socket handle this assertion is vacuous,
  // which is why the app registers one in development builds. The
  // test asserts the indicator LEAVES Ready, so a vacuous pass is
  // visible as a failure here rather than a silent green.
  await expect(indicator(page, "WebSocket")).toContainText(/Disconnected|Unavailable/, {
    timeout: 10_000,
  });
});
