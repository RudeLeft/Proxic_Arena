// The questions whose answer is a number, in a real game, through the page
// -- PHASE_09 W-11, Amendment 14 (owner 2026-11-03, canvas
// https://claude.ai/artifact/FSPaHn8XrLy4a5egPdiVuM: option A twice).
//
//   X          Fireball, Rolling Thunder, Comet Storm: the dial, "Choose X",
//              the card's sentence, what can be made, the cost as it
//              changes; "Most you can pay", then "Cast ... with X = N"
//   how many   Everflowing Chalice, Comet Storm: "Kick it how many times?",
//              what each time costs
//   a number   Harnessed Lightning: "Pay how much energy?", how much there is
//   the split  Arc Lightning, Rolling Thunder: every target
//              first (two here), then one tray, "Split N damage", + and -,
//              Done -- and no share asked again
//
// Each is pictured the first time, and its words written to
// test-results/seen/numbers.json. Both players use the numbers test deck
// (protocol/fixtures/numbers-deck); locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/numbers-deck.zip" protocol/fixtures/numbers-deck

import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  cardCount,
  clearEverything,
  clickNow,
  matchPanel,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "numbers-deck.zip");
const SPELLS =
  /^(Fireball|Rolling Thunder|Comet Storm|Arc Lightning|Forked Bolt|Harnessed Lightning|Everflowing Chalice|Gray Ogre|Hill Giant)/;
const DIALS = ["announceRequirements", "chooseNumberForKeywordCost", "chooseNumber"];
const KINDS = [...DIALS, "divideAsYouChoose"];
/** The spells whose split can be asked: more damage than targets. */
const DIVIDED = /^(Arc Lightning|Rolling Thunder)$/;
const click = clickNow;

