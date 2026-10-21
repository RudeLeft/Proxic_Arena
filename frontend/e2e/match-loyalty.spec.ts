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

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { secondPassword, secondUser, shareOpenDeckWith, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

// Built by scripts/make-ci-deck.mjs from
// protocol/fixtures/planeswalker-deck/. Skipped rather than failed
// when absent, like every other spec that needs a package: a
// missing fixture is a setup gap, not a defect in the code.
const loyaltyPackage = join(process.cwd(), "..", "Test Deck", "loyalty-deck.zip");

test("a planeswalker ability is paid for, and modal cards ask which mode", async ({ browser }) => {
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
      await expect
        .poll(async () => (await mine()).some((d) => d.displayName === deckName), {
          timeout: 60_000,
        })
        .toBe(true);
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
      // THIS deck's row, by its own View button: "View <name>".
      await host
        .getByRole("region", { name: "My decks" })
        .getByRole("listitem")
        .filter({ hasText: deckName })
        .getByRole("button", { name: "view" })
        .first()
        .click();
      await shareOpenDeckWith(host, secondUser);
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
    // TWO QUESTIONS, ONE MATCH. Both only exist in a game with
    // spells in it, and an end-to-end match is the slowest thing
    // in this suite, so the loop below answers each the first time
    // it appears rather than starting a second game for the
    // second one.
    const questions = [
      {
        name: "the counter-type choice",
        heading: /Choose a kind of counter/,
        shot: "test-results/seen/counter-type.png",
        check: async (panel: Locator) => {
          // FORGE's four candidates, named — not a number, not an
          // index (§6.50). If this ever shows two, the adapter has
          // started deciding something that is the player's.
          const offered = await panel.getByRole("listitem").getByRole("button").allTextContents();
          expect(offered.sort()).toEqual(["First Strike", "Flying", "Lifelink", "Vigilance"]);

          // Forge's own wording, passed through rather than
          // rewritten — it is the only thing that says which card
          // this is about.
          await expect(panel.getByText(/Select counter type to add to/)).toBeVisible();

          // Mandatory: there is no "neither", so no Pass.
          await expect(panel.getByRole("button", { name: "Pass" })).toHaveCount(0);
        },
      },
      {
        name: "the modal choice",
        heading: /Choose a mode/,
        shot: "test-results/seen/choose-mode.png",
        check: async (panel: Locator) => {
          // Alley Evasion is "choose one —", and the two modes do
          // different things to the same creature. Both must be on
          // offer: an adapter that quietly took the first would
          // show one, and the card would still appear to work.
          const offered = await panel.getByRole("listitem").getByRole("button").allTextContents();
          expect(offered).toHaveLength(2);
          expect(offered.some((label) => /\+1\/\+2/.test(label))).toBe(true);
          expect(offered.some((label) => /owner's hand/i.test(label))).toBe(true);

          // "Choose one" is exactly one, so no Pass.
          await expect(panel.getByRole("button", { name: "Pass" })).toHaveCount(0);
        },
      },
      {
        name: "the library dig",
        heading: /Choose from these/,
        shot: "test-results/seen/library-search.png",
        check: async (panel: Locator) => {
          // Elspeth's -3. The options are cards out of a hidden
          // zone, named — the most sensitive list in the game, and
          // safe only because a decision goes to ONE seat.
          const offered = await panel.getByRole("listitem").getByRole("button").allTextContents();
          expect(offered.length).toBeGreaterThan(0);

          // Forge's own wording for what the dig is FOR, and the
          // count this adds to it. Elspeth's -3 is "you may put a
          // permanent card with mana value 3 or less onto the
          // battlefield", chosen from the top seven.
          await expect(panel.getByText(/put on the battlefield/i)).toBeVisible();
          await expect(panel.getByText(/or pass/)).toBeVisible();

          // "You MAY put" — declining is a real answer.
          await expect(panel.getByRole("button", { name: "Pass" })).toBeVisible();
        },
      },
      {
        name: "the library ordering",
        heading: /Put them in order/,
        shot: "test-results/seen/order-library.png",
        check: async (panel: Locator) => {
          // Sensei's Divining Top: look at the top three, put them
          // back in any order. A sort asked one card at a time.
          const offered = await panel.getByRole("listitem").getByRole("button").allTextContents();
          expect(offered.length).toBeGreaterThan(1);

          // WHICH END. Without it the list reads as "choose one"
          // and the player sorts their library backwards.
          await expect(panel.getByText(/closest to the top/)).toBeVisible();

          // They are all going back, in SOME order; the only
          // question is which, so there is nothing to decline.
          await expect(panel.getByRole("button", { name: "Pass" })).toHaveCount(0);
        },
      },
      {
        name: "the X announcement",
        heading: /Choose how much/,
        shot: "test-results/seen/announce-x.png",
        check: async (panel: Locator) => {
          // Secure the Wastes is {X}{W}. The values are offered as
          // actions because the protocol has no number field, which
          // is Forge's own desktop behaviour too — it lists them
          // and adds a box for anything larger.
          const offered = await panel.getByRole("listitem").getByRole("button").allTextContents();
          expect(offered.every((label) => /^X = \d+$/.test(label.trim()))).toBe(true);

          // Consecutive, starting at the minimum, so the player is
          // not quietly offered a subset.
          //
          // HOW MANY there are is a property of the board, not of
          // the code, and asserting "more than one" here failed on
          // a perfectly correct question: Forge offers a spell
          // whether or not it can be paid for -- CostPartMana.canPay
          // is unconditionally true, which is also what sat behind
          // the §6.189 loop -- so X can legitimately be announced
          // with nothing untapped, and then nought is the only
          // value the board supports. The worker-level check is
          // where the range itself is measured.
          const values = offered.map((label) => Number(label.trim().slice(4)));
          expect(values.length).toBeGreaterThan(0);
          expect(values).toEqual(values.map((_, i) => values[0]! + i));

          // Unlike the other two, this one CAN be declined: a
          // player part-way into casting something may change
          // their mind, and Forge unwinds the cast.
          await expect(panel.getByRole("button", { name: "Pass" })).toBeVisible();
        },
      },
    ];
    const seen = new Set<string>();

    // Bounded by the CLOCK, not by a loop counter. The first
    // version counted every pass of the loop, including the ones
    // that only waited 200ms because nobody held priority, and so
    // spent its whole budget waiting while a perfectly healthy game
    // played on behind it: 1,200 "steps", four minutes, eleven
    // actual decisions answered.
    const deadline = Date.now() + 600_000;
    let answered = 0;

    while (Date.now() < deadline && seen.size < questions.length) {
      // --- is one of the questions under test on screen? --------
      let handled = false;
      for (const question of questions) {
        if (seen.has(question.name)) {
          continue;
        }
        const on = (await matchPanel(host).getByRole("heading", { name: question.heading }).count())
          ? host
          : (await matchPanel(guest).getByRole("heading", { name: question.heading }).count())
            ? guest
            : null;
        if (!on) {
          continue;
        }
        const panel = matchPanel(on);

        await question.check(panel);

        // AGENTS TEST-011 — leave something to LOOK AT, on success,
        // because the screenshots Playwright writes by default only
        // exist once something is already known to be wrong.
        await on.screenshot({ path: question.shot, fullPage: true });

        // And it is answerable: the answer reaches Forge and the
        // game moves on, which is the half a screenshot cannot
        // show.
        //
        // "The question went away" is NOT the post-condition. A
        // sort asks again with one fewer card and the same
        // heading, and so does picking several of something: three
        // cards to order is two questions, and waiting sixty
        // seconds for the heading to vanish failed all five runs
        // on a game that was working perfectly. What has to be
        // true is that the game MOVED -- this question is gone, or
        // it is a shorter one.
        const before = await panel.getByRole("listitem").getByRole("button").count();
        await panel.getByRole("listitem").getByRole("button").first().click();
        await expect
          .poll(
            async () =>
              (await panel.getByRole("heading", { name: question.heading }).count()) === 0 ||
              (await panel.getByRole("listitem").getByRole("button").count()) !== before,
            { timeout: 60_000 },
          )
          .toBe(true);

        seen.add(question.name);
        answered += 1;
        handled = true;
        break;
      }
      if (handled) {
        continue;
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
          /The game is over|was a draw|ended without a result|You won on turn|You won\.|opponent won|won on turn|stopped before it finished/,
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

      // PLAY TOWARDS THE DECISIONS, deliberately. This is not a
      // test of how well anything plays; it is a test that these
      // decisions can be reached, answered and seen. So Elspeth
      // comes first whenever she is on offer -- which casts her,
      // and on later turns activates her -- and her ability is once
      // a turn, so the rest of the turn still falls through to
      // creatures.
      //
      // Creatures matter because the +1 targets one: "up to one
      // target creature" asks nothing at all when there is none.
      // Elspeth's -3 FIRST when it is on offer: it looks at the
      // top seven and puts a permanent onto the battlefield, which
      // is the library search, and it carries the delayed reveal
      // that search prompts are supposed to show. Her ability is
      // once a turn and -3 is only affordable some turns, so the
      // +1 — and with it the counter-type question — still
      // happens on all the others.
      const dig = labels.findIndex((label) => /Look at the top/i.test(label));
      const elspeth = dig >= 0 ? dig : labels.findIndex((label) => label.includes("Elspeth"));
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

    // The whole reason this file exists. A planeswalker ability was
    // activated, which means its loyalty cost was PAID (§6.91 —
    // nothing else can activate it), it resolved, and Forge asked a
    // question the adapter can now answer; and a modal card asked
    // which of its two things to do.
    const missing = questions.filter((q) => !seen.has(q.name)).map((q) => q.name);
    expect(missing, `never asked in ${answered} answered decisions`).toEqual([]);

    // --- P6-X: the artwork actually arrived -------------------
    //
    // Asserted end to end rather than at any one layer, because
    // every layer of this chain was correct the first time and the
    // artwork still did not appear: the server annotated the
    // snapshot, the page knew how to draw it, and the PARSER in
    // between copied named fields and quietly dropped `art`.
    // Nothing failed; there was simply no picture.
    //
    //     Forge object → visible identity → asset reference
    //                  → authorised fetch → pixels on screen
    //
    // A 200 on the response is the only step that proves the last
    // two, so the response is what is waited for.
    const art = matchPanel(host).locator("img.card-art");
    await expect(art.first()).toBeVisible({ timeout: 60_000 });

    const src = await art.first().getAttribute("src");
    expect(src, "the reference is match-scoped and opaque (§6.122, §6.123)").toMatch(
      /^\/api\/matches\/[0-9a-f-]{36}\/assets\/[0-9a-f]{64}$/,
    );

    const fetched = await host.request.get(src!);
    expect(fetched.status(), "an authorised viewer gets the image").toBe(200);
    expect(fetched.headers()["content-type"] ?? "").toContain("image");

    // --- P6-Z: and cannot walk the rest of the deck -----------
    //
    // A well-formed reference this viewer was never shown. Same
    // match, same session, and §4.65's rule says it answers the
    // same way a nonexistent one does.
    const unseen = "b".repeat(64);
    // The match id out of the reference that just worked, so the
    // two requests differ in exactly one thing: the asset.
    const scope = src!.slice(0, src!.lastIndexOf("/"));
    const refused = await host.request.get(`${scope}/${unseen}`);
    expect(refused.status(), "§6.129 — one visible card is not the package").toBe(404);
  } finally {
    await clearEverything(host).catch(() => undefined);
    await hostContext.close();
    await guestContext.close();
  }
});
