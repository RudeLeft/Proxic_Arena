// Phase 10 -- the "nothing jumps" check (tools/jumps/jumps.spec.ts). Its own
// config so the browser suite never runs it: it needs a real window and a
// folder of Mechanics Lab traces. See the spec for how to run it.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tools/jumps",
  timeout: 6 * 3_600_000,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1920, height: 1080 },
    baseURL: process.env.PROXIC_E2E_URL ?? "http://127.0.0.1:8080",
    ...(process.env.PROXIC_E2E_CHANNEL === "bundled"
      ? {}
      : { channel: process.env.PROXIC_E2E_CHANNEL ?? "msedge" }),
  },
});
