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

import { expect, type Locator, type Page } from "@playwright/test";
import { basename, extname } from "node:path";
import { secondUser, shareOpenDeckWith, testUser } from "./helpers";

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

/**
 * This seat shows READY -- and not "not ready", which also contains
 * the word. `toContainText("ready")` passed on a seat that was not
 * ready, so a Ready refused for a stale room revision went unseen
 * until "Prepare match" never enabled, two runs in a dozen.
 */
export async function expectReady(seat: Locator) {
  await expect(seat).toContainText("ready");
  await expect(seat).not.toContainText("not ready");
}

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
export async function startAMatch(
  host: Page,
  guest: Page,
  deckName: string,
  // false stops at the first pregame question instead of answering
  // it -- for tests whose subject IS a question nobody has answered.
  // Who is in the two seats, for the tests that seat somebody
  // other than RudeLeft and Pat.
  {
    settle = true,
    hostName = testUser,
    guestName = secondUser,
  }: { settle?: boolean; hostName?: string; guestName?: string } = {},
) {
  await host.goto("/play");
  await guest.goto("/play");
  await host.getByRole("button", { name: "Host a game" }).click();
  await host
    .getByRole("region", { name: "Who is here" })
    .locator("li", { hasText: guestName })
    .getByRole("button", { name: "Invite" })
    .click();
  await guest.getByRole("button", { name: "Accept" }).click();
  await expect(host.getByText("2 of 2")).toBeVisible();

  const readied: string[] = [];
  for (const [page, who] of [
    [host, hostName],
    [guest, guestName],
  ] as const) {
    // The host's OWN copy, and the guest's copy shared by THIS
    // host. With more than two players on one stack the same
    // package can reach a player from several people, under one
    // name, and "the row that says the name" is then two rows.
    const named = page.getByRole("region", { name: "My decks" }).locator("li", {
      hasText: deckName,
    });
    const row =
      page === host
        ? named.filter({ hasNotText: "shared by" })
        : named.filter({ hasText: `shared by ${hostName}` });
    // Tolerant of a seat that already has this deck: the suite
    // runs against a stack that keeps its data, and "Use this
    // deck" simply does not exist once it is chosen.
    //
    // WAIT for the row before asking which state it is in. Counting
    // at once raced the deck list rendering: on CI's slower runner
    // the guest's list was not there yet, the count was 0, the click
    // was skipped, and the test waited for a "Selected" that nobody
    // had asked for. It failed two CI runs in three and never locally.
    const use = row.getByRole("button", { name: "Use this deck" });
    await expect(row.getByRole("button", { name: /^(Use this deck|Selected)$/ })).toBeVisible();
    if ((await use.count()) > 0) {
      await use.click();
    }
    // The Ready button stays disabled until the SERVER has the
    // deck, so waiting for this is what makes the next click
    // land at all.
    await expect(row.getByRole("button", { name: "Selected" })).toBeVisible();
    // Click Ready only once THIS page has seen the seats already
    // ready. Its Ready carries the room revision it holds, and one
    // sent before the other seat's update arrived is refused as
    // stale ("The room changed while you were deciding") -- the
    // server being right, the test being early.
    for (const earlier of readied) await expectReady(seatOf(page, earlier));
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await expectReady(seatOf(page, who));
    readied.push(who);
  }

  const prepare = host.getByRole("button", { name: "Prepare match" });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(guest.getByText(/match is prepared/i)).toBeVisible();

  await host.getByRole("button", { name: "Start match" }).click();

  // PREGAME COMES FIRST, and nobody else will answer it.
  //
  // Keeping or mulliganing, and playing or drawing, are real
  // questions now — they used to be answered by the adapter
  // returning a default. They are asked BEFORE the first priority
  // window, which is the moment the match row turns RUNNING, so a
  // test that waits for "The game is running" without answering
  // them waits for ever.
  if (!settle) return;
  await settlePregame(host, guest);

  // §6.17 — both learn Forge is up WITHOUT refreshing.
  await expect(matchPanel(host).getByText(/The game is running/)).toBeVisible({
    timeout: 600_000,
  });
  await expect(matchPanel(guest).getByText(/The game is running/)).toBeVisible({
    timeout: 600_000,
  });
}

