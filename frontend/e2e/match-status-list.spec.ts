// Phase 9 W-21 (Amendment 18, owner 2026-11-05) -- the status tray's list,
// and Peek, in a real game on the real server.
//
// What the game sends was proven by the Mechanics Lab (check-tracked-state:
// `emblem`, `initiative`, `ring`): an emblem's words, a dungeon's rooms. A
// game that reaches the Ring, a dungeon AND an emblem for both players is
// many turns of luck, so here the guest's own snapshot is said again with
// those fields filled the way the worker fills them (routeWebSocket), and
// the page is checked: short names, never a lone "+N"; the list beside the
// tray, clear of the turn steps, the action button and both plates; what
// each thing does; Esc, a click away and the chip close it; one list at a
// time; Space and the Peek button fade it -- and the opening windows too.

import { expect, test, type Locator, type Page, type WebSocketRoute } from "@playwright/test";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  clearEverything,
  matchPanel,
  settlePregame,
  sharedDeck,
  startAMatch,
} from "./match-helpers";

type Player = Record<string, unknown> & { seat: number };
const LILIANA = "Emblem — Liliana, Defiant Necromancer";

/** The Undercity's rooms as the worker sends them, the marker in the first. */
const UNDERCITY = {
  name: "Undercity",
  rooms: [
    {
      name: "Secret Entrance",
      says: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle.",
      next: ["Forge", "Lost Well"],
      here: true,
    },
    {
      name: "Forge",
      says: "Put two +1/+1 counters on target creature.",
      next: ["Trap!", "Arena"],
    },
    { name: "Lost Well", says: "Scry 2.", next: ["Arena", "Stash"] },
  ],
};

const faded = (window: Locator) => window.evaluate((el) => el.classList.contains("gs-win-peek"));

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "on screen").not.toBeNull();
  return b!;
}

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Space held, then the Peek button held: the window fades each time, and comes back. */
async function peeks(page: Page, window: Locator) {
  expect(await faded(window)).toBe(false);
  await page.keyboard.down("Space");
  await expect.poll(() => faded(window)).toBe(true);
  await page.keyboard.up("Space");
  await expect.poll(() => faded(window)).toBe(false);
  const peek = window.getByRole("button", { name: /^Peek/ });
  await expect(peek).toBeVisible();
  await peek.hover();
  await page.mouse.down();
  await expect.poll(() => faded(window)).toBe(true);
  await page.mouse.up();
  await expect.poll(() => faded(window)).toBe(false);
}

