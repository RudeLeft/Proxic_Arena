// From an empty lobby to a prepared match — PHASE_05 §5.40–§5.44,
// §5.58, §5.91–§5.101, §5.116, §5.117.
//
// The only test that walks the whole phase: import, share, invite,
// choose a deck, ready up, prepare. Everything it touches has unit
// or server coverage already; what it adds is that a PERSON can get
// from one end to the other through the page, with a real Forge
// worker answering the preflight.
//
// The guest deliberately plays a deck SHARED with them rather than
// one of their own. That is the more interesting path and it is a
// rule this phase could quietly break: §5.41 says the selectable
// library is owned decks PLUS shared ones, §5.42 says `canUseDeck`
// decides, and the preflight asks again at preparation (§5.51). A
// test where both players own their decks would never notice if
// shared ones stopped working.
//
// Both accounts must exist on the stack under test, and the stack
// needs a Forge worker: preparation runs BUILD_DECK, and without a
// worker it fails closed by design.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  secondPassword,
  secondUser,
  shareOpenDeckWith,
  signIn,
  signInAs,
  testUser,
} from "./helpers";
import { chooseDeck, expectReady, inviteIn, markReady, openRoom, seatOf } from "./match-helpers";

// Importing resolves every card through Forge, and preparation
// spawns a worker per deck. The file default of 45s is right for
// every other spec and far too short for this one.
//
// Measured rather than guessed: the first import after a container
// rebuild took over two minutes, because Forge loads its whole card
// pool (96,916 cards) before it can resolve the first name. A later
// import against the same warm stack took under forty seconds.
test.describe.configure({ timeout: 600_000 });

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");

/** The real export when a developer has one, else the CI fixture. */
function anyPackage(): string | null {
  if (existsSync(realExport)) return realExport;
  return existsSync(ciFixture) ? ciFixture : null;
}

async function csrfOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "proxicarena_csrf")?.value ?? "";
}

/** Start from nothing: no room, no decks of your own. */
async function clearEverything(page: Page) {
  const csrf = await csrfOf(page);

  const current = (await (await page.request.get("/api/rooms/current")).json()) as {
    room: { roomId: string } | null;
  };
  if (current.room) {
    // Leave, not close: leaving works whether or not you are the
    // host, and a host leaving closes the room anyway (§5.18).
    await page.request.post(`/api/rooms/${current.room.roomId}/leave`, {
      headers: { "X-CSRF-Token": csrf },
    });
  }

  const library = (await (await page.request.get("/api/decks")).json()) as {
    mine: { deckId: string }[];
  };
  for (const deck of library.mine) {
    await page.request.delete(`/api/decks/${deck.deckId}`, {
      headers: { "X-CSRF-Token": csrf },
    });
  }
}

