// A warm-up before the "other" project's first test (playwright.config.ts:
// its `dependencies`). TEST ONLY.
//
// On a cold stack, and more so with the CPU slowed 4x (ci/ci-speed.mjs), the
// first pages a run asks for are slow: the sign-in, the lobby's and the Admin
// page's code chunks, the first database reads. admin.spec.ts and auth.spec.ts
// run first on CI's "other" machine and paid that cost against their 15 s
// checks: a blank page "Checking your session…" with the Lobby link not yet
// there, or still on `/` after signing in (ROADMAP's flakes). This signs in
// once and loads those pages with room to spare, so no real test is the
// first.
//
// Best effort: a warm-up that fails says why and lets the tests run (and
// fail, by name, if the stack really is down), rather than skipping them all.

import { test as setup, expect } from "@playwright/test";
import { testPassword, testUser } from "./helpers";

setup("warm up: sign in, the lobby and the Admin page load once", async ({ page }) => {
  setup.setTimeout(180_000);
  const slow = { timeout: 60_000 };
  try {
    await page.goto("/login", slow);
    await page.getByLabel("Username").fill(testUser, slow);
    await page.getByLabel("Password", { exact: true }).fill(testPassword, slow);
    await page.getByRole("button", { name: "Sign in" }).click(slow);
    await expect(page).toHaveURL(/\/play$/, slow);
    await expect(
      page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Lobby" }),
    ).toBeVisible(slow);
    await page.goto("/admin", slow);
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible(slow);
  } catch (error) {
    console.warn(`[warm-up] did not finish (the tests run anyway): ${String(error)}`);
  }
});
