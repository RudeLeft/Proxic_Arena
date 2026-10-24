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

/** Every step Forge gives priority in (PHASE_07 §7.53). */
export const EVERY_STEP = [
  "UPKEEP",
  "DRAW",
  "MAIN1",
  "COMBAT_BEGIN",
  "COMBAT_DECLARE_ATTACKERS",
  "COMBAT_DECLARE_BLOCKERS",
  "COMBAT_FIRST_STRIKE_DAMAGE",
  "COMBAT_DAMAGE",
  "COMBAT_END",
  "MAIN2",
  "END_OF_TURN",
  "CLEANUP",
];

/** Set this account's priority stops (PHASE_07 §7.53). */
export async function setStops(page: Page, own: string[], opponent: string[]) {
  const response = await page.request.put("/api/matches/stops", {
    headers: { "X-CSRF-Token": await csrfOf(page) },
    data: { own, opponent },
  });
  expect(response.ok(), "the stops were not saved").toBe(true);
}

/** Leave whatever a previous run left behind. */
export async function clearEverything(page: Page) {
  const csrf = await csrfOf(page);
  const headers = { "X-CSRF-Token": csrf };

  // The game specs SCRIPT every step -- they answer each priority window
  // themselves -- so their accounts are asked at every step, as before
  // stops existed (§7.53: every stop on is the old behaviour exactly).
  // match-stops.spec.ts sets the real defaults for itself.
  await setStops(page, EVERY_STEP, EVERY_STEP);

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

// --- the Lobby (PHASE_07 §7.64) -------------------------------------------
//
// The room you are in is the brass-edged card on the room list; its
// seats are pills whose (visually hidden) words say ", ready" or
// ", not ready". Read off the running page.

/** The room card you are in, with your deck, ready and Start match inside it. */
export const yourRoom = (page: Page) => page.locator("article.pa-room-mine");

export const seatOf = (page: Page, name: string) =>
  yourRoom(page).locator(".pa-seat", { hasText: name });

/** Open a room from the Lobby (Amendment 9), optionally named. */
export async function openRoom(page: Page, name?: string) {
  if (name) await page.getByPlaceholder("Room name (optional)").fill(name);
  await page.getByRole("button", { name: "Open a room" }).click();
  await expect(yourRoom(page)).toBeVisible();
}

/**
 * The host invites [guestName] from the Players list and the guest
 * accepts in the invitation box; both seats are then filled.
 */
export async function inviteIn(host: Page, guest: Page, guestName: string) {
  await host
    .getByRole("region", { name: "Players" })
    .getByRole("button", { name: new RegExp(`^Invite ${guestName}$`, "i") })
    .click();
  await guest.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
  await expect(yourRoom(host).locator(".pa-room-taken")).toHaveText("2/2");
  await expect(yourRoom(guest)).toBeVisible();
}

/**
 * Choose [deckName] for this match: your own copy, or -- with
 * [sharedBy] -- the copy that player shared with you. The same
 * package can reach a player from several people under one name, so
 * "the option that says the name" is not enough on its own.
 */
export async function chooseDeck(page: Page, deckName: string, sharedBy?: string) {
  const select = page.getByLabel("Your deck for this match");
  await expect(select.locator("option", { hasText: deckName }).first()).toBeAttached();
  const value = await select
    .locator("option")
    .evaluateAll(
      (options, [name, owner]) =>
        options
          .map((o) => o as HTMLOptionElement)
          .find(
            (o) =>
              o.text.startsWith(`${name} — `) &&
              (owner ? o.text.includes(`(shared by ${owner})`) : !o.text.includes("(shared by")),
          )?.value ?? "",
      [deckName, sharedBy ?? ""] as const,
    );
  expect(value, `no option for ${deckName}${sharedBy ? ` shared by ${sharedBy}` : ""}`).not.toBe(
    "",
  );
  if ((await select.inputValue()) !== value) await select.selectOption(value);
  // Adopted from the server's room, not predicted (§5.132): this is
  // what makes the Ready that follows land.
  await expect(select).toHaveValue(value);
}

/** Press "I'm ready", and wait until the server says you are. */
export async function markReady(page: Page) {
  await page.getByRole("button", { name: "I'm ready" }).click();
  await expect(page.getByRole("button", { name: "Ready ✓" })).toBeVisible();
}

/**
 * This seat shows READY -- and not "not ready", which also contains
 * the word. `toContainText("ready")` passed on a seat that was not
 * ready, so a Ready refused for a stale room revision went unseen
 * until "Prepare match" never enabled, two runs in a dozen.
 */
export async function expectReady(seat: Locator) {
  // Spec 0006: the seat says "✓ Ready" or "Not ready".
  await expect(seat).toContainText(/ready/i);
  await expect(seat).not.toContainText(/not ready/i);
}

/** The game screen (PHASE_07 §7.60): the whole window during a match. */
export const matchPanel = (page: Page) => page.getByRole("region", { name: "Your match" });

// --- reading the game screen (PHASE_07) ----------------------------------------
//
// The board draws cards as buttons with data attributes and the question
// above it; these read them, so each scripted game reads the screen one
// way. Read off the running page.

/** The question on screen: its heading and Forge's own prompt ("" when none). */
export async function question(page: Page): Promise<{ heading: string; prompt: string }> {
  return {
    heading: (await page.locator(".gs-question-title").allTextContents()).join(" "),
    prompt: (await page.locator(".gs-question-prompt").allTextContents()).join(" "),
  };
}

/** Whether this player is being asked something now. */
export async function isAsked(page: Page): Promise<boolean> {
  // On your move the question has no bar (AMENDMENT 12), only its heading;
  // combat is the act button (owner 2026-10-22).
  return (await page.locator(".gs-question, .gs-your-move, .gs-combat").count()) > 0;
}

/**
 * Every option of the question on screen, as list buttons in Forge's
 * order: the game menu's "List choices" opens them all, whether or not
 * the board could have been clicked instead (§7.29).
 */
export async function choices(page: Page): Promise<Locator> {
  const list = page.getByRole("button", { name: /^List choices/ });
  // Read and click without waiting: the question can be answered (and
  // the menu item go) between two calls, and getAttribute/click would
  // then wait for it to come back -- for the rest of the test.
  const expanded = await list.evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-expanded")),
  );
  if (expanded.length > 0 && expanded[0] !== "true") {
    await list
      .first()
      .click({ timeout: 2_000 })
      .catch(() => undefined);
  }
  return page.locator(".gs-question").getByRole("listitem").getByRole("button");
}

