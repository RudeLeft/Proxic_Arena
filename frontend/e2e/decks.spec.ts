// Deck import, through the real UI — PHASE_02 §2.81–§2.87.
//
// Playwright can set a file input, which is the one part of this
// page a person cannot check from a terminal and I cannot click
// through by hand. Everything here runs against the actual running
// stack.

import { test, expect, type Page } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import { chooseDeck, clearEverything, inviteIn, openRoom, sharedDeck } from "./match-helpers";
import { execFileSync } from "node:child_process";
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

  // §2.85 — the confirmation names what was imported, and counts it.
  const confirmation = page.getByRole("status").filter({ hasText: "imported" });
  await expect(confirmation).toContainText("Basic_Mono_Red_65_Card_Deck imported", {
    timeout: 90_000,
  });
  await expect(confirmation).toContainText("65 cards, 11 distinct, artwork stored for all of them");

  // §2.87 — the images actually render. Checking naturalWidth, not
  // merely that the element exists: a broken image is still an
  // <img>, and the point of this test is the pipeline.
  await page.getByRole("button", { name: "view" }).click();
  const cards = page.getByRole("region", { name: "Cards" }).getByRole("img");
  await expect(cards).toHaveCount(11);
  // Amendment 10 — banded the way Forge sorted them; the bands add
  // up to the deck.
  const bands = page.getByRole("region", { name: "Cards" }).getByRole("group");
  await expect(bands.first()).toHaveAccessibleName(/^Lands, \d+ cards$/);
  const counts = await bands.evaluateAll((groups) =>
    groups.map((group) =>
      Number(/, (\d+) cards$/.exec(group.getAttribute("aria-label") ?? "")?.[1]),
    ),
  );
  expect(counts.reduce((sum, n) => sum + n, 0)).toBe(65);
  await expect(page.getByRole("region", { name: "Cards" })).not.toContainText("Not sorted yet");

  // Wait for the browser to finish DECODING them, not merely for
  // the elements to exist. `toHaveCount` is satisfied the moment
  // the <img> tags are in the DOM, and naturalWidth is 0 until the
  // bytes have arrived and been decoded — so reading it straight
  // afterwards is a race the test loses occasionally.
  //
  // Diagnosed from a kept trace after this flaked once in four
  // full runs: eleven real card images, and one of them had not
  // finished.
  await expect
    .poll(
      async () =>
        await cards.evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).complete),
        ),
      { message: "the card images never finished loading" },
    )
    .toBe(true);

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

  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/not a deck package/i)).toBeVisible();

  const text = (await page.getByRole("alert").textContent()) ?? "";
  expect(text).not.toMatch(/stack|exception|logs|docker/i);
});

test("an illegal deck lists every problem at once", async ({ page }) => {
  test.setTimeout(60_000);

  // A deck that breaks two rules: too few cards, and five copies.
  const directory = mkdtempSync(join(tmpdir(), "proxic-e2e-"));
  const illegal = join(directory, "illegal.zip");
  writeFileSync(
    join(directory, "Illegal Deck.txt"),
    "// Illegal Deck\n\n5 Fiery Temper [INR:154]\n5 Rift Bolt [2X2:122]\n",
  );
  // Node, not PowerShell. The PowerShell form worked on the machine
  // it was written on and failed the first time CI ran this on
  // Linux -- shelling out to the platform for a zip is a dependency
  // on the platform.
  //
  // execFileSync with an argument array, not a command string: this
  // repository lives under a path containing spaces, and the
  // string form needed quoting that the first attempt got wrong.
  // An array has nothing to quote.
  execFileSync("node", [
    join(process.cwd(), "..", "scripts", "make-zip.mjs"),
    illegal,
    join(directory, "Illegal Deck.txt"),
  ]);

  await page.goto("/decks");
  await page.locator('input[type="file"]').setInputFiles(illegal);

  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/not legal in Open Format/i).first()).toBeVisible();
  // Both problems, not just the first: fixing one per upload is a
  // worse experience than seeing the list.
  await expect(page.getByRole("alert").getByRole("listitem")).toHaveCount(3);
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
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/already been imported/i).first()).toBeVisible();
  // Owner decision D3: refusing is right, a dead end is not.
  await expect(page.getByText(/Already imported as/i)).toBeVisible();
});

/** A legal, art-free package whose decklist declares [name]: 60 or more Mountains. */
function mountainPackage(directory: string, file: string, name: string, mountains: number) {
  const list = join(directory, `${file}.txt`);
  writeFileSync(list, `// ${name}\n\n${mountains} Mountain\n`);
  const zip = join(directory, `${file}.zip`);
  execFileSync("node", [join(process.cwd(), "..", "scripts", "make-zip.mjs"), zip, list]);
  return zip;
}

