// A creature nobody can answer is drawn once -- owner 2026-11-01, item 2
// (canvas https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81), as spec 0105
// (the stack always shows) changed it.
//
// Before 0105 the game resolved a creature nobody could answer the moment it
// was cast, and the big card flew straight onto its battlefield place. Since
// 0105 the worker rests an unanswered spell on the stack (StackRests), so
// the card always flies to the stack, rests there with the ring, and the
// creature then glides out of the stack card to its place. The straight
// landing (`flyingOnto`, `data-landing`) stays only as the fallback for a
// board that arrives already resolved (a dropped snapshot, a reconnect; 0105
// As built, "The caster's card flies to the stack"); a real game with the
// stops rule never takes it, so this test does not look for it.
//
// What still holds, watched frame by frame from the click that pays: while
// the cast card is in the air the creature is not on the battlefield; the
// card rests on the stack; the creature appears only once the stack card has
// left, and is never drawn in two places at once.
//
// Both players use the landing test deck (protocol/fixtures/landing-deck).
// CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/landing-deck.zip" protocol/fixtures/landing-deck

import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  passCombat,
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
  watchGame,
  discardIfAsked,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const CREATURES =
  /^(Grizzly Bears|Birds of Paradise|Llanowar Elves|Elvish Mystic|Centaur Courser|Giant Spider|Craw Wurm|Kalonian Tusker|Leatherback Baloth)/;

interface Frame {
  /** Since the watch began, ms. */
  t: number;
  /** The cast card in the air (the big card leaving the hand), by card id. */
  flight: string | null;
  /** The stack cards drawn (not hidden), by object id and the ids they draw. */
  stack: { id: string; members: string[]; label: string }[];
  /** Whether the watched creature's own battlefield card is drawn (and not hidden). */
  shown: boolean;
}

/**
 * Every animation frame from the click that pays the last of the cast, for
 * the cast card's card id: until the creature has been on the battlefield
 * for half a second with no stack card left, or [ms] at most. Ends at once
 * when no cast card sets off within [startMs] (more mana still to pay).
 */
