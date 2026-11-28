// Small fixes, in real games -- spec 0108 (F-0108-G, F-0108-H, F-0108-I),
// AGENTS TEST-012.
//
// Game 1 (dealt, spec 0098): the host (Alice) holds Rebuke and Plains; the
// guest (Bob) has Grizzly Bears, Butcher Ghoul and Mist Raven, and draws
// Sharpened Pitchfork.
//
// 1. The host's main phase, three Plains untapped, nothing attacking:
//    Rebuke is not lit. The host REALLY clicks it: the menu says "Not now."
//    and "There's no attacking creature to target."; no question arrives.
// 2. The guest REALLY attacks with the Bears (a click on the Bears, on the
//    host's life, on the act button): Rebuke lights for the host, who
//    really clicks it, then the Bears, then pays; the Bears go to the
//    guest's graveyard.
// 3. The host casts Slayer of the Wicked, its trigger aimed at the guest's
//    Butcher Ghoul (a Zombie): both pages' stack plates read the trigger's
//    sentence and carry no "Targeting" (F-0108-E's words, on the page).
// 4. The guest's Mist Raven carries the Pitchfork: on the host's page the
//    tab's place on the card (CDP's drawn corners, in the card's own frame)
//    stays within 1 px over six looks across a bob, while the card moves.
// 5. The Raven attacks: through the combat damage no fight caption is
//    visible on either page; the caption is in the page only for screen
//    readers (`pa-visually-hidden`), F-0108-H.
//
// Game 2 (F-0108-I, item 4 re-checked): the host's Screeching Skaab mills
// two of the host's cards; then the host's Thought Scour mills two of the
// guest's. From the seat whose library mills, every milled card streams
// exactly once (its back, then its face: one card), its library tile counts
// down by one per card and its graveyard up by one, and nothing streams
// again at the next passed step. PROXIC_MILL_SLOW=0.25 plays the table's
// animations at a quarter (CDP) for the quarter-speed clip; never set by CI.
//
// Every wait is on a state (the card lit, the window there, the graveyard
// count, the stack plate there). The deck is protocol/fixtures/small-fixes-deck.
// CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/small-fixes-deck.zip" protocol/fixtures/small-fixes-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
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
  PRIORITY,
  realClick,
  realClickUnless,
  sharedDeck,
  startAMatch,
  TARGETING,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "small-fixes-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;
const SLOW = Number(process.env.PROXIC_MILL_SLOW ?? 1);

const NO_TARGET = "There's no attacking creature to target.";
const SLAYER_SAYS = "you may destroy target Vampire, Werewolf, or Zombie.";

const handCard = (page: Page, name: RegExp) =>
  page.locator('[data-zone="viewer:hand"]').filter({ hasText: name });
const lit = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });
const onBoard = (page: Page, side: "viewer" | "opponent", name: RegExp) =>
  boardCards(page, side).filter({ hasText: name });
/**
 * One of the viewer's creatures that can attack now: untapped and not
 * summoning sick (since spec 0113 the board says "came in this turn" in its
 * name; CI run 44898320006 stalled again on the old words). The Raven
 * is cast and equipped in one main phase, so on that turn's combat it is
 * sick; the undying Ghoul may still make the game ask for attackers. CI run
 * 44827945861 clicked the sick Raven for 120 s: it is only selected, and the
 * other player's life never lights for it.
 */
const canAttack = (page: Page, name: RegExp) =>
  onBoard(page, "viewer", name).and(
    page.locator('[data-tapped="false"]:not([aria-label*="came in this turn"])'),
  );
const stepOf = async (page: Page) =>
  (
    (await page
      .locator(".gs-steps")
      .getAttribute("data-step")
      .catch(() => "")) ?? ""
  ).trim();
const untapped = async (page: Page, name: RegExp) =>
  cardCount(onBoard(page, "viewer", name).and(page.locator('[data-tapped="false"]')));
const tileN = async (page: Page, tile: string) =>
  Number((await page.locator(`[data-zone-tile="${tile}"] .gs-zone-n`).allTextContents())[0] ?? NaN);
/** Slayer of the Wicked's trigger on the stack (not the spell: a spell's card rises from its cast). */
const slayerTrigger = (page: Page) =>
  page.locator(
    'button[data-zone="stack"][aria-label^="Slayer of the Wicked"]:not([data-rise-from])',
  );
const stackEmpty = async (page: Page) =>
  (await page.locator('button[data-zone="stack"]').count()) === 0;
const priorityHere = async (page: Page) =>
  (await matchPanel(page)
    .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
    .count()) > 0;

/** F-0108-H -- every fight caption the page adds, and whether it could be seen. */
async function watchCaptions(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __caps: { hidden: boolean; seen: boolean; text: string }[] };
    w.__caps = [];
    const look = (el: Element) => {
      if (!el.classList.contains("bf-fight-caption")) return;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      w.__caps.push({
        hidden: el.classList.contains("pa-visually-hidden"),
        seen:
          r.width > 2 &&
          r.height > 2 &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          style.clipPath === "none" &&
          style.clip === "auto",
        text: (el.textContent ?? "").slice(0, 80),
      });
    };
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof Element) {
            look(n);
            n.querySelectorAll(".bf-fight-caption").forEach(look);
          }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const captions = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __caps?: { hidden: boolean; seen: boolean; text: string }[] })
        .__caps ?? [],
  );

