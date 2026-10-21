// Two players, one room — PHASE_05 AMENDMENTS 1–4.
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

import { test, expect, type Page } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";

/**
 * Leave or close whatever room this user is in.
 *
 * §5.5 is one room at a time, so a run that left a room behind
 * would fail the NEXT run at "Host a game" — and it would fail
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
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Who is here" })).toBeVisible();
  // The heading renders before the lobby socket is open. Seeing
  // yourself in the list means the server has the connection: the
  // list arrives over it. Chat keeps no history, so a line sent
  // before the other player is connected never reaches them.
  await expect(page.getByRole("region", { name: "Who is here" }).getByText("(you)")).toBeVisible();
}

test("a host invites somebody who is online, and they take the empty seat", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await leaveAnyRoom(host);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await leaveAnyRoom(guest);

  try {
    await openLobby(host);
    await openLobby(guest);

    // AMENDMENT 2 — presence is the joining mechanism now, so the
    // host must be able to SEE somebody to invite them.
    const presence = host.getByRole("region", { name: "Who is here" });
    await expect(presence.getByText(secondUser, { exact: false })).toBeVisible();

    await host.getByRole("button", { name: "Host a game" }).click();
    await expect(host.getByRole("heading", { name: "Your game" })).toBeVisible();
    await expect(host.getByText("1 of 2")).toBeVisible();

    // AMENDMENT 1 — no code is typed anywhere. The host clicks a
    // name, and that is the only door into the room.
    await presence
      .locator("li", { hasText: secondUser })
      .getByRole("button", { name: "Invite" })
      .click();

    await expect(guest.getByText(`${testUser} invited you to a game`)).toBeVisible();
    await guest.getByRole("button", { name: "Accept" }).click();

    // BOTH sides learn, from one message with one source of truth.
    await expect(guest.getByRole("heading", { name: "Your game" })).toBeVisible();
    await expect(guest.getByText("2 of 2")).toBeVisible();
    await expect(host.getByText("2 of 2")).toBeVisible();

    // §5.141 — seats, names and who is host. Deck contents never.
    await expect(host.getByText(`Seat 2: ${secondUser}`)).toBeVisible();

    // §5.41 — nobody can be ready without a deck, and the page says
    // so rather than letting a click fail.
    await expect(host.getByRole("button", { name: "Ready" })).toBeDisabled();
    await expect(host.getByRole("button", { name: "Prepare match" })).toBeDisabled();

    // §5.18 — the host leaves, and the room goes with them. The
    // guest finds out without touching anything.
    await host.getByRole("button", { name: "Close room" }).click();
    await expect(guest.getByText(/host closed the room/i)).toBeVisible();
    await expect(guest.getByRole("heading", { name: "No game yet" })).toBeVisible();
  } finally {
    await leaveAnyRoom(host);
    await leaveAnyRoom(guest);
    await hostContext.close();
    await guestContext.close();
  }
});

test("a chat line reaches the other player", async ({ browser }) => {
  const oneContext = await browser.newContext();
  const one = await oneContext.newPage();
  await signIn(one);

  const twoContext = await browser.newContext();
  const two = await twoContext.newPage();
  await signInAs(two, secondUser, secondPassword);

  try {
    await openLobby(one);
    await openLobby(two);

    // Distinct per run: the channel is shared and ephemeral, so a
    // fixed string would match a line left by the previous run in
    // the same browser session.
    const line = `shall we play ${Date.now()}`;
    await one.getByLabel("Say something").fill(line);
    await one.getByRole("button", { name: "Send" }).click();

    // AMENDMENT 3 — one channel, everybody signed in, no history.
    await expect(two.getByText(line)).toBeVisible();
    await expect(one.getByText(line)).toBeVisible();
  } finally {
    await oneContext.close();
    await twoContext.close();
  }
});

test("an invitation can be declined, and the seat stays empty", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await leaveAnyRoom(host);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await leaveAnyRoom(guest);

  try {
    await openLobby(host);
    await openLobby(guest);

    await host.getByRole("button", { name: "Host a game" }).click();
    await host
      .getByRole("region", { name: "Who is here" })
      .locator("li", { hasText: secondUser })
      .getByRole("button", { name: "Invite" })
      .click();

    await expect(guest.getByText(`${testUser} invited you to a game`)).toBeVisible();
    await guest.getByRole("button", { name: "Decline" }).click();

    // The prompt goes, and nothing else does: declining is not
    // joining, and the host's room is untouched.
    await expect(guest.getByText(`${testUser} invited you to a game`)).toBeHidden();
    await expect(guest.getByRole("heading", { name: "No game yet" })).toBeVisible();
    await expect(host.getByText("1 of 2")).toBeVisible();
    await expect(host.getByText("Empty seat")).toBeVisible();
  } finally {
    await leaveAnyRoom(host);
    await hostContext.close();
    await guestContext.close();
  }
});

/**
 * Leaving gives you the lobby back, WITHOUT a refresh.
 *
 * Reported by the owner: after Leave room, "Host a game" did not
 * come back until the page was reloaded. The server answers a
 * leave with the room as it now is — correct for the members who
 * remain — and the page adopted it, so it kept showing a room the
 * player had just left.
 *
 * The socket did not cover it either: a leave is announced to the
 * REMAINING members, and the leaver is not one.
 *
 * No reload anywhere in this test. A reload is exactly what hid
 * the bug.
 */
