// The live site, played end to end — PHASE_06 P6-BK.
//
// One real game on the deployed server, two independent signed-in
// browsers, nothing faked. It checks P6-BK's list as it plays:
//
//   prepared room launches            a room, two decks, Start match
//   Forge reaches RUNNING             both pages say the game is running
//   viewer-safe states differ         every snapshot each page receives
//                                     holds only that player's own hand
//   real action/decision completed    lands, spells, attacks, by clicking
//   visible card artwork loads        a picture in your own hand renders
//   hidden artwork stays unavailable  a picture only the OTHER player was
//                                     sent is refused to this one (404)
//   disconnect/reconnect works        a page reloaded mid-game is back in
//                                     the same match, still playing
//   the match ends normally           Forge's result, and both pages agree
//
// OPT-IN, and safe on a live server. It runs only with
// PROXIC_E2E_PRODUCTION=1 (so CI and the local suite skip it), it uses
// only decks the guest can already use, and it deletes nothing: no
// deck, no account, no room it did not make. It refuses to start if
// either player is already in a room or a match, rather than clearing
// one. Run it with scripts/run-production-check.ps1, which asks for the
// two passwords and passes them only to this process; traces are off so
// no password is ever written to disk.
//
// What it saw goes to test-results/production/: screenshots of both
// pages at the start, mid-game, after the reload and at the end, and
// report.json (no secrets in it).

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { secondPassword, secondUser, signInAs, testPassword, testUser } from "./helpers";
import {
  choices,
  chooseDeck,
  expectReady,
  inviteIn,
  isAsked,
  markReady,
  matchPanel,
  openRoom,
  seatOf,
  settlePregame,
} from "./match-helpers";

test.describe.configure({ timeout: 2_700_000 });
// No single step may wait out the clock: an action inherits the TEST
// timeout otherwise, and a locator that matches nothing then hangs for
// 45 minutes instead of failing (AGENTS e2e trap; both dry runs).
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

const OUT = "test-results/production";
// The RESULT line only (see match-alternate-win.spec.ts: "You won the
// die roll" must not end the loop).
const OVER =
  /You won on turn|You won\.|opponent won|was a draw|ended without a result|stopped before it finished/;

type Card = { id: string; seat: number; name?: string; art?: string };
type State = {
  seat?: number;
  stateRevision?: number;
  turn?: number;
  hand?: Card[];
  [zone: string]: unknown;
};

/** Every snapshot a page receives, across reloads. */
function snapshots(page: Page) {
  const seen: State[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/matches/")) return;
    socket.on("framereceived", (event) => {
      try {
        const frame = JSON.parse(String(event.payload)) as { type?: string; state?: State };
        if (frame.type === "MATCH_SNAPSHOT" && frame.state) seen.push(frame.state);
      } catch {
        // not JSON; not ours
      }
    });
  });
  return seen;
}

/** Every artwork reference anywhere in a snapshot. */
function artIn(state: State): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      const art = (value as { art?: unknown }).art;
      if (typeof art === "string") found.add(art);
      Object.values(value).forEach(walk);
    }
  };
  walk(state);
  return found;
}

async function current(page: Page, what: "rooms" | "matches") {
  const body = (await (await page.request.get(`/api/${what}/current`)).json()) as Record<
    string,
    { matchId?: string; roomId?: string; status?: string } | null
  >;
  return what === "rooms" ? body.room : body.match;
}

/** Decks the host owns that the guest has been given, by name. */
async function usableDecks(host: Page, guest: Page): Promise<string[]> {
  const mine = (
    (await (await host.request.get("/api/decks")).json()) as {
      mine: { deckId: string; displayName: string }[];
    }
  ).mine;
  const shared = new Set(
    (
      (await (await guest.request.get("/api/decks")).json()) as {
        sharedWithMe: { deckId: string }[];
      }
    ).sharedWithMe.map((deck) => deck.deckId),
  );
  return mine.filter((deck) => shared.has(deck.deckId)).map((deck) => deck.displayName);
}

/**
 * startAMatch (match-helpers.ts), with a deck PER SEAT: two different
 * decks give the players different pictures, which is what makes the
 * hidden-artwork check possible at all.
 */
