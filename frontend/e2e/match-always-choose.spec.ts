// You always choose: Appetite for Brains with ONE card that fits, in a real
// game -- spec 0104 (F-0104-I), AGENTS TEST-012.
//
// 1. The host casts Appetite for Brains at the guest, whose hand holds one
//    card of mana value 4 or more (Hill Giant). The host's tray shows the
//    guest's whole hand: Hill Giant lit, the others dimmed with the game's
//    reasons; it stays (nothing is picked for the host) until the host
//    REALLY clicks Hill Giant. Meanwhile the guest's waiting line says
//    "Choosing from your hand" and its page has no tray.
// 2. The guest's page shows the report window "... exiled your Hill Giant.";
//    it is still there after the next turn begins, and the guest REALLY
//    clicks Close. The host gets no window for it.
// 3. The host casts its second Appetite for Brains: nothing fits now, so
//    nothing is asked; the host's plain reveal of the guest's hand stays
//    after the next turn begins, until the host really clicks Close.
// 4. The host casts Shardless Agent; cascade offers Giant Killer, of which
//    only the creature can be cast (Chop Down is mana value 3): the host is
//    asked which half all the same (owner 2026-11-19) and really clicks it.
//
// Waits on states (the tray there, the window there, the turn number
// changed), never on an animation frame. Dealt (spec 0098). The deck is
// protocol/fixtures/always-choose-deck. CI builds it; locally:
//
//   node scripts/make-ci-deck.mjs "Test Deck/always-choose-deck-2.zip" protocol/fixtures/always-choose-deck

import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  answerCardTray,
  boardCards,
  choices,
  clearEverything,
  clickNow,
  discardIfAsked,
  matchPanel,
  passButton,
  passCombat,
  realClick,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";

test.describe.configure({ timeout: 1_200_000 });

const pkg = join(process.cwd(), "..", "Test Deck", "always-choose-deck-2.zip");
const SHOTS = process.env.PROXIC_SHOTS ?? "test-results/seen";
const CLIPS = process.env.PROXIC_CLIPS;

const turnOf = async (page: Page) =>
  Number((await page.locator(".gs-turn-value").allTextContents())[0] ?? 0) || 0;
/** The tray for a card from another player's hand, on this page. */
const handTray = (page: Page) =>
  matchPanel(page).locator('.gs-win.gs-tray[data-kind="chooseSingleEntityForEffect"]');
const windowSaying = (page: Page, words: RegExp) =>
  page.locator(".gs-reveal").filter({ hasText: words });
const inHand = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-unpayable="true"])')
    .filter({ hasText: name });

