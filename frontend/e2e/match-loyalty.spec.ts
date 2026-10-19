// A planeswalker, activated in a browser — PHASE_06 §6.91, §6.105,
// AGENTS TEST-011, FORGE-RULE.
//
// WHY A SECOND MATCH SPEC. match.spec.ts asserts what is Arena's:
// one player asked at a time, the other told it is not theirs, an
// answer reaching Forge. It does that with whatever deck is to
// hand, and on CI that deck is 65 basic lands — a game which can
// never cast anything and so can never reach a decision that only
// a spell asks for.
//
// This one exists for one decision in particular. Elspeth
// Resplendent's +1 is the only shape in the pinned Forge pool that
// asks which KIND of counter to put on a creature, and her loyalty
// cost is what proved no planeswalker ability could be activated at
// all. Both were implemented from a survey rather than from a bug
// report; TEST-011 says that is not finished until it has been
// looked at.
//
// It is slow, it plays hundreds of real decisions through a real
// worker, and that is the point: the alternative is believing a
// unit test about a branch no game ever takes.

import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

// Built by scripts/make-ci-deck.mjs from
// protocol/fixtures/planeswalker-deck/. Skipped rather than failed
// when absent, like every other spec that needs a package: a
// missing fixture is a setup gap, not a defect in the code.
const loyaltyPackage = join(process.cwd(), "..", "Test Deck", "loyalty-deck.zip");

