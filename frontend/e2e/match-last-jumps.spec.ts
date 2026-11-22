// The last two jumps, in a real game -- spec 0099 (F-0099-G, F-0099-M), AGENTS TEST-012.
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
// Q3 (Amendment 1): Village Rites' own card counts as it lands too -- the
// Graveyard number never shows 1 before the Agent has landed, never 2 before
// Village Rites has, and then shows 2 (it used to go 0 -> 2 as the Agent
// landed). Then the guest casts Think Twice and really clicks it in the
// graveyard fan for flashback: its card flies to the guest's Exile tile (it
// used to fly to the Graveyard tile), and the Exile number turns only then.
//
// Dealt (spec 0098), so every moment comes on the first game. The deck is
// protocol/fixtures/last-jumps-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/last-jumps-deck-2.zip" protocol/fixtures/last-jumps-deck

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
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "last-jumps-deck-2.zip");
const WURM = "Panglacial Wurm";

type Cast = { label: string; x: number; y: number; lib: { x: number; y: number; w: number } };
type Sample = { t: number; ghost: number; fan: number; spell: number; tiles: string[][] };
type Point = { x: number; y: number; w: number };
type Flash = {
  t: number;
  ghost: number;
  x: number;
  y: number;
  exile: string[][];
  at: { exile: Point[]; grave: Point[] };
};

/**
 * On every frame from now: where each new casting card is first drawn (and
 * where this page's Library tile is), and -- once `__agent` names a card --
 * how strongly its leaving ghost, its fan card and Village Rites' ghost are
 * drawn, and what each Graveyard tile shows; once `__flash` is set, Think
 * Twice's flashback ghost (where, how strongly) and each Exile tile.
 */
async function recorder(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __casts: Cast[];
      __samples: Sample[];
      __agent: string | null;
      __since: number;
      __rites: string | null;
      __flash: number | null;
      __flashId: string | null;
      __flashes: Flash[];
      __flashSkip?: string[];
    };
    type Cast = { label: string; x: number; y: number; lib: { x: number; y: number; w: number } };
    type Sample = { t: number; ghost: number; fan: number; spell: number; tiles: string[][] };
    type Point = { x: number; y: number; w: number };
    type Flash = {
      t: number;
      ghost: number;
      x: number;
      y: number;
      exile: string[][];
      at: { exile: Point[]; grave: Point[] };
    };
    w.__casts = [];
    w.__samples = [];
    w.__agent = null;
    w.__rites = null;
    w.__flash = null;
    w.__flashId = null;
    w.__flashes = [];
    const seen = new WeakSet<Element>();
    /** How strongly it is drawn: its opacity and every ancestor's. */
    const drawn = (el: Element | null) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement)
        o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const numbers = (tile: string) =>
      [...document.querySelectorAll(`[data-zone-tile="${tile}"] .gs-zone-n`)]
        .filter((n) => drawn(n) > 0.5)
        .map((n) => n.textContent ?? "");
    const centre = (tile: string): Point => {
      const r = document.querySelector(`[data-zone-tile="${tile}"]`)?.getBoundingClientRect();
      return r
        ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }
        : { x: NaN, y: NaN, w: 0 };
    };
    /** The stack id of the newest stack card whose name starts so. */
    const stackId = (name: string) =>
      [...document.querySelectorAll(`[data-zone="stack"][aria-label^="${name}"]`)]
        .at(-1)
        ?.getAttribute("data-object-id") ?? null;
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
        w.__rites ??= stackId("Village Rites");
        const ghosts = [...document.querySelectorAll(`[data-ghost-of="${id}"]`)];
        const fan = document.querySelector(`[data-fan-card="${id}"]`);
        const spell = w.__rites
          ? [...document.querySelectorAll(`[data-ghost-of="${w.__rites}"]`)]
          : [];
        w.__samples.push({
          t: performance.now() - w.__since,
          ghost: Math.max(0, ...ghosts.map(drawn)),
          fan: fan ? drawn(fan) : 0,
          spell: Math.max(0, ...spell.map(drawn)),
          tiles: ["viewer:graveyard", "opponent:graveyard"].map(numbers),
        });
      }
      if (w.__flash !== null) {
        const id = stackId("Think Twice");
        if (!w.__flashId && id && !(w.__flashSkip ?? []).includes(id)) w.__flashId = id;
        const ghost = w.__flashId
          ? document.querySelector(`[data-ghost-of="${w.__flashId}"]`)
          : null;
        const r = ghost?.getBoundingClientRect();
        w.__flashes.push({
          t: performance.now() - w.__flash,
          ghost: ghost ? drawn(ghost) : 0,
          x: r ? r.x + r.width / 2 : NaN,
          y: r ? r.y + r.height / 2 : NaN,
          exile: ["viewer:exile", "opponent:exile"].map(numbers),
          at: {
            exile: ["viewer:exile", "opponent:exile"].map(centre),
            grave: ["viewer:graveyard", "opponent:graveyard"].map(centre),
          },
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
const flashesOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __flashes: Flash[] }).__flashes);
const watchAgent = (page: Page, id: string) =>
  page.evaluate((card) => {
    const w = window as unknown as { __agent: string | null; __since: number };
    w.__agent = card;
    w.__since = performance.now();
  }, id);
