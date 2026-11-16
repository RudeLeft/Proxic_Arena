// Lands stay put when tapped -- spec 0093 (owner 2026-11-16, C · tapped lands
// glide to the end; L-1 · the row grows left from a 7-card hand's edge).
// TEST-012: in a real game, the player really pays by clicking the same
// spot again and again.
//
// A real game with the sacrifice test deck (28 Swamps, black creatures). When
// a player has three or more untapped Swamps (one pile) and a creature of 3+
// mana in hand, they cast it, and at each payment step click -- with the real
// mouse -- the very spot the Swamp pile stood at when payment began. Each click
// must land on an untapped Swamp and tap it, and no untapped pile may move at
// all. Then the game goes on to that player's next turn: at their untap step
// the tapped Swamps glide back into the pile (the tidy-up).
//
// LANDS_CLIPS=<dir> also films both seats (normal speed) and writes the
// moments to <dir>/marks.json, for cutting the clips (spec 0093 As built).

import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
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

const pkg = join(process.cwd(), "..", "Test Deck", "sacrifice-deck.zip");
const CLIPS = process.env.LANDS_CLIPS;
// 3 mana or more: paid with three Swamp clicks at least.
const BIG = /^(Scathe Zombies|Bog Raiders|Severed Legion|Zombie Goliath|Mass of Ghouls)/;

type Spot = { id: string; x: number; y: number; w: number; h: number; tapped: boolean };

/** Every land button of the viewer's side: its id, where it is drawn, tapped or not. */
async function lands(page: Page): Promise<Spot[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.bf-cards button[data-object-id][data-zone^="viewer:land"]',
      ),
    ].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        id: b.dataset["objectId"]!,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        tapped: b.dataset["tapped"] === "true",
      };
    }),
  );
}
/** The board button under a point, as the mouse would hit it. */
const hitAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const b = document.elementFromPoint(px!, py!)?.closest<HTMLElement>("button[data-object-id]");
      return b
        ? {
            id: b.dataset["objectId"]!,
            tapped: b.dataset["tapped"] === "true",
            choosable: b.dataset["choosable"] === "true",
            label: b.getAttribute("aria-label") ?? "",
            pile: Number(b.dataset["pile"] ?? 1),
          }
        : null;
    },
    [x, y],
  );
const kind = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector(".gs-win, .gs-question, .gs-your-move, .gs-combat")
        ?.getAttribute("data-kind") ?? null,
  );
/** Untapped Swamps on the viewer's side, counted through piles. */
const untappedSwamps = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.bf-cards button[data-object-id][data-zone^="viewer:land"][data-tapped="false"]',
      ),
    ]
      .filter((b) => /Swamp/.test(b.getAttribute("aria-label") ?? ""))
      .reduce((n, b) => n + Number(b.dataset["pile"] ?? 1), 0),
  );

