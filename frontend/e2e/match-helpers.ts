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

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { basename, extname, join } from "node:path";
import { importPackage, noticeCard, secondUser, shareOpenDeckWith, testUser } from "./helpers";
import { geometry } from "../src/battlefield/layout";
import { castingStackBox } from "../src/battlefield/stepAside";

// --- the real mouse (P11-B7: one copy, for every spec) ---------------------
//
// A spec that clicks an element uses realClick (or pointAt to point without
// clicking); a raw `page.mouse.click(x, y)` is only for a test that means a
// screen point (an empty spot on the table, the same spot clicked again),
// with a comment saying so. A point read once and clicked later is the
// CI-only failure: on a slow runner the board has moved in between.

/** A point in the window, in CSS pixels. */
export type Point = { x: number; y: number };

/**
 * A point on the element that the mouse would really hit: inside the
 * window, inside every ancestor that clips it (a scrolled list, a tray),
 * and not under another card. A hand card stands partly below the window's
 * edge and under its right-hand neighbour -- CI run 44314547756: with the
 * host on the draw its first Mountain's middle was at y 1080.3 in a 1080
 * window, and 120 s of clicks there hit nothing. Each point tried is inside
 * the visible part and confirmed with elementFromPoint; if the clipped part
 * has none (an ancestor that clips in style but not in fact: a positioned
 * child escapes it), the window-clipped box is tried as before. Null when no
 * point hits it. Moved here from match-spell-choices (spec 0104); clipping
 * to ancestors added in P11-B7.
 */
export const hitPoint = (l: Locator): Promise<Point | null> =>
  l
    .first()
    .evaluate(
      (el) => {
        const r = el.getBoundingClientRect();
        const inWindow = {
          top: Math.max(r.top, 0),
          bottom: Math.min(r.bottom, window.innerHeight - 2),
          left: Math.max(r.left, 0),
          right: Math.min(r.right, window.innerWidth - 2),
        };
        const visible = { ...inWindow };
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX === "visible" && s.overflowY === "visible") continue;
          const c = p.getBoundingClientRect();
          visible.top = Math.max(visible.top, c.top);
          visible.bottom = Math.min(visible.bottom, c.bottom);
          visible.left = Math.max(visible.left, c.left);
          visible.right = Math.min(visible.right, c.right);
        }
        const tryIn = (b: typeof visible) => {
          if (b.bottom <= b.top || b.right <= b.left) return null;
          for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85])
            for (const fx of [0.5, 0.3, 0.15, 0.7, 0.85]) {
              const x = b.left + (b.right - b.left) * fx;
              const y = b.top + (b.bottom - b.top) * fy;
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === el || el.contains(hit))) return { x, y };
            }
          return null;
        };
        return tryIn(visible) ?? tryIn(inWindow);
      },
      null,
      { timeout: 2_000 },
    )
    .catch(() => null);

/**
 * The real mouse onto an element, without a click: pointing (a hover, a
 * reading card, a partner's light). Returns where it pointed; null (and the
 * mouse not moved) when no point of it could be hit.
 */
export async function pointAt(page: Page, target: Locator, steps = 6): Promise<Point | null> {
  const at = await hitPoint(target);
  if (!at) return null;
  await page.mouse.move(at.x, at.y, { steps });
  return at;
}

/**
 * A real mouse click on an element, at [hitPoint]. Aimed again after the
 * mouse arrives: a hand that fans anew (a card drawn) slides its cards under
 * the pointer. False when no point of it could be hit. `button: "right"`
 * for the close-up.
 */
export async function realClick(
  page: Page,
  target: Locator,
  { button = "left", steps = 6 }: { button?: "left" | "right"; steps?: number } = {},
): Promise<boolean> {
  const first = await hitPoint(target);
  if (!first) return false;
  await page.mouse.move(first.x, first.y, { steps });
  await page.waitForTimeout(150);
  const at = await hitPoint(target);
  if (!at) return false;
  await page.mouse.click(at.x, at.y, { button });
  return true;
}

/**
 * [realClick], made only while something matching [planned] is on screen
 * when the click itself arrives: a real mouse click cannot be one step with
 * a look, so a one-off listener on the window, ahead of the page's own,
 * looks at that moment and stops the click if [planned] is gone. The real
 * click (TEST-003) stays; what it may mean does not change under it. For a
 * bot's planned board click -- a land tapped while "Pay the mana" is asked
 * ([PAYING]): the mouse takes ~150 ms to get there, and a payment that ended
 * meanwhile makes the same click tap the land on your move, or activate a
 * creature (CI 45050944578). True only when the page received the click.
 */
