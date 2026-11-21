// Plain-English wording, in a real game -- spec 0113 (F-0113-G), AGENTS TEST-012.
//
// Dealt (spec 0098): the host (RudeLeft) holds Islands, Swamps, Nagging
// Thoughts and Weaponcraft Enthusiast, and the rest of the host's library
// starts Swamp, Island, Swamp, Island ... so whichever seat goes first (the
// die roll is not dealt), the two cards Nagging Thoughts looks at are one
// Island and one Swamp. The guest (Pat) holds and draws Swamps only.
//
// 1. The host's first Main 1, no creature on the table: the act button reads
//    "Nothing can attack. On to Main 2." (W1-036).
// 2. The host REALLY clicks Nagging Thoughts and pays; of the two cards it
//    looks at, the host picks the Swamp, so the Island goes to the graveyard
//    (seen by the guest) and the hidden card is "the other card". The
//    guest's report window reads W1-141's sentence.
// 3. The host REALLY clicks Weaponcraft Enthusiast; its Fabricate 2 asks the
//    host to pay its cost, and the cost window reads "Put two +1/+1 counters
//    on Weaponcraft Enthusiast?" (W1-223's words; no card puts two CHARGE
//    counters as a cost that asks, so Fabricate's +1/+1 counters are the
//    closest).
// 4. The guest's play log has the Island's line with "an Island".
//
// Every read is from a window's role, class or data attribute, never by its
// words (PROTO-006); every word check is in `checkWords`. Stills of each
// window read go to PROXIC_E2E_STILLS when it is set; PROXIC_CLIPS films
// one normal-speed clip per seat. The deck is protocol/fixtures/wording-deck.
// CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/wording-deck.zip" protocol/fixtures/wording-deck

import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import {
  answerCardTray,
  boardCards,
  clearEverything,
  clickNow,
  discardIfAsked,
  matchPanel,
  passCombat,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "wording-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const STILLS = process.env.PROXIC_E2E_STILLS;
const CLIPS = process.env.PROXIC_CLIPS;

/** The new words (docs/features/wording/0113-wording-table.md). */
const WORDS = {
  act: "Nothing can attack. On to Main 2.",
  dig: `${testUser} looked at the top two cards of their library, putting an Island into their graveyard and the other card into their hand.`,
  cost: "Put two +1/+1 counters on Weaponcraft Enthusiast?",
};

type Seen = {
  act: null | { step: string; word: string; sub: string; aria: string; creatures: number };
  dig: null | {
    said: string;
    aria: string;
    by: string;
    cards: { name: string; to: string }[];
  };
  cost: null | { title: string; aria: string; from: string; act: string };
  log: null | { kind: string; text: string; cards: string[] }[];
};

/**
 * Every word check of this test, in one place. On the old words (before
 * spec 0113 is built) flip LOG_ONLY to true to see the flow run and log
 * what each read point saw; it is false in the committed test.
 */
const LOG_ONLY = false;
function checkWords(seen: Seen) {
  console.log(`0113 words seen: ${JSON.stringify(seen, null, 1)}`);
  if (LOG_ONLY) return;
  expect(seen.act!.sub, "the act button in Main 1 with nothing to attack").toBe(WORDS.act);
  expect(seen.act!.aria).toBe(`Pass: Next. ${WORDS.act}`);
  expect(seen.dig!.said, "the guest's report window for Nagging Thoughts").toBe(WORDS.dig);
  expect(seen.dig!.aria).toBe(WORDS.dig);
  expect(seen.cost!.title, "the host's cost window for Fabricate 2").toBe(WORDS.cost);
  expect(seen.cost!.aria).toBe(WORDS.cost);
  // The Island's line (today: "Island went to RudeLeft's graveyard from their
  // library"); the article may open the sentence.
  const island = seen.log!.filter(
    (l) => l.cards.some((c) => /\bIsland$/.test(c)) && /graveyard/.test(l.text),
  );
  expect(island.length, "the guest's play log has the Island's graveyard line").toBeGreaterThan(0);
  expect(
    island.every((l) => /\b[Aa]n Island\b/.test(l.text)),
    `the Island's play-log line says "an Island": ${JSON.stringify(island)}`,
  ).toBe(true);
}

// By the card's name at the start of its screen-reader name ("Swamp, in your
// hand"): a card drawn without a picture carries no name text to filter on.
const litInHand = (page: Page, name: string) =>
  page.locator(
    `[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])[aria-label^="${name}"]`,
  );
const onBoard = (page: Page, side: "viewer" | "opponent", name: string) =>
  boardCards(page, side).and(page.locator(`[aria-label^="${name}"]`));
/** "No" on your move: never the act button's Cancel, never a discard or combat. */
const pass = (page: Page) =>
  matchPanel(page).locator(
    "button.gs-act:not(.gs-act-discard):not(.gs-act-cancel):not(.gs-act-combat), button.gs-pass",
  );
const priorityHere = async (page: Page) =>
  (await matchPanel(page)
    .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
    .count()) > 0;
/** Fabricate's cost window: the one whose yes is the cost's own action. */
const costWindow = (page: Page) => matchPanel(page).locator(".gs-win:has(button.gs-cost-act)");

/** A still of one window, when PROXIC_E2E_STILLS names a folder. */
async function still(target: Locator, file: string) {
  if (!STILLS) return;
  await target
    .first()
    .screenshot({ path: join(STILLS, file), timeout: 5_000 })
    .catch(() => undefined);
}

/** Step 1 -- the act button, its words and its screen-reader name, with the step, in one look. */
const actOn = (page: Page) =>
  page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>(
      "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard):not(.gs-act-window):not(.gs-act-leave)",
    );
    if (!btn) return null;
    return {
      step: document.querySelector(".gs-steps")?.getAttribute("data-step") ?? "",
      word: btn.querySelector(".gs-act-word")?.textContent?.trim() ?? "",
      sub: btn.querySelector(".gs-act-sub")?.textContent?.trim() ?? "",
      aria: btn.getAttribute("aria-label") ?? "",
      // The deal's only creature is Weaponcraft Enthusiast.
      creatures: [
        ...document.querySelectorAll(
          '.bf-cards button[data-controller="viewer"][aria-label]:not([data-zone="viewer:hand"])',
        ),
      ].filter((b) => b.getAttribute("aria-label")!.startsWith("Weaponcraft Enthusiast")).length,
    };
  });

