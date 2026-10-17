// Two users, one deck — PHASE_04 §4.157.
//
// The one test in this phase that cannot be faked. Two independent
// browser contexts are two independent cookie jars, which is the
// only honest way to show that a deck is invisible to someone: a
// single context can be told what to render, but it cannot be told
// what the server will send to somebody else.
//
// Both accounts must exist on the stack under test:
//
//   docker compose exec arena-server /app/bin/arena-admin create Pat
//
// The deck is uploaded through the page, so this also covers §4.51
// (authenticated upload) and §4.52 (ownership bound at import).

import { test, expect, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";

// Importing a real package resolves every card through Forge, which
// takes most of a minute. The file-level default of 45s is right for
// every other test and wrong for these two.
test.describe.configure({ timeout: 240_000 });

const packageDir = join(process.cwd(), "..", "Test Deck");

function realPackage(): string | null {
  try {
    const zip = readdirSync(packageDir).find((name) => name.endsWith(".zip"));
    return zip ? join(packageDir, zip) : null;
  } catch {
    return null;
  }
}

/** Remove every deck this user owns, so a run starts from nothing. */
async function clearOwnDecks(page: Page) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "proxicarena_csrf")!.value;
  const library = (await (await page.request.get("/api/decks")).json()) as {
    mine: { deckId: string }[];
  };
  for (const deck of library.mine) {
    await page.request.delete(`/api/decks/${deck.deckId}`, {
      headers: { "X-CSRF-Token": csrf },
    });
  }
}

test("a deck is private until shared, visible once shared, and gone once revoked", async ({
  browser,
}) => {
  const zip = realPackage();
  test.skip(!zip, "no real deck package available");

  // --- User A -----------------------------------------------------
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signIn(owner);
  await clearOwnDecks(owner);

  await owner.goto("/decks");
  await owner.locator('input[type="file"]').setInputFiles(zip!);
  // The confirmation names the deck, the way decks.spec.ts waits.
  await expect(
    owner.locator("section.panel", { hasText: "My decks" }).locator(".row").first(),
  ).toBeVisible({ timeout: 180_000 });

  const deckName = await owner
    .locator("section.panel", { hasText: "My decks" })
    .locator(".row .name")
    .first()
    .innerText();

  // --- User B, before the share -----------------------------------
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  // The guest may own decks of their own -- since PHASE 4 AMENDMENT 4
  // they may even own their own copy of this very package. Clear
  // them, so "can the guest see it" is about the OWNER's deck and
  // not about a same-named deck of the guest's.
  await clearOwnDecks(guest);
  await guest.goto("/decks");

  // §4.141 — not merely absent from a list: invisible.
  await expect(guest.getByText("Nobody has shared a deck with you.")).toBeVisible();

  // The deck id, so the guest can be caught trying the URL directly.
  const library = (await (await owner.request.get("/api/decks")).json()) as {
    mine: { deckId: string }[];
  };
  const deckId = library.mine[0].deckId;

  // §4.152 — a direct object reference is not authorization.
  expect((await guest.request.get(`/api/decks/${deckId}`)).status()).toBe(404);

  // --- User A shares ----------------------------------------------
  await owner.getByRole("button", { name: "view" }).first().click();
  await expect(owner.getByRole("heading", { name: "Share this deck" })).toBeVisible();
  await owner.getByLabel("Username").fill(secondUser);
  await owner.getByRole("button", { name: "Share", exact: true }).click();
  // Specific, because `/Shared with/` also matches the
  // "Shared with me" panel HEADING, which renders whether or not
  // that list has anything in it. The loose version passed by
  // asserting the heading was visible -- proving nothing about
  // the share -- and failed only when both elements happened to
  // be present at the moment Playwright evaluated it.
  await expect(owner.getByText(`Shared with ${secondUser}`)).toBeVisible();

  // --- User B, after the share ------------------------------------
  await guest.reload();
  const sharedPanel = guest.locator("section.panel", { hasText: "Shared with me" });
  await expect(sharedPanel.locator(".row .name", { hasText: deckName })).toBeVisible();
  // §4.59, §4.73 — and it says whose it is.
  await expect(guest.getByText(new RegExp(`shared by ${testUser}`))).toBeVisible();

  // §4.22 — the recipient may open it, artwork and all.
  await guest.getByRole("button", { name: "view" }).first().click();
  const art = guest.locator(".card-grid img").first();
  await expect(art).toBeVisible();
  // Captured NOW, while the deck is still visible: after the revoke
  // the element is gone, and reading it then waits forever for a
  // locator that will never resolve. (It did, for four minutes.)
  const artUrl = (await art.getAttribute("src"))!;

  // §4.71 — and gets no owner controls.
  await expect(guest.getByRole("heading", { name: "Share this deck" })).toHaveCount(0);
  await expect(guest.getByRole("button", { name: "delete" })).toHaveCount(0);

  // --- User A revokes ---------------------------------------------
  await owner.getByRole("button", { name: "revoke" }).first().click();
  await expect(owner.getByText(/can no longer see this deck/)).toBeVisible();

  // --- User B, after the revoke -----------------------------------
  await guest.reload();
  await expect(guest.getByText("Nobody has shared a deck with you.")).toBeVisible();

  // §4.35 — detail and artwork stop together, not just the listing.
  expect((await guest.request.get(`/api/decks/${deckId}`)).status()).toBe(404);
  expect((await guest.request.get(artUrl)).status()).toBe(404);

  // §4.145 — the owner is untouched throughout.
  await owner.goto("/decks");
  await expect(owner.locator(".row .name", { hasText: deckName })).toBeVisible();

  await ownerContext.close();
  await guestContext.close();
});