test("the status tray's list says what things do, beside the tray; Space and Peek fade every window", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  // The guest's game socket: its last snapshot, said again with more in it.
  let client: WebSocketRoute | null = null;
  let last = "";
  await guest.routeWebSocket("**/ws/matches/**", (ws) => {
    client = ws;
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.includes('"MATCH_SNAPSHOT"')) last = message;
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });

  try {
    const deck = await sharedDeck(
      host,
      guest,
      join(process.cwd(), "..", "Test Deck", "ci-deck.zip"),
    );
    await startAMatch(host, guest, deck, { settle: false });

    // The first pregame window (Play or draw, or the opening hand) fades.
    let asked: Page | null = null;
    await expect
      .poll(
        async () => {
          for (const p of [host, guest])
            if (await matchPanel(p).locator(".gs-opening").count()) asked = p;
          return asked !== null;
        },
        { timeout: 300_000 },
      )
      .toBe(true);
    const opening = matchPanel(asked!).locator(".gs-opening");
    await expect(opening.getByRole("button", { name: /^Peek/ })).toBeVisible();
    await asked!.screenshot({ path: "test-results/seen/w21-opening-peek.png" });
    await peeks(asked!, opening);

    await settlePregame(host, guest);
    await expect(matchPanel(guest).getByText(/The game is running/)).toBeAttached({
      timeout: 600_000,
    });
    await expect.poll(() => last !== "").toBe(true);

    const send = (mine: Partial<Player>, theirs: Partial<Player>) => {
      const said = JSON.parse(last) as { state: { seat: number; players: Player[] } };
      said.state.players = said.state.players.map((p) => ({
        ...p,
        ...(p.seat === said.state.seat ? mine : theirs),
      }));
      client?.send(JSON.stringify(said));
    };
    const panel = matchPanel(guest);
    const myTray = panel.locator(".gs-status-viewer");
    const theirTray = panel.locator(".gs-status-opponent");

    // One emblem with a long name: its short name shows, not a lone "+1".
    send(
      {
        command: [LILIANA],
        commandWords: [
          {
            name: LILIANA,
            says: "Whenever a creature dies, return it to the battlefield under your control at the beginning of the next end step.",
          },
        ],
      },
      {},
    );
    await expect(myTray.locator(".gs-chip-zone")).toHaveText("Liliana emblem");
    await expect(myTray.locator(".gs-chip-more")).toHaveCount(0);

    // A busy game for both players.
    send(
      {
        manaPool: { U: 1, R: 2 },
        counters: [
          { name: "POISON", count: 3 },
          { name: "ENERGY", count: 4 },
        ],
        designations: ["monarch", "initiative"],
        ringTempted: 2,
        command: ["The Ring", "Undercity (room: Secret Entrance)", LILIANA],
        commandWords: [
          { name: "The Ring" },
          UNDERCITY,
          {
            name: LILIANA,
            says: "Whenever a creature dies, return it to the battlefield under your control at the beginning of the next end step.",
          },
        ],
      },
      {
        counters: [{ name: "POISON", count: 7 }],
        designations: ["city's blessing"],
        command: [LILIANA],
        commandWords: [
          {
            name: LILIANA,
            says: "Whenever a creature dies, return it to the battlefield under your control at the beginning of the next end step.",
          },
        ],
      },
    );
    await expect(myTray.locator(".gs-chip-more")).toBeVisible();
    // Never a lone "+N": something shows beside it in each tray.
    for (const tray of [myTray, theirTray]) {
      expect(await tray.locator(".gs-chip:not(.gs-chip-more), .gs-mana").count()).toBeGreaterThan(
        0,
      );
    }

    // Opened, beside the tray: left of the column, clear of the steps,
    // the action button and both plates.
    await myTray.locator(".gs-chip-more").click();
    const list = panel.getByRole("dialog", { name: /everything in play for you/ });
    await expect(list).toBeVisible();
    const listBox = await box(list);
    const rail = await box(panel.locator(".bf-rail"));
    expect(listBox.x + listBox.width, "left of the right-hand column").toBeLessThanOrEqual(
      rail.x + 1,
    );
    expect(listBox.y, "on the screen").toBeGreaterThanOrEqual(0);
    for (const piece of [".gs-steps", ".gs-act", ".gs-seat"]) {
      for (const one of await panel.locator(piece).all()) {
        if (!(await one.isVisible())) continue;
        expect(overlaps(listBox, await box(one)), `the list covers ${piece}`).toBe(false);
      }
    }
    // What each thing does.
    await expect(list).toContainText("You draw a card at the end of your turn");
    await expect(list).toContainText("Venture into the Undercity each upkeep");
    await expect(list.locator(".gs-status-ring .gs-status-lit")).toHaveCount(2);
    await expect(list.locator(".gs-status-ring .gs-status-off")).toHaveCount(2);
    await expect(list).toContainText("Undercity · in Secret Entrance");
    await expect(list).toContainText(
      "Next: Forge (Put two +1/+1 counters on target creature) or Lost Well (Scry 2)",
    );
    await expect(list).toContainText("Liliana, Defiant Necromancer's emblem");
    await expect(list).toContainText("Whenever a creature dies");
    await expect(list.locator(".gs-mana img")).toHaveCount(2);
    await guest.screenshot({ path: "test-results/seen/w21-list-yours.png" });

    // Space and Peek fade it.
    await peeks(guest, list);

    // Esc closes it; a click on the table closes it.
    await guest.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await myTray.locator(".gs-chip-more").click();
    await expect(list).toBeVisible();
    const table = await box(panel.locator(".bf-rail"));
    await guest.mouse.click(table.x / 2, table.y + table.height / 2);
    await expect(list).toHaveCount(0);

    // One at a time: opening theirs closes yours.
    await myTray.locator(".gs-chip-more").click();
    await expect(list).toBeVisible();
    await theirTray.locator(".gs-chip-more, .gs-chip-zone, .gs-chip-marker").first().click();
    const theirs = panel.getByRole("dialog", { name: /everything in play for them/ });
    await expect(theirs).toBeVisible();
    await expect(list).toHaveCount(0);
    await expect(theirs).toContainText(
      "Yours for the rest of the game: cards with ascend count it.",
    );
    const theirBox = await box(theirs);
    expect(theirBox.x + theirBox.width).toBeLessThanOrEqual(rail.x + 1);
    for (const one of await panel.locator(".gs-steps, .gs-act, .gs-seat").all()) {
      if (!(await one.isVisible())) continue;
      expect(overlaps(theirBox, await box(one)), "their list covers the column").toBe(false);
    }
    await guest.screenshot({ path: "test-results/seen/w21-list-theirs.png" });
    // The chip again closes it.
    await theirTray.locator(".gs-chip-more, .gs-chip-zone, .gs-chip-marker").first().click();
    await expect(theirs).toHaveCount(0);

    // The graveyard viewer fades too.
    await panel
      .getByRole("button", { name: /'s graveyard, \d+ cards$/ })
      .first()
      .click();
    const viewer = panel.locator(".gs-backdrop").filter({ has: guest.locator(".gs-viewer") });
    await expect(viewer).toBeVisible();
    await peeks(guest, viewer);
    await guest.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);

    // A question's window (here "List choices", a tray): Peek where
    // "Hold Space to see the table" was.
    // Whoever holds priority has choices to list.
    const listChoices = (p: Page) => p.getByRole("button", { name: /^List choices/ });
    let chooser: Page | null = null;
    await expect
      .poll(
        async () => {
          for (const p of [guest, host]) if (await listChoices(p).count()) chooser = p;
          return chooser !== null;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    await listChoices(chooser!).click();
    const every = chooser!.getByRole("dialog", { name: "Every choice" });
    await expect(every).toBeVisible();
    await chooser!.screenshot({ path: "test-results/seen/w21-tray-peek.png" });
    await peeks(chooser!, every);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