test("leaving a room gives the lobby back without a refresh", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await leaveAnyRoom(host);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await leaveAnyRoom(guest);

  try {
    await openLobby(host);
    await openLobby(guest);
    await host.getByRole("button", { name: "Host a game" }).click();
    await host
      .getByRole("region", { name: "Who is here" })
      .locator("li", { hasText: secondUser })
      .getByRole("button", { name: "Invite" })
      .click();
    await guest.getByRole("button", { name: "Accept" }).click();
    await expect(host.getByText("2 of 2")).toBeVisible();

    // The GUEST leaves: the case with no socket message at all.
    await guest.getByRole("button", { name: "Leave room" }).click();
    await expect(guest.getByRole("heading", { name: "No game yet" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Host a game" })).toBeEnabled();

    // And the host sees the seat free again, also without a reload.
    await expect(host.getByText("1 of 2")).toBeVisible();

    // The HOST closes: this one does get a socket message, and the
    // HTTP answer must not put the dead room back.
    await host.getByRole("button", { name: "Close room" }).click();
    await expect(host.getByRole("heading", { name: "No game yet" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Host a game" })).toBeEnabled();

    // The real proof that the lobby is usable again, not just
    // rendering the right words.
    await host.getByRole("button", { name: "Host a game" }).click();
    await expect(host.getByRole("heading", { name: "Your game" })).toBeVisible();
  } finally {
    await leaveAnyRoom(host);
    await leaveAnyRoom(guest);
    await hostContext.close();
    await guestContext.close();
  }
});

test("the lobby survives a refresh", async ({ browser }) => {
  // §5.119 — a persisted room is the reason a refresh does not
  // destroy a lobby. The page asks GET /api/rooms/current on load,
  // so this is the one test that proves that path is wired.
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await leaveAnyRoom(page);

  try {
    await openLobby(page);
    await page.getByRole("button", { name: "Host a game" }).click();
    await expect(page.getByRole("heading", { name: "Your game" })).toBeVisible();

    await page.reload();

    await expect(page.getByRole("heading", { name: "Your game" })).toBeVisible();
    await expect(page.getByText("1 of 2")).toBeVisible();
  } finally {
    await leaveAnyRoom(page);
    await context.close();
  }
});

/**
 * §5.228 "Add Play/lobby entry" — the lobby must be REACHABLE.
 *
 * There was no link to /play anywhere in the app. The page existed,
 * the routes worked, every test navigated to it directly, and a
 * signed-in player looking for it had no way to find it short of
 * typing the URL. Found by the owner on the production host,
 * signed in on two browsers, looking for the thing that had been
 * built.
 *
 * Navigating by URL is what hid it, so this test clicks.
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
    await expect(page.getByRole("heading", { name: "Who is here" })).toBeVisible();

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
  // Carry-forward C4: every room endpoint requires a session, so
  // without this gate the page would render and then fill with
  // 401s.
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

test("the presence list is not a directory of rooms", async ({ browser }) => {
  // AMENDMENT 2 kept this narrow and §5.13 survived amendment 1
  // unchanged: a presence list shows who is SIGNED IN, never what
  // games exist. A page that listed rooms would be the matchmaking
  // the spec forbids.
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await leaveAnyRoom(host);

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInAs(other, secondUser, secondPassword);
  await leaveAnyRoom(other);

  try {
    await openLobby(host);
    await host.getByRole("button", { name: "Host a game" }).click();
    await expect(host.getByRole("heading", { name: "Your game" })).toBeVisible();

    await openLobby(other);
    // The host is visible as a PERSON...
    await expect(
      other.getByRole("region", { name: "Who is here" }).getByText(testUser, { exact: false }),
    ).toBeVisible();
    // ...and their game is not visible at all, nor is there any
    // control that would join one.
    await expect(other.getByRole("heading", { name: "No game yet" })).toBeVisible();
    await expect(other.getByRole("button", { name: /join/i })).toHaveCount(0);
  } finally {
    await leaveAnyRoom(host);
    await hostContext.close();
    await otherContext.close();
  }
});