test("a recipient cannot delete or re-share, even by calling the API", async ({ browser }) => {
  // §4.80, §4.24 — the UI hides those controls, but hiding is a
  // courtesy. This drives the API directly, which is what an
  // attacker would do.
  const zip = realPackage();
  test.skip(!zip, "no real deck package available");

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signIn(owner);
  await clearOwnDecks(owner);
  await owner.goto("/decks");
  await owner.locator('input[type="file"]').setInputFiles(zip!);
  await expect(
    owner.locator("section.panel", { hasText: "My decks" }).locator(".row").first(),
  ).toBeVisible({ timeout: 180_000 });

  const library = (await (await owner.request.get("/api/decks")).json()) as {
    mine: { deckId: string }[];
  };
  const deckId = library.mine[0].deckId;

  const ownerCsrf = (await ownerContext.cookies()).find(
    (c) => c.name === "proxicarena_csrf",
  )!.value;
  await owner.request.post(`/api/decks/${deckId}/shares`, {
    headers: { "X-CSRF-Token": ownerCsrf, "Content-Type": "application/json" },
    data: { username: secondUser },
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  const guestCsrf = (await guestContext.cookies()).find(
    (c) => c.name === "proxicarena_csrf",
  )!.value;

  // Visible, so 403 rather than 404 — the recipient knows it exists.
  expect((await guest.request.get(`/api/decks/${deckId}`)).status()).toBe(200);
  expect(
    (
      await guest.request.delete(`/api/decks/${deckId}`, {
        headers: { "X-CSRF-Token": guestCsrf },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await guest.request.post(`/api/decks/${deckId}/shares`, {
        headers: { "X-CSRF-Token": guestCsrf, "Content-Type": "application/json" },
        data: { username: testUser },
      })
    ).status(),
  ).toBe(403);
  // §4.99 — nor the sharing graph.
  expect((await guest.request.get(`/api/decks/${deckId}/shares`)).status()).toBe(403);

  // The deck survived all of it.
  expect((await owner.request.get(`/api/decks/${deckId}`)).status()).toBe(200);

  await ownerContext.close();
  await guestContext.close();
});
