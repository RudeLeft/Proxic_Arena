// Windows that say less, in a real game -- spec 0109 (F-0109-G), AGENTS TEST-012.
//
// Dealt (spec 0098): the host (Alice) holds Swamps, an Island, Walking
// Corpse, Victim of Night and Griptide; the guest (Bob) Forest, Islands,
// Grizzly Bears and Mist Raven.
//
// 1. Item 5: the host REALLY clicks Victim of Night in hand. Beside the big
//    card the window has the title and one short line ("Choose a creature
//    that isn't a Vampire, Werewolf or Zombie."), no card sentence. The host
//    really clicks the guest's Bears, pays, and the Bears are destroyed.
// 2. Item 7: the guest casts Mist Raven, its trigger REALLY aimed at the
//    host's Walking Corpse. On the host's page the Corpse comes home (the
//    hand count goes up) and no report window opens (none ever, and none in
//    the report's usual arrival time after the move); the host's play log
//    has the line.
// 3. Item 13: the host's Griptide on the Raven: the guest's report window
//    stays ("... on top of your library", a library can't be seen). The
//    guest REALLY points across the window: the table stays bright (no dim
//    class on any frame). The guest REALLY clicks the picture: the table
//    dims to its Library tile; a real click on the empty table undims it.
//
// Every wait is on a state. The deck is protocol/fixtures/quiet-windows-deck.
// CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/quiet-windows-deck.zip" protocol/fixtures/quiet-windows-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  cardCount,
  clearEverything,
  clickNow,
  discardIfAsked,
  hitPoint,
  matchPanel,
  passButton,
  passCombat,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "quiet-windows-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

const SHORT = "Choose a creature that isn't a Vampire, Werewolf or Zombie.";

const lit = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const onBoard = (page: Page, side: "viewer" | "opponent", name: RegExp) =>
  boardCards(page, side).filter({ hasText: name });
const choosableOn = (page: Page, side: "viewer" | "opponent", name: RegExp) =>
  onBoard(page, side, name).and(page.locator('[data-choosable="true"]'));
const stepOf = async (page: Page) =>
  (
    (await page
      .locator(".gs-steps")
      .getAttribute("data-step")
      .catch(() => "")) ?? ""
  ).trim();
const stackEmpty = async (page: Page) =>
  (await page.locator('button[data-zone="stack"]').count()) === 0;
const priorityHere = async (page: Page) =>
  (await matchPanel(page)
    .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
    .count()) > 0;
const untappedLands = async (page: Page) =>
  cardCount(
    boardCards(page, "viewer")
      .and(page.locator('[data-tapped="false"]'))
      .filter({ hasText: /^(Swamp|Island|Forest)/ }),
  );
const handCount = (page: Page) => page.locator('[data-zone="viewer:hand"]').count();

/** Every report window the page ever shows, and every frame the table is dimmed (page-side). */
async function watchWindows(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __reports: { at: number; said: string }[];
      __dimmed: number[];
    };
    w.__reports = [];
    w.__dimmed = [];
    let last = "";
    const tick = () => {
      const tray = document.querySelector<HTMLElement>(".gs-reveal");
      const said = tray ? (tray.getAttribute("aria-label") ?? tray.textContent ?? "") : "";
      if (said && said !== last)
        w.__reports.push({ at: performance.now(), said: said.slice(0, 160) });
      last = said;
      if (document.querySelector(".gs-screen.gs-report-pointing"))
        w.__dimmed.push(performance.now());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const reportsSeen = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __reports: { at: number; said: string }[] }).__reports,
  );
const dimmedFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __dimmed: number[] }).__dimmed.length);

