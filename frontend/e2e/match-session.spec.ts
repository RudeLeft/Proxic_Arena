// What a browser can do to a match, and must not be able to change —
// PHASE_06 P6-T, P6-S, P6-R, P6-BB.
//
// Refresh, disconnect, a second tab, closing the browser. Each of
// these is something a real player does by accident, and each has a
// way of going wrong that the game would not notice: a refresh that
// launches a second match, a disconnect that passes on the player's
// behalf, a second tab whose duplicate answer lands on the NEXT
// question, a closed browser recorded as a concession.
//
// ONE MATCH, FOUR PROPERTIES, in order. A match costs a JVM and the
// file's other match tests have a known flake when a second match
// starts in the same run, so this does not start four.
//
// The subject is a question nobody has answered yet, so the pregame
// is deliberately NOT settled: the first decision of the game — play
// or draw — sits pending while the browser is refreshed, cut off,
// duplicated and closed around it.
//
// Asserted on the WebSocket FRAMES where it matters, not on the
// page: "exactly one answer was accepted" is a fact about the
// server, and a page can only show its opinion of it.

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

test.describe.configure({ timeout: 900_000 });

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const anyPackage = () =>
  existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

type Frame = { type?: string; decisionId?: number; [key: string]: unknown };

/** Every frame a page sends and receives, in order, across reloads. */
function watch(page: Page) {
  const seen: { dir: "in" | "out"; frame: Frame }[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/matches/")) return;
    const record = (dir: "in" | "out") => (event: { payload: string | Buffer }) => {
      try {
        seen.push({ dir, frame: JSON.parse(String(event.payload)) as Frame });
      } catch {
        // not JSON; not ours
      }
    };
    socket.on("framereceived", record("in"));
    socket.on("framesent", record("out"));
  });
  return seen;
}

const pregame = /Play or draw|Keep or mulligan|Put a card back/;

async function currentMatch(page: Page) {
  const body = (await (await page.request.get("/api/matches/current")).json()) as {
    match: { matchId: string; status: string; participants: unknown[] } | null;
  };
  return body.match;
}

async function question(page: Page) {
  const panel = matchPanel(page);
  return {
    heading: (await panel.getByRole("heading", { name: pregame }).first().textContent()) ?? "",
    options: await panel.getByRole("listitem").getByRole("button").allTextContents(),
  };
}

