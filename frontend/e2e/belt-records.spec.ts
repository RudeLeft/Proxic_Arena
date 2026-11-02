// Spec 0048 — the Belt's 7-day rule as players see it, and the Admin
// Belt and records tab (F-0048-C, F-0048-G).
//
// What the server works out (who holds the Belt, when it is due, what a
// purge deletes) is proved by HallTest and AdminPurgeTest on a real
// database. These prove the pages: the Hall's date, bar and rule; the
// holder's lobby reminder; and that a reset or purge happens only after
// the word is typed. The shared test stack is never purged: the delete
// and reset calls are answered here, and the page's request is checked.

import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const DAY = 86_400_000;

async function myId(page: Page): Promise<string> {
  const me = (await (await page.request.get("/api/auth/me")).json()) as {
    user: { userId: string };
  };
  return me.user.userId;
}

test("the Hall says when the holder must defend the Belt, and the rule; after a reset, who takes it", async ({
  page,
}) => {
  await signIn(page);
  const me = await myId(page);
  const defendBy = new Date(Date.now() + 4 * DAY + 3_600_000).toISOString();
  let holder: string | null = me;
  await page.route("**/api/hall", async (route) => {
    const response = await route.fetch();
    const hall = (await response.json()) as { belt: Record<string, unknown> };
    hall.belt = holder
      ? {
          holder,
          since: new Date(Date.now() - 3 * DAY).toISOString(),
          defences: 2,
          defendBy,
          idleDays: 7,
        }
      : { holder: null, since: null, defences: 0, defendBy: null, idleDays: 7 };
    await route.fulfill({ response, json: hall });
  });

  await page.goto("/hall");
  const belt = page.getByLabel("The Champion's Belt");
  await expect(page.getByTestId("belt-defend")).toHaveText(
    /^Defend by \w{3} \d{1,2} \w{3} · 4 days left$/,
  );
  await expect(belt).toContainText(
    "Finish a game every 7 days or the belt passes to the top-rated active player.",
  );
  const bar = await page.locator(".pa-hp-defend-bar i").evaluate((el) => {
    const parent = el.parentElement!.getBoundingClientRect().width;
    return el.getBoundingClientRect().width / parent;
  });
  expect(bar).toBeGreaterThan(0.55);
  expect(bar).toBeLessThan(0.65);
  await page.screenshot({ path: "test-results/seen/hall-defend-by.png" });

  holder = null;
  await page.reload();
  await expect(belt).toContainText("Nobody holds the belt — the next game's winner takes it.");
  await expect(page.getByTestId("belt-defend")).toHaveCount(0);
});

test("the holder is reminded in the lobby two days before the Belt is due, and not before", async ({
  page,
}) => {
  await signIn(page);
  const me = await myId(page);
  let dueIn = 1.5 * DAY;
  // The server's STANDINGS, with this player holding the Belt and due soon.
  await page.routeWebSocket("**/ws/user", (client) => {
    const server = client.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.includes('"STANDINGS"')) {
        const standings = JSON.parse(message) as Record<string, unknown>;
        standings["belt"] = me;
        standings["beltDefendBy"] = new Date(Date.now() + dueIn).toISOString();
        client.send(JSON.stringify(standings));
      } else {
        client.send(message);
      }
    });
  });

  await page.goto("/lobby");
  const reminder = page.getByTestId("belt-remind");
  await expect(reminder).toHaveText(
    /^Defend your belt by \w{3} \d{1,2} \w{3}: finish a game, or it passes on\.$/,
  );
  await page.screenshot({ path: "test-results/seen/lobby-belt-reminder.png" });

  dueIn = 5 * DAY;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Players" }).first()).toBeVisible();
  await expect(reminder).toHaveCount(0);
});