export async function realClickIf(
  page: Page,
  target: Locator,
  planned: string,
  options: { button?: "left" | "right"; steps?: number } = {},
): Promise<boolean> {
  return guardedRealClick(page, target, { planned }, options);
}

/**
 * [realClickIf]'s other half: the real click is stopped if something
 * matching [unplanned] is on screen when it arrives (a hand card clicked to
 * put back is a CAST once it is your move again: CI 12872d7).
 */
export async function realClickUnless(
  page: Page,
  target: Locator,
  unplanned: string,
  options: { button?: "left" | "right"; steps?: number } = {},
): Promise<boolean> {
  return guardedRealClick(page, target, { unplanned }, options);
}

type ClickGuard = { off: () => void; seen: boolean; stopped: boolean };

async function guardedRealClick(
  page: Page,
  target: Locator,
  rule: { planned?: string; unplanned?: string },
  options: { button?: "left" | "right"; steps?: number },
): Promise<boolean> {
  const arm = ({ planned, unplanned }: { planned?: string; unplanned?: string }) => {
    const w = window as unknown as { __clickGuard?: ClickGuard };
    w.__clickGuard?.off();
    const guard: ClickGuard = { seen: false, stopped: false, off: () => undefined };
    const listener = (e: Event) => {
      guard.seen = true;
      const wrong =
        (planned !== undefined && !document.querySelector(planned)) ||
        (unplanned !== undefined && !!document.querySelector(unplanned));
      if (wrong) {
        guard.stopped = true;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      guard.off();
    };
    guard.off = () => window.removeEventListener("click", listener, true);
    window.addEventListener("click", listener, true);
    w.__clickGuard = guard;
  };
  const disarm = () => {
    const w = window as unknown as { __clickGuard?: ClickGuard };
    const guard = w.__clickGuard;
    guard?.off();
    delete w.__clickGuard;
    return { seen: guard?.seen ?? false, stopped: guard?.stopped ?? false };
  };
  const armed = await page.evaluate(arm, rule).then(
    () => true,
    () => false,
  );
  if (!armed) return false;
  const clicked = await realClick(page, target, options).catch(() => false);
  const got = await page.evaluate(disarm).catch(() => ({ seen: false, stopped: true }));
  return clicked && got.seen && !got.stopped;
}

/**
 * A real click at a chosen point, for a test whose subject IS the point
 * (under the see-through casting card, where the reading card was measured):
 * the mouse goes there, and the click is made only if [target] is still what
 * the mouse hits there -- the point was read a moment ago, and on a slow
 * runner the board can move in between. False (no click) when it is not.
 */
export async function clickAt(
  page: Page,
  at: Point,
  target: Locator,
  { steps = 1 }: { steps?: number } = {},
): Promise<boolean> {
  await page.mouse.move(at.x, at.y, { steps });
  const hits = await target
    .first()
    .evaluate(
      (el, p) => {
        const hit = document.elementFromPoint(p.x, p.y);
        return !!hit && (hit === el || el.contains(hit));
      },
      at,
      { timeout: 2_000 },
    )
    .catch(() => false);
  if (!hits) return false;
  await page.mouse.click(at.x, at.y);
  return true;
}

/**
 * Waits (at most [timeout]) until every page has settled: nothing on its
 * stack, no look playing to an end (a looping one may go on: a flyer's sway
 * never ends), and nothing changed for [quietMs] -- longer than any board
 * the game screen holds (HOLD_MS, SWING_HOLD_MS: 1.5 s), so a held board is
 * never read mid-moment. True when they settled, false when time ran out
 * (the caller says what that means; nothing throws).
 *
 * "Changed" is, by default, any change to the page's DOM (a MutationObserver
 * for the length of the wait, then taken away). `clock: "commits"` reads
 * React's commits instead, from a probe that records them in
 * `window.__speed.lastCommit` (match-speed's init script): its idle row must
 * not be measured with an observer running. Moved here from match-speed
 * (CI 9d9b399, run 44489458035: the waiting player's page draws the other
 * player's spell later than the caster's own page does).
 */
export async function settle(
  pages: Page[],
  {
    quietMs = 2_000,
    timeout = 15_000,
    clock = "dom",
  }: { quietMs?: number; timeout?: number; clock?: "dom" | "commits" } = {},
): Promise<boolean> {
  const quiet = (page: Page) =>
    page
      .evaluate(
        ({ quietMs, clock }) => {
          type Watch = { last: number; observer: MutationObserver };
          const w = window as unknown as {
            __e2eSettle?: Watch;
            __speed?: { lastCommit?: number };
          };
          let last: number;
          if (clock === "commits") {
            last = w.__speed?.lastCommit ?? 0;
          } else {
            if (!w.__e2eSettle) {
              const watch: Watch = {
                last: performance.now(),
                observer: new MutationObserver(() => {
                  watch.last = performance.now();
                }),
              };
              watch.observer.observe(document.documentElement, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true,
              });
              w.__e2eSettle = watch;
            }
            last = w.__e2eSettle.last;
          }
          const stack = document.querySelectorAll('button[data-zone="stack"]').length;
          const playing = document.getAnimations().some((a) => {
            const timing = a.effect?.getComputedTiming();
            return a.playState === "running" && timing?.iterations !== Infinity;
          });
          return performance.now() - last >= quietMs && stack === 0 && !playing;
        },
        { quietMs, clock },
      )
      .catch(() => false);
  const end = Date.now() + timeout;
  try {
    while (Date.now() < end) {
      let all = true;
      for (const page of pages) if (!(await quiet(page))) all = false;
      if (all) return true;
      await pages[0]!.waitForTimeout(250);
    }
    return false;
  } finally {
    for (const page of pages)
      await page
        .evaluate(() => {
          const w = window as unknown as { __e2eSettle?: { observer: MutationObserver } };
          w.__e2eSettle?.observer.disconnect();
          delete w.__e2eSettle;
        })
        .catch(() => undefined);
  }
}