const watchFlash = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __flash: number;
      __flashId: null;
      __flashes: unknown[];
      __flashSkip: string[];
    };
    w.__flash = performance.now();
    w.__flashId = null;
    w.__flashes = [];
    // Any Think Twice already on the stack is not the one about to be cast.
    w.__flashSkip = [...document.querySelectorAll('[data-zone="stack"][data-object-id]')].map(
      (e) => e.getAttribute("data-object-id") ?? "",
    );
  });
const flashIdOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __flashId: string | null }).__flashId);
const nameFlash = (page: Page, id: string) =>
  page.evaluate((stack) => {
    (window as unknown as { __flashId: string | null }).__flashId = stack;
  }, id);
/** What each page's flashback recording holds so far (for the stuck-game message). */
const flashSeen = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __flashId: string | null; __flashes: Flash[] };
    return `${w.__flashId ?? "-"}/${w.__flashes.length}/${w.__flashes.filter((f) => f.ghost > 0.15).length}`;
  });

// realClick: match-helpers.ts (P11-B7). Its point is confirmed with
// elementFromPoint; the casting card is pointer-events: none, so a card under
// it is still hit through it.

/** The last frame `key` was drawn (-1: never). */
function lastDrawn<T extends { ghost: number }>(
  samples: T[],
  key: (s: T) => number = (s) => s.ghost,
) {
  for (let i = samples.length - 1; i >= 0; i--) if (key(samples[i]!) > 0.15) return i;
  return -1;
}
const lastGhostAt = (samples: Sample[]) => lastDrawn(samples);
const lastSpellAt = (samples: Sample[]) => lastDrawn(samples, (s) => s.spell);

/** Q2's frames on one page are over: the Agent and Village Rites left, their ghosts have gone, the fan card is in full view. */
function q2Over(samples: Sample[]) {
  const left = samples.findIndex((s) => s.ghost > 0.15);
  const resolved = samples.findIndex((s) => s.spell > 0.15);
  if (left < 0 || resolved < 0) return false;
  const lastGhost = lastGhostAt(samples);
  const lastSpell = lastSpellAt(samples);
  const after = samples.slice(Math.max(lastGhost, lastSpell) + 1);
  return (
    after.some((s) => s.fan > 0.9) &&
    after.length > 0 &&
    after.at(-1)!.t - samples[Math.max(lastGhost, lastSpell)]!.t > 1500
  );
}

/** Q3's frames on one page are over: the flashback ghost flew and has gone. */
function q3Over(flashes: Flash[]) {
  const last = lastDrawn(flashes);
  return last >= 0 && flashes.at(-1)!.t - flashes[last]!.t > 1500;
}

