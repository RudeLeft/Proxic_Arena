// The game chat's play log and its windows, in the browser -- spec 0064,
// F-0064-A..D.
//
// Two players, a few turns of lands. Each opens the game chat's Play log:
// their own draws are named, the other player's are "drew a card" with
// nothing to point at, and both see the lands played. A refresh brings the
// whole log back. Then the window floats (dragged onto the column with the
// action button, it slides clear of it and of the hand, and a refresh keeps
// it there) and pops out into its own browser window, which keeps up with
// the game and puts the chat back when it closes.
//
// scripts/check-play-log.py and check-hidden-log.py prove the worker half
// against Forge (a face-down cast, combat, every Lab game's lines); this
// proves what each player is shown.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answer,
  boardCards,
  cardCount,
  choices,
  discardIfAsked,
  clearEverything,
  isAsked,
  matchPanel,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;
// Where the pictures for the owner go (PROXIC_E2E_SHOTS), else test-results.
const shots = process.env["PROXIC_E2E_SHOTS"] ?? join("test-results", "seen", "play-log");

const chatOf = (page: Page) => page.getByRole("complementary", { name: "Game chat" });

/** Lands, turn after turn, until each player has [lands] of them on the table. */
async function playLands(host: Page, guest: Page, lands: number, enough?: () => Promise<boolean>) {
  // Lands of a name pile into one button: count the cards in each.
  const mine = (page: Page) => cardCount(boardCards(page, "viewer"));
  const deadline = Date.now() + 420_000;
  const watch = watchGame([host, guest]);
  const done = enough ?? (async () => (await mine(host)) >= lands && (await mine(guest)) >= lands);
  while (Date.now() < deadline && !(await done())) {
    await watch.check();
    const live = (await isAsked(host)) ? host : (await isAsked(guest)) ? guest : null;
    if (!live) {
      await host.waitForTimeout(100);
      continue;
    }
    if (await discardIfAsked(live)) continue;
    // A yes-or-no window ("Do you want to play Fiery Temper?", madness) has
    // its own buttons: no -- only lands are played here.
    const yesNo = matchPanel(live).locator(".gs-win button.gs-win-btn:not(.gs-peek-btn)");
    if ((await yesNo.count()) > 0) {
      const no = yesNo.filter({ hasText: /^\s*(No|Don.t|Decline|Skip)/i });
      await ((await no.count()) > 0 ? no : yesNo)
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
      await live.waitForTimeout(40);
      continue;
    }
    const options = await choices(live);
    const labels = await options.allTextContents();
    const heading = (await matchPanel(live).locator(".gs-question-title").allTextContents()).join(
      " ",
    );
    let pick = labels.findIndex((label) =>
      (/Keep or mulligan/.test(heading) ? /Keep/ : /Play land/).test(label),
    );
    if (pick < 0 && /Play first|go first/i.test(heading + labels.join(" "))) pick = 0;
    // "Do you want to play Fiery Temper?" (madness) and the like: no, only lands here.
    if (pick < 0)
      pick = labels.findIndex((label) => /^(No(?![a-z])|Don.t|Decline|Skip)/i.test(label.trim()));
    if (pick < 0 && /discard|confirm/i.test(heading) && labels.length > 0) pick = 0;
    if (pick >= 0) await answer(options.nth(pick));
    else if (!(await answer(matchPanel(live).getByRole("button", { name: "Pass" })))) {
      // A window with no Pass (a yes/no): its first answer.
      if (labels.length > 0) await answer(options.first());
    }
    await live.waitForTimeout(40);
  }
}

async function openLog(page: Page): Promise<Locator> {
  const chat = chatOf(page);
  // The chat is drawn with the board: after a refresh, wait for it.
  const opener = chat.locator("button.gs-chat-tab");
  await expect(opener.or(chat.getByRole("tab", { name: /^Play log/ })).first()).toBeVisible({
    timeout: 60_000,
  });
  if ((await opener.count()) > 0 && (await opener.getAttribute("aria-expanded")) !== "true") {
    await opener.click({ timeout: 15_000 });
  }
  await chat.getByRole("tab", { name: /^Play log/ }).click({ timeout: 15_000 });
  return chat.getByRole("log", { name: "Play log" });
}

/** Each line of the log: its words, and the card names in it you can point at. */
async function readLog(log: Locator) {
  return log.locator(".gs-log-ent").evaluateAll((rows) =>
    rows.map((row) => ({
      text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      cards: [...row.querySelectorAll(".gs-log-cn")].map((b) => b.textContent ?? ""),
    })),
  );
}

