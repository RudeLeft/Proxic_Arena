// Big combats, in the browser — specs 0036 and 0037 (owner 2026-10-29),
// and Phase 9 W-14 (Amendment 11, owner 2026-11-03).
//
// Both players flood the board with identical 1/1 Goblin tokens (the swarm
// deck). They stack (0036). The host selects everything ("All attack") and
// points it at the guest. The guest clicks its own Goblin stack once per
// Goblin to select ("✓ 2"), then the attacking stack: one blocker on each
// (W-14, replacing 0037's "Block how many?" box). Each blocker then stands
// facing the attacker it blocks (Phase 10 A-12, replacing 0037's riding): no
// block lines.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  attackWithAll,
  clearEverything,
  clickNow,
  matchPanel,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

const pkg = join(process.cwd(), "..", "Test Deck", "swarm-deck.zip");
const SPELLS =
  /^(Goblin Rally|Hordeling Outburst|Beetleback Chief|Dragon Fodder|Krenko's Command|Goblin Instigator)/;

/** A stack of untapped Goblins on one side, as `viewer` sees it: its size. */
async function goblinStack(page: Page, side: "viewer" | "opponent"): Promise<number> {
  const piles = await page
    .locator(
      `.bf-cards button[data-controller="${side}"][data-tapped="false"][data-pile]:not([data-blocking])`,
    )
    .filter({ hasText: "Goblin" })
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset["pile"] ?? 1)));
  return Math.max(0, ...piles);
}

test("a stack blocks a stack: select from the pile, point at theirs, and blockers face them", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no swarm deck package (CI builds it)");
  test.setTimeout(900_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);

    let attacked = false;
    let blocked: number | null = null;
    const deadline = Date.now() + 780_000;
    const watch = watchGame([host, guest], () => ({ blocked }));
    while (blocked === null && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        const kind =
          (await panel
            .locator(".gs-combat")
            .getAttribute("data-kind", { timeout: 200 })
            .catch(() => null)) ?? "";

        if (kind === "declareAttackers") {
          // The host attacks once, with everything, when both swarms are up.
          const ready =
            page === host &&
            !attacked &&
            (await goblinStack(host, "viewer")) >= 4 &&
            (await goblinStack(host, "opponent")) >= 3;
          if (ready && (await attackWithAll(page))) {
            await page.screenshot({ path: "test-results/seen/attack-pointed.png" });
            attacked = true;
          }
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }

        if (kind === "declareBlockers" && page === guest && attacked) {
          // W-14: our Goblin stack, once per Goblin, then theirs.
          const mine = page
            .locator('.bf-cards button[data-controller="viewer"][data-pile][data-choosable="true"]')
            .filter({ hasText: "Goblin" })
            .first();
          await expect(mine).toBeVisible();
          const theirsCount = Math.max(
            0,
            ...(await page
              .locator(
                '.bf-cards button[data-controller="opponent"][data-attacking="true"][data-pile]',
              )
              .filter({ hasText: "Goblin" })
              .evaluateAll((els) =>
                els.map((el) => Number((el as HTMLElement).dataset["pile"] ?? 1)),
              )),
          );
          const n = Math.min(theirsCount, Number(await mine.getAttribute("data-pile")));
          expect(n, "a pile of attackers and a pile to block with").toBeGreaterThanOrEqual(2);
          for (let i = 1; i <= n; i++) {
            await clickNow(mine);
            await expect(mine).toHaveAttribute("data-marked", String(i));
          }
          // The seal sits beside the card (the card clips what crosses its edge).
          const seal = mine.locator("xpath=..").locator(".bf-marked-n");
          await expect(seal).toHaveText(`${n}`);
          // Seen, not just there: the count's middle shows the count.
          await page.waitForTimeout(400);
          const count = await seal.locator("b").boundingBox();
          expect(count, "the count has a box").not.toBeNull();
          const shown = await page.evaluate(
            ({ x, y }) => {
              // The seal takes no clicks; let it be hit for this look only.
              const seals = [...document.querySelectorAll<HTMLElement>(".bf-marked-n")];
              seals.forEach((e) => (e.style.pointerEvents = "auto"));
              const hit = !!document.elementFromPoint(x, y)?.closest(".bf-marked-n");
              seals.forEach((e) => (e.style.pointerEvents = ""));
              return hit;
            },
            { x: count!.x + count!.width / 2, y: count!.y + count!.height / 2 },
          );
          expect(shown, "the seal's count is not clipped or covered").toBe(true);
          // Selected and not pointed: the button waits (owner: locked).
          await expect(panel.locator("button.gs-act-combat")).toBeDisabled();
          await expect(panel.locator("button.gs-act-combat")).toContainText(`${n} selected`);
          await page.screenshot({ path: "test-results/seen/block-selected.png" });
          const theirs = page
            .locator(
              '.bf-cards button[data-controller="opponent"][data-attacking="true"][data-pile][data-choosable="true"]',
            )
            .filter({ hasText: "Goblin" });
          await expect(theirs.first(), "the attackers to block are offered").toBeVisible({
            timeout: 15_000,
          });
          await clickNow(theirs);
          await expect(page.getByRole("dialog", { name: "Block how many" })).toHaveCount(0);
          // Every block lands, each blocker standing facing its attacker.
          await expect
            .poll(
              async () =>
                (
                  await page
                    .locator(".bf-cards button[data-blocking][data-blocks]")
                    .evaluateAll((els) =>
                      els.map((el) => Number((el as HTMLElement).dataset["pile"] ?? 1)),
                    )
                ).reduce((a, b) => a + b, 0),
              { timeout: 60_000, message: `all ${n} blockers face their attackers` },
            )
            .toBe(n);
          // No shield lines for blockers facing their attackers.
          await expect(page.locator('[data-line="block"]')).toHaveCount(0);
          await page.screenshot({ path: "test-results/seen/block-many-riders.png" });
          blocked = n;
          break;
        }

        if (kind) {
          await clickNow(panel.locator("button.gs-act-combat"));
          continue;
        }

        // Priority: a Mountain, else a Goblin-making spell, else pass.
        const act = panel.locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel)");
        if ((await act.count()) > 0) {
          const hand = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
          const land = hand.filter({ hasText: "Mountain" });
          const spell = hand
            .filter({ hasText: SPELLS })
            .and(page.locator(':not([data-unpayable="true"])'));
          if ((await land.count()) > 0) await clickNow(land);
          else if ((await spell.count()) > 0) {
            await clickNow(spell);
            const popup = page.locator(".gs-popup .gs-option");
            if ((await popup.count()) > 0) await clickNow(popup);
          } else await clickNow(act);
          continue;
        }
        // Anything else: its first choice, a board choice, or pass.
        const listed = panel.locator(".gs-question li button, .gs-win li button");
        const board = panel.locator('.bf-cards button[data-choosable="true"]');
        if ((await listed.count()) > 0) await clickNow(listed);
        else if ((await board.count()) > 0) await clickNow(board);
        else await clickNow(panel.locator("button.gs-pass, button.gs-act"));
      }
      await host.waitForTimeout(100);
    }
    expect(attacked, "the host never had a swarm to attack with").toBe(true);
    expect(blocked, "the guest never blocked a stack with a stack").not.toBeNull();
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
