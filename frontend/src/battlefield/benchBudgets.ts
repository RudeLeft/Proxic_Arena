// Spec 0090 (F-0090-A) -- the speed test's Phase 10 scenes (benchScenes.ts)
// and the budget each is held to by e2e/bench-scenes.spec.ts. Kept apart,
// with no imports, so the browser spec can read them.

export const SCENES = [
  "wipe",
  "tokens",
  "combat",
  "flyers",
  "wash",
  "army",
  "storm",
  "reports",
] as const;
export type SceneName = (typeof SCENES)[number];

/**
 * The slowest frames a scene may have, over every run of it at 1920x1080:
 * `p95`, its 95th-percentile frame interval, and `worst`, its single
 * slowest, in ms. Set from the first measured runs, recorded in spec 0090's
 * As built with the machine and browser they came from.
 */
export const BUDGETS: Record<SceneName, { p95: number; worst: number }> = {
  wipe: { p95: 50, worst: 250 },
  tokens: { p95: 50, worst: 250 },
  combat: { p95: 50, worst: 250 },
  flyers: { p95: 50, worst: 250 },
  wash: { p95: 50, worst: 250 },
  army: { p95: 50, worst: 250 },
  storm: { p95: 50, worst: 250 },
  reports: { p95: 50, worst: 250 },
};
