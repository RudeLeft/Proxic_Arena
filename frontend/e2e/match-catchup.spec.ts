// P11-D6 (spec 0119; F-0119-F, F-0119-H) -- catch-up after a stall, in a real
// game on the local stack.
//
// One game of the green deck between the two local accounts, both pages
// played by the redraw measure's bot (speed-kit `drive`). The guest's match
// socket goes through the test's relay (slow-link.ts: Chrome's network
// emulation never reaches WebSocket frames), so its line can be stalled:
// nothing read, the server's bytes held up, as a frozen link does. Each stall
// starts on the host's turn and only the host's page plays meanwhile, so the
// game moves while the guest hears nothing (Bob's game never waits for you);
// for the long stall the guest plays on in a second tab of their own.
//
//  1. A short stall (3 s): the boards arrive late, in a burst; the guest's
//     table replays them at 3x from where it stopped, "Catching up… / Tap to
//     skip" in the act button, then is live on the server's newest board.
//  2. Tap to skip (TEST-012, a real click): another stall; while the replay
//     plays, the act button is clicked: the sign goes at once, the table is
//     at the newest board.
//  3. A long stall (18 s): 5 s of silence shows "Reconnecting to the game…"
//     (after its settle), 10 s closes the line and the page comes back naming
//     the board it holds (`resume`); the server sends the boards missed
//     (MATCH_CATCHUP); past the limit the table goes straight to now and
//     "While you were away" lists the play log's lines, numbered, with the
//     count in its sentence.
//  4. A refresh: never a window (a reload starts fresh; owner answer 5).
// Every time, the board the guest's page DRAWS is the newest it was sent, and
// that is the server's board for its seat, exactly (whole-board equality, the
// play log aside).

import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { firstDifference } from "../src/delta";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch } from "./match-helpers";
import { serverBoard, slowLink, type Link } from "./slow-link";
import { drive } from "./speed-kit";

