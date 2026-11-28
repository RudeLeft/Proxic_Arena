// A drawn card comes off the Library tile, in a real game -- spec 0123
// (F-0123-G, P11-A2, owner 2026-11-27: "As it leaves"), AGENTS TEST-012.
//
// The guest plays its lands, casts Agent of Kotis, then Village Rites, and
// really clicks the Agent to sacrifice it: Village Rites draws two. Every
// turn's draw happens too, from the players' own passes. On both pages,
// every frame:
//   - each card new to a hand (the drawer's own card; the other page's new
//     card back) is first drawn over its owner's Library tile (it used to
//     fade in at the stack's spot, mid-table);
//   - the Library number does not drop before the card has left the tile:
//     after Village Rites' board arrives, the guest's Library still reads
//     what it read until the first card lifts, then one less, then one less
//     again as the second lifts.
//
// Dealt (spec 0098), so the moment comes on the first game. The deck is
// protocol/fixtures/last-jumps-deck (CI builds it; locally:
//   node scripts/make-ci-deck.mjs "Test Deck/last-jumps-deck-2.zip" protocol/fixtures/last-jumps-deck).

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

type Point = { x: number; y: number; w: number };
/**
 * A card new to a hand: when it was made, when first seen, the frame just
 * before that (still unseen, and how faintly drawn), where, and each Library
 * tile then.
 */
type Newcomer = {
  id: string;
  side: "viewer" | "opponent";
  made: number;
  seen: number;
  unseen: number;
  faint: number;
  x: number;
  y: number;
  lib: Record<"viewer" | "opponent", Point>;
  turn: number;
};
/** One change of what a Library tile shows. */
type Step = { t: number; side: "viewer" | "opponent"; shows: string };

/** On every frame from now: each card new to a hand, and each Library tile's number as it changes. */
async function recorder(page: Page) {
  await page.evaluate(() => {
    type Point = { x: number; y: number; w: number };
    type Newcomer = {
      id: string;
      side: "viewer" | "opponent";
      made: number;
      seen: number;
      unseen: number;
      faint: number;
      x: number;
      y: number;
      lib: Record<"viewer" | "opponent", Point>;
      turn: number;
    };
    type Step = { t: number; side: "viewer" | "opponent"; shows: string };
    const w = window as unknown as { __new: Newcomer[]; __steps: Step[] };
    w.__new = [];
    w.__steps = [];
    const known = new WeakSet<Element>();
    const waiting = new Map<
      Element,
      { id: string; side: "viewer" | "opponent"; made: number; unseen: number; faint: number }
    >();
    const last: Record<string, string> = {};
    const drawn = (el: Element | null) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement)
        o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const centre = (tile: string): Point => {
      const r = document.querySelector(`[data-zone-tile="${tile}"]`)?.getBoundingClientRect();
      return r
        ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }
        : { x: NaN, y: NaN, w: 0 };
    };
    const hands = () => [
      ...document.querySelectorAll<HTMLElement>(
        '[data-zone="viewer:hand"][data-object-id], [data-zone="opponent:hand"][data-object-id]',
      ),
    ];
    // What is in the hands now is not new.
    for (const el of hands()) known.add(el);
    const tick = () => {
      const t = performance.now();
      const turn = Number(document.querySelector(".gs-turn-value")?.textContent ?? 0) || 0;
      const opening = document.querySelector(".gs-opening") !== null;
      for (const side of ["viewer", "opponent"] as const) {
        const shows = [
          ...document.querySelectorAll(`[data-zone-tile="${side}:library"] .gs-zone-n`),
        ]
          .filter((n) => drawn(n) > 0.5)
          .map((n) => n.textContent ?? "")
          .join("/");
        if (last[side] !== shows) {
          last[side] = shows;
          w.__steps.push({ t, side, shows });
        }
      }
      for (const el of hands()) {
        if (known.has(el)) continue;
        known.add(el);
        // The opening hand (spec 0089's deal and Keep) is not a draw.
        if (opening || turn === 0) continue;
        waiting.set(el, {
          id: el.dataset.objectId ?? "",
          side: el.dataset.zone === "viewer:hand" ? "viewer" : "opponent",
          made: t,
          unseen: t,
          faint: 0,
        });
      }
      for (const [el, n] of waiting) {
        // The card itself, or its back flying with it (spec 0123: a ghost of its id).
        const parts = [el, ...document.querySelectorAll(`[data-ghost-of="${n.id}"]`)];
        const best = parts.map((p) => ({ p, o: drawn(p) })).sort((a, b) => b.o - a.o)[0]!;
        if (best.o <= 0.15) {
          // Still unseen on this frame -- or only just lifting: the other
          // player's back starts its lift transparent (spec 0123, "unseen
          // until it lifts"), so the frame its Library number drops on may
          // draw it fainter than this.
          n.unseen = t;
          n.faint = best.o;
          continue;
        }
        waiting.delete(el);
        const r = best.p.getBoundingClientRect();
        w.__new.push({
          ...n,
          seen: t,
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          lib: { viewer: centre("viewer:library"), opponent: centre("opponent:library") },
          turn,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const newcomersOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __new: Newcomer[] }).__new);
const stepsOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __steps: Step[] }).__steps);

