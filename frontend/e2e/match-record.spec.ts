// The game record of a real match — PHASE_07 §7.56, P7-U.
//
// A real game, played a little: questions asked, answered, and one answer
// refused. Then the record is downloaded as the administrator and read:
// every kind of thing §7.56 lists must be in it, from both seats. The
// other player, who is not an administrator, is refused the download.

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, constants } from "node:zlib";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch, whoseTurn } from "./match-helpers";

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

interface Line {
  ms: number;
  from: "worker" | "server" | "note";
  frame: Record<string, unknown>;
}

test("a real match leaves a record of every question, answer and refusal, for the administrator only", async ({
  browser,
}) => {
  test.skip(!pkg, "no deck package available");
  test.setTimeout(600_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host);
  await clearEverything(host);
  const guest = await (await browser.newContext()).newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  const deck = await sharedDeck(host, guest, pkg!);
  await startAMatch(host, guest, deck);
  const current = (await (await host.request.get("/api/matches/current")).json()) as {
    match: { matchId: string };
  };
  const matchId = current.match.matchId;

  // Answer a question through the page: a pass.
  const { asked } = await whoseTurn(host, guest);
  await matchPanel(asked)
    .locator("button.gs-act, button.gs-pass")
    .first()
    .click({ timeout: 10_000 });

  // And one answer the server must refuse: to a question that does not exist.
  await guest.evaluate(async (id) => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/ws/matches/${id}`);
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
    socket.send(
      JSON.stringify({ type: "DECISION_RESPONSE", decisionId: 987654321, actionId: null }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    socket.close();
  }, matchId);

  // The match ends (abandoned), and its worker stops, which closes the record.
  await clearEverything(host);

  const path = `/api/admin/matches/${matchId}/record`;
  expect((await guest.request.get(path)).status(), "a player is refused the record").toBe(403);

  let lines: Line[] = [];
  await expect
    .poll(
      async () => {
        const got = await host.request.get(path);
        if (got.status() !== 200) return 0;
        // A record still being written has no gzip trailer: read what is there.
        const text = gunzipSync(await got.body(), {
          finishFlush: constants.Z_SYNC_FLUSH,
        }).toString();
        lines = text
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Line);
        return lines.length;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(10);

  const frames = (from: Line["from"], type?: string) =>
    lines.filter((l) => l.from === from && (type === undefined || l.frame["type"] === type));

  // Every question, to whom, with every option.
  const questions = frames("worker", "DECISION_REQUEST");
  expect(questions.length, "questions").toBeGreaterThan(0);
  for (const q of questions) {
    expect(q.frame["authorisedSeat"], "each question says to whom").toBeDefined();
    expect(Array.isArray(q.frame["options"]), "each question carries its options").toBe(true);
  }
  // Every answer, and whether it was taken.
  expect(frames("server", "DECISION_RESPONSE").length, "answers").toBeGreaterThan(0);
  expect(frames("worker", "DECISION_ACCEPTED").length, "answers taken").toBeGreaterThan(0);
  // The answer refused by the server, before the worker saw it.
  expect(
    frames("note").some((l) => l.frame["refusedAnswer"] && l.frame["decisionId"] === 987654321),
    "the refused answer",
  ).toBe(true);
  // Every snapshot, to each seat.
  const seats = new Set(frames("worker", "MATCH_SNAPSHOT").map((l) => l.frame["seat"]));
  expect([...seats].sort(), "both seats' snapshots").toEqual([1, 2]);
  // Forge's own game log, and the timings.
  expect(frames("worker", "GAME_LOG").length, "Forge's game log").toBeGreaterThan(0);
  const times = lines.map((l) => l.ms);
  expect(
    times.every((t, i) => i === 0 || t >= times[i - 1]!),
    "in order, timed",
  ).toBe(true);

  // And the administrator's page lists it, with its download.
  await host.goto("/admin?tab=games");
  const records = host.getByRole("region", { name: "Game records" });
  await expect(records.getByRole("link", { name: /Download record/ }).first()).toBeVisible();

  await host.context().close();
  await guest.context().close();
});
