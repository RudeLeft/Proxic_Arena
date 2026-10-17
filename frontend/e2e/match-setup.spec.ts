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
import { secondPassword, secondUser, signIn, signInAs, testUser } from "./helpers";

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

/** The seat row for one player, whatever else is on the page. */
function seatOf(page: Page, displayName: string) {
  return page.locator("li.seat", { hasText: displayName });
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
    await expect(host.getByRole("heading", { name: "Share this deck" })).toBeVisible();
    await host.getByLabel("Username").fill(secondUser);
    await host.getByRole("button", { name: "Share", exact: true }).click();
    await expect(host.getByText(/Shared with/)).toBeVisible();

    // --- a room, with both players in it --------------------------
    await host.goto("/play");
    await guest.goto("/play");
    await host.getByRole("button", { name: "Host a game" }).click();
    await host
      .getByRole("region", { name: "Who is here" })
      .locator("li", { hasText: secondUser })
      .getByRole("button", { name: "Invite" })
      .click();
    await guest.getByRole("button", { name: "Accept" }).click();
    await expect(host.getByText("2 of 2")).toBeVisible();

    // --- decks, chosen inline (AMENDMENT 4) -----------------------
    //
    // Both players pick the deck BY NAME rather than by `.first()`.
    // The suite shares two accounts across six files and runs in
    // one order; "whatever is first in the list" is a dependency on
    // what the previous file left behind, and the Phase 4 gate's
    // worst finding started as exactly that kind of cross-file
    // interference.
    const hostDecks = host.getByRole("region", { name: "My decks" });
    const deckRow = hostDecks.locator("li", { hasText: deckName });
    await deckRow.getByRole("button", { name: "Use this deck" }).click();
    await expect(deckRow.getByRole("button", { name: "Selected" })).toBeVisible();

    // §4.59 — the guest's copy says whose it is, and §5.41 says a
    // shared deck is selectable.
    const guestDecks = guest.getByRole("region", { name: "My decks" });
    const guestRow = guestDecks.locator("li", { hasText: deckName });
    await expect(guestRow).toContainText(`shared by ${testUser}`);
    await guestRow.getByRole("button", { name: "Use this deck" }).click();
    await expect(guestRow.getByRole("button", { name: "Selected" })).toBeVisible();

    // §5.46, §5.47 — the host can see that the guest's seat is
    // decided, and NOT what they decided on.
    //
    // This assertion used to read `not.toContainText("no deck yet")`
    // and nothing else, which passed while the server was leaking
    // every member's deck name to the whole table. The §5.228 audit
    // caught the leak; this is the assertion that would have.
    await expect(seatOf(host, secondUser)).toContainText("deck chosen");
    await expect(seatOf(host, secondUser)).not.toContainText(deckName);
    // The guest's own seat names it, on their own page.
    await expect(seatOf(guest, secondUser)).toContainText(deckName);

    // --- ready ----------------------------------------------------
    // §5.41 — the button was unusable until a deck was chosen, and
    // is usable now.
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();

    await expect(seatOf(host, secondUser)).toContainText("ready");
    await expect(seatOf(guest, testUser)).toContainText("ready");

    // --- prepare --------------------------------------------------
    const prepare = host.getByRole("button", { name: "Prepare match" });
    await expect(prepare).toBeEnabled();
    await prepare.click();

    // §5.91 — the room is frozen and NOTHING has started. The page
    // says exactly that rather than implying a game is running.
    await expect(host.getByText(/match is prepared/i)).toBeVisible();
    // The guest learns over the socket, without touching anything.
    await expect(guest.getByText(/match is prepared/i)).toBeVisible();

    // §5.116 — ordinary configuration is blocked while prepared.
    //
    // Two halves, because they can fail independently. The page
    // stops offering the controls...
    await expect(host.getByRole("button", { name: "Ready", exact: true })).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Cancel preparation" })).toBeVisible();

    const roomId = (
      (await (await host.request.get("/api/rooms/current")).json()) as {
        room: { roomId: string };
      }
    ).room.roomId;

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
    await host.getByRole("button", { name: "Cancel preparation" }).click();
    await expect(host.getByRole("button", { name: "Ready", exact: true })).toBeVisible();
    await expect(seatOf(host, secondUser)).toContainText("not ready");
    await expect(seatOf(host, secondUser)).not.toContainText("no deck yet");
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
    await host.getByRole("button", { name: "Host a game" }).click();
    await host
      .getByRole("region", { name: "Who is here" })
      .locator("li", { hasText: secondUser })
      .getByRole("button", { name: "Invite" })
      .click();
    await guest.getByRole("button", { name: "Accept" }).click();
    await expect(host.getByText("2 of 2")).toBeVisible();

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
    await expect(guest.getByRole("heading", { name: "Your deck needs attention" })).toBeVisible();
    await expect(guest.getByText(/Choose a deck/i).first()).toBeVisible();
  } finally {
    await clearEverything(host);
    await clearEverything(guest);
    await hostContext.close();
    await guestContext.close();
  }
});
