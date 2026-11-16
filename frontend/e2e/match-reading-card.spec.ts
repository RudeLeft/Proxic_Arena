// The reading card -- spec 0094 (owner 2026-11-16, A · whole card, 2.6x,
// lifted clear). TEST-012: in a real game, the player really slides the
// mouse along a 7-card hand and then casts by clicking a hand card.
//
// A real game with the landing test deck (Forests, one-mana elves). The
// first player to have their move with seven cards in hand slides the real
// mouse along the hand, card by card. At each card: the reading card shows
// that card's whole picture; the pointer is still on the hovered hand card
// (elementFromPoint); the reading card covers no hand card. Then they play a
// Forest and cast a one-mana creature by clicking it: the casting card rises
// from the reading card's box.
//
// READING_CLIPS=<dir> films both seats (normal speed) and writes the
// moments to <dir>/marks.json, for cutting the clip (spec 0094 As built).

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

const pkg = join(process.cwd(), "..", "Test Deck", "landing-deck.zip");
const CLIPS = process.env.READING_CLIPS;
const ONE_DROP = /^(Llanowar Elves|Elvish Mystic|Birds of Paradise)/;

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** For each hand card, left to right: a point on the part of it that shows. */
async function handPoints(page: Page) {
  return page.evaluate(() => {
    const out: { id: string; name: string; x: number; y: number }[] = [];
    const buttons = [
      ...document.querySelectorAll<HTMLElement>('.bf-cards button[data-zone="viewer:hand"]'),
    ].sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
    for (const b of buttons) {
      const r = b.getBoundingClientRect();
      const id = b.dataset["objectId"]!;
      search: for (const fy of [0.35, 0.5, 0.25, 0.6]) {
        for (const fx of [0.3, 0.2, 0.4, 0.15, 0.5]) {
          const x = r.x + r.width * fx;
          const y = Math.min(r.y + r.height * fy, window.innerHeight - 4);
          if (document.elementFromPoint(x, y)?.closest("[data-object-id]") === b) {
            out.push({ id, name: (b.getAttribute("aria-label") ?? "").split(",")[0]!, x, y });
            break search;
          }
        }
      }
    }
    return out;
  });
}

/** What the page shows while [id] is pointed at, the pointer at (x, y). */
async function seenAt(page: Page, id: string, x: number, y: number) {
  return page.evaluate(
    ({ id, x, y }) => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const reading = document.querySelector<HTMLElement>(`[data-reading="${id}"]`);
      const scan = reading?.querySelector<HTMLImageElement>("img.bf-read-scan") ?? null;
      const hand = [
        ...document.querySelectorAll<HTMLElement>('.bf-cards button[data-zone="viewer:hand"]'),
      ].map((b) => ({ id: b.dataset["objectId"]!, ...rect(b) }));
      const act = document.querySelector("button.gs-act");
      const lands = [
        ...document.querySelectorAll<HTMLElement>(
          '.bf-cards button[data-object-id][data-zone^="viewer:land"]',
        ),
      ].map(rect);
      return {
        readings: document.querySelectorAll("[data-reading]").length,
        reading: reading ? rect(reading) : null,
        hidden: reading?.getAttribute("aria-hidden") ?? null,
        pointerEvents: reading ? getComputedStyle(reading).pointerEvents : null,
        scan: scan
          ? {
              src: scan.getAttribute("src") ?? "",
              complete: scan.complete,
              natural: [scan.naturalWidth, scan.naturalHeight],
            }
          : null,
        under:
          document
            .elementFromPoint(x, y)
            ?.closest("[data-object-id]")
            ?.getAttribute("data-object-id") ?? null,
        zoomed:
          document
            .querySelector(`.bf-cards button[data-object-id="${id}"]`)
            ?.getAttribute("data-zoomed") ?? null,
        hand,
        act: act ? rect(act) : null,
        lands,
      };
    },
    { id, x, y },
  );
}