/** Step 2 -- the report window in full whose cards include an Island put into a graveyard. */
const digReport = (page: Page) =>
  page.evaluate(() => {
    for (const full of document.querySelectorAll<HTMLElement>(".gs-reveal .gs-report-full")) {
      const cards = [
        ...full.querySelectorAll<HTMLElement>(".gs-reveal-card[data-revealed-id]"),
      ].map((li) => ({
        name: li.querySelector(".gs-reveal-name")?.textContent?.trim() ?? "",
        to: li.dataset.to ?? "",
      }));
      if (!cards.some((c) => c.name === "Island" && /grave/i.test(c.to))) continue;
      return {
        said: full.querySelector(".gs-reveal-said")?.textContent?.trim() ?? "",
        aria: full.closest(".gs-reveal")?.getAttribute("aria-label") ?? "",
        by: full.querySelector(".gs-reveal-by")?.textContent?.trim() ?? "",
        cards,
      };
    }
    return null;
  });

/** Step 3 -- the cost window's title, name, card line and yes. */
const costOn = (page: Page) =>
  page.evaluate(() => {
    const win = [...document.querySelectorAll<HTMLElement>(".gs-win")].find((w) =>
      w.querySelector("button.gs-cost-act"),
    );
    if (!win) return null;
    return {
      title: win.querySelector(".gs-win-title")?.textContent?.trim() ?? "",
      aria: win.getAttribute("aria-label") ?? "",
      from: win.querySelector(".gs-win-from")?.textContent?.trim() ?? "",
      act: win.querySelector("button.gs-cost-act")?.textContent?.trim() ?? "",
    };
  });