/** Pay for the spell being cast, or answer its window, by clicking what the page lights. */
async function payOrAnswer(page: Page): Promise<boolean> {
  const panel = matchPanel(page);
  const tap = page.locator(
    '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
  );
  const listed = panel.locator(
    ".gs-win li button:not(:disabled), .gs-question li button:not(:disabled)",
  );
  const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
  if ((await tap.count()) > 0) await clickNow(tap);
  else if ((await listed.count()) > 0) await clickNow(listed);
  else if ((await main.count()) > 0) await clickNow(main);
  else return false;
  return true;
}

/** A point on the empty table: inside the board, on no card, tile or window. */
const emptyTable = (page: Page) =>
  page.evaluate(() => {
    const board = document.querySelector<HTMLElement>(".bf-board");
    if (!board) return null;
    const r = board.getBoundingClientRect();
    for (let fy = 0.35; fy <= 0.65; fy += 0.05)
      for (let fx = 0.2; fx <= 0.8; fx += 0.05) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (
          hit &&
          board.contains(hit) &&
          !hit.closest(
            "button, [data-object-id], [data-zone-tile], .gs-reveal, .gs-win, [role='dialog'], .gs-cast",
          )
        )
          return { x, y };
      }
    return null;
  });

function contexts(browser: import("@playwright/test").Browser) {
  const viewport = { width: 1920, height: 1080 };
  return (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, `quiet-${name}`), size: viewport } } : {}),
    });
}

