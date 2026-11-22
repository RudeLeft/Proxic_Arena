// The card being cast stays in its place; what it covers is reachable --
// spec 0068 (owner 2026-11-09, A · Stay centred, see-through). Supersedes
// owner 2026-11-01 item 4 (it moved up and toward the stack whenever
// something to click was under it). Spec 0110 (owner 2026-11-20) moved its
// place from the middle of the window to the stack's next slot
// (castingStackBox); castCentre measures from there.
//
// Checked at every payment step in a real game: the big card's centre is
// its place's centre; each card that can be clicked to pay is the thing
// under the mouse at its own visible point -- and, when the big card
// covers that point, pointing there makes the big card see-through. The
// Elf is then tapped with a REAL mouse click, through the card when it is
// under it. Once, the window is made 2560x1440: the card is at the new
// place (F-0068-A, B; the place as spec 0110).
//
// Uses the landing test deck (protocol/fixtures/landing-deck): Forests and
// creatures, with Llanowar Elves and Elvish Mystic to pay with.

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  clearEverything,
  clickAt,
  clickNow,
  clickUnlessCombat,
  passCombat,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
  discardIfAsked,
  castCentre,
  castRisen,
  realClick,
  shootWithPointer,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const ELVES = /^(Llanowar Elves|Elvish Mystic)/;
const BIG = /^(Craw Wurm|Kalonian Tusker|Leatherback Baloth|Centaur Courser|Giant Spider)/;

/**
 * Every card that can be clicked to pay: its visible point, and -- when the
 * big card covers part of it -- the middle of that covered part (`under`),
 * with whether the mouse there would hit it.
 */
async function payable(page: Page) {
  return page.evaluate(() => {
    const cast = document.querySelector(".gs-cast:not(.gs-cast-leaving)");
    const r = cast?.getBoundingClientRect() ?? null;
    return [
      ...document.querySelectorAll<HTMLElement>(
        '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
      ),
    ].map((b) => {
      const box = b.getBoundingClientRect();
      // The visible left part (crowded rows show each card's left third).
      const x = box.x + Math.min(box.width / 2, 20);
      const y = box.y + box.height / 2;
      const id = b.getAttribute("data-object-id");
      const at = (px: number, py: number) =>
        document
          .elementFromPoint(px, py)
          ?.closest("[data-object-id]")
          ?.getAttribute("data-object-id") === id;
      const left = r ? Math.max(box.left, r.left) : 0;
      const right = r ? Math.min(box.right, r.right) : 0;
      const top = r ? Math.max(box.top, r.top) : 0;
      const bottom = r ? Math.min(box.bottom, r.bottom) : 0;
      const ux = (left + right) / 2;
      const uy = (top + bottom) / 2;
      return {
        id: b.getAttribute("data-object-id"),
        name: (b.getAttribute("aria-label") ?? "").split(",")[0],
        x,
        y,
        hit: at(x, y),
        under: right - left > 4 && bottom - top > 4 ? { x: ux, y: uy, hit: at(ux, uy) } : null,
      };
    });
  });
}

test("paying for a spell, the card being cast stays at its stack spot and every card to tap is reachable", async ({
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
    let checked = 0;
    let withElves = 0;
    let shot = false;
    let coveredSeen = 0;
    const deadline = Date.now() + 780_000;
    const watch = watchGame([host, guest], () => ({ withElves }));
    while (withElves < 2 && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        // Spec 0061: discarding to hand size is pick, then Discard.
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if ((await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) > 0) {
          // Settled: its rise (700 ms paced) over, polled, never waited out --
          // or the card gone already (paid at once, it flies on to the stack).
          // Spec 0091: and any step aside (an Elf under it just tapped) over.
          const gone = async () =>
            (await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) === 0;
          await expect
            .poll(async () => (await gone()) || (await castRisen(page)), {
              timeout: 15_000,
              message: "the cast card's rise ended",
            })
            .toBe(true);
          if (await gone()) continue;
          await expect.poll(async () => (await castCentre(page))?.aside ?? null).toBeNull();
          const centre = await castCentre(page);
          const cards = await payable(page);
          if (cards.length > 0 && centre) {
            checked += 1;
            expect(Math.abs(centre.dx), "at its stack spot, across").toBeLessThan(2);
            expect(Math.abs(centre.dy), "at its stack spot, down").toBeLessThan(2);
            expect(
              cards.filter((c) => !c.hit),
              "a card to tap is not what the mouse hits",
            ).toEqual([]);
            // Each covered one: pointed at under the big card, it is what the
            // mouse hits, and the big card goes see-through.
            for (const c of cards.filter((one) => one.under?.hit)) {
              await page.mouse.move(c.under!.x, c.under!.y);
              await expect.poll(async () => (await castCentre(page))?.seeThrough).toBe(true);
              coveredSeen += 1;
            }
            const elves = cards.filter((c) => ELVES.test(c.name ?? ""));
            if (elves.length > 0) {
              withElves += 1;
              const elf = elves.find((c) => c.under?.hit) ?? elves[0]!;
              // Under the card if it is, else its visible point.
              const point: [number, number] = elf.under?.hit
                ? [elf.under.x, elf.under.y]
                : [elf.x, elf.y];
              if (!shot) {
                console.log(`elf under the big card: ${!!elf.under?.hit}`);
                await page.mouse.move(0, 0);
                await expect.poll(async () => (await castCentre(page))?.seeThrough).toBe(false);
                await shootWithPointer(page, "0068-1-paying-elf-under.png", []);
                await page.mouse.move(...point);
                await page.waitForTimeout(300);
                await shootWithPointer(page, "0068-2-pointer-on-elf.png", [point]);
                // A bigger window: the card glides to its new place (polled
                // until it is there: the glide is a CSS transition).
                await page.mouse.move(0, 0);
                await page.setViewportSize({ width: 2560, height: 1440 });
                await expect
                  .poll(
                    async () => {
                      const c = await castCentre(page);
                      return !!c && Math.abs(c.dx) < 2 && Math.abs(c.dy) < 2 && c.h > 400;
                    },
                    { timeout: 10_000, message: "at its stack spot after a resize" },
                  )
                  .toBe(true);
                await shootWithPointer(page, "0068-4-after-resize-2560x1440.png", []);
                await page.setViewportSize(viewport);
                await expect
                  .poll(
                    async () => {
                      const c = await castCentre(page);
                      return !!c && Math.abs(c.dx) < 2 && Math.abs(c.dy) < 2 && c.h < 400;
                    },
                    { timeout: 10_000, message: "back at its stack spot at 1920x1080" },
                  )
                  .toBe(true);
                shot = true;
                continue;
              }
              // A real click on the Elf, through the card when it is under it:
              // at that covered point (the subject of the test), made only if
              // the Elf is still what the mouse hits there (P11-B7).
              const elfButton = page.locator(`.bf-cards button[data-object-id="${elf.id ?? ""}"]`);
              if (elf.under?.hit) await clickAt(page, { x: point[0], y: point[1] }, elfButton);
              else await realClick(page, elfButton);
              await page.waitForTimeout(300);
              continue;
            }
            const any = page.locator(
              '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
            );
            await clickUnlessCombat(any);
            continue;
          }
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const board = page.locator('.bf-cards button[data-choosable="true"]');
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
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
    expect(
      withElves,
      `paid with elves on the table (${checked} payment steps checked, ${coveredSeen} covered)`,
    ).toBeGreaterThanOrEqual(2);
    console.log(`payment steps checked: ${checked}; covered cards pointed at: ${coveredSeen}`);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