/** Q2's look on one page, from its frames (F-0099-C, E, and Amendment 1's F-0099-M). */
function checkQ2(name: string, samples: Sample[], tile: 0 | 1) {
  const firstGhost = samples.findIndex((s) => s.ghost > 0.15);
  const lastGhost = lastGhostAt(samples);
  const firstSpell = samples.findIndex((s) => s.spell > 0.15);
  const lastSpell = lastSpellAt(samples);
  expect(firstGhost, `${name}: the leaving Agent was drawn`).toBeGreaterThanOrEqual(0);
  expect(
    firstSpell,
    `${name}: Village Rites' card was drawn leaving the stack`,
  ).toBeGreaterThanOrEqual(0);
  const flight = samples.slice(0, lastGhost + 1);
  const faint = flight.filter((s) => s.fan >= 0.15);
  console.log(
    `${name}: ${samples.length} frames; ghost ${samples[firstGhost]!.t.toFixed(0)}-${samples[lastGhost]!.t.toFixed(0)} ms; ` +
      `Village Rites ${samples[firstSpell]!.t.toFixed(0)}-${samples[lastSpell]!.t.toFixed(0)} ms; ` +
      `fan drawn while it flew: ${faint.length}; first full fan at ${samples.find((s) => s.fan > 0.9)?.t.toFixed(0)} ms; ` +
      `tile ${JSON.stringify([...new Set(samples.map((s) => s.tiles[tile]!.join("/")))])}`,
  );
  // Each change of what the tile shows, with when (the evidence for Q2c and Q3).
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
  const one = (s: Sample) => s.tiles[tile]!.length === 1;
  const held = samples.filter((s) => s.t < samples[lastGhost]!.t - 50 && one(s));
  for (const s of held)
    expect(Number(s.tiles[tile]![0]), `${name}: the number at ${s.t.toFixed(0)} ms`).toBe(n0);
  // Q3: never 2 before Village Rites' card has gone (its ghost drawn last).
  const beforeSpell = samples.filter((s) => s.t < samples[lastSpell]!.t - 50 && one(s));
  for (const s of beforeSpell)
    expect(
      Number(s.tiles[tile]![0]),
      `${name}: the number at ${s.t.toFixed(0)} ms, Village Rites still on its way`,
    ).toBeLessThanOrEqual(n0 + 1);
  const later = samples.filter((s) => s.t > samples[lastGhost]!.t + 300);
  expect(
    later.some((s) => Number(s.tiles[tile]![0]) >= n0 + 1),
    `${name}: the number counts the Agent once it has landed`,
  ).toBe(true);
  // ... and it ends at 2: both cards counted, once each.
  const both = Math.max(samples[lastGhost]!.t, samples[lastSpell]!.t);
  const settled = samples.filter((s) => s.t > both + 300 && s.t < both + 1500 && one(s));
  expect(settled.length, `${name}: frames after both landed`).toBeGreaterThan(0);
  for (const s of settled)
    expect(Number(s.tiles[tile]![0]), `${name}: the number at ${s.t.toFixed(0)} ms`).toBe(n0 + 2);
  return n0;
}

/** Q3's flashback on one page: the card flew to the guest's Exile tile; that number waited for it. */
function checkFlash(name: string, flashes: Flash[], tile: 0 | 1) {
  const last = lastDrawn(flashes);
  expect(last, `${name}: Think Twice's card was drawn leaving the stack`).toBeGreaterThanOrEqual(0);
  // Where it was last drawn (fading as it reaches the tile).
  let end = last;
  for (let i = last; i < flashes.length && flashes[i]!.ghost > 0.02; i++) end = i;
  const f = flashes[end]!;
  const exile = f.at.exile[tile]!;
  const grave = f.at.grave[tile]!;
  const toExile = Math.hypot(f.x - exile.x, f.y - exile.y);
  const toGrave = Math.hypot(f.x - grave.x, f.y - grave.y);
  const steps: string[] = [];
  flashes.forEach((s, i) => {
    const now = s.exile[tile]!.join("/");
    if (i === 0 || now !== flashes[i - 1]!.exile[tile]!.join("/"))
      steps.push(`${s.t.toFixed(0)} ms: "${now}"`);
  });
  const path = flashes.filter((s) => s.ghost > 0.02);
  console.log(
    `${name}: flashback ghost path ` +
      path
        .filter((_, i) => i % 4 === 0 || i === path.length - 1)
        .map((s) => `${s.t.toFixed(0)}:(${s.x.toFixed(0)},${s.y.toFixed(0)})@${s.ghost.toFixed(2)}`)
        .join(" "),
  );
  console.log(
    `${name}: flashback ghost last drawn at ${f.t.toFixed(0)} ms, (${f.x.toFixed(0)}, ${f.y.toFixed(0)}): ` +
      `${toExile.toFixed(0)} px from the Exile tile, ${toGrave.toFixed(0)} px from the Graveyard tile; ` +
      `Exile tile ${steps.join(", ")}`,
  );
  expect(toExile, `${name}: it ends over the Exile tile`).toBeLessThan(Math.max(40, exile.w));
  expect(toExile, `${name}: nearer the Exile tile than the Graveyard tile`).toBeLessThan(toGrave);
  const first = flashes.find((s) => s.exile[tile]!.length === 1)!;
  const n0 = Number(first.exile[tile]![0]);
  for (const s of flashes.filter((s) => s.t < flashes[last]!.t - 50 && s.exile[tile]!.length === 1))
    expect(Number(s.exile[tile]![0]), `${name}: the Exile number at ${s.t.toFixed(0)} ms`).toBe(n0);
  expect(
    flashes.some((s) => s.t > flashes[last]!.t + 300 && Number(s.exile[tile]![0]) === n0 + 1),
    `${name}: the Exile number counts it once it has landed`,
  ).toBe(true);
}