test("Appetite for Brains with one card that fits: the host clicks it; the guest's window stays past the turn line; a reveal with nothing to take stays until closed", async ({
  browser,
}) => {
  test.skip(!existsSync(pkg), "no always-choose deck package (CI builds it)");
  const viewport = { width: 1920, height: 1080 };
  const context = (name: string) =>
    browser.newContext({
      viewport,
      ...(CLIPS ? { recordVideo: { dir: join(CLIPS, name), size: viewport } } : {}),
    });
  const host = await (await context("host")).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await context("guest")).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck, {
      deal: {
        // Two Appetites: one at the Giant, one when nothing fits any more;
        // then Shardless Agent (Swamp, Forest, Island) cascading into Giant
        // Killer, whose Chop Down (mana value 3) cascade may not cast.
        host: {
          hand: [
            "Swamp",
            "Appetite for Brains",
            "Forest",
            "Appetite for Brains",
            "Island",
            "Shardless Agent",
            "Swamp",
          ],
          // The draws are Swamps (lands, which cascade passes over); then Giant Killer.
          top: ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Giant Killer", "Giant Killer"],
        },
        // One card of mana value 4 or more; nothing the guest can cast (no land is played).
        guest: {
          hand: [
            "Hill Giant",
            "Lightning Bolt",
            "Island",
            "Island",
            "Island",
            "Grizzly Bears",
            "Counterspell",
          ],
          top: ["Island", "Island", "Island", "Island", "Island", "Island"],
        },
      },
    });

    let casts = 0;
    let tray: Record<string, unknown> | null = null;
    let clicked = false;
    let told: { said: string; turn: number } | null = null;
    let toldLater = false;
    let toldClosed = false;
    let reveal: { title: string; turn: number } | null = null;
    let revealLater = false;
    let revealClosed = false;
    // Step 4 -- the adventure half, asked although only one can be cast.
    let agentCast = false;
    let half: { options: string[]; text: string } | null = null;
    let killerDown = false;
    // The caster's own windows about the exile (there must be none).
    const hostSaid: string[] = [];
    const done = () => toldClosed && revealClosed && killerDown;
    const deadline = Date.now() + 1_000_000;
    const watch = watchGame([host, guest], () => ({
      casts,
      tray: !!tray,
      clicked,
      told,
      toldLater,
      reveal,
      revealLater,
    }));

    while (!done() && Date.now() < deadline) {
      await watch.check();
      for (const page of [host, guest]) {
        const isHost = page === host;
        const panel = matchPanel(page);
        if ((await page.locator(".gs-over").count()) > 0) break;
        if (await discardIfAsked(page)) continue;

        // Step 1 -- the host's tray: the whole hand, Hill Giant lit, the rest dimmed.
        if (isHost && (await handTray(page).count()) > 0 && !clicked) {
          const t = handTray(page).first();
          const tiles = t.locator("button.gs-win-tile");
          await expect(tiles).toHaveCount(7, { timeout: 10_000 });
          // It stays: nothing is picked for the host (persisting state, not a frame).
          await page.waitForTimeout(2_000);
          const stays = (await handTray(page).count()) > 0;
          const read = await tiles.evaluateAll((els) =>
            els.map((el) => ({
              name: el.querySelector(".gs-win-tile-name")?.textContent ?? "",
              why: el.querySelector(".gs-win-tile-caption")?.textContent ?? null,
              disabled: (el as HTMLButtonElement).disabled,
              lit: el.classList.contains("gs-win-tile-lit"),
            })),
          );
          // The guest's side, while the host chooses (HID-005): no tray, its own line.
          const guestTrays = await guest.locator(".gs-win.gs-tray, .gs-win-tile").count();
          const guestLine = await expect
            .poll(
              async () =>
                (await matchPanel(guest).locator(".gs-waiting-sub").allTextContents()).join(" "),
              {
                timeout: 10_000,
              },
            )
            .toContain("Choosing from your hand")
            .then(
              () => "Choosing from your hand",
              async () =>
                (await matchPanel(guest).locator(".gs-waiting-sub").allTextContents()).join(" "),
            );
          // Owner 2026-11-19: the words fit the act button (not cut off).
          const guestLineFits = await matchPanel(guest)
            .locator(".gs-waiting-sub")
            .first()
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
            .catch(() => false);
          // Owner 2026-11-19: a seven-card hand sits in one row.
          const rows = await tiles.evaluateAll(
            (els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))).size,
          );
          tray = {
            stays,
            read,
            guestLineFits,
            rows,
            title: (await t.locator(".gs-win-title, h2").allTextContents()).join(" "),
            text: ((await t.textContent()) ?? "").replace(/\s+/g, " "),
            guestTrays,
            guestLine,
          };
          await host.screenshot({ path: join(SHOTS, "always-choose-lit.png") });
          await guest.screenshot({ path: join(SHOTS, "always-choose-guest-waiting.png") });
          const giant = t
            .locator("button.gs-win-tile:not(:disabled)")
            .filter({ hasText: /^Hill Giant/ });
          clicked = await realClick(page, giant);
          continue;
        }

        // Step 2 -- the guest's window, kept past the turn line, then closed.
        const exiled = windowSaying(page, /exiled your Hill Giant\./);
        if (!isHost && (await exiled.count()) > 0) {
          const turn = await turnOf(page);
          if (!told) {
            told = {
              said: ((await exiled.first().textContent()) ?? "").replace(/\s+/g, " "),
              turn,
            };
            await guest.screenshot({ path: join(SHOTS, "always-choose-victim.png") });
          } else if (turn > told.turn && !toldLater) {
            toldLater = true;
            await guest.screenshot({ path: join(SHOTS, "always-choose-victim-next-turn.png") });
            toldClosed = await realClick(page, exiled.first().locator(".gs-reveal-close"));
            continue;
          }
        }
        // Step 3 -- the host's plain reveal (nothing to take), kept past the turn line.
        const revealed = windowSaying(page, /Appetite for Brains revealed/);
        if (isHost && casts >= 2 && (await revealed.count()) > 0) {
          const turn = await turnOf(page);
          if (!reveal) {
            reveal = {
              title: ((await revealed.first().textContent()) ?? "").replace(/\s+/g, " "),
              turn,
            };
          } else if (turn > reveal.turn && !revealLater) {
            revealLater = true;
            await host.screenshot({ path: join(SHOTS, "always-choose-reveal-next-turn.png") });
            revealClosed = await realClick(page, revealed.first().locator(".gs-reveal-close"));
            continue;
          }
        }
        // Step 4 -- the cascade's offer, then the half to cast (getAbilityToPlay):
        // asked although only Giant Killer itself can be cast (owner 2026-11-19).
        if (isHost && agentCast && !killerDown) {
          if (
            (await boardCards(page, "viewer")
              .filter({ hasText: /^Giant Killer/ })
              .count()) > 0
          ) {
            killerDown = true;
            continue;
          }
          const which = panel.getByText("Choose which ability");
          if (!half && (await which.count()) > 0) {
            await page.screenshot({ path: join(SHOTS, "always-choose-adventure-half.png") });
            const listed = await choices(page);
            await expect(listed.first())
              .toBeVisible({ timeout: 5_000 })
              .catch(() => undefined);
            half = {
              options: (await listed.allTextContents()).map((s) => s.replace(/\s+/g, " ").trim()),
              text: ((await panel.textContent()) ?? "").replace(/\s+/g, " ").slice(0, 400),
            };
            const creature = listed.filter({ hasText: /Giant Killer/ });
            if ((await creature.count()) > 0) await realClick(page, creature.first());
            continue;
          }
          const offer = panel.locator(".gs-win").filter({ hasText: /Giant Killer/ });
          const yes = offer.getByRole("button", { name: /^(Yes|Cast)/ });
          if (!half && (await yes.count()) > 0) {
            await realClick(page, yes.first());
            continue;
          }
        }
        if (isHost) {
          for (const s of await page.locator(".gs-reveal").allTextContents())
            if (/exiled/.test(s) && !hostSaid.includes(s)) hostSaid.push(s);
        }
        // Any other window this test is not about: closed.
        const other = page
          .locator(".gs-reveal")
          .filter({ hasNotText: /exiled your Hill Giant|Appetite for Brains revealed/ })
          .locator(".gs-reveal-close");
        if ((await other.count()) > 0) {
          await clickNow(other);
          continue;
        }
        if (await answerCardTray(page)) continue;
        const combat = panel.locator("button.gs-act-combat");
        if ((await combat.count()) > 0) {
          await passCombat(page);
          continue;
        }

        // Casting Appetite: its target is the guest's life shield; paying taps a Swamp.
        const targeting = panel.locator('.gs-win[data-kind="chooseTargetsFor"]');
        const cast = page.locator(".gs-cast:not(.gs-cast-leaving)");
        if (isHost && ((await targeting.count()) > 0 || (await cast.count()) > 0)) {
          const theirLife = panel.locator(".gs-seat-opponent .gs-life.gs-choosable");
          if ((await targeting.count()) > 0 && (await theirLife.count()) > 0) {
            await realClick(page, theirLife);
            continue;
          }
          const tap = page.locator(
            '.bf-cards button[data-choosable="true"][data-controller="viewer"]:not([data-zone="viewer:hand"])',
          );
          const listed = panel.locator(".gs-win li button, .gs-question li button");
          if ((await tap.count()) > 0) await clickNow(tap);
          else if ((await listed.count()) > 0) await clickNow(listed);
          else await clickNow(panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)"));
          continue;
        }

        const priority =
          (await panel
            .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
            .count()) > 0;
        if (!priority) {
          const main = panel.locator(".gs-win button.gs-win-btn-main:not(:disabled)");
          const listed = panel.locator(".gs-question li button, .gs-win li button");
          if ((await listed.count()) > 0) await clickNow(listed);
          else if ((await main.count()) > 0) await clickNow(main);
          else await clickNow(passButton(page));
          continue;
        }
        // The host plays a Swamp, then casts: the first Appetite at once, the
        // second once the guest's window has been closed (the next turn).
        const stackEmpty = (await page.locator('button[data-zone="stack"]').count()) === 0;
        let pick: Locator | null = null;
        if (isHost && stackEmpty) {
          const appetite = inHand(page, /^Appetite for Brains/);
          const agent = inHand(page, /^Shardless Agent/);
          const wantCast = casts === 0 || (casts === 1 && toldClosed);
          // A land each turn: a Swamp first (Appetite's), then Forest and Island (the Agent's).
          const swampDown =
            (await boardCards(page, "viewer")
              .filter({ hasText: /^Swamp/ })
              .count()) > 0;
          const land = swampDown ? inHand(page, /^(Forest|Island|Swamp)/) : inHand(page, /^Swamp/);
          if (wantCast && (await appetite.count()) > 0) pick = appetite;
          else if (revealClosed && !agentCast && (await agent.count()) > 0) pick = agent;
          else if ((await land.count()) > 0) {
            // Forest, then Island, before more Swamps.
            for (const name of [/^Forest/, /^Island/, /^Swamp/]) {
              const one = land.filter({ hasText: name });
              if ((await one.count()) > 0) {
                pick = one;
                break;
              }
            }
          }
        }
        if (pick && (await pick.count()) > 0) {
          const what = (await pick.first().textContent()) ?? "";
          if (await realClick(page, pick)) {
            if (/Appetite/.test(what)) casts += 1;
            if (/Shardless Agent/.test(what)) agentCast = true;
          }
        } else await clickNow(passButton(page));
      }
    }

    console.log(`step 1 (the host's tray): ${JSON.stringify(tray)}`);
    console.log(`step 2 (the guest's window): ${JSON.stringify({ told, toldLater, toldClosed })}`);
    console.log(
      `step 3 (the host's reveal): ${JSON.stringify({ reveal, revealLater, revealClosed })}`,
    );
    console.log(`step 4 (the adventure half): ${JSON.stringify({ agentCast, half, killerDown })}`);
    expect(tray, "the host was asked, with the guest's hand in a tray").not.toBeNull();
    expect(tray!["stays"], "nothing was picked for the host: the tray waited").toBe(true);
    const read = tray!["read"] as {
      name: string;
      why: string | null;
      disabled: boolean;
      lit: boolean;
    }[];
    expect(read.map((r) => r.name).sort()).toEqual(
      [
        "Counterspell",
        "Grizzly Bears",
        "Hill Giant",
        "Island",
        "Island",
        "Island",
        "Lightning Bolt",
      ].sort(),
    );
    const giant = read.find((r) => r.name === "Hill Giant")!;
    expect(giant, "Hill Giant lit and clickable").toMatchObject({
      disabled: false,
      lit: true,
      why: null,
    });
    const why = Object.fromEntries(
      read.filter((r) => r.name !== "Hill Giant").map((r) => [r.name, r.why]),
    );
    expect(why).toEqual({
      "Lightning Bolt": "mana value 1",
      Island: "a land",
      "Grizzly Bears": "mana value 2",
      Counterspell: "mana value 2",
    });
    expect(read.filter((r) => r.name !== "Hill Giant").every((r) => r.disabled && !r.lit)).toBe(
      true,
    );
    expect(tray!["text"], "whose hand, in the tray's words").toContain("hand.");
    expect(tray!["text"], "the card's own words").toContain("mana value 4 or greater");
    expect(tray!["text"]).not.toMatch(/Forge/);
    expect(tray!["guestTrays"], "the guest's page has no tray for the host's choice").toBe(0);
    expect(tray!["guestLine"]).toBe("Choosing from your hand");
    expect(tray!["guestLineFits"], "the guest's line fits its button").toBe(true);
    expect(tray!["rows"], "the seven-card hand sits in one row").toBe(1);
    expect(clicked, "the host really clicked Hill Giant").toBe(true);
    expect(hostSaid, "the caster gets no window for it").toEqual([]);
    expect(told?.said, "the guest's window").toMatch(/exiled your Hill Giant\./);
    expect(toldLater, "the guest's window is still there after the next turn begins").toBe(true);
    expect(toldClosed, "the guest really closed it").toBe(true);
    await expect(windowSaying(guest, /exiled your Hill Giant/)).toHaveCount(0);
    expect(reveal, "the second Appetite: the host's plain reveal of the hand").not.toBeNull();
    expect(revealLater, "the reveal is still there after the next turn begins").toBe(true);
    expect(revealClosed, "the host really closed it").toBe(true);
    await expect(windowSaying(host, /Appetite for Brains revealed/)).toHaveCount(0);
    // Step 4 (owner 2026-11-19, "Ask her too"): the half, asked with one option, clicked.
    expect(agentCast, "the host cast Shardless Agent").toBe(true);
    expect(half, "the host was asked which half of Giant Killer to cast").not.toBeNull();
    expect(half!.options, "one half can be cast (Chop Down is mana value 3)").toHaveLength(1);
    expect(half!.options[0]).toMatch(/Giant Killer/);
    expect(killerDown, "the clicked half, Giant Killer, is on the battlefield").toBe(true);
  } finally {
    await host.context().close();
    await guest.context().close();
  }
});
