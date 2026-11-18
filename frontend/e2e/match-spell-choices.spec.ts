// Spells: what they chose and what they aim at, in a real game -- spec 0100
// (F-0100-G), AGENTS TEST-012.
//
// 1. The guest casts Arc Lightning, really clicking the host's Gray Ogre and
//    the host's life shield as its targets, and splits it 2 / 1 in the split
//    tray. The host REALLY points at the stack card (the mouse moves onto
//    it): on the host's page a gold 2 stands at the Ogre's ripple and a gold
//    1 at the host's shield (item 4), the beams are blue-violet, the guest's
//    (item 7), and the Ogre -- its target -- lifts (item 9).
// 2. The host casts Lightning Bolt at the guest's Ogre; the guest REALLY
//    clicks Spellskite to take it. On the host's page the Bolt's beam swings
//    to Spellskite as one beam (item 8), and the host -- the caster -- gets
//    the report window "... changed your Lightning Bolt's target to
//    Spellskite." (the guest gets none).
// 3. The guest casts Reanimate at the host's Ogre in the host's graveyard:
//    on the host's page the beam runs to the host's Graveyard tile and the
//    Ogre peeks out of it with the corners (item 5).
//
// Dealt (spec 0098), so every moment comes on the first game. The deck is
// protocol/fixtures/spell-choices-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/spell-choices-deck.zip" protocol/fixtures/spell-choices-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  cardCount,
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

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "spell-choices-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";

/** On every frame from now: each beam that swings (its line's target as it swings), and each report said. */
async function recorder(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __swings: { to: string; at: string; key: string }[];
      __said: string[];
    };
    w.__swings = [];
    w.__said = [];
    const tick = () => {
      for (const s of document.querySelectorAll<SVGGElement>("[data-swing]")) {
        const line = s.closest<SVGGElement>("[data-line]");
        w.__swings.push({
          to: line?.dataset.to ?? "",
          at: s.dataset.swingAt ?? "",
          key: line?.dataset.key ?? "",
        });
      }
      for (const r of document.querySelectorAll(".gs-reveal")) {
        const text = (r.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!w.__said.includes(text)) w.__said.push(text);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const swingsOf = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __swings: { to: string; at: string; key: string }[] }).__swings,
  );
const saidOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __said: string[] }).__said);

/** A real mouse click on the middle of an element. */
async function realClick(page: Page, target: Locator) {
  const box = await target
    .first()
    .boundingBox({ timeout: 2_000 })
    .catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.click(x, y);
  return true;
}

/** The stack card whose words start so, on this page. */
const stackCard = (page: Page, name: string) =>
  page.locator('button[data-zone="stack"][data-object-id^="stack:"]').filter({ hasText: name });
const idOf = (l: Locator) =>
  l.first().evaluate((el) => el.getAttribute("data-object-id") ?? "", null, { timeout: 2_000 });