/** Step 4 -- open the play log (as match-play-log does) and read every line. */
async function readPlayLog(page: Page) {
  const chat = page.getByRole("complementary", { name: "Game chat" });
  const opener = chat.locator("button.gs-chat-tab");
  await expect(opener.or(chat.getByRole("tab", { name: /^Play log/ })).first()).toBeVisible({
    timeout: 60_000,
  });
  if ((await opener.count()) > 0 && (await opener.getAttribute("aria-expanded")) !== "true") {
    await opener.click({ timeout: 15_000 });
  }
  await chat.getByRole("tab", { name: /^Play log/ }).click({ timeout: 15_000 });
  const log = chat.getByRole("log", { name: "Play log" });
  await expect(log.locator(".gs-log-ent").first()).toBeVisible({ timeout: 30_000 });
  const lines = await log.locator(".gs-log-ent").evaluateAll((rows) =>
    rows.map((row) => ({
      kind: (row as HTMLElement).dataset.kind ?? "",
      text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      cards: [...row.querySelectorAll(".gs-log-cn")].map((b) => (b.textContent ?? "").trim()),
    })),
  );
  // The Island's line in view for the still.
  await log
    .locator(".gs-log-ent:has(.gs-log-cn)")
    .filter({ has: page.locator(".gs-log-cn", { hasText: /Island$/ }) })
    .last()
    .scrollIntoViewIfNeeded({ timeout: 5_000 })
    .catch(() => undefined);
  await still(log, "0113-4-play-log-guest.png");
  return lines;
}

function contexts(browser: Browser) {
  const viewport = { width: 1920, height: 1080 };
  return (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, `wording-${name}`), size: viewport } } : {}),
    });
}