/** Step 4 -- the tab's corner in the card's own frame, read from the drawn corners (CDP). */
async function tabPlace(page: Page, cardId: string, tabId: string) {
  const cdp = await page.context().newCDPSession(page);
  const quad = async (root: number, selector: string) => {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root, selector });
    const { quads } = await cdp.send("DOM.getContentQuads", { nodeId });
    return quads[0]!;
  };
  const looks: { cardY: number; u: number; v: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const card = await quad(root.nodeId, `button.bf-card[data-object-id="${cardId}"]`);
    const tab = await quad(root.nodeId, `button.bf-tag[data-object-id="${tabId}"]`);
    const [ox, oy, tx, ty] = card as [number, number, number, number];
    const lx = card[6]! - ox;
    const ly = card[7]! - oy;
    const top = Math.hypot(tx - ox, ty - oy);
    const left = Math.hypot(lx, ly);
    looks.push({
      cardY: oy,
      u: ((tab[0]! - ox) * (tx - ox) + (tab[1]! - oy) * (ty - oy)) / top,
      v: ((tab[0]! - ox) * lx + (tab[1]! - oy) * ly) / left,
    });
    if (i === 0 || i === 3) await page.screenshot({ path: join(SHOTS, `0108-raven-tab-${i}.png`) });
    // Six looks across one 5 s bob (the bob is slow; this is not a frame's wait).
    await page.waitForTimeout(500);
  }
  await cdp.detach();
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  return {
    moved: spread(looks.map((l) => l.cardY)),
    u: spread(looks.map((l) => l.u)),
    v: spread(looks.map((l) => l.v)),
  };
}

/** The guest's attack, really clicked: the creature, the host's life, then the act button. */
async function attackWith(page: Page, creature: Locator): Promise<boolean> {
  const panel = matchPanel(page);
  if (!(await realClick(page, creature))) return false;
  const life = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
  await expect(life, "the other player can be pointed at")
    .toBeVisible({ timeout: 5_000 })
    .catch(() => undefined);
  if (!(await realClick(page, life))) return false;
  const go = panel
    .locator("button.gs-act-combat:not([disabled])")
    .filter({ hasText: /Attack with/ });
  await expect(go).toHaveCount(1, { timeout: 10_000 });
  return realClick(page, go);
}

/**
 * Pay for the spell being cast, or answer its window, by clicking what the page lights.
 * [unread]: windows a step reads itself (a target question that opened after
 * the step looked), never answered here.
 */
async function payOrAnswer(page: Page, unread?: string): Promise<boolean> {
  const panel = matchPanel(page);
  const tap = page.locator(
    '.bf-cards button[data-choosable="true"][data-controller="viewer"][data-zone$=":lands"], .bf-cards button[data-choosable="true"][data-controller="viewer"][data-zone*="land"]',
  );
  const listed = panel.locator(
    ".gs-win li button:not(:disabled), .gs-question li button:not(:disabled)",
  );
  const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
  if ((await tap.count()) > 0) await clickUnlessCombat(tap, unread);
  else if ((await listed.count()) > 0) await clickUnlessCombat(listed, unread);
  else if ((await main.count()) > 0) await clickUnlessCombat(main, unread);
  else return false;
  return true;
}

function contexts(browser: import("@playwright/test").Browser, game: string) {
  const viewport = { width: 1920, height: 1080 };
  return (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, `${game}-${name}`), size: viewport } } : {}),
    });
}

