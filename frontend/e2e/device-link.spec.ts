// Spec 0021 (F-0021-H) — the Account page links a computer and removes it,
// in a real browser against the real stack.
//
// The Deck Builder's half -- trading the code for a token -- is a plain
// POST any client makes; it is made here with the page's own request
// context, so the test needs nothing but the stack.

import { expect, test } from "@playwright/test";
import { secondPassword, secondUser, signInAs } from "./helpers";

test("a code from the Account page links a computer, and Remove unlinks it", async ({
  page,
  playwright,
}) => {
  await signInAs(page, secondUser, secondPassword);
  await page.goto("/account");
  const panel = page.getByRole("region", { name: "Deck Builder" });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Link a computer" }).click();
  const code = (await panel.getByLabel("Link code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(panel.getByRole("status")).toContainText("It works once");
  await page.screenshot({ path: "test-results/device-link-code.png", fullPage: true });

  // The Deck Builder's side: the code for a token, then the deck rules.
  const deckBuilder = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const linked = await deckBuilder.post("/api/auth/device-link", {
    data: { code, deviceName: "Browser test PC" },
  });
  expect(linked.status()).toBe(201);
  const { token } = (await linked.json()) as { token: string };
  const rules = await deckBuilder.get("/api/deck-rules", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(rules.status()).toBe(200);
  // A device token opens nothing else.
  const decks = await deckBuilder.get("/api/decks", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(decks.status()).toBe(401);

  // The page lists it once reloaded, and Remove ends it at once.
  await page.reload();
  const row = panel.getByText("Browser test PC");
  await expect(row).toBeVisible();
  await page.screenshot({ path: "test-results/device-link-listed.png", fullPage: true });
  await panel.getByRole("button", { name: "Remove Browser test PC" }).click();
  await expect(row).toHaveCount(0);
  const after = await deckBuilder.get("/api/deck-rules", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(after.status()).toBe(401);
  await deckBuilder.dispose();
});