test("two players choose decks, ready up, and the host prepares the match", async ({ browser }) => {
  const pkg = anyPackage();
  test.skip(!pkg, "no deck package available");

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    // --- a deck exists, and is shared -----------------------------
    await host.goto("/decks");
    await host.locator('input[type="file"]').setInputFiles(pkg!);
    await expect(host.getByText("Artwork stored")).toBeVisible({ timeout: 300_000 });

    // The name the server gave THIS import, read from the library
    // rather than guessed from the filename.
    const library = (await (await host.request.get("/api/decks")).json()) as {
      mine: { deckId: string; displayName: string }[];
    };
    expect(library.mine).toHaveLength(1);
    const deckName = library.mine[0]!.displayName;

    await host.getByRole("button", { name: "view" }).first().click();
    await expect(host.getByRole("heading", { name: "Shared with", exact: true })).toBeVisible();
    await shareOpenDeckWith(host, secondUser);
    // Specific, because `/Shared with/` also matches the
    // "Shared with me" panel HEADING, which renders whether or not
    // that list has anything in it. The loose version passed by
    // asserting the heading was visible -- proving nothing about
    // the share -- and failed only when both elements happened to
    // be present at the moment Playwright evaluated it.
    await expect(host.getByText(`Shared with ${secondUser}`)).toBeVisible();

    // --- a room, with both players in it --------------------------
    await host.goto("/play");
    await guest.goto("/play");
    await openRoom(host);
    await inviteIn(host, guest, secondUser);

    // --- decks, chosen in the room (§7.64) ------------------------
    //
    // Both players pick the deck BY NAME, never "the first one": the
    // suite shares accounts across files, and "whatever is first" is
    // a dependency on what the previous file left behind.
    //
    // §4.59 — the guest's copy says whose it is, and §5.41 says a
    // shared deck is selectable.
    await chooseDeck(host, deckName);
    await chooseDeck(guest, deckName, testUser);

    // §5.46, §5.47 — the host's page does NOT carry what the guest
    // chose. This assertion stands for the §5.228 audit's leak:
    // every member's deck name once reached the whole table.
    await expect(seatOf(host, secondUser)).not.toContainText(deckName);
    // And the room list, which everybody sees, carries no deck at all (§7.68).
    await expect(
      host.locator("article.pa-room:not(.pa-room-mine)", { hasText: deckName }),
    ).toHaveCount(0);

    // --- ready ----------------------------------------------------
    // §5.41 — the button was unusable until a deck was chosen, and
    // is usable now. One after the other, each once its page has seen
    // the room as it now is: a Ready on a stale revision is refused.
    await markReady(host);
    await expectReady(seatOf(guest, testUser));
    await markReady(guest);

    await expectReady(seatOf(host, secondUser));
    await expectReady(seatOf(guest, testUser));

    // --- prepared, not started ------------------------------------
    // Start match (§7.64) prepares and launches in one press, so the
    // in-between state is reached through the API: a host whose tab
    // died between the two steps leaves exactly this behind.
    const roomId = (
      (await (await host.request.get("/api/rooms/current")).json()) as {
        room: { roomId: string };
      }
    ).room.roomId;
    const prepared = await host.request.post(`/api/rooms/${roomId}/prepare-match`, {
      headers: { "X-CSRF-Token": await csrfOf(host) },
    });
    expect(prepared.status()).toBe(200);

    // §5.91 — the room is frozen and NOTHING has started. The guest
    // learns over the socket, without touching anything.
    // Spec 0013 — the joiner's Start says "Loading…".
    await expect(guest.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();

    // §5.116 — ordinary configuration is blocked while prepared.
    //
    // Two halves, because they can fail independently. The page
    // stops offering the controls...
    await expect(host.getByRole("button", { name: /I'm ready|Ready ✓/ })).toBeDisabled();
    await expect(host.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();

    // ...and the SERVER refuses anyway, which is the rule. A page
    // that hides a button has not enforced anything: the request
    // this blocks is the one a stale tab would send.
    const whileLocked = await guest.request.put(`/api/rooms/${roomId}/my-deck`, {
      headers: { "X-CSRF-Token": await csrfOf(guest), "Content-Type": "application/json" },
      data: { deckId: null },
    });
    expect(whileLocked.status()).toBe(409);

    // The setup exists, and says who is playing what (§5.102).
    const setup = (await (await host.request.get(`/api/rooms/${roomId}/match-setup`)).json()) as {
      setup: { status: string; players: { displayName: string; deckId: string }[] } | null;
    };
    expect(setup.setup?.status).toBe("READY");
    expect(setup.setup?.players).toHaveLength(2);
    expect(setup.setup?.players.map((p) => p.displayName).sort()).toEqual(
      [testUser, secondUser].sort(),
    );

    // --- cancel ---------------------------------------------------
    // §5.117 — back to OPEN, readiness reset, deck choices kept.
    await host.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(host.getByRole("button", { name: "I'm ready" })).toBeEnabled();
    await expect(seatOf(host, secondUser)).toContainText(/not ready/i);
    await expect(host.getByLabel("Your deck for this match")).not.toHaveValue("");
  } finally {
    await clearEverything(host);
    await clearEverything(guest);
    await hostContext.close();
    await guestContext.close();
  }
});

test("the host is told which seat needs attention, and only that player is told why", async ({
  browser,
}) => {
  // §5.100 and §5.101, which is the one rule in this phase that
  // lives ENTIRELY in where an answer is sent. The server suite
  // proves the HTTP body carries no detail; this proves the detail
  // reaches the other player's screen, which no server test can.
  //
  // Driven through the API rather than the button because the page
  // correctly disables "Prepare match" until everyone is ready —
  // the refusal has to be provoked, and a test that cannot provoke
  // it would never cover the branch.
  const pkg = anyPackage();
  test.skip(!pkg, "no deck package available");

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    await host.goto("/play");
    await guest.goto("/play");
    await openRoom(host);
    await inviteIn(host, guest, secondUser);

    const current = (await (await host.request.get("/api/rooms/current")).json()) as {
      room: { roomId: string; revision: number };
    };
    const response = await host.request.post(`/api/rooms/${current.room.roomId}/prepare-match`, {
      headers: { "X-CSRF-Token": await csrfOf(host) },
    });

    expect(response.status()).toBe(409);
    const body = (await response.json()) as {
      errorCode: string;
      seats: { userId: string; needsAttention: boolean }[];
    };
    expect(body.errorCode).toBe("SETUP_NOT_READY");
    // Both seats need attention here — neither has a deck — and
    // every member appears, so the answer does not reveal the
    // roster by omission.
    expect(body.seats).toHaveLength(2);
    expect(body.seats.every((seat) => seat.needsAttention)).toBe(true);
    // The host's answer carries WHO, never WHY.
    for (const seat of body.seats) {
      expect(Object.keys(seat).sort()).toEqual(["needsAttention", "userId"]);
    }

    // And each player is told about their OWN deck, on their own
    // socket, without reloading.
    const told = guest.getByRole("alert").filter({ hasText: "Your deck needs attention" });
    await expect(told).toBeVisible();
    await expect(told).toContainText(/Choose a deck/i);
  } finally {
    await clearEverything(host);
    await clearEverything(guest);
    await hostContext.close();
    await guestContext.close();
  }
});
