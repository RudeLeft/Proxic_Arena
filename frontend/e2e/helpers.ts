// Shared end-to-end helpers — PHASE_03.
//
// The account must exist before these run:
//
//   echo "<password>" | docker compose exec -T arena-server \
//     /app/bin/arena-admin create RudeLeft --admin --password-stdin
//
// Credentials come from the environment, so no test file carries one.

import { expect, type Page } from "@playwright/test";

export const testUser = process.env.PROXIC_E2E_USER ?? "RudeLeft";
export const testPassword = process.env.PROXIC_E2E_PASSWORD ?? "a perfectly fine local passphrase";

export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(testUser);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for sign-in to COMPLETE before the caller navigates.
  // Without this, a following page.goto aborts the login request in
  // flight, and the tests fail with "not signed in" while the same
  // flow works perfectly by hand.
  await expect(page).not.toHaveURL(/\/login/);
}
