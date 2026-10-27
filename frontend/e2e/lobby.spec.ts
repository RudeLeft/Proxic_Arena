// Two players, one room — PHASE_05 AMENDMENTS 1–4, and the PHASE_07
// Lobby (§7.64, Amendments 9 and 11) through real clicks (§7.68).
//
// The part of the lobby that cannot be faked from one browser. Two
// contexts are two cookie jars and two sockets, which is the only
// honest way to show that an invitation REACHED somebody: a single
// page can be told what to render, but it cannot be told what the
// server will push to another connection.
//
// What this covers that the server suite cannot: that the page
// actually renders what arrives. The Kotlin tests prove the frames
// are correct; these prove a human would see them.
//
// Both accounts must exist on the stack under test:
//
//   docker compose exec arena-server /app/bin/arena-admin create Pat

import { test, expect, type Page, type WebSocket } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";
import { chooseDeck, inviteIn, openRoom, seatOf, yourRoom } from "./match-helpers";

/**
 * Leave or close whatever room this user is in.
 *
 * §5.5 is one room at a time, so a run that left a room behind
 * would fail the NEXT run at "Open a room" — and it would fail
 * with ALREADY_IN_A_ROOM, which looks like a bug in the code
 * rather than in the fixture.
 */
async function leaveAnyRoom(page: Page) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "proxicarena_csrf")?.value;
  if (!csrf) return;
  const current = (await (await page.request.get("/api/rooms/current")).json()) as {
    room: { roomId: string; hostUserId: string } | null;
  };
  if (!current.room) return;
  await page.request.post(`/api/rooms/${current.room.roomId}/leave`, {
    headers: { "X-CSRF-Token": csrf },
  });
}

async function openLobby(page: Page) {
  // Signing in lands in the lobby already. Loading it again opened a
  // second lobby connection while the first was still on the server
  // (up to 45 s) -- a second "tab", in use, so the away test never
  // went away on CI (its socket log showed both, 2026-10-24).
  if (new URL(page.url()).pathname !== "/play") await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
  // The heading renders before the lobby socket is open; the header's
  // light says when it is. Chat keeps no history, so a line sent
  // before the other player is connected never reaches them.
  await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
}

const players = (page: Page) => page.getByRole("region", { name: "Players" });
const playerRow = (page: Page, name: string) =>
  players(page).getByRole("listitem").filter({ hasText: name });

async function twoPlayers(
  browser: import("@playwright/test").Browser,
  body: (host: Page, guest: Page) => Promise<void>,
  /** Before the guest's first page: a fake clock, a socket listener. */
  prepareGuest?: (context: import("@playwright/test").BrowserContext) => Promise<void>,
) {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await leaveAnyRoom(host);

  const guestContext = await browser.newContext();
  await prepareGuest?.(guestContext);
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await leaveAnyRoom(guest);

  try {
    await openLobby(host);
    await openLobby(guest);
    await body(host, guest);
  } finally {
    await leaveAnyRoom(host);
    await leaveAnyRoom(guest);
    await hostContext.close();
    await guestContext.close();
  }
}

