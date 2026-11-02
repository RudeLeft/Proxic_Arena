// A creature nobody can answer lands straight on the battlefield -- owner
// 2026-11-01, item 2 (canvas https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81).
//
// When the opponent cannot respond, the game resolves a creature the moment
// it is cast. The big card used to fly to the stack (by then empty) while
// the creature slid out of the same spot: a blink. Now the card waits a
// beat, hears the creature is already on the battlefield, and flies onto
// its place there; the board shows the creature only once it has landed.
//
// Watched frame by frame: while the cast card is in the air, the creature's
// own card is hidden; when the flight ends, it is shown where the flight
// landed -- never on the stack.
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
  matchPanel,
  passButton,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const CREATURES =
  /^(Grizzly Bears|Runeclaw Bear|Llanowar Elves|Elvish Mystic|Centaur Courser|Giant Spider|Craw Wurm|Kalonian Tusker|Leatherback Baloth)/;

interface Rect {
  x: number;
  y: number;
}
interface Frame {
  /** The cast card in the air: its centre, and whether it is landing on the battlefield. */
  flight: (Rect & { landing: boolean }) | null;
  /** The board cards hidden because the cast card is flying onto them. */
  hidden: string[];
  /** Where each of those is drawn (hidden or not), by id. */
  at: Record<string, Rect & { shown: boolean }>;
}

/** Every animation frame for [ms]: the cast card, and the cards it is flying onto. */
async function watch(page: Page, ms: number): Promise<Frame[]> {
  return page.evaluate<Frame[], { ms: number }>(
    async ({ ms }) => {
      const frames: Frame[] = [];
      const start = performance.now();
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      };
      const watched = new Set<string>();
      await new Promise<void>((done) => {
        const tick = () => {
          const leaving = document.querySelector(".gs-cast-leaving");
          const hidden = [...document.querySelectorAll<HTMLElement>(".bf-slot")]
            .filter((slot) => slot.style.visibility === "hidden")
            .map((slot) => slot.querySelector("button")?.getAttribute("data-object-id") ?? "")
            .filter(Boolean);
          hidden.forEach((id) => watched.add(id));
          const at: Frame["at"] = {};
          for (const id of watched) {
            const button = document.querySelector(`.bf-cards button[data-object-id="${id}"]`);
            const slot = button?.closest<HTMLElement>(".bf-slot");
            if (button && slot)
              at[id] = { ...centre(button), shown: slot.style.visibility !== "hidden" };
          }
          frames.push({
            flight: leaving
              ? { ...centre(leaving), landing: leaving.getAttribute("data-landing") === "true" }
              : null,
            hidden,
            at,
          });
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      return frames;
    },
    { ms },
  );
}

test("a creature nobody can answer lands straight on its place, drawn once", async ({
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
    let landed = 0;
    const deadline = Date.now() + 780_000;
    while (landed < 2 && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await clickNow(combat);
          continue;
        }
        const priority =
          (await panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)").count()) >
          0;
        if (!priority) {
          // Paying for the creature: a Forest (or an elf) to tap.
          const mana = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await mana.count()) > 0) await clickNow(mana);
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
        const creature = hand.filter({ hasText: CREATURES });
        if ((await creature.count()) === 0) {
          await clickNow(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
          continue;
        }
        // Cast it, and watch from the click that pays the last of it.
        await clickNow(creature);
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
          const watching = watch(page, 2600);
          await clickNow(owing);
          frames = await watching;
          if (frames.some((f) => f.flight)) break;
        }
        // A second copy joins its twin's pile (identical cards stack), with
        // no card of its own to land on: that cast does not count. The
        // watch can open on the end of the previous cast's landing: this
        // cast's creature is the one hidden in the last landing frame.
        const onto = frames.filter((f) => f.flight?.landing).pop()?.hidden[0];
        if (!onto) continue;
        const landing = frames.filter((f) => f.flight?.landing && f.hidden.includes(onto));
        // The whole flight, or nothing to judge: it set off near the end of
        // the recording (another mana was still being paid).
        const lastAt = frames.lastIndexOf(landing[landing.length - 1]!);
        if (landing.length < 10 || !frames.slice(lastAt + 1).some((f) => !f.flight)) continue;

        // Drawn once: in every frame the card is in the air, the creature
        // it is landing on is hidden.
        const shownEarly = landing.filter((f) => f.at[onto]?.shown);
        expect(
          shownEarly.length,
          `the creature was drawn while its card was still flying: ${JSON.stringify(
            landing.map((f) => [f.hidden.join("+"), f.at[onto]?.shown]),
          ).slice(0, 600)}`,
        ).toBe(0);
        // It lands on the creature's place as it is at that moment (the
        // row may still shift afterwards, gliding like any other card),
        // not on the stack; then the creature is shown.
        const last = landing[landing.length - 1]!;
        const place = last.at[onto];
        expect(place, "the creature's place, at the landing").toBeTruthy();
        expect(
          Math.abs(last.flight!.x - place!.x),
          `landed on the creature (x): ${JSON.stringify(
            landing
              .filter((_, i) => i % 3 === 0)
              .map((f) => [Math.round(f.flight!.x), Math.round(f.at[onto]?.x ?? -1)]),
          )}`,
        ).toBeLessThan(30);
        expect(Math.abs(last.flight!.y - place!.y), "landed on the creature (y)").toBeLessThan(30);
        expect(
          frames.some((f) => !f.flight && f.at[onto]?.shown),
          "the creature is shown once the card has landed",
        ).toBe(true);
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