/**
 * Click an answer in a scripted game loop, or report that it could not be
 * clicked now -- never wait for it. The loop reads the screen again on its
 * next pass, which is the right thing whenever the click did not land.
 *
 * Why (CI, 2026-10-23): after a click the page disables every option until
 * the server replies (`busy`), so a loop can read a question that is
 * already answered. It then clicked a disabled "Island -- still owing {1}";
 * the next question (Declare attackers) has no `.gs-question` list, and the
 * unbounded click waited out the whole 20-minute test. A real pointer click
 * still (TEST-003), only bounded, and nothing disabled.
 */
export async function answer(target: Locator): Promise<boolean> {
  const enabled = await target.evaluateAll(
    (els) => els.length > 0 && !(els[0] as HTMLButtonElement).disabled,
  );
  if (!enabled) return false;
  return target
    .first()
    .click({ timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
}

/**
 * A DOM click on the first match, for the board-clicking game loops: fanned
 * hand cards overlap, so a pointer click can land on a neighbour.
 *
 * Nothing there is not waited for. The seat that is not being asked has no
 * Pass, and every loop pass used to wait 5 s for one: ~115 such waits were
 * 575 of the sacrifice test's 600 s in CI (2026-10-23), a turn every ~90 s,
 * and the game never reached Innocent Blood.
 */
export async function clickNow(target: Locator): Promise<void> {
  if ((await target.count()) === 0) return;
  await target
    .first()
    .evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 5_000 })
    .catch(() => undefined);
}

/** "No": the act button under the stack on your move, else the question's Pass. */
export const passButton = (page: Page) => page.locator("button.gs-act, button.gs-pass");

/** Cards on the battlefield, by side, as the board draws them (piles are one button). */
export const boardCards = (page: Page, side: "viewer" | "opponent") =>
  page.locator(
    `.bf-cards button[data-object-id][data-controller="${side}"]:not([data-zone="viewer:hand"])`,
  );

/** The viewer's hand. */
export const handCards = (page: Page) => page.locator('.bf-cards [data-zone="viewer:hand"]');

/** How many cards a set of board buttons stands for: a pile counts its members. */
export async function cardCount(cards: Locator): Promise<number> {
  const piles = await cards.evaluateAll((buttons) =>
    buttons.map((b) => Number((b as HTMLElement).dataset["pile"] ?? 1)),
  );
  return piles.reduce((sum, n) => sum + n, 0);
}

/** Both players' facts: life, hand size, counters, designations, command zone. */
export const totals = (page: Page) => page.locator(".gs-seat");

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
  await openRoom(host);
  await inviteIn(host, guest, guestName);

  const readied: string[] = [];
  for (const [page, who] of [
    [host, hostName],
    [guest, guestName],
  ] as const) {
    // The host's OWN copy, and the guest's copy shared by THIS host.
    await chooseDeck(page, deckName, page === host ? undefined : hostName);
    // Click Ready only once THIS page has seen the seats already
    // ready. Its Ready carries the room revision it holds, and one
    // sent before the other seat's update arrived is refused as
    // stale ("The room changed while you were deciding") -- the
    // server being right, the test being early.
    for (const earlier of readied) await expectReady(seatOf(page, earlier));
    await markReady(page);
    await expectReady(seatOf(page, who));
    readied.push(who);
  }

  // §7.64 — one button: the server prepares and launches behind it.
  const start = host.getByRole("button", { name: "Start match" });
  await expect(start).toBeEnabled();
  await start.click();

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
  // Said to a screen reader, not shown (owner 2026-10-22): present, not visible.
  await expect(matchPanel(host).getByText(/The game is running/)).toBeAttached({
    timeout: 600_000,
  });
  await expect(matchPanel(guest).getByText(/The game is running/)).toBeAttached({
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

    const options = await choices(asked);
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