test("number questions: the dial for X, a kicker and energy; one tray for a split", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no numbers deck package");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const seen = new Map<string, Record<string, unknown>>();
  /** Targets chosen for the spell being cast, per page: a split stops at two. */
  const targeted = new Map<Page, number>();
  /** The spell each page is casting, for how many targets it gets. */
  const casting = new Map<Page, string>();
  /** A share asked on its own after the split tray's Done: never. */
  const askedAgain: string[] = [];
  let splitDone = false;
  /** Casts tried with the same lands and hand: a spell that can't be paid is not tried for ever. */
  const tries = new Map<string, number>();
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    const deadline = Date.now() + 780_000;
    // A game that has ended shows nothing more: stop and say how it ended,
    // instead of watching a finished table until the deadline.
    const ended = async () =>
      [
        ...(await host.locator("#gs-over-text").allTextContents()),
        ...(await guest.locator("#gs-over-text").allTextContents()),
      ].join(" ");

    while (seen.size < KINDS.length && Date.now() < deadline) {
      if (await ended()) break;
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;

        // The split: one tray for the whole of it.
        const tray = panel.locator('.gs-win[data-kind="divideAsYouChoose"]').first();
        if ((await tray.count()) > 0) {
          const title = ((await tray.locator(".gs-win-title").textContent()) ?? "").trim();
          if (splitDone && !(await tray.locator(".gs-win-stepper").count())) {
            askedAgain.push(title);
          }
          if ((await tray.locator(".gs-win-stepper").count()) === 0) {
            // A share asked on its own (not from the tray): answer it.
            await click(tray.locator("li button").first());
            continue;
          }
          expect(title, "the split's title").toMatch(/^Split \d+ damage$/);
          await expect(tray.locator(".gs-win-left")).toHaveText(/left: 0$/);
          const less = tray.getByRole("button", { name: "One less" });
          const more = tray.getByRole("button", { name: "One more" });
          // Move one point from the first target that has more than 1 to another.
          const shares = (await tray.locator(".gs-win-stepper b").allTextContents()).map(Number);
          const from = shares.findIndex((n) => n > 1);
          if (from >= 0) {
            await click(less.nth(from));
            await expect(tray.locator(".gs-win-left")).toHaveText(/left: 1$/);
            await click(more.nth(from === 0 ? 1 : 0));
          }
          await expect(tray.locator(".gs-win-left")).toHaveText(/left: 0$/);
          if (!seen.has("divideAsYouChoose")) {
            await page.screenshot({ path: "test-results/seen/numbers-divideAsYouChoose.png" });
            seen.set("divideAsYouChoose", {
              title,
              shares: await tray.locator(".gs-win-stepper b").allTextContents(),
              words: ((await tray.textContent()) ?? "").replace(/\s+/g, " ").trim(),
            });
          }
          await click(tray.getByRole("button", { name: "Done" }));
          splitDone = true;
          targeted.set(page, 0);
          continue;
        }

        // One number: the dial.
        const dial = panel
          .locator(DIALS.map((k) => `.gs-win[data-kind="${k}"]`).join(", "))
          .first();
        if ((await dial.count()) > 0 && (await dial.locator(".gs-dial").count()) > 0) {
          const kind = (await dial.getAttribute("data-kind")) ?? "";
          const title = ((await dial.locator(".gs-win-title").textContent()) ?? "").trim();
          const says = ((await dial.locator(".decision-prompt").textContent()) ?? "").trim();
          const go = dial.locator("button.gs-dial-go");
          const most = dial.getByRole("button", { name: /^Most you can pay/ });
          if (kind === "announceRequirements") {
            expect(title).toBe("Choose X");
            expect(says, "what can be made").toMatch(/You can make \d+ mana\./);
          } else if (kind === "chooseNumberForKeywordCost") {
            expect(title).toBe("Kick it how many times?");
            expect(says).toContain("Each time costs");
          } else {
            expect(title).toBe("Pay how much energy?");
            expect(says).toMatch(/You have \d+\./);
          }
          if ((await most.count()) > 0) await click(most);
          // Nothing it offers can be paid (the dial starts at the least and
          // says so): back out, or for a kicker take none.
          if ((await dial.locator(".gs-dial-over").count()) > 0) {
            if (kind === "chooseNumberForKeywordCost") {
              await click(dial.getByRole("button", { name: "None" }));
            } else {
              await click(dial.locator("button.gs-win-btn-quiet"));
              continue;
            }
          }
          if (kind !== "chooseNumber") {
            await expect(dial.locator(".gs-dial-cost"), "the cost as it changes").toContainText(
              "Costs",
            );
          }
          if (!seen.has(kind)) {
            await page.waitForTimeout(400);
            await page.screenshot({ path: `test-results/seen/numbers-${kind}.png` });
            seen.set(kind, {
              from: ((await dial.locator(".gs-win-from").textContent()) ?? "").trim(),
              title,
              says,
              number: await dial.locator(".gs-dial-n").textContent(),
              button: await go.textContent(),
            });
          }
          await click(go);
          continue;
        }

        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await click(combat);
          continue;
        }
        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        if (!priority) {
          // Targets: the other player first, then anything on the table.
          // A divided spell gets exactly two, on purpose: the other player,
          // then a creature (theirs, else one's own), else one's own life,
          // and then no more. Three damage over three targets is one each,
          // which nobody is asked (MatchController.divide), and a third
          // target was there whenever a creature was on the table: the
          // split was never asked in CI 41972497084. With enough targets
          // the act button's pass is "no more" (chooseTargetsFor).
          const targeting = panel.locator('[data-kind="chooseTargetsFor"]');
          const isTarget = (await targeting.count()) > 0;
          const divided = DIVIDED.test(casting.get(page) ?? "");
          if (isTarget && divided && (targeted.get(page) ?? 0) >= 2) {
            await click(panel.locator("button.gs-act-cancel"));
            continue;
          }
          const listed = panel.locator(
            ".gs-question li button, .gs-win li button, .gs-win button.gs-win-btn-main",
          );
          const them = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          const creature = page.locator(
            '.bf-cards button[data-choosable="true"][data-zone*="creature"]',
          );
          const theirs = creature.and(page.locator('[data-controller="opponent"]'));
          const board = page.locator(
            '.bf-cards button[data-choosable="true"], .gs-life.gs-choosable, [data-zone="viewer:hand"][data-choosable="true"]',
          );
          if ((await them.count()) > 0) await click(them);
          else if (isTarget && divided && (await theirs.count()) > 0) await click(theirs);
          else if (isTarget && divided && (await creature.count()) > 0) await click(creature);
          else if ((await board.count()) > 0) await click(board);
          else if ((await listed.count()) > 0) await click(listed);
          else await click(panel.locator("button.gs-pass, button.gs-act"));
          if (isTarget) targeted.set(page, (targeted.get(page) ?? 0) + 1);
          continue;
        }

        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const land = hand.filter({ hasText: /^Mountain/ });
        if ((await land.count()) > 0) {
          await click(land);
          continue;
        }
        const spell = hand.filter({ hasText: SPELLS });
        const untapped = await cardCount(
          page
            .locator('.bf-cards button[data-controller="viewer"][data-tapped="false"]')
            .filter({ hasText: /^Mountain/ }),
        );
        const handSize = await page.locator('[data-zone="viewer:hand"]').count();
        const names = (await spell.allTextContents()).map((t) => t.match(SPELLS)?.[1] ?? t);
        // Each spell only while what it shows is unseen, so the burn stops
        // once it has been seen and the game lasts until all of it is:
        // Arc Lightning with 3 lands (3 damage over two targets: a split
        // with a choice), Rolling Thunder with 5 (X of 3 over two) or 4 (an
        // X of 2), Fireball and Comet Storm with 4, Everflowing Chalice
        // with 2 (kicked once), Harnessed Lightning on a creature. Forked
        // Bolt never: 2 damage over two targets is 1 and 1, never asked.
        const creatures = await page
          .locator(".bf-cards button[data-object-id]")
          .filter({ hasText: /^(Gray Ogre|Hill Giant)/ })
          .count();
        const unseen = (kind: string) => !seen.has(kind);
        const useful = (name: string): boolean => {
          switch (name) {
            case "Gray Ogre":
            case "Hill Giant":
              return true;
            case "Arc Lightning":
              return untapped >= 3 && unseen("divideAsYouChoose");
            case "Rolling Thunder":
              return (
                (untapped >= 5 && unseen("divideAsYouChoose")) ||
                (untapped >= 4 && unseen("announceRequirements"))
              );
            case "Fireball":
              return untapped >= 4 && unseen("announceRequirements");
            case "Comet Storm":
              return (
                untapped >= 4 &&
                (unseen("chooseNumberForKeywordCost") || unseen("announceRequirements"))
              );
            case "Harnessed Lightning":
              return creatures > 0 && unseen("chooseNumber");
            case "Everflowing Chalice":
              return untapped >= 2 && unseen("chooseNumberForKeywordCost");
            default:
              return false;
          }
        };
        // The split first (it needs the most luck: a divided spell in hand
        // and the lands for it), then a creature if there is none (a target
        // for Harnessed Lightning), then the rest.
        const indexed = names.map((n, i) => [n, i] as const);
        const order = [
          ...indexed.filter(([n]) => DIVIDED.test(n)),
          ...indexed.filter(([n]) => creatures === 0 && /Ogre|Giant/.test(n)),
          ...indexed.filter(([n]) => !DIVIDED.test(n) && !/Ogre|Giant/.test(n)),
          ...indexed.filter(([n]) => /Ogre|Giant/.test(n)),
        ];
        const pick =
          order.find(
            ([name]) => useful(name) && (tries.get(`${name}|${untapped}|${handSize}`) ?? 0) < 2,
          )?.[1] ?? -1;
        if (pick >= 0) {
          const key = `${names[pick]}|${untapped}|${handSize}`;
          tries.set(key, (tries.get(key) ?? 0) + 1);
          targeted.set(page, 0);
          casting.set(page, names[pick] ?? "");
          await click(spell.nth(pick));
          const popup = page.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await click(popup);
          continue;
        }
        await click(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
      }
      await host.waitForTimeout(100);
    }
    mkdirSync("test-results/seen", { recursive: true });
    writeFileSync(
      "test-results/seen/numbers.json",
      JSON.stringify(Object.fromEntries(seen), null, 2),
    );
    const why = (await ended()) ? ` (the game ended: ${await ended()})` : "";
    expect([...seen.keys()].sort(), `every number question seen${why}`).toEqual([...KINDS].sort());
    expect(askedAgain, "a split's shares are answered from its tray").toEqual([]);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