test("a host invites somebody who is online, and they take the empty seat", async ({ browser }) => {
  await twoPlayers(browser, async (host, guest) => {
    // Amendment 11 — the host can SEE somebody to invite them.
    await expect(playerRow(host, secondUser)).toContainText("In the lobby");

    // Amendment 9 — a room is opened on demand, and may be named.
    await openRoom(host, "Kitchen Table");
    await expect(yourRoom(host).locator(".pa-room-taken")).toHaveText("1/2");

    // AMENDMENT 1 — no code is typed anywhere. The host clicks a
    // name, and that is the only door into the room.
    await players(host)
      .getByRole("button", { name: new RegExp(`^Invite ${secondUser}$`, "i") })
      .click();
    await expect(playerRow(host, secondUser)).toContainText("Invited to Kitchen Table");

    // The guest is asked, and may put it aside: the invitation then
    // waits on the room's row (canvas note).
    const dialog = guest.getByRole("dialog");
    await expect(dialog).toContainText(`${testUser} has invited you to join Kitchen Table`);
    await dialog.getByRole("button", { name: "Put this aside for now" }).click();
    await expect(dialog).toHaveCount(0);
    const kitchen = guest.getByRole("article", { name: "Kitchen Table" });
    // Spec 0016 (14) — said in full on the card, with Accept and Decline.
    await expect(kitchen).toContainText(`${testUser} has invited you to join Kitchen Table`);
    await expect(kitchen.getByRole("button", { name: "Decline" })).toBeVisible();
    await kitchen.getByRole("button", { name: "Accept" }).click();

    // BOTH sides learn, from one message with one source of truth.
    await expect(yourRoom(guest)).toBeVisible();
    await expect(yourRoom(host).locator(".pa-room-taken")).toHaveText("2/2");
    await expect(seatOf(host, secondUser)).toBeVisible();
    await expect(playerRow(host, secondUser)).toContainText("In your room");

    // §5.41 — nobody can be ready without a deck, and the page says
    // so rather than letting a click fail.
    await expect(host.getByRole("button", { name: "I'm ready" })).toBeDisabled();
    // Spec 0016 (4) — Start is not a button yet, and says what it waits for.
    await expect(host.getByRole("button", { name: "Start match" })).toHaveCount(0);
    await expect(yourRoom(host).locator(".pa-start-wait")).toHaveText(
      "Waiting for you to be ready",
    );
    await expect(yourRoom(guest).locator(".pa-start-wait")).toHaveText(
      "Waiting for you to be ready",
    );

    // §5.18 — the host closes, and the guest finds out without
    // touching anything.
    await host.getByRole("button", { name: "Close room" }).click();
    await expect(guest.getByText(/host closed the room/i)).toBeVisible();
    await expect(guest.getByRole("button", { name: "Open a room" })).toBeVisible();
  });
});

test("a chat line reaches the other player", async ({ browser }) => {
  await twoPlayers(browser, async (one, two) => {
    // Distinct per run: the channel is shared and ephemeral, so a
    // fixed string would match a line left by the previous run.
    const line = `shall we play ${Date.now()}`;
    await one.getByLabel("Message the lobby").fill(line);
    await one.getByRole("button", { name: "Send" }).click();

    // AMENDMENT 3 — one channel, everybody signed in, no history.
    await expect(two.getByText(line)).toBeVisible();
    await expect(one.getByText(line)).toBeVisible();
  });
});