test("Rebuke is lit only with an attacker and says why; Slayer's stack plate has no Targeting; a flyer's tab bobs with it; no combat caption shows", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no small-fixes deck package (CI builds it)");
  mkdirSync(SHOTS, { recursive: true });
  const context = contexts(browser, "fixes");
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    const plains = (n: number) => Array.from({ length: n }, () => "Plains");
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [...plains(3), "Rebuke", "Slayer of the Wicked", ...plains(2)],
          top: plains(13),
        },
        guest: {
          hand: [
            "Forest",
            "Swamp",
            "Island",
            "Grizzly Bears",
            "Butcher Ghoul",
            "Island",
            "Mist Raven",
          ],
          top: [
            "Sharpened Pitchfork",
            "Forest",
            "Swamp",
            "Island",
            "Forest",
            "Swamp",
            "Island",
            "Forest",
            "Swamp",
            "Island",
          ],
        },
      },
    });
    await watchCaptions(host);
    await watchCaptions(guest);

    const st = {
      notLit: null as null | { lit: boolean; why: string; asked: number },
      bearsAttacked: false,
      rebukeLit: false,
      rebuked: false,
      bearsDead: false,
      graveBefore: NaN,
      slayerCast: false,
      slayerTargeted: false,
      plates: null as null | { host: string[]; guest: string[] },
      ravenCast: false,
      forkCast: false,
      equipping: false,
      tab: null as null | { moved: number; u: number; v: number },
      ravenAttacked: false,
      lifeBefore: NaN,
      damage: null as null | { host: unknown[]; guest: unknown[]; lifeBefore: number },
    };
    const done = () => st.notLit && st.bearsDead && st.plates && st.tab && st.damage;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => st);

    while (!done() && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        const other = page.locator(".gs-reveal .gs-reveal-close");
        if ((await other.count()) > 0) {
          await clickNow(other);
          continue;
        }

        // Step 3 -- Slayer's trigger on the stack: both pages' plates.
        // The plate's words show on a card with a picture; the CI deck has none,
        // so each page REALLY clicks the trigger's stack card and reads its
        // close-up's "Does" row (the same words, GameScreen's stack inspect),
        // and the plate's own words where there are any.
        if (st.slayerCast && !st.plates && (await slayerTrigger(host).count()) > 0) {
          const read = async (p: Page, who: string) => {
            const card = slayerTrigger(p);
            if ((await card.count()) === 0) return null;
            const plate = (await p.locator(".bf-stack-said").allTextContents()).map((s) =>
              s.trim(),
            );
            if (!(await realClick(p, card.first()))) return null;
            const does = p.locator(".gs-inspect .gs-inspect-facts dd").first();
            if (!(await does.isVisible({ timeout: 5_000 }).catch(() => false))) {
              await expect(does)
                .toBeVisible({ timeout: 5_000 })
                .catch(() => undefined);
            }
            const text = ((await does.textContent().catch(() => "")) ?? "").trim();
            await p.screenshot({ path: join(SHOTS, `0108-slayer-closeup-${who}.png`) });
            await p.keyboard.press("Escape");
            return text ? [text, ...plate] : null;
          };
          const h = await read(host, "host");
          const g = h ? await read(guest, "guest") : null;
          console.log(`0108 slayer: ${JSON.stringify({ h, g })}`);
          if (h && g) st.plates = { host: h, guest: g };
          if (h && g) continue;
        }

        // Step 4 -- the guest's equipped Raven, read on the host's page before it attacks.
        if (isHost && !st.tab) {
          const raven = onBoard(page, "opponent", /^Mist Raven/).and(
            page.locator('[data-tapped="false"]'),
          );
          const fork = page.locator(
            'button.bf-tag[data-object-id][aria-label^="Sharpened Pitchfork"]',
          );
          if ((await raven.count()) > 0 && (await fork.count()) > 0) {
            const ravenId = (await raven.first().getAttribute("data-object-id"))!;
            const forkId = (await fork.first().getAttribute("data-object-id"))!;
            st.tab = await tabPlace(page, ravenId, forkId);
            await guest.screenshot({ path: join(SHOTS, "0108-raven-tab-guest.png") });
            continue;
          }
        }

        // Step 5 -- after the Raven's damage: every caption either page added.
        if (st.ravenAttacked && !st.damage && isHost) {
          const step = await stepOf(host);
          const life = Number(
            await host.locator(".gs-seat-viewer .gs-life").first().getAttribute("data-life"),
          );
          if (life < st.lifeBefore && !/combat/i.test(step)) {
            await host.screenshot({ path: join(SHOTS, "0108-raven-damage-host.png") });
            st.damage = {
              host: await captions(host),
              guest: await captions(guest),
              lifeBefore: st.lifeBefore,
            };
            continue;
          }
        }

        // Step 2 -- the Bears attacking: Rebuke lights; the host casts it at them.
        if (isHost && st.bearsAttacked && !st.bearsDead) {
          const attacking = onBoard(page, "opponent", /^Grizzly Bears/).and(
            page.locator('[data-attacking="true"]'),
          );
          const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
          if ((await targeting.count()) > 0) {
            const target = attacking.and(page.locator('[data-choosable="true"]'));
            if ((await target.count()) > 0) {
              await page.screenshot({ path: join(SHOTS, "0108-rebuke-target.png") });
              await realClick(page, target);
            }
            continue;
          }
          if ((await attacking.count()) > 0 && (await lit(page, /^Rebuke/).count()) > 0) {
            st.rebukeLit = true;
            await page.screenshot({ path: join(SHOTS, "0108-rebuke-lit.png") });
            if (await realClick(page, lit(page, /^Rebuke/))) st.rebuked = true;
            continue;
          }
        }
        if (isHost && st.rebuked && !st.bearsDead) {
          if ((await tileN(page, "opponent:graveyard")) > st.graveBefore) {
            st.bearsDead = (await onBoard(page, "opponent", /^Grizzly Bears/).count()) === 0;
            if (st.bearsDead) await page.screenshot({ path: join(SHOTS, "0108-bears-dead.png") });
          }
        }

        // Targets for the guest: the Raven's trigger (anything but the Raven
        // itself, the host's first), then the Pitchfork's equip (the Raven).
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        // A target question that opens after this look is the next pass's,
        // never a catch-all's below (a generic answer aimed the Raven's
        // bounce at the Raven, CI 44884351426); one seen here and not aimed
        // ("found nothing to click") still falls through to them.
        const targetShown = (await targeting.count()) > 0;
        const unread = targetShown ? undefined : TARGETING;
        // Rebuke's target, opened since step 2 looked: step 2's, next pass.
        if (targetShown && isHost && st.bearsAttacked && !st.bearsDead) continue;
        if (targetShown) {
          const choosable = (side: "viewer" | "opponent") =>
            boardCards(page, side).and(page.locator('[data-choosable="true"]'));
          let pick: Locator | null = null;
          if (!isHost && st.equipping)
            pick = choosable("viewer").filter({ hasText: /^Mist Raven/ });
          else if (!isHost) {
            const theirs = choosable("opponent");
            const mine = choosable("viewer").filter({ hasNotText: /^Mist Raven/ });
            pick = (await theirs.count()) > 0 ? theirs : mine;
          } else {
            // The host's Slayer trigger: the Ghoul (on the table, or listed).
            pick = choosable("opponent").filter({ hasText: /^Butcher Ghoul/ });
            if ((await pick.count()) === 0)
              pick = panel.locator(".gs-win li button").filter({ hasText: /Butcher Ghoul/ });
          }
          if (pick && (await pick.count()) > 0) {
            console.log(
              `0108 target: ${isHost ? "host" : "guest"} -> ${await pick.first().getAttribute("aria-label")}`,
            );
            await realClick(page, pick.first());
            if (!isHost && st.equipping) st.equipping = false;
            if (isHost && st.slayerCast) st.slayerTargeted = true;
            continue;
          }
          console.log(`0108 target: ${isHost ? "host" : "guest"} found nothing to click`);
        }

        if (await answerCardTray(page)) continue;
        // Paying for a spell or an ability (the Pitchfork's equip has no card being cast).
        const paying =
          (await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) > 0 ||
          // an ability being paid for has no card being cast, only its Cancel button
          (await panel.locator("button.gs-act-cancel").count()) > 0;
        if (paying && (await payOrAnswer(page, unread))) continue;
        // Combat: the guest attacks (Bears for step 2, the Raven for step 5); the host never does.
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          const declaring = /attack/i.test((await combat.first().textContent()) ?? "");
          if (!isHost && declaring) {
            const bears = canAttack(page, /^Grizzly Bears/);
            const raven = canAttack(page, /^Mist Raven/);
            const hostPlains = await untapped(host, /^Plains/);
            // Only after step 1 (the host saw Rebuke unlit), so the steps come in order.
            const ready = st.notLit && !st.bearsDead && hostPlains >= 3;
            if (ready && (await bears.count()) > 0) {
              st.graveBefore = await tileN(host, "opponent:graveyard");
              st.bearsAttacked = (await attackWith(page, bears.first())) || st.bearsAttacked;
              continue;
            }
            if (st.tab && !st.ravenAttacked && (await raven.count()) > 0) {
              st.lifeBefore = Number(
                await host.locator(".gs-seat-viewer .gs-life").first().getAttribute("data-life"),
              );
              st.ravenAttacked = await attackWith(page, raven.first());
              continue;
            }
          }
          await passCombat(page);
          continue;
        }

        if (!(await priorityHere(page))) {
          const question = panel.locator(".gs-win");
          if (st.slayerCast && !st.slayerTargeted && isHost && (await question.count()) > 0)
            console.log(
              `0108 host asked: ${((await question.first().textContent()) ?? "").replace(/\s+/g, " ").slice(0, 200)}`,
            );
          // A card to choose on the table (the Pitchfork's "Choose one": the Raven).
          const onTable = page.locator(
            '.bf-cards button[data-object-id][data-choosable="true"]:not([data-zone$=":hand"])',
          );
          if ((await question.count()) > 0 && (await onTable.count()) > 0) {
            await realClickUnless(
              page,
              onTable.first(),
              `${PRIORITY}${unread ? `, ${unread}` : ""}`,
            );
            continue;
          }
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed, unread);
          else if ((await main.count()) > 0) await clickUnlessCombat(main, unread);
          else await clickNow(passButton(page));
          continue;
        }

        // Slayer's trigger stays on the stack until both pages have read it:
        // the host holds its priority (questions are still answered above).
        if (isHost && st.slayerCast && !st.plates && (await slayerTrigger(page).count()) > 0)
          continue;
        const step = await stepOf(page);
        const main = /Main/.test(step);
        const empty = await stackEmpty(page);
        let pick: Locator | null = null;
        if (isHost && main && empty) {
          // Step 1 -- three Plains up, Rebuke in hand, nothing attacking: not lit; a click says why.
          if (
            !st.notLit &&
            (await untapped(page, /^Plains/)) >= 3 &&
            (await handCard(page, /^Rebuke/).count()) > 0
          ) {
            const rebuke = handCard(page, /^Rebuke/).first();
            const isLit = (await rebuke.getAttribute("data-choosable")) === "true";
            await page.screenshot({ path: join(SHOTS, "0108-rebuke-unlit.png") });
            await realClick(page, rebuke);
            const why = page.locator(".gs-popup-why");
            await expect(why).toBeVisible({ timeout: 10_000 });
            await page.screenshot({ path: join(SHOTS, "0108-rebuke-not-now.png") });
            const text = ((await why.textContent()) ?? "").replace(/\s+/g, " ").trim();
            // No question comes of it: none in the next two seconds (a state that would persist).
            await page.waitForTimeout(2_000);
            const asked = await panel.locator('.gs-win[data-kind="chooseTargetsFor"]').count();
            st.notLit = { lit: isLit, why: text, asked };
            await page.keyboard.press("Escape");
            continue;
          }
          const ghoul = await onBoard(page, "opponent", /^Butcher Ghoul/).count();
          if (
            st.notLit &&
            !st.slayerCast &&
            ghoul > 0 &&
            (await lit(page, /^Slayer of the Wicked/).count()) > 0 &&
            (await untapped(page, /^Plains/)) >= 4
          ) {
            if (await realClick(page, lit(page, /^Slayer of the Wicked/))) st.slayerCast = true;
            continue;
          }
          const land = lit(page, /^Plains/);
          if ((await land.count()) > 0) pick = land;
        }
        if (!isHost && main && empty) {
          const order = [/^Forest/, /^Swamp/, /^Island/];
          for (const name of order) {
            if (
              (await onBoard(page, "viewer", name).count()) === 0 &&
              (await lit(page, name).count()) > 0
            ) {
              pick = lit(page, name);
              break;
            }
          }
          if (!pick && (await lit(page, /^(Island|Forest|Swamp)/).count()) > 0)
            pick = lit(page, /^Island/).or(lit(page, /^(Forest|Swamp)/));
          const has = async (name: RegExp) => (await onBoard(page, "viewer", name).count()) > 0;
          if (!pick && !st.bearsAttacked && !(await has(/^Grizzly Bears/)))
            pick = lit(page, /^Grizzly Bears/);
          if ((!pick || (await pick.count()) === 0) && !(await has(/^Butcher Ghoul/)))
            pick = lit(page, /^Butcher Ghoul/);
          if (
            (!pick || (await pick.count()) === 0) &&
            st.bearsDead &&
            !st.ravenCast &&
            (await has(/^Butcher Ghoul/))
          ) {
            pick = lit(page, /^Mist Raven/);
            if ((await pick.count()) > 0) st.ravenCast = true;
          }
          if ((!pick || (await pick.count()) === 0) && (await has(/^Mist Raven/)) && !st.forkCast) {
            pick = lit(page, /^Sharpened Pitchfork/);
            if ((await pick.count()) > 0) st.forkCast = true;
          }
          const fork = onBoard(page, "viewer", /^Sharpened Pitchfork/).and(
            page.locator('[data-choosable="true"]'),
          );
          if (
            (!pick || (await pick.count()) === 0) &&
            (await has(/^Mist Raven/)) &&
            (await page.locator('button.bf-tag[aria-label^="Sharpened Pitchfork"]').count()) ===
              0 &&
            (await fork.count()) > 0
          ) {
            st.equipping = true;
            await realClick(page, fork);
            // One ability (Equip) is the click; a menu, if any, offers it.
            const equip = page
              .locator(".gs-popup button, .gs-popup li")
              .filter({ hasText: /Equip/ });
            await expect(
              equip.or(matchPanel(page).locator('.gs-win[data-kind="chooseTargetsFor"]')).first(),
            )
              .toBeVisible({ timeout: 5_000 })
              .catch(() => undefined);
            const menu = await equip.count();
            if (menu > 0) await realClick(page, equip.first());
            console.log(`0108 equip: menu ${menu}`);
            await page.screenshot({ path: join(SHOTS, "0108-equip.png") });
            continue;
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick.first());
        else await clickNow(passButton(page));
      }
    }

    console.log(`0108 game 1: ${JSON.stringify(st)}`);
    // Step 1.
    expect(st.notLit, "the host's main phase came with Rebuke and three Plains").not.toBeNull();
    expect(st.notLit!.lit, "Rebuke is not lit with nothing attacking").toBe(false);
    expect(st.notLit!.why).toContain("Not now.");
    expect(st.notLit!.why).toContain(NO_TARGET);
    expect(st.notLit!.asked, "no question arrives").toBe(0);
    // Step 2.
    expect(st.bearsAttacked, "the guest really attacked with the Bears").toBe(true);
    expect(st.rebukeLit, "Rebuke lit with the Bears attacking").toBe(true);
    expect(st.bearsDead, "the Bears are in the guest's graveyard").toBe(true);
    // Step 3.
    expect(st.plates, "both pages showed Slayer's trigger on the stack").not.toBeNull();
    for (const said of [...st.plates!.host, ...st.plates!.guest]) {
      expect(said).not.toContain("Targeting");
      expect(said).not.toContain("[[");
    }
    expect(st.plates!.host.some((s) => s.endsWith(SLAYER_SAYS))).toBe(true);
    expect(st.plates!.guest.some((s) => s.endsWith(SLAYER_SAYS))).toBe(true);
    // Step 4.
    expect(st.tab, "the Raven with its Pitchfork was measured").not.toBeNull();
    expect(st.tab!.moved, "the Raven bobbed while it was measured").toBeGreaterThan(2);
    expect(st.tab!.u, "the tab keeps its place along the card").toBeLessThan(1);
    expect(st.tab!.v, "the tab keeps its place down the card").toBeLessThan(1);
    // Step 5.
    expect(st.damage, "the Raven's damage was dealt").not.toBeNull();
    const caps = [
      ...(st.damage!.host as { hidden: boolean; seen: boolean }[]),
      ...(st.damage!.guest as { hidden: boolean; seen: boolean }[]),
    ];
    expect(caps.length, "the caption is there for screen readers").toBeGreaterThan(0);
    expect(
      caps.every((c) => c.hidden && !c.seen),
      "no visible caption",
    ).toBe(true);
  } finally {
    // What each page showed last (for a failure's account; the cleanup leaves the lobby).
    await host.screenshot({ path: join(SHOTS, "0108-last-host.png") }).catch(() => undefined);
    await guest.screenshot({ path: join(SHOTS, "0108-last-guest.png") }).catch(() => undefined);
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});