/** The tile's number just before `t` (the last change before it). */
function showsBefore(steps: Step[], side: Step["side"], t: number): string {
  let out = "";
  for (const s of steps) if (s.side === side && s.t < t) out = s.shows;
  return out;
}

test("a drawn card lifts off its owner's Library tile, and the number drops as it leaves", async ({
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
        host: {
          hand: ["Forest", "Forest", "Forest", "Forest", "Forest", "Island", "Island"],
          top: ["Forest", "Forest", "Forest", "Forest", "Forest"],
        },
        guest: {
          hand: ["Island", "Swamp", "Agent of Kotis", "Village Rites", "Swamp", "Island", "Swamp"],
          top: ["Island", "Swamp", "Island", "Swamp", "Island", "Swamp"],
        },
      },
    });
    await recorder(host);
    await recorder(guest);

    let agentId: string | null = null;
    let sacrificed: number | null = null;
    const deadline = Date.now() + 900_000;
    const watch = watchGame([host, guest], () => Promise.resolve({ agentId, sacrificed }));
    const done = async () => {
      if (sacrificed === null) return false;
      // Village Rites' two cards seen on both pages, and a second after.
      const late = async (page: Page) =>
        (await newcomersOf(page)).filter(
          (n) => n.made > sacrificed! && n.side === (page === guest ? "viewer" : "opponent"),
        );
      const [g, h] = [await late(guest), await late(host)];
      const now = await guest.evaluate(() => performance.now());
      return g.length >= 2 && h.length >= 2 && now - Math.max(...g.map((n) => n.seen)) > 1500;
    };
    while (!(await done()) && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        await page.mouse.move(0, 0);
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }
        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        if ((await cast.count()) > 0) {
          const label = await cast.evaluateAll((els) => els[0]?.getAttribute("aria-label") ?? "");
          const choosable = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          // Village Rites' cost: a real click on the Agent.
          const agent = choosable.filter({ hasText: /^Agent of Kotis/ });
          if (!isHost && /Village Rites/.test(label) && !agentId && (await agent.count()) > 0) {
            agentId = await agent.evaluateAll(
              (els) => els[0]?.getAttribute("data-object-id") ?? null,
            );
            if (!agentId) continue;
            sacrificed = await guest.evaluate(() => performance.now());
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
          if ((await listed.count()) > 0) await clickUnlessCombat(listed);
          else if ((await main.count()) > 0) await clickUnlessCombat(main);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const mine = boardCards(page, "viewer");
        let pick: Locator | null = null;
        if (isHost) {
          const land = hand.filter({ hasText: /^Forest/ });
          if ((await land.count()) > 0) pick = land;
        } else if (!agentId) {
          const onTable = (await mine.filter({ hasText: /^Agent of Kotis/ }).count()) > 0;
          const lands = await cardCount(mine.filter({ hasText: /^(Island|Swamp)/ }));
          const swamps = await cardCount(mine.filter({ hasText: /^Swamp/ }));
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
            const land = hand.filter({
              hasText: islands === 0 ? /^Island/ : swamps === 0 ? /^Swamp/ : /^(Swamp|Island)/,
            });
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
    expect(
      agentId,
      "the guest sacrificed the Agent to Village Rites (a real click)",
    ).not.toBeNull();
    expect(await done(), "Village Rites' two cards were drawn on both pages").toBe(true);

    for (const [name, page] of [
      ["guest (the drawer)", guest],
      ["host (the other player)", host],
    ] as const) {
      const all = await newcomersOf(page);
      const steps = await stepsOf(page);
      // Every card new to a hand after the opening: first drawn over its owner's Library tile.
      expect(all.length, `${name}: cards drawn into a hand were seen`).toBeGreaterThanOrEqual(3);
      for (const n of all) {
        const lib = n.lib[n.side];
        const off = Math.hypot(n.x - lib.x, n.y - lib.y);
        console.log(
          `${name}: ${n.id} (${n.side}'s hand, turn ${n.turn}) first drawn ${(n.seen - n.made).toFixed(0)} ms after it was made, ` +
            `at (${n.x.toFixed(0)}, ${n.y.toFixed(0)}), ${off.toFixed(0)} px from its Library tile`,
        );
        expect(off, `${name}: ${n.id} first drawn over its owner's Library tile`).toBeLessThan(
          Math.max(60, lib.w),
        );
      }
      // Village Rites' two: the number held until each card has left the tile.
      const side = page === guest ? "viewer" : "opponent";
      const rites = all
        .filter((n) => n.made > sacrificed! && n.side === side)
        .sort((a, b) => a.seen - b.seen)
        .slice(0, 2);
      const before = Number(showsBefore(steps, side, rites[0]!.made));
      const tile = steps.filter((s) => s.side === side && s.t >= rites[0]!.made - 1000);
      const at = (t: number) => (t - rites[0]!.made).toFixed(0);
      console.log(
        `${name}: Library tile ${tile.map((s) => `${at(s.t)} ms: "${s.shows}"`).join(", ")}; ` +
          `the cards first drawn at ${rites.map((n) => `${at(n.seen)} ms (the frame before: ${at(n.unseen)} ms, drawn ${n.faint.toFixed(2)})`).join(" and ")}`,
      );
      expect(
        rites[0]!.seen - rites[0]!.made,
        `${name}: the first card waited for Village Rites`,
      ).toBeGreaterThan(200);
      // A card has left from the frame before it is first seen: its lift
      // starts on that frame (the number drops with it), but a back starts
      // its lift transparent, so that frame can draw it too faintly to
      // count. Frames, not milliseconds: a slow runner's frame can be
      // 60 ms long (CI run 46166592060), and a number dropped two frames
      // early -- before the lift -- still fails.
      const leftBy = (n: Newcomer, t: number) => n.unseen <= t;
      // Between the board arriving and the first card leaving: still the old number.
      for (const s of tile.filter((s) => s.t > rites[0]!.made && !leftBy(rites[0]!, s.t)))
        expect(Number(s.shows), `${name}: Library at ${at(s.t)} ms`).toBe(before);
      // Never below what has left: one less only once the first is out, two less once the second is.
      for (const s of tile.filter((s) => s.t > rites[0]!.made && s.shows !== "")) {
        const out = rites.filter((n) => leftBy(n, s.t)).length;
        expect(
          Number(s.shows),
          `${name}: Library at ${(s.t - rites[0]!.made).toFixed(0)} ms`,
        ).toBeGreaterThanOrEqual(before - out);
      }
      expect(
        Number(showsBefore(steps, side, rites[1]!.seen + 1200)),
        `${name}: two fewer once both have gone`,
      ).toBe(before - 2);
    }
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
