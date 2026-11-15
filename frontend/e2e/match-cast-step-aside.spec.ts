// The casting card steps aside while a card under it is tapped to pay, then
// comes back -- spec 0091 (owner 2026-11-13, C · the casting card steps
// aside; 0068 Amendment 1). TEST-012: in a real game, the player really
// pays with a covered card.
//
// A real game with the landing test deck (Forests, Llanowar Elves, Elvish
// Mystic and big creatures). At a payment step where an Elf is under the
// big casting card, the payer clicks it with the REAL mouse, through the
// card (spec 0068's see-through). Both screens record where the casting
// card is drawn on every frame from just before the click: the payer's
// card (with its cost pips) moves up and aside while the Elf taps and its
// mana flies, and comes back to the exact middle; the other player's
// face-down back, when the Elf is under it too, moves down instead. The
// Elf is then tapped.

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  castCentre,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  matchPanel,
  passButton,
  passCombat,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const ELVES = /^(Llanowar Elves|Elvish Mystic)/;
const BIG = /^(Craw Wurm|Kalonian Tusker|Leatherback Baloth|Centaur Courser|Giant Spider)/;

/** A covered Elf to pay with: the middle of its part under the big card, when the mouse hits it there. */
async function coveredElf(page: Page) {
  return page.evaluate((elves) => {
    const cast = document.querySelector(".gs-cast:not(.gs-cast-leaving)");
    if (!cast) return null;
    const r = cast.getBoundingClientRect();
    for (const b of document.querySelectorAll<HTMLElement>(
      '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
    )) {
      if (!new RegExp(elves).test(b.getAttribute("aria-label") ?? "")) continue;
      const box = b.getBoundingClientRect();
      const left = Math.max(box.left, r.left);
      const right = Math.min(box.right, r.right);
      const top = Math.max(box.top, r.top);
      const bottom = Math.min(box.bottom, r.bottom);
      if (right - left < 20 || bottom - top < 20) continue;
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;
      const id = b.getAttribute("data-object-id");
      const hit = document.elementFromPoint(x, y)?.closest("[data-object-id]");
      if (hit?.getAttribute("data-object-id") === id) return { id, x, y };
    }
    return null;
  }, ELVES.source);
}

/** Every frame from now: where the casting card is drawn (its centre from the window's), and whether aside. */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __steps: { t: number; dx: number; dy: number; aside: string | null }[];
    };
    w.__steps = [];
    const start = performance.now();
    const tick = () => {
      const cast = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
      if (cast) {
        const r = cast.getBoundingClientRect();
        w.__steps.push({
          t: performance.now() - start,
          dx: r.x + r.width / 2 - window.innerWidth / 2,
          dy: r.y + r.height / 2 - window.innerHeight / 2,
          aside: cast.dataset.stepAside ?? null,
        });
      }
      if (performance.now() - start < 4000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const recorded = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __steps: { t: number; dx: number; dy: number; aside: string | null }[];
        }
      ).__steps,
  );

test("paying with an Elf under the casting card: it steps aside, the Elf taps in view, it comes back", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no landing deck package (CI builds it)");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    let done = false;
    const deadline = Date.now() + 780_000;
    const watch = watchGame([host, guest], () => ({ done }));
    while (!done && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        if (done) break;
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if ((await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) > 0) {
          await page.waitForTimeout(700);
          await expect.poll(async () => (await castCentre(page))?.aside ?? null).toBeNull();
          const elf = await coveredElf(page);
          if (elf) {
            const other = page === host ? guest : host;
            const centre = (await castCentre(page))!;
            expect(Math.abs(centre.dx), "centred before").toBeLessThan(2);
            expect(Math.abs(centre.dy), "centred before").toBeLessThan(2);
            await record(page);
            await record(other);
            // A real click on the Elf, through the card (it is see-through there).
            await page.mouse.move(elf.x, elf.y);
            await expect.poll(async () => (await castCentre(page))?.seeThrough).toBe(true);
            await page.mouse.click(elf.x, elf.y);
            await page.waitForTimeout(4200);
            const mine = await recorded(page);
            const theirs = await recorded(other);
            const asideMine = mine.filter((s) => s.aside === "aside");
            console.log(
              `payer: ${mine.length} frames, ${asideMine.length} aside, highest ${Math.min(
                ...mine.map((s) => s.dy),
              ).toFixed(0)}, sideways ${Math.max(...mine.map((s) => Math.abs(s.dx))).toFixed(0)}`,
            );
            // F-0091-B: it went up (the payer's cards are below it) and aside...
            expect(asideMine.length, "frames with the card stepping aside").toBeGreaterThan(10);
            expect(Math.min(...mine.map((s) => s.dy)), "moved up").toBeLessThan(-60);
            expect(Math.max(...mine.map((s) => Math.abs(s.dx))), "and aside").toBeGreaterThan(20);
            // ...and came back to the exact middle (or flew on, if this paid it all).
            const last = mine.at(-1)!;
            if (last.t > 3500) {
              expect(Math.abs(last.dx), "back across").toBeLessThan(1.5);
              expect(Math.abs(last.dy), "back down").toBeLessThan(1.5);
              expect(last.aside, "no longer aside").toBeNull();
            }
            // Smooth: never more than a sixth of the way in one frame.
            for (let i = 1; i < mine.length; i++) {
              expect(Math.abs(mine[i]!.dy - mine[i - 1]!.dy), `no jump at frame ${i}`).toBeLessThan(
                120,
              );
            }
            // The Elf is tapped.
            await expect(
              page.locator(`.bf-cards button[data-object-id="${elf.id}"]`),
            ).toHaveAttribute("data-tapped", "true");
            // The other player: their face-down back moves down when the Elf is under it.
            const asideTheirs = theirs.filter((s) => s.aside === "aside");
            console.log(
              `other seat: ${theirs.length} frames, ${asideTheirs.length} aside, lowest ${Math.max(
                0,
                ...theirs.map((s) => s.dy),
              ).toFixed(0)}`,
            );
            if (asideTheirs.length > 0) {
              expect(Math.max(...theirs.map((s) => s.dy)), "their back moved down").toBeGreaterThan(
                30,
              );
            }
            done = true;
            break;
          }
          const any = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          // Nothing on the board to tap: answer the window's own option
          // ("Use {G} you already made", CI a03a3db stalled 120 s here).
          if ((await any.count()) > 0) await clickNow(any);
          else await clickNow(panel.locator(".gs-win li button, .gs-question li button"));
          continue;
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const board = page.locator('.bf-cards button[data-choosable="true"]');
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        // Elves first, then lands, then the big creatures paid with them.
        const order = [
          hand.filter({ hasText: ELVES }),
          hand.filter({ hasText: /^Forest/ }),
          hand.filter({ hasText: BIG }),
        ];
        let acted = false;
        for (const pick of order) {
          if ((await pick.count()) > 0) {
            await clickNow(pick);
            acted = true;
            break;
          }
        }
        if (!acted) {
          await clickNow(
            panel.locator(
              "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
            ),
          );
        }
      }
      await host.waitForTimeout(120);
    }
    expect(done, "paid with an Elf under the casting card").toBe(true);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