async function startWithDecks(host: Page, guest: Page, hostDeck: string, guestDeck: string) {
  await host.goto("/play");
  await guest.goto("/play");
  await openRoom(host);
  await inviteIn(host, guest, secondUser);

  const readied: string[] = [];
  for (const [page, who, deck] of [
    [host, testUser, hostDeck],
    [guest, secondUser, guestDeck],
  ] as const) {
    await chooseDeck(page, deck, page === host ? undefined : testUser);
    for (const earlier of readied) await expectReady(seatOf(page, earlier));
    await markReady(page);
    await expectReady(seatOf(page, who));
    readied.push(who);
  }

  // PHASE_07 §7.64 — one button: prepared and launched behind it.
  const start = host.getByRole("button", { name: "Start match" });
  await expect(start).toBeEnabled();
  await start.click();
  await settlePregame(host, guest);
  for (const page of [host, guest]) {
    await expect(matchPanel(page).getByText(/The game is running/)).toBeVisible({
      timeout: 600_000,
    });
  }
}

test("one real game on the live site, both players, start to finish", async ({ browser }) => {
  test.skip(
    !process.env.PROXIC_E2E_PRODUCTION,
    "live-site check; run scripts/run-production-check.ps1",
  );
  mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = { site: test.info().project.use.baseURL };
  const shot = async (page: Page, name: string) =>
    page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const hostSeen = snapshots(host);
  const guestSeen = snapshots(guest);
  let started = false;
  let ours = false; // past the check that neither player had a room: any room now is this run's

  try {
    await signInAs(host, testUser, testPassword);
    await signInAs(guest, secondUser, secondPassword);

    // Never clear somebody's game on a live server: stop instead.
    for (const [page, who] of [
      [host, testUser],
      [guest, secondUser],
    ] as const) {
      expect(
        await current(page, "matches"),
        `${who} is already in a match -- finish or abandon it first`,
      ).toBeNull();
      expect(
        await current(page, "rooms"),
        `${who} is already in a room -- leave it first`,
      ).toBeNull();
    }

    ours = true;
    const decks = await usableDecks(host, guest);
    expect(decks.length, `${testUser} owns no deck shared with ${secondUser}`).toBeGreaterThan(0);
    const hostDeck = decks[0]!;
    const guestDeck = decks[1] ?? decks[0]!;
    report.decks = { [testUser]: hostDeck, [secondUser]: guestDeck };

    // 1-2. A prepared room launches, and Forge reaches RUNNING on both pages.
    await startWithDecks(host, guest, hostDeck, guestDeck);
    started = true;
    const matchId = (await current(host, "matches"))?.matchId;
    expect(matchId).toBeTruthy();
    expect((await current(guest, "matches"))?.matchId).toBe(matchId);
    report.matchId = matchId;
    await shot(host, "1-start-host");
    await shot(guest, "1-start-guest");

    // 5. A picture in this player's own hand actually renders.
    const handArt = matchPanel(host).locator("img.bf-art");
    await expect(handArt.first()).toBeVisible({ timeout: 60_000 });
    const rendered = await handArt.evaluateAll(
      (images) => images.filter((img) => (img as HTMLImageElement).naturalWidth > 0).length,
    );
    expect(rendered, "no card picture rendered for the host").toBeGreaterThan(0);
    report.picturesRendered = rendered;

    // 6. Hidden artwork, WHILE THE MATCH IS LIVE (the server serves a
    // match's pictures only then): a picture the host was sent and the
    // guest never was is refused to the guest and served to the host.
    // Tried at the start and again at the reload; with both players on
    // one deck the first moment may have no such picture yet.
    const checkHiddenArt = async () => {
      if (typeof report.hiddenArt === "object") return;
      const hostArt = new Set(hostSeen.flatMap((s) => [...artIn(s)]));
      const guestArt = new Set(guestSeen.flatMap((s) => [...artIn(s)]));
      const hidden = [...hostArt].find((art) => !guestArt.has(art));
      if (!hidden) {
        report.hiddenArt =
          "not testable yet: every picture the host saw was also shown to the guest";
        return;
      }
      const asset = `/api/matches/${matchId}/assets/${hidden}`;
      const forGuest = (await guest.request.get(asset)).status();
      const forHost = (await host.request.get(asset)).status();
      report.hiddenArt = { forHost, forGuest };
      expect(forHost, "the host could not fetch a picture it was shown").toBe(200);
      expect(forGuest, "the guest fetched a picture it was never shown").toBe(404);
    };
    await checkHiddenArt();

    // Play. Both pages answer whatever they are asked; lands first,
    // then any spell not already tried this turn (Forge offers spells
    // that cannot be paid for, and undoes them: one try per turn),
    // attack with everything, never block, aim at the opponent.
    const tried = new Set<string>();
    let lastQuestion = "";
    let sameQuestion = 0;
    let clicks = 0;
    let reloaded = false;
    let midShot = false;
    let lastProgress = Date.now();
    const deadline = Date.now() + 2_400_000;

    // From the whole panel's text, never by waiting for one element:
    // the line is "Turn 4 · upkeep" until a daybound card makes it "It
    // is day · Turn 11 · ...", and a locator anchored at "Turn" then
    // matched nothing and waited out the 45-minute clock (dry run 2).
    const turnOf = async (page: Page) => {
      const text = await matchPanel(page)
        .innerText({ timeout: 5_000 })
        .catch(() => "");
      return Number(/Turn (\d+)/.exec(text)?.[1] ?? 0);
    };

    while (Date.now() < deadline) {
      if (
        (await matchPanel(host).getByText(OVER).count()) > 0 &&
        (await matchPanel(guest).getByText(OVER).count()) > 0
      ) {
        break;
      }
      const turn = Math.max(await turnOf(host), await turnOf(guest));

      // 7. Mid-game, reload the guest's page.
      if (!reloaded && turn >= 4) {
        if (!midShot) {
          await shot(host, "2-midgame-host");
          await shot(guest, "2-midgame-guest");
          midShot = true;
        }
        await guest.reload();
        await expect(matchPanel(guest).getByText(/The game is running|Game over/)).toBeVisible({
          timeout: 120_000,
        });
        expect(
          (await current(guest, "matches"))?.matchId,
          "the reload landed in another match",
        ).toBe(matchId);
        await shot(guest, "3-after-reload-guest");
        report.reloadedOnTurn = turn;
        await checkHiddenArt();
        reloaded = true;
        continue;
      }

      const asking = async (page: Page) =>
        (await isAsked(page)) ||
        (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        if (Date.now() - lastProgress > 120_000) {
          // Nobody has been asked anything for two minutes.
          await shot(host, "stalled-host");
          await shot(guest, "stalled-guest");
          report.stalled = {
            on: "nobody asked",
            host: await matchPanel(host)
              .innerText()
              .catch(() => ""),
            guest: await matchPanel(guest)
              .innerText()
              .catch(() => ""),
          };
          throw new Error("stalled: neither page has a question to answer");
        }
        await host.waitForTimeout(150);
        continue;
      }
      const me = live === host ? testUser : secondUser;
      const them = live === host ? secondUser : testUser;
      const panel = matchPanel(live);
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const prompt = (await panel.locator(".decision-prompt").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (test: (label: string) => boolean) => labels.findIndex(test);

      let pick = -1;
      if (/attack with/i.test(prompt) || /Declare attackers/.test(heading)) {
        // Everything still offered: the list holds only creatures not
        // yet attacking. Not by label -- two "Goblin Token -- 1/1" read
        // the same, and skipping the second (a token that MUST attack)
        // had Forge refuse the declaration for ever (dry run 4).
        pick = labels.length ? 0 : -1;
      } else if (/block/i.test(prompt) || /Declare blockers/.test(heading)) {
        pick = -1;
      } else if (/Your move/.test(heading)) {
        pick = find((label) => /Play land/.test(label));
        if (pick < 0) {
          pick = find(
            (label) =>
              !/\{T\}: Add/.test(label) &&
              !tried.has(`${me}|${turn}|${label}`) &&
              / — \{/.test(label),
          );
          if (pick >= 0) tried.add(`${me}|${turn}|${labels[pick]}`);
        }
      } else if (/Choose a target|Choose what to attack/.test(heading)) {
        pick = find((label) => label === them);
        if (pick < 0) pick = find((label) => label !== me);
        if (pick < 0 && labels.length) pick = 0;
      } else if (labels.length) {
        // Mana, confirmations, the rest: Forge's first.
        pick = 0;
      }
      // A short limit on every click: a button that went away as the
      // game moved on would otherwise be waited for until the test's
      // own 45-minute timeout (it stalled the first dry run that way).
      const target = pick >= 0 ? options.nth(pick) : panel.getByRole("button", { name: "Pass" });
      const clicked = await target
        .click({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      // The same question answered the same way, again and again, is
      // a loop -- as stuck as a frozen page, only busier.
      const question = `${turn}|${me}|${heading}|${prompt}|${labels.join("/")}|${pick}`;
      sameQuestion = question === lastQuestion ? sameQuestion + 1 : 0;
      lastQuestion = question;
      if (clicked && sameQuestion < 30) {
        clicks++;
        lastProgress = Date.now();
      } else if (sameQuestion >= 30 || Date.now() - lastProgress > 120_000) {
        // Nothing has moved for two minutes: say exactly what was on
        // screen, rather than waiting out the clock.
        await shot(host, "stalled-host");
        await shot(guest, "stalled-guest");
        report.stalled = {
          on: me,
          heading,
          prompt,
          labels,
          pick,
          disabled: await target.isDisabled().catch(() => null),
        };
        throw new Error(`stalled: ${me} asked "${heading}" ${JSON.stringify(labels)}`);
      }
      await live.waitForTimeout(40);
    }
    report.clicks = clicks;

    // 8. The match ended normally, and both pages agree who won.
    const hostLine =
      (await matchPanel(host)
        .getByText(OVER)
        .first()
        .textContent({ timeout: 5_000 })
        .catch(() => "")) ?? "";
    const guestLine =
      (await matchPanel(guest)
        .getByText(OVER)
        .first()
        .textContent({ timeout: 5_000 })
        .catch(() => "")) ?? "";
    report.result = { [testUser]: hostLine, [secondUser]: guestLine };
    await shot(host, "4-end-host");
    await shot(guest, "4-end-guest");
    expect(hostLine, "the game did not end in time").toMatch(OVER);
    expect(/You won/.test(hostLine) !== /You won/.test(guestLine), "both or neither won").toBe(
      true,
    );
    expect(reloaded, "the game ended before the reload test could run").toBe(true);

    // 3. Viewer-safe: every snapshot each page received holds only that
    // player's own hand, and the two players' views differ.
    const handProblems: string[] = [];
    for (const [name, seen] of [
      [testUser, hostSeen],
      [secondUser, guestSeen],
    ] as const) {
      for (const state of seen) {
        for (const card of state.hand ?? []) {
          if (card.seat !== state.seat)
            handProblems.push(`${name} was sent ${card.name ?? card.id} in hand`);
        }
      }
    }
    expect(handProblems, handProblems.slice(0, 5).join("; ")).toEqual([]);
    const differ = hostSeen.some((h) =>
      guestSeen.some(
        (g) =>
          g.stateRevision === h.stateRevision && JSON.stringify(g.hand) !== JSON.stringify(h.hand),
      ),
    );
    expect(differ, "the two players were never sent different views").toBe(true);
    report.snapshots = { [testUser]: hostSeen.length, [secondUser]: guestSeen.length };

    expect(
      report.hiddenArt !== undefined && typeof report.hiddenArt === "object",
      `hidden artwork was never testable: ${String(report.hiddenArt)}`,
    ).toBe(true);
  } finally {
    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    // Leave no game running on the live site if this stopped early.
    // Abandoning is what a player would do; nothing else is touched.
    if (started || ours) {
      for (const page of [host, guest]) {
        const match = await current(page, "matches").catch(() => null);
        if (
          match?.matchId &&
          !(await matchPanel(page)
            .getByText(OVER)
            .count()
            .catch(() => 0))
        ) {
          const csrf =
            (await page.context().cookies()).find((c) => c.name === "proxicarena_csrf")?.value ??
            "";
          await page.request
            .post(`/api/matches/${match.matchId}/abandon`, { headers: { "X-CSRF-Token": csrf } })
            .catch(() => undefined);
        }
      }
    }
    // And the room this run made, so the next run (or a real game)
    // starts from the lobby.
    if (ours) {
      for (const page of [host, guest]) {
        const room = await current(page, "rooms").catch(() => null);
        if (room?.roomId) {
          const csrf =
            (await page.context().cookies()).find((c) => c.name === "proxicarena_csrf")?.value ??
            "";
          const headers = { "X-CSRF-Token": csrf };
          if (page === host)
            await page.request
              .post(`/api/rooms/${room.roomId}/close`, { headers })
              .catch(() => undefined);
          await page.request
            .post(`/api/rooms/${room.roomId}/leave`, { headers })
            .catch(() => undefined);
        }
      }
    }
    await host.context().close();
    await guest.context().close();
  }
});
