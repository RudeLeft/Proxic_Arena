// Flying and summoning sickness, seen on the table -- owner 2026-11-01,
// item 3 (demo https://claude.ai/artifact/UwpQUYqiEzL3nTFrr484Yc, approved).
//
//   flying   an untapped flyer hovers: lifted, bobbing slowly with a little
//            tilt (only bobbing in a crowded row), a shadow under it;
//            tapped, it rests at the board's 5-degree tilt.
//   sick     a creature that came in this turn has black-outlined z's
//            drifting up from its left side; gone on its controller's
//            next turn.
//
// Uses the landing test deck (protocol/fixtures/landing-deck): Birds of
// Paradise flies (and makes mana, so it gets tapped).

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
  /^(Birds of Paradise|Grizzly Bears|Llanowar Elves|Elvish Mystic|Centaur Courser|Giant Spider|Craw Wurm|Kalonian Tusker|Leatherback Baloth)/;

/** Each of this player's creatures: flying motion, the z's, tapped. */
async function creatures(page: Page) {
  return page
    .locator(
      '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
    )
    .evaluateAll((els) =>
      els
        .filter((el) => /creature/.test(el.getAttribute("data-zone") ?? ""))
        .map((el) => {
          const style = getComputedStyle(el);
          return {
            id: el.getAttribute("data-object-id") ?? "",
            name: (el.getAttribute("aria-label") ?? "").split(",")[0] ?? "",
            label: el.getAttribute("aria-label") ?? "",
            tapped: el.getAttribute("data-tapped") === "true",
            fly: el.classList.contains("bf-fly"),
            moving: style.animationName.includes("bf-fly"),
            shadow: !!el.parentElement?.querySelector(".bf-fly-shadow"),
            zz: el.querySelectorAll(".bf-zz i").length,
          };
        }),
    );
}

test("flyers hover, tapped ones rest; a creature that just came in shows its z's for one turn", async ({
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
    const seen = new Set<string>();
    /** Creatures seen with their z's, by id: they must lose them next turn. */
    const sickOn = new Map<string, { page: Page; turn: string }>();
    const deadline = Date.now() + 780_000;
    const done = () => ["fly", "rest", "zz", "zz-gone"].every((k) => seen.has(k));
    while (!done() && Date.now() < deadline) {
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        const turn = (
          (await page.locator(".gs-turn-value").first().allTextContents())[0] ?? ""
        ).trim();

        for (const c of await creatures(page)) {
          if (c.name === "Birds of Paradise" && !c.tapped) {
            expect(
              c.fly && c.moving && c.shadow,
              `an untapped flyer hovers: ${JSON.stringify(c)}`,
            ).toBe(true);
            expect(c.label).toContain("flying");
            if (!seen.has("fly")) {
              seen.add("fly");
              await page.waitForTimeout(800);
              await page.screenshot({ path: "test-results/seen/motion-flying.png" });
            }
          }
          if (c.name === "Birds of Paradise" && c.tapped) {
            expect(c.fly || c.shadow, "a tapped flyer rests").toBe(false);
            seen.add("rest");
          }
          if (c.zz > 0) {
            expect(c.zz).toBe(3);
            expect(c.label).toContain("summoning sick");
            if (!sickOn.has(c.id)) sickOn.set(c.id, { page, turn });
            if (!seen.has("zz")) {
              seen.add("zz");
              await page.waitForTimeout(600);
              await page.screenshot({ path: "test-results/seen/motion-sick.png" });
            }
          }
        }
        // Two turns later (its controller's next), the z's are gone.
        for (const [id, at] of sickOn) {
          if (at.page !== page || !turn || !at.turn || Number(turn) < Number(at.turn) + 2) continue;
          const now = (await creatures(page)).find((c) => c.id === id);
          if (now) {
            expect(now.zz, `${now.name} still sick on its controller's next turn`).toBe(0);
            seen.add("zz-gone");
          }
          sickOn.delete(id);
        }

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
          // Paying: Birds first, so a flyer gets tapped.
          const mana = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const birds = mana.filter({ hasText: "Birds of Paradise" });
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await birds.count()) > 0) await clickNow(birds);
          else if ((await mana.count()) > 0) await clickNow(mana);
          else if ((await listed.count()) > 0) await clickNow(listed);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const pick = [hand.filter({ hasText: /^Forest/ }), hand.filter({ hasText: CREATURES })];
        let acted = false;
        for (const p of pick) {
          if ((await p.count()) > 0) {
            await clickNow(p);
            acted = true;
            break;
          }
        }
        if (!acted) {
          await clickNow(panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)"));
        }
      }
      await host.waitForTimeout(120);
    }
    expect([...seen].sort(), "flying, resting, sick and recovered were all seen").toEqual(
      ["fly", "rest", "zz", "zz-gone"].sort(),
    );
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