test("Belt and records: each purge shows what it deletes and needs PURGE; Reset the Belt needs RESET", async ({
  page,
}) => {
  await signIn(page);
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/admin/belt", (route) =>
    route.fulfill({
      json: {
        holder: "Pat",
        since: new Date(Date.now() - 2 * DAY).toISOString(),
        defences: 1,
        defendBy: new Date(Date.now() + 5 * DAY + 3_600_000).toISOString(),
      },
    }),
  );
  await page.route("**/api/admin/belt/reset", async (route) => {
    sent.push({ path: "reset", body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill({ json: { holder: null, since: null, defences: 0, defendBy: null } });
  });
  // The player and date previews are answered here; a fresh start's is the server's own.
  await page.route("**/api/admin/purge/preview", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body["scope"] === "everything") return route.fallback();
    await route.fulfill({
      json:
        body["scope"] === "player"
          ? { games: 37, against: { RudeLeft: 31, Ash: 6 } }
          : { games: 112 },
    });
  });
  await page.route("**/api/admin/purge", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push({ path: "purge", body });
    await route.fulfill({ json: { games: 37, against: { RudeLeft: 31, Ash: 6 } } });
  });

  await page.goto("/admin?tab=records");
  const panel = page.getByRole("tabpanel");
  await expect(page.getByRole("tab", { name: "Belt and records" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // The Belt, and Reset only once RESET is typed.
  await expect(panel.getByTestId("admin-belt")).toContainText("Pat holds it");
  await expect(panel.getByTestId("admin-belt")).toContainText("5 days left");
  const reset = panel.getByRole("button", { name: "Reset the Belt" });
  await expect(reset).toBeDisabled();
  await panel.getByLabel("Type RESET to reset the Belt").fill("reset");
  await expect(reset).toBeDisabled();
  await panel.getByLabel("Type RESET to reset the Belt").fill("RESET");
  await reset.click();
  await expect(panel.getByTestId("admin-belt")).toHaveText(
    "Nobody holds it: the next game's winner takes it.",
  );
  expect(sent).toEqual([{ path: "reset", body: { scope: "belt", confirm: "RESET" } }]);

  // One player's games: pick, read what goes, type PURGE.
  const player = panel.getByLabel("Player");
  const pat = await player.locator("option", { hasText: "Pat" }).first().getAttribute("value");
  expect(pat).toBeTruthy();
  await player.selectOption(pat);
  const preview = panel.getByTestId("purge-preview");
  await expect(preview).toHaveText(
    "Delete 37 games (Pat played them all; 31 were against RudeLeft, 6 against Ash) and their recordings.",
  );
  const remove = panel.getByRole("button", { name: "Delete", exact: true });
  await expect(remove).toBeDisabled();
  await panel.getByLabel("Type PURGE to delete").fill("PURGE");
  await page.screenshot({ path: "test-results/seen/admin-belt-and-records.png" });
  await remove.click();
  await expect(
    panel.getByRole("status").filter({ hasText: "Done. Deleted 37 games" }),
  ).toBeVisible();
  expect(sent[1]).toEqual({
    path: "purge",
    body: { scope: "player", userId: pat, confirm: "PURGE" },
  });
  await expect(panel.getByLabel("Type PURGE to delete")).toHaveValue("");

  // Games before a date.
  await panel.getByRole("radio", { name: "Games before a date" }).click();
  await panel.getByLabel("Games that ended before").fill("2026-11-01");
  await expect(preview).toHaveText(
    "Delete 112 games that ended before 1 Nov and their recordings.",
  );

  // A fresh start: the server's real counts (nothing is deleted here).
  const fresh = page.waitForResponse((r) => r.url().endsWith("/api/admin/purge/preview"));
  await panel.getByRole("radio", { name: "Fresh start" }).click();
  const real = (await (await fresh).json()) as { games?: number; accountsKept?: number };
  // Its own numbers, never the date choice's left over (they once flashed up together).
  await expect(preview).toContainText(`Delete ${(real.games ?? 0).toLocaleString("en")} game`);
  await expect(preview).toContainText(
    `and every chat message. ${(real.accountsKept ?? 0).toLocaleString("en")} account`,
  );
  await page.screenshot({ path: "test-results/seen/admin-fresh-start.png" });
  expect(sent).toHaveLength(2);
});