// --- reading what the page shows (P11-B7: the lessons of 2026-11-20) -------
//
// A bot asserts on what the page shows, never on its own count of its clicks
// (CI run 44920299488: two target clicks never took, and the bot waited for
// a "Chosen so far" line with nothing chosen).

/** How many targets the page marks as chosen now (spec 0109's TARGET tags). */
export const chosenTargets = (page: Page) => page.locator('[data-chosen-target="true"]').count();

/**
 * The whole text of each element, as a screen reader reads it: its
 * visually-hidden sentence included. A `hasText` filter did not match that
 * sentence (CI run 44913657691: 2,378 asks while the monarch was on the
 * board, 0 every time); match these with [said].
 */
export const shownTexts = (l: Locator) =>
  l.evaluateAll((els) => els.map((el) => el.textContent ?? ""));

/**
 * A word as it can appear in [shownTexts]: a count can follow a hidden
 * sentence with no space ("..., the monarch1", CI run 44920299488), so the
 * word may not be followed by a letter but may be followed by a digit.
 */
export const said = (word: string) =>
  new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i");

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

/**
 * Spec 0067, item 1 -- a plate's life steps down as each blow of the fights
 * lands, and is the board's number again once the fights' clock ends. A
 * test reading a life total waits for that first.
 */
export async function lifeSettled(page: Page) {
  await page.waitForFunction(
    () =>
      !document.getAnimations().some((a) => a.id === "fight-clock" && a.playState === "running"),
    undefined,
    { timeout: 90_000 },
  );
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
 * accepts on the invitation's card (spec 0050); both seats are then filled.
 */
export async function inviteIn(host: Page, guest: Page, guestName: string) {
  await host
    .getByRole("region", { name: "Players" })
    .getByRole("button", { name: new RegExp(`^Invite ${guestName}$`, "i") })
    .click();
  await noticeCard(guest, "invited you to").getByRole("button", { name: "Accept" }).click();
  await expect(yourRoom(host).locator(".pa-room-taken")).toHaveAttribute("data-taken", "2/2");
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
          // Spec 0019: "Name (60 cards)", "Name (60 cards) · shared by Pat".
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
 *
 * [except]: a selector for the trays the caller reads and answers itself
 * (e.g. `[data-kind="chooseSingleEntityForEffect"]`). It is part of the
 * tray's own locator, so a tray of that kind opening after the caller
 * looked is never found here ([saying]: the same for a window known only by
 * its words). A separate look before the call is not
 * enough (CI 45044248294: the tray opened between that look and this
 * one, 40 ms apart, and the generic click took Hill Giant).
 */
export async function answerCardTray(
  page: Page,
  { except, saying }: { except?: string; saying?: Saying } = {},
): Promise<boolean> {
  const not = except ? `:not(${except})` : "";
  // [saying]: a window known by its words -- the click is refused, in the
  // page, while one says them (a step answers it itself).
  const clickNow = saying
    ? async (t: Locator) => void (await clickUnless(t, ":not(*)", saying))
    : clickNowOf;
  const tray = matchPanel(page)
    .locator(
      `.gs-win.gs-tray${not}:has(button.gs-win-tile[data-object-id]), .gs-win.gs-tray${not}:has(.gs-win-piles)`,
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
 * On screen while it is this player's move (priority): the act button that
 * passes, resolves or leaves -- not combat's, a payment's Cancel or a
 * discard's. The same test the scripted loops make before their "not my
 * move" branches; [clickUnlessCombat] and the payment clicks make it again
 * in the page, at the click.
 */
export const PRIORITY =
  "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)";

/**
 * "Pay the mana" on screen: the one question a board card is clicked for
 * as mana. A bot's payment click goes through `clickIf(card, PAYING)`, so a
 * payment that ended between its look and its click is not followed by a
 * click on the board meaning something else (CI 45050944578: Mogg Fanatic
 * activated, its sacrifice question unanswered for 120 s).
 */
export const PAYING = ':is(.gs-question, .gs-your-move, .gs-win)[data-kind="applyManaToCost"]';

/** A target question (a spell's or a trigger's): a step a bot usually aims itself. */
export const TARGETING = '[data-kind="chooseTargetsFor"]';

/**
 * A "board choice" click for a bot's catch-all branch -- one that runs only
 * when it is not this player's move: clicks only if neither a combat
 * question nor this player's move ([PRIORITY]) is on screen at that very
 * moment. The branch runs when the page showed neither, but the next one
 * can arrive between that look and the click:
 * - a click on a creature during "Declare attackers" SELECTS it (Phase 9
 *   W-14), the combat button locks until it is pointed somewhere, and a bot
 *   that only passes combat waits forever (match-sacrifice, 2026-11-08:
 *   "Declare attackers" stuck for 120 s with "1 selected");
 * - a click on a board card on your move ACTIVATES it (CI 45050944578:
 *   Mogg Fanatic, whose "Sacrifice Mogg Fanatic?" no branch answered).
 * The check and the click are one step in the page, so nothing can arrive
 * between them. [except]: windows a step of the caller reads and answers
 * itself (a target question it aims, `[data-kind="chooseTargetsFor"]`) --
 * never answered here either, even one that opened after the caller looked.
 */
export async function clickUnlessCombat(
  target: Locator,
  except?: string,
  saying?: Saying,
): Promise<void> {
  await clickUnless(target, `.gs-combat, ${PRIORITY}${except ? `, ${except}` : ""}`, saying);
}

/**
 * A window known by its words, not its kind: [clickUnless] and
 * [clickUnlessCombat] also refuse while an element matching [css] says
 * [words], in any case (the Wurm's "cast it from your library?" offer, which a step
 * answers itself).
 */
export type Saying = { css: string; words: string };

/**
 * "No" for a bot's catch-all, scoped to the game screen: the question's
 * Pass, or the act button -- never a discard's (picked first) and never a
 * payment's or a target's Cancel. A question can come in between the bot's
 * look and this click, and a Cancel then backs out of it (CI 44884351426
 * and 44905040418, the Raven's bounce). [passButton]'s rule, for the loops
 * that wrote their own `button.gs-act:not(.gs-act-discard)`.
 */
export const passOrAct = (page: Page) =>
  matchPanel(page).locator(
    "button.gs-pass, button.gs-act:not(.gs-act-discard):not(.gs-act-cancel)",
  );

/**
 * A catch-all's click that skips what it does not plan for: clicks [target]
 * only if nothing matching [unplanned] is on screen at that very moment, the
 * check and the click one step in the page. A bot's catch-all runs after it
 * looked and saw nothing it handles, but a question can arrive between that
 * look and the click (CI 44884351426 and 44905040418: a pass that cancelled
 * the Raven's bounce; 44900484054: Fabricate's cost window answered unread).
 * Name the windows the bot reads and answers itself, e.g.
 * `clickUnless(listed, '.gs-win:has(button.gs-cost-act), [data-kind="chooseTargetsFor"]')`;
 * [saying] names one by its words instead.
 * True when it clicked.
 */
export async function clickUnless(
  target: Locator,
  unplanned: string,
  saying?: Saying,
): Promise<boolean> {
  if ((await target.count()) === 0) return false;
  return target
    .first()
    .evaluate(
      (e, [unplanned, saying]) => {
        if (document.querySelector(unplanned)) return false;
        if (
          saying &&
          [...document.querySelectorAll(saying.css)].some((w) =>
            (w.textContent ?? "").toLowerCase().includes(saying.words.toLowerCase()),
          )
        )
          return false;
        (e as HTMLElement).click();
        return true;
      },
      [unplanned, saying ?? null] as const,
      { timeout: 5_000 },
    )
    .catch(() => false);
}

/**
 * The other half of [clickUnless]: clicks [target] only if something
 * matching [planned] is on screen at that very moment, the check and the
 * click one step in the page. For a catch-all whose click means one thing
 * only under one question -- a board card is a mana payment while "Pay the
 * mana" is asked, and an ability to activate the moment priority comes back
 * (CI 45050944578: the bot looked for priority while a creature was still
 * resolving, then clicked Mogg Fanatic as "mana" 126 ms later, after
 * priority had come back, and could not answer "Sacrifice Mogg Fanatic?").
 * True when it clicked.
 */
export async function clickIf(target: Locator, planned: string): Promise<boolean> {
  if ((await target.count()) === 0) return false;
  return target
    .first()
    .evaluate(
      (e, planned) => {
        if (!document.querySelector(planned)) return false;
        (e as HTMLElement).click();
        return true;
      },
      planned,
      { timeout: 5_000 },
    )
    .catch(() => false);
}

/**
 * Declare no attack (or no block): the combat button. If something is
 * selected and not pointed (W-14), that button is locked until it is
 * pointed or unselected: Esc unselects first, as a player would. For a
 * bot that only ever passes combat.
 */
export async function passCombat(page: Page): Promise<void> {
  const panel = matchPanel(page);
  if ((await panel.locator("button.gs-act-combat.gs-act-waiting").count()) > 0) {
    await page.keyboard.press("Escape");
  }
  await clickNow(panel.locator("button.gs-act-combat"));
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

/**
 * "No": the act button under the stack on your move, else the question's Pass.
 * Never the act button's Cancel: a question can come in between a bot's look
 * and its pass, and a pass that cancels backs out of it (CI runs 44884351426
 * and 44905040418, the Raven's bounce). A test that backs out clicks
 * `button.gs-act-cancel` by name.
 */
export const passButton = (page: Page) =>
  page.locator("button.gs-act:not(.gs-act-discard):not(.gs-act-cancel), button.gs-pass");

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
// --- P11-D4: every browser game is P11-R4's browser gate (F-0117-E) ---------
//
// The CI and local stacks run with PROXIC_TEST_DELTA_CHECK on: every delta the
// server sends also carries the whole board, and the page compares the board
// it rebuilt with it, logging DELTA_MISMATCH (match.ts) on a difference. For a
// seat, the whole board IS the worker's stripped view, so "rebuilt equals
// whole" means the page held nothing more than the worker allowed. Every page
// in a game this file starts is watched: a DELTA_MISMATCH, or a page asking
// for the whole board again (MATCH_RESYNC: only ever a bug; 0 in every CI
// game), fails the test. The deltas each page was sent are counted (HID-004:
// the gate is seen running) and printed as the page closes.

/** What one page's match sockets carried, for P11-D4's gate. */
export type DeltaTally = {
  who: string;
  deltas: number;
  boards: number;
  resyncs: number;
  mismatches: string[];
  /** A test that forces a resync on purpose (match-deltas) sets this. */
  allowResync: boolean;
};

const tallies = new WeakMap<Page, DeltaTally>();
const watchedContexts = new WeakSet<BrowserContext>();

/** Soft-fail the running test (an event can arrive after it ended: then only printed). */
function deltaProblem(text: string) {
  try {
    test.info();
    expect.soft(text, "P11-R4's browser gate (spec 0117)").toBe("");
  } catch {
    console.log(`[deltas] after the test: ${text}`);
  }
}

/** Watch one page (and, with its context, every page opened in it later): see the file note above. */
export function watchDeltas(page: Page, who = "page"): DeltaTally {
  const known = tallies.get(page);
  if (known) return known;
  const tally: DeltaTally = {
    who,
    deltas: 0,
    boards: 0,
    resyncs: 0,
    mismatches: [],
    allowResync: false,
  };
  tallies.set(page, tally);
  page.on("console", (message) => {
    const text = message.text();
    if (!text.includes("DELTA_MISMATCH")) return;
    tally.mismatches.push(text);
    deltaProblem(`${who}: ${text}`);
  });
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/matches/")) return;
    socket.on("framereceived", (event) => {
      const text = String(event.payload);
      const head = text.slice(0, 80);
      if (head.includes('"MATCH_DELTA"')) tally.deltas += 1;
      else if (head.includes('"MATCH_SNAPSHOT"')) tally.boards += 1;
    });
    socket.on("framesent", (event) => {
      if (!String(event.payload).includes('"MATCH_RESYNC"')) return;
      tally.resyncs += 1;
      if (!tally.allowResync)
        deltaProblem(`${who}: asked for the whole table again (MATCH_RESYNC)`);
    });
  });
  page.on("close", () => {
    if (tally.deltas + tally.boards > 0)
      console.log(
        `[deltas] ${who}: ${tally.deltas} deltas, ${tally.boards} whole boards, ` +
          `${tally.resyncs} resyncs, ${tally.mismatches.length} mismatches`,
      );
  });
  const context = page.context();
  if (!watchedContexts.has(context)) {
    watchedContexts.add(context);
    context.on("page", (opened) => watchDeltas(opened, `${who} (another tab)`));
  }
  return tally;
}

/**
 * The Arena Server's log (docker logs of PROXIC_E2E_CONTAINER, as
 * match-concurrency uses), or null without the container.
 */
export function serverLog(): string | null {
  const container = process.env.PROXIC_E2E_CONTAINER;
  if (!container) return null;
  return execFileSync("docker", ["logs", container], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** P11-D4 -- the server's delta switches, as it logged them at start; null without the container. */
export function deltaSwitches(): { players: boolean; spectators: boolean } | null {
  const log = serverLog();
  if (log === null) return null;
  const all = [...log.matchAll(/match deltas: players (true|false), spectators (true|false)/g)];
  const last = all[all.length - 1];
  return last ? { players: last[1] === "true", spectators: last[2] === "true" } : null;
}

/** The tally of a page watched (startAMatch watches both players'). */
export function deltasOf(page: Page): DeltaTally {
  return tallies.get(page) ?? watchDeltas(page);
}

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
    // A different deck for the guest (also shared by the host), for the
    // tests that need the two seats to bring different cards.
    guestDeck = deckName,
    // Spec 0098 -- each seat's opening hand and the draws after it, by
    // card name (TEST ONLY: the stack must run with PROXIC_TEST_DEALS).
    deal,
  }: {
    settle?: boolean;
    hostName?: string;
    guestName?: string;
    guestDeck?: string;
    deal?: { host?: SeatDeal; guest?: SeatDeal };
  } = {},
) {
  // P11-D4 -- both players' pages are P11-R4's browser gate.
  watchDeltas(host, "host");
  watchDeltas(guest, "guest");
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
  if (deal) await queueDeal(host, { [hostName]: deal.host ?? {}, [guestName]: deal.guest ?? {} });
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

/** Spec 0098 -- one seat's deal: its opening hand, then the draws after it, in order. */
export type SeatDeal = { hand?: string[]; top?: string[] };

/**
 * Spec 0098 -- queue a deal for the next match between these two players
 * (username -> deal). TEST ONLY: the server mounts the route only with
 * PROXIC_TEST_DEALS on (docker-compose.local.yml, docker-compose.ci.yml);
 * anywhere else this fails, loudly, rather than playing an undealt game.
 */
export async function queueDeal(page: Page, seats: Record<string, SeatDeal>) {
  const queued = await page.request.post("/api/matches/test-deal", {
    headers: { "X-CSRF-Token": await csrfOf(page) },
    data: {
      players: Object.entries(seats).map(([username, d]) => ({
        username,
        hand: d.hand ?? [],
        top: d.top ?? [],
      })),
    },
  });
  expect(
    queued.status(),
    `the deal was not queued (is the stack running with PROXIC_TEST_DEALS?): ${await queued.text()}`,
  ).toBe(204);
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

    // A short wait, then look again: the question can be answered or close
    // during the full-page screenshot (4x CPU), and an unbounded click then
    // waited for a button that never came back until the test's own timeout
    // (ROADMAP's flakes: settlePregame, 300/900/600 s).
    await options
      .first()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
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

// --- spec 0068: the card being cast, in its place (spec 0110: the stack's next slot); screenshots with the pointer ---

/** Screenshots go here (spec 0068's evidence); test-results/seen by default. */
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";

/**
 * A headless browser draws no mouse pointer in a screenshot: the page's own
 * pointer (its CSS cursor picture) is drawn at [points] for the picture
 * only, its tip on the point, then taken away.
 */
export async function shootWithPointer(page: Page, file: string, points: [number, number][]) {
  await page.evaluate((at) => {
    const cursor = getComputedStyle(document.querySelector(".gs-screen")!).cursor;
    const url = /url\("([^"]+)"\)/.exec(cursor)?.[1] ?? "";
    for (const [x, y] of at) {
      const img = document.createElement("img");
      img.src = url;
      img.className = "e2e-pointer";
      Object.assign(img.style, {
        position: "fixed",
        left: `${x - 2}px`,
        top: `${y - 2}px`,
        width: "32px",
        height: "32px",
        zIndex: "2147483647",
        pointerEvents: "none",
      });
      document.body.append(img);
    }
  }, points);
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(SHOTS, file) });
  await page.evaluate(() => document.querySelectorAll(".e2e-pointer").forEach((el) => el.remove()));
}

/**
 * The card being cast is drawn and has stopped moving: none of its own
 * animations (its rise, fade-in or step aside) still running -- the sway is
 * on a child and does not move its box. Poll it instead of waiting the
 * rise's length (a fixed 700 ms read the last frames of the 700 ms paced
 * rise on a slow runner).
 */
export const castRisen = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
    return !!el && el.getAnimations().every((a) => a.playState !== "running" && !a.pending);
  });