test("Arc Lightning's split stands at its ripples, blue-violet; Spellskite swings the Bolt's beam and tells its caster; Reanimate aims at a card peeking out of the graveyard", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no spell-choices deck package (CI builds it)");
  const viewport = { width: 1920, height: 1080 };
  const host = await (await browser.newContext({ viewport })).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext({ viewport })).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        // The host: an Ogre on its third land, a Bolt kept for the guest's.
        // Nothing else to cast: when Spellskite's ability resolves the game
        // passes for the host and the Bolt resolves about a third of a
        // second later -- the page holds that board for the swing (owner
        // 2026-11-18).
        host: {
          hand: [
            "Mountain",
            "Mountain",
            "Gray Ogre",
            "Mountain",
            "Lightning Bolt",
            "Mountain",
            "Swamp",
          ],
          top: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"],
        },
        // The guest: Spellskite, an Ogre, then Arc Lightning, then Reanimate.
        guest: {
          hand: [
            "Mountain",
            "Swamp",
            "Spellskite",
            "Mountain",
            "Gray Ogre",
            "Arc Lightning",
            "Reanimate",
          ],
          top: ["Mountain", "Swamp", "Mountain", "Swamp", "Mountain", "Swamp"],
        },
      },
    });
    await recorder(host);
    await recorder(guest);

    // What each moment found.
    let arcCast = false;
    let arc: Record<string, unknown> | null = null;
    let boltCast = false;
    let skiteClicked = false;
    let swung: Record<string, unknown> | null = null;
    let reanimateCast = false;
    let reanimate: Record<string, unknown> | null = null;
    let hostOgre = "";
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], async () => ({
      hostSaid: await saidOf(host).catch(() => []),
      arcCast,
      arc: !!arc,
      boltCast,
      skiteClicked,
      swung: !!swung,
      reanimateCast,
      reanimate: !!reanimate,
    }));

    while (!(arc && swung && reanimate) && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // The host, the caster of the Bolt: its report window (step 2), as
        // the recorder saw it on any frame.
        const told = page.locator(".gs-reveal").filter({ hasText: "changed your Lightning Bolt" });
        const heard =
          isHost && skiteClicked && !swung
            ? (await saidOf(host)).find((s) => s.includes("changed your Lightning Bolt"))
            : undefined;
        if (heard) {
          // The beam swings on the board under the window (a moment after
          // Spellskite's ability has glowed and gone).
          await expect
            .poll(async () => (await swingsOf(host)).length, { timeout: 5_000 })
            .toBeGreaterThan(0)
            .catch(() => undefined);
          if ((await told.count()) > 0)
            await host.screenshot({ path: join(SHOTS, "spell-choices-retarget.png") });
          swung = { said: heard, swings: await swingsOf(host), guestSaid: await saidOf(guest) };
          if ((await told.count()) > 0) await clickNow(told.locator(".gs-reveal-close"));
          continue;
        }
        if ((await page.locator(".gs-reveal-close").count()) > 0) {
          await clickNow(page.locator(".gs-reveal-close"));
          continue;
        }

        // The split tray (step 1, the guest): 2 to the Ogre, 1 to the host.
        const tray = panel.locator('.gs-win[data-kind="divideAsYouChoose"]').first();
        if ((await tray.count()) > 0 && (await tray.locator(".gs-win-stepper").count()) > 0) {
          const rows = tray.locator(".gs-win-damage-one");
          const ids = await rows.evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-object-id")),
          );
          const shares = (await tray.locator(".gs-win-stepper b").allTextContents()).map(Number);
          const at = ids.findIndex((id) => !id?.startsWith("player:"));
          const player = ids.findIndex((id) => id?.startsWith("player:"));
          if (at >= 0 && player >= 0 && shares[at] === 1) {
            // One from the host to the Ogre.
            await clickNow(tray.getByRole("button", { name: "One less" }).nth(player));
            await clickNow(tray.getByRole("button", { name: "One more" }).nth(at));
            continue;
          }
          await clickNow(tray.getByRole("button", { name: "Done" }));
          continue;
        }
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }

        // Step 1 -- the host points at the guest's Arc Lightning on the stack.
        const arcOnStack = stackCard(page, "Arc Lightning");
        if (isHost && arcCast && !arc && (await arcOnStack.count()) > 0) {
          // Once its card has landed on the stack (the flight there has gone).
          await expect
            .poll(() => page.locator(".gs-cast-leaving").count(), { timeout: 10_000 })
            .toBe(0)
            .catch(() => undefined);
          await page.waitForTimeout(600);
          const box = await arcOnStack.first().boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
            await page.waitForTimeout(700);
            const id = await idOf(arcOnStack);
            const beams = page.locator(`[data-line="target"][data-from="${id}"]`);
            // Both beams drawn (the Ogre's and the host's), each with its share.
            await expect
              .poll(
                () => page.locator(`[data-line="target"][data-from="${id}"] [data-share]`).count(),
                {
                  timeout: 10_000,
                },
              )
              .toBe(2)
              .catch(() => undefined);
            const toOgre = beams.filter({ has: page.locator("[data-share]") });
            const seat = await page.evaluate(
              () => document.querySelector(".gs-seat-viewer")?.getAttribute("data-seat") ?? "",
            );
            const shareAt = (to: string) =>
              page
                .locator(`[data-line="target"][data-from="${id}"][data-to="${to}"] [data-share]`)
                .first()
                .getAttribute("data-share", { timeout: 2_000 })
                .catch(() => null);
            const ogreTo = (
              await toOgre.evaluateAll((els) =>
                els
                  .map((e) => e.getAttribute("data-to") ?? "")
                  .filter((t) => t.startsWith("card:")),
              )
            )[0];
            hostOgre = ogreTo ?? "";
            await host.screenshot({ path: join(SHOTS, "spell-choices-arc-pointed.png") });
            arc = {
              beams: await beams.count(),
              ogre: ogreTo,
              ogreShare: ogreTo ? await shareAt(ogreTo) : null,
              playerShare: await shareAt(`player:${seat}`),
              tones: await page
                .locator(`[data-line="target"][data-from="${id}"] [data-tone]`)
                .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-tone")))]),
              lifted: await page
                .locator('[data-lifted="true"]')
                .evaluateAll((els) => els.map((e) => e.getAttribute("data-object-id"))),
              faded: await page.locator(".bf-stack-faded").count(),
            };
            await page.mouse.move(0, 0);
          }
          await clickNow(passButton(page));
          continue;
        }

        // Step 3 -- the host sees Reanimate aiming at its Ogre in its graveyard.
        const reOnStack = stackCard(page, "Reanimate");
        if (isHost && reanimateCast && !reanimate && (await reOnStack.count()) > 0) {
          await page.waitForTimeout(900);
          const id = await idOf(reOnStack);
          const line = page.locator(`[data-line="target"][data-from="${id}"]`).first();
          const to = await line.getAttribute("data-to", { timeout: 2_000 }).catch(() => null);
          const peek = to ? page.locator(`[data-peek-of="${to}"]`) : null;
          // Once it has risen out of the tile (its rise is 450 ms).
          await page.waitForTimeout(1_200);
          await host.screenshot({ path: join(SHOTS, "spell-choices-reanimate.png") });
          const tile = await page
            .locator('[data-zone-tile="viewer:graveyard"]')
            .boundingBox()
            .catch(() => null);
          const peekBox = peek ? await peek.boundingBox().catch(() => null) : null;
          const end = await line.getAttribute("data-end").catch(() => null);
          reanimate = {
            to,
            hostOgre,
            peek: peek ? await peek.count() : 0,
            sight: peek ? await peek.locator('[data-sight="true"]').count() : 0,
            tile,
            peekBox,
            end,
          };
          await clickNow(passButton(page));
          continue;
        }

        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const label =
          (await cast.count()) > 0
            ? await cast.evaluateAll((els) => els[0]?.getAttribute("aria-label") ?? "")
            : "";
        // Choosing targets: Arc Lightning at the host's Ogre, then the host;
        // the Bolt at the guest's Ogre; Spellskite's ability at the Bolt.
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          const theirOgre = page
            .locator('.bf-cards button[data-choosable="true"][data-controller="opponent"]')
            .filter({ hasText: /^Gray Ogre/ });
          const theirLife = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          const done = panel.locator("button.gs-targets-done");
          const boltOnStack = page.locator('button[data-zone="stack"][data-choosable="true"]');
          const aiming = (await targeting.count()) > 0;
          if (!aiming) {
            // Paying: tap what the game lets this seat tap, else answer.
            const tap = page
              .locator('.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])')
              .filter({ hasNotText: /^Spellskite/ });
            const listedNow = panel.locator(".gs-win li button, .gs-question li button");
            if ((await tap.count()) > 0) await clickNow(tap);
            else if ((await listedNow.count()) > 0) await clickNow(listedNow);
            else await clickNow(panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"));
            continue;
          }
          if (/Arc Lightning/.test(label)) {
            const chosen = await page.locator('[data-chosen-target="true"]').count();
            if (chosen === 0 && (await theirOgre.count()) > 0) await realClick(page, theirOgre);
            else if (chosen === 1 && (await theirLife.count()) > 0)
              await realClick(page, theirLife);
            else if ((await done.count()) > 0) await clickNow(done);
            else await clickNow(panel.locator(".gs-win li button, .gs-question li button"));
            continue;
          }
          if (/Lightning Bolt/.test(label) && (await theirOgre.count()) > 0) {
            await realClick(page, theirOgre);
            continue;
          }
          if (!isHost && skiteClicked && (await boltOnStack.count()) > 0) {
            await realClick(page, boltOnStack);
            continue;
          }
          const listed = panel.locator(".gs-win li button, .gs-question li button");
          const stackOption = listed.filter({ hasText: /on the stack|Lightning Bolt/ });
          if (!isHost && skiteClicked && (await stackOption.count()) > 0) {
            await clickNow(stackOption);
            continue;
          }
          const choosable = page
            .locator('.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])')
            .filter({ hasNotText: /^Spellskite/ });
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await done.count()) > 0) await clickNow(done);
          else if ((await choosable.count()) > 0) await clickNow(choosable);
          else await clickNow(panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"));
          continue;
        }

        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          // Never Spellskite (its ability costs 2 life): only when step 2 says so.
          const board = page
            .locator('.bf-cards button[data-choosable="true"]')
            .filter({ hasNotText: /^Spellskite/ });
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }

        // Step 2 -- the guest takes the Bolt with Spellskite: a real click on it.
        const boltUp = (await stackCard(page, "Lightning Bolt").count()) > 0;
        const skite = page
          .locator('.bf-cards button[data-choosable="true"][data-controller="viewer"]')
          .filter({ hasText: /^Spellskite/ });
        if (!isHost && boltCast && !skiteClicked && boltUp && (await skite.count()) > 0) {
          await realClick(page, skite);
          skiteClicked = true;
          continue;
        }
        const stackEmpty = (await page.locator('button[data-zone="stack"]').count()) === 0;
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const mine = boardCards(page, "viewer");
        const theirs = boardCards(page, "opponent");
        const untapped = await cardCount(
          page
            .locator('.bf-cards button[data-controller="viewer"][data-tapped="false"]')
            .filter({ hasText: /^(Mountain|Swamp)/ }),
        );
        let pick: Locator | null = null;
        const inHand = (name: RegExp) => hand.filter({ hasText: name });
        if (stackEmpty) {
          if ((await inHand(/^(Mountain|Swamp)/).count()) > 0) pick = inHand(/^(Mountain|Swamp)/);
          else if (isHost) {
            const ogres = await cardCount(mine.filter({ hasText: /^Gray Ogre/ }));
            const theirOgres = await cardCount(theirs.filter({ hasText: /^Gray Ogre/ }));
            const theirSkite = await cardCount(theirs.filter({ hasText: /^Spellskite/ }));
            if (!arcCast && ogres === 0 && (await inHand(/^Gray Ogre/).count()) > 0) {
              pick = inHand(/^Gray Ogre/);
            } else if (arc && !boltCast && theirOgres > 0 && theirSkite > 0 && untapped >= 1) {
              pick = inHand(/^Lightning Bolt/);
              if ((await pick.count()) > 0) boltCast = true;
              else pick = null;
            }
          } else {
            const skites = await cardCount(mine.filter({ hasText: /^Spellskite/ }));
            const ogres = await cardCount(mine.filter({ hasText: /^Gray Ogre/ }));
            const theirOgres = await cardCount(theirs.filter({ hasText: /^Gray Ogre/ }));
            if (skites === 0 && (await inHand(/^Spellskite/).count()) > 0)
              pick = inHand(/^Spellskite/);
            else if (ogres === 0 && (await inHand(/^Gray Ogre/).count()) > 0)
              pick = inHand(/^Gray Ogre/);
            else if (
              !arcCast &&
              theirOgres > 0 &&
              untapped >= 3 &&
              (await inHand(/^Arc Lightning/).count()) > 0
            ) {
              pick = inHand(/^Arc Lightning/);
              arcCast = true;
            } else if (
              swung &&
              !reanimateCast &&
              theirOgres === 0 &&
              (await inHand(/^Reanimate/).count()) > 0
            ) {
              pick = inHand(/^Reanimate/);
              reanimateCast = true;
            }
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick);
        else await clickNow(passButton(page));
      }
    }

    console.log(`step 1 (Arc Lightning, the host's page): ${JSON.stringify(arc)}`);
    console.log(`step 2 (Spellskite, the host's page): ${JSON.stringify(swung)}`);
    console.log(`step 3 (Reanimate, the host's page): ${JSON.stringify(reanimate)}`);
    expect(arc, "the host pointed at the guest's Arc Lightning").not.toBeNull();
    // Item 4: a gold 2 at the Ogre's ripple, a gold 1 at the host's shield.
    expect(arc!["ogreShare"], "2 at the Ogre's ripple").toBe("2");
    expect(arc!["playerShare"], "1 at the host's shield").toBe("1");
    // Item 7: the guest's beams, blue-violet, on the host's page.
    expect(arc!["tones"], "the other player's beams are blue-violet").toEqual(["theirs"]);
    // Item 9: its target lifts; nothing fades.
    expect(arc!["lifted"], "the Ogre, its target, lifts").toContain(arc!["ogre"]);
    expect(arc!["faded"], "nothing dims").toBe(0);

    expect(swung, "the host was told its Bolt's target changed").not.toBeNull();
    expect(swung!["said"]).toContain("changed your Lightning Bolt's target to Spellskite.");
    const swings = swung!["swings"] as { to: string; key: string; at: string }[];
    expect(swings.length, "the Bolt's beam swung (frames drawn mid-swing)").toBeGreaterThan(0);
    // The host could not answer: the board was held until the swing played
    // through, the Bolt still on the stack (owner 2026-11-18).
    expect(
      Math.max(...swings.map((s) => Number(s.at))),
      "the swing played through before the Bolt resolved",
    ).toBeGreaterThan(0.85);
    expect(new Set(swings.map((s) => s.key)).size, "one beam element throughout").toBe(1);
    const guestSaid = swung!["guestSaid"] as string[];
    expect(
      guestSaid.filter((s) => s.includes("changed")),
      "the guest, who did it, is told nothing",
    ).toEqual([]);

    expect(reanimate, "the host saw the guest's Reanimate").not.toBeNull();
    expect(reanimate!["to"], "Reanimate aims at the host's Ogre").toBe(hostOgre);
    expect(reanimate!["peek"], "the Ogre peeks out of the Graveyard tile").toBe(1);
    expect(reanimate!["sight"], "wearing the corners").toBe(1);
    const tile = reanimate!["tile"] as { x: number; y: number; width: number; height: number };
    const peek = reanimate!["peekBox"] as { x: number; y: number; width: number; height: number };
    expect(
      Math.hypot(
        peek.x + peek.width - (tile.x + tile.width / 2),
        peek.y + peek.height - (tile.y + tile.height / 2),
      ),
      "the peek card stands at the tile",
    ).toBeLessThan(200);
  } finally {
    await host.context().close();
    await guest.context().close();
  }
});
