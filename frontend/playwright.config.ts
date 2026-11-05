// Playwright — PHASE_01 §1.78–§1.80, acceptance tests P1-C and P1-L.
//
// Runs against the ACTUAL running application (§1.78), not a dev
// server and not a mock. By default that is the production Docker
// stack on 127.0.0.1:8080, which is what makes P1-C evidence rather
// than a screenshot I looked at once.
//
// Override with PROXIC_E2E_URL to point at any deployment, including
// https://proxic.barnflix.net (PHASE 1 AMENDMENT 1).

import { defineConfig, devices } from "@playwright/test";

// The game specs (frontend/e2e/match*.spec.ts) play real games and take
// ~90% of the suite's time; CI deals them over several machines by
// measured time (ci/browser-shard.mjs) and runs everything else on one.
// One pattern and its complement, so every spec is in exactly one
// project and a new spec can never fall between them. Kept in step with
// MATCH_SPEC in ci/browser-shard.mjs. Run with no --project, both run.
const MATCH_SPEC = /(^|[\\/])match[^\\/]*\.spec\.ts$/;

const chromium = {
  ...devices["Desktop Chrome"],
  // AGENTS UI-006 (owner 2026-10-30): the supported screen is a
  // 1920x1080 desktop or laptop; smaller is best effort, not tested.
  viewport: { width: 1920, height: 1080 },
  ...(process.env.PROXIC_E2E_CHANNEL === "bundled"
    ? {}
    : { channel: process.env.PROXIC_E2E_CHANNEL ?? "msedge" }),
};

export default defineConfig({
  testDir: "./e2e",
  // The stack is slow to settle on a cold start: Postgres health,
  // then the worker handshake.
  timeout: 45_000,
  expect: { timeout: 15_000 },
  // A flaky E2E that is retried until green is not evidence.
  retries: 0,
  // One worker, because every spec drives ONE server with ONE deck
  // database. Run in parallel, decks.spec and sharing.spec clear and
  // re-import the same account's decks at the same time, and the
  // loser fails for reasons that have nothing to do with the code --
  // which is worse than a slower suite: it teaches you to re-run
  // failures instead of reading them.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PROXIC_E2E_URL ?? "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Playwright's bundled Chromium will not start on this machine:
  // it needs the Microsoft Visual C++ runtime, which is absent, and
  // the failure is a bare "spawn UNKNOWN" that says nothing. Edge
  // ships with Windows, is the same engine, and launches.
  //
  // `channel` is the documented way to use an installed browser. On
  // a Linux CI runner the bundled Chromium works, so PROXIC_E2E_
  // CHANNEL can be left unset there.
  projects: [
    { name: "match", testMatch: MATCH_SPEC, use: chromium },
    { name: "other", testIgnore: MATCH_SPEC, use: chromium },
  ],
});