/**
 * Answer the pregame questions, whichever seat is asked.
 *
 * Keeps every hand and plays first — the openings a test wants are
 * the boring ones. Each is mandatory, so there is nothing to pass
 * on; the first option is "Keep this hand" and "Play first".
 *
 * Bounded by the clock rather than a count, because a player may
 * be asked several times: each mulligan asks again.
 */
export async function settlePregame(host: Page, guest: Page) {
  const pregame = /Keep or mulligan|Play or draw|Put a card back|Begin with it on the battlefield/;
  const deadline = Date.now() + 300_000;

  while (Date.now() < deadline) {
    const asked = (await matchPanel(host).getByRole("heading", { name: pregame }).count())
      ? host
      : (await matchPanel(guest).getByRole("heading", { name: pregame }).count())
        ? guest
        : null;

    if (!asked) {
      // Either pregame is over, or the next question has not
      // arrived yet. Running is the signal that it is over.
      if (
        (await matchPanel(host)
          .getByText(/The game is running/)
          .count()) > 0
      ) {
        return;
      }
      await host.waitForTimeout(100);
      continue;
    }

    const options = matchPanel(asked).getByRole("listitem").getByRole("button");
    if ((await options.count()) === 0) {
      await asked.waitForTimeout(100);
      continue;
    }

    // AGENTS TEST-011 — leave the pregame question to LOOK AT.
    // It is answered and gone within a second of appearing, so
    // without this nobody ever sees the first question of the
    // game. Overwritten each time; the last one wins.
    await asked.screenshot({ path: "test-results/seen/pregame.png", fullPage: true });

    await options.first().click();
    await asked.waitForTimeout(60);
  }
}

/**
 * A deck the host owns and the guest can select — Phase 5's
 * starting point for every match test.
 *
 * Checked through the API rather than page wording: what matters is
 * that the guest CAN select it, which is the server's fact.
 */
export async function sharedDeck(
  host: Page,
  guest: Page,
  pkg: string,
  guestName: string = secondUser,
): Promise<string> {
  await host.goto("/decks");
  const mine = async () =>
    (
      (await (await host.request.get("/api/decks")).json()) as {
        mine: { deckId: string; displayName: string }[];
      }
    ).mine;
  // THIS package's deck, by name -- a deck's display name is its
  // package filename. The first version took the host's first deck,
  // which was right only while each account had one; RudeLeft now
  // owns several, and "first" is whatever the server lists first.
  const wanted = basename(pkg, extname(pkg));
  const ours = async () => (await mine()).find((deck) => deck.displayName === wanted);
  if (!(await ours())) {
    await host.locator('input[type="file"]').setInputFiles(pkg);
    await expect(host.getByText("Artwork stored")).toBeVisible({ timeout: 600_000 });
    await expect.poll(async () => (await ours()) !== undefined, { timeout: 60_000 }).toBe(true);
  }
  const { deckId, displayName: deckName } = (await ours())!;
  // By ID, not by name. With several hosts on one stack the guest
  // may already hold a same-named deck from somebody else, and a
  // name check would then decide THIS deck was shared and skip
  // sharing it.
  const guestCanSee = async () =>
    (
      (await (await guest.request.get("/api/decks")).json()) as {
        sharedWithMe: { deckId: string }[];
      }
    ).sharedWithMe.some((deck) => deck.deckId === deckId);
  if (!(await guestCanSee())) {
    // THIS deck's row, by its own View button: "View <name>".
    await host
      .getByRole("region", { name: "My decks" })
      .getByRole("listitem")
      .filter({ hasText: deckName })
      .getByRole("button", { name: "view" })
      .first()
      .click();
    await shareOpenDeckWith(host, guestName);
    await expect.poll(guestCanSee, { timeout: 30_000 }).toBe(true);
  }
  return deckName;
}