test("a planeswalker ability is paid for and asks which counter to use", async ({ browser }) => {
  test.skip(!existsSync(loyaltyPackage), "no loyalty deck package built");

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    // --- the deck, imported for real -----------------------------
    //
    // Through the page, not the API: the import pipeline is what
    // turns a decklist into cards Forge can be given, and a deck
    // inserted behind it would not prove these cards resolve.
    await host.goto("/decks");

    // The display name is the PACKAGE FILENAME, not the decklist
    // inside it -- derived rather than written out again, because
    // the first version of this test hard-coded the decklist's
    // name and polled for sixty seconds for a deck that had
    // imported perfectly well under another one.
    const deckName = basename(loyaltyPackage, extname(loyaltyPackage));
    const mine = async () =>
      (
        (await (await host.request.get("/api/decks")).json()) as {
          mine: { displayName: string }[];
        }
      ).mine;

    if (!(await mine()).some((deck) => deck.displayName === deckName)) {
      await host.locator('input[type="file"]').setInputFiles(loyaltyPackage);
      // Forge resolves every card in the list; on a cold stack
      // that is minutes, not seconds.
      await expect(host.getByText("Artwork stored")).toBeVisible({ timeout: 600_000 });
      await expect.poll(async () => (await mine()).some((d) => d.displayName === deckName), {
        timeout: 60_000,
      }).toBe(true);
    }

    // Shared with the guest, checked through the API rather than
    // the panel's wording — what matters is that the guest can
    // select it.
    const guestCanSee = async () =>
      (
        (await (await guest.request.get("/api/decks")).json()) as {
          sharedWithMe: { displayName: string }[];
        }
      ).sharedWithMe.some((deck) => deck.displayName === deckName);

    if (!(await guestCanSee())) {
      // `.row`, not a list item: the Deck Depot draws each deck as
      // a div, and a locator written from an imagined structure
      // hangs for the whole test timeout rather than failing. This
      // one was read off the running page.
      await host
        .getByRole("region", { name: "My decks" })
        .locator(".row", { hasText: deckName })
        .getByRole("button", { name: "view" })
        .first()
        .click();
      await host.getByLabel("Username").fill(secondUser);
      await host.getByRole("button", { name: "Share", exact: true }).click();
      await expect.poll(guestCanSee, { timeout: 30_000 }).toBe(true);
    }

    // --- a room, two seats, a running game -----------------------
    //
    // startAMatch, not a second copy of it: the version this file
    // started with guessed a "Launch" button and hung for a quarter
    // of an hour on a button that is called "Start match".
    await startAMatch(host, guest, deckName);

    // --- PLAY, until the decision under test appears -------------
    //
    // Played the way a person does, for the reason
    // scripts/play-a-game.py explains at length: a strategy that
    // always takes the first option taps every land for mana it
    // never spends, and then cannot pay for anything. Lands
    // first, then any action that is NOT a mana ability.
    //
    // Elspeth costs {3}{W}{W} and her +1 needs a creature in
    // play, so this takes a while. Bounded, and the bound is
    // generous because the alternative to waiting is a test that
    // asserts nothing.
    const heading = /Choose a kind of counter/;
    const sawTheQuestion = async () =>
      (await matchPanel(host).getByRole("heading", { name: heading }).count()) > 0 ||
      (await matchPanel(guest).getByRole("heading", { name: heading }).count()) > 0;

    // Bounded by the CLOCK, not by a loop counter. The first
    // version counted every pass of the loop, including the ones
    // that only waited 200ms because nobody held priority, and so
    // spent its whole budget waiting while a perfectly healthy game
    // played on behind it: 1,200 "steps", four minutes, eleven
    // actual decisions answered.
    const deadline = Date.now() + 600_000;
    let reached = false;
    let answered = 0;

    while (Date.now() < deadline) {
      if (await sawTheQuestion()) {
        reached = true;
        break;
      }

      // A game that has FINISHED will never ask anything again, so
      // waiting for it is waiting for ever. Say that, rather than
      // timing out with "no counter-type decision was ever asked",
      // which is true and points at the wrong thing.
      const over = await matchPanel(host)
        .getByText(
          // The EXACT endings LobbyPage can print, not words that
          // sound final. The first version matched /draw/i and so
          // declared every game over during its first draw STEP --
          // four runs, fourteen to twenty-eight decisions each,
          // all reporting that the decision was never asked.
          /The game is over|was a draw|ended without a result|You won|opponent won|won on turn|stopped before it finished/,
        )
        .count();
      if (over > 0) {
        break;
      }

      // WHO IS BEING ASKED -- by whether there is a question, not
      // by whether it can be declined.
      //
      // The first version looked for a Pass button, and a MANDATORY
      // decision has none: the gate refuses a pass, so the page
      // correctly does not offer one. The loop therefore sat
      // waiting for priority that had already been given, for the
      // whole ten-minute budget, while the game waited for it. Two
      // runs in four, 87 and 155 decisions in, both on a game that
      // was still perfectly healthy.
      const asking = async (page: Page) =>
        (await matchPanel(page).getByRole("listitem").getByRole("button").count()) > 0 ||
        (await matchPanel(page).getByRole("button", { name: "Pass" }).count()) > 0;

      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;

      // Nobody holds priority this instant. Normal between
      // decisions; waiting is the correct response, not clicking.
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }

      const options = matchPanel(live).getByRole("listitem").getByRole("button");
      const labels = await options.allTextContents();

      // PLAY TOWARDS THE DECISION, deliberately. This is not a test
      // of how well anything plays; it is a test that one decision
      // can be reached, answered and seen. So Elspeth comes first
      // whenever she is on offer -- which casts her, and on later
      // turns activates her -- and her ability is once a turn, so
      // the rest of the turn still falls through to creatures.
      //
      // Creatures matter because the +1 targets one: "up to one
      // target creature" asks nothing at all when there is none.
      const elspeth = labels.findIndex((label) => label.includes("Elspeth"));
      const land = labels.findIndex((label) => label.includes("Play land"));
      const action = labels.findIndex(
        (label) => !label.includes("Play land") && !label.includes("Add {"),
      );
      const pick = elspeth >= 0 ? elspeth : land >= 0 ? land : action;

      if (pick >= 0) {
        await options.nth(pick).click();
        answered += 1;
      } else {
        const pass = matchPanel(live).getByRole("button", { name: "Pass" });
        if ((await pass.count()) === 0) break;
        await pass.click();
        answered += 1;
      }
      await live.waitForTimeout(40);
    }

    // The whole reason this file exists. A planeswalker ability
    // was activated, which means its loyalty cost was PAID
    // (§6.91 — nothing else can activate it), it resolved, and
    // Forge asked a question the adapter can now answer.
    expect(
      reached,
      `no counter-type decision was asked in ${answered} answered decisions`,
    ).toBe(true);

    const asked = (await matchPanel(host).getByRole("heading", { name: heading }).count())
      ? host
      : guest;
    const panel = matchPanel(asked);

    // FORGE's four candidates, named — not a number, not an index
    // (§6.50). If this ever shows two, the adapter has started
    // deciding something that is the player's.
    const offered = await panel.getByRole("listitem").getByRole("button").allTextContents();
    expect(offered.sort()).toEqual(["First Strike", "Flying", "Lifelink", "Vigilance"]);

    // Mandatory: there is no "neither". The gate refuses a pass on
    // this decision, so the page must not offer one.
    await expect(panel.getByRole("button", { name: "Pass" })).toHaveCount(0);

    // Forge's own wording, passed through rather than rewritten —
    // it is the only thing that says which card this is about.
    await expect(panel.getByText(/Select counter type to add to/)).toBeVisible();

    // AGENTS TEST-011 — leave something to LOOK AT, on success,
    // because the screenshots Playwright writes by default only
    // exist once something is already known to be wrong.
    await asked.screenshot({ path: "test-results/seen/counter-type.png", fullPage: true });

    // And it is answerable: the answer reaches Forge and the game
    // moves on, which is the half a screenshot cannot show.
    await panel.getByRole("listitem").getByRole("button").first().click();
    await expect
      .poll(
        async () =>
          (await panel.getByRole("heading", { name: heading }).count()) === 0 ||
          (await panel.getByRole("listitem").getByRole("button").count()) === 0,
        { timeout: 60_000 },
      )
      .toBe(true);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await hostContext.close();
    await guestContext.close();
  }
});
