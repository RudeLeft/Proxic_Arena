// Phase 9 Amendment 21 (owner 2026-11-06) -- the last two "not built" parts,
// in a real game page on the real server:
//
//  - several modes: one window, ticked, "Choose two · 1 of 2", then Done;
//    the page then answers the game's one-mode-at-a-time questions itself,
//    in the order ticked, and says "no more" when the ticks run out;
//  - the other player's waiting line says what they are doing
//    ("Splitting the cards"), never "May respond" when they aren't.
//
// What the game sends was proven by the Mechanics Lab (check-modes: the
// count on every mode question; the server's AskingWordsTest: the word
// and nothing of the question). Here the guest's question and the asking
// message are said again as the server says them (routeWebSocket), and
// the guest's answers are caught on the socket instead of reaching the
// server, so the page's own plan can be seen answering.

import { expect, test, type WebSocketRoute } from "@playwright/test";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

type Frame = Record<string, unknown>;
const MODES = [
  "Counter target spell.",
  "Return target permanent to its owner's hand.",
  "Tap all creatures your opponents control.",
  "Draw a card.",
];

test("several modes are ticked then Done, and the page answers the rest; the waiting line says what they are doing", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  let client: WebSocketRoute | null = null;
  let lastAsk = "";
  let seat = 0;
  let catching = false;
  const answers: Frame[] = [];
  await guest.routeWebSocket("**/ws/matches/**", (ws) => {
    client = ws;
    const server = ws.connectToServer();
    server.onMessage((m) => {
      if (typeof m === "string" && m.includes('"DECISION_REQUEST"')) lastAsk = m;
      if (typeof m === "string" && m.includes('"MATCH_SNAPSHOT"')) {
        seat = (JSON.parse(m) as { state: { seat: number } }).state.seat;
      }
      if (catching && typeof m === "string" && /"(DECISION_|MATCH_ASKING)/.test(m)) return;
      ws.send(m);
    });
    ws.onMessage((m) => {
      if (catching && typeof m === "string" && m.includes('"DECISION_RESPONSE"')) {
        answers.push(JSON.parse(m) as Frame);
        return;
      }
      server.send(m);
    });
  });

  try {
    const deck = await sharedDeck(
      host,
      guest,
      join(process.cwd(), "..", "Test Deck", "ci-deck.zip"),
    );
    await startAMatch(host, guest, deck);
    await expect.poll(() => lastAsk !== "" && seat > 0, { timeout: 120_000 }).toBe(true);
    catching = true;
    const send = (frame: Frame) => client?.send(JSON.stringify(frame));
    const panel = matchPanel(guest);
    let id = 600_000;
    const ask = (round: number, chosen: string[], mandatory: boolean) => {
      const left = MODES.filter((m) => !chosen.includes(m));
      send({
        ...(JSON.parse(lastAsk) as Frame),
        decisionId: ++id,
        actedForSeat: seat,
        kind: "chooseModeForAbility",
        mandatory,
        prompt: mandatory
          ? "Choose a mode for Cryptic Command."
          : "Choose another mode for Cryptic Command, or pass to take no more.",
        options: left.map((label, i) => ({ actionId: `mode:${i}:r${round}`, label })),
        arrange: {
          modes: { num: 3, min: 1, repeat: false, chosen, paws: left.map(() => 0) },
        },
      });
    };

    // 1. Choose one to three: the window counts; tick two, Done.
    ask(1, [], true);
    const window = panel.getByRole("dialog", { name: /^Choose one to three/ });
    await expect(window).toBeVisible();
    await expect(window.locator(".gs-win-title")).toHaveText("Choose one to three · 0 chosen");
    await window.getByRole("button", { name: "Draw a card." }).click();
    await window.getByRole("button", { name: "Tap all creatures your opponents control." }).click();
    await expect(window.locator(".gs-win-title")).toHaveText("Choose one to three · 2 chosen");
    await guest.screenshot({ path: "test-results/seen/a21-modes.png" });
    await window.locator(".gs-modes-done").click();
    // The first tick, in the window's order, answers the first question.
    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0]!["actionId"]).toBe(`mode:2:r1`);

    // 2. The game asks again: the page answers from the ticks, no window.
    ask(2, ["Tap all creatures your opponents control."], false);
    await expect.poll(() => answers.length).toBe(2);
    expect(answers[1]!["actionId"]).toBe("mode:2:r2"); // "Draw a card." among the three left
    // 3. And once more: the ticks are spent, so "no more" (a pass).
    ask(3, ["Tap all creatures your opponents control.", "Draw a card."], false);
    await expect.poll(() => answers.length).toBe(3);
    expect(answers[2]!["actionId"] ?? null).toBeNull();

    // The waiting line: the other player is splitting the cards.
    send({ type: "DECISION_CLEARED" });
    send({ type: "MATCH_ASKING", seat: 3 - seat, doing: "Splitting the cards" });
    await expect(panel.locator(".gs-waiting")).toContainText("Splitting the cards");
    await expect(panel.locator(".gs-waiting")).not.toContainText("May respond");
    await guest.screenshot({ path: "test-results/seen/a21-splitting.png" });
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