test("the mill re-checked: Screeching Skaab's two and Thought Scour's two each stream once, the tiles counting one by one", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no small-fixes deck package (CI builds it)");
  mkdirSync(SHOTS, { recursive: true });
  const context = contexts(browser, `mill${SLOW === 1 ? "" : "-slow"}`);
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const islands = (n: number) => Array.from({ length: n }, () => "Island");

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [...islands(3), "Screeching Skaab", "Thought Scour", ...islands(2)],
          top: islands(8),
        },
        guest: { hand: ["Forest", "Swamp", ...islands(5)], top: islands(8) },
      },
    });
    if (SLOW !== 1)
      for (const page of [host, guest]) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Animation.enable");
        await cdp.send("Animation.setPlaybackRate", { playbackRate: SLOW });
      }
    // F-0108-I's frame count, on every page: each frame, the viewer's library
    // and graveyard tile numbers when they change, and every card stream that
    // starts (a leaving card's ghost with its turn: its back, then its face).
    for (const page of [host, guest])
      await page.evaluate(() => {
        type Row = {
          t: number;
          ghost?: string | undefined;
          turn?: string | undefined;
          what?: string;
          mine?: boolean;
          toHand?: boolean;
          lib?: number;
          grave?: number;
        };
        const w = window as unknown as { __mill: Row[] };
        w.__mill = [];
        const seen = new WeakSet<Element>();
        // The numbers a player sees, read from the tile's own run: spec 0074
        // holds each earlier number over the newest while it ticks, each shown
        // for its own stretch of one clock (graves.ts tileSpells/tileFrames).
        // Not "the digit most opaque in this frame": the digits' opacity is
        // played by the compositor, so a number can be on the screen while
        // this script misses its whole stretch (a CI runner's busy main
        // thread). CI run 44987413439's screencast drew the host's 68 for a
        // frame that no frame of this script saw ([69,67]). So each frame
        // lists every number the run has started since the last one, in
        // order, by the run's own clock; a run cancelled for a new one
        // (Board's carry-over) counts only what it showed, and a number the
        // page wrote over one still owed (fixes0074 F-0074-B) is read as it
        // is now -- a real skip still shows as one.
        type Spell = { n: number; start: number };
        type Run = { a: Animation; spells: Spell[]; at: number };
        const runs = new Map<string, Run>();
        const opacityRun = (el: Element) =>
          el
            .getAnimations()
            .find(
              (a) =>
                a.effect instanceof KeyframeEffect &&
                a.effect.getKeyframes().some((k) => "opacity" in k),
            );
        const passed = (tile: string): number[] => {
          const digits = [...document.querySelectorAll(`[data-zone-tile="${tile}"] .gs-zone-n`)];
          const newest = digits.find((el) => !el.classList.contains("gs-zone-was"));
          const own = newest ? opacityRun(newest) : undefined;
          const was = runs.get(tile);
          const out: number[] = [];
          if (was && was.a !== own) {
            // The last run ended between two frames: if it played to its end
            // (not cancelled), the numbers it still had to show were shown.
            if (was.a.playState === "finished")
              for (const s of was.spells) if (s.start > was.at) out.push(s.n);
            runs.delete(tile);
          }
          if (!newest) return out;
          if (!own) return [...out, Number(newest.textContent)];
          const spells = digits
            .flatMap((el) => {
              const a = opacityRun(el);
              if (!a?.effect) return [];
              const on = (a.effect as KeyframeEffect)
                .getKeyframes()
                .find((k) => Number(k.opacity) === 1);
              const length = Number(a.effect.getComputedTiming().duration);
              return [{ n: Number(el.textContent), start: (on?.computedOffset ?? 0) * length }];
            })
            .sort((x, y) => x.start - y.start);
          const at = Number(own.currentTime ?? 0);
          const from = was?.a === own ? was.at : -Infinity;
          for (const s of spells) if (s.start > from && s.start <= at) out.push(s.n);
          runs.set(tile, { a: own, spells, at });
          return out;
        };
        const shown = { lib: NaN, grave: NaN };
        let last = "";
        const frame = () => {
          const lib = passed("viewer:library");
          const grave = passed("viewer:graveyard");
          for (const [key, list] of [
            ["lib", lib],
            ["grave", grave],
          ] as const)
            for (const v of list) {
              shown[key] = v;
              const now = `${shown.lib}/${shown.grave}`;
              if (now !== last && !Number.isNaN(shown.lib) && !Number.isNaN(shown.grave))
                w.__mill.push({ t: performance.now(), lib: shown.lib, grave: shown.grave });
              last = now;
            }
          for (const el of document.querySelectorAll<HTMLElement>("[data-ghost-of][data-turn]")) {
            if (seen.has(el)) continue;
            seen.add(el);
            w.__mill.push({
              t: performance.now(),
              ghost: el.dataset.ghostOf,
              turn: el.dataset.turn,
              what: `${el.className} ${el.getAttribute("aria-label") ?? ""} ${el.textContent?.slice(0, 40) ?? ""}`,
              // Where it starts: on this player's half of the window (their own
              // library) or the other player's (a draw into their hand).
              mine:
                el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 >
                window.innerHeight / 2,
              // Spec 0123 -- a drawn card's back, flying from the Library tile
              // to this player's hand beside its face (it is in the hand now):
              // a draw, not a mill.
              toHand:
                document.querySelector(
                  `[data-zone="viewer:hand"][data-object-id="${el.dataset.ghostOf ?? ""}"]`,
                ) !== null,
            });
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    type Row = {
      t: number;
      ghost?: string | undefined;
      turn?: string | undefined;
      what?: string;
      mine?: boolean;
      toHand?: boolean;
      lib?: number;
      grave?: number;
    };
    const read = (page: Page) =>
      page.evaluate(() => (window as unknown as { __mill: Row[] }).__mill);
    const clock = (page: Page) => page.evaluate(() => performance.now());
    const turnNow = async (page: Page) =>
      Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0) || 0;

    const st = {
      skaab: false,
      scour: false,
      skaabDone: false,
      scourDone: false,
      /** The turn Screeching Skaab was cast on (Thought Scour waits for a later one). */
      skaabTurn: 0,
      before: {} as Record<string, number>,
      // Page clock (ms): each cast, and three seconds after each mill was seen through.
      at: {} as Record<string, number>,
      // The cards cast (their own flights are not milled cards).
      cast: [] as string[],
    };
    const deadline = Date.now() + 900_000;
    const watch = watchGame([host, guest], () => st);
    let settledAt = 0;
    while (!(st.skaabDone && st.scourDone && Date.now() > settledAt) && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        const close = page.locator(".gs-reveal .gs-reveal-close");
        if ((await close.count()) > 0) {
          await clickNow(close);
          continue;
        }
        if (isHost && st.skaab && !st.skaabDone && (await stackEmpty(host))) {
          if ((await tileN(host, "viewer:graveyard")) >= st.before["skaabGrave"]! + 2 + 0) {
            st.skaabDone = true;
            st.at["skaabDone"] = (await clock(host)) + 3_000 / SLOW;
            settledAt = Date.now() + 3_000 / SLOW;
          }
        }
        if (isHost && st.scour && !st.scourDone && (await stackEmpty(host))) {
          if ((await tileN(guest, "viewer:graveyard")) >= st.before["scourGrave"]! + 2) {
            st.scourDone = true;
            st.at["scourDone"] = (await clock(guest)) + 3_000 / SLOW;
            settledAt = Date.now() + 3_000 / SLOW;
          }
        }
        // Thought Scour's target: the guest (their life shield).
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        // The host's target question opening after this look is the next pass's.
        const scourShown = (await targeting.count()) > 0;
        const unread = isHost && !scourShown ? TARGETING : undefined;
        if (isHost && scourShown) {
          const theirLife = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          if ((await theirLife.count()) > 0) {
            await realClick(page, theirLife);
            continue;
          }
        }
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        if (
          (await page.locator(".gs-cast:not(.gs-cast-leaving)").count()) > 0 &&
          (await payOrAnswer(page, unread))
        )
          continue;
        if (!(await priorityHere(page))) {
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          if ((await listed.count()) > 0) await clickUnlessCombat(listed, unread);
          else if ((await main.count()) > 0) await clickUnlessCombat(main, unread);
          else await clickNow(passButton(page));
          continue;
        }
        const main = /Main/.test(await stepOf(page));
        let pick: Locator | null = null;
        if (isHost && main && (await stackEmpty(page))) {
          const lands = await untapped(page, /^Island/);
          if (!st.skaab && lands >= 3 && (await lit(page, /^Screeching Skaab/).count()) > 0) {
            st.before["skaabLib"] = await tileN(host, "viewer:library");
            st.before["skaabGrave"] = await tileN(host, "viewer:graveyard");
            st.at["skaab"] = await clock(host);
            st.skaabTurn = await turnNow(host);
            st.cast.push(
              (await lit(page, /^Screeching Skaab/)
                .first()
                .getAttribute("data-object-id")) ?? "",
            );
            if (await realClick(page, lit(page, /^Screeching Skaab/))) st.skaab = true;
            continue;
          }
          // On a later turn than the Skaab, as every run of this test cast it
          // until 2026-11-22: the bot's payment clicks used to tap a spare
          // Island on its own move (the look-then-act race), which left no
          // Island for Thought Scour that turn. With that fixed, Thought
          // Scour came the same turn -- before the guest's first draw -- and
          // the guest's page showed its mill as a jump, 69 -> 67 with no
          // card streaming (3 of 3 runs; reported for its own look, not
          // hidden here: this test checks the mill as it always ran).
          if (
            st.skaabDone &&
            !st.scour &&
            (await turnNow(host)) > st.skaabTurn &&
            lands >= 1 &&
            (await lit(page, /^Thought Scour/).count()) > 0
          ) {
            st.before["scourLib"] = await tileN(guest, "viewer:library");
            st.before["scourGrave"] = await tileN(guest, "viewer:graveyard");
            st.at["scour"] = await clock(guest);
            st.cast.push(
              (await lit(page, /^Thought Scour/)
                .first()
                .getAttribute("data-object-id")) ?? "",
            );
            if (await realClick(page, lit(page, /^Thought Scour/))) st.scour = true;
            continue;
          }
          const land = lit(page, /^Island/);
          if ((await land.count()) > 0) pick = land;
        }
        if (!isHost && main && (await stackEmpty(page))) {
          const land = lit(page, /^(Forest|Swamp|Island)/);
          if ((await land.count()) > 0) pick = land;
        }
        if (pick) await realClick(page, pick.first());
        else await clickNow(passButton(page));
      }
    }

    const hostLog = await read(host);
    const guestLog = await read(guest);
    console.log(`0108 mill: ${JSON.stringify({ st })}`);
    expect(st.skaabDone, "Screeching Skaab's mill was seen through").toBe(true);
    expect(st.scourDone, "Thought Scour's mill was seen through").toBe(true);
    // From the cast until three seconds after the mill (several passed steps).
    for (const [who, log, from, to] of [
      ["host (Skaab)", hostLog, st.at["skaab"]!, st.at["skaabDone"]!],
      ["guest (Thought Scour)", guestLog, st.at["scour"]!, st.at["scourDone"]!],
    ] as const) {
      const rows = log.filter((r) => r.t >= from && r.t <= to);
      const streams = new Map<string, string[]>();
      for (const r of rows)
        if (r.ghost && !st.cast.includes(r.ghost) && !r.toHand)
          streams.set(r.ghost, [...(streams.get(r.ghost) ?? []), r.turn ?? ""]);
      // The counts as the cast began (the last change before it), then each change.
      const before = log.filter((r) => r.lib !== undefined && r.t < from).at(-1);
      const counts = [...(before ? [before] : []), ...rows.filter((r) => r.lib !== undefined)].map(
        (r): [number, number] => [r.lib!, r.grave!],
      );
      console.log(
        `0108 mill ${who}: ${JSON.stringify({ streams: [...streams.entries()], counts, ghosts: rows.filter((r) => r.ghost) })}`,
      );
      // A milled card streams as its back (data-turn "back") turning into its
      // face (a ghost with no turn): one "back" per card. A card that shows a
      // face ghost with a turn is another move on the table (a land played
      // from a hand, its back turning face up), not a mill; nor is a card
      // drawn into this player's hand (spec 0123: its back flies from the
      // Library tile beside its face).
      const mineIds = new Set(rows.filter((r) => r.ghost && r.mine).map((r) => r.ghost!));
      const milled = [...streams].filter(
        ([id, turns]) => mineIds.has(id) && turns.every((x) => x === "back"),
      );
      expect(milled.length, `${who}: two cards streamed`).toBe(2);
      for (const [id, turns] of milled)
        expect(turns.length, `${who}: ${id} streamed once, no repeat`).toBe(1);
      // Frame by frame: the library down by one per card, the graveyard up by one.
      const steps = counts.slice(1).map(([l, g], i) => [l - counts[i]![0], g - counts[i]![1]]);
      expect(
        steps.every(([dl, dg]) => (dl === 0 || dl === -1) && (dg === 0 || dg === 1)),
        `${who}: one card at a time: ${JSON.stringify(counts)}`,
      ).toBe(true);
      const total = [counts.at(-1)![0] - counts[0]![0], counts.at(-1)![1] - counts[0]![1]];
      // Two into the graveyard; the library down at least two (the window runs
      // three seconds past the mill, and a draw there counts too: one by one,
      // checked above). A stream repeated would add a third "back" (above) and a
      // graveyard count past two.
      expect(total[1], `${who}: two cards in all`).toBe(2);
      expect(total[0], `${who}: at least the two milled`).toBeLessThanOrEqual(-2);
    }
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