test("refresh, disconnect, a second tab and a closed browser change nothing", async ({
  browser,
}) => {
  const pkg = anyPackage();
  test.skip(!pkg, "no deck package available");

  const contexts: BrowserContext[] = [];
  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);

  const guestContext = await browser.newContext();
  contexts.push(guestContext);
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const frames = new Map<Page, ReturnType<typeof watch>>([
    [host, watch(host)],
    [guest, watch(guest)],
  ]);

  try {
    const deckName = await sharedDeck(host, guest, pkg!);
    await startAMatch(host, guest, deckName, { settle: false });

    // --- whoever is asked first ---------------------------------
    await expect
      .poll(
        async () =>
          (await matchPanel(host).getByRole("heading", { name: pregame }).count()) +
          (await matchPanel(guest).getByRole("heading", { name: pregame }).count()),
        { timeout: 300_000 },
      )
      .toBeGreaterThan(0);
    const asked = (await matchPanel(host).getByRole("heading", { name: pregame }).count())
      ? host
      : guest;
    const other = asked === host ? guest : host;
    const askedContext = asked === host ? hostContext : guestContext;
    const otherContext = asked === host ? guestContext : hostContext;
    const otherLogin =
      other === host
        ? (page: Page) => signIn(page)
        : (page: Page) => signInAs(page, secondUser, secondPassword);

    const before = await currentMatch(asked);
    expect(before, "a match exists").not.toBeNull();
    const original = await question(asked);
    expect(original.options.length).toBeGreaterThan(0);

    // --- P6-T: refresh ------------------------------------------
    //
    // Not a new match, not a new player, not a new Forge, and the
    // same question still waiting. §6.113.
    await asked.reload();
    await expect(matchPanel(asked).getByRole("heading", { name: pregame })).toBeVisible({
      timeout: 60_000,
    });
    expect(await question(asked), "the same question survives a refresh").toEqual(original);
    const afterRefresh = await currentMatch(asked);
    expect(afterRefresh?.matchId, "a refresh does not start another match").toBe(before!.matchId);
    expect(afterRefresh?.participants.length).toBe(before!.participants.length);

    // --- P6-S: disconnect while Forge waits ---------------------
    //
    // Gone for real: the page leaves, so the socket closes and the
    // server sees a disconnect, not a hidden tab. Forge must still
    // be waiting when the player comes back — nothing is answered
    // for somebody who is not there (§6.112) — and the returning
    // page must get the BOARD before the QUESTION (§6.110), because
    // a decision names objects by id.
    await asked.goto("about:blank");
    await asked.waitForTimeout(5_000);
    const whileAway = await currentMatch(other);
    expect(whileAway?.matchId, "the match outlives a disconnect").toBe(before!.matchId);
    expect(["LAUNCHING", "RUNNING"]).toContain(whileAway?.status);

    const log = frames.get(asked)!;
    const mark = log.length;
    await asked.goto("/play");
    await expect(matchPanel(asked).getByRole("heading", { name: pregame })).toBeVisible({
      timeout: 60_000,
    });
    expect(await question(asked), "the same question is waiting on return").toEqual(original);

    const since = log.slice(mark).filter((entry) => entry.dir === "in");
    const firstSnapshot = since.findIndex((entry) => entry.frame.type === "MATCH_SNAPSHOT");
    const firstQuestion = since.findIndex((entry) => entry.frame.type === "DECISION_REQUEST");
    expect(firstSnapshot, "a snapshot arrives on reconnect").toBeGreaterThanOrEqual(0);
    expect(firstQuestion, "the question is re-sent on reconnect").toBeGreaterThanOrEqual(0);
    expect(firstSnapshot, "state before the question that names it").toBeLessThan(firstQuestion);

    // --- P6-R: the same player in two tabs ----------------------
    //
    // Both may see it. Both may click. Exactly ONE answer may be
    // accepted for this decision: a second that slipped through
    // would not be ignored, it would become the answer to whatever
    // Forge asks next (Phase 0A measured 203 such leaks).
    const second = await askedContext.newPage();
    frames.set(second, watch(second));
    await second.goto("/play");
    await expect(matchPanel(second).getByRole("heading", { name: pregame })).toBeVisible({
      timeout: 60_000,
    });
    expect(await question(second), "the second tab sees the same question").toEqual(original);

    const pending = [...frames.get(asked)!]
      .reverse()
      .find((entry) => entry.dir === "in" && entry.frame.type === "DECISION_REQUEST");
    const decisionId = pending!.frame.decisionId!;

    await Promise.all([
      matchPanel(asked).getByRole("listitem").getByRole("button").first().click(),
      matchPanel(second).getByRole("listitem").getByRole("button").first().click(),
    ]);
    await asked.waitForTimeout(3_000);

    const about = (dir: "in" | "out", type: string) =>
      [asked, second].flatMap((page) =>
        frames
          .get(page)!
          .filter(
            (entry) =>
              entry.dir === dir &&
              entry.frame.type === type &&
              entry.frame.decisionId === decisionId,
          ),
      );
    const sent = about("out", "DECISION_RESPONSE").length;
    const accepted = about("in", "DECISION_ACCEPTED").length;
    // Both answers really went out. Without this the test passes
    // vacuously whenever the second click lands too late to send.
    expect(sent, "both tabs sent an answer to the same decision").toBe(2);
    const trace = [asked, second]
      .map((page, tab) =>
        frames
          .get(page)!
          .filter((entry) => entry.frame.decisionId === decisionId)
          .map(
            (entry) => `tab${tab} ${entry.dir} ${entry.frame.type} ${JSON.stringify(entry.frame)}`,
          )
          .join(" | "),
      )
      .join(" || ");
    expect(accepted, `exactly one answer accepted :: ${trace}`).toBe(1);

    // And the other tab is TOLD. Before the server claimed a
    // decision on first forward, both tabs got DECISION_ACCEPTED:
    // Forge applied the answer once (its gate refused the
    // duplicate), but the second tab believed its answer took, and
    // the worker's refusal arrived after the question had been
    // cleared and reached nobody. A tab that clicked "Draw first"
    // would have been told yes while the game played first.
    const refused = about("in", "DECISION_REFUSED").length;
    expect(refused, `the losing tab is told it lost :: ${trace}`).toBe(1);

    // --- P6-BB: closing a browser is not a concession -----------
    //
    // The other player shuts their browser entirely. The match goes
    // on, nobody has won it, and they come back to the same match.
    await otherContext.close();
    contexts.splice(contexts.indexOf(otherContext), 1);
    await asked.waitForTimeout(5_000);

    const afterClose = await currentMatch(asked);
    expect(afterClose?.matchId, "closing a browser does not end the match").toBe(before!.matchId);
    expect(["LAUNCHING", "RUNNING"], "no result is recorded for a closed browser").toContain(
      afterClose?.status,
    );

    const returnedContext = await browser.newContext();
    contexts.push(returnedContext);
    const returned = await returnedContext.newPage();
    await otherLogin(returned);
    const theirs = await currentMatch(returned);
    expect(theirs?.matchId, "they come back to the same match").toBe(before!.matchId);
  } finally {
    // Abandoned through whichever participant still has a browser:
    // the host's may be the one this test closed.
    for (const context of contexts) {
      const page = context.pages()[0];
      if (page) {
        await clearEverything(page).catch(() => undefined);
        break;
      }
    }
    for (const context of contexts) {
      await context.close().catch(() => undefined);
    }
  }
});