test("one name per player: a clash asks for another, rename refuses one, delete asks first", async ({
  page,
}) => {
  // PHASE_07 §7.65 and Amendment 10, through real clicks (§7.68).
  // Two DIFFERENT packages (so not the duplicate-package rule) that
  // declare the SAME name.
  test.setTimeout(240_000);
  const directory = mkdtempSync(join(tmpdir(), "proxic-e2e-"));
  const first = mountainPackage(directory, "clash-a", "Clash Deck", 60);
  const second = mountainPackage(directory, "clash-b", "Clash Deck", 61);
  const mine = page.getByRole("region", { name: "My decks" });

  await page.goto("/decks");
  await page.locator('input[type="file"]').setInputFiles(first);
  await expect(page.getByText("Clash Deck imported")).toBeVisible({ timeout: 120_000 });

  // The clash: refused, said in words, and the name offered back.
  await page.locator('input[type="file"]').setInputFiles(second);
  await expect(page.getByRole("alert")).toContainText("already have a deck called", {
    timeout: 120_000,
  });
  const importAs = page.getByLabel("Import it as");
  await expect(importAs).toHaveValue("Clash Deck");
  await importAs.fill("Clash Deck II");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Clash Deck II imported")).toBeVisible({ timeout: 120_000 });
  await expect(mine.getByRole("listitem")).toHaveCount(2);

  // Rename, refused into a name you use, then accepted.
  await page.getByRole("button", { name: "View Clash Deck II" }).click();
  await expect(page.getByRole("heading", { name: "Clash Deck II" })).toBeVisible();
  await page.getByRole("button", { name: "Rename" }).click();
  const name = page.getByLabel("Deck name");
  await name.fill("clash deck");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("already have a deck called");
  await name.fill("Sixty-one Mountains");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Sixty-one Mountains" })).toBeVisible();
  await expect(mine.getByText("Sixty-one Mountains")).toBeVisible();
  // Banded by Forge: all lands.
  await expect(
    page.getByRole("region", { name: "Cards" }).getByRole("group", { name: "Lands, 61 cards" }),
  ).toBeVisible();

  // Delete asks first; Keep keeps it.
  await page.getByRole("button", { name: "Delete Sixty-one Mountains" }).click();
  await expect(mine.getByText("Delete Sixty-one Mountains?")).toBeVisible();
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(mine.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Delete Sixty-one Mountains" }).click();
  await mine.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(mine.getByRole("listitem")).toHaveCount(1);
  // It was open; it is not any more.
  await expect(page.getByText("Choose View on a deck")).toBeVisible();
});

test("a deck selected in a room can be renamed, and the other player sees the new name", async ({
  browser,
}) => {
  // PHASE_07 P7-AA, §7.65 owner decision 17: everything refers to the deck
  // id, so a rename while the deck is chosen in a room is allowed -- and
  // Pat, playing RudeLeft's shared copy, is shown the new name.
  test.setTimeout(300_000);
  const directory = mkdtempSync(join(tmpdir(), "proxic-e2e-"));
  const stamp = Date.now().toString(36);
  const pkg = mountainPackage(directory, `Rename Room ${stamp}`, `Rename Room ${stamp}`, 60);

  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const deck = await sharedDeck(host, guest, pkg);
  await host.goto("/play");
  await guest.goto("/play");
  await openRoom(host);
  await inviteIn(host, guest, secondUser);
  await chooseDeck(host, deck);
  await chooseDeck(guest, deck, testUser);

  // RudeLeft renames it in the Deck Depot, through real clicks.
  const renamed = `Renamed Room ${stamp}`;
  await host.goto("/decks");
  await host.getByRole("button", { name: `View ${deck}` }).click();
  // exact: the deck's own name has "Rename" in it.
  await host.getByRole("button", { name: "Rename", exact: true }).click();
  await host.getByLabel("Deck name").fill(renamed);
  await host.getByRole("button", { name: "Save", exact: true }).click();
  await expect(host.getByRole("heading", { name: renamed })).toBeVisible();

  // Pat, still in the room, sees the new name on the deck chosen there.
  const patsChoice = guest.getByLabel("Your deck for this match");
  await expect(patsChoice.locator("option:checked")).toHaveText(new RegExp(`^${renamed} — `), {
    timeout: 15_000,
  });
  // And the room still holds the deck: nobody had to choose again.
  await host.goto("/play");
  await expect(host.getByLabel("Your deck for this match").locator("option:checked")).toHaveText(
    new RegExp(`^${renamed} — `),
  );

  await clearEverything(host);
  await clearEverything(guest);
});
