// Shared end-to-end helpers — PHASE_03.
//
// The account must exist before these run:
//
//   echo "<password>" | docker compose exec -T arena-server \
//     /app/bin/arena-admin create RudeLeft --admin --password-stdin
//
// Credentials come from the environment, so no test file carries one.

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const testUser = process.env.PROXIC_E2E_USER ?? "RudeLeft";
export const testPassword = process.env.PROXIC_E2E_PASSWORD ?? "a perfectly fine local passphrase";

/**
 * The second account, for the two-user sharing tests (§4.157).
 *
 * Created the same way as the first:
 *
 *   docker compose exec arena-server /app/bin/arena-admin create Pat
 */
export const secondUser = process.env.PROXIC_E2E_USER_2 ?? "Pat";
export const secondPassword =
  process.env.PROXIC_E2E_PASSWORD_2 ?? "a perfectly ordinary player password";

export async function signInAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

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

/**
 * Four more players, for tests that need more than one match at
 * once (P6-AX, P6-AY, P6-AZ). Read from match-accounts.json, which
 * CI also reads to create them, so the passwords live in one place.
 */
export const extraPlayers: { username: string; password: string }[] = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL("match-accounts.json", import.meta.url)), "utf-8"),
  ) as {
    accounts: { username: string; password: string }[];
  }
).accounts;
