// Card pictures come as WebP and draw -- spec 0121, F-0121-G (TEST-012).
//
// Arena makes every card picture's table copy and close-up a WebP at
// quality 80 (owner 2026-11-27). This plays a real game with the WebP test
// deck (Forests and Llanowar Elves, each with an art crop) in whichever
// engine runs it -- Chromium here and in CI's game machines, Firefox and
// WebKit in CI's engines job (UI-007) -- and checks, from the answers the
// browser really got and the pictures it really drew:
//
//   - the Deck Depot: a card's close-up (its zoom);
//   - the game: the hand's pictures, the Elves' picture on the stack (the
//     card being cast and its stack slot), its art window's crop once it
//     lands, and a hand card's close-up (the reading card);
//   - an old per-match address (/api/matches/{id}/assets/{sha}) still draws.
//
// Each is answered `image/webp` with spec 0052's cache rule and drawn
// (`naturalWidth` above 0). The opening hands are dealt (spec 0098), so the
// first player has a Forest and the Elves at once; the player who goes first
// plays the Forest and casts the Elves by clicking them.
//
// The deck is protocol/fixtures/webp-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/webp-deck.zip" protocol/fixtures/webp-deck --crops
//
// PROXIC_WEBP_DECK=<package> plays the same game with another deck holding
// Forests and Llanowar Elves -- a real one (Basic_Mono_Green_60_Card_Deck),
// for the look by eye (TEST-011). A deck without art crops shows the picture
// zoomed in the art window, so that is what is checked there.

import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
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

const pkg =
  process.env["PROXIC_WEBP_DECK"] ?? join(process.cwd(), "..", "Test Deck", "webp-deck.zip");
/** The art window's picture: the crop (the test deck brings crops), or the picture zoomed. */
const ART = process.env["PROXIC_WEBP_DECK"] ? "img.bf-art" : "img.bf-crop";
const HAND = ["Forest", "Llanowar Elves", "Forest", "Forest", "Forest", "Forest", "Forest"];
const CACHE = "private, max-age=31536000, immutable";
const PICTURE = /\/api\/(pictures|matches\/[^/]+\/assets|decks\/[^/]+\/assets)\/[0-9a-f]{64}/;

/** Every picture answer a page got: its address (path and query), type and cache rule. */
function pictureAnswers(page: Page) {
  const answers = new Map<string, { type: string; cache: string; status: number }>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!PICTURE.test(url.pathname)) return;
    const headers = response.headers();
    answers.set(url.pathname + url.search, {
      type: headers["content-type"] ?? "",
      cache: headers["cache-control"] ?? "",
      status: response.status(),
    });
  });
  return answers;
}

type Drawn = { src: string; natural: number; complete: boolean };

/** The pictures under [selector]: their addresses and whether they drew. */
const drawn = (page: Page, selector: string) =>
  page.evaluate(async (selector) => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>(selector)];
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
    // Card pictures only: not the page's own art (a card back, a frame).
    return imgs
      .map((img) => {
        const url = new URL(img.currentSrc || img.src, location.href);
        return {
          src: url.pathname + url.search,
          natural: img.naturalWidth,
          complete: img.complete,
        };
      })
      .filter((picture) => picture.src.startsWith("/api/"));
  }, selector);

/**
 * Every picture that is ever drawn on the stack or as the card being cast,
 * recorded as it loads: the stack is there for a moment only.
 */
async function watchStack(page: Page) {
  await page.evaluate(() => {
    const seen: { src: string; natural: number }[] = [];
    (window as unknown as { __stackPictures: typeof seen }).__stackPictures = seen;
    const note = (img: HTMLImageElement) => {
      const record = () => {
        const url = new URL(img.currentSrc || img.src, location.href);
        if (url.pathname.startsWith("/api/"))
          seen.push({ src: url.pathname + url.search, natural: img.naturalWidth });
      };
      if (img.complete && img.naturalWidth > 0) record();
      else img.addEventListener("load", record, { once: true });
    };
    new MutationObserver(() => {
      document
        .querySelectorAll<HTMLImageElement>(
          ".bf-stack-slot img, .gs-cast-picture img, img.gs-cast-picture",
        )
        .forEach((img) => {
          if (img.dataset["watched"] === "1") return;
          img.dataset["watched"] = "1";
          note(img);
        });
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  });
}

const stackPictures = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __stackPictures?: { src: string; natural: number }[] })
        .__stackPictures ?? [],
  );