/**
 * The big card being cast ([selector]: the one drawn now, by default; the
 * other player's reveal is `.gs-cast-leaving`): how far its centre is from
 * its place (spec 0110: the stack's next slot), and whether it is
 * see-through or moving.
 */
export async function castCentre(page: Page, selector = ".gs-cast:not(.gs-cast-leaving)") {
  const seen = await page.evaluate((selector) => {
    const cast = document.querySelector<HTMLElement>(selector);
    if (!cast) return null;
    // Its place, not the sway's tilt: the element's own box.
    const r = cast.getBoundingClientRect();
    const board = document.querySelector<HTMLElement>(".bf-board")?.getBoundingClientRect();
    return {
      x: r.x + r.width / 2 - (board?.left ?? 0),
      y: r.y + r.height / 2 - (board?.top ?? 0),
      w: board?.width ?? window.innerWidth,
      bh: board?.height ?? window.innerHeight,
      h: r.height,
      // The stack entries it waits over: not its own (not on the stack until
      // it is cast, and drawn unseen under it while it settles there).
      stack: [
        ...document.querySelectorAll<HTMLElement>('.bf-stack-slot:not([data-waiting="true"])'),
      ].filter((slot) => slot.style.opacity !== "0").length,
      seeThrough: cast.dataset.seeThrough === "true",
      // Spec 0091 -- stepping aside while a card under it is spent or tapped.
      aside: cast.dataset.stepAside ?? null,
      // Moving now (its rise, a step aside, its settle): any of its own
      // running animations that move it.
      moving: cast
        .getAnimations()
        .some(
          (a) =>
            a.playState === "running" &&
            ((a.effect as KeyframeEffect | null)
              ?.getKeyframes()
              .some((k) => String(k["transform"] ?? "").includes("translate")) ??
              false),
        ),
    };
  }, selector);
  if (!seen) return null;
  // Spec 0110 -- its place is the stack's next slot (castingStackBox), no
  // longer the middle of the window (spec 0068): dx, dy are how far its
  // centre is from there.
  const place = castingStackBox(geometry({ width: seen.w, height: seen.bh }), seen.stack);
  return {
    dx: seen.x - (place.x + place.w / 2),
    dy: seen.y - (place.y + place.h / 2),
    h: seen.h,
    seeThrough: seen.seeThrough,
    aside: seen.aside,
    moving: seen.moving,
  };
}

/** [clickNow] by another name, for [answerCardTray]'s own `clickNow`. */
const clickNowOf = (target: Locator) => clickNow(target);
