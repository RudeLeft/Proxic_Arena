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
import { importPackage, noticeCard, secondUser, shareOpenDeckWith, testUser } from "./helpers";

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
export async function openRoom(page: Page, name?: string, watchable = true) {
  if (name) await page.getByPlaceholder("Room name (optional)").fill(name);
  // Spec 0047 -- "Let people watch", on unless a test says no.
  await page.getByRole("checkbox", { name: "Let people watch" }).setChecked(watchable);
  await page.getByRole("button", { name: "Open a room" }).click();
  await expect(yourRoom(page)).toBeVisible();
}

/**
 * The host invites [guestName] from the Players list and the guest
 * accepts on the invitation's card (spec 0050); both seats are then filled.
 */
export async function inviteIn(host: Page, guest: Page, guestName: string) {
  await host
    .getByRole("region", { name: "Players" })
    .getByRole("button", { name: new RegExp(`^Invite ${guestName}$`, "i") })
    .click();
  await noticeCard(guest, "invited you to").getByRole("button", { name: "Accept" }).click();
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
  const value = await select.locator("option").evaluateAll(
    (options, [name, owner]) =>
      options
        .map((o) => o as HTMLOptionElement)
        .find(
          // Spec 0019: "Name (60 Cards)", "Name (60 Cards) · shared by Pat".
          (o) =>
            o.text.startsWith(`${name} (`) &&
            (owner ? o.text.includes(`· shared by ${owner}`) : !o.text.includes("shared by")),
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
  // PHASE_09: a yes/no, a trigger's target or an order is a window (.gs-win);
  // the start of the game is the opening hand (.gs-opening, W-15).
  // Spec 0061: discarding to hand size is the act button (.gs-discard), no
  // window; "List choices" still lists the cards.
  return (
    (await page
      .locator(".gs-question, .gs-your-move, .gs-combat, .gs-win, .gs-opening, .gs-discard")
      .count()) > 0
  );
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
  return page.locator(".gs-question, .gs-win").getByRole("listitem").getByRole("button");
}

/**
 * PHASE_09 group 3 -- answer a card tray (CardTrays.tsx) the plain way, for
 * the scripted game loops that meet one in passing: two rows (scry,
 * surveil) or a split -- Done; the piles -- the first; an order -- each
 * card not yet numbered, then Done; a hidden zone -- the first card that can
 * be chosen, or its pass. True if there was one to answer. A numbered card
 * clicked again is taken back, so a loop clicking "the first card" would
 * never finish an order; this never clicks a numbered one.
 */
export async function answerCardTray(page: Page): Promise<boolean> {
  const tray = matchPanel(page)
    .locator(
      ".gs-win.gs-tray:has(button.gs-win-tile[data-object-id]), .gs-win.gs-tray:has(.gs-win-piles)",
    )
    .first();
  if ((await tray.count()) === 0) return false;
  const kind = await tray.evaluateAll((els) => els[0]?.getAttribute("data-kind") ?? "");
  const done = tray.locator("button.gs-win-btn-main:not(:disabled)");
  if (kind === "chooseCardsPile") {
    await clickNow(done);
    return true;
  }
  if ((await tray.locator(".gs-win-rows, .gs-win-piles").count()) > 0) {
    await clickNow(done);
    return true;
  }
  if (kind === "orderMoveToZoneList" || kind.startsWith("arrangeFor")) {
    const open = tray.locator('button.gs-win-tile:not(:disabled):not([aria-pressed="true"])');
    if ((await open.count()) > 0) await clickNow(open);
    else await clickNow(done);
    return true;
  }
  const pick = tray.locator("button.gs-win-tile:not(:disabled)");
  if ((await pick.count()) > 0) await clickNow(pick);
  else await clickNow(tray.locator("button.gs-win-btn-quiet"));
  return true;
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

/**
 * Phase 9 W-14 -- attack with everything at the other player: "All attack"
 * selects every creature, a click on their life total points them all
 * there, and the page answers the game for each. Waits until the attack
 * is made (the combat button is pressable again).
 */
export async function attackWithAll(page: Page): Promise<boolean> {
  const panel = matchPanel(page);
  const all = panel.locator("button.gs-act-all");
  if ((await all.count()) === 0) return false;
  await clickNow(all);
  const life = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
  await expect(life, "the other player can be pointed at").toBeVisible({ timeout: 5_000 });
  await clickNow(life);
  await expect(panel.locator("button.gs-act-combat:not([disabled])")).toContainText("Attack with", {
    timeout: 30_000,
  });
  return true;
}

/** "No": the act button under the stack on your move, else the question's Pass. */
export const passButton = (page: Page) =>
  page.locator("button.gs-act:not(.gs-act-discard), button.gs-pass");

/**
 * Spec 0061, item 3 -- discarding down to hand size is pick, then confirm: a
 * click on a hand card only picks it; the act button ("Discard Elvish
 * Warrior") discards. Picks the first card not yet picked until the button
 * can be pressed, then presses it. False when no discard is asked.
 */
export async function discardIfAsked(page: Page): Promise<boolean> {
  const panel = matchPanel(page);
  if ((await panel.locator("button.gs-act-discard").count()) === 0) return false;
  const ready = panel.locator("button.gs-act-discard:not(:disabled)");
  if ((await ready.count()) === 0) {
    await clickNow(
      page.locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-picked="true"])'),
    );
  }
  await clickNow(ready);
  return true;
}

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
// Spec 0038: counters, markers, mana and the command zone are in each
// player's status tray, beside the plate.
export const totals = (page: Page) => page.locator(".gs-seat, .gs-status");

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
    watchable = true,
    // A different deck for the guest (also shared by the host), for the
    // tests that need the two seats to bring different cards.
    guestDeck = deckName,
  }: {
    settle?: boolean;
    hostName?: string;
    guestName?: string;
    watchable?: boolean;
    guestDeck?: string;
  } = {},
) {
  await host.goto("/play");
  await guest.goto("/play");
  await openRoom(host, undefined, watchable);
  await inviteIn(host, guest, guestName);

  const readied: string[] = [];
  for (const [page, who] of [
    [host, hostName],
    [guest, guestName],
  ] as const) {
    // The host's OWN copy, and the guest's copy shared by THIS host.
    if (page === host) await chooseDeck(page, deckName);
    else await chooseDeck(page, guestDeck, hostName);
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
    await importPackage(host, pkg);
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

/**
 * Fail fast on a game that has ended or stopped moving (Faster CI Plan,
 * step 2, 2026-11-05). A scripted game loop that misses the moment it
 * waits for used to watch a finished or stuck table until its 10-20
 * minute deadline, then fail with a bare "expected true"; dee3667,
 * 87103a2, 6127e05 and 77119d7 each added this guard to one spec. Call
 * `check()` at the top of every pass of the loop, after the loop's own
 * "done" exits: it throws at once, saying how the game ended (or what the
 * table showed when it stopped moving) and what the test had seen so far.
 * It never clicks anything, so a passing run is unchanged.
 */
export function watchGame(
  pages: Page[],
  seen: () => unknown = () => "",
  options: { allowEnd?: boolean; stuckMs?: number } = {},
): { check: () => Promise<void> } {
  const stuckMs = options.stuckMs ?? 120_000;
  let last = "";
  let since = Date.now();
  const sofar = async () => {
    const value = await seen();
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text ? `; seen so far: ${text}` : "";
  };
  return {
    async check() {
      const states: string[] = [];
      const ends: string[] = [];
      for (const page of pages) {
        const state = await page
          .evaluate(() => {
            const count = (selector: string) => document.querySelectorAll(selector).length;
            const text = (selector: string) =>
              (document.querySelector(selector)?.textContent ?? "").trim().slice(0, 160);
            return {
              over: text("#gs-over-text"),
              table: [
                `turn ${text(".gs-turn-value")}`,
                `step ${document.querySelector(".gs-steps")?.getAttribute("data-step") ?? ""}`,
                `life ${[...document.querySelectorAll(".gs-life-n")].map((el) => el.textContent).join("/")}`,
                `hand ${count('[data-zone="viewer:hand"]')}`,
                `stack ${count('[data-zone="stack"]')}`,
                `mine ${count('.bf-cards [data-zone^="viewer:"]:not([data-zone="viewer:hand"])')}`,
                `theirs ${count('.bf-cards [data-zone^="opponent:"]:not([data-zone="opponent:hand"])')}`,
                `asked ${count(".gs-question, .gs-your-move, .gs-combat, .gs-win, .gs-opening, .gs-discard")}`,
                `question "${text(".gs-question-title, .gs-win h2, .gs-your-move")}"`,
              ].join(", "),
            };
          })
          .catch(() => ({ over: "", table: "page closed" }));
        if (state.over) ends.push(state.over);
        states.push(state.table);
      }
      if (ends.length > 0 && !options.allowEnd) {
        throw new Error(`the game ended before the test was done: "${ends[0]}"${await sofar()}`);
      }
      const now = states.join(" || ");
      if (now !== last) {
        last = now;
        since = Date.now();
      } else if (Date.now() - since > stuckMs) {
        throw new Error(
          `the game has not moved for ${Math.round(stuckMs / 1000)} s: ${now}${await sofar()}`,
        );
      }
    },
  };
}
