// Deck import, through the real UI — PHASE_02 §2.81–§2.87.
//
// Playwright can set a file input, which is the one part of this
// page a person cannot check from a terminal and I cannot click
// through by hand. Everything here runs against the actual running
// stack.

import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");

/**
 * Any importable package: the real Deck Builder export when a
 * developer has one, otherwise the generated CI fixture.
 *
 * The two tests that assert an export's SPECIFICS (11 distinct
 * cards, 11 images) stay tied to the real thing, because §2.3 asks
 * for a real export and a fixture cannot stand in for one. Tests
 * that only need "a valid package" use this, so they run on CI
 * instead of skipping.
 */
function anyPackage(): string | null {
  if (existsSync(realExport)) return realExport;
  const fixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
  return existsSync(fixture) ? fixture : null;
}

/** Remove every deck, so a run does not depend on what came before. */
async function clearDecks(page: Page) {
  // The CSRF header is required on DELETE (§3.52). Without it every
  // delete returned 403 and this helper silently did nothing, so a
  // second run met "that deck has already been imported" instead of
  // a clean slate — a test-harness failure that looked exactly like
  // a product bug.
  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "proxicarena_csrf")?.value ?? "";

  // PHASE_04 §4.58/§4.59 — the library is two named lists now.
  // Only `mine` is deletable; a deck shared with you is not yours to
  // clear (§4.80), and the server would refuse anyway.
  const library = (await (await page.request.get("/api/decks")).json()) as {
    mine: { deckId: string }[];
  };
  for (const deck of library.mine) {
    const response = await page.request.delete(`/api/decks/${deck.deckId}`, {
      headers: { "X-CSRF-Token": csrf },
    });
    expect(response.status(), "a deck could not be removed").toBe(204);
  }
}

test.beforeEach(async ({ page }) => {
  // PHASE 3 AMENDMENT 1 — every deck endpoint needs a session now.
  // These tests predate authentication and failed when it landed,
  // which is the rule working. They sign in rather than being
  // exempted.
  await signIn(page);
  await clearDecks(page);
});

test("the page says what it imports, and it is not a generic importer", async ({ page }) => {
  await page.goto("/decks");
  // §2.82 — Proxic Deck Builder by name.
  await expect(page.getByText("Proxic Deck Builder")).toBeVisible();
  // The format rules, where someone about to upload will read them.
  await expect(page.getByText(/60.65 cards/)).toBeVisible();
});

test("a real package imports and its artwork renders", async ({ page }) => {
  test.skip(!existsSync(realExport), "no real export (PHASE_02 §2.3)");
  // Forge loads ~97,000 cards on the first resolve.
  test.setTimeout(120_000);

  await page.goto("/decks");
  await page.locator('input[type="file"]').setInputFiles(realExport);

  // §2.85 — the confirmation names what was imported.
  await expect(page.getByText("Basic_Mono_Red_65_Card_Deck").first()).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.locator(".row").filter({ hasText: /^Cards/ })).toContainText("65");
  await expect(page.locator(".row").filter({ hasText: "Distinct cards" })).toContainText("11");
  await expect(page.locator(".row").filter({ hasText: "Artwork stored" })).toContainText("11");

  // §2.87 — the images actually render. Checking naturalWidth, not
  // merely that the element exists: a broken image is still an
  // <img>, and the point of this test is the pipeline.
  await page.getByRole("button", { name: "view" }).click();
  const cards = page.locator(".card img");
  await expect(cards).toHaveCount(11);

  const widths = await cards.evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).naturalWidth),
  );
  expect(widths.every((width) => width > 0)).toBe(true);
  // Served from the display derivative, not the 745px original
  // (§2.134).
  expect(widths.every((width) => width <= 384)).toBe(true);
});

test("a rejected package explains itself without mentioning logs", async ({ page }) => {
  // §2.86 — the error view, which is the half of this page a user
  // meets when something is wrong.
  const directory = mkdtempSync(join(tmpdir(), "proxic-e2e-"));
  const notAPackage = join(directory, "not-a-deck.zip");
  writeFileSync(notAPackage, "this is not a zip archive at all");

  await page.goto("/decks");
  await page.locator('input[type="file"]').setInputFiles(notAPackage);

  await expect(page.locator(".panel.error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/not a deck package/i)).toBeVisible();

  const text = (await page.locator(".panel.error").textContent()) ?? "";
  expect(text).not.toMatch(/stack|exception|logs|docker/i);
});

test("an illegal deck lists every problem at once", async ({ page }) => {
  test.setTimeout(60_000);

  // A deck that breaks two rules: too few cards, and five copies.
  const directory = mkdtempSync(join(tmpdir(), "proxic-e2e-"));
  const illegal = join(directory, "illegal.zip");
  const { execSync } = await import("node:child_process");
  writeFileSync(
    join(directory, "Illegal Deck.txt"),
    "// Illegal Deck\n\n5 Fiery Temper [INR:154]\n5 Rift Bolt [2X2:122]\n",
  );
  execSync(
    `powershell -Command "Compress-Archive -Path '${join(directory, "Illegal Deck.txt")}' -DestinationPath '${illegal}' -Force"`,
  );

  await page.goto("/decks");
  await page.locator('input[type="file"]').setInputFiles(illegal);

  await expect(page.locator(".panel.error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/not legal in Open Format/i).first()).toBeVisible();
  // Both problems, not just the first: fixing one per upload is a
  // worse experience than seeing the list.
  await expect(page.locator(".problems li")).toHaveCount(3);
});

test("importing the same package twice is refused and points at the deck", async ({ page }) => {
  // Any valid package proves this rule, so it runs on CI with the
  // generated fixture rather than skipping.
  const pkg = anyPackage();
  test.skip(!pkg, "no deck package available");
  test.setTimeout(180_000);

  await page.goto("/decks");
  await page.locator('input[type="file"]').setInputFiles(pkg!);
  await expect(page.getByText("Artwork stored")).toBeVisible({ timeout: 90_000 });

  await page.locator('input[type="file"]').setInputFiles(pkg!);
  await expect(page.locator(".panel.error")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/already been imported/i).first()).toBeVisible();
  // Owner decision D3: refusing is right, a dead end is not.
  await expect(page.getByText(/Already imported as/i)).toBeVisible();
});
