// Soulbond pair marks, in a real game -- spec 0111 (F-0111-E), AGENTS TEST-012.
//
// Dealt (spec 0098): the host (Alice) holds Plains, Islands, Elder Cathar and
// Tandem Lookout; the guest (Bob) only lands.
//
// 1. The host REALLY clicks Elder Cathar in hand and pays with real clicks
//    on its lands; then Tandem Lookout. Lookout's soulbond trigger asks
//    Forge's own question, "Select a card to pair with" (Forge asks no Yes
//    first: the question itself is optional), and the host REALLY clicks
//    Elder Cathar as the partner.
// 2. Both cards, on both pages, show the gold link mark.
// 3. The host points at Tandem Lookout (a real mouse move): Elder Cathar
//    lights (bf-lifted, `data-lifted`). The guest points at the host's
//    Tandem Lookout: Elder Cathar lights on the guest's page too.
// 4. The host right-clicks Tandem Lookout: the close-up says "Paired with
//    Elder Cathar".
//
// Every wait is on a state (the question there, the mark present, the light
// on, the close-up open), never an animation's length. The deck is
// protocol/fixtures/soulbond-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/soulbond-deck.zip" protocol/fixtures/soulbond-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  matchPanel,
  passButton,
  passCombat,
  PAYING,
  pointAt,
  realClick,
  realClickIf,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "soulbond-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

/** A hand card the page lights. */
const lit = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const onBoard = (page: Page, side: "viewer" | "opponent", name: RegExp) =>
  boardCards(page, side).filter({ hasText: name });
const stepOf = async (page: Page) =>
  (
    (await page
      .locator(".gs-steps")
      .getAttribute("data-step")
      .catch(() => "")) ?? ""
  ).trim();
const stackCount = (page: Page) => page.locator('button[data-zone="stack"]').count();
const priorityHere = async (page: Page) =>
  (await matchPanel(page)
    .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
    .count()) > 0;

type Seen = {
  /** The board card's id, by name (the host's two creatures). */
  ids: Record<string, string>;
  /** Each card's live link mark (not one shrinking away), and whether it is lit. */
  marks: Record<string, boolean>;
  lifted: Record<string, boolean>;
  /** The link mark's words (its tooltip). */
  words: Record<string, string>;
};

/** The two creatures as one page draws them, read in one evaluation. */
const seenOn = (page: Page) =>
  page.evaluate((): Seen => {
    const out: Seen = { ids: {}, marks: {}, lifted: {}, words: {} };
    for (const b of document.querySelectorAll<HTMLElement>(
      '.bf-cards button.bf-card[data-object-id]:not([data-zone$=":hand"])',
    )) {
      const text = b.textContent ?? "";
      const name = ["Tandem Lookout", "Elder Cathar"].find((n) => text.startsWith(n));
      if (!name) continue;
      out.ids[name] = b.dataset.objectId ?? "";
      out.marks[name] = !!b.querySelector('[data-mark="paired"]:not([data-leaving="true"])');
      out.lifted[name] = b.dataset.lifted === "true";
      out.words[name] = b.querySelector<HTMLElement>(".bf-badges")?.title ?? "";
    }
    return out;
  });

/**
 * The pair's marks have landed and nothing on the two cards is moving: no
 * riser on the page (spec 0085: a new mark rises off the card, then drops
 * into its square), and no animation or transition of the two cards or their
 * squares still running (a state, polled).
 */
const settled = (page: Page) =>
  page.evaluate(() => {
    if (document.querySelector(".bf-fight-riser")) return false;
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        '.bf-cards button.bf-card[data-object-id]:not([data-zone$=":hand"])',
      ),
    ].filter((b) => /^(Tandem Lookout|Elder Cathar)/.test(b.textContent ?? ""));
    return (
      cards.length === 2 &&
      cards.every((b) =>
        b
          .getAnimations({ subtree: true })
          .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      )
    );
  });

const pairShown = async (page: Page) => {
  const s = await seenOn(page);
  return s.marks["Tandem Lookout"] === true && s.marks["Elder Cathar"] === true;
};

function contexts(browser: import("@playwright/test").Browser) {
  const viewport = { width: 1920, height: 1080 };
  return (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, `soulbond-${name}`), size: viewport } } : {}),
    });
}

