// Plain words on the player pages -- spec 0114 (F-0114-F), AGENTS TEST-012.
//
// 1. Deck import. Since spec 0022 the Deck Depot has no upload box: a deck
//    arrives from the Deck Builder, which shows Arena's words. So the two
//    packages go through the import route with the player's own session
//    (as decks.spec.ts does), and the reply's words are read: a card Arena
//    doesn't know ("Line 2, Mistyped Goblin: Arena doesn't know this card
//    yet.", W2-001) and a picture that is not one ("The picture for
//    Lightning Bolt is not a PNG or JPEG file.", W2-086 / W2-087). The
//    import stops at the first of the two (cards are checked before
//    pictures), so they are two packages.
// 2. The lobby. The host's deck has five Lightning Bolts (an import refuses
//    five copies itself, so the stored deck is given a fifth in the database,
//    which needs PROXIC_E2E_CONTAINER, as match-concurrency does). Both
//    players REALLY click into the room and Ready; the host REALLY clicks
//    Start match and reads the one sentence on its own deck's notice
//    (W2-105, W2-106).
// 3. Signing in too often (W2-114): a made-up username fails ten times on the
//    sign-in page (the throttle is per username and address, so no real
//    account is touched) and the eleventh says "about 15 minutes".
// 4. /status (W2-082): a player sees the admin page's not-for-you notice and
//    no engine words; the administrator sees "Rules engine".
//
// Words are read from roles and data attributes and compared in one place
// each (PROTO-006). Stills go to PROXIC_E2E_STILLS when it is set. Decks:
// protocol/fixtures/pages-deck (CI builds both packages); locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/pages-deck.zip" protocol/fixtures/pages-deck
//   node scripts/make-ci-deck.mjs "Test Deck/pages-bad-picture-deck.zip" protocol/fixtures/pages-deck "--not-a-picture=Lightning Bolt"

import { test, expect, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser, uploadPackage } from "./helpers";
import {
  chooseDeck,
  clearEverything,
  expectReady,
  inviteIn,
  openRoom,
  realClick,
  seatOf,
} from "./match-helpers";

test.describe.configure({ timeout: 600_000 });

const decks = join(process.cwd(), "..", "Test Deck");
const pagesDeck = join(decks, "pages-deck.zip");
const badPicture = join(decks, "pages-bad-picture-deck.zip");
const guestDeck = join(decks, "ci-deck.zip");
const STILLS = process.env.PROXIC_E2E_STILLS;
const container = process.env.PROXIC_E2E_CONTAINER;

/** The new words (docs/features/wording/0114-wording-table.md). */
const WORDS = {
  unknown: "Line 2, Mistyped Goblin: Arena doesn't know this card yet.",
  picture: "The picture for Lightning Bolt is not a PNG or JPEG file.",
  copies: 'Open Format allows at most four copies of "Lightning Bolt". This deck has five.',
  throttle: "Too many sign-in attempts. Try again in about 15 minutes.",
  notForYou: "This page is for administrators.",
  engine: "Rules engine",
};

async function still(target: Locator | Page, file: string) {
  if (!STILLS) return;
  mkdirSync(STILLS, { recursive: true });
  await target.screenshot({ path: join(STILLS, file), timeout: 10_000 }).catch(() => undefined);
}

type Library = { mine: { deckId: string; displayName: string }[] };
const library = async (page: Page) =>
  (await (await page.request.get("/api/decks")).json()) as Library;

/** This player's deck named [name], imported from [pkg] when it has none. */
async function ownDeck(page: Page, pkg: string, name: string): Promise<string> {
  const find = async () => (await library(page)).mine.find((d) => d.displayName === name);
  if (!(await find())) {
    const sent = await uploadPackage(page, pkg);
    expect([201, 409], await sent.text()).toContain(sent.status());
  }
  await expect.poll(async () => (await find()) !== undefined, { timeout: 120_000 }).toBe(true);
  return (await find())!.deckId;
}

/** psql in the stack's database container. */
function sql(statement: string): string {
  const db = container!.replace("arena-server", "postgres");
  return execFileSync(
    "docker",
    ["exec", db, "sh", "-c", `psql -U "$POSTGRES_USER" -d proxic -Atc "${statement}"`],
    { encoding: "utf-8" },
  ).trim();
}