async function watch(page: Page, ms: number, startMs: number): Promise<Frame[]> {
  return page.evaluate<Frame[], { ms: number; startMs: number }>(
    async ({ ms, startMs }) => {
      const frames: Frame[] = [];
      const start = performance.now();
      let card: string | null = null;
      let settledAt: number | null = null;
      await new Promise<void>((done) => {
        const tick = () => {
          const t = performance.now() - start;
          const leaving = document.querySelector(".gs-cast-leaving");
          const flight = leaving?.getAttribute("data-card") ?? null;
          if (flight && card === null) card = flight;
          const stack = [...document.querySelectorAll<HTMLElement>(".bf-stack-slot")]
            .filter(
              (slot) => slot.style.opacity !== "0" && !slot.classList.contains("bf-stack-paying"),
            )
            .map((slot) => {
              const b = slot.querySelector("button[data-zone='stack']");
              return {
                id: b?.getAttribute("data-object-id") ?? "",
                members: (b?.getAttribute("data-members") ?? "").split(" ").filter(Boolean),
                label: b?.getAttribute("aria-label") ?? "",
              };
            });
          let shown = false;
          if (card !== null) {
            const button = document.querySelector(
              `.bf-cards button[data-object-id="${card}"]:not([data-zone$=":hand"])`,
            );
            const slot = button?.closest<HTMLElement>(".bf-slot");
            shown =
              !!slot && slot.style.opacity !== "0" && !slot.classList.contains("bf-stack-slot");
          }
          frames.push({ t, flight, stack, shown });
          if (card !== null && shown && !flight && stack.length === 0) settledAt ??= t;
          const over =
            t >= ms ||
            (card === null && t >= startMs) ||
            (settledAt !== null && t - settledAt >= 500);
          if (over) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return frames;
    },
    { ms, startMs },
  );
}

test("a creature nobody can answer goes by the stack, drawn once", async ({ browser }) => {
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
    let landed = 0;
    const deadline = Date.now() + 780_000;
    const game = watchGame([host, guest], () => ({ landed }));
    while (landed < 2 && Date.now() < deadline) {
      await game.check();
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
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          // Paying for the creature: a Forest (or an elf) to tap.
          const mana = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await mana.count()) > 0) await clickUnlessCombat(mana);
          else if ((await listed.count()) > 0) await clickNow(listed);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const forest = hand.filter({ hasText: /^Forest/ });
        if ((await forest.count()) > 0) {
          await clickNow(forest);
          continue;
        }
        // A creature with no twin on this player's side first: a second copy
        // joins its twin's pile and has no card of its own to land on, so
        // that cast cannot count (CI, 2026-11-04: casting twins until the
        // game ran out of time).
        const onBoard = await page
          .locator('.bf-cards button[data-zone^="viewer:"]:not([data-zone="viewer:hand"])')
          .allInnerTexts();
        const seen = (text: string) => onBoard.some((t) => t.startsWith(text.split("\n")[0]!));
        const creatures = hand.filter({ hasText: CREATURES });
        const names = await creatures.allInnerTexts();
        const fresh = names.findIndex((name) => !seen(name));
        const creature = fresh >= 0 ? creatures.nth(fresh) : creatures;
        if ((await creatures.count()) === 0) {
          await clickNow(
            panel.locator(
              "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
            ),
          );
          continue;
        }
        // Cast it, and watch from the click that pays the last of it.
        await clickNow(creature);
        // The cast shows a moment after the click: wait for it, or the
        // paying loop below saw nothing to pay for and left at once, and
        // a creature that did land was never counted (CI, 2026-11-04).
        await page
          .locator(".gs-cast")
          .first()
          .waitFor({ state: "attached", timeout: 5_000 })
          .catch(() => undefined);
        let frames: Frame[] = [];
        const payDeadline = Date.now() + 20_000;
        while (Date.now() < payDeadline && (await page.locator(".gs-cast").count()) > 0) {
          const owing = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          if ((await owing.count()) === 0) {
            await page.waitForTimeout(100);
            continue;
          }
          // Spec 0105: the card flies to the stack and rests there (5.9 s
          // from the board that says so) before the creature comes out.
          const watching = watch(page, 15_000, 2_600);
          await clickNow(owing);
          frames = await watching;
          if (frames.some((f) => f.flight)) break;
        }
        const first = frames.findIndex((f) => f.flight);
        if (first < 0) continue;
        const card = frames[first]!.flight!;
        // A second copy joins its twin's pile (identical cards stack), with
        // no card of its own: that cast does not count.
        const shownAt = frames.findIndex((f) => f.shown);
        if (shownAt < 0) continue;
        const timeline = () =>
          JSON.stringify(
            frames
              .filter((_, i) => i % 4 === 0)
              .map((f) => [
                Math.round(f.t),
                f.flight ? "air" : "",
                f.stack.length,
                f.shown ? "S" : "",
              ]),
          ).slice(0, 900);

        // Drawn once: while its card is in the air, the creature is not on
        // the battlefield...
        expect(
          frames.filter((f) => f.flight && f.shown).length,
          `the creature was drawn while its card was still flying: ${timeline()}`,
        ).toBe(0);
        // ...the card lands on the stack and rests there (spec 0105)...
        const lastFlight = frames.map((f) => !!f.flight).lastIndexOf(true);
        const onStack = frames.slice(lastFlight + 1).filter((f) => f.stack.length > 0);
        expect(onStack.length, `the card rested on the stack: ${timeline()}`).toBeGreaterThan(0);
        // ...and the creature appears only once the stack card has left,
        // never in two places at once.
        expect(
          frames.filter((f) => f.stack.length > 0 && f.shown).length,
          `the creature was drawn while its stack card was still shown: ${timeline()}`,
        ).toBe(0);
        const lastStack = frames.map((f) => f.stack.length > 0).lastIndexOf(true);
        expect(
          shownAt,
          `the creature appeared after its stack card left: ${timeline()}`,
        ).toBeGreaterThan(lastStack);
        expect(frames[frames.length - 1]!.shown, "the creature stays on the battlefield").toBe(
          true,
        );
        console.log(
          `cast ${card}: in the air ${Math.round(frames[lastFlight]!.t - frames[first]!.t)} ms, ` +
            `on the stack ${Math.round(frames[lastStack]!.t - frames[lastFlight]!.t)} ms`,
        );
        landed += 1;
        await page.screenshot({ path: `test-results/seen/cast-landed-${landed}.png` });
      }
      await host.waitForTimeout(100);
    }
    expect(landed, "creatures were cast and landed").toBeGreaterThanOrEqual(2);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