test("the game screen's words: the act button, a look-at-the-top report, a counter cost and the play log", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no wording deck package (CI builds it)");
  mkdirSync(SHOTS, { recursive: true });
  if (STILLS) mkdirSync(STILLS, { recursive: true });
  const context = contexts(browser);
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    const alternate = (n: number) =>
      Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "Swamp" : "Island"));
    const swamps = (n: number) => Array.from({ length: n }, () => "Swamp");
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Island",
            "Swamp",
            "Island",
            "Nagging Thoughts",
            "Weaponcraft Enthusiast",
            "Swamp",
            "Island",
          ],
          top: alternate(12),
        },
        guest: { hand: swamps(7), top: swamps(10) },
      },
    });

    const seen: Seen = { act: null, dig: null, cost: null, log: null };
    const st = {
      thoughtsClicked: false,
      thoughtsClicks: 0,
      digTile: "",
      digPicked: "",
      enthusiastClicked: false,
      costPaid: false,
      landsTapped: 0,
    };
    const done = () => seen.act && seen.dig && seen.cost && st.costPaid;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({ st, seen }));

    while (!done() && Date.now() < deadline) {
      await watch.check();
      // The dig's report comes before Fabricate's cost: once that is paid, it can never be read.
      if (st.costPaid && !seen.dig) {
        throw new Error(
          `the guest's report window for Nagging Thoughts was never read: ${JSON.stringify(st)}`,
        );
      }
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;

        // Step 2's read point -- the guest's report window, read before anything closes it.
        if (!isHost && !seen.dig) {
          // A report window still coming in (its cards land after it opens):
          // give it a moment before anything below puts it away.
          if ((await guest.locator(".gs-reveal").count()) > 0) {
            await expect
              .poll(() => digReport(guest), { timeout: 4_000 })
              .not.toBeNull()
              .catch(() => undefined);
          }
          let report = await digReport(guest);
          // A later report may have gathered it into the window's earlier rows:
          // really open each row, and read the one that is the dig.
          const rows = guest.locator(".gs-reveal .gs-report-row-open");
          for (let i = 0, n = await rows.count(); !report && i < n; i++) {
            if (!(await realClick(guest, rows.nth(i)))) continue;
            await expect
              .poll(() => digReport(guest), { timeout: 3_000 })
              .not.toBeNull()
              .catch(() => undefined);
            report = await digReport(guest);
          }
          if (report) {
            seen.dig = report;
            await still(guest.locator(".gs-reveal"), "0113-2-dig-report-guest.png");
            await clickNow(guest.locator(".gs-reveal .gs-reveal-close"));
            continue;
          }
        }
        if (await discardIfAsked(page)) continue;
        // Any other report window: put away (the guest's dig report was read above).
        const close = page.locator(".gs-reveal .gs-reveal-close");
        if ((await close.count()) > 0) {
          if (!isHost && !seen.dig) {
            // It may have come in since the look above: look again before putting it away.
            await expect
              .poll(() => digReport(guest), { timeout: 4_000 })
              .not.toBeNull()
              .catch(() => undefined);
            const late = await digReport(guest);
            if (late) {
              seen.dig = late;
              await still(guest.locator(".gs-reveal"), "0113-2-dig-report-guest.png");
            } else {
              const said = await page.locator(".gs-reveal .gs-reveal-said").allTextContents();
              console.log(`0113 guest report put away unread: ${JSON.stringify(said)}`);
            }
          }
          await clickNow(close);
          continue;
        }

        // Step 3 -- Fabricate's cost window: read it, then really click its yes.
        if (isHost && (await costWindow(page).count()) > 0) {
          if (!seen.cost) {
            seen.cost = await costOn(page);
            await still(costWindow(page), "0113-3-cost-window-host.png");
          }
          if (await realClick(page, costWindow(page).locator("button.gs-cost-act"))) {
            st.costPaid = true;
          }
          continue;
        }

        // Step 2 -- Nagging Thoughts' two cards: the host picks the one that is not an Island.
        if (isHost && st.thoughtsClicked && !st.digPicked) {
          const tray = panel.locator(".gs-win.gs-tray:has(button.gs-win-tile[data-object-id])");
          if ((await tray.count()) > 0) {
            const tiles = await tray
              .locator("button.gs-win-tile[data-object-id]")
              .evaluateAll((els) =>
                els.map((el) => ({
                  name: el.querySelector(".gs-win-tile-name")?.textContent?.trim() ?? "",
                  pressed: el.getAttribute("aria-pressed") === "true",
                })),
              );
            console.log(
              `0113 dig tray: ${await tray.first().getAttribute("data-kind")} ${JSON.stringify(tiles)}`,
            );
            await still(tray, "0113-2-dig-choice-host.png");
            const other = tray
              .locator("button.gs-win-tile[data-object-id]:not(:disabled)")
              .filter({ has: page.locator(".gs-win-tile-name", { hasNotText: /^Island$/ }) });
            const main = tray.locator("button.gs-win-btn-main:not(:disabled)");
            // Two Islands (a cast that did not go through let a draw shift the
            // deal's order): keep either; one Island still goes to the graveyard.
            const twoIslands = tiles.every((t) => t.name === "Island");
            const chosen = tiles.find((t) => t.pressed && (twoIslands || t.name !== "Island"));
            if (chosen && (await main.count()) > 0) {
              // Picked: Done.
              if (await realClick(page, main.first())) st.digPicked = chosen.name;
            } else if (!chosen && (await other.count()) > 0) {
              const name = tiles.find((t) => t.name !== "Island")?.name ?? "?";
              if (await realClick(page, other.first())) st.digTile = name;
            } else if (!chosen && twoIslands) {
              const first = tray
                .locator("button.gs-win-tile[data-object-id]:not(:disabled)")
                .first();
              if (await realClick(page, first)) st.digTile = "Island";
            }
            continue;
          }
          // A pick that needed no Done: the tray went with the click.
          if (st.digTile) {
            st.digPicked = st.digTile;
            continue;
          }
          const listed = panel
            .locator(".gs-win li button:not(:disabled), .gs-question li button:not(:disabled)")
            .filter({ hasNotText: /^Island\b/ });
          if ((await listed.count()) > 0) {
            const label = ((await listed.first().textContent()) ?? "").trim();
            console.log(`0113 dig listed: ${label}`);
            if (await realClick(page, listed.first())) st.digPicked = label;
            continue;
          }
        }

        // Paying: a real click on a land the page lights.
        if ((await panel.locator('[data-kind="applyManaToCost"]').count()) > 0) {
          const land = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
          );
          if ((await land.count()) > 0) {
            if (await realClick(page, land.first())) st.landsTapped += 1;
            continue;
          }
        }

        // Fabricate's window may have come in since the look above: never answer it below.
        if (isHost && (await costWindow(page).count()) > 0) continue;
        if (await answerCardTray(page)) continue;
        // Nobody attacks.
        if ((await panel.locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        if (!(await priorityHere(page))) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else await clickNow(pass(page));
          continue;
        }

        const step =
          (await page
            .locator(".gs-steps")
            .getAttribute("data-step")
            .catch(() => "")) ?? "";
        const empty = (await page.locator('button[data-zone="stack"]').count()) === 0;
        if (isHost && /Main/.test(step) && empty) {
          // Step 1 -- the host's first Main 1, nothing on the table that could attack.
          if (!seen.act && step === "Main 1") {
            const act = await actOn(page);
            if (act && act.creatures === 0) {
              seen.act = act;
              await still(
                panel.locator(
                  "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
                ),
                "0113-1-act-button-host.png",
              );
              continue;
            }
          }
          if (!seen.act) {
            // Not read yet (a second main phase): play nothing until it is.
            await clickNow(pass(page));
            continue;
          }
          // A land: an Island first, then Swamps.
          const islands = await onBoard(page, "viewer", "Island").count();
          const swamps = litInHand(page, "Swamp");
          const pick =
            islands === 0 || (await swamps.count()) === 0 ? litInHand(page, "Island") : swamps;
          if ((await pick.count()) > 0 && (await realClick(page, pick.first()))) continue;
          // Nagging Thoughts, until its two cards are chosen (a cast that did
          // not go through leaves it lit in the hand: clicked again).
          if (!st.digPicked && (await litInHand(page, "Nagging Thoughts").count()) > 0) {
            if (await realClick(page, litInHand(page, "Nagging Thoughts").first())) {
              st.thoughtsClicked = true;
              st.thoughtsClicks += 1;
              console.log(`0113 cast Nagging Thoughts (${st.thoughtsClicks})`);
            }
            continue;
          }
          // Weaponcraft Enthusiast, until Fabricate's cost is paid (a cast that
          // did not go through leaves it lit in the hand: clicked again).
          if (
            st.digPicked &&
            !st.costPaid &&
            (await litInHand(page, "Weaponcraft Enthusiast").count()) > 0
          ) {
            if (await realClick(page, litInHand(page, "Weaponcraft Enthusiast").first())) {
              st.enthusiastClicked = true;
              console.log("0113 cast Weaponcraft Enthusiast");
            }
            continue;
          }
          // On the table without its cost window ever seen: say so, do not play on.
          if (
            st.enthusiastClicked &&
            !seen.cost &&
            (await onBoard(page, "viewer", "Weaponcraft Enthusiast").count()) > 0
          ) {
            throw new Error(
              `Weaponcraft Enthusiast resolved with no cost window seen: ${JSON.stringify(st)}`,
            );
          }
        }
        if (!isHost && /Main/.test(step) && empty) {
          const land = litInHand(page, "Swamp");
          if ((await land.count()) > 0 && (await realClick(page, land.first()))) continue;
        }
        await clickNow(pass(page));
      }
    }

    console.log(`0113 game: ${JSON.stringify(st)}`);
    expect(st.thoughtsClicked, "the host really cast Nagging Thoughts").toBe(true);
    expect(st.digPicked, "the host kept the card that is not an Island").not.toBe("");
    expect(st.enthusiastClicked, "the host really cast Weaponcraft Enthusiast").toBe(true);
    expect(st.costPaid, "the host really paid Fabricate's cost").toBe(true);
    expect(seen.act, "the host's first Main 1 was read").not.toBeNull();
    expect(seen.act!.step).toBe("Main 1");
    expect(seen.dig, "the guest saw the report window for Nagging Thoughts").not.toBeNull();
    expect(seen.cost, "the host saw Fabricate's cost window").not.toBeNull();

    // Step 4 -- the guest's play log, read once the rest is done.
    seen.log = await readPlayLog(guest);
    checkWords(seen);
  } finally {
    await host.screenshot({ path: join(SHOTS, "0113-last-host.png") }).catch(() => undefined);
    await guest.screenshot({ path: join(SHOTS, "0113-last-guest.png") }).catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
