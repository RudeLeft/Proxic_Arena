// A CI-speed local run (PHASE_11 P11-B7): browser specs with every page's CPU
// slowed (Chrome's own throttling, frontend/e2e/cpu-slowdown.ts) and in the
// company CI gives them -- each named spec with the spec that runs just
// before it on its CI machine (ci/browser-shard.mjs deals the game specs over
// six; Playwright runs a machine's files in name order). A previous spec's
// leftovers answering in the next game is the first suspect for a CI-only
// failure, and a fast laptop hides timing races a runner shows.
//
// Run it before committing a new or changed browser spec, against the local
// stack (:8080), one run at a time (the shared test accounts):
//
//   node ci/ci-speed.mjs <spec> [<spec> ...]   each with its CI neighbour, 4x
//   node ci/ci-speed.mjs --cpu 6 <spec>        slower still
//   node ci/ci-speed.mjs --whole <spec>        the spec's whole CI machine
//   node ci/ci-speed.mjs --alone <spec>        just the spec, slowed
//   node ci/ci-speed.mjs --dry <spec>          print the plan, run nothing
//
// A spec is named with or without ".spec.ts" ("match-soulbond"). Game specs
// run as CI's "match" project, one Playwright run per CI machine; any other
// spec runs in the "other" project after the spec before it by name. The
// browser is Playwright's bundled Chromium, as on CI, unless
// PROXIC_E2E_CHANNEL says otherwise.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "frontend");
const MACHINES = 6; // as .github/workflows/ci.yml's "match k/6" parts
const MATCH_SPEC = /^match[^\\/]*\.spec\.ts$/; // as ci/browser-shard.mjs

const args = process.argv.slice(2);
let cpu = 4;
let mode = "neighbour";
let dry = false;
const named = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cpu") cpu = Number(args[++i]);
    else if (a === "--whole") mode = "whole";
    else if (a === "--alone") mode = "alone";
    else if (a === "--dry") dry = true;
    else
        named.push(
            a.replace(/^.*[\\/]/, "").replace(/(\.spec\.ts)?$/, ".spec.ts"),
        );
}
if (named.length === 0 || !(cpu >= 1)) {
    console.error(
        "usage: node ci/ci-speed.mjs [--cpu N] [--whole|--alone] [--dry] <spec> ...",
    );
    process.exit(2);
}

const all = readdirSync(join(frontend, "e2e"))
    .filter((n) => n.endsWith(".spec.ts"))
    .sort();
for (const name of named) {
    if (!all.includes(name)) {
        console.error(`no such spec: frontend/e2e/${name}`);
        process.exit(2);
    }
}

// Each CI machine's game specs, from browser-shard.mjs itself (its filters
// are anchored file names: "[\\/]match-x\.spec\.ts$").
const machines = [];
for (let k = 1; k <= MACHINES; k++) {
    const out = spawnSync(
        process.execPath,
        [join(root, "ci", "browser-shard.mjs"), String(k), String(MACHINES)],
        {
            encoding: "utf8",
        },
    );
    if (out.status !== 0) {
        console.error(out.stderr);
        process.exit(1);
    }
    const files = out.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) =>
            line
                .replace(/^\[\\\\\/\]/, "")
                .replace(/\$$/, "")
                .replace(/\\(.)/g, "$1"),
        )
        .sort();
    machines.push(files);
}

// One run per CI machine (and one for "other"): which files, in CI's order.
const runs = new Map();
const add = (key, project, files) => {
    const run = runs.get(key) ?? { project, files: new Set() };
    for (const f of files) run.files.add(f);
    runs.set(key, run);
};
for (const name of named) {
    if (MATCH_SPEC.test(name)) {
        const k = machines.findIndex((files) => files.includes(name));
        const files = machines[k];
        const at = files.indexOf(name);
        const picked =
            mode === "whole"
                ? files
                : mode === "alone" || at === 0
                  ? [name]
                  : [files[at - 1], name];
        add(`match ${k + 1}/${MACHINES}`, "match", picked);
    } else {
        const others = all.filter((n) => !MATCH_SPEC.test(n));
        const at = others.indexOf(name);
        const picked =
            mode === "whole"
                ? others
                : mode === "alone" || at === 0
                  ? [name]
                  : [others[at - 1], name];
        add("other", "other", picked);
    }
}

const cli = join(frontend, "node_modules", "@playwright", "test", "cli.js");
const env = {
    ...process.env,
    PROXIC_E2E_CPU: String(cpu),
    PROXIC_E2E_CHANNEL: process.env.PROXIC_E2E_CHANNEL ?? "bundled",
};
let failed = 0;
for (const [key, run] of runs) {
    const files = [...run.files].sort();
    console.log(`\n[ci-speed] ${key}, CPU ${cpu}x: ${files.join(" ")}`);
    if (dry) continue;
    // Anchored file names, exactly as CI passes them (no shell in between).
    const filters = files.map(
        (f) => `[\\\\/]${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    );
    const result = spawnSync(
        process.execPath,
        [cli, "test", `--project=${run.project}`, "--workers=1", ...filters],
        { cwd: frontend, env, stdio: "inherit" },
    );
    if (result.status !== 0) failed++;
}
if (failed > 0) {
    console.error(`\n[ci-speed] ${failed} of ${runs.size} runs failed`);
    process.exit(1);
}
