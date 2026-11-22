// Reports and comfort, in a real game -- spec 0103 (F-0103-G), AGENTS TEST-012.
//
// 1. The guest cracks Flooded Strand (an Island comes out). On the host's
//    page the report window offers its replay: the host REALLY presses R
//    (the pointer over the table), and the move plays again on a layer over
//    the table, at half speed, then the live table is back, unchanged; then
//    the host REALLY clicks the window's medallion and it plays again
//    (item 3). The guest's plate says a permanent of theirs left (item 5).
// 2. The host casts Brainstorm and REALLY chooses what to put back and in
//    which order: Consider to be drawn first, then Swamp. The host REALLY
//    points at its Library tile: the two slide out, numbered (1 Consider, 2
//    Swamp). The guest's page has no such cards anywhere in its DOM, before
//    or while pointing at the host's Library tile (item 4, F-0103-D2 (5)).
//    The host's plate counts its spell (item 5).
// 3. The host REALLY clicks the gear and the "Bigger text" switch: the life
//    total's computed size rises 25% (item 6).
//
// 4. Items 1 and 2 as spec 0109 item 13 left them (owner 2026-11-20, canvas
//    "13" A; the read-through removed): the guest's second fetch gathers the
//    host's window, numbered 1 and 2. The host REALLY moves the pointer over
//    the row, the top part and the picture: the table never dims (and
//    nothing lights it unasked while the window waits). The host REALLY
//    opens row 1 and REALLY clicks its picture: all but the guest's Island
//    dims; a click on the picture again brings the table back.
//
// Dealt (spec 0098), so every moment comes on the first game. The deck is
// protocol/fixtures/reports-comfort-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/reports-comfort-deck.zip" protocol/fixtures/reports-comfort-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  clearEverything,
  clickNow,
  clickUnlessCombat,
  discardIfAsked,
  matchPanel,
  pointAt,
  realClick,
  passButton,
  passCombat,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "reports-comfort-deck.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";

// hitPoint, realClick and pointAt: match-helpers.ts (P11-B7: one copy).

