// Shared match helpers — PHASE_06 §6.17, §6.38, §6.99–§6.104.
//
// EXTRACTED, not copied. These lived inside match.spec.ts and a
// second match spec re-implemented them from memory: it guessed a
// "Launch" button that is called "Start match", and a deck row that
// is a div rather than a list item. Each guess hung for the whole
// test timeout instead of failing, because a Playwright action
// inherits the test timeout and these specs allow fifteen minutes.
//
// The original file already carried the warning -- "the first
// version inlined it twice and the copies drifted" -- so the fix
// is one definition, not a better copy.
//
// Every locator here was read off the running application.

import { expect, type Page } from "@playwright/test";
import { secondUser, testUser } from "./helpers";

export async function csrfOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "proxicarena_csrf")?.value ?? "";
}

/** Leave whatever a previous run left behind. */
export async function clearEverything(page: Page) {
  const csrf = await csrfOf(page);
  const headers = { "X-CSRF-Token": csrf };

  // A match first: while one is running the room cannot be left
  // (§6.152), which is the whole reason the abandon route exists.
  const match = (await (await page.request.get("/api/matches/current")).json()) as {
    match: { matchId: string } | null;
  };
  if (match.match) {
    await page.request.post(`/api/matches/${match.match.matchId}/abandon`, { headers });
  }

  const room = (await (await page.request.get("/api/rooms/current")).json()) as {
    room: { roomId: string; hostUserId: string } | null;
  };
  if (room.room) {
    await page.request.post(`/api/rooms/${room.room.roomId}/close`, { headers });
    await page.request.post(`/api/rooms/${room.room.roomId}/leave`, { headers });
  }

  // VERIFIED, not assumed. This helper silently did nothing for
  // three runs because it sent the wrong CSRF header name and
  // every call came back 403 -- and the tests then failed far
  // away, in setup, on a room they had not made. A cleanup that
  // cannot prove it worked is worse than none, because it turns
  // a clear failure into a confusing one.
  await expect
    .poll(
      async () => {
        const left = (await (await page.request.get("/api/rooms/current")).json()) as {
          room: { roomId: string } | null;
        };
        return left.room === null;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

export const seatOf = (page: Page, name: string) =>
  page.getByRole("region", { name: "Your game" }).locator("li", { hasText: name });

/** The panel that shows a live match. */
export const matchPanel = (page: Page) => page.getByRole("region", { name: "Your match" });

/**
 * Whichever page is currently being asked for a decision.
 *
 * Only one player holds priority, so exactly one of these has
 * actions — and which one depends on who Forge chose to go first,
 * which is not ours to decide or predict (§6.149's spirit: the
 * engine owns the game).
 */
export async function whoseTurn(a: Page, b: Page): Promise<{ asked: Page; waiting: Page }> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (
      (await matchPanel(a)
        .getByRole("heading", { name: /Your move/ })
        .count()) > 0
    ) {
      return { asked: a, waiting: b };
    }
    if (
      (await matchPanel(b)
        .getByRole("heading", { name: /Your move/ })
        .count()) > 0
    ) {
      return { asked: b, waiting: a };
    }
    await a.waitForTimeout(500);
  }
  throw new Error("neither player was asked for a decision");
}

/**
 * From two signed-in pages to a running Forge game.
 *
 * Shared by both tests because the first version inlined it
 * twice and the copies drifted: one waited for the deck
 * selection to be confirmed before clicking Ready and the other
 * did not, so the second test clicked a button that was still
 * disabled, never readied, and sat on a greyed-out "Prepare
 * match" until the timeout. Every step here asserts the server
 * agreed before the next one depends on it.
 */
export async function startAMatch(host: Page, guest: Page, deckName: string) {
  await host.goto("/play");
  await guest.goto("/play");
  await host.getByRole("button", { name: "Host a game" }).click();
  await host
    .getByRole("region", { name: "Who is here" })
    .locator("li", { hasText: secondUser })
    .getByRole("button", { name: "Invite" })
    .click();
  await guest.getByRole("button", { name: "Accept" }).click();
  await expect(host.getByText("2 of 2")).toBeVisible();

  for (const [page, who] of [
    [host, testUser],
    [guest, secondUser],
  ] as const) {
    const row = page.getByRole("region", { name: "My decks" }).locator("li", {
      hasText: deckName,
    });
    // Tolerant of a seat that already has this deck: the suite
    // runs against a stack that keeps its data, and "Use this
    // deck" simply does not exist once it is chosen.
    const use = row.getByRole("button", { name: "Use this deck" });
    if ((await use.count()) > 0) {
      await use.click();
    }
    // The Ready button stays disabled until the SERVER has the
    // deck, so waiting for this is what makes the next click
    // land at all.
    await expect(row.getByRole("button", { name: "Selected" })).toBeVisible();
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await expect(seatOf(page, who)).toContainText("ready");
  }

  const prepare = host.getByRole("button", { name: "Prepare match" });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(guest.getByText(/match is prepared/i)).toBeVisible();

  await host.getByRole("button", { name: "Start match" }).click();
  // §6.17 — both learn Forge is up WITHOUT refreshing.
  await expect(matchPanel(host).getByText(/The game is running/)).toBeVisible({
    timeout: 600_000,
  });
  await expect(matchPanel(guest).getByText(/The game is running/)).toBeVisible({
    timeout: 600_000,
  });
}
