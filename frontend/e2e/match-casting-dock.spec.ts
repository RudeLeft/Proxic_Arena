// Spec 0044 -- the card being cast: face down to the opponent until it is
// committed, and shown for an optional cost asked while it is still in the
// hand. Spec 0068 (owner 2026-11-09) supersedes its docking beside the
// stack: the card stays in one place for a target too. Spec 0110 (owner
// 2026-11-20): that place is the stack's next slot, not the middle of the
// screen (castCentre measures from there).
//
// F-0044-A / F-0068-A, B: a target question keeps the card at its place,
//   pointing at the creature under it (if any) makes the card see-through,
//   and a REAL mouse click on the creature reaches it.
// F-0044-B / F-0068-C: the opponent sees the card's back ("… is casting a
//   spell") and never its name while it is paid for; once it is cast the
//   back turns over to the face, held at the same place (spec 0110).
// F-0044-C: Archon's Glory's Bargain question shows the card being cast.
// F-0068-D: the game screen's pointer is the obsidian arrow.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  boardCards,
  answerCardTray,
  clearEverything,
  clickNow,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
  discardIfAsked,
  castCentre,
  castRisen,
  shootWithPointer,
} from "./match-helpers";

const castingPackage = join(process.cwd(), "..", "Test Deck", "casting-deck.zip");

const kind = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector(".gs-win, .gs-question, .gs-your-move, .gs-combat")
        ?.getAttribute("data-kind") ?? null,
  );

/** The card being cast as drawn now (not one flying away). */
const castCard = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
    return el
      ? {
          label: el.getAttribute("aria-label") ?? "",
          back: !!el.querySelector(".gs-cast-back"),
          text: el.textContent ?? "",
        }
      : null;
  });

/** The card being cast is drawn and has stopped moving: none of its own animations still running. */
const risen = castRisen;

const playable = (page: Page, name: string) =>
  page.locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])', {
    hasText: name,
  });