/** The live table (not the replay's layer): every object drawn, and where. */
const liveTable = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".bf-board [data-object-id]")]
      .filter((el) => !el.closest(".gs-replay") && !el.closest(".bf-ghost"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.dataset.objectId}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`;
      })
      .sort(),
  );

/** While a replay plays: its stage, the cards on its layer, and its animations' speeds. */
const replayNow = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(".gs-replay");
    if (!layer) return null;
    return {
      stage: layer.dataset.replayStage ?? "",
      cards: layer.querySelectorAll("[data-object-id]").length,
      rates: [
        ...new Set(
          (typeof layer.getAnimations === "function"
            ? layer.getAnimations({ subtree: true })
            : []
          ).map((a) => a.playbackRate),
        ),
      ],
      ring: document.querySelector(".gs-reveal-replaying") !== null,
    };
  });

/** Every known-top card in the page's DOM, and any id a known card is sent under. */
const knownInDom = (page: Page) =>
  page.evaluate(() => ({
    cards: document.querySelectorAll(".gs-known, .gs-known-card, [data-known]").length,
    ids: document.documentElement.outerHTML.includes("known:"),
  }));

test("a report replays by R and by its medallion, the table unchanged after; Brainstorm's put back known on top for its owner alone; this turn on the plates; Bigger text", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no reports-comfort deck package (CI builds it)");
  const viewport = { width: 1920, height: 1080 };
  const clips = process.env.PROXIC_CLIPS;
  const context = (name: string) =>
    browser.newContext({
      viewport,
      ...(clips ? { recordVideo: { dir: join(clips, name), size: viewport } } : {}),
    });
  const host = await (await context("host")).newPage();
  const started = Date.now();
  const at = () => ((Date.now() - started) / 1000).toFixed(1);
  const moments: string[] = [];
  const moment = (said: string) => {
    moments.push(`${at()} s: ${said}`);
    console.log(`moment ${at()} s: ${said}`);
  };
  // What each page is sent: the host's own knownTop (the last one), and
  // whether any frame the guest's page received ever named one (HID-001 on
  // the wire, the real game).
  const wire = { hostKnown: "" as string, guestFramesWithKnownTop: 0 };
  const listen = (page: Page, isHost: boolean) =>
    page.on("websocket", (ws) =>
      ws.on("framereceived", (frame) => {
        const text = typeof frame.payload === "string" ? frame.payload : frame.payload.toString();
        if (!text.includes('"knownTop"')) return;
        if (!isHost) wire.guestFramesWithKnownTop += 1;
        else {
          // The frame's own knownTop, wherever the message carries its state.
          const find = (node: unknown): unknown => {
            if (!node || typeof node !== "object") return undefined;
            const o = node as Record<string, unknown>;
            if (Array.isArray(o["knownTop"])) return o["knownTop"];
            for (const v of Object.values(o)) {
              const found = find(v);
              if (found) return found;
            }
            return undefined;
          };
          try {
            const list = find(JSON.parse(text)) as { name?: string }[] | undefined;
            wire.hostKnown = (list ?? []).map((c) => c.name).join(", ");
          } catch {
            wire.hostKnown = "(unreadable)";
          }
        }
      }),
    );
  listen(host, true);
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  listen(guest, false);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        // The host: Islands to play, Brainstorm, and Consider and a Swamp
        // to put back with it (kept in hand: the host plays Islands only).
        host: {
          hand: ["Island", "Brainstorm", "Consider", "Swamp", "Island", "Island", "Opt"],
          top: ["Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island"],
        },
        // The guest: Flooded Strand first, then Islands.
        guest: {
          hand: [
            "Flooded Strand",
            "Island",
            "Polluted Delta",
            "Swamp",
            "Opt",
            "Consider",
            "Island",
          ],
          top: ["Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island"],
        },
      },
    });

    // The most spells the host's own plate has counted this turn, on any frame.
    await host.evaluate(() => {
      const w = window as unknown as { __spells: number };
      w.__spells = 0;
      const tick = () => {
        const el = document.querySelector<HTMLElement>(".gs-seat-viewer .gs-thisturn");
        w.__spells = Math.max(w.__spells, Number(el?.dataset.spells ?? 0));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Every change of what is dimmed on the host's table, each frame (spec
    // 0109: only a click on a picture may dim it).
    await host.evaluate(() => {
      const w = window as unknown as { __lit: string[][] };
      w.__lit = [];
      let last = "";
      const tick = () => {
        // Whether the table is dimmed, then what it keeps bright.
        const dimmed = document.querySelector(".gs-report-pointing") ? "dimmed" : "";
        const now = [
          dimmed,
          ...[...document.querySelectorAll<HTMLElement>(".gs-lit")].map(
            (el) =>
              el.querySelector<HTMLElement>("[data-object-id]")?.dataset.objectId ??
              el.dataset.zoneTile ??
              "",
          ),
        ];
        if (now.join() !== last) {
          last = now.join();
          w.__lit.push(now);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    let cracked = false;
    let strandOut = false;
    // Items 1 and 2: the guest's second fetch (Polluted Delta) gathers the
    // host's window; the host points across it, then clicks row 1's picture.
    let deltaOut = false;
    let deltaCracked = false;
    let pointed: Record<string, unknown> | null = null;
    let replayed: Record<string, unknown> | null = null;
    let brainstormCast = false;
    const putBack: string[] = [];
    let ordered = false;
    let known: Record<string, unknown> | null = null;
    let bigger: Record<string, unknown> | null = null;
    let guestPlate: Record<string, unknown> | null = null;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({
      cracked,
      replayed: !!replayed,
      brainstormCast,
      putBack,
      ordered,
      known: !!known,
      bigger: !!bigger,
      deltaCracked,
      pointed: !!pointed,
    }));

    while (!(replayed && known && bigger && pointed) && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // --- 1. the host replays the guest's fetch (no question is the host's now)
        const offered = page.locator('.gs-reveal-replay[data-replay-offered="true"]');
        if (isHost && cracked && !replayed && (await offered.count()) > 0) {
          const foot = (await page.locator(".gs-reveal-foot").first().textContent()) ?? "";
          const said = (await page.locator(".gs-reveal").first().textContent()) ?? "";
          guestPlate = await page
            .locator(".gs-seat-opponent .gs-thisturn")
            .first()
            .evaluate((el) => ({ ...(el as HTMLElement).dataset }))
            .catch(() => null);
          // The pointer over the table first (a hand card under it would rise).
          await page.mouse.move(700, 480, { steps: 4 });
          // The live table once it has settled (the fetched Island lands).
          let before = await liveTable(page);
          for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(300);
            const again = await liveTable(page);
            if (JSON.stringify(again) === JSON.stringify(before)) break;
            before = again;
          }
          // R, the pointer over the table (never in a text field).
          moment(`host presses R (replay, item 3)`);
          await page.keyboard.press("r");
          await expect(page.locator('.gs-replay[data-replay-stage="1"]')).toBeAttached({
            timeout: 5_000,
          });
          await page.waitForTimeout(250);
          const during = await replayNow(page);
          await page.screenshot({ path: join(SHOTS, "reports-comfort-replay-midway.png") });
          // It ends on its own, the live table back as it was.
          await expect(page.locator(".gs-replay")).toHaveCount(0, { timeout: 20_000 });
          const after = await liveTable(page);
          // Again, by the medallion.
          await page.waitForTimeout(500);
          moment(`host clicks the medallion (replay, item 3)`);
          const clicked = await realClick(page, page.locator(".gs-reveal-replay"));
          await expect(page.locator('.gs-replay[data-replay-stage="1"]')).toBeAttached({
            timeout: 5_000,
          });
          await page.waitForTimeout(250);
          const during2 = await replayNow(page);
          await expect(page.locator(".gs-replay")).toHaveCount(0, { timeout: 20_000 });
          const after2 = await liveTable(page);
          replayed = { foot, said, during, before, after, clicked, during2, after2 };
          await page.mouse.move(0, 0);
          continue;
        }
        if (!isHost && bigger && !deltaCracked) {
          const deltas = await boardCards(page, "viewer")
            .filter({ hasText: /^Polluted Delta/ })
            .count();
          if (deltas > 0) deltaOut = true;
          else if (deltaOut) {
            deltaCracked = true;
            moment(`guest's Polluted Delta cracked`);
          }
        }

        // --- items 1 and 2 (spec 0109, item 13): pointing across the gathered
        // window dims nothing; a click on row 1's picture (the Strand's Island)
        // dims all but that Island; a click on it again brings the table back.
        const rows = page.locator(".gs-report-row");
        if (
          isHost &&
          deltaCracked &&
          !pointed &&
          (await rows.count()) > 0 &&
          ((await page.locator(".gs-reveal").first().textContent()) ?? "").includes(
            "Polluted Delta",
          )
        ) {
          moment(`the host's window gathers the two fetches (items 1-2)`);
          const readFrom = await page.evaluate(
            () => (window as unknown as { __lit: string[][] }).__lit.length,
          );
          const numbers = await page.locator(".gs-report-n").allTextContents();
          // The pointer across the row, the top part and the picture (the
          // flicker's path, canvas "13"), the window left alone between.
          await page.mouse.move(0, 0);
          moment(`host points across the window (item 13: nothing dims)`);
          for (const part of [
            rows.first(),
            page.locator(".gs-reveal-head").first(),
            page.locator("li.gs-reveal-card").first(),
          ]) {
            await pointAt(page, part, 8);
            await page.waitForTimeout(400);
          }
          await page.screenshot({ path: join(SHOTS, "reports-comfort-pointing-no-dim.png") });
          const pointedOnly = (
            await page.evaluate(() => (window as unknown as { __lit: string[][] }).__lit)
          ).slice(Math.max(0, readFrom - 1));
          // Row 1 opened, then its picture really clicked.
          moment(`host opens row 1 and clicks its picture (item 13)`);
          await realClick(page, rows.first().locator("button"));
          const strandPic = page.locator('li.gs-reveal-card[data-revealed-id^="action:"]').first();
          await expect(page.locator(".gs-report-row").first()).toBeAttached();
          const clicked = await realClick(page, strandPic);
          await expect(page.locator(".gs-screen.gs-report-pointing")).toHaveCount(1, {
            timeout: 5_000,
          });
          await page.screenshot({ path: join(SHOTS, "reports-comfort-picture-dim.png") });
          const dim = await page.evaluate(() => {
            const screen = document.querySelector(".gs-screen");
            const lit = [...document.querySelectorAll<HTMLElement>(".gs-lit")].map((el) => ({
              id: el.querySelector<HTMLElement>("[data-object-id]")?.dataset.objectId ?? "",
              name: (el.textContent ?? "").trim().slice(0, 20),
              side:
                el.querySelector<HTMLElement>("[data-controller]")?.dataset.controller ??
                el.dataset.zoneTile ??
                "",
              filter: getComputedStyle(el).filter,
            }));
            const other = [...document.querySelectorAll<HTMLElement>(".bf-cards > .bf-slot")].find(
              (el) => !el.classList.contains("gs-lit") && !el.closest(".gs-replay"),
            );
            const tile = document.querySelector<HTMLElement>("[data-zone-tile]:not(.gs-lit)");
            return {
              pointing: screen?.classList.contains("gs-report-pointing") ?? false,
              lit,
              otherFilter: other ? getComputedStyle(other).filter : "",
              tileFilter: tile ? getComputedStyle(tile).filter : "",
            };
          });
          // Again: the table back.
          await realClick(page, strandPic);
          await expect(page.locator(".gs-screen.gs-report-pointing")).toHaveCount(0, {
            timeout: 5_000,
          });
          const after = await page.evaluate(
            () => document.querySelectorAll(".gs-lit, .gs-report-pointing").length,
          );
          await page.mouse.move(0, 0);
          pointed = { pointedOnly, numbers, clicked, dim, after };
          continue;
        }

        if (!isHost && !cracked) {
          // Cracked once the Strand, seen on the guest's table, has left it.
          const strands = await boardCards(page, "viewer")
            .filter({ hasText: /^Flooded Strand/ })
            .count();
          if (strands > 0) strandOut = true;
          else if (strandOut) {
            cracked = true;
            moment(`guest's Flooded Strand cracked`);
          }
        }

        // --- 2. the host points at its Library: the known cards, numbered
        if (isHost && ordered && !known) {
          const stackEmpty = (await page.locator('button[data-zone="stack"]').count()) === 0;
          const asked = (await panel.locator(".gs-win").count()) > 0;
          if (stackEmpty && !asked) {
            await page.waitForTimeout(800);
            moment(`host points at its Library (known top, item 4)`);
            await pointAt(page, page.locator('[data-zone-tile="viewer:library"]'), 8);
            console.log(`host's last knownTop on the wire: [${wire.hostKnown}]`);
            await page.screenshot({ path: join(SHOTS, "reports-comfort-known-pointing.png") });
            await expect(page.locator(".gs-known-card")).toHaveCount(2, { timeout: 5_000 });
            await page.waitForTimeout(400);
            await page.screenshot({ path: join(SHOTS, "reports-comfort-known-top.png") });
            const labels = await page
              .locator(".gs-known-card")
              .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
            const numbers = await page.locator(".gs-known-n").allTextContents();
            await page.mouse.move(0, 0);
            await page.waitForTimeout(300);
            const gone = await page.locator(".gs-known").count();
            // The guest's page: nothing, at rest or pointing at the host's Library.
            const guestRest = await knownInDom(guest);
            await pointAt(guest, guest.locator('[data-zone-tile="opponent:library"]'), 8);
            await guest.waitForTimeout(500);
            const guestPointing = await knownInDom(guest);
            await guest.screenshot({ path: join(SHOTS, "reports-comfort-guest-library.png") });
            await guest.mouse.move(0, 0);
            const hostPlate = await page
              .locator(".gs-seat-viewer .gs-thisturn")
              .first()
              .evaluate((el) => ({ ...(el as HTMLElement).dataset }))
              .catch(() => null);
            await pointAt(page, page.locator(".gs-seat-viewer .gs-thisturn"), 8);
            await page.waitForTimeout(400);
            const plateList = (await page.locator(".gs-thisturn-list").textContent()) ?? "";
            await page.screenshot({ path: join(SHOTS, "reports-comfort-plate-counts.png") });
            await page.mouse.move(0, 0);
            const spellsSeen = await page.evaluate(
              () => (window as unknown as { __spells: number }).__spells,
            );
            known = {
              spellsSeen,
              labels,
              numbers,
              gone,
              guestRest,
              guestPointing,
              hostPlate,
              plateList,
              wire: { ...wire },
            };

            // --- 3. Bigger text: the gear, the switch, the life total measured.
            const size = () =>
              page
                .locator(".gs-seat-viewer .gs-life")
                .first()
                .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
            const off = await size();
            await page.screenshot({ path: join(SHOTS, "reports-comfort-bigger-off.png") });
            moment(`host turns on Bigger text (item 6)`);
            await realClick(page, page.locator('[aria-label="Game menu"]'));
            const sw = page.locator('[role="switch"]').filter({ hasText: "Bigger text" });
            await expect(sw).toBeVisible({ timeout: 5_000 });
            await realClick(page, sw);
            await expect(sw).toHaveAttribute("aria-checked", "true");
            const on = await size();
            await page.keyboard.press("Escape");
            await page.waitForTimeout(400);
            await page.screenshot({ path: join(SHOTS, "reports-comfort-bigger-on.png") });
            const stored = await page.evaluate(() =>
              window.localStorage.getItem("proxic.biggerText"),
            );
            bigger = { off, on, stored };
            continue;
          }
        }

        // Brainstorm's put back, the host's own choice: Consider, then Swamp.
        const win = panel.locator(".gs-win").first();
        const kind = (await win.count()) > 0 ? await win.getAttribute("data-kind") : null;
        if (isHost && brainstormCast && kind === "orderMoveToZoneList") {
          // "Which card do you want to draw first?": Consider.
          const tile = win
            .locator("button.gs-win-tile:not(:disabled)")
            .filter({ hasText: /Consider/ });
          if ((await tile.count()) > 0 && (await realClick(page, tile))) {
            ordered = true;
            moment(`host chose Consider to draw first (Brainstorm)`);
            continue;
          }
        }
        const handPick = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
        if (isHost && brainstormCast && putBack.length < 2 && !ordered) {
          const want = putBack.includes("Consider") ? /^Swamp/ : /^Consider/;
          const tile = win.locator("button.gs-win-tile:not(:disabled)").filter({ hasText: want });
          const listed = panel.locator(".gs-win li button, .gs-question li button").filter({
            hasText: want,
          });
          // A hand card only while the game asks for the put back: on the
          // host's own move (Brainstorm still on the stack, the host holding
          // priority) a choosable Consider is a CAST (CI 12872d7: Consider was
          // cast, its draw took the top, the known top read "Swamp, Island").
          const onMyMove =
            (await page.locator('[data-kind="chooseSpellAbilityToPlay"]').count()) > 0;
          const inHand = handPick.filter({ hasText: want });
          const target = onMyMove
            ? null
            : (await tile.count()) > 0
              ? tile
              : (await listed.count()) > 0
                ? listed
                : (await inHand.count()) > 0
                  ? inHand
                  : null;
          if (target && (await realClick(page, target))) {
            putBack.push(putBack.includes("Consider") ? "Swamp" : "Consider");
            moment(`host clicked ${putBack.at(-1)} to put back`);
            await page.screenshot({
              path: join(SHOTS, `reports-comfort-putback-${putBack.length}.png`),
            });
            await page.waitForTimeout(300);
            const confirm = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
            if (putBack.length === 2) {
              // W-07: the order is the order the hand cards were clicked in
              // (the page answers the game's "which do you draw first?" from
              // it): Consider first, so Consider on top.
              if ((await confirm.count()) > 0) await clickNow(confirm);
              ordered = true;
              moment(`host put back Consider, then Swamp (Brainstorm)`);
            }
            continue;
          }
        }

        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }

        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        if ((await targeting.count()) > 0 || (await cast.count()) > 0) {
          // Paying: tap an Island (what the game lets this seat tap), else answer.
          const tap = page.locator(
            '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
          );
          const listedNow = panel.locator(".gs-win li button, .gs-question li button");
          if ((await tap.count()) > 0) await clickNow(tap);
          else if ((await listedNow.count()) > 0) await clickNow(listedNow);
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
          const board = page.locator('.bf-cards button[data-choosable="true"]');
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else if ((await board.count()) > 0) await clickUnlessCombat(board);
          else await clickNow(passButton(page));
          continue;
        }

        const stackEmpty = (await page.locator('button[data-zone="stack"]').count()) === 0;
        if (!isHost && ((cracked && !replayed) || (deltaCracked && !pointed)) && stackEmpty) {
          // The guest holds its priority while the host replays: any new board
          // would end the replay's offer (Decided 5).
          await page.waitForTimeout(200);
          continue;
        }
        const hand = page.locator(
          '[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const inHand = (name: RegExp) => hand.filter({ hasText: name });
        const mine = boardCards(page, "viewer");
        let pick: Locator | null = null;
        if (stackEmpty) {
          if (!isHost) {
            const strand = mine.filter({ hasText: /^Flooded Strand/ });
            if (!cracked && (await strand.count()) > 0) {
              // The fetch: a real click on the Strand on the table.
              if (await realClick(page, strand)) moment(`guest clicks Flooded Strand`);
              continue;
            }
            const delta = mine.filter({ hasText: /^Polluted Delta/ });
            if (bigger && !deltaCracked && (await delta.count()) > 0) {
              if (await realClick(page, delta)) moment(`guest clicks Polluted Delta`);
              continue;
            }
            if (!cracked && (await inHand(/^Flooded Strand/).count()) > 0)
              pick = inHand(/^Flooded Strand/);
            else if (bigger && !deltaOut && (await inHand(/^Polluted Delta/).count()) > 0)
              pick = inHand(/^Polluted Delta/);
            else if ((await inHand(/^Island/).count()) > 0) pick = inHand(/^Island/);
          } else {
            const islands = mine.filter({ hasText: /^Island/ });
            const untapped = await page
              .locator('.bf-cards button[data-controller="viewer"][data-tapped="false"]')
              .filter({ hasText: /^Island/ })
              .count();
            if ((await inHand(/^Island/).count()) > 0) pick = inHand(/^Island/);
            else if (
              replayed &&
              !brainstormCast &&
              // On the host's own turn, in a main phase: no draw comes between
              // the put back and the pointing (a draw takes the top card).
              (await page.locator(".gs-seat-viewer.gs-seat-active").count()) > 0 &&
              /main/i.test(
                (await page.locator(".gs-steps").first().getAttribute("data-step")) ?? "",
              ) &&
              (await islands.count()) > 0 &&
              untapped > 0 &&
              (await inHand(/^Brainstorm/).count()) > 0
            ) {
              pick = inHand(/^Brainstorm/);
              brainstormCast = true;
              moment(`host casts Brainstorm`);
            }
          }
        }
        if (pick && (await pick.count()) > 0) await realClick(page, pick);
        else await clickNow(passButton(page));
      }
    }

    console.log(`moments (video seconds from the host's page opening): ${JSON.stringify(moments)}`);
    console.log(`replay (host): ${JSON.stringify(replayed)}`);
    console.log(`guest's plate on the host's page: ${JSON.stringify(guestPlate)}`);
    console.log(`known top: ${JSON.stringify(known)}`);
    console.log(`bigger text: ${JSON.stringify(bigger)}`);
    console.log(`pointed across, then a picture clicked: ${JSON.stringify(pointed)}`);

    // Item 3: offered, played on its layer at half speed, the table unchanged.
    expect(replayed, "the host replayed the guest's fetch").not.toBeNull();
    expect(replayed!["foot"], "the foot names the key").toContain("R to replay");
    const during = replayed!["during"] as { stage: string; cards: number; rates: number[] };
    expect(during.cards, "the replay draws the table on its layer").toBeGreaterThan(0);
    for (const rate of during.rates) expect(rate, "every replayed frame at half speed").toBe(0.5);
    expect(replayed!["after"], "R: the live table is unchanged after").toEqual(replayed!["before"]);
    expect(replayed!["clicked"], "the medallion was really clicked").toBe(true);
    expect(replayed!["after2"], "the medallion: the live table unchanged after").toEqual(
      replayed!["before"],
    );
    // Item 5: the guest's Strand left the table (revolt), on the host's page.
    expect(guestPlate?.["left"], "a permanent of the guest's left").toBe("true");

    // Item 4: the host's own known top, numbered from the top; the guest nothing.
    expect(known, "the host pointed at its Library").not.toBeNull();
    expect(known!["labels"]).toEqual(["1: Consider, your next draw", "2: Swamp"]);
    expect(
      (known!["wire"] as { guestFramesWithKnownTop: number }).guestFramesWithKnownTop,
      "no frame the guest's page received named a knownTop",
    ).toBe(0);
    expect(known!["numbers"]).toEqual(["1", "2"]);
    expect(known!["gone"], "nothing once the pointer leaves").toBe(0);
    expect(known!["guestRest"], "the guest's page: nothing").toEqual({ cards: 0, ids: false });
    expect(known!["guestPointing"], "...while pointing at the host's Library").toEqual({
      cards: 0,
      ids: false,
    });
    expect(known!["spellsSeen"], "the host's plate counted its Brainstorm").toBeGreaterThanOrEqual(
      1,
    );
    expect(known!["plateList"]).toContain("Spells cast");

    // Item 6: the life total 25% larger.
    expect(bigger, "the host turned Bigger text on").not.toBeNull();
    expect(bigger!["stored"]).toBe("on");
    expect(Number(bigger!["on"]) / Number(bigger!["off"])).toBeCloseTo(1.25, 2);

    // Items 1 and 2 (spec 0109, item 13 changed the claim: a click, not
    // pointing; no read-through): numbered oldest first; pointing across the
    // window never dimmed the table; a click on row 1's picture keeps only the
    // guest's Island bright, everything else at the split-second dim; a
    // second click brings the table back.
    expect(pointed, "the host's window gathered the two fetches").not.toBeNull();
    expect(pointed!["numbers"]).toEqual(["1", "2"]);
    const pointedOnly = pointed!["pointedOnly"] as string[][];
    expect(
      pointedOnly.filter((set) => set[0] !== "" || set.length > 1),
      "pointing (and waiting) never dims the table",
    ).toEqual([]);
    expect(pointed!["clicked"], "the picture was really clicked").toBe(true);
    const dim = pointed!["dim"] as {
      pointing: boolean;
      lit: { id: string; name: string; side: string; filter: string }[];
      otherFilter: string;
      tileFilter: string;
    };
    expect(dim.pointing).toBe(true);
    expect(dim.lit, "one card kept bright").toHaveLength(1);
    expect(dim.lit[0]!.name).toMatch(/^Island/);
    expect(dim.lit[0]!.side).toBe("opponent");
    expect(dim.otherFilter).toBe("brightness(0.45) saturate(0.4)");
    expect(dim.tileFilter).toBe("brightness(0.45) saturate(0.4)");
    expect(pointed!["after"], "the table back on the second click").toBe(0);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