test("a card cast out of your library rises from your Library tile; a sacrificed Agent reaches the fan before it shows there; spells count as they land", async ({
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
          hand: [
            "Island",
            "Swamp",
            "Agent of Kotis",
            "Village Rites",
            "Island",
            "Swamp",
            "Think Twice",
          ],
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
    let clicks = 0;
    let flashed = false;
    let q3 = false;
    let elvesTurn = Infinity;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], async () => ({
      wurmCast,
      q1,
      agentId,
      q2,
      clicks,
      flashed,
      q3,
      ...(clicks > 0
        ? {
            flash: [
              await flashSeen(host).catch(() => "?"),
              await flashSeen(guest).catch(() => "?"),
            ],
          }
        : {}),
    }));
    // Think Twice: in the guest's hand, then in its graveyard fan.
    const thinkInHand = guest
      .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
      .filter({ hasText: /^Think Twice/ });
    const thinkAnyInFan = matchPanel(guest)
      .locator('.bf-fan-card[data-fan-side="viewer"] button[data-zone="viewer:graveyard"]')
      .filter({ hasText: "Think Twice" });
    const thinkInFan = thinkAnyInFan.and(
      guest.locator('[data-choosable="true"]:not([data-unpayable="true"])'),
    );
    while (!(q1 && q2 && q3) && Date.now() < deadline) {
      await watch.check();
      if (agentId && !q2) {
        q2 = q2Over(await samplesOf(host)) && q2Over(await samplesOf(guest));
      }
      // The click cast it: Think Twice is on the stack again. The caster's
      // own page can draw it there only as its casting card landing (spec
      // 0091), so the other page names its stack id for both.
      if (clicks > 0 && !flashed) {
        const ids = await Promise.all([host, guest].map(flashIdOf));
        const id = ids.find((x) => x !== null) ?? null;
        if (id) {
          for (const page of [host, guest]) await nameFlash(page, id);
          flashed = true;
        }
      }
      if (flashed && !q3) {
        q3 = q3Over(await flashesOf(host)) && q3Over(await flashesOf(guest));
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
          if ((await choosable.count()) > 0) await clickUnlessCombat(choosable);
          else await clickUnlessCombat(panel.locator(".gs-win li button, .gs-question li button"));
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
          // Never the Wurm's offer while Q1 waits for it: it can open between
          // Q1's look above and these clicks, and a generic Yes here is not
          // Q1's real click (nor is a No).
          const offered = isHost && !wurmCast ? { css: ".gs-win", words: WURM } : undefined;
          if ((await listed.count()) > 0) await clickUnlessCombat(listed, undefined, offered);
          else if ((await main.count()) > 0) await clickUnlessCombat(main, undefined, offered);
          else if ((await board.count()) > 0) await clickUnlessCombat(board, undefined, offered);
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
        } else if (!isHost && q2 && !flashed) {
          // Q3 -- once Village Rites' moment is over: Think Twice from the hand,
          // then a real click on it in the graveyard fan (flashback).
          // (Again if a click did not cast it: the fan card still castable.)
          const stackEmpty = (await panel.locator('[data-zone="stack"]').count()) === 0;
          if (stackEmpty && (await thinkInFan.count()) > 0) {
            await watchFlash(host);
            await watchFlash(guest);
            await realClick(page, thinkInFan);
            clicks += 1;
            continue;
          }
          const land = hand.filter({ hasText: /^(Island|Swamp)/ });
          if ((await land.count()) > 0) pick = land;
          // One Think Twice from the hand, only until one stands in the fan.
          else if ((await thinkAnyInFan.count()) === 0 && (await thinkInHand.count()) > 0)
            pick = thinkInHand;
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
    expect(flashed, "the guest clicked Think Twice in its graveyard fan and cast it").toBe(true);
    console.log(`flashback: ${clicks} click(s) on the fan card`);
    expect(q3, "Think Twice's flashback resolved and its card flew on both pages").toBe(true);

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

    // F-0099-C, E, M -- the Agent and Village Rites, on both pages.
    const n0 = checkQ2("guest (the caster)", await samplesOf(guest), 0);
    checkQ2("host (the other player)", await samplesOf(host), 1);
    expect(n0, "the guest's Graveyard read 0 before the Agent").toBe(0);

    // F-0099-J, M -- Think Twice's flashback, on both pages: to the guest's Exile tile.
    console.log(
      `flashback stack id: host ${await flashIdOf(host)}, guest ${await flashIdOf(guest)}`,
    );
    checkFlash("guest (the caster)", await flashesOf(guest), 0);
    checkFlash("host (the other player)", await flashesOf(host), 1);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
