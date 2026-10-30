// Bug reports and ideas — spec 0039.
//
// A real game: the guest (a player, not an administrator) presses Report
// beside the gear, writes what happened and sends it, with the game going on
// behind. The host sends an idea from the title bar. Then, as the
// administrator: the Reports tab counts the new ones, opens the problem with
// its picture and logs, and its zip holds the README, the answers, the
// picture, the page's log, the game record and the server's lines.

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, sharedDeck, startAMatch } from "./match-helpers";

const realExport = join(process.cwd(), "..", "Test Deck", "Basic_Mono_Red_65_Card_Deck.zip");
const ciFixture = join(process.cwd(), "..", "Test Deck", "ci-deck.zip");
const pkg = existsSync(realExport) ? realExport : existsSync(ciFixture) ? ciFixture : null;

/** A zip's files by name, read from its central directory. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

test("a report from a real game reaches the administrator, with everything in its zip", async ({
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
  const matchId = (
    (await (await guest.request.get("/api/matches/current")).json()) as {
      match: { matchId: string };
    }
  ).match.matchId;

  // The guest reports a problem from the board.
  const stamp = `e2e ${Date.now()}`;
  // The board's own button, beside the gear (the title bar's sits under the board).
  await guest.locator("button.pa-report-coin").click();
  const form = guest.getByRole("dialog", { name: "Report a problem or an idea" });
  await expect(form.getByText(/^Turn \d+ · /)).toBeVisible();
  await expect(form.getByLabel("Add a picture of my screen as it is now")).toBeChecked();
  await form.getByLabel(/What happened\?/).fill(`The ${stamp} did nothing`);
  await form.getByRole("button", { name: "Small thing", exact: true }).click();
  await form.getByRole("button", { name: "Send report" }).click();
  const sent = guest.getByRole("status").filter({ hasText: "Thanks — report sent" });
  await expect(sent).toContainText("this game’s record");
  const number = Number((await sent.locator("b").innerText()).replace("#", ""));
  await sent.getByRole("button", { name: "Back to the game" }).click();
  await expect(guest.locator(".bf-cards")).toBeVisible();

  // A player cannot read reports.
  expect((await guest.request.get("/api/admin/reports")).status()).toBe(403);

  // The host sends an idea from the title bar of another page.
  await clearEverything(host);
  await host.goto("/decks");
  await host.getByRole("button", { name: "Report a problem or an idea" }).click();
  const ideaForm = host.getByRole("dialog", { name: "Report a problem or an idea" });
  await ideaForm.getByRole("tab", { name: "Suggest an idea" }).click();
  await ideaForm.getByLabel(/Your idea in a few words/).fill(`Idea ${stamp}`);
  await ideaForm.getByRole("button", { name: "Send idea" }).click();
  await expect(host.getByRole("status").filter({ hasText: "Thanks — report sent" })).toBeVisible();
  await host.getByRole("button", { name: "Close" }).click();

  // The administrator's Reports tab: counted, listed, opened.
  await host.goto("/admin?tab=reports");
  await expect(host.getByRole("tab", { name: /Reports/ }).locator(".pa-admin-tab-new")).toHaveText(
    /\d+ new/,
  );
  await host.getByRole("button", { name: new RegExp(`#${number} `) }).click();
  await expect(host.getByRole("heading", { name: `The ${stamp} did nothing` })).toBeVisible();
  await expect(host.getByRole("img", { name: /Their screen/ })).toBeVisible();
  await expect(host.getByRole("tab", { name: "The game record" })).toBeVisible();
  await expect(host.locator(".pa-report-log")).toContainText("DECISION");
  // Opening it marked it Seen.
  await expect(host.getByLabel("Status")).toHaveValue("SEEN");

  const zipResponse = await host.request.get(`/api/admin/reports/${number}/zip`);
  expect(zipResponse.status()).toBe(200);
  const files = unzip(await zipResponse.body());
  const root = `proxic-report-${number}/`;
  for (const name of [
    "README.md",
    "report.json",
    "screen.png",
    "browser-log.jsonl",
    "game-record.jsonl.gz",
    "server-log.txt",
  ]) {
    expect(files.has(root + name), name).toBe(true);
  }
  const report = JSON.parse(files.get(root + "report.json")!.toString()) as {
    kind: string;
    matchId: string;
    answers: Record<string, unknown>;
  };
  expect(report.kind).toBe("PROBLEM");
  expect(report.matchId).toBe(matchId);
  expect(report.answers["happened"]).toBe(`The ${stamp} did nothing`);
  expect(
    files
      .get(root + "screen.png")!
      .subarray(1, 4)
      .toString(),
  ).toBe("PNG");
  expect(files.get(root + "browser-log.jsonl")!.toString()).toContain("Report pressed");
  expect(gunzipSync(files.get(root + "game-record.jsonl.gz")!).toString()).toContain(
    "DECISION_REQUEST",
  );
  expect(files.get(root + "README.md")!.toString()).toContain(`The ${stamp} did nothing`);

  // Delete, after asking, leaves it gone.
  await host.getByRole("button", { name: "Delete", exact: true }).click();
  await host.getByRole("alert").getByRole("button", { name: "Delete" }).click();
  await expect(host.getByRole("heading", { name: "Reports" })).toBeVisible();
  expect((await host.request.get(`/api/admin/reports/${number}`)).status()).toBe(404);

  await clearEverything(guest);
  await host.context().close();
  await guest.context().close();
});
