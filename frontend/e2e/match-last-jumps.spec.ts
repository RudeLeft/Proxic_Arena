// The last two jumps, in a real game -- spec 0099 (F-0099-G), AGENTS TEST-012.
//
// Q1: the host cracks Evolving Wilds and, while it searches the library,
// really clicks "Yes" to casting Panglacial Wurm from it. On the host's own
// page the casting card sets off from the host's Library tile (it used to
// fade in in the middle of the table), and the Wurm reaches the stack.
//
// Q2: the guest casts Agent of Kotis, then Village Rites, and really clicks
// the Agent to sacrifice it. On both pages, every frame: no Agent is drawn
// in the graveyard fan (and nothing faint on the tile) while the leaving
// Agent is still on its way; the fan Agent is there afterwards; and the
// Graveyard number stays as it was until the Agent has landed (Q2c).
//
// Dealt (spec 0098), so both moments come on the first game. The deck is
// protocol/fixtures/last-jumps-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/last-jumps-deck.zip" protocol/fixtures/last-jumps-deck

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

const pkg = join(process.cwd(), "..", "Test Deck", "last-jumps-deck.zip");
const WURM = "Panglacial Wurm";

type Cast = { label: string; x: number; y: number; lib: { x: number; y: number; w: number } };
type Sample = { t: number; ghost: number; fan: number; tiles: string[][] };

/**
 * On every frame from now: where each new casting card is first drawn (and
 * where this page's Library tile is), and -- once `__agent` names a card --
 * how strongly its leaving ghost and its fan card are drawn, and what each
 * Graveyard tile shows.
 */