test("tapping Swamps by clicking the same spot: each click taps an untapped one, no untapped pile moves; they tidy up at the untap step", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no sacrifice deck package (CI builds it)");
  test.setTimeout(900_000);
  const viewport = { width: 1920, height: 1080 };
  if (CLIPS) mkdirSync(CLIPS, { recursive: true });
  const context = () =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: CLIPS, size: viewport } } : {}),
    });
  const t0 = Date.now();
  const marks: Record<string, unknown>[] = [];
  const mark = (what: string, page: Page | null, more: Record<string, unknown> = {}) => {
    marks.push({
      what,
      seat: page === host ? "host" : page === guest ? "guest" : null,
      ms: Date.now() - t0,
      ...more,
    });
    console.log(`MARK ${what} ${Date.now() - t0} ms`, JSON.stringify(more));
  };
  const host = await (await context()).newPage();
  const guest = await (await context()).newPage();
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  let payer: Page | null = null;
  let clicks = 0;
  let tidied = false;
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    let paying: { x: number; y: number } | null = null;
    let paidAt = 0;
    const deadline = Date.now() + 780_000;
    const watch = watchGame([host, guest], () => ({ done: tidied }));
    while (!tidied && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        if (tidied) break;
        const panel = matchPanel(page);
        // After paying: wait for the payer's next untap step (the tidy-up).
        if (payer === page && paidAt > 0) {
          const now = await lands(page);
          if (now.length > 0 && now.every((l) => !l.tapped) && Date.now() - paidAt > 3_000) {
            mark("tidied", page, { lands: now.length });
            // The tidy-up glides; then the Swamps are one pile again, at the
            // spot that was clicked (the row's first place).
            await page.waitForTimeout(1_500);
            const hit = await hitAt(page, paying!.x, paying!.y);
            expect(hit?.label, "the Swamp pile back at the clicked spot").toContain("Swamp");
            expect(hit?.tapped).toBe(false);
            expect(hit?.pile ?? 1, "all the Swamps in it").toBeGreaterThanOrEqual(3);
            tidied = true;
            break;
          }
        }
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        if ((await panel.locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        const k = await kind(page);
        if (k === "applyManaToCost" && payer === page && paidAt === 0) {
          // A payment step: click the spot the Swamp pile stood at.
          await page.waitForTimeout(600); // the step's own pictures settle
          if (!paying) {
            const pile = (await lands(page)).find((l) => !l.tapped);
            expect(pile, "an untapped Swamp pile to click").toBeTruthy();
            paying = { x: pile!.x + pile!.w * 0.3, y: pile!.y + pile!.h * 0.5 };
            mark("first click", page, { at: paying });
          }
          const before = await lands(page);
          const swampsBefore = await untappedSwamps(page);
          const hit = await hitAt(page, paying.x, paying.y);
          expect(hit, `click ${clicks + 1}: something under the pointer`).not.toBeNull();
          expect(hit!.label, `click ${clicks + 1}: a Swamp under the pointer`).toContain("Swamp");
          expect(hit!.tapped, `click ${clicks + 1}: untapped`).toBe(false);
          expect(hit!.choosable, `click ${clicks + 1}: it can pay`).toBe(true);
          await page.mouse.move(paying.x, paying.y, { steps: 4 });
          await page.mouse.click(paying.x, paying.y);
          clicks += 1;
          // The game taps it: one untapped Swamp fewer than before.
          await expect.poll(() => untappedSwamps(page), { timeout: 15_000 }).toBe(swampsBefore - 1);
          await page.waitForTimeout(700); // the glide to the tapped group
          const after = await lands(page);
          // No untapped pile moved: each still-untapped one is where it was (0 px).
          for (const l of after.filter((a) => !a.tapped)) {
            const was =
              before.find((b) => b.id === l.id) ??
              before.find((b) => !b.tapped && Math.abs(b.x - l.x) < 0.5);
            expect(was, `untapped ${l.id} was there before click ${clicks}`).toBeTruthy();
            expect(
              Math.abs(l.x - was!.x),
              `untapped pile moved after click ${clicks}`,
            ).toBeLessThan(0.5);
            expect(
              Math.abs(l.y - was!.y),
              `untapped pile moved after click ${clicks}`,
            ).toBeLessThan(0.5);
          }
          // The tapped group is further left than every untapped pile.
          for (const t of after.filter((a) => a.tapped))
            for (const u of after.filter((a) => !a.tapped && Math.abs(a.y - t.y) < 30))
              expect(t.x, "the tapped group at the row's far left").toBeLessThan(u.x);
          console.log(
            `click ${clicks}: tapped ${hit!.id}, untapped piles ${after.filter((a) => !a.tapped).length}`,
          );
          continue;
        }
        if (k !== "applyManaToCost" && payer === page && paying && paidAt === 0) {
          mark("paid", page, { clicks });
          paidAt = Date.now();
          expect(clicks, "three Swamps or more tapped at the same spot").toBeGreaterThanOrEqual(3);
        }
        if (k === "applyManaToCost") {
          // The other seat's payments, or after ours: any land.
          const any = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
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
        const swamp = hand.filter({ hasText: /^Swamp/ });
        if ((await swamp.count()) > 0) {
          await clickNow(swamp);
          continue;
        }
        const big = hand.filter({ hasText: BIG });
        if (!payer && (await big.count()) > 0 && (await untappedSwamps(page)) >= 3) {
          payer = page;
          mark("cast", page);
          await clickNow(big);
          continue;
        }
        await clickNow(
          panel.locator(
            "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
          ),
        );
      }
      await host.waitForTimeout(120);
    }
    expect(clicks, "Swamps tapped by clicking the same spot").toBeGreaterThanOrEqual(3);
    expect(tidied, "the payer's next untap step came").toBe(true);
  } finally {
    if (CLIPS) {
      writeFileSync(
        join(CLIPS, "marks.json"),
        JSON.stringify(
          {
            marks,
            videos: {
              host: await host
                .video()
                ?.path()
                .catch(() => null),
              guest: await guest
                .video()
                ?.path()
                .catch(() => null),
            },
          },
          null,
          1,
        ),
      );
    }
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
