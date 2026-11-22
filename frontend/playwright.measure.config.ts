// Phase 11's measuring kit (frontend/tools/measure/, PHASE_11 "The measuring
// kit"). Its own config so the browser suite never runs it: the measures play
// real games with the shared test accounts and take minutes each. Run them
// through ci/measure.mjs, which runs each three times and compares the files.
//
// Playwright's bundled engines only, headless (P11-R6: never an installed
// browser): "chromium" (Chrome, Edge, Brave, Opera, Vivaldi), "firefox" and
// "webkit" (Safari). The redraw and wire measures need Chrome's DevTools
// protocol and run in "chromium" only; the loading measure runs in all three.
import { defineConfig, devices } from "@playwright/test";

const screen = { viewport: { width: 1920, height: 1080 } };

export default defineConfig({
  testDir: "./tools/measure",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60 * 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: process.env.PROXIC_E2E_URL ?? "http://127.0.0.1:8080",
    headless: true,
    trace: "off",
    screenshot: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...screen } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], ...screen } },
    { name: "webkit", use: { ...devices["Desktop Safari"], ...screen } },
  ],
});
