// PHASE_11 P11-E6 -- the game's code before the game.
//
// While a player sits in a room, the game's code and the common mana
// pictures are fetched ahead (early.ts `preloadGame`, shell/Shell.tsx
// `useGameAhead`), so "Start match" opens the game on what the browser
// already has. A player not in a room fetches none of it. The mana pictures
// are files of their own (manaPictures.ts, tools/bundle/manaFiles.test.ts),
// never text inside the code.
//
// Real clicks, a real room and a real match: the host opens a room, the
// guest accepts, both sit; then Start match, and the game's page asks for
// none of its code again.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import {
  clearEverything,
  inviteIn,
  matchPanel,
  openRoom,
  sharedDeck,
  chooseDeck,
  expectReady,
  markReady,
  seatOf,
} from "./match-helpers";

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

/** The common symbols (manaPictures.ts `COMMON_SYMBOLS`): fifteen pictures. */
const COMMON = 15;

/** Every request [page] makes from now on, with when it was made. */
function requests(page: Page) {
  const seen: { path: string; type: string; at: number }[] = [];
  page.on("request", (rq) =>
    seen.push({ path: new URL(rq.url()).pathname, type: rq.resourceType(), at: Date.now() }),
  );
  return seen;
}

/**
 * The game page's own code, as the build names it in index.html (vite.config.ts
 * `earlyFiles`): its scripts that no header page also needs (those the
 * header pages' code ahead, P11-E7/E8, fetches anyway).
 */
async function gameOnlyScripts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const early = JSON.parse(document.getElementById("pa-early")?.textContent ?? "{}") as {
      files?: string[];
      pages?: Record<string, number[]>;
    };
    const of = (path: string) => (early.pages?.[path] ?? []).map((i) => `/${early.files![i]!}`);
    const others = new Set(["/play", "/hall", "/decks", "/account", "/admin"].flatMap(of));
    return of("/game").filter((f) => f.endsWith(".js") && !others.has(f));
  });
}

test("P11-E6: sitting in a room fetches the game's code and mana pictures ahead; Start match asks for none of the code again", async ({
  browser,
}) => {
  test.skip(!pkg, "no deck package available");
  test.setTimeout(600_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, pkg!);

  try {
    // Not in a room: the lobby fetches none of the game's code.
    const hostSeen = requests(host);
    const guestSeen = requests(guest);
    await host.goto("/play");
    await guest.goto("/play");
    const gameOnly = await gameOnlyScripts(host);
    expect(gameOnly.length, "the game has code of its own").toBeGreaterThan(0);
    await host.waitForTimeout(3_000); // past the page's load and the header pages' second
    expect(
      hostSeen.filter((r) => gameOnly.includes(r.path)),
      "a player in no room fetches no game code",
    ).toEqual([]);
    const pictures = () => hostSeen.filter((r) => r.type === "image" && r.path.endsWith(".png"));
    expect(pictures(), "and no mana picture").toEqual([]);

    // In a room: both seats fetch the game's code and the common pictures ahead.
    await openRoom(host);
    await inviteIn(host, guest, secondUser);
    for (const [who, seen] of [
      ["host", hostSeen],
      ["guest", guestSeen],
    ] as const)
      await expect
        .poll(
          () => ({
            code: gameOnly.filter((f) => seen.some((r) => r.path === f)).length,
            pictures: new Set(
              seen
                .filter((r) => r.type === "image" && /^\/assets\/[^/]+\.png$/.test(r.path))
                .map((r) => r.path),
            ).size,
          }),
          { message: `the ${who} sitting in the room fetched the game ahead`, timeout: 20_000 },
        )
        .toEqual({ code: gameOnly.length, pictures: COMMON });
    // Each file once.
    for (const f of gameOnly)
      expect(
        hostSeen.filter((r) => r.path === f),
        `${f} once`,
      ).toHaveLength(1);
    // The game's links are gone once their files are in (WebKit, PHASE_11
    // E7/E8); the start-up's own (P11-E5) stay, as they always have.
    await expect
      .poll(() =>
        host.evaluate(
          (game) =>
            [
              ...document.querySelectorAll<HTMLLinkElement>(
                "link[rel=preload], link[rel=modulepreload]",
              ),
            ]
              .map((l) => new URL(l.href).pathname)
              .filter((p) => game.includes(p) || p.endsWith(".png")),
          gameOnly,
        ),
      )
      .toEqual([]);

    // Decks and Ready (each only once that page has seen the other seat
    // ready: a stale room revision is refused), then Start match, with real
    // clicks: the game's page opens on the code it already has.
    await chooseDeck(host, deck);
    await markReady(host);
    await chooseDeck(guest, deck, testUser);
    await expectReady(seatOf(guest, testUser));
    await markReady(guest);
    await expectReady(seatOf(host, secondUser));
    let at = 0;
    host.on("framenavigated", (frame) => {
      if (frame === host.mainFrame() && new URL(frame.url()).pathname === "/game" && !at)
        at = Date.now();
    });
    await host.getByRole("button", { name: "Start match" }).click();
    // The table, drawn from its first board (the life totals).
    await expect(matchPanel(host).locator(".gs-life-n").first()).toBeVisible({ timeout: 120_000 });
    expect(at, "the host went to the game's page").toBeGreaterThan(0);
    expect(
      hostSeen.filter((r) => r.at >= at && r.type === "script" && gameOnly.includes(r.path)),
      "no game code asked again after Start match",
    ).toEqual([]);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
  }
});