test("the card being cast stays at its stack spot, hides from the opponent, then turns over there", async ({
  browser,
}) => {
  test.skip(!existsSync(castingPackage), "no casting deck package built");
  test.setTimeout(600_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, castingPackage);

  let docked = false;
  let optional = false;
  const landTurn = new Map<Page, string>();
  try {
    await startAMatch(host, guest, deck);
    const end = Date.now() + 420_000;
    const watch = watchGame([host, guest], () => ({ docked, optional }));
    while (Date.now() < end && !(docked && optional)) {
      await watch.check();
      for (const page of [host, guest]) {
        const other = page === host ? guest : host;
        // Spec 0061: discarding to hand size is pick, then Discard.
        if (await discardIfAsked(page)) continue;
        const k = await kind(page);
        if (!k) continue;
        if (k === "chooseSpellAbilityToPlay") {
          const turn = (await page.locator(".gs-ladder, .gs-turn").first().textContent()) ?? "";
          const land = playable(page, "Plains");
          if ((await land.count()) > 0 && landTurn.get(page) !== turn) {
            landTurn.set(page, turn);
            await clickNow(land.first());
            await page.waitForTimeout(500);
            continue;
          }
          const slivers =
            (await boardCards(page, "viewer").filter({ hasText: "Sliver" }).count()) +
            (await boardCards(page, "opponent").filter({ hasText: "Sliver" }).count());
          if (
            !docked &&
            slivers > 0 &&
            (await playable(page, "Swords to Plowshares").count()) > 0
          ) {
            await clickNow(playable(page, "Swords to Plowshares").first());
            await expect.poll(() => kind(page), { timeout: 15_000 }).toBe("chooseTargetsFor");
            // F-0068-A: still at its place (spec 0110: the stack's next slot), full size. Read
            // once its rise out of the hand (FLY_MS, 700 ms paced) is over:
            // a fixed 700 ms wait read the rise's last frames on a slow CI
            // runner (44741449950: 2.5 px short). The card's own
            // animations are its rise, fade-in and step aside, never the
            // sway (on a child, which does not move its box).
            await expect
              .poll(() => risen(page), { timeout: 15_000, message: "the cast card's rise ended" })
              .toBe(true);
            const centre = (await castCentre(page))!;
            expect(Math.abs(centre.dx), "at its stack spot across, for a target").toBeLessThan(2);
            expect(Math.abs(centre.dy), "at its stack spot down, for a target").toBeLessThan(2);
            // F-0044-B: the opponent sees its back and who, never its name.
            const seen = await castCard(other);
            expect(seen?.back).toBe(true);
            expect(seen?.label).toMatch(/is casting a spell/);
            expect(seen?.text).not.toContain("Swords");
            // F-0044-A: a real mouse click on a creature reaches it.
            const target = page
              .locator('.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])', {
                hasText: "Sliver",
              })
              .first();
            const box = (await target.boundingBox())!;
            const x = box.x + Math.min(box.width / 2, 20);
            const y = box.y + box.height / 2;
            const id = await target.getAttribute("data-object-id");
            const under = await page.evaluate(
              ([px, py]) =>
                document
                  .elementFromPoint(px!, py!)
                  ?.closest("[data-object-id]")
                  ?.getAttribute("data-object-id") ?? null,
              [x, y],
            );
            expect(under).toBe(id);
            // F-0068-B: pointed at, under the card, the card is see-through.
            await page.mouse.move(x, y);
            const covered = await page.evaluate(
              ([px, py]) => {
                const r = document
                  .querySelector(".gs-cast:not(.gs-cast-leaving)")!
                  .getBoundingClientRect();
                return px! >= r.left && px! <= r.right && py! >= r.top && py! <= r.bottom;
              },
              [x, y],
            );
            if (covered) {
              await expect.poll(async () => (await castCentre(page))?.seeThrough).toBe(true);
            }
            await page.waitForTimeout(300);
            await shootWithPointer(page, "0068-3-target-question.png", [[x, y]]);
            // Once cast, the opponent's back turns over to the face.
            const turned = other.waitForSelector(
              ".gs-cast-leaving .gs-cast-turn .gs-cast-plain, .gs-cast-leaving .gs-cast-turn .gs-cast-picture",
              {
                state: "attached",
                timeout: 60_000,
              },
            );
            await page.mouse.click(x, y);
            // F-0068-C: the other player's card turns over at its place (spec
            // 0110: the stack's next slot) and is held there (read while it
            // is held, as this player pays, as soon as it has turned).
            const held = (async () => {
              await other
                .locator(".gs-cast-leaving .gs-cast-turn")
                .first()
                .waitFor({ state: "attached", timeout: 60_000 });
              const centre = await castCentre(other, ".gs-cast-leaving");
              await shootWithPointer(other, "0068-5-opponent-reveal-held.png", []);
              return centre;
            })();
            for (let i = 0; i < 6 && (await kind(page)) !== "chooseSpellAbilityToPlay"; i++) {
              if ((await kind(page)) === "applyManaToCost") {
                await clickNow(
                  page.locator('.bf-cards button[data-choosable="true"]', { hasText: "Plains" }),
                );
              }
              await page.waitForTimeout(300);
            }
            await turned;
            const reveal = await held;
            expect(reveal, "the reveal was seen").not.toBeNull();
            expect(
              Math.abs(reveal!.dx),
              "the reveal is held at the stack spot, across",
            ).toBeLessThan(2);
            expect(Math.abs(reveal!.dy), "the reveal is held at the stack spot, down").toBeLessThan(
              2,
            );
            expect(reveal!.moving, "held, not yet flying").toBe(false);
            // F-0068-D: one pointer over the table, a card and a button.
            // Whatever button and card are there now (never wait for one).
            const boxOf = async (locator: Locator) =>
              (await locator.count()) > 0 ? await locator.first().boundingBox() : null;
            const pass = await boxOf(passButton(page));
            const plains = await boxOf(
              page.locator('.bf-cards button[data-zone^="viewer"]', { hasText: "Plains" }),
            );
            const points: [number, number][] = [[260, 470]];
            if (plains) points.push([plains.x + 20, plains.y + plains.height / 2]);
            if (pass) points.push([pass.x + pass.width / 2, pass.y + pass.height / 2]);
            const cursors = await page.evaluate(
              (at) =>
                at.map(([px, py]) => getComputedStyle(document.elementFromPoint(px, py)!).cursor),
              points,
            );
            for (const cursor of cursors) expect(cursor).toContain("data:image/svg+xml");
            await shootWithPointer(page, "0068-6-pointer-table-card-button.png", points);
            docked = true;
            continue;
          }
          if (!optional && (await playable(page, "Archon's Glory").count()) > 0) {
            await clickNow(playable(page, "Archon's Glory").first());
            await expect.poll(() => kind(page), { timeout: 15_000 }).toBe("chooseOptionalCosts");
            // F-0044-C: the card is drawn for its optional cost (at its stack spot, spec 0110).
            await expect
              .poll(async () => (await castCard(page))?.label)
              .toBe("Being cast: Archon's Glory");
            await page.keyboard.press("Escape");
            await page.waitForTimeout(800);
            optional = true;
            continue;
          }
          const sliver = playable(page, "Sliver");
          if ((await sliver.count()) > 0) {
            await clickNow(sliver.first());
            await page.waitForTimeout(500);
            continue;
          }
          await clickNow(passButton(page));
        } else if (k === "applyManaToCost") {
          const plains = page.locator('.bf-cards button[data-choosable="true"]', {
            hasText: "Plains",
          });
          if ((await plains.count()) > 0) await clickNow(plains.first());
          else await clickNow(passButton(page));
        } else {
          if (await answerCardTray(page)) continue;
          const list = matchPanel(page).locator(".gs-question li button, .gs-win li button");
          if ((await list.count()) > 0) await clickNow(list.first());
          else await clickNow(passButton(page));
        }
        await page.waitForTimeout(150);
      }
    }
    expect(docked, "Swords to Plowshares was cast at a creature").toBe(true);
    expect(optional, "Archon's Glory asked its Bargain").toBe(true);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    // Closed, or a page left signed in follows the player into the next
    // test's game and answers for them there (CI 2026-11-03: a paused
    // response window passed by the previous test's page).
    await host.context().close();
    await guest.context().close();
  }
});