async function recorder(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __casts: Cast[];
      __samples: Sample[];
      __agent: string | null;
      __since: number;
    };
    type Cast = { label: string; x: number; y: number; lib: { x: number; y: number; w: number } };
    type Sample = { t: number; ghost: number; fan: number; tiles: string[][] };
    w.__casts = [];
    w.__samples = [];
    w.__agent = null;
    const seen = new WeakSet<Element>();
    /** How strongly it is drawn: its opacity and every ancestor's. */
    const drawn = (el: Element | null) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement)
        o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const tick = () => {
      const cast = document.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
      if (cast && !seen.has(cast)) {
        seen.add(cast);
        const r = cast.getBoundingClientRect();
        const lib = document
          .querySelector('[data-zone-tile="viewer:library"]')
          ?.getBoundingClientRect();
        w.__casts.push({
          label: cast.getAttribute("aria-label") ?? "",
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          lib: lib
            ? { x: lib.x + lib.width / 2, y: lib.y + lib.height / 2, w: lib.width }
            : { x: NaN, y: NaN, w: 0 },
        });
      }
      const id = w.__agent;
      if (id) {
        const ghosts = [...document.querySelectorAll(`[data-ghost-of="${id}"]`)];
        const fan = document.querySelector(`[data-fan-card="${id}"]`);
        w.__samples.push({
          t: performance.now() - w.__since,
          ghost: Math.max(0, ...ghosts.map(drawn)),
          fan: fan ? drawn(fan) : 0,
          tiles: ["viewer:graveyard", "opponent:graveyard"].map((tile) =>
            [...document.querySelectorAll(`[data-zone-tile="${tile}"] .gs-zone-n`)]
              .filter((n) => drawn(n) > 0.5)
              .map((n) => n.textContent ?? ""),
          ),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const castsOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __casts: Cast[] }).__casts);
const samplesOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
const watchAgent = (page: Page, id: string) =>
  page.evaluate((card) => {
    const w = window as unknown as { __agent: string | null; __since: number };
    w.__agent = card;
    w.__since = performance.now();
  }, id);

/** A real mouse click on the middle of an element (through a see-through casting card). */
async function realClick(page: Page, target: Locator) {
  const box = await target
    .first()
    .boundingBox({ timeout: 2_000 })
    .catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.waitForTimeout(150);
  await page.mouse.click(x, y);
  return true;
}

/** The last frame the leaving Agent was drawn (-1: never). */
function lastGhostAt(samples: Sample[]) {
  for (let i = samples.length - 1; i >= 0; i--) if (samples[i]!.ghost > 0.15) return i;
  return -1;
}

/** Q2's frames on one page are over: the Agent left, its ghost has gone, its fan card is in full view. */
function q2Over(samples: Sample[]) {
  const left = samples.findIndex((s) => s.ghost > 0.15);
  if (left < 0) return false;
  const lastGhost = lastGhostAt(samples);
  const after = samples.slice(lastGhost + 1);
  return (
    after.some((s) => s.fan > 0.9) &&
    after.length > 0 &&
    after.at(-1)!.t - samples[lastGhost]!.t > 1500
  );
}

/** Q2's look on one page, from its frames (F-0099-C, E). */
function checkQ2(name: string, samples: Sample[], tile: 0 | 1) {
  const firstGhost = samples.findIndex((s) => s.ghost > 0.15);
  const lastGhost = lastGhostAt(samples);
  expect(firstGhost, `${name}: the leaving Agent was drawn`).toBeGreaterThanOrEqual(0);
  const flight = samples.slice(0, lastGhost + 1);
  const faint = flight.filter((s) => s.fan >= 0.15);
  console.log(
    `${name}: ${samples.length} frames; ghost ${samples[firstGhost]!.t.toFixed(0)}-${samples[lastGhost]!.t.toFixed(0)} ms; ` +
      `fan drawn while it flew: ${faint.length}; first full fan at ${samples.find((s) => s.fan > 0.9)?.t.toFixed(0)} ms; ` +
      `tile ${JSON.stringify([...new Set(samples.map((s) => s.tiles[tile]!.join("/")))])}`,
  );
  // Each change of what the tile shows, with when (the evidence for Q2c).
  const steps: string[] = [];
  samples.forEach((s, i) => {
    const now = s.tiles[tile]!.join("/");
    if (i === 0 || now !== samples[i - 1]!.tiles[tile]!.join("/"))
      steps.push(`${s.t.toFixed(0)} ms: "${now}"`);
  });
  console.log(`${name}: Graveyard tile ${steps.join(", ")}`);
  expect(faint.length, `${name}: no Agent drawn in the fan while it is still on its way`).toBe(0);
  expect(
    samples.slice(lastGhost + 1).some((s) => s.fan > 0.9),
    `${name}: the fan Agent is there afterwards`,
  ).toBe(true);
  // Q2c: the number it showed before the Agent left, held until the Agent lands.
  const start = samples[0]!.tiles[tile]!;
  expect(start, `${name}: one number on the Graveyard tile`).toHaveLength(1);
  const n0 = Number(start[0]);
  // A frame of grace at each end (the two runs swap on the same frame).
  const held = samples.filter(
    (s) => s.t < samples[lastGhost]!.t - 50 && s.tiles[tile]!.length === 1,
  );
  for (const s of held)
    expect(Number(s.tiles[tile]![0]), `${name}: the number at ${s.t.toFixed(0)} ms`).toBe(n0);
  const later = samples.filter((s) => s.t > samples[lastGhost]!.t + 300);
  expect(
    later.some((s) => Number(s.tiles[tile]![0]) >= n0 + 1),
    `${name}: the number counts the Agent once it has landed`,
  ).toBe(true);
  return n0;
}

test("a card cast out of your library rises from your Library tile; a sacrificed Agent reaches the fan before it shows there", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no last-jumps deck package (CI builds it)");
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
        // Elves for mana, so seven is there by the fifth turn: then the Wilds.
        host: {
          hand: [
            "Forest",
            "Llanowar Elves",
            "Llanowar Elves",
            "Llanowar Elves",
            "Forest",
            "Forest",
            "Evolving Wilds",
          ],
          top: ["Forest", "Forest", "Forest", "Forest", "Forest"],
        },
        guest: {
          hand: ["Island", "Swamp", "Agent of Kotis", "Village Rites", "Island", "Swamp", "Island"],
          top: ["Swamp", "Island", "Swamp", "Island", "Swamp"],
        },
      },
    });
    await recorder(host);
    await recorder(guest);

    let wurmCast = false;
    let q1 = false;
    let agentId: string | null = null;
    let q2 = false;
    let elvesTurn = Infinity;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({ wurmCast, q1, agentId, q2 }));
    while (!(q1 && q2) && Date.now() < deadline) {
      await watch.check();
      if (agentId && !q2) {
        q2 = q2Over(await samplesOf(host)) && q2Over(await samplesOf(guest));
      }
      if (wurmCast && !q1) {
        q1 =
          (await host
            .locator(".bf-cards button[data-object-id]")
            .filter({ hasText: WURM })
            .count()) > 0;
      }
      for (const page of [host, guest]) {
        const isHost = page === host;
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        const turn = Number((await page.locator(".gs-turn-value").allTextContents())[0]) || 0;

        // Q1 -- the offer, in the middle of the search: a real click on Yes.
        const offer = panel
          .locator(".gs-win")
          .filter({ hasText: WURM })
          .getByRole("button", { name: /^Yes/ });
        if (isHost && !wurmCast && (await offer.count()) > 0) {
          await realClick(page, offer);
          wurmCast = true;
          continue;
        }
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        if ((await cast.count()) > 0) {
          // Never wait for it: it can go between the count and the read.
          const label = await cast.evaluateAll((els) => els[0]?.getAttribute("aria-label") ?? "");
          const choosable = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          // Q2 -- Village Rites' cost: a real click on the Agent.
          const agent = choosable.filter({ hasText: /^Agent of Kotis/ });
          if (!isHost && /Village Rites/.test(label) && !agentId && (await agent.count()) > 0) {
            agentId = await agent.evaluateAll(
              (els) => els[0]?.getAttribute("data-object-id") ?? null,
            );
            if (!agentId) continue;
            await watchAgent(host, agentId);
            await watchAgent(guest, agentId);
            await realClick(page, agent);
            continue;
          }
          if ((await choosable.count()) > 0) await clickNow(choosable);
          else await clickNow(panel.locator(".gs-win li button, .gs-question li button"));
          continue;
        }
        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          const board = page.locator('.bf-cards button[data-choosable="true"]');
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const mine = boardCards(page, "viewer");
        let pick: Locator | null = null;
        if (isHost && !wurmCast) {
          const forests = await cardCount(mine.filter({ hasText: /^Forest/ }));
          const elves = await cardCount(mine.filter({ hasText: /^Llanowar Elves/ }));
          if (elves >= 3 && elvesTurn === Infinity) elvesTurn = turn;
          const wilds = mine.filter({ hasText: /^Evolving Wilds/ });
          const ready = forests >= 4 && elves >= 3 && turn > elvesTurn;
          if (ready && (await wilds.count()) > 0) pick = wilds;
          else if (elves < 3 && (await hand.filter({ hasText: /^Llanowar Elves/ }).count()) > 0)
            pick = hand.filter({ hasText: /^Llanowar Elves/ });
          else if (forests < 4 && (await hand.filter({ hasText: /^Forest/ }).count()) > 0)
            pick = hand.filter({ hasText: /^Forest/ });
          else if (ready && (await hand.filter({ hasText: /^Evolving Wilds/ }).count()) > 0)
            pick = hand.filter({ hasText: /^Evolving Wilds/ });
        } else if (!isHost && !agentId) {
          const onTable = (await mine.filter({ hasText: /^Agent of Kotis/ }).count()) > 0;
          const lands = await cardCount(mine.filter({ hasText: /^(Island|Swamp)/ }));
          const islands = await cardCount(mine.filter({ hasText: /^Island/ }));
          if (
            onTable &&
            lands >= 3 &&
            (await hand.filter({ hasText: /^Village Rites/ }).count()) > 0
          )
            pick = hand.filter({ hasText: /^Village Rites/ });
          else if (
            !onTable &&
            lands >= 2 &&
            (await hand.filter({ hasText: /^Agent of Kotis/ }).count()) > 0
          )
            pick = hand.filter({ hasText: /^Agent of Kotis/ });
          else {
            const land = hand.filter({ hasText: islands === 0 ? /^Island/ : /^(Swamp|Island)/ });
            if ((await land.count()) > 0) pick = land;
          }
        }
        if (pick) await clickNow(pick);
        else
          await clickNow(
            panel.locator(
              "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
            ),
          );
      }
      await host.waitForTimeout(120);
    }
    expect(wurmCast, "the host was offered the Wurm in the search and said Yes").toBe(true);
    expect(q1, "the Wurm reached the stack (or the table)").toBe(true);
    expect(q2, "the Agent was sacrificed and reached the fan on both pages").toBe(true);

    // F-0099-A -- on the caster's page, the Wurm set off from the Library tile.
    const wurm = (await castsOf(host)).find((c) => c.label === `Being cast: ${WURM}`);
    expect(wurm, "the host's page drew the Wurm being cast").toBeTruthy();
    const fromTile = Math.hypot(wurm!.x - wurm!.lib.x, wurm!.y - wurm!.lib.y);
    const fromMiddle = Math.hypot(wurm!.x - viewport.width / 2, wurm!.y - viewport.height / 2);
    console.log(
      `host's Wurm first drawn at (${wurm!.x.toFixed(0)}, ${wurm!.y.toFixed(0)}): ` +
        `${fromTile.toFixed(0)} px from the Library tile, ${fromMiddle.toFixed(0)} px from the middle`,
    );
    expect(fromTile, "first drawn over the host's Library tile").toBeLessThan(
      Math.max(120, wurm!.lib.w * 1.5),
    );
    expect(fromMiddle, "not in the middle of the table").toBeGreaterThan(300);
    const theirs = (await castsOf(guest)).find((c) => c.label.includes(WURM));
    if (theirs)
      console.log(
        `guest's view of the Wurm first drawn at (${theirs.x.toFixed(0)}, ${theirs.y.toFixed(0)})`,
      );

    // F-0099-C, E -- the Agent, on both pages.
    const n0 = checkQ2("guest (the caster)", await samplesOf(guest), 0);
    checkQ2("host (the other player)", await samplesOf(host), 1);
    expect(n0, "the guest's Graveyard read 0 before the Agent").toBe(0);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