test.describe.configure({ timeout: 900_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");

type Board = Record<string, unknown>;
type Seen = {
  signs: { on: number; off: number | null; text: string }[];
  windows: { at: number; said: string; rows: string[] }[];
  notices: number[];
};

/** Records, in the page, when the catch-up sign, the away window and the reconnecting notice appear. */
function watchThePage() {
  const seen: Seen = { signs: [], windows: [], notices: [] };
  (window as unknown as { __catchUp: Seen }).__catchUp = seen;
  const look = () => {
    const sign = document.querySelector(".gs-catchup");
    const open = seen.signs[seen.signs.length - 1];
    if (sign && (!open || open.off !== null))
      seen.signs.push({ on: Date.now(), off: null, text: sign.textContent ?? "" });
    if (!sign && open && open.off === null) open.off = Date.now();
    const w = document.querySelector(".gs-missed");
    if (w && !w.hasAttribute("data-seen")) {
      w.setAttribute("data-seen", "1");
      seen.windows.push({
        at: Date.now(),
        said: w.querySelector(".gs-reveal-said")?.textContent ?? "",
        rows: [...w.querySelectorAll(".gs-missed-row")].map((r) => r.textContent ?? ""),
      });
    }
    if (document.body.textContent?.includes("Reconnecting to the game") && !seen.notices.length)
      seen.notices.push(Date.now());
  };
  new MutationObserver(look).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
}

const seenOn = (page: Page) =>
  page.evaluate(() => (window as unknown as { __catchUp: Seen }).__catchUp);

/** The board the page draws now ("epoch.revision"), or null. */
const drawn = (page: Page) =>
  page
    .locator(".gs-screen")
    .getAttribute("data-drawn", { timeout: 2_000 })
    .catch(() => null);

const revisionOf = (board: Board | null) =>
  board ? `${String(board["gameEpoch"])}.${String(board["stateRevision"])}` : null;

/** Chrome's screencast of [page] into [folder], a JPEG a frame, until stopped (a clip to look at). */
async function filmed(page: Page, folder: string) {
  mkdirSync(folder, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  let n = 0;
  cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
    writeFileSync(
      join(folder, `${String(n++).padStart(4, "0")}.jpg`),
      Buffer.from(frame.data, "base64"),
    );
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
  return { stop: () => cdp.send("Page.stopScreencast").catch(() => undefined) };
}

/** Wait until it is [seat]'s turn on [link]'s boards (the host's, from the guest's own view). */
async function turnOf(pages: Page[], link: () => Link, seat: number) {
  await expect
    .poll(
      async () => {
        const b = link().whole.last;
        if (b && b["activeSeat"] === seat && String(b["phase"]).startsWith("MAIN")) return true;
        await drive(pages, 300);
        return false;
      },
      { timeout: 240_000, intervals: [100] },
    )
    .toBe(true);
}

/** The game stands still, then the guest draws the newest board it holds, and that is the server's. */
async function exact(name: string, page: Page, link: Link, serverUrl: string) {
  await expect
    .poll(async () => (await drawn(page)) === revisionOf(link.whole.last), {
      timeout: 15_000,
      message: `${name}: the page draws the newest board it was sent`,
    })
    .toBe(true);
  const server = await serverBoard(page.context(), serverUrl);
  const mine = link.whole.last!;
  expect
    .soft(mine["stateRevision"], `${name}: the server's revision`)
    .toBe(server["stateRevision"]);
  const strip = (b: Board) => ({ ...b, playLog: undefined });
  expect
    .soft(firstDifference(strip(mine), strip(server)), `${name}: the server's board, exactly`)
    .toBeNull();
}

test("a stalled page catches up: replay, skip, jump with the window, a refresh starts fresh", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no deck package");
  const viewport = { width: 1920, height: 1080 };
  const hostContext = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await guest.addInitScript(watchThePage);
  const links = await slowLink(guest, {});
  const link = () => links[links.length - 1]!;
  try {
    await signIn(host);
    await clearEverything(host);
    await signInAs(guest, secondUser, secondPassword);
    await clearEverything(guest);
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    await drive([host, guest], 10_000);
    // The host's seat, from the guest's own boards.
    const theirs = () => 3 - Number(link().whole.last?.["seat"] ?? 2);

    // 1. A short stall on the host's turn: late boards, replayed at 3x with the sign.
    await turnOf([host, guest], link, theirs());
    let before = link().boards;
    link().stall();
    await drive([host], 3_000);
    const sentMeanwhile = link().toPage;
    // CATCHUP_CLIP=<folder> (by hand, not CI): the guest's screen filmed through the replay.
    const film = process.env["CATCHUP_CLIP"]
      ? await filmed(guest, process.env["CATCHUP_CLIP"])
      : null;
    link().resume();
    await expect.poll(() => link().boards > before, { timeout: 10_000 }).toBe(true);
    await expect
      .poll(async () => (await seenOn(guest)).signs.length, {
        timeout: 10_000,
        message: "the catch-up sign showed",
      })
      .toBeGreaterThan(0);
    const first = (await seenOn(guest)).signs[0]!;
    expect(first.text).toContain("Catching up…");
    expect(first.text).toContain("Tap to skip");
    await expect
      .poll(async () => (await seenOn(guest)).signs[0]!.off !== null, { timeout: 10_000 })
      .toBe(true);
    const replayMs = (await seenOn(guest)).signs[0]!.off! - first.on;
    await guest.waitForTimeout(film ? 800 : 0);
    await film?.stop();
    console.log(
      `[catch-up] short stall: ${link().boards - before} boards late; the sign showed ${replayMs} ms ` +
        `(messages before the stall ${sentMeanwhile})`,
    );
    expect.soft((await seenOn(guest)).windows, "no window under the limit").toHaveLength(0);
    await exact("after the replay", guest, link(), link().url);

    // 2. Tap to skip, a real click on the act button during the replay. A
    // replay of a few boards lasts under a second, so a round whose replay
    // ended before the click landed is played again (at most four).
    const sign = guest.locator(".gs-catchup");
    let skippedIn: number | null = null;
    for (let round = 0; round < 4 && skippedIn === null; round += 1) {
      await turnOf([host, guest], link, theirs());
      before = link().boards;
      link().stall();
      // Spec 0120: under 5 s of silence (a longer stall is a drop: the game pauses).
      await drive([host], 3_000);
      link().resume();
      if (
        !(await sign.waitFor({ state: "visible", timeout: 10_000 }).then(
          () => true,
          () => false,
        ))
      )
        continue;
      const clicked = Date.now();
      const hit = await sign.click({ timeout: 1_000 }).then(
        () => true,
        () => false,
      );
      if (!hit) continue;
      await expect(sign).toHaveCount(0, { timeout: 1_000 });
      skippedIn = Date.now() - clicked;
      console.log(
        `[catch-up] skip (round ${round + 1}): ${link().boards - before} boards late; ` +
          `the sign gone ${skippedIn} ms after the click`,
      );
    }
    expect(skippedIn, "a click on the sign skipped the replay").not.toBeNull();
    await exact("after the skip", guest, link(), link().url);

    // 3. A long stall: silence, the notice, the line closed and resumed; past the limit, the window.
    // The guest plays on in a second tab of their own meanwhile (the game asks
    // every tab of a player), so the game goes on for many updates while the
    // first tab hears nothing.
    const tab = await guestContext.newPage();
    await tab.goto(guest.url());
    await tab.locator(".gs-screen[data-drawn]").waitFor({ timeout: 60_000 });
    const stalled = link();
    const linksBefore = links.length;
    stalled.stall();
    await drive([host, tab], 18_000);
    await tab.close();
    const seen = await seenOn(guest);
    expect.soft(seen.notices.length, "Reconnecting to the game… showed").toBeGreaterThan(0);
    expect
      .soft(links.length, "the page closed the silent line and came back")
      .toBeGreaterThan(linksBefore);
    await expect
      .poll(async () => (await seenOn(guest)).windows.length, {
        timeout: 20_000,
        message: "past the limit: the While you were away window",
      })
      .toBeGreaterThan(0);
    const w = (await seenOn(guest)).windows[0]!;
    console.log(
      `[catch-up] long stall: back on ${link().url.split("?")[1]}; window: "${w.said}", ${w.rows.length} rows: ` +
        w.rows.slice(0, 4).join(" / "),
    );
    expect(w.said).toBe(
      `You missed ${w.rows.length} ${w.rows.length === 1 ? "move" : "moves"}. Your table is up to date.`,
    );
    expect(w.rows.length).toBeGreaterThan(0);
    w.rows.forEach((row, i) => expect.soft(row.startsWith(String(i + 1))).toBe(true));
    expect.soft(link().url).toContain("resume=");
    await guest.screenshot({ path: test.info().outputPath("away-window.png") });
    await guest.locator(".gs-missed .gs-reveal-close").click();
    await exact("after the jump", guest, link(), link().url);

    // 4. A refresh: a fresh page, never a window.
    await drive([host, guest], 3_000);
    const windowsBefore = 0;
    await guest.reload();
    await drive([host, guest], 6_000);
    expect
      .soft((await seenOn(guest)).windows.length, "no window after a refresh")
      .toBe(windowsBefore);
    expect.soft(link().url, "a fresh page names no board").not.toContain("resume=");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