test("chat: the time by the name, your own lines, emoji, reactions and New, and no lobby news", async ({
  browser,
}) => {
  // Spec 0007, C1-C7, between two real players.
  await twoPlayers(browser, async (one, two) => {
    const stamp = Date.now();
    const chat = (page: Page) => page.getByRole("region", { name: "Chat" });
    const message = (page: Page, text: string) =>
      chat(page).locator(".pa-chat-msg", { hasText: text });

    // C3 -- an emoji from the panel goes into the line at the cursor.
    await one.getByLabel("Message the lobby").fill(`gl hf ${stamp} `);
    await one.getByRole("button", { name: "Emoji", exact: true }).click();
    await chat(one)
      .getByRole("dialog", { name: "Emoji" })
      .getByRole("button", { name: "🔥" })
      .click();
    await one.getByRole("button", { name: "Send" }).click();
    const line = `gl hf ${stamp} 🔥`;
    await expect(message(two, line)).toBeVisible();
    await expect(chat(one).getByRole("dialog", { name: "Emoji" })).toHaveCount(0);

    // C1 and C2 -- the time beside the name; your own line is marked, theirs is not.
    const run = (page: Page) =>
      chat(page)
        .locator(".pa-chat-line")
        .filter({ has: page.locator(".pa-chat-msg", { hasText: line }) });
    await expect(run(one).locator(".pa-chat-meta .pa-chat-at")).toHaveText(/^\d\d:\d\d$/);
    await expect(run(one)).toHaveClass(/pa-chat-mine/);
    await expect(run(two)).not.toHaveClass(/pa-chat-mine/);

    // C4 -- pointing at the line brings up the six; a reaction reaches both, and comes back off.
    await message(two, line).hover();
    await message(two, line).getByRole("button", { name: "React 😂" }).click();
    await expect(message(one, line).getByRole("button", { name: /^😂 1/ })).toBeVisible();
    await expect(message(two, line).getByRole("button", { name: /^😂 1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await message(two, line).getByRole("button", { name: /^😂 1/ }).click();
    await expect(message(one, line).getByRole("button", { name: /^😂/ })).toHaveCount(0);

    // C5 -- no lobby news in the chat (owner 2026-10-24): opening a room says nothing there.
    await openRoom(one, `Chat ${stamp}`);
    // The other player's room list has it, so any news would have come by now.
    await expect(two.getByText(`Chat ${stamp}`).first()).toBeVisible();
    await expect(chat(two)).not.toContainText(`Chat ${stamp}`);

    // C7 -- a line that comes in while the tab is in the background is
    // counted in the title, and sits under "New" when you come back.
    const background = (page: Page, hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await background(two, true);
    const later = `still there ${stamp}?`;
    await one.getByLabel("Message the lobby").fill(later);
    await one.getByRole("button", { name: "Send" }).click();
    await expect(two).toHaveTitle(/^\(1\) Proxic Arena$/);
    await background(two, false);
    await expect(two).toHaveTitle("Proxic Arena");
    await expect(chat(two).getByRole("separator", { name: "New messages" })).toBeVisible();
    await expect(chat(one).getByRole("separator", { name: "New messages" })).toHaveCount(0);
  });
});

test("a player idle for 5 minutes shows away to the other, on the list, the seat and in chat", async ({
  browser,
}) => {
  // Spec 0009, A1-A3, between two real players. The guest's clock runs
  // ahead instead of the test waiting 5 minutes.
  // The guest's lobby socket, and what it said -- printed if this fails,
  // so a failure on CI explains itself.
  let socket: WebSocket | null = null;
  const said: string[] = [];
  const prepareGuest = async (context: import("@playwright/test").BrowserContext) => {
    // The fake clock goes in before the guest's page ever loads: put in
    // with a reload, the old page's connection could still be open on
    // the server -- a second tab, in use, so never away (CI, 2026-10-24).
    await context.clock.install();
    context.on("page", (page) =>
      page.on("websocket", (ws) => {
        if (!ws.url().endsWith("/ws/user")) return;
        socket = ws;
        said.push(`open ${ws.url()}`);
        ws.on("framesent", (frame) => said.push(`> ${String(frame.payload).slice(0, 120)}`));
        ws.on("framereceived", (frame) => {
          const text = String(frame.payload);
          if (!text.includes('"PONG"')) said.push(`< ${text.slice(0, 120)}`);
        });
        ws.on("close", () => said.push("closed"));
      }),
    );
  };
  await twoPlayers(
    browser,
    async (host, guest) => {
      await openRoom(host, `Away ${Date.now()}`);
      await inviteIn(host, guest, secondUser);
      const line = `brb ${Date.now()}`;
      await guest.getByLabel("Message the lobby").fill(line);
      await guest.getByRole("button", { name: "Send" }).click();
      await expect(host.getByText(line)).toBeVisible();

      const badge = (where: ReturnType<Page["locator"]>, state: RegExp) =>
        where.getByRole("img", { name: new RegExp(`^${secondUser}, ${state.source}`, "i") });
      const seat = seatOf(host, secondUser);
      const row = playerRow(host, secondUser);
      const chat = host.getByRole("region", { name: "Chat" });
      await expect(badge(row, /online/)).toBeVisible();

      await guest.mouse.move(5, 5);
      // Twenty seconds at a time, each waiting for the server's PONG: one
      // jump of 5 minutes is also 5 minutes without one, and the page would
      // rightly reconnect as new.
      try {
        for (let step = 0; step < 17; step++) {
          const pong = socket!.waitForEvent("framereceived", {
            predicate: (frame) => String(frame.payload).includes('"PONG"'),
            timeout: 10_000,
          });
          await guest.clock.fastForward(20_000);
          await pong;
        }
        await expect(badge(row, /away \d+ min/)).toBeVisible({ timeout: 20_000 });
      } catch (error) {
        console.log(`guest socket:\n${said.join("\n")}`);
        throw error;
      }
      await expect(row).toContainText(/Away \d+ min · in your room/);
      await expect(badge(seat, /away/)).toBeVisible();
      await expect(badge(chat, /away/).first()).toBeVisible();

      // A move: here again, for everybody.
      await guest.mouse.move(40, 40);
      await expect(badge(row, /online/)).toBeVisible();
      await expect(badge(seat, /online/)).toBeVisible();
    },
    prepareGuest,
  );
});

test("an invitation can be declined; the host is told and the seat stays open", async ({
  browser,
}) => {
  await twoPlayers(browser, async (host, guest) => {
    await openRoom(host);
    await players(host)
      .getByRole("button", { name: new RegExp(`^Invite ${secondUser}$`, "i") })
      .click();

    const dialog = guest.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Decline" }).click();

    // The prompt goes, and nothing else does: declining is not
    // joining, and the host's room is untouched.
    await expect(dialog).toHaveCount(0);
    await expect(guest.getByRole("button", { name: "Open a room" })).toBeVisible();
    await expect(seatOf(host, "Open seat")).toBeVisible();
    // Amendment 11 — the host hears it, and the note stays on the row.
    await expect(playerRow(host, secondUser)).toContainText("Declined your invitation");
    // Spec 0016 (16) — and a pop-up says so.
    const told = host.getByRole("dialog");
    await expect(told).toContainText(`${secondUser} declined your invitation`);
    await told.getByRole("button", { name: "OK" }).click();
    await expect(told).toHaveCount(0);
  });
});

test("Ask to join: the host declines, then accepts, and everybody sees the held seat", async ({
  browser,
}) => {
  // Spec 0016 R2, R3 and the decline pop-up both ways.
  await twoPlayers(browser, async (host, guest) => {
    await openRoom(host, "Knock Knock");
    const card = guest.getByRole("article", { name: "Knock Knock" });
    await card.getByRole("button", { name: "Ask to join" }).click();

    // The asker's card says so, with a way to take it back.
    await expect(card).toContainText("Asked to join");
    await expect(card).toContainText(`Waiting on ${testUser}'s answer`);
    await expect(card.getByRole("button", { name: "Cancel" })).toBeVisible();

    // The host is asked in a pop-up, and the open seat says who it is.
    const asked = host.getByRole("dialog");
    await expect(asked).toContainText(`${secondUser} would like to join your room`);
    await expect(seatOf(host, secondUser)).toContainText("Asked to join");
    await asked.getByRole("button", { name: "Decline" }).click();

    const told = guest.getByRole("dialog");
    await expect(told).toContainText(`${testUser} declined your request to join`);
    await told.getByRole("button", { name: "OK" }).click();
    await expect(card).toContainText("1 seat open");

    // Asked again, and accepted: the guest is seated.
    await card.getByRole("button", { name: "Ask to join" }).click();
    await host.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
    await expect(yourRoom(guest)).toBeVisible();
    await expect(yourRoom(host).locator(".pa-room-taken")).toHaveText("2/2");
  });
});

test("an invitation reaches you on another page, and is answered from the top bar", async ({
  browser,
}) => {
  // Spec 0016 (9) — the notice sits in the top bar; Accept seats you
  // and takes you to the Lobby.
  await twoPlayers(browser, async (host, guest) => {
    await guest.getByRole("link", { name: "Deck Depot" }).click();
    await expect(guest).toHaveURL(/\/decks$/);
    await openRoom(host, "Top Bar Table");
    await players(host)
      .getByRole("button", { name: new RegExp(`^Invite ${secondUser}$`, "i") })
      .click();

    const notice = guest.locator(".pa-top-notice");
    await expect(notice).toContainText(`${testUser} has invited you to join Top Bar Table`);
    await guest.screenshot({ path: "test-results/seen/top-bar-invitation.png" });
    await notice.getByRole("button", { name: "Accept" }).click();
    await expect(guest).toHaveURL(/\/play$/);
    await expect(yourRoom(guest)).toBeVisible();
    await expect(notice).toHaveCount(0);
  });
});

test("a host withdraws an invitation, and the player is told", async ({ browser }) => {
  await twoPlayers(browser, async (host, guest) => {
    await openRoom(host);
    const invite = players(host).getByRole("button", {
      name: new RegExp(`^Invite ${secondUser}$`, "i"),
    });
    await invite.click();
    await expect(guest.getByRole("dialog")).toBeVisible();

    // Straight after Invite the button is a statement, not an undo;
    // it offers Withdraw once it has settled.
    const withdraw = players(host).getByRole("button", {
      name: new RegExp(`^Withdraw the invitation to ${secondUser}$`, "i"),
    });
    await withdraw.click();

    const told = guest.getByRole("dialog");
    await expect(told).toContainText(`${testUser} withdrew the invitation`);
    await told.getByRole("button", { name: "OK" }).click();
    await expect(told).toHaveCount(0);
    // The host may ask again.
    await expect(invite).toBeEnabled();
  });
});

/**
 * Leaving gives you the lobby back, WITHOUT a refresh.
 *
 * Reported by the owner: after leaving, the way to start again did
 * not come back until the page was reloaded. The server answers a
 * leave with the room as it now is — correct for the members who
 * remain — and the page adopted it.
 *
 * No reload anywhere in this test. A reload is exactly what hid
 * the bug.
 */
test("leaving a room gives the lobby back without a refresh", async ({ browser }) => {
  await twoPlayers(browser, async (host, guest) => {
    await openRoom(host);
    await inviteIn(host, guest, secondUser);

    // The GUEST leaves: the case with no socket message to the leaver.
    await guest.getByRole("button", { name: "Leave seat" }).click();
    await expect(guest.getByRole("button", { name: "Open a room" })).toBeEnabled();

    // And the host sees the seat free again, also without a reload.
    await expect(yourRoom(host).locator(".pa-room-taken")).toHaveText("1/2");

    // The HOST closes: the HTTP answer must not put the dead room back.
    await host.getByRole("button", { name: "Close room" }).click();
    await expect(host.getByRole("button", { name: "Open a room" })).toBeEnabled();

    // The real proof that the lobby is usable again.
    await openRoom(host);
  });
});

/**
 * Owner 2026-10-22: Remove sits with the host's buttons and asks first --
 * a misclick would otherwise throw a friend out of the room.
 */
test("removing a player asks first; keeping them changes nothing", async ({ browser }) => {
  await twoPlayers(browser, async (host, guest) => {
    await openRoom(host);
    await inviteIn(host, guest, secondUser);
    const remove = yourRoom(host).getByRole("button", {
      name: new RegExp(`^Remove ${secondUser}$`),
    });

    await remove.click();
    const ask = host.getByRole("dialog");
    await expect(ask).toContainText(`Remove ${secondUser} from the room?`);
    await ask.getByRole("button", { name: "Keep them" }).click();
    await expect(host.getByRole("dialog")).toHaveCount(0);
    await expect(yourRoom(host).locator(".pa-room-taken"), "kept").toHaveText("2/2");

    await remove.click();
    await host.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(yourRoom(host).locator(".pa-room-taken"), "removed").toHaveText("1/2");
    await expect(guest.getByRole("button", { name: "Open a room" })).toBeEnabled();
  });
});

test("the lobby survives a refresh, name and all", async ({ browser }) => {
  // §5.119 — the page asks GET /api/rooms/current on load, so this is
  // the one test that proves that path is wired.
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await leaveAnyRoom(page);

  try {
    await openLobby(page);
    await openRoom(page, "Refresh Proof");

    await page.reload();

    await expect(page.getByRole("article", { name: "Refresh Proof" })).toBeVisible();
    await expect(yourRoom(page).locator(".pa-room-taken")).toHaveText("1/2");
  } finally {
    await leaveAnyRoom(page);
    await context.close();
  }
});

/**
 * §5.228 "Add Play/lobby entry" — the lobby must be REACHABLE, and
 * navigating by URL is what once hid that it was not, so this clicks.
 */
test("a signed-in player can find the lobby by clicking", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  try {
    // PHASE_07 §7.62: the shared header, on every signed-in page.
    await page.goto("/decks");
    const pages = page.getByRole("navigation", { name: "Pages" });
    await pages.getByRole("link", { name: "Lobby" }).click();
    await expect(page).toHaveURL(/\/play/);
    await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();

    // And back out again: a page with no way off it is a dead end.
    await pages.getByRole("link", { name: "Deck Depot" }).click();
    await expect(page).toHaveURL(/\/decks/);

    // The logo returns to the Lobby from anywhere.
    await page.getByRole("link", { name: "Proxic Arena — Lobby" }).click();
    await expect(page).toHaveURL(/\/play/);
  } finally {
    await leaveAnyRoom(page);
    await context.close();
  }
});

test("an anonymous visitor is sent to sign in rather than shown a broken lobby", async ({
  browser,
}) => {
  // Carry-forward C4: every room endpoint requires a session.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/play");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("every room is listed for everybody, with seats, no decks and no way in unasked", async ({
  browser,
}) => {
  // §7.64 amends Phase 5's "no directory of rooms": rooms are visible
  // to every signed-in player, and a seat still needs an invitation
  // (owner decision 19) -- or, spec 0016 R3, the host's yes to a
  // request. §7.68: the room list shows seats, never decks.
  await twoPlayers(browser, async (host, other) => {
    await openRoom(host, "Seen Not Entered");

    // If the host has a deck, choose it, so there is a name to leak.
    const mine = (
      (await (await host.request.get("/api/decks")).json()) as {
        mine: { displayName: string }[];
      }
    ).mine;
    const deck = mine[0]?.displayName ?? null;
    if (deck) await chooseDeck(host, deck);

    const card = other.getByRole("article", { name: "Seen Not Entered" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(testUser);
    // Spec 0016 R1 — where it stands, for everybody.
    await expect(card).toContainText("Open seat");
    await expect(card).toContainText("1 seat open");
    // ...and no control that would take a seat without the host: only Ask to join.
    await expect(card.getByRole("button")).toHaveCount(1);
    await expect(card.getByRole("button", { name: "Ask to join" })).toBeVisible();
    await expect(other.getByRole("button", { name: "Accept" })).toHaveCount(0);
    if (deck) await expect(card).not.toContainText(deck);
  });
});

test("the Hall of Champions has its own page, fits one screen, and the season leader's ring follows them", async ({
  page,
}) => {
  // Spec 0018, F-0018-C/D. Whatever games this database holds: the page
  // shows the server's season by name, the lobby shows no trophies, the
  // desktop page never scrolls, and the season leader's gold ring is on
  // their picture in the Players list (or beside your chat line).
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await openLobby(page);
  await expect(page.getByRole("region", { name: "This season" })).toHaveCount(0);

  await page.getByRole("link", { name: "Hall of Champions" }).click();
  await expect(page).toHaveURL(/\/hall$/);
  const hall = (await (await page.request.get("/api/hall")).json()) as {
    season: { number: number; places: { place: number; userId: string }[] };
  };
  const band = page.getByRole("region", { name: "This season" });
  await expect(band).toContainText(`Season ${hall.season.number}`);
  await expect(page.getByRole("region", { name: "Leaderboard" })).toBeVisible();
  await expect(page.getByRole("img", { name: "The Champion's Belt" })).toBeVisible();
  await page.screenshot({ path: "test-results/seen/hall-of-champions.png" });
  // H6 — one screen, no scroll bar.
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);

  const leader = hall.season.places.find((p) => p.place === 1);
  if (!leader) {
    await expect(band).toContainText("Nobody yet");
    return;
  }
  const me = (await (await page.request.get("/api/auth/me")).json()) as {
    user: { userId: string; displayName: string };
  };
  await openLobby(page);
  if (me.user.userId === leader.userId) {
    await page.getByLabel("Message the lobby").fill(`crowned ${Date.now()}`);
    await page.getByRole("button", { name: "Send" }).click();
    const chat = page.getByRole("region", { name: "Chat" });
    await expect(chat.getByRole("img", { name: "Reigning Proxic Champion" }).first()).toBeVisible();
    return;
  }
  // Keep looking: a leader who signed out a moment ago (another test's
  // player) moves into the folded Offline list after the first look.
  const players = page.getByRole("region", { name: "Players" });
  const folded = players.locator('button.pa-offline-toggle[aria-expanded="false"]');
  await expect(async () => {
    if (await folded.isVisible()) await folded.click();
    await expect(players.getByRole("img", { name: "Reigning Proxic Champion" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
});
