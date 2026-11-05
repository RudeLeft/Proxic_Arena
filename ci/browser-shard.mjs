// Which game specs (frontend/e2e/match*.spec.ts) one CI machine runs.
//
// Playwright's own --shard splits by test count in file order, and the game
// specs sit together alphabetically, so one machine got every real game
// (~24 min) while another was done in under one (2026-11-05). This deals
// whole files by their measured time instead, longest first, each to the
// machine with the least so far.
//
// No spec can fall between machines: the files come from the e2e folder
// itself, picked by the same pattern as the "match" project in
// playwright.config.ts, and every one is dealt to exactly one machine. A
// spec missing from ci/browser-durations.json still runs, weighted as
// defaultSeconds. The "other" project is the complement, on its own machine.
//
//   node ci/browser-shard.mjs <k> <n>   the filters for machine k of n,
//                                       one per line
//   node ci/browser-shard.mjs --check <n>  prove the deal covers every
//                                       game spec exactly once
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Kept in step with MATCH_SPEC in frontend/playwright.config.ts.
const MATCH_SPEC = /^match[^\\/]*\.spec\.ts$/;

const durations = JSON.parse(readFileSync(join(root, "ci", "browser-durations.json"), "utf8"));
const specs = readdirSync(join(root, "frontend", "e2e"))
  .filter((name) => MATCH_SPEC.test(name))
  .sort();

function deal(n) {
  const weight = (name) => durations.seconds[name] ?? durations.defaultSeconds;
  const machines = Array.from({ length: n }, () => ({ total: 0, files: [] }));
  for (const name of [...specs].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const least = machines.reduce((best, m) => (m.total < best.total ? m : best));
    least.files.push(name);
    least.total += weight(name);
  }
  return machines;
}

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const [first, second] = process.argv.slice(2);
if (first === "--check") {
  const n = Number(second);
  const dealt = deal(n).flatMap((m) => m.files);
  const once = new Set(dealt);
  if (dealt.length !== specs.length || once.size !== specs.length || specs.some((s) => !once.has(s))) {
    console.error(`dealt ${dealt.length} game specs, found ${specs.length}`);
    process.exit(1);
  }
  for (const [i, m] of deal(n).entries()) {
    console.log(`machine ${i + 1}/${n}: ~${Math.round(m.total / 60)} min, ${m.files.join(" ")}`);
  }
} else {
  const k = Number(first);
  const n = Number(second);
  if (!(n >= 1 && k >= 1 && k <= n)) {
    console.error("usage: browser-shard.mjs <k> <n> | --check <n>");
    process.exit(2);
  }
  const mine = deal(n)[k - 1].files;
  if (mine.length === 0) {
    console.error(`machine ${k}/${n} has no game specs: use fewer machines`);
    process.exit(1);
  }
  // Anchored to the file name, so one spec's name never selects another's.
  for (const name of mine) console.log(`[\\\\/]${escape(name)}$`);
}