const rect = async (l: Locator) => (await l.boundingBox())!;
const overlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function keepClear(page: Page) {
  const rail = await rect(page.locator(".bf-rail"));
  const hand = await page.locator('[data-zone="viewer:hand"]').evaluateAll((els) => {
    const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    if (rs.length === 0) return null;
    const x = Math.min(...rs.map((r) => r.left));
    const y = Math.min(...rs.map((r) => r.top));
    return {
      x,
      y,
      width: Math.max(...rs.map((r) => r.right)) - x,
      height: Math.max(...rs.map((r) => r.bottom)) - y,
    };
  });
  return hand ? [rail, hand] : [rail];
}

test("each player's play log, the floating window and the window of its own", async ({
  browser,
}) => {
  test.skip(!pkg, "no deck package available");
  mkdirSync(shots, { recursive: true });
  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  // A fresh browser each: nothing remembered from an earlier run.
  for (const page of [host, guest]) {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("proxic.gameChat")) localStorage.removeItem(key);
    });
  }

  try {
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName, { settle: false });
    await playLands(host, guest, 2);

    // --- F-0064-A, F-0064-B: two tabs; each seat its own log ------------------
    const names: Record<string, string> = {};
    for (const page of [host, guest]) {
      const plates = await page.locator(".gs-seat .gs-seat-name, .gs-seat-name").allTextContents();
      names[page === host ? "host" : "guest"] = plates.join("|");
    }
    const logs: Record<string, { text: string; cards: string[] }[]> = {};
    for (const [who, page] of [
      ["host", host],
      ["guest", guest],
    ] as const) {
      const log = await openLog(page);
      await expect(log.locator(".gs-log-ent").first()).toBeVisible({ timeout: 30_000 });
      await expect(chatOf(page).getByRole("tab", { name: /^Chat/ })).toBeVisible();
      logs[who] = await readLog(log);
      await page.screenshot({ path: join(shots, `log-${who}.png`) });
    }
    const me = { host: await playerName(host), guest: await playerName(guest) };
    for (const [who, other] of [
      ["host", "guest"],
      ["guest", "host"],
    ] as const) {
      const lines = logs[who]!;
      const ownDraws = lines.filter((l) => l.text.startsWith(`${me[who]} drew `));
      const theirDraws = lines.filter((l) => l.text.startsWith(`${me[other]} drew `));
      expect(ownDraws.length, `${who} reads their own draws`).toBeGreaterThan(0);
      expect(
        ownDraws.some((l) => l.cards.length > 0),
        `${who}'s own draws name the cards`,
      ).toBe(true);
      expect(theirDraws.length, `${who} reads the other player's draws`).toBeGreaterThan(0);
      for (const l of theirDraws) {
        expect(l.cards, `${who} is never told what ${other} drew: ${l.text}`).toEqual([]);
        expect(l.text).toMatch(/drew (a card|\d+ cards)$/);
      }
      // Lands are public: both read both.
      expect(
        lines.some((l) => l.text.startsWith(`${me[who]} played `) && l.cards.length === 1),
      ).toBe(true);
      expect(
        lines.some((l) => l.text.startsWith(`${me[other]} played `) && l.cards.length === 1),
      ).toBe(true);
    }

    // Refresh keeps it: the same lines come back.
    const before = logs["host"]!.length;
    await host.reload();
    const again = await openLog(host);
    await expect
      .poll(async () => (await readLog(again)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(before);
    const reread = await readLog(again);
    expect(reread.slice(0, before).map((l) => l.text)).toEqual(
      logs["host"]!.slice(0, before).map((l) => l.text),
    );

    // The docked window with its two tabs, for the owner.
    await chatOf(host).getByRole("tab", { name: /^Chat/ }).click();
    await host.screenshot({ path: join(shots, "docked-tabs.png") });

    // --- F-0064-C: floating, clear of the hand and the column ------------------
    await chatOf(host).getByRole("button", { name: "Float the chat on the table" }).click();
    const win = chatOf(host).getByTestId("game-chat-window");
    await expect(win).toHaveClass(/gs-cw-floating/);
    await chatOf(host)
      .getByRole("tab", { name: /^Play log/ })
      .click();
    for (const zone of await keepClear(host)) expect(overlap(await rect(win), zone)).toBe(false);
    // Dragged by its top bar onto the column with the action button...
    const head = win.locator(".gs-cw-head .gs-cw-title");
    const start = await rect(head);
    const rail = await rect(host.locator(".bf-rail"));
    await host.mouse.move(start.x + 10, start.y + 5);
    await host.mouse.down();
    await host.mouse.move(rail.x + 40, start.y + 40, { steps: 8 });
    await expect(host.locator(".gs-cw-zone")).not.toHaveCount(0);
    await host.mouse.up();
    // ...it slides just clear on release.
    const dropped = await rect(win);
    for (const zone of await keepClear(host)) expect(overlap(dropped, zone)).toBe(false);
    expect(dropped.x + dropped.width).toBeLessThanOrEqual(rail.x);
    // Resized from its corner.
    const corner = await rect(win.locator(".gs-cw-resize"));
    await host.mouse.move(corner.x + 8, corner.y + 8);
    await host.mouse.down();
    await host.mouse.move(corner.x - 60, corner.y - 100, { steps: 6 });
    await host.mouse.up();
    const resized = await rect(win);
    expect(resized.width).toBeLessThan(dropped.width);
    await host.screenshot({ path: join(shots, "floating.png") });
    // Remembered across a refresh.
    await host.reload();
    const back = chatOf(host);
    await back.getByRole("button", { name: /^Open the game chat/ }).click({ timeout: 60_000 });
    const kept = await rect(back.getByTestId("game-chat-window"));
    expect(Math.abs(kept.x - resized.x)).toBeLessThan(2);
    expect(Math.abs(kept.y - resized.y)).toBeLessThan(2);
    expect(Math.abs(kept.width - resized.width)).toBeLessThan(2);

    // --- F-0064-D: its own browser window, in step with the game --------------
    const [popup] = await Promise.all([
      host.context().waitForEvent("page"),
      back.getByRole("button", { name: "Open the chat in its own window" }).click(),
    ]);
    await popup.setViewportSize({ width: 440, height: 720 });
    await expect(popup.getByRole("tab", { name: /^Chat/ })).toBeVisible();
    await popup.getByRole("tab", { name: /^Play log/ }).click();
    const popLog = popup.getByRole("log", { name: "Play log" });
    await expect(popLog.locator(".gs-log-ent").first()).toBeVisible();
    const inPopup = (await readLog(popLog)).length;
    await expect(
      back.getByRole("button", { name: "The game chat is in its own window: bring it back" }),
    ).toBeVisible();
    // The game goes on; the popped-out log keeps up.
    await playLands(host, guest, 0, async () => (await readLog(popLog)).length > inPopup);
    await expect
      .poll(async () => (await readLog(popLog)).length, { timeout: 60_000 })
      .toBeGreaterThan(inPopup);
    // The chat works from there too.
    await popup.getByRole("tab", { name: /^Chat/ }).click();
    await popup.getByLabel("Message the game").fill("from my second screen");
    await popup.getByRole("button", { name: "Send" }).click();
    await expect(chatOf(guest))
      .toContainText("from my second screen", { timeout: 15_000 })
      .catch(async () => {
        await chatOf(guest).getByRole("tab", { name: /^Chat/ }).click();
        await expect(chatOf(guest)).toContainText("from my second screen", { timeout: 15_000 });
      });
    await popup.screenshot({ path: join(shots, "popped-out-chat.png") });
    await popup.getByRole("tab", { name: /^Play log/ }).click();
    await popup.screenshot({ path: join(shots, "popped-out-log.png") });
    await host.screenshot({ path: join(shots, "popped-out-table.png") });
    // Closing it puts the chat back in the game.
    await popup.close();
    await expect(back.getByTestId("game-chat-window")).toBeVisible({ timeout: 10_000 });

    // The log after a few turns, from both seats, for the owner.
    for (const [who, page] of [
      ["host", host],
      ["guest", guest],
    ] as const) {
      await openLog(page);
      await page.screenshot({ path: join(shots, `log-later-${who}.png`) });
    }
    void names;
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});

/** The name the game calls this player (their plate on the board). */
async function playerName(page: Page): Promise<string> {
  const turn = page.locator(".gs-log-head .gs-log-you").first();
  if ((await turn.count()) > 0) {
    const who = await page
      .locator(".gs-log-head:has(.gs-log-you) .gs-log-who")
      .first()
      .textContent();
    if (who) return who.trim();
  }
  // Every draw line "X drew Y" that names a card is this player's own.
  const own = await page
    .locator(".gs-log-ent:has(.gs-log-cn)")
    .evaluateAll((rows) =>
      rows
        .map((r) => (r.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter((t) => / drew /.test(t)),
    );
  return own[0]?.split(" drew ")[0] ?? "";
}
