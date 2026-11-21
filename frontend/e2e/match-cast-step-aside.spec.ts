// The casting card steps aside while a card under it is tapped to pay, then
// comes back -- spec 0091 (owner 2026-11-13, C · the casting card steps
// aside; 0068 Amendment 1). TEST-012: in a real game, the player really
// pays with a covered card.
//
// Spec 0110 (owner 2026-11-20): the casting card waits at the stack's next
// slot now, not the middle, so only the right-hand end of a line is under
// it -- and identical cards stack, so a line reaches it only with many
// different cards. The game is dealt (spec 0098, the step-aside deck,
// protocol/fixtures/step-aside-deck): the host lays out thirteen different
// cheap green creatures, Llanowar Elves last (the line's right-hand end),
// then casts Craw Wurm. At a payment step where an Elf is under the big
// casting card, the payer clicks it with the REAL mouse, through the card
// (spec 0068's see-through). Both screens record where the casting card is
// drawn on every frame from just before the click: the payer's card (with
// its cost pips) moves up and aside while the Elf taps and its mana flies,
// and comes back to its exact place; the other player's face-down back,
// when the Elf is under it too, moves down instead. The Elf is then tapped.
//
// CI builds the deck; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/step-aside-deck.zip" protocol/fixtures/step-aside-deck

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  castCentre,
  castRisen,
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

const pkg = join(process.cwd(), "..", "Test Deck", "step-aside-deck.zip");
const ELVES = /^(Llanowar Elves|Elvish Mystic|Fyndhorn Elves)/;
/** The line, in the order the host lays it out: Llanowar Elves last, at its right-hand end. */
const LINE = [
  "Elvish Mystic",
  "Fyndhorn Elves",
  "Boreal Druid",
  "Young Wolf",
  "Jungle Lion",
  "Bear Cub",
  "Balduvian Bears",
  "Runeclaw Bear",
  "Elvish Visionary",
  "Scryb Sprites",
  "Grizzly Bears",
  "Birds of Paradise",
  "Llanowar Elves",
];

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

/**
 * Every frame from now: where the casting card is drawn (its centre from
 * where it was when the recording began: its place, spec 0110's stack
 * spot), and whether aside.
 */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __steps: { t: number; dx: number; dy: number; aside: string | null }[];
    };
    w.__steps = [];
    const start = performance.now();
    let base: { x: number; y: number } | null = null;
    const tick = () => {
      const cast = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
      if (cast) {
        const r = cast.getBoundingClientRect();
        const at = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        base ??= at;
        w.__steps.push({
          t: performance.now() - start,
          dx: at.x - base.x,
          dy: at.y - base.y,
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
  test.skip(!existsSync(pkg), "no step-aside deck package (CI builds it)");
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
    const of = (name: string, n: number) => Array.from({ length: n }, () => name);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Forest",
            "Elvish Mystic",
            "Forest",
            "Fyndhorn Elves",
            "Boreal Druid",
            "Young Wolf",
            "Forest",
          ],
          top: [
            "Jungle Lion",
            "Forest",
            "Bear Cub",
            "Balduvian Bears",
            "Runeclaw Bear",
            "Elvish Visionary",
            "Scryb Sprites",
            "Grizzly Bears",
            "Birds of Paradise",
            "Llanowar Elves",
            "Craw Wurm",
            ...of("Forest", 6),
          ],
        },
        guest: { hand: of("Forest", 7), top: of("Forest", 12) },
      },
    });
    let done = false;
    // The turn Llanowar Elves came down: Craw Wurm waits for a later one (it can tap then).
    let elvesTurn: string | null = null;
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
          // Its rise (700 ms paced) over, polled, never waited out -- or the
          // card gone already (a spell paid at once flies on to the stack).
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
          const elf = await coveredElf(page);
          if (elf) {
            const other = page === host ? guest : host;
            const centre = (await castCentre(page))!;
            expect(Math.abs(centre.dx), "at its stack spot before").toBeLessThan(2);
            expect(Math.abs(centre.dy), "at its stack spot before").toBeLessThan(2);
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
            // ...and came back to its exact place (or flew on, if this paid it all).
            const last = mine.at(-1)!;
            if (last.t > 3500) {
              expect(Math.abs(last.dx), "back across").toBeLessThan(1.5);
              expect(Math.abs(last.dy), "back down").toBeLessThan(1.5);
              expect(last.aside, "no longer aside").toBeNull();
            }
            // Smooth: never more than a sixth of the way in one frame. The
            // allowance grows with the time between frames: a loaded CI
            // runner can stall a frame for 100 ms+, and a glide covers more
            // ground then without having jumped (CI ba1251b: 135.6 px).
            for (let i = 1; i < mine.length; i++) {
              const dt = mine[i]!.t - mine[i - 1]!.t;
              expect(
                Math.abs(mine[i]!.dy - mine[i - 1]!.dy),
                `no jump at frame ${i} (${dt.toFixed(1)} ms after the last)`,
              ).toBeLessThan(120 * Math.max(1, dt / 16.7));
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
        const turn = (await page.locator(".gs-turn-value").first().textContent()) ?? "";
        // On the battlefield (not the hand's buttons).
        const mine = boardCards(page, "viewer");
        const laid = async (name: string) => (await mine.filter({ hasText: name }).count()) > 0;
        // A land, then the line in its order (Llanowar Elves last), then --
        // on a later turn, the whole line down -- Craw Wurm. (A hand card's
        // text starts with its cost's digits: no ^ on the names.)
        const order = [hand.filter({ hasText: /^Forest/ })];
        if (page === host) {
          for (const name of LINE) {
            if (await laid(name)) continue;
            // Last: only once every other card of the line is down.
            if (name === "Llanowar Elves") {
              let all = true;
              for (const other of LINE.slice(0, -1)) all &&= await laid(other);
              if (!all) break;
            }
            order.push(hand.filter({ hasText: new RegExp(name) }));
          }
          if (elvesTurn === null && (await laid("Llanowar Elves"))) elvesTurn = turn;
          if (elvesTurn !== null && elvesTurn !== turn) {
            order.push(hand.filter({ hasText: /Craw Wurm/ }));
          }
        }
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