test("sliding the mouse along a 7-card hand shows each whole card clear of the fan; a click casts from the reading card", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no landing deck package (CI builds it)");
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
  const host = await (await context()).newPage();
  const guest = await (await context()).newPage();
  const mark = (what: string, page: Page | null, more: Record<string, unknown> = {}) => {
    marks.push({
      what,
      seat: page === host ? "host" : page === guest ? "guest" : null,
      ms: Date.now() - t0,
      ...more,
    });
    console.log(`MARK ${what} ${Date.now() - t0} ms`, JSON.stringify(more));
  };
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  let slider: Page | null = null;
  let slid = 0;
  let cast = false;
  const report: Record<string, unknown> = {};
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    const deadline = Date.now() + 780_000;
    const watch = watchGame([host, guest], () => ({ slid, cast }));
    while (!cast && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        if (cast) break;
        if (slider && page !== slider) {
          // The other seat only passes.
          if (await discardIfAsked(page)) continue;
          if (await answerCardTray(page)) continue;
          if ((await matchPanel(page).locator("button.gs-act-combat").count()) > 0) {
            await passCombat(page);
            continue;
          }
          await clickNow(passButton(page));
          continue;
        }
        const panel = matchPanel(page);
        if (await discardIfAsked(page)) continue;
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await answerCardTray(page)) continue;
        if ((await panel.locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        const yourMove = (await panel.getByRole("heading", { name: /Your move/ }).count()) > 0;
        const playable = page.locator(
          '.bf-cards [data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        if (!yourMove || (await playable.count()) === 0) {
          // Paying, or not this seat's move.
          const owing = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          if ((await page.locator(".gs-cast").count()) > 0 && (await owing.count()) > 0) {
            await clickUnlessCombat(owing);
          } else if (yourMove) await clickNow(passButton(page));
          await page.waitForTimeout(100);
          continue;
        }

        // --- slide along the hand (once, with seven cards or more) ---------
        if (slid === 0) {
          const points = await handPoints(page);
          if (points.length < 7) {
            await clickNow(passButton(page));
            continue;
          }
          slider = page;
          await page.mouse.move(points[0]!.x - 120, points[0]!.y, { steps: 2 });
          mark("slide start", page, { cards: points.length });
          const checked: Record<string, unknown>[] = [];
          for (const p of points) {
            // The real mouse, sliding along the hand at a player's pace.
            await page.mouse.move(p.x, p.y, { steps: 12 });
            await page.waitForTimeout(450);
            const s = await seenAt(page, p.id, p.x, p.y);
            const where = `${p.name} (${p.id})`;
            expect(s.zoomed, `${where}: pointed at`).toBe("true");
            expect(s.readings, `${where}: one reading card`).toBe(1);
            expect(s.reading, `${where}: a reading card`).not.toBeNull();
            expect(s.hidden, `${where}: hidden from screen readers`).toBe("true");
            expect(s.pointerEvents, `${where}: can't be clicked`).toBe("none");
            // The whole picture, loaded: the card's scan (the close-up copy
            // once it is whole), not the table face's art window.
            expect(s.scan, `${where}: the whole card's picture`).not.toBeNull();
            expect(s.scan!.complete && s.scan!.natural[0]! > 0, `${where}: loaded`).toBe(true);
            const ratio = s.scan!.natural[1]! / s.scan!.natural[0]!;
            expect(Math.abs(ratio - 88 / 63), `${where}: a whole card's shape`).toBeLessThan(0.05);
            // The pointer stays on the hovered hand card.
            expect(s.under, `${where}: the pointer stays on it`).toBe(p.id);
            // The reading card covers no hand card...
            for (const h of s.hand) {
              expect(overlaps(s.reading!, h), `${where}: covers ${h.id}`).toBe(false);
            }
            // ...nor the act button.
            if (s.act)
              expect(overlaps(s.reading!, s.act), `${where}: covers the act button`).toBe(false);
            expect(Math.abs(s.reading!.w - 254) < 3 && Math.abs(s.reading!.h - 355) < 3).toBe(true);
            checked.push({
              id: p.id,
              name: p.name,
              reading: s.reading,
              fanTop: Math.min(...s.hand.map((h) => h.y)),
              landsCovered: s.lands.filter((l) => overlaps(s.reading!, l)).length,
              act: s.act,
            });
            slid += 1;
            if (slid === 4) await page.screenshot({ path: "test-results/seen/reading-card.png" });
          }
          mark("slide end", page, { cards: slid });
          report["slide"] = checked;
          continue;
        }

        // --- a Forest, then a one-mana creature, by real clicks ------------
        const forest = playable.filter({ hasText: /^Forest/ });
        const elves = playable.filter({ hasText: ONE_DROP });
        if ((await elves.count()) === 0) {
          if ((await forest.count()) > 0) {
            const points = await handPoints(page);
            const id = await forest.first().getAttribute("data-object-id");
            const p = points.find((q) => q.id === id)!;
            await page.mouse.move(p.x, p.y, { steps: 8 });
            await page.waitForTimeout(300);
            mark("forest", page);
            await page.mouse.click(p.x, p.y);
            await page.waitForTimeout(1_200);
            continue;
          }
          await clickNow(passButton(page));
          continue;
        }
        // The hand as it stands once it has stopped moving (the Forest left
        // it a moment ago and the fan closes up with a glide).
        let points = await handPoints(page);
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(250);
          const again = await handPoints(page);
          const same = JSON.stringify(again) === JSON.stringify(points);
          points = again;
          if (same) break;
        }
        const id = await elves.first().getAttribute("data-object-id");
        const p = points.find((q) => q.id === id);
        if (!p) continue;
        // From above the hand (the Forest's play closed the fan up under a
        // still pointer: nothing is pointed at until the mouse moves).
        await page.mouse.move(p.x, p.y - 260, { steps: 4 });
        await page.mouse.move(p.x, p.y, { steps: 10 });
        await expect(
          page.locator(`[data-reading="${p.id}"]`),
          `${p.name}'s reading card`,
        ).toHaveCount(1, { timeout: 5_000 });
        await page.waitForTimeout(400); // its settle
        const before = await seenAt(page, p.id, p.x, p.y);
        expect(before.reading, "the reading card of the card to cast").not.toBeNull();
        mark("cast click", page, { name: p.name });
        // Watch the casting card from the click: its first frames.
        const frames = page.evaluate(async () => {
          const out: { x: number; y: number; w: number; h: number }[] = [];
          const start = performance.now();
          await new Promise<void>((done) => {
            const tick = () => {
              const el = document.querySelector(".gs-cast:not(.gs-cast-leaving)");
              if (el) {
                const r = el.getBoundingClientRect();
                out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
              }
              if (out.length < 40 && performance.now() - start < 4_000) requestAnimationFrame(tick);
              else done();
            };
            requestAnimationFrame(tick);
          });
          return out;
        });
        await page.mouse.click(p.x, p.y);
        const seen = await frames;
        expect(seen.length, "the casting card appeared").toBeGreaterThan(5);
        const first = seen[0]!;
        const r = before.reading!;
        const centre = (b: Rect) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        report["cast"] = { reading: r, first, last: seen[seen.length - 1] };
        // It rises from the reading card: its first frame where the reading
        // card was (centre, and nearly its height), not from the fan.
        expect(
          Math.abs(centre(first).x - centre(r).x),
          "rises from the reading card (x)",
        ).toBeLessThan(30);
        expect(
          Math.abs(centre(first).y - centre(r).y),
          "rises from the reading card (y)",
        ).toBeLessThan(40);
        expect(Math.abs(first.h - r.h) / r.h, "from the reading card's size").toBeLessThan(0.25);
        // The reading card goes with its card.
        await expect(page.locator(`[data-reading="${p.id}"]`)).toHaveCount(0, { timeout: 5_000 });
        await page.waitForTimeout(800);
        mark("cast risen", page);
        await page.screenshot({ path: "test-results/seen/reading-card-cast.png" });
        cast = true;
      }
      await host.waitForTimeout(100);
    }
    expect(slid, "cards slid along").toBeGreaterThanOrEqual(7);
    expect(cast, "a card cast from its reading card").toBe(true);
    console.log("READING REPORT", JSON.stringify(report));
  } finally {
    if (CLIPS) writeFileSync(join(CLIPS, "marks.json"), JSON.stringify(marks, null, 2));
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