/** Each of [pictures] drew, and its answer was a WebP under the cache rule. */
function expectWebp(
  where: string,
  pictures: Drawn[] | { src: string; natural: number }[],
  answers: Map<string, { type: string; cache: string; status: number }>,
) {
  expect(pictures.length, `${where}: pictures shown`).toBeGreaterThan(0);
  for (const picture of pictures) {
    expect(picture.natural, `${where}: ${picture.src} drew`).toBeGreaterThan(0);
    const answer = answers.get(picture.src);
    expect(answer, `${where}: ${picture.src} was fetched`).toBeDefined();
    expect(answer!.type, `${where}: ${picture.src}`).toBe("image/webp");
    expect(answer!.cache, `${where}: ${picture.src}`).toBe(CACHE);
  }
}

test("card pictures come as WebP and draw: the Deck Depot's close-up, the hand, the stack, an art window, a close-up", async ({
  browser,
  browserName,
}) => {
  test.skip(!existsSync(pkg), "no WebP deck package (CI builds it)");
  test.setTimeout(600_000);
  mkdirSync("test-results/seen", { recursive: true });
  const shot = (name: string) => `test-results/seen/webp-${browserName}-${name}.png`;

  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const hostAnswers = pictureAnswers(host);
  const guestAnswers = pictureAnswers(guest);
  // The game's id, from its socket's address (/ws/matches/{id}).
  const matchIds = new Map<Page, string>();
  for (const page of [host, guest]) {
    page.on("websocket", (ws) => {
      const id = ws.url().match(/\/ws\/matches\/([0-9a-f-]{36})/)?.[1];
      if (id) matchIds.set(page, id);
    });
  }
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deckName = await sharedDeck(host, guest, pkg);

    // --- the Deck Depot: a card's close-up --------------------------------
    await host.goto("/decks");
    await host
      .getByRole("region", { name: "My decks" })
      .getByRole("listitem")
      .filter({ hasText: deckName })
      .getByRole("button", { name: "view" })
      .first()
      .click();
    await host.getByRole("button", { name: "Zoom Llanowar Elves" }).first().click();
    const zoom = host.getByRole("dialog");
    await expect(zoom.locator("img")).toHaveAttribute("src", /\?size=full$/, { timeout: 30_000 });
    const depot = await drawn(host, ".pa-zoom img");
    expectWebp("Deck Depot close-up", depot, hostAnswers);
    await host.screenshot({ path: shot("depot-close-up") });
    await host.keyboard.press("Escape");

    // --- a game ------------------------------------------------------------
    await startAMatch(host, guest, deckName, {
      deal: { host: { hand: HAND }, guest: { hand: HAND } },
    });
    for (const page of [host, guest]) await watchStack(page);

    // The hand's pictures, for both players.
    for (const [page, answers, who] of [
      [host, hostAnswers, "host"],
      [guest, guestAnswers, "guest"],
    ] as const) {
      const hand = page.locator('.bf-cards [data-zone="viewer:hand"] img');
      await expect(hand.first()).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(
          async () =>
            (await drawn(page, '.bf-cards [data-zone="viewer:hand"] img')).every(
              (p) => p.natural > 0,
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
      expectWebp(
        `${who}'s hand`,
        await drawn(page, '.bf-cards [data-zone="viewer:hand"] img'),
        answers,
      );
    }
    await host.screenshot({ path: shot("hand") });

    // Whoever goes first plays a Forest and casts the Elves; the other passes.
    let caster: Page | null = null;
    let landed = false;
    let stackShot = false;
    const elvesOnBoard = (page: Page) =>
      page.locator(
        '.bf-cards button[data-object-id][data-controller="viewer"]:not([data-zone="viewer:hand"])',
        {
          hasText: /^Llanowar Elves/,
        },
      );
    const deadline = Date.now() + 360_000;
    const watch = watchGame([host, guest], () => ({
      caster: caster === host ? "host" : caster ? "guest" : null,
      landed,
    }));
    while (!landed && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        if (caster && (await elvesOnBoard(caster).locator(ART).count()) > 0) {
          landed = true;
          break;
        }
        if (await discardIfAsked(page)) continue;
        if (await answerCardTray(page)) continue;
        if ((await matchPanel(page).locator("button.gs-act-combat").count()) > 0) {
          await passCombat(page);
          continue;
        }
        const yourMove =
          (await matchPanel(page)
            .getByRole("heading", { name: /Your move/ })
            .count()) > 0;
        const playable = page.locator(
          '.bf-cards [data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])',
        );
        const owing = page.locator(
          '.bf-cards button[data-choosable="true"]:not([data-zone="viewer:hand"])',
        );
        if ((await page.locator(".gs-cast").count()) > 0 && (await owing.count()) > 0) {
          await clickUnlessCombat(owing);
        } else if (
          yourMove &&
          (caster === null || caster === page) &&
          (await elvesOnBoard(page).count()) === 0
        ) {
          const elves = playable.filter({ hasText: /^Llanowar Elves/ });
          const forest = playable.filter({ hasText: /^Forest/ });
          if ((await elves.count()) > 0) {
            caster = page;
            await elves
              .first()
              .click({ timeout: 5_000 })
              .catch(() => undefined);
          } else if ((await forest.count()) > 0 && caster === null) {
            await forest
              .first()
              .click({ timeout: 5_000 })
              .catch(() => undefined);
          } else await clickNow(passButton(page));
        } else if (yourMove) await clickNow(passButton(page));
        // The caster's own view of the Elves waiting on the stack, for the eye.
        if (
          !stackShot &&
          page === caster &&
          (await page.locator(".bf-stack-slot img").count()) > 0
        ) {
          stackShot = true;
          await page.waitForTimeout(700);
          await page.screenshot({ path: shot("stack") });
        }
        await page.waitForTimeout(150);
      }
    }
    expect(caster, "a player cast the Elves").not.toBeNull();
    expect(landed, "the Elves landed and show their art crop").toBe(true);
    const other = caster === host ? guest : host;
    const casterAnswers = caster === host ? hostAnswers : guestAnswers;
    const otherAnswers = caster === host ? guestAnswers : hostAnswers;

    // The stack: the Elves' picture as it was cast and while it waited there.
    const casterStack = await stackPictures(caster!);
    expectWebp("the caster's stack", casterStack, casterAnswers);
    expectWebp("the other player's stack", await stackPictures(other), otherAnswers);

    // The art window: the crop, for both players.
    const crop = await drawn(caster!, `.bf-cards button[data-controller="viewer"] ${ART}`);
    expectWebp("the caster's art window", crop, casterAnswers);
    const theirs = other.locator(`.bf-cards button[data-controller="opponent"] ${ART}`);
    await expect(theirs.first()).toBeVisible({ timeout: 30_000 });
    expectWebp(
      "the other player's art window",
      await drawn(other, `.bf-cards button[data-controller="opponent"] ${ART}`),
      otherAnswers,
    );
    await caster!.screenshot({ path: shot("art-window") });

    // A close-up: the reading card of a hand card, its sharp copy loaded.
    const card = caster!.locator('.bf-cards button[data-zone="viewer:hand"]').first();
    const box = (await card.boundingBox())!;
    await caster!.mouse.move(box.x + box.width * 0.3, box.y - 200, { steps: 3 });
    await caster!.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 8 });
    const scan = caster!.locator("img.bf-read-scan");
    await expect(scan).toHaveAttribute("src", /\?size=full$/, { timeout: 30_000 });
    const closeUp = await drawn(caster!, "img.bf-read-scan");
    expectWebp("a close-up", closeUp, casterAnswers);
    await caster!.waitForTimeout(600); // its fade-in, for the eye
    await caster!.screenshot({ path: shot("close-up") });

    // An old per-match address still draws, as a WebP.
    const matchId = matchIds.get(caster!);
    expect(matchId, "the game's id, from its socket").toBeDefined();
    const sha = crop[0]!.src.match(/[0-9a-f]{64}/)![0];
    const old = `/api/matches/${matchId}/assets/${sha}`;
    const oldDrawn = await caster!.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode().catch(() => undefined);
      return { src, natural: img.naturalWidth, complete: img.complete };
    }, old);
    expectWebp("an old per-match address", [oldDrawn], casterAnswers);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await host.context().close();
    await guest.context().close();
  }
});