test("deck import: a card Arena doesn't know and a picture that isn't one, in plain words", async ({
  page,
}) => {
  test.skip(!existsSync(badPicture), "no bad-picture package built");
  await signInAs(page, secondUser, secondPassword);
  await page.goto("/decks");

  // The unknown card: 60 cards, so only the card check can refuse it.
  const directory = mkdtempSync(join(tmpdir(), "proxic-e2e-0114-"));
  const list = join(directory, "Unknown Card Deck.txt");
  writeFileSync(list, "56 Mountain\n4 Mistyped Goblin\n");
  const unknownPkg = join(directory, "unknown-card-deck.zip");
  execFileSync("node", [join(process.cwd(), "..", "scripts", "make-zip.mjs"), unknownPkg, list]);
  const unknown = await uploadPackage(page, unknownPkg);
  expect(unknown.status()).toBe(422);
  const unknownBody = (await unknown.json()) as { errorCode: string; problems: string[] };
  console.log(`0114 unknown card: ${JSON.stringify(unknownBody)}`);
  expect(unknownBody.errorCode, "the code is unchanged (PROTO-006)").toBe("CARDS_NOT_RESOLVED");
  expect(unknownBody.problems).toEqual([WORDS.unknown]);

  const bad = await uploadPackage(page, badPicture);
  expect(bad.status()).toBe(422);
  const badBody = (await bad.json()) as { errorCode: string; detail: string; problems: string[] };
  console.log(`0114 bad picture: ${JSON.stringify(badBody)}`);
  expect(badBody.errorCode).toBe("INVALID_ARTWORK");
  expect(badBody.detail).toBe("Some pictures in this deck can't be used:");
  expect(badBody.problems).toEqual([WORDS.picture]);
  for (const words of [JSON.stringify(unknownBody), JSON.stringify(badBody)]) {
    expect(words).not.toMatch(/forge|NOT_A_PICTURE|real_cards\//i);
  }
});

test("the lobby refuses a five-copy deck in one sentence, after real clicks", async ({
  browser,
}) => {
  test.skip(!container, "PROXIC_E2E_CONTAINER not set: the fifth copy is put in the database");
  test.skip(!existsSync(pagesDeck) || !existsSync(guestDeck), "no pages or CI deck package built");

  const hostContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);
  const guestContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    await host.goto("/decks");
    const deckId = await ownDeck(host, pagesDeck, "pages-deck");
    expect(deckId).toMatch(/^[0-9a-f-]{36}$/);
    // The fifth Lightning Bolt, as a deck kept from before a rule change would hold it.
    sql(
      `UPDATE deck_entry SET quantity = 5 WHERE deck_id = '${deckId}' AND card_name = 'Lightning Bolt'; ` +
        `UPDATE imported_deck SET total_cards = 61 WHERE deck_id = '${deckId}'`,
    );
    expect(
      sql(
        `SELECT quantity FROM deck_entry WHERE deck_id = '${deckId}' AND card_name = 'Lightning Bolt'`,
      ),
    ).toBe("5");
    await guest.goto("/decks");
    await ownDeck(guest, guestDeck, "ci-deck");

    await host.goto("/play");
    await guest.goto("/play");
    await openRoom(host);
    await inviteIn(host, guest, secondUser);
    await chooseDeck(host, "pages-deck");
    await chooseDeck(guest, "ci-deck");
    for (const [page, who, others] of [
      [host, testUser, [] as string[]],
      [guest, secondUser, [testUser]],
    ] as const) {
      for (const other of others) await expectReady(seatOf(page, other));
      const ready = page.getByRole("button", { name: "I'm ready" });
      expect(await realClick(page, ready), "the Ready button takes a real click").toBe(true);
      await expectReady(seatOf(page, who));
    }

    const start = host.getByRole("button", { name: "Start match" });
    await expect(start).toBeEnabled();
    expect(await realClick(host, start), "Start match takes a real click").toBe(true);

    const notice = host.getByRole("region", { name: "Notices" }).locator('[data-notice="setup"]');
    await expect(notice).toBeVisible({ timeout: 120_000 });
    const said = (await notice.innerText()).replace(/\s+/g, " ");
    console.log(`0114 five copies: ${said}`);
    await still(notice, "lobby-five-copies.png");
    await still(host, "lobby-five-copies-page.png");
    expect(said).toContain(WORDS.copies);
    expect(said).not.toMatch(/; |\b4 copies|has 5\b/);
  } finally {
    await clearEverything(host);
    await clearEverything(guest);
    await hostContext.close();
    await guestContext.close();
  }
});

test("signing in too often says about 15 minutes, not seconds", async ({ page }) => {
  // A username nobody has: the throttle keys on username and address.
  const nobody = `nobody-0114-${Date.now().toString(36)}`;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/login");
  const alert = page.locator("form").getByRole("alert").or(page.getByRole("alert"));
  for (let attempt = 1; attempt <= 11; attempt++) {
    await page.getByLabel("Username").fill(nobody);
    await page.getByLabel("Password", { exact: true }).fill("not the password at all");
    const button = page.getByRole("button", { name: "Sign in" });
    await expect(button).toBeEnabled();
    const answered = page.waitForResponse((r) => r.url().endsWith("/api/auth/login"));
    expect(await realClick(page, button), "Sign in takes a real click").toBe(true);
    const reply = await answered;
    if (reply.status() === 429) break;
    expect(attempt, "the throttle answers by the eleventh try").toBeLessThan(11);
  }
  const notice = alert.first();
  await expect(notice).toBeVisible();
  const said = (await notice.innerText()).replace(/\s+/g, " ");
  console.log(`0114 throttle: ${said}`);
  await still(page, "sign-in-throttle.png");
  expect(said).toContain(WORDS.throttle);
  expect(said).not.toMatch(/seconds/);
});

test("/status: a player is told it is for administrators; the administrator sees Rules engine", async ({
  browser,
}) => {
  const playerContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const player = await playerContext.newPage();
  const adminContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const admin = await adminContext.newPage();
  try {
    await signInAs(player, secondUser, secondPassword);
    await player.goto("/status");
    const notForYou = player.getByRole("status").filter({ hasText: WORDS.notForYou });
    await expect(notForYou).toBeVisible();
    await expect(player.getByText(WORDS.engine, { exact: true })).toHaveCount(0);
    await expect(player.locator("main")).not.toContainText(/forge|java/i);
    // The server is the source: the player's version reply has no engine fields.
    const version = (await (await player.request.get("/api/version")).json()) as Record<
      string,
      unknown
    >;
    expect(Object.keys(version)).not.toContain("forgeRelease");
    expect(Object.keys(version)).not.toContain("forgeCommit");
    expect(Object.keys(version)).not.toContain("javaVersion");
    await still(player, "status-player.png");

    await signIn(admin);
    await admin.goto("/status");
    await expect(admin.getByText(WORDS.engine, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByText("Forge Runtime")).toHaveCount(0);
    await expect(admin.getByRole("status").filter({ hasText: WORDS.notForYou })).toHaveCount(0);
    await still(admin, "status-admin.png");
  } finally {
    await playerContext.close();
    await adminContext.close();
  }
});