/** Point at [name]'s board card with the real mouse; then [partner] lights (polled). */
async function pointAtCard(page: Page, side: "viewer" | "opponent", name: RegExp) {
  const at = await pointAt(page, onBoard(page, side, name).first());
  expect(at, `a point of ${name} the mouse can reach`).not.toBeNull();
}

test("soulbond: the link mark on both cards on both pages; pointing lights the partner; the close-up says it", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no soulbond deck package (CI builds it)");
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
            "Plains",
            "Island",
            "Plains",
            "Elder Cathar",
            "Tandem Lookout",
            "Island",
            "Plains",
          ],
          top: [...of("Island", 3), ...of("Plains", 3)],
        },
        guest: {
          hand: [...of("Plains", 4), ...of("Island", 3)],
          top: [...of("Island", 3), ...of("Plains", 3)],
        },
      },
    });

    const st = {
      catharClicked: false,
      lookoutClicked: false,
      pairAsked: "",
      pairClicked: false,
      paired: false,
      landsClicked: 0,
    };
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => st);

    while (!st.paired && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // --- the soulbond question: Forge's own, answered by a real click on Elder Cathar.
        if (isHost && st.lookoutClicked && !st.pairClicked) {
          const win = panel.locator(".gs-win, .gs-question").filter({ hasText: /pair/i });
          if ((await win.count()) > 0) {
            if (!st.pairAsked) {
              st.pairAsked = (await win.first().allTextContents()).join(" ").slice(0, 160);
              await host.screenshot({ path: join(SHOTS, "0111-1-pair-question-host.png") });
              await guest.screenshot({ path: join(SHOTS, "0111-1-pair-question-guest.png") });
            }
            const onTable = onBoard(host, "viewer", /^Elder Cathar/).and(
              host.locator('[data-choosable="true"]'),
            );
            const tile = win.locator("button.gs-win-tile:not(:disabled), li button").filter({
              hasText: /Elder Cathar/,
            });
            if ((await onTable.count()) > 0) {
              if (await realClick(host, onTable.first())) st.pairClicked = true;
            } else if ((await tile.count()) > 0) {
              if (await realClick(host, tile.first())) st.pairClicked = true;
            }
            continue;
          }
        }

        // --- the pair: the mark on both cards, on both pages.
        if (isHost && st.pairClicked && (await pairShown(host)) && (await pairShown(guest))) {
          st.paired = true;
          break;
        }

        // --- paying: a real click on a land the page lights.
        if ((await panel.locator('[data-kind="applyManaToCost"]').count()) > 0) {
          const land = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone$=":hand"])',
          );
          if ((await land.count()) > 0) {
            if (await realClickIf(page, land.first(), PAYING)) st.landsClicked += 1;
            continue;
          }
        }

        // Never the soulbond question while the step above waits for it: it
        // can open between that look and these catch-alls, whose generic
        // answer is not the real click on Elder Cathar.
        const pairWait =
          isHost && st.lookoutClicked && !st.pairClicked
            ? { css: ".gs-win, .gs-question", words: "pair" }
            : undefined;
        if (await answerCardTray(page, pairWait ? { saying: pairWait } : {})) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if (!(await priorityHere(page))) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed, undefined, pairWait);
          else if ((await main.count()) > 0) await clickUnlessCombat(main, undefined, pairWait);
          else if ((await passButton(page).count()) > 0) await clickNow(passButton(page));
          continue;
        }

        const main = /Main/.test(await stepOf(page));
        const empty = (await stackCount(page)) === 0;
        let pick = null as null | ReturnType<typeof lit>;
        if (main && empty) {
          const land = lit(page, /Plains|Island/);
          if ((await land.count()) > 0) pick = land;
          else if (isHost && !st.catharClicked && (await lit(page, /Elder Cathar/).count()) > 0) {
            if (await realClick(page, lit(page, /Elder Cathar/))) st.catharClicked = true;
            continue;
          } else if (
            isHost &&
            !st.lookoutClicked &&
            (await onBoard(page, "viewer", /^Elder Cathar/).count()) > 0 &&
            (await lit(page, /Tandem Lookout/).count()) > 0
          ) {
            if (await realClick(page, lit(page, /Tandem Lookout/))) st.lookoutClicked = true;
            continue;
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick.first());
        else await clickNow(passButton(page));
      }
      // A cast Forge undid (not paid): its card is back in the hand, lit again.
      if (st.catharClicked && !st.lookoutClicked) {
        const back =
          (await onBoard(host, "viewer", /^Elder Cathar/).count()) === 0 &&
          (await stackCount(host)) === 0 &&
          (await lit(host, /Elder Cathar/).count()) > 0 &&
          (await priorityHere(host));
        if (back) st.catharClicked = false;
      }
    }

    console.log(`0111 game: ${JSON.stringify(st)}`);
    expect(st.pairAsked, "Forge's soulbond question was asked").toMatch(/pair/i);
    expect(st.pairClicked, "the host really clicked Elder Cathar as the partner").toBe(true);
    expect(st.paired, "the pair's marks showed on both pages").toBe(true);

    // 2. Both cards, both pages: the link mark, with its words (once landed).
    for (const page of [host, guest])
      await expect.poll(() => settled(page), { timeout: 15_000 }).toBe(true);
    const hostSees = await seenOn(host);
    const guestSees = await seenOn(guest);
    await host.screenshot({ path: join(SHOTS, "0111-2-marks-host.png") });
    await guest.screenshot({ path: join(SHOTS, "0111-2-marks-guest.png") });
    expect(hostSees.marks).toEqual({ "Tandem Lookout": true, "Elder Cathar": true });
    expect(guestSees.marks).toEqual({ "Tandem Lookout": true, "Elder Cathar": true });
    expect(hostSees.words["Tandem Lookout"]).toContain("Paired with Elder Cathar");
    expect(hostSees.words["Elder Cathar"]).toContain("Paired with Tandem Lookout");
    expect(guestSees.words["Tandem Lookout"]).toContain("Paired with Elder Cathar");
    // The same cards (PROTO-001: one id for both pages).
    expect(guestSees.ids).toEqual(hostSees.ids);

    // 3. The host points at Tandem Lookout: Elder Cathar lights, Lookout does not.
    await pointAtCard(host, "viewer", /^Tandem Lookout/);
    await expect
      .poll(async () => (await seenOn(host)).lifted, { timeout: 10_000 })
      .toEqual({ "Tandem Lookout": false, "Elder Cathar": true });
    await expect.poll(() => settled(host), { timeout: 10_000 }).toBe(true);
    await host.screenshot({ path: join(SHOTS, "0111-3-point-lookout-host.png") });
    // Away: the light goes.
    await host.mouse.move(960, 60, { steps: 4 });
    await expect
      .poll(async () => (await seenOn(host)).lifted["Elder Cathar"], { timeout: 10_000 })
      .toBe(false);
    // The guest points at the host's Tandem Lookout: the same light on its page.
    await pointAtCard(guest, "opponent", /^Tandem Lookout/);
    await expect
      .poll(async () => (await seenOn(guest)).lifted, { timeout: 10_000 })
      .toEqual({ "Tandem Lookout": false, "Elder Cathar": true });
    await expect.poll(() => settled(guest), { timeout: 10_000 }).toBe(true);
    await guest.screenshot({ path: join(SHOTS, "0111-3-point-lookout-guest.png") });
    await guest.mouse.move(960, 60, { steps: 4 });

    // 4. The host right-clicks Tandem Lookout: "Paired with Elder Cathar".
    expect(
      await realClick(host, onBoard(host, "viewer", /^Tandem Lookout/).first(), {
        button: "right",
      }),
      "Tandem Lookout takes a real right-click",
    ).toBe(true);
    const facts = host.locator(".gs-inspect .gs-inspect-facts");
    await expect
      .poll(
        async () =>
          host.evaluate(() =>
            [...document.querySelectorAll(".gs-inspect .gs-inspect-facts dt")].map(
              (dt) => `${dt.textContent} ${dt.nextElementSibling?.textContent ?? ""}`,
            ),
          ),
        { timeout: 10_000 },
      )
      .toContain("Paired with Elder Cathar");
    await expect(facts).toHaveCount(1);
    await host.screenshot({ path: join(SHOTS, "0111-4-close-up-host.png") });
    await host.keyboard.press("Escape");
  } finally {
    await host.screenshot({ path: join(SHOTS, "0111-last-host.png") }).catch(() => undefined);
    await guest.screenshot({ path: join(SHOTS, "0111-last-guest.png") }).catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
