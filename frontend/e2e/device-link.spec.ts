// Spec 0021 (F-0021-H) — the Account page links a computer and removes it,
// in a real browser against the real stack.
//
// The Deck Builder's half -- trading the code for a token -- is a plain
// POST any client makes; it is made here with the page's own request
// context, so the test needs nothing but the stack.

import { expect, test } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";

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

test("an administrator sees the computer on the Computers tab, with its address, and removes it (spec 0027)", async ({
  browser,
  playwright,
}) => {
  const player = await (await browser.newContext()).newPage();
  await signInAs(player, secondUser, secondPassword);
  await player.goto("/account");
  const panel = player.getByRole("region", { name: "Deck Builder" });
  await panel.getByRole("button", { name: "Link a computer" }).click();
  const code = (await panel.getByLabel("Link code").textContent()) ?? "";
  const computer = `Admin test PC ${Date.now() % 100_000}`;
  const deckBuilder = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const linked = await deckBuilder.post("/api/auth/device-link", {
    data: { code, deviceName: computer },
  });
  const { token } = (await linked.json()) as { token: string };
  const bearer = { headers: { Authorization: `Bearer ${token}` } };
  expect((await deckBuilder.get("/api/deck-rules", bearer)).status()).toBe(200);

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin);
  await admin.goto("/admin?tab=computers");
  const tab = admin.getByRole("region", { name: "Linked computers" });
  const line = tab.getByRole("listitem").filter({ hasText: computer });
  await expect(line).toBeVisible();
  await expect(line).toContainText(/Just now|ago/);
  await expect(line).toContainText("from ");
  expect(await admin.content()).not.toContain(token);

  // Remove asks first, in the row; Cancel changes nothing.
  const remove = line.getByRole("button", { name: new RegExp(`^Remove ${computer} from`) });
  await remove.click();
  await line.getByRole("button", { name: "Cancel" }).click();
  expect((await deckBuilder.get("/api/deck-rules", bearer)).status()).toBe(200);
  await remove.click();
  await line.getByRole("button", { name: "Remove computer" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "is no longer linked" })).toBeVisible();
  await expect(line).toHaveCount(0);
  expect((await deckBuilder.get("/api/deck-rules", bearer)).status()).toBe(401);
  await deckBuilder.dispose();
  await player.context().close();
  await admin.context().close();
});