test("your spell's short target window; no window for Mist Raven's bounce, a play-log line instead; the report dims the table only on a click", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no quiet-windows deck package (CI builds it)");
  mkdirSync(SHOTS, { recursive: true });
  const context = contexts(browser);
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    const of = (name: string, n: number) => Array.from({ length: n }, () => name);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Swamp",
            "Swamp",
            "Walking Corpse",
            "Island",
            "Victim of Night",
            "Griptide",
            "Swamp",
          ],
          top: ["Island", "Swamp", "Island", "Swamp", "Island", "Swamp", "Island", "Swamp"],
        },
        guest: {
          hand: ["Forest", "Grizzly Bears", "Island", "Island", "Island", "Mist Raven", "Forest"],
          top: of("Island", 10),
        },
      },
    });
    await watchWindows(host);
    await watchWindows(guest);

    const st = {
      victim: null as null | {
        cast: boolean;
        title: string;
        lines: string[];
        sentence: number;
      },
      victimCast: false,
      bearsDead: false,
      ravenCast: false,
      ravenAimed: false,
      handBefore: NaN,
      corpseHome: null as null | { reports: { at: number; said: string }[]; quietMs: number },
      griptideCast: false,
      report: null as null | {
        said: string;
        pointedDim: number;
        clicked: boolean;
        litTile: string[];
        undimmed: boolean;
      },
    };
    const done = () => st.victim && st.bearsDead && st.corpseHome && st.report;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => st);

    while (!done() && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // --- 2. the Corpse home on the host's page: no report window for it.
        if (isHost && st.ravenAimed && !st.corpseHome) {
          if ((await handCount(page)) > st.handBefore) {
            await page.screenshot({ path: join(SHOTS, "0109-raven-host-home.png") });
            // The report would come with the move's own board: none in the
            // three seconds after (a state that would persist, not an animation's wait).
            const from = Date.now();
            let opened = 0;
            while (Date.now() - from < 3_000) {
              opened += await page.locator(".gs-reveal").count();
              await page.waitForTimeout(100);
            }
            st.corpseHome = { reports: await reportsSeen(page), quietMs: Date.now() - from };
            if (opened > 0) st.corpseHome.reports.push({ at: -1, said: "a window was open" });
            continue;
          }
        }

        // --- 3. the guest's Griptide window: point across it, then click its picture.
        if (!isHost && st.griptideCast && !st.report) {
          const tray = page.locator(".gs-reveal").filter({ hasText: /Griptide/ });
          if ((await tray.count()) > 0) {
            const said = (
              (await tray.locator(".gs-reveal-said").allTextContents())[0] ?? ""
            ).trim();
            const before = await dimmedFrames(page);
            for (const part of [
              tray.locator(".gs-reveal-head"),
              tray.locator("li.gs-reveal-card"),
              tray.locator(".gs-reveal-head"),
            ]) {
              const at = await hitPoint(part);
              if (at) await page.mouse.move(at.x, at.y, { steps: 8 });
              await page.waitForTimeout(300);
            }
            await page.screenshot({ path: join(SHOTS, "0109-report-pointed-guest.png") });
            const pointedDim = (await dimmedFrames(page)) - before;
            const clicked = await realClick(page, tray.locator("li.gs-reveal-card").first());
            await expect(page.locator(".gs-screen.gs-report-pointing")).toHaveCount(1, {
              timeout: 5_000,
            });
            await page.screenshot({ path: join(SHOTS, "0109-report-picture-dim-guest.png") });
            const litTile = await page
              .locator(".gs-lit")
              .evaluateAll((els): string[] =>
                els.map(
                  (el) =>
                    (el as HTMLElement).dataset.zoneTile ??
                    `${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 20)} [in ${
                      el.parentElement?.closest<HTMLElement>("[data-zone-tile]")?.dataset
                        .zoneTile ??
                      el.parentElement?.closest<HTMLElement>("[data-zone]")?.dataset.zone ??
                      "?"
                    }; ${el.tagName}.${String(el.className).slice(0, 60)}]`,
                ),
              );
            const spot = await emptyTable(page);
            if (spot) {
              await page.mouse.move(spot.x, spot.y, { steps: 6 });
              await page.mouse.click(spot.x, spot.y);
            }
            await expect(page.locator(".gs-screen.gs-report-pointing")).toHaveCount(0, {
              timeout: 5_000,
            });
            await page.screenshot({ path: join(SHOTS, "0109-report-undimmed-guest.png") });
            const undimmed =
              (await page.locator(".gs-lit, .gs-screen.gs-report-pointing").count()) === 0;
            st.report = { said, pointedDim, clicked, litTile, undimmed: !!spot && undimmed };
            await host.screenshot({ path: join(SHOTS, "0109-report-host-meanwhile.png") });
            continue;
          }
        }

        // Targets.
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        if ((await targeting.count()) > 0) {
          let pick: Locator | null = null;
          // Whose question it is, by the window's "from" line: a click in a
          // fanned hand can land on the card beside the one meant (pass 1
          // once cast the guest's Griptide for its Raven); anything else is
          // backed out of with the act button.
          const from = (await targeting.allTextContents()).join(" ");
          const meant =
            (isHost && st.victimCast && !st.bearsDead && /Victim of Night/.test(from)) ||
            (isHost && st.griptideCast && /Griptide/.test(from)) ||
            (!isHost && st.ravenCast && /Mist Raven/.test(from));
          if (!meant) {
            const cancel = panel.locator("button.gs-act-cancel");
            if ((await cancel.count()) > 0) {
              console.log(`0109: backed out of an unplanned target question: ${from.slice(0, 80)}`);
              await clickNow(cancel);
              // The card meant is cast again on a later move.
              if (!isHost && !st.ravenAimed) st.ravenCast = false;
              if (isHost && !st.victim) st.victimCast = false;
              if (isHost && st.corpseHome && !st.report) st.griptideCast = false;
              continue;
            }
          }
          if (isHost && st.victimCast && !st.bearsDead) {
            // --- 1. the short window beside the big card, read in one evaluation.
            if (!st.victim) {
              await expect(page.locator(".gs-cast:not(.gs-cast-leaving)")).toHaveCount(1, {
                timeout: 5_000,
              });
              const win = await targeting.first().evaluate((el) => ({
                title: (
                  el.querySelector(".gs-question-title, .gs-win-title")?.textContent ?? ""
                ).trim(),
                lines: [...el.querySelectorAll(".gs-win-prompt")].map((p) =>
                  (p.textContent ?? "").trim(),
                ),
                sentence: el.querySelectorAll(".decision-prompt").length,
                cast: document.querySelector(".gs-cast:not(.gs-cast-leaving)") !== null,
              }));
              st.victim = win;
              await page.screenshot({ path: join(SHOTS, "0109-victim-short-window-host.png") });
              await guest.screenshot({ path: join(SHOTS, "0109-victim-guest.png") });
            }
            pick = choosableOn(page, "opponent", /^Grizzly Bears/);
          } else if (isHost && st.griptideCast) {
            pick = choosableOn(page, "opponent", /^Mist Raven/);
          } else if (!isHost && st.ravenCast) {
            pick = choosableOn(page, "opponent", /^Walking Corpse/);
            if ((await pick.count()) > 0) {
              await page.screenshot({ path: join(SHOTS, "0109-raven-trigger-guest.png") });
              st.handBefore = await handCount(host);
              if (await realClick(page, pick.first())) st.ravenAimed = true;
              continue;
            }
          }
          if (pick && (await pick.count()) > 0) {
            await realClick(page, pick.first());
            continue;
          }
        }

        if (isHost && st.victimCast && !st.bearsDead && st.victim) {
          const grave = Number(
            (
              await host
                .locator('[data-zone-tile="opponent:graveyard"] .gs-zone-n')
                .allTextContents()
            )[0] ?? 0,
          );
          if (
            grave >= 1 &&
            (await onBoard(host, "opponent", /^Grizzly Bears/).count()) === 0 &&
            (await stackEmpty(host))
          ) {
            st.bearsDead = true;
            await host.screenshot({ path: join(SHOTS, "0109-bears-destroyed-host.png") });
          }
        }

        if (await answerCardTray(page)) continue;
        const paying = (await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) > 0;
        if (paying && (await payOrAnswer(page))) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if (!(await priorityHere(page))) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else await clickNow(passButton(page));
          continue;
        }

        const main = /Main/.test(await stepOf(page));
        const empty = await stackEmpty(page);
        let pick: Locator | null = null;
        if (main && empty && isHost) {
          const lands = await untappedLands(page);
          const landInHand = lit(page, /^(Swamp|Island)/);
          if ((await landInHand.count()) > 0) pick = landInHand;
          else if (
            !st.victimCast &&
            (await onBoard(page, "opponent", /^Grizzly Bears/).count()) > 0 &&
            (await lit(page, /^Victim of Night/).count()) > 0
          ) {
            if (await realClick(page, lit(page, /^Victim of Night/))) st.victimCast = true;
            continue;
          } else if (
            st.corpseHome &&
            !st.griptideCast &&
            lands >= 4 &&
            (await onBoard(page, "opponent", /^Mist Raven/).count()) > 0 &&
            (await lit(page, /^Griptide/).count()) > 0
          ) {
            if (await realClick(page, lit(page, /^Griptide/))) st.griptideCast = true;
            continue;
          } else if (
            !st.ravenAimed &&
            (await onBoard(page, "viewer", /^Walking Corpse/).count()) === 0 &&
            (await lit(page, /^Walking Corpse/).count()) > 0
          ) {
            pick = lit(page, /^Walking Corpse/);
          }
        }
        if (main && empty && !isHost) {
          const forest = lit(page, /^Forest/);
          const island = lit(page, /^Island/);
          if (
            (await onBoard(page, "viewer", /^Forest/).count()) === 0 &&
            (await forest.count()) > 0
          )
            pick = forest;
          else if ((await island.count()) > 0) pick = island;
          else if (
            !st.victimCast &&
            (await onBoard(page, "viewer", /^Grizzly Bears/).count()) === 0 &&
            (await lit(page, /^Grizzly Bears/).count()) > 0
          )
            pick = lit(page, /^Grizzly Bears/);
          else if (
            st.bearsDead &&
            !st.ravenCast &&
            (await onBoard(page, "opponent", /^Walking Corpse/).count()) > 0 &&
            (await lit(page, /^Mist Raven/).count()) > 0
          ) {
            if (await realClick(page, lit(page, /^Mist Raven/))) st.ravenCast = true;
            continue;
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick.first());
        else await clickNow(passButton(page));
      }
    }

    // The play log of each page, opened in the game chat.
    const logOf = async (page: Page) => {
      const chat = page.getByRole("complementary", { name: "Game chat" });
      const opener = chat.locator("button.gs-chat-tab");
      if ((await opener.count()) > 0 && (await opener.getAttribute("aria-expanded")) !== "true")
        await realClick(page, opener);
      // The chat slides open: click the tab until it is the one shown.
      const tab = chat.getByRole("tab", { name: /^Play log/ });
      const log = chat.getByRole("log", { name: "Play log" });
      await expect(tab).toBeVisible({ timeout: 10_000 });
      for (let i = 0; i < 10 && (await log.locator(".gs-log-ent").count()) === 0; i++) {
        await realClick(page, tab);
        await expect(log.locator(".gs-log-ent").first())
          .toBeVisible({ timeout: 1_000 })
          .catch(() => undefined);
      }
      await expect(log.locator(".gs-log-ent").first()).toBeVisible({ timeout: 10_000 });
      await page.screenshot({
        path: join(SHOTS, `0109-play-log-${page === host ? "host" : "guest"}.png`),
      });
      return log
        .locator(".gs-log-ent")
        .evaluateAll((rows): string[] =>
          rows.map((r) => (r.textContent ?? "").replace(/\s+/g, " ").trim()),
        );
    };
    const hostLog = st.corpseHome ? await logOf(host) : [];
    const guestLog = st.corpseHome ? await logOf(guest) : [];

    console.log(`0109 game: ${JSON.stringify(st)}`);
    console.log(
      `0109 logs: ${JSON.stringify({ host: hostLog.slice(-12), guest: guestLog.slice(-12) })}`,
    );
    // 1.
    expect(st.victim, "the host's Victim of Night asked for its target").not.toBeNull();
    expect(st.victim!.cast, "beside its big card").toBe(true);
    expect(st.victim!.title).toBe("Choose a target");
    expect(st.victim!.lines, "one short line").toEqual([SHORT]);
    expect(st.victim!.sentence, "no card sentence").toBe(0);
    expect(st.bearsDead, "the Bears were destroyed").toBe(true);
    // 2.
    expect(st.corpseHome, "the Raven sent the host's Corpse home").not.toBeNull();
    expect(st.corpseHome!.reports, "no report window on the host's page").toEqual([]);
    expect(
      hostLog.some((line) => /Walking Corpse returned to .+'s hand/.test(line)),
      "the host's play log has the line",
    ).toBe(true);
    expect(
      guestLog.some((line) => /Walking Corpse returned to .*hand/.test(line)),
      "the guest's play log has it too",
    ).toBe(true);
    // 3.
    expect(st.report, "the guest's Griptide window came").not.toBeNull();
    expect(st.report!.said).toMatch(/put your Mist Raven on top of your library\.$/);
    expect(st.report!.pointedDim, "pointing across the window never dims the table").toBe(0);
    expect(st.report!.clicked, "the picture was really clicked").toBe(true);
    // Where the Raven lies now: the top of the guest's library (its tile), or,
    // once the guest has drawn it, the guest's hand card (the report's link).
    expect(st.report!.litTile, "one thing kept bright").toHaveLength(1);
    expect(st.report!.litTile[0], "the guest's Library tile, or the Raven itself").toMatch(
      /^(viewer:library|Mist Raven)/,
    );
    expect(st.report!.undimmed, "a click on the empty table brings it back").toBe(true);
  } finally {
    await host.screenshot({ path: join(SHOTS, "0109-last-host.png") }).catch(() => undefined);
    await guest.screenshot({ path: join(SHOTS, "0109-last-guest.png") }).catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
